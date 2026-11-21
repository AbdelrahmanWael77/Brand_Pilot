import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { computeCampaignQa, NOT_CHECKED } from '../server/campaignQa.js';

// ---- pure checks: fixtures in the mirror's shape ----
const EN = { cta: 'Request a price list', offer: 'Free delivery for 14 days', msg: 'Reliable supply' };
const AR = { cta: 'اطلب قائمة الأسعار', offer: 'توصيل مجاني لمدة 14 يوماً', msg: 'توريد موثوق' };
const f = (v) => ({ v, edited: false });
const asset = (id, lang, over = {}) => {
  const w = lang === 'ar' ? AR : EN;
  return { id, type: 'post', lang, channel: 'facebook', n: 1, status: 'approved', flagged: false, fields: { headline: f(w.msg), body: f(`${w.offer}. ${w.cta}`) }, ...over };
};
const campaign = (over = {}) => ({
  id: 'k1', name: 'Clinics', slug: 'clinics', rec: null, approved: true, createdAt: null,
  brief: { objective: '', concept: '', metric: '', audienceEn: '', audienceAr: '', messageEn: EN.msg, messageAr: AR.msg, offerEn: EN.offer, offerAr: AR.offer, ctaEn: EN.cta, ctaAr: AR.cta, url: 'https://example.com/lp/clinics', tone: '', why: [], pointsEn: [], pointsAr: [], channels: ['facebook'], ...(over.brief || {}) },
  assets: over.assets || [asset('en1', 'en'), asset('ar1', 'ar'), asset('g', 'en', { type: 'guide', channel: 'internal', fields: { body: f('Internal notes without the call to action') } })],
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'brief' && k !== 'assets')),
});
const fact = (cat, text, type = 'fact') => ({ id: cat + text, cat, text, type, status: 'approved', ev: 'q' });
const FACTS = [fact('ctas', EN.cta), fact('ctas', AR.cta), fact('offers', EN.offer), fact('offers', AR.offer)];
const run = (c = campaign(), facts = FACTS, items = []) => computeCampaignQa(c, facts, items);
const by = (r) => Object.fromEntries(r.checks.map((c) => [c.id, c]));

test('a clean, fully approved manual campaign passes every check and is exportable', () => {
  const r = run();
  assert.deepEqual(r.checks.map((c) => c.id), ['cta-used', 'cta-approved', 'offer-approved', 'offer-numbers', 'claims', 'placeholders', 'language', 'links', 'review', 'recommendation', 'numbers']);
  assert.deepEqual(r.checks.filter((c) => !c.pass), []);
  assert.equal(r.passed, 11);
  assert.equal(r.failed, 0);
  assert.equal(r.exportable, true);
  assert.deepEqual(r.notChecked, NOT_CHECKED);
  assert.match(by(r).recommendation.detail, /Manual campaign/);
  for (const c of r.checks) assert.ok(['facts', 'campaign', 'audit'].includes(c.basis) && c.detail.length > 10);
});

test('exportable needs every asset approved by a person, and at least one asset', () => {
  assert.equal(run(campaign({ assets: [asset('en1', 'en', { status: 'draft' }), asset('ar1', 'ar')] })).exportable, false);
  const none = run(campaign({ assets: [] }));
  assert.equal(none.failed, 0);
  assert.equal(none.exportable, false);
});

test('cta-used: an asset without its language’s CTA, or an empty brief CTA, fails', () => {
  let r = by(run(campaign({ assets: [asset('en1', 'en', { fields: { headline: f('No call to action here') } }), asset('ar1', 'ar')] })));
  assert.deepEqual(r['cta-used'].affected, ['en1']);
  r = by(run(campaign({ brief: { ctaAr: '' } })));
  assert.deepEqual(r['cta-used'].affected, ['ar1']);
  assert.equal(r['cta-approved'].pass, true); // nothing typed, nothing to approve
});

