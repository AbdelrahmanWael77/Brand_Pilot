// P2 (owner rule 3): AA contrast on every screen in English and Arabic; keyboard navigation — arrow keys move between
// tabs (mirrored in Arabic), a modal keeps the focus inside and gives it back when it closes.
// Run: npm run test:ui (needs Google Chrome).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';
import { contrastAudit } from './lib/contrast.mjs';

const VIEWS = ['dash', 'analytics', 'growth', 'audit', 'director', 'auto', 'studio', 'series', 'qa', 'reports', 'onboard', 'know', 'integ', 'trust'];

test('AA contrast: no text below 4.5:1 (3:1 for large text) on any screen, English and Arabic', { timeout: 400_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    const fails = [];
    for (const lang of ['en', 'ar']) {
      await page.evaluate((l) => { if (S.lang !== l) A.lang(); }, lang);
      for (const v of VIEWS) {
        await page.evaluate(async (v) => { A.go(v); for (let i = 0; i < 60 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50)); document.querySelectorAll('.toast').forEach((t) => t.remove()); }, v);
        await page.waitForTimeout(400);
        for (const x of await page.evaluate(`(${contrastAudit.toString()})()`)) fails.push({ lang, view: v, ...x });
      }
    }
    assert.deepEqual(fails, []);
    assert.deepEqual(errors, []);
  });
});

test('keyboard: arrow keys move between tabs (mirrored in Arabic); a modal keeps and returns the focus', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    for (const lang of ['en', 'ar']) {
      await page.evaluate((l) => { if (S.lang !== l) A.lang(); A.go('audit'); }, lang);
      await page.waitForFunction(() => document.querySelector('.ns-f [role=tab]'));
      // only the selected tab is in the Tab order (roving tabindex)
      assert.deepEqual(await page.$$eval('.ns-f [role=tab]', (t) => t.map((x) => x.tabIndex)), [0, -1, -1]); // P7: three filters (All, To fix, Opportunities)
      await page.focus('.ns-f [role=tab][data-v=all]');
      await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight'); // the next tab is to the left in Arabic
      await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => ({ focused: document.activeElement.dataset.v, selected: document.querySelector('.ns-f [aria-selected=true]').dataset.v })), { focused: 'weak', selected: 'weak' }, `${lang}: next filter`);
      await page.keyboard.press('End');
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.v), 'opp', `${lang}: End`);
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);
      // P7: the sidebar (no tabs above the page): Down moves to the next row; Right (Left in Arabic) opens a closed
      // group without leaving the page, Left (Right in Arabic) closes it; Enter on a group opens its first page
      await page.focus('#gside .gs-s[data-v=audit]');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.v), 'auto', `${lang}: next row`);
      await page.focus('#gside .gs-gh[data-v=perf]');
      await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight');
      await page.waitForTimeout(200);
      assert.deepEqual(await page.evaluate(() => ({ open: document.querySelector('#gside .gs-gh[data-v=perf]').getAttribute('aria-expanded'), focused: document.activeElement.dataset.v, view: S.ui.view })), { open: 'true', focused: 'perf', view: 'audit' }, `${lang}: open a group`);
      await page.keyboard.press(lang === 'ar' ? 'ArrowRight' : 'ArrowLeft');
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.querySelector('#gside .gs-gh[data-v=perf]').getAttribute('aria-expanded')), 'false', `${lang}: close a group`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => S.ui.view), 'analytics', `${lang}: Enter opens the group's first page`);
    }
    // a modal: focus goes in, Tab stays in, Escape closes and the focus returns to the button that opened it
    await page.evaluate(() => { if (S.lang !== 'en') A.lang(); A.go('integ'); });
    await page.waitForTimeout(400);
    const opener = await page.$eval('main [data-a=connect]', (b) => b.dataset.v);
    await page.evaluate((v) => { document.querySelector(`main [data-a=connect][data-v="${v}"]`).closest('details').open = true; }, opener); // P7: Connect sits in the card's ⋯ menu
    await page.focus(`main [data-a=connect][data-v="${opener}"]`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.ov .modal'));
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => document.querySelector('.ov .modal').contains(document.activeElement)), 'focus moved into the modal');
    for (let i = 0; i < 12; i++) await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
    assert.ok(await page.evaluate(() => document.querySelector('.ov .modal').contains(document.activeElement)), 'Tab stays inside the modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => !!document.querySelector('.ov .modal')), false, 'Escape closes it');
    assert.deepEqual(await page.evaluate(() => ({ a: document.activeElement.dataset.a, v: document.activeElement.dataset.v })), { a: 'connect', v: opener }, 'focus back on the button that opened it');
    assert.deepEqual(errors, []);
  });
});
