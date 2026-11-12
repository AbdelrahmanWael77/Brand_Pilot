# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the Git checkout you are given (seen at `D:\Projects\Brand_Pilot` on 2026-11-12; older notes say `D:\brand-pilot-implemntion`; `D:\brand-pilot` is retired).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status`, `npm install` (a fresh checkout has no `node_modules`) and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 2 — Company intelligence. Done: 2.1 (real-UI browser pass), 2.2 (server knowledge mirror), 2.3 (evidence invariant + synthetic flag).
- **Branch:** `main` holds everything through 2.2 locally (2.1 and 2.2 are not pushed). `feat/2.3-evidence-invariant` holds the 2.3 commit, **not merged, not pushed**. Fast-forward `main` to it, then create `feat/2.4-file-ingestion`. `origin` = https://github.com/AbdelrahmanWael77/Brand_Pilot.git; push only when the owner allows.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL; very long lines — use `grep -n -o 'pattern.\{0,200\}'`, never read it whole). Files use CRLF line endings — patch with exact-string edits.
- **Run / test:** `npm install`, `npm start` (http://localhost:3000; `PORT=3100` if 3000 is busy; `BRANDPILOT_DB=<file>` for a throwaway database), `npm test`.
- **Last verified:** `npm test` 44/44; browser check of the downgrade path and a rerun of the full 2.1 flow on the 2.3 code.
- **Server knowledge API today:** `PUT /api/companies/:id/state` → `{ ok, updatedAt, knowledge: { sources, facts, skipped, downgraded: [ids] } }`; `GET /api/companies/:id/facts[?status=pending|approved|rejected]` → `{ facts: [{ id, cat, text, type, status, src, srcTitle, synthetic, ev, needs, date }] }`; `approvedFacts(db, companyId)` in `server/knowledge.js` is the only facts read path for later phases.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (2.4):** file ingestion honesty, frontend only. The upload control on the Company sources view (`data-c="files"`, handler `files(v,el)` in the `A` action map, helper `readFile`) accepts `.txt,.md,.html,.htm,.csv,.json,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.svg,.webp`. In a real browser upload one small file of each kind and record what happens. Then: (1) `.pdf/.docx/.pptx` (and any other unreadable type) must show a clear EN/AR message that the text was not read, and the source row must stay marked "registered — text not readable in browser", never "Readable"; (2) a text-like file that is empty, or binary content with a text extension, must not become a "Readable" source — show a message instead; (3) cap text per source (suggest 200 000 characters): truncate and say so in a toast and on the source row, or refuse — pick one and record it; apply the same cap to pasted text (`paste(fd)`). Do not add server parsing of PDF/Office files and do not start 2.5.
- **Success condition:** `IMPLEMENTATION_STATUS.md` lists each file type as works / fixed / deferred with one line of evidence from a browser run; messages exist in both languages; nothing unreadable is shown as readable; `npm test` green.
- **Recommended agent:** Sonnet 5.5 · reasoning: medium · dev effort: ~2h.
- **After it:** 2.5 (website source fetched by the server, with private-address blocking) — Fable 5.2, high, ~4h. Full queue is in `IMPLEMENTATION_STATUS.md`.
- **If you need a browser and have no browser tool:** installing `playwright-core` in a temp folder outside the repo and launching the installed Chrome (`chromium.launch({ channel: 'chrome' })`) worked for 2.1–2.3; `page.setInputFiles('input[data-c="files"]', path)` drives the upload control. Do not add it to `package.json`.
