# P3 checkpoint 2: false-alarm check with the real AI (2026-11-20)

20 Director questions on the synthetic FlowNest demo (10 English, 10 Arabic), last 28 days (21 Sep – 18 Oct 2026), the
real model from `.env` (Anthropic `claude-sonnet-5-5`), prompt `director-2026-11-20c` (structured claims + Arabic
glossary). Average 13,365 input and 1,649 output tokens per answer; median 9.8 s (3.2 – 26.3 s). No secret value was
found in the database, API responses, page, server console, report or the files saved from the run.

Questions: what to do first · cost per lead per channel · best content themes · Arabic vs English posts · change against
the previous period · best lead source · more enquiries from mobile · search queries to improve · Facebook or Instagram ·
this week's plan — the same ten in Arabic (the Arabic set asks about the landing page instead of search queries).

## Result

| | First run | After the fixes |
|---|---|---|
| Numbers checked | 191 | 195 ("qualified" counts are now checked too) |
| Wrongly flagged numbers | 7 (3.7%) | 0 |
| Answers wrongly blocked | 1 of 20 (Arabic, Facebook vs Instagram) | 0 |
| Real errors found in the answers | 0 | 0 |

Every flagged number was true; all 7 were false alarms, in four sentence shapes, each fixed and now tested
(`test/numcheck.test.js`, "the sentence shapes behind the false alarms"):

1. **A total after "out of".** "Facebook had 3 qualified out of 12 (25%)": the 12 took the metric "qualified" from the
   words before it. After "out of / of its / من بين" following another number, the metric comes from the words after.
2. **A rule threshold.** "fewer than 10 leads", "the 10-lead minimum": the threshold is in the channel comparison's
   ranking notes ("leads 4 < 10 required"), which the known numbers did not include. Ranking notes and channel rules are
   now part of them, and a number's metric is also read earlier in its own clause.
3. **A small count next to a bracket.** "Facebook has 12 leads (3 qualified) and Instagram has 4": the 4 took
   "qualified" from the bracket. A small count is now matched against the metrics named anywhere in its sentence
   ("7 Instagram leads" and "5 customers" are still caught).
4. **The other side of a comparison.** "… 1.12% مقابل 0.61% في إنستجرام، وسجّل 12 عميلًا محتملًا مقابل 4": the subject of
   the 12 was taken from "في إنستجرام", the side the topic (Facebook) is compared with. Clauses after "vs / مقابل" are
   skipped when looking back for a subject, and a number on that side without its own subject is left open. This is the
   one that blocked an answer.

One more found while adding "qualified" to the data words: "Referral leads … 6 of 7 were qualified" (leads outside the
channels) was not matched to the "referral" subject; fixed.

All 20 answers are in `test/fixtures/p3-ai-answers.json` (26 real answers in all); the test requires every number in
them to verify and none to be blocked.

## Arabic wording (glossary)

In the 10 Arabic answers: no English word "demo", none of the loanwords the glossary replaces (الموبايل، الديسكتوب،
البروشور، السوشيال), no "أبدأ". The only Latin words are names from the data: channel names, page paths and the content
theme names of the demo ("how-to tips", "offer").
