# BrandPilot Repository Instructions (Claude Code)

This repository implements BrandPilot, a local-first multi-brand bilingual campaign-production application.

**Read in order:** `docs/superpowers/specs/2026-11-11-brandpilot-system-design-DRAFT.md` (or latest approved replacement), `docs/adr/`, `docs/requirements/TRACEABILITY.md`, `docs/process/CHANGE_IMPACT_PROTOCOL.md`, and the current approved `docs/superpowers/plans/` phase plan. `DRAFT` means **no coding approval**.

- Activate installed Superpowers skills relevant to the task. Before implementation require approved design then `writing-plans`, `using-git-worktrees`, TDD, implementation/review and verification. Never claim skill invocation if unavailable.
- Respect the approved brand/brief fact registry. Do not invent marketing claims or expand FlowNest features or its 14-day free trial.
- TypeScript/React/Vite frontend, lightweight Node API, SQLite and deterministic editable HTML/CSS/SVG templates. Multi-brand by design, optional model provider only.
- Assets must have provenance (`brandVersion`, `briefVersion`, fact/slot dependencies), locale, editing and review state. Updates must not silently preserve stale offer/CTA.
- For factual/source-of-truth changes, version first, compute impacts, preserve unrelated edits, flag manual conflicts, revalidate and invalidate affected approvals.
- English is LTR; Arabic is RTL with real natural-localization human-review gate. Test mixed-script and accessible responsive behavior.
- Unit, integration, Playwright and export tests must use real commands. Report `NOT RUN` when they are not run, with reasons. Use synthetic data only.
- Phase work ends with diff, tests, review notes, gate decision and updated shared memory snapshot. Never merge/push/publish without required approval.

**Status at creation:** planning artifacts only. See the draft spec and decision log for proposed choices not yet approved.
