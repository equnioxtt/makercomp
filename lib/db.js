const { createClient } = require('@libsql/client');
const path = require('path');

let client;

// Netlify Functions are stateless/serverless — there is no local disk to
// persist a SQLite file between invocations in production, so a real Turso
// URL is required there. For local dev without Turso creds, fall back to a
// file DB so `netlify dev` works out of the box.
function getClient() {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    client = createClient({ url, authToken });
  } else {
    // Not __dirname: esbuild bundles each Netlify Function into its own
    // subdirectory (.netlify/functions-serve/<fn>/...), so __dirname points
    // somewhere different per function at runtime. process.cwd() stays the
    // site root in both `netlify dev` and deployed functions.
    const localPath = path.join(process.cwd(), 'db', 'local.db');
    client = createClient({ url: `file:${localPath}` });
  }

  return client;
}

module.exports = { getClient };
