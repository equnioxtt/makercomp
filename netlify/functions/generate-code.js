const crypto = require('crypto');
const { getClient } = require('../../lib/db');
const { json, parseBody } = require('../../lib/http');
const { getProjectDetail } = require('../../lib/project');
const { getGemini, getGroq, SchemaType, generateStructured, describeAIError } = require('../../lib/ai');

const SYSTEM_INSTRUCTION =
  'You are a careful embedded-systems assistant generating Raspberry Pi GPIO code. You never fabricate library names, import paths, or pin numbers — you only use what is explicitly given to you.';

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    code: { type: SchemaType.STRING, description: 'The generated Python code, or an empty string if nothing could be generated.' },
    summary: { type: SchemaType.STRING, description: 'Short human-readable summary of what the code does and any caveats.' },
    unresolved: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Names of parts skipped because their library or pin was unknown.',
    },
  },
  required: ['code', 'summary'],
};

const JSON_SHAPE_HINT = '{"code": "<string, python code or empty string>", "summary": "<string>", "unresolved": ["<string>", ...]}';

function buildPrompt(project) {
  const partsBlock = project.parts
    .map((p) => {
      const lib = p.library ? p.library : 'UNKNOWN — no library recorded for this part';
      return [
        `- ${p.name}`,
        `  category: ${p.category}, interface: ${p.interface}`,
        `  gpioPin: ${p.gpioPin ?? '(not assigned)'}`,
        `  library: ${lib}`,
        p.wiringNotes ? `  wiring notes: ${p.wiringNotes}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return `Project: ${project.name} (board: ${project.boardModel || 'unspecified'})
${project.description ? `Goal: ${project.description}\n` : ''}
Assigned parts and pins:
${partsBlock || '(no parts assigned yet)'}

Write Python code for this project that runs on the Raspberry Pi.

Hard rules:
1. Only import/use the exact library named in each part's "library" field above. Never invent, guess, or substitute a library or package name.
2. If a part's library is "UNKNOWN", do not write any import or driver code for that part. Instead list it by name in the "unresolved" field of your response and explain in "summary" that its library is unknown and must be filled in on the part record before code can be generated for it.
3. Use each part's assigned gpioPin exactly as given. Do not invent pin numbers for parts with no gpioPin assigned — treat them the same as an unresolved part.
4. Keep the code scoped to only the parts listed above — do not add unrelated components.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = parseBody(event);
  if (!body || !body.projectId) return json(400, { error: 'projectId is required' });

  const client = getClient();
  const project = await getProjectDetail(client, body.projectId);
  if (!project) return json(404, { error: 'Project not found' });
  if (!project.parts.length) {
    return json(400, { error: 'This project has no parts assigned yet — assign parts and pins before generating code.' });
  }

  if (!getGemini() && !getGroq()) {
    return json(500, {
      error: 'Neither GEMINI_API_KEY nor GROQ_API_KEY is configured on the server. Set at least one as a Netlify environment variable to enable code generation.',
    });
  }

  let parsed, provider;
  try {
    const result = await generateStructured({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildPrompt(project),
      geminiSchema: RESPONSE_SCHEMA,
      jsonShapeHint: JSON_SHAPE_HINT,
    });
    parsed = result.data;
    provider = result.provider;
  } catch (err) {
    console.error('AI error (generate-code):', err);
    return json(502, { error: describeAIError(err), detail: err.message || String(err) });
  }

  const { code, summary, unresolved } = parsed;

  const snippetId = crypto.randomUUID();
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO code_snippets (id, projectId, code, summary, verified, createdAt) VALUES (?, ?, ?, ?, 0, ?)`,
    args: [snippetId, project.id, code, summary, now],
  });

  return json(201, {
    id: snippetId,
    projectId: project.id,
    code,
    summary,
    unresolved: unresolved || [],
    verified: false,
    createdAt: now,
    provider,
  });
};
