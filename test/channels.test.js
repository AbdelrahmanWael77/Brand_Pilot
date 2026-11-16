import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createAi } from '../server/ai.js';
import { channelSummary } from '../server/channels.js';
import { checkSupport } from '../server/director.js';

/* Task 12: the AI Marketing Director gets the same per-channel comparison as the Analytics screen. */
const KEY = 'test-key-never-real';
const calls = [];
let answer = { answer: 'ok', support: [], insufficient: false };
const stubFetch = async (url, init) => {
  calls.push(JSON.parse(init.body));
  const message = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } };
  return new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } });
};

const post = (date, platform, reach, engagements, spend) => ({ date, platform, reach, engagements, spend });
const lead = (date, source, status = 'new') => ({ date, source, status });
const data = {
  meta: [post('2026-10-02', 'facebook', 3000, 60, 500), post('2026-10-20', 'instagram', 3000, 150, 400), post('2026-09-10', 'facebook', 1000, 20, 100)],
  ga4: [
    { date: '2026-10-05', channel: 'Organic Social', device: 'mobile', sessions: 400, enquiries: 8 },
    { date: '2026-10-05', channel: 'Organic Search', device: 'mobile', sessions: 300, enquiries: 12 },
  ],
  gsc: [],
  leads: [...Array(6)].map(() => lead('2026-10-10', 'Facebook', 'qualified')).concat([lead('2026-10-11', 'Instagram'), lead('2026-10-12', 'Google')]),
};

let base, db, alice, bob, co;
const servers = [];
const call = (method, path, cookie, body) => fetch(base + path, {
  method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});
async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}

before(async () => {
  db = openDb(':memory:');
  const s = createApp({ db, ai: createAi({ apiKey: KEY, fetch: stubFetch, maxRetries: 0 }), askLimit: { max: 1000, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => s.once('listening', r));
  servers.push(s);
  base = `http://127.0.0.1:${s.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  co = (await (await call('POST', '/api/companies', alice, { name: 'Nile Bakery' })).json()).company.id;
  const state = { sources: [], findings: [], data, imports: [] };
  assert.equal((await call('PUT', `/api/companies/${co}/state`, alice, { state })).status, 200);
});
after(() => { for (const s of servers) s.close(); db.close(); });

test('channelSummary: same numbers as the browser module, rules attached, null without data', () => {
  assert.equal(channelSummary({ meta: [], ga4: [], gsc: [], leads: [] }, '28'), null);
  const s = channelSummary(data, 'all');
  assert.deepEqual(s.period, { from: '2026-09-10', to: '2026-10-20' });
  assert.equal(s.previous, null);
  assert.equal(s.channels.facebook.leads, 6);
  assert.equal(s.channels.facebook.reach, 4000);
  assert.equal(s.channels.facebook.cpl, 100);
  assert.equal(s.channels.instagram.leads, 1);
  assert.equal(s.channels.linkedin.reach, null, 'no LinkedIn rows → not measured');
  assert.equal(s.channels.search.leads, null, 'no lead source names organic search');
  assert.equal(s.channels.facebook.sessions, null, 'GA4 does not split social by platform');
  assert.deepEqual(s.socialWebsiteCombined, { sessions: 400, enq: 8, enqRate: 0.02 });
  assert.deepEqual(s.unassignedLeadSources, [{ source: 'Google', leads: 1, qual: 0 }]);
  assert.equal(s.leaders.engRate.channel, 'instagram');
  assert.deepEqual(s.ranking.engRate.bestEligible, { channel: 'instagram', value: 0.05 });
  assert.deepEqual(s.ranking.engRate.notRanked, []);
  /* The 3.68 % vs 15.9 % case: the model is told who looked higher and why it was left out. */
  const q = channelSummary({ meta: [post('2026-10-02', 'facebook', 5000, 184, 0), post('2026-10-02', 'instagram', 600, 95.4, 0), post('2026-10-03', 'linkedin', 2000, 40, 0)], ga4: [], gsc: [], leads: [] }, 'all');
  assert.deepEqual(q.ranking.engRate, {
    status: 'ranked',
    bestEligible: { channel: 'facebook', value: 0.0368 },
    highestObserved: { channel: 'instagram', value: 0.159 },
    notRanked: [{ channel: 'instagram', value: 0.159, reason: 'reach 600 < 1000 required' }],
  });
  assert.match(s.rules.join(' '), /"bestEligible" is the only channel you may call best/);
  assert.ok(s.rules.length >= 5);
  const s28 = channelSummary(data, '28');
  assert.deepEqual(s28.period, { from: '2026-09-23', to: '2026-10-20' });
  assert.equal(s28.channels.facebook.reach, 3000, 'the September post is outside the 28-day window');
});

test('Director context carries the channel comparison for the requested period; isolation holds', async () => {
  const c = await (await call('GET', `/api/companies/${co}/director/context?range=all`, alice)).json();
  assert.equal(c.channels.range, 'all');
  assert.equal(c.channels.channels.facebook.leads, 6);
  assert.equal(c.channels.currency, null, 'no currency chosen → null, the model is told not to name one');
  const state = { sources: [], findings: [], data, imports: [], currency: 'SAR' };
  assert.equal((await call('PUT', `/api/companies/${co}/state`, alice, { state })).status, 200);
  const d = await (await call('GET', `/api/companies/${co}/director/context`, alice)).json();
  assert.equal(d.channels.range, '28', 'default range is the screen default');
  assert.equal(d.channels.currency, 'SAR');
  const x = await (await call('GET', `/api/companies/${co}/director/context?range=nonsense`, alice)).json();
  assert.equal(x.channels.range, '28');
  assert.equal((await call('GET', `/api/companies/${co}/director/context`, bob)).status, 404);
});

test('ask: the prompt includes the channel numbers and rules; channel citations are checked against the context', async () => {
  answer = { answer: 'Facebook brought 6 recorded leads.', support: [{ type: 'channel', id: 'facebook.leads' }, { type: 'channel', id: 'facebook.made_up' }, { type: 'channel', id: 'tiktok.leads' }, { type: 'channel', id: 'facebook.dataFrom' }], insufficient: false };
  const r = await call('POST', `/api/companies/${co}/director/ask`, alice, { question: 'Which channel brings leads?', lang: 'en', range: 'all' });
  assert.equal(r.status, 200);
  const body = await r.json();
  const prompt = JSON.stringify(calls.at(-1));
  assert.match(prompt, /\\"channels\\":\{\\"range\\":\\"all\\"/);
  assert.match(prompt, /not conversions tracked by a platform/);
  assert.match(prompt, /type \\"channel\\" with id/);
  assert.deepEqual(body.support.map((s) => s.id), ['facebook.leads']);
  assert.equal(body.support[0].text, 'facebook.leads (2026-09-10 → 2026-10-20): 6');
  assert.equal(body.unsupported, false);
});

test('checkSupport: a channel citation without a channels block is dropped', () => {
  const ctx = { facts: [], metrics: { kpis: {} }, audit: { items: [] } };
  assert.deepEqual(checkSupport(ctx, [{ type: 'channel', id: 'facebook.leads' }]), []);
});