test('cta-approved / offer-approved: wording must be an approved fact of the right category', () => {
  let r = by(run(campaign(), [fact('ctas', EN.cta), fact('offers', EN.offer), fact('offers', AR.offer)]));
  assert.equal(r['cta-approved'].pass, false);
  assert.deepEqual(r['cta-approved'].affected, ['brief']);
  assert.equal(r['cta-approved'].basis, 'facts');
  assert.equal(r['offer-approved'].pass, true);

  // The same text approved under another category, or as a conflict note, does not count.
  r = by(run(campaign(), [fact('offers', EN.cta), fact('offers', AR.cta), fact('ctas', EN.cta, 'conflict'), fact('ctas', AR.cta), fact('ctas', EN.offer), fact('ctas', AR.offer)]));
  assert.equal(r['cta-approved'].pass, false);
  assert.equal(r['offer-approved'].pass, false);

  // Surrounding spaces do not matter; a changed word does.
  r = by(run(campaign({ brief: { ctaEn: ` ${EN.cta} ` } })));
  assert.equal(r['cta-approved'].pass, true);
  r = by(run(campaign({ brief: { ctaEn: 'Get the price list' } })));
  assert.equal(r['cta-approved'].pass, false);
  assert.equal(by(run(campaign(), []))['offer-approved'].pass, false);
});

test('offer-numbers, claims, placeholders, language, links, review each report the affected assets', () => {
  const bad = campaign({
    brief: { url: 'not a link' },
    assets: [
      asset('n', 'en', { fields: { headline: f(EN.msg), body: f(`Free delivery for 30 days. ${EN.cta}`) } }),
      asset('c', 'en', { fields: { headline: f('The best supplier, 100% guaranteed'), body: f(EN.cta) } }),
      asset('p', 'en', { fields: { headline: f('⟦message⟧'), body: f(EN.cta) } }),
      asset('e', 'en', { fields: { headline: f('  '), body: f(EN.cta) } }),
      asset('f4ok', 'en', { type: 'landing', fields: { headline: f(EN.msg), f4: f('⟦p4⟧'), body: f(EN.cta) } }),
      asset('l1', 'en', { fields: { headline: f('مرحبا'), body: f(EN.cta) } }),
      asset('l2', 'ar', { fields: { headline: f('English headline'), body: f(AR.cta) } }),
      asset('r', 'ar', { flagged: true }),
      asset('g', 'en', { type: 'guide', fields: { body: f('Internal: the best, guaranteed, مرحبا, 30 days') } }),
    ],
  });
  const r = by(run(bad));
  assert.deepEqual(r['offer-numbers'].affected, ['n']);
  assert.deepEqual(r.claims.affected, ['c']);
  assert.deepEqual(r.placeholders.affected, ['p', 'e']);
  assert.deepEqual(r.language.affected, ['l1', 'l2']);
  assert.deepEqual(r.links.affected, ['brief']);
  assert.deepEqual(r.review.affected, ['r']);
  assert.equal(run(bad).exportable, false);
  // No number in the offer → nothing to compare.
  assert.equal(by(run(campaign({ brief: { offerEn: 'Free delivery' }, assets: [asset('n', 'en', { fields: { headline: f('30 days'), body: f(EN.cta) } })] }), [...FACTS, fact('offers', 'Free delivery')]))['offer-numbers'].pass, true);
});

test('recommendation: verified only when the server audit produces it from data or facts', () => {
  const items = [{ id: 'ch-best', basis: 'data', title: 'Visitors from Search get in touch most often' }, { id: 'no-gsc', basis: 'insufficient', title: 'x' }, { id: 'brand-doc', basis: 'facts', title: 'Brand rules are documented' }];
  let c = by(run(campaign({ rec: 'ch-best' }), FACTS, items)).recommendation;
  assert.equal(c.pass, true);
  assert.equal(c.basis, 'audit');
  assert.match(c.detail, /ch-best.*validated data/);
  assert.equal(by(run(campaign({ rec: 'brand-doc' }), FACTS, items)).recommendation.pass, true);
  for (const rec of ['seg-best', 'no-gsc', 'made-up']) {
    c = by(run(campaign({ rec }), FACTS, items)).recommendation;
    assert.equal(c.pass, false, rec);
    assert.match(c.detail, /not verified on the server/);
    assert.deepEqual(c.affected, ['brief']);
  }
});

