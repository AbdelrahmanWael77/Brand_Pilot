import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { computeMetrics, metrics } from '../server/metrics.js';

// ---- pure computation ----
const meta = (date, reach, eng, extra = {}) => ({ date, platform: 'facebook', reach, impressions: reach * 2, engagements: eng, link_clicks: 1, synthetic: false, ...extra });
const ga4 = (date, sessions, enquiries, extra = {}) => ({ date, channel: 'Direct', sessions, ...(enquiries === undefined ? {} : { enquiries }), synthetic: false, ...extra });
const gsc = (date, clicks, impressions) => ({ date, query: 'q', clicks, impressions, synthetic: false });
const lead = (date, status) => ({ date, status, synthetic: false });
const empty = () => ({ meta: [], ga4: [], gsc: [], leads: [] });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('no data at all: every KPI is null with reason no_data, no period', () => {
  const m = computeMetrics(empty(), '28');
  assert.equal(m.period, null);
  assert.equal(m.previous, null);
  assert.equal(m.synthetic, false);
  assert.equal(Object.keys(m.kpis).length, 16);
  for (const [name, k] of Object.entries(m.kpis)) assert.deepEqual(k, { value: null, rows: 0, synthetic: false, reason: 'no_data', previous: null }, name);
});

test('every KPI over the whole range', () => {
  const d = {
    meta: [meta('2026-11-01', 1000, 30, { spend: 100 }), meta('2026-11-03', 500, 20, { spend: 50 })],
    ga4: [ga4('2026-11-01', 200, 4), ga4('2026-11-02', 100, 2)],
    gsc: [gsc('2026-11-02', 5, 100), gsc('2026-11-03', 15, 300)],
    leads: [lead('2026-11-01', 'new'), lead('2026-11-02', 'qualified'), lead('2026-11-03', 'customer'), lead('2026-11-03', 'junk')],
  };
  const m = computeMetrics(d, 'all');
  assert.deepEqual(m.period, { from: '2026-11-01', to: '2026-11-03', days: 3 });
  assert.equal(m.previous, null);
  const v = Object.fromEntries(Object.entries(m.kpis).map(([k, x]) => [k, x.value]));
  assert.deepEqual(
    { ...v, enquiry_rate: null, ctr: null, qualified_share: null, cost_per_lead: null },
    { reach: 1500, impressions: 3000, engagements: 50, link_clicks: 2, spend: 150, sessions: 300, enquiries: 6, enquiry_rate: null, search_clicks: 20, search_impressions: 400, ctr: null, leads: 4, qualified_leads: 2, qualified_share: null, customers: 1, cost_per_lead: null },
  );
  near(v.enquiry_rate, 0.02);
  near(v.ctr, 0.05);
  near(v.qualified_share, 0.5);
  near(v.cost_per_lead, 37.5);
  assert.equal(m.kpis.reach.rows, 2);
  assert.equal(m.kpis.leads.rows, 4);
  assert.equal(m.kpis.cost_per_lead.rows, 2); // the smaller of the two datasets it needs
  assert.ok(Object.values(m.kpis).every((k) => k.reason === undefined && k.previous === null));
});

test('period maths: ends at the latest data date, clamps to the first, previous period only when it fits', () => {
  const d = empty();
  for (let i = 0; i < 20; i++) d.ga4.push(ga4(`2026-11-${String(i + 1).padStart(2, '0')}`, 10 + i, 1)); // 1..20 Nov
  d.leads.push(lead('2026-10-25', 'new')); // earliest date in any dataset

  const m7 = computeMetrics(d, '7');
  assert.deepEqual(m7.period, { from: '2026-11-14', to: '2026-11-20', days: 7 });
  assert.deepEqual(m7.previous, { from: '2026-11-07', to: '2026-11-13' });
  assert.equal(m7.kpis.sessions.value, 23 + 24 + 25 + 26 + 27 + 28 + 29);
  assert.equal(m7.kpis.sessions.previous, 16 + 17 + 18 + 19 + 20 + 21 + 22);
  assert.equal(m7.kpis.sessions.rows, 7);
  // Leads exist, but none inside this period → no_data, not 0.
  assert.deepEqual(m7.kpis.leads, { value: null, rows: 0, synthetic: false, reason: 'no_data', previous: null });

  const m28 = computeMetrics(d, '28'); // 28 days back from 20 Nov = 24 Oct, clamped to the first data date
  assert.deepEqual(m28.period, { from: '2026-10-25', to: '2026-11-20', days: 27 });
  assert.equal(m28.previous, null);
  assert.equal(m28.kpis.leads.value, 1);

  const m90 = computeMetrics(d, '90');
  assert.deepEqual(m90.period, m28.period);
  assert.deepEqual(computeMetrics(d, 'all').period, m28.period);
  assert.equal(computeMetrics(d).range, '28'); // default
});

