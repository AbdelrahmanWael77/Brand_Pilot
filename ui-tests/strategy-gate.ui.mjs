// Owner decision (2026-11-21): "Create campaign" makes the campaign and its drafts in one click, but nothing of it can be
// downloaded until a person approves the strategy. Blocked before approval, allowed after, in English and Arabic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

test('campaign downloads are blocked until a person approves the strategy, then allowed (EN and AR)', { timeout: 400_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    for (const lang of ['en', 'ar']) {
      await page.evaluate(async (l) => { if (S.lang !== l) A.lang(); A.go('audit'); for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50)); }, lang);
      await page.click('main .ns-list [data-a=recCamp]');
      await page.waitForTimeout(600);
      const camp = await page.evaluate(() => { const k = curCamp(C()); return { id: k.id, assets: k.assets.length, approved: k.approved === true }; });
      assert.ok(camp.assets > 0, `${lang}: drafts made in one click`);
      assert.equal(camp.approved, false, `${lang}: drafts do not approve the strategy`);

      // before approval: the reason, the button, disabled downloads
      await page.evaluate(() => A.go('qa'));
      await page.waitForTimeout(500);
      const before = await page.evaluate(() => ({
        gate: document.querySelector('#cdl [data-gate=strategy]')?.innerText || '',
        button: !!document.querySelector('#cdl [data-a=stratApprove]'),
        zip: document.querySelector('#cdl [data-a=ex][data-v=zip]').disabled,
        calendar: document.querySelector('#cdl [data-a=ex][data-v=calendar]').disabled,
        source: document.querySelector('#cdl [data-a=ex][data-v=campjson]').disabled,
        strategy: document.querySelector('#cdl [data-a=ex][data-v=strategy]').disabled,
      }));
      assert.match(before.gate, lang === 'ar' ? /التنزيل موقوف حتى يعتمد شخص الاستراتيجية/ : /Download is blocked until a person approves the strategy\./, `${lang}: one-line reason`);
      assert.deepEqual({ ...before, gate: undefined }, { gate: undefined, button: true, zip: true, calendar: true, source: true, strategy: false }, `${lang}: blocked; the strategy report stays readable`);
      // a per-post download in Studio is refused too, and nothing is downloaded
      let downloads = 0;
      const count = () => { downloads++; };
      page.on('download', count);
      await page.evaluate(() => { const k = curCamp(C()); A.aDl(k.assets.find((a) => a.type === 'post').id); });
      await page.waitForTimeout(800);
      assert.equal(downloads, 0, `${lang}: no file before approval`);
      assert.match(await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.innerText).pop() || ''), lang === 'ar' ? /اعتمد الاستراتيجية/ : /Approve strategy/);

      // a person approves → downloads open, and the package really downloads
      await page.click('#cdl [data-a=stratApprove]');
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ approved: curCamp(C()).approved === true, gate: !!document.querySelector('#cdl [data-gate=strategy]'), zip: document.querySelector('#cdl [data-a=ex][data-v=zip]').disabled }));
      assert.deepEqual(after, { approved: true, gate: false, zip: false }, `${lang}: allowed after approval`);
      const dl = page.waitForEvent('download', { timeout: 30_000 });
      await page.click('#cdl [data-a=ex][data-v=zip]');
      const file = await dl;
      assert.match(file.suggestedFilename(), /\.zip$/, `${lang}: the campaign package downloads`);
      page.off('download', count);
    }
    assert.deepEqual(errors, []);
  });
});
