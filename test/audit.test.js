import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { computeAudit, audit } from '../server/audit.js';

// ---- pure rules ----
const ga4 = (channel, device, sessions, enquiries) => ({ date: '2026-11-01', channel, device, sessions, enquiries, synthetic: false });
const gsc = (query, impressions, clicks, position) => ({ date: '2026-11-01', query, impressions, clicks, position, synthetic: false });
const leads = (source, total, qualified) => Array.from({ length: total }, (_, i) => ({ date: '2026-11-01', ...(source ? { source } : {}), status: i < qualified ? 'qualified' : 'new', synthetic: false }));
const fact = (id, cat, text = `${cat} fact`) => ({ id, cat, text, type: 'fact', status: 'approved', synthetic: false });
const empty = () => ({ meta: [], ga4: [], gsc: [], leads: [] });
const run = (data, facts = []) => computeAudit({ ...empty(), ...data }, facts).items;
const item = (items, id) => items.find((i) => i.id === id);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('no data, no facts: only "insufficient" items, each saying what is needed — never a conclusion', () => {
  const r = computeAudit(empty(), []);
  assert.deepEqual(r.items.map((i) => i.id).sort(), ['brand-doc', 'no-ga4', 'no-gsc', 'no-leads', 'no-meta']);
  for (const i of r.items) {
    assert.equal(i.basis, 'insufficient', i.id);
    assert.equal(i.kind, 'gap');
    assert.deepEqual(i.evidence, []);
    assert.ok(i.needs.length > 10);
  }
  assert.equal(r.synthetic, false);
});

test('no-track: sessions but no enquiry events', () => {
  const items = run({ ga4: [ga4('Direct', 'mobile', 300, 0), ga4('Email', 'desktop', 200, 0)] });
  const i = item(items, 'no-track');
  assert.equal(i.basis, 'data');
  assert.equal(i.kind, 'weak');
  assert.deepEqual(i.evidence[0], { metric: 'sessions', value: 500, rows: 2, text: '500 sessions imported, 0 enquiry key events in the whole period.' });
  // Channel and device rules are not evaluated without enquiries.
  assert.equal(item(items, 'ch-best'), undefined);
  assert.equal(item(items, 'mobile-gap'), undefined);
  assert.equal(item(items, 'no-ga4'), undefined);
  // With enquiries the rule is silent.
  assert.equal(item(run({ ga4: [ga4('Direct', 'mobile', 300, 3)] }), 'no-track'), undefined);
});

test('ch-best and ch-leak: triggered, not triggered, insufficient', () => {
  // Search 4% vs site 1.75% (best); Social 50% of sessions at 0.5% (< half the average → leak).
  let items = run({ ga4: [ga4('Search', 'desktop', 500, 20), ga4('Social', 'desktop', 1000, 5), ga4('Email', 'desktop', 500, 10)] });
  const best = item(items, 'ch-best');
  assert.equal(best.basis, 'data');
  assert.equal(best.kind, 'strong');
  assert.match(best.title, /^Search /);
  near(best.evidence[0].value, 0.04);
  near(best.evidence[1].value, 35 / 2000);
  assert.equal(best.evidence[0].text, 'Search: 20 enquiries from 500 sessions (4.00%)');
  const leak = item(items, 'ch-leak');
  assert.match(leak.title, /^Social /);
  near(leak.evidence[0].value, 0.005);
  assert.match(leak.evidence[1].text, /^Hypothesis, not a measurement/);

  // Even channels: nothing stands out → no item at all.
  items = run({ ga4: [ga4('Search', 'desktop', 500, 10), ga4('Social', 'desktop', 500, 10)] });
  assert.equal(item(items, 'ch-best'), undefined);
  assert.equal(item(items, 'ch-leak'), undefined);

  // Channels under 200 sessions are not compared: stated as insufficient, not concluded.
  items = run({ ga4: [ga4('Search', 'desktop', 150, 30), ga4('Social', 'desktop', 1000, 5)] });
  const ins = item(items, 'ch-best');
  assert.equal(ins.basis, 'insufficient');
  assert.match(ins.needs, /200\+ sessions each/);
  assert.equal(item(items, 'ch-leak'), undefined);
});

test('mobile-gap: triggered, not triggered, insufficient', () => {
  // Mobile 60% of sessions at 1% vs desktop 4%.
  let i = item(run({ ga4: [ga4('Direct', 'mobile', 600, 6), ga4('Direct', 'desktop', 400, 16)] }), 'mobile-gap');
  assert.equal(i.basis, 'data');
  near(i.evidence[0].value, 0.01);
  near(i.evidence[1].value, 0.04);
  // Mobile close to desktop → silent. Mobile under 30% of sessions → silent.
  assert.equal(item(run({ ga4: [ga4('Direct', 'mobile', 600, 20), ga4('Direct', 'desktop', 400, 16)] }), 'mobile-gap'), undefined);
  assert.equal(item(run({ ga4: [ga4('Direct', 'mobile', 100, 0), ga4('Direct', 'desktop', 900, 36)] }), 'mobile-gap'), undefined);
  // No device split → insufficient.
  i = item(run({ ga4: [ga4('Direct', undefined, 600, 6), ga4('Direct', 'desktop', 400, 16)] }), 'mobile-gap');
  assert.equal(i.basis, 'insufficient');
});