test('not_measured vs no_data vs a real zero', () => {
  // Spend: column absent or all blank (stored as 0) → not_measured; so is cost per lead.
  const noSpend = { ...empty(), meta: [meta('2026-11-01', 100, 5), meta('2026-11-02', 100, 5, { spend: 0 })], leads: [lead('2026-11-01', 'new')] };
  let m = computeMetrics(noSpend, 'all');
  assert.deepEqual(m.kpis.spend, { value: null, rows: 2, synthetic: false, reason: 'not_measured', previous: null });
  assert.equal(m.kpis.cost_per_lead.reason, 'not_measured');
  assert.equal(m.kpis.reach.value, 200);

  // Spend present but no leads in the period → cost per lead has no data.
  m = computeMetrics({ ...empty(), meta: [meta('2026-11-01', 100, 5, { spend: 80 })] }, 'all');
  assert.equal(m.kpis.spend.value, 80);
  assert.deepEqual(m.kpis.cost_per_lead, { value: null, rows: 0, synthetic: false, reason: 'no_data', previous: null });

  // Enquiries never recorded in any GA4 row → not_measured (sessions still reported).
  m = computeMetrics({ ...empty(), ga4: [ga4('2026-11-01', 100, undefined), ga4('2026-11-02', 50, 0)] }, 'all');
  assert.equal(m.kpis.sessions.value, 150);
  assert.equal(m.kpis.enquiries.reason, 'not_measured');
  assert.equal(m.kpis.enquiry_rate.reason, 'not_measured');

  // Enquiries tracked overall but none this week → a real 0, and a 0 rate.
  const d = empty();
  for (let i = 1; i <= 14; i++) d.ga4.push(ga4(`2026-11-${String(i).padStart(2, '0')}`, 10, i <= 7 ? 1 : 0));
  m = computeMetrics(d, '7');
  assert.equal(m.kpis.enquiries.value, 0);
  assert.equal(m.kpis.enquiries.reason, undefined);
  assert.equal(m.kpis.enquiries.previous, 7);
  assert.equal(m.kpis.enquiry_rate.value, 0);
  near(m.kpis.enquiry_rate.previous, 0.1);

  // Zero denominators → no_data rather than NaN or Infinity.
  m = computeMetrics({ ...empty(), gsc: [gsc('2026-11-01', 0, 0)], ga4: [ga4('2026-11-01', 0, 1)] }, 'all');
  assert.equal(m.kpis.search_clicks.value, 0);
  assert.equal(m.kpis.ctr.reason, 'no_data');
  assert.equal(m.kpis.enquiry_rate.reason, 'no_data');
  // No leads qualified → share is a real 0.
  assert.equal(computeMetrics({ ...empty(), leads: [lead('2026-11-01', 'new'), lead('2026-11-01', 'junk')] }, 'all').kpis.qualified_share.value, 0);
});

test('synthetic flag follows the rows behind each KPI', () => {
  const d = { ...empty(), meta: [meta('2026-11-01', 100, 5, { spend: 10 })], ga4: [ga4('2026-11-01', 100, 1, { synthetic: true })], leads: [lead('2026-11-01', 'new')] };
  const m = computeMetrics(d, 'all');
  assert.equal(m.synthetic, true);
  assert.equal(m.kpis.sessions.synthetic, true);
  assert.equal(m.kpis.enquiry_rate.synthetic, true);
  assert.equal(m.kpis.reach.synthetic, false);
  assert.equal(m.kpis.cost_per_lead.synthetic, false);
  assert.equal(computeMetrics({ ...d, ga4: [] }, 'all').synthetic, false);
});

