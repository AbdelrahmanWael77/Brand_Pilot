import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { ga4Rows, gscRows, googleConfig, GOOGLE_SCOPES } from '../server/google.js';

const config = googleConfig({ GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'g-secret', GOOGLE_REDIRECT_URI: 'https://app.example/api/integrations/google/callback', TOKEN_KEY: 'c'.repeat(64) });
const NOW = Date.parse('2026-11-13T12:00:00Z');
let clock = NOW;

/* ---- a stubbed Google network ---- */
const calls = [];
let G = {};
const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
async function fakeFetch(url, opts = {}) {
  const u = new URL(url);
  const body = opts.body ? (opts.headers['content-type'] === 'application/json' ? JSON.parse(opts.body) : Object.fromEntries(new URLSearchParams(opts.body))) : null;
  calls.push({ u, method: opts.method || 'GET', body, auth: opts.headers && opts.headers.authorization });
  const key = `${opts.method || 'GET'} ${u.host}${u.pathname}`;
  const h = G[key];
  if (!h) return json(404, { error: { code: 404, status: 'NOT_FOUND', message: 'no stub ' + key } });
  const r = typeof h === 'function' ? h(body, u) : h;
  return r.status ? json(r.status, r.body) : json(200, r);
}
const dv = (...v) => v.map((value) => ({ value }));
function baseGoogle() {
  let n = 0;
  G = {
    'POST oauth2.googleapis.com/token': (b) => (b.grant_type === 'authorization_code'
      ? { access_token: 'ACCESS-1', expires_in: 3599, refresh_token: 'REFRESH-1', scope: GOOGLE_SCOPES.join(' '), token_type: 'Bearer' }
      : { access_token: `ACCESS-R${++n}`, expires_in: 3599, scope: GOOGLE_SCOPES.join(' '), token_type: 'Bearer' }),
    'POST oauth2.googleapis.com/revoke': {},
    'GET analyticsadmin.googleapis.com/v1beta/accountSummaries': { accountSummaries: [{ account: 'accounts/1', displayName: 'Nile', propertySummaries: [{ property: 'properties/123', displayName: 'nile-supplies.example' }] }] },
    'GET analyticsadmin.googleapis.com/v1beta/properties/123/keyEvents': { keyEvents: [{ name: 'properties/123/keyEvents/9', eventName: 'generate_lead' }, { name: 'x', eventName: 'whatsapp_click' }] },
    'GET www.googleapis.com/webmasters/v3/sites': { siteEntry: [{ siteUrl: 'sc-domain:nile-supplies.example', permissionLevel: 'siteOwner' }, { siteUrl: 'https://other.example/', permissionLevel: 'siteUnverifiedUser' }] },
    'POST analyticsdata.googleapis.com/v1beta/properties/123:runReport': (b) => (b.metrics[0].name === 'sessions'
      ? { rowCount: 3, rows: [
        { dimensionValues: dv('20261110', 'Organic Search', '/clinics', 'desktop'), metricValues: dv('140') },
        { dimensionValues: dv('20261110', 'Paid Social', '/pricing', 'mobile'), metricValues: dv('220') },
        { dimensionValues: dv('20261111', 'Email', '(not set)', 'tablet'), metricValues: dv('45') },
      ] }
      : { rowCount: 1, rows: [{ dimensionValues: dv('20261110', 'Organic Search', '/clinics', 'desktop'), metricValues: dv('7') }] }),
    'POST www.googleapis.com/webmasters/v3/sites/sc-domain%3Anile-supplies.example/searchAnalytics/query': { rows: [
      { keys: ['2026-11-10', 'office supplies cairo', 'https://nile-supplies.example/'], clicks: 6, impressions: 300, ctr: 0.02, position: 8.234 },
      { keys: ['2026-11-11', 'medical consumables', 'https://nile-supplies.example/clinics'], clicks: 4, impressions: 120, ctr: 0.033, position: 4.1 },
    ] },
  };
}

let server, base, db, alice, bob, co, coB;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db, google: { config, fetch: fakeFetch, now: () => clock, syncLimit: { max: 50, windowMs: 60_000 } } }).listen(0);
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
const G_ = (id = co) => `/api/companies/${id}/integrations/google`;
async function startState(cookie = alice, id = co) {
  const r = await call('POST', G_(id) + '/start', cookie);
  assert.equal(r.status, 200);
  return new URL((await r.json()).url).searchParams.get('state');
}
async function connect() {
  baseGoogle();
  const st = await startState();
  const r = await call('GET', `/api/integrations/google/callback?code=CODE&state=${st}`, alice);
  assert.equal(r.headers.get('location'), '/?google=connected');
}

