// P4 (2026-11-20) on screen, in English and Arabic: who approved a fact and until when; "approved before tracking
// began"; a fact past its review date stops counting, blocks the campaign that uses it, and comes back when re-approved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const T = {
  en: { recorded: /Approved by flownest-baseline@example\.test on (\d{4}-\d{2}-\d{2}) · review by (\d{4}-\d{2}-\d{2})/, legacy: 'Approved before tracking began.', due: 'Review due since', blocked: /Download is blocked\. .* is past its review date/, needs: /past their review date/ },
  ar: { recorded: /اعتمدها flownest-baseline@example\.test في (\d{4}-\d{2}-\d{2}) · المراجعة قبل (\d{4}-\d{2}-\d{2})/, legacy: 'اعتُمدت قبل بدء تسجيل الاعتمادات.', due: 'المراجعة مستحقة منذ', blocked: /التنزيل موقوف\. .* تجاوزت تاريخ مراجعتها/, needs: /تجاوزت تاريخ مراجعتها/ },
};

test('fact approvals on screen: recorded approver and review date, legacy, expiry blocks the campaign until re-approved (EN and AR)', { timeout: 400_000 }, async () => {
  await withFlowNest(async ({ page, errors, db }) => {
    const co = await page.evaluate(() => C().id);
    // FlowNest's facts were approved in the page: the server recorded each decision with the person and a review date
    const rec = db.prepare('SELECT COUNT(*) n, SUM(legacy) l, MIN(review_by) r FROM fact_approvals WHERE company_id = ? AND status = ?').get(co, 'approved');
    assert.equal(rec.n, 44);
    assert.equal(rec.l, 0, 'approved in this page: recorded as the person, not "before tracking began"');
    const d0 = new Date();
    const today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`; // shown in the viewer's own date
    const year = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
    assert.equal(rec.r, year);

    const touched = new Set();
    for (const lang of ['en', 'ar']) {
      const t = T[lang];
      await page.evaluate(async (l) => { if (S.lang !== l) A.lang(); await decSync(C()); A.go('audit'); for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50)); }, lang);
      // a campaign in one click; its strategy approved: it records the facts it uses and can be downloaded
      await page.click('main .ns-list [data-a=recCamp]');
      await page.waitForTimeout(500);
      await page.evaluate(() => A.go('qa'));
      await page.waitForTimeout(400);
      await page.click('#cdl [data-a=stratApprove]');
      await page.waitForTimeout(500);
      const camp = await page.evaluate(() => { const k = curCamp(C()); return { ids: k.factIds, zip: document.querySelector('#cdl [data-a=ex][data-v=zip]').disabled, used: document.querySelector('#cdl [data-facts-used]')?.innerText || '' }; });
      assert.ok(camp.ids.length > 0, `${lang}: the campaign records the facts it uses`);
      assert.equal(camp.zip, false, `${lang}: downloadable while every linked fact is approved`);
      const fid = camp.ids.find((x) => !touched.has(x)); // a fact the other language did not change
      assert.ok(fid, `${lang}: an untouched linked fact`);
      touched.add(fid);

      // the fact's details show who approved it and until when
      const line = async () => page.evaluate(async (id) => { A.go('know'); await new Promise((r) => setTimeout(r, 300)); A.kEv(id); await new Promise((r) => setTimeout(r, 400)); const p = document.querySelector('[data-appr]'); return p ? { k: p.dataset.appr, t: p.innerText.replace(/\s+/g, ' ').trim() } : null; }, fid);
      let l1 = await line();
      assert.equal(l1.k, 'recorded', `${lang}: ${JSON.stringify(l1)}`);
      const m = l1.t.match(t.recorded);
      assert.ok(m && m[1] === today && m[2] === year, `${lang}: ${l1.t}`);
      await page.evaluate(() => { MODAL = null; R(); });

      // the review date passes → the fact stops counting and blocks the campaign
      db.prepare("UPDATE fact_approvals SET review_by = '2020-01-01' WHERE company_id = ? AND fact_id = ?").run(co, fid);
      await page.evaluate(async () => { await decSync(C()); A.go('qa'); });
      await page.waitForTimeout(400);
      const blocked = await page.evaluate(() => ({ gate: document.querySelector('#cdl [data-gate=facts]')?.innerText || '', zip: document.querySelector('#cdl [data-a=ex][data-v=zip]').disabled }));
      assert.match(blocked.gate, t.blocked, `${lang}: ${blocked.gate}`);
      assert.equal(blocked.zip, true);
      let downloads = 0;
      const count = () => { downloads++; };
      page.on('download', count);
      await page.evaluate(() => { const k = curCamp(C()); A.aDl(k.assets.find((a) => a.type === 'post').id); });
      await page.waitForTimeout(600);
      assert.equal(downloads, 0, `${lang}: no download while a linked fact is expired`);
      page.off('download', count);
      assert.match(await page.evaluate(() => { A.go('audit'); return document.querySelector('main').textContent; }), t.needs, `${lang}: Next steps lists it under Needs you (P7: moved from Home)`);
      l1 = await line();
      assert.equal(l1.k, 'expired');
      assert.ok(l1.t.includes(t.due) && l1.t.includes('2020-01-01'), `${lang}: ${l1.t}`);

      // re-approve: a new decision with a new review date; the campaign can be downloaded again
      await page.click('[data-appr=expired] [data-a=kReapprove]');
      await page.waitForTimeout(400);
      await page.evaluate(async () => { MODAL = null; await syncNow(); await synced(C()); await decWait(C()); });
      const back = db.prepare('SELECT review_by, legacy FROM fact_approvals WHERE company_id = ? AND fact_id = ?').get(co, fid);
      assert.deepEqual({ ...back }, { review_by: year, legacy: 0 });
      await page.evaluate(() => A.go('qa'));
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => document.querySelector('#cdl [data-a=ex][data-v=zip]').disabled), false, `${lang}: allowed again after re-approval`);

      // an approval from before tracking began is labelled so
      db.prepare('UPDATE fact_approvals SET legacy = 1, by_user = NULL, at = NULL, review_by = NULL WHERE company_id = ? AND fact_id = ?').run(co, fid);
      await page.evaluate(async () => { await decSync(C()); });
      l1 = await line();
      assert.deepEqual(l1, { k: 'legacy', t: t.legacy }, lang);
      await page.evaluate(() => { MODAL = null; R(); });
    }
    assert.deepEqual(errors, []);
  });
});
