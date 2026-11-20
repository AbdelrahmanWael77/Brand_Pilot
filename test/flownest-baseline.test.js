// FlowNest regression baseline (P1 checkpoint 1, 2026-11-19). Browser-free half: the recorded FlowNest company
// (test/fixtures/flownest/state.json) is saved through the normal state route and the server audit must equal the
// recorded one. The browser half (the recommendations every screen shows) is ui-tests/flownest-baseline.ui.mjs.
// Re-recorded after P1 (the pre-P1 baseline is commit fc8a772; every difference is in docs/ui-audit/p1-baseline-diff.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

const read = (f) => JSON.parse(readFileSync(new URL(`./fixtures/flownest/${f}`, import.meta.url), 'utf8'));
const baseline = read('baseline.json');
const state = read('state.json');

test('baseline file: per period, one recommendation list per language, same ids, each with a title, action, evidence and confidence', () => {
  assert.deepEqual(Object.keys(baseline.recs).sort(), ['28', 'all']);
  for (const { en, ar } of Object.values(baseline.recs)) {
  assert.ok(en.length > 0);
  assert.deepEqual(ar.map((x) => x.id), en.map((x) => x.id));
  assert.equal(new Set(en.map((x) => x.id)).size, en.length, 'ids are unique');
  for (const x of en) {
    assert.ok(x.title && x.action, `${x.id}: title and action`);
    assert.ok(Array.isArray(x.ev), `${x.id}: evidence list`);
    assert.ok(['high', 'med', 'low'].includes(x.confidence.level) && x.confidence.why, `${x.id}: confidence and reason`);
  }
  }
});

test('server audit of the recorded FlowNest company equals the baseline', async () => {
  const server = createApp({ db: openDb(':memory:'), ai: { configured: false, model: null, complete: async () => { throw new Error('no AI in this test'); } } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const reg = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'baseline@example.com', password: 'correct horse' }) });
    const cookie = reg.headers.getSetCookie()[0].split(';')[0];
    const h = { 'content-type': 'application/json', cookie };
    const co = await (await fetch(`${base}/api/companies`, { method: 'POST', headers: h, body: JSON.stringify({ name: 'FlowNest' }) })).json();
    const put = await fetch(`${base}/api/companies/${co.company.id}/state`, { method: 'PUT', headers: h, body: JSON.stringify({ state }) });
    assert.equal(put.status, 200);
    const audit = await (await fetch(`${base}/api/companies/${co.company.id}/audit`, { headers: h })).json();
    // fact ids in state.json differ from run to run of the recorder; the evidence is compared by its text
    const stable = JSON.parse(JSON.stringify(audit), (k, v) => (k === 'factId' && typeof v === 'string' ? '<fact>' : v));
    assert.deepEqual(stable, baseline.server);
  } finally {
    server.close();
  }
});
