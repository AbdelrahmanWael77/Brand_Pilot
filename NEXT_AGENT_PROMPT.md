# START HERE — BrandPilot redesign pass 4 (branch `redesign/new-product-identity`)

The owner rejected passes 1–3 as a "visual reskin". Read `design-system/brandpilot/PASS4_BRIEF.md` first (owner brief, chosen direction, exact tasks), then AGENTS.md and the "REDESIGN — pass 4" line at the top of IMPLEMENTATION_STATUS.md.

State: **4.1 done** (new identity + goal sidebar shell, committed and pushed). **Next single task: 4.2** — rebuild `V.know` as the "Company profile" exactly as PASS4_BRIEF §4 describes (summary band, "Needs you first" lane, chapters with inline review and source quotes, bulk bar that never confirms claims, evidence drawer with the quote inside its source text). Remove pass 3's `KD` / `kdRow` / `.kd-*` / `A.kSel` / J-K-A-R handler at the bottom of the script; keep the actions listed in the brief. The `know0` portfolio wrapper further down (`const know0=V.know`) appends to whatever `V.know` returns — keep it working.

Rules: UI only in `public/index.html`; keep every `data-a` action, the server and the data; EN + AR/RTL; no text smaller than now. Test on a COPY of the DB (`cp data/brandpilot.db* <tmp>/`, `PORT=3100 BRANDPILOT_DB=<tmp>/brandpilot.db npm start`, `PORT=3100 npm run seed:dev`, demo: `const c=C();c.demo='flownest';A.loadDemo();R()`). Browser checks: headless Chrome with `--remote-debugging-port=9333`, then `PORT=3100 SHOTS=data/shots/p4 node data/check-11-run.mjs data/check-p4-41.mjs` (git-ignored helpers in `data/`). `npm test` = 280 pass on this branch. After each task: update both handoff files, commit, `git push origin redesign/new-product-identity`. Never merge into `dev`/`main`. After 4.2: same shell/look for onboarding/brand → analytics → audit + Director → Studio/Canva → QA/approvals → integrations/settings.

---

# Continue BrandPilot — Analytics channel comparison (task 15), next slice

Read AGENTS.md and IMPLEMENTATION_STATUS.md ("Newest — 15" under Next atomic task, and "In progress / uncommitted"). Run `git status`, `npm install`, `npm test` first. If a test fails with `fetch failed … bad port`, re-run it: that is a pre-existing flaky random port (`listen(0)`), not a regression.

Numbering: the analytics comparison was first handed off as "12" / "12b". Dev independently used 12, 13 and 14 for creative-studio work (any colour and logo position on a design, PNG / SVG downloads, Tag posts finish card — see "Also new — 14" and "Also new — 12" in the status file), so the analytics work is now **15 / 15b**. Code comments that still say "task 12" / "12b" in `public/compare.js`, `server/channels.js`, `public/index.html` and the two test files mean the analytics task.

State on branch `feat/12-analytics-compare`: 15 committed as e49e79f (by the owner); origin/dev merged in as ca1f866 (2026-11-16, conflicts only in the two handoff files, both sides kept); 15b committed on top; `dev` was fast-forwarded to this branch and pushed to origin/dev on 2026-11-16 (owner approved). Work on `dev` from here. `stash@{0}` is 15b as it was before the merge (now committed — safe to drop); `stash@{1}` (from `feat/10.6a-canva-real-replies`) is byte-identical to dev commit 8d2c4e6 and can be dropped once the owner agrees.

What 15 built (details in the status file):
- `public/compare.js` — pure channel-comparison math, global `BPCompare` (unit tests: `test/compare.test.js`). Rules: missing column = null ("Not measured"); leads only by the CRM source text; "Google" unassigned; GA4 social pooled; ranking only above minimum data with a 10% lead.
- `public/index.html` — Analytics opens on "Compare channels" (`cxView`, `cxSource`, `cxText`, `cxCell`, `cxRow`, CSS `.cx-*`); actions `A.cmpAsk` (Director) and `A.cmpCamp` (Studio draft).
- `server/channels.js` runs the same `public/compare.js` in `node:vm`; `buildContext(db, id, { range })` adds `context.channels`; citation type `channel` (`<channel>.<metric>`) checked in `server/director.js`; the page sends `range` with `/director/ask` (tests: `test/channels.test.js`).

15b (committed): ranking explanations — `compare().rank[k]` (status ranked / close / few, best eligible `top`, highest observed `obs`, not-ranked `out` with the exact unmet minimum), cell markers "★ Best eligible" / "▲ Highest observed" / "Not ranked: …", a "Why:" row under the metric (`cxRankNote`), visible comparability reasons (`CXW`), winner cards that name the better-looking unranked channel, a "Too little data to rank" card, and `channels.ranking` in the Director context. Keep that rule: never show a winner without the higher unranked channel and its reason; never call the minimums a confidence or significance test.

Next single task (15c): add the per-channel table to the report (`server/report.js` Markdown + printable HTML, EN/AR) using `channelSummary` from `server/channels.js`, for the report's own range. Success: for the same period, the report and the Compare channels tab show the same per-channel numbers, and the report says "Not measured" where the tab does. Other open items: campaign-by-campaign comparison across platforms, rules-engine Director using `channels`, LinkedIn live sync (needs LinkedIn partner approval).

Reply in at most 6 lines: changed / tested / blocker / next.
