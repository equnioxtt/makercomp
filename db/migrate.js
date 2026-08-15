require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getClient } = require('../lib/db');

async function columnExists(client, table, column) {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'lib', 'schema.sql'), 'utf8');
  const client = getClient();
  await client.executeMultiple(schema);

  // CREATE TABLE IF NOT EXISTS doesn't add columns to a table that already
  // existed before this column was introduced — patch it in for DBs created
  // before the description field / dropped unique index existed.
  if (!(await columnExists(client, 'projects', 'description'))) {
    await client.execute('ALTER TABLE projects ADD COLUMN description TEXT');
  }
  await client.execute('DROP INDEX IF EXISTS idx_project_parts_unique_pin');

  console.log('Schema applied.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
