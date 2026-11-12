import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { cleanRow, dataRows, isRealDate } from '../server/data.js';

let server, base, db, alice, bob, companyId;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  companyId = await newCompany(alice, 'Nile Bakery');
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
const newCompany = async (cookie, name) => (await (await call('POST', '/api/companies', cookie, { name })).json()).company.id;
const put = (id, cookie, state) => call('PUT', `/api/companies/${id}/state`, cookie, { state });
const summary = async (id, cookie) => (await (await call('GET', `/api/companies/${id}/data/summary`, cookie)).json()).data;
const count = (id) => db.prepare('SELECT COUNT(*) AS n FROM data_rows WHERE company_id = ?').get(id).n;

// Rows shaped exactly as the frontend's importData stores them.
const meta = (date, extra = {}) => ({ date, platform: 'facebook', post_id: 'p1', format: 'image', theme: 'tips', language: 'ar', reach: 1800, impressions: 2200, engagements: 64, link_clicks: 21, spend: 0, campaign: '', ...extra });
const ga4 = (date, extra = {}) => ({ date, channel: 'Organic Search', landing_page: '/', device: 'mobile', sessions: 120, engaged_sessions: 70, enquiries: 3, campaign: '', ...extra });
const gsc = (date, extra = {}) => ({ date, query: 'مخبز القاهرة', page: '/', clicks: 4, impressions: 180, position: 7.2, ...extra });
const lead = (date, extra = {}) => ({ date, source: 'Facebook', campaign: 'my-campaign', segment: 'Cafes', status: 'qualified', ...extra });
const state = () => ({
  name: 'Nile Bakery',
  data: { meta: [meta('2026-11-01'), meta('2026-11-03')], ga4: [ga4('2026-10-30'), ga4('2026-11-02'), ga4('2026-11-05')], gsc: [gsc('2026-11-01')], leads: [lead('2026-11-04'), lead('2026-11-02', { status: 'new' })] },
  imports: [{ id: 'i1', kind: 'ga4', origin: 'file', fname: 'ga4.csv' }],
});
const none = { rows: 0, from: null, to: null, synthetic: 0 };

test('isRealDate and cleanRow', () => {
  for (const d of ['2026-11-01', '2024-02-29', '2026-12-31']) assert.equal(isRealDate(d), true, d);
  for (const d of ['2026-13-45', '2026-02-30', '2025-02-29', '2026-00-10', '01/11/2026', '2026-1-1', '', null, 20261101, '2026-11-01T00:00:00Z']) assert.equal(isRealDate(d), false, String(d));

  // Only schema columns are kept; strings trimmed; empty optional cells dropped.
  assert.deepEqual(cleanRow('ga4', ga4('2026-11-01', { channel: '  Direct ', campaign: '', hacked: '<script>', __proto__: { x: 1 } })), {
    date: '2026-11-01', channel: 'Direct', landing_page: '/', device: 'mobile', sessions: 120, engaged_sessions: 70, enquiries: 3,
  });
  assert.equal(cleanRow('gsc', gsc('2026-11-01', { query: 'q'.repeat(2000) })).query.length, 500);
  // Optional numbers may be absent (left out, not zero); a present 0 stays 0.
  const noSpend = cleanRow('meta', { date: '2026-11-01', platform: 'facebook', reach: 10, engagements: 0 });
  assert.deepEqual(noSpend, { date: '2026-11-01', platform: 'facebook', reach: 10, engagements: 0 });
  assert.equal(cleanRow('meta', meta('2026-11-01', { spend: 0 })).spend, 0);

  const bad = [
    ['ga4', ga4('2026-13-45')], ['ga4', ga4('yesterday')], ['ga4', ga4(undefined)],
    ['ga4', ga4('2026-11-01', { sessions: -50 })], ['ga4', ga4('2026-11-01', { sessions: 'many' })], ['ga4', ga4('2026-11-01', { sessions: '120' })],
    ['ga4', ga4('2026-11-01', { sessions: NaN })], ['ga4', ga4('2026-11-01', { sessions: Infinity })], ['ga4', ga4('2026-11-01', { sessions: undefined })],
    ['ga4', ga4('2026-11-01', { enquiries: -1 })], ['ga4', ga4('2026-11-01', { channel: '' })], ['ga4', ga4('2026-11-01', { channel: '   ' })],
    ['ga4', ga4('2026-11-01', { channel: 5 })], ['ga4', ga4('2026-11-01', { device: { a: 1 } })],
    ['meta', { date: '2026-11-01', platform: 'facebook', reach: 10 }], ['gsc', gsc('2026-11-01', { query: undefined })], ['leads', lead('2026-11-01', { status: '' })],
    ['ga4', null], ['ga4', 'row'], ['ga4', [1, 2]], ['unknown', ga4('2026-11-01')],
  ];
  for (const [kind, row] of bad) assert.equal(cleanRow(kind, row), null, `${kind} ${JSON.stringify(row)}`);
});

