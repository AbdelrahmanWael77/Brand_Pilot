// P7 checkpoint 2, part 1: the three palette options on the real Home and Campaign review (the FlowNest demo
// campaign's drafts), English and Arabic, with the new sidebar; plus an AA contrast pass of every text on screen.
// Usage: node docs/ui-audit/scripts/p7-palettes.mjs  → docs/ui-audit/p7-palettes/
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../../server/app.js';
import { openDb } from '../../../server/db.js';
import { contrastAudit } from '../../../ui-tests/lib/contrast.mjs';

const OUT = 'docs/ui-audit/p7-palettes';
fs.mkdirSync(OUT, { recursive: true });
for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'BRANDPILOT_OPENROUTER_API_KEY']) delete process.env[k];
const db = openDb(':memory:');
const server = createApp({ db, demo: true }).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const launch = process.env.BRANDPILOT_CHROME ? { executablePath: process.env.BRANDPILOT_CHROME } : { channel: 'chrome' };
const browser = await chromium.launch({ ...launch, headless: true });
const report = {};
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#authf');
  await page.click('#authMode');
  await page.fill('input[name=email]', 'p7-palettes@example.test');
  await page.fill('input[name=password]', 'p7-palettes-pass-1');
  await page.click('#authf button.btn.pri');
  await page.waitForSelector('main#main');
  await page.waitForFunction(() => typeof demoOn === 'function' && demoOn() === true, null, { timeout: 15000 });
  await page.evaluate(() => A.demoCo());
  await page.waitForFunction(() => C() && C().campaigns.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  for (const pal of ['1', '2', '3']) {
    report[pal] = { fails: [] };
    for (const lang of ['en', 'ar']) {
      await page.evaluate(([p, l]) => { if (S.lang !== l) A.lang(); A.setPal(p); }, [pal, lang]);
      for (const [name, go] of [['home', () => A.go('dash')], ['campaign-review', () => { const c = C(); A.campOpen(c.campaigns[0].id); }]]) {
        await page.evaluate(`(${go.toString()})(); window.scrollTo(0, 0);`);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, `palette-${pal}-${name}-${lang}.png`) });
        for (const x of await page.evaluate(`(${contrastAudit.toString()})()`)) report[pal].fails.push({ lang, screen: name, ...x });
      }
    }
  }
  report.pageErrors = errors;
} finally {
  await browser.close();
  server.close();
  db.close();
}
fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(report, null, 2));
console.log(Object.entries(report).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : v.fails.length}`).join(' · '));
