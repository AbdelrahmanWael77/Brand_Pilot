// P3 (2026-11-20): the number check. Uses a copy of test/fixtures/pre-p4.db (the synthetic FlowNest demo company: fake
// account, synthetic data) for the known numbers of the last 28 days (21 Sep – 18 Oct 2026).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createAi } from '../server/ai.js';
import { extractNumbers, normalize, buildPool, checkText, checkAnswer, demoSample } from '../server/numcheck.js';

const copy = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-p3-'));
  const file = path.join(dir, 'brandpilot.db');
  fs.copyFileSync(new URL('./fixtures/pre-p4.db', import.meta.url), file);
  return file;
};
let db, co, pool;
before(() => {
  db = openDb(copy());
  co = db.prepare('SELECT id FROM companies').get().id;
  pool = buildPool(db, co, { range: '28' });
});
after(() => db.close());
const status = (text) => checkText(text, pool).numbers.map((n) => `${n.raw}:${n.status}`);

test('extraction: Arabic-Indic digits and marks, percentages, thousands; dates, years, list markers and small counts are not checked', () => {
  assert.equal(normalize('١٫٣٦٪ و٤٬٧٧٤'), '1.36% و4,774');
  const n = extractNumbers('معدل ١٫٣٦٪ من ٤٬٧٧٤ جلسة، و۵۰ زيارة');
  assert.deepEqual(n.map((x) => [x.raw, x.value, x.pct]), [['١٫٣٦٪', 1.36, true], ['٤٬٧٧٤', 4774, false], ['۵۰', 50, false]]);
  const e = extractNumbers('1. Fix /pricing (21 Sep to 18 Oct 2026, 2026-10-18): 0.42% on 1,676 sessions, 2 customers, 12 percent, 15 في المئة, 4.8k visits, GA4, 2024 brochure');
  const checked = e.filter((x) => !x.plain).map((x) => [x.raw, x.value, x.pct]);
  assert.deepEqual(checked, [['0.42%', 0.42, true], ['1,676', 1676, false], ['12 percent', 12, true], ['15 في المئة', 15, true], ['4.8k', 4800, false]]);
  assert.ok(e.find((x) => x.raw === '1').plain, 'list marker');
  assert.ok(e.find((x) => x.raw === '2').plain, 'small count');
  assert.ok(e.find((x) => x.raw === '2024').plain, 'year');
  assert.ok(!e.some((x) => x.raw === '21' || x.raw === '18' || x.raw === '10'), 'dates are skipped');
});

test('true numbers pass, rounded at the precision written; wrong rounding does not', () => {
  assert.deepEqual(status('The site-wide enquiry rate is 1.36%.'), ['1.36%:verified']);
  assert.deepEqual(status('The site-wide enquiry rate is 1.4%.'), ['1.4%:verified']);
  assert.deepEqual(status('The site-wide enquiry rate is 1.37%.'), ['1.37%:unverified']);
  assert.deepEqual(status('The site-wide enquiry rate is 1.2%.'), ['1.2%:unverified']);
  assert.deepEqual(status('The site-wide enquiry rate is 1.3%.'), ['1.3%:other_period'], 'the previous period’s 1.33%, given as this period’s');
  assert.deepEqual(status('We had about 4,800 sessions.'), ['4,800:verified']);
  assert.deepEqual(status('We had 4,800 sessions.'), ['4,800:unverified'], 'rounding further needs "about"');
  assert.deepEqual(status('Search brought 31 enquiries; 48 leads in total, 16 of them qualified (33%).'), ['31:verified', '48:verified', '16:verified', '33%:verified']);
});

test('invented numbers and fake percentages are caught', () => {
  assert.deepEqual(status('The site had 5,312 sessions this period.'), ['5,312:unverified']);
  assert.deepEqual(status('Instagram leads grew 250% this month.'), ['250%:unverified']);
  assert.deepEqual(status('Instagram leads grew 300% this month.'), ['300%:verified'], 'a real change (1 → 4 leads) is not fake');
  assert.deepEqual(status('Email converts at 9.5%.'), ['9.5%:unverified']);
});

