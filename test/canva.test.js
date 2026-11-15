import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { canvaConfig, pkce, CANVA_SCOPES } from '../server/canva.js';

// Canva connection (task 10.4a). Nothing here touches the real network: Canva is a stubbed fetch.
const config = canvaConfig({ CANVA_CLIENT_ID: 'OC-CLIENT', CANVA_CLIENT_SECRET: 'cnv-secret', CANVA_REDIRECT_URI: 'https://app.example/api/integrations/canva/callback', TOKEN_KEY: 'd'.repeat(64) });
const NOW = Date.parse('2026-11-15T12:00:00Z');
let clock = NOW;

const calls = [];
let C = {};
const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
async function fakeFetch(url, opts = {}) {
  const u = new URL(url);
  const body = opts.body ? Object.fromEntries(new URLSearchParams(opts.body)) : null;
  calls.push({ u, method: opts.method || 'GET', body, auth: opts.headers && opts.headers.authorization });
  const key = `${opts.method || 'GET'} ${u.host}${u.pathname}`;
  const h = C[key];
  if (!h) return json(404, { code: 'not_found', message: 'no stub ' + key });
  const r = typeof h === 'function' ? h(body, u) : h;
  return r.status ? json(r.status, r.body) : json(200, r);
}
let refreshes = 0;
function baseCanva() {
  refreshes = 0;
  C = {
    'POST api.canva.com/rest/v1/oauth/token': (b) => (b.grant_type === 'authorization_code'
      ? { access_token: 'ACCESS-1', refresh_token: 'REFRESH-1', token_type: 'Bearer', expires_in: 14400, scope: CANVA_SCOPES.join(' ') }
      : b.refresh_token === `REFRESH-${refreshes + 1}`
        ? { access_token: `ACCESS-${++refreshes + 1}`, refresh_token: `REFRESH-${refreshes + 1}`, token_type: 'Bearer', expires_in: 14400, scope: CANVA_SCOPES.join(' ') }
        : { status: 400, body: { error: 'invalid_grant', error_description: 'refresh token already used' } }),
    'POST api.canva.com/rest/v1/oauth/revoke': {},
    'GET api.canva.com/rest/v1/users/me/profile': { profile: { display_name: 'Nile Design Team' } },
  };
}

