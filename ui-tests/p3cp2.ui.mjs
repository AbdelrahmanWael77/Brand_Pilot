// P3 checkpoint 2 (2026-11-20), on the synthetic FlowNest demo, English and Arabic:
//  - "not enough data" items show what you have / what you need / what it unlocks
//  - in Arabic, a Latin path such as /pricing keeps its slash in front everywhere (Next steps, Director, Track record,
//    Settings → Activity, the source of a number)
//  - an AI answer names its model and period ("Answered by AI (model)")
//  - a held-back answer offers "Ask again"
//  - a number in campaign copy that is not an approved fact blocks downloads; fixed by adding it as an approved fact
//    (with evidence) in English, by removing it from the copy in Arabic
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFlowNest } from './lib/flownest.mjs';

const slashes = (page) => page.evaluate(() => {
  const out = [];
  for (const root of document.querySelectorAll('main, .modal, [role=dialog]')) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      let i = n.data.indexOf('/pricing');
      while (i >= 0) {
        const r = (a, b) => { const g = document.createRange(); g.setStart(n, a); g.setEnd(n, b); const q = g.getClientRects()[0]; return q ? q.left : null; };
        const s = r(i, i + 1); const p = r(i + 1, i + 2);
        if (s !== null && p !== null) out.push({ ok: s < p, at: n.parentElement.className || n.parentElement.tagName });
        i = n.data.indexOf('/pricing', i + 1);
      }
    }
  }
  return out;
});
const waitFor = async (page, fn, arg, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await page.evaluate(fn, arg); if (v) return v; if (Date.now() - t0 > ms) return v; await page.waitForTimeout(150); } };

