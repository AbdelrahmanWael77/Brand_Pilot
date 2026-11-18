# Posting Schedule v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The campaign calendar puts every piece on the days and hours most likely to get engagement: the company's own results when it has enough, otherwise sourced general guidance for its region. English and Arabic versions of a post go out on the same day, and the user picks the start date.

**Architecture:** Commit `e3d7b2c` (task 24c) already added the "When to post" card, audience time zone + work week, best days from own results, hours from imported publish times and a peak-time fallback. All of it lives inline in `public/index.html`, where it cannot be unit-tested. This plan moves the pure scheduling logic into a new classic script `public/schedule.js` (global `BPSchedule`). That is the same pattern as `public/compare.js` / `test/compare.test.js`. The plan then fixes the remaining gaps there: language pairing, start date, a cap on how far one campaign spreads, region-specific sourced guidance and hours from the live Meta sync.

**Tech Stack:** Vanilla JS (classic browser script), Node ≥22.5 `node:test` + `node:vm`, Express 5 server.

**Spec:** No separate spec. This is the owner's request of 2026-11-18 in chat: "plan all of them" (pair EN/AR, best times from own data, user-set start date / work week / time zone) "+ figure out best known posting days and times for high engagement". The owner accepted fallback A: sourced general guidance, always labelled, replaced by own data when there is enough.

## Already done by 24c (do not rebuild)
`audTz(c)` (`c.tz` → first market in approved facts → browser zone), `TZS`, `MKTZ`, `workDays(z)`, `hourIn()`, `bestTimes(c,ch)`, `whenHTML(c,camp)`, `calendar(c,camp)`, `A.tzSet`, and the import keeping `o.hour` / `o.htz` from Facebook and Instagram native exports. All of these are in `public/index.html`, around the comment `/* When to post (owner 2026-11-18)`.

## What is still wrong (each is one task below)
1. Untestable: the logic sits inside `index.html` (Task 1).
2. The fallback windows have no source and are the same for every region (Task 2).
3. EN posts are placed first and AR posts after them, so each language still lands in its own stretch of days. When own data finds only one or two best weekdays, the 60-day search spreads a campaign over many weeks. The start is fixed at "tomorrow in UTC" (Task 3).
4. The user cannot set the start date. The CSV has no time zone column (Task 4).
5. The live Meta sync (`server/meta.js` `fbRow` / `igRow`) keeps only the date, so synced posts never teach hours. The server schema drops `hour` (Task 5).

## Global Constraints
- Every visible string is bilingual through `L('en','ar')`. Arabic screens stay RTL.
- Guidance that does not come from the company's data is labelled as such on screen (AGENTS.md: never present outside or synthetic data as the company's own).
- No new dependencies. `public/schedule.js` has no DOM and no wording: it returns codes (`'data'` / `'peak'`), and `index.html` turns them into words.
- Server schema `SCHEMAS.meta` in `server/data.js` and `SCH.meta` in `public/index.html` stay identical (comment in data.js says so).
- Test command for the project only: `node --test test/*.test.js` (plain `npm test` also collects an old copy under `data/`; see `.knowledge/cerebrum.md` 2026-11-18).
- After each task: update `IMPLEMENTATION_STATUS.md` and overwrite `NEXT_AGENT_PROMPT.md` (AGENTS.md handoff protocol).

## Review Focus
1. **Audience day ≠ UTC day**: at 00:30 Cairo time, "tomorrow" must be tomorrow in Cairo, not in UTC (Task 3, test `localToday`).
2. **A campaign in one language only**: a post with no twin is a group of one and gets the first window (Task 3, test `place: single language`).
3. **Own data finds a single best weekday**: the campaign must not spread past 14 days from the start (Task 3, test `place: span cap`).
4. **Facebook native hours are Pacific time, with DST**: a 09:30 Pacific post in October maps to 19:00 or 18:00 Cairo, not 09:00 (Task 1, test `hourIn`).
5. **A start date in the past or garbled**: it falls back to tomorrow in the audience zone, without an error (Task 3, test `place: bad start`).

---

### Task 1: Move the scheduling logic into `public/schedule.js` (no behaviour change)

