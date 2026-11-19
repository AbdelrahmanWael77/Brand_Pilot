// P1 (2026-11-19): the server audit is the only source of recommendations. Covers the rules moved from the browser,
// the confidence rule (incl. Low cases), the evidence-card fields, the period filter and the company digit setting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAudit, makeFmt } from '../server/audit.js';
import { confidence, portfolio } from '../server/auditMeta.js';

const L = (en) => en;
const fmt = makeFmt('en');
const none = { meta: [], ga4: [], gsc: [], leads: [] };
const f = (id, cat, text, o = {}) => ({ id, cat, text, type: 'fact', status: 'approved', src: 's1', ...o });
const src = [{ id: 's1', title: 'Company profile', text: 'Task boards for agencies. Shared task boards.' }, { id: 's2', title: 'Old flyer', text: '' }];
const run = (findings, o = {}) => computeAudit(o.data || none, findings.filter((x) => x.status === 'approved'), { findings, sources: o.sources || src, defs: o.defs ?? null, now: new Date('2026-11-19T00:00:00Z'), ...o.opts }).items;
const item = (items, id) => items.find((x) => x.id === id);

test('confidence: one rule — Low for a small sample, a thin margin or poor coverage; High only when all three are strong', () => {
  const low = confidence({ n: 250, min: 200, margin: 0.85, cover: 1, days: 28, len: 28, unit: 'sessions' }, L, fmt);
  assert.equal(low.level, 'low');
  assert.equal(low.why, 'Low: 250 sessions (1.3× the minimum of 200), 85% past the threshold, data on 28 of 28 days.');
  assert.equal(confidence({ n: 1000, min: 200, margin: 0.05, unit: 'sessions' }, L, fmt).level, 'low', 'thin margin');
  assert.equal(confidence({ n: 1000, min: 200, margin: 0.9, cover: 0.4, days: 11, len: 28, unit: 'sessions' }, L, fmt).level, 'low', 'poor coverage');
  assert.equal(confidence({ n: 1000, min: 200, margin: 0.9, cover: 1, days: 28, len: 28, unit: 'sessions' }, L, fmt).level, 'high');
  assert.equal(confidence({ n: 500, min: 200, margin: 0.3, unit: 'sessions' }, L, fmt).level, 'med');
  assert.deepEqual(confidence({ rule: true }, L, fmt), { level: 'low', why: 'Low: not a conclusion — there is not enough data for this check yet.' });
  assert.deepEqual(confidence({ certain: true, why: 'Counted directly: 2 claims.' }, L, fmt), { level: 'high', why: 'High: Counted directly: 2 claims.' });
});

test('a recommendation built on a small sample is Low, with the reason on the item', () => {
  // Two channels; "Email" has 250 sessions (1.25× the 200 minimum) and converts far above the site average.
  const day = (d, ch, s, e) => ({ date: d, channel: ch, device: 'desktop', sessions: s, enquiries: e });
  const ga4 = [day('2026-11-01', 'Email', 250, 25), day('2026-11-01', 'Search', 2000, 20)];
  const x = item(computeAudit({ ...none, ga4 }, []).items, 'ch-best');
  assert.equal(x.conf, 'low');
  assert.equal(x.confidence.level, 'low');
  assert.match(x.confidence.why, /^Low: 250 sessions \(1\.3× the minimum of 200\)/);
  assert.equal(x.e, 1, 'the evidence part of the priority score follows the confidence');
  assert.deepEqual(x.calc.length, 2);
  assert.match(x.calc[0], /^Email: 25 enquiries ÷ 250 sessions = 10\.00%$/);
  assert.ok(x.assumptions.length >= 1);
  assert.equal(x.make, 'campaign');
});

test('every item has High, Medium or Low with a one-line reason, a calculation where it is a conclusion, and its dataset', () => {
  const day = (d, ch, s, e) => ({ date: d, channel: ch, device: 'desktop', sessions: s, enquiries: e });
  const ga4 = [day('2026-11-01', 'Email', 900, 45), day('2026-11-01', 'Search', 3000, 30), day('2026-11-01', 'Social', 1500, 3)];
  const items = computeAudit({ ...none, ga4 }, [f('t', 'tone', 'Warm'), f('b', 'brandid', 'Blue')]).items;
  assert.ok(items.length > 3);
  for (const x of items) {
    assert.ok(['high', 'med', 'low'].includes(x.confidence.level), x.id);
    assert.ok(x.confidence.why && !x.confidence.why.includes('\n'), `${x.id}: one line`);
    assert.equal(x.conf, x.confidence.level);
    if (x.basis === 'data') assert.ok(x.calc.length > 0, `${x.id}: calculation`);
    assert.equal(typeof x.rule, 'boolean');
  }
  // checks that could not run are marked, so the screens list them under "Not enough data yet", not as recommendations
  const mg = item(items, 'mobile-gap');
  assert.equal(mg.rule, true);
  assert.equal(mg.make, null);
  assert.equal(mg.exp, undefined);
  assert.equal(item(items, 'no-meta').rule, false, 'a missing dataset is a card');
});

