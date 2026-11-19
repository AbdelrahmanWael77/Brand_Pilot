import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'C:/Users/mdlab/AppData/Local/Temp/claude/f01d99f7d08e6a90/7d5f23c5-5f26-43dd-916e-f428b33506c2/scratchpad/ui-audit/';
const base = 'http://localhost:3917';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
page.on('pageerror', e => fs.appendFileSync(OUT + 'errors.txt', 'pageerror: ' + e.message + '\n'));
await page.goto(base);
await page.waitForSelector('#authf');
await page.screenshot({ path: OUT + 'shots/00-login-en.png' });
// register via UI
await page.click('#authMode');
await page.fill('input[name=email]', 'audit@example.test');
await page.fill('input[name=password]', 'audit-pass-123');
await page.click('#authf button.btn.pri');
await page.waitForSelector('main#main');
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + 'shots/01-first-login-empty-company-en.png', fullPage: true });
fs.writeFileSync(OUT + 'first-login.txt', await page.innerText('body'));
// Sample (synthetic) data: same path as the app's own demo loader (FlowNest fixture)
await page.evaluate(() => { const c = C(); c.demo = 'flownest'; R(); });
await page.click('[data-a=loadDemo]');
await page.waitForTimeout(300);
await page.evaluate(() => { const c = C(); extract(c); c.findings.forEach(f => { if (f.type === 'fact' && !f.needs) approveF(c, f) }); publishK(c); R(); });
// Create campaign from first rec with make=campaign via Audit
await page.evaluate(() => A.go('audit'));
await page.waitForTimeout(300);
const rc = await page.$('[data-a=recCamp]');
if (rc) await rc.click(); else await page.evaluate(() => A.campNew());
await page.waitForTimeout(300);
await page.evaluate(() => { window.confirm = () => true; });
const g = await page.$('[data-a=gen]');
if (g) { await g.click(); await page.waitForTimeout(500); }
// import synthetic campaign results
await page.evaluate(() => { const c = C(); const k = c.campaigns[0]; if (k) A.loadCamp(k.id); });
await page.waitForTimeout(500);
await page.evaluate(() => syncNow());
await page.waitForTimeout(1500);

const views = ['dash', 'onboard', 'know', 'audit', 'director', 'growth', 'studio', 'qa', 'analytics', 'auto', 'integ', 'export', 'trust'];
const dump = {};
for (const lang of ['en', 'ar']) {
  await page.evaluate(l => { if (S.lang !== l) A.lang(); }, lang);
  for (const [i, v] of views.entries()) {
    await page.evaluate(v => A.go(v), v);
    await page.waitForTimeout(1200);
    const n = String(i + 2).padStart(2, '0');
    await page.screenshot({ path: `${OUT}shots/${n}-${v}-${lang}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}shots/${n}-${v}-${lang}-fold.png` });
    if (lang === 'en' || v === 'dash' || v === 'audit') {
      dump[v + '-' + lang] = await page.evaluate(() => {
        const m = document.querySelector('main');
        const btns = [...m.querySelectorAll('button,a.btn,select,input,textarea,summary,[role=tab]')].map(b => `${b.tagName}${b.className ? '.' + b.className.replace(/\s+/g, '.') : ''}[${b.dataset.a || b.dataset.c || b.dataset.i || b.name || ''}${b.dataset.v ? '=' + b.dataset.v : ''}] ${(b.innerText || b.value || b.getAttribute('aria-label') || b.placeholder || '').trim().slice(0, 80)}`);
        const badges = [...m.querySelectorAll('.badge')].map(b => b.className + ': ' + b.innerText.trim());
        const heads = [...m.querySelectorAll('h1,h2,h3,h4')].map(h => h.tagName + ' ' + h.innerText.trim());
        return { len: document.body.scrollHeight, heads, btns, badges, text: m.innerText };
      });
    }
  }
  // mobile/top bar & guide
  await page.evaluate(() => A.go('dash'));
  await page.evaluate(() => { S.ui.guide = true; R(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}shots/15-guide-open-${lang}.png` });
  await page.evaluate(() => { S.ui.guide = false; R(); });
}
// mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => A.go('dash'));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}shots/16-dash-ar-mobile.png`, fullPage: true });
await page.evaluate(() => A.lang());
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}shots/16-dash-en-mobile.png`, fullPage: true });
fs.writeFileSync(OUT + 'dump.json', JSON.stringify(dump, null, 1));
await browser.close();
console.log('done');
