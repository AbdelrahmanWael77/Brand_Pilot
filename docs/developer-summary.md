# BrandPilot: developer summary of the six branches (2026-11-22)

**PR:** https://github.com/AbdelrahmanWael77/Brand_Pilot/pull/2 (`improve-UIUX` → `dev`). The other four branches have no
PR yet. Each branch is built on the one before; merge in this order:

1. `improve-UIUX` (PR #2)
2. `feat/p4-fact-approvals`
3. `feat/p5-audit-trail`
4. `feat/p6-track-record`
5. `feat/p3-number-check`
6. `feat/p7-simple` (the redesign; review with the owner's screenshots in docs/ui-audit/screenshots-p7*)

Tests on the last branch (`feat/p7-simple`): `npm test` 446/446, `npm run test:ui` 19/19 (needs Chrome; not part of
`npm test` — consider running it in CI). Handoff notes: `IMPLEMENTATION_STATUS.md`, `NEXT_AGENT_PROMPT.md`.

## Production database rule

**Before merging, run the migration on a copy of the production database, if one exists** — before
`feat/p4-fact-approvals`, and again before each later branch. The schema changes when the server starts (`initSchema`):
PR #2 adds two columns to `company_settings`; P4 adds the `fact_approvals` table and three columns; P5 adds `trail` and
`trail_marks` (with triggers); P6 adds `track_steps`. P3 adds no table. On the copy, check that row counts are unchanged,
you can sign in and saved reports still open; `test/migration-p4.test.js` does the same on a fixture.

## 1. `improve-UIUX` (PR #2): the server audit and the new navigation

- API changes: `GET /audit` takes a `range` (default `all`); report findings use the report's period;
  `GET /director/context` defaults to 28 days.
- The page re-fetches recommendations after every save; watch server load with large imports.
- Campaign downloads wait until a person approves the strategy.
- Fonts are shipped in `public/vendor/fonts` (OFL); no Google Fonts requests.

## 2. `feat/p4-fact-approvals`: fact approvals on the server

- Approval tracking starts at a company's first recorded decision; earlier approvals become "approved before tracking
  began". An expired fact blocks campaign downloads.
- The demo-only expiry control answers 404 unless `BRANDPILOT_DEMO=1`.
- Migration rule above applies here first.

## 3. `feat/p5-audit-trail`: the append-only audit trail

- Triggers refuse UPDATE, DELETE and INSERT OR REPLACE on `trail` (only deleting a whole company removes its rows). A test
  calls every route and checks earlier rows are unchanged: add any new routes file to it.
- `GET /audit` writes trail rows when its inputs change.
- A strategy approval counts only once the server recorded it. **Campaigns approved before this branch need one more
  click on Approve.**

## 4. `feat/p6-track-record`: the track record

- The server takes metric, baseline and target from its own data and ignores numbers sent by the page; each step is
  evaluated once, when the data covers its review window; the score appears only from 5 evaluated steps.
- The audit keeps each recommendation's subject as a non-enumerable property (`auditMeta.decorate`); check it never
  reaches the API output (tested).
- The FlowNest demo history (5 earlier steps on synthetic data) exists only with `BRANDPILOT_DEMO=1`.

## 5. `feat/p3-number-check`: the number check (check carefully)

What it does: every number in an AI answer, a rules-engine answer, a pasted answer and campaign copy is matched, at the
precision it was written, against the KPIs, the previous period, audit evidence, the channel comparison and approved
facts of the period on screen (`server/numcheck.js`). Verified numbers link to their source; others show as
"unverified". An answer whose main claim fails is held back (its full text is kept in the trail for review).

Check carefully:
- **The number check is heuristic.** It reads the subject (mobile, a channel, a page…) and the metric from the words
  around each number to catch swapped numbers. Measured with the real model on the synthetic demo:
  - false-alarm run (20 questions): 7 of 191 numbers wrongly flagged (3.7%), 1 answer wrongly blocked → 0 after fixes;
  - **held-out run (20 new questions, check unchanged): 191 numbers, 6 wrongly flagged (3.1%), 1 of 20 answers wrongly
    blocked, 0 real errors in the answers, 0 wrong numbers let through** → 0 / 0 after a separate fix commit.
  - Expect a few percent of false alarms on new wording and real data. Review the held-back answers in the trail
    (`trail.detail.check.heldBack`, `mainClaim`, `reasonNumber`) after release, and add real answers to
    `test/fixtures/p3-ai-answers.json` (46 now) when a false alarm is fixed. Reports: `docs/ui-audit/p3-false-alarms.md`,
    `docs/ui-audit/p3-heldout.md`.
- **Blocking rule (owner 2026-11-21):** an answer is held back only for a contradiction in its main claim (swapped number, another period, wrong value for a recognised metric); a number whose metric is not recognised is shown as unverified without blocking. Fresh re-runs of both 20-question sets: 0 answers blocked (181 and 167 numbers checked; 1 false alarm, outside a main claim).
- **Campaign copy now blocks downloads** when a number in it is not in an approved fact. Campaigns that already contain
  such numbers will be blocked after deploy; the page offers "Add it as an approved fact (with evidence)" or "Remove it
  from the copy".
- **The Director's rules engine moved to the server** (`server/rulesDirector.js`); the page's version is removed.
  `POST /trail/answer` now only records the owner's local endpoint (a rules answer there is 400).
- **Prompt** `director-2026-11-20c`: the AI returns structured claims and, in Arabic, follows a glossary of the screens'
  words. About 13.4k input and 1.6–1.9k output tokens per answer (Anthropic `claude-sonnet-5-5`), median about 10 s.
- New routes: `POST /director/rules`, `POST /numcheck`, `POST /numcheck/demo` (404 without demo mode), `GET /gaps`.
- Arabic: the page's bidi pass now also processes text inside a `<bdi>` that wraps a whole mixed phrase (so `/pricing`
  keeps its slash); check the Arabic screens.
- The AI key lives only in `.env` (git-ignored, never committed on any branch). After every real-AI run, its value was
  searched in the database, API responses, page, server logs and reports: never found.

## 6. `feat/p7-simple`: the redesign (check carefully)

Built on `feat/p3-number-check`; pushed, no PR yet. Goal: an extremely simple, premium product in English and Arabic.
The rules the screens follow are in `docs/ux-rules.md`; every screen, with what moved where, is in `docs/screen-plan.md`.

**Tests:** `npm test` 446/446, `npm run test:ui` 19/19. The UI tests need Chrome and include an AA contrast check of every
screen in both languages. UI tests changed only where layout or navigation changed (menu, a11y, questions, consistency,
track, director-period, fact-approvals, p3cp2, trail); new tests: `ui-tests/series-flags.ui.mjs` and `test/series-approval.test.js`.

What changed (page only unless noted):
- **Look:** palette 1, cobalt & apricot (`html[data-pal]`, default `1`, sign-in page included), Geist and Readex Pro fonts
  shipped in `public/vendor/fonts` (OFL licences added). Two other palettes stay in the code (`A.setPal`).
- **Navigation:** a light sidebar with groups (`NAV7` in `public/index.html`): Home, Ask, Next steps, Content, Performance,
  Company, then Data and Settings; a user card for company switch and sign out; a header language button. No tabs above pages.
  Keyboard: arrow keys move and open groups (mirrored in Arabic).
- **Screens:** new Home; Ask answers as numbered steps with "Add to my tasks"; My tasks (Active / Completed); a Track
  record page; Results and Leads summaries (the old pages behind "More detail"); Campaigns list, a two-screen New
  campaign, Review drafts grouped by draft with an EN / ع switch and "Approve and download"; Content series in 3 steps,
  a series page and a post review with flagged lines and "Fix"; Company info, Sources, Data, Reports and Settings
  simplified. Nothing was deleted: hidden or moved items are listed per round in `docs/screen-plan.md`.
- **Demo:** the FlowNest demo company is created ready (`A.demoCo`, `demoReady`, `demoCamp`), demo mode only. Tests use
  `A.demoCo({ raw: true })` for the old raw path.
- **Series approvals on the server (new, owner 2026-11-22):** two routes and three trail kinds, no schema change.
  - `POST /recs/draft` with the series id (`sid`) now records what the server flagged in the AI draft (trail kind
    `series_draft_check`: numbers not in the topic or the approved facts, company statements not copied from a fact).
  - `POST /api/companies/:id/series/:sid/flag-ok` records a flagged line a person marked "It's correct" (trail kind
    `claim_check`: who, when, the series, the topic, the line).
  - `POST /api/companies/:id/series/:sid/approve` **finds the flagged lines itself**, never from the browser's list:
    the same number check as the draft (`unsupportedNumbers` in `server/recs.js`) on the headline, caption and words
    it receives, against the topic of its own last draft and the approved facts of now; and the same claims check
    (`claimsToCheck`) on the claims of the series' last AI draft, if no post of the series was approved since. The
    browser's list can only add lines. Every line found must be cleared: a number no longer in the words, or a
    `claim_check` row with the same text in the same series. Otherwise 409 `flags_open` with the open lines
    (`open`), nothing is recorded, and the page shows those lines on the post. When all are cleared, the trail row
    `series_approval` keeps the series, the topic, the headline, the caption and each line with its `claim_check` id.
  - "Approve and download" downloads only after the server answers 201; the approved post keeps the trail id. A series
    name comes from the server's copy of the company state, or from the browser if the series has not been saved yet
    (`mirrored` in the detail says which).
- **Server text only** (apart from the series approvals above, no route, schema or trust logic changed): plain channel names (`server/plain.js`), a short
  next-step line (`step` in `server/auditMeta.js`), plain wording in audit, report, gaps and trail text; Director prompt
  `director-2026-11-22` (possible reasons, no forecasts, Arabic glossary). The FlowNest baseline was re-recorded three
  times, wording only, each with a diff document committed first (`docs/ui-audit/p7-*baseline-diff.md`).
- **Number check:** two fixes for real-run false alarms, with tests: "reached" / "وصلت" are read as reach, and a number
  in brackets that explains the previous clause is read with that clause. Real-AI run on the final prompt: 10 questions,
  129 numbers, 0 flagged, 0 blocked, the key never found in any output.

Check carefully:
- **Approve and download** (campaign Review drafts) approves the drafts, records the strategy approval on the server and
  then downloads the zip; nothing downloads if the server refuses the approval. Watch this path in staging.
- **Series post approval:** company statements are found by the AI model, so the server can re-check only the
  statements of its own last draft of that series; words written with no AI draft get the number check only. Numbers
  typed after the draft are found at approval (the page shows them then). A line confirmed once stays confirmed in that
  series. Older approved series posts have no trail row. The old single "I checked these" box is replaced by one
  "It's correct" per line.
- **Campaign names in two languages** are read from the recommendation's title in each language (`campNames`: two
  `GET /audit` calls, English and Arabic, once per campaign made from a recommendation that has no names yet); a
  campaign the user described keeps the words typed, in both languages.
- **Settings → Advanced** (AI model, AI files, import history, the real / simulated table) is collapsed and visible to every
  signed-in account owner. There are no user roles: a real admin role needs a server change (owner: later).
- **Arabic:** mixed English and Arabic lines (series names, page paths like `/pricing`) rely on `<bdi>`; check the Arabic
  screens on real data.
- `public/index.html` is one large file patched in place; P7 code sits mostly in the last `<script>` block, wrapping older
  views (`V.studio`, `V.integ`, `V.series` …) rather than rewriting them.

Screenshots (before / after, English and Arabic): `docs/ui-audit/screenshots-p7` (checkpoint 1), `screenshots-p7-cp2`,
`screenshots-p7-cp2b`, `screenshots-p7-cp2c` (finishing round) and `screenshots-p7-last` (last fixes); palettes in
`docs/ui-audit/p7-palettes`. Scripts to retake them: `docs/ui-audit/scripts/p7-*.mjs`.
