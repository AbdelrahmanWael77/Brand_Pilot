# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the Git checkout you are given (seen at `D:\Projects\Brand_Pilot` on 2026-11-12; older notes say `D:\brand-pilot-implemntion`; `D:\brand-pilot` is retired).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status`, `npm install` (a fresh checkout has no `node_modules`) and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 2 — Company intelligence. 2.1 (browser pass of the knowledge flow through the real UI) is done: every step (a)–(h) works with the server sync, no code was changed; three pre-existing prototype quirks are recorded as deferred in `IMPLEMENTATION_STATUS.md`.
- **Branch:** `feat/2.1-knowledge-ui-pass` holds the 2.1 commit (handoff files only); it is **not merged into `main` and not pushed**. Merge it into `main` (fast-forward) or branch from it, then create `feat/2.2-knowledge-mirror`. `origin` = https://github.com/AbdelrahmanWael77/Brand_Pilot.git; push only when the owner allows.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL; very long lines — use `grep -n -o 'pattern.\{0,200\}'`, never read it whole).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000; `PORT=3100` if 3000 is busy; `BRANDPILOT_DB=<file>` for a throwaway database), `npm test`.
- **Last verified:** `npm test` 34/34; 2.1 UI pass in headless Chrome on a throwaway DB.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (2.2):** server knowledge mirror. In `server/db.js` add tables `sources` and `facts`, both keyed by company id (cascade on company delete). In the `PUT /api/companies/:id/state` handler in `server/companies.js`, after saving the blob and in the **same transaction**, delete and re-insert that company's rows from `state.sources` (`{ id, title, kind, text, demo, date }`) and `state.findings` (`{ id, cat, text, type, status: pending|approved|rejected, src, ev, needs, date }`); skip or reject items of the wrong shape (ids and text must be strings, status one of the three values) without failing the whole save. Add `GET /api/companies/:id/facts?status=approved` behind `requireCompany`, and export `approvedFacts(db, companyId)` — the only read path later phases may use for "facts". Use `req.company.id` only, never an id from the body. Do **not** enforce the evidence rule yet (that is 2.3) and do not change the frontend.
- **Success condition:** new tests in `test/` show: a PUT with two approved, one rejected and one pending finding makes `GET .../facts?status=approved` return exactly the two approved; a second PUT replaces (not appends) rows; malformed findings do not crash the save; another user gets 404; deleting the company removes its rows. `npm test` green.
- **Recommended agent:** Fable 5.2 (fallback Opus 5.5) · reasoning: high · dev effort: ~4h.
- **After it:** 2.3 (evidence invariant on the server) — Fable 5.2, high, ~3h. Full queue is in `IMPLEMENTATION_STATUS.md`.
- **If you need a browser and have no browser tool:** installing `playwright-core` in a temp folder outside the repo and launching the installed Chrome (`chromium.launch({ channel: 'chrome' })`) worked for 2.1. Do not add it to `package.json`.
