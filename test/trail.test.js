// P5 (2026-11-20): the audit trail. Append-only (the database refuses UPDATE and DELETE; no route changes a row),
// one row per recommendation and Director answer with data fingerprint, engine / model, prompt version, who and when;
// fact decisions, tracking start, strategy approvals and saved reports in the same trail; strictly per company.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createAi } from '../server/ai.js';
import { createTrail, RULES_VERSION } from '../server/trail.js';
import { PROMPT_VERSION } from '../server/director.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const aiFetch = async () => json(200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ answer: 'Post more on Instagram.', support: [{ type: 'fact', id: 'f1' }], insufficient: false }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });

let server, base, db, alice, bob, co, coB;
const call = (method, path, cookie, body) => fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
const user = async (email) => (await call('POST', '/api/auth/register', null, { email, password: 'correct horse battery' })).headers.getSetCookie()[0].split(';')[0];
const f = (id, status, text = `Fact ${id}`) => ({ id, cat: 'offers', text, type: 'fact', status, src: null, ev: `Quote ${id}`, needs: false, date: '2026-11-01' });
const ga4 = (sessions) => [{ date: '2026-11-01', source: 'instagram', medium: 'social', campaign: '', sessions, users: sessions, engaged: sessions, conversions: 0, synthetic: false }];
const rows = (id) => db.prepare('SELECT * FROM trail WHERE company_id = ? ORDER BY rowid').all(id).map((r) => ({ ...r }));
const trailOf = async (id, cookie = alice, q = '') => (await (await call('GET', `/api/companies/${id}/trail${q}`, cookie)).json()).trail;

before(async () => {
  db = openDb(':memory:');
  server = createApp({ db, ai: createAi({ apiKey: 'test-key-never-real', fetch: aiFetch, maxRetries: 0 }), askLimit: { max: 1000, windowMs: 60_000 }, reportLimit: { max: 1000, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await user('alice@example.com');
  bob = await user('bob@example.com');
  co = (await (await call('POST', '/api/companies', alice, { name: 'Alice Co' })).json()).company.id;
  coB = (await (await call('POST', '/api/companies', bob, { name: 'Bob Co' })).json()).company.id;
  for (const [id, c] of [[co, alice], [coB, bob]]) {
    const put = await call('PUT', `/api/companies/${id}/state`, c, { state: { sources: [], findings: [f('f1', 'approved'), f('f2', 'pending'), f('f3', 'pending')], data: { meta: [], ga4: ga4(500), gsc: [], leads: [] } } });
    assert.equal(put.status, 200);
  }
});
after(() => { server.close(); db.close(); });

test('the database refuses to change or remove a trail row; deleting the whole company removes its rows', () => {
  const t = createTrail(db);
  const id = t.append(coB, { kind: 'report', detail: { range: '28', lang: 'en' } });
  assert.throws(() => db.prepare("UPDATE trail SET kind = 'answer' WHERE id = ?").run(id), /append-only/);
  assert.throws(() => db.prepare('UPDATE trail SET detail = ? WHERE id = ?').run('{}', id), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM trail WHERE id = ?').run(id), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM trail').run(), /append-only/);
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO trail (id, company_id, at, kind, detail) VALUES (?, ?, 'x', 'report', '{}')").run(id, coB), /append-only/);
  assert.equal(rows(coB).find((r) => r.id === id).kind, 'report');
  // a separate company that is deleted takes its own trail with it (as all its data) — nobody else's
  const tmp = 'tmp-co';
  db.prepare("INSERT INTO companies (id, name, created_by, created_at) VALUES (?, 'Tmp', (SELECT id FROM users LIMIT 1), 'x')").run(tmp);
  t.append(tmp, { kind: 'report', detail: {} });
  const others = db.prepare('SELECT COUNT(*) n FROM trail WHERE company_id != ?').get(tmp).n;
  db.prepare('DELETE FROM companies WHERE id = ?').run(tmp);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM trail WHERE company_id = ?').get(tmp).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM trail').get().n, others);
});

