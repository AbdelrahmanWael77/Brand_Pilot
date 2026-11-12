import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

let server, base, db;
before(async () => {
  db = openDb(':memory:');
  const authLimits = { login: { max: 3, windowMs: 60_000 }, register: { max: 4, windowMs: 60_000 } };
  server = createApp({ db, authLimits }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  db.close();
});

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const login = (email, password) => post('/api/auth/login', { email, password });

test('failed logins for one email are blocked after the limit, others are not', async () => {
  await post('/api/auth/register', { email: 'victim@example.com', password: 'correct horse' });
  await post('/api/auth/register', { email: 'other@example.com', password: 'correct horse' });

  for (let i = 0; i < 3; i++) assert.equal((await login('victim@example.com', 'wrong password')).status, 401);

  const blocked = await login('Victim@Example.com', 'wrong password');
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: 'too_many_attempts' });
  const retry = Number(blocked.headers.get('retry-after'));
  assert.ok(retry >= 1 && retry <= 60, `retry-after ${retry}`);

  // Even the right password is refused while blocked, and no session is issued.
  const right = await login('victim@example.com', 'correct horse');
  assert.equal(right.status, 429);
  assert.equal(right.headers.getSetCookie().length, 0);

  // A different email from the same address is unaffected.
  assert.equal((await login('other@example.com', 'wrong password')).status, 401);
  assert.equal((await login('other@example.com', 'correct horse')).status, 200);
});

test('a successful login clears the failure count', async () => {
  // registrations so far: 2 of 4
  await post('/api/auth/register', { email: 'reset@example.com', password: 'correct horse' });
  for (let i = 0; i < 2; i++) assert.equal((await login('reset@example.com', 'wrong password')).status, 401);
  assert.equal((await login('reset@example.com', 'correct horse')).status, 200);
  for (let i = 0; i < 3; i++) assert.equal((await login('reset@example.com', 'wrong password')).status, 401);
  assert.equal((await login('reset@example.com', 'wrong password')).status, 429);
});

test('unknown emails are limited the same way (no account probing)', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await login('ghost@example.com', 'whatever pass')).status, 401);
  assert.equal((await login('ghost@example.com', 'whatever pass')).status, 429);
});

test('registration is limited per address', async () => {
  // registrations so far: 3 of 4
  assert.equal((await post('/api/auth/register', { email: 'fourth@example.com', password: 'correct horse' })).status, 201);
  const r = await post('/api/auth/register', { email: 'fifth@example.com', password: 'correct horse' });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) >= 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get('fifth@example.com').n, 0);
});
