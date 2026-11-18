import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* public/schedule.js is a classic browser script; run it in a sandbox and take its global. */
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../public/schedule.js', import.meta.url), 'utf8'), ctx);
const S = ctx.BPSchedule;
const J = (x) => JSON.parse(JSON.stringify(x));

const fb = (date, reach, engagements, extra = {}) => ({ date, platform: 'facebook', reach, engagements, ...extra });
// 2026-11-03, 10, 17 are Tuesdays (rate 0.10); the rest of the days rate 0.03.
const OWN = [
  fb('2026-11-03', 1000, 100), fb('2026-11-10', 1000, 100), fb('2026-11-17', 1000, 100),
  fb('2026-11-01', 1000, 30), fb('2026-11-02', 1000, 30), fb('2026-11-04', 1000, 30), fb('2026-11-05', 1000, 30),
  fb('2026-11-08', 1000, 30), fb('2026-11-09', 1000, 30), fb('2026-11-11', 1000, 30),
];

test('workDays: Sun–Thu in Cairo, Mon–Fri in Dubai and London', () => {
  assert.deepEqual(J(S.workDays('Africa/Cairo')), [0, 1, 2, 3, 4]);
  assert.deepEqual(J(S.workDays('Asia/Dubai')), [1, 2, 3, 4, 5]);
  assert.deepEqual(J(S.workDays('Europe/London')), [1, 2, 3, 4, 5]);
});

test('hourIn: Facebook Pacific hours move to Cairo across daylight saving; a bad zone leaves the hour', () => {
  assert.equal(S.hourIn('2026-10-02', 9, 'America/Los_Angeles', 'Africa/Cairo'), 19);
  assert.equal(S.hourIn('2026-12-02', 9, 'America/Los_Angeles', 'Africa/Cairo'), 19);
  assert.equal(S.hourIn('2026-10-02', 9, 'Bad/Zone', 'Africa/Cairo'), 9);
});

test('bestTimes: too few posts → peak days and peak hours', () => {
  const t = S.bestTimes(OWN.slice(0, 7), 'facebook', 'Africa/Cairo');
  assert.equal(t.days.src, 'peak');
  assert.equal(t.hours.src, 'peak');
});

test('bestTimes: own best day comes from engagement per reach', () => {
  const t = S.bestTimes(OWN, 'facebook', 'Africa/Cairo');
  assert.equal(t.days.src, 'data');
  assert.equal(t.days.d[0], 2);
  assert.equal(t.days.n, 10);
});

test('bestTimes: paid posts are ignored', () => {
  const paid = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'].map((d) => fb(d, 1000, 500, { spend: 50 }));
  const t = S.bestTimes(OWN.concat(paid), 'facebook', 'Africa/Cairo');
  assert.ok(!t.days.d.includes(1));
});

test('bestTimes: own hours from posts that carry a publish hour', () => {
  const rows = [19, 19, 19].map((h) => fb('2026-11-03', 1000, 100, { hour: h }))
    .concat([10, 10, 10, 13, 13, 13].map((h) => fb('2026-11-04', 1000, 20, { hour: h })));
  const t = S.bestTimes(rows, 'facebook', 'Africa/Cairo');
  assert.equal(t.hours.src, 'data');
  assert.deepEqual(J(t.hours.h), [[18, 21]]);
});

// ---- Task 2: sourced peak windows per region ----
test('region: Middle East zones vs the rest', () => {
  assert.equal(S.region('Asia/Dubai'), 'mena');
  assert.equal(S.region('Africa/Cairo'), 'mena');
  assert.equal(S.region('Europe/Berlin'), 'global');
});

test('bestTimes fallback: Cairo Facebook = evening windows on every work day', () => {
  const t = S.bestTimes([], 'facebook', 'Africa/Cairo');
  assert.deepEqual(J(t.hours.h), [[16, 18], [20, 22]]);
  assert.deepEqual(J(t.days.d), [0, 1, 2, 3, 4]);
});

test('bestTimes fallback: London Facebook = midday and early evening, mid-week', () => {
  const t = S.bestTimes([], 'facebook', 'Europe/London');
  assert.deepEqual(J(t.hours.h), [[12, 14], [18, 20]]);
  assert.deepEqual(J(t.days.d), [2, 3, 4]);
});

test('bestTimes fallback: Cairo LinkedIn = mid-week of a Sun–Thu week', () => {
  assert.deepEqual(J(S.bestTimes([], 'linkedin', 'Africa/Cairo').days.d), [1, 2, 3]);
});

// ---- Task 3: placement ----
const NOW = new Date('2026-11-18T22:30:00Z'); // 00:30 on 19 November in Cairo
const cairoPeak = () => ({ tz: 'Africa/Cairo', wd: [0, 1, 2, 3, 4], days: { src: 'peak', d: [0, 1, 2, 3, 4] }, hours: { src: 'peak', h: [[16, 18], [20, 22]] } });
const item = (n, lang, ch = 'facebook') => ({ key: `${ch}-${n}-${lang}`, ch, lang, pair: `post|${ch}|${n}|` });
const SIX = [1, 2, 3].map((n) => item(n, 'en')).concat([1, 2, 3].map((n) => item(n, 'ar')));
const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

test('localToday: the date in the audience zone, not UTC', () => {
  assert.equal(S.localToday('Africa/Cairo', NOW), '2026-11-19');
  assert.equal(S.localToday('UTC', NOW), '2026-11-18');
});