test('swapped metrics and subjects are caught', () => {
  assert.deepEqual(status('Mobile visitors enquire at 0.81%, desktop visitors at 2.27%.'), ['0.81%:verified', '2.27%:verified']);
  assert.deepEqual(status('Mobile visitors enquire at 2.27%, desktop visitors at 0.81%.'), ['2.27%:mismatch', '0.81%:mismatch']);
  assert.deepEqual(status('The /pricing page had 1,781 sessions.'), ['1,781:mismatch'], 'Organic Social’s sessions given to /pricing');
  assert.deepEqual(status('Organic Social has an enquiry rate of 37%.'), ['37%:mismatch'], 'its share of sessions given as its enquiry rate');
  const r = checkText('Mobile visitors enquire at 2.27%.', pool).numbers[0];
  assert.match(r.actual.label, /Desktop/);
});

test('a number from another period is caught unless the answer says it is the previous period', () => {
  assert.deepEqual(status('This period the site received 63 enquiries.'), ['63:other_period']);
  assert.deepEqual(status('Search enquiries: 40.'), ['40:other_period']);
  assert.deepEqual(status('Enquiries rose from 63 in the previous period to 65.'), ['63:verified', '65:verified']);
  assert.deepEqual(status('Search enquiries fell from 40 to 31 against the previous period.'), ['40:verified', '31:verified']);
  // a number of a longer period (all imported data) is not this period's
  const all = buildPool(db, co, { range: 'all' });
  const sessionsAll = all.entries.find((e) => e.source.type === 'metric' && e.source.id === 'sessions' && e.period === 'cur').value;
  assert.deepEqual(status(`The site had ${new Intl.NumberFormat('en-US').format(sessionsAll)} sessions.`), [`${new Intl.NumberFormat('en-US').format(sessionsAll)}:unverified`]);
});

test('Arabic answers and Arabic-Indic digits are checked the same way', () => {
  assert.deepEqual(status('معدل الاستفسار في الموقع ١٫٣٦٪ من ٤٬٧٧٤ جلسة.'), ['١٫٣٦٪:verified', '٤٬٧٧٤:verified']);
  assert.deepEqual(status('سجّل الموقع ٥٣١٢ جلسة في هذه الفترة.'), ['٥٣١٢:unverified']);
  assert.deepEqual(status('معدل الاستفسار على الجوال ٢٫٢٧٪.'), ['٢٫٢٧٪:mismatch']);
  assert.deepEqual(status('معدل الاستفسار على الجوال 0.81% مقابل 2.27% على سطح المكتب.'), ['0.81%:verified', '2.27%:verified']);
});

test('the six real AI answers of Phase 4.5 (claude-sonnet-5-5 on this demo data): every number verified, none blocked', () => {
  const p45 = JSON.parse(fs.readFileSync(new URL('../docs/ui-audit/screenshots-p45/results.json', import.meta.url), 'utf8'));
  assert.equal(p45.answers.length, 6);
  let n = 0;
  for (const a of p45.answers) {
    const c = checkAnswer(a.answer, buildPool(db, co, { range: '28', question: a.question }), { support: a.trail.support });
    assert.deepEqual(c.numbers.filter((x) => x.status !== 'verified').map((x) => x.raw), [], `Q${a.n}`);
    assert.equal(c.blocked, false, `Q${a.n}`);
    n += c.numbers.length;
  }
  assert.ok(n >= 60, `${n} numbers checked`);
});

test('two real answers with the structured-claims prompt (P3): every number verified, none blocked', () => {
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/p3-ai-answers.json', import.meta.url), 'utf8'));
  for (const a of fx.answers) {
    const c = checkAnswer(a.answer, buildPool(db, co, { range: '28', question: a.question }), { support: a.support });
    assert.deepEqual(c.numbers.filter((x) => x.status !== 'verified').map((x) => x.raw), [], a.question);
    assert.equal(c.blocked, false, a.question);
  }
  // the two sentence shapes behind the first false alarms
  assert.deepEqual(status("Organic search brings the most enquiries: 31 of the site's 65 in this period, a 2.02% enquiry rate from 1,534 sessions."), ['31:verified', '65:verified', '2.02%:verified', '1,534:verified']);
  assert.deepEqual(status('Facebook and Instagram combined show 7 enquiries from 1,781 sessions (0.39%).'), ['1,781:verified', '0.39%:verified']);
  assert.deepEqual(status('Facebook had 1,781 sessions.'), ['1,781:mismatch'], 'the combined number is not Facebook’s alone');
});

