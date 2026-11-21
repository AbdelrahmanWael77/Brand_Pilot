// P6 (2026-11-20): the track record, tested with synthetic before/after data. A recommendation becomes a campaign or a
// task → the server saves metric, baseline, direction, target and window; once the data covers the window the step is
// evaluated once, written to the trail; the score appears only from 5 evaluated steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createData } from '../server/data.js';
import { createTrack, judge, planFor, SCORE_MIN, MIN_CHANGE } from '../server/track.js';
import { createApp } from '../server/app.js';

const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const days = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
/** GA4 rows: each day 60 mobile sessions (mobileEnq enquiries) and 40 desktop sessions (4 enquiries). Synthetic. */
const ga4 = (from, n, mobileEnq) => days(from, n).flatMap((date) => [
  { date, channel: 'Organic Social', landing_page: '/', device: 'mobile', sessions: 60, enquiries: mobileEnq, synthetic: true },
  { date, channel: 'Organic Search', landing_page: '/', device: 'desktop', sessions: 40, enquiries: 4, synthetic: true },
]);
const BEFORE = '2026-09-03'; // 28 days before the step
const START = new Date('2026-10-01T09:00:00Z'); // the day the recommendation became a campaign or task
const END = '2026-10-28';

function setup() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'owner@example.com', 'x', 'x')").run();
  const co = (id) => { db.prepare("INSERT INTO companies (id, name, created_by, created_at) VALUES (?, ?, 'u1', 'x')").run(id, id); return id; };
  const data = createData(db);
  const put = (id, ga) => data.mirror(id, { data: { meta: [], ga4: ga, gsc: [], leads: [] } });
  return { db, co, put, track: createTrack(db) };
}
const trailRows = (db, id, kind) => db.prepare('SELECT * FROM trail WHERE company_id = ? AND kind = ? ORDER BY rowid').all(id, kind).map((r) => ({ ...r, detail: JSON.parse(r.detail) }));

test('the plan is saved from server data: metric, scope, baseline, direction, target, review window', async () => {
  const { db, co, put, track } = setup();
  const c = co('c1');
  put(c, ga4(BEFORE, 28, 1)); // mobile 1/60 enquiries per day vs desktop 4/40
  const { step } = track.start(c, 'u1', { recId: 'mobile-gap', kind: 'campaign', ref: 'k1', range: '28' }, { now: START });
  assert.equal(step.metric, 'enquiry_rate');
  assert.deepEqual(step.scope, { key: 'device', value: 'mobile' });
  assert.equal(step.direction, 'up');
  assert.deepEqual(step.baselinePeriod, [BEFORE, '2026-09-30']);
  assert.equal(step.baselineN, 60 * 28);
  assert.ok(Math.abs(step.baseline - 1 / 60) < 1e-12);
  assert.ok(Math.abs(step.target - (1 / 60) * (1 + MIN_CHANGE)) < 1e-12);
  assert.deepEqual(step.window, ['2026-10-01', END]);
  assert.equal(step.outcome, null);
  assert.equal(step.title.en, 'Phone visitors get in touch far less than computer visitors');
  assert.match(step.title.ar, /الجوال/);
  // in the trail, with who and the plan
  const [t] = trailRows(db, c, 'step_tracked');
  assert.equal(t.user_email, 'owner@example.com');
  assert.equal(t.detail.metric, 'enquiry_rate');
  assert.deepEqual(t.detail.window, ['2026-10-01', END]);
  // the same campaign again: the first plan stays, nothing new is written
  assert.equal(track.start(c, 'u1', { recId: 'mobile-gap', kind: 'campaign', ref: 'k1' }, { now: new Date('2026-10-05T00:00:00Z') }).step.id, step.id);
  assert.equal(trailRows(db, c, 'step_tracked').length, 1);
  // a channel recommendation is tracked on that channel only (the subject is read on the server, never sent out)
  const leak = track.start(c, 'u1', { recId: 'ch-leak', kind: 'task', ref: 't-leak' }, { now: START }).step;
  assert.deepEqual(leak.scope, { key: 'channel', value: 'Organic Social' });
  assert.ok(Math.abs(leak.baseline - 1 / 60) < 1e-12);
  const { audit } = await import('../server/audit.js');
  assert.ok(!JSON.stringify(audit(db, c, { range: '28' })).includes('"subject"'));
  // an information gap has no number to move: tracked without a metric, never evaluated
  assert.equal(planFor({ id: 'no-gsc', basis: 'insufficient' }), null);
  const gap = track.start(c, 'u1', { recId: 'no-gsc', kind: 'task', ref: 't-gap' }, { now: START }).step;
  assert.equal(gap.metric, null);
  assert.deepEqual(track.start(c, 'u1', { recId: 'nope', kind: 'task', ref: 't9' }, { now: START }), { error: 'not_found' });
});

