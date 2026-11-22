// P2 (2026-11-20): checks that need no browser. Menu reachability and the 2-click questions are in ui-tests/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Arabic text uses IBM Plex Sans Arabic shipped with the app, not a font from Google or Tahoma', () => {
  for (const w of [400, 500, 600, 700]) {
    assert.ok(existsSync(new URL(`../public/vendor/fonts/ibm-plex-sans-arabic-arabic-${w}-normal.woff2`, import.meta.url)), `weight ${w}`);
    assert.ok(html.includes(`@font-face{font-family:"IBM Plex Sans Arabic";font-style:normal;font-weight:${w};font-display:swap;src:url(/vendor/fonts/ibm-plex-sans-arabic-arabic-${w}-normal.woff2)`), `@font-face ${w}`);
  }
  assert.ok(existsSync(new URL('../public/vendor/fonts/IBMPlexSansArabic.LICENSE.txt', import.meta.url)), 'OFL licence shipped');
  assert.doesNotMatch(html, /family=Noto\+Sans\+Arabic/);
  assert.match(html, /--f-ui:"Plus Jakarta Sans","IBM Plex Sans Arabic"/);
});

test('one menu (P7, owner 2026-11-22): Home, Ask, Next steps, Content, Performance, Company, then Data and Settings; every screen has a place', () => {
  const nav = html.slice(html.indexOf('const NAV7=()=>['), html.indexOf('const NAV7F='));
  const order = [...nav.matchAll(/\{k:'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(order, ['home', 'ask', 'next', 'content', 'perf', 'co']);
  for (const [v, l] of [['audit', 'Recommendations'], ['auto', 'My tasks'], ['track', 'Track record'], ['studio', 'Campaigns'], ['series', 'Content series'], ['analytics', 'Results'], ['growth', 'Leads'], ['reports', 'Reports'], ['onboard', 'Sources'], ['know', 'Company info']]) assert.ok(nav.includes("['" + v + "',L('" + l + "'"), v);
  assert.ok(nav.includes("also:['qa','export']"), 'Check & download belongs to Campaigns, not the menu');
  assert.ok(html.includes("const NAV7F=()=>[{k:'data',icn:'db',l:L('Data','البيانات'),v:'integ'},{k:'set',icn:'trust',l:L('Settings','الإعدادات'),v:'trust'}];"));
  const views = [...html.matchAll(/^V\.([a-z]+)=/gm)].map((m) => m[1]).filter((v) => v !== 'export');
  const inMenu = ['dash', 'director', 'audit', 'auto', 'track', 'studio', 'series', 'qa', 'analytics', 'growth', 'reports', 'onboard', 'know', 'integ', 'trust'];
  assert.ok(html.includes("V.export=c=>{S.ui.view='qa';return V.qa(c)};"));
  for (const v of views) assert.ok(inMenu.includes(v), `screen ${v} has a place in the menu`);
});

test('Settings: no internal "product decisions" notes (moved to docs), and the floating Guide stays out of it', () => {
  assert.doesNotMatch(html, /Product decisions beyond the brief/);
  assert.match(readFileSync(new URL('../docs/product-decisions.md', import.meta.url), 'utf8'), /Deliberately left out:/);
  assert.match(html, /function guideDock\(c,v\)\{if\(!c\|\|v==='trust'\|\|/);
  assert.match(html, /main#main\{padding-bottom:96px\}/);
});

test('fonts ship with the app: no file in public/ points at Google Fonts', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = `${d}/${n}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
  const root = new URL('../public', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const texts = walk(root).filter((p) => /\.(html|css|js|mjs)$/.test(p) && !/vendor\/(pdf|xlsx)/.test(p));
  for (const p of texts) assert.doesNotMatch(readFileSync(p, 'utf8'), /fonts\.(googleapis|gstatic)\.com/, p);
  for (const w of [400, 500, 600, 700, 800]) for (const sub of ['latin', 'latin-ext']) {
    assert.ok(existsSync(new URL(`../public/vendor/fonts/plus-jakarta-sans-${sub}-${w}-normal.woff2`, import.meta.url)), `${sub} ${w}`);
    assert.ok(html.includes(`@font-face{font-family:"Plus Jakarta Sans";font-style:normal;font-weight:${w};font-display:swap;src:url(/vendor/fonts/plus-jakarta-sans-${sub}-${w}-normal.woff2)`), `@font-face ${sub} ${w}`);
  }
  assert.ok(existsSync(new URL('../public/vendor/fonts/PlusJakartaSans.LICENSE.txt', import.meta.url)), 'OFL licence shipped');
});

test('strategy gate (owner 2026-11-20): drafts do not approve the strategy; campaign downloads need it', () => {
  // P4: and every linked fact still approved; P5 fix: and the server has recorded the approval (its trail id)
  assert.match(html, /const stratOk=k=>!!k&&k\.approved===true&&!!k\.stratTrail&&!factGate\(C\(\),k\);/);
  assert.doesNotMatch(html, /k\.approved=true;k\.approvedAt=Date\.now\(\);k\.factIds=campFacts\(c,k\);stratTrail/); // Generate no longer approves by itself
  assert.ok(html.includes("const r=await api('POST','/api/companies/'+c.id+'/campaigns/'+encodeURIComponent(k.id)+'/approve-strategy'"));
  assert.doesNotMatch(html, /camp\.approved=true;camp\.versions\.push\(\{n:1/); // generating drafts no longer approves
  assert.ok(html.includes("if(['zip','calendar','campjson'].includes(kind)&&k&&!stratOk(k))return toast(GATE(),'err');"));
  assert.ok(html.includes("aDl(id){if(!stratOk(curCamp(C())))return toast(GATE(),'err');"));
  assert.ok(html.includes("aPng(id){if(!stratOk(curCamp(C())))return toast(GATE(),'err');"));
});
