// P7 (2026-11-22): a Content series post shows its flagged statements on the post review, one plain line each with
// "Fix" (as in campaign Review drafts). While something is flagged the main button says "Fix N things first" and takes
// the user to it; a number removed from the words is fixed, a claim is cleared by "It's correct", which is recorded on
// the server (trail: claim_check) before the line clears. "Approve and download" downloads only after the server records
// the approval (trail: series_approval); when the server refuses, nothing is downloaded or approved. EN and AR.
// The flagged post is set up in the page (no AI is called).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const T = {
  en: { rows: ['“40” is not in your approved company info.', 'Check this claim: FlowNest is the fastest tool.'], two: 'Fix 2 things first', one: 'Fix 1 thing first', go: 'Approve and download', caption: 'Teams that follow up close 40% more deals. FlowNest is the fastest tool.', claim: 'FlowNest is the fastest tool.', summary: 'Series post approved (Team tips): Follow-ups' },
  ar: { rows: ['«40» غير موجود في معلومات شركتك المعتمدة.', 'تحقّق من هذه العبارة: FlowNest هي أسرع أداة.'], two: 'أصلح أمرين أولاً', one: 'أصلح أمراً واحداً أولاً', go: 'اعتمد ونزّل', caption: 'الفرق التي تتابع تغلق 40% صفقات أكثر. FlowNest هي أسرع أداة.', claim: 'FlowNest هي أسرع أداة.', summary: 'اعتُمد منشور في السلسلة (Team tips): المتابعة' },
};

