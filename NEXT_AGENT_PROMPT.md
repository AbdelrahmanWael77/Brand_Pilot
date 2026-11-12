# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the Git checkout you are given (seen at `D:\Projects\Brand_Pilot` on 2026-11-12; older notes say `D:\brand-pilot-implemntion`; `D:\brand-pilot` is retired).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status`, `npm install` (a fresh checkout has no `node_modules`) and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 2 — Company intelligence. Done: 2.1 (real-UI browser pass), 2.2 (server knowledge mirror), 2.3 (evidence invariant + synthetic flag), 2.4 (file ingestion honesty), 2.5 (website source via the server). Left: 2.6 (exit check).
- **Branch:** `main` holds everything through 2.4 locally (2.1–2.4 are not pushed). `feat/2.5-fetch-url` holds the 2.5 commit, **not merged, not pushed**. Fast-forward `main` to it, then create `feat/2.6-phase2-exit`. `origin` = https://github.com/AbdelrahmanWael77/Brand_Pilot.git; push only when the owner allows.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Only dependency: `express`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL; very long lines — use `grep -n -o 'pattern.\{0,200\}'`, never read it whole). Patch files with exact-string edits; shell heredocs mangle the regex backslashes in this file.
- **Run / test:** `npm install`, `npm start` (http://localhost:3000; `PORT=3100` if 3000 is busy; `BRANDPILOT_DB=<file>` for a throwaway database), `npm test`.
- **Last verified:** `npm test` 54/54; browser run of the "Try to read the website" button (success, blocked, wrong type, 404; EN + AR).
- **Server API today (all company routes behind `requireCompany`, 404 for non-members):** `GET/PUT /api/companies/:id/state` (PUT answers `knowledge: { sources, facts, skipped, downgraded }`); `GET /api/companies/:id/facts[?status=pending|approved|rejected]` (rows carry `srcTitle`, `ev`, `synthetic`); `POST /api/companies/:id/fetch-url` `{ url }` → `{ url, title, text }`; `approvedFacts(db, companyId)` in `server/knowledge.js` is the only facts read path for later phases.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (2.6):** Phase 2 exit check, no new features. Start the app with a throwaway `BRANDPILOT_DB`. In a real browser as user A: add a text source, run discovery, approve two findings, reject one, publish, reload — confirm the approved facts and their evidence are still shown. From the same session call `GET /api/companies/<id>/facts?status=approved` and confirm it returns exactly the approved ones (none pending or rejected). Sign out, register user B in the same browser, and confirm B gets 404 on A's `/state`, `/facts` and `/fetch-url` and sees only B's own empty company. If all pass: tick Phase 2 in `PHASES.md`, and write the Phase 3 task queue in `IMPLEMENTATION_STATUS.md` (read the Phase 3 entry in `PHASES.md`; small tasks, each with Agent / Reasoning / Dev effort; Phase 3 server code must read facts only through `approvedFacts`). If something fails: fix it only if it is a small Phase 2 bug, otherwise record it and leave Phase 2 unticked.
- **Success condition:** each exit criterion recorded as passed or failed with one line of evidence; `npm test` green; `PHASES.md` and both handoff files updated; next task is the first Phase 3 task.
- **Recommended agent:** Sonnet 5.5 · reasoning: medium · dev effort: ~1h.
- **After it:** Phase 3 (import data → audit), queue to be written by 2.6.
- **If you need a browser and have no browser tool:** installing `playwright-core` in a temp folder outside the repo and launching the installed Chrome (`chromium.launch({ channel: 'chrome' })`) worked for 2.1–2.5. To exercise fetch-url without the internet, start the app from a small launcher that passes `createApp({ db, fetchUrl: createFetchUrl({ lookup, request }) })` with a stubbed `lookup`. Do not add test tools to `package.json`.
