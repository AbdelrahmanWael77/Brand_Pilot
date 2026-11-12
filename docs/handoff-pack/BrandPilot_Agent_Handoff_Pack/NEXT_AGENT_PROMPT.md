# COPY EVERYTHING BELOW INTO THE NEXT AI AGENT (Fable / Claude / other)

You are taking over an **existing BrandPilot implementation** from another AI. **DO NOT restart, replan the entire project, or overwrite work.** You are working in the same shared repository/workspace.

1. First read `AGENTS.md` and `IMPLEMENTATION_STATUS.md` from the project root; read `PHASES.md` only if needed.
2. Inspect current Git status and only the files relevant to the pending task. Trust verified code/tests and files, not the prior agent's claims alone.
3. Continue **exactly one** task from `IMPLEMENTATION_STATUS.md` → **Next atomic task**. Do not implement later-phase extras.
4. Execute the smallest relevant test. If a previous change is uncommitted or incomplete, assess it before editing.
5. Before ending (and **before a risky edit**), update `IMPLEMENTATION_STATUS.md` with actual accomplishments, files, command/results, blocker and next task; then **rewrite this entire `NEXT_AGENT_PROMPT.md`** with the current resume details. This protects against quota cuts. Keep both concise.

## Latest handoff snapshot — UPDATE after each task
- **Current phase:** Phase 0 (not independently verified in target workspace)
- **Last verified accomplishment:** None in target Fable project yet
- **Files changed / WIP:** Unknown; inspect Git
- **Last test + result:** Not run yet
- **Open blockers:** Need inspect shared project and confirm `BrandPilot.html` is available
- **Next exact task:** Inspect existing project, establish run command and verify app launch; do not recreate an already-running project
- **Success condition:** Working app launch or clearly recorded reproducible blocker

After completing the task, hand over again in this file so another agent can resume immediately even if your quota expires.
