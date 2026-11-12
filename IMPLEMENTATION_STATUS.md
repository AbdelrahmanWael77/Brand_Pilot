# BrandPilot — Live Implementation Status

> Shared state for every AI coding agent. Replace stale statements with observed facts. Keep short (<80 lines). Update after **every** task, along with `NEXT_AGENT_PROMPT.md`.

**Last updated:** 2026-11-12 — Fable 5.2 (Claude Code), Phase 0 completed
**Current phase:** 1 — SaaS foundation (not started)
**Branch / commit:** `main` — see `git log -1`
**Run:** `npm install` then `npm start` → http://localhost:3000 (`PORT` env overrides; `npm run dev` = watch mode)
**Test:** `npm test` (built-in `node --test`, files in `test/`)

## Verified complete
- Phase 0: Node 24 + Express 5 app serves the prototype at `/` and `GET /api/health`. Launch verified in a browser (dashboard renders, no console errors); 3/3 tests pass.
- Handoff pack installed at repo root; original zip + extract kept in `docs/handoff-pack/`.

## In progress / uncommitted
- None.

## Decisions (reversible unless noted)
- **Stack:** Node >=22.5 (ESM) + Express 5; persistence = built-in `node:sqlite` (file under `data/`, git-ignored); tests = `node:test`. No build step, no frontend framework. Only dependency: `express`.
- **Frontend:** `public/index.html` is the working copy of the single-file vanilla-JS prototype (EN/AR + RTL already inside). Root `BrandPilot.html` stays untouched as reference. Patch the working copy in place; do not rewrite or redesign.
- The prototype keeps all state in `localStorage`, has no backend and no real AI call — everything in it is a mock until wired to `/api`.
- Auth plan: email + password, `node:crypto` scrypt hashes, server-side sessions in SQLite, httpOnly SameSite=Lax cookie. No third-party auth library.
- ShipSafe folders and other zips in this directory are unrelated and git-ignored.

## Task queue (Phase 1) — do the first unchecked one only
| # | Task | Agent | Reasoning | Dev effort |
|---|---|---|---|---|
| 1.1 | `server/db.js`: open `node:sqlite` DB (path from `BRANDPILOT_DB`, default `data/brandpilot.db`, `:memory:` in tests), idempotent schema for `users`, `sessions`, `companies`, `memberships`; test it | Fable 5.2 [Opus 5.5] | medium | 2h |
| 1.2 | Auth API: `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me`; scrypt, session cookie, `requireAuth` middleware; tests incl. wrong password and no-cookie 401 | Fable 5.2 [Opus 5.5] | high | 4h |
| 1.3 | Company API: create/list/get, `requireCompany` membership check on `/api/companies/:id/*`; test that user B gets 404 on user A's company | Fable 5.2 [Opus 5.5] | high | 4h |
| 1.4 | Company state API: `GET/PUT /api/companies/:id/state` storing the prototype's per-company JSON blob (size-limited); tests | Sonnet 5.5 [Fable 5.2] | medium | 2h |
| 1.5 | Frontend: login/register screen + replace `localStorage` load/save in `public/index.html` with the API; keep EN/AR RTL | Fable 5.2 [Opus 5.5] | high | 1d |
| 1.6 | Phase 1 exit check: sign in, create company, reload, data persists; second user cannot see it. Tick Phase 1 in `PHASES.md` | Sonnet 5.5 | medium | 1h |

## Next atomic task
**1.1** — as described above. **Done when:** `npm test` passes with a new `test/db.test.js` proving schema init runs twice without error, a user + company + membership row round-trips, and a duplicate email is rejected.

## Last tests (actual results only)
- 2026-11-12 `npm test` → 3 pass, 0 fail (`test/health.test.js`).
- 2026-11-12 manual: `npm start`, opened http://localhost:3000 — prototype dashboard rendered, console clean.

## Blockers / external prerequisites
- None for Phase 1. Phase 4 will need an AI API key in `.env` (never commit).

## Files changed in latest task
- Added: `package.json`, `package-lock.json`, `server/app.js`, `server/index.js`, `test/health.test.js`, `public/index.html`, `.gitignore`, `.claude/launch.json`, `BrandPilot.html`, `docs/handoff-pack/*`
- Edited: `AGENTS.md` (agent/effort rule, reference section), `PHASES.md` (Phase 0 ticked, agent/effort table)
