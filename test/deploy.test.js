import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, parseTrustProxy } from '../server/app.js';
import { openDb } from '../server/db.js';

const servers = [];
const dbs = [];
async function start(opts = {}) {
  const db = openDb(':memory:');
  const server = createApp({ db, authLimits: { login: { max: 2, windowMs: 60_000 } }, ...opts }).listen(0);
  await new Promise((r) => server.once('listening', r));
  servers.push(server);
  dbs.push(db);
  return `http://127.0.0.1:${server.address().port}`;
}
after(() => {
  servers.forEach((s) => s.close());
  dbs.forEach((d) => d.close());
});
const post = (base, path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('parseTrustProxy: off by default, a count, or an Express value', () => {
  for (const v of [undefined, '', ' ', '0', 'false', 'FALSE']) assert.equal(parseTrustProxy(v), false);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy(' 2 '), 2);
  assert.equal(parseTrustProxy('true'), 1);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
});

test('every response carries the basic security headers; no framework banner', async () => {
  const base = await start({ trustProxy: false });
  for (const path of ['/', '/api/health', '/api/nope', '/favicon.ico']) {
    const r = await fetch(base + path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', path);
    assert.equal(r.headers.get('referrer-policy'), 'same-origin', path);
    assert.equal(r.headers.get('x-powered-by'), null, path);
  }
});

test('the app icon is served, at /favicon.svg and at /favicon.ico', async () => {
  const base = await start({ trustProxy: false });
  for (const path of ['/favicon.svg', '/favicon.ico']) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type'), /^image\/svg\+xml/, path);
    assert.match(await r.text(), /^<svg /);
  }
  assert.match(await (await fetch(base + '/')).text(), /<link rel="icon" href="\/favicon\.svg"/);
});

test('trust proxy: off → a forged X-Forwarded-For does not dodge the login limit; on → the limit follows the forwarded address', async () => {
  const wrong = (base, ip) => post(base, '/api/auth/login', { email: 'victim@example.com', password: 'wrong password' }, { 'x-forwarded-for': ip });

  const direct = await start({ trustProxy: false });
  await post(direct, '/api/auth/register', { email: 'victim@example.com', password: 'correct horse' });
  assert.equal((await wrong(direct, '1.1.1.1')).status, 401);
  assert.equal((await wrong(direct, '2.2.2.2')).status, 401);
  assert.equal((await wrong(direct, '3.3.3.3')).status, 429); // the header is ignored: same real address

  const proxied = await start({ trustProxy: 1 });
  await post(proxied, '/api/auth/register', { email: 'victim@example.com', password: 'correct horse' });
  assert.equal((await wrong(proxied, '1.1.1.1')).status, 401);
  assert.equal((await wrong(proxied, '1.1.1.1')).status, 401);
  assert.equal((await wrong(proxied, '1.1.1.1')).status, 429); // that visitor is blocked…
  assert.equal((await wrong(proxied, '2.2.2.2')).status, 401); // …another visitor behind the same proxy is not
});
