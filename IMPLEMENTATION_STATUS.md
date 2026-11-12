# BrandPilot — Live Implementation Status

> Shared state for every AI coding agent. Replace stale statements with observed facts. Keep short (<80 lines). Update after **every** task, along with `NEXT_AGENT_PROMPT.md`.

**Last updated:** 2026-11-12 — Fable 5.2 (Claude Code), task 1.4 completed
**Current phase:** 1 — SaaS foundation (1.1–1.4 done; backend for Phase 1 complete, frontend not wired)
**Branch / commit:** `feat/1.4-company-state` (stacked: 1.4 → 1.3 → 1.2 → 1.1; none merged into `main`) — see `git log -1`
**Run:** `npm install` then `npm start` → http://localhost:3000 (`PORT` env overrides; `npm run dev` = watch mode)
**Test:** `npm test` (built-in `node --test`, files in `test/`)

## Verified complete
- Phase 0: Node 24 + Express 5 app serves the prototype at `/` and `GET /api/health`. Launch verified in a browser (dashboard renders, no console errors); 3/3 tests pass.
- 1.1: `server/db.js` exports `openDb(path)` and `initSchema(db)`; tables `users`, `sessions`, `companies`, `memberships`; foreign keys on, WAL for file DBs.
- 1.2: `server/auth.js` — `POST /api/auth/register|login|logout`, `GET /api/auth/me`. scrypt hashes; cookie `bp_session` (httpOnly, SameSite=Lax, Secure in production, 30 days); only the SHA-256 of the token is stored. `createApp({ db })` wires it; `app.locals.requireAuth` and `app.locals.db` are available for new routers.
- 1.3: `server/companies.js` — `POST /api/companies`, `GET /api/companies`, `GET /api/companies/:id`, all behind `requireAuth`. `requireCompany` (also on `app.locals`) sets `req.company = { id, name, role }` or answers 404 to non-members. Company + owner membership are created in one transaction.
- 1.4: `GET`/`PUT /api/companies/:id/state` — one JSON object per company in table `company_state`; PUT body `{ state: {...} }` replaces it. 5 MB limit on this route only (1 MB elsewhere); oversize → 413 `too_large`.
- Handoff pack installed at repo root; original zip + extract kept in `docs/handoff-pack/`.

## In progress / uncommitted
- None.

## Decisions (reversible unless noted)
- **Stack:** Node >=22.5 (ESM) + Express 5; persistence = built-in `node:sqlite` (file under `data/`, git-ignored); tests = `node:test`. No build step, no frontend framework. Only dependency: `express`.
- **Frontend:** `public/index.html` is the working copy of the single-file vanilla-JS prototype (EN/AR + RTL already inside). Root `BrandPilot.html` stays untouched as reference. Patch the working copy in place; do not rewrite or redesign.
- The prototype keeps all state in `localStorage`, has no backend and no real AI call — everything in it is a mock until wired to `/api`.
- Auth: no third-party library. CSRF relies on SameSite=Lax plus JSON-only bodies — keep all state-changing routes POST/PUT/DELETE with JSON, never GET.
- API errors are JSON `{ error: code }`: 400 invalid input, 401 `unauthenticated`/`invalid_credentials`, 404 `not_found`, 409 `email_taken`.
- **Isolation rule:** every company-scoped route is `/api/companies/:id/...` and goes through `requireCompany`; queries below it filter by `req.company.id`, never by an id from the body.
- **Frontend state shape (from `public/index.html`):** one global `S = { v:1, lang, active, companies:[...], ui }` saved whole by `save()` to `localStorage['brandpilot.v1']`; `boot()` (last function) loads it or calls `seed()` for demo companies; `newCompany(o)` builds a company object; `C()` = active company. Lines are very long — use `grep -o` with context, never read the whole file.
- Tests must call `createApp({ db: openDb(':memory:') })`; a bare `createApp()` opens the file DB.
- IDs are app-generated TEXT (use `crypto.randomUUID()`); timestamps are ISO strings; `users.email` is UNIQUE NOCASE.
- `node:sqlite` prints an ExperimentalWarning on Node 24 — harmless, leave it.
- ShipSafe folders and other zips in this directory are unrelated and git-ignored.

## Task queue (Phase 1) — do the first unchecked one only
| # | Task | Agent | Reasoning | Dev effort |
|---|---|---|---|---|
| ~~1.1~~ | Done 2026-11-12 — `server/db.js` + `test/db.test.js` | Fable 5.2 | medium | 2h |
| ~~1.2~~ | Done 2026-11-12 — `server/auth.js` + `test/auth.test.js` | Fable 5.2 | high | 4h |
| ~~1.3~~ | Done 2026-11-12 — `server/companies.js` + `test/companies.test.js` | Fable 5.2 | high | 4h |
| ~~1.4~~ | Done 2026-11-12 — state routes in `server/companies.js` + `test/state.test.js` | Fable 5.2 | medium | 2h |
| 1.5a | Frontend auth gate: EN/AR login/register screen in `public/index.html`, shown when `GET /api/auth/me` is 401; logout button; app boots only when signed in | Fable 5.2 [Opus 5.5] | high | 4h |
| 1.5b | Frontend sync: on boot load companies + each state from the API; `save()` debounce-PUTs the active company's object; creating a company POSTs first; `lang`/`ui` stay in `localStorage`; demo seed only via explicit "load demo" and labeled | Fable 5.2 [Opus 5.5] | high | 1d |
| 1.5c | Login/register rate limiting (in-memory, per IP + email, 429) — required before any public deployment | Sonnet 5.5 | medium | 1h |
| 1.6 | Phase 1 exit check: sign in, create company, reload, data persists; second user cannot see it. Tick Phase 1 in `PHASES.md` | Sonnet 5.5 | medium | 1h |

## Next atomic task
**1.5a** — Frontend auth gate (details in `NEXT_AGENT_PROMPT.md`). **Done when:** in a browser, a fresh visit shows the login/register screen in EN and AR (RTL); registering shows the existing app; reload stays signed in; logout returns to the login screen; wrong password shows an error; `npm test` still green.

## Last tests (actual results only)
- 2026-11-12 `npm test` → 28 pass, 0 fail (`health` 3, `db` 4, `auth` 8, `companies` 6, `state` 7). One test logs `Error: boom` on purpose (rollback check).
- Not re-checked in a browser since Phase 0; the frontend does not call the API yet.

## Blockers / external prerequisites
- None for Phase 1. Phase 4 will need an AI API key in `.env` (never commit).

## Files changed in latest task
- Added: `test/state.test.js`
- Edited: `server/db.js` (`company_state` table), `server/companies.js` (state routes), `server/app.js` (per-route JSON limit, 413 code), `test/db.test.js` (table list)
