// P7 (owner 2026-11-22): series approvals are recorded on the server, like campaign approvals, and the server finds the
// flagged lines itself. An AI draft of a series post records what the server flagged (series_draft_check). On approval
// the server runs the same number check on the words it receives and re-checks the draft's claims against the approved
// facts of now; the browser's list can only add lines. A line is cleared when its number is gone from the words or a
// person marked it "It's correct" (claim_check). Otherwise the approval is refused (409) and nothing is recorded.
// English and Arabic; strictly per company. The AI is a stub: no request leaves the machine.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createAi } from '../server/ai.js';
import { unsupportedNumbers, claimsToCheck } from '../server/recs.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let draftReply = {};
const aiFetch = async () => json(200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(draftReply) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });

let server, base, db, alice, bob, co, coB;
const call = (method, path, cookie, body) => fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
const user = async (email) => (await call('POST', '/api/auth/register', null, { email, password: 'correct horse battery' })).headers.getSetCookie()[0].split(';')[0];
const rows = (id, kind) => db.prepare('SELECT * FROM trail WHERE company_id = ? AND kind = ? ORDER BY rowid').all(id, kind).map((r) => ({ ...r, detail: JSON.parse(r.detail) }));
const trailOf = async (id, lang) => (await (await call('GET', `/api/companies/${id}/trail?lang=${lang}`, alice)).json()).trail;
const fact = (id, text) => ({ id, cat: 'products', text, type: 'fact', status: 'approved', src: 'web', ev: 'Quote: ' + text, needs: false, date: '2026-11-14' });

const POSTS = {
  en: { sid: 'ser-en', name: 'Team tips', topic: 'Follow up in 2 days', headline: 'Follow up within 2 days', caption: 'Teams that follow up within 2 days close 40% more deals. FlowNest is the fastest tool.', num: '40', claim: 'FlowNest is the fastest tool.' },
  ar: { sid: 'ser-ar', name: 'نصائح الفريق', topic: 'المتابعة خلال 2 يوم', headline: 'تابع خلال 2 يوم', caption: 'الفرق التي تتابع خلال 2 يوم تغلق 40% صفقات أكثر. FlowNest هي أسرع أداة.', num: '40', claim: 'FlowNest هي أسرع أداة.' },
};

