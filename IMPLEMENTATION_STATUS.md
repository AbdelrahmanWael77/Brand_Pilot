# BrandPilot — Live Implementation Status

> Shared state for every AI coding agent. Replace stale statements with observed facts. Keep short (<80 lines). Update after **every** task, along with `NEXT_AGENT_PROMPT.md`.

**Last updated:** 2026-11-12 — Fable 5.2 (Claude Code), task 1.5c completed
**Current phase:** 1 — SaaS foundation (1.1–1.5c done; only the 1.6 sign-off remains)
**Branch / commit:** `feat/1.5c-rate-limit` (stacked: 1.5c → 1.5b → 1.5a → 1.4 → 1.3 → 1.2 → 1.1; none merged into `main`) — see `git log -1`
**Run:** `npm install` then `npm start` → http://localhost:3000 (`PORT` env overrides; `npm run dev` = watch mode)
**Test:** `npm test` (built-in `node --test`, files in `test/`)

## Verified complete
- Phase 0: Node 24 + Express 5 app serves the prototype at `/` and `GET /api/health`. Launch verified in a browser (dashboard renders, no console errors); 3/3 tests pass.
- 1.1: `server/db.js` exports `openDb(path)` and `initSchema(db)`; tables `users`, `sessions`, `companies`, `memberships`; foreign keys on, WAL for file DBs.
- 1.2: `server/auth.js` — `POST /api/auth/register|login|logout`, `GET /api/auth/me`. scrypt hashes; cookie `bp_session` (httpOnly, SameSite=Lax, Secure in production, 30 days); only the SHA-256 of the token is stored. `createApp({ db })` wires it; `app.locals.requireAuth` and `app.locals.db` are available for new routers.
- 1.3: `server/companies.js` — `POST /api/companies`, `GET /api/companies`, `GET /api/companies/:id`, all behind `requireAuth`. `requireCompany` (also on `app.locals`) sets `req.company = { id, name, role }` or answers 404 to non-members. Company + owner membership are created in one transaction.
- 1.4: `GET`/`PUT /api/companies/:id/state` — one JSON object per company in table `company_state`; PUT body `{ state: {...} }` replaces it. 5 MB limit on this route only (1 MB elsewhere); oversize → 413 `too_large`.
- 1.5a: `public/index.html` shows an EN/AR (RTL) sign-in / create-account card unless `GET /api/auth/me` succeeds; top bar shows the user's email and a Sign out button. Code is the `Auth gate` block at the end of the script (`start()`, `authRender()`, `startApp()`, global `USER`).
- 1.5b: the frontend loads companies from the API after sign-in and saves each changed company with a debounced `PUT .../state` (the `Server sync` block at the end of the script: `SYNC`, `api()`, `createCo()`, `syncNow()`, `startApp()`). `localStorage` keeps only `lang`, `active`, `ui`, `ai`. Server gained `DELETE /api/companies/:id` (owner only) and an optional `name` on `PUT .../state` that renames the company.
- 1.5c: auth rate limiting in `server/auth.js` — 5 failed logins per IP + email per 15 min, 20 registrations per IP per hour → 429 `too_many_attempts` with `Retry-After`; a successful login clears the count. Tests override via `createApp({ db, authLimits })`.
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
- **Sync model:** `save()` (called by every `render()`) schedules `syncNow()`, which diffs `S.companies` against what was last sent: unknown local id → `POST` then re-key to the server id; missing id → `DELETE`; changed JSON → `PUT`. So any code that mutates `S.companies` and calls `R()` is persisted without extra work. A 401 reloads to the sign-in card; other failures toast once and retry every 5 s.
- A new account starts with one empty company ("My company") on the onboarding view — no synthetic seed. `seed()` is now unused dead code; the explicit "load demo" action inside a company still works and is labeled synthetic. "Delete everything" now deletes the account's companies and leaves one empty company.
- Known limits: last write wins (no conflict detection between two tabs/devices); a company over 5 MB (large media) fails to save with a visible error; edits in the last ~0.8 s before closing the tab are flushed with `keepalive` only when under 60 KB.
- Rate limiter is in-memory and per process (resets on restart, not shared across instances). It keys on `req.ip`: behind a reverse proxy set Express `trust proxy` correctly at deployment, or every user shares one bucket.
- Dev tip: a stale `node` can keep port 3000 after a session ends; if `/api/auth/me` returns 404, kill it (`netstat -ano | grep :3000`) or run with `PORT=3100`.
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
| ~~1.5a~~ | Done 2026-11-12 — auth gate + sign out in `public/index.html` | Fable 5.2 | high | 4h |
| ~~1.5b~~ | Done 2026-11-12 — server sync in `public/index.html`, `DELETE` + rename on the server | Fable 5.2 | high | 1d |
| ~~1.5c~~ | Done 2026-11-12 — limiter in `server/auth.js` + `test/ratelimit.test.js` | Fable 5.2 | medium | 1h |
| 1.6 | Phase 1 exit check: sign in, create company, reload, data persists; second user cannot see it. Tick Phase 1 in `PHASES.md` | Sonnet 5.5 | medium | 1h |

## Next atomic task
**1.6** — Phase 1 exit sign-off (details in `NEXT_AGENT_PROMPT.md`). **Done when:** the browser scenario is rerun once on the final code, Phase 1 is ticked in `PHASES.md`, and a Phase 2 task queue (each task with Agent / Reasoning / Dev effort) replaces the Phase 1 queue here.

## Last tests (actual results only)
- 2026-11-12 `npm test` → 34 pass, 0 fail (`health` 3, `db` 4, `auth` 8, `companies` 6, `state` 9, `ratelimit` 4).
- 2026-11-12 browser, on the 1.5b code (before the limiter was added): two-user scenario passed — A's companies persist across reload and sign-out; B in the same browser sees only its own company and gets 404 on A's id; delete / delete-all / locally added company reach the server; Arabic/RTL fine; no JS errors.
- Not exercised by hand: the 429 message in the sign-in card, the real file-import button, the load-demo action, the 5 MB error path, the offline retry path.

## Blockers / external prerequisites
- None for Phase 1. Phase 4 will need an AI API key in `.env` (never commit).

## Files changed in latest task
- Added: `test/ratelimit.test.js`
- Edited: `server/auth.js` (limiter), `server/app.js` (`authLimits` option), `public/index.html` (`too_many_attempts` message)
