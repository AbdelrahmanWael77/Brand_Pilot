// P3-pre (2026-11-20): the Director uses the period on screen. For 7, 28, 90 days and all data, in English and Arabic,
// the answer's "Period used" line and the Director's grounding line show the same period as Next steps.
// Without an AI key the rules engine answers; the AI path is covered by test/director-period.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const LABEL = { en: { 7: 'last 7 days', 28: 'last 28 days', 90: 'last 90 days', all: 'all imported data' }, ar: { 7: 'آخر 7 أيام', 28: 'آخر 28 يوماً', 90: 'آخر 90 يوماً', all: 'كل البيانات المستوردة' } };

test('every Director answer states the period on screen (7, 28, 90 days, all data), EN and AR', { timeout: 400_000 }, async () => {
  await withFlowNest(async ({ page, errors }) => {
    for (const lang of ['en', 'ar']) {
      for (const range of ['7', '28', '90', 'all']) {
        const r = await page.evaluate(async ([l, range]) => {
          if (S.lang !== l) A.lang();
          S.ui.range = range;
          A.go('audit');
          for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((x) => setTimeout(x, 50));
          const per = recsGet(C()).period;
          S.ui.dth = null;
          A.askQ(l === 'ar' ? 'ما أكبر نقطة ضعف تسويقية لدينا؟' : 'What is our biggest marketing weakness?');
          for (let i = 0; i < 100 && !document.querySelector('main .dv-per'); i++) await new Promise((x) => setTimeout(x, 50));
          const lines = [...document.querySelectorAll('main .dv-per')];
          return { per, answer: lines.length ? lines[lines.length - 1].textContent : '', ground: document.querySelector('main .dv-gr summary')?.innerText || '', view: S.ui.view };
        }, [lang, range]);
        assert.equal(r.view, 'director');
        assert.ok(r.per, `${lang} ${range}: a period on screen`);
        const span = `${r.per.from} → ${r.per.to}`;
        assert.ok(r.answer.includes(span) && r.answer.includes(LABEL[lang][range]), `${lang} ${range} answer: ${r.answer}`);
        // P7 checkpoint 2: the grounding line above the chat was removed by the owner; each answer still states its period
      }
    }
    assert.deepEqual(errors, []);
  });
});
