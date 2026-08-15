const crypto = require('crypto');
const { getClient } = require('../../lib/db');
const { json, parseBody, getIdFromPath } = require('../../lib/http');
const { getProjectDetail } = require('../../lib/project');

const STATUSES = ['planning', 'wiring', 'coded', 'deployed'];

exports.handler = async (event) => {
  const client = getClient();
  const id = getIdFromPath(event, 'projects');

  try {
    if (event.httpMethod === 'GET') {
      if (id) {
        const detail = await getProjectDetail(client, id);
        if (!detail) return json(404, { error: 'Project not found' });
        return json(200, detail);
      }
      const result = await client.execute('SELECT * FROM projects ORDER BY updatedAt DESC');
      return json(200, result.rows);
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      if (!body) return json(400, { error: 'Invalid JSON body' });
      if (!body.name) return json(400, { error: 'name is required' });

      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      await client.execute({
        sql: `INSERT INTO projects (id, name, boardModel, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [newId, body.name, body.boardModel ?? null, body.status && STATUSES.includes(body.status) ? body.status : 'planning', now, now],
      });
      const result = await client.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [newId] });
      return json(201, result.rows[0]);
    }

    if (event.httpMethod === 'PATCH') {
      if (!id) return json(400, { error: 'Project id required in path' });
      const body = parseBody(event);
      if (!body) return json(400, { error: 'Invalid JSON body' });

      const existing = await client.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] });
      if (!existing.rows[0]) return json(404, { error: 'Project not found' });

      if (body.status && !STATUSES.includes(body.status)) {
        return json(400, { error: `status must be one of ${STATUSES.join(', ')}` });
      }

      const fields = ['name', 'boardModel', 'status', 'description'];
      const updates = [];
      const args = [];
      for (const f of fields) {
        if (f in body) {
          updates.push(`${f} = ?`);
          args.push(body[f]);
        }
      }
      if (!updates.length) return json(400, { error: 'No updatable fields provided' });
      updates.push('updatedAt = ?');
      args.push(new Date().toISOString());
      args.push(id);
      await client.execute({ sql: `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, args });
      const detail = await getProjectDetail(client, id);
      return json(200, detail);
    }

    if (event.httpMethod === 'DELETE') {
      if (!id) return json(400, { error: 'Project id required in path' });
      // Cascade manually: the libsql HTTP client doesn't guarantee PRAGMA
      // foreign_keys=ON persists across requests to a remote Turso DB, so
      // relying on ON DELETE CASCADE alone would leave orphaned rows.
      await client.execute({ sql: 'DELETE FROM code_snippets WHERE projectId = ?', args: [id] });
      await client.execute({ sql: 'DELETE FROM project_parts WHERE projectId = ?', args: [id] });
      await client.execute({ sql: 'DELETE FROM projects WHERE id = ?', args: [id] });
      return { statusCode: 204, body: '' };
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('projects function error:', err);
    return json(500, { error: 'Internal error', detail: err.message });
  }
};
