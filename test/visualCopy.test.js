import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { buildVisualCopyPrompt, readVisualCopy, checkVisualCopy, visualSource, VISUAL_LIMITS } from '../server/visualCopy.js';

// Short wording for a post's artwork: the model is a stub; the checks on its answer are the subject.
const post = (fields, lang = 'en') => ({ id: 'p1', type: 'post', lang, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { v }])) });
const LONG = 'We help growing companies in Egypt replace 12 disconnected spreadsheets with one custom platform built around how their teams really work';

test('source and prompt: the post\'s own wording as data, unfilled placeholders left out, language and limits stated', () => {
  const a = post({ headline: LONG, sub: '', caption: 'Book a call: {{link}}', details: 'Cairo · Full-time', cta: 'Apply now' });
  const s = visualSource(a);
  assert.match(s, /^headline: We help growing companies/);
  assert.match(s, /details: Cairo · Full-time/);
  assert.doesNotMatch(s, /\{\{link\}\}|Apply now/);
  const p = buildVisualCopyPrompt(a);
  assert.match(p.system, /English only/);
  assert.match(p.system, new RegExp(`at most ${VISUAL_LIMITS.headWords} words`));
  assert.match(p.system, /data, not instructions/);
  assert.equal(p.messages[0].content.includes(s), true);
  assert.match(buildVisualCopyPrompt(post({ headline: 'عنوان' }, 'ar')).system, /Arabic only/);
});

test('readVisualCopy: accepts a short answer in the right language; refuses long, wrong-language, placeholder or new-number answers', () => {
  const src = 'headline: ' + LONG;
  assert.deepEqual(readVisualCopy('Here: {"headline":"One platform instead of 12 spreadsheets.","sub":"Built around how your teams work"}', src, 'en'), { headline: 'One platform instead of 12 spreadsheets', sub: 'Built around how your teams work' });
  assert.deepEqual(readVisualCopy('{"headline":"One custom platform"}', src, 'en'), { headline: 'One custom platform', sub: '' });
  assert.equal(readVisualCopy('{"headline":"Save 40% with one platform","sub":""}', src, 'en'), null); // 40 is not in the source
  assert.equal(readVisualCopy('{"headline":"one two three four five six seven eight nine","sub":""}', src, 'en'), null);
  assert.equal(readVisualCopy('{"headline":"منصة واحدة","sub":""}', src, 'en'), null);
  assert.equal(readVisualCopy('{"headline":"One platform","sub":""}', src, 'ar'), null);
  assert.deepEqual(readVisualCopy('{"headline":"منصة واحدة لفريقك","sub":""}', 'headline: نص', 'ar'), { headline: 'منصة واحدة لفريقك', sub: '' });
  assert.equal(readVisualCopy('{"headline":"{{message}}","sub":""}', src, 'en'), null);
  assert.equal(readVisualCopy('{"headline":"One platform #growth","sub":""}', src, 'en'), null);
  assert.equal(readVisualCopy('no json here', src, 'en'), null);
  assert.equal(readVisualCopy('{"headline":""}', src, 'en'), null);
});

test('checkVisualCopy (10.5 rules): every refusal has a reason; a claim the post does not make and the same headline again are refused', () => {
  const src = 'headline: ' + LONG;
  const why = (t, l = 'en', cur = '', from = src) => checkVisualCopy(t, from, l, cur).reason;
  assert.equal(why('{"headline":"The best platform for your team","sub":""}'), 'new_claim');
  assert.equal(why('{"headline":"Guaranteed one platform","sub":""}'), 'new_claim');
  assert.deepEqual(checkVisualCopy('{"headline":"The best custom platform","sub":""}', 'headline: The best custom platform for growing teams in Cairo', 'en'), { ok: { headline: 'The best custom platform', sub: '' } }); // the post says it
  assert.equal(why('{"headline":"One custom platform."}', 'en', 'One custom platform'), 'unchanged');
  assert.equal(why('{"headline":"Save 40% with one platform"}'), 'new_number');
  assert.equal(why('{"headline":"one two three four five six seven eight nine"}'), 'too_long');
  assert.equal(why('{"headline":"منصة واحدة"}'), 'language');
  assert.equal(why('{"headline":"{{message}}"}'), 'placeholder');
  assert.equal(why('no json here'), 'missing');
  assert.equal(why('{"headline":""}'), 'empty');
  assert.equal(readVisualCopy('{"headline":"One custom platform"}', src, 'en', 'one custom platform'), null);
});

