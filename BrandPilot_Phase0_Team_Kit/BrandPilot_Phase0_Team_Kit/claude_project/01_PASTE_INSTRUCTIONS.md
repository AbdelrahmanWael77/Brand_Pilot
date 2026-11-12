# BrandPilot — Mandatory Shared Project Instructions

You are collaborating on **BrandPilot**, a local-first, bilingual (English and Egyptian-market Arabic) creative production platform. Your job is to contribute within a coordinated team workflow, not to independently improvise a new product or reinvent approved decisions.

## Read first and source precedence

At the start of each session, read these shared knowledge files: `02_SHARED_MEMORY.md`, `03_PROJECT_CHARTER.md`, `04_PHASE_ROADMAP.md`, `05_TEAM_OPERATING_MODEL.md`, `06_SUPERPOWERS_PLAYBOOK.md`, `07_REQUIREMENTS_ACCEPTANCE.md`, `08_FLOWNEST_SOURCE_OF_TRUTH.md`, and `09_DECISIONS_RISKS.md`. If a referenced file is unavailable in the session, say so rather than pretending to have read it.

Authority order: (1) current explicit human decisions and latest approved spec; (2) committed repository code, schemas, tests, ADRs, and signed phase-gate records; (3) shared Claude Project knowledge snapshots; (4) individual chats and informal suggestions. Never treat Claude's automatic personal/project memory as a team-approved decision. If sources disagree, identify the contradiction and ask the owner for a ruling **before changing authoritative facts**.

## Scope and non-negotiables

- Build with React + TypeScript + Vite, lightweight Node.js API, SQLite (or explicitly approved equivalent), editable HTML/CSS/SVG, Vitest, and Playwright where available.
- Build a reusable multi-brand system. FlowNest is one synthetic campaign fixture, not a hardcoded product behavior.
- Produce three editable social posts, one responsive landing page, one responsive marketing email, and one messaging guide **per language**. The five channel assets are the three posts + landing + email; the messaging guide is a sixth required document.
- Brand kit and campaign brief are structured, separate source-of-truth inputs. Facts and claims must never be invented or silently upgraded by creative copy.
- Deliver English and Arabic correctly; Arabic content is market-adapted and RTL, including mixed Arabic/English strings and numbers. Subjective translation quality always requires human review.
- Offer, CTA, audience, tone, colors, and prohibited terminology changes must create versions, propagate via dependency-aware updates, show diffs, invalidate affected approvals, and flag stale/manual conflicts.
- Never declare assets publish-ready or export current without appropriate QA and human review gates. Block stale exports unless an explicit logged override is permitted by the approved policy.

## Mandatory Superpowers methodology

At EVERY phase: invoke the installed Superpowers skills when available. Use `brainstorming` for unresolved creative or behavioral choices; get explicit design approval before writing code; then `writing-plans` for an exact task-by-task plan; use `using-git-worktrees` for isolated implementation; `test-driven-development` (RED → GREEN → REFACTOR) for features/fixes; `systematic-debugging` for defects; `subagent-driven-development` when genuine independent agent tooling exists or `executing-plans` otherwise; `requesting-code-review` and `verification-before-completion` for gates. See `06_SUPERPOWERS_PLAYBOOK.md` for the exact stage mapping.

**Never imply a skill ran or multiple agents were spawned if the environment lacks that capability.** An instruction cannot install a Claude Code plugin. Say which capabilities are missing and apply the manual equivalent. No production code until the Phase 0 design is approved.

## Team and handoff protocol

- One accountable human product owner approves requirements, creative claims, phase gates, and changes to factual source-of-truth material. Specialists propose/review; they do not invent authorization.
- At phase start, name phase, branch, owner, explicit inputs, acceptance IDs, known blockers, and expected artifacts. Do not work from ambiguous chat-only context.
- Any deliverable must link to requirements and tests; attach the actual commands/results for verification. Do not invent test runs, customer feedback, analytics, legal status, or approval.
- Record cross-team decisions in `09_DECISIONS_RISKS.md` (and repo ADR where technical), and update `02_SHARED_MEMORY.md` at approved gates. Include reviewer, date, evidence, and next phase.
- Keep changes small, reviewable, and test-backed. Explicitly preserve unrelated manually edited content through targeted revision. Distinguish automatic findings from human-review items.
- Work only on the requested/approved phase. If asked to start a later phase, identify unmet gates and surface them. Do not silently expand scope.

## Output format for phase work

Always report: **phase and status**, **decisions/assumptions**, **files changed**, **tests and exact results (or NOT RUN)**, **QA/review findings**, **unresolved blockers**, and **recommended next gate**. If the user requests a plan, produce a reviewable proposal and stop before implementation.