test('recommendations: one row each, with fingerprint, rules version and period; the same inputs are not recorded twice', async () => {
  const r1 = await call('GET', `/api/companies/${co}/audit?range=28`, alice);
  const batch = r1.headers.get('x-trail-batch');
  const items = (await r1.json()).items;
  assert.ok(batch && items.length);
  const recs = (await trailOf(co, alice, `?batch=${batch}`));
  assert.deepEqual(recs.map((r) => r.subject).sort(), items.map((i) => i.id).sort());
  for (const r of recs) {
    assert.equal(r.kind, 'recommendation');
    assert.equal(r.engine, 'rules');
    assert.equal(r.promptVersion, RULES_VERSION);
    assert.match(r.dataHash, /^[0-9a-f]{16}$/);
    assert.match(r.at, /^\d{4}-\d\d-\d\dT/);
    assert.equal(r.detail.range, '28');
    assert.ok(r.detail.basis && 'confidence' in r.detail);
    // the title in both languages, whichever language the screen was in
    assert.equal(r.detail.title.en, items.find((i) => i.id === r.subject).title);
    assert.ok(r.detail.title.ar && /[؀-ۿ]/.test(r.detail.title.ar), `${r.subject}: Arabic title`);
  }
  const ar = await (await call('GET', `/api/companies/${co}/audit?range=28&lang=ar`, alice)).json();
  const recsAr = await trailOf(co, alice, `?batch=${batch}&lang=ar`);
  for (const r of recsAr) assert.equal(r.summary, `سُجّلت توصية: ${ar.items.find((i) => i.id === r.subject).title}`);
  // read again (and in Arabic): same batch, no new rows
  const n = rows(co).length;
  assert.equal((await call('GET', `/api/companies/${co}/audit?range=28&lang=ar`, alice)).headers.get('x-trail-batch'), batch);
  assert.equal(rows(co).length, n);
  // the data changes: a new record with a new fingerprint
  await call('PUT', `/api/companies/${co}/state`, alice, { state: { sources: [], findings: [f('f1', 'approved'), f('f2', 'pending'), f('f3', 'pending')], data: { meta: [], ga4: ga4(900), gsc: [], leads: [] } } });
  const b2 = (await call('GET', `/api/companies/${co}/audit?range=28`, alice)).headers.get('x-trail-batch');
  assert.notEqual(b2, batch);
  assert.notEqual((await trailOf(co, alice, `?batch=${b2}`))[0].dataHash, recs[0].dataHash);
  // the earlier rows are still there, unchanged
  assert.deepEqual((await trailOf(co, alice, `?batch=${batch}`)).map((r) => r.id), recs.map((r) => r.id));
});

test('Director answers: AI answers keep the model id and prompt version; rules-engine answers are recorded too', async () => {
  const r = await (await call('POST', `/api/companies/${co}/director/ask`, alice, { question: 'Where should we post?', lang: 'en', range: '28' })).json();
  assert.match(r.trailId, /^[0-9a-f-]{36}$/);
  const row = (await trailOf(co, alice, '?kind=answer')).find((x) => x.id === r.trailId);
  assert.equal(row.engine, 'claude-opus-5-5');
  assert.equal(row.promptVersion, PROMPT_VERSION);
  assert.equal(row.by, 'alice@example.com');
  assert.equal(row.subject, 'Where should we post?');
  assert.deepEqual(row.detail.support, ['fact:f1']);
  assert.match(row.dataHash, /^[0-9a-f]{16}$/);
  // P3: the rules engine answers on the server and records its own answer
  const rr = await call('POST', `/api/companies/${co}/director/rules`, alice, { question: 'ما أكبر نقطة ضعف؟', lang: 'ar', range: '7' });
  assert.equal((await call('POST', `/api/companies/${co}/trail/answer`, alice, { question: 'q', answer: 'reported by the page' })).status, 400, 'the page cannot report a rules answer any more');
  assert.equal(rr.status, 200);
  const rid = (await rr.json()).trailId;
  const rules = (await trailOf(co, alice, '?kind=answer&lang=ar')).find((x) => x.id === rid);
  assert.equal(rules.engine, 'rules');
  assert.equal(rules.promptVersion, RULES_VERSION);
  assert.equal(rules.detail.range, '7');
  assert.match(rules.summary, /محرك القواعد/);
  const local = await (await call('POST', `/api/companies/${co}/trail/answer`, alice, { question: 'q', engine: 'endpoint' })).json();
  assert.equal((await trailOf(co, alice, '?kind=answer')).find((x) => x.id === local.trailId).engine, 'local endpoint');
  assert.equal((await call('POST', `/api/companies/${co}/trail/answer`, alice, { question: '' })).status, 400);
});