test('seo-q: triggered (top 3 by impressions), not triggered, insufficient', () => {
  let i = item(run({ gsc: [gsc('bakery cairo', 3000, 30, 8), gsc('bakery cairo', 1000, 10, 12), gsc('good ctr', 2000, 200, 6), gsc('page two', 5000, 10, 25), gsc('tiny', 100, 0, 9)] }), 'seo-q');
  assert.equal(i.basis, 'data');
  assert.equal(i.kind, 'opp');
  assert.equal(i.evidence.length, 1);
  near(i.evidence[0].value, 0.01);
  assert.equal(i.evidence[0].text, '"bakery cairo": 4000 impressions, 40 clicks (1.0%), average position 9.0'); // impression-weighted position
  assert.equal(item(run({ gsc: [gsc('good ctr', 2000, 200, 6)] }), 'seo-q'), undefined);
  i = item(run({ gsc: [gsc('tiny', 100, 0, 9)] }), 'seo-q');
  assert.equal(i.basis, 'insufficient');
  assert.match(i.needs, /1000\+ impressions/);
});

test('lead rules: src-unknown, src-best, src-lowq — triggered, not triggered, insufficient', () => {
  // Referral 16/20 = 80%, Facebook 5/40 = 12.5%, no source 2/10; overall 23/70 ≈ 33%.
  let items = run({ leads: [...leads('Referral', 20, 16), ...leads('Facebook', 40, 5), ...leads(null, 10, 2)] });
  const best = item(items, 'src-best');
  assert.match(best.title, /^Referral /);
  near(best.evidence[0].value, 0.8);
  assert.equal(best.evidence[0].rows, 20);
  near(best.evidence[1].value, 23 / 70);
  const low = item(items, 'src-lowq');
  assert.match(low.title, /^Facebook /);
  near(low.evidence[0].value, 0.125);
  // 10 of 70 without a source = 14.3% → under the 15% threshold, silent; 15 of 75 = 20% → flagged.
  assert.equal(item(items, 'src-unknown'), undefined);
  const unk = item(run({ leads: [...leads('Referral', 60, 30), ...leads(null, 15, 5)] }), 'src-unknown');
  near(unk.evidence[0].value, 0.2);
  assert.equal(unk.evidence[0].text, '20% of 75 leads have an empty source field.');

  // Even sources → no best / low items.
  items = run({ leads: [...leads('Referral', 30, 15), ...leads('Facebook', 30, 15)] });
  assert.equal(item(items, 'src-best'), undefined);
  assert.equal(item(items, 'src-lowq'), undefined);

  // Sources under 15 leads: a striking rate on 5 leads is NOT a conclusion.
  items = run({ leads: [...leads('Referral', 5, 5), ...leads('Facebook', 10, 0)] });
  assert.equal(item(items, 'src-best').basis, 'insufficient');
  assert.equal(item(items, 'src-lowq'), undefined);
});

test('segment rule: seg-best — triggered with the browser’s numbers, not triggered, insufficient', () => {
  const seg = (segment, total, qualified) => leads('Facebook', total, qualified).map((r) => (segment ? { ...r, segment } : r));
  // Clinics 21/30 = 70%, Labs 4/30 = 13%; overall 25/60 ≈ 42% → Clinics is above 115% of it.
  let s = item(run({ leads: [...seg('Clinics', 30, 21), ...seg('Labs', 30, 4)] }), 'seg-best');
  assert.equal(s.basis, 'data');
  assert.equal(s.kind, 'opp');
  assert.equal(s.title, '"Clinics" is your strongest customer segment');
  assert.deepEqual(s.evidence.map((e) => e.text), ['Clinics: 70% qualified (30 leads)', 'Labs: 13% qualified (30 leads)']);
  near(s.evidence[0].value, 0.7);
  assert.equal(s.evidence[0].rows, 30);
  // Under 30 leads the line says so; a customer counts as qualified.
  s = item(run({ leads: [...seg('Clinics', 20, 15).map((r, i) => (i === 0 ? { ...r, status: 'customer' } : r)), ...seg('Labs', 40, 4)] }), 'seg-best');
  assert.equal(s.evidence[0].text, 'Clinics: 75% qualified (20 leads, small sample)');

  // Even segments → no conclusion and no "insufficient" either: there was enough data, it just shows no winner.
  assert.equal(item(run({ leads: [...seg('Clinics', 30, 15), ...seg('Labs', 30, 15)] }), 'seg-best'), undefined);
  // Best segment only slightly above the overall share (55% vs 50% → under 115%).
  assert.equal(item(run({ leads: [...seg('Clinics', 40, 22), ...seg('Labs', 40, 18)] }), 'seg-best'), undefined);

  // One sized segment, small segments, or no segment field: not enough to compare.
  for (const rows of [[...seg('Clinics', 30, 21), ...seg('Labs', 10, 0)], [...seg('Clinics', 14, 14), ...seg('Labs', 14, 0)], seg(null, 60, 20)]) {
    s = item(run({ leads: rows }), 'seg-best');
    assert.equal(s.basis, 'insufficient');
    assert.match(s.needs, /15\+ leads/);
    assert.deepEqual(s.evidence, []);
  }
  // No leads at all: only the "no leads" gap, no segment item.
  assert.equal(item(run({}), 'seg-best'), undefined);
});

