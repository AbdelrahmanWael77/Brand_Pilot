# P3: held-out test of the number check with the real AI (2026-11-21)

The 0 false alarms of checkpoint 2 were measured on the 20 answers the fixes were made on. This run uses **20 new
questions** (10 English, 10 Arabic) on topics not asked before, none of them among the 26 answers in
`test/fixtures/p3-ai-answers.json`. **The number check was not changed during the run** (code at 03403c5).

Synthetic FlowNest demo, last 28 days (21 Sep – 18 Oct 2026); model Anthropic `claude-sonnet-5-5` from `.env`; prompt
`director-2026-11-20c`. Average 13,368 input and 1,876 output tokens per answer; median 10.6 s. No secret value was
found in the database, API responses, page, server console, report or the files saved from the run.

Questions (asked in English and in Arabic): how healthy is our marketing overall · when should we post, and how often ·
what should our next campaign be about · how many enquiries does email bring, is it worth growing · which customer
segment to target · Instagram engagement rate, is it improving · how much website traffic comes from organic social ·
is our brand messaging consistent · the biggest risks right now · a 30, 60 and 90-day plan.

## Result (check unchanged)

| | |
|---|---|
| Numbers checked | 191 |
| Wrongly flagged numbers | 6 (3.1%) |
| Answers wrongly blocked | 1 of 20 (Arabic: Instagram engagement) |
| Real errors caught | 0 |
| Wrong numbers the check let through | 0 (all 185 verified numbers were read against the screens and are true figures for the period) |

There were no wrong numbers in these 20 answers, so this run measures false alarms, not catches; catches are measured
by the error tests and the demo test with deliberate mistakes.

### The 6 false alarms

| Answer | Number | Text | Why it was flagged |
|---|---|---|---|
| EN, risks | 3 | "… guarantee, which can damage trust. 3) Visitors are not turning into enquiries" | a list number in the middle of a line ("3)"), read as a count next to "enquiries" |
| EN, 30/60/90 plan | 61, 90 | "Days 61-90: grow and measure" | plan day labels, not data |
| EN, 30/60/90 plan | 90 | "At day 90, compare engagement with this period's 3.1%" | a plan day, not data |
| AR, email | 2.02% | "سجّل البحث العضوي 31 استفساراً بمعدل 2.02%" | "بمعدل" (at a rate) after "استفسارات" was not read as an enquiry rate |
| AR, Instagram | 13952 | "542 تفاعلاً من وصول 13952" | "وصول" without the article was not recognised as reach; this one blocked the answer (it was its main claim) |

### Found while reading, not counted as errors

Two verified numbers were true but linked to the wrong source (the same value exists elsewhere): "2.3% for English"
(engagement of English posts) linked to "Desktop: enquiry rate 2.27%", and "the 3 of 5 projects that lack an outcome"
linked to the lead-source finding instead of "3 of 5 projects state no outcome". The number check passed the right
numbers; only the link shown on click was wrong.

## Arabic wording

No English "demo", none of the loanwords the glossary replaces, no "أبدأ". Latin words only for names from the data
(Organic Social, /pricing, "how-to tips").

## After this report

The false alarms and the two source links are fixed in a separate commit; these 20 answers join the fixture.
