const { getClient } = require('../../lib/db');
const { json, parseBody } = require('../../lib/http');
const { getProjectDetail } = require('../../lib/project');
const { getGemini, getGroq, SchemaType, generateStructured, describeAIError } = require('../../lib/ai');

// This is a *supplementary* review on top of the deterministic hard checks
// (duplicate GPIO pins, missing ADC module) already computed in lib/compat.js
// and returned as `warnings` on the project. Those stay deterministic by
// design — this endpoint is for softer judgment calls an LLM is better
// suited to: voltage mismatches, rough current-budget sanity, etc. It's
// explicitly instructed to only reason from the stored fields, not invent
// specs the catalog doesn't have.
const SYSTEM_INSTRUCTION =
  'You are an electronics compatibility reviewer. You only reason from the exact fields provided to you; you never invent or assume a value that is marked as missing. Every "caution" or "issue" note must end with a concrete suggested fix, not just a description of the risk — a generic component category (e.g. "a bidirectional logic level shifter", "a separate 5V power supply for the motor") is fine, but never a specific product, brand, or price.';

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    notes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          severity: { type: SchemaType.STRING, enum: ['info', 'caution', 'issue'] },
          message: {
            type: SchemaType.STRING,
            description: 'For severity "caution" or "issue", end the message with a concrete suggested fix, not just the risk. "info" notes don\'t need one.',
          },
        },
        required: ['severity', 'message'],
      },
    },
  },
  required: ['notes'],
};

const JSON_SHAPE_HINT = '{"notes": [{"severity": "info"|"caution"|"issue", "message": "<string>"}, ...]}';

function buildPrompt(project) {
  const partsBlock = project.parts
    .map((p) => {
      const fields = [
        `name: ${p.name}`,
        `category: ${p.category}`,
        `interface: ${p.interface}`,
        `voltage: ${p.voltage != null ? p.voltage + 'V' : 'not recorded'}`,
        `currentDraw_mA: ${p.currentDraw_mA != null ? p.currentDraw_mA : 'not recorded'}`,
        `gpioPin: ${p.gpioPin ?? 'not assigned'}`,
      ];
      return `- ${fields.join(', ')}`;
    })
    .join('\n');

  return `Project "${project.name}" (board: ${project.boardModel || 'unspecified'})${project.description ? `, goal: ${project.description}` : ''} has these parts assigned:
${partsBlock || '(none)'}

Deterministic checks already caught: duplicate GPIO pins (hard error, already rejected before parts can be assigned) and missing ADC modules for analog parts (already flagged separately).

Review the parts list above for anything else worth flagging: voltage mismatches between parts and the board's 3.3V GPIO logic, rough total current draw vs typical Pi GPIO/USB power budgets, or missing power-handling components (e.g. a motor with no separate driver/relay). Only reason from the fields given above — if voltage or current draw is "not recorded" for a part, say the data is missing rather than guessing a typical value for that part. For every "caution" or "issue" note, end it with what to actually do about it — e.g. a type of protective component to add, or checking the part's datasheet for a 3.3V-compatible mode before assuming a fix is even needed.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = parseBody(event);
  if (!body || !body.projectId) return json(400, { error: 'projectId is required' });

  const client = getClient();
  const project = await getProjectDetail(client, body.projectId);
  if (!project) return json(404, { error: 'Project not found' });
  if (!project.parts.length) {
    return json(200, { notes: [] });
  }

  if (!getGemini() && !getGroq()) {
    return json(500, {
      error: 'Neither GEMINI_API_KEY nor GROQ_API_KEY is configured on the server. Set at least one as a Netlify environment variable to enable compatibility review.',
    });
  }

  let parsed;
  try {
    const result = await generateStructured({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildPrompt(project),
      geminiSchema: RESPONSE_SCHEMA,
      jsonShapeHint: JSON_SHAPE_HINT,
    });
    parsed = result.data;
  } catch (err) {
    console.error('AI error (compat-review):', err);
    return json(502, { error: describeAIError(err), detail: err.message || String(err) });
  }

  return json(200, { notes: parsed.notes || [] });
};
