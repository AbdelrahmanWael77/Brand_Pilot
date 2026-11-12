# Implementation plans — none approved yet

This directory intentionally contains **no runnable implementation plan**. The project has a Phase 0 draft design and high-level phase roadmap; it must first receive explicit human approval.

After approval, use installed Superpowers `writing-plans` skill for each phase separately. Plans must:

- start with the Superpowers plan header: Title, agent sub-skill requirement, Goal, Architecture, Tech Stack, Spec, Global Constraints and Review Focus;
- identify concrete repository file paths and stable module interfaces;
- use checkable task blocks with failing test → verify failure → implementation → verify success → commit;
- include the five highest-risk missing input classes in owning task tests;
- avoid giant plans spanning independent subsystems;
- be reviewed by the owner before task execution;
- be executed with installed `subagent-driven-development` (when available) or `executing-plans`, then fresh verification and review.

Filename pattern: `YYYY-MM-DD-phase-N-short-title.md`. Preserve all historical plans; do not silently alter an approved executed plan.
