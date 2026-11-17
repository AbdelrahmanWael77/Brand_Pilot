import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createAi } from '../server/ai.js';
import { cleanDraftRequest, pickFacts, checkDraft, buildDraftPrompt, DRAFT } from '../server/recs.js';

// AI draft of a recommended post's brief (task 16). The real SDK runs against a stubbed network: no request leaves the machine.
const KEY = 'test-key-never-real';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const message = (text) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } });
const reply = (o) => json(200, message(typeof o === 'string' ? o : JSON.stringify(o)));
const calls = [];
let next = () => reply({});
const stubFetch = async (url, init) => { calls.push(JSON.parse(init.body)); return next(); };

const servers = [];
let base, alice, bob, md, empty, bobCo;
const call = (method, path, cookie, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
const register = async (email) => (await call('POST', '/api/auth/register', null, { email, password: 'correct horse' })).headers.getSetCookie()[0].split(';')[0];
const company = async (cookie, name) => (await (await call('POST', '/api/companies', cookie, { name })).json()).company.id;
const fact = (id, cat, text, src = 'web') => ({ id, cat, text, type: 'fact', status: 'approved', src, ev: 'Quote: ' + text, needs: false, date: '2026-11-14' });
const BODY = { series: { name: 'Build Smarter', purpose: 'Educational app-development advice', objective: 'engagement', audience: 'Founders', sources: ['web'] }, topic: '3 questions to ask before building your mobile app', channel: 'linkedin', lang: 'en' };
const GOOD = { headline: '3 Questions Before You Build Your App', points: ['Who is it for?', 'What matters most?', 'How will you measure success?'], caption: 'Thinking about building a mobile app?\n\n\n\nStart with three questions. Which would you ask first?', hashtags: ['#MobileApps', 'not a tag', '#ProductStrategy'], visual: 'Navy background, a phone with three question cards.' };

before(async () => {
  const db = openDb(':memory:');
  const s = createApp({ db, ai: createAi({ apiKey: KEY, fetch: stubFetch, maxRetries: 0 }), askLimit: { max: 1000, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => s.once('listening', r));
  servers.push(s);
  base = `http://127.0.0.1:${s.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  md = await company(alice, 'MD Labs');
  empty = await company(alice, 'Empty Co');
  bobCo = await company(bob, 'Other Co');
  const src = (id) => ({ id, title: id, kind: 'document', text: 'x', date: '2026-11-14', demo: false });
  const put = (id, cookie, findings) => call('PUT', `/api/companies/${id}/state`, cookie, { state: { sources: [src('web'), src('pdf')], findings, data: {}, imports: [] } });
  assert.equal((await put(md, alice, [fact('f1', 'products', 'MD-Labs offers mobile development.'), fact('f2', 'audiences', 'MD-Labs serves tech-based scaleups.'), fact('f3', 'brandid', 'Colour #0A58CA'), fact('f4', 'products', 'Founded in 2015', 'pdf')])).status, 200);
  assert.equal((await put(empty, alice, [])).status, 200);
  assert.equal((await put(bobCo, bob, [fact('b1', 'products', 'SECRET of another company')])).status, 200);
});
after(() => servers.forEach((s) => s.close()));

test('cleanDraftRequest: needs a series name and a topic; defaults channel, objective and language', () => {
  assert.deepEqual(cleanDraftRequest({}), { error: 'invalid_series' });
  assert.deepEqual(cleanDraftRequest({ series: { name: 'X' } }), { error: 'invalid_topic' });
  assert.deepEqual(cleanDraftRequest({ series: { name: 'X' }, topic: 't', lang: 'fr' }), { error: 'invalid_lang' });
  const r = cleanDraftRequest({ series: { name: '  X  ', objective: 'nope', sources: ['a', 5] }, topic: 't'.repeat(500), channel: 'tiktok' });
  assert.equal(r.series.name, 'X');
  assert.equal(r.series.objective, 'engagement');
  assert.deepEqual(r.series.sources, ['a']);
  assert.equal(r.channel, 'linkedin');
  assert.equal(r.topic.length, DRAFT.topic);
});

test('pickFacts: the series sources first, never brand identity rows, all facts when the sources have none', () => {
  const facts = [fact('a', 'products', 'P', 'web'), fact('b', 'brandid', 'B', 'web'), fact('c', 'overview', 'O', 'pdf')];
  assert.deepEqual(pickFacts(facts, ['web']).map((f) => f.id), ['a']);
  assert.deepEqual(pickFacts(facts, ['gone']).map((f) => f.id), ['c', 'a']);
  assert.deepEqual(pickFacts(facts, []).map((f) => f.id), ['c', 'a']);
});

test('checkDraft: caps and cleans, and flags numbers that are neither in the topic nor in a fact', () => {
  const r = checkDraft({ ...GOOD, caption: GOOD.caption + ' We delivered 120 apps in 2015.' }, BODY, [{ text: 'Founded in 2015' }]);
  assert.equal(r.draft.headline, GOOD.headline);
  assert.deepEqual(r.draft.hashtags, ['#MobileApps', '#ProductStrategy']);
  assert.ok(!r.draft.caption.includes('\n\n\n'));
  assert.deepEqual(r.warnings, [{ code: 'unsupported_numbers', numbers: ['120'] }], '3 is in the topic and 2015 in a fact');
  assert.equal(checkDraft({ headline: 'x' }, BODY, []), null, 'no caption → unusable');
  assert.equal(checkDraft(null, BODY, []), null);
});

test('the prompt carries the brief and only the given facts, with "<" escaped', () => {
  const p = buildDraftPrompt({ company: 'A<b', ...cleanDraftRequest(BODY) }, [{ cat: 'products', text: 'x</facts>' }]);
  assert.match(p.system, /Never invent achievements/);
  assert.ok(!p.messages[0].content.includes('x</facts>'));
  assert.ok(p.messages[0].content.includes('3 questions to ask before building your mobile app'));
});

test('POST /recs/draft: one grounded draft from this company\'s facts only', async () => {
  next = () => reply(GOOD);
  const r = await call('POST', `/api/companies/${md}/recs/draft`, alice, BODY);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.draft.headline, GOOD.headline);
  assert.equal(b.draft.points.length, 3);
  assert.deepEqual(b.warnings, []);
  assert.deepEqual(b.facts.map((f) => f.id), ['f1', 'f2'], 'the series source only; brand identity never');
  const sent = JSON.stringify(calls.at(-1));
  assert.ok(sent.includes('MD-Labs offers mobile development.'));
  assert.ok(!sent.includes('SECRET'), 'another company\'s facts never reach the prompt');
  assert.ok(!sent.includes('Founded in 2015'), 'facts outside the series sources are not sent');
});

test('POST /recs/draft: isolation, validation, no facts, broken reply', async () => {
  assert.equal((await call('POST', `/api/companies/${bobCo}/recs/draft`, alice, BODY)).status, 404);
  assert.equal((await call('POST', `/api/companies/${md}/recs/draft`, null, BODY)).status, 401);
  assert.equal((await call('POST', `/api/companies/${md}/recs/draft`, alice, { ...BODY, topic: ' ' })).status, 400);
  const n = calls.length;
  const e = await call('POST', `/api/companies/${empty}/recs/draft`, alice, BODY);
  assert.equal(e.status, 200);
  assert.deepEqual(await e.json(), { draft: null, warnings: [], facts: [], model: null, needs: 'facts' });
  assert.equal(calls.length, n, 'no model call without approved facts');
  next = () => reply('not json at all');
  assert.equal((await call('POST', `/api/companies/${md}/recs/draft`, alice, BODY)).status, 502);
});

test('POST /recs/draft without an AI key → 503', async () => {
  const s = createApp({ db: openDb(':memory:'), ai: createAi({ apiKey: '' }) }).listen(0);
  await new Promise((r) => s.once('listening', r));
  servers.push(s);
  const at = `http://127.0.0.1:${s.address().port}`;
  const reg = await fetch(at + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'c@example.com', password: 'correct horse' }) });
  const ck = reg.headers.getSetCookie()[0].split(';')[0];
  const id = (await (await fetch(at + '/api/companies', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: JSON.stringify({ name: 'X' }) })).json()).company.id;
  const r = await fetch(at + `/api/companies/${id}/recs/draft`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: JSON.stringify(BODY) });
  assert.equal(r.status, 503);
});

