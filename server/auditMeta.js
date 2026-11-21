import { chPlain } from './plain.js';
/**
 * P1 (2026-11-19): what turns a server audit item into a recommendation every screen can show and defend.
 *
 *   sourceRules(ctx)  the rules that read the company's own documents, ported from the browser audit with the same
 *                     ids, thresholds and wording: cta-mix, offer-conflict, claims, prod-consistent, know-gaps, defs
 *                     and the portfolio rules pf-none, pf-depth, pf-noproof, pf-noout, pf-seg, pf-old. They are
 *                     observations about what the documents SAY (basis 'sources'), never facts used as truth: pending
 *                     findings are read only to point at conflicts, claims and open questions.
 *   decorate(items, ctx)  adds to every item the fields the screens use (cls, plat, obj, metric, need, v/e/f/u, score,
 *                     make, exp, seg, ev) and the evidence card: period, rows, sources, calc, assumptions, confidence
 *                     { level: 'high' | 'med' | 'low', why } and rule (true = a check that could not run yet).
 *   confidence(...)   the one confidence rule, explained in a single line. It is not a probability: it combines the
 *                     sample size against the rule's minimum, how far past the threshold the result is, and how much
 *                     of the period the data covers.
 */

const isAr = (s) => /[؀-ۿ]/.test(s || '');
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const groupBy = (rows, k) => {
  const m = {};
  for (const r of rows) if (r[k]) (m[r[k]] = m[r[k]] || []).push(r);
  return m;
};

/** Open questions BrandPilot asks when no source answers them (same list as the browser's REQ). */
export const REQ = [
  ['overview', 'What does the company do, in one or two sentences?', 'ماذا تفعل الشركة في جملة أو جملتين؟'],
  ['products', 'Which products or services do you sell?', 'ما المنتجات أو الخدمات التي تبيعها؟'],
  ['audiences', 'Who are your best customers?', 'من هم أفضل عملائك؟'],
  ['markets', 'Which cities or countries do you serve?', 'ما المدن أو الدول التي تخدمها؟'],
  ['diff', 'Why do customers choose you over alternatives?', 'لماذا يختارك العملاء بدلاً من البدائل؟'],
  ['tone', 'How should the brand sound?', 'كيف يجب أن تبدو نبرة العلامة؟'],
  ['ctas', 'What is the one action you most want visitors to take?', 'ما الإجراء الأهم الذي تريد من الزائر اتخاذه؟'],
  ['acquisition', 'How do customers currently find and contact you?', 'كيف يجدك العملاء ويتواصلون معك حالياً؟'],
  ['competitors', 'Which alternatives do customers compare you with?', 'ما البدائل التي يقارنك بها العملاء؟'],
];

/** Projects as the browser reads them: "name | industry | service | year | outcome" findings in category projects. */
export function portfolio(findings) {
  const pr = findings
    .filter((f) => f.cat === 'projects' && f.status !== 'rejected' && f.type !== 'unknown')
    .map((f) => {
      const p = f.text.split('|').map((x) => x.trim());
      return { f, name: p[0], ind: p[1] || '', svc: p[2] || '', year: +(p[3] || (f.text.match(/\b(20\d\d)\b/) || [])[1] || 0), out: p[4] || '', ok: f.status === 'approved' };
    });
  const cnt = (k) => Object.entries(groupBy(pr.filter((p) => p[k]), k)).map(([n, rs]) => ({ n, c: rs.length, rs })).sort((a, b) => b.c - a.c);
  return { pr, ind: cnt('ind'), svc: cnt('svc'), noOut: pr.filter((p) => !p.out), last: Math.max(0, ...pr.map((p) => p.year)) };
}

/**
 * The document and portfolio rules. `ctx`: { L, findings (every status), facts (approved), sources [{id,title,text}],
 * defs: { qualified: boolean } | null, now: Date, hasLeads, push(item) }.
 */
