# BrandPilot — Superpowers Team Playbook

**Superpowers is a workflow, not a magic directive.** This playbook assumes Superpowers is installed and visible in the **actual coding environment** (e.g. Claude Code). If it is not available, record `SKILL NOT AVAILABLE`, use the equivalent explicit process, and do not claim the skill was invoked.

## Per-phase operating sequence

1. **Discover/invoke `using-superpowers`.** Confirm current relevant skills from installation rather than trusting a stale list.
2. **Use `brainstorming`** for unapproved design or behavior decisions. Inspect supplied brief/repo first, compare approaches, write a design spec under `docs/superpowers/specs/`, and obtain human approval before implementation. Only start coding after the design gate.
3. **Invoke `writing-plans` after approval.** Produce phase-specific `docs/superpowers/plans/YYYY-MM-DD-<phase>.md`: full header with Goal/Architecture/Tech Stack/Spec, file map, exact interfaces, test-first bite-size tasks, run commands, and review focus. The high-level roadmap is not enough for execution.
4. **Use `using-git-worktrees`** if feature work needs isolation, honoring repository and tool preferences. Verify clean baseline before edits.
5. **Choose implementation mode deliberately:** `subagent-driven-development` for independent tasks when subagent tooling actually exists; otherwise `executing-plans` in the current session. Never pretend that named roles are running agents.
6. **Run `test-driven-development`** for each feature/bug: failing test with expected reason → minimum implementation → passing focused test → full suite → commit. Include Arabic/claims/versioning negative cases where relevant.
7. **On failure, use `systematic-debugging`** before proposing a patch. Avoid blind retries.
8. **Use `requesting-code-review` and `receiving-code-review`** for independent spec and quality review where possible. Track review action items.
9. **Use `verification-before-completion`** before claiming the phase passed: run real commands, read exit codes and totals, compare to acceptance criteria, and note anything not run.
10. **Use `finishing-a-development-branch`** when implementation and review are complete, using approved merge/PR process. Update the shared ledger and source docs at the phase gate.

## Which skills matter most in which phase?

| Phase | Non-negotiable Superpowers focus |
|---|---|
| 0 | `brainstorming` → **human design approval**; no product code |
| 1 | `writing-plans`, `using-git-worktrees`, `test-driven-development` for domain/schema/persistence |
| 2 | `test-driven-development` + `requesting-code-review` for template interfaces and vertical slice |
| 3 | `brainstorming` for creative direction, factual review, TDD for slot/render contract |
| 4 | `test-driven-development`, `systematic-debugging` for RTL, form validation and responsive behavior |
| 5 | `writing-plans`, TDD with change-matrix failures, independent review before impact engine release |
| 6 | TDD negative checks, `verification-before-completion`; flag human-review limitations |
| 7 | TDD for manifest and export freshness, code review and verification |
| 8 | `systematic-debugging`, `verification-before-completion` and full-branch review |
| 9 | `brainstorming` only if unexpected requirement needs clarified design; change protocol + reapproval + verification |

## Start-of-phase prompt contract

> We are starting Phase [N] of BrandPilot. Read shared memory, latest approved specs, ADRs, and gate record. Confirm Superpowers skills available. Do not code until this phase's design/spec is approved. Prepare the phase design decisions first, then the Superpowers `writing-plans` task plan. Work only on Phase [N]. Identify acceptance requirements, tests, reviewers, evidence, and re-review triggers.

## End-of-phase acceptance contract

Report:
- **Implemented vs planned** with requirement IDs and commit hash.
- **Test results:** command, runtime environment, exit status, passes/fails/skips, Playwright browser availability.
- **QA:** errors/warnings/human-review items by asset; unverified claims.
- **Diff impact:** every changed brand/brief field, dependent assets, preserved unrelated edits, approval invalidations.
- **Export gate:** current/stale state and proof, or NOT TESTED.
- **Decision/gate:** signed human decision, or PENDING if not signed.

## Environment limitations and installation

- Claude Project files/instructions alone do **not** provide code execution, Git access, browser testing, or the installed Superpowers plugin.
- Official Superpowers README currently lists Claude Code install via: `/plugin install superpowers@claude-plugins-official` (run **inside Claude Code**, not as a shell command here).
- If no parallel-agent tools exist, use sequential implementation and independent human review where available.

Reference: https://github.com/obra/superpowers