test('fact approvals, rejections and the start of tracking are trail rows with who, when and the review date', async () => {
  const later = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
  const r = await call('POST', `/api/companies/${co}/facts/decisions`, alice, { decisions: [{ id: 'f2', status: 'approved', reviewBy: later }, { id: 'f3', status: 'rejected' }] });
  assert.equal(r.status, 200);
  const t = await trailOf(co);
  const start = t.find((x) => x.kind === 'tracking_started');
  assert.deepEqual(start.detail, { legacy: 1, factIds: ['f1'] });
  const ap = t.find((x) => x.kind === 'fact_decision' && x.subject === 'f2');
  assert.equal(ap.detail.status, 'approved');
  assert.equal(ap.detail.reviewBy, later);
  assert.equal(ap.detail.text, 'Fact f2');
  assert.equal(ap.by, 'alice@example.com');
  assert.match(ap.summary, /^Fact approved: “Fact f2” \(review by /);
  const rej = t.find((x) => x.kind === 'fact_decision' && x.subject === 'f3');
  assert.equal(rej.detail.status, 'rejected');
  assert.ok(ap.batch && ap.batch === rej.batch, 'decisions sent together share a batch (the page shows them as one line)');
  // sent back to review: recorded; a fact with no decision sent back: nothing to record
  const n = rows(co).length;
  await call('POST', `/api/companies/${co}/facts/decisions`, alice, { decisions: [{ id: 'f3', status: 'pending' }] });
  await call('POST', `/api/companies/${co}/facts/decisions`, alice, { decisions: [{ id: 'f3', status: 'pending' }] });
  assert.equal(rows(co).length, n + 1);
  // the browser re-sending an approval it already shows changes nothing, so it is not recorded again
  await call('POST', `/api/companies/${co}/facts/decisions`, alice, { decisions: [{ id: 'f2', status: 'approved' }] });
  assert.equal(rows(co).length, n + 1);
});

test('strategy approvals are recorded with the facts the campaign uses; unapproved facts are refused', async () => {
  const ok = await call('POST', `/api/companies/${co}/campaigns/k1/approve-strategy`, alice, { name: 'Spring launch', factIds: ['f1', 'f2'] });
  assert.equal(ok.status, 201);
  const id = (await ok.json()).trailId;
  const row = (await trailOf(co, alice, '?kind=strategy_approval')).find((x) => x.id === id);
  assert.deepEqual(row.detail, { name: 'Spring launch', factIds: ['f1', 'f2'], mirrored: false });
  assert.equal(row.by, 'alice@example.com');
  assert.equal(row.summary, 'Strategy approved: Spring launch');
  const bad = await call('POST', `/api/companies/${co}/campaigns/k1/approve-strategy`, alice, { name: 'Spring launch', factIds: ['f1', 'f3'] });
  assert.equal(bad.status, 409);
  assert.deepEqual((await bad.json()).factIds, ['f3']);
  assert.equal((await call('POST', `/api/companies/${co}/campaigns/nope/approve-strategy`, alice, {})).status, 404, 'unknown campaign and no name');
});

test('a saved report stores the trail ids of its recommendations, and the save is itself a trail row', async () => {
  const res = await call('POST', `/api/companies/${co}/reports`, alice, { range: '28', lang: 'en' });
  assert.equal(res.status, 201);
  const head = (await res.json()).report;
  const one = await (await call('GET', `/api/companies/${co}/reports/${head.id}`, alice)).json();
  const tr = one.report.trail;
  assert.equal(tr.report, head.trailId);
  const recs = await trailOf(co, alice, `?batch=${tr.batch}`);
  const audit = await (await call('GET', `/api/companies/${co}/audit?range=28`, alice)).json();
  for (const item of audit.items) {
    const row = recs.find((r) => r.id === tr.ids[item.id]);
    assert.ok(row, item.id);
    assert.equal(row.subject, item.id);
  }
  const rep = recs.find((r) => r.kind === 'report');
  assert.equal(rep.id, head.trailId);
  assert.equal(rep.subject, head.id);
  assert.equal(rep.by, 'alice@example.com');
  assert.equal(rep.detail.recommendations, audit.items.length);
});

test('per company: a trail is read only by its members and never shows another company’s rows', async () => {
  // bob's company has its own rows
  await call('GET', `/api/companies/${coB}/audit`, bob);
  await call('POST', `/api/companies/${coB}/trail/answer`, bob, { question: 'Bob question' });
  const a = await trailOf(co);
  const b = await trailOf(coB, bob);
  assert.ok(a.length && b.length);
  const ids = new Set(a.map((x) => x.id));
  assert.ok(b.every((x) => !ids.has(x.id)));
  assert.ok(!JSON.stringify(a).includes('Bob question'));
  assert.ok(!JSON.stringify(a).includes('bob@example.com'));
  for (const r of db.prepare('SELECT company_id, user_id FROM trail WHERE user_id IS NOT NULL').all()) {
    assert.equal(r.user_id === db.prepare('SELECT id FROM users WHERE email = ?').get('alice@example.com').id, r.company_id === co);
  }
  // not a member: not found, and nothing is written
  const n = db.prepare('SELECT COUNT(*) n FROM trail').get().n;
  assert.equal((await call('GET', `/api/companies/${co}/trail`, bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${co}/trail?batch=${a[0].batch}`, bob)).status, 404);
  assert.equal((await call('POST', `/api/companies/${co}/trail/answer`, bob, { question: 'x' })).status, 404);
  assert.equal((await call('POST', `/api/companies/${co}/campaigns/k1/approve-strategy`, bob, { name: 'x', factIds: [] })).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM trail').get().n, n);
  // a batch id of another company finds nothing in your own
  assert.deepEqual(await trailOf(coB, bob, `?batch=${a.find((x) => x.batch).batch}`), []);
  assert.equal((await call('GET', `/api/companies/${co}/trail`, null)).status, 401);
});

// Every route the server declares, with the prefix it is mounted on (server/app.js). A new file with routes fails the
// test until it is listed here, so no route escapes the check.
const MOUNTS = {
  'app.js': '', 'auth.js': '/api/auth', 'companies.js': '/api/companies', 'series.js': '/api/companies',
  'meta.js': '/api/companies/:id/integrations/meta', 'google.js': '/api/companies/:id/integrations/google',
  'canva.js': '/api/companies/:id/integrations/canva', 'canvaStudio.js': '/api/companies/:id/canva',
};
function allRoutes() {
  const dir = new URL('../server/', import.meta.url);
  const out = [];
  for (const file of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(new URL(file, dir), 'utf8');
    const found = [...src.matchAll(/\b(?:app|router|company)\.(get|post|put|patch|delete)\(\s*'(\/[^']*)'/g)];
    if (!found.length) continue;
    assert.ok(file in MOUNTS, `routes in ${file} need a mount prefix in this test`);
    for (const [, method, p] of found) out.push({ method: method.toUpperCase(), path: MOUNTS[file] + (p === '/' && MOUNTS[file] ? '' : p) });
  }
  return out;
}

test('no route changes or removes a trail row: every route is called and every earlier row is still there, unchanged', async () => {
  // and no server code writes UPDATE / DELETE / REPLACE against the trail table
  for (const file of fs.readdirSync(new URL('../server/', import.meta.url))) {
    const src = fs.readFileSync(new URL(`../server/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /UPDATE\s+trail\b|DELETE\s+FROM\s+trail\b|REPLACE\s+INTO\s+trail\b|DROP\s+TABLE\s+(IF\s+EXISTS\s+)?trail\b/i, file);
  }
  const before = rows(co);
  assert.ok(before.length > 10);
  const routes = allRoutes();
  assert.ok(routes.length > 60, `found ${routes.length} routes`);
  const skip = (r) => (r.method === 'DELETE' && r.path === '/api/companies/:id') || r.path === '/api/auth/logout';
  let called = 0;
  for (const r of routes.filter((x) => !skip(x))) {
    const p = r.path.replace(':id', co).replace(/:(cid|aid|fid|rid|sid)\b/g, (m) => (m === ':fid' ? 'f1' : 'x'));
    const body = r.method === 'GET' || r.method === 'DELETE' ? undefined : { id: before[0].id, trail: [], status: 'rejected', decisions: [{ id: 'f1', status: 'rejected' }], question: 'Q', name: 'N' };
    const res = await call(r.method, p, alice, body);
    assert.ok(res.status < 500 || [502, 503].includes(res.status), `${r.method} ${p}: ${res.status}`);
    await res.arrayBuffer();
    called++;
  }
  assert.ok(called > 60);
  const now = rows(co);
  assert.ok(now.length >= before.length);
  assert.deepEqual(now.slice(0, before.length), before, 'every earlier row is still there, byte for byte, in order');
  // the company's deletion is the one thing that removes its rows (with all its data)
  assert.equal((await call('DELETE', `/api/companies/${coB}`, bob)).status, 200);
  assert.equal(rows(coB).length, 0);
  assert.deepEqual(rows(co).slice(0, before.length), before);
});

test('a database from before P5 (the pre-P4 fixture, on a copy) gets the empty trail; its old report has no trail id', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-p5-'));
  const file = path.join(dir, 'brandpilot.db');
  fs.copyFileSync(new URL('./fixtures/pre-p4.db', import.meta.url), file);
  const old = openDb(file);
  try {
    assert.equal(old.prepare('SELECT COUNT(*) n FROM trail').get().n, 0);
    const c = old.prepare('SELECT id FROM companies').get().id;
    const { createReports } = await import('../server/reports.js');
    const list = createReports(old).list(c);
    assert.equal(list.length, 1);
    assert.equal(list[0].trailId, null);
    assert.equal(createReports(old).get(c, list[0].id).report.trail, undefined, 'the old snapshot is not rewritten');
  } finally { old.close(); }
});
