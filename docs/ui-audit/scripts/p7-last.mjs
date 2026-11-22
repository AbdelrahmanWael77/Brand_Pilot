// P7 last fixes: the Content series form and series page (light header), a series post with flagged statements
// (post review), and the Data page, in English and Arabic. In-process app, throwaway database, demo mode, no AI key.
// The flagged post is set up in the page state (no AI is called): two flags, one number and one company statement.
// Usage: node docs/ui-audit/scripts/p7-last.mjs <out-folder> [prefix]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../../server/app.js';
import { openDb } from '../../../server/db.js';

const OUT = process.argv[2] || 'docs/ui-audit/screenshots-p7-last';
const PREFIX = process.argv[3] || 'after-';
fs.mkdirSync(OUT, { recursive: true });
for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'BRANDPILOT_OPENROUTER_API_KEY']) delete process.env[k];
const db = openDb(':memory:');
const server = createApp({ db, demo: true }).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const launch = process.env.BRANDPILOT_CHROME ? { executablePath: process.env.BRANDPILOT_CHROME } : { channel: 'chrome' };
const browser = await chromium.launch({ ...launch, headless: true });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#authf');
  await page.click('#authMode');
  await page.fill('input[name=email]', 'p7-last@example.test');
  await page.fill('input[name=password]', 'p7-last-pass-1');
  await page.click('#authf button.btn.pri');
  await page.waitForSelector('main#main');
  await page.waitForFunction(() => typeof demoOn === 'function' && demoOn() === true, null, { timeout: 15000 });
  await page.evaluate(() => A.demoCo());
  await page.waitForFunction(() => C() && C().campaigns.length > 0 && C().imports.length >= 4, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const shot = async (name, sel) => {
    await page.evaluate((q) => { const e = q && document.querySelector(q); if (e) e.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0); }, sel || null);
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelectorAll('#toasts > *').forEach((t) => t.remove()));
    await page.screenshot({ path: path.join(OUT, `${PREFIX}${name}.png`) });
  };
  // one series, past the 3 creation steps
  const sid = await page.evaluate(() => {
    A.go('series');
    const v = { name: 'Team tips', purpose: 'Short, practical tips for small sales teams.', channel: 'linkedin', objective: 'engagement', audience: '' };
    A.sxCreate({ get: (k) => v[k] || '' });
    const id = S.ui.sx; A.sxWizOk(id); return id;
  });
  for (const lang of ['en', 'ar']) {
    await page.evaluate((l) => { if (S.lang !== l) A.lang(); }, lang);
    // the creation form (step 1)
    await page.evaluate(() => { S.ui.sx = null; S.ui.sxWiz = null; A.go('series'); if (A.sxType7) A.sxType7('tips'); else A.sxNewT(); });
    await shot(`series-new-${lang}`);
    // the series page with no post yet
    await page.evaluate((id) => { delete C().sxd[id]; A.sxOpen(id); }, sid);
    await shot(`series-page-${lang}`);
    // a post with two options and two flagged statements (set up in the page, no AI)
    await page.evaluate(({ id, l }) => {
      const ar = l === 'ar';
      C().sxd[id] = { topic: ar ? 'متابعة العملاء' : 'Follow-ups', lang: l, fmt: 'single', aspect: null,
        copy: { l1: ar ? 'تابع خلال يومين' : 'Follow up within 2 days', l2: ar ? 'وليس أسبوعين' : 'not 2 weeks', sub: ar ? 'الفرق الصغيرة تكسب بالسرعة' : 'Small teams win on speed', pts: ['', '', ''], foot: '', caption: ar ? 'الفرق التي تتابع خلال يومين تغلق 40% صفقات أكثر. FlowNest هي أسرع أداة متابعة في السوق.' : 'Teams that follow up within 2 days close 40% more deals. FlowNest is the fastest follow-up tool on the market.', cta: '' },
        concept: 'a calendar', drafted: true, vars: [{ id: 'v-a', status: 'ready', layout: 'stack', made: 'stack', ill: null, model: 'upload' }, { id: 'v-b', status: 'ready', layout: 'split', made: 'split', ill: null, model: 'upload' }],
        pick: 'v-a', rec: null, facts: [], warn: ['40'], claims: [ar ? 'FlowNest هي أسرع أداة متابعة في السوق.' : 'FlowNest is the fastest follow-up tool on the market.'], ack: false, at: Date.now() };
      R();
    }, { id: sid, l: lang });
    await shot(`series-post-review-${lang}`, '.sx-res');
    // Data
    await page.evaluate(() => { S.ui.sx = null; A.go('integ'); });
    await shot(`data-${lang}`);
  }
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} finally {
  await browser.close();
  server.close();
  db.close();
}
