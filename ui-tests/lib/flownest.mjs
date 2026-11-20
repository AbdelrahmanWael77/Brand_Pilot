// FlowNest baseline capture (P1 checkpoint 1, 2026-11-19).
//
// Builds the synthetic FlowNest demo company the way the app does it, in a real browser against an in-process app
// (throwaway in-memory database, demo mode on, no AI key so every step is the deterministic rules engine), and
// records what BrandPilot recommends today:
//   recs.en / recs.ar  the browser audit `audit(c)` — the recommendations every screen shows (Home priorities,
//                      Insights, Growth), in both languages
//   server             the server audit `GET /api/companies/:id/audit` for the same company
//   state              the company as the server stores it (GET .../state), so server-side tests can rebuild it
//                      without a browser
//
// Steps (the canonical demo path, as `seed()` prepares a demo company):
//   1. Ctrl K action `A.demoCo()` → company "FlowNest", demo materials + baseline exports (fixtures are seeded,
//      fixed dates 2026-07-27 … 2026-10-18 — nothing depends on today's date)
//   2. `extract(c)`  rules-engine reading of the demo sources
//   3. approve every finding of type 'fact' that does not need a decision (as `seed()` does), `publishK(c)`
//   4. save to the server, then read both audits
//
// Needs Google Chrome installed (playwright-core drives it; no browser is downloaded). Override the browser with
// BRANDPILOT_CHROME=<path to chrome.exe>.
import { chromium } from 'playwright-core';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';

/** Fields of an audit item that are data (functions and render-only values are dropped by the JSON round trip). */
/** Periods recorded: all imported data, and the screens' default (last 28 days). */
export const RANGES = ['all', '28'];
const AI_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'BRANDPILOT_OPENROUTER_API_KEY'];
const clean = (x) => JSON.parse(JSON.stringify(x));
/** Fact ids are random per extraction: compare the evidence by its text, not its id. */
export const stableIds = (x) => JSON.parse(JSON.stringify(x), (k, v) => (k === 'factId' && typeof v === 'string' ? '<fact>' : v));

/**
 * Opens the app (in-process server, :memory: DB, demo mode, no AI) with the FlowNest demo company built the canonical
 * way, and calls fn({ page, base, errors }). Shared by the baseline capture, the consistency UI test and screenshots.
 */
export async function withFlowNest(fn, { viewport = { width: 1366, height: 900 } } = {}) {
  const prevKey = { ...process.env };
  // No AI on any provider: the baseline is the rules engine only.
  for (const k of AI_KEYS) delete process.env[k];
  const db = openDb(':memory:');
  const server = createApp({ db, demo: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const launch = process.env.BRANDPILOT_CHROME ? { executablePath: process.env.BRANDPILOT_CHROME } : { channel: 'chrome' };
  const browser = await chromium.launch({ ...launch, headless: true });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport })).newPage();
    const requests = []; // every URL the page asks for, from the first load (tests check no request leaves for a font service)
    page.on('request', (q) => requests.push(q.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(base, { waitUntil: 'domcontentloaded' }); // not 'load': an external font request must not block the tests
    await page.waitForSelector('#authf');
    await page.click('#authMode');
    await page.fill('input[name=email]', 'flownest-baseline@example.test');
    await page.fill('input[name=password]', 'flownest-baseline-1');
    await page.click('#authf button.btn.pri');
    await page.waitForSelector('main#main');
    await page.waitForFunction(() => typeof demoOn === 'function' && demoOn() === true, null, { timeout: 15000 });

    // 1. the app's own demo action
    await page.evaluate(() => A.demoCo());
    await page.waitForFunction(() => C() && C().demo === 'flownest' && C().imports.length >= 4, null, { timeout: 30000 });
    // 2–3. rules extraction, approve plain facts, publish the knowledge
    await page.evaluate(() => {
      const c = C();
      extract(c);
      c.findings.forEach((f) => { if (f.type === 'fact' && !f.needs) approveF(c, f); });
      publishK(c);
      R();
    });
    // 4. save, and wait until the server holds this exact state
    const saved = await page.evaluate(async () => {
      await syncNow();
      const ok = await synced(C());
      if (typeof decWait === 'function') await decWait(C()); // P4: the approvals are recorded on the server before anything reads them
      return ok;
    });
    if (!saved) throw new Error('the FlowNest state did not reach the server');
    return await fn({ page, base, errors, requests, db });
  } finally {
    await browser.close();
    server.close();
    db.close();
    for (const k of AI_KEYS) if (prevKey[k] !== undefined) process.env[k] = prevKey[k];
  }
}

export async function captureFlowNest() {
  return withFlowNest(async ({ page, errors }) => {

    // What the screens list (audit(c)) for one period and language. Since P1 the page asks the server, so wait for
    // its answer; before P1 audit(c) computed in the browser and answered at once (recsGet did not exist).
    const screen = async (range, lang) => page.evaluate(async ([range, lang]) => {
      S.ui.range = range;
      S.lang = lang;
      R();
      const c = C();
      if (typeof recsGet === 'function') {
        for (let i = 0; i < 200 && !recsGet(c).ok; i++) await new Promise((r) => setTimeout(r, 50));
        if (!recsGet(c).ok) throw new Error('the recommendations did not arrive');
      }
      return JSON.parse(JSON.stringify(audit(c)));
    }, [range, lang]);
    const recs = {};
    for (const range of RANGES) {
      recs[range] = {};
      for (const lang of ['en', 'ar']) recs[range][lang] = stableIds(await screen(range, lang));
    }
    const out = await page.evaluate(async () => {
      const c = C();
      const get = async (p) => { const r = await fetch(`/api/companies/${c.id}${p}`); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
      return { server: await get('/audit'), state: (await get('/state')).state, counts: { sources: c.sources.length, findings: c.findings.length, approved: c.findings.filter((f) => f.status === 'approved').length, rows: Object.fromEntries(Object.entries(c.data).map(([k, v]) => [k, v.length])) } };
    });
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    return { recs, server: stableIds(out.server), state: out.state, counts: out.counts };
  });
}
