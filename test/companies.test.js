import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

let server, base, db, alice, bob;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
});
after(() => {
  server.close();
  db.close();
});

const call = (method, path, cookie, body) =>
  fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}

test('company routes require authentication', async () => {
  assert.equal((await call('GET', '/api/companies')).status, 401);
  assert.equal((await call('POST', '/api/companies', null, { name: 'X' })).status, 401);
  assert.equal((await call('GET', '/api/companies/anything')).status, 401);
});

test('create, list and get own company', async () => {
  const r = await call('POST', '/api/companies', alice, { name: '  FlowNest  ' });
  assert.equal(r.status, 201);
  const { company } = await r.json();
  assert.equal(company.name, 'FlowNest');
  assert.equal(company.role, 'owner');
  assert.match(company.id, /^[0-9a-f-]{36}$/);

  const list = await (await call('GET', '/api/companies', alice)).json();
  assert.deepEqual(list.companies, [company]);

  const got = await call('GET', `/api/companies/${company.id}`, alice);
  assert.equal(got.status, 200);
  assert.deepEqual((await got.json()).company, company);
});

test('another user cannot see or probe the company', async () => {
  const { company } = await (await call('POST', '/api/companies', alice, { name: 'Alice Only' })).json();

  const bobList = await (await call('GET', '/api/companies', bob)).json();
  assert.deepEqual(bobList.companies, []);

  const foreign = await call('GET', `/api/companies/${company.id}`, bob);
  const missing = await call('GET', '/api/companies/00000000-0000-0000-0000-000000000000', bob);
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(await foreign.json(), await missing.json());
});

test('each user lists only their own companies', async () => {
  const { company } = await (await call('POST', '/api/companies', bob, { name: 'Bob Co' })).json();
  const bobList = await (await call('GET', '/api/companies', bob)).json();
  assert.deepEqual(bobList.companies, [company]);
  const aliceList = await (await call('GET', '/api/companies', alice)).json();
  assert.ok(aliceList.companies.length >= 1);
  assert.ok(aliceList.companies.every((c) => c.id !== company.id));
});

test('invalid names are rejected and create nothing', async () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
  for (const name of ['', '   ', 'x'.repeat(121), 42, null, undefined]) {
    assert.equal((await call('POST', '/api/companies', alice, { name })).status, 400, String(name));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM companies').get().n, before);
});

test('a failed membership insert rolls back the company row', async () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
  db.exec(`CREATE TRIGGER fail_membership BEFORE INSERT ON memberships BEGIN SELECT RAISE(ABORT, 'boom'); END`);
  try {
    assert.equal((await call('POST', '/api/companies', alice, { name: 'Ghost' })).status, 500);
  } finally {
    db.exec('DROP TRIGGER fail_membership');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM companies').get().n, before);
  // The connection is still usable afterwards (no dangling transaction).
  assert.equal((await call('POST', '/api/companies', alice, { name: 'After' })).status, 201);
});
