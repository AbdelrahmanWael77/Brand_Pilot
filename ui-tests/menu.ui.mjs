// P2 (owner rule 1): every feature stays reachable from the new menu. Using ONLY clicks on the sidebar and the section
// tabs, open every section and tab and find its key controls (the features of the section 3 table in
// docs/ui-audit/README.md, as they are grouped since P2). Run: npm run test:ui (needs Google Chrome).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

/** Section (sidebar item) → its tabs → the controls each tab must offer. */
export const MENU_FEATURES = {
  dash: { label: 'Home', tabs: {
    dash: ['.h7-st', '[data-c=range]', '.h7-next', '.h7-nums [data-v=analytics]', 'form[data-s=askNext]', '[data-a=askQ]'], // P7 Home: key numbers, period, your next step, all numbers, Ask box, suggested questions (Leads is the Home tab next to Results)
    analytics: ['[data-a=pl]', '[data-c=mt]'], // platform tabs, trend metric
    growth: ['[data-c=def]', 'form[data-s=expAdd]'], // lead definitions, experiments
  } },
  audit: { label: 'Next steps', tabs: {
    audit: ['.ns-list .ns-i', '[data-a=auditTab]', 'details.ns-why', '[data-a=recTask]', '[data-a=recCamp]', '[data-a=recExp]'], // P7: no ask box (Ask is its own tab); the export is in Reports
    director: ['form[data-s=ask]', '[data-a=askQ]'], // P7: the question box and short questions; the conversation list (New chat) appears once there are conversations; "use another AI" is in Settings → Advanced
    auto: ['[data-a=weekly]', '[data-c=autoT]'], // tasks, weekly review
  } },
  studio: { label: 'Campaigns', tabs: {
    studio: ['[data-a=campNew], [data-a=stHome]'], // Studio home, or the open campaign with its way back
    series: ['[data-a=sxNewT]'], // P7: the creation form opens after "New series"
    qa: ['[data-a=approveAll]', '#cdl [data-a=ex][data-v=zip]', '#cdl [data-a=ex][data-v=strategy]', '#cdl [data-a=ex][data-v=calendar]', '#cdl [data-a=ex][data-v=campjson]', '#cdl [data-a=jCamp]'], // Brand QA, then the campaign downloads and publishing schedule (a campaign with assets exists in this test)
  } },
  reports: { label: 'Reports', tabs: {
    reports: ['[data-a=ex][data-v=audit]', '[data-a=repPreview]', '[data-a=repSave]', '[data-a=repSched]', '[data-a=repDl]', '[data-a=repPrint]', '[data-a=repRange]', '[data-a=ex][data-v=exec]', '[data-a=ex][data-v=audit]', ],
  } },
  know: { label: 'Company', tabs: {
    onboard: ['[data-a=srcAdd]', '[data-a=discover]'],
    know: ['[data-a=kApprove]', '[data-a=kReject]', 'form[data-s=kAdd]'],
  } },
  integ: { label: 'Data', footer: true, tabs: { integ: ['[data-c=imp]', '[data-a=tpl]', '[data-a=connect]', '[data-a=clearData]'] } },
  trust: { label: 'Settings', footer: true, tabs: { trust: ['[data-a=exportAll]', '[data-c=importAll]', '[data-a=delCo]', '[data-c=aiMode]', '[data-c=digits]', '#adv [data-a=ex][data-v=knowledge]', '#adv [data-a=ex][data-v=pkg]', '#adv .ih', '#adv .rsx', '#adv [data-a=copyPkg]', '#adv [data-a=claudeIn]'] } }, // P7: AI files, import history and the real/simulated table are in Settings → Advanced
};

test('every section and tab of the new menu opens by clicking, with its features', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    // a campaign with generated assets, so Brand QA has something to check
    await page.evaluate(async () => {
      const x = audit(C()).find((r) => r.make === 'campaign');
      A.recCamp(x.id);
      await new Promise((r) => setTimeout(r, 300));
      const g = document.querySelector('[data-a=gen]');
      if (g) g.click();
      await new Promise((r) => setTimeout(r, 500));
    });
    // the sidebar: five sections, then Data and Settings in the footer
    const main = await page.$$eval('#gside .gs-nav [data-a=go]', (b) => b.map((x) => x.textContent.replace(/\d+$/, '').trim()));
    assert.deepEqual(main, ['Home', 'Next steps', 'Campaigns', 'Reports', 'Company']);
    const foot = await page.$$eval('#gside .gs-foot [data-a=go]', (b) => b.map((x) => x.textContent.trim()));
    assert.deepEqual(foot, ['Data', 'Settings']);
    for (const [section, { label, footer, tabs }] of Object.entries(MENU_FEATURES)) {
      await page.click(`#gside ${footer ? '.gs-foot' : '.gs-nav'} [data-a=go]:has-text("${label}")`);
      await page.waitForTimeout(300);
      for (const [view, sels] of Object.entries(tabs)) {
        if (Object.keys(tabs).length > 1) await page.click(`.wtabs [data-a=go][data-v="${view}"]`);
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => S.ui.view), view, `${label} → ${view}`);
        for (const sel of sels) assert.ok(await page.$(`main ${sel}`), `${label} → ${view}: ${sel}`);
      }
    }
    assert.deepEqual(errors, []);
  });
});
