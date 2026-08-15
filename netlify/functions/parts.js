const crypto = require('crypto');
const { getClient } = require('../../lib/db');
const { json, parseBody, getIdFromPath } = require('../../lib/http');

const CATEGORIES = ['sensor', 'actuator', 'display', 'driver', 'passive', 'power'];
const INTERFACES = ['digital', 'analog', 'i2c', 'spi', 'pwm', 'uart'];

function rowToPart(row) {
  return { ...row, requiresAdc: !!row.requiresAdc };
}

exports.handler = async (event) => {
  const client = getClient();
  const id = getIdFromPath(event, 'parts');

  try {
    if (event.httpMethod === 'GET') {
      if (id) {
        const result = await client.execute({ sql: 'SELECT * FROM parts WHERE id = ?', args: [id] });
        if (!result.rows[0]) return json(404, { error: 'Part not found' });
        return json(200, rowToPart(result.rows[0]));
      }

      const q = event.queryStringParameters?.q;
      const category = event.queryStringParameters?.category;
      const clauses = [];
      const args = [];
      if (q) {
        clauses.push('(name LIKE ? OR library LIKE ?)');
        args.push(`%${q}%`, `%${q}%`);
      }
      if (category) {
        clauses.push('category = ?');
        args.push(category);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const result = await client.execute({ sql: `SELECT * FROM parts ${where} ORDER BY name`, args });
      return json(200, result.rows.map(rowToPart));
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      if (!body) return json(400, { error: 'Invalid JSON body' });
      const { name, category, interface: iface } = body;
      if (!name || !CATEGORIES.includes(category) || !INTERFACES.includes(iface)) {
        return json(400, {
          error: `name is required; category must be one of ${CATEGORIES.join(', ')}; interface must be one of ${INTERFACES.join(', ')}`,
        });
      }

      const newId = crypto.randomUUID();
      await client.execute({
        sql: `INSERT INTO parts (id, name, category, interface, voltage, currentDraw_mA, requiresAdc, library, notes, ownedQty, sourceUrl, estPrice, inKit)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          newId,
          name,
          category,
          iface,
          body.voltage ?? null,
          body.currentDraw_mA ?? null,
          body.requiresAdc ? 1 : 0,
          body.library ?? null,
          body.notes ?? null,
          body.ownedQty ?? 0,
          body.sourceUrl ?? null,
          body.estPrice ?? null,
          body.inKit ?? null,
        ],
      });
      const result = await client.execute({ sql: 'SELECT * FROM parts WHERE id = ?', args: [newId] });
      return json(201, rowToPart(result.rows[0]));
    }

    if (event.httpMethod === 'PATCH') {
      if (!id) return json(400, { error: 'Part id required in path' });
      const body = parseBody(event);
      if (!body) return json(400, { error: 'Invalid JSON body' });

      const existing = await client.execute({ sql: 'SELECT * FROM parts WHERE id = ?', args: [id] });
      if (!existing.rows[0]) return json(404, { error: 'Part not found' });

      const fields = [
        'name', 'category', 'interface', 'voltage', 'currentDraw_mA', 'requiresAdc',
        'library', 'notes', 'ownedQty', 'sourceUrl', 'estPrice', 'inKit',
      ];
      const updates = [];
      const args = [];
      for (const f of fields) {
        if (f in body) {
          updates.push(`${f} = ?`);
          args.push(f === 'requiresAdc' ? (body[f] ? 1 : 0) : body[f]);
        }
      }
      if (!updates.length) return json(400, { error: 'No updatable fields provided' });
      args.push(id);
      await client.execute({ sql: `UPDATE parts SET ${updates.join(', ')} WHERE id = ?`, args });
      const result = await client.execute({ sql: 'SELECT * FROM parts WHERE id = ?', args: [id] });
      return json(200, rowToPart(result.rows[0]));
    }

    if (event.httpMethod === 'DELETE') {
      if (!id) return json(400, { error: 'Part id required in path' });
      const inUse = await client.execute({ sql: 'SELECT COUNT(*) as n FROM project_parts WHERE partId = ?', args: [id] });
      if (inUse.rows[0].n > 0) {
        return json(409, { error: 'Part is assigned to one or more projects; unassign it first' });
      }
      await client.execute({ sql: 'DELETE FROM parts WHERE id = ?', args: [id] });
      return { statusCode: 204, body: '' };
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('parts function error:', err);
    return json(500, { error: 'Internal error', detail: err.message });
  }
};
