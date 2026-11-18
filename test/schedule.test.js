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
