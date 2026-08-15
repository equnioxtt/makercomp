const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const Groq = require('groq-sdk');

// "-latest" alias tracks Google's current recommended model instead of a
// pinned version string, which avoids repeating the 404 we hit when
// gemini-2.0-flash was retired (see ERRORS.md). Using the *lite* variant
// specifically because gemini-flash-latest resolved to a heavier model
// (gemini-3.7-flash) with a much tighter free-tier quota (20 requests) that
// we blew through during testing — flash-lite has a more generous free cap.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenerativeAI(apiKey) : null;
}

function getGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  return apiKey ? new Groq({ apiKey }) : null;
}

// The free tier returns 503 "high demand" fairly often — retrying a couple
// times with backoff clears most of them before falling back to Groq.
async function callGeminiJSON({ systemInstruction, prompt, schema }, { retries = 2, baseDelayMs = 800 } = {}) {
  const genAI = getGemini();
  if (!genAI) throw Object.assign(new Error('GEMINI_API_KEY is not configured'), { code: 'NO_GEMINI_KEY' });

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
  });

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (err) {
      if (err.status !== 503 || attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
}

// Groq has no equivalent to Gemini's schema-constrained structured output —
// response_format only guarantees syntactically valid JSON, not a specific
// shape — so the shape has to be spelled out in the prompt itself, and
// callers that need hard grounding (e.g. suggest-parts' partId) still need
// their own post-hoc validation regardless of which provider answered.
async function callGroqJSON({ systemInstruction, prompt, jsonShapeHint }) {
  const groq = getGroq();
  if (!groq) throw Object.assign(new Error('GROQ_API_KEY is not configured'), { code: 'NO_GROQ_KEY' });

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: `${prompt}\n\nRespond with ONLY a single JSON object (no markdown code fences) matching this shape:\n${jsonShapeHint}` },
    ],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(completion.choices[0].message.content);
}

// Tries Gemini first (its structured-output schema gives the strongest
// grounding); if Gemini is unavailable or exhausted (503/429/etc.) and
// GROQ_API_KEY is configured, automatically falls back to Groq so a Gemini
// outage doesn't take the AI features down entirely. Returns which provider
// actually answered so callers can surface that if useful.
async function generateStructured({ systemInstruction, prompt, geminiSchema, jsonShapeHint }) {
  let geminiError;
  try {
    const data = await callGeminiJSON({ systemInstruction, prompt, schema: geminiSchema });
    return { data, provider: 'gemini' };
  } catch (err) {
    geminiError = err;
    if (!getGroq()) throw err;
  }

  try {
    const data = await callGroqJSON({ systemInstruction, prompt, jsonShapeHint });
    return { data, provider: 'groq' };
  } catch (groqError) {
    const combined = new Error(`Gemini failed (${geminiError.message}); Groq fallback also failed (${groqError.message})`);
    combined.geminiError = geminiError;
    combined.groqError = groqError;
    throw combined;
  }
}

function describeAIError(err) {
  if (err.geminiError && err.groqError) {
    return 'Both Gemini and the Groq fallback failed. Please try again in a moment.';
  }
  if (err.status === 503) {
    return "Gemini's free tier is overloaded right now (retried automatically but it's still failing) — wait a minute and try again.";
  }
  if (err.status === 429) {
    return "Gemini's free-tier quota is exhausted for now — wait a bit before trying again.";
  }
  return 'AI request failed. Please try again in a moment.';
}

module.exports = { getGemini, getGroq, SchemaType, generateStructured, describeAIError };