let server, base, db, alice, bob, co, coB;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db, canva: { config, fetch: fakeFetch, now: () => clock, checkLimit: { max: 8, windowMs: 60_000 } } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  co = (await (await call('POST', '/api/companies', alice, { name: 'Nile' })).json()).company.id;
  coB = (await (await call('POST', '/api/companies', bob, { name: 'Bob Co' })).json()).company.id;
});
after(() => {
  server.close();
  db.close();
});
const call = (method, path, cookie, body) =>
  fetch(base + path, { method, redirect: 'manual', headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}
const K = (id = co) => `/api/companies/${id}/integrations/canva`;
async function start(cookie = alice, id = co) {
  const r = await call('POST', K(id) + '/start', cookie);
  assert.equal(r.status, 200);
  return new URL((await r.json()).url);
}
async function connect() {
  baseCanva();
  const st = (await start()).searchParams.get('state');
  const r = await call('GET', `/api/integrations/canva/callback?code=CODE&state=${st}`, alice);
  assert.equal(r.headers.get('location'), '/?canva=connected');
}
const stored = () => JSON.stringify(db.prepare('SELECT * FROM canva_connections').all()) + JSON.stringify(db.prepare('SELECT * FROM canva_states').all());

test('config: needs id, secret, an http(s) redirect and a 64-hex TOKEN_KEY; scopes can be narrowed, junk is dropped', () => {
  assert.equal(canvaConfig({}).configured, false);
  assert.equal(canvaConfig({ CANVA_CLIENT_ID: 'a', CANVA_CLIENT_SECRET: 'b', CANVA_REDIRECT_URI: 'https://x/cb', TOKEN_KEY: 'short' }).configured, false);
  assert.equal(config.configured, true);
  assert.deepEqual(config.scopes, CANVA_SCOPES);
  assert.deepEqual(canvaConfig({ CANVA_SCOPES: ' profile:read  asset:write <script> ' }).scopes, ['profile:read', 'asset:write']);
});

test('pkce: verifier of 43–128 unreserved characters, challenge is its SHA-256 in base64url', () => {
  const { verifier, challenge } = pkce();
  assert.match(verifier, /^[A-Za-z0-9\-._~]{43,128}$/);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual(pkce().verifier, verifier);
});

test('not configured: status false, start and check 503, callback goes back, no network', async () => {
  const db2 = openDb(':memory:');
  const s2 = createApp({ db: db2, canva: { config: canvaConfig({}), fetch: () => assert.fail('no network') } }).listen(0);
  await new Promise((r) => s2.once('listening', r));
  try {
    const b2 = `http://127.0.0.1:${s2.address().port}`;
    const ck = (await fetch(b2 + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'c@example.com', password: 'correct horse' }) })).headers.getSetCookie()[0].split(';')[0];
    const id = (await (await fetch(b2 + '/api/companies', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{"name":"X"}' })).json()).company.id;
    assert.deepEqual((await (await fetch(b2 + '/api/integrations/status', { headers: { cookie: ck } })).json()).canva, { configured: false });
    assert.deepEqual(await (await fetch(`${b2}/api/companies/${id}/integrations/canva`, { headers: { cookie: ck } })).json(), { configured: false, connected: false });
    for (const p of ['/start', '/check']) assert.equal((await fetch(`${b2}/api/companies/${id}/integrations/canva${p}`, { method: 'POST', headers: { cookie: ck } })).status, 503);
    assert.equal((await fetch(b2 + '/api/integrations/canva/callback?code=x&state=y', { headers: { cookie: ck }, redirect: 'manual' })).headers.get('location'), '/?canva=not_configured');
  } finally {
    s2.close();
    db2.close();
  }
});

test('start: Canva consent URL with PKCE S256, the asked scopes, a fresh state; no secret and no verifier in it', async () => {
  const u = await start();
  assert.equal(u.origin + u.pathname, 'https://www.canva.com/api/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'), 'OC-CLIENT');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.match(u.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(u.searchParams.get('scope'), CANVA_SCOPES.join(' '));
  assert.equal(u.searchParams.get('redirect_uri'), config.redirectUri);
  assert.ok(!u.toString().includes('cnv-secret'));
  const u2 = await start();
  assert.notEqual(u2.searchParams.get('state'), u.searchParams.get('state'));
  assert.notEqual(u2.searchParams.get('code_challenge'), u.searchParams.get('code_challenge'));
  // the state is stored hashed and the verifier encrypted
  assert.ok(!stored().includes(u.searchParams.get('state')));
  assert.equal((await call('POST', K() + '/start', bob)).status, 404); // not a member
  assert.equal((await call('POST', K() + '/start', null)).status, 401);
});

test('callback: exchanges the code with Basic auth and the matching verifier, stores tokens encrypted, shows the account name', async () => {
  baseCanva();
  calls.length = 0;
  const u = await start();
  const r = await call('GET', `/api/integrations/canva/callback?code=CODE-9&state=${u.searchParams.get('state')}`, alice);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/?canva=connected');
  const tok = calls.find((c) => c.u.pathname.endsWith('/oauth/token'));
  assert.equal(tok.auth, 'Basic ' + Buffer.from('OC-CLIENT:cnv-secret').toString('base64'));
  assert.equal(tok.body.grant_type, 'authorization_code');
  assert.equal(tok.body.code, 'CODE-9');
  assert.equal(tok.body.redirect_uri, config.redirectUri);
  assert.equal(tok.body.client_secret, undefined);
  assert.equal(crypto.createHash('sha256').update(tok.body.code_verifier).digest('base64url'), u.searchParams.get('code_challenge'));
  assert.equal(calls.find((c) => c.u.pathname.endsWith('/users/me/profile')).auth, 'Bearer ACCESS-1');
  const s = stored();
  for (const secret of ['ACCESS-1', 'REFRESH-1', tok.body.code_verifier]) assert.ok(!s.includes(secret), 'stored in clear: ' + secret);
  const info = await (await call('GET', K(), alice)).json();
  assert.deepEqual({ ...info, connectedAt: null }, { configured: true, connected: true, name: 'Nile Design Team', scopes: CANVA_SCOPES, connectedAt: null, needsReconnect: false });
  assert.ok(!JSON.stringify(info).includes('ACCESS'));
  assert.equal((await call('GET', K(), bob)).status, 404);
  assert.deepEqual(await (await call('GET', K(coB), bob)).json(), { configured: true, connected: false });
});

test('callback refusals: used / unknown / expired state, another user, denied consent, signed out, no refresh token, Canva error', async () => {
  baseCanva();
  const st = (await start()).searchParams.get('state');
  const go = (qs, cookie = alice) => call('GET', '/api/integrations/canva/callback?' + qs, cookie).then((r) => r.headers.get('location'));
  assert.equal(await go(`code=x&state=${st}`, bob), '/?canva=invalid'); // bob cannot finish alice's round trip…
  assert.equal(await go(`code=x&state=${st}`), '/?canva=invalid'); // …and the state is gone after one use
  assert.equal(await go('code=x&state=nope'), '/?canva=invalid');
  assert.equal(await go('code=x'), '/?canva=invalid');
  const old = (await start()).searchParams.get('state');
  clock = NOW + 11 * 60_000;
  assert.equal(await go(`code=x&state=${old}`), '/?canva=invalid');
  clock = NOW;
  assert.equal(await go(`error=access_denied&state=${(await start()).searchParams.get('state')}`), '/?canva=denied');
  assert.equal(await go('code=x&state=whatever', null), '/?canva=signin');
  C['POST api.canva.com/rest/v1/oauth/token'] = { access_token: 'A', expires_in: 10 };
  assert.equal(await go(`code=x&state=${(await start()).searchParams.get('state')}`), '/?canva=no_refresh');
  C['POST api.canva.com/rest/v1/oauth/token'] = { status: 400, body: { error: 'invalid_request', error_description: 'bad verifier' } };
  assert.equal(await go(`code=x&state=${(await start()).searchParams.get('state')}`), '/?canva=failed');
});

test('a failing profile read does not stop the connection; fewer granted scopes are recorded as granted', async () => {
  baseCanva();
  C['POST api.canva.com/rest/v1/oauth/token'] = { access_token: 'ACCESS-1', refresh_token: 'REFRESH-1', expires_in: 14400, scope: 'asset:write design:content:write' };
  C['GET api.canva.com/rest/v1/users/me/profile'] = () => assert.fail('profile must not be read without profile:read');
  const st = (await start()).searchParams.get('state');
  assert.equal((await call('GET', `/api/integrations/canva/callback?code=CODE&state=${st}`, alice)).headers.get('location'), '/?canva=connected');
  const info = await (await call('GET', K(), alice)).json();
  assert.equal(info.name, null);
  assert.deepEqual(info.scopes, ['asset:write', 'design:content:write']);
});

test('check: uses the stored access token while it is valid, then refreshes once and replaces the single-use refresh token', async () => {
  await connect();
  calls.length = 0;
  assert.deepEqual(await (await call('POST', K() + '/check', alice)).json(), { ok: true, name: 'Nile Design Team' });
  assert.equal(calls.filter((c) => c.u.pathname.endsWith('/oauth/token')).length, 0);
  assert.equal(calls[0].auth, 'Bearer ACCESS-1');
  clock = NOW + 4 * 3600_000; // the access token has expired
  calls.length = 0;
  assert.equal((await call('POST', K() + '/check', alice)).status, 200);
  const rf = calls.filter((c) => c.u.pathname.endsWith('/oauth/token'));
  assert.equal(rf.length, 1);
  assert.deepEqual({ g: rf[0].body.grant_type, t: rf[0].body.refresh_token }, { g: 'refresh_token', t: 'REFRESH-1' });
  assert.equal(calls[calls.length - 1].auth, 'Bearer ACCESS-2');
  clock = NOW + 9 * 3600_000; // expired again: the NEW refresh token is the one sent
  calls.length = 0;
  assert.equal((await call('POST', K() + '/check', alice)).status, 200);
  assert.equal(calls.find((c) => c.u.pathname.endsWith('/oauth/token')).body.refresh_token, 'REFRESH-2');
  assert.ok(!stored().includes('REFRESH-3'));
  clock = NOW;
});

test('check: a revoked connection asks to reconnect (409) and says so afterwards; Canva 429 → 429, 403 → 403; own allowance; isolation', async () => {
  await connect();
  clock = NOW + 5 * 3600_000;
  C['POST api.canva.com/rest/v1/oauth/token'] = { status: 400, body: { error: 'invalid_grant', error_description: 'revoked' } };
  const r = await call('POST', K() + '/check', alice);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'canva_reauth' });
  assert.equal((await (await call('GET', K(), alice)).json()).needsReconnect, true);
  clock = NOW;
  await connect(); // connecting again clears it
  assert.equal((await (await call('GET', K(), alice)).json()).needsReconnect, false);
  C['GET api.canva.com/rest/v1/users/me/profile'] = { status: 429, body: { code: 'too_many_requests', message: 'slow down' } };
  assert.equal((await call('POST', K() + '/check', alice)).status, 429);
  C['GET api.canva.com/rest/v1/users/me/profile'] = { status: 403, body: { code: 'permission_denied', message: 'scope' } };
  assert.equal((await call('POST', K() + '/check', alice)).status, 403);
  assert.equal((await call('POST', K() + '/check', bob)).status, 404); // not a member of alice's company
  assert.equal((await call('POST', K(coB) + '/check', bob)).status, 404); // member, not connected
  // alice's own allowance (8 per window in this test app): once it is used up the answer is 429 without asking Canva
  baseCanva();
  let limited = null;
  for (let i = 0; i < 9 && !limited; i++) {
    const x = await call('POST', K() + '/check', alice);
    if (x.status === 429) limited = await x.json();
  }
  assert.deepEqual(limited, { error: 'too_many_attempts' });
});

test('disconnect: revokes the refresh token at Canva with Basic auth, forgets the connection even when Canva fails', async () => {
  await connect();
  calls.length = 0;
  assert.deepEqual(await (await call('DELETE', K(), alice)).json(), { ok: true });
  const rv = calls.find((c) => c.u.pathname.endsWith('/oauth/revoke'));
  assert.equal(rv.body.token, 'REFRESH-1');
  assert.match(rv.auth, /^Basic /);
  assert.deepEqual(await (await call('GET', K(), alice)).json(), { configured: true, connected: false });
  await connect();
  C['POST api.canva.com/rest/v1/oauth/revoke'] = { status: 500, body: { code: 'internal', message: 'x' } };
  assert.equal((await call('DELETE', K(), alice)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM canva_connections').get().n, 0);
  assert.equal((await call('DELETE', K(), bob)).status, 404);
});
