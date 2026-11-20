// P4 (2026-11-21): fact approvals recorded on the server — who approved, when, and until when (review date).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

const db = openDb(':memory:');
const server = createApp({ db, ai: { configured: false, model: null, complete: async () => { throw new Error('no AI'); } } }).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const call = async (method, path, cookie, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
const user = async (email) => (await call('POST', '/api/auth/register', '', { email, password: 'correct horse battery' })).headers.getSetCookie()[0].split(';')[0];
const alice = await user('alice@example.com');
const bob = await user('bob@example.com');
const company = async (cookie, name) => (await (await call('POST', '/api/companies', cookie, { name })).json()).company.id;
const A = await company(alice, 'Alice Co');
const B = await company(bob, 'Bob Co');
const fact = (id, status, extra = {}) => ({ id, cat: 'offers', text: `Fact ${id}`, type: 'fact', status, src: null, ev: `Quote for ${id}`, needs: false, date: '2026-11-01', ...extra });
const put = (id, cookie, findings, campaigns = []) => call('PUT', `/api/companies/${id}/state`, cookie, { state: { sources: [], findings, campaigns } });
const facts = async (id, cookie) => (await call('GET', `/api/companies/${id}/facts`, cookie)).json();
const decide = async (id, cookie, decisions) => call('POST', `/api/companies/${id}/facts/decisions`, cookie, { decisions });
const byId = (list) => Object.fromEntries(list.map((f) => [f.id, f]));
const today = new Date().toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const findings = [fact('f1', 'approved'), fact('f2', 'pending'), fact('f3', 'pending', { ev: '' }), fact('f4', 'approved'), fact('u1', 'approved', { type: 'user', ev: '' })];
await put(A, alice, findings);
await put(B, bob, [fact('b1', 'approved'), fact('b2', 'pending')]);

test('before any recorded decision the browser state counts, as before P4 (no approval record, not tracked)', async () => {
  const r = await facts(A, alice);
  assert.equal(r.tracked, undefined);
  assert.equal(byId(r.facts).f1.status, 'approved');
  assert.equal(byId(r.facts).f1.approval, undefined);
});

test('the first decision records who, when and the review date, and marks earlier approvals "before tracking began"', async () => {
  const res = await decide(A, alice, [{ id: 'f2', status: 'approved' }]);
  assert.equal(res.status, 200);
  const [r] = (await res.json()).results;
  assert.equal(r.fact.status, 'approved');
  assert.equal(r.fact.approval.by, 'alice@example.com');
  assert.equal(r.fact.approval.legacy, false);
  assert.equal(r.fact.approval.at.slice(0, 10), today);
  assert.equal(r.fact.approval.reviewBy, plusDays(365), 'one year by default');
  const all = await facts(A, alice);
  assert.equal(all.tracked, true);
  const f = byId(all.facts);
  for (const id of ['f1', 'f4', 'u1']) assert.deepEqual(f[id].approval, { by: null, at: null, reviewBy: null, legacy: true }, id);
});

test('once tracked, an approval made only in the browser state is pending and never reaches the AI, the audit or QA', async () => {
  await put(A, alice, [...findings.map((x) => (x.id === 'f2' ? { ...x, status: 'approved' } : x)), fact('f5', 'approved')]);
  const f = byId((await facts(A, alice)).facts);
  assert.equal(f.f5.status, 'pending');
  const ctx = await (await call('GET', `/api/companies/${A}/director/context`, alice)).json();
  assert.ok(!ctx.facts.some((x) => x.id === 'f5'), 'not in the AI context');
  assert.ok(ctx.facts.some((x) => x.id === 'f1') && ctx.facts.some((x) => x.id === 'f2'));
});

test('re-sending an approval keeps "before tracking began"; an explicit re-approval with a review date replaces it', async () => {
  await decide(A, alice, [{ id: 'f1', status: 'approved' }]);
  assert.equal(byId((await facts(A, alice)).facts).f1.approval.legacy, true);
  const rb = plusDays(90);
  await decide(A, alice, [{ id: 'f1', status: 'approved', reviewBy: rb }]);
  assert.deepEqual({ ...byId((await facts(A, alice)).facts).f1.approval, at: null }, { by: 'alice@example.com', at: null, reviewBy: rb, legacy: false });
});

test('reject, back to pending, and a rejection in the browser state always withdraw an approval', async () => {
  await decide(A, alice, [{ id: 'f4', status: 'rejected' }]);
  assert.equal(byId((await facts(A, alice)).facts).f4.status, 'rejected');
  await decide(A, alice, [{ id: 'f4', status: 'pending' }]);
  assert.equal(byId((await facts(A, alice)).facts).f4.status, 'pending', 'no record and tracked: pending');
  await put(A, alice, findings.map((x) => (x.id === 'u1' ? { ...x, status: 'rejected' } : x)));
  assert.equal(byId((await facts(A, alice)).facts).u1.status, 'rejected');
});

test('validation: evidence needed, review date in range, unknown ids, malformed body', async () => {
  const r = (await (await decide(A, alice, [{ id: 'f3', status: 'approved' }, { id: 'f2', status: 'approved', reviewBy: today }, { id: 'f2', status: 'approved', reviewBy: plusDays(4 * 365) }, { id: 'nope', status: 'approved' }])).json()).results;
  assert.deepEqual(r.map((x) => x.error), ['no_evidence', 'invalid_review', 'invalid_review', 'not_found']);
  assert.equal((await decide(A, alice, [])).status, 400);
  assert.equal((await decide(A, alice, [{ id: 'f2', status: 'maybe' }])).status, 400);
  assert.equal((await call('POST', `/api/companies/${A}/facts/decisions`, alice, { decisions: 'x' })).status, 400);
});

test('expiry: past its review date a fact is "expired" — out of the AI context and failing the campaign check until re-approved', async () => {
  await put(A, alice, findings.map((x) => (x.id === 'f2' ? { ...x, status: 'approved' } : x)), [{ id: 'k1', name: 'Uses f2', slug: 'uses-f2', rec: null, approved: true, at: Date.now(), brief: {}, factIds: ['f2'], assets: [{ id: 'a1', type: 'post', lang: 'en', channel: 'facebook', n: 1, status: 'draft', fields: { headline: { v: 'Hi' } } }] }]);
  let qa = await (await call('GET', `/api/companies/${A}/campaigns/k1/qa`, alice)).json();
  assert.equal(qa.checks.find((c) => c.id === 'facts-current').pass, true);
  db.prepare("UPDATE fact_approvals SET review_by = '2020-01-01' WHERE company_id = ? AND fact_id = 'f2'").run(A);
  assert.equal(byId((await facts(A, alice)).facts).f2.status, 'expired');
  const ctx = await (await call('GET', `/api/companies/${A}/director/context`, alice)).json();
  assert.ok(!ctx.facts.some((x) => x.id === 'f2'), 'expired facts are not given to the AI');
  qa = await (await call('GET', `/api/companies/${A}/campaigns/k1/qa`, alice)).json();
  assert.deepEqual(qa.checks.find((c) => c.id === 'facts-current'), { id: 'facts-current', pass: false, basis: 'facts', affected: ['f2'], detail: 'Every fact the campaign uses is still approved and not past its review date.' });
  // re-sending without a date does not revive it; an explicit re-approval does
  await decide(A, alice, [{ id: 'f2', status: 'approved', reviewBy: plusDays(30) }]);
  assert.equal(byId((await facts(A, alice)).facts).f2.status, 'approved');
  const camp = await (await call('GET', `/api/companies/${A}/campaigns/k1`, alice)).json();
  assert.deepEqual(camp.campaign.factIds, ['f2'], 'the campaign keeps the ids of the facts it uses');
});

test('isolation: no decision on another company, and fact ids never cross companies', async () => {
  assert.equal((await decide(A, bob, [{ id: 'f2', status: 'rejected' }])).status, 404, 'Bob is not a member of Alice Co');
  const r = (await (await decide(A, alice, [{ id: 'b1', status: 'approved' }])).json()).results;
  assert.deepEqual(r, [{ id: 'b1', error: 'not_found' }], "Bob's fact is not found through Alice's company");
  assert.equal((await facts(B, bob)).tracked, undefined, "Alice's decisions do not start tracking for Bob's company");
  assert.equal(db.prepare('SELECT COUNT(*) n FROM fact_approvals WHERE company_id = ?').get(B).n, 0);
  assert.equal((await call('GET', `/api/companies/${B}/facts`, alice)).status, 404);
});

test('deleting a company removes its approval records', async () => {
  const C = await company(alice, 'Gone Co');
  await put(C, alice, [fact('g1', 'pending')]);
  await decide(C, alice, [{ id: 'g1', status: 'approved' }]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM fact_approvals WHERE company_id = ?').get(C).n, 1);
  await call('DELETE', `/api/companies/${C}`, alice);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM fact_approvals WHERE company_id = ?').get(C).n, 0);
});
