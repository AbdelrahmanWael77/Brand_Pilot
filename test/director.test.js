import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { buildContext, shapeContext, CAPS } from '../server/director.js';
import { computeMetrics } from '../server/metrics.js';
import { computeAudit } from '../server/audit.js';

// ---- pure shaping ----
const emptyData = () => ({ meta: [], ga4: [], gsc: [], leads: [] });
const shape = (facts) => shapeContext({ name: 'Co', facts, metrics: computeMetrics(emptyData(), 'all'), audit: computeAudit(emptyData(), []) });

test('caps: at most CAPS.facts facts, long text and evidence cut, and the cut is reported', () => {
  const facts = Array.from({ length: CAPS.facts + 5 }, (_, i) => ({
    id: `f${i}`, cat: 'product', text: 'T'.repeat(CAPS.factText + 100), type: 'fact', status: 'approved', srcTitle: 'doc', synthetic: false, ev: 'E'.repeat(CAPS.evidence + 100),
  }));
  const c = shape(facts);
  assert.equal(c.facts.length, CAPS.facts);
  assert.deepEqual(c.truncated, { facts: 5 });
  assert.equal(c.facts[0].text.length, CAPS.factText);
  assert.equal(c.facts[0].ev.length, CAPS.evidence);
  // Under the cap nothing is reported as cut.
  assert.equal(shape(facts.slice(0, 3)).truncated, undefined);
});

// ---- HTTP route ----
let server, base, db, alice, bob, companyId, emptyId;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  companyId = (await (await call('POST', '/api/companies', alice, { name: 'Nile Bakery' })).json()).company.id;
  emptyId = (await (await call('POST', '/api/companies', alice, { name: 'Empty Co' })).json()).company.id;
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
const ctx = async (id, cookie = alice) => (await call('GET', `/api/companies/${id}/director/context`, cookie)).json();
const finding = (id, cat, status, text, extra = {}) => ({ id, cat, text, type: 'fact', status, src: 's1', ev: `Quote: ${text}`, needs: false, date: '2026-11-12', ...extra });

test('empty company: no facts, KPIs null with a reason, only "insufficient" audit items', async () => {
  const c = await ctx(emptyId);
  assert.deepEqual(c.company, { name: 'Empty Co' });
  assert.deepEqual(c.facts, []);
  assert.equal(c.synthetic, false);
  assert.equal(c.metrics.range, 'all');
  assert.equal(c.metrics.period, null);
  const kpis = Object.values(c.metrics.kpis);
  assert.ok(kpis.length >= 16);
  for (const k of kpis) {
    assert.equal(k.value, null);
    assert.ok(['no_data', 'not_measured'].includes(k.reason));
  }
  assert.ok(c.audit.items.length > 0);
  for (const i of c.audit.items) {
    assert.equal(i.basis, 'insufficient', i.id);
    assert.ok(i.needs);
  }
  assert.equal(c.truncated, undefined);
});

test('only approved facts with evidence reach the context; pending, rejected and evidence-less findings never do', async () => {
  const state = {
    sources: [
      { id: 's1', title: 'about.txt', kind: 'document', text: 'x', date: '2026-11-12', demo: false },
      { id: 's2', title: 'demo pack', kind: 'document', text: 'y', date: '2026-11-12', demo: true },
    ],
    findings: [
      finding('ok', 'product', 'approved', 'Sourdough baked daily'),
      finding('pend', 'product', 'pending', 'PENDING claim'),
      finding('rej', 'product', 'rejected', 'REJECTED claim'),
      finding('noev', 'product', 'approved', 'NO EVIDENCE claim', { ev: '' }),
      finding('demo', 'audience', 'approved', 'Demo audience', { src: 's2' }),
      finding('mine', 'tone', 'approved', 'We speak warmly', { type: 'user', src: '', ev: '' }),
    ],
    data: {
      ga4: [
        { date: '2026-11-01', channel: 'Search', device: 'desktop', sessions: 500, enquiries: 20 },
        { date: '2026-11-02', channel: 'Social', device: 'desktop', sessions: 1000, enquiries: 5 },
        { date: '2026-11-03', channel: 'Social', device: 'desktop', sessions: -1, enquiries: 999 }, // refused by the mirror
      ],
    },
    imports: [],
  };
  assert.equal((await call('PUT', `/api/companies/${companyId}/state`, alice, { state })).status, 200);
  const c = await ctx(companyId);

  assert.deepEqual(c.facts.map((f) => f.id).sort(), ['demo', 'mine', 'ok']);
  const by = Object.fromEntries(c.facts.map((f) => [f.id, f]));
  assert.deepEqual(by.ok, { id: 'ok', cat: 'product', text: 'Sourdough baked daily', ev: 'Quote: Sourdough baked daily', enteredManually: false, srcTitle: 'about.txt', synthetic: false });
  assert.equal(by.demo.synthetic, true);
  assert.equal(by.demo.srcTitle, 'demo pack');
  assert.equal(by.mine.enteredManually, true);
  assert.equal(by.mine.ev, '');
  assert.doesNotMatch(JSON.stringify(c), /PENDING|REJECTED|NO EVIDENCE/);
  assert.equal(c.synthetic, true); // because of the demo-source fact

  // Numbers come from the validated mirror: the refused row is not counted.
  assert.deepEqual(c.metrics.kpis.sessions, { value: 1500, rows: 2, synthetic: false });
  assert.equal(c.metrics.kpis.enquiries.value, 25);
  assert.equal(c.metrics.kpis.spend.value, null);
  assert.ok(c.metrics.kpis.spend.reason);
  assert.deepEqual(c.metrics.period.from, '2026-11-01');
  assert.equal(c.metrics.synthetic, false);

  // Audit items keep their basis and evidence.
  const best = c.audit.items.find((i) => i.id === 'ch-best');
  assert.equal(best.basis, 'data');
  assert.match(best.evidence[0].text, /^Search: 20 enquiries from 500 sessions/);
  assert.equal(c.audit.items.find((i) => i.id === 'no-gsc').basis, 'insufficient');

  assert.deepEqual(buildContext(db, companyId), c);
});

test('fixture imports flag metrics, audit and the whole context as synthetic', async () => {
  const state = {
    sources: [],
    findings: [],
    data: { ga4: [{ date: '2026-11-01', channel: 'Search', device: 'desktop', sessions: 500, enquiries: 20 }] },
    imports: [{ kind: 'ga4', origin: 'fixture' }],
  };
  await call('PUT', `/api/companies/${emptyId}/state`, alice, { state });
  const c = await ctx(emptyId);
  assert.equal(c.metrics.synthetic, true);
  assert.equal(c.metrics.kpis.sessions.synthetic, true);
  assert.equal(c.synthetic, true);
  assert.deepEqual(c.facts, []);
});

test('isolation: other users get 404, signed-out 401, unknown company null', async () => {
  assert.equal((await call('GET', `/api/companies/${companyId}/director/context`, bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${companyId}/director/context`)).status, 401);
  assert.equal(buildContext(db, 'no-such-company'), null);
});
