// P2 (owner rule 1): every feature stays reachable from the new menu. Using ONLY clicks on the sidebar and the section
// tabs, open every section and tab and find its key controls (the features of the section 3 table in
// docs/ui-audit/README.md, as they are grouped since P2). Run: npm run test:ui (needs Google Chrome).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

/** P7 (owner 2026-11-22): the sidebar's rows → their pages → the controls each page must offer. A row is a page
 *  (top) or a group (group: its key), whose pages are its sub-items. Check & download is reached from the campaign's
 *  step bar, not from the menu. */
export const MENU_FEATURES = {
  home: { label: 'Home', top: 'dash', tabs: { dash: ['.h7-st', '[data-c=range]', '.h7-next', '.h7-nums [data-v=analytics]', 'form[data-s=askNext]', '[data-a=askQ]'] } },
  ask: { label: 'Ask', top: 'director', tabs: { director: ['form[data-s=ask]', '[data-a=askQ]'] } }, // the conversation list (New chat) appears once there are conversations; "use another AI" is in Settings → Advanced
  next: { label: 'Next steps', group: 'next', tabs: {
    audit: ['.ns-list .ns-i', '[data-a=auditTab]', 'details.ns-why', '[data-a=recTask]', '[data-a=recCamp]', '[data-a=recExp]'], // no ask box (Ask is its own page); the export is in Reports
    auto: ['[data-a=weekly]', '[data-c=autoT]'], // tasks, weekly review
    track: ['[data-track-card]'], // the track record, its own page since P7
  } },
  content: { label: 'Content', group: 'content', tabs: {
    studio: ['[data-a=campNew7]', '[data-a=campOpen]'], // P7: the campaigns list: New campaign, and one row per campaign
    series: ['[data-a=sxNewT]'], // the creation form opens after "New series"
    qa: ['[data-a=approveAll]', '#cdl [data-a=ex][data-v=zip]', '#cdl [data-a=ex][data-v=strategy]', '#cdl [data-a=ex][data-v=calendar]', '#cdl [data-a=ex][data-v=campjson]', '#cdl [data-a=jCamp]'], // reached from the step bar
  } },
  perf: { label: 'Performance', group: 'perf', tabs: {
    analytics: ['.k7g', '[data-a=r7m]', '.tb7', '[data-a=r7old]'], // P7: 3 numbers, chart switch, channel table; the detailed page (platform tabs, trend metric) is behind More detail
    growth: ['.k7g', '[data-a=l7m]', '.tb7', '[data-a=l7old]'], // P7: 3 numbers, chart switch, lead sources; lead definitions and experiments are behind More detail
    reports: ['[data-a=ex][data-v=audit]', '[data-a=repPreview]', '[data-a=repSave]', '[data-a=repSched]', '[data-a=repDl]', '[data-a=repPrint]', '[data-a=repRange]', '[data-a=ex][data-v=exec]'],
  } },
  co: { label: 'Company', group: 'co', tabs: {
    onboard: ['[data-a=srcAdd]', '[data-a=discover]'],
    know: ['[data-a=kApprove]', '[data-a=kReject]', 'form[data-s=kAdd]'],
  } },
  integ: { label: 'Data', top: 'integ', footer: true, tabs: { integ: ['[data-c=imp]', '[data-a=tpl]', '[data-a=connect]', '[data-a=clearData]'] } },
  trust: { label: 'Settings', top: 'trust', footer: true, tabs: { trust: ['[data-a=exportAll]', '[data-c=importAll]', '[data-a=delCo]', '[data-c=aiMode]', '[data-c=digits]', '#adv [data-a=ex][data-v=knowledge]', '#adv [data-a=ex][data-v=pkg]', '#adv .ih', '#adv .rsx', '#adv [data-a=copyPkg]', '#adv [data-a=claudeIn]'] } }, // AI files, import history and the real/simulated table are in Settings → Advanced
};

test('every row and page of the new menu opens by clicking, with its features', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    // a campaign with generated assets, so the check has something to check
    await page.evaluate(async () => {
      const x = audit(C()).find((r) => r.make === 'campaign');
      A.recCamp(x.id);
      await new Promise((r) => setTimeout(r, 300));
      const g = document.querySelector('[data-a=gen]');
      if (g) g.click();
      await new Promise((r) => setTimeout(r, 500));
    });
    // the sidebar: six rows in the order of the day's work, then Data and Settings; no tabs above the page
    const main = await page.$$eval('#gside .gs-nav > ul > li > .gs-i', (b) => b.map((x) => x.textContent.trim()));
    assert.deepEqual(main, ['Home', 'Ask', 'Next steps', 'Content', 'Performance', 'Company']);
    const foot = await page.$$eval('#gside .gs-foot > ul > li > .gs-i', (b) => b.map((x) => x.textContent.trim()));
    assert.deepEqual(foot, ['Data', 'Settings']);
    assert.equal(await page.$('.wtabs'), null, 'no tabs above the page');
    for (const [, { label, top, group, tabs }] of Object.entries(MENU_FEATURES)) {
      if (top) await page.click(`#gside [data-a=go][data-v="${top}"]`);
      else await page.click(`#gside [data-a=navG][data-v="${group}"]`); // a group opens its first page
      await page.waitForTimeout(400);
      for (const [view, sels] of Object.entries(tabs)) {
        if (view === 'qa') { await page.click('#gside .gs-s[data-v=studio]'); await page.waitForTimeout(400); await page.click('main [data-a=campOpen]'); await page.waitForTimeout(400); await page.click('main [data-a=go][data-v=qa]'); } // Review drafts → All checks
        else if (group) await page.click(`#gside .gs-s[data-v="${view}"]`);
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => S.ui.view), view, `${label} → ${view}`);
        for (const sel of sels) assert.ok(await page.$(`main ${sel}`), `${label} → ${view}: ${sel}`);
      }
    }
    assert.deepEqual(errors, []);
  });
});
