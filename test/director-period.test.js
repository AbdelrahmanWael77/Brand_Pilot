// P3-pre (2026-11-20): the AI Director uses the same period as the screens. For the recorded FlowNest company and each
// period (7, 28, 90 days, all data) the Director's context carries exactly the KPIs, recommendations and channel numbers
// the screens show for that period, and an answer that cites a KPI is checked against that same period.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../server/db.js';
import { createKnowledge } from '../server/knowledge.js';
import { createData } from '../server/data.js';
import { metrics } from '../server/metrics.js';
import { audit } from '../server/audit.js';
import { buildContext, buildPrompt, ask } from '../server/director.js';

const state = JSON.parse(readFileSync(new URL('./fixtures/flownest/state.json', import.meta.url), 'utf8'));
function flownest() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u', 'u@example.com', 'x', '2026-11-20')").run();
  db.prepare("INSERT INTO companies (id, name, created_by, created_at) VALUES ('c', 'FlowNest', 'u', '2026-11-20')").run();
  createKnowledge(db).mirror('c', state);
  createData(db).mirror('c', state);
  return db;
}

for (const range of ['7', '28', '90', 'all']) {
  test(`Director context, ${range === 'all' ? 'all data' : `last ${range} days`}: the same period, KPIs and recommendations as the screens`, () => {
    const db = flownest();
    const ctx = buildContext(db, 'c', { range });
    const m = metrics(db, 'c', range);
    const a = audit(db, 'c', { range });
    assert.equal(ctx.metrics.range, range);
    assert.deepEqual(ctx.metrics.period, m.period);
    assert.deepEqual(ctx.audit.period, a.period);
    for (const [k, v] of Object.entries(m.kpis)) assert.equal(ctx.metrics.kpis[k].value, v.value, `${range} ${k}`);
    assert.deepEqual(ctx.audit.items.map((x) => x.id), a.items.map((x) => x.id), `${range}: the same recommendations`);
    if (ctx.channels) assert.equal(ctx.channels.range, range, `${range}: channel comparison`);
    db.close();
  });

  test(`Director answer, ${range === 'all' ? 'all data' : `last ${range} days`}: a cited KPI is the value for that period`, async () => {
    const db = flownest();
    let sent = null;
    const ai = { configured: true, model: 'stub', complete: async (p) => { sent = p; return { text: JSON.stringify({ answer: 'Sessions are shown.', support: [{ type: 'metric', id: 'sessions' }], insufficient: false, next: [] }), model: 'stub', truncated: false }; } };
    const r = await ask(db, ai, 'c', { question: 'How many sessions?', lang: 'en', range });
    const m = metrics(db, 'c', range);
    assert.equal(r.support[0].text, `sessions: ${m.kpis.sessions.value}`);
    // the model is told which period the numbers cover
    assert.match(sent.system, /Every number in <context> covers one period: metrics\.period/);
    assert.ok(sent.messages[0].content.includes(`"range":"${range}"`), 'the context sent is the one for this period');
    db.close();
  });
}

test('the prompt names the period rule; an unknown range falls back to the screens\' default (28 days)', () => {
  const db = flownest();
  assert.equal(buildContext(db, 'c', { range: '365' }).metrics.range, '28');
  assert.match(buildPrompt(buildContext(db, 'c'), 'q', 'en').system, /do not present it as a total for another period/);
  db.close();
});
