# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot` on the owner's machine).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 1 — SaaS foundation; tasks 0, 1.1–1.4 and 1.5a verified complete. Sign-in works end to end; company data still lives only in `localStorage`.
- **Branch:** `feat/1.5a-auth-gate` (stacked 1.5a → 1.4 → 1.3 → 1.2 → 1.1; none merged into `main`). Branch from it, or ask the owner to merge first.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000; `PORT=3100` if 3000 is held by a stale process), `npm test`.
- **Last verified:** `npm test` 28/28; auth gate checked in a browser (see status file).
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (1.5b):** make the server the source of truth for companies, in `public/index.html` only (no server changes expected). The file has very long lines: locate code with `grep -n -o 'pattern.\{0,200\}'`, never read it whole. Facts: global `S = { v:1, lang, active, companies:{id→obj}, ui, ai }`; `C()` = `S.companies[S.active]`; `save()` writes all of `S` to `localStorage['brandpilot.v1']`; `boot()` loads it or calls `seed()` (synthetic demo companies) and registers the delegated listeners; `newCompany(o)` builds a company object with a local `uid('c')` id; actions live in the `A` map (`newCo`, `setCo`, `lang`, `logout`…); `R()` re-renders; `startApp()` (end of script) runs after sign-in with `USER` set. Do it in three commits, updating the handoff files after each:
  1. **Load:** make `startApp()` async — fetch `GET /api/companies`, then each `GET /api/companies/:id/state`; build `S.companies` keyed by the **server** id (state object with `id` and `name` overwritten from the server row); keep only `lang`, `ui`, `ai`, `active` from `localStorage`. If the account has no companies, show the existing empty/onboarding path with a "create your first company" form instead of `seed()`; keep demo data available only behind an explicit, clearly labeled "Load demo data" action.
  2. **Save:** change `save()` to keep the small prefs in `localStorage` and debounce (about 800 ms) a `PUT /api/companies/:id/state` for each company changed since the last save (simplest: compare `JSON.stringify` per company against the last sent copy). Make `newCo` (and any other place that calls `newCompany`) `POST /api/companies` first and use the returned id. On a 401 from any call, reload to show the sign-in card; on other failures show `toast(..., 'err')` and retry on the next save. Flush pending saves on `visibilitychange`/`pagehide` with `fetch(..., { keepalive: true })`.
  3. **Isolation check + cleanup:** on sign-out and on sign-in as a different user, drop any cached company data; run the browser scenario below.
- **Success condition:** in a real browser: A registers, creates a company, adds a source or edits details, reloads → still there; A signs out; B registers in the same browser → sees no companies of A; A signs in again → data intact; Arabic/RTL still works; no JS console errors. `npm test` still green. If you cannot drive a browser, say so in the status file instead of claiming it.
- **Recommended agent:** Fable 5.2 (fallback Opus 5.5) · reasoning: high · dev effort: ~1d (three commits of ~2–3h each).
- **After it:** 1.5c (login rate limiting) — Sonnet 5.5, medium, ~1h; then 1.6 (Phase 1 exit check). Full queue is in `IMPLEMENTATION_STATUS.md`.
