const crypto = require('crypto');
const { getClient } = require('../../lib/db');
const { json, parseBody, getIdFromPath } = require('../../lib/http');
const { findPinConflict, getAdcWarnings } = require('../../lib/compat');

const STATUSES = ['owned', 'needs_purchase'];

exports.handler = async (event) => {
  const client = getClient();
  const id = getIdFromPath(event, 'project-parts');

  try {
    if (event.httpMethod === 'GET') {
      const projectId = event.queryStringParameters?.projectId;
      if (!projectId) return json(400, { error: 'projectId query param is required' });
      const result = await client.execute({
        sql: `SELECT pp.*, p.name, p.category, p.interface, p.requiresAdc, p.library
              FROM project_parts pp JOIN parts p ON p.id = pp.partId
              WHERE pp.projectId = ?`,
        args: [projectId],
      });
      const warnings = await getAdcWarnings(client, projectId);
      return json(200, { parts: result.rows.map((r) => ({ ...r, requiresAdc: !!r.requiresAdc })), warnings });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      if (!body) return json(400, { error: 'Invalid JSON body' });
      const { projectId, partId, gpioPin } = body;
      if (!projectId || !partId) return json(400, { error: 'projectId and partId are required' });

      const project = await client.execute({ sql: 'SELECT id FROM projects WHERE id = ?', args: [projectId] });
      if (!project.rows[0]) return json(404, { error: 'Project not found' });
      const part = await client.execute({ sql: 'SELECT id, interface FROM parts WHERE id = ?', args: [partId] });
      if (!part.rows[0]) return json(404, { error: 'Part not found' });

      if (gpioPin) {
        const conflict = await findPinConflict(client, projectId, gpioPin, null, part.rows[0].interface);
        if (conflict) {
          return json(409, {
            error: `GPIO pin "${gpioPin}" is already assigned to "${conflict.partName}" in this project. Duplicate pin assignments are not allowed.`,
          });
        }
      }

      const status = STATUSES.includes(body.status) ? body.status : 'owned';
      const newId = crypto.randomUUID();
      await client.execute({
        sql: `INSERT INTO project_parts (id, projectId, partId, gpioPin, wiringNotes, status) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [newId, projectId, partId, gpioPin ?? null, body.wiringNotes ?? null, status],
      });
      await client.execute({ sql: 'UPDATE projects SET updatedAt = ? WHERE id = ?', args: [new Date().toISOString(), projectId] });

      const result = await client.execute({
        sql: `SELECT pp.*, p.name, p.requiresAdc, p.library FROM project_parts pp JOIN parts p ON p.id = pp.partId WHERE pp.id = ?`,
        args: [newId],
      });
      const warnings = await getAdcWarnings(client, projectId);
      return json(201, { ...result.rows[0], requiresAdc: !!result.rows[0].requiresAdc, warnings });
    }

    if (event.httpMethod === 'PATCH') {
      if (!id) return json(400, { error: 'project-part id required in path' });
      const body = parseBody(event);
      if (!body) return json(400, { error: 'Invalid JSON body' });

      const existing = await client.execute({
        sql: `SELECT pp.*, p.interface FROM project_parts pp JOIN parts p ON p.id = pp.partId WHERE pp.id = ?`,
        args: [id],
      });
      const row = existing.rows[0];
      if (!row) return json(404, { error: 'Project-part assignment not found' });

      if ('gpioPin' in body && body.gpioPin) {
        const conflict = await findPinConflict(client, row.projectId, body.gpioPin, id, row.interface);
        if (conflict) {
          return json(409, {
            error: `GPIO pin "${body.gpioPin}" is already assigned to "${conflict.partName}" in this project. Duplicate pin assignments are not allowed.`,
          });
        }
      }

      if (body.status && !STATUSES.includes(body.status)) {
        return json(400, { error: `status must be one of ${STATUSES.join(', ')}` });
      }

      const fields = ['gpioPin', 'wiringNotes', 'status'];
      const updates = [];
      const args = [];
      for (const f of fields) {
        if (f in body) {
          updates.push(`${f} = ?`);
          args.push(body[f]);
        }
      }
      if (!updates.length) return json(400, { error: 'No updatable fields provided' });
      args.push(id);
      await client.execute({ sql: `UPDATE project_parts SET ${updates.join(', ')} WHERE id = ?`, args });
      await client.execute({ sql: 'UPDATE projects SET updatedAt = ? WHERE id = ?', args: [new Date().toISOString(), row.projectId] });

      const result = await client.execute({
        sql: `SELECT pp.*, p.name, p.requiresAdc, p.library FROM project_parts pp JOIN parts p ON p.id = pp.partId WHERE pp.id = ?`,
        args: [id],
      });
      const warnings = await getAdcWarnings(client, row.projectId);
      return json(200, { ...result.rows[0], requiresAdc: !!result.rows[0].requiresAdc, warnings });
    }

    if (event.httpMethod === 'DELETE') {
      if (!id) return json(400, { error: 'project-part id required in path' });
      const existing = await client.execute({ sql: 'SELECT projectId FROM project_parts WHERE id = ?', args: [id] });
      if (!existing.rows[0]) return json(404, { error: 'Project-part assignment not found' });
      await client.execute({ sql: 'DELETE FROM project_parts WHERE id = ?', args: [id] });
      await client.execute({ sql: 'UPDATE projects SET updatedAt = ? WHERE id = ?', args: [new Date().toISOString(), existing.rows[0].projectId] });
      return { statusCode: 204, body: '' };
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('project-parts function error:', err);
    return json(500, { error: 'Internal error', detail: err.message });
  }
};
