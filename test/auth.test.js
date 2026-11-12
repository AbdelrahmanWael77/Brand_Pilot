import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

let server, base, db;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  db.close();
});

const post = (path, body, cookie) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });
const me = (cookie) => fetch(`${base}/api/auth/me`, { headers: cookie ? { cookie } : {} });
const cookieOf = (r) => (r.headers.getSetCookie()[0] || '').split(';')[0];

test('register sets a session and me returns the user', async () => {
  const r = await post('/api/auth/register', { email: 'Owner@Example.com', password: 'correct horse' });
  assert.equal(r.status, 201);
  const setCookie = r.headers.getSetCookie()[0];
  assert.match(setCookie, /^bp_session=[\w-]{40,};/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const body = await r.json();
  assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id']);
  assert.equal(body.user.email, 'owner@example.com');

  const m = await me(cookieOf(r));
  assert.equal(m.status, 200);
  assert.deepEqual((await m.json()).user, body.user);
});

test('me without or with a bogus cookie is 401', async () => {
  assert.equal((await me()).status, 401);
  assert.equal((await me('bp_session=not-a-real-session')).status, 401);
});

test('login works; wrong password and unknown email give the same 401', async () => {
  await post('/api/auth/register', { email: 'login@example.com', password: 'correct horse' });
  const ok = await post('/api/auth/login', { email: 'LOGIN@example.com', password: 'correct horse' });
  assert.equal(ok.status, 200);
  assert.equal((await me(cookieOf(ok))).status, 200);

  const wrong = await post('/api/auth/login', { email: 'login@example.com', password: 'wrong password' });
  const unknown = await post('/api/auth/login', { email: 'nobody@example.com', password: 'correct horse' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
  assert.equal(wrong.headers.getSetCookie().length, 0);
});

test('logout invalidates the session server-side', async () => {
  const r = await post('/api/auth/register', { email: 'logout@example.com', password: 'correct horse' });
  const cookie = cookieOf(r);
  const out = await post('/api/auth/logout', {}, cookie);
  assert.equal(out.status, 200);
  assert.match(out.headers.getSetCookie()[0], /^bp_session=;.*Max-Age=0/i);
  assert.equal((await me(cookie)).status, 401);
});

test('duplicate email is 409; invalid input is 400', async () => {
  await post('/api/auth/register', { email: 'dup@example.com', password: 'correct horse' });
  assert.equal((await post('/api/auth/register', { email: 'DUP@example.com', password: 'another pass' })).status, 409);
  assert.equal((await post('/api/auth/register', { email: 'not-an-email', password: 'correct horse' })).status, 400);
  assert.equal((await post('/api/auth/register', { email: 'short@example.com', password: 'short' })).status, 400);
  assert.equal((await post('/api/auth/register', { email: 'x@example.com' })).status, 400);
});

test('expired session is rejected', async () => {
  const r = await post('/api/auth/register', { email: 'expired@example.com', password: 'correct horse' });
  db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await me(cookieOf(r))).status, 401);
});

test('password hash and raw session token are never exposed or stored in clear', async () => {
  const r = await post('/api/auth/register', { email: 'secret@example.com', password: 'correct horse' });
  const text = JSON.stringify(await r.json());
  assert.doesNotMatch(text, /password|hash|scrypt/i);
  const token = cookieOf(r).split('=')[1];
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id = ?').get(token).n, 0);
  const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('secret@example.com');
  assert.match(row.password_hash, /^scrypt\$/);
  assert.doesNotMatch(row.password_hash, /correct horse/);
});

test('malformed JSON body is a 400, not a crash', async () => {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(r.status, 400);
});
