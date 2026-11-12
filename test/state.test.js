import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

let server, base, db, alice, bob, companyId;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  const r = await call('POST', '/api/companies', alice, { name: 'FlowNest' });
  companyId = (await r.json()).company.id;
});
after(() => {
  server.close();
  db.close();
});

const call = (method, path, cookie, body) =>
  fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}

const statePath = () => `/api/companies/${companyId}/state`;
const sample = { name: 'FlowNest', lang: 'ar', facts: [{ id: 1, text: 'منصة لإدارة المهام', approved: true }], nested: { kpi: { cpl: 12.5 } } };

test('state is null before the first save', async () => {
  const r = await call('GET', statePath(), alice);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { state: null, updatedAt: null });
});

test('PUT then GET round-trips nested JSON including Arabic', async () => {
  const put = await call('PUT', statePath(), alice, { state: sample });
  assert.equal(put.status, 200);
  const { updatedAt } = await put.json();
  assert.match(updatedAt, /^\d{4}-\d\d-\d\dT/);

  const got = await (await call('GET', statePath(), alice)).json();
  assert.deepEqual(got.state, sample);
  assert.equal(got.updatedAt, updatedAt);

  // A second PUT replaces, not merges.
  await call('PUT', statePath(), alice, { state: { only: 'this' } });
  assert.deepEqual((await (await call('GET', statePath(), alice)).json()).state, { only: 'this' });
  await call('PUT', statePath(), alice, { state: sample });
});

test('non-member cannot read or overwrite; owner data is unchanged', async () => {
  assert.equal((await call('GET', statePath(), bob)).status, 404);
  assert.equal((await call('PUT', statePath(), bob, { state: { hacked: true } })).status, 404);
  assert.equal((await call('GET', statePath())).status, 401);
  assert.equal((await call('PUT', statePath(), null, { state: {} })).status, 401);
  assert.deepEqual((await (await call('GET', statePath(), alice)).json()).state, sample);
});

test('state must be a plain object', async () => {
  for (const state of [[1, 2], 'text', 42, null, true]) {
    assert.equal((await call('PUT', statePath(), alice, { state })).status, 400, JSON.stringify(state));
  }
  assert.equal((await call('PUT', statePath(), alice, {})).status, 400);
  assert.deepEqual((await (await call('GET', statePath(), alice)).json()).state, sample);
});

test('state accepts bodies above the 1 MB default but rejects over 5 MB with 413', async () => {
  const twoMb = await call('PUT', statePath(), alice, { state: { blob: 'x'.repeat(2 * 1024 * 1024) } });
  assert.equal(twoMb.status, 200);
  const sixMb = await call('PUT', statePath(), alice, { state: { blob: 'x'.repeat(6 * 1024 * 1024) } });
  assert.equal(sixMb.status, 413);
  assert.deepEqual(await sixMb.json(), { error: 'too_large' });
  await call('PUT', statePath(), alice, { state: sample });
});

test('other routes keep the 1 MB limit', async () => {
  const r = await call('POST', '/api/companies', alice, { name: 'x'.repeat(2 * 1024 * 1024) });
  assert.equal(r.status, 413);
});

test('deleting a company removes its state (cascade)', async () => {
  const { company } = await (await call('POST', '/api/companies', alice, { name: 'Temp' })).json();
  await call('PUT', `/api/companies/${company.id}/state`, alice, { state: { a: 1 } });
  db.prepare('DELETE FROM companies WHERE id = ?').run(company.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM company_state WHERE company_id = ?').get(company.id).n, 0);
});

test('PUT with name renames the company; invalid name is rejected', async () => {
  const { company } = await (await call('POST', '/api/companies', alice, { name: 'Old name' })).json();
  const p = `/api/companies/${company.id}`;
  assert.equal((await call('PUT', `${p}/state`, alice, { name: '  New name ', state: { a: 1 } })).status, 200);
  assert.equal((await (await call('GET', p, alice)).json()).company.name, 'New name');
  assert.equal((await call('PUT', `${p}/state`, alice, { name: '', state: { a: 2 } })).status, 400);
  assert.deepEqual((await (await call('GET', `${p}/state`, alice)).json()).state, { a: 1 });
});

test('owner can delete a company; others cannot', async () => {
  const { company } = await (await call('POST', '/api/companies', alice, { name: 'To delete' })).json();
  const p = `/api/companies/${company.id}`;
  await call('PUT', `${p}/state`, alice, { state: { a: 1 } });
  assert.equal((await call('DELETE', p, bob)).status, 404);
  assert.equal((await call('DELETE', p)).status, 401);
  assert.equal((await call('GET', p, alice)).status, 200);

  // A non-owner member is refused.
  const bobId = db.prepare('SELECT id FROM users WHERE email = ?').get('bob@example.com').id;
  db.prepare('INSERT INTO memberships (user_id, company_id, role) VALUES (?, ?, ?)').run(bobId, company.id, 'member');
  assert.equal((await call('DELETE', p, bob)).status, 403);

  assert.equal((await call('DELETE', p, alice)).status, 200);
  assert.equal((await call('GET', p, alice)).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM company_state WHERE company_id = ?').get(company.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE company_id = ?').get(company.id).n, 0);
});
