const { getClient } = require('../../lib/db');
const { json, parseBody, getIdFromPath } = require('../../lib/http');

exports.handler = async (event) => {
  const client = getClient();
  const id = getIdFromPath(event, 'snippets');

  try {
    if (event.httpMethod === 'GET') {
      const projectId = event.queryStringParameters?.projectId;
      if (id) {
        const result = await client.execute({ sql: 'SELECT * FROM code_snippets WHERE id = ?', args: [id] });
        if (!result.rows[0]) return json(404, { error: 'Snippet not found' });
        return json(200, { ...result.rows[0], verified: !!result.rows[0].verified });
      }
      if (!projectId) return json(400, { error: 'projectId query param is required' });
      const result = await client.execute({
        sql: 'SELECT * FROM code_snippets WHERE projectId = ? ORDER BY createdAt DESC',
        args: [projectId],
      });
      return json(200, result.rows.map((r) => ({ ...r, verified: !!r.verified })));
    }

    if (event.httpMethod === 'PATCH') {
      if (!id) return json(400, { error: 'Snippet id required in path' });
      const body = parseBody(event);
      if (!body || typeof body.verified !== 'boolean') {
        return json(400, { error: 'Body must include a boolean "verified" field — confirm the code actually ran on real hardware before marking it verified.' });
      }
      const existing = await client.execute({ sql: 'SELECT * FROM code_snippets WHERE id = ?', args: [id] });
      if (!existing.rows[0]) return json(404, { error: 'Snippet not found' });

      await client.execute({ sql: 'UPDATE code_snippets SET verified = ? WHERE id = ?', args: [body.verified ? 1 : 0, id] });
      const result = await client.execute({ sql: 'SELECT * FROM code_snippets WHERE id = ?', args: [id] });
      return json(200, { ...result.rows[0], verified: !!result.rows[0].verified });
    }

    if (event.httpMethod === 'DELETE') {
      if (!id) return json(400, { error: 'Snippet id required in path' });
      await client.execute({ sql: 'DELETE FROM code_snippets WHERE id = ?', args: [id] });
      return { statusCode: 204, body: '' };
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('snippets function error:', err);
    return json(500, { error: 'Internal error', detail: err.message });
  }
};
