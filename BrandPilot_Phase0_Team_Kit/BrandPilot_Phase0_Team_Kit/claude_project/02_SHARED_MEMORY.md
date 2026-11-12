# BrandPilot — Shared Team Memory Ledger

**Purpose:** explicit shared project memory; update by file edits at phase boundaries, then re-upload to Claude Project knowledge. **Not** Claude's private memory.  
**Last reviewed:** 2026-11-11  
**Current phase:** 0 — planning and design alignment  
**Overall status:** proposed; no product implementation or test execution verified  
**Next human decision:** approve/edit Phase 0 design and architecture; name accountable sign-off roles.

## Immutable project intent (until formally changed)

BrandPilot is a local-first multi-brand campaign-production application with shared brand and brief facts, editable bilingual EN/AR assets, deterministic change impact, QA/review, version history, and coherent exports. The most important behavior is propagation of a campaign change without silent stale messaging.

## Decisions actually approved by human

- The user explicitly requested **a phased plan before implementation**, shared Claude instructions/knowledge files, team workflow, and Superpowers at each phase.
- The user required React + TypeScript + Vite, a lightweight Node backend, simple persistence, HTML/CSS/SVG, Vitest, and optional Playwright. SQLite is preferred, but an approved equivalent is allowed.
- FlowNest approved facts and restrictions appear in `08_FLOWNEST_SOURCE_OF_TRUTH.md`.

## Proposals pending human approval — do not treat as fact

- npm workspaces monorepo: `apps/web`, `apps/api`, `packages/domain`, `packages/templates`, `packages/qa`.
- Express + SQLite with migrations; structured claims registry; deterministic templates; optional model provider adapter.
- Nine delivery phases after Phase 0 with a vertical slice early, impact engine in Phase 5, final surprise reserved for last.
- One accountable product owner, one technical integrator, rotating specialist reviewers, and independent QA reviewer.

## Existing artifacts and evidence

- Phase 0 coordination kit: drafted files only.
- Source application: NOT CREATED.
- Installed local dependencies, repo, automated tests, browser tests, campaign previews, exports: NOT RUN / NOT VERIFIED.
- Superpowers availability in user's Claude environment: UNKNOWN (must check in Claude Code).

## Key invariants for all future phases

1. Approved fact registry controls factual claims, trial duration (14 days), features and CTAs; copy can't add claims.
2. Every asset has an identified brand/brief version, language, dependencies, edit ownership and review state.
3. Changing an approved structured value triggers a version + impact set + update or explicit unresolved conflict + revalidation + changed-asset re-review.
4. Unrelated manual edits should remain intact.
5. Arabic `dir="rtl"`, English `dir="ltr"`; mixed-direction fragments explicitly isolated.
6. An export must include provenance and warn/block for stale content or unresolved severe QA findings.
7. Human reviews are not interchangeable with algorithmic checks.

## Gate ledger (append, don't rewrite historical entries)

| Phase | Approval | Reviewer | Evidence | Date |
|---|---|---|---|---|
| 0 — Design | PENDING | Unassigned | `repo/docs/superpowers/specs/...-DRAFT.md` | — |
| 1–9 | NOT STARTED | Unassigned | — | — |

## Session resume checklist

1. Check latest Git main commit/branch and existing PRs (if connected).
2. Read current approved spec, phase plan, latest decision log, and current gate outcome.
3. Read this ledger and compare its last-updated date to Git; if stale, refresh rather than rely on it.
4. Declare the assigned phase and next smallest testable task; use Superpowers.
5. Record verified outputs before updating this ledger.

### Memory update entry template

`YYYY-MM-DD | phase | decision/change | approver | evidence path/commit | affected artifacts | next action`
