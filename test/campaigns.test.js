import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { campaigns, cleanCampaign, cleanAsset, cleanBrief, LIMITS } from '../server/campaigns.js';

// ---- fixtures in the shape the Campaign Studio stores ----
const field = (v, edited = false) => ({ tpl: '{{message}}', v, edited });
const asset = (id, over = {}) => ({
  id, type: 'post', lang: 'en', channel: 'facebook', n: 1, status: 'draft', flag: null,
  design: { bg: 'primary', img: 'm1' }, fields: { headline: field('Reliable supply'), cta: field('Request a price list') }, ...over,
});
const brief = (over = {}) => ({
  objective: 'Qualified enquiries', concept: 'Address clinics', why: ['Clinics: 70% qualified (30 leads)'], metric: 'Qualified leads',
  audienceEn: 'Clinics', audienceAr: '', messageEn: 'Reliable supply', messageAr: 'توريد موثوق', offerEn: 'Free delivery', offerAr: 'توصيل مجاني',
  ctaEn: 'Request a price list', ctaAr: 'اطلب قائمة الأسعار', url: 'https://example.com/lp/ql-clinics', channels: ['facebook', 'email'],
  pointsEn: ['A', 'B', 'C'], pointsAr: ['أ', 'ب', 'ج'], colors: { primary: '#000' }, font: 'sans', tone: 'Clear', ...over,
});
const campaign = (id, over = {}) => ({
  id, name: 'Qualified leads — Clinics', slug: 'ql-clinics', at: Date.UTC(2026, 10, 12), rec: 'seg-best', approved: true, target: '40 leads',
  versions: [{ n: 1 }], brief: brief(), assets: [asset('a1'), asset('a2', { type: 'landing', lang: 'ar', channel: 'web', n: 0, status: 'approved', flag: 'stale' })], ...over,
});

// ---- pure validation ----
test('cleanBrief keeps known wording only, with caps; wrong types become empty', () => {
  const b = cleanBrief(brief({ ctaEn: 'x'.repeat(LIMITS.text + 50), offerEn: 42, why: ['ok', 7, '', '  ', ...Array(20).fill('more')], channels: ['email', 'email', 'tiktok', 'facebook'], pointsAr: 'not a list' }));
  assert.equal(b.ctaEn.length, LIMITS.text);
  assert.equal(b.offerEn, '');
  assert.equal(b.why.length, LIMITS.list);
  assert.deepEqual(b.why.slice(0, 2), ['ok', 'more']);
  assert.deepEqual(b.channels, ['email', 'facebook']);
  assert.deepEqual(b.pointsAr, []);
  assert.equal(b.colors, undefined);
  assert.equal(b.font, undefined);
  assert.deepEqual(Object.keys(cleanBrief(null)).length, Object.keys(b).length);
});

test('cleanAsset: keeps text and edited flag only; unknown status is draft; bad shapes are refused', () => {
  const { asset: a, skipped } = cleanAsset(asset('a1', { status: 'published', flag: 'stale', n: 2.5, fields: { headline: field('H', true), bad: 'text', 'not a key': field('x'), body: { v: 5 }, long: field('y'.repeat(LIMITS.field + 9)) } }));
  assert.equal(skipped, 3);
  assert.deepEqual(a.fields.headline, { v: 'H', edited: true });
  assert.equal(a.fields.long.v.length, LIMITS.field);
  assert.deepEqual(Object.keys(a.fields), ['headline', 'long']);
  assert.equal(a.status, 'draft');
  assert.equal(a.flagged, true);
  assert.equal(a.n, 0);
  assert.equal(a.design, undefined);
  for (const bad of [null, 'x', [], asset(''), asset('a', { type: 'video' }), asset('a', { lang: 'fr' }), asset('a', { channel: 'tiktok' }), asset('a', { fields: [] }), asset('a', { fields: {} }), asset('a', { fields: { h: 'x' } })]) {
    assert.equal(cleanAsset(bad).asset, null, JSON.stringify(bad));
  }
});

