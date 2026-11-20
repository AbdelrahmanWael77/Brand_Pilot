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

test('one menu: five sections, then Data and Settings; every older screen is a tab of one section', () => {
  assert.match(html, /const MENU=\(\)=>\[\['home','dash',L\('Home','الرئيسية'\),\['dash','analytics','growth'\]\],\['next','bulb',L\('Next steps','الخطوات التالية'\),\['audit','director','auto'\]\],\['camp','studio',L\('Campaigns','الحملات'\),\['studio','series','qa'\]\],\['rep','export',L\('Reports','التقارير'\),\['export'\]\],\['co','building',L\('Company','الشركة'\),\['onboard','know'\]\]\];/);
  assert.match(html, /const MENU_FOOT=\(\)=>\[\['data','db',L\('Data','البيانات'\),\['integ'\]\],\['set','trust',L\('Settings','الإعدادات'\),\['trust'\]\]\];/);
  // no screen is left without a section
  const views = [...html.matchAll(/^V\.([a-z]+)=/gm)].map((m) => m[1]).filter((v) => !['dash0'].includes(v));
  const inMenu = ['dash', 'analytics', 'growth', 'audit', 'director', 'auto', 'studio', 'series', 'qa', 'export', 'onboard', 'know', 'integ', 'trust'];
  for (const v of views) assert.ok(inMenu.includes(v), `screen ${v} has a place in the menu`);
});

test('Settings: no internal "product decisions" notes (moved to docs), and the floating Guide stays out of it', () => {
  assert.doesNotMatch(html, /Product decisions beyond the brief/);
  assert.match(readFileSync(new URL('../docs/product-decisions.md', import.meta.url), 'utf8'), /Deliberately left out:/);
  assert.match(html, /function guideDock\(c,v\)\{if\(!c\|\|v==='trust'\|\|/);
  assert.match(html, /main#main\{padding-bottom:96px\}/);
});
