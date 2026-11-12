# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot` on the owner's machine).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 1 — SaaS foundation; Phase 0 verified complete.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000), `npm test`.
- **Last verified:** app serves prototype + `GET /api/health`; `npm test` 3/3 pass.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (1.1):** create `server/db.js` — open a `node:sqlite` `DatabaseSync` (path from env `BRANDPILOT_DB`, default `data/brandpilot.db`; tests use `:memory:`), enable foreign keys, and create idempotently: `users(id, email UNIQUE, password_hash, created_at)`, `sessions(id, user_id, expires_at)`, `companies(id, name, created_by, created_at)`, `memberships(user_id, company_id, role, PRIMARY KEY(user_id, company_id))`. Export `openDb(path)`. Do not add routes yet.
- **Success condition:** new `test/db.test.js` passes — schema init runs twice without error; a user, company and membership round-trip; duplicate email is rejected. `npm test` all green.
- **Recommended agent:** Fable 5.2 (fallback Opus 5.5) · reasoning: medium · dev effort: ~2h.
- **After it:** task 1.2 (auth API) — Fable 5.2, high, ~4h. Full queue is in `IMPLEMENTATION_STATUS.md`.
