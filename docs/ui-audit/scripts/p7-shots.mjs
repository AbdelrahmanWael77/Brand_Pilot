// P7 screenshots: the five key screens in English and Arabic, on the FlowNest demo company created the way a user
// does it (Ctrl K → "Create the FlowNest demo company", nothing else). In-process app, throwaway database, demo mode,
// no AI key. Usage: node docs/ui-audit/scripts/p7-shots.mjs <out-folder> [prefix]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../../server/app.js';
import { openDb } from '../../../server/db.js';

const OUT = process.argv[2] || 'docs/ui-audit/screenshots-p7';
const PREFIX = process.argv[3] || '';
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
  await page.fill('input[name=email]', 'p7-shots@example.test');
  await page.fill('input[name=password]', 'p7-shots-pass-1');
  await page.click('#authf button.btn.pri');
  await page.waitForSelector('main#main');
  await page.waitForFunction(() => typeof demoOn === 'function' && demoOn() === true, null, { timeout: 15000 });
  await page.evaluate(() => A.demoCo());
  await page.waitForFunction(() => C() && C().demo === 'flownest' && C().imports.length >= 4, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const ALL = [['home', 'dash'], ['results', 'analytics'], ['leads', 'growth'], ['next-steps', 'audit'], ['ask', 'director'], ['my-tasks', 'auto'], ['campaign-studio', 'studio'], ['content-series', 'series'], ['check-download', 'qa'], ['reports', 'reports'], ['company-sources', 'onboard'], ['company-info', 'know'], ['data', 'integ'], ['settings', 'trust']];
  // P7 checkpoint 2: every screen; BRANDPILOT_SHOTS=key,key limits the list
  const shots = process.env.BRANDPILOT_SHOTS ? ALL.filter(([n]) => process.env.BRANDPILOT_SHOTS.split(',').includes(n)) : ALL;
  for (const lang of ['en', 'ar']) {
    await page.evaluate((l) => { if (S.lang !== l) A.lang(); }, lang);
    for (const [name, v] of shots) {
      await page.evaluate((v) => { A.go(v); window.scrollTo(0, 0); }, v);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `${PREFIX}${name}-${lang}.png`) });
      await page.screenshot({ path: path.join(OUT, `${PREFIX}${name}-${lang}-full.png`), fullPage: true });
    }
  }
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
} finally {
  await browser.close();
  server.close();
  db.close();
}
