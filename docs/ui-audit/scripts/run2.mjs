import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'C:/Users/mdlab/AppData/Local/Temp/claude/f01d99f7d08e6a90/7d5f23c5-5f26-43dd-916e-f428b33506c2/scratchpad/ui-audit/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
page.on('dialog', d => d.accept());
await page.goto('http://localhost:3917');
await page.waitForSelector('#authf');
await page.fill('input[name=email]', 'audit@example.test');
await page.fill('input[name=password]', 'audit-pass-123');
await page.click('#authf button.btn.pri');
await page.waitForSelector('main#main');
await page.waitForTimeout(800);
const out = {};
for (const lang of ['en', 'ar']) {
  await page.evaluate(l => { if (S.lang !== l) A.lang(); }, lang);
  for (const t of ['brief', 'plan', 'change']) {
    await page.evaluate(t => { A.go('studio'); A.stab(t); }, t);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}shots/08-studio-${t}-${lang}.png`, fullPage: true });
    if (lang === 'en') out['studio-' + t] = await page.evaluate(() => ({ btns: [...document.querySelectorAll('main button,main select,main input,main textarea')].map(b => `[${b.dataset.a || b.dataset.c || b.dataset.i || b.name || ''}] ${(b.innerText || b.value || b.placeholder || '').trim().slice(0, 60)}`), text: document.querySelector('main').innerText.slice(0, 2500) }));
  }
  await page.evaluate(() => A.go('director'));
  await page.waitForTimeout(400);
  const chips = await page.$$('[data-a=askQ]');
  if (chips[7]) await chips[7].click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}shots/06-director-answered-${lang}.png`, fullPage: true });
  if (lang === 'en') out.director = await page.evaluate(() => document.querySelector('main').innerText.slice(0, 3000));
  await page.evaluate(() => A.go('export'));
  await page.waitForTimeout(400);
  const pv = await page.$('[data-a=repPreview]');
  if (pv) await pv.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}shots/13-export-report-preview-${lang}.png`, fullPage: true });
  if (lang === 'en') out.report = await page.evaluate(() => document.querySelector('main').innerText.slice(1500, 4500));
}
fs.writeFileSync(OUT + 'dump2.json', JSON.stringify(out, null, 1));
await browser.close();
