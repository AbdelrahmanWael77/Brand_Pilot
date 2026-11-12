# BrandPilot — Copyable Team Prompts

## 1. Phase 0 kickoff (recommended first Claude Project chat)

> We are in **BrandPilot Phase 0: design approval**, not implementation. Read the project instructions and all shared files. Use installed Superpowers `using-superpowers` and `brainstorming` if available. Examine the draft architecture/spec and requirement matrix; present key tradeoffs and any decisions that need my approval. Do not scaffold or write app code yet. Produce a concise review of the proposed 0–9 phase roadmap and a Gate 0 approval checklist. Clearly separate approved facts from design proposals, and identify unavailable Superpowers functionality instead of pretending it ran.

## 2. After human approval: create the first execution plan

> I approve the Phase 0 design with these recorded modifications: [paste exact decisions]. Update the design, ADR and shared memory/decision log. Invoke Superpowers `writing-plans` and create `docs/superpowers/plans/YYYY-MM-DD-phase-1-foundation.md` with exact files/interfaces, RED/GREEN tests, commands, review focus, and atomic commits. Do not implement until I review the plan.

## 3. Begin an approved phase

> Start **Phase [N]** under the latest approved phase-specific plan. Read current Git state, shared memory, spec, ADRs, required acceptance IDs and outstanding gates. Confirm that Superpowers is installed. Choose isolated workspace and subagent-driven or inline execution according to actual tools. Execute the reviewed tasks with TDD, evidence-based QA and targeted code review. Do not alter approved product claims or expand scope without an explicit recorded decision.

## 4. Specialist handoff request

> Act in the **[role]** review capacity for Phase [N]. Review files/commit [path/hash] against requirements [IDs], FlowNest fact IDs [IDs], and local language/QA constraints as applicable. Report concrete defects by severity and affected asset, missing evidence, risk, proposed action, and whether the gate is READY or BLOCKED. Do not imply you ran tools you did not run.

## 5. Phase gate report

> Produce the Phase [N] gate record using `repo/docs/process/PHASE_GATE_TEMPLATE.md`. Include planned vs actual deliverables, exact tests and outputs, changed files, version/offer impact, QA counts, human-review status, limitations, outstanding risks and the explicit decision requested from me. Update shared memory only after I approve.

## 6. Surprise-change input (reserve for the user's future instruction)

> Apply my newly approved change [EXACT CHANGE] to current BrandPilot campaign version [VERSION]. Do not rebuild unrelated assets. Show affected dependency set, content before/after, preserved unrelated edits, new brief and asset versions, invalidated approvals, all QA results, and fresh editable export with manifest. If the change modifies a FlowNest factual claim or offer, require an updated authorized fact record; do not assume approval from a marketing preference alone.
