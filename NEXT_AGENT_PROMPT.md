# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot` on the owner's machine).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 1 — SaaS foundation; tasks 0, 1.1, 1.2 and 1.3 verified complete.
- **Branch:** `feat/1.3-company-api` (stacked on `feat/1.2-auth-api` → `feat/1.1-db-layer`; none merged into `main`). Branch from it for the next task, or ask the owner to merge first.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000), `npm test`.
- **Last verified:** `npm test` 21/21 pass. Auth and company APIs work over real HTTP in tests; user B gets 404 on user A's company.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (1.4):** Company state API — server-side home for the prototype's per-company data until later phases normalise it. (1) In `server/db.js` add to `SCHEMA`: `company_state(company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at TEXT NOT NULL)`, and update the table-list assertion in `test/db.test.js`. (2) In `server/companies.js` add `GET /:id/state` → `{ state: <object or null>, updatedAt }` and `PUT /:id/state` with body `{ state: {...} }` → upsert (`INSERT ... ON CONFLICT(company_id) DO UPDATE`), both behind `requireCompany` and keyed by `req.company.id` only. Reject non-plain-object `state` with 400. Size: the global `express.json` limit is 1 MB — mount a route-level `express.json({ limit: '5mb' })` for this PUT before the global parser applies (or raise the limit only for this path), and make the error handler in `server/app.js` return 413 `{ error: 'too_large' }` for `err.type === 'entity.too.large'`. Do not touch `public/index.html` (that is 1.5).
- **Success condition:** new `test/state.test.js` passes — GET before PUT gives `state: null`; PUT then GET round-trips nested JSON incl. Arabic text; user B gets 404 on GET and PUT of A's company and A's data is unchanged afterwards; array/string/null `state` gives 400; oversize body gives 413. `npm test` all green.
- **Recommended agent:** Sonnet 5.5 (fallback Fable 5.2) · reasoning: medium · dev effort: ~2h.
- **After it:** task 1.5 (login screen + swap `localStorage` for the API in `public/index.html`) — Fable 5.2, high, ~1d; split it into smaller commits. Full queue is in `IMPLEMENTATION_STATUS.md`.
