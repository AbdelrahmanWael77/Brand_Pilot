# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot` on the owner's machine).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 1 — SaaS foundation; tasks 0, 1.1 and 1.2 verified complete.
- **Branch:** `feat/1.2-auth-api` (stacked on `feat/1.1-db-layer`; neither merged into `main`). Branch from it for the next task, or ask the owner to merge first.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000), `npm test`.
- **Last verified:** `npm test` 15/15 pass. Auth API works over real HTTP in tests: register, login, logout, `me`, cookie `bp_session`.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (1.3):** Company API. Create `server/companies.js` exporting `createCompanies(db)` → `{ router, requireCompany }`, same style as `server/auth.js`. Mount in `server/app.js` as `app.use('/api/companies', auth.requireAuth, companies.router)`. Routes: `POST /` (JSON `name`, trimmed, 1–120 chars; insert `companies` row with `crypto.randomUUID()` and an `owner` row in `memberships` inside one `BEGIN`/`COMMIT`; 201 `{ company: { id, name, role } }`), `GET /` (`{ companies: [...] }`, only rows joined through the caller's memberships), `GET /:id` (through `requireCompany`). `requireCompany` looks up membership for `req.user.id` + `req.params.id`, sets `req.company = { id, name, role }`, otherwise 404 `{ error: 'not_found' }` — never 403, so ids cannot be probed. Every later company-scoped route must go through it. No state/blob routes yet (that is 1.4).
- **Success condition:** new `test/companies.test.js` passes, using `createApp({ db: openDb(':memory:') })` and two registered users — A creates and lists its company; B's list is empty; B gets 404 on A's id; no cookie gives 401; blank or over-long name gives 400. `npm test` all green.
- **Recommended agent:** Fable 5.2 (fallback Opus 5.5) · reasoning: high · dev effort: ~4h.
- **After it:** task 1.4 (company state blob API) — Sonnet 5.5, medium, ~2h. Full queue is in `IMPLEMENTATION_STATUS.md`.
