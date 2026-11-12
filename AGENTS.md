# BrandPilot — Permanent Agent Rules (canonical)

**Applies to EVERY coding agent, model, and implementation task.** This file is the source of truth for working rules. Keep it short. If another agent has already worked here, **continue its work; do not restart**.

## Before every task
1. Read `AGENTS.md` and `IMPLEMENTATION_STATUS.md`. Read `PHASES.md` only when selecting/changing phase; read only task-relevant code.
2. Inspect `git status` (if Git exists), the current app, and relevant changed files. Do not overwrite uncommitted work from another agent.
3. Take **one small, testable task** from `Next atomic task` in the status file. Prefer the smallest vertical slice that advances the end-to-end product.
4. If critical requirements are missing, choose a simple reversible default and record it. Ask only when the choice is blocking, costly, or irreversible.

## Product priority
Build this real workflow first:
**Create company → Add sources → Extract/approve facts → Import data → Audit → AI Marketing Director → Editable bilingual campaign.**
Use the supplied `BrandPilot.html` prototype as a reference for existing screens, logic and terminology. It is a single-file browser prototype, not proof of a functioning backend or live AI integration.

## Save time and tokens
- **Implement, don't over-plan.** No extensive specs or speculative architecture. Avoid full rewrites, UI redesigns, unnecessary libraries, microservices, and premature optimization.
- Reuse functional prototype logic when practical; retain its English/Arabic + RTL workflows.
- Open only necessary files/sections; use targeted search. Don't paste whole files, logs or previous chats into responses.
- Prefer a small patch plus a targeted test over an ambitious batch.
- Build MVP first; postpone live integrations, advanced visual design, scheduled automations and polish until core flow works.
- Keep replies concise: **changed / tested / blocker / next** (maximum ~6 lines unless asked).

## Non-negotiable correctness
- Authentication, per-company authorization/data isolation, protected secrets, safe file handling, and real persistence where needed.
- AI advice must be grounded in approved facts and/or explicitly labeled data; never fabricate source evidence or present synthetic/demo data as real.
- Distinguish functioning code from mocks, placeholders, and not-yet-connected APIs.
- Do not claim a test passed unless you ran it. If you cannot run it, state why.

## Handoff protocol — MANDATORY
**Do not wait to detect the quota limit: it may be invisible or end abruptly.**
- **At the end of EVERY small task**, update `IMPLEMENTATION_STATUS.md` and overwrite `NEXT_AGENT_PROMPT.md` with an accurate, paste-ready continuation prompt.
- **Before starting a risky/large edit**, first record the exact planned task and recovery point in those two files. Then work in small checkpoints.
- If time/quota appears tight, **stop new implementation immediately**, save any changes, report tests honestly, update both handoff files, and end with the next agent's starting instruction.
- Every task in the status file's Task queue carries **Agent / Reasoning / Dev effort** (see table in `PHASES.md`). When you add or split a task, fill them in; if you are a weaker model than the one recommended, say so in the status file and keep the change extra small.
- Record: verified completed work; WIP/uncommitted files; key decisions; exact commands/tests and results; blockers; next *single* task; success criterion.
- A new model/agent resumes from files and Git state, not from previous chat history. Never assume conversations or hidden context transfer.
- If Git is available, prefer a small commit after a verified task when permitted. Never commit secrets. If no commit, list edited files clearly.

## Task completion rule
A task is complete only after its minimal acceptance test **and** both handoff files are updated. The next agent must be able to resume without the previous agent's context.

## Reference material (read only when a task needs it)
- `docs/handoff-pack/` — original handoff pack zip + pristine extract. Do not edit; the live copies are the root files.
- `BrandPilot.html` — untouched prototype (reference). The live frontend is its working copy `public/index.html`.
