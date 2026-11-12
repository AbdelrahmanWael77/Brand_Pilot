# BrandPilot — Live Implementation Status

> Shared state for every AI coding agent. Replace stale statements with observed facts. Keep short (<80 lines). Update after **every** task, along with `NEXT_AGENT_PROMPT.md`.

**Last updated:** 2026-11-12 — Fable 5.2 (Claude Code), task 3.1 completed (data import → analytics → audit browser pass)
**Current phase:** 3 — Marketing analysis (3.1 done, 3.2 next)
**Location:** the Git checkout you are in (seen at `D:\Projects\Brand_Pilot` on 2026-11-12; earlier handoffs said `D:\brand-pilot-implemntion`; `D:\brand-pilot` is retired). A fresh checkout has no `node_modules` — run `npm install` before `npm test`.
**Branch / commit:** **`dev` is the working branch** (owner's decision, 2026-11-12): it holds everything through 3.1 and is on GitHub (`origin/dev`, https://github.com/AbdelrahmanWael77/Brand_Pilot.git). `origin/main` is still at the 1.6 state — a direct push to `main` was refused with HTTP 403, so do not push to `main`; getting `dev` into `main` is the owner's call (pull request). One short `feat/<task>` branch per task, branched from `dev`, merged back into `dev` (fast-forward), then `git push origin dev`.
**Run:** `npm install` then `npm start` → http://localhost:3000 (`PORT` and `BRANDPILOT_DB=<file>` env override; `npm run dev` = watch mode)
**Test:** `npm test` (built-in `node --test`, files in `test/`). **Dev account:** with the app running, `npm run seed:dev` creates the local-only login defined in `scripts/seed-dev-user.js`.

## Verified complete
- Phase 0: Node + Express app serves the frontend and `GET /api/health`.
- Phase 1: `server/db.js` (SQLite schema), `server/auth.js` (register / login / logout / me, scrypt, hashed session tokens, rate limiting), `server/companies.js` (create / list / get / delete, `requireCompany` isolation, per-company state blob `GET`/`PUT .../state`), frontend sign-in card (EN/AR) and server sync in `public/index.html`.
- Phase 2 (exit criteria met, see Last tests):
  - 2.1 knowledge flow works through the real UI with the server sync (edit basics, paste / upload sources, discovery, approve / reject, publish, reload, Arabic RTL).
  - 2.2 `server/knowledge.js` + tables `sources`, `facts`: `PUT .../state` saves blob, name and a validated mirror in one transaction → `{ ok, updatedAt, knowledge: { sources, facts, skipped, downgraded } }`. `GET /api/companies/:id/facts[?status=pending|approved|rejected]` → `{ facts: [{ id, cat, text, type, status, src, srcTitle, synthetic, ev, needs, date }] }`. `approvedFacts(db, companyId)` exported.
  - 2.3 evidence invariant: mirrored as `approved` only with non-blank `ev` or `type: 'user'`; otherwise stored `pending` and returned in `knowledge.downgraded`; the frontend (`syncDowngrade`) returns those to review with an EN/AR toast and a badge. Facts from `demo` sources carry `synthetic: true`.
  - 2.4 uploads and pasted text go through `addText` in `public/index.html`: empty / whitespace / binary content refused with a message; PDF / Office files registered as "text not readable" (never "Readable"); text over 200,000 chars (`SRC_MAX`) cut and marked; text files over 5 MB refused.
  - 2.5 `server/fetchUrl.js` + `POST /api/companies/:id/fetch-url` `{ url }` → `{ url, title, text }`: http/https, ports 80/443/8080/8443, host must resolve only to public addresses (checked on every redirect hop, max 3), connection pinned to the checked address, text content only, 1 MB, 10 s, 20 reads per 10 min per user. Errors: 400 `invalid_url` / `blocked_host`, 413, 415 `unsupported_type`, 429, 502 `fetch_failed`, 504 `timeout`. The "Try to read the website" button uses it.

- Task 3.1 — import → analytics → audit through the real UI (real clicks, downloads and file chooser in headless Chrome; throwaway DB). Nothing broken by the server sync; one prototype crash fixed.
  - (a) templates — **works**: the four "Template" buttons download `brandpilot-{meta,ga4,gsc,leads}-template.csv` with header + one example row.
  - (b) import CSV of each kind + one JSON — **works**: "40 rows imported (2026-10-02 → 2026-11-10)" ×4, JSON "5 rows imported"; wrong columns / wrong kind are refused naming the missing columns.
  - (c) Analytics — **works**: 12 KPI cards appear (was "No performance data yet"); period selector 7 / 28 / all gives different values with "vs previous" deltas.
  - (d) Marketing Audit — **works**: 7 health areas with pass counts and "Show checks", findings each with Evidence / Recommended action / Confidence; missing inputs shown as "Not enough data" or "Information gap".
  - (e) reload — **works**: row counts, KPIs and audit text identical; server state holds the same counts.
  - (f) bad rows — **fixed**: impossible dates (`2026-13-45`, `2026-02-30`, `45/13/2026`) were accepted and then crashed the Analytics view ("Invalid time value"); `importData` now skips them (`realDate`). Non-dates and non-numeric cells were already skipped with "N invalid rows skipped". **Deferred to 3.2 / 3.6:** negative numbers are accepted; the toast does not say why rows were skipped.
  - (g) duplicate import — **deferred to 3.6** (prototype behaviour): importing the same file twice doubles the rows (40 → 80).
  - (h) synthetic demo — **deferred**: the "load demo" / "load synthetic baseline" buttons only show on a company with `demo` set, and nothing in the UI sets it since the Phase 1 seed removal, so demo material is unreachable. Labeling itself works (checked by setting `demo` from the console): sources, import rows, Analytics and Audit all show a "Synthetic" badge.
  - (i) Arabic — **works**: Integrations, Analytics and Audit render RTL with Arabic labels, no horizontal overflow.

## In progress / uncommitted
- Uncommitted on `dev` (2026-11-12, Opus 5.5, small UI fix outside the queue): `public/index.html` line 24 — header company `<select>` now sizes to content and matches `.btn.sm` height (`.top select{width:auto;min-height:30px;...}`, `.top>label.row{flex-wrap:nowrap}`), so "Company", the dropdown and "+ New company" sit on one line. Verified the CSS is served; visual check by the owner in the browser.
- Environment note: on the owner's Windows machine port 3000 is inside a reserved range (`netsh interface ipv4 show excludedportrange protocol=tcp` → 2977–3076); run with `PORT=4000`. `server/index.js` ignores the listen error Express 5 passes to the callback, so it prints "running" and exits 0 — small fix pending.

## Decisions (reversible unless noted)
- **Stack:** Node >=22.5 (ESM) + Express 5; built-in `node:sqlite` (file under `data/`, git-ignored); `node:test`. No build step, no frontend framework. Only dependency: `express`.
- **Frontend:** `public/index.html` is the live single-file vanilla-JS app (EN/AR + RTL). Root `BrandPilot.html` is the untouched reference. Patch in place; never rewrite or redesign. Lines are very long — locate code with `grep -n -o 'pattern.\{0,200\}'`, never read the file whole. Patch with exact-string edits (shell heredocs mangle its regex backslashes).
- **Frontend state:** global `S = { v, lang, active, companies:{id→obj}, ui, ai }`; `C()` = active company; every `render()` calls `save()`, which schedules `syncNow()` — it diffs `S.companies` against what was last sent (new → `POST` + re-key to server id, removed → `DELETE`, changed → `PUT .../state`). Code that mutates a company and calls `R()` is persisted automatically. `localStorage` holds only `lang`, `active`, `ui`, `ai`.
- **Isolation rule:** every company-scoped route is `/api/companies/:id/...` behind `requireCompany` (404 for non-members); queries filter by `req.company.id`, never by an id from the body.
- **API conventions:** JSON errors `{ error: code }` — 400 invalid input, 401, 403, 404, 409, 413 `too_large`, 429 `too_many_attempts`. State-changing routes are POST/PUT/DELETE with JSON bodies (CSRF relies on SameSite=Lax + JSON-only). Tests call `createApp({ db: openDb(':memory:') })`; `createApp` also takes `authLimits`, `fetchUrl`, `fetchLimit`.
- **Mirror pattern (use it again in Phase 3):** the prototype keeps working client-side inside the state blob; on every `PUT .../state` the server validates and copies the parts it must be able to trust into company-scoped tables in the same transaction. Malformed items are skipped and counted, never fatal. Server features read the tables, never the blob.
- **Facts read path:** server code reads facts only through `approvedFacts(db, companyId)`.
- **Data today (prototype, client-side):** `importData(c,text,origin,fname,kind)` parses CSV/JSON into `c.data = { meta[], ga4[], gsc[], leads[] }` using schemas in `SCH` (required / optional / numeric columns), records `c.imports[]`; `audit(c)` builds recommendations with `ev` arrays; `learn(c)`, `campResult`. None of this is on the server yet.
- A new account starts with one empty company; no synthetic seed. Synthetic demo material loads only through the explicit, labeled "load demo" action.
- **Known limits:** last write wins across tabs/devices; company state over 5 MB fails to save with a visible error; rate limiters are in-memory per process (login keys on `req.ip` — set Express `trust proxy` behind a reverse proxy); companies saved before 2.2 have no mirror rows until their next save; the frontend has no automated tests — frontend changes are verified by browser runs only; website reading fetches one page, runs no scripts, ignores robots.txt; the prototype's audit / director / campaign screens still compute in the browser from the blob (the "only approved facts" rule is enforced on the server read path, which those screens do not use yet).
- **Deferred prototype quirks:** keyboard focus drops to `<body>` after each basics field (the `change` handler re-renders the view); `/favicon.ico` 404; the "Demo guide" button shows on a non-demo company. No UI path creates a demo company any more (see 3.1 h) — add a labeled "create demo company" action only if the owner wants demos.

## Task queue (Phase 3) — do the first one only (3.1 done)
| # | Task | Agent | Reasoning | Dev effort |
|---|---|---|---|---|
| 3.2 | Server data mirror: table `data_rows` (company-scoped; kind `meta\|ga4\|gsc\|leads`, date, validated row JSON, `synthetic`) rewritten from `state.data` on `PUT .../state` in the same transaction, validating required columns, real calendar dates and non-negative numeric fields per kind (port `SCH`); report counts and skipped rows in the PUT response. `GET /api/companies/:id/data/summary` → rows per kind and date range | Fable 5.2 [Opus 5.5] | high | 4h |
| 3.3 | Server KPIs: `metrics(db, companyId, { from, to })` computed from `data_rows` (sessions, engaged rate, enquiries, clicks / impressions / CTR, reach / engagement, leads by status) + `GET /api/companies/:id/metrics?range=7\|28\|90\|all`. Each KPI returns its value, the row count behind it and `synthetic` when any demo row is included; no data → `null` with reason, never 0. Tests with fixtures; compare against the Analytics screen numbers | Sonnet 5.5 [Opus 5.5] | medium | 4h |
| 3.4 | Server audit: port a first small set of the prototype's `audit(c)` rules (pick 5–6 that depend only on imported data and approved facts) to `server/audit.js`, reading only `metrics` and `approvedFacts`. Each recommendation carries `evidence` (metric names + values, fact ids) and `basis: 'data' \| 'facts' \| 'insufficient'`; `GET /api/companies/:id/audit` | Fable 5.2 [Opus 5.5] | high | 4h |
| 3.5 | Show server results in the UI: the Marketing Audit view marks each recommendation as evidence-backed or "not enough data" using the server audit; conclusions without support are labeled, synthetic data is badged (EN/AR) | Sonnet 5.5 | medium | 3h |
| 3.6 | Import honesty: after an import the UI reports rows accepted / skipped and why; re-importing the same file does not double-count; cap rows per kind with a visible message | Sonnet 5.5 | medium | 2h |
| 3.7 | Phase 3 exit check in a browser: importing real-shaped data changes metrics and audit recommendations; each recommendation shows its evidence; unsupported ones are labeled; second user gets 404 on data / metrics / audit. Tick Phase 3 in `PHASES.md`; write the Phase 4 queue | Sonnet 5.5 | medium | 1h |

## Next atomic task
**3.2** — see the table and `NEXT_AGENT_PROMPT.md`. **Done when:** `PUT .../state` mirrors `state.data` into a company-scoped `data_rows` table in the same transaction with per-kind validation; the PUT response reports rows stored and skipped per kind; `GET /api/companies/:id/data/summary` returns rows per kind and date range and 404s for non-members; tests cover validation, replace-not-append, isolation and cascade delete; `npm test` green.

## Last tests (actual results only)
- 2026-11-12 `npm test` → 54 pass, 0 fail (`health` 3, `db` 4, `auth` 8, `companies` 6, `state` 9, `ratelimit` 4, `knowledge` 10, `fetchUrl` 10).
- 2026-11-12 task 3.1: `npm test` → 54 pass, 0 fail (no new tests — the fix is in the frontend, which has no harness). Browser run before and after the fix; after it: no page errors, bad-row file gives "3 rows imported, 5 invalid rows skipped", Arabic Analytics renders.
- 2026-11-12 **Phase 2 exit check** (task 2.6; headless Chrome driven by `playwright-core` kept outside the repo; throwaway DB; real clicks):
  - Approved facts survive refresh — **pass**: after reload the Knowledge Hub shows "Approved 2" and the same two facts as before.
  - Evidence visible — **pass**: both approved cards show source "About page" and the evidence quote when "Source and evidence" is opened.
  - Unapproved claims cannot be used as facts — **pass** on the server read path: `GET .../facts` holds 2 approved / 1 rejected / 8 pending; `?status=approved` returns exactly the 2 approved, each with evidence, matching the screen.
  - Isolation — **pass**: user B (same browser) gets 404 on A's company, `/state` (GET and PUT), `/facts`, `/fetch-url` and DELETE; B sees one empty company; A signs back in and the data is intact. No page errors.
- Earlier Phase 2 runs (same day): 2.1 full UI flow; 2.3 downgrade toast + badge; 2.4 upload matrix of 16 files + 2 pastes in EN and AR; 2.5 website button with stubbed DNS (success via redirect, loopback, metadata address, redirect to loopback, PDF, 404) plus one real `https://example.com/` read with the production defaults.
- Not exercised: `.jpg` / `.webp` uploads, the 5 MB error path, offline retry, a headed or mobile-width browser, the Growth & Leads, Marketing Director and Campaign Studio screens.

## Blockers / external prerequisites
- None for Phase 3. Pushing to `origin/main` is refused (403) — push to `dev` only.
- Phase 4 will need an AI API key in `.env` (never commit).

## Files changed in latest task
- Edited: `public/index.html` (`realDate` check in `importData`), `IMPLEMENTATION_STATUS.md`, `NEXT_AGENT_PROMPT.md`.
