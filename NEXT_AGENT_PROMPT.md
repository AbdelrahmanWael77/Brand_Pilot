# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot` on the owner's machine).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 1 — SaaS foundation; tasks 0, 1.1–1.4, 1.5a and 1.5b verified complete. Sign-in, per-account companies and server persistence work end to end in the browser.
- **Branch:** `feat/1.5b-frontend-sync` (stacked 1.5b → 1.5a → 1.4 → 1.3 → 1.2 → 1.1; none merged into `main`). Branch from it, or ask the owner to merge first.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL; very long lines — use `grep -n -o` with context, never read it whole).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000; `PORT=3100` if 3000 is held by a stale process), `npm test`.
- **Last verified:** `npm test` 30/30; two-user isolation scenario checked in a browser (see status file).
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (1.5c):** rate-limit the auth endpoints in `server/auth.js`, no new dependencies. Add a small in-memory limiter (a `Map` of key → `{ count, resetAt }`) created inside `createAuth(db, { limits } = {})` so tests can pass small numbers. Login: key on `ip + '|' + email` — after 5 failed attempts within 15 minutes answer 429 `{ error: 'too_many_attempts' }` with a `Retry-After` header (seconds); count only failures and clear the key on a successful login; check the limit before running scrypt. Register: key on ip, 10 per hour, same 429. Use `req.ip`. Prune expired keys when touched, plus a cap (for example 10,000 keys, drop the oldest) so the map cannot grow without bound. Thread the option through `createApp({ db, authLimits })`. In `public/index.html` add `too_many_attempts` to the `AUTH_ERR` map (EN + AR: "Too many attempts. Try again in a few minutes."). Record in the status file that the limiter is per-process and resets on restart.
- **Success condition:** new tests in `test/auth.test.js` (own `createApp` with small limits) — the 6th bad login for one email is 429 with `Retry-After`; another email is still 401, not 429; a good login before the limit resets the count; register is limited too. All existing tests still pass unchanged (default limits must not trip them). `npm test` green.
- **Recommended agent:** Sonnet 5.5 (fallback Fable 5.2) · reasoning: medium · dev effort: ~1h.
- **After it:** 1.6 — Phase 1 exit sign-off: rerun the browser scenario from the status file once, tick Phase 1 in `PHASES.md`, and write the Phase 2 task queue (with Agent / Reasoning / Dev effort per task) into `IMPLEMENTATION_STATUS.md`. Sonnet 5.5, medium, ~1h. Ask the owner to merge the stacked branches into `main` at that point.
