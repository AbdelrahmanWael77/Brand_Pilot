// P7 finishing round: the Content series steps (1 Name and type, 2 Past posts, 3 Approve the style, then the series
// page) and Review drafts with the Arabic version of a draft, in English and Arabic.
// Usage: node docs/ui-audit/scripts/p7-flows.mjs <out-folder> [prefix]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../../server/app.js';
import { openDb } from '../../../server/db.js';

const OUT = process.argv[2] || 'docs/ui-audit/screenshots-p7-cp2c';
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
  await page.fill('input[name=email]', 'p7-flows@example.test');
  await page.fill('input[name=password]', 'p7-flows-pass-1');
  await page.click('#authf button.btn.pri');
  await page.waitForSelector('main#main');
  await page.waitForFunction(() => typeof demoOn === 'function' && demoOn() === true, null, { timeout: 15000 });
  await page.evaluate(() => A.demoCo());
  await page.waitForFunction(() => C() && C().campaigns.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const shot = async (name) => { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200); await page.screenshot({ path: path.join(OUT, `${PREFIX}${name}.png`) }); };
  for (const lang of ['en', 'ar']) {
    await page.evaluate((l) => { if (S.lang !== l) A.lang(); S.ui.sx = null; S.ui.sxWiz = null; }, lang);
    // Review drafts: the Arabic version of the Facebook post
    await page.evaluate(() => { A.campOpen(C().campaigns[0].id); A.rv7G('post1'); A.rv7L('ar'); });
    await shot(`campaign-review-arabic-draft-${lang}`);
    await page.evaluate(() => A.rv7L('en'));
    // Content series: step 1 (the form), step 2, step 3, then the series page
    await page.evaluate(() => { A.go('series'); A.sxType7('tips'); });
    await shot(`series-step1-${lang}`);
    await page.evaluate((l) => { const v = { name: l === 'ar' ? 'نصائح الفرق ' + Date.now() % 1000 : 'Team tips ' + Date.now() % 1000, purpose: '', channel: 'linkedin', objective: 'engagement', audience: '' }; A.sxCreate({ get: (k) => v[k] || '' }); }, lang);
    await shot(`series-step2-${lang}`);
    await page.evaluate(() => A.sxWiz('skip'));
    await shot(`series-step3-${lang}`);
    await page.evaluate(() => A.sxWizOk(S.ui.sx));
    await shot(`series-page-${lang}`);
    await page.evaluate(() => { S.ui.sx = null; });
  }
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} finally {
  await browser.close();
  server.close();
  db.close();
}
