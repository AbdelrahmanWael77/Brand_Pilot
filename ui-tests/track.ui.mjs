// P6 (2026-11-20): Next steps → Track record, EN and AR. The FlowNest demo (demo mode) comes with 5 earlier steps on its
// synthetic data, evaluated by the server's real evaluation and labelled "Demo history (synthetic data)"; the score is
// shown because 5 steps are evaluated. A campaign and a task made from recommendations now are saved as real steps and
// wait for data until the end of their window. Attribution limits are always on the card. (No score before 5 evaluated
// steps, and no demo history without demo mode: test/track.test.js, test/track-demo.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const T = {
  en: { h: 'Track record', demo: 'Demo history (synthetic data)', note: /5 earlier steps were created by the FlowNest demo setup on its synthetic data, and evaluated by the same code as real steps\. They are not real results/, wait: /Waiting for data until \d{1,2} \w+ \d{4}/, lim: 'A result says what happened after a step, not that the step caused it.', score: (m) => new RegExp(`${m} of 5 evaluated steps moved their number the expected way \\(\\d+%\\) — Demo history \\(synthetic data\\)\\.`) },
  ar: { h: 'سجل النتائج', demo: 'سجل تجريبي (بيانات غير حقيقية)', note: /أنشأ العرض التجريبي لـFlowNest 5 خطوات سابقة على بياناته التجريبية/, wait: /بانتظار البيانات حتى/, lim: 'تقول النتيجة ما حدث بعد الخطوة، لا أن الخطوة هي السبب.', score: (m) => new RegExp(`${m} من 5 خطوات مُقيَّمة حرّكت رقمها في الاتجاه المتوقع \\(\\d+%\\) — سجل تجريبي \\(بيانات غير حقيقية\\)\\.`) },
};
const card = (page) => page.evaluate(async () => {
  A.go('audit');
  for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 100)); if (TREC[C().id]?.r && !TREC[C().id].busy) break; }
  R();
  const el = document.querySelector('main [data-track-card]');
  return el && {
    text: el.textContent.replace(/\s+/g, ' '),
    steps: [...el.querySelectorAll('[data-track-step]')].map((x) => ({ s: x.dataset.trackStep, demo: x.hasAttribute('data-track-demo-step'), badge: x.querySelector('.b-syn')?.textContent || '' })),
    score: !!el.querySelector('[data-track-score]'), note: !!el.querySelector('[data-track-demo]'), limits: !!el.querySelector('[data-track-limits]'),
  };
});

test('Track record: FlowNest demo history (synthetic, evaluated by the server) with its score; new steps wait for data (EN, AR)', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors, db }) => {
    const co = await page.evaluate(() => C().id);
    // the demo setup saved and evaluated 5 demo steps on the server
    const demo = db.prepare('SELECT outcome, result, baseline FROM track_steps WHERE company_id = ? AND demo = 1').all(co);
    assert.equal(demo.length, 5);
    assert.ok(demo.every((s) => ['met', 'no_change', 'not_met'].includes(s.outcome) && s.result !== null));
    const met = demo.filter((s) => s.outcome === 'met').length;
    const ev = db.prepare("SELECT detail FROM trail WHERE company_id = ? AND kind = 'evaluation'").all(co).map((r) => JSON.parse(r.detail));
    assert.equal(ev.length, 5);
    assert.ok(ev.every((d) => d.demo === true));

    // a campaign and a task from two recommendations of the period on screen: real steps
    await page.evaluate(async () => { S.ui.range = '28'; A.go('audit'); for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50)); });
    await page.click('main .ns-list [data-a=recCamp]');
    for (let i = 0; i < 50 && db.prepare('SELECT COUNT(*) n FROM track_steps WHERE company_id = ? AND demo = 0').get(co).n < 1; i++) await page.waitForTimeout(100);
    const taskRec = await page.evaluate(() => { const x = recsGet(C()).items.find((i) => i.basis !== 'insufficient' && !C().campaigns.some((k) => k.rec === i.id)); A.recTask(x.id); return x.id; });
    for (let i = 0; i < 50 && db.prepare('SELECT COUNT(*) n FROM track_steps WHERE company_id = ? AND demo = 0').get(co).n < 2; i++) await page.waitForTimeout(100);
    const real = db.prepare('SELECT kind, rec_id, metric, outcome FROM track_steps WHERE company_id = ? AND demo = 0 ORDER BY kind').all(co).map((r) => ({ ...r }));
    assert.deepEqual(real.map((s) => s.kind), ['campaign', 'task']);
    assert.equal(real[1].rec_id, taskRec);
    assert.ok(real.every((s) => s.outcome === null && s.metric), 'real steps wait, each with a metric to move');

    for (const lang of ['en', 'ar']) {
      await page.evaluate((l) => { if (S.lang !== l) A.lang(); if (TREC[C().id]) TREC[C().id].at = 0; }, lang);
      const c = await card(page);
      const t = T[lang];
      assert.ok(c && c.text.includes(t.h), `${lang}: card on Next steps`);
      assert.ok(c.note, `${lang}: demo note`);
      assert.match(c.text, t.note);
      assert.equal(c.score, true, `${lang}: score from the 5 evaluated demo steps`);
      assert.match(c.text, t.score(met), `${lang}: ${c.text.slice(0, 500)}`);
      const d = c.steps.filter((x) => x.demo);
      assert.equal(d.length, 5);
      assert.ok(d.every((x) => x.badge === t.demo), `${lang}: every demo step is labelled`);
      assert.ok(c.steps.filter((x) => !x.demo).every((x) => x.s === 'waiting' && x.badge === ''), `${lang}: real steps wait, no demo label`);
      assert.match(c.text, t.wait);
      assert.ok(c.limits && c.text.includes(t.lim), `${lang}: attribution limits`);
    }
    assert.deepEqual(errors, []);
  });
});