test('mapping: GA4 rows with and without a chosen key event, Search Console rows', () => {
  const s = [{ dimensionValues: dv('20261110', 'Direct', '/a', 'Mobile'), metricValues: dv('10') }, { dimensionValues: dv('bad', 'Direct', '/a', 'mobile'), metricValues: dv('1') }];
  assert.deepEqual(ga4Rows(s, null), [{ date: '2026-11-10', channel: 'Direct', sessions: 10, landing_page: '/a', device: 'mobile' }]); // no enquiries column at all
  assert.deepEqual(ga4Rows(s, [])[0].enquiries, 0); // a key event was chosen and none happened: a real 0
  assert.deepEqual(gscRows([{ keys: ['2026-11-10', 'q', 'https://x/'], clicks: 1, impressions: 9, position: 3.26 }, { keys: ['2026-11-10', '', 'p'], clicks: 1, impressions: 1 }]),
    [{ date: '2026-11-10', query: 'q', clicks: 1, impressions: 9, page: 'https://x/', position: 3.3 }]);
});

test('not configured: status false, start / options / sync 503, no network', async () => {
  const db2 = openDb(':memory:');
  const s2 = createApp({ db: db2, google: { config: googleConfig({}), fetch: () => assert.fail('no network') } }).listen(0);
  await new Promise((r) => s2.once('listening', r));
  try {
    const b2 = `http://127.0.0.1:${s2.address().port}`;
    const ck = (await fetch(b2 + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'c@example.com', password: 'correct horse' }) })).headers.getSetCookie()[0].split(';')[0];
    const id = (await (await fetch(b2 + '/api/companies', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{"name":"X"}' })).json()).company.id;
    assert.deepEqual((await (await fetch(b2 + '/api/integrations/status', { headers: { cookie: ck } })).json()).google, { configured: false });
    for (const [m, p] of [['POST', '/start'], ['GET', '/options'], ['POST', '/sync']]) assert.equal((await fetch(`${b2}/api/companies/${id}/integrations/google${p}`, { method: m, headers: { cookie: ck, 'content-type': 'application/json' }, body: m === 'POST' ? '{}' : undefined })).status, 503, p);
  } finally {
    s2.close();
    db2.close();
  }
});

test('start: Google consent URL, offline access, read-only scopes, fresh state, no secret; isolation', async () => {
  const u = new URL((await (await call('POST', G_() + '/start', alice)).json()).url);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('client_id'), config.clientId);
  assert.equal(u.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.deepEqual(u.searchParams.get('scope').split(' '), GOOGLE_SCOPES);
  assert.ok(u.searchParams.get('state').length >= 40);
  assert.equal(u.toString().includes('g-secret'), false);
  assert.equal((await call('POST', G_() + '/start', bob)).status, 404);
  assert.equal((await call('POST', G_() + '/start', null)).status, 401);
});

test('callback: state rules, refusal, missing refresh token, success stores tokens encrypted', async () => {
  baseGoogle();
  const cb = (q, cookie = alice) => call('GET', `/api/integrations/google/callback?${new URLSearchParams(q)}`, cookie);
  const loc = (r) => r.headers.get('location');
  assert.equal(loc(await cb({ code: 'c', state: 'made-up' })), '/?google=invalid');
  assert.equal(loc(await cb({ code: 'c', state: await startState(bob, coB) })), '/?google=invalid');
  const old = await startState();
  clock = NOW + 11 * 60_000;
  assert.equal(loc(await cb({ code: 'c', state: old })), '/?google=invalid');
  clock = NOW;
  assert.equal(loc(await cb({ error: 'access_denied', state: await startState() })), '/?google=denied');
  assert.equal(loc(await cb({ code: 'c', state: 'x' }, null)), '/?google=signin');
  G['POST oauth2.googleapis.com/token'] = { access_token: 'A', expires_in: 3599, scope: GOOGLE_SCOPES.join(' ') }; // no refresh_token
  assert.equal(loc(await cb({ code: 'c', state: await startState() })), '/?google=no_refresh');
  baseGoogle();
  calls.length = 0;
  const st = await startState();
  assert.equal(loc(await cb({ code: 'CODE-1', state: st })), '/?google=connected');
  assert.equal(loc(await cb({ code: 'CODE-1', state: st })), '/?google=invalid');
  const ex = calls.find((c) => c.u.pathname === '/token');
  assert.deepEqual(ex.body, { client_id: config.clientId, client_secret: 'g-secret', code: 'CODE-1', grant_type: 'authorization_code', redirect_uri: config.redirectUri });
  const raw = JSON.stringify(db.prepare('SELECT * FROM google_connections').all());
  assert.equal(raw.includes('REFRESH-1') || raw.includes('ACCESS-1'), false, 'tokens encrypted at rest');
  const info = await (await call('GET', G_(), alice)).json();
  assert.equal(info.connected, true);
  assert.equal(info.gaProperty, null);
  assert.equal(JSON.stringify(info).includes('REFRESH'), false);
  assert.equal((await call('GET', G_(), bob)).status, 404);
});