// ---- HTTP route ----
let server, base, db, alice, bob, companyId;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  companyId = (await (await call('POST', '/api/companies', alice, { name: 'Nile Bakery' })).json()).company.id;
});
after(() => {
  server.close();
  db.close();
});
const call = (method, path, cookie, body) =>
  fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}
const get = (qs, cookie = alice) => call('GET', `/api/companies/${companyId}/metrics${qs}`, cookie);

test('route: metrics come from the validated mirror; invalid rows do not count', async () => {
  const before = await (await get('')).json();
  assert.equal(before.period, null);
  assert.equal(before.kpis.sessions.reason, 'no_data');

  const state = {
    data: {
      ga4: [
        { date: '2026-11-01', channel: 'Direct', sessions: 100, enquiries: 2 },
        { date: '2026-11-02', channel: 'Direct', sessions: 50, enquiries: 1 },
        { date: '2026-11-02', channel: 'Direct', sessions: -999, enquiries: 1 }, // refused by the mirror
        { date: '2026-13-45', channel: 'Direct', sessions: 999, enquiries: 1 }, // refused by the mirror
      ],
      leads: [{ date: '2026-11-02', status: 'customer' }],
    },
    imports: [{ kind: 'leads', origin: 'fixture' }],
  };
  assert.equal((await call('PUT', `/api/companies/${companyId}/state`, alice, { state })).status, 200);

  const r = await get('?range=all');
  assert.equal(r.status, 200);
  const m = await r.json();
  assert.deepEqual(m.period, { from: '2026-11-01', to: '2026-11-02', days: 2 });
  assert.equal(m.kpis.sessions.value, 150);
  assert.equal(m.kpis.sessions.rows, 2);
  assert.equal(m.kpis.enquiries.value, 3);
  assert.equal(m.kpis.leads.value, 1);
  assert.equal(m.kpis.customers.value, 1);
  assert.equal(m.kpis.leads.synthetic, true);
  assert.equal(m.kpis.sessions.synthetic, false);
  assert.equal(m.synthetic, true);
  assert.equal(m.kpis.reach.reason, 'no_data');
  assert.deepEqual(metrics(db, companyId, 'all'), m);

  assert.equal((await (await get('')).json()).range, '28');
  assert.equal((await (await get('?range=7')).json()).range, '7');
});

test('route: bad range is 400; other users get 404', async () => {
  for (const q of ['?range=30', '?range=', '?range=all;drop', '?range=7&range=28']) {
    const r = await get(q);
    assert.equal(r.status, 400, q);
    assert.deepEqual(await r.json(), { error: 'invalid_range' });
  }
  assert.equal((await get('?range=all', bob)).status, 404);
  assert.equal((await get('?range=all', null)).status, 401);
});

test('optional Meta measures: an absent impressions / link_clicks column is not_measured, never 0; a real 0 stays 0', () => {
  const noCols = (date) => ({ date, platform: 'facebook', reach: 100, engagements: 5, synthetic: false });
  let m = computeMetrics({ ...empty(), meta: [noCols('2026-11-01'), noCols('2026-11-02')] }, 'all');
  assert.deepEqual(m.kpis.impressions, { value: null, rows: 2, synthetic: false, reason: 'not_measured', previous: null });
  assert.equal(m.kpis.link_clicks.reason, 'not_measured');
  assert.equal(m.kpis.reach.value, 200);
  // One row carrying the column is enough to measure it; rows without it count as nothing.
  m = computeMetrics({ ...empty(), meta: [noCols('2026-11-01'), { ...noCols('2026-11-02'), impressions: 0, link_clicks: 3 }] }, 'all');
  assert.equal(m.kpis.impressions.value, 0);
  assert.equal(m.kpis.link_clicks.value, 3);
  // The previous period is judged on its own rows.
  const rows = [...Array.from({ length: 7 }, (_, i) => noCols(`2026-11-0${i + 1}`)), ...Array.from({ length: 7 }, (_, i) => ({ ...noCols(`2026-11-${String(i + 8).padStart(2, '0')}`), impressions: 50 }))];
  m = computeMetrics({ ...empty(), meta: rows }, '7');
  assert.equal(m.kpis.impressions.value, 350);
  assert.equal(m.kpis.impressions.previous, null);
});
