# BrandPilot — Phased Delivery Roadmap

**Status:** proposed sequence for human approval. This is a milestone roadmap, **not** an approved line-by-line Superpowers implementation plan. Each phase starts with an approved design/spec slice and then gets its own `docs/superpowers/plans/YYYY-MM-DD-<phase>.md` using `writing-plans`.

## Dependency map

```text
0 Alignment / spec approval
  → 1 Domain + persistence
    → 2 Templates + single-asset vertical slice
      → 3 Full FlowNest bilingual copy/creative
        → 4 Editor + previews + responsive form
          → 5 Change Impact Engine + revisions (critical)
            → 6 QA + review workflow
              → 7 Editable exports + manifest
                → 8 Full tests + second brand
                  → 9 End-to-end revision + surprise challenge
```

**Continuous discipline:** RED/GREEN test cycles, accessibility considerations, code review, and traceability in *every* implementation phase; Phase 8 is the complete verification pass, not the first time tests appear. The change/version data model is designed in Phase 1 and exercised early in Phase 2 to avoid bolting on the most important feature too late.

| Phase | Purpose | Demonstrable gate |
|---|---|---|
| **0: Team & design alignment** | Charter, source-of-truth, architecture/spec, roles, acceptance matrix | Human approves design; no code before gate |
| **1: Domain & persistence** | Brand/brief/claim models, API, SQLite history, basic editor inputs | Two brands can be created/updated; invalid data rejected; persisted reload |
| **2: Template contracts + vertical slice** | Structured asset slots/dependencies, editable SVG/HTML renderer; 1 EN post/landing/email end-to-end | Generate → edit → persist → render without FlowNest hardcoding |
| **3: FlowNest campaign** | Human-authored approved EN/AR copy & all social, email, landing, guide content | 5 channel assets + guide per language, no invented facts |
| **4: Product UI and localization** | Brand/brief UI, previews, editable assets, RTL, responsive layout, local form | End-user can use it without touching JSON; EN/AR RTL and form checked |
| **5: Change Impact Engine** | Dependency graph, diffs, partial regeneration, conflicts, history, reapproval | Offer/CTA/audience/tone/palette/prohibited-term changes handled; no stale silent text |
| **6: QA + review** | Severity-based validations, claim support, contrast, links, legal, accessibility, human review | Explainable asset-specific findings, explicit pending-human-review states |
| **7: Export pipeline** | SVG, HTML, email HTML, guide, JSON manifest, current-version guardrail | Complete editable current package; stale export blocked or acknowledged per policy |
| **8: Exhaustive verification** | Vitest/Playwright, second brand, malformed briefs, mobile/RTL, regression matrix | Actual recorded command outputs; second brand proves reuse |
| **9: Demo + surprise-change drill** | Real end-to-end walkthrough, documented initial revision, user-provided surprise at later time | Old/new diffs, approvals, QA results, history and fresh export, with limitations |

## Phase gate definition

Each phase has: approved inputs → exact feature/test plan → executed RED/GREEN TDD → artifacts/diffs → code review → actual test output → QA/UX/localization review as relevant → owner's gate decision → memory + decision log update. Do not claim completion on green unit tests alone.

## Key gates that can stop the line

- Approved facts missing / ambiguous claim authorization.
- Schema loses provenance or cannot trace dependencies of content fragments.
- RTL appears correct visually but fails semantic direction or mixed-text cases.
- A manual override prevents safe regeneration and the conflict is not surfaced.
- Export contains an earlier offer, stale brand palette, or unacknowledged required disclaimer.
- Human review missing for legal and cultural appropriateness.

## Detailed phase handoff cards

Use `10_PHASE_START_AND_HANDOFF_PROMPTS.md` for kickoff and the `phase_runbooks/` folder (distributed in the ZIP; optional upload) for acceptance checklists. Task-level plans must still be written and approved later per phase.
