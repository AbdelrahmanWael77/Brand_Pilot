// P5 fix (owner 2026-11-20): a strategy approval counts only when the server has recorded it. While the request runs and
// when it fails, the campaign stays not approved and downloads stay blocked; a failure shows an error with "Try again".
// The failed request is simulated by answering the approve-strategy call with a server error. EN and AR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const T = { en: { retry: 'Try again', err: /could not be recorded on the server/ }, ar: { retry: 'حاول مجدداً', err: /تعذّر تسجيل الاعتماد على الخادم/ } };

test('strategy approval waits for the server: a failed request keeps downloads blocked and offers Try again (EN, AR)', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors, db }) => {
    const co = await page.evaluate(() => C().id);
    const recorded = () => db.prepare("SELECT COUNT(*) n FROM trail WHERE company_id = ? AND kind = 'strategy_approval'").get(co).n;
    const state = () => page.evaluate(() => {
      const k = curCamp(C());
      const btn = document.querySelector('#cdl [data-a=stratApprove]');
      return { approved: k.approved === true, trail: !!k.stratTrail, zip: document.querySelector('#cdl [data-a=ex][data-v=zip]').disabled, gate: !!document.querySelector('#cdl [data-gate=strategy]'), err: document.querySelector('#cdl [data-strat-err]')?.innerText || '', btn: btn ? btn.innerText.trim() : null, busy: !!btn?.disabled };
    });
    for (const lang of ['en', 'ar']) {
      await page.evaluate(async (l) => { if (S.lang !== l) A.lang(); A.go('audit'); for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50)); }, lang);
      await page.click('main .ns-list [data-a=recCamp]'); // a new draft campaign (not approved)
      await page.waitForTimeout(600);
      await page.evaluate(() => A.go('qa'));
      const before = recorded();

      // 1. the server is slow: while it records, nothing is approved yet
      let release;
      const held = new Promise((r) => { release = r; });
      await page.route('**/approve-strategy', async (route) => { await held; await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server_error"}' }); });
      await page.click('#cdl [data-a=stratApprove]');
      await page.waitForTimeout(300);
      const waiting = await state();
      assert.equal(waiting.approved, false, `${lang}: not approved while the request runs`);
      assert.equal(waiting.zip, true, `${lang}: download blocked while the request runs`);
      assert.equal(waiting.busy, true, `${lang}: the button waits`);

      // 2. the request fails: still not approved, still blocked, an error and Try again
      release();
      await page.waitForTimeout(600);
      const failed = await state();
      assert.equal(failed.approved, false, `${lang}: not approved after a failure`);
      assert.equal(failed.trail, false);
      assert.equal(failed.zip, true, `${lang}: download stays blocked`);
      assert.equal(failed.gate, true);
      assert.match(failed.err, T[lang].err, `${lang}: error shown`);
      assert.equal(failed.btn, T[lang].retry, `${lang}: Try again`);
      assert.equal(recorded(), before, 'nothing recorded');
      // a download attempt is refused too
      await page.evaluate(() => { const k = curCamp(C()); A.aDl(k.assets.find((a) => a.type === 'post').id); });
      assert.equal(await page.evaluate(() => typeof stratOk === 'function' && stratOk(curCamp(C()))), false);
      // after a reload of the screen it is still blocked (the failure did not leave an approval behind)
      await page.evaluate(() => { A.go('studio'); A.go('qa'); });
      assert.equal((await state()).zip, true);

      // 3. Try again with the server reachable: recorded, approved, downloads open
      await page.unroute('**/approve-strategy');
      await page.click('#cdl [data-a=stratApprove]');
      for (let i = 0; i < 40 && !(await state()).approved; i++) await page.waitForTimeout(100);
      const ok = await state();
      assert.equal(ok.approved, true, `${lang}: approved once recorded`);
      assert.equal(ok.trail, true);
      assert.equal(ok.zip, false, `${lang}: download open`);
      assert.equal(ok.err, '');
      assert.equal(recorded(), before + 1, 'recorded once');
    }
    assert.deepEqual(errors.filter((e) => !/500|server_error/.test(e)), []);
  });
});
