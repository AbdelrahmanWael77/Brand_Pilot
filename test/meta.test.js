import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { fbRow, igRow, scriptLang, metaConfig, sealer, META_SCOPES } from '../server/meta.js';

const KEY = 'a'.repeat(64);
const config = metaConfig({ META_APP_ID: '111', META_APP_SECRET: 'app-secret-xyz', META_REDIRECT_URI: 'https://app.example/api/integrations/meta/callback', TOKEN_KEY: KEY });
const NOW = Date.parse('2026-11-13T12:00:00Z');
let clock = NOW;

/* ---- a stubbed Graph API ---- */
const calls = [];
let graph = {}; // pathname (after the version) → body or (url) => body
const reply = (body) => ({ ok: !body.error, status: body.error ? 400 : 200, json: async () => body });
async function fakeFetch(url) {
  const u = new URL(url);
  calls.push(u);
  assert.equal(u.hostname, 'graph.facebook.com', 'only Graph is called');
  const key = u.pathname.replace(/^\/v27\.0\//, '');
  const h = graph[key];
  if (!h) return reply({ error: { code: 100, message: `no stub for ${key}` } });
  return reply(typeof h === 'function' ? h(u) : h);
}
const ins = (o) => ({ data: Object.entries(o).map(([name, value]) => ({ name, period: 'lifetime', values: [{ value }] })) });
function baseGraph() {
  graph = {
    'oauth/access_token': (u) => (u.searchParams.get('grant_type') === 'fb_exchange_token' ? { access_token: 'LONG-USER-TOKEN', expires_in: 5183944 } : { access_token: 'SHORT-USER-TOKEN', expires_in: 3600 }),
    'me/accounts': { data: [{ id: 'P1', name: 'Nile Office Supplies', access_token: 'PAGE-TOKEN-1', instagram_business_account: { id: 'IG1' } }] },
    'P1/feed': {
      data: [
        { id: 'P1_a', created_time: '2026-11-10T09:00:00+0000', message: 'توصيل مجاني لأول طلب', shares: { count: 4 } },
        { id: 'P1_b', created_time: '2026-11-01T09:00:00+0000', message: 'Free delivery on first orders' },
        { id: 'P1_c', created_time: '2026-10-20T09:00:00+0000', message: 'no insights for this one' },
        { id: 'P1_old', created_time: '2026-07-01T09:00:00+0000', message: 'outside the window' },
      ],
    },
    'P1_a/insights': ins({ post_total_media_view_unique: 1200, post_media_view: 2000, post_clicks_by_type: { 'link clicks': 30, 'other clicks': 9 }, post_reactions_by_type_total: { like: 40, love: 6 } }),
    'P1_b/insights': ins({ post_total_media_view_unique: 800, post_media_view: 900, post_reactions_by_type_total: {} }),
    'P1_c/insights': { data: [] },
    'IG1/media': { data: [
      { id: 'M1', timestamp: '2026-11-11T10:00:00+0000', media_type: 'IMAGE', caption: 'Clinics: printer paper & toner' },
      { id: 'M2', timestamp: '2026-11-05T10:00:00+0000', media_type: 'CAROUSEL_ALBUM', caption: '' },
    ] },
    'M1/insights': { data: [{ name: 'reach', values: [{ value: 500 }] }, { name: 'views', values: [{ value: 650 }] }, { name: 'total_interactions', total_value: { value: 37 } }] },
    // M2 has no stub → a Graph error for that one item, counted and skipped
  };
}

let server, base, db, alice, bob, co, coB;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db, meta: { config, fetch: fakeFetch, now: () => clock, syncLimit: { max: 50, windowMs: 60_000 } } }).listen(0);
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
async function startState(cookie = alice, id = co) {
  const r = await call('POST', `/api/companies/${id}/integrations/meta/start`, cookie);
  assert.equal(r.status, 200);
  return new URL((await r.json()).url).searchParams.get('state');
}

