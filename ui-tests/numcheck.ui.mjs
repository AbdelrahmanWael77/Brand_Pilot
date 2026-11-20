// P3 checkpoint 1 (2026-11-20): the number check on screen, English and Arabic, on the synthetic FlowNest demo.
//  - a rules-engine answer produced on the server: every number verified and linked to its source
//  - a pasted answer ("Import Claude answer") with one invented number outside the main claim: shown in grey "unverified"
//  - a pasted answer whose main claim is invented: held back, with the reason
//  - demo mode: "Test the number check" runs the real check on a sample with deliberate mistakes; each one is caught
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const T = {
  en: {
    q: 'What should we do first?', unv: 'unverified', blocked: 'Held back: the main claim could not be verified', demoBtn: 'Test the number check', demoQ: 'Test answer with deliberate errors',
    pasteOk: [{ title: 'Fix the mobile enquiry path', why: 'Mobile visitors enquire at 0.81% against 2.27% on desktop.', evidence: 'Mobile is 62% of sessions.', action: 'Shorten the form; it could add 340 enquiries a month.', metric: 'Mobile enquiry rate', confidence: 'medium' }],
    pasteBad: [{ title: 'Your enquiry rate is 4.9%, the best in your sector', why: 'You convert better than everyone.', evidence: '', action: 'Keep going.', metric: 'Enquiry rate', confidence: 'high' }],
  },
  ar: {
    q: 'ما الذي يجب أن نفعله أولاً؟', unv: 'غير مُتحقَّق', blocked: 'محجوبة: تعذّر التحقق من الادعاء الرئيسي', demoBtn: 'اختبر فحص الأرقام', demoQ: 'إجابة اختبار بأخطاء متعمَّدة',
    pasteOk: [{ title: 'أصلح مسار الاستفسار على الجوال', why: 'معدل الاستفسار على الجوال 0.81% مقابل 2.27% على سطح المكتب.', evidence: 'الجوال يمثل 62% من الجلسات.', action: 'قصّر النموذج؛ قد يضيف ذلك 340 استفساراً شهرياً.', metric: 'معدل الاستفسار على الجوال', confidence: 'medium' }],
    pasteBad: [{ title: 'معدل الاستفسار لديك ٤٫٩٪، الأفضل في قطاعك', why: 'أنت تحوّل أفضل من الجميع.', evidence: '', action: 'استمر.', metric: 'معدل الاستفسار', confidence: 'high' }],
  },
};
const last = (page) => page.evaluate(() => {
  const el = document.getElementById('dv-last');
  return el && {
    ok: el.querySelectorAll('.nv.ok').length, un: [...el.querySelectorAll('.nv.un')].map((x) => x.firstChild.textContent), blocked: !!el.querySelector('[data-nc-blocked]'), badge: el.querySelector('[data-nc-badge]')?.textContent || '',
    sum: !!el.querySelector('[data-nc-sum]'), text: el.textContent.replace(/\s+/g, ' '), rows: [...el.querySelectorAll('[data-nc-row]')].map((r) => [r.dataset.ncRow, r.dataset.ncStatus]),
  };
});

test('the number check on screen: verified numbers link to their source, unverified ones are grey, an invented main claim is held back, and the demo test (EN, AR)', { timeout: 400_000 }, async () => {
  await withFlowNest(async ({ page, errors, db }) => {
    const co = await page.evaluate(() => C().id);
    for (const lang of ['en', 'ar']) {
      const t = T[lang];
      // 1. a rules-engine answer, produced and checked on the server
      await page.evaluate(async ([l, q]) => {
        if (S.lang !== l) A.lang();
        S.ui.range = '28'; S.ui.dth = null;
        await A.ask(null, null, q);
      }, [lang, t.q]);
      let a = await last(page);
      assert.ok(a.ok >= 3, `${lang}: verified numbers (${a.ok})`);
      assert.deepEqual(a.un, [], `${lang}: no unverified number in the rules answer`);
      assert.ok(a.sum && !a.blocked, lang);
      await page.click('#dv-last .nv.ok');
      const src = await page.evaluate(() => ({ src: document.querySelector('[data-nc-src]')?.textContent || '', modal: !!MODAL }));
      assert.ok(src.modal && src.src.length > 0, `${lang}: the source opens`);
      await page.evaluate(() => { MODAL = null; R(); });

      // 2. a pasted answer: the main claim is true, one number further down is invented
      await page.evaluate(async (j) => { S.ui.dth = null; const fd = new FormData(); fd.set('j', JSON.stringify({ recommendations: j })); await A.claudeSave(fd); }, t.pasteOk);
      a = await last(page);
      assert.equal(a.blocked, false, `${lang}: main claim verified`);
      assert.deepEqual(a.un, ['340'], `${lang}: the invented number is marked`);
      assert.ok(a.text.includes(t.unv));
      assert.ok(a.ok >= 3, lang);

      // 3. a pasted answer whose main claim is invented: held back with the reason
      await page.evaluate(async (j) => { S.ui.dth = null; const fd = new FormData(); fd.set('j', JSON.stringify({ recommendations: j })); await A.claudeSave(fd); }, t.pasteBad);
      a = await last(page);
      assert.equal(a.blocked, true, `${lang}: blocked`);
      assert.ok(a.text.includes(t.blocked), lang);
      assert.ok(a.badge.length > 0, `${lang}: blocked badge`);
      assert.ok(!a.text.includes(lang === 'en' ? 'the best in your sector' : 'الأفضل في قطاعك'), `${lang}: the blocked text is not shown`);
      assert.ok(a.text.includes(lang === 'en' ? '4.9%' : '٤٫٩٪'), `${lang}: the reason names the number`);

      // 4. demo mode: the test with deliberate mistakes
      await page.evaluate(() => { S.ui.dth = null; A.go('director'); });
      const btn = await page.evaluate(() => document.querySelector('main [data-nc-demo]')?.textContent.trim() || '');
      assert.equal(btn, t.demoBtn);
      await page.click('main [data-nc-demo]');
      await page.waitForFunction(() => !!document.querySelector('#dv-last [data-nc-table]'), null, { timeout: 15000 });
      a = await last(page);
      assert.ok(a.text.includes(t.demoQ), lang);
      assert.equal(a.rows.length, 7);
      for (const [kind, st] of a.rows) assert.equal(st === 'verified', kind.startsWith('true'), `${lang} ${kind}: ${st}`);
    }
    // the trail: answers produced by the server, the pasted answers, the demo runs (marked demo)
    const rows = db.prepare("SELECT kind, engine, detail FROM trail WHERE company_id = ? AND kind IN ('answer', 'number_check') ORDER BY rowid").all(co).map((r) => ({ kind: r.kind, engine: r.engine, d: JSON.parse(r.detail) }));
    assert.equal(rows.filter((r) => r.kind === 'answer' && r.engine === 'rules' && r.d.producedBy === 'server').length, 2);
    assert.equal(rows.filter((r) => r.kind === 'number_check' && r.d.source === 'import').length, 4);
    assert.equal(rows.filter((r) => r.kind === 'number_check' && r.d.demo === true).length, 2);
    assert.deepEqual(errors, []);
  });
});

test('without demo mode there is no "Test the number check" button', { timeout: 120_000 }, async () => {
  await withFlowNest(async ({ page }) => {
    // the same company, with the server's demo flag hidden from the page
    const n = await page.evaluate(() => { SRV.cfg = { ...SRV.cfg, demo: false }; A.go('director'); return document.querySelectorAll('main [data-nc-demo]').length; });
    assert.equal(n, 0);
  });
});