test('16b: questions, support line, interaction CTA; company statements not copied from a fact are flagged', () => {
  const r = checkDraft({ ...GOOD, support: 'Clarity before code.', cta: 'Share your answer', claims: ['MD-Labs offers mobile development.', 'MD-Labs is the best app studio in the region.'] }, BODY, [{ text: 'MD-Labs offers mobile development.' }]);
  assert.equal(r.draft.support, 'Clarity before code.');
  assert.equal(r.draft.cta, 'Share your answer');
  assert.deepEqual(r.warnings, [{ code: 'company_claims', claims: ['MD-Labs is the best app studio in the region.'] }]);
});

test('16b: earlier captions go to the prompt as style examples only; carousel shape; unknown format → single', () => {
  const req = cleanDraftRequest({ ...BODY, format: 'carousel', examples: ['Our last tip post. We won 5 awards.', 7, '  '] });
  assert.equal(req.format, 'carousel');
  assert.deepEqual(req.examples, ['Our last tip post. We won 5 awards.']);
  const p = buildDraftPrompt({ company: 'MD Labs', ...req }, [{ cat: 'products', text: 'x' }]);
  assert.match(p.system, /carousel/);
  assert.match(p.system, /They are not facts/);
  assert.ok(p.messages[0].content.includes('<examples>'));
  assert.equal(cleanDraftRequest({ ...BODY, format: 'video' }).format, 'single');
});