// ---- pure mapping ----
test('row mapping: only current metrics, absent ones left out, never invented', () => {
  assert.deepEqual(fbRow({ id: 'x', created_time: '2026-11-10T23:30:00+0000', message: 'Hello', shares: { count: 2 } },
    ins({ post_total_media_view_unique: 10, post_media_view: 15, post_clicks_by_type: { 'other clicks': 1 }, post_reactions_by_type_total: { like: 3, wow: 1 } }).data),
  { date: '2026-11-10', platform: 'facebook', post_id: 'x', reach: 10, impressions: 15, engagements: 6, link_clicks: 0, language: 'en' });
  // No reach → no row (reach is required by the Meta schema).
  assert.equal(fbRow({ id: 'y', created_time: '2026-11-10T00:00:00+0000' }, ins({ post_media_view: 5 }).data), null);
  // Without the clicks metric the row has no link_clicks at all (not 0); without views no impressions.
  const r = fbRow({ id: 'z', created_time: '2026-11-10T00:00:00+0000' }, ins({ post_total_media_view_unique: 3 }).data);
  assert.equal('link_clicks' in r, false);
  assert.equal('impressions' in r, false);
  assert.equal('language' in r, false);
  assert.deepEqual(igRow({ id: 'm', timestamp: '2026-11-11T10:00:00+0000', media_type: 'REELS', caption: 'عرض اليوم' },
    [{ name: 'reach', values: [{ value: 9 }] }, { name: 'total_interactions', total_value: { value: 2 } }]),
  { date: '2026-11-11', platform: 'instagram', post_id: 'm', reach: 9, engagements: 2, format: 'reels', language: 'ar' });
  assert.equal(scriptLang('Clinics عيادات عيادات'), 'ar');
  assert.equal(scriptLang('123 !'), undefined);
});

test('token sealing: round trip, ciphertext differs each time, tampering fails', () => {
  const s = sealer(KEY);
  const a = s.seal('secret'), b = s.seal('secret');
  assert.notEqual(a, b);
  assert.equal(s.open(a), 'secret');
  const [iv, tag, ct] = a.split('.');
  const flip = (x) => (x[0] === 'A' ? 'B' : 'A') + x.slice(1); // first char: always meaningful bits
  assert.throws(() => s.open([iv, flip(tag), ct].join('.')));
  assert.throws(() => s.open([iv, tag, flip(ct)].join('.')));
});

