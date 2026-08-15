# Error Log

Check this file at the start of each session before touching areas it covers.
Every bug found, wrong assumption corrected, or reverted approach gets an entry.

Format per entry:

```
## YYYY-MM-DD — short title
**Area:** file(s)/feature
**Tried:** what was attempted
**Failed because:** root cause
**Fix:** what actually resolved it
```

---

## 2026-08-15 — FK cascade not reliable over libsql HTTP client
**Area:** netlify/functions/projects.js (DELETE), lib/schema.sql
**Tried:** Relying on `ON DELETE CASCADE` in the schema (project_parts, code_snippets reference projects) to clean up child rows when a project is deleted.
**Failed because:** SQLite only enforces foreign keys when `PRAGMA foreign_keys = ON` is set per-connection, and the libsql client talking to a remote Turso DB is effectively stateless over HTTP — a pragma set on one `execute()` call isn't guaranteed to apply to the next. Cascade would silently no-op in production against Turso even though it works locally against the file DB.
**Fix:** Delete `code_snippets` and `project_parts` rows for the project explicitly before deleting the project row, instead of depending on the cascade.

---

## 2026-08-15 — local db path broken under esbuild function bundling
**Area:** lib/db.js
**Tried:** `path.join(__dirname, '..', 'db', 'local.db')` to locate the local SQLite fallback file relative to `lib/db.js`.
**Failed because:** Netlify Functions are bundled per-function by esbuild into `.netlify/functions-serve/<function>/...`, so `__dirname` at runtime points inside that bundled subtree, not the real `lib/` directory. The computed path pointed at a nonexistent nested folder and every function calling `getClient()` failed with `ConnectionFailed`.
**Fix:** Use `path.join(process.cwd(), 'db', 'local.db')` instead — `netlify dev` and deployed functions both keep `process.cwd()` at the site root regardless of bundling.

---

## 2026-08-15 — pinned Gemini model version returned 404
**Area:** lib/gemini.js
**Tried:** Defaulted `GEMINI_MODEL` to `gemini-2.0-flash`.
**Failed because:** That version has been retired — the API returned "This model models/gemini-2.0-flash is no longer available." Model version strings get sunset over time.
**Fix:** Default to the `gemini-flash-latest` alias instead, which Google keeps pointed at their current recommended flash model. Confirmed working via `GET /v1beta/models` (send the key as the `x-goog-api-key` header, not a query param, so it never lands in a URL/logs).

---

## 2026-08-15 — hard duplicate-pin rule blocked legitimate shared-bus wiring
**Area:** lib/compat.js, lib/schema.sql (project_parts unique index)
**Tried:** Treated "duplicate GPIO pin within a project" as a hard error for every part, enforced by both app logic and a DB unique index on (projectId, gpioPin).
**Failed because:** Wrong assumption — i2c/spi/uart devices legitimately share the same bus pins (differentiated by device address or chip-select, not by pin uniqueness). The rule would have rejected e.g. adding both the LCD1602 IIC Display and GY-521 MPU6050 to the same project, even though that's normal I2C wiring. Became obvious once the AI-suggested-parts feature started proposing multi-device I2C projects.
**Fix:** `findPinConflict` in lib/compat.js now skips the check when either part's interface is i2c/spi/uart. Dropped the DB-level unique index too, since it can't see the joined `parts.interface` column to apply the same exemption — acceptable for a single-user app with no real concurrent-write race.

---

## 2026-08-15 — Gemini free tier returns 503 "high demand" frequently
**Area:** lib/gemini.js, netlify/functions/{generate-code,compat-review,suggest-parts}.js
**Tried:** A single `model.generateContent()` call per request, surfacing any failure straight to the user.
**Failed because:** The free-tier `gemini-flash-latest` endpoint returns `503 Service Unavailable` ("currently experiencing high demand") often enough in practice that the user hit it repeatedly across different endpoints in the same session — not a rare fluke.
**Fix:** Added `generateJSON()` in lib/gemini.js — retries up to 2 times with exponential backoff (800ms, 1600ms) specifically on 503s, and only 503s (a bad key or malformed request still fails immediately). All three Gemini-calling functions now go through it. `describeGeminiError()` gives a clearer message when retries are exhausted instead of the generic "please try again."

---

## 2026-08-15 — production 502: esbuild dropped libsql's native binary
**Area:** netlify.toml, all functions using lib/db.js
**Tried:** Deployed with `node_bundler = "esbuild"` and no further config, same as local `netlify dev`.
**Failed because:** `@libsql/client` resolves a platform-specific native addon (`@libsql/linux-x64-gnu` on Netlify's Lambda runtime) via a dynamic require at runtime. esbuild statically bundles each function into one file and can't see that dynamic require, so it silently dropped the native module from the deploy zip. Every function touching the DB returned 502 `Cannot find module '@libsql/linux-x64-gnu'` in production, even though it worked fine locally — `netlify dev` runs functions straight off disk with the full `node_modules` present, so the bundling step (and this bug) never happens there. Local testing alone couldn't have caught this.
**Fix:** Added `external_node_modules = ["@libsql/client", "libsql"]` under `[functions]` in netlify.toml — tells esbuild to leave those packages alone and ship them as normal `node_modules`, preserving the dynamic native-binary resolution.

---

(no other entries yet)