before(async () => {
  db = openDb(':memory:');
  server = createApp({ db, ai: createAi({ apiKey: 'test-key-never-real', fetch: aiFetch, maxRetries: 0 }), askLimit: { max: 1000, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await user('alice@example.com');
  bob = await user('bob@example.com');
  co = (await (await call('POST', '/api/companies', alice, { name: 'Alice Co' })).json()).company.id;
  coB = (await (await call('POST', '/api/companies', bob, { name: 'Bob Co' })).json()).company.id;
  // one approved fact, which is copied word for word in a claim the AI lists (that claim needs no check)
  const state = { sources: [{ id: 'web', title: 'web', kind: 'document', text: 'x', date: '2026-11-14', demo: false }], findings: [fact('f1', 'FlowNest serves small sales teams.')], data: {}, imports: [], series: [{ id: 'ser-en', name: 'Team tips' }] };
  // the English series has reached the server's copy; the Arabic one is named by the browser
  assert.equal((await call('PUT', `/api/companies/${co}/state`, alice, { state })).status, 200);
});
after(() => { server.close(); db.close(); });

test('the shared checks: unsupported numbers and claims to check (the draft and the approval use the same code)', () => {
  assert.deepEqual(unsupportedNumbers(['Close 40% more in 2 days', 'since 2015'], 'in 2 days', [{ text: 'Founded in 2015' }]), ['40']);
  assert.deepEqual(claimsToCheck(['FlowNest serves small sales teams.', 'FlowNest is the fastest tool.'], [{ text: 'FlowNest serves small sales teams.' }]), ['FlowNest is the fastest tool.']);
});

for (const lang of ['en', 'ar']) {
  const P = POSTS[lang];
  const approve = (flags, { caption = P.caption, topic = P.topic, cookie = alice, company = co } = {}) => call('POST', `/api/companies/${company}/series/${P.sid}/approve`, cookie, { name: P.name, topic, lang, post: { headline: P.headline, caption, words: P.headline + '\n' + caption }, flags });
  const openOf = async (r) => { assert.equal(r.status, 409); return (await r.json()).open; };

  test(`series (${lang}): the server finds the flagged lines itself; an incomplete or false list from the browser is refused`, async () => {
    // an AI draft for this series: the server records what it flagged
    draftReply = { headline: P.headline, caption: P.caption, points: [], hashtags: [], visual: 'v', claims: [P.claim, 'FlowNest serves small sales teams.'] };
    let r = await call('POST', `/api/companies/${co}/recs/draft`, alice, { sid: P.sid, series: { name: P.name }, topic: P.topic, lang });
    assert.equal(r.status, 200);
    const dc = rows(co, 'series_draft_check').filter((x) => x.subject === P.sid).at(-1);
    assert.deepEqual([dc.detail.numbers, dc.detail.claims], [[P.num], [P.claim]], '2 is in the topic; the other claim is an approved fact');

    // the browser sends an incomplete list (nothing flagged): the server still refuses, with its own list
    assert.deepEqual(await openOf(await approve([])), [{ kind: 'number', text: P.num }, { kind: 'claim', text: P.claim }]);
    // the browser says the number is fixed and the claim checked: neither is true
    assert.deepEqual(await openOf(await approve([{ kind: 'number', text: P.num, state: 'fixed' }, { kind: 'claim', text: P.claim, state: 'checked' }])), [{ kind: 'number', text: P.num }, { kind: 'claim', text: P.claim }]);
    // a topic that names the number does not clear it: the server uses the topic of its own draft
    assert.deepEqual(await openOf(await approve([], { topic: P.topic + ' 40' })), [{ kind: 'number', text: P.num }, { kind: 'claim', text: P.claim }]);
    // a number added after the draft is found too
    assert.deepEqual((await openOf(await approve([], { caption: P.caption + ' 99' }))).map((x) => x.text), [P.num, '99', P.claim]);
    assert.equal(rows(co, 'series_approval').filter((x) => x.subject === P.sid).length, 0, 'nothing recorded while refused');

    // "It's correct" on the claim: recorded with who, when and the line
    r = await call('POST', `/api/companies/${co}/series/${P.sid}/flag-ok`, alice, { name: P.name, topic: P.topic, lang, flag: { kind: 'claim', text: P.claim } });
    assert.equal(r.status, 201);
    const okId = (await r.json()).trailId;
    const ok = rows(co, 'claim_check').find((x) => x.id === okId);
    assert.equal(ok.subject, P.sid);
    assert.equal(ok.user_email, 'alice@example.com');
    assert.ok(!Number.isNaN(Date.parse(ok.at)));
    assert.deepEqual(ok.detail, { series: P.name, topic: P.topic, lang, flagKind: 'claim', text: P.claim, mirrored: lang === 'en' });
    // the number is still in the words: still refused, even with an empty list from the browser
    assert.deepEqual(await openOf(await approve([])), [{ kind: 'number', text: P.num }]);

    // the number taken out of the words: approved and recorded, with the server's own list
    const fixed = P.caption.replace(' 40%', '');
    r = await approve([], { caption: fixed });
    assert.equal(r.status, 201);
    const apId = (await r.json()).trailId;
    const ap = rows(co, 'series_approval').find((x) => x.id === apId);
    assert.equal(ap.subject, P.sid);
    assert.equal(ap.user_email, 'alice@example.com');
    assert.equal(ap.detail.series, P.name);
    assert.equal(ap.detail.headline, P.headline);
    assert.equal(ap.detail.caption, fixed);
    assert.deepEqual(ap.detail.flags, [{ kind: 'claim', text: P.claim, check: okId }]);

    // readable in the trail, in both languages
    const en = (await trailOf(co, 'en')).find((x) => x.id === apId), ar = (await trailOf(co, 'ar')).find((x) => x.id === apId);
    assert.equal(en.summary, `Series post approved (${P.name}): ${P.topic}`);
    assert.equal(ar.summary, `اعتُمد منشور في السلسلة (${P.name}): ${P.topic}`);
    assert.equal(en.by, 'alice@example.com');
    assert.equal((await trailOf(co, 'en')).find((x) => x.id === okId).summary, `Flagged statement confirmed as correct (${P.name}): “${P.claim}”`);
    assert.equal((await trailOf(co, 'ar')).find((x) => x.id === okId).summary, `أُكّدت صحة عبارة مُعلَّمة (${P.name}): «${P.claim}»`);
    assert.equal((await trailOf(co, 'en')).find((x) => x.id === dc.id).summary, `Series draft checked (${P.name}): 1 number(s) and 1 statement(s) to check`);
  });
}

test('series approvals: after an approval the old draft no longer applies; bad requests and other companies are refused', async () => {
  const P = POSTS.en;
  // the draft was consumed by the approval: a new post with no numbers and no claims is approved
  let r = await call('POST', `/api/companies/${co}/series/${P.sid}/approve`, alice, { name: P.name, topic: 'Plain post', lang: 'en', post: { headline: 'Hello', caption: 'No numbers here.' }, flags: [] });
  assert.equal(r.status, 201);
  // without any draft, the number check still runs on the words received
  r = await call('POST', `/api/companies/${co}/series/${P.sid}/approve`, alice, { name: P.name, topic: '5 tips', post: { headline: '5 tips', caption: 'Read them.' }, flags: [] });
  assert.deepEqual((await r.json()).open, [{ kind: 'number', text: '5' }]);
  // no words, a flag without text, no series name
  assert.equal((await call('POST', `/api/companies/${co}/series/${P.sid}/approve`, alice, { name: P.name, post: {}, flags: [] })).status, 400);
  assert.equal((await call('POST', `/api/companies/${co}/series/${P.sid}/flag-ok`, alice, { name: P.name, flag: { kind: 'claim', text: '' } })).status, 400);
  assert.equal((await call('POST', `/api/companies/${co}/series/unknown/flag-ok`, alice, { flag: { kind: 'claim', text: 'x' } })).status, 404);
  // a claim confirmed in one series does not clear it in another
  assert.equal((await call('POST', `/api/companies/${co}/series/ser-other/approve`, alice, { name: 'Other', topic: 't', post: { headline: 'h', caption: P.claim }, flags: [{ kind: 'claim', text: P.claim, state: 'checked' }] })).status, 409);
  // Bob cannot record anything for Alice's company, and his company has no rows of hers
  assert.equal((await call('POST', `/api/companies/${co}/series/${P.sid}/flag-ok`, bob, { name: P.name, flag: { kind: 'claim', text: P.claim } })).status, 404);
  assert.equal((await call('POST', `/api/companies/${co}/series/${P.sid}/approve`, bob, { name: P.name, post: { headline: 'h', caption: 'c' }, flags: [] })).status, 404);
  assert.equal(rows(coB, 'series_approval').length + rows(coB, 'claim_check').length, 0);
});
