// Demo-only expiry control (owner 2026-11-20): with BRANDPILOT_DEMO=1 a tester can put an approved fact past its review
// date from the page; without it the route does not exist and the page shows no button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

async function start(demo) {
  const server = createApp({ db: openDb(':memory:'), demo }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, cookie, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const user = async (email) => (await call('POST', '/api/auth/register', '', { email, password: 'correct horse battery' })).headers.getSetCookie()[0].split(';')[0];
  const alice = await user('alice@example.com');
  const bob = await user('bob@example.com');
  const co = (await (await call('POST', '/api/companies', alice, { name: 'Demo Co' })).json()).company.id;
  const f = (id, status) => ({ id, cat: 'offers', text: `Fact ${id}`, type: 'fact', status, src: null, ev: `Quote ${id}`, needs: false, date: '2026-11-01' });
  await call('PUT', `/api/companies/${co}/state`, alice, { state: { sources: [], findings: [f('f1', 'pending'), f('f2', 'pending')] } });
  await call('POST', `/api/companies/${co}/facts/decisions`, alice, { decisions: [{ id: 'f1', status: 'approved' }] });
  return { server, call, alice, bob, co };
}
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

test('without demo mode the route does not exist', async () => {
  const { server, call, alice, co } = await start(false);
  try {
    assert.equal((await call('POST', `/api/companies/${co}/facts/f1/demo-expire`, alice)).status, 404);
  } finally { server.close(); }
});

test('with demo mode: an approved fact gets yesterday as its review date (expired); re-approval brings it back', async () => {
  const { server, call, alice, bob, co } = await start(true);
  try {
    const r = await call('POST', `/api/companies/${co}/facts/f1/demo-expire`, alice);
    assert.equal(r.status, 200);
    const { fact } = await r.json();
    assert.equal(fact.status, 'expired');
    assert.equal(fact.approval.reviewBy, yesterday);
    assert.equal((await call('POST', `/api/companies/${co}/facts/f2/demo-expire`, alice)).status, 409, 'not approved: nothing to expire');
    assert.equal((await call('POST', `/api/companies/${co}/facts/nope/demo-expire`, alice)).status, 404);
    assert.equal((await call('POST', `/api/companies/${co}/facts/f1/demo-expire`, bob)).status, 404, 'not a member');
    const later = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    await call('POST', `/api/companies/${co}/facts/decisions`, alice, { decisions: [{ id: 'f1', status: 'approved', reviewBy: later }] });
    const all = await (await call('GET', `/api/companies/${co}/facts`, alice)).json();
    assert.equal(all.facts.find((x) => x.id === 'f1').status, 'approved');
  } finally { server.close(); }
});

test('page: the button exists only in demo mode', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('return h&&demoOn()&&s&&s.approval&&s.status===\'approved\'?h+`<p class="kap" data-demo-expire>'));
  assert.ok(html.includes('async kDemoExpire(id){if(!demoOn())return;'));
});
