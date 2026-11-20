// P6 demo history (owner 2026-11-20): the synthetic FlowNest demo gets 5 earlier steps so its track record can show a
// score. Only with BRANDPILOT_DEMO=1, only for the FlowNest demo company on synthetic data; evaluated by the real code
// and marked demo in the trail. Uses a copy of test/fixtures/pre-p4.db (the synthetic FlowNest demo, fake account).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { DEMO_STEPS, MEASURES } from '../server/track.js';

const copy = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-p6-'));
  const file = path.join(dir, 'brandpilot.db');
  fs.copyFileSync(new URL('./fixtures/pre-p4.db', import.meta.url), file);
  return file;
};

/** Opens a copy with the app (demo on or off), signs in, saves the FlowNest state once (as the demo setup does). */
async function run(demo, edit = (s) => s) {
  const db = openDb(copy());
  const server = createApp({ db, demo }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', password: 'correct horse battery' }) });
  const h = { 'content-type': 'application/json', cookie: login.headers.getSetCookie()[0].split(';')[0] };
  const co = db.prepare('SELECT id FROM companies').get().id;
  const st = (await (await fetch(`${base}/api/companies/${co}/state`, { headers: h })).json()).state;
  assert.equal(st.demo, 'flownest', 'the fixture is the FlowNest demo company');
  const put = await fetch(`${base}/api/companies/${co}/state`, { method: 'PUT', headers: h, body: JSON.stringify({ state: edit(st) }) });
  assert.equal(put.status, 200);
  const record = await (await fetch(`${base}/api/companies/${co}/track`, { headers: h })).json();
  const demoTrail = db.prepare("SELECT kind, detail FROM trail WHERE company_id = ? AND kind IN ('step_tracked', 'evaluation')").all(co).map((r) => ({ kind: r.kind, detail: JSON.parse(r.detail) }));
  return { db, co, record, demoTrail, close: () => { server.close(); db.close(); } };
}

test('demo mode off: no demo history exists, even for the FlowNest demo company', async () => {
  const r = await run(false);
  try {
    assert.deepEqual(r.record.steps, []);
    assert.equal(r.record.demo, false);
    assert.equal(r.record.score, null);
    assert.equal(r.db.prepare('SELECT COUNT(*) n FROM track_steps').get().n, 0);
    assert.deepEqual(r.demoTrail, []);
  } finally { r.close(); }
});

test('demo mode on, but not the FlowNest demo company, or real rows next to the synthetic ones: no demo history', async () => {
  const realGa4 = (s) => ({ ...s, imports: s.imports.map((i) => (i.kind === 'ga4' ? { ...i, origin: 'upload' } : i)) }); // GA4 imported for real
  for (const edit of [(s) => ({ ...s, demo: undefined }), realGa4]) {
    const r = await run(true, edit);
    try {
      assert.equal(r.db.prepare('SELECT COUNT(*) n FROM track_steps WHERE demo = 1').get().n, 0);
      assert.deepEqual(r.record.steps, []);
    } finally { r.close(); }
  }
});

test('demo mode on, FlowNest demo: 5 earlier steps, evaluated by the real code, marked demo in the card data and the trail', async () => {
  const r = await run(true);
  try {
    const steps = r.record.steps;
    assert.equal(steps.length, DEMO_STEPS);
    assert.ok(steps.every((s) => s.demo === true && s.outcome !== null));
    assert.equal(r.record.demo, true);
    assert.equal(r.record.evaluated, 5, 'the synthetic data is large enough: no inconclusive step');
    assert.ok(r.record.score, 'a score from 5 evaluated steps');
    assert.equal(r.record.score.of, 5);
    // not hard-coded: each stored result equals the metric recomputed here from the synthetic rows of its window
    const rows = (kind) => r.db.prepare('SELECT date, row FROM data_rows WHERE company_id = ? AND kind = ?').all(r.co, kind).map((x) => ({ ...JSON.parse(x.row), date: x.date }));
    for (const s of steps) {
      const M = MEASURES[s.metric];
      const inWin = (from, to) => rows(M.kind).filter((x) => x.date >= from && x.date <= to && (!s.scope || x[s.scope.key] === s.scope.value));
      assert.ok(Math.abs(M.value(inWin(s.window[0], s.window[1])) - s.result) < 1e-12, `${s.recId} result`);
      assert.ok(Math.abs(M.value(inWin(s.baselinePeriod[0], s.baselinePeriod[1])) - s.baseline) < 1e-12, `${s.recId} baseline`);
    }
    // every trail row of the demo history says so
    assert.equal(r.demoTrail.filter((t) => t.kind === 'step_tracked').length, 5);
    assert.equal(r.demoTrail.filter((t) => t.kind === 'evaluation').length, 5);
    assert.ok(r.demoTrail.every((t) => t.detail.demo === true));
    // saving again does not add a second demo history
    const again = r.db.prepare('SELECT COUNT(*) n FROM track_steps WHERE demo = 1').get().n;
    assert.equal(again, 5);
  } finally { r.close(); }
});