test('cleanCampaign: refuses bad id, name, slug or rec; drops duplicate and excess assets', () => {
  for (const bad of [null, [], campaign(''), campaign('x'.repeat(LIMITS.id + 1)), campaign(7), campaign('k', { name: '  ' }), campaign('k', { name: 'n'.repeat(LIMITS.name + 1) }), campaign('k', { slug: 'Has Space' }), campaign('k', { slug: '' }), campaign('k', { slug: 's'.repeat(LIMITS.slug + 1) }), campaign('k', { rec: 5 }), campaign('k', { rec: '' })]) {
    assert.equal(cleanCampaign(bad).campaign, null, JSON.stringify(bad)?.slice(0, 80));
  }
  const many = Array.from({ length: LIMITS.assets + 3 }, (_, i) => asset('a' + i));
  const r = cleanCampaign(campaign('k', { rec: null, approved: 'yes', at: 'soon', assets: [...many, asset('a0'), 'junk'] }));
  assert.equal(r.campaign.assets.length, LIMITS.assets);
  assert.equal(r.skipped, 5);
  assert.equal(r.campaign.rec, null);
  assert.equal(r.campaign.approved, false);
  assert.equal(r.campaign.createdAt, null);
  assert.equal(cleanCampaign(campaign('k', { assets: undefined })).campaign.assets.length, 0);
});

// ---- HTTP ----
let server, base, db, alice, bob, co, other, bobCo;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  co = await company(alice, 'Nile Dental');
  other = await company(alice, 'Second Co');
  bobCo = await company(bob, 'Bob Co');
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
const company = async (cookie, name) => (await (await call('POST', '/api/companies', cookie, { name })).json()).company.id;
const put = async (id, state, cookie = alice) => (await call('PUT', `/api/companies/${id}/state`, cookie, { state })).json();
const list = async (id, cookie = alice) => (await (await call('GET', `/api/companies/${id}/campaigns`, cookie)).json()).campaigns;

test('round trip: PUT state → GET campaigns returns the validated copy', async () => {
  const state = { campaigns: [campaign('k1'), campaign('k2', { name: 'Manual one', slug: 'manual-one', rec: null, approved: false, assets: [] })] };
  const r = await put(co, state);
  assert.deepEqual(r.campaigns, { campaigns: 2, assets: 2, skipped: 0 });

  assert.deepEqual(await list(co), [
    { id: 'k1', name: 'Qualified leads — Clinics', slug: 'ql-clinics', rec: 'seg-best', approved: true, createdAt: '2026-11-12T00:00:00.000Z', assets: 2, approvedAssets: 1 },
    { id: 'k2', name: 'Manual one', slug: 'manual-one', rec: null, approved: false, createdAt: '2026-11-12T00:00:00.000Z', assets: 0, approvedAssets: 0 },
  ]);

  const res = await call('GET', `/api/companies/${co}/campaigns/k1`, alice);
  assert.equal(res.status, 200);
  const c = (await res.json()).campaign;
  assert.equal(c.rec, 'seg-best');
  assert.equal(c.brief.ctaAr, 'اطلب قائمة الأسعار');
  assert.deepEqual(c.brief.channels, ['facebook', 'email']);
  assert.deepEqual(c.brief.why, ['Clinics: 70% qualified (30 leads)']);
  assert.equal(c.brief.colors, undefined);
  assert.equal(c.versions, undefined);
  assert.equal(c.target, undefined);
  assert.deepEqual(c.assets, [
    { id: 'a1', type: 'post', lang: 'en', channel: 'facebook', n: 1, status: 'draft', flagged: false, fields: { headline: { v: 'Reliable supply', edited: false }, cta: { v: 'Request a price list', edited: false } } },
    { id: 'a2', type: 'landing', lang: 'ar', channel: 'web', n: 0, status: 'approved', flagged: true, fields: { headline: { v: 'Reliable supply', edited: false }, cta: { v: 'Request a price list', edited: false } } },
  ]);
  assert.equal((await call('GET', `/api/companies/${co}/campaigns/nope`, alice)).status, 404);
  assert.deepEqual(campaigns(db, co).map((x) => [x.id, x.assets.length]), [['k1', 2], ['k2', 0]]);
});

