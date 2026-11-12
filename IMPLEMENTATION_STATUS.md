# BrandPilot — Live Implementation Status

> Shared state for every AI coding agent. Replace stale statements with observed facts. Keep short (<80 lines). Update after **every** task, along with `NEXT_AGENT_PROMPT.md`.

**Last updated:** 2026-11-12 — Fable 5.2 (Claude Code), task 1.6 completed — **Phase 1 signed off**
**Current phase:** 2 — Company intelligence (not started)
**Branch / commit:** `feat/1.6-phase1-signoff` (docs-only commits ahead of `main`; `main` holds everything through 1.5c). No remote configured; nothing pushed. One short `feat/<task>` branch per task.
**Run:** `npm install` then `npm start` → http://localhost:3000 (`PORT` and `BRANDPILOT_DB=<file>` env override; `npm run dev` = watch mode)
**Test:** `npm test` (built-in `node --test`, files in `test/`)

## Verified complete
- Phase 0: Node + Express app serves the frontend and `GET /api/health`.
- Phase 1 (exit criteria met, see Last tests): `server/db.js` (SQLite schema), `server/auth.js` (register / login / logout / me, scrypt, hashed session tokens, rate limiting), `server/companies.js` (create / list / get / delete, `requireCompany` isolation, per-company state blob `GET`/`PUT .../state`), frontend sign-in card (EN/AR) and server sync in `public/index.html`.

## In progress / uncommitted
- None.

## Decisions (reversible unless noted)
- **Stack:** Node >=22.5 (ESM) + Express 5; built-in `node:sqlite` (file under `data/`, git-ignored); `node:test`. No build step, no frontend framework. Only dependency: `express`.
- **Frontend:** `public/index.html` is the live single-file vanilla-JS app (EN/AR + RTL). Root `BrandPilot.html` is the untouched reference. Patch in place; never rewrite or redesign. Lines are very long — locate code with `grep -n -o 'pattern.\{0,200\}'`, never read the file whole.
- **Frontend state:** global `S = { v, lang, active, companies:{id→obj}, ui, ai }`; `C()` = active company; every `render()` calls `save()`, which schedules `syncNow()` — it diffs `S.companies` against what was last sent (new → `POST` + re-key to server id, removed → `DELETE`, changed → `PUT .../state`). So code that mutates a company and calls `R()` is persisted automatically. `localStorage` holds only `lang`, `active`, `ui`, `ai`.
- **Isolation rule:** every company-scoped route is `/api/companies/:id/...` behind `requireCompany` (404 for non-members); queries filter by `req.company.id`, never by an id from the body.
- **API conventions:** JSON errors `{ error: code }` — 400 invalid input, 401, 403, 404, 409, 413 `too_large`, 429 `too_many_attempts`. State-changing routes are POST/PUT/DELETE with JSON bodies (CSRF relies on SameSite=Lax + JSON-only). Tests call `createApp({ db: openDb(':memory:') })`.
- **Knowledge today (prototype logic, client-side, inside the state blob):** `addSource(c,title,kind,text,demo)` → `c.sources[]`; `extract(c)` is a fixed-rules extractor (not AI) producing `c.findings[]` items `{ id, cat, text, type, status: pending|approved|rejected, src, ev, needs, date }`; `approveF(c,f)`; `publishK(c)` snapshots approved facts into `c.kver[]`. The server stores this opaquely — it cannot yet tell approved facts from anything else.
- A new account starts with one empty company; no synthetic seed. Synthetic demo material loads only through the explicit, labeled "load demo" action.
- Known limits: last write wins across tabs/devices; company state over 5 MB fails to save with a visible error; rate limiter is in-memory per process and keys on `req.ip` (set Express `trust proxy` behind a reverse proxy).
- ShipSafe folders and other zips in this directory are unrelated and git-ignored.

## Task queue (Phase 2) — do the first unchecked one only
| # | Task | Agent | Reasoning | Dev effort |
|---|---|---|---|---|
| 2.1 | Browser pass of the existing knowledge flow through the real UI on a synced company: edit company details, add a text source, upload a `.txt`, run discovery, approve + reject findings, publish, reload. Record what works; fix only breakages caused by the server sync | Sonnet 5.5 [Fable 5.2] | medium | 2h |
| 2.2 | Server knowledge mirror: tables `sources` and `facts` (company-scoped). On `PUT .../state` the server rewrites both from `state.sources` / `state.findings` in one transaction, validating shape. Add `GET /api/companies/:id/facts?status=approved` and an internal `approvedFacts(db, companyId)` — the only read path later phases may use for "facts" | Fable 5.2 [Opus 5.5] | high | 4h |
| 2.3 | Evidence invariant on the server: a fact is stored as `approved` only with non-empty evidence (or `type: 'user'`, labeled "entered manually"); anything else is stored as `pending` and reported back in the PUT response; facts from `demo` sources carry `synthetic: true`. Show the downgrade in the UI | Fable 5.2 [Opus 5.5] | high | 3h |
| 2.4 | File ingestion honesty: the upload control accepts `.pdf/.docx/.pptx` and images but only text-like files can be read as text in the browser. Verify what each type does; make unsupported types say so (EN/AR) instead of producing empty or garbage sources; cap text size | Sonnet 5.5 | medium | 2h |
| 2.5 | Website source via the server: `POST /api/companies/:id/fetch-url` (the browser `fetch(c.website)` fails on CORS) — http/https only, block private/loopback addresses after DNS resolution, 10 s timeout, 1 MB cap, no redirects to blocked hosts; wire the existing "fetch website" action to it | Fable 5.2 [Opus 5.5] | high | 4h |
| 2.6 | Phase 2 exit check in a browser: approved facts survive refresh; evidence visible; `GET .../facts?status=approved` never returns pending/rejected items; second user gets 404. Tick Phase 2 in `PHASES.md`; write the Phase 3 queue | Sonnet 5.5 | medium | 1h |

## Next atomic task
**2.1** — see the table and `NEXT_AGENT_PROMPT.md`. **Done when:** each step of the flow is recorded here as works / broken-and-fixed / broken-and-deferred, from a real browser run; `npm test` green.

## Last tests (actual results only)
- 2026-11-12 `npm test` → 34 pass, 0 fail (`health` 3, `db` 4, `auth` 8, `companies` 6, `state` 9, `ratelimit` 4).
- 2026-11-12 Phase 1 exit scenario, final code, scripted in the app's built-in browser against a throwaway DB: A registers → one empty company; renames it, adds a source with Arabic text, runs the rules extractor (10 findings); reload → all intact; sign out; B registers in the same browser → only its own empty company, 404 on A's company id; six wrong passwords → "Too many attempts" message in EN and AR; A signs in on a second server instance sharing the same DB file → data intact (persistence is in the DB, not the process). No JS errors.
- Not exercised by hand: clicking through the real buttons (the run drove app functions from the console), file import, load-demo, the 5 MB error path, offline retry. Task 2.1 covers the UI path.

## Blockers / external prerequisites
- None for Phase 2. Phase 4 will need an AI API key in `.env` (never commit).

## Files changed in latest task
- Edited: `PHASES.md` (Phase 1 ticked), `IMPLEMENTATION_STATUS.md`, `NEXT_AGENT_PROMPT.md`. No code changes.