test('evaluated only once data covers the window: met, written to the trail, never re-evaluated', () => {
  const { db, co, put, track } = setup();
  const c = co('c1');
  put(c, ga4(BEFORE, 28, 1));
  const { step } = track.start(c, 'u1', { recId: 'mobile-gap', kind: 'task', ref: 't1' }, { now: START });
  // half the window: waiting
  put(c, [...ga4(BEFORE, 28, 1), ...ga4('2026-10-01', 14, 3)]);
  let r = track.record(c, { now: new Date('2026-10-20T00:00:00Z') });
  assert.equal(r.steps[0].outcome, null);
  assert.equal(r.waitingUntil, END);
  assert.equal(r.score, null);
  assert.equal(trailRows(db, c, 'evaluation').length, 0);
  // the whole window: 3/60 mobile enquiries per day vs 1/60 before → met
  put(c, [...ga4(BEFORE, 28, 1), ...ga4('2026-10-01', 28, 3)]);
  r = track.record(c, { now: new Date('2026-11-02T00:00:00Z') });
  const s = r.steps[0];
  assert.equal(s.outcome, 'met');
  assert.ok(Math.abs(s.result - 3 / 60) < 1e-12);
  assert.equal(s.resultN, 60 * 28);
  const [ev] = trailRows(db, c, 'evaluation');
  assert.equal(s.trailId, ev.id);
  assert.equal(ev.subject, 'mobile-gap');
  assert.equal(ev.engine, 'rules');
  assert.equal(ev.detail.outcome, 'met');
  assert.equal(ev.detail.stepId, step.id);
  assert.deepEqual(ev.detail.window, ['2026-10-01', END]);
  assert.deepEqual(ev.detail.baselinePeriod, [BEFORE, '2026-09-30']);
  // later data changes do not re-evaluate it, and no second trail row is written
  put(c, [...ga4(BEFORE, 28, 1), ...ga4('2026-10-01', 40, 0)]);
  track.record(c);
  assert.equal(track.record(c).steps[0].outcome, 'met');
  assert.equal(trailRows(db, c, 'evaluation').length, 1);
});

test('not met, no change and inconclusive (too few sessions) with synthetic after-data', () => {
  const cases = [[0, 'not_met'], [1, 'no_change']];
  for (const [after, want] of cases) {
    const { co, put, track } = setup();
    const c = co('c1');
    put(c, ga4(BEFORE, 28, 1));
    track.start(c, 'u1', { recId: 'mobile-gap', kind: 'task', ref: 't1' }, { now: START });
    put(c, [...ga4(BEFORE, 28, 1), ...ga4('2026-10-01', 28, after)]);
    assert.equal(track.record(c).steps[0].outcome, want, `after ${after}/60`);
  }
  // the window has data, but almost no mobile sessions: inconclusive, not counted
  const { co, put, track } = setup();
  const c = co('c1');
  put(c, ga4(BEFORE, 28, 1));
  track.start(c, 'u1', { recId: 'mobile-gap', kind: 'task', ref: 't1' }, { now: START });
  const tiny = days('2026-10-01', 28).map((date, i) => ({ date, channel: 'Organic Search', landing_page: '/', device: i === 27 ? 'mobile' : 'desktop', sessions: i === 27 ? 2 : 40, enquiries: 1, synthetic: true }));
  put(c, [...ga4(BEFORE, 28, 1), ...tiny]);
  const r = track.record(c);
  assert.equal(r.steps[0].outcome, 'inconclusive');
  assert.equal(r.evaluated, 0);
  // judge() at the edges
  assert.equal(judge(0.1, 0.1049, 'up'), 'no_change');
  assert.equal(judge(0.1, 0.106, 'up'), 'met');
  assert.equal(judge(0.1, 0.09, 'down'), 'met');
  assert.equal(judge(0, 3, 'up'), 'met');
  assert.equal(judge(0, 0, 'up'), 'no_change');
});