export function sourceRules(ctx) {
  const { L, findings, facts, sources, defs, now, push } = ctx;
  const live = (f) => f.status !== 'rejected';
  const K = (cat) => facts.filter((f) => f.cat === cat && f.type !== 'conflict');
  const srcN = (id) => sources.find((s) => s.id === id)?.title || L('User input', 'إدخال المستخدم');
  const srcOf = (list) => [...new Set(list.map((f) => f.src).filter(Boolean))].map(srcN);
  const obs = (o) => push({ basis: 'sources', synthetic: false, ...o });

  const ctas = findings.filter((f) => f.cat === 'ctas' && live(f) && !isAr(f.text));
  if (ctas.length > 1) {
    obs({
      id: 'cta-mix', kind: 'weak',
      title: L('Several different action buttons are in use', 'يُستخدم أكثر من زر إجراء'),
      why: L('When materials ask people to do different things, fewer people do any of them and results cannot be compared across channels.', 'عندما تطلب المواد من الناس أشياء مختلفة، يقل من يستجيب ويصعب مقارنة النتائج بين القنوات.'),
      action: L('Choose one main action button in Company info and use it on every campaign asset; keep the others as secondary links only.', 'اختر زر إجراء أساسي واحد في معلومات الشركة واستخدمها في كل مواد الحملة، واجعل الباقي روابط ثانوية.'),
      evidence: ctas.map((f) => ({ factId: f.id, text: `“${f.text}” — ${srcN(f.src)}` })),
      sourcesUsed: srcOf(ctas),
      calc: [L(`${ctas.length} different English action buttons found in your sources (rule: more than 1).`, `${ctas.length} أزرار إجراء مختلفة في مصادرك (القاعدة: أكثر من 1).`)],
      q: { certain: true, why: L(`Read directly from your sources: ${ctas.length} action buttons.`, `مقروء مباشرة من مصادرك: ${ctas.length} أزرار إجراء.`) },
    });
  }
  const conflict = findings.find((f) => f.type === 'conflict' && f.status === 'pending');
  if (conflict) {
    obs({
      id: 'offer-conflict', kind: 'risk',
      title: L('Your own materials state different offers', 'موادك نفسها تذكر عروضاً مختلفة'),
      why: L('A prospect who sees two versions of the offer cannot tell which is true; outdated material also puts campaign copy at risk.', 'العميل المحتمل الذي يرى نسختين من العرض لا يعرف أيهما الصحيح، والمواد القديمة تعرّض نصوص الحملات للخطأ.'),
      action: L('Approve the current offer in Company info, reject the outdated one, and retire or correct the old document.', 'اعتمد العرض الحالي في معلومات الشركة وارفض القديم، ثم صحّح أو أوقف المستند القديم.'),
      evidence: [{ factId: conflict.id, text: conflict.text }],
      sourcesUsed: srcOf([conflict]),
      calc: [L('Two sources state different values for the same offer; you have not chosen one yet.', 'مصدران يذكران قيمتين مختلفتين للعرض نفسه؛ لم تختر إحداهما بعد.')],
      q: { certain: true, why: L('Read directly from your sources: the two texts disagree.', 'مقروء مباشرة من مصادرك: النصان مختلفان.') },
    });
  }
  const claims = findings.filter((f) => f.type === 'claim' && live(f));
  if (claims.length) {
    obs({
      id: 'claims', kind: 'risk',
      title: L('Promotional claims without supporting evidence', 'ادعاءات ترويجية بلا دليل داعم'),
      why: L('Rankings, guarantees and customer numbers that cannot be proven damage trust and may breach ad platform policies. BrandPilot will not reuse them.', 'التصنيفات والضمانات وأرقام العملاء غير المثبتة تضر بالثقة وقد تخالف سياسات المنصات. لن يعيد BrandPilot استخدامها.'),
      action: L('Reject each claim, or attach proof and approve it explicitly. Replace with approved product facts.', 'ارفض كل ادعاء أو أرفق دليلاً واعتمده صراحة. استبدلها بحقائق المنتج المعتمدة.'),
      evidence: claims.map((f) => ({ factId: f.id, text: `“${f.text}” — ${srcN(f.src)} (${f.status === 'approved' ? L('approved by you', 'اعتمدتَها') : L('not approved', 'غير معتمدة')})` })),
      sourcesUsed: srcOf(claims),
      calc: [L(`${claims.length} sentence(s) with a ranking, guarantee, percentage or customer count and no proof attached.`, `${claims.length} جملة فيها تصنيف أو ضمان أو نسبة أو عدد عملاء بلا دليل مرفق.`)],
      q: { certain: true, why: L(`Read directly from your sources: ${claims.length} claim(s).`, `مقروء مباشرة من مصادرك: ${claims.length} ادعاء.`) },
    });
  }
  const prods = K('products').filter((f) => !isAr(f.text));
  if (prods.length >= 3) {
    const others = sources.filter((s) => s.text && prods.filter((p) => s.text.toLowerCase().includes(p.text.toLowerCase().split(' ').slice(-2).join(' '))).length >= 2);
    if (others.length >= 2) {
      obs({
        id: 'prod-consistent', kind: 'strong',
        title: L('The product is described the same way across sources', 'وصف المنتج متسق عبر المصادر'),
        why: L('Consistent descriptions make campaigns faster to produce and easier for prospects to recognise.', 'الوصف المتسق يسرّع إنتاج الحملات ويسهّل على العملاء تمييز المنتج.'),
        action: L('Reuse these exact phrases as proof points in campaigns (Campaign Studio does this automatically).', 'أعد استخدام هذه العبارات نفسها كنقاط إثبات في الحملات (إنشاء حملة يفعل ذلك تلقائياً).'),
        evidence: [{ text: L(`${prods.length} approved product facts recur in ${others.length} sources: `, `${prods.length} حقائق منتج معتمدة تتكرر في ${others.length} مصادر: `) + others.map((s) => s.title).join(' · ') }],
        sourcesUsed: others.map((s) => s.title),
        calc: [L(`${others.length} sources each repeat at least 2 of your ${prods.length} approved product facts (rule: 2 or more sources).`, `${others.length} مصادر يكرر كل منها حقيقتين على الأقل من ${prods.length} حقائق المنتج المعتمدة (القاعدة: مصدران أو أكثر).`)],
        q: { n: others.length, min: 2, unit: L('sources', 'مصادر') },
      });
    }
  }
  const unk = findings.filter((f) => f.type === 'unknown' && f.status === 'pending');
  if (unk.length) {
    const reqQ = (cat) => { const r = REQ.find((x) => x[0] === cat); return r ? L(r[1], r[2]) : ''; };
    push({
      id: 'know-gaps', kind: 'gap', basis: 'insufficient', synthetic: false,
      title: L(`${unk.length} business question(s) no source could answer`, `${unk.length} سؤال عن النشاط لم يُجب عنه أي مصدر`),
      why: L('Recommendations in these areas would be guesses. BrandPilot leaves them blank rather than inventing answers.', 'التوصيات في هذه المناطق ستكون تخميناً. BrandPilot يتركها فارغة بدلاً من اختلاق إجابات.'),
      action: L('Answer the open questions in Company info — one line each is enough.', 'أجب عن الأسئلة المفتوحة في معلومات الشركة — سطر واحد لكل سؤال يكفي.'),
      needs: L('Your answers', 'إجاباتك'),
      evidence: unk.map((f) => ({ factId: f.id, text: reqQ(f.cat) || f.text })),
      calc: [L(`${unk.length} open question(s) in Company info.`, `${unk.length} سؤال مفتوح في معلومات الشركة.`)],
      q: { certain: true, why: L(`Counted directly: ${unk.length} open question(s).`, `معدود مباشرة: ${unk.length} سؤال مفتوح.`) },
    });
  }
  if (ctx.hasLeads && defs && !defs.qualified) {
    push({
      id: 'defs', kind: 'gap', basis: 'insufficient', synthetic: false,
      title: L('“Qualified lead” is not defined for this business', '«العميل المؤهل» غير معرَّف لهذا النشاط'),
      why: L('Without a written definition, quality numbers mean different things to marketing and sales.', 'بدون تعريف مكتوب، أرقام الجودة تعني أشياء مختلفة للتسويق والمبيعات.'),
      action: L('Write one sentence defining a qualified lead.', 'اكتب جملة واحدة تعرّف العميل المؤهل.'),
      needs: L('Your definition', 'تعريفك'),
      evidence: [{ text: L('The definition field in Growth & Leads is empty.', 'حقل التعريف في النمو والعملاء فارغ.') }],
      calc: [L('The “qualified lead” definition is empty.', 'تعريف «العميل المؤهل» فارغ.')],
      q: { certain: true, why: L('Checked directly: the definition is empty.', 'تم التحقق مباشرة: التعريف فارغ.') },
    });
  }

  /* Portfolio (company CV / projects). Like the browser: only once the company has sources. */
  if (!sources.length) return;
  const P = portfolio(findings);
  const plat = L('Company CV & portfolio', 'السيرة المؤسسية والمشاريع');
  if (!P.pr.length) {
    push({
      id: 'pf-none', kind: 'gap', basis: 'insufficient', synthetic: false,
      title: L('No company CV or project portfolio provided', 'لم تُقدَّم سيرة مؤسسية أو سجل مشاريع'),
      why: L('Past projects are the strongest proof a company has. Without them, campaigns can only repeat what the website says.', 'المشاريع السابقة أقوى دليل تملكه الشركة. بدونها تكرر الحملات ما يقوله الموقع فقط.'),
      action: L('Upload a company CV or list projects as: name | industry | service | year | outcome.', 'ارفع السيرة المؤسسية أو اسرد المشاريع بصيغة: الاسم | القطاع | الخدمة | السنة | النتيجة.'),
      needs: L('Company CV / case studies', 'السيرة المؤسسية / دراسات الحالة'),
      evidence: [{ text: L('No source contains a projects, case studies or experience section.', 'لا مصدر يحتوي قسماً للمشاريع أو دراسات الحالة أو الخبرات.') }],
      calc: [L('0 projects found in your sources.', 'لا توجد مشاريع في مصادرك.')],
      q: { certain: true, why: L('Counted directly: 0 projects.', 'معدود مباشرة: 0 مشاريع.') },
      plat,
    });
    return;
  }
  const projSrc = (list) => srcOf(list.map((p) => p.f));
  const top = P.ind[0];
  if (top && top.c >= 2) {
    obs({
      id: 'pf-depth', kind: 'strong', seg: top.n, subject: top.n,
      title: L(`Repeated project experience in “${top.n}”`, `خبرة مشاريع متكررة في «${top.n}»`),
      why: L('Several completed projects for the same kind of customer is evidence you can show, not a claim you have to assert.', 'عدة مشاريع منجزة لنفس نوع العميل دليل يُعرض لا ادعاء يُقال.'),
      action: L(`Run a campaign aimed at ${top.n} that cites approved projects as proof.`, `نفّذ حملة موجهة إلى ${top.n} تستشهد بالمشاريع المعتمدة كدليل.`),
      evidence: top.rs.map((p) => ({ factId: p.f.id, text: `${p.name}${p.year ? ' (' + p.year + ')' : ''}${p.ok ? '' : ' — ' + L('not yet approved', 'غير معتمد بعد')}` })),
      sourcesUsed: projSrc(top.rs),
      calc: [L(`${top.c} of ${P.pr.length} projects are in “${top.n}” (rule: 2 or more in one industry).`, `${top.c} من ${P.pr.length} مشروعاً في «${top.n}» (القاعدة: مشروعان أو أكثر في قطاع واحد).`)],
      q: { n: top.c, min: 2, unit: L('projects', 'مشاريع') },
    });
  }
  const svcs = K('products').filter((f) => !isAr(f.text)).map((f) => f.text);
  const un = svcs.filter((s) => !P.pr.some((p) => norm(p.svc + ' ' + p.name).includes(norm(s))));
  if (svcs.length && un.length) {
    obs({
      id: 'pf-noproof', kind: 'weak',
      title: L(`${un.length} service(s) have no project behind them`, `${un.length} خدمة بلا مشروع يدعمها`),
      why: L('A service promoted without a single example is harder to believe and harder to sell.', 'الخدمة التي تُروَّج بلا مثال واحد أصعب تصديقاً وبيعاً.'),
      action: L('Add a project for each service, or lead campaigns with the services that do have proof.', 'أضف مشروعاً لكل خدمة، أو ابدأ الحملات بالخدمات التي لها دليل.'),
      evidence: un.map((s) => ({ text: L(`“${s}” — not referenced by any listed project`, `«${s}» — لا يشير إليها أي مشروع مدرج`) })),
      calc: [L(`${un.length} of ${svcs.length} approved services are not named in any of ${P.pr.length} projects.`, `${un.length} من ${svcs.length} خدمات معتمدة لا يذكرها أي من ${P.pr.length} مشروعاً.`)],
      q: { n: P.pr.length, min: 3, unit: L('projects', 'مشاريع') },
    });
  }
  if (P.noOut.length >= 2) {
    obs({
      id: 'pf-noout', kind: 'weak',
      title: L(`${P.noOut.length} of ${P.pr.length} projects state no outcome`, `${P.noOut.length} من ${P.pr.length} مشروعاً بلا نتيجة مذكورة`),
      why: L('A project name shows activity; an outcome shows value. BrandPilot will not invent outcomes.', 'اسم المشروع يُظهر نشاطاً؛ والنتيجة تُظهر قيمة. BrandPilot لن يختلق نتائج.'),
      action: L('Add one factual outcome line per project (what was delivered or changed).', 'أضف سطر نتيجة واقعياً لكل مشروع (ما الذي سُلِّم أو تغيّر).'),
      evidence: P.noOut.slice(0, 4).map((p) => ({ factId: p.f.id, text: p.name })),
      sourcesUsed: projSrc(P.noOut),
      calc: [L(`${P.noOut.length} of ${P.pr.length} projects have an empty outcome field (rule: 2 or more).`, `${P.noOut.length} من ${P.pr.length} مشروعاً حقل النتيجة فيها فارغ (القاعدة: مشروعان أو أكثر).`)],
      q: { certain: true, why: L(`Counted directly: ${P.noOut.length} project(s) without an outcome.`, `معدود مباشرة: ${P.noOut.length} مشروع بلا نتيجة.`) },
    });
  }
  const aud = K('audiences').concat(K('industries')).map((f) => norm(f.text)).join(' ');
  const hid = P.ind.filter((i) => !aud.includes(norm(i.n).replace(/s$/, '')));
  if (hid.length) {
    obs({
      id: 'pf-seg', kind: 'opp', seg: hid[0].n, subject: hid[0].n,
      title: L(`Your projects show a segment your positioning does not mention: “${hid[0].n}”`, `مشاريعك تُظهر شريحة لا يذكرها تموضعك: «${hid[0].n}»`),
      why: L('Delivered work reveals who actually buys. Segments present in the portfolio but absent from the stated audience are untapped positioning.', 'العمل المنجز يكشف من يشتري فعلاً. الشرائح الموجودة في المشاريع والغائبة عن الجمهور المعلن فرصة تموضع غير مستغلة.'),
      action: L(`Add ${hid[0].n} to the approved audiences if you want more of this work, then target it.`, `أضف ${hid[0].n} إلى الجمهور المعتمد إن أردت المزيد من هذا العمل ثم استهدفه.`),
      evidence: hid.map((i) => ({ text: L(`${i.n}: ${i.c} project(s)`, `${i.n}: ${i.c} مشروع`) })),
      sourcesUsed: projSrc(hid.flatMap((i) => i.rs)),
      calc: [L(`“${hid[0].n}” appears in ${hid[0].c} project(s) but in none of your approved audiences or industries.`, `«${hid[0].n}» يظهر في ${hid[0].c} مشروع ولا يظهر في الجمهور أو القطاعات المعتمدة.`)],
      q: { n: hid[0].c, min: 1, unit: L('projects', 'مشاريع') },
    });
  }
  const year = (now || new Date()).getUTCFullYear();
  if (P.last && year - P.last >= 2) {
    obs({
      id: 'pf-old', kind: 'weak',
      title: L('The portfolio has no recent project', 'سجل المشاريع بلا مشروع حديث'),
      why: L('Prospects read an old portfolio as a quiet company.', 'العملاء يقرؤون السجل القديم كشركة هادئة.'),
      action: L('Add recent work to the company CV.', 'أضف أعمالاً حديثة إلى السيرة المؤسسية.'),
      evidence: [{ text: L(`Most recent project year: ${P.last}.`, `أحدث سنة مشروع: ${P.last}.`) }],
      calc: [L(`${year} − ${P.last} = ${year - P.last} years since the latest project (rule: 2 or more).`, `${year} − ${P.last} = ${year - P.last} سنوات منذ أحدث مشروع (القاعدة: سنتان أو أكثر).`)],
      q: { certain: true, why: L(`Read directly: latest project year ${P.last}.`, `مقروء مباشرة: أحدث سنة مشروع ${P.last}.`) },
    });
  }
}

