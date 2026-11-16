import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* public/compare.js is a classic browser script; run it in a sandbox and take its global. */
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../public/compare.js', import.meta.url), 'utf8'), ctx);
const B = ctx.BPCompare;
/* Objects made inside the sandbox have its own prototypes; compare them as plain JSON. */
const J = x => JSON.parse(JSON.stringify(x));

const post = (date, platform, reach, engagements, extra = {}) => ({ date, platform, reach, engagements, ...extra });
const lead = (date, source, status = 'new') => ({ date, source, status });
const P = ['2026-10-01', '2026-10-28'], PREV = ['2026-09-03', '2026-09-30'];

test('lead sources map to a channel only when they name it; "Google" stays unassigned', () => {
  assert.equal(B.leadCol('Facebook'), 'facebook');
  assert.equal(B.leadCol(' facebook ads '), 'facebook');
  assert.equal(B.leadCol('Instagram'), 'instagram');
  assert.equal(B.leadCol('LinkedIn'), 'linkedin');
  assert.equal(B.leadCol('SEO'), 'search');
  assert.equal(B.leadCol('Google'), null);
  assert.equal(B.leadCol('WhatsApp'), null);
  assert.equal(B.leadCol(''), null);
  assert.equal(B.ga4Col('Organic Social'), 'social');
  assert.equal(B.ga4Col('Paid Social'), 'social');
  assert.equal(B.ga4Col('Organic Search'), 'search');
  assert.equal(B.ga4Col('facebook / cpc'), 'facebook');
  assert.equal(B.ga4Col('Email'), null);
});

test('a column the data does not carry is null, never 0; a channel with no rows is null throughout', () => {
  const D = { meta: [post('2026-10-02', 'facebook', 2000, 100)], ga4: [], gsc: [], leads: [] };
  const m = B.measure(D, P).cols;
  assert.equal(m.facebook.reach, 2000);
  assert.equal(m.facebook.impr, null);
  assert.equal(m.facebook.clicks, null);
  assert.equal(m.facebook.spend, null);
  assert.equal(m.facebook.clickRate, null);
  assert.equal(m.facebook.leads, null, 'no leads file → not measured');
  assert.equal(m.facebook.sessions, null, 'no GA4 → not measured');
  assert.equal(m.linkedin.reach, null);
  assert.equal(m.linkedin.posts, null);
  assert.equal(m.search.simpr, null);
});

test('GA4 social sessions stay one pool unless the GA4 channel names the platform', () => {
  const D = { meta: [post('2026-10-02', 'facebook', 2000, 100)], gsc: [], leads: [], ga4: [
    { date: '2026-10-02', channel: 'Organic Social', sessions: 300, enquiries: 6 },
    { date: '2026-10-02', channel: 'Paid Social', sessions: 200, enquiries: 4 },
    { date: '2026-10-02', channel: 'Organic Search', sessions: 400, enquiries: 12 }] };
  const m = B.measure(D, P);
  assert.equal(m.cols.facebook.sessions, null, 'not split by platform → not shown per platform');
  assert.deepEqual(J(m.pool), { sessions: 500, enq: 10, enqRate: 0.02 });
  assert.equal(m.cols.search.sessions, 400);
  assert.equal(m.cols.search.enqRate, 0.03);
  const f = B.compare(D, P, null).findings.find(x => x.id === 'web');
  assert.ok(f, 'search vs social enquiry rate is reported (same GA4 definition)');
  assert.equal(f.s, 0.03);
  assert.equal(f.so, 0.02);
});

test('leads are counted by CRM source; unassigned sources are listed, not guessed', () => {
  const leads = [lead('2026-10-03', 'Facebook', 'qualified'), lead('2026-10-03', 'Facebook'), lead('2026-10-04', 'Instagram', 'customer'),
    lead('2026-10-05', 'Google'), lead('2026-10-05', 'Google', 'qualified'), lead('2026-10-06', 'WhatsApp'), lead('2026-10-06', '')];
  const D = { meta: [post('2026-10-02', 'facebook', 2000, 100, { spend: 300 }), post('2026-10-02', 'instagram', 1500, 90, { spend: 0 })], ga4: [], gsc: [], leads };
  const m = B.measure(D, P);
  assert.equal(m.cols.facebook.leads, 2);
  assert.equal(m.cols.facebook.qual, 1);
  assert.equal(m.cols.facebook.cpl, 150);
  assert.equal(m.cols.instagram.leads, 1);
  assert.equal(m.cols.instagram.cpl, null, 'no spend → no cost per lead');
  assert.equal(m.cols.search.leads, null, 'no source names organic search → not measured, not 0');
  assert.equal(m.leadsAll, 7);
  const withSeo = B.measure({ ...D, leads: leads.concat([lead('2026-09-01', 'SEO')]) }, P);
  assert.equal(withSeo.cols.search.leads, 0, 'once a source names it, a period without such leads is a real 0');
  assert.deepEqual(J(m.other.map(x => [x.n, x.leads])), [['Google', 2], ['WhatsApp', 1], ['', 1]]);
  const F = B.compare(D, P, null).findings;
  const un = F.find(x => x.id === 'unmapped');
  assert.ok(un && un.v === 4 && Math.abs(un.share - 4 / 7) < 1e-9);
});

