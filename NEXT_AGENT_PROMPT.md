# Continue BrandPilot — Analytics channel comparison (task 12), next slice

Read AGENTS.md and IMPLEMENTATION_STATUS.md ("Newest — 12" under Next atomic task, and "In progress / uncommitted"). Run `git status`, `npm install`, `npm test` first — expected 542 pass, 0 fail. If a test fails with `fetch failed … bad port`, re-run it: that is a pre-existing flaky random port (`listen(0)`), not a regression.

Also on dev (another agent): Task 12 (2026-11-16, Fable 5.2), committed and pushed to `dev` — read "Newest — 12" under Next atomic task in IMPLEMENTATION_STATUS.md first: any colour on a design, logo position, no company-name text beside a logo, Canva asked for no logo (BrandPilot overlays the real one), a Canva design used as the whole post (`design.fill = 'full'`), one design per post (`A.cvAll`), the fine-tuning button removed. Task 13: posts download as PNG (format shown) as well as SVG (`A.aPng`). Task 14 (pushed to `dev`): Tag posts has a finish card and "Save and finish later" (`tagEnd`, `A.tagDone`). `npm test` 265 pass; browser checks `data/check-12-steps.mjs` 21/21 and `data/check-11-steps.mjs` 31/31 with a stand-in Canva. Next single task: with the real Canva account, restart the server, generate a design and confirm the proposals now come WITHOUT a logo and that "Use in this post" shows the design as the whole post with the real logo on top. Ask the owner before committing.

Read AGENTS.md and IMPLEMENTATION_STATUS.md (Next atomic task; Task queue rows 9.12, 9.13, 10.4a–10.4c). Run `git status`, `npm install`, `npm test` first (see the merge note for the count after the merge).

State: task 12 is done but NOT committed, on branch `feat/12-analytics-compare` (from `dev` @ ed40e92). Ask the owner before committing or pushing. `stash@{0}` (from `feat/10.6a-canva-real-replies`) is byte-identical to dev commit 8d2c4e6 and can be dropped once the owner agrees.

What 12 built (details in the status file):
- `public/compare.js` — pure channel-comparison math, global `BPCompare` (unit tests: `test/compare.test.js`). Rules: missing column = null ("Not measured"); leads only by the CRM source text; "Google" unassigned; GA4 social pooled; ranking only above minimum samples with a 10% lead.
- `public/index.html` — Analytics opens on "Compare channels" (`cxView`, `cxSource`, `cxText`, `cxCell`, `cxRow`, CSS `.cx-*`); actions `A.cmpAsk` (Director) and `A.cmpCamp` (Studio draft).
- `server/channels.js` runs the same `public/compare.js` in `node:vm`; `buildContext(db, id, { range })` adds `context.channels`; citation type `channel` (`<channel>.<metric>`) checked in `server/director.js`; the page sends `range` with `/director/ask` (tests: `test/channels.test.js`).

Next single task (12b), once the owner confirms the commit: add the per-channel table to the report (`server/report.js` Markdown + printable HTML, EN/AR) using `channelSummary` from `server/channels.js`, for the report's own range. Success: for the same period, the report and the Compare channels tab show the same per-channel numbers, and the report says "Not measured" where the tab does. Other open items: campaign-by-campaign comparison across platforms, rules-engine Director using `channels`, LinkedIn live sync (needs LinkedIn partner approval).

Reply in at most 6 lines: changed / tested / blocker / next.
