// Reasons for every difference in docs/ui-audit/p1-baseline-diff.md. Key: "<part>:<id or *>:<field or *>".
// Most specific key wins: "A:ch-leak:ev" before "A:ch-leak:*" before "A:*:ev". For a confidence change the diff also
// prints the item's own one-line confidence reason.
export const GENERAL = `**What P1 changed, in one paragraph.** Before P1 the browser ran its own copy of the rules over all imported data,
and the server ran a second copy (English wording, plain digits) for reports and the AI Director. Now the server
copy is the only one: the browser shows what the server returns, for the period on screen. The same rules, ids
and thresholds are used; the seven rules that existed only in the browser were moved to the server with their
wording. Every item now also carries its period, data used, calculation, assumptions and a computed confidence.

**How to read the tables.** Part A compares like with like (all imported data) and so shows only what moving the
rules changed. Part B shows what the screens' default period (the last 28 days, 2026-09-21 → 2026-10-18) changes
on top of that. "position" is the item's place in the list (1 = first).

**Correction after the owner's review (2026-11-20).** The first P1 version hid the posting gap in the 28-day view because
the gap started before the period. That was wrong: a gap that started before the period is still happening inside it.
With a period chosen, gaps are now counted from the last post before the period, and a gap still open at the end of the
period counts too ("No posts for N days", Medium confidence, because the social export may simply end earlier). With no
social posts at all in the period but posts before it, the item is the gap, not "Social performance is not connected".`;

const WORDING = 'Wording: the server text is now the only wording (it was already the text of reports and the AI Director); same rule, same numbers.';
const QUOTES = 'Typography only: the server writes straight quotes "…" where the browser used curly ones “…”; same text.';
const ORDER = 'Order follows the priority score (value × 2 + evidence + urgency − effort). The evidence part now comes from the computed confidence (High 3, Medium 2, Low 1) instead of a fixed number per rule, so items move when confidence changes or when items above them move.';
const CONF = 'Confidence is now worked out by one rule for every item (sample size against the rule’s minimum, distance past the threshold, how much of the period the data covers) instead of a fixed label per rule.';
const PERIOD = 'Period: the numbers now cover the screen’s period (last 28 days, 2026-09-21 → 2026-10-18) instead of all imported data (2026-07-27 → 2026-10-18). Same rule and thresholds; this is the intended P1 change, so every screen shows the same value for the same period.';

export const REASONS = {
  // Part A — moving the rules to the server
  'A:*:position': ORDER,
  'A:*:conf': CONF,
  'A:*:why': WORDING,
  'A:*:action': WORDING,
  'A:*:title': WORDING,
  'A:*:ev': WORDING,
  'A:theme-best:title': QUOTES,
  'A:theme-best:action': QUOTES,
  'A:theme-best:ev': QUOTES,
  'A:seg-best:title': QUOTES,
  'A:src-unknown:action': QUOTES,
  'A:ch-leak:ev': 'Evidence wording: the hypothesis line now says “Hypothesis, not a measurement”; the numbers are identical.',
  'A:ch-best:ev': 'The site average now also shows the counts behind it (189 enquiries from 14,303 sessions); the values are identical.',
  'A:src-best:ev': 'The overall share now also shows how many leads it is based on (151 leads); the values are identical.',
  'A:seo-q:ev': 'Numbers are written in full with separators (17,036) instead of the short form (17.0k), so they can be checked against the export; quotes are straight. The values are identical.',
  'A:brand-doc:ev': 'The evidence quotes the approved fact text; the source it came from (Brand guidelines) is now listed under “Data used → Sources” on the evidence card.',
  // Part B — the screens' period
  'B:*:ev': PERIOD,
  'B:*:conf': 'The 28-day sample is smaller, so the computed confidence changed. ' + CONF,
  'B:*:position': 'Order follows the priority score; it moved because confidence changed with the period or because items above it left the list.',
  'B:seg-best:removed': 'In the last 28 days no two customer segments reach 15 leads each, so the check cannot run. It now appears under “Not enough data yet” (“Customer segments cannot be compared yet” — two segments need 15+ leads each). With 90 days or all data it is a recommendation again.',
  'B:src-best:removed': 'In the last 28 days no lead source reaches 15 leads, so its quality cannot be judged. It now appears under “Not enough data yet” (“Lead sources cannot be compared yet”). With 90 days or all data it is a recommendation again.',
  'B:cadence:ev': 'The 19-day gap (no posts between 2026-09-06 and 2026-09-25) started before the period (2026-09-21) and continued inside it, so it is shown in the 28-day view too, counted from the last post before the period (correction of 2026-11-20). The post count now covers this period.',
  'B:cadence:conf': 'The 28-day sample is smaller, so the computed confidence changed. ' + CONF,
  'B:eng-drop:ev': 'With a period chosen, the engagement trend now compares this period with the period before it (as the KPI cards do: “vs the 28 days before”) instead of the last 28 days against all earlier posts. Before this change the rule could never run in the 28-day view.',
};