test('brand-doc rests on approved facts only', () => {
  let i = item(run({}, [fact('f1', 'tone', 'Warm and friendly'), fact('f2', 'brandid', 'Olive green #556B2F'), fact('f3', 'products')]), 'brand-doc');
  assert.equal(i.basis, 'facts');
  assert.equal(i.kind, 'strong');
  assert.deepEqual(i.evidence, [{ factId: 'f1', text: 'Warm and friendly' }, { factId: 'f2', text: 'Olive green #556B2F' }]);
  i = item(run({}, [fact('f1', 'tone')]), 'brand-doc');
  assert.equal(i.basis, 'insufficient');
  assert.match(i.needs, /brand identity/);
  assert.doesNotMatch(i.needs, /tone of voice/);
});

test('synthetic rows flag the items built on them', () => {
  const r = computeAudit({ ...empty(), ga4: [{ ...ga4('Direct', 'mobile', 300, 0), synthetic: true }], leads: leads('Referral', 20, 10) }, []);
  assert.equal(item(r.items, 'no-track').synthetic, true);
  assert.equal(item(r.items, 'no-gsc').synthetic, false);
  assert.equal(r.synthetic, true);
});

// ---- HTTP route ----
let server, base, db, alice, bob, companyId;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  companyId = (await (await call('POST', '/api/companies', alice, { name: 'Nile Bakery' })).json()).company.id;
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

test('route: audit uses the validated mirror and approved facts; pending and rejected findings never appear', async () => {
  const finding = (id, cat, status, text) => ({ id, cat, text, type: 'fact', status, src: 's1', ev: `Quote: ${text}`, needs: false, date: '2026-11-12' });
  const state = {
    sources: [{ id: 's1', title: 'brand.txt', kind: 'document', text: 'x', date: '2026-11-12', demo: false }],
    findings: [
      finding('tone-ok', 'tone', 'approved', 'Warm and friendly'),
      finding('tone-pending', 'tone', 'pending', 'PENDING tone'),
      finding('brand-rejected', 'brandid', 'rejected', 'REJECTED colours'),
      finding('brand-no-evidence', 'brandid', 'approved', 'NO EVIDENCE colours'),
    ],
    data: {
      ga4: [
        { date: '2026-11-01', channel: 'Search', device: 'desktop', sessions: 500, enquiries: 20 },
        { date: '2026-11-02', channel: 'Social', device: 'desktop', sessions: 1000, enquiries: 5 },
        { date: '2026-11-03', channel: 'Email', device: 'desktop', sessions: 500, enquiries: 10 },
        { date: '2026-11-03', channel: 'Social', device: 'desktop', sessions: -1, enquiries: 500 }, // refused by the mirror
      ],
    },
    imports: [{ kind: 'ga4', origin: 'fixture' }],
  };
  state.findings[3].ev = ''; // approved without evidence → downgraded by the server, so not a fact
  assert.equal((await call('PUT', `/api/companies/${companyId}/state`, alice, { state })).status, 200);

  const r = await call('GET', `/api/companies/${companyId}/audit`, alice);
  assert.equal(r.status, 200);
  const a = await r.json();
  assert.deepEqual(a.period, { from: '2026-11-01', to: '2026-11-03' });
  assert.equal(a.synthetic, true);
  assert.match(item(a.items, 'ch-best').title, /^Search /);
  assert.equal(item(a.items, 'ch-best').synthetic, true);
  assert.match(item(a.items, 'ch-leak').title, /^Social /);
  // Only one approved brand fact category → brand rule is insufficient, and nothing unapproved leaks into the output.
  assert.equal(item(a.items, 'brand-doc').basis, 'insufficient');
  assert.doesNotMatch(JSON.stringify(a), /PENDING|REJECTED|NO EVIDENCE/);
  assert.deepEqual(audit(db, companyId), a);

  // Approving a brand fact (with evidence) turns the rule into a facts-based conclusion.
  state.findings[3].ev = 'Our colour is olive green';
  await call('PUT', `/api/companies/${companyId}/state`, alice, { state });
  const b = await (await call('GET', `/api/companies/${companyId}/audit`, alice)).json();
  assert.equal(item(b.items, 'brand-doc').basis, 'facts');
  assert.deepEqual(item(b.items, 'brand-doc').evidence.map((e) => e.factId), ['tone-ok', 'brand-no-evidence']);
  assert.doesNotMatch(JSON.stringify(b), /PENDING|REJECTED/);
});

test('route: other users get 404', async () => {
  assert.equal((await call('GET', `/api/companies/${companyId}/audit`, bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${companyId}/audit`)).status, 401);
});
