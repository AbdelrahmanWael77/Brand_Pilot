# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / Codex / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the project, or overwrite work.** Work in the shared repository (`D:\brand-pilot-implemntion` on the owner's machine; the old `D:\brand-pilot` folder is retired).

1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` at the repo root; read `PHASES.md` only if needed.
2. Run `git status` and `npm test` first. Trust code and test results, not the previous agent's claims.
3. Do **exactly one** task: the one under **Next atomic task** in `IMPLEMENTATION_STATUS.md`. No later-phase extras.
4. Run the smallest relevant test. Before a risky edit, and again when done, update `IMPLEMENTATION_STATUS.md` and **rewrite this whole file** with current details. Commit the verified task. Reply in at most 6 lines: changed / tested / blocker / next.

## Latest handoff snapshot — 2026-11-12
- **Phase:** 2 — Company intelligence, not started. Phases 0 and 1 are verified and signed off (sign-in, per-account companies, server persistence, isolation, rate limiting).
- **Branch:** `feat/1.6-phase1-signoff` is docs-only commits ahead of `main`. Ask the owner to merge it, then create `feat/2.1-knowledge-ui-pass` from `main` (or branch from the sign-off branch if they have not answered). No remote configured; nothing pushed.
- **Stack:** Node >=22.5 ESM, Express 5, built-in `node:sqlite`, `node:test`. Frontend = single-file vanilla JS at `public/index.html` (patch in place, keep EN/AR RTL; very long lines — use `grep -n -o 'pattern.\{0,200\}'`, never read it whole).
- **Run / test:** `npm install`, `npm start` (http://localhost:3000; `PORT=3100` if 3000 is held by a stale process; `BRANDPILOT_DB=<file>` for a throwaway database), `npm test`.
- **Last verified:** `npm test` 34/34; Phase 1 exit scenario passed in a browser on the final code.
- **WIP / uncommitted:** none.
- **Blockers:** none.
- **Next exact task (2.1):** browser pass of the knowledge flow through the **real UI** (click the actual controls; earlier checks drove app functions from the console). Start the app with a throwaway `BRANDPILOT_DB`, register a test account, then on the onboarding / sources / knowledge views: (a) edit company name, industry, website, objective; (b) add a pasted text source; (c) upload a small `.txt` file; (d) run discovery/extraction; (e) approve two findings and reject one, check the evidence quote and source are visible on each; (f) publish the knowledge version; (g) reload and confirm all of it is still there; (h) switch to Arabic and confirm the same views render RTL. For anything broken, decide: caused by the server sync (fix now, smallest patch) or pre-existing prototype behaviour (record and defer). Useful anchors in `public/index.html`: `addSource(`, `extract(`, `approveF(`, `publishK(`, the `A` action map (`data-a="…"` on buttons), and the `Server sync` block at the end. Do not start the server-side facts mirror — that is 2.2.
- **Success condition:** `IMPLEMENTATION_STATUS.md` lists each of (a)–(h) as works / fixed / deferred with one line of evidence; any fix has a test where a test is practical; `npm test` green. If you cannot drive a browser, say so and stop rather than guessing.
- **Recommended agent:** Sonnet 5.5 (fallback Fable 5.2) · reasoning: medium · dev effort: ~2h.
- **After it:** 2.2 (server-side `sources` + `facts` mirror and the approved-facts read path) — Fable 5.2, high, ~4h. Full queue is in `IMPLEMENTATION_STATUS.md`.