test('place: English and Arabic of a post share a day, English first window, Arabic second', () => {
  const rows = J(S.place(SIX, cairoPeak, null, 'Africa/Cairo', NOW));
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map((r) => r.date)).size, 3);
  for (const n of [1, 2, 3]) {
    const en = rows.find((r) => r.key === `facebook-${n}-en`), ar = rows.find((r) => r.key === `facebook-${n}-ar`);
    assert.equal(en.date, ar.date);
    assert.equal(en.time, '16:00');
    assert.equal(ar.time, '20:00');
  }
  assert.equal(rows[0].date, '2026-11-22'); // Fri 20 and Sat 21 are not work days in Cairo
});

test('place: single language posts get the first window', () => {
  const rows = J(S.place([1, 2, 3].map((n) => item(n, 'en')), cairoPeak, null, 'Africa/Cairo', NOW));
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.time === '16:00'));
});

test('place: a campaign stays within 14 days of its start even with one best weekday', () => {
  const wedOnly = () => ({ ...cairoPeak(), days: { src: 'data', d: [3] } });
  const rows = J(S.place([1, 2, 3].map((n) => item(n, 'en')), wedOnly, null, 'Africa/Cairo', NOW));
  const start = '2026-11-20';
  assert.ok(rows.every((r) => r.date <= addD(start, 13)), JSON.stringify(rows));
  assert.equal(rows.find((r) => r.key === 'facebook-1-en').date, '2026-11-25');
  assert.ok(rows.every((r) => r.src === 'data'));
});

test('place: a past or garbled start falls back to tomorrow in the audience zone', () => {
  const first = (s) => J(S.place(SIX, cairoPeak, s, 'Africa/Cairo', NOW))[0].date;
  assert.equal(first('2020-01-01'), first(null));
  assert.equal(first('nonsense'), first(null));
  assert.equal(first('2027-02-31'), first(null));
});

test('place: the user start date is respected', () => {
  const rows = J(S.place(SIX, cairoPeak, '2026-12-06', 'Africa/Cairo', NOW));
  assert.ok(rows[0].date >= '2026-12-06');
});

test('place: one window only → the second language two hours later', () => {
  const one = () => ({ ...cairoPeak(), hours: { src: 'peak', h: [[10, 11]] } });
  const rows = J(S.place([item(1, 'en', 'email'), item(1, 'ar', 'email')], one, null, 'Africa/Cairo', NOW));
  assert.deepEqual(rows.map((r) => r.time), ['10:00', '12:00']);
});

// ---- Final review fixes ----
test('place: carousel slides share one day; every slide of a language gets that language window', () => {
  const slide = (j, lang) => ({ key: `s${j}-${lang}`, ch: 'facebook', lang, pair: 'post|facebook|carousel' });
  const items = [1, 2, 3].map((j) => slide(j, 'en')).concat([1, 2, 3].map((j) => slide(j, 'ar')));
  const rows = J(S.place(items, cairoPeak, null, 'Africa/Cairo', NOW));
  assert.equal(new Set(rows.map((r) => r.date)).size, 1);
  assert.ok(rows.filter((r) => r.key.endsWith('-en')).every((r) => r.time === '16:00'));
  assert.ok(rows.filter((r) => r.key.endsWith('-ar')).every((r) => r.time === '20:00'));
  assert.deepEqual(rows.filter((r) => r.key.endsWith('-en')).map((r) => r.key), ['s1-en', 's2-en', 's3-en']);
});

test('cleanHour: an integer 0–23 or HH:MM / 7 PM text; anything else is no hour', () => {
  assert.equal(S.cleanHour(19), 19);
  assert.equal(S.cleanHour('19'), 19);
  assert.equal(S.cleanHour('19:00'), 19);
  assert.equal(S.cleanHour('7 PM'), 19);
  assert.equal(S.cleanHour('12 am'), 0);
  assert.equal(S.cleanHour(0), 0);
  for (const v of ['', null, undefined, 24, 7.5, -1, 'soon', '25:00']) assert.equal(S.cleanHour(v), undefined, JSON.stringify(v));
});

test('hourIn: late October (Cairo back on winter time, Los Angeles still on summer time) → 18', () => {
  assert.equal(S.hourIn('2026-10-30', 9, 'America/Los_Angeles', 'Africa/Cairo'), 18);
});

// ---- Deferred minors, fixed 2026-11-18 ----
test('bestTimes: own best day is the weekday where the audience lives (Sat 23:00 UTC = Sun 01:00 Cairo)', () => {
  const sync = (d, h, eng) => fb(d, 1000, eng, { hour: h, htz: 'UTC' });
  const rows = ['2026-11-07', '2026-11-14', '2026-11-21'].map((d) => sync(d, 23, 100)) // Saturdays in UTC
    .concat(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-09', '2026-11-10', '2026-11-11'].map((d) => sync(d, 10, 30)));
  const t = S.bestTimes(rows, 'facebook', 'Africa/Cairo');
  assert.equal(t.days.src, 'data');
  assert.equal(t.days.d[0], 0);
  assert.ok(!t.days.d.includes(6));
});

test('localToday: does not depend on how a locale formats dates', () => {
  const Real = Intl.DateTimeFormat;
  const usOnly = function (_loc, opts) { return new Real('en-US', opts); }; // format() gives 11/19/2026
  const ctx2 = { Intl: { DateTimeFormat: usOnly } };
  vm.runInNewContext(readFileSync(new URL('../public/schedule.js', import.meta.url), 'utf8'), ctx2);
  assert.equal(ctx2.BPSchedule.localToday('Africa/Cairo', NOW), '2026-11-19');
});
