const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

// "-latest" alias tracks Google's current recommended model instead of a
// pinned version string, which avoids repeating the 404 we hit when
// gemini-2.0-flash was retired (see ERRORS.md). Using the *lite* variant
// specifically because gemini-flash-latest resolved to a heavier model
// (gemini-3.7-flash) with a much tighter free-tier quota (20 requests) that
// we blew through during testing — flash-lite has a more generous free cap.
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

// The free tier returns 503 "high demand" fairly often — retrying a couple
// times with backoff clears most of them without the user having to
// manually click the button again. Anything else (bad key, invalid
// request) fails immediately since retrying won't help.
async function generateJSON(model, prompt, { retries = 2, baseDelayMs = 800 } = {}) {
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

function describeGeminiError(err) {
  if (err.status === 503) {
    return "Gemini's free tier is overloaded right now (retried automatically but it's still failing) — wait a minute and try again.";
  }
  if (err.status === 429) {
    return "Gemini's free-tier quota is exhausted for now — wait a bit before trying again.";
  }
  return 'Gemini API request failed. Please try again in a moment.';
}

module.exports = { getGemini, DEFAULT_MODEL, SchemaType, generateJSON, describeGeminiError };
