# BrandPilot — Phase 0 Team Setup Kit

**Created:** 2026-11-11  |  **Status:** PRE-IMPLEMENTATION / DRAFT — awaiting product-owner approval

This is a coordination kit, not the BrandPilot application. No app code, runtime, tests, or campaign exports have been implemented or executed as part of Phase 0.

## Install into the Claude project shown in the screenshot

1. Open **BrandPilot → Instructions → Edit**. Copy the *contents* of `claude_project/01_PASTE_INSTRUCTIONS.md` into the instructions field and save. Do **not** paste all files into Instructions.
2. Open **Files → Add**. Upload `claude_project/02_...` through `10_...` as **individual Markdown files** (not the ZIP). Those are the shared knowledge documents.
3. The on-screen **Memory → View** feature is not a team-shared source of truth. Use `02_SHARED_MEMORY.md` as the explicit team ledger. Update it at phase gates; refresh the uploaded copy. Do not assume Claude will automatically synchronize a changed local file into the Claude project.
4. If using a **Claude Code repository**, copy the *contents* of the `repo/` directory to the repository root (`CLAUDE.md` at root, `docs/` underneath). Commit them on a documentation/setup branch after review. This bundle does not connect or change a real repository.
5. For executable Superpowers in **Claude Code**, install the plugin there separately. Its official repository currently documents `/plugin install superpowers@claude-plugins-official`. Installing/using Superpowers in another chat product does not install it in Claude. Verify skills are available in the actual coding environment.
6. Start a new project chat and use the **Phase 0 kickoff** text in `10_PHASE_START_AND_HANDOFF_PROMPTS.md`. Review and approve the draft spec/architecture before requesting implementation.
7. Assign a human project owner and technical approver; see `05_TEAM_OPERATING_MODEL.md`. Use a shared Git repository for code, history, and PR review rather than treating a chat transcript as the change log.

## Which files go where?

| Destination | Files | Function |
|---|---|---|
| Claude Project **Instructions** | `01_PASTE_INSTRUCTIONS.md` | Behavior, hierarchy, controls, skill obligations |
| Claude Project **Files** | `02_SHARED_MEMORY.md` through `10_PHASE_START_AND_HANDOFF_PROMPTS.md` | Shared facts, plan, process, decisions, execution prompts |
| Local Git repository root | `repo/CLAUDE.md` and `repo/docs/` | Versioned engineering rules, draft design, contracts, QA gates |
| Project memory UI | None from this kit | Private/personal memory; not relied upon for teamwork |

## Recommended approach and alternatives — decision pending

- **Recommended:** Shared Claude Project for discussion and briefs **plus** Claude Code with Superpowers and Git for implementation and review. Traceable, testable, team-friendly.
- **Alternative:** Claude Project + manual copy/export of files, with implementation handled in any local coding environment. Less automated and harder to synchronize.
- **Not recommended:** Only a long Claude chat with implicit memory and copied static output. Changes and approval evidence become unreliable.

No architecture choice is approved merely because it is written below. The **human project owner** signs off at Gate 0, after the team has reviewed the design document and tradeoffs.

## What to do next

**Gate 0 review:** Confirm architecture, phase boundaries, responsibility assignments, explicit FlowNest facts, campaign asset count, and export policy. Record approvals in `09_DECISIONS_RISKS.md` and the shared memory ledger. Then use Superpowers `writing-plans` to produce the first *task-by-task* implementation plan from the **approved** design, and only then implement with TDD.

## References

- Claude Projects docs: https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects
- Claude project sharing: https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing
- Superpowers skills and installation: https://github.com/obra/superpowers
