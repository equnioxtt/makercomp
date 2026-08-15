// Compatibility rules shared by the project-parts API.
//
// Duplicate GPIO pins are a hard error by spec, enforced here AND by a
// unique index in the schema (belt and suspenders — the index catches
// races between concurrent requests that this check alone would miss).
//
// The ADC check is a soft flag, not a rejection: a project can legitimately
// be "planning" stage with an analog sensor picked out before its ADC
// module is assigned.

// There's no explicit "isAdcModule" field in the data model, so this is a
// heuristic over the fields that exist: an ADC module is a part whose name
// or library mentions "ADC" (matches the seeded ADS7830 ADC Module).
function isAdcModule(part) {
  const haystack = `${part.name || ''} ${part.library || ''}`;
  return /adc/i.test(haystack);
}

// i2c/spi/uart are shared-bus interfaces: multiple devices legitimately sit
// on the same physical pins (differentiated by i2c address or SPI chip
// select, not by pin uniqueness), so a matching "pin" value between two bus
// devices is expected, not a conflict. Only dedicated-pin interfaces
// (digital/analog/pwm) get the hard duplicate-pin rejection.
const SHARED_BUS_INTERFACES = new Set(['i2c', 'spi', 'uart']);

async function findPinConflict(client, projectId, gpioPin, excludeProjectPartId, newPartInterface) {
  if (!gpioPin) return null;
  if (SHARED_BUS_INTERFACES.has(newPartInterface)) return null;

  const args = [projectId, gpioPin];
  let sql = `SELECT pp.id, p.name as partName, p.interface
             FROM project_parts pp JOIN parts p ON p.id = pp.partId
             WHERE pp.projectId = ? AND pp.gpioPin = ?`;
  if (excludeProjectPartId) {
    sql += ' AND pp.id != ?';
    args.push(excludeProjectPartId);
  }
  const result = await client.execute({ sql, args });
  const conflict = result.rows.find((row) => !SHARED_BUS_INTERFACES.has(row.interface));
  return conflict || null;
}

async function getAdcWarnings(client, projectId) {
  const result = await client.execute({
    sql: `SELECT pp.id as projectPartId, p.id as partId, p.name, p.requiresAdc, p.library
          FROM project_parts pp JOIN parts p ON p.id = pp.partId
          WHERE pp.projectId = ?`,
    args: [projectId],
  });

  const assigned = result.rows;
  const hasAdcModule = assigned.some(isAdcModule);
  if (hasAdcModule) return [];

  return assigned
    .filter((row) => row.requiresAdc)
    .map((row) => ({
      projectPartId: row.projectPartId,
      partId: row.partId,
      partName: row.name,
      message: `${row.name} requires an ADC (analog-to-digital converter) but no ADC module is assigned to this project.`,
    }));
}

module.exports = { isAdcModule, findPinConflict, getAdcWarnings };