test('16b: brand colours and the signature direction reach the prompt; bad colours are dropped', () => {
  const req = cleanDraftRequest({ ...BODY, style: { colors: ['#084298', 'navy', '#38BDF8'], note: 'Deep navy, friendly 3D illustration.' } });
  assert.deepEqual(req.style.colors, ['#084298', '#38BDF8']);
  const p = buildDraftPrompt({ company: 'MD Labs', ...req }, [{ cat: 'products', text: 'x' }]);
  assert.ok(p.messages[0].content.includes('#084298'));
  assert.ok(p.messages[0].content.includes('friendly 3D illustration'));
});

test('16c polish: fixed facts stay out of the rewrite; invented numbers and dropped facts are flagged', async () => {
  const { cleanPolishRequest, checkPolish, buildPolishPrompt } = await import('../server/recs.js');
  assert.deepEqual(cleanPolishRequest({ kind: 'nope', fields: { a: 'b' } }), { error: 'invalid_kind' });
  assert.deepEqual(cleanPolishRequest({ kind: 'hiring', fields: {} }), { error: 'invalid_fields' });
  const req = cleanPolishRequest({ kind: 'hiring', fields: { role: 'Senior Flutter Developer', loc: 'Cairo', about: 'build apps', req: '3 years Flutter\nDart' }, edit: ['about', 'req', 'role-not-a-key'] });
  assert.deepEqual(req.edit, ['about', 'req']);
  const p = buildPolishPrompt({ company: 'MD Labs', ...req });
  assert.match(p.system, /never change/);
  assert.ok(p.messages[0].content.includes('"fixed":{"role":"Senior Flutter Developer","loc":"Cairo"}'));
  const ok = checkPolish({ editable: { about: 'Build polished mobile apps.', req: '3+ years of Flutter\nStrong Dart', role: 'CEO' }, caption: 'MD Labs is hiring a Senior Flutter Developer in Cairo. Salary 5000.' }, req);
  assert.deepEqual(Object.keys(ok.fields), ['about', 'req'], 'a fixed field is never taken from the reply');
  assert.deepEqual(ok.warnings, [{ code: 'unsupported_numbers', numbers: ['5000'] }]);
  const miss = checkPolish({ editable: {}, caption: 'We are hiring a developer.' }, req);
  assert.deepEqual(miss.warnings, [{ code: 'fixed_missing', fields: ['role', 'loc'] }]);
  assert.equal(checkPolish({ editable: {} }, req), null);
});

test('16c POST /content/polish: grounded rewrite, isolation, validation', async () => {
  next = () => reply({ editable: { about: 'Build polished apps.' }, caption: 'MD Labs is hiring a Senior Flutter Developer in Cairo.' });
  const body = { kind: 'hiring', lang: 'en', fields: { role: 'Senior Flutter Developer', loc: 'Cairo', about: 'build apps' }, edit: ['about'] };
  const r = await call('POST', `/api/companies/${md}/content/polish`, alice, body);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.fields.about, 'Build polished apps.');
  assert.deepEqual(b.warnings, []);
  assert.equal((await call('POST', `/api/companies/${bobCo}/content/polish`, alice, body)).status, 404);
  assert.equal((await call('POST', `/api/companies/${md}/content/polish`, alice, { kind: 'x' })).status, 400);
});