// ---- HTTP: everything comes from the mirrors, never from the blob ----
let server, base, db, alice, bob, co;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  co = (await (await call('POST', '/api/companies', alice, { name: 'Nile Dental' })).json()).company.id;
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
const qa = async (cid, cookie = alice) => call('GET', `/api/companies/${co}/campaigns/${cid}/qa`, cookie);
const finding = (id, cat, status, text, extra = {}) => ({ id, cat, text, type: 'fact', status, src: 's1', ev: `Quote: ${text}`, needs: false, date: '2026-11-12', ...extra });
const stateAsset = (id, lang) => ({ id, type: 'post', lang, channel: 'facebook', n: 1, status: 'approved', flag: null, design: {}, fields: { headline: { tpl: '', v: (lang === 'ar' ? AR : EN).msg, edited: false }, body: { tpl: '', v: `${(lang === 'ar' ? AR : EN).offer}. ${(lang === 'ar' ? AR : EN).cta}`, edited: false } } });
const stateCampaign = (id, rec, over = {}) => ({ id, name: 'Camp ' + id, slug: 'camp-' + id, at: 1, rec, approved: true, versions: [], brief: { ...campaign().brief, colors: {}, ...over }, assets: [stateAsset('en1', 'en'), stateAsset('ar1', 'ar')] });

test('route: checks use approved facts and the server audit; pending, rejected and evidence-less wording does not count', async () => {
  const state = {
    sources: [{ id: 's1', title: 'about.txt', kind: 'document', text: 'x', date: '2026-11-12', demo: false }],
    findings: [
      finding('c1', 'ctas', 'approved', EN.cta),
      finding('c2', 'ctas', 'pending', AR.cta), // typed into the brief, but not approved
      finding('o1', 'offers', 'approved', EN.offer),
      finding('o2', 'offers', 'approved', AR.offer, { ev: '' }), // approved in the browser without evidence → the server keeps it pending
    ],
    data: {
      ga4: [
        { date: '2026-11-01', channel: 'Search', device: 'desktop', sessions: 500, enquiries: 20 },
        { date: '2026-11-02', channel: 'Social', device: 'desktop', sessions: 1000, enquiries: 5 },
      ],
    },
    imports: [],
    campaigns: [stateCampaign('k1', 'ch-best'), stateCampaign('k2', 'seg-best'), stateCampaign('k3', null)],
  };
  assert.equal((await call('PUT', `/api/companies/${co}/state`, alice, { state })).status, 200);

  const res = await qa('k1');
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.deepEqual(r.campaign, { id: 'k1', name: 'Camp k1', rec: 'ch-best' });
  const c = by(r);
  assert.equal(c['cta-approved'].pass, false);
  assert.equal(c['offer-approved'].pass, false);
  assert.equal(c.recommendation.pass, true);
  assert.equal(c['cta-used'].pass, true);
  assert.equal(r.failed, 2);
  assert.equal(r.passed, 9); // P3: + the number check on the copy
  assert.equal(r.exportable, false);
  assert.deepEqual(r.notChecked, NOT_CHECKED);

  assert.equal(by(await (await qa('k2')).json()).recommendation.pass, false);
  assert.match(by(await (await qa('k3')).json()).recommendation.detail, /Manual campaign/);

  // Approving the wording (with evidence) makes the same campaign pass and exportable.
  state.findings[1].status = 'approved';
  state.findings[3].ev = 'Quote from the offer page';
  await call('PUT', `/api/companies/${co}/state`, alice, { state });
  const again = await (await qa('k1')).json();
  assert.equal(again.failed, 0);
  assert.equal(again.exportable, true);
});

test('route: a campaign made from the segment recommendation is verified when the lead rows support it', async () => {
  const id = (await (await call('POST', '/api/companies', alice, { name: 'Segments Co' })).json()).company.id;
  const lead = (segment, i, q) => ({ date: '2026-10-01', status: i < q ? 'qualified' : 'new', source: 'Facebook', segment });
  const rows = (a, b) => [...Array.from({ length: 30 }, (_, i) => lead('Clinics', i, a)), ...Array.from({ length: 30 }, (_, i) => lead('Labs', i, b))];
  const state = { sources: [], findings: [], data: { leads: rows(21, 4) }, imports: [], campaigns: [stateCampaign('k1', 'seg-best')] };
  const rec = async () => by(await (await call('GET', `/api/companies/${id}/campaigns/k1/qa`, alice)).json()).recommendation;
  await call('PUT', `/api/companies/${id}/state`, alice, { state });
  let c = await rec();
  assert.equal(c.pass, true);
  assert.match(c.detail, /seg-best.*validated data.*Clinics/);

  // Same campaign, but the data no longer shows a stronger segment → not verified.
  state.data.leads = rows(15, 15);
  await call('PUT', `/api/companies/${id}/state`, alice, { state });
  c = await rec();
  assert.equal(c.pass, false);
  assert.match(c.detail, /not verified on the server/);
});