test('P3 checkpoint 2 on screen (EN, AR)', { timeout: 500_000 }, async () => {
  await withFlowNest(async ({ page, errors, db }) => {
    // ---- have / need / unlocks ----
    for (const [lang, labels] of [['en', ['What you have', 'What you need', 'What it unlocks']], ['ar', ['ما لديك', 'ما تحتاجه', 'ما الذي يتيحه']]]) {
      const g = await page.evaluate(async (l) => {
        if (S.lang !== l) A.lang();
        S.ui.range = '28'; S.ui.nsMore = true; A.go('audit'); // P7: all rows ("Show more")
        for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50));
        for (let i = 0; i < 60 && !document.querySelector('main [data-gap]'); i++) { await new Promise((r) => setTimeout(r, 100)); R(); }
        document.querySelectorAll('main details').forEach((d) => { d.open = true; });
        return [...document.querySelectorAll('main [data-gap]')].map((x) => [...x.querySelectorAll('dt')].map((d) => d.textContent));
      }, lang);
      assert.ok(g.length >= 3, `${lang}: gap items with three parts (${g.length})`);
      assert.ok(g.every((x) => JSON.stringify(x) === JSON.stringify(labels)), `${lang}: ${JSON.stringify(g[0])}`);
    }

    // ---- Latin paths in Arabic, everywhere ----
    await page.evaluate(async () => { if (S.lang !== 'ar') A.lang(); A.go('audit'); await new Promise((r) => setTimeout(r, 1500)); R(); document.querySelectorAll('main details').forEach((d) => { d.open = true; }); });
    let sl = await slashes(page);
    await page.evaluate(async () => { S.ui.dth = null; await A.ask(null, null, 'كيف نحسّن صفحة الحملة؟'); });
    sl = sl.concat(await slashes(page));
    const nsrc = await page.evaluate(() => { const b = [...document.querySelectorAll('#dv-last .nv.ok')].find((x) => /0\.42|1,676/.test(x.textContent)); if (b) b.click(); return !!b; });
    assert.ok(nsrc, 'a /pricing number to open');
    await page.waitForTimeout(300);
    sl = sl.concat(await slashes(page));
    await page.evaluate(async () => { MODAL = null; A.go('trust'); await new Promise((r) => setTimeout(r, 1500)); S.ui.actAll = true; R(); });
    sl = sl.concat(await slashes(page));
    assert.ok(sl.length >= 8, `found ${sl.length}`);
    assert.deepEqual(sl.filter((x) => !x.ok), [], 'every /pricing keeps its slash in front');

    for (const lang of ['en', 'ar']) {
      // ---- "Answered by AI (model)" with the period ----
      const per = await page.evaluate((l) => {
        if (S.lang !== l) A.lang();
        const c = C(), th = thNew(c, 'q');
        const a = aiAnswer({ answer: 'Sessions this period: 4,774.', support: [], check: { numbers: [], counts: {}, blocked: false }, model: 'claude-sonnet-5-5', q: 'q' });
        a.per = dvPer(c, 'ai'); thAdd(c, th.id, { q: 'q', a, next: [], t: Date.now() }); S.ui.dth = th.id; A.go('director');
        return document.querySelector('#dv-last .dv-per')?.textContent.replace(/\s+/g, ' ') || '';
      }, lang);
      assert.match(per, lang === 'en' ? /^Answered by AI \(claude-sonnet-5-5\) · Period used: 2026-09-21 → 2026-10-18 \(last 28 days\)/ : /^أجاب الذكاء الاصطناعي \(claude-sonnet-5-5\) · الفترة المستخدمة: 2026-09-21 → 2026-10-18/, per);

      // ---- a held-back answer offers "Ask again" ----
      const q = lang === 'en' ? 'What should we do first?' : 'ما الذي يجب أن نفعله أولاً؟';
      const again = await page.evaluate((q) => {
        const c = C(), th = thNew(c, q);
        const a = aiAnswer({ answer: 'Mobile visitors enquire at 3.4%.', support: [], check: { numbers: [{ raw: '3.4%', start: 27, end: 31, status: 'unverified' }], counts: {}, blocked: true, reason: { code: 'unverified', raw: '3.4%' } }, model: 'claude-sonnet-5-5', q });
        a.per = dvPer(c, 'ai'); thAdd(c, th.id, { q, a, next: [], t: Date.now() }); S.ui.dth = th.id; A.go('director');
        const b = document.querySelector('#dv-last [data-nc-again]');
        return { btn: b ? b.textContent.trim() : '', v: b?.dataset.v, hidden: !document.querySelector('#dv-last').textContent.includes('Mobile visitors enquire'), copy: a.text };
      }, q);
      assert.equal(again.btn, lang === 'en' ? 'Ask again' : 'اسأل مرة أخرى');
      assert.equal(again.v, q);
      assert.equal(again.hidden, true, 'the held-back text is not on the page');
      assert.equal(again.copy, undefined, 'nor kept for Copy');
      const turns0 = await page.evaluate(() => curTh(C()).turns.length);
      await page.click('#dv-last [data-nc-again]');
      assert.ok(await waitFor(page, (n) => curTh(C()).turns.length > n && !SRV.asking, turns0), `${lang}: asked again`);
    }

    // ---- campaign copy: an unverified number blocks downloads; two fixes ----
    await page.evaluate(async () => { if (S.lang !== 'en') A.lang(); A.go('audit'); for (let i = 0; i < 100 && !recsGet(C()).ok; i++) await new Promise((r) => setTimeout(r, 50)); });
    await page.click('main .ns-list [data-a=recCamp]');
    await page.waitForTimeout(600);
    await page.evaluate(async () => { await A.stratApprove(curCamp(C()).id); });
    const put = (lang, add) => page.evaluate(async ([lang, add]) => {
      const k = curCamp(C()), a = k.assets.find((x) => x.lang === lang && x.type === 'post');
      const key = Object.keys(a.fields).find((x) => typeof a.fields[x].v === 'string' && a.fields[x].v.length > 20 && !a.fields[x].v.includes('⟦'));
      a.fields[key].v += add; save(); await syncNow(); await synced(C());
      A.go('qa');
    }, [lang, add]);
    const state = () => page.evaluate(() => { R(); return { gate: !!document.querySelector('#cdl [data-gate=numbers]'), fixes: [...document.querySelectorAll('#cdl [data-nc-fix]')].map((x) => x.dataset.ncFix), zip: document.querySelector('#cdl [data-a=ex][data-v=zip]')?.disabled }; });

    await put('en', ' Join 4,500 teams already using it.');
    assert.ok(await waitFor(page, () => { R(); return !!document.querySelector('#cdl [data-gate=numbers]'); }), 'EN: blocked');
    let st = await state();
    assert.deepEqual(st.fixes, ['4,500']);
    assert.equal(st.zip, true, 'EN: download blocked');
    await page.click('#cdl [data-nc-fix="4,500"] [data-a=ncFact]');
    await page.fill('[data-nc-factform] textarea[name=ev]', 'Customer count from the Q3 board report, page 4.');
    await page.click('[data-nc-factform] button.pri');
    assert.ok(await waitFor(page, () => { R(); return !document.querySelector('#cdl [data-gate=numbers]') && document.querySelector('#cdl [data-a=ex][data-v=zip]')?.disabled === false; }, null, 20000), 'EN: approved with evidence, download open ' + JSON.stringify(await page.evaluate(() => { const k = curCamp(C()), sv = srvQa(C(), k); return { gates: [...document.querySelectorAll('#cdl [data-gate]')].map((x) => x.dataset.gate), zip: document.querySelector('#cdl [data-a=ex][data-v=zip]')?.disabled, strat: stratOk(k), approved: k.approved, trail: !!k.stratTrail, fg0: factGate0(C(), k), num: sv.ok ? sv.by.numbers : sv, modal: !!MODAL, stale: stale(k).length, dec: C().findings.filter((f) => /4,500/.test(f.text)).map((f) => [f.status, f.dec, f.type, f.cat]), busy: DEC.busy }; })) + JSON.stringify(db.prepare("SELECT f.status, f.type, a.status ast, a.review_by FROM facts f LEFT JOIN fact_approvals a ON a.company_id=f.company_id AND a.fact_id=f.id WHERE f.text LIKE '%4,500%'").all().map((r) => ({ ...r }))));
    assert.ok(await page.evaluate(() => C().findings.some((f) => f.status === 'approved' && f.type === 'user' && f.text.includes('4,500') && f.ev.includes('board report'))));

    await page.evaluate(() => A.lang());
    await put('ar', ' انضم إلى ٤٬٨٠٠ فريق.');
    assert.ok(await waitFor(page, () => { R(); return !!document.querySelector('#cdl [data-gate=numbers]'); }), 'AR: blocked');
    st = await state();
    assert.deepEqual(st.fixes, ['٤٬٨٠٠']);
    assert.equal(st.zip, true, 'AR: download blocked');
    assert.match(await page.evaluate(() => document.querySelector('#cdl [data-gate=numbers]').textContent), /أضفه كحقيقة معتمدة \(مع الدليل\) أو احذفه من النصوص/);
    await page.click('#cdl [data-nc-fix="٤٬٨٠٠"] [data-a=ncDrop]');
    await page.click('.ab-ov [data-ab="1"]');
    await page.evaluate(async () => { await syncNow(); await synced(C()); });
    assert.ok(await waitFor(page, () => { R(); return !document.querySelector('#cdl [data-gate=numbers]') && document.querySelector('#cdl [data-a=ex][data-v=zip]')?.disabled === false; }, null, 20000), 'AR: removed, download open');
    assert.ok(await page.evaluate(() => !JSON.stringify(curCamp(C()).assets).includes('٤٬٨٠٠')));
    assert.deepEqual(errors, []);
  });
});