test('the main claim decides: an unverified number in it blocks the answer, elsewhere it is only marked', () => {
  const text = 'The site-wide enquiry rate is 1.36%. Instagram could grow 250% with more posts.';
  const ok = checkAnswer(text, pool);
  assert.equal(ok.blocked, false, 'without claims the first sentence with a number is the main claim');
  assert.deepEqual(ok.numbers.map((x) => x.status), ['verified', 'unverified']);
  const bad = checkAnswer(text, pool, { claims: [{ text: 'Instagram could grow 250% with more posts.', main: true }] });
  assert.equal(bad.blocked, true);
  assert.deepEqual(bad.reason, { code: 'unverified', raw: '250%' });
  const swapped = checkAnswer('Mobile visitors enquire at 2.27%.', pool);
  assert.equal(swapped.blocked, true);
  assert.equal(swapped.reason.code, 'mismatch');
});

test('demo sample: every deliberate mistake is caught by the real check, the true numbers pass (EN, AR)', () => {
  for (const lang of ['en', 'ar']) {
    const s = demoSample(db, co, { range: '28', lang });
    const c = checkAnswer(s.text, pool);
    const at = (e) => c.numbers.find((x) => x.start === e.start);
    const want = { wrong_rounding: 'unverified', swapped: 'mismatch', other_period: 'other_period', invented: 'unverified', invented_arabic_digits: 'unverified', fake_percentage: 'unverified', true: 'verified', true_arabic_digits: 'verified' };
    assert.equal(s.expected.length, 7, lang);
    for (const e of s.expected) assert.equal(at(e)?.status, want[e.kind], `${lang} ${e.kind} ${e.raw}`);
    assert.equal(c.blocked, true);
    if (lang === 'ar') assert.ok(s.expected.some((e) => /[٠-٩]/.test(e.raw)), 'Arabic-Indic digits in the Arabic sample');
  }
});

// ---- routes -------------------------------------------------------------------------------------------------------

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let nextReply = null;
const aiFetch = async () => json(200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(nextReply) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });

async function app({ demo = false, ai = true } = {}) {
  const d = openDb(copy());
  const server = createApp({ db: d, demo, ...(ai ? { ai: createAi({ apiKey: 'test-key-never-real', fetch: aiFetch, maxRetries: 0 }) } : { ai: createAi({ apiKey: '', openaiKey: '', openrouterKey: '' }) }), askLimit: { max: 100, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', password: 'correct horse battery' }) });
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const c = d.prepare('SELECT id FROM companies').get().id;
  const call = async (method, p, body, ck = cookie) => { const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie: ck }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const other = async () => (await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'other@example.com', password: 'correct horse battery' }) })).headers.getSetCookie()[0].split(';')[0];
  return { db: d, co: c, call, other, close: () => { server.close(); d.close(); } };
}
const trailOf = (d, c, kind) => d.prepare('SELECT * FROM trail WHERE company_id = ? AND kind = ? ORDER BY rowid').all(c, kind).map((r) => ({ ...r, detail: JSON.parse(r.detail) }));

