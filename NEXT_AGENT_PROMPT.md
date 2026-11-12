# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot` on the owner's machine).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 1 — SaaS foundation; every build task (1.1–1.5c) is verified complete. Only the sign-off (1.6) remains.
- **Branch:** `feat/1.5c-rate-limit` (stacked 1.5c → 1.5b → 1.5a → 1.4 → 1.3 → 1.2 → 1.1; none merged into `main`). Branch from it, or ask the owner to merge first.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL; very long lines — use `grep -n -o` with context, never read it whole).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000; `PORT=3100` if 3000 is held by a stale process; `BRANDPILOT_DB=<path>` for a throwaway database), `npm test`.
- **Last verified:** `npm test` 34/34. Two-user browser scenario passed on the 1.5b code; not rerun after 1.5c.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (1.6):** Phase 1 exit sign-off — no new features. (1) Start the app with a throwaway `BRANDPILOT_DB` and rerun in a real browser: register A → rename the company and add a source → reload → data intact → sign out → register B in the same browser → B sees only its own empty company → sign in as A → data intact; also trigger the 429 message with 6 wrong passwords. Fix only what fails. (2) Tick Phase 1 in `PHASES.md`. (3) Replace the Phase 1 task queue in `IMPLEMENTATION_STATUS.md` with a Phase 2 queue of 5–7 atomic tasks, each with Agent / Reasoning / Dev effort, following the Phase 2 scope in `PHASES.md` (company details, manual source text/file ingestion, draft facts with source evidence, approve/reject, persistent approved knowledge). Before writing it, grep `public/index.html` for the existing `extract(`, `approveF(`, `publishK(` and `addSource(` functions: the prototype already has rule-based extraction and approval working on the synced company object, so Phase 2 is mostly about deciding what must move server-side (so later AI calls can only read approved facts) rather than rebuilding it. (4) Ask the owner to merge the stacked branches into `main`.
- **Success condition:** scenario results recorded honestly in the status file (say so if you cannot drive a browser); Phase 1 ticked; Phase 2 queue present with the three fields per task; `npm test` green.
- **Recommended agent:** Sonnet 5.5 (fallback Fable 5.2) · reasoning: medium · dev effort: ~1h. Prefer Fable 5.2 for writing the Phase 2 queue if available — it is a design decision.
- **After it:** first Phase 2 task from the new queue.