test('Content series post review: flagged lines with Fix, "It\'s correct" and approval recorded on the server, download only after (EN, AR)', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors, db }) => {
    const co = await page.evaluate(() => C().id);
    const sid = await page.evaluate(() => {
      A.go('series');
      const v = { name: 'Team tips', purpose: 'Short tips.', channel: 'linkedin', objective: 'engagement', audience: '' };
      A.sxCreate({ get: (k) => v[k] || '' });
      const id = S.ui.sx; A.sxWizOk(id); return id;
    });
    const state = () => page.evaluate(() => ({
      rows: [...document.querySelectorAll('.sx-res [data-flags7] .rv7-pb')].map((p) => p.querySelector('span').textContent),
      fix: document.querySelectorAll('.sx-res [data-flags7] [data-a=sxFix7]').length,
      main: document.querySelector('[data-sxap]').textContent.trim(), act: document.querySelector('[data-sxap]').dataset.a,
    }));
    const trail = (kind) => db.prepare('SELECT * FROM trail WHERE company_id = ? AND kind = ? ORDER BY rowid').all(co, kind);
    let downloads = 0;
    page.on('download', () => { downloads++; });

    for (const lang of ['en', 'ar']) {
      const t = T[lang];
      await page.evaluate(({ id, l, t }) => {
        if (S.lang !== l) A.lang();
        C().sxd[id] = { topic: l === 'ar' ? 'المتابعة' : 'Follow-ups', lang: l, fmt: 'single', aspect: null,
          copy: { l1: l === 'ar' ? 'تابع بسرعة' : 'Follow up fast', l2: '', sub: '', pts: ['', '', ''], foot: '', caption: t.caption, cta: '' },
          concept: '', drafted: true, vars: [{ id: 'v-' + l, status: 'ready', layout: 'stack', made: 'stack', ill: null, model: 'upload' }],
          pick: 'v-' + l, rec: null, facts: [], warn: ['40'], claims: [t.claim], ack: false, at: Date.now() };
        A.sxOpen(id);
      }, { id: sid, l: lang, t });
      let s = await state();
      assert.deepEqual(s.rows, t.rows, lang);
      assert.equal(s.fix, 2);
      assert.equal(s.main, t.two);
      assert.equal(s.act, 'sxFix7');
      // the series header has no button; the topic box keeps "Write the post"
      assert.equal(await page.evaluate(() => !!document.querySelector('.sx-ph7 .btn')), false);
      assert.equal(await page.evaluate(() => !!document.querySelector('form.sx-topic button.btn.pri')), true);

      // the main button takes the user to the first flag: the caption, with "40" selected; removing it fixes it
      await page.click('[data-sxap]');
      const sel = await page.evaluate(() => { const e = document.activeElement; return { k: e.dataset.k, t: e.value.slice(e.selectionStart, e.selectionEnd) }; });
      assert.deepEqual(sel, { k: 'caption', t: '40' });
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(100);
      s = await state();
      assert.equal(s.main, t.one);
      assert.deepEqual(s.rows, [t.rows[1]]);

      // "It's correct" is recorded on the server (who, when, which line) before the line clears
      const before = trail('claim_check').length;
      await page.click('.sx-res [data-a=sxOk7]');
      await page.waitForFunction(() => !document.querySelector('.sx-res [data-flags7] .rv7-pb'));
      const ok = trail('claim_check');
      assert.equal(ok.length, before + 1);
      assert.equal(ok.at(-1).subject, sid);
      assert.ok(ok.at(-1).user_email && ok.at(-1).at);
      assert.equal(JSON.parse(ok.at(-1).detail).text, t.claim);
      s = await state();
      assert.equal(s.main, t.go);
      assert.equal(s.act, 'sxApDl');

      // a number the browser never flagged (typed into the words, outside the page's list): the server finds it,
      // refuses, and the line appears on the post; nothing is downloaded
      const extra = lang === 'ar' ? '77' : '99'; // a line confirmed once stays confirmed in its series: a new number per language
      await page.evaluate(({ id, n }) => { const d = C().sxd[id]; d.copy.caption += ' ' + n; R(); }, { id: sid, n: extra });
      const dn = downloads;
      await page.click('[data-sxap]');
      await page.waitForFunction(() => document.querySelectorAll('.sx-res [data-flags7] .rv7-pb').length === 1);
      s = await state();
      assert.equal(s.rows[0], lang === 'ar' ? `«${extra}» غير موجود في معلومات شركتك المعتمدة.` : `“${extra}” is not in your approved company info.`);
      assert.equal(s.main, t.one);
      assert.equal(downloads, dn);
      await page.click('.sx-res [data-a=sxOk7]');
      await page.waitForFunction(() => !document.querySelector('.sx-res [data-flags7] .rv7-pb'));
      assert.equal(JSON.parse(trail('claim_check').at(-1).detail).flagKind, 'number');

      // the server refuses: nothing is downloaded, nothing is approved
      const approved = () => page.evaluate(() => C().creatives.filter((k) => k.status === 'approved').length);
      const a0 = await approved();
      await page.route('**/series/*/approve', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"down"}' }));
      const d0 = downloads, n0 = trail('series_approval').length;
      await page.click('[data-sxap]');
      await page.waitForTimeout(800);
      assert.equal(downloads, d0, 'no download without the server');
      assert.equal(await approved(), a0);
      assert.equal(trail('series_approval').length, n0);
      await page.unroute('**/series/*/approve');

      // the server records it: then the download, and the approved post keeps the trail id
      const dl = page.waitForEvent('download');
      await page.click('[data-sxap]');
      await dl;
      const ap = trail('series_approval');
      assert.equal(ap.length, n0 + 1);
      assert.equal(JSON.parse(ap.at(-1).detail).flags.find((f) => f.kind === 'claim').check, ok.at(-1).id);
      const k = await page.evaluate(() => C().creatives.at(-1));
      assert.equal(k.status, 'approved');
      assert.equal(k.trailId, ap.at(-1).id);
      assert.equal(await approved(), a0 + 1);
      const summary = await page.evaluate(async ({ co, l }) => (await (await fetch(`/api/companies/${co}/trail?lang=${l}&kind=series_approval`)).json()).trail[0].summary, { co, l: lang });
      assert.equal(summary, t.summary);
    }
    assert.deepEqual(errors, []);
  });
});