/* ------------------------------------------------------------------------------------------------------------ */

/**
 * One confidence rule for every recommendation. Not a probability.
 *   sample  = n ÷ the rule's minimum (how much more data than the rule needs)
 *   margin  = how far past the rule's threshold the result is (0.5 = 50% past it)
 *   cover   = share of the period the data actually covers
 * Low:  sample < 1.5, or margin < 10%, or cover < 50%.  High: sample ≥ 3 and margin ≥ 50% (or not a threshold rule)
 * and cover ≥ 80% (or not period data).  Otherwise Medium.
 */
export function confidence(q, L, fmt) {
  if (!q) return { level: 'med', why: L('Medium: rule-based, no sample size to weigh.', 'متوسطة: قاعدة ثابتة بلا حجم عينة للموازنة.') };
  if (q.rule) return { level: 'low', why: L('Low: not a conclusion — there is not enough data for this check yet.', 'منخفضة: ليست استنتاجاً — لا توجد بيانات كافية لهذا الفحص بعد.') };
  if (q.certain) return { level: 'high', why: L('High: ', 'عالية: ') + q.why };
  if (q.level) return { level: q.level, why: { low: L('Low: ', 'منخفضة: '), med: L('Medium: ', 'متوسطة: '), high: L('High: ', 'عالية: ') }[q.level] + q.why };
  const sample = q.n / Math.max(1, q.min);
  const margin = q.margin ?? null;
  const cover = q.cover ?? null;
  const low = sample < 1.5 || (margin !== null && margin < 0.1) || (cover !== null && cover < 0.5);
  const high = sample >= 3 && (margin === null || margin >= 0.5) && (cover === null || cover >= 0.8);
  const level = low ? 'low' : high ? 'high' : 'med';
  const name = { low: L('Low', 'منخفضة'), med: L('Medium', 'متوسطة'), high: L('High', 'عالية') }[level];
  const parts = [L(`${fmt.int(q.n)} ${q.unit} (${fmt.dec(sample, 1)}× the minimum of ${fmt.int(q.min)})`, `${fmt.int(q.n)} ${q.unit} (${fmt.dec(sample, 1)} ضعف الحد الأدنى ${fmt.int(q.min)})`)];
  if (margin !== null) parts.push(L(`${fmt.pct(margin, 0)} past the threshold`, `${fmt.pct(margin, 0)} بعد العتبة`));
  if (cover !== null) parts.push(L(`data on ${fmt.int(q.days)} of ${fmt.int(q.len)} days`, `بيانات ${fmt.int(q.days)} من ${fmt.int(q.len)} يوماً`));
  return { level, why: `${name}: ${parts.join(L(', ', '، '))}.` };
}

