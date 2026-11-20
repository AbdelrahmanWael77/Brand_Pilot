// P3 checkpoint 2 (2026-11-20): "not enough data" items as have / need / unlocks; the Arabic glossary in the Director's
// prompt; a held-back answer keeps its full text in the trail. Uses a copy of the synthetic FlowNest fixture.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createAi } from '../server/ai.js';
import { gaps } from '../server/gaps.js';
import { buildPrompt, ARABIC_GLOSSARY } from '../server/director.js';
import { rulesAnswer } from '../server/rulesDirector.js';

const copy = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-p3c2-'));
  const file = path.join(dir, 'brandpilot.db');
  fs.copyFileSync(new URL('./fixtures/pre-p4.db', import.meta.url), file);
  return file;
};
let db, co;
before(() => { db = openDb(copy()); co = db.prepare('SELECT id FROM companies').get().id; });
after(() => db.close());

test('every "not enough data" item says what you have, what you need and what it unlocks (EN, AR)', () => {
  for (const lang of ['en', 'ar']) {
    const g = gaps(db, co, { range: '28', lang });
    assert.ok(g.length >= 3, lang);
    for (const x of g) {
      assert.ok(x.title && x.have && x.need && x.unlocks, `${lang} ${x.id}`);
      assert.notEqual(x.have, x.need);
    }
    const spend = g.find((x) => x.id === 'no-spend');
    assert.match(spend.have, lang === 'en' ? /^20 social post rows .*spend column is empty/ : /^صفوف منشورات التواصل: 20 .*عمود الإنفاق فارغ/);
    assert.match(spend.unlocks, lang === 'en' ? /Cost per lead/ : /تكلفة العميل المحتمل/);
    const src = g.find((x) => x.id === 'src-best');
    assert.match(src.have, lang === 'en' ? /^48 leads .*, 35 of them with a source\.$/ : /العملاء المحتملون: 48 .*سُجّل مصدره: 35/);
  }
  // the rules engine's "what data do you need?" uses the same three parts
  const r = rulesAnswer(db, co, { question: 'What data do you need?', lang: 'en', range: '28' });
  assert.match(r.text, /What you have: .*\n- What you need: .*\n- What it unlocks: /);
  const ar = rulesAnswer(db, co, { question: 'ما البيانات الناقصة؟', lang: 'ar', range: '28' });
  assert.match(ar.text, /ما لديك: .*\n- ما تحتاجه: .*\n- ما الذي يتيحه: /);
});

test('the Arabic prompt carries the glossary of the screens’ words; the English prompt does not', () => {
  const ctx = { facts: [], metrics: { kpis: {} }, audit: { items: [] } };
  const ar = buildPrompt(ctx, 'q', 'ar').system;
  const en = buildPrompt(ctx, 'q', 'en').system;
  assert.ok(ar.includes(ARABIC_GLOSSARY));
  assert.ok(!en.includes(ARABIC_GLOSSARY));
  for (const w of ['الجوال', 'سطح المكتب', 'الكتيّب', 'ابدأ', 'بيانات تجريبية', 'التواصل الاجتماعي']) assert.ok(ARABIC_GLOSSARY.includes(w), w);
  assert.match(ARABIC_GLOSSARY, /Never put an English word inside an Arabic sentence \(no "demo"/);
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
test('a held-back AI answer is hidden from the page but its full text is in the trail for review; /gaps route', async () => {
  const d = openDb(copy());
  const reply = { answer: 'Mobile visitors enquire at 3.4%, so the mobile path is fine. Keep investing in Organic Social.', claims: [{ text: 'Mobile visitors enquire at 3.4%, so the mobile path is fine.', numbers: ['3.4%'], support: [], main: true }], support: [{ type: 'metric', id: 'enquiry_rate' }], insufficient: false, next: [] };
  const aiFetch = async () => json(200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(reply) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
  const server = createApp({ db: d, ai: createAi({ apiKey: 'test-key-never-real', fetch: aiFetch, maxRetries: 0 }) }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', password: 'correct horse battery' }) });
    const h = { 'content-type': 'application/json', cookie: login.headers.getSetCookie()[0].split(';')[0] };
    const c = d.prepare('SELECT id FROM companies').get().id;
    const r = await (await fetch(`${base}/api/companies/${c}/director/ask`, { method: 'POST', headers: h, body: JSON.stringify({ question: 'Is mobile fine?', lang: 'en', range: '28' }) })).json();
    assert.equal(r.check.blocked, true);
    assert.equal(r.model, 'claude-opus-5-5', 'the page can name the model');
    const t = JSON.parse(d.prepare("SELECT detail FROM trail WHERE company_id = ? AND kind = 'answer'").get(c).detail);
    assert.equal(t.check.heldBack, reply.answer, 'the full held-back text');
    assert.equal(t.check.mainClaim, 'Mobile visitors enquire at 3.4%, so the mobile path is fine.');
    assert.equal(t.check.reasonNumber, '3.4%');
    // the gaps route, per language
    const g = await (await fetch(`${base}/api/companies/${c}/gaps?range=28&lang=ar`, { headers: h })).json();
    assert.ok(g.items.length && g.items.every((x) => x.have && x.need && x.unlocks));
    assert.equal((await fetch(`${base}/api/companies/${c}/gaps`, { headers: { cookie: 'x=y' } })).status, 401);
  } finally { server.close(); d.close(); }
});