test('route: unknown campaign 404, another user 404, signed out 401', async () => {
  assert.equal((await qa('nope')).status, 404);
  assert.equal((await qa('k1', bob)).status, 404);
  assert.equal((await qa('k1', null)).status, 401);
});

test("claims: the brief's own offer wording is not a claim, the same wording elsewhere still is (10.1)", () => {
  const offer = '20% off annual plans';
  const facts = [...FACTS, fact('offers', offer)];
  const mk = (body) => campaign({ brief: { offerEn: offer, offerAr: '' }, assets: [asset('en1', 'en', { fields: { headline: f('20% Off annual plans'), body: f(body) } })] });
  // The offer appears as written (capital letter differs): not flagged.
  assert.deepEqual(by(run(mk(`${offer}. ${EN.cta}`), facts)).claims.affected, []);
  // A different percentage, or a guarantee beside the offer, is still flagged.
  assert.deepEqual(by(run(mk(`${offer}. Save 35% more. ${EN.cta}`), facts)).claims.affected, ['en1']);
  assert.deepEqual(by(run(mk(`${offer}, guaranteed. ${EN.cta}`), facts)).claims.affected, ['en1']);
});

test('16b: a carousel slide with no button, caption or body is not asked for the CTA; an empty link passes, a bad one fails', () => {
  const slide = asset('s2', 'en', { fields: { headline: f('Who is it for?'), kicker: f('Question 1 / 3'), slide: f('2/5') } });
  const r = by(run(campaign({ assets: [asset('en1', 'en'), asset('ar1', 'ar'), slide] })));
  assert.equal(r['cta-used'].pass, true);
  // Without the slide marker, the same headline-only asset still fails.
  const plain = asset('p2', 'en', { fields: { headline: f('Who is it for?') } });
  assert.deepEqual(by(run(campaign({ assets: [asset('en1', 'en'), asset('ar1', 'ar'), plain] })))['cta-used'].affected, ['p2']);
  assert.equal(by(run(campaign({ brief: { url: '' } }))).links.pass, true);
  assert.equal(by(run(campaign({ brief: { url: 'not a link' } }))).links.pass, false);
});

test('P3: every number in campaign copy must come from an approved fact; an invented one blocks downloads (EN)', () => {
  const ok = run();
  assert.equal(by(ok).numbers.pass, true);
  const c = campaign();
  const a0 = c.assets[0];
  const k = Object.keys(a0.fields)[0];
  a0.fields[k] = { ...a0.fields[k], v: a0.fields[k].v + ' Join 4,500 teams already using it.' };
  const r = run(c);
  const n = by(r).numbers;
  assert.equal(n.pass, false);
  assert.deepEqual(n.affected, [a0.id]);
  assert.deepEqual(n.numbers, ['4,500']);
  assert.equal(r.failed, 1, 'a failed check, like an unapproved fact');
  assert.equal(r.exportable, false, 'downloads blocked');
  // the same number once it is an approved fact
  const r2 = run(c, [...FACTS, fact('proof', 'Used by 4,500 teams')]);
  assert.equal(by(r2).numbers.pass, true);
  assert.equal(r2.exportable, true, 'approved with evidence: downloads open again');
  // or the number is removed from the copy
  a0.fields[k] = { ...a0.fields[k], v: a0.fields[k].v.replace(' Join 4,500 teams already using it.', '') };
  assert.equal(by(run(c)).numbers.pass, true);
});

test('P3: the same in Arabic copy, with Arabic-Indic digits', () => {
  const c = campaign();
  const a = c.assets.find((x) => x.lang === 'ar');
  const k = Object.keys(a.fields)[0];
  a.fields[k] = { ...a.fields[k], v: a.fields[k].v + ' انضم إلى ٤٬٥٠٠ فريق يستخدمونه.' };
  const r = run(c);
  assert.equal(by(r).numbers.pass, false);
  assert.deepEqual(by(r).numbers.affected, [a.id]);
  assert.deepEqual(by(r).numbers.numbers, ['٤٬٥٠٠']);
  assert.equal(r.exportable, false);
  // an approved fact written with Western digits covers it
  assert.equal(by(run(c, [...FACTS, fact('proof', 'يستخدمه 4,500 فريق')])).numbers.pass, true);
});