const O = (L) => ({ enq: L('Qualified enquiries', 'استفسارات مؤهلة'), trust: L('Brand trust and consistency', 'ثقة واتساق العلامة'), meas: L('Ability to measure what works', 'القدرة على قياس ما ينجح'), reach: L('Relevant visibility', 'ظهور ملائم') });

/** Display fields per rule id, as the browser had them (cls, plat, obj, metric, need, v, f, u, make, exp). */
function meta(id, L, x) {
  const o = O(L);
  const s = x.subject || '';
  const sp = L(chPlain(s, 'en'), chPlain(s, 'ar')); // P7: a channel in plain words
  const social = L('Social posts', 'منشورات التواصل');
  const leads = L('Leads', 'العملاء المحتملون');
  const M = {
    'cta-mix': { cls: 'obs', plat: L('Website & all channels', 'الموقع وكل القنوات'), obj: o.enq, metric: L('Check: share of assets using the main action button; enquiry rate before and after', 'الفحص: نسبة المواد التي تستخدم زر الإجراء الأساسي؛ معدل الاستفسار قبل وبعد'), need: L('Nothing to act. GA4 key events are needed to measure the effect.', 'لا شيء للتنفيذ. قياس الأثر يحتاج أحداث GA4.'), v: 2, f: 1, u: 2, make: 'exp', exp: { t: L('One main action button vs. the current mix', 'زر إجراء أساسي واحد مقابل الوضع الحالي'), h: L('If every page and post uses the single main action button, a larger share of visitors will enquire.', 'إذا استخدمت كل الصفحات والمنشورات زر الإجراء الأساسي وحدها، سترتفع نسبة من يرسلون استفساراً.'), m: L('Enquiries ÷ visits', 'الاستفسارات ÷ الزيارات'), d: 21 } },
    'offer-conflict': { cls: 'obs', plat: L('All channels', 'كل القنوات'), obj: o.trust, metric: L('No offer conflicts in Company info or the check', 'عدم وجود تعارض في العروض'), need: L('None', 'لا شيء'), v: 2, f: 1, u: 3, make: 'task' },
    claims: { cls: 'obs', plat: L('Documents & creatives', 'المستندات والتصاميم'), obj: o.trust, metric: L('Zero unapproved claims in the check', 'صفر ادعاءات غير معتمدة في الفحص'), need: L('Proof documents if you want to keep a claim', 'مستندات إثبات إن أردت الإبقاء على ادعاء'), v: 2, f: 1, u: 2, make: 'task' },
    'prod-consistent': { cls: 'obs', plat: L('Website & documents', 'الموقع والمستندات'), obj: o.trust, metric: L('Check pass rate', 'نسبة نجاح الفحص'), need: L('Performance data to learn which feature attracts enquiries', 'بيانات أداء لمعرفة أي ميزة تجذب الاستفسارات'), v: 1, f: 1, u: 1, make: 'task' },
    'brand-doc': { cls: 'obs', plat: L('Brand', 'العلامة'), obj: o.trust, metric: L('Colour and action button checks in the check', 'فحوص الألوان وزر الإجراء في الفحص'), need: L('None', 'لا شيء'), v: 1, f: 1, u: 1, make: 'task' },
    'know-gaps': { cls: 'gap', plat: L('Company info', 'معلومات الشركة'), obj: o.enq, metric: L('Open questions remaining', 'عدد الأسئلة المفتوحة'), need: L('Your answers', 'إجاباتك'), v: 2, f: 1, u: 2, make: 'task' },
    'no-track': { cls: 'obs', plat: 'GA4', obj: o.meas, metric: L('Enquiry events recorded per week', 'أحداث الاستفسار المسجلة أسبوعياً'), need: L('Confirmation of how enquiries reach you today', 'تأكيد طريقة وصول الاستفسارات حالياً'), v: 3, f: 2, u: 3, make: 'task' },
    'ch-best': { cls: 'measured', plat: 'GA4', obj: o.enq, metric: L('Visits and enquiries from this channel', 'الزيارات والاستفسارات من هذه القناة'), need: L('Lead quality by channel (leads import)', 'جودة العملاء حسب القناة'), v: 2, f: 2, u: 1, make: 'campaign' },
    'ch-leak': { cls: 'measured', plat: 'GA4', obj: o.enq, metric: L(`Enquiry rate of visits from ${sp}`, `معدل استفسار زوار ${sp}`), need: L('Landing-page level data after the change', 'بيانات لكل صفحة دخول بعد التغيير'), v: 3, f: 2, u: 3, make: 'campaign', exp: { t: L(`Dedicated page for ${sp}`, `صفحة مخصصة لـ ${sp}`), h: L('A page matching the post message with a single action button converts better than the pricing or blog page.', 'صفحة تطابق رسالة المنشور بزر إجراء واحد تحوّل أفضل من صفحة الأسعار أو المدونة.'), m: L('Enquiries ÷ visits on the landing page', 'الاستفسارات ÷ الزيارات في الصفحة المخصصة'), d: 21 } },
    'page-leak': { cls: 'measured', plat: 'GA4', obj: o.enq, metric: L(`Enquiry rate on ${s}`, `معدل الاستفسار في ${s}`), need: L('A look at the live page (BrandPilot has not seen its layout)', 'مراجعة الصفحة الفعلية (BrandPilot لم يرَ تصميمها)'), v: 3, f: 2, u: 2, make: 'exp', exp: { t: L(`New first screen on ${s}`, `شاشة أولى جديدة في ${s}`), h: L('Showing the offer and one action button in the first screen raises the enquiry rate of this page.', 'عرض العرض وزر إجراء واحد في أول شاشة يرفع معدل الاستفسار لهذه الصفحة.'), m: L('Enquiries ÷ visits on the page', 'الاستفسارات ÷ الزيارات في الصفحة'), d: 21 } },
    'mobile-gap': { cls: 'measured', plat: 'GA4', obj: o.enq, metric: L('Mobile enquiry rate', 'معدل استفسار الموبايل'), need: L('Device-level form analytics would pinpoint the step where people leave', 'تحليلات النموذج حسب الجهاز تحدد خطوة الخروج'), v: 3, f: 2, u: 3, make: 'exp', exp: { t: L('Shorter mobile enquiry form', 'نموذج استفسار أقصر على الموبايل'), h: L('Reducing the mobile form to name and phone raises the mobile enquiry rate.', 'اختصار نموذج الموبايل إلى الاسم والهاتف يرفع معدل الاستفسار.'), m: L('Mobile enquiries ÷ mobile visits', 'استفسارات الموبايل ÷ زيارات الموبايل'), d: 14 } },
    'no-ga4': { cls: 'gap', plat: 'GA4', obj: o.meas, metric: L('GA4 rows imported', 'صفوف GA4 المستوردة'), need: L('GA4 export', 'تصدير GA4'), v: 3, f: 1, u: 3, make: 'task' },
    'theme-best': { cls: 'measured', plat: social, obj: o.reach, metric: L('Link clicks and enquiries from tagged posts', 'نقرات الروابط والاستفسارات من المنشورات الموسومة'), need: L('UTM-tagged links to connect posts to enquiries', 'روابط UTM لربط المنشورات بالاستفسارات'), v: 2, f: 1, u: 2, make: 'campaign', exp: { t: L(`“${s}” vs “${x.weakest || ''}” as campaign creative`, `«${s}» مقابل «${x.weakest || ''}» كمحتوى للحملة`), h: L('The strongest organic theme also produces more tracked link clicks per reach when used with the campaign action button.', 'أقوى موضوع عضوي ينتج أيضاً نقرات متتبعة أكثر لكل وصول عند استخدامه مع زر إجراء الحملة.'), m: L('Link clicks ÷ reach', 'نقرات الروابط ÷ الوصول'), d: 14 } },
    cadence: { cls: 'measured', plat: social, obj: o.reach, metric: L('Longest gap between posts (days)', 'أطول فجوة بين المنشورات (أيام)'), need: L('None', 'لا شيء'), v: 1, f: 1, u: 2, make: 'task' },
    'eng-drop': { cls: 'measured', plat: social, obj: o.reach, metric: L('Engagement ÷ reach, 28-day window', 'التفاعل ÷ الوصول على 28 يوماً'), need: L('Another month of data to confirm the trend', 'شهر إضافي لتأكيد الاتجاه'), v: 1, f: 1, u: 2, make: 'task' },
    lang: { cls: 'measured', plat: social, obj: o.reach, metric: L('Link clicks and enquiries by language', 'النقرات والاستفسارات حسب اللغة'), need: L('UTM content tags per language', 'وسوم UTM لكل لغة'), v: 2, f: 1, u: 1, make: 'exp', exp: { t: L('Arabic vs English creative', 'تصميم عربي مقابل إنجليزي'), h: L('The language with higher engagement also yields more enquiries per click.', 'اللغة الأعلى تفاعلاً تحقق أيضاً استفسارات أكثر لكل نقرة.'), m: L('Enquiries ÷ link clicks, by utm_content language', 'الاستفسارات ÷ النقرات حسب لغة utm_content'), d: 21 } },
    'plat-roles': { cls: 'measured', plat: social, obj: o.enq, metric: L('Link clicks ÷ reach per platform; enquiries by source', 'النقرات ÷ الوصول لكل منصة؛ الاستفسارات حسب المصدر'), need: L('Lead source data to confirm which platform brings qualified leads', 'بيانات مصدر العملاء لتأكيد المنصة التي تجلب المؤهلين'), v: 2, f: 1, u: 1, make: 'task' },
    'no-meta': { cls: 'gap', plat: social, obj: o.meas, metric: L('Social post rows imported', 'صفوف منشورات التواصل المستوردة'), need: L('Social post export', 'تصدير منشورات التواصل'), v: 2, f: 1, u: 2, make: 'task' },
    'seo-q': { cls: 'measured', plat: 'Search Console', obj: o.reach, metric: L('Clicks and average position for these queries', 'النقرات ومتوسط المركز لهذه العبارات'), need: L('Enquiries by landing page to confirm search visitors convert', 'الاستفسارات حسب صفحة الدخول لتأكيد تحويل زوار البحث'), v: 2, f: 2, u: 1, make: 'task' },
    'no-gsc': { cls: 'gap', plat: 'Search Console', obj: o.meas, metric: L('GSC rows imported', 'صفوف GSC المستوردة'), need: L('Search Console export', 'تصدير سيرش كونسول'), v: 1, f: 1, u: 1, make: 'task' },
    'src-unknown': { cls: 'measured', plat: leads, obj: o.meas, metric: L('Share of leads with a source', 'نسبة العملاء الذين لهم مصدر'), need: L('None', 'لا شيء'), v: 2, f: 1, u: 2, make: 'task' },
    'src-best': { cls: 'measured', plat: leads, obj: o.enq, metric: L('Qualified leads from this source', 'العملاء المؤهلون من هذا المصدر'), need: L('Sales outcomes per lead to confirm revenue', 'نتائج المبيعات لكل عميل لتأكيد الإيراد'), v: 2, f: 2, u: 1, make: 'campaign' },
    'src-lowq': { cls: 'measured', plat: leads, obj: o.enq, metric: L(`Qualified share of ${s} leads`, `نسبة المؤهلين من ${s}`), need: L('Your definition of a qualified lead', 'تعريفك للعميل المؤهل'), v: 2, f: 2, u: 2, make: 'exp', exp: { t: L(`Qualifying question on ${s} lead form`, `سؤال تأهيل في نموذج ${s}`), h: L('Asking one qualifying question lowers volume but raises the qualified share.', 'سؤال تأهيل واحد يقلل العدد لكنه يرفع نسبة المؤهلين.'), m: L('Qualified leads ÷ leads', 'المؤهلون ÷ العملاء المحتملون'), d: 28 } },
    'seg-best': { cls: 'measured', plat: leads, obj: o.enq, metric: L(`Qualified leads from ${s}; qualified share of campaign leads`, `العملاء المؤهلون من ${s}؛ نسبة المؤهلين من عملاء الحملة`), need: L('Segment field filled on every lead', 'تعبئة حقل الشريحة لكل عميل'), v: 3, f: 2, u: 2, make: 'campaign', exp: { t: L(`Message for ${s} vs general message`, `رسالة موجهة لـ ${s} مقابل رسالة عامة`), h: L('Naming the segment in the headline raises the qualified share of leads.', 'ذكر الشريحة في العنوان يرفع نسبة العملاء المؤهلين.'), m: L('Qualified leads ÷ leads from the campaign', 'المؤهلون ÷ عملاء الحملة'), d: 21 } },
    defs: { cls: 'gap', plat: leads, obj: o.meas, metric: L('Definition present', 'وجود التعريف'), need: L('Your definition', 'تعريفك'), v: 2, f: 1, u: 2, make: 'task' },
    'no-leads': { cls: 'gap', plat: leads, obj: o.meas, metric: L('Lead rows imported', 'صفوف العملاء المستوردة'), need: L('Leads CSV', 'ملف العملاء'), v: 3, f: 1, u: 3, make: 'task' },
    'no-spend': { cls: 'gap', plat: social, obj: o.meas, metric: L('Rows with spend', 'صفوف بها إنفاق'), need: L('Ad spend export', 'تصدير الإنفاق'), v: 1, f: 1, u: 1, make: 'task' },
    'pf-none': { cls: 'gap', obj: o.enq, metric: L('Projects recorded in Company info', 'المشاريع المسجلة في معلومات الشركة'), need: L('Company CV / case studies', 'السيرة المؤسسية / دراسات الحالة'), v: 2, f: 1, u: 2, make: 'task' },
    'pf-depth': { cls: 'obs', obj: o.enq, metric: L(`Qualified leads from ${s}`, `العملاء المؤهلون من ${s}`), need: L('Client permission before naming any client publicly', 'إذن العميل قبل ذكر اسمه علناً'), v: 3, f: 2, u: 2, make: 'campaign' },
    'pf-noproof': { cls: 'obs', obj: o.trust, metric: L('Services with at least one project', 'الخدمات التي لها مشروع واحد على الأقل'), need: L('Projects for these services, if they exist', 'مشاريع لهذه الخدمات إن وجدت'), v: 2, f: 1, u: 1, make: 'task' },
    'pf-noout': { cls: 'obs', obj: o.trust, metric: L('Projects with an outcome', 'المشاريع التي لها نتيجة'), need: L('Outcome per project', 'نتيجة لكل مشروع'), v: 2, f: 1, u: 1, make: 'task' },
    'pf-seg': { cls: 'obs', obj: o.enq, metric: L('Leads by segment', 'العملاء حسب الشريحة'), need: L('Whether these projects were profitable and repeatable', 'هل كانت هذه المشاريع مربحة وقابلة للتكرار'), v: 2, f: 1, u: 1, make: 'campaign' },
    'pf-old': { cls: 'obs', obj: o.trust, metric: L('Year of latest project', 'سنة أحدث مشروع'), need: L('Recent projects', 'مشاريع حديثة'), v: 1, f: 1, u: 1, make: 'task' },
  };
  const r = M[id] || { cls: 'obs', obj: o.enq, metric: '', need: '', v: 1, f: 1, u: 1, make: 'task' };
  if (id.startsWith('pf-')) r.plat = L('Company CV & portfolio', 'السيرة المؤسسية والمشاريع');
  return r;
}

