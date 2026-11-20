// P2 (owner rule 2): each of the three questions is answered within 2 clicks of login, in English and Arabic.
// The test starts every question from Settings (the worst place to land after login) and counts every click.
// Q3: "Create campaign" on a recommendation makes the campaign and its drafts in English and Arabic in one click.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

test('Q1 "How is my marketing doing?" and Q2 "What should I do next, and why?" in ≤ 2 clicks, EN and AR', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    for (const lang of ['en', 'ar']) {
      await page.evaluate((l) => { if (S.lang !== l) A.lang(); A.go('trust'); }, lang);
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => document.documentElement.dir || 'ltr'), lang === 'ar' ? 'rtl' : 'ltr');
      if (lang === 'ar') {
        // Arabic is set in IBM Plex Sans Arabic, shipped with the app
        const font = await page.evaluate(async () => { await document.fonts.load('16px "IBM Plex Sans Arabic"', 'مرحبا'); await document.fonts.ready; return { loaded: document.fonts.check('16px "IBM Plex Sans Arabic"', 'مرحبا'), family: getComputedStyle(document.body).fontFamily }; });
        assert.ok(font.loaded && /IBM Plex Sans Arabic/.test(font.family), JSON.stringify(font));
      }
      let clicks = 0;
      const click = async (sel) => { clicks++; await page.click(sel); await page.waitForTimeout(500); };

      // Q1: one click on Home → the KPI cards with this period's numbers
      await click('#gside .gs-nav [data-a=go][data-v=dash]');
      const q1 = await page.evaluate(async () => {
        const m = await (await fetch(`/api/companies/${C().id}/metrics?range=${S.ui.range || '28'}`)).json();
        return { view: S.ui.view, kpis: document.querySelectorAll('main .hk').length, sessionsShown: document.querySelector('main').innerText.includes(fmt(m.kpis.sessions.value)) };
      });
      assert.deepEqual(q1, { view: 'dash', kpis: q1.kpis, sessionsShown: true }, `${lang} Q1`);
      assert.ok(q1.kpis >= 4, `${lang} Q1: KPI cards`);
      assert.ok(clicks <= 2, `${lang} Q1 clicks ${clicks}`);

      // Q2: back to Settings, then one click on Next steps → the ranked list; a second click on "Why?" → the evidence
      await page.evaluate(() => { OPENW.clear(); A.go('trust'); }); // a fresh start: no Why? panel remembered open from the other language
      await page.waitForTimeout(300);
      clicks = 0;
      await click('#gside .gs-nav [data-a=go][data-v=audit]');
      await page.waitForFunction(() => document.querySelector('main .ns-list .ns-i'), null, { timeout: 15000 });
      const top = await page.evaluate(() => { const r = document.querySelector('main .ns-list .ns-i'); return { title: r.querySelector('h3').innerText, action: r.querySelector('.ns-t p')?.innerText || '', conf: !!r.querySelector('.cf') }; });
      assert.ok(top.title && top.action && top.conf, `${lang} Q2: what to do, with confidence`);
      await click('main .ns-list .ns-i:first-child .ns-why > summary');
      const why = await page.evaluate(() => { const d = document.querySelector('main .ns-list .ns-i:first-child .ns-why'); const e = d.querySelector('.evc'); return { open: d.open, calc: !!e && /÷/.test(e.innerText), conf: !!e && !!e.querySelector('.cf'), visible: !!e && e.getBoundingClientRect().height > 0 }; });
      assert.deepEqual(why, { open: true, calc: true, conf: true, visible: true }, `${lang} Q2: why — calculation and confidence`);
      assert.ok(clicks <= 2, `${lang} Q2 clicks ${clicks}`);
    }
    assert.deepEqual(errors, []);
  });
});

test('Q3 "Give me a campaign I can use" in ≤ 2 clicks: Next steps → Create campaign gives drafts in English and Arabic; downloads open once a person approves the strategy (owner decision 2026-11-20)', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    for (const lang of ['en', 'ar']) {
      await page.evaluate((l) => { if (S.lang !== l) A.lang(); OPENW.clear(); A.go('trust'); }, lang);
      await page.waitForTimeout(400);
      const before = await page.evaluate(() => C().campaigns.length);
      let clicks = 0;
      const click = async (sel) => { clicks++; await page.click(sel); await page.waitForTimeout(600); };
      await click('#gside .gs-nav [data-a=go][data-v=audit]');
      await page.waitForFunction(() => document.querySelector('main .ns-list [data-a=recCamp]'), null, { timeout: 15000 });
      await click('main .ns-list [data-a=recCamp]');
      const r = await page.evaluate(() => { const k = C().campaigns[C().campaigns.length - 1]; return { view: S.ui.view, n: C().campaigns.length, assets: k ? k.assets.length : 0, langs: k ? [...new Set(k.assets.map((a) => a.lang))].sort() : [], drafts: k ? k.assets.every((a) => a.status !== 'approved') : false, download: !!document.querySelector('main [data-a=aDl]'), rec: k && k.rec, strategyApproved: !!(k && k.approved === true) }; });
      assert.equal(r.view, 'studio', `${lang} Q3: the campaign opens`);
      assert.equal(r.n, before + 1);
      assert.ok(r.assets > 0, `${lang} Q3: drafts made`);
      assert.deepEqual(r.langs, ['ar', 'en'], `${lang} Q3: English and Arabic drafts`);
      assert.ok(r.drafts, 'drafts are not approved by themselves');
      assert.ok(r.download, `${lang} Q3: a download is on screen`);
      assert.ok(r.rec, 'linked to the recommendation it came from');
      assert.equal(r.strategyApproved, false, 'the strategy waits for a person (ui-tests/strategy-gate.ui.mjs covers blocked → allowed)');
      assert.ok(clicks <= 2, `${lang} Q3 clicks ${clicks}`);
    }
    assert.deepEqual(errors, []);
  });
});
