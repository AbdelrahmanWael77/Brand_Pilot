// P1 (2026-11-19): one number per metric and period, on screen. For the FlowNest demo company, Home (KPI cards),
// Growth (funnel) and Insights (the recommendations' evidence) show the same value as the server's metrics and the
// report for sessions, enquiry rate, leads and engagement rate — for the last 28 days and for all data.
// Run: npm run test:ui (needs Google Chrome). The browser-free half is test/consistency.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

test('Home, Growth, Insights, the server metrics and the report agree for the same period (4 metrics, 2 periods)', { timeout: 240_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    for (const range of ['28', 'all']) {
      const r = await page.evaluate(async (range) => {
        S.ui.range = range;
        S.lang = 'en';
        const c = C();
        const view = async (v) => { A.go(v); for (let i = 0; i < 200 && !recsGet(c).ok; i++) await new Promise((x) => setTimeout(x, 50)); await new Promise((x) => setTimeout(x, 100)); return document.querySelector('main').textContent; }; // textContent: the evidence sits in the collapsed Why? panel
        const get = async (p) => (await fetch(`/api/companies/${c.id}${p}`)).json();
        const P = periods(c);
        const a = agg(c, P.cur); // what Home's KPI cards and Growth's funnel are computed from
        const home = await view('dash');
        const growth = await view('growth');
        const insights = await view('audit');
        const m = await get(`/metrics?range=${range}`);
        const rep = await get(`/report?range=${range}`);
        const items = recsGet(c).items; // what Insights lists (the server's recommendations)
        const ev = (id, metric, nth) => (items.find((x) => x.id === id)?.evidence || []).filter((e) => e.metric === metric)[nth];
        const kpi = (id) => rep.kpis.find((k) => k.id === id)?.value;
        return {
          period: { screen: P.cur, metrics: [m.period.from, m.period.to], report: [rep.period.from, rep.period.to], insights: items[0] && [items[0].period.from, items[0].period.to] },
          sessions: { screen: a.sessions, metrics: m.kpis.sessions.value, report: kpi('sessions') },
          enquiryRate: { screen: a.enq / a.sessions, metrics: m.kpis.enquiry_rate.value, report: kpi('enquiry_rate'), insights: ev('ch-best', 'enquiry_rate', 1)?.value },
          leads: { screen: a.leads, metrics: m.kpis.leads.value, report: kpi('leads'), insights: ev('src-unknown', 'unknown_source_share', 0)?.rows },
          engagementRate: { screen: a.eng / a.reach, metrics: m.kpis.engagements.value / m.kpis.reach.value, insights: ev('theme-best', 'engagement_rate', 1)?.value },
          // what the user actually reads, formatted by the page
          shown: {
            homeSessions: home.includes(fmt(m.kpis.sessions.value)),
            growthRate: growth.includes(pc(m.kpis.enquiries.value, m.kpis.sessions.value, 2)),
            insightsRate: insights.includes(`Site average: ${(m.kpis.enquiry_rate.value * 100).toFixed(2)}%`),
          },
        };
      }, range);
      const same = (o, k, tol = 0) => {
        const vals = Object.values(o).filter((v) => v !== undefined);
        assert.ok(vals.length >= 3, `${range} ${k}: compared in at least 3 places`);
        for (const v of vals) assert.ok(Math.abs(v - vals[0]) <= tol, `${range} ${k}: ${JSON.stringify(o)}`);
      };
      assert.deepEqual(r.period.screen, r.period.metrics, `${range}: Home/Growth period = metrics period`);
      assert.deepEqual(r.period.report, r.period.metrics);
      assert.deepEqual(r.period.insights, r.period.metrics, `${range}: Insights period = metrics period`);
      same(r.sessions, 'sessions');
      same(r.enquiryRate, 'enquiry rate', 1e-12);
      same(r.leads, 'leads');
      same(r.engagementRate, 'engagement rate', 1e-12);
      assert.deepEqual(r.shown, { homeSessions: true, growthRate: true, insightsRate: true }, `${range}: the same numbers are on screen`);
    }
    assert.deepEqual(errors, []);
  });
});