/** What the numbers rest on, per dataset (shown under "Assumptions" on the evidence card). */
const ASSUME = {
  ga4: (L) => L('Enquiries are the GA4 key event in your export; channels and devices are as GA4 groups them.', 'الاستفسارات هي الحدث الرئيسي في تصدير GA4؛ والقنوات والأجهزة كما يجمّعها GA4.'),
  meta: (L) => L('Reach and engagements are as Meta reports them; engagement is an awareness signal, not proof of enquiries.', 'الوصول والتفاعل كما تذكرهما Meta؛ والتفاعل مؤشر وعي وليس دليلاً على استفسارات.'),
  gsc: (L) => L('Search Console figures cover web search only; position is the impression-weighted average.', 'أرقام Search Console تخص بحث الويب فقط؛ والمركز متوسط مرجّح بالظهور.'),
  leads: (L) => L('A qualified lead is a lead whose status is qualified or customer in your import.', 'العميل المؤهل هو من حالته «مؤهل» أو «عميل» في ملفك.'),
  sources: (L) => L('Read from your own documents; pending items are shown as observations, not as approved facts.', 'مقروء من مستنداتك؛ العناصر غير المعتمدة تُعرض كملاحظات لا كحقائق معتمدة.'),
  facts: (L) => L('Uses only facts you approved in Company info.', 'يستخدم فقط الحقائق التي اعتمدتها في معلومات الشركة.'),
};
/** Rule ids whose not-enough-data item is about a dataset or a company input being missing (a card), not a check that could not run. */
const DATA_GAPS = new Set(['no-ga4', 'no-gsc', 'no-leads', 'no-meta', 'no-spend', 'defs', 'know-gaps', 'pf-none']);
const DATASET_OF = { 'no-ga4': 'ga4', 'no-gsc': 'gsc', 'no-leads': 'leads', 'no-meta': 'meta', 'no-spend': 'meta' };