test('route: an AI answer with true numbers is verified; one whose main claim is invented is blocked; both are in the trail', async () => {
  const a = await app();
  try {
    nextReply = { answer: 'Fix the mobile path first. Mobile visitors enquire at 0.81% against 2.27% on desktop.', claims: [{ text: 'Mobile visitors enquire at 0.81% against 2.27% on desktop.', numbers: ['0.81%', '2.27%'], support: [{ type: 'audit', id: 'mobile-gap' }], main: true }], support: [{ type: 'audit', id: 'mobile-gap' }], insufficient: false, next: [] };
    const ok = await a.call('POST', `/api/companies/${a.co}/director/ask`, { question: 'What should we do first?', lang: 'en', range: '28' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.check.blocked, false);
    assert.deepEqual(ok.body.check.numbers.map((n) => [n.raw, n.status, n.source.type]), [['0.81%', 'verified', 'audit'], ['2.27%', 'verified', 'audit']]);
    assert.equal(ok.body.claims[0].main, true);
    nextReply = { answer: 'Mobile visitors enquire at 3.4%, so the mobile path is fine.', claims: [{ text: 'Mobile visitors enquire at 3.4%, so the mobile path is fine.', numbers: ['3.4%'], support: [], main: true }], support: [{ type: 'metric', id: 'enquiry_rate' }], insufficient: false, next: [] };
    const bad = await a.call('POST', `/api/companies/${a.co}/director/ask`, { question: 'Is mobile fine?', lang: 'en', range: '28' });
    assert.equal(bad.body.check.blocked, true);
    assert.deepEqual(bad.body.check.reason, { code: 'unverified', raw: '3.4%' });
    const rows = trailOf(a.db, a.co, 'answer');
    assert.deepEqual(rows.map((r) => r.detail.check.blocked), [false, true]);
    assert.equal(rows[0].prompt_version, 'director-2026-11-20b');
  } finally { a.close(); }
});

test('route: the rules engine answers on the server; its numbers verify; the trail says the server produced it (EN, AR)', async () => {
  const a = await app({ ai: false });
  try {
    for (const [lang, q] of [['en', 'What should we do first?'], ['en', 'What changed?'], ['ar', 'ما أكبر نقطة ضعف تسويقية لدينا؟'], ['en', 'Why is traffic not turning into enquiries?']]) {
      const r = await a.call('POST', `/api/companies/${a.co}/director/rules`, { question: q, lang, range: '28' });
      assert.equal(r.status, 200, q);
      assert.ok(r.body.text.length > 40, q);
      assert.ok(r.body.check.numbers.length > 0, q);
      assert.deepEqual(r.body.check.numbers.filter((n) => n.status !== 'verified').map((n) => n.raw), [], `${q}: ${r.body.text.slice(0, 200)}`);
      assert.equal(r.body.check.blocked, false);
    }
    const rows = trailOf(a.db, a.co, 'answer');
    assert.equal(rows.length, 4);
    assert.ok(rows.every((r) => r.engine === 'rules' && r.detail.producedBy === 'server' && r.detail.answer.length > 40));
    assert.equal((await a.call('POST', `/api/companies/${a.co}/trail/answer`, { question: 'q', answer: 'x' })).status, 400);
  } finally { a.close(); }
});

test('route: a pasted answer is checked (first text = main claim) and recorded; the demo test exists only in demo mode', async () => {
  const a = await app({ ai: false });
  try {
    const r = await a.call('POST', `/api/companies/${a.co}/numcheck`, { texts: ['Your enquiry rate is 4.9%, the best in your sector.', 'Mobile is 62% of sessions.'], lang: 'en', range: '28', source: 'import' });
    assert.equal(r.status, 200);
    assert.equal(r.body.blocked, true);
    assert.deepEqual(r.body.checks[1].numbers.map((n) => n.status), ['verified']);
    assert.equal(trailOf(a.db, a.co, 'number_check')[0].detail.source, 'import');
    assert.equal((await a.call('POST', `/api/companies/${a.co}/numcheck/demo`, { lang: 'en' })).status, 404, 'no demo mode');
    assert.equal((await a.call('POST', `/api/companies/${a.co}/numcheck`, { texts: [] })).status, 400);
  } finally { a.close(); }
  const d = await app({ ai: false, demo: true });
  try {
    for (const lang of ['en', 'ar']) {
      const r = await d.call('POST', `/api/companies/${d.co}/numcheck/demo`, { lang, range: '28' });
      assert.equal(r.status, 200);
      const caught = r.body.expected.filter((e) => !e.kind.startsWith('true')).map((e) => r.body.check.numbers.find((n) => n.start === e.start).status);
      assert.ok(caught.every((s) => s !== 'verified'), `${lang}: every deliberate mistake caught`);
      assert.ok(r.body.expected.filter((e) => e.kind.startsWith('true')).every((e) => r.body.check.numbers.find((n) => n.start === e.start).status === 'verified'));
    }
    const t = trailOf(d.db, d.co, 'number_check');
    assert.equal(t.length, 2);
    assert.ok(t.every((x) => x.detail.demo === true && x.detail.source === 'demo' && x.detail.blocked === true));
    // another account cannot run checks on this company
    const ck = await d.other();
    assert.equal((await d.call('POST', `/api/companies/${d.co}/numcheck/demo`, { lang: 'en' }, ck)).status, 404);
    assert.equal((await d.call('POST', `/api/companies/${d.co}/numcheck`, { texts: ['x 12'] }, ck)).status, 404);
    assert.equal((await d.call('POST', `/api/companies/${d.co}/director/rules`, { question: 'q' }, ck)).status, 404);
  } finally { d.close(); }
});
