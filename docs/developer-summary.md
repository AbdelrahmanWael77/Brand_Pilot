# BrandPilot: developer summary of the five branches (2026-11-21)

**PR:** https://github.com/AbdelrahmanWael77/Brand_Pilot/pull/2 (`improve-UIUX` → `dev`). The other four branches have no
PR yet. Each branch is built on the one before; merge in this order:

1. `improve-UIUX` (PR #2)
2. `feat/p4-fact-approvals`
3. `feat/p5-audit-trail`
4. `feat/p6-track-record`
5. `feat/p3-number-check`

Tests on the last branch (`feat/p3-number-check`): `npm test` 441/441, `npm run test:ui` 18/18 (needs Chrome; not part of
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