test('moved from the browser: cta-mix, offer-conflict, claims, know-gaps (observations about the sources)', () => {
  const findings = [
    f('c1', 'ctas', 'Start free trial'), f('c2', 'ctas', 'Book a demo', { status: 'pending', src: 's2' }), f('c3', 'ctas', 'ابدأ الآن'),
    f('x1', 'offers', '14-day trial vs 30-day trial', { type: 'conflict', status: 'pending' }),
    f('k1', 'claims', 'The #1 task board in Egypt', { type: 'claim', status: 'pending', src: 's2' }),
    f('u1', 'diff', '', { type: 'unknown', status: 'pending' }),
    f('r1', 'ctas', 'Call us', { status: 'rejected' }),
  ];
  const items = run(findings);
  const cta = item(items, 'cta-mix');
  assert.equal(cta.basis, 'sources');
  assert.deepEqual(cta.ev, ['“Start free trial” — Company profile', '“Book a demo” — Old flyer'], 'Arabic and rejected CTAs are not counted');
  assert.equal(cta.conf, 'high');
  assert.deepEqual(cta.sources, ['Company profile', 'Old flyer']);
  assert.equal(item(items, 'offer-conflict').ev[0], '14-day trial vs 30-day trial');
  assert.equal(item(items, 'claims').ev[0], '“The #1 task board in Egypt” — Old flyer (not approved)');
  const gaps = item(items, 'know-gaps');
  assert.equal(gaps.title, '1 business question(s) no source could answer');
  assert.equal(gaps.ev[0], 'Why do customers choose you over alternatives?');
  assert.equal(gaps.rule, false);
});

test('moved from the browser: portfolio rules pf-depth, pf-noout, pf-seg, pf-noproof, pf-old, pf-none', () => {
  const pr = (id, t, status = 'approved') => f(id, 'projects', t, { status });
  const findings = [
    pr('p1', 'Rollout A | Agencies | Task boards | 2021 |'),
    pr('p2', 'Rollout B | Agencies | Task boards | 2022 | 40 users onboarded'),
    pr('p3', 'Depot board | Logistics | Shift planning | 2023 |', 'pending'),
    f('a1', 'audiences', 'Marketing agencies'),
    f('pr1', 'products', 'Task boards'), f('pr2', 'products', 'Time tracking'),
  ];
  const items = run(findings);
  assert.equal(portfolio(findings).pr.length, 3);
  const depth = item(items, 'pf-depth');
  assert.equal(depth.seg, 'Agencies');
  assert.deepEqual(depth.ev, ['Rollout A (2021)', 'Rollout B (2022)']);
  assert.equal(item(items, 'pf-noout').title, '2 of 3 projects state no outcome');
  assert.equal(item(items, 'pf-seg').seg, 'Logistics');
  assert.deepEqual(item(items, 'pf-noproof').ev, ['“Time tracking” — not referenced by any listed project']);
  assert.equal(item(items, 'pf-old').ev[0], 'Most recent project year: 2023.', '2026 − 2023 ≥ 2');
  assert.equal(item(run([]), 'pf-none').cls, 'gap');
  assert.equal(item(run([], { sources: [] }), 'pf-none'), undefined, 'no sources: no portfolio rule, as in the browser');
});

test('defs: a missing "qualified lead" definition is a gap only when leads exist and the definition is known to be empty', () => {
  const leads = [{ date: '2026-11-01', source: 'Referral', segment: 'A', status: 'new' }];
  assert.ok(item(run([], { data: { ...none, leads }, defs: { qualified: false } }), 'defs'));
  assert.equal(item(run([], { data: { ...none, leads }, defs: { qualified: true } }), 'defs'), undefined);
  assert.equal(item(run([], { data: { ...none, leads }, defs: null }), 'defs'), undefined, 'unknown: say nothing');
  assert.equal(item(run([], { defs: { qualified: false } }), 'defs'), undefined, 'no leads: nothing to define yet');
});

test('Arabic wording and Arabic-Indic digits when the company chose them; Western digits by default', () => {
  const day = (d, ch, s, e) => ({ date: d, channel: ch, device: 'desktop', sessions: s, enquiries: e });
  const ga4 = [day('2026-11-01', 'Email', 1200, 60), day('2026-11-01', 'Search', 3000, 30)];
  const ar = item(computeAudit({ ...none, ga4 }, [], { lang: 'ar', fmt: makeFmt('ar', 'arab') }).items, 'ch-best');
  assert.match(ar.ev[0], /٦٠ استفسار من ١٬٢٠٠ جلسة/);
  const latn = item(computeAudit({ ...none, ga4 }, [], { lang: 'ar', fmt: makeFmt('ar', 'latn') }).items, 'ch-best');
  assert.match(latn.ev[0], /60 استفسار من 1,200 جلسة \(5\.00%\)/);
  assert.equal(ar.confidence.level, latn.confidence.level);
});
