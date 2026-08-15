function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

// Netlify invokes the function file matching the first path segment after
// /.netlify/functions/ (or /api/ via the redirect); everything after that
// segment is the resource id, e.g. /api/projects/abc123 -> "abc123".
function getIdFromPath(event, functionName) {
  const segments = event.path.split('/').filter(Boolean);
  const idx = segments.lastIndexOf(functionName);
  if (idx === -1 || segments.length <= idx + 1) return null;
  return decodeURIComponent(segments[idx + 1]);
}

module.exports = { json, parseBody, getIdFromPath };
