// P7 (owner 2026-11-22): series approvals are recorded on the server, like campaign approvals. A flagged line marked
// "It's correct" is a claim_check row (who, when, which line); a series post approval is a series_approval row, refused
// (409, nothing recorded) while a flagged line is not cleared. Both readable in the trail in English and Arabic, and
// strictly per company.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

let server, base, db, alice, bob, co, coB;
const call = (method, path, cookie, body) => fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
const user = async (email) => (await call('POST', '/api/auth/register', null, { email, password: 'correct horse battery' })).headers.getSetCookie()[0].split(';')[0];
const rows = (id, kind) => db.prepare('SELECT * FROM trail WHERE company_id = ? AND kind = ? ORDER BY rowid').all(id, kind).map((r) => ({ ...r, detail: JSON.parse(r.detail) }));
const trailOf = async (id, lang) => (await (await call('GET', `/api/companies/${id}/trail?lang=${lang}`, alice)).json()).trail;

const POSTS = {
  en: { sid: 'ser-en', name: 'Team tips', topic: 'Follow-ups', headline: 'Follow up within 2 days', caption: 'Teams that follow up within 2 days close 40% more deals. FlowNest is the fastest tool.', num: '40', claim: 'FlowNest is the fastest tool.' },
  ar: { sid: 'ser-ar', name: 'نصائح الفريق', topic: 'المتابعة', headline: 'تابع خلال يومين', caption: 'الفرق التي تتابع خلال يومين تغلق 40% صفقات أكثر. FlowNest هي أسرع أداة.', num: '40', claim: 'FlowNest هي أسرع أداة.' },
};

before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await user('alice@example.com');
  bob = await user('bob@example.com');
  co = (await (await call('POST', '/api/companies', alice, { name: 'Alice Co' })).json()).company.id;
  coB = (await (await call('POST', '/api/companies', bob, { name: 'Bob Co' })).json()).company.id;
  // the English series has reached the server's copy; the Arabic one is named by the browser
  assert.equal((await call('PUT', `/api/companies/${co}/state`, alice, { state: { series: [{ id: 'ser-en', name: 'Team tips' }] } })).status, 200);
});
after(() => { server.close(); db.close(); });

for (const lang of ['en', 'ar']) {
  const P = POSTS[lang];
  const approve = (flags, caption = P.caption, cookie = alice, company = co) => call('POST', `/api/companies/${company}/series/${P.sid}/approve`, cookie, { name: P.name, topic: P.topic, lang, post: { headline: P.headline, caption, words: P.headline + '\n' + caption }, flags });

  test(`series (${lang}): "It's correct" is recorded with who, when and the line; approval waits until every flagged line is cleared`, async () => {
    const flags = [{ kind: 'number', text: P.num, state: 'open' }, { kind: 'claim', text: P.claim, state: 'open' }];
    // nothing cleared: refused, nothing recorded
    let r = await approve(flags);
    assert.equal(r.status, 409);
    assert.deepEqual((await r.json()).flags, [P.num, P.claim]);
    // the browser cannot clear a claim by saying so: "checked" needs the server's record of "It's correct"
    r = await approve([{ kind: 'number', text: P.num, state: 'fixed' }, { kind: 'claim', text: P.claim, state: 'checked' }]);
    assert.equal(r.status, 409, 'the number is still in the words and the claim was never confirmed');
    assert.equal(rows(co, 'series_approval').filter((x) => x.subject === P.sid).length, 0);

    // "It's correct" on the claim
    r = await call('POST', `/api/companies/${co}/series/${P.sid}/flag-ok`, alice, { name: P.name, topic: P.topic, lang, flag: { kind: 'claim', text: P.claim } });
    assert.equal(r.status, 201);
    const okId = (await r.json()).trailId;
    const ok = rows(co, 'claim_check').find((x) => x.id === okId);
    assert.equal(ok.subject, P.sid);
    assert.equal(ok.user_email, 'alice@example.com');
    assert.ok(!Number.isNaN(Date.parse(ok.at)));
    assert.deepEqual(ok.detail, { series: P.name, topic: P.topic, lang, flagKind: 'claim', text: P.claim, mirrored: lang === 'en' });

    // the number is still in the words: still refused
    r = await approve([{ kind: 'number', text: P.num, state: 'fixed' }, { kind: 'claim', text: P.claim, state: 'checked' }]);
    assert.equal(r.status, 409);
    assert.deepEqual((await r.json()).flags, [P.num]);

    // the number taken out of the words: approved and recorded
    const fixed = P.caption.replace(' 40%', '');
    r = await approve([{ kind: 'number', text: P.num, state: 'fixed' }, { kind: 'claim', text: P.claim, state: 'checked' }], fixed);
    assert.equal(r.status, 201);
    const apId = (await r.json()).trailId;
    const ap = rows(co, 'series_approval').find((x) => x.id === apId);
    assert.equal(ap.subject, P.sid);
    assert.equal(ap.user_email, 'alice@example.com');
    assert.equal(ap.detail.series, P.name);
    assert.equal(ap.detail.topic, P.topic);
    assert.equal(ap.detail.lang, lang);
    assert.equal(ap.detail.headline, P.headline);
    assert.equal(ap.detail.caption, fixed);
    assert.deepEqual(ap.detail.flags, [{ kind: 'number', text: P.num, state: 'fixed', check: null }, { kind: 'claim', text: P.claim, state: 'checked', check: okId }]);

    // readable in the trail, in both languages
    const en = (await trailOf(co, 'en')).find((x) => x.id === apId), ar = (await trailOf(co, 'ar')).find((x) => x.id === apId);
    assert.equal(en.summary, `Series post approved (${P.name}): ${P.topic}`);
    assert.equal(ar.summary, `اعتُمد منشور في السلسلة (${P.name}): ${P.topic}`);
    assert.equal(en.by, 'alice@example.com');
    assert.equal((await trailOf(co, 'en')).find((x) => x.id === okId).summary, `Flagged statement confirmed as correct (${P.name}): “${P.claim}”`);
    assert.equal((await trailOf(co, 'ar')).find((x) => x.id === okId).summary, `أُكّدت صحة عبارة مُعلَّمة (${P.name}): «${P.claim}»`);
  });
}

test('series approvals: a post with no flagged line is approved and recorded; bad requests and other companies are refused', async () => {
  const P = POSTS.en;
  let r = await call('POST', `/api/companies/${co}/series/${P.sid}/approve`, alice, { name: P.name, topic: 'Plain post', lang: 'en', post: { headline: 'Hello', caption: 'No numbers here.' }, flags: [] });
  assert.equal(r.status, 201);
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