test(`the score appears only from ${SCORE_MIN} evaluated steps; before that: waiting for data until a date`, () => {
  const { co, put, track } = setup();
  const c = co('c1');
  put(c, ga4(BEFORE, 28, 1));
  for (let i = 1; i <= 4; i++) track.start(c, 'u1', { recId: 'mobile-gap', kind: i % 2 ? 'task' : 'campaign', ref: `s${i}` }, { now: START });
  put(c, [...ga4(BEFORE, 28, 1), ...ga4('2026-10-01', 28, 3)]);
  let r = track.record(c);
  assert.equal(r.evaluated, 4);
  assert.equal(r.score, null, 'four evaluated steps: no score yet');
  // a fifth step, started later: the record waits for its window
  track.start(c, 'u1', { recId: 'mobile-gap', kind: 'task', ref: 's5' }, { now: new Date('2026-10-29T08:00:00Z') });
  r = track.record(c);
  assert.equal(r.score, null);
  assert.equal(r.waitingUntil, '2026-11-25');
  // its window is covered: 5 evaluated, the score is shown
  put(c, [...ga4(BEFORE, 28, 1), ...ga4('2026-10-01', 56, 3)]);
  r = track.record(c);
  assert.equal(r.evaluated, 5);
  // the fifth step's baseline is the improved period itself (3/60), and the rate stayed there: no change
  assert.equal(r.steps.find((s) => s.ref === 's5').outcome, 'no_change');
  assert.deepEqual(r.score, { met: 4, of: 5, share: 0.8 });
  assert.equal(r.waitingUntil, null);
});

test('routes: a member saves and reads plans; another account cannot; the page cannot send numbers', async () => {
  const db = openDb(':memory:');
  const server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, cookie, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const user = async (email) => (await call('POST', '/api/auth/register', null, { email, password: 'correct horse battery' })).headers.getSetCookie()[0].split(';')[0];
  try {
    const alice = await user('alice@example.com');
    const bob = await user('bob@example.com');
    const co = (await (await call('POST', '/api/companies', alice, { name: 'A' })).json()).company.id;
    const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    await call('PUT', `/api/companies/${co}/state`, alice, { state: { data: { meta: [], ga4: ga4(addDays(end, -27), 28, 1), gsc: [], leads: [] } } });
    const r = await call('POST', `/api/companies/${co}/track`, alice, { recId: 'mobile-gap', kind: 'campaign', ref: 'k1', range: '28', baseline: 99, metric: 'sessions' });
    assert.equal(r.status, 201);
    const { step } = await r.json();
    assert.equal(step.metric, 'enquiry_rate', 'the metric comes from the server plan');
    assert.ok(Math.abs(step.baseline - 1 / 60) < 1e-12, 'the baseline comes from the server data');
    const rec = await (await call('GET', `/api/companies/${co}/track`, alice)).json();
    assert.equal(rec.steps.length, 1);
    assert.equal(rec.score, null);
    assert.equal(rec.needed, 5);
    assert.equal(rec.waitingUntil, step.window[1]);
    assert.equal((await call('GET', `/api/companies/${co}/track`, bob)).status, 404);
    assert.equal((await call('POST', `/api/companies/${co}/track`, bob, { recId: 'mobile-gap', kind: 'task', ref: 't1' })).status, 404);
    assert.equal((await call('POST', `/api/companies/${co}/track`, alice, { recId: 'mobile-gap', kind: 'other', ref: 't1' })).status, 400);
    assert.equal((await call('POST', `/api/companies/${co}/track`, alice, { recId: 'mobile-gap', kind: 'task', ref: 't1', windowDays: 3 })).status, 400);
    assert.equal((await call('POST', `/api/companies/${co}/track`, alice, { recId: 'nope', kind: 'task', ref: 't1' })).status, 404);
    // another company of bob's sees none of it
    const coB = (await (await call('POST', '/api/companies', bob, { name: 'B' })).json()).company.id;
    assert.deepEqual((await (await call('GET', `/api/companies/${coB}/track`, bob)).json()).steps, []);
  } finally {
    server.close();
    db.close();
  }
});
