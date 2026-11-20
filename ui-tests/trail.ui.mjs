// P5 (2026-11-20): Settings → Activity is the server's audit trail. In English and Arabic: recommendations, a rules-engine
// Director answer, a fact decision and a strategy approval made in the page all appear in the card, read from the server
// (GET /trail), with who and which engine; the rows are in the database, not only on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const T = {
  en: { h: 'Activity (audit trail)', note: 'Entries cannot be edited or deleted.', strat: 'Strategy approved:', rules: 'rules engine', recs: /recommendations recorded/ },
  ar: { h: 'النشاط (سجل التدقيق)', note: 'لا يمكن تعديل السجلات أو حذفها.', strat: 'اعتُمدت الاستراتيجية:', rules: 'محرك القواعد', recs: /سُجّلت \d+ توصيات|سُجّلت توصية/ },
};

test('Settings → Activity comes from the server trail and shows recommendations, answers, fact and strategy decisions (EN, AR)', { timeout: 300_000 }, async () => {
  await withFlowNest(async ({ page, errors, db }) => {
    const co = await page.evaluate(() => C().id);
    for (const lang of ['en', 'ar']) {
      await page.evaluate(async ([l]) => {
        if (S.lang !== l) A.lang();
        S.ui.range = '28';
        A.go('audit'); // recommendations of the period on screen → recorded
        for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50));
      }, [lang]);
      await page.click('main .ns-list [data-a=recCamp]'); // one-click campaign from a recommendation (a draft, not approved)
      await page.waitForTimeout(600);
      await page.evaluate(async ([l, q]) => {
        S.ui.dth = null;
        A.askQ(q); // no AI key: the rules engine answers in the page; the answer is recorded on the server
        await new Promise((r) => setTimeout(r, 600));
        A.stratApprove(curCamp(C()).id); // a person approves the strategy
        await new Promise((r) => setTimeout(r, 600));
        S.ui.actAll = true;
        A.go('trust');
        for (let i = 0; i < 100 && !document.querySelector('[data-trail-card] [data-trail=strategy_approval]'); i++) { await new Promise((r) => setTimeout(r, 100)); if (i % 10 === 9) { TRL[C().id].at = 0; R(); } }
      }, [lang, lang === 'ar' ? 'ما أكبر نقطة ضعف تسويقية لدينا؟' : 'What is our biggest marketing weakness?']);
      const card = await page.evaluate(() => {
        const el = document.querySelector('main [data-trail-card]');
        return el && { text: el.innerText.replace(/\s+/g, ' '), kinds: [...el.querySelectorAll('[data-trail]')].map((x) => x.dataset.trail), ids: [...el.querySelectorAll('[data-trail-id]')].map((x) => x.dataset.trailId), view: S.ui.view };
      });
      assert.ok(card, `${lang}: Settings shows the Activity card`);
      assert.equal(card.view, 'trust');
      const t = T[lang];
      assert.ok(card.text.includes(t.h) && card.text.includes(t.note), `${lang}: ${card.text.slice(0, 300)}`);
      for (const k of ['recommendation', 'answer', 'strategy_approval']) assert.ok(card.kinds.includes(k), `${lang}: ${k} in ${card.kinds}`);
      assert.ok(card.text.includes(t.strat), `${lang}: strategy line`);
      assert.ok(card.text.includes(t.rules), `${lang}: engine named`);
      assert.match(card.text, t.recs);
      // what the card shows is what the server holds for this company
      const inDb = new Set(db.prepare('SELECT id FROM trail WHERE company_id = ?').all(co).map((r) => r.id));
      assert.ok(card.ids.length && card.ids.every((id) => inDb.has(id)), `${lang}: every entry is a server row`);
      assert.ok(db.prepare("SELECT COUNT(*) n FROM trail WHERE company_id = ? AND kind = 'answer' AND engine = 'rules'").get(co).n >= 1);
    }
    // a fact decision made in the page (Re-approve) appears as well
    const fid = db.prepare("SELECT fact_id FROM fact_approvals WHERE company_id = ? AND status = 'approved' LIMIT 1").get(co)?.fact_id
      ?? (await page.evaluate(() => C().findings.find((f) => f.status === 'approved' && f.ev).id));
    await page.evaluate(async (id) => {
      await api('POST', '/api/companies/' + C().id + '/facts/decisions', { decisions: [{ id, status: 'approved', reviewBy: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10) }] });
      TRL[C().id].at = 0; R();
      for (let i = 0; i < 50 && !document.querySelector('[data-trail-card] [data-trail=fact_decision]'); i++) await new Promise((r) => setTimeout(r, 100));
    }, fid);
    assert.ok(await page.evaluate(() => !!document.querySelector('main [data-trail-card] [data-trail=fact_decision]')), 'fact decision listed');
    assert.deepEqual(errors, []);
  });
});
