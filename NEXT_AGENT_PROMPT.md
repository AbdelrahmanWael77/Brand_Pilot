# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot` on the owner's machine).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 1 — SaaS foundation; tasks 0 and 1.1–1.4 verified complete. The Phase 1 backend is done; the frontend still runs purely on `localStorage`.
- **Branch:** `feat/1.4-company-state` (stacked 1.4 → 1.3 → 1.2 → 1.1; none merged into `main`). Branch from it, or ask the owner to merge first.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000), `npm test`.
- **Last verified:** `npm test` 28/28 pass. API: `/api/auth/{register,login,logout,me}`, `/api/companies`, `/api/companies/:id`, `/api/companies/:id/state` (GET/PUT `{ state }`).
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (1.5a):** Frontend auth gate in `public/index.html` only — no server changes, no data sync yet (that is 1.5b). The file has ~960 very long lines: locate code with `grep -n -o '.{100}pattern.{200}'`, never read it whole. Facts: global `S` holds all state; `L(en, ar)` picks the language (needs `S`); `boot()` is the last function and is called once at the bottom; `render()` draws the app; `toast(msg, 'err')` shows errors; events are delegated through `data-a` / `data-s` attributes into the `A` action map. Do this: (1) replace the bottom `boot();` call with an async start that calls `GET /api/auth/me` — on 200 keep the user in a module variable and call `boot()`; on 401 render a login/register card instead of the app. (2) The card: email, password, submit, a toggle between sign in and create account, and an EN/AR switch; reuse existing CSS classes/variables from the file; set `dir="rtl"` for Arabic. It posts JSON to `/api/auth/login` or `/register`; on success call `boot()`; on 400/401/409 show a translated message per error code (`invalid_email`, `invalid_password`, `invalid_credentials`, `email_taken`). Language choice before login can live in `localStorage` under its own small key. (3) Add a logout control showing the user's email in the existing top bar or sidebar footer → `POST /api/auth/logout`, then reload. Do not redesign anything else.
- **Success condition:** verify in a real browser against `npm start`: fresh visit shows the card (EN and AR/RTL); register enters the app; reload stays in; logout returns to the card; wrong password shows the error; no console errors. `npm test` still 28/28. If you cannot drive a browser, say so in the status file instead of claiming it.
- **Recommended agent:** Fable 5.2 (fallback Opus 5.5) · reasoning: high · dev effort: ~4h.
- **After it:** 1.5b (load/save companies through the API) — Fable 5.2, high, ~1d. Full queue is in `IMPLEMENTATION_STATUS.md`.