test('malformed campaigns, assets and fields are skipped and counted, never fatal', async () => {
  const state = {
    campaigns: [
      campaign('good', { assets: [asset('a1'), asset('a1'), asset('a3', { type: 'video' }), asset('a4', { fields: { h: field('ok'), broken: 5 } })] }),
      campaign('good', { name: 'duplicate id' }),
      campaign('bad-slug', { slug: 'NOT VALID' }),
      'junk',
      null,
    ],
  };
  const r = await put(co, state);
  // 4 campaigns refused; inside "good": duplicate asset, unknown type, one broken field.
  assert.deepEqual(r.campaigns, { campaigns: 1, assets: 2, skipped: 7 });
  assert.deepEqual((await list(co)).map((x) => x.id), ['good']);

  for (const bad of [{ campaigns: 'nope' }, { campaigns: { a: 1 } }]) {
    assert.deepEqual((await put(co, bad)).campaigns, { campaigns: 0, assets: 0, skipped: 1 });
    assert.deepEqual(await list(co), []);
  }
  assert.deepEqual((await put(co, {})).campaigns, { campaigns: 0, assets: 0, skipped: 0 });
});

test('caps: at most LIMITS.campaigns campaigns', async () => {
  const many = Array.from({ length: LIMITS.campaigns + 4 }, (_, i) => campaign('k' + i, { slug: 'c-' + i, assets: [] }));
  const r = await put(co, { campaigns: many });
  assert.deepEqual(r.campaigns, { campaigns: LIMITS.campaigns, assets: 0, skipped: 4 });
  assert.equal((await list(co)).length, LIMITS.campaigns);
});

test('the mirror follows the state: removed campaigns and assets disappear; an unchanged save answers the same', async () => {
  await put(co, { campaigns: [campaign('k1'), campaign('k2', { slug: 'two' })] });
  assert.equal((await list(co)).length, 2);
  const once = await put(co, { campaigns: [campaign('k2', { slug: 'two', assets: [asset('a1')] })] });
  const twice = await put(co, { campaigns: [campaign('k2', { slug: 'two', assets: [asset('a1')] })], other: 'changed elsewhere' });
  assert.deepEqual(once.campaigns, { campaigns: 1, assets: 1, skipped: 0 });
  assert.deepEqual(twice.campaigns, once.campaigns);
  assert.deepEqual(await list(co).then((l) => l.map((x) => [x.id, x.assets])), [['k2', 1]]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM campaign_assets WHERE company_id = ?').get(co).n, 1);
});

test('isolation: campaigns never cross companies; other users get 404; deleting the company removes its rows', async () => {
  await put(co, { campaigns: [campaign('k1')] });
  await put(other, { campaigns: [campaign('k1', { name: 'Same id, other company', slug: 'other' })] });
  await put(bobCo, { campaigns: [campaign('b1', { name: 'Bob campaign', slug: 'bob' })] }, bob);

  assert.deepEqual((await list(co)).map((x) => x.name), ['Qualified leads — Clinics']);
  assert.deepEqual((await list(other)).map((x) => x.name), ['Same id, other company']);
  assert.deepEqual((await list(bobCo, bob)).map((x) => x.name), ['Bob campaign']);
  assert.equal((await call('GET', `/api/companies/${co}/campaigns/b1`, alice)).status, 404);

  assert.equal((await call('GET', `/api/companies/${co}/campaigns`, bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${co}/campaigns/k1`, bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${co}/campaigns`)).status, 401);

  assert.equal((await call('DELETE', `/api/companies/${other}`, alice)).status, 200);
  for (const t of ['campaigns', 'campaign_assets', 'campaign_mirror']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE company_id = ?`).get(other).n, 0, t);
  }
  assert.equal((await list(co)).length, 1);
});
