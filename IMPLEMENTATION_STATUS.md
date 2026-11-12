# BrandPilot — Live Implementation Status

> Shared state for every AI coding agent. Replace stale statements with observed facts. Keep short (<80 lines). Update after **every** task, along with `NEXT_AGENT_PROMPT.md`.

**Last updated:** 2026-11-12 — Fable 5.2 (Claude Code), task 1.2 completed
**Current phase:** 1 — SaaS foundation (1.1–1.2 done)
**Branch / commit:** `feat/1.2-auth-api` (stacked on `feat/1.1-db-layer`; neither merged into `main`) — see `git log -1`
**Run:** `npm install` then `npm start` → http://localhost:3000 (`PORT` env overrides; `npm run dev` = watch mode)
**Test:** `npm test` (built-in `node --test`, files in `test/`)

## Verified complete
- Phase 0: Node 24 + Express 5 app serves the prototype at `/` and `GET /api/health`. Launch verified in a browser (dashboard renders, no console errors); 3/3 tests pass.
- 1.1: `server/db.js` exports `openDb(path)` and `initSchema(db)`; tables `users`, `sessions`, `companies`, `memberships`; foreign keys on, WAL for file DBs.
- 1.2: `server/auth.js` — `POST /api/auth/register|login|logout`, `GET /api/auth/me`. scrypt hashes; cookie `bp_session` (httpOnly, SameSite=Lax, Secure in production, 30 days); only the SHA-256 of the token is stored. `createApp({ db })` wires it; `app.locals.requireAuth` and `app.locals.db` are available for new routers.
- Handoff pack installed at repo root; original zip + extract kept in `docs/handoff-pack/`.

## In progress / uncommitted
- None.

## Decisions (reversible unless noted)
- **Stack:** Node >=22.5 (ESM) + Express 5; persistence = built-in `node:sqlite` (file under `data/`, git-ignored); tests = `node:test`. No build step, no frontend framework. Only dependency: `express`.
- **Frontend:** `public/index.html` is the working copy of the single-file vanilla-JS prototype (EN/AR + RTL already inside). Root `BrandPilot.html` stays untouched as reference. Patch the working copy in place; do not rewrite or redesign.
- The prototype keeps all state in `localStorage`, has no backend and no real AI call — everything in it is a mock until wired to `/api`.
- Auth: no third-party library. CSRF relies on SameSite=Lax plus JSON-only bodies — keep all state-changing routes POST/PUT/DELETE with JSON, never GET.
- API errors are JSON `{ error: code }`: 400 invalid input, 401 `unauthenticated`/`invalid_credentials`, 404 `not_found`, 409 `email_taken`.
- Tests must call `createApp({ db: openDb(':memory:') })`; a bare `createApp()` opens the file DB.
- IDs are app-generated TEXT (use `crypto.randomUUID()`); timestamps are ISO strings; `users.email` is UNIQUE NOCASE.
- `node:sqlite` prints an ExperimentalWarning on Node 24 — harmless, leave it.
- ShipSafe folders and other zips in this directory are unrelated and git-ignored.

## Task queue (Phase 1) — do the first unchecked one only
| # | Task | Agent | Reasoning | Dev effort |
|---|---|---|---|---|
| ~~1.1~~ | Done 2026-11-12 — `server/db.js` + `test/db.test.js` | Fable 5.2 | medium | 2h |
| ~~1.2~~ | Done 2026-11-12 — `server/auth.js` + `test/auth.test.js` | Fable 5.2 | high | 4h |
| 1.3 | Company API: create/list/get, `requireCompany` membership check on `/api/companies/:id/*`; test that user B gets 404 on user A's company | Fable 5.2 [Opus 5.5] | high | 4h |
| 1.4 | Company state API: `GET/PUT /api/companies/:id/state` storing the prototype's per-company JSON blob (size-limited); tests | Sonnet 5.5 [Fable 5.2] | medium | 2h |
| 1.5 | Frontend: login/register screen + replace `localStorage` load/save in `public/index.html` with the API; keep EN/AR RTL | Fable 5.2 [Opus 5.5] | high | 1d |
| 1.5b | Login/register rate limiting (in-memory, per IP + email, 429) — required before any public deployment | Sonnet 5.5 | medium | 1h |
| 1.6 | Phase 1 exit check: sign in, create company, reload, data persists; second user cannot see it. Tick Phase 1 in `PHASES.md` | Sonnet 5.5 | medium | 1h |

## Next atomic task
**1.3** — Company API. New `server/companies.js` router mounted at `/api/companies` behind `requireAuth`: `POST /` (name 1–120 chars → creates company + `owner` membership in one transaction), `GET /` (only the caller's companies), `GET /:id`, and an exported `requireCompany` middleware that sets `req.company` or answers 404 for non-members. **Done when:** new `test/companies.test.js` passes — create then list shows it; user B's list is empty and B gets 404 (not 403) on A's company id; unauthenticated 401; blank name 400.

## Last tests (actual results only)
- 2026-11-12 `npm test` → 15 pass, 0 fail (`health` 3, `db` 4, `auth` 8). Tests create no file under `data/`.
- Not re-checked in a browser since Phase 0; the frontend does not call the auth API yet (task 1.5).

## Blockers / external prerequisites
- None for Phase 1. Phase 4 will need an AI API key in `.env` (never commit).

## Files changed in latest task
- Added: `server/auth.js`, `test/auth.test.js`
- Edited: `server/app.js` (db injection, auth router, JSON error handler), `test/health.test.js` (in-memory DB)