/**
 * Adds the display and evidence-card fields. `ctx`: { L, fmt, period: {from,to,range,days}|null, rows: {kind: count},
 * cover: (kind) => { days, len } | null }.
 */
/** Arabic-Indic digits for the numbers still written literally in Arabic wording ("20٪", "28 يوماً"). Dates (2026-09-21),
 *  names with digits (GA4) and paths (/pricing) keep their digits. */
const AR = '٠١٢٣٤٥٦٧٨٩';
export const arabDigits = (t) => typeof t === 'string' ? t.replace(/(?<![A-Za-z0-9/\-.:_])\d+(?:[.,]\d+)?(?=\s*[٪%؀-ۿ]|\s*[)،؛])/g, (m) => m.replace(/\d/g, (d) => AR[d]).replace('.', '٫')) : t;

export function decorate(items, ctx) {
  const { L, fmt } = ctx;
  for (const x of items) {
    const m = meta(x.id, L, x);
    const rule = x.basis === 'insufficient' && !DATA_GAPS.has(x.id);
    const ds = x.dataset ?? DATASET_OF[x.id] ?? null;
    let q = x.q;
    if (rule) q = { rule: true };
    else if (!q && x.basis === 'insufficient') {
      const empty = ds ? L(`no ${ds.toUpperCase()} rows in this period`, `لا توجد صفوف ${ds.toUpperCase()} في هذه الفترة`) : L('the input is missing', 'المُدخل غير موجود');
      q = { certain: true, why: L(`Counted directly: ${empty}.`, `معدود مباشرة: ${empty}.`) };
    }
    if (q && !q.certain && !q.rule && ds && ctx.cover) {
      const c = ctx.cover(ds);
      if (c) Object.assign(q, { cover: c.days / Math.max(1, c.len), days: c.days, len: c.len });
    }
    const conf = confidence(q, L, fmt);
    const e = { high: 3, med: 2, low: 1 }[conf.level];
    Object.assign(x, {
      cls: x.basis === 'insufficient' ? 'gap' : m.cls,
      plat: x.plat || m.plat || '',
      obj: m.obj,
      metric: m.metric,
      need: x.needs || m.need,
      v: m.v, e, f: m.f, u: m.u, score: m.v * 2 + e + m.u - m.f,
      // a check that could not run is not something to act on: no campaign or experiment from it
      make: rule ? null : m.make,
      ...(m.exp && !rule ? { exp: m.exp } : {}),
      ...(x.seg ? { seg: x.seg } : {}),
      ev: (x.evidence || []).map((v) => v.text),
      conf: conf.level,
      confidence: conf,
      rule,
      engine: 'rules',
      period: ctx.period,
      dataset: ds,
      rows: ds && ctx.rows ? { [ds]: ctx.rows[ds] } : {},
      sources: x.sourcesUsed || [],
      calc: x.calc || [],
      assumptions: [ASSUME[ds]?.(L), x.basis === 'sources' ? ASSUME.sources(L) : null, x.basis === 'facts' ? ASSUME.facts(L) : null, ...(x.assume || [])].filter(Boolean),
    });
    if (ctx.arab) {
      for (const k of ['title', 'why', 'action', 'needs', 'need', 'metric']) if (typeof x[k] === 'string') x[k] = arabDigits(x[k]);
      x.ev = x.ev.map(arabDigits);
      x.calc = x.calc.map(arabDigits);
      for (const e of x.evidence || []) e.text = arabDigits(e.text);
      x.confidence.why = arabDigits(x.confidence.why);
    }
    delete x.q;
    delete x.sourcesUsed;
    delete x.assume;
    // P6: the subject (channel, page, source, segment) stays readable for the track record's plan (server/track.js),
    // but not enumerable: it is not sent to the page and not part of the recorded recommendation output.
    if (x.subject !== undefined) Object.defineProperty(x, 'subject', { value: x.subject, enumerable: false, writable: false });
    delete x.weakest;
  }
  return items;
}