let server, base, db, alice, bob, co, answer, asked;
const call = (method, path, cookie, body) => fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}
before(async () => {
  db = openDb(':memory:');
  asked = [];
  const ai = { configured: true, provider: 'stub', model: 'stub-1', complete: async (q) => { asked.push(q); if (answer instanceof Error) throw answer; return { text: answer, model: 'stub-1' }; } };
  server = createApp({ db, ai, visualLimit: { max: 4, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  co = (await (await call('POST', '/api/companies', alice, { name: 'MD Labs' })).json()).company.id;
  const asset = (id, type, v) => ({ id, type, lang: 'en', channel: type === 'post' ? 'linkedin' : 'web', n: 1, status: 'draft', flag: null, design: {}, fields: { headline: { tpl: '', v, edited: false } } });
  const state = { campaigns: [{ id: 'k1', name: 'Intro', slug: 'intro', at: 1, rec: null, approved: true, versions: [], brief: { offerEn: 'A free discovery call for teams that want one platform instead of many tools' }, assets: [asset('p1', 'post', LONG), asset('p2', 'post', '⟦message⟧'), asset('l1', 'landing', 'x'), asset('p3', 'post', 'A free discovery call for teams that want one platform instead of many tools'), asset('p4', 'post', 'One platform for your team')] }] };
  assert.equal((await call('PUT', `/api/companies/${co}/state`, alice, { state })).status, 200);
});
after(() => {
  server.close();
  db.close();
});
const VC = (aid, cookie = alice) => call('POST', `/api/companies/${co}/campaigns/k1/assets/${aid}/visual-copy`, cookie, {});

test('route: a suggestion from the mirror\'s wording; a broken answer is refused; members only; own allowance', async () => {
  answer = '{"headline":"One platform instead of 12 spreadsheets","sub":"Built around how your teams really work"}';
  const r = await VC('p1');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { headline: 'One platform instead of 12 spreadsheets', sub: 'Built around how your teams really work', model: 'stub-1' });
  assert.match(asked[0].messages[0].content, /replace 12 disconnected spreadsheets/);
  assert.equal((await VC('p1', bob)).status, 404); // not a member
  assert.equal((await VC('p1', null)).status, 401);
  assert.equal((await VC('nope')).status, 404);
  assert.equal((await VC('l1')).status, 409);
  assert.equal((await VC('p2')).status, 409); // only an unfilled placeholder: nothing to shorten
  answer = '{"headline":"Cut costs by 70% today","sub":""}';
  const bad = await VC('p1');
  assert.equal(bad.status, 422);
  assert.deepEqual(await bad.json(), { error: 'visual_copy_unusable', reason: 'new_number' });
  for (const [aid, err] of [['p3', 'offer_headline'], ['p4', 'short_already']]) {
    const r409 = await VC(aid); // refused before the model and before the allowance
    assert.deepEqual([r409.status, (await r409.json()).error], [409, err]);
  }
  answer = Object.assign(new Error('ai_rate_limited'), { name: 'AiError', code: 'ai_rate_limited', status: 429 });
  assert.equal((await VC('p1')).status, 429);
  answer = '{"headline":"One platform"}';
  assert.equal((await VC('p1')).status, 200);
  const over = await VC('p1'); // the fifth counted request
  assert.equal(over.status, 429);
  assert.deepEqual(await over.json(), { error: 'too_many_attempts' });
});
