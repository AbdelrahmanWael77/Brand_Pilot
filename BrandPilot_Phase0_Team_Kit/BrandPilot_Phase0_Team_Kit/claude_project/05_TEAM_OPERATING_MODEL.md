# BrandPilot — Team Operating Model

## Roles and authority

The following are **roles**, not a claim that independent AI agents are currently running. One person/agent may perform several roles, but independent review must be as independent as available capabilities permit.

| Role | Responsibility | Authority / approval |
|---|---|---|
| **Product Owner (human)** | Scope, business rules, factual claims, acceptance, stage gates | **Accountable final approver** for requirements, fact changes, and public-release decisions |
| **Delivery Lead / Integrator** | Phase board, dependency coordination, branch integration, status ledger | Coordinates; cannot override unsupported factual claims |
| **Architect / Backend Engineer** | Schema, API, persistence, change impact/version semantics | Proposes technical decisions; technical reviewer signs ADR |
| **Frontend / UX Engineer** | Brand/brief/editor UI, responsive preview, editable exports | Tests usability/accessibility; design signoff review |
| **Brand Strategist + Copywriter** | Positioning, value props, channel copy, tone | Must use approved claims; proposes wording only |
| **Arabic Localization Specialist** | Egyptian-market wording, RTL, bidi and font review | Cultural review is human when available; do not assert machine proof |
| **QA / Security / Accessibility Reviewer** | Negative tests, claim/offer audits, E2E, contrast, privacy, export completeness | Can block phase gate with concrete evidence |
| **Release / Documentation Owner** | Export manifest, demo, setup docs, limitations | Confirms package evidence; not unilateral legal clearance |

## Branch and handoff policy

- Main branch protected by review where hosting supports it. Use `feat/pN-short-task`, `fix/pN-issue`, or a native isolated workspace/worktree.
- PRs include goal, requirements IDs, changed files, tests (commands + actual output), screenshots/previews where relevant, localization/QA checks, and unresolved limits.
- Keep migrations reversible where feasible, and do not rewrite recorded published versions.
- Each phase ends with one signed gate record and updated shared memory. Team members should not rely on another person's private Claude chat.
- Parallelize only independent tasks with stable interfaces (e.g., EN/AR copy review after schema fixed); serialization is preferred for schema → template → impact-engine dependencies.

## Decision escalation

1. **Approved fact / prohibited claim conflict:** stop factual publication/export; Product Owner decides.
2. **Architecture ambiguity:** Architect proposes ADR with options; technical approver rules.
3. **UX/localization subjective question:** specialist marks human review; no fake proof.
4. **Test failure or suspicious behavior:** use Superpowers systematic debugging; root-cause evidence before patch.
5. **Missing tool / no external provider:** mark unsupported and use deterministic implementation; never fabricate a result.

## Communication standard

Each handoff contains: `phase`, `task`, `branch/commit`, `inputs`, `acceptance IDs`, `decisions`, `files`, `test command + exact result`, `QA risks`, `blocked/ready`, and `next owner`.

Daily/phase check-ins can be summarized from Git and gate logs; automated memory is not authoritative.
