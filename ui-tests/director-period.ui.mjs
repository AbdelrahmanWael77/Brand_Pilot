// Owner rule (2026-11-20), until task P3-pre: the line under each Director answer says which period it used.
// Without an AI key the rules engine answers; it reads the recommendations of the period on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

test('every Director answer states the period it used (rules engine: the period on screen), EN and AR', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    for (const lang of ['en', 'ar']) {
      const r = await page.evaluate(async (l) => {
        if (S.lang !== l) A.lang();
        A.go('audit');
        for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((x) => setTimeout(x, 50));
        const per = recsGet(C()).period;
        A.askQ(l === 'ar' ? 'ما أكبر نقطة ضعف تسويقية لدينا؟' : 'What is our biggest marketing weakness?');
        for (let i = 0; i < 100 && !document.querySelector('main .dv-per'); i++) await new Promise((x) => setTimeout(x, 50));
        const lines = [...document.querySelectorAll('main .dv-per')];
        return { per, last: lines.length ? lines[lines.length - 1].innerText : '', view: S.ui.view };
      }, lang);
      assert.equal(r.view, 'director');
      assert.ok(r.per, 'a period is on screen');
      assert.ok(r.last.includes(`${r.per.from} → ${r.per.to}`), `${lang}: ${r.last}`);
      assert.match(r.last, lang === 'ar' ? /الفترة المستخدمة: .*آخر 28 يوماً/ : /^Period used: .* \(last 28 days\)$/);
    }
    assert.deepEqual(errors, []);
  });
});
