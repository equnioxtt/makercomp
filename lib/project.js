const { getAdcWarnings } = require('./compat');

async function getProjectDetail(client, id) {
  const projectResult = await client.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] });
  const project = projectResult.rows[0];
  if (!project) return null;

  const partsResult = await client.execute({
    sql: `SELECT pp.id, pp.projectId, pp.partId, pp.gpioPin, pp.wiringNotes, pp.status,
                 p.name, p.category, p.interface, p.voltage, p.currentDraw_mA,
                 p.requiresAdc, p.library, p.notes as partNotes, p.sourceUrl, p.estPrice
          FROM project_parts pp JOIN parts p ON p.id = pp.partId
          WHERE pp.projectId = ?
          ORDER BY pp.gpioPin IS NULL, pp.gpioPin`,
    args: [id],
  });

  const adcWarnings = await getAdcWarnings(client, id);

  return {
    ...project,
    parts: partsResult.rows.map((r) => ({ ...r, requiresAdc: !!r.requiresAdc })),
    warnings: adcWarnings,
  };
}

module.exports = { getProjectDetail };