test('a leader is named only with enough data in two channels and a clear edge', () => {
  const small = { meta: [post('2026-10-02', 'facebook', 900, 90), post('2026-10-02', 'instagram', 5000, 100)], ga4: [], gsc: [], leads: [] };
  assert.equal(B.compare(small, P, null).best.engRate, undefined, 'Facebook reach below the minimum → no ranking');
  const close = { meta: [post('2026-10-02', 'facebook', 2000, 100), post('2026-10-02', 'instagram', 2000, 105)], ga4: [], gsc: [], leads: [] };
  assert.equal(B.compare(close, P, null).best.engRate, undefined, '5 % apart → no leader');
  const clear = { meta: [post('2026-10-02', 'facebook', 2000, 40), post('2026-10-02', 'instagram', 2000, 100), post('2026-10-03', 'linkedin', 1200, 30)], ga4: [], gsc: [], leads: [] };
  const r = B.compare(clear, P, null);
  assert.equal(r.best.engRate.c, 'instagram');
  assert.equal(r.best.engRate.run, 'linkedin');
  assert.equal(r.worst.engRate.c, 'facebook');
  assert.deepEqual(J(r.score.instagram.wins), ['engRate']);
  assert.deepEqual(J(r.score.facebook.trails), ['engRate']);
});

test('cost rows rank low as better and need spend and a minimum sample', () => {
  const meta = [post('2026-10-02', 'facebook', 3000, 90, { spend: 600, link_clicks: 60 }), post('2026-10-02', 'instagram', 3000, 90, { spend: 300, link_clicks: 50 })];
  const leads = [...Array(6)].map(() => lead('2026-10-05', 'Facebook')).concat([...Array(6)].map(() => lead('2026-10-05', 'Instagram')));
  const r = B.compare({ meta, ga4: [], gsc: [], leads }, P, null);
  assert.equal(r.best.cpc.c, 'instagram');
  assert.equal(r.best.cpl.c, 'instagram');
  assert.equal(r.now.cols.instagram.cpl, 50);
  assert.equal(r.now.cols.facebook.cpl, 100);
});

test('coverage: a channel whose data stops early is flagged against the shared period', () => {
  const D = { meta: [post('2026-10-02', 'facebook', 2000, 100), post('2026-10-28', 'instagram', 2000, 100), post('2026-10-20', 'linkedin', 1000, 10)], ga4: [], gsc: [], leads: [] };
  const r = B.compare(D, P, null);
  assert.equal(r.cov.facebook.last, '2026-10-02');
  assert.equal(r.cov.facebook.gapEnd, 26);
  assert.equal(r.cov.instagram.gapEnd, 0);
  const st = r.findings.filter(x => x.id === 'stale').map(x => x.c);
  assert.deepEqual(J(st), ['facebook', 'linkedin']);
  assert.ok(r.findings.some(x => x.id === 'missing' && x.c === 'search'));
  assert.ok(r.findings.some(x => x.id === 'no-leads'));
});

test('previous period: biggest move above the minimum base, spend without recorded leads is a risk', () => {
  const meta = [post('2026-09-10', 'facebook', 2000, 50, { spend: 100 }), post('2026-10-10', 'facebook', 5000, 50, { spend: 100 })];
  const leads = [lead('2026-10-11', 'Instagram'), lead('2026-10-11', 'WhatsApp')];
  const r = B.compare({ meta, ga4: [], gsc: [], leads }, P, PREV);
  const mv = r.findings.find(x => x.id === 'move');
  assert.equal(mv.c, 'facebook');
  assert.equal(mv.k, 'reach');
  assert.equal(mv.d, 1.5);
  assert.ok(r.findings.some(x => x.id === 'spend-no-lead' && x.c === 'facebook'));
  assert.equal(r.before.cols.facebook.reach, 2000);
});