test('options and choices: only what this Google account can read is accepted', async () => {
  await connect();
  const o = await (await call('GET', G_() + '/options', alice)).json();
  assert.deepEqual(o.properties, [{ id: 'properties/123', name: 'nile-supplies.example', account: 'Nile' }]);
  assert.deepEqual(o.sites, [{ url: 'sc-domain:nile-supplies.example', permission: 'siteOwner' }]); // unverified site left out
  assert.deepEqual((await (await call('GET', G_() + '/options?property=properties/123', alice)).json()).keyEvents, ['generate_lead', 'whatsapp_click']);
  assert.equal((await call('GET', G_() + '/options?property=properties/999', alice)).status, 400);
  assert.equal((await call('GET', G_() + '/options?property=evil', alice)).status, 400);
  // Sync before choosing.
  assert.equal((await call('POST', G_() + '/sync', alice, { only: 'ga4' })).status, 409);
  assert.equal((await call('POST', G_() + '/sync', alice, { only: 'gsc' })).status, 409);
  for (const bad of [{ gaProperty: 'properties/999' }, { gaProperty: 'properties/123', keyEvent: 'purchase' }, { keyEvent: 'generate_lead' }, { gscSite: 'https://other.example/' }]) {
    assert.equal((await call('PUT', G_(), alice, bad)).status, 400, JSON.stringify(bad));
  }
  const r = await (await call('PUT', G_(), alice, { gaProperty: 'properties/123', keyEvent: 'generate_lead', gscSite: 'sc-domain:nile-supplies.example' })).json();
  assert.equal(r.gaPropertyName, 'nile-supplies.example');
  assert.equal(r.keyEvent, 'generate_lead');
  assert.equal(r.gscSite, 'sc-domain:nile-supplies.example');
  assert.equal((await call('PUT', G_(), bob, { gaProperty: 'properties/123' })).status, 404);
});

