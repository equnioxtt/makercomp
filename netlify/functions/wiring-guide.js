const { getClient } = require('../../lib/db');
const { json, parseBody } = require('../../lib/http');
const { getProjectDetail } = require('../../lib/project');
const { getGemini, getGroq, SchemaType, generateStructured, describeAIError } = require('../../lib/ai');
const { pinMapReference } = require('../../lib/pinmap');

const SYSTEM_INSTRUCTION =
  "You explain electronics wiring to a beginner in plain, concrete language — no jargon without explanation, no skipped steps. You only state a physical pin number if it's listed in the reference table you're given; you never guess one from memory. You only reason about voltage from the value given for each part; if it's not recorded, say so instead of assuming 3.3V or 5V.";

function buildResponseSchema(projectPartIds) {
  return {
    type: SchemaType.OBJECT,
    properties: {
      intro: { type: SchemaType.STRING, description: 'One short plain-language paragraph on how the parts connect together overall.' },
      parts: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            projectPartId: { type: SchemaType.STRING, enum: projectPartIds },
            wiringNotes: {
              type: SchemaType.STRING,
              description: 'Plain-language, step-by-step wiring instructions for this one part: which part pin/wire goes to which Pi pin (name the physical pin number from the reference table), in a beginner-friendly tone.',
            },
            caution: {
              type: SchemaType.STRING,
              description: 'A safety-relevant warning if one applies (e.g. voltage mismatch with the Pi\'s 3.3V logic, needs a current-limiting resistor, needs a separate power supply). Empty string if nothing to flag.',
            },
          },
          required: ['projectPartId', 'wiringNotes'],
        },
      },
    },
    required: ['intro', 'parts'],
  };
}

function buildJsonShapeHint(projectPartIds) {
  return `{"intro": "<string>", "parts": [{"projectPartId": "<MUST be one of: ${projectPartIds.join(', ')}>", "wiringNotes": "<string>", "caution": "<string, can be empty>"}, ...]}`;
}

function buildPrompt(project) {
  const partsBlock = project.parts
    .map((p) => {
      const fields = [
        `projectPartId: ${p.id}`,
        `name: ${p.name}`,
        `category: ${p.category}`,
        `interface: ${p.interface}`,
        `voltage: ${p.voltage != null ? p.voltage + 'V' : 'not recorded'}`,
        `assigned gpioPin: ${p.gpioPin ?? 'not assigned — skip this part, tell the user to assign a pin first'}`,
      ];
      return `- ${fields.join(', ')}`;
    })
    .join('\n');

  return `Raspberry Pi 40-pin header reference (the ONLY source of truth for physical pin numbers — never state one that isn't listed here):
${pinMapReference()}

Project "${project.name}" (board: ${project.boardModel || 'unspecified'}) has these parts assigned:
${partsBlock}

For each part with an assigned gpioPin, write clear step-by-step wiring instructions a beginner with no electronics background could follow: which wire/pin on the part connects to which named Pi pin (by physical pin number, using the reference table above — e.g. "physical pin 11"), including power (VCC/+) and ground, not just the signal pin. For i2c/spi parts sharing a bus with other parts already listed, mention that they share the same bus pins. Flag any voltage mismatch against the Pi's 3.3V GPIO logic, or a component that needs a current-limiting resistor or separate power supply, in the "caution" field for that part — leave it as an empty string if there's nothing to flag.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = parseBody(event);
  if (!body || !body.projectId) return json(400, { error: 'projectId is required' });

  const client = getClient();
  const project = await getProjectDetail(client, body.projectId);
  if (!project) return json(404, { error: 'Project not found' });

  const wireable = project.parts.filter((p) => p.gpioPin);
  if (!wireable.length) {
    return json(400, { error: 'No assigned parts have a GPIO pin yet — assign pins before generating a wiring guide.' });
  }

  if (!getGemini() && !getGroq()) {
    return json(500, {
      error: 'Neither GEMINI_API_KEY nor GROQ_API_KEY is configured on the server. Set at least one as a Netlify environment variable to enable the wiring guide.',
    });
  }

  const projectPartIds = wireable.map((p) => p.id);
  let parsed;
  try {
    const result = await generateStructured({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildPrompt(project),
      geminiSchema: buildResponseSchema(projectPartIds),
      jsonShapeHint: buildJsonShapeHint(projectPartIds),
    });
    parsed = result.data;
  } catch (err) {
    console.error('AI error (wiring-guide):', err);
    return json(502, { error: describeAIError(err), detail: err.message || String(err) });
  }

  const validIds = new Set(projectPartIds);
  const updatedParts = [];
  for (const entry of parsed.parts || []) {
    // Belt-and-suspenders: only write back rows that actually belong to
    // this project, regardless of which provider answered.
    if (!validIds.has(entry.projectPartId)) continue;

    const notes = entry.caution ? `${entry.wiringNotes}\n\nCaution: ${entry.caution}` : entry.wiringNotes;
    await client.execute({
      sql: 'UPDATE project_parts SET wiringNotes = ? WHERE id = ?',
      args: [notes, entry.projectPartId],
    });
    updatedParts.push({ projectPartId: entry.projectPartId, wiringNotes: entry.wiringNotes, caution: entry.caution || null });
  }

  await client.execute({ sql: 'UPDATE projects SET updatedAt = ? WHERE id = ?', args: [new Date().toISOString(), project.id] });

  return json(200, { intro: parsed.intro, parts: updatedParts });
};
