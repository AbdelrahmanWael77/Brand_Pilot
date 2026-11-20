// P6 (2026-11-20): Next steps → Track record, EN and AR. A campaign and a task made from recommendations are saved as
// steps (waiting for data until the end of their window, no score); then five earlier steps whose windows the synthetic
// FlowNest data covers are evaluated by the server, written to the trail, and the score appears. Attribution limits are
// always on the card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withFlowNest } from './lib/flownest.mjs';

const T = {
  en: { h: 'Track record', wait: /No score yet: it is shown after 5 evaluated steps \(now 0\)\. Waiting for data until \d{1,2} \w+ \d{4}\./, lim: 'A result says what happened after a step, not that the step caused it.', score: /5 of 5 evaluated steps moved their number the expected way \(100%\)/ },
  ar: { h: 'سجل النتائج', wait: /لا نتيجة بعد: تظهر بعد 5 خطوات مُقيَّمة \(حالياً 0\)\. بانتظار البيانات حتى/, lim: 'تقول النتيجة ما حدث بعد الخطوة، لا أن الخطوة هي السبب.', score: /5 من 5 خطوات مُقيَّمة حرّكت رقمها في الاتجاه المتوقع \(100%\)/ },
};
const card = (page) => page.evaluate(async () => {
  A.go('audit');
  for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 100)); if (TREC[C().id]?.r && !TREC[C().id].busy) break; }
  R();
  const el = document.querySelector('main [data-track-card]');
  return el && { text: el.textContent.replace(/\s+/g, ' '), steps: [...el.querySelectorAll('[data-track-step]')].map((x) => x.dataset.trackStep), score: !!el.querySelector('[data-track-score]'), limits: !!el.querySelector('[data-track-limits]') };
});

test('Track record: steps saved from a campaign and a task, waiting for data, then the score after 5 evaluations (EN, AR)', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors, db }) => {
    const co = await page.evaluate(() => C().id);
    // a campaign and a task from two recommendations of the period on screen
    await page.evaluate(async () => { S.ui.range = '28'; A.go('audit'); for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50)); });
    await page.click('main .ns-list [data-a=recCamp]');
    await page.waitForTimeout(500);
    const taskRec = await page.evaluate(() => { const x = recsGet(C()).items.find((i) => i.basis !== 'insufficient' && !C().campaigns.some((k) => k.rec === i.id)); A.recTask(x.id); return x.id; });
    for (let i = 0; i < 50 && db.prepare('SELECT COUNT(*) n FROM track_steps WHERE company_id = ?').get(co).n < 2; i++) await page.waitForTimeout(100);
    const saved = db.prepare('SELECT kind, rec_id, metric, start, window_end, outcome FROM track_steps WHERE company_id = ? ORDER BY kind').all(co).map((r) => ({ ...r }));
    assert.equal(saved.length, 2);
    assert.deepEqual(saved.map((s) => s.kind), ['campaign', 'task']);
    assert.equal(saved[1].rec_id, taskRec);
    assert.ok(saved.every((s) => s.outcome === null && s.metric), 'both have a metric to move');
    assert.ok(db.prepare("SELECT COUNT(*) n FROM trail WHERE company_id = ? AND kind = 'step_tracked'").get(co).n === 2);

    for (const lang of ['en', 'ar']) {
      await page.evaluate((l) => { if (S.lang !== l) A.lang(); TREC[C().id] && (TREC[C().id].at = 0); }, lang);
      const c = await card(page);
      assert.ok(c, `${lang}: card on Next steps`);
      assert.ok(c.text.includes(T[lang].h));
      assert.match(c.text, T[lang].wait, `${lang}: ${c.text.slice(0, 400)}`);
      assert.equal(c.score, false, `${lang}: no score before 5 evaluated steps`);
      assert.ok(c.limits && c.text.includes(T[lang].lim), `${lang}: attribution limits`);
    }

    // five earlier steps whose 28-day windows end before the last FlowNest data day; their baselines were saved low,
    // so the synthetic after-data moves the site enquiry rate up for each
    const last = db.prepare("SELECT MAX(date) d FROM data_rows WHERE company_id = ? AND kind = 'ga4'").get(co).d;
    const add = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    for (let i = 0; i < 5; i++) {
      const start = add(last, -27 - i);
      db.prepare(`INSERT INTO track_steps (id, company_id, kind, ref, rec_id, title_en, title_ar, metric, direction, baseline, baseline_n, baseline_from, baseline_to, target, window_days, start, window_end, created_by, created_at)
        VALUES (?, ?, 'task', ?, 'ch-best', 'Earlier step ${i + 1}', 'خطوة سابقة ${i + 1}', 'enquiry_rate', 'up', 0.0001, 5000, ?, ?, 0.000105, 28, ?, ?, NULL, ?)`)
        .run(crypto.randomUUID(), co, `old-${i}`, add(start, -28), add(start, -1), start, add(start, 27), `${add(start, 0)}T09:00:00.000Z`);
    }
    for (const lang of ['ar', 'en']) {
      await page.evaluate((l) => { if (S.lang !== l) A.lang(); TREC[C().id].at = 0; }, lang);
      const c = await card(page);
      assert.equal(c.score, true, `${lang}: score after 5 evaluated steps`);
      assert.match(c.text, T[lang].score, `${lang}: ${c.text.slice(0, 300)}`);
      assert.equal(c.steps.filter((s) => s === 'met').length, 5);
      assert.equal(c.steps.filter((s) => s === 'waiting').length, 2);
      assert.ok(c.text.includes(T[lang].lim));
    }
    // each evaluation is in the trail, once
    const ev = db.prepare("SELECT detail FROM trail WHERE company_id = ? AND kind = 'evaluation'").all(co).map((r) => JSON.parse(r.detail));
    assert.equal(ev.length, 5);
    assert.ok(ev.every((d) => d.outcome === 'met' && d.metric === 'enquiry_rate' && d.result > d.baseline));
    assert.deepEqual(errors, []);
  });
});