test('sync: GA4 rows with the chosen key event as enquiries; Search Console rows; token refreshed when expired', async () => {
  calls.length = 0;
  let r = await call('POST', G_() + '/sync', alice, { only: 'ga4', days: 30 });
  assert.equal(r.status, 200);
  let s = await r.json();
  assert.deepEqual(s.rows, [
    { date: '2026-11-10', channel: 'Organic Search', sessions: 140, landing_page: '/clinics', device: 'desktop', enquiries: 7 },
    { date: '2026-11-10', channel: 'Paid Social', sessions: 220, landing_page: '/pricing', device: 'mobile', enquiries: 0 },
    { date: '2026-11-11', channel: 'Email', sessions: 45, landing_page: '(not set)', device: 'tablet', enquiries: 0 },
  ]);
  assert.equal(s.enquiries, 'generate_lead');
  assert.deepEqual(s.requested, { startDate: '2026-10-14', endDate: '2026-11-12' });
  const reports = calls.filter((c) => c.u.pathname.endsWith(':runReport'));
  assert.equal(reports.length, 2);
  assert.deepEqual(reports[1].body.dimensionFilter, { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'generate_lead' } } });
  assert.deepEqual(reports[0].body.dimensions.map((d) => d.name), ['date', 'sessionDefaultChannelGroup', 'landingPage', 'deviceCategory']);
  assert.equal(reports[0].auth, 'Bearer ACCESS-1'); // still valid: no refresh
  r = await call('POST', G_() + '/sync', alice, { only: 'gsc' });
  s = await r.json();
  assert.deepEqual(s.rows, [
    { date: '2026-11-10', query: 'office supplies cairo', clicks: 6, impressions: 300, page: 'https://nile-supplies.example/', position: 8.2 },
    { date: '2026-11-11', query: 'medical consumables', clicks: 4, impressions: 120, page: 'https://nile-supplies.example/clinics', position: 4.1 },
  ]);
  const q = calls.find((c) => c.u.pathname.endsWith('/searchAnalytics/query'));
  assert.deepEqual([q.body.dimensions, q.body.type], [['date', 'query', 'page'], 'web']);
  // An hour later the access token has expired: the server refreshes it with the stored refresh token.
  clock = NOW + 2 * 3600_000;
  calls.length = 0;
  assert.equal((await call('POST', G_() + '/sync', alice, { only: 'gsc' })).status, 200);
  const ref = calls.find((c) => c.u.pathname === '/token');
  assert.deepEqual(ref.body, { client_id: config.clientId, client_secret: 'g-secret', grant_type: 'refresh_token', refresh_token: 'REFRESH-1' });
  assert.equal(calls.find((c) => c.u.pathname.endsWith('/query')).auth, 'Bearer ACCESS-R1');
  clock = NOW;
  // Without a key event the GA4 rows carry no enquiries at all.
  await call('PUT', G_(), alice, { gaProperty: 'properties/123', gscSite: 'sc-domain:nile-supplies.example' });
  s = await (await call('POST', G_() + '/sync', alice, { only: 'ga4' })).json();
  assert.equal(s.rows.some((x) => 'enquiries' in x), false);
  assert.equal(s.enquiries, null);
});

test('errors: revoked access asks to reconnect, quota is 429, no permission is 403, bad input 400, isolation 404', async () => {
  assert.equal((await call('POST', G_() + '/sync', alice, { only: 'x' })).status, 400);
  assert.equal((await call('POST', G_() + '/sync', alice, { only: 'ga4', days: 0 })).status, 400);
  assert.equal((await call('POST', G_() + '/sync', bob, { only: 'ga4' })).status, 404);
  assert.equal((await call('POST', G_(coB) + '/sync', bob, { only: 'ga4' })).status, 404);
  G['POST www.googleapis.com/webmasters/v3/sites/sc-domain%3Anile-supplies.example/searchAnalytics/query'] = { status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } };
  assert.equal((await call('POST', G_() + '/sync', alice, { only: 'gsc' })).status, 429);
  G['POST www.googleapis.com/webmasters/v3/sites/sc-domain%3Anile-supplies.example/searchAnalytics/query'] = { status: 403, body: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'User does not have sufficient permission' } } };
  assert.deepEqual(await (await call('POST', G_() + '/sync', alice, { only: 'gsc' })).json(), { error: 'google_forbidden' });
  // Refresh token revoked by the user at Google.
  clock = NOW + 3 * 3600_000;
  G['POST oauth2.googleapis.com/token'] = { status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } };
  const r = await call('POST', G_() + '/sync', alice, { only: 'ga4' });
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'google_reauth' });
  assert.equal((await (await call('GET', G_(), alice)).json()).needsReconnect, true);
  clock = NOW;
});

test('disconnect revokes at Google and forgets the token; company delete removes the connection', async () => {
  await connect();
  calls.length = 0;
  assert.equal((await call('DELETE', G_(), bob)).status, 404);
  assert.equal((await call('DELETE', G_(), alice)).status, 200);
  const rv = calls.find((c) => c.u.pathname === '/revoke');
  assert.deepEqual(rv.body, { token: 'REFRESH-1' });
  assert.deepEqual(await (await call('GET', G_(), alice)).json(), { configured: true, connected: false });
  // Revoking is best effort: a failure at Google still forgets the token here.
  await connect();
  G['POST oauth2.googleapis.com/revoke'] = { status: 400, body: { error: 'invalid_token' } };
  assert.equal((await call('DELETE', G_(), alice)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM google_connections').get().n, 0);
  await connect();
  await call('DELETE', `/api/companies/${co}`, alice);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM google_connections').get().n, 0);
});
