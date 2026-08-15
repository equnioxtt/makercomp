const { getClient } = require('../../lib/db');
const { json, parseBody } = require('../../lib/http');
const { getProjectDetail } = require('../../lib/project');
const { getGemini, getGroq, SchemaType, generateStructured, describeAIError } = require('../../lib/ai');

const SYSTEM_INSTRUCTION =
  'You are an electronics project planner. You only ever recommend parts from the exact catalog you are given, by their exact id. You never invent a part, a library, or a price.';

// Suggests which catalog parts + GPIO pins a described build needs. Part
// selection is grounded by constraining the response schema's partId to an
// enum of the actual catalog ids — Gemini can only pick parts that exist,
// it can't hallucinate one into existence. Groq has no equivalent schema
// enum, so for that path the post-filter below (catalogById.has) is the
// only thing standing between a hallucinated id and the response — keep it.
// Anything the description needs that isn't in the catalog comes back as a
// plain-text "gap" instead, so we never fabricate a part record.
function buildResponseSchema(catalogIds) {
  return {
    type: SchemaType.OBJECT,
    properties: {
      approach: { type: SchemaType.STRING, description: 'Short summary of how these parts fit together to build what was described.' },
      suggestions: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            partId: { type: SchemaType.STRING, enum: catalogIds },
            gpioPin: {
              type: SchemaType.STRING,
              description: 'A specific GPIO pin (e.g. "GPIO17") for digital/analog/pwm parts. For i2c/spi/uart parts, the shared bus label (e.g. "I2C1 (GPIO2/GPIO3)"). Empty string for parts that don\'t connect to a pin (breadboard, resistor, power supply, etc).',
            },
            reason: { type: SchemaType.STRING },
          },
          required: ['partId', 'reason'],
        },
      },
      gaps: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: 'Plain-text notes on capabilities the description needs that no catalog part covers. Do not name a specific product, brand, or price here — just describe the need.',
      },
    },
    required: ['approach', 'suggestions', 'gaps'],
  };
}

function buildJsonShapeHint(catalogIds) {
  return `{"approach": "<string>", "suggestions": [{"partId": "<MUST be one of: ${catalogIds.join(', ')}>", "gpioPin": "<string, can be empty>", "reason": "<string>"}, ...], "gaps": ["<string>", ...]}`;
}

function buildPrompt(description, project, catalog) {
  const already = project.parts.length
    ? project.parts.map((p) => `- ${p.name} (id: ${p.partId}), pin: ${p.gpioPin || 'none'}`).join('\n')
    : '(none yet)';

  const catalogBlock = catalog
    .map((p) => `- id: ${p.id}, name: ${p.name}, category: ${p.category}, interface: ${p.interface}, library: ${p.library || 'not set'}, ownedQty: ${p.ownedQty}, requiresAdc: ${p.requiresAdc}`)
    .join('\n');

  return `Board: ${project.boardModel || 'unspecified Raspberry Pi'}

What the user wants to build: ${description}

Parts already assigned to this project (avoid re-suggesting these, and avoid reusing their exact digital/analog/pwm pin):
${already}

Full parts catalog — you may ONLY suggest parts by the exact id values listed here, never a part that isn't in this list:
${catalogBlock}

Suggest the catalog parts (by id) needed to build what was described, with a GPIO pin for each digital/analog/pwm part (avoid colliding with an already-used dedicated pin) and the shared I2C/SPI/UART bus label for bus-interface parts. If ownedQty is 0 for a part you suggest, say so in your reasoning — the user will need to buy it. If something described isn't covered by any catalog part, add a plain-language note to "gaps" — do not invent a specific product, brand, or price for it.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = parseBody(event);
  if (!body || !body.projectId || !body.description || !body.description.trim()) {
    return json(400, { error: 'projectId and a non-empty description are required' });
  }

  const client = getClient();
  const project = await getProjectDetail(client, body.projectId);
  if (!project) return json(404, { error: 'Project not found' });

  const description = body.description.trim();
  await client.execute({
    sql: 'UPDATE projects SET description = ?, updatedAt = ? WHERE id = ?',
    args: [description, new Date().toISOString(), project.id],
  });

  const catalogResult = await client.execute('SELECT * FROM parts ORDER BY name');
  const catalog = catalogResult.rows.map((r) => ({ ...r, requiresAdc: !!r.requiresAdc }));
  if (!catalog.length) {
    return json(400, { error: 'The parts catalog is empty — add parts before asking for suggestions.' });
  }

  if (!getGemini() && !getGroq()) {
    return json(500, {
      error: 'Neither GEMINI_API_KEY nor GROQ_API_KEY is configured on the server. Set at least one as a Netlify environment variable to enable part suggestions.',
    });
  }

  const catalogIds = catalog.map((p) => p.id);
  let parsed;
  try {
    const result = await generateStructured({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildPrompt(description, project, catalog),
      geminiSchema: buildResponseSchema(catalogIds),
      jsonShapeHint: buildJsonShapeHint(catalogIds),
    });
    parsed = result.data;
  } catch (err) {
    console.error('AI error (suggest-parts):', err);
    return json(502, { error: describeAIError(err), detail: err.message || String(err) });
  }

  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  const suggestions = (parsed.suggestions || [])
    .filter((s) => catalogById.has(s.partId)) // belt-and-suspenders against a stray id slipping past the schema enum
    .map((s) => ({
      partId: s.partId,
      partName: catalogById.get(s.partId).name,
      gpioPin: s.gpioPin || null,
      reason: s.reason,
      ownedQty: catalogById.get(s.partId).ownedQty,
    }));

  return json(200, { approach: parsed.approach, suggestions, gaps: parsed.gaps || [] });
};
