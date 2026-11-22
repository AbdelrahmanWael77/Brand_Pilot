// P7 last fixes (2026-11-22): a Content series post shows its flagged statements on the post review, one plain line each
// with "Fix" (as in campaign Review drafts). While something is flagged the main button says "Fix N things first" and
// takes the user to it; a number removed from the words is fixed, a claim is cleared by "It's correct". Then the button
// is "Approve and download". The flagged post is set up in the page (no AI is called).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

test('Content series post review: flagged lines with Fix, "Fix N things first", then Approve and download', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    const sid = await page.evaluate(() => {
      A.go('series');
      const v = { name: 'Team tips', purpose: 'Short tips.', channel: 'linkedin', objective: 'engagement', audience: '' };
      A.sxCreate({ get: (k) => v[k] || '' });
      const id = S.ui.sx; A.sxWizOk(id);
      C().sxd[id] = { topic: 'Follow-ups', lang: 'en', fmt: 'single', aspect: null,
        copy: { l1: 'Follow up fast', l2: '', sub: '', pts: ['', '', ''], foot: '', caption: 'Teams that follow up close 40% more deals. FlowNest is the fastest tool.', cta: '' },
        concept: '', drafted: true, vars: [{ id: 'v-a', status: 'ready', layout: 'stack', made: 'stack', ill: null, model: 'upload' }],
        pick: 'v-a', rec: null, facts: [], warn: ['40'], claims: ['FlowNest is the fastest tool.'], ack: false, at: Date.now() };
      R(); return id;
    });
    const state = () => page.evaluate(() => ({
      rows: [...document.querySelectorAll('.sx-res [data-flags7] .rv7-pb')].map((p) => p.querySelector('span').textContent),
      fix: [...document.querySelectorAll('.sx-res [data-flags7] [data-a=sxFix7]')].length,
      main: document.querySelector('[data-sxap]').textContent.trim(), act: document.querySelector('[data-sxap]').dataset.a,
    }));
    let s = await state();
    assert.deepEqual(s.rows, ['“40” is not in your approved company info.', 'Check this claim: FlowNest is the fastest tool.']);
    assert.equal(s.fix, 2);
    assert.equal(s.main, 'Fix 2 things first');
    assert.equal(s.act, 'sxFix7');
    // the main button takes the user to the first flag: the caption, with "40" selected
    await page.click('[data-sxap]');
    const sel = await page.evaluate(() => { const e = document.activeElement; return { k: e.dataset.k, t: e.value.slice(e.selectionStart, e.selectionEnd) }; });
    assert.deepEqual(sel, { k: 'caption', t: '40' });
    // removing the number from the words fixes it
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    s = await state();
    assert.equal(s.main, 'Fix 1 thing first');
    assert.deepEqual(s.rows, ['Check this claim: FlowNest is the fastest tool.']);
    // approving is still refused while a claim is open
    await page.evaluate((id) => A.sxSave(id, { dataset: { k: 'approve', v: id } }), sid);
    assert.equal(await page.evaluate(() => C().creatives.length), 0); // nothing was approved or saved
    // "It's correct" clears the claim; the main action is now Approve and download
    await page.click('.sx-res [data-a=sxOk7]');
    s = await state();
    assert.deepEqual(s.rows, []);
    assert.equal(s.main, 'Approve and download');
    assert.equal(s.act, 'sxApDl');
    // Arabic
    await page.evaluate(() => { const d = Object.values(C().sxd)[0]; d.okF = []; d.copy.caption += ' 40'; A.lang(); });
    s = await state();
    assert.equal(s.main, 'أصلح أمرين أولاً');
    assert.equal(s.rows.length, 2);
    assert.deepEqual(errors, []);
  });
});
