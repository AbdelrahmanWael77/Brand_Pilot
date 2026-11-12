# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot` on the owner's machine).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 1 — SaaS foundation; tasks 0 and 1.1 verified complete.
- **Branch:** `feat/1.1-db-layer` (from `main`, not merged). Keep working on a new branch from it, or ask the owner to merge first.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000), `npm test`.
- **Last verified:** `npm test` 7/7 pass. `server/db.js` exports `openDb(path)` / `initSchema(db)` with tables `users`, `sessions`, `companies`, `memberships`; it is not wired into `server/app.js` yet.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (1.2):** Auth API. Change `createApp()` to `createApp({ db } = {})` (default `openDb()`; tests pass `openDb(':memory:')`; `server/index.js` unchanged in behaviour). Add `server/auth.js` with: `POST /api/auth/register` and `/login` (JSON `email`, `password`; validate email shape and password length >= 8), `POST /api/auth/logout`, `GET /api/auth/me`, and an exported `requireAuth` middleware. Hash with `node:crypto` `scrypt` + random salt, compare with `timingSafeEqual`. Session = random 32-byte id stored in `sessions` with a 30-day expiry, sent as cookie `bp_session` (httpOnly, SameSite=Lax, `Secure` when `NODE_ENV=production`). Parse the cookie by hand; no new dependencies. IDs via `crypto.randomUUID()`. No company routes yet.
- **Success condition:** new `test/auth.test.js` passes — register then `me` returns `{id, email}`; wrong password 401 with the same message as unknown email; no cookie 401; logout makes `me` 401; duplicate email 409; `password_hash` never in any response. `npm test` all green.
- **Recommended agent:** Fable 5.2 (fallback Opus 5.5) · reasoning: high · dev effort: ~4h.
- **After it:** task 1.3 (company API + isolation) — Fable 5.2, high, ~4h. Full queue is in `IMPLEMENTATION_STATUS.md`.
