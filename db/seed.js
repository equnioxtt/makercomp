require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getClient } = require('../lib/db');

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[Ωω]/g, 'ohm')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function seed() {
  const raw = fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8');
  const parts = JSON.parse(raw);
  const client = getClient();

  const seen = new Map();
  for (const p of parts) {
    let id = slugify(p.name);
    if (seen.has(id)) {
      seen.set(id, seen.get(id) + 1);
      id = `${id}-${seen.get(id)}`;
    } else {
      seen.set(id, 1);
    }

    await client.execute({
      sql: `INSERT OR IGNORE INTO parts
              (id, name, category, interface, voltage, currentDraw_mA, requiresAdc, library, notes, ownedQty, sourceUrl, estPrice, inKit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        p.name,
        p.category,
        p.interface,
        p.voltage ?? null,
        p.currentDraw_mA ?? null,
        p.requiresAdc ? 1 : 0,
        p.library ?? null,
        p.notes ?? null,
        p.ownedQty ?? 0,
        p.sourceUrl ?? null,
        p.estPrice ?? null,
        p.inKit ?? null,
      ],
    });
  }

  console.log(`Seeded ${parts.length} parts (existing rows left untouched).`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
