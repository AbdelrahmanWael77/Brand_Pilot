# Continue BrandPilot with task 9.25

Read AGENTS.md, IMPLEMENTATION_STATUS.md (Next atomic task and 9.25 queue entry), then the 9.25 prompt in TASK_PROMPTS.md. Inspect git status and retain the current frontend work.

Recovery point: feat/9.24-logo-versions-ui at ec22bb2 (also local dev), with uncommitted public/index.html, IMPLEMENTATION_STATUS.md and NEXT_AGENT_PROMPT.md. Cached origin/dev was 38efd13, an ancestor. Sync with origin/dev where Git writes and GitHub access are available. The last attempt could not write .git/FETCH_HEAD, GitHub DNS failed, and Git could not create .git/index.lock.

9.23 is already in ec22bb2. 9.24 is implemented in public/index.html. It converts logo versions to PNG, measures contrast, exposes per-version overrides, and snapshots version IDs and overrides for new campaigns and explicit Change impact updates. Keep those semantics. Scratch browser fixture: run node data/check-9.24.mjs and open data/check-9.24.html in Chrome (the headless DOM showed PASS 29). Syntax check and git diff --check passed. The 17 non-HTTP brand tests passed against a stubbed reader. Full npm test hit connect EACCES for all 222 failures (19 of 241 passed); rerun it with loopback access before integrating. No live website was read.

Next single task: 9.25, split Create content into Logo and Colours cards. Reuse the Knowledge Hub logo version picker and the brand colours editor. Verify adding/replacing/removing/assigning a logo version affects only that version and keeps campaign media, and that colour editing/reset affects only colours. Verify separate pending counts and EN/AR. Run acceptance checks and update both handoff files.
