# Maker Companion

Personal web app for tracking Raspberry Pi electronics projects: parts inventory, GPIO wiring assignments, compatibility checks, and Gemini-generated code.

## Stack

- **Frontend:** static HTML/CSS/vanilla JS, served from `public/`
- **Backend:** Netlify Functions (`netlify/functions/`) — stateless, one file per resource
- **Data:** Turso (SQLite-compatible, serverless-friendly). Falls back to a local file DB (`db/local.db`) when `TURSO_DATABASE_URL` isn't set, so `netlify dev` works with no cloud setup.
- **AI:** Gemini API (`gemini-flash-lite-latest`) as primary, with automatic fallback to Groq (`llama-3.3-70b-versatile`) if Gemini fails — both called server-side only, keys never reach the client.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `GEMINI_API_KEY` — free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- `GROQ_API_KEY` — optional fallback, free key from [console.groq.com/keys](https://console.groq.com/keys). Used automatically if Gemini fails; at least one of the two keys is required for the AI features
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` — optional for local dev; leave blank to use the local file DB

Then set up the database and run:

```bash
npm run db:migrate
npm run db:seed    # loads the LAFVIN Super Starter Kit catalog
npm run dev        # netlify dev, http://localhost:8888
```

## Deploying to Netlify

Set `GEMINI_API_KEY` (and optionally `GROQ_API_KEY`), `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` as environment variables in the Netlify site settings — exact key names matter, they're case-sensitive (never commit these). Netlify picks up `netlify.toml` automatically for the functions dir, publish dir, and the `/api/*` redirect.

## Project structure

```
public/               static frontend (index.html, css/, js/)
netlify/functions/    API routes (parts, projects, project-parts, to-buy, suggest-parts, wiring-guide, generate-code, compat-review, snippets)
lib/                  shared server code (db client, schema, compatibility rules, AI provider client, GPIO pin-map reference)
db/                   migration + seed scripts, seed data
ERRORS.md             running log of bugs found and how they were fixed — check before touching an area it covers
```

## Project Assistant

On a project page, type a plain description of what you want to build (e.g. "a motion light that beeps when it detects movement") and click **Suggest parts & pins**. The AI proposes which catalog parts and GPIO pins the build needs — part selection is schema-constrained to your actual catalog ids, so it can't suggest a part you don't have. Anything the description needs that isn't in your catalog comes back as a plain-text "gap" instead of a fabricated part. Accept suggestions individually or all at once.

Once parts have pins assigned, click **Explain wiring** for plain-language, step-by-step instructions per part — which wire goes to which physical Raspberry Pi pin (by pin number, not just the BCM `GPIOxx` name), plus a caution flag for anything like a voltage mismatch with the Pi's 3.3V logic. Physical pin numbers are grounded against a fixed reference table (`lib/pinmap.js`), not left to the AI's memory. Results are written into each part's wiring notes.

Then use **Generate code** to get Python wired to those exact parts and pins.

## Notes on the seed data

The LAFVIN Super Starter Kit catalog is pre-populated by `npm run db:seed`. Per the original inventory notes, LED and standalone jumper-wire counts weren't precisely confirmed against the physical kit and aren't included as catalog items — add them yourself via the Parts Catalog page once counted.

## Guardrails baked into the code

- Duplicate GPIO pin assignments within a project are rejected outright (409), both in the API logic and via a DB unique index.
- A part with `requiresAdc: true` and no ADC module assigned in the project surfaces as a warning (not a hard block — a project can be in "planning" before its ADC module is picked).
- Code generation only uses a part's stored `library` field verbatim; if it's null, that part is skipped and listed under `unresolved` instead of guessing an import.
- The "to buy" list never fabricates a price or link — it only shows `sourceUrl`/`estPrice` if actually stored on the part, otherwise "not yet priced".
- Generated code snippets start `verified: false`; the UI only flips it to `true` when you explicitly confirm it ran on real hardware.
- Future migration path: backend logic stays framework-light (no heavy SSR) specifically so it can move to self-hosting on a Raspberry Pi later.