test('summary is empty before any save', async () => {
  assert.deepEqual(await summary(companyId, alice), { meta: none, ga4: none, gsc: none, leads: none });
});

test('PUT state mirrors valid rows of each kind; summary reports counts and date range', async () => {
  const r = await put(companyId, alice, state());
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data, { rows: { meta: 2, ga4: 3, gsc: 1, leads: 2 }, skipped: 0 });
  assert.deepEqual(await summary(companyId, alice), {
    meta: { rows: 2, from: '2026-11-01', to: '2026-11-03', synthetic: 0 },
    ga4: { rows: 3, from: '2026-10-30', to: '2026-11-05', synthetic: 0 },
    gsc: { rows: 1, from: '2026-11-01', to: '2026-11-01', synthetic: 0 },
    leads: { rows: 2, from: '2026-11-02', to: '2026-11-04', synthetic: 0 },
  });
  const rows = dataRows(db, companyId, 'leads');
  assert.deepEqual(rows.map((x) => [x.date, x.status, x.synthetic]), [['2026-11-02', 'new', false], ['2026-11-04', 'qualified', false]]);
  assert.equal(dataRows(db, companyId, 'gsc')[0].query, 'مخبز القاهرة');
  assert.deepEqual(dataRows(db, companyId, 'nope'), []);
});

test('invalid rows are skipped and counted; the save still succeeds and the blob is untouched', async () => {
  const s = state();
  s.data.ga4.push(ga4('2026-13-45'), ga4('2026-11-06', { sessions: -5 }), ga4('2026-11-06', { sessions: 'x' }), { date: '2026-11-06' }, null, 'junk');
  s.data.meta.push(meta('2026-02-30'));
  s.data.leads = 'not a list';
  s.data.extra = [ga4('2026-11-01')];
  const r = await put(companyId, alice, s);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data, { rows: { meta: 2, ga4: 3, gsc: 1, leads: 0 }, skipped: 8 });
  assert.equal(count(companyId), 6);
  assert.deepEqual((await (await call('GET', `/api/companies/${companyId}/state`, alice)).json()).state, JSON.parse(JSON.stringify(s)));

  for (const data of [undefined, null, 'x', [], 42]) {
    const res = await put(companyId, alice, { name: 'Nile Bakery', data });
    assert.equal(res.status, 200, String(data));
    assert.deepEqual((await res.json()).data, { rows: { meta: 0, ga4: 0, gsc: 0, leads: 0 }, skipped: 0 });
  }
  assert.equal(count(companyId), 0);
});

