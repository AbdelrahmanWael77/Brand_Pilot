import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { approvedFacts } from '../server/knowledge.js';

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
const facts = async (id, cookie, qs = '') => (await call('GET', `/api/companies/${id}/facts${qs}`, cookie)).json();
const count = (table, id) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE company_id = ?`).get(id).n;

const finding = (id, status, extra = {}) => ({
  id, cat: 'services', text: `Fact ${id}`, type: 'fact', status, src: 's1', ev: `Quote for ${id}`, needs: false, date: '2026-11-12', ...extra,
});
const state = () => ({
  name: 'Nile Bakery',
  sources: [
    { id: 's1', title: 'about.txt', kind: 'document', text: 'We bake bread. نخبز الخبز', date: '2026-11-12', demo: false },
    { id: 's2', title: 'deck.pdf', kind: 'document', text: null, date: '2026-11-12', demo: false },
  ],
  findings: [
    finding('f1', 'approved'),
    finding('f2', 'approved', { type: 'user', src: null, ev: 'Entered manually', text: 'نخبز يومياً' }),
    finding('f3', 'rejected'),
    finding('f4', 'pending', { needs: true }),
  ],
});

test('no facts before the first save', async () => {
  assert.deepEqual(await facts(companyId, alice), { facts: [] });
});

test('PUT state mirrors sources and findings; approved filter returns only approved', async () => {
  const r = await put(companyId, alice, state());
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).knowledge, { sources: 2, facts: 4, skipped: 0 });
  assert.equal(count('sources', companyId), 2);

  const approved = (await facts(companyId, alice, '?status=approved')).facts;
  assert.deepEqual(approved.map((f) => f.id), ['f1', 'f2']);
  assert.ok(approved.every((f) => f.status === 'approved'));
  assert.deepEqual(approved[0], {
    id: 'f1', cat: 'services', text: 'Fact f1', type: 'fact', status: 'approved', src: 's1', srcTitle: 'about.txt',
    ev: 'Quote for f1', needs: false, date: '2026-11-12',
  });
  assert.equal(approved[1].srcTitle, null);
  assert.equal(approved[1].text, 'نخبز يومياً');

  assert.deepEqual((await facts(companyId, alice)).facts.map((f) => f.id), ['f1', 'f2', 'f3', 'f4']);
  assert.deepEqual((await facts(companyId, alice, '?status=pending')).facts.map((f) => [f.id, f.needs]), [['f4', true]]);
  assert.deepEqual(approvedFacts(db, companyId).map((f) => f.id), ['f1', 'f2']);
});

test('unknown status filter is rejected', async () => {
  const r = await call('GET', `/api/companies/${companyId}/facts?status=anything`, alice);
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'invalid_status' });
});

test('a second PUT replaces rows instead of appending', async () => {
  const s = state();
  s.sources.pop();
  s.findings = [finding('f1', 'rejected'), finding('f9', 'approved')];
  assert.equal((await put(companyId, alice, s)).status, 200);
  assert.equal(count('sources', companyId), 1);
  assert.equal(count('facts', companyId), 2);
  assert.deepEqual((await facts(companyId, alice, '?status=approved')).facts.map((f) => f.id), ['f9']);

  // State without knowledge keys clears the mirror.
  await put(companyId, alice, { name: 'Nile Bakery' });
  assert.equal(count('sources', companyId) + count('facts', companyId), 0);
});

test('malformed items are skipped without failing the save', async () => {
  const s = state();
  s.sources.push(null, 'text', { id: 5, title: 'numeric id' }, { id: 's3' }, { id: 's1', title: 'duplicate id' }, { id: 's4', title: 'bad text', text: 42 });
  s.findings.push(
    null,
    [],
    finding('f5', 'published'),
    finding('f6', undefined),
    { id: 'f7', status: 'approved' },
    finding('', 'approved'),
    finding('f1', 'approved'),
    finding('f8', 'approved', { cat: 7, ev: null, src: {}, needs: 'yes', date: 3 }),
  );
  const r = await put(companyId, alice, s);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).knowledge, { sources: 2, facts: 5, skipped: 13 });
  const f8 = (await facts(companyId, alice, '?status=approved')).facts.find((f) => f.id === 'f8');
  assert.deepEqual({ cat: f8.cat, ev: f8.ev, src: f8.src, needs: f8.needs, date: f8.date }, { cat: '', ev: '', src: null, needs: false, date: '' });

  for (const bad of [{ sources: 'nope', findings: 12 }, { sources: {}, findings: null }]) {
    const res = await put(companyId, alice, bad);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).knowledge, { sources: 0, facts: 0, skipped: 0 });
  }
  // The blob itself is stored untouched.
  await put(companyId, alice, s);
  assert.deepEqual((await (await call('GET', `/api/companies/${companyId}/state`, alice)).json()).state, JSON.parse(JSON.stringify(s)));
});

test('facts are isolated per company and per user', async () => {
  await put(companyId, alice, state());
  assert.equal((await call('GET', `/api/companies/${companyId}/facts?status=approved`, bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${companyId}/facts`)).status, 401);

  // Same ids in another company do not collide or leak.
  const bobCo = await newCompany(bob, 'Other');
  const s = state();
  s.findings = [finding('f1', 'approved', { text: 'Bob fact' })];
  assert.equal((await put(bobCo, bob, s)).status, 200);
  assert.deepEqual((await facts(bobCo, bob, '?status=approved')).facts.map((f) => f.text), ['Bob fact']);
  assert.deepEqual((await facts(companyId, alice, '?status=approved')).facts.map((f) => f.text), ['Fact f1', 'نخبز يومياً']);
  assert.deepEqual(approvedFacts(db, bobCo).map((f) => f.text), ['Bob fact']);
});

test('a failed save leaves blob and mirror unchanged (one transaction)', async () => {
  await put(companyId, alice, state());
  const before = await facts(companyId, alice);
  // An id longer than the cap is skipped, so force a real failure with a trigger instead.
  db.exec("CREATE TRIGGER boom BEFORE INSERT ON facts WHEN NEW.id = 'boom' BEGIN SELECT RAISE(ABORT, 'boom'); END");
  const s = { name: 'Changed', sources: [], findings: [finding('ok', 'approved'), finding('boom', 'approved')] };
  const orig = console.error;
  console.error = () => {};
  const r = await put(companyId, alice, s);
  console.error = orig;
  db.exec('DROP TRIGGER boom');
  assert.equal(r.status, 500);
  assert.deepEqual(await facts(companyId, alice), before);
  assert.equal((await (await call('GET', `/api/companies/${companyId}/state`, alice)).json()).state.name, 'Nile Bakery');
  assert.equal(count('sources', companyId), 2);
});

test('deleting a company removes its sources and facts', async () => {
  const id = await newCompany(alice, 'Temp');
  await put(id, alice, state());
  assert.equal(count('facts', id), 4);
  assert.equal((await call('DELETE', `/api/companies/${id}`, alice)).status, 200);
  assert.equal(count('facts', id) + count('sources', id), 0);
});