**Files:**
- Create: `public/schedule.js`
- Create: `test/schedule.test.js`
- Modify: `public/index.html`: add `<script src="schedule.js"></script>` next to `compare.js` (≈ line 1551). Replace the inline `workDays`, `PEAK`, `hourIn` and `bestTimes` bodies with thin wrappers.

**Interfaces:**
- Produces (global `BPSchedule`):
  - `workDays(z: string): number[]`: `[0,1,2,3,4]` for the Sun–Thu zones in today's regex, else `[1,2,3,4,5]` (0 = Sunday).
  - `hourIn(dISO: string, h: number, from: string, to: string): number`: same as today.
  - `bestTimes(rows: object[], ch: string, z: string): {tz, wd, ch, days:{src:'data'|'peak', d:number[], n?, lift?}, hours:{src:'data'|'peak', h:[number,number][], n?}}`: today's algorithm. `rows` are `c.data.meta` rows.
  - `PEAK`: today's table, unchanged in this task.
- `index.html` keeps the names its callers use: `const workDays=BPSchedule.workDays, hourIn=BPSchedule.hourIn, bestTimes=(c,ch)=>BPSchedule.bestTimes((c.data&&c.data.meta)||[],ch,audTz(c))`.

- [ ] **Step 1: Write the failing tests** in `test/schedule.test.js`. Load the script the same way as `test/compare.test.js` (`vm.runInNewContext` → `ctx.BPSchedule`; compare objects through `JSON.parse(JSON.stringify(x))`).
  - `workDays`: `workDays('Africa/Cairo')` → `[0,1,2,3,4]`; `workDays('Asia/Dubai')` → `[1,2,3,4,5]`; `workDays('Europe/London')` → `[1,2,3,4,5]`.
  - `hourIn`: `hourIn('2026-10-02', 9, 'America/Los_Angeles', 'Africa/Cairo')` → `19` (PDT −7, Cairo +3 in October 2026, Egypt DST). `hourIn('2026-12-02', 9, 'America/Los_Angeles', 'Africa/Cairo')` → `19` (PST −8, Cairo +2). `hourIn('2026-10-02', 9, 'Bad/Zone', 'Africa/Cairo')` → `9`.
  - `bestTimes: too few posts` → with 7 organic Facebook rows: `days.src === 'peak'` and `hours.src === 'peak'`.
  - `bestTimes: own best day`: 10 organic Facebook rows in Cairo, with Tuesdays at engagement/reach 0.10 (3 posts) and all other days at 0.03. Expect `days.src === 'data'`, `days.d[0] === 2`, `days.n === 10`.
  - `bestTimes: paid posts ignored`: the same rows plus 5 Monday rows with `spend: 50` and a high rate → Monday is not in `days.d`.
  - `bestTimes: own hours`: 9 rows with `hour` (Cairo zone, no `htz`), with the 18–21 block clearly best and ≥3 rows in it → `hours.src === 'data'` and `hours.h` deep-equals `[[18,21]]`.
- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/schedule.test.js`. Expected: FAIL (`public/schedule.js` does not exist).
- [ ] **Step 3: Create `public/schedule.js`** as an IIFE on `typeof window!=='undefined'?window:globalThis` (copy the `compare.js` wrapper). Move the four definitions in as they are. `bestTimes` takes `rows, ch, z` instead of `c, ch`.
- [ ] **Step 4: Wire `index.html`** to the wrappers above, and delete the moved inline code.
- [ ] **Step 5: Run the tests.** Run `node --test test/*.test.js`. Expected: all pass.
- [ ] **Step 6: Check the app in a browser.** Run `npm start` (port from `.env`, 4000), open a campaign → Calendar & links. The "When to post" card and the calendar look exactly as before, with no console errors.
- [ ] **Step 7: Commit:** `git add public/schedule.js test/schedule.test.js public/index.html` → `git commit -m "Schedule: move When-to-post logic into public/schedule.js with tests"`.

---

### Task 2: Sourced fallback times per region

These are the owner's "best known posting days and times". The research is summarised here so the implementer does not repeat it. It is generic and mostly from vendor studies, so it stays labelled "general guidance".
- Sprout Social, 2026 (≈2B engagements, ~307k profiles): overall best Tue–Wed 11:00–18:00 local, Sunday weakest. Facebook Tue–Wed 12:00–20:00. https://sproutsocial.com/insights/best-times-to-post-on-social-media/
- Instagram: mid-week (Wed–Thu), late morning to early afternoon. LinkedIn: Tue–Thu, office hours plus late afternoon. (Third-party roundups, which conflict with each other: https://postfa.st/blog/best-time-to-post-on-social-media)
- Middle East: a 9-country Facebook study (300k posts, Ramadan) found Egypt peaking at 16:00, UAE at 19:00 and Saudi Arabia at 22:00. Saudi Instagram sources report 11:00–12:00 and ~22:00. Gulf weekends differ (UAE Sat–Sun; KSA, Qatar, Kuwait, Bahrain, Oman Fri–Sat). https://thinkmarketingmagazine.com/?p=26033 , https://timetopost.co/best-time-to-post/instagram/gulf-weekend-split/

**Files:**
- Modify: `public/schedule.js`, `test/schedule.test.js`, `public/index.html` (the `whenHTML` label only)

**Interfaces:**
- Produces: `region(z: string): 'mena'|'global'`. It returns `'mena'` for `Africa/Cairo` and `Asia/(Riyadh|Dubai|Kuwait|Qatar|Bahrain|Muscat|Baghdad|Amman|Aden|Beirut)`, and `'global'` for everything else.
- Produces: `PEAK = { mena: {...}, global: {...} }`, with exactly these values (local time, end hour exclusive; `mid:true` = days `wd.slice(1,4)`, otherwise all work days):

| | global | mena |
|---|---|---|
| facebook | `h:[[12,14],[18,20]], mid:true` | `h:[[16,18],[20,22]]` |
| instagram | `h:[[11,13],[17,19]], mid:true` | `h:[[12,14],[20,22]]` |
| linkedin | `h:[[10,12],[15,17]], mid:true` | `h:[[10,12],[13,15]], mid:true` |
| email | `h:[[10,11]], mid:true` | `h:[[10,11]], mid:true` |

  Put the source links above as a comment over `PEAK`. `bestTimes` picks `PEAK[region(z)][ch] || PEAK[region(z)].linkedin`.

- [ ] **Step 1: Write failing tests:**
  - `region('Asia/Dubai')` → `'mena'`, and `region('Europe/Berlin')` → `'global'`.
  - `bestTimes([], 'facebook', 'Africa/Cairo').hours.h` deep-equals `[[16,18],[20,22]]`, and `.days.d` deep-equals `[0,1,2,3,4]`.
  - `bestTimes([], 'facebook', 'Europe/London').hours.h` deep-equals `[[12,14],[18,20]]`, and `.days.d` deep-equals `[2,3,4]`.
  - `bestTimes([], 'linkedin', 'Africa/Cairo').days.d` deep-equals `[1,2,3]`.
- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/schedule.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `region` and the new `PEAK`, and add `region` to the exported api.
- [ ] **Step 4: Relabel the fallback in `whenHTML`.** The hours label `'general guidance'` becomes `L('general guidance from published studies','إرشاد عام من دراسات منشورة')`.
- [ ] **Step 5: Run the tests.** Run `node --test test/*.test.js`. Expected: all pass.
- [ ] **Step 6: Commit:** `git commit -am "Schedule: sourced peak windows per region (MENA / global)"`.

---

### Task 3: Placement: language pairs, start date, 14-day span cap, the audience's "tomorrow"

**Files:**
- Modify: `public/schedule.js`, `test/schedule.test.js`, `public/index.html` (`calendar()`)

**Interfaces:**
- Produces: `localToday(z: string, now: Date): string`. Returns `YYYY-MM-DD` in zone `z`. On a bad zone it falls back to the UTC date.
- Produces: `place(items, timesFor, start, z, now): Row[]`
  - `items: {key:string, ch:string, lang:'en'|'ar', pair:string}[]` in asset order. `pair` is the twin key `type|channel|n|slide` (the same match as `twinOf` in index.html).
  - `timesFor(ch) → bestTimes(...)` result.
  - `start`: an ISO date or `null`. If it is `null`, invalid, or earlier than `localToday(z,now)+1`, the start is `localToday(z,now)+1`.
  - `Row = {key, date:'YYYY-MM-DD', time:'HH:00', src:'data'|'peak'}`. Rows are sorted by date, then time.
- Placement rule (the implementer cannot infer this):
  1. Group the items by `pair`, in order of first appearance. Within a group, `'en'` comes before `'ar'`.
  2. For each group, take `t = timesFor(ch)`. Its date is the first date `d ≥ start` that no earlier group has used and whose weekday is in `t.days.d`, searching only up to `start+13`. If there is none, take the first unused date in that range whose weekday is in `t.wd`. If there is still none, take the first unused date `≥ start`.
  3. Member `k` of the group gets the window `t.hours.h[k % h.length]`, so English takes the first window and Arabic the second. If `h.length === 1` and `k > 0`, the hour is `min(h[0][0] + 2*k, 23)`.
  4. `src` is `'data'` if `t.days.src` or `t.hours.src` is `'data'`, otherwise `'peak'`.
- `index.html` `calendar(c,camp)` builds `items` from `camp.assets` (posts, then emails; `ch = type==='email'?'email':channel`). It calls `BPSchedule.place(items, ch=>bestTimes(c,ch), camp.start||null, audTz(c), new Date())` and maps the rows back to `{date, time, a, why: src, tz}` (the same row shape the plan tab and CSV read today).

- [ ] **Step 1: Write failing tests.** Use a fixed `now = new Date('2026-11-18T22:30:00Z')`, which is 00:30 on 19 November in Cairo. Use a stub `timesFor` that returns Cairo peak times (`days.d:[0,1,2,3,4]`, `wd:[0,1,2,3,4]`, `h:[[16,18],[20,22]]`, src `'peak'`).
  - `localToday`: `localToday('Africa/Cairo', now)` → `'2026-11-19'`, and `localToday('UTC', now)` → `'2026-11-18'`.
  - `place: pairs share a day`: items for Post 1–3 in EN, then Post 1–3 in AR, all Facebook. The result has 6 rows on 3 distinct dates. Each EN/AR pair has the same date; EN is at `'16:00'` and AR at `'20:00'`. The first date is `'2026-11-22'` (Sunday), because 20 and 21 November (Fri, Sat) are not work days.
  - `place: single language`: three EN-only items → 3 rows, all at `'16:00'`.
  - `place: span cap`: a stub with `days.d:[3]` (Wednesday only, src `'data'`) and 3 groups. Every date is ≤ `start+13`. The first group falls on the first Wednesday ≥ start. The rows have `src === 'data'`.
  - `place: bad start`: `start = '2020-01-01'` and `start = 'nonsense'` both give the same first date as `start = null`.
  - `place: user start`: `start = '2026-12-06'` → the first date is ≥ `'2026-12-06'`.
- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/schedule.test.js`. Expected: FAIL (`place` / `localToday` are not functions).
- [ ] **Step 3: Implement** `localToday` (with `Intl.DateTimeFormat('en-CA',{timeZone:z})`) and `place` in `schedule.js`, then export both.
- [ ] **Step 4: Point `calendar()` in index.html at `BPSchedule.place`** as described in Interfaces, and delete the old placement loop.
- [ ] **Step 5: Run the tests.** Run `node --test test/*.test.js`. Expected: all pass.
- [ ] **Step 6: Check the app in a browser.** On the campaign from the owner's screenshot (Facebook + Instagram, EN + AR), Calendar & links shows each EN/AR pair on the same day, and the whole campaign fits within two weeks.
- [ ] **Step 7: Commit:** `git commit -am "Schedule: EN/AR on the same day, 14-day span cap, start in the audience's zone"`.

---

### Task 4: Start date control and time zone in the CSV

**Files:**
- Modify: `public/index.html`. In the plan tab header (`if(tab==='plan')`, the `pl-h` header next to the CSV button), add a date input. Add an action next to `tzSet`. Extend the CSV builder `cal=()=>csv(...)` in `ex(kind)`.

**Interfaces:**
- Consumes: `calendar(c,camp)` from Task 3, which reads `camp.start`.
- Produces: `camp.start: string|undefined` (an ISO date, saved with the campaign state like every other campaign field), and an action `calStart` wired with `data-c="calStart"` the same way `tzSet` is.

- [ ] **Step 1: Add the control.** It is `<label class="f">${L('Start on','البدء في')}<input type="date" data-c="calStart" value="${camp.start||<first calendar date>}" min="<localToday+1>"></label>`. The `calStart` action sets `camp.start` (or deletes it when empty), saves and re-renders.
- [ ] **Step 2: Extend the CSV.** The header becomes `['date','time','time_zone','channel','asset','language','link']`, and each row adds `r.tz` after the time.
- [ ] **Step 3: Check the app in a browser** (`npm start`). Set the start to a later Sunday: the calendar moves, and the setting survives a reload. Clear it: the calendar goes back to the earliest possible start. The CSV opens with the `time_zone` column. Check the Arabic/RTL view as well.
- [ ] **Step 4: Run the tests.** Run `node --test test/*.test.js`. Expected: all pass.
- [ ] **Step 5: Commit:** `git commit -am "Calendar: user start date; time zone column in the CSV"`.

---

### Task 5: The live Meta sync keeps the publish hour

**Files:**
- Modify: `server/meta.js` (`fbRow`, `igRow`), `server/data.js` (`SCHEMAS.meta`, `cleanRow`), `public/index.html` (`SCH.meta`)
- Test: `test/meta.test.js` (the existing `deepEqual`s at ≈ lines 79 and 90 gain the new fields), `test/data.test.js`

**Interfaces:**
- Produces: Meta rows may carry `hour: integer 0–23` and `htz: string` (an IANA zone). Synced rows use `htz: 'UTC'`, because `created_time` / `timestamp` are ISO times with an offset. `bestTimes` already converts any `htz` with `hourIn`.
- Schema: `SCHEMAS.meta.opt` gains `'hour','htz'`, and `num` gains `'hour'`. `SCH.meta` in index.html gets the same change.
- `cleanRow` rule: an `hour` that is not an integer from 0 to 23 is **dropped from the row**; the row is kept, not rejected. An `htz` longer than 64 characters is dropped.

- [ ] **Step 1: Update and add failing tests:**
  - In `test/meta.test.js`, the `fbRow` row for `created_time: '2026-11-10T23:30:00+0000'` now includes `hour: 23, htz: 'UTC'`. The `igRow` row for `'2026-11-11T10:00:00+0000'` includes `hour: 10, htz: 'UTC'`.
  - In `test/data.test.js`, `cleanRow('meta', {date:'2026-11-10', platform:'facebook', reach:5, engagements:1, hour:19, htz:'Africa/Cairo'})` keeps `hour: 19` and `htz`. With `hour: 24` the row is kept and has no `hour`. With `hour: 7.5` the row is kept and has no `hour`.
- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/meta.test.js test/data.test.js`. Expected: the new assertions FAIL.
- [ ] **Step 3: Implement.** Add `const hourOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? undefined : d.getUTCHours(); }` next to `day` in meta.js. Set `row.hour` / `row.htz = 'UTC'` when it is defined. Add the schema columns and the `cleanRow` rule.
- [ ] **Step 4: Run the tests.** Run `node --test test/*.test.js`. Expected: all pass.
- [ ] **Step 5: Commit:** `git commit -am "Meta sync keeps the publish hour (UTC) so own best hours can be learned"`.

---

### Task 6: Handoff

- [ ] Add task rows to `IMPLEMENTATION_STATUS.md` → Task queue (Agent / Reasoning / Dev effort: Sonnet 5.5 [Opus 5.5] · medium · 1 day in total), and a dated entry describing what changed and the test results.
- [ ] Overwrite `NEXT_AGENT_PROMPT.md` with the next single task.
- [ ] Add one line to `.knowledge/cerebrum.md`: "2026-11-18: schedule logic lives in public/schedule.js (BPSchedule, tested via vm); fallback windows are sourced, labelled general guidance; MENA vs global by time zone."
