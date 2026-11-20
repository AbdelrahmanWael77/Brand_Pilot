// The demo-only expiry control, by hand-test steps: open a fact, "Make it past its review date (demo only)", then
// "Re-approve for 12 months" (EN and AR). Expiry and re-approval are also covered without it in fact-approvals.ui.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

test('demo control: a fact expires from the page and comes back with Re-approve (EN and AR)', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    const ids = await page.evaluate(() => C().findings.filter((f) => f.status === 'approved' && f.type === 'fact').slice(0, 2).map((f) => f.id));
    for (const [i, lang] of ['en', 'ar'].entries()) {
      const id = ids[i];
      const open = async () => page.evaluate(async ([l, id]) => { if (S.lang !== l) A.lang(); await decSync(C()); A.go('know'); await new Promise((r) => setTimeout(r, 300)); A.kEv(id); await new Promise((r) => setTimeout(r, 400)); }, [lang, id]);
      await open();
      await page.click('[data-demo-expire] [data-a=kDemoExpire]');
      await page.waitForFunction((id) => (srvOf(C(), C().findings.find((f) => f.id === id)) || {}).status === 'expired', id, { timeout: 15000 });
      await open();
      assert.equal(await page.evaluate(() => document.querySelector('[data-appr]')?.dataset.appr), 'expired', `${lang}: expired`);
      await page.click('[data-appr=expired] [data-a=kReapprove]');
      await page.evaluate(async () => { await syncNow(); await synced(C()); await decWait(C()); });
      await open();
      assert.equal(await page.evaluate(() => document.querySelector('[data-appr]')?.dataset.appr), 'recorded', `${lang}: re-approved`);
      await page.evaluate(() => { MODAL = null; R(); });
    }
    assert.deepEqual(errors, []);
  });
});
