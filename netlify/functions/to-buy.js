const { getClient } = require('../../lib/db');
const { json } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const client = getClient();
  const projectId = event.queryStringParameters?.projectId;

  try {
    const args = [];
    let where = "WHERE pp.status = 'needs_purchase'";
    if (projectId) {
      where += ' AND pp.projectId = ?';
      args.push(projectId);
    }

    const result = await client.execute({
      sql: `SELECT pp.id as projectPartId, pp.projectId, pr.name as projectName,
                   p.id as partId, p.name as partName, p.sourceUrl, p.estPrice
            FROM project_parts pp
            JOIN parts p ON p.id = pp.partId
            JOIN projects pr ON pr.id = pp.projectId
            ${where}
            ORDER BY pr.name, p.name`,
      args,
    });

    // Guardrail: never fabricate a price or link — only surface what's
    // actually stored on the part; otherwise say so explicitly.
    const items = result.rows.map((r) => ({
      ...r,
      sourceUrl: r.sourceUrl || null,
      estPrice: r.estPrice ?? null,
      priced: r.estPrice != null,
    }));

    return json(200, { items });
  } catch (err) {
    console.error('to-buy function error:', err);
    return json(500, { error: 'Internal error', detail: err.message });
  }
};