// ---- not configured ----
test('without config: status says so, start and sync answer 503, nothing calls Meta', async () => {
  const db2 = openDb(':memory:');
  const s2 = createApp({ db: db2, meta: { config: metaConfig({}), fetch: () => assert.fail('no network') } }).listen(0);
  await new Promise((r) => s2.once('listening', r));
  try {
  const b2 = `http://127.0.0.1:${s2.address().port}`;
  const ck = (await fetch(b2 + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'c@example.com', password: 'correct horse' }) })).headers.getSetCookie()[0].split(';')[0];
  const id = (await (await fetch(b2 + '/api/companies', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{"name":"X"}' })).json()).company.id;
  assert.deepEqual((await (await fetch(b2 + '/api/integrations/status', { headers: { cookie: ck } })).json()).meta, { configured: false });
  assert.equal((await fetch(`${b2}/api/companies/${id}/integrations/meta/start`, { method: 'POST', headers: { cookie: ck } })).status, 503);
  assert.equal((await fetch(`${b2}/api/companies/${id}/integrations/meta/sync`, { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json' }, body: '{}' })).status, 503);
  assert.deepEqual(await (await fetch(`${b2}/api/companies/${id}/integrations/meta`, { headers: { cookie: ck } })).json(), { configured: false, connected: false });
  } finally {
    s2.close();
    db2.close();
  }
  assert.equal(metaConfig({ META_APP_ID: '1', META_APP_SECRET: 's', META_REDIRECT_URI: 'https://x/cb', TOKEN_KEY: 'short' }).configured, false);
});

// ---- connect ----
test('start: consent URL with the app id, redirect, read-only scopes and a fresh state; other users 404', async () => {
  const r = await call('POST', `/api/companies/${co}/integrations/meta/start`, alice);
  const u = new URL((await r.json()).url);
  assert.equal(u.origin + u.pathname, 'https://www.facebook.com/v27.0/dialog/oauth');
  assert.equal(u.searchParams.get('client_id'), '111');
  assert.equal(u.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.deepEqual(u.searchParams.get('scope').split(','), META_SCOPES);
  assert.ok(u.searchParams.get('state').length >= 40);
  assert.notEqual(u.searchParams.get('state'), await startState());
  assert.equal(u.toString().includes('app-secret'), false); // the secret never reaches the browser
  assert.equal((await call('POST', `/api/companies/${co}/integrations/meta/start`, bob)).status, 404);
  assert.equal((await call('POST', `/api/companies/${co}/integrations/meta/start`, null)).status, 401);
});

test('callback: state must be fresh, single-use and the same user; a refusal is reported; tokens stored encrypted', async () => {
  baseGraph();
  const cb = (q, cookie = alice) => call('GET', `/api/integrations/meta/callback?${new URLSearchParams(q)}`, cookie);
  const loc = (r) => r.headers.get('location');
  assert.equal(loc(await cb({ code: 'c', state: 'made-up' })), '/?meta=invalid');
  // Someone else's state (bob started it for his company) does not work for alice — and alice's does not work for bob.
  assert.equal(loc(await cb({ code: 'c', state: await startState(bob, coB) })), '/?meta=invalid');
  assert.equal(loc(await cb({ code: 'c', state: await startState() }, bob)), '/?meta=invalid');
  // Expired after 10 minutes.
  const old = await startState();
  clock = NOW + 11 * 60_000;
  assert.equal(loc(await cb({ code: 'c', state: old })), '/?meta=invalid');
  clock = NOW;
  // The person declined on Meta's screen.
  assert.equal(loc(await cb({ error: 'access_denied', state: await startState() })), '/?meta=denied');
  // Signed out.
  assert.equal(loc(await cb({ code: 'c', state: 'x' }, null)), '/?meta=signin');
  // Success.
  calls.length = 0;
  const st = await startState();
  assert.equal(loc(await cb({ code: 'CODE-1', state: st })), '/?meta=connected');
  assert.equal(loc(await cb({ code: 'CODE-1', state: st })), '/?meta=invalid'); // single use
  const ex = calls.find((u) => u.pathname.endsWith('oauth/access_token') && u.searchParams.get('code'));
  assert.equal(ex.searchParams.get('client_secret'), 'app-secret-xyz');
  assert.equal(ex.searchParams.get('redirect_uri'), config.redirectUri);
  const acc = calls.find((u) => u.pathname.endsWith('me/accounts'));
  assert.equal(acc.searchParams.get('access_token'), 'LONG-USER-TOKEN');
  assert.match(acc.searchParams.get('appsecret_proof'), /^[0-9a-f]{64}$/);
  // Connection info: pages, never a token.
  const info = await (await call('GET', `/api/companies/${co}/integrations/meta`, alice)).json();
  assert.equal(info.connected, true);
  assert.deepEqual(info.pages, [{ id: 'P1', name: 'Nile Office Supplies', instagram: true }]);
  assert.equal(info.expiresAt, new Date(NOW + 5183944 * 1000).toISOString());
  assert.equal(JSON.stringify(info).includes('TOKEN'), false);
  const raw = JSON.stringify(db.prepare('SELECT * FROM meta_connections').all());
  assert.equal(raw.includes('LONG-USER-TOKEN') || raw.includes('PAGE-TOKEN-1'), false, 'tokens are encrypted at rest');
  assert.equal((await call('GET', `/api/companies/${co}/integrations/meta`, bob)).status, 404);
});

// ---- sync ----
test('sync: posts and media in the window become Meta rows; gaps are counted, not invented', async () => {
  baseGraph();
  calls.length = 0;
  const r = await call('POST', `/api/companies/${co}/integrations/meta/sync`, alice, { days: 30 });
  assert.equal(r.status, 200);
  const s = await r.json();
  assert.deepEqual(s.rows, [
    { date: '2026-11-10', platform: 'facebook', post_id: 'P1_a', reach: 1200, impressions: 2000, engagements: 50, link_clicks: 30, language: 'ar' },
    { date: '2026-11-01', platform: 'facebook', post_id: 'P1_b', reach: 800, impressions: 900, engagements: 0, language: 'en' },
    { date: '2026-11-11', platform: 'instagram', post_id: 'M1', reach: 500, impressions: 650, engagements: 37, format: 'image', language: 'en' },
  ]);
  assert.deepEqual(s.skipped, { noInsights: 1, errors: 1 }); // P1_c returned no metrics; M2's insights failed
  assert.deepEqual(s.accounts, { pages: 1, instagram: 1 });
  assert.equal(s.from, '2026-11-01');
  assert.equal(s.to, '2026-11-11');
  assert.equal(calls.some((u) => u.pathname.includes('P1_old')), false); // outside the window: no insights requested
  // Page data is read with the Page token, and the IG media list is limited with `since`.
  assert.equal(calls.find((u) => u.pathname.endsWith('P1/feed')).searchParams.get('access_token'), 'PAGE-TOKEN-1');
  assert.equal(calls.find((u) => u.pathname.endsWith('IG1/media')).searchParams.get('since'), String(Math.floor((NOW - 30 * 86_400_000) / 1000)));
  const info = await (await call('GET', `/api/companies/${co}/integrations/meta`, alice)).json();
  assert.equal(info.lastSyncAt, new Date(NOW).toISOString());
});

test('sync errors: expired token asks to reconnect, throttling is 429, bad input 400, isolation 404', async () => {
  baseGraph();
  assert.equal((await call('POST', `/api/companies/${co}/integrations/meta/sync`, alice, { days: 0 })).status, 400);
  assert.equal((await call('POST', `/api/companies/${co}/integrations/meta/sync`, alice, { days: 400 })).status, 400);
  assert.equal((await call('POST', `/api/companies/${co}/integrations/meta/sync`, bob, {})).status, 404);
  assert.equal((await call('POST', `/api/companies/${coB}/integrations/meta/sync`, bob, {})).status, 404); // bob never connected
  graph['P1/feed'] = { error: { code: 4, message: 'Application request limit reached' } };
  assert.equal((await call('POST', `/api/companies/${co}/integrations/meta/sync`, alice, {})).status, 429);
  graph['P1/feed'] = { error: { code: 190, error_subcode: 463, message: 'Session has expired' } };
  const r = await call('POST', `/api/companies/${co}/integrations/meta/sync`, alice, {});
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'meta_reauth' });
  assert.equal((await (await call('GET', `/api/companies/${co}/integrations/meta`, alice)).json()).needsReconnect, true);
});

test('disconnect forgets the tokens; deleting the company removes the connection', async () => {
  assert.equal((await call('DELETE', `/api/companies/${co}/integrations/meta`, bob)).status, 404);
  assert.equal((await call('DELETE', `/api/companies/${co}/integrations/meta`, alice)).status, 200);
  assert.deepEqual(await (await call('GET', `/api/companies/${co}/integrations/meta`, alice)).json(), { configured: true, connected: false });
  assert.equal((await call('POST', `/api/companies/${co}/integrations/meta/sync`, alice, {})).status, 404);
  baseGraph();
  const st = await startState();
  await call('GET', `/api/integrations/meta/callback?code=c&state=${st}`, alice);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM meta_connections').get().n, 1);
  await call('DELETE', `/api/companies/${co}`, alice);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM meta_connections').get().n, 0);
});
