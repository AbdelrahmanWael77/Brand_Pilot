// P1 (2026-11-19): one number per metric and period. For the recorded FlowNest company, the KPIs (metrics — what Home
// and Growth show, computed the same way), the report and the recommendations (Insights) give the same value for the
// same metric and period. The browser half (Home / Growth / Insights on screen) is ui-tests/consistency.ui.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../server/db.js';
import { createKnowledge } from '../server/knowledge.js';
import { createData } from '../server/data.js';
import { metrics } from '../server/metrics.js';
import { audit } from '../server/audit.js';
import { buildReport } from '../server/report.js';

const state = JSON.parse(readFileSync(new URL('./fixtures/flownest/state.json', import.meta.url), 'utf8'));

function flownest() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u', 'u@example.com', 'x', '2026-11-19')").run();
  db.prepare("INSERT INTO companies (id, name, created_by, created_at) VALUES ('c', 'FlowNest', 'u', '2026-11-19')").run();
  createKnowledge(db).mirror('c', state);
  createData(db).mirror('c', state);
  return db;
}
const ev = (items, id, metric, nth = 0) => items.find((x) => x.id === id)?.evidence.filter((e) => e.metric === metric)[nth];

for (const range of ['28', 'all']) {
  test(`FlowNest, ${range === 'all' ? 'all data' : `last ${range} days`}: KPIs, report and recommendations agree on sessions, enquiry rate, leads and engagement rate`, () => {
    const db = flownest();
    const m = metrics(db, 'c', range);
    const rep = buildReport(db, 'c', { range });
    const a = audit(db, 'c', { range });
    const kpi = (id) => rep.kpis.find((k) => k.id === id)?.value;
    // the same period everywhere
    assert.deepEqual({ from: a.period.from, to: a.period.to }, { from: m.period.from, to: m.period.to });
    assert.deepEqual({ from: rep.period.from, to: rep.period.to }, { from: m.period.from, to: m.period.to });
    // 1. sessions
    assert.ok(m.kpis.sessions.value > 0);
    assert.equal(kpi('sessions'), m.kpis.sessions.value);
    // 2. enquiry rate: KPI = report = the site average quoted by the "best channel" recommendation
    assert.equal(kpi('enquiry_rate'), m.kpis.enquiry_rate.value);
    assert.equal(ev(a.items, 'ch-best', 'enquiry_rate', 1).value, m.kpis.enquiry_rate.value);
    // 3. leads: KPI = report = the lead count behind "lead source not recorded"
    assert.equal(kpi('leads'), m.kpis.leads.value);
    assert.equal(ev(a.items, 'src-unknown', 'unknown_source_share').rows, m.kpis.leads.value);
    // 4. engagement rate (engagements ÷ reach): KPIs = the account average quoted by "strongest content theme"
    const er = m.kpis.engagements.value / m.kpis.reach.value;
    assert.ok(Math.abs(ev(a.items, 'theme-best', 'engagement_rate', 1).value - er) < 1e-12);
    // every recommendation states this same period
    for (const x of a.items) assert.deepEqual([x.period.from, x.period.to], [m.period.from, m.period.to], x.id);
    db.close();
  });
}
