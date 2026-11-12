# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the Git checkout you are given (seen at `D:\Projects\Brand_Pilot` on 2026-11-12; older notes say `D:\brand-pilot-implemntion`; `D:\brand-pilot` is retired).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status`, `npm install` (a fresh checkout has no `node_modules`) and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 2 — Company intelligence. 2.1 (real-UI browser pass) and 2.2 (server knowledge mirror) are done.
- **Branch:** `main` holds everything through 2.1 locally (2.1 is not pushed). `feat/2.2-knowledge-mirror` holds the 2.2 commit, **not merged, not pushed**. Fast-forward `main` to it, then create `feat/2.3-evidence-invariant`. `origin` = https://github.com/AbdelrahmanWael77/Brand_Pilot.git; push only when the owner allows.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL; very long lines — use `grep -n -o 'pattern.\{0,200\}'`, never read it whole). Source files use CRLF line endings — patch with exact-string edits, not multi-line scripts that assume `\n`.
- **Run / test:** `npm install`, `npm start` (http://localhost:3000; `PORT=3100` if 3000 is busy; `BRANDPILOT_DB=<file>` for a throwaway database), `npm test`.
- **Last verified:** `npm test` 42/42; the 2.1 UI flow rerun against the 2.2 server returned exactly the 2 approved facts from `GET .../facts?status=approved`.
- **What 2.2 added:** `server/knowledge.js` (`createKnowledge(db)` → `mirror(companyId, state)`, `listFacts`, `approvedFacts`; plus exported `approvedFacts(db, companyId)`); tables `sources` and `facts` in `server/db.js`; in `server/companies.js` the `PUT /:id/state` handler now runs blob + rename + mirror in one transaction and returns `knowledge: { sources, facts, skipped }`, and `GET /:id/facts[?status=]` lists mirrored findings. Tests: `test/knowledge.test.js`.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (2.3):** evidence invariant on the server. In `cleanFact` / `mirror` in `server/knowledge.js`: a finding is stored as `approved` only when `ev` is non-empty after trimming **or** `type === 'user'` (manually entered, labeled "entered manually"); any other `approved` finding is stored as `pending` and its id is returned in the PUT response (for example `knowledge.downgraded: [ids]`). Add a `synthetic` flag to facts whose `src` points to a source with `demo: true` (compute it in the `listFacts` join or store a column) and return it from `GET .../facts`. In `public/index.html`, after the state PUT in the `Server sync` block, if `downgraded` is non-empty set those findings back to `pending` locally, re-render, and show a toast in EN/AR saying they need evidence. Do not change the extractor or start 2.4.
- **Success condition:** tests show: approved + evidence stays approved; approved + empty or whitespace evidence comes back pending and is listed in the response; `type: 'user'` with any evidence stays approved; a fact from a demo source has `synthetic: true` and others `false`; `approvedFacts` never returns a downgraded item. One browser check that the toast appears and the finding returns to "Awaiting review". `npm test` green.
- **Recommended agent:** Fable 5.2 (fallback Opus 5.5) · reasoning: high · dev effort: ~3h.
- **After it:** 2.4 (file ingestion honesty) — Sonnet 5.5, medium, ~2h. Full queue is in `IMPLEMENTATION_STATUS.md`.
- **If you need a browser and have no browser tool:** installing `playwright-core` in a temp folder outside the repo and launching the installed Chrome (`chromium.launch({ channel: 'chrome' })`) worked for 2.1 and 2.2. Do not add it to `package.json`.
