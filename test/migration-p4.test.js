// P4 migration on a database WITH existing data: test/fixtures/pre-p4.db was written by the code before P4
// (scripts/make-pre-p4-db.mjs on commit 6dce193): one user, FlowNest with 51 facts (44 approved in the browser state),
// 2,559 data rows, a campaign and a saved report. A copy is opened with the P4 code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createKnowledge } from '../server/knowledge.js';
import { createCampaigns } from '../server/campaigns.js';
import { createReports } from '../server/reports.js';
import { audit } from '../server/audit.js';
import { createApp } from '../server/app.js';

const SRC = new URL('./fixtures/pre-p4.db', import.meta.url);
const copy = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-p4-'));
  const file = path.join(dir, 'brandpilot.db');
  fs.copyFileSync(SRC, file);
  return file;
};
const counts = (d) => Object.fromEntries(['users', 'companies', 'facts', 'data_rows', 'campaigns', 'campaign_assets', 'reports', 'company_state'].map((t) => [t, d.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));

test('the fixture really is pre-P4 (no approvals table, no new columns)', () => {
  const d = new DatabaseSync(SRC.pathname.replace(/^\/([A-Za-z]:)/, '$1'), { readOnly: true });
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'fact_approvals'").get().n, 0);
  assert.ok(!d.prepare('PRAGMA table_info(company_settings)').all().some((c) => c.name === 'approvals_since'));
  assert.ok(!d.prepare('PRAGMA table_info(campaigns)').all().some((c) => c.name === 'fact_ids'));
  d.close();
});

test('opening a copy with the P4 code adds the table and columns and keeps every row', () => {
  const file = copy();
  const old = new DatabaseSync(file);
  const before = counts(old);
  old.close();
  const db = openDb(file);
  assert.deepEqual(counts(db), before);
  assert.deepEqual(before, { users: 1, companies: 1, facts: 51, data_rows: 2559, campaigns: 1, campaign_assets: 1, reports: 1, company_state: 1 });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'fact_approvals'").get().n, 1);
  for (const [t, c] of [['company_settings', 'approvals_since'], ['campaigns', 'fact_ids']]) assert.ok(db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c), `${t}.${c}`);
  db.close();
  // opening it a second time changes nothing
  const again = openDb(file);
  assert.deepEqual(counts(again), before);
  again.close();
});

test('existing approvals keep counting; the first decision marks them "approved before tracking began"', () => {
  const db = openDb(copy());
  const co = db.prepare('SELECT id FROM companies').get().id;
  const uid = db.prepare('SELECT id FROM users').get().id;
  const k = createKnowledge(db);
  assert.equal(k.tracked(co), false);
  assert.equal(k.approvedFacts(co).length, 44, 'untracked: the 44 approvals from before P4 count');
  const auditBefore = audit(db, co).items.map((x) => x.id);
  // the old campaign: no fact ids recorded, read as an empty list
  const camp = createCampaigns(db).get(co, 'k-legacy');
  assert.deepEqual(camp.factIds, []);
  // the saved report is untouched
  const rep = createReports(db).list(co);
  assert.equal(rep.length, 1);
  // a person approves one more fact (one with evidence): tracking starts
  const pending = k.listFacts(co, 'pending').find((f) => f.ev.trim());
  db.exec('BEGIN');
  const r = k.decide(co, uid, [{ id: pending.id, status: 'approved' }]);
  db.exec('COMMIT');
  assert.equal(r[0].fact.approval.by, 'owner@example.com');
  assert.equal(k.tracked(co), true);
  const approved = k.approvedFacts(co);
  assert.equal(approved.length, 45);
  assert.equal(approved.filter((f) => f.approval.legacy).length, 44, 'the 44 earlier ones: before tracking began');
  assert.ok(approved.filter((f) => f.approval.legacy).every((f) => f.approval.by === null && f.approval.at === null && f.approval.reviewBy === null));
  // the audit still works on the migrated data and keeps every earlier recommendation
  const auditAfter = audit(db, co).items.map((x) => x.id);
  for (const id of auditBefore) assert.ok(auditAfter.includes(id), id);
  db.close();
});

test('the migrated database works through the app: sign in, read facts, save the state again', async () => {
  const db = openDb(copy());
  const co = db.prepare('SELECT id FROM companies').get().id;
  const server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', password: 'correct horse battery' }) });
    assert.equal(login.status, 200);
    const h = { 'content-type': 'application/json', cookie: login.headers.getSetCookie()[0].split(';')[0] };
    const f = await (await fetch(`${base}/api/companies/${co}/facts?status=approved`, { headers: h })).json();
    assert.equal(f.facts.length, 44);
    // the company's own stored state, saved again: nothing is duplicated or lost
    const st = await (await fetch(`${base}/api/companies/${co}/state`, { headers: h })).json();
    const put = await fetch(`${base}/api/companies/${co}/state`, { method: 'PUT', headers: h, body: JSON.stringify({ state: st.state }) });
    assert.equal(put.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM facts WHERE company_id = ?').get(co).n, 51);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM data_rows WHERE company_id = ?').get(co).n, 2559);
    const rep = await (await fetch(`${base}/api/companies/${co}/reports`, { headers: h })).json();
    assert.equal(rep.reports.length, 1);
    const one = await fetch(`${base}/api/companies/${co}/reports/${rep.reports[0].id}`, { headers: h });
    assert.equal(one.status, 200, 'the report saved before P4 still opens');
  } finally {
    server.close();
    db.close();
  }
});