test('a second PUT replaces rows; an unchanged PUT does not rewrite them', async () => {
  await put(companyId, alice, state());
  assert.equal(count(companyId), 8);
  const firstRowid = db.prepare('SELECT MIN(rowid) AS r FROM data_rows WHERE company_id = ?').get(companyId).r;

  // Same data, other parts of the state changed: rows are left alone, same result reported.
  const same = { ...state(), name: 'Renamed', findings: [] };
  const r = await put(companyId, alice, same);
  assert.deepEqual((await r.json()).data, { rows: { meta: 2, ga4: 3, gsc: 1, leads: 2 }, skipped: 0 });
  assert.equal(db.prepare('SELECT MIN(rowid) AS r FROM data_rows WHERE company_id = ?').get(companyId).r, firstRowid);

  const s = state();
  s.data.ga4 = [ga4('2026-12-01')];
  s.data.meta = [];
  await put(companyId, alice, s);
  assert.equal(count(companyId), 4);
  assert.deepEqual((await summary(companyId, alice)).ga4, { rows: 1, from: '2026-12-01', to: '2026-12-01', synthetic: 0 });
  assert.deepEqual((await summary(companyId, alice)).meta, none);
});

test('rows of a dataset loaded from demo fixtures are flagged synthetic', async () => {
  const s = state();
  s.imports = [{ kind: 'ga4', origin: 'fixture', fname: 'synthetic-flownest-base-ga4.csv' }, { kind: 'meta', origin: 'file' }, { kind: 'nope', origin: 'fixture' }, null, 'x'];
  await put(companyId, alice, s);
  const sum = await summary(companyId, alice);
  assert.equal(sum.ga4.synthetic, 3);
  assert.equal(sum.meta.synthetic + sum.gsc.synthetic + sum.leads.synthetic, 0);
  assert.ok(dataRows(db, companyId, 'ga4').every((r) => r.synthetic === true));
  // Removing the fixture import from the log (same rows) clears the flag: the fingerprint covers it.
  s.imports = [];
  await put(companyId, alice, s);
  assert.equal((await summary(companyId, alice)).ga4.synthetic, 0);
});

test('data is isolated per company and per user', async () => {
  await put(companyId, alice, state());
  assert.equal((await call('GET', `/api/companies/${companyId}/data/summary`, bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${companyId}/data/summary`)).status, 401);
  const bobCo = await newCompany(bob, 'Other');
  await put(bobCo, bob, { data: { ga4: [ga4('2025-01-01')] } });
  assert.deepEqual((await summary(bobCo, bob)).ga4, { rows: 1, from: '2025-01-01', to: '2025-01-01', synthetic: 0 });
  assert.equal((await summary(companyId, alice)).ga4.rows, 3);
  assert.equal(dataRows(db, bobCo, 'ga4').length, 1);
});

test('a failed save rolls back blob, facts and data together', async () => {
  await put(companyId, alice, state());
  db.exec("CREATE TRIGGER boom_data BEFORE INSERT ON data_rows WHEN NEW.date = '2030-01-01' BEGIN SELECT RAISE(ABORT, 'boom'); END");
  const s = state();
  s.name = 'Changed';
  s.findings = [{ id: 'f1', cat: 'services', text: 'New fact', type: 'user', status: 'approved', src: null, ev: 'Entered manually', needs: false, date: '2026-11-12' }];
  s.data.ga4 = [ga4('2026-11-09'), ga4('2030-01-01')];
  const orig = console.error;
  console.error = () => {};
  const r = await put(companyId, alice, s);
  console.error = orig;
  db.exec('DROP TRIGGER boom_data');
  assert.equal(r.status, 500);
  assert.equal((await summary(companyId, alice)).ga4.rows, 3);
  assert.equal((await (await call('GET', `/api/companies/${companyId}/state`, alice)).json()).state.name, 'Nile Bakery');
  assert.deepEqual((await (await call('GET', `/api/companies/${companyId}/facts`, alice)).json()).facts, []);
  // And the next good save works (the fingerprint was rolled back too).
  s.data.ga4 = [ga4('2026-11-09')];
  assert.equal((await put(companyId, alice, s)).status, 200);
  assert.equal((await summary(companyId, alice)).ga4.rows, 1);
});

test('deleting a company removes its data rows and fingerprint', async () => {
  const id = await newCompany(alice, 'Temp');
  await put(id, alice, state());
  assert.equal(count(id), 8);
  assert.equal((await call('DELETE', `/api/companies/${id}`, alice)).status, 200);
  assert.equal(count(id), 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM data_mirror WHERE company_id = ?').get(id).n, 0);
});
