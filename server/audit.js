/**
 * Marketing audit computed on the server.
 *
 * Inputs are only what the server has validated: imported rows (`dataRows`) and
 * approved facts (`approvedFacts`). Nothing is read from the state blob, and pending
 * or rejected findings are never used.
 *
 * Every item says what it rests on:
 *   basis 'data'         — a conclusion drawn from imported numbers (quoted in `evidence`)
 *   basis 'facts'        — a conclusion drawn from approved facts (ids in `evidence`)
 *   basis 'insufficient' — NOT a conclusion: the inputs are missing or too small, and
 *                          `needs` says what would make the rule answerable
 *
 * The rules, their ids and their thresholds are ported from `audit(c)` in
 * public/index.html (which keeps the bilingual wording for the UI, keyed by the same
 * ids). Text here is English, for tests and for grounding later AI answers.
 * Ported so far: no-ga4, no-track, ch-best, ch-leak, mobile-gap, no-gsc, seo-q,
 * no-leads, src-unknown, src-best, src-lowq, seg-best, page-leak, no-meta, theme-best,
 * cadence, eng-drop, lang, no-spend, plat-roles, brand-doc. Not ported: `defs` (the "qualified lead"
 * definition lives only in the state blob, which the server does not trust) and the
 * document-observation and portfolio rules.
 * Like the prototype, the audit looks at all imported rows, not one period.
 */
import { createData, KINDS } from './data.js';
import { createKnowledge } from './knowledge.js';

/** Thresholds, as in the prototype. */
export const T = {
  channelMinSessions: 200, // a channel needs this many sessions to be compared
  bestOverAverage: 1.2, // "best" = rate above 120% of the average
  leakMinShare: 0.2, // a leaking channel carries at least 20% of sessions…
  leakBelowAverage: 0.5, // …and converts below 50% of the average
  mobileMinShare: 0.3,
  mobileBelowDesktop: 0.6,
  queryMinImpressions: 1000,
  queryPosition: [5, 15],
  queryMaxCtr: 0.025,
  unknownSourceShare: 0.15,
  sourceMinLeads: 15, // to be called "best"
  lowQualityMinLeads: 20,
  lowQualityBelowAverage: 0.6,
  pageMinShare: 0.12, // a leaking landing page carries at least 12% of sessions…
  pageBelowAverage: 0.6, // …and converts below 60% of the site average
  themeMinPosts: 4, // a content theme needs this many posts to be compared
  themeOverAverage: 1.2, // "strongest" = engagement above 120% of the account average
  segmentMinLeads: 15, // a segment needs this many leads to be compared
  segmentOverAverage: 1.15, // "strongest" = qualified share above 115% of the overall share
  segmentSmallSample: 30, // below this the evidence line says "small sample"
  cadenceMaxGap: 14, // a gap between posting days longer than this is a weakness
  recentDays: 28, // the recent window for the engagement trend…
  recentMinPosts: 6, // …needs this many posts (campaign posts excluded)…
  baselineMinPosts: 10, // …and this many earlier posts
  engagementDrop: 0.85, // "below baseline" = recent engagement under 85% of the earlier rate
  languageMinPosts: 5, // each language needs this many posts to be compared
  languageGap: 1.12, // the stronger language must be more than 12% ahead
};
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const groupBy = (rows, k) => {
  const out = new Map();
  for (const r of rows) {
    if (!r[k]) continue;
    if (!out.has(r[k])) out.set(r[k], []);
    out.get(r[k]).push(r);
  }
  return out;
};
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const isQualified = (r) => r.status === 'qualified' || r.status === 'customer';

/** Sessions / enquiries per value of `key`, with the enquiry rate. */
const breakdown = (rows, key) =>
  [...groupBy(rows, key)].map(([name, rs]) => {
    const sessions = sum(rs, 'sessions');
    const enquiries = sum(rs, 'enquiries');
    return { name, sessions, enquiries, rate: enquiries / Math.max(1, sessions) };
  });

/**
 * @param {{meta: object[], ga4: object[], gsc: object[], leads: object[]}} data rows from `dataRows`
 * @param {object[]} facts approved facts from `approvedFacts`
 * @param {{lang?: 'en'|'ar'}} [options] language of titles, reasons, actions, evidence and needs (default English)
 */
export function computeAudit(data, facts, { lang = 'en' } = {}) {
  /** Wording in the asked language; the rules and numbers are the same. */
  const L = (en, ar) => (lang === 'ar' ? ar : en);
  const items = [];
  const syn = Object.fromEntries(KINDS.map((k) => [k, data[k].some((r) => r.synthetic)]));
  const conclude = (kind, dataset, o) => items.push({ ...o, kind, basis: 'data', synthetic: syn[dataset] });
  const insufficient = (id, dataset, title, needs) =>
    items.push({ id, kind: 'gap', basis: 'insufficient', synthetic: dataset ? syn[dataset] : false, title, why: L('Not enough verified input to draw a conclusion here.', 'لا توجد مدخلات موثّقة كافية للوصول إلى استنتاج هنا.'), action: needs, needs, evidence: [] });

  /* ---- Website (GA4) ---- */
  const g = data.ga4;
  if (!g.length) {
    insufficient('no-ga4', 'ga4', L('Website performance is not connected', 'أداء الموقع غير مربوط'), L('Import a GA4 export (CSV) in Integrations & Data.', 'استوردوا تصدير GA4 (CSV) من «التكاملات والبيانات».'));
  } else {
    const S = sum(g, 'sessions');
    const E = sum(g, 'enquiries');
    if (!E) {
      conclude('weak', 'ga4', {
        id: 'no-track',
        title: L('The website records no enquiry events', 'الموقع لا يسجل أي أحداث استفسار'),
        why: L('Without a key event for form submissions, WhatsApp clicks or bookings, nobody can tell which channel or page produces enquiries.', 'بدون حدث رئيسي لإرسال النموذج أو نقرات واتساب أو الحجز، لا يمكن معرفة أي قناة أو صفحة تجلب الاستفسارات.'),
        action: L('Define one GA4 key event per enquiry path (form submit, WhatsApp click, call click) and re-import.', 'عرّفوا حدثاً رئيسياً في GA4 لكل مسار استفسار (إرسال النموذج، نقرة واتساب، نقرة اتصال) ثم أعيدوا الاستيراد.'),
        evidence: [
          { metric: 'sessions', value: S, rows: g.length, text: L(`${S} sessions imported, 0 enquiry key events in the whole period.`, `تم استيراد ${S} جلسة، و0 حدث استفسار رئيسي في كامل الفترة.`) },
          { text: L('Interpretation: tracking is most likely not configured (a true zero is unlikely at this traffic level).', 'تفسير: على الأرجح التتبع غير مُعدّ (الصفر الحقيقي غير مرجّح عند هذا الحجم من الزيارات).') },
        ],
      });
    } else {
      const rate = E / S;
      const site = { metric: 'enquiry_rate', value: rate, rows: g.length, text: L(`Site average: ${pct(rate, 2)} (${E} enquiries from ${S} sessions)`, `متوسط الموقع: ${pct(rate, 2)} (${E} استفسار من ${S} جلسة)`) };
      const channels = breakdown(g, 'channel').filter((x) => x.sessions >= T.channelMinSessions).sort((a, b) => b.rate - a.rate);
      if (channels.length < 2) {
        insufficient('ch-best', 'ga4', L('Traffic channels cannot be compared yet', 'لا يمكن مقارنة قنوات الزيارات بعد'), L(`At least two channels with ${T.channelMinSessions}+ sessions each are needed (now: ${channels.length}).`, `يلزم وجود قناتين على الأقل، لكل منهما ${T.channelMinSessions} جلسة أو أكثر (حالياً: ${channels.length}).`));
      } else {
        const best = channels[0];
        if (best.rate > rate * T.bestOverAverage) {
          conclude('strong', 'ga4', {
            id: 'ch-best',
            title: L(`${best.name} visitors enquire at the highest rate`, `زوار ${best.name} هم الأعلى في معدل الاستفسار`),
            why: L('This channel already brings people with intent; growing it is lower-risk than fixing a weak one.', 'هذه القناة تجلب بالفعل زواراً لديهم نية؛ تنميتها أقل مخاطرة من إصلاح قناة ضعيفة.'),
            action: L(`Invest more effort in ${best.name}: more content, better pages, clearer follow-up.`, `استثمروا جهداً أكبر في ${best.name}: محتوى أكثر، صفحات أفضل، متابعة أوضح.`),
            evidence: [{ metric: 'enquiry_rate', value: best.rate, text: L(`${best.name}: ${best.enquiries} enquiries from ${best.sessions} sessions (${pct(best.rate, 2)})`, `${best.name}: ${best.enquiries} استفسار من ${best.sessions} جلسة (${pct(best.rate, 2)})`) }, site],
          });
        }
        const leak = channels.filter((x) => x.sessions / S >= T.leakMinShare && x.rate < rate * T.leakBelowAverage).sort((a, b) => b.sessions - a.sessions)[0];
        if (leak) {
          conclude('weak', 'ga4', {
            id: 'ch-leak',
            title: L(`${leak.name} brings many visits but few enquiries`, `${leak.name} تجلب زيارات كثيرة واستفسارات قليلة`),
            why: L('Attention is being won but not converted.', 'نكسب الانتباه ولا نحوّله إلى استفسارات.'),
            action: L(`Send ${leak.name} traffic to a dedicated landing page with one CTA instead of general pages.`, `وجّهوا زيارات ${leak.name} إلى صفحة هبوط مخصصة بدعوة واحدة لاتخاذ إجراء بدلاً من الصفحات العامة.`),
            evidence: [
              { metric: 'enquiry_rate', value: leak.rate, text: L(`${leak.name}: ${pct(leak.sessions / S, 0)} of sessions, enquiry rate ${pct(leak.rate, 2)} vs site ${pct(rate, 2)}`, `${leak.name}: ${pct(leak.sessions / S, 0)} من الجلسات، معدل الاستفسار ${pct(leak.rate, 2)} مقابل ${pct(rate, 2)} للموقع`) },
              { text: L('Hypothesis, not a measurement: posts send people to pages that do not match what the post promised.', 'فرضية وليست قياساً: المنشورات ترسل الزوار إلى صفحات لا تطابق ما وعد به المنشور.') },
            ],
          });
        }
      }
      const pages = breakdown(g, 'landing_page');
      if (!pages.length) {
        insufficient('page-leak', 'ga4', L('Landing pages cannot be compared yet', 'لا يمكن مقارنة صفحات الهبوط بعد'), L('GA4 rows need a landing_page column.', 'صفوف GA4 تحتاج عمود landing_page.'));
      } else {
        const page = pages.filter((x) => x.sessions / S >= T.pageMinShare && x.rate < rate * T.pageBelowAverage).sort((a, b) => b.sessions - a.sessions)[0];
        if (page) {
          conclude('weak', 'ga4', {
            id: 'page-leak',
            title: L(`Landing page ${page.name} under-converts`, `صفحة الهبوط ${page.name} أقل تحويلاً من المتوسط`),
            why: L('A high-traffic page converting below the site average is the cheapest place to gain enquiries: the visitors are already there.', 'صفحة عالية الزيارات بتحويل أقل من متوسط الموقع هي أرخص مكان لكسب استفسارات: الزوار موجودون بالفعل.'),
            action: L(`Review ${page.name}: put the primary CTA above the fold, shorten the form, state the offer in the first screen.`, `راجعوا ${page.name}: ضعوا الدعوة الرئيسية في أعلى الصفحة، اختصروا النموذج، واذكروا العرض في الشاشة الأولى.`),
            evidence: [{ metric: 'enquiry_rate', value: page.rate, text: L(`${page.name}: ${page.sessions} sessions (${pct(page.sessions / S, 0)}), enquiry rate ${pct(page.rate, 2)} vs site ${pct(rate, 2)}`, `${page.name}: ${page.sessions} جلسة (${pct(page.sessions / S, 0)})، معدل الاستفسار ${pct(page.rate, 2)} مقابل ${pct(rate, 2)} للموقع`) }],
          });
        }
      }
      const devices = breakdown(g, 'device');
      const mo = devices.find((x) => x.name === 'mobile');
      const de = devices.find((x) => x.name === 'desktop');
      if (!mo || !de) {
        insufficient('mobile-gap', 'ga4', L('Mobile and desktop visitors cannot be compared yet', 'لا يمكن مقارنة زوار الجوال وسطح المكتب بعد'), L('GA4 rows need a device column with both mobile and desktop sessions.', 'صفوف GA4 تحتاج عمود الجهاز مع جلسات للجوال ولسطح المكتب.'));
      } else if (mo.sessions / S >= T.mobileMinShare && mo.rate < de.rate * T.mobileBelowDesktop) {
        conclude('weak', 'ga4', {
          id: 'mobile-gap',
          title: L('Mobile visitors enquire far less than desktop visitors', 'زوار الجوال يستفسرون أقل بكثير من زوار سطح المكتب'),
          why: L('If the mobile path is harder, every channel pays for it.', 'إذا كان مسار الجوال أصعب، فكل القنوات تدفع الثمن.'),
          action: L('Test the enquiry path on a phone: form length, button size, load time, WhatsApp/click-to-call option.', 'اختبروا مسار الاستفسار على الهاتف: طول النموذج، حجم الأزرار، زمن التحميل، وخيار واتساب أو الاتصال بنقرة.'),
          evidence: [
            { metric: 'enquiry_rate', value: mo.rate, text: L(`Mobile: ${pct(mo.sessions / S, 0)} of sessions, enquiry rate ${pct(mo.rate, 2)}`, `الجوال: ${pct(mo.sessions / S, 0)} من الجلسات، معدل الاستفسار ${pct(mo.rate, 2)}`) },
            { metric: 'enquiry_rate', value: de.rate, text: L(`Desktop: enquiry rate ${pct(de.rate, 2)}`, `سطح المكتب: معدل الاستفسار ${pct(de.rate, 2)}`) },
          ],
        });
      }
    }
  }

  /* ---- Organic search (Search Console) ---- */
  if (!data.gsc.length) {
    insufficient('no-gsc', 'gsc', L('Organic search visibility is unknown', 'الظهور في البحث العضوي غير معروف'), L('Import a Search Console performance export.', 'استوردوا تصدير الأداء من Search Console.'));
  } else {
    const queries = [...groupBy(data.gsc, 'query')].map(([name, rs]) => {
      const impressions = sum(rs, 'impressions');
      return { name, impressions, clicks: sum(rs, 'clicks'), position: rs.reduce((s, x) => s + (Number(x.position) || 0) * x.impressions, 0) / Math.max(1, impressions) };
    });
    const big = queries.filter((x) => x.impressions >= T.queryMinImpressions);
    if (!big.length) {
      insufficient('seo-q', 'gsc', L('Search queries are too small to judge yet', 'استعلامات البحث أصغر من أن يُحكم عليها بعد'), L(`A query needs ${T.queryMinImpressions}+ impressions before its click rate means anything.`, `يحتاج الاستعلام إلى ${T.queryMinImpressions} ظهور أو أكثر قبل أن يكون لمعدل النقر معنى.`));
    } else {
      const missed = big
        .filter((x) => x.position >= T.queryPosition[0] && x.position <= T.queryPosition[1] && x.clicks / x.impressions < T.queryMaxCtr)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 3);
      if (missed.length) {
        conclude('opp', 'gsc', {
          id: 'seo-q',
          title: L('People search for what you offer but rarely reach you', 'الناس يبحثون عمّا تقدمونه لكنهم قلّما يصلون إليكم'),
          why: L('These queries already show your pages. Moving a few positions up usually costs less than buying the same visits.', 'هذه الاستعلامات تُظهر صفحاتكم بالفعل. التقدم بضعة مراكز يكلّف عادةً أقل من شراء الزيارات نفسها.'),
          action: L('Create or improve one page per query: put the phrase in the title, answer the need directly, add the primary CTA.', 'أنشئوا أو حسّنوا صفحة لكل استعلام: ضعوا العبارة في العنوان، أجيبوا عن الحاجة مباشرة، وأضيفوا الدعوة الرئيسية.'),
          evidence: missed.map((x) => ({ metric: 'ctr', value: x.clicks / x.impressions, text: L(`"${x.name}": ${x.impressions} impressions, ${x.clicks} clicks (${pct(x.clicks / x.impressions, 1)}), average position ${x.position.toFixed(1)}`, `«${x.name}»: ${x.impressions} ظهور، ${x.clicks} نقرة (${pct(x.clicks / x.impressions, 1)})، متوسط المركز ${x.position.toFixed(1)}`) })),
        });
      }
    }
  }

  /* ---- Leads ---- */
  const l = data.leads;
  if (!l.length) {
    insufficient('no-leads', 'leads', L('Lead quality and sales outcomes are not connected', 'جودة العملاء المحتملين ونتائج المبيعات غير مربوطة'), L('Export leads from your CRM or sheet with date, source, segment and status, and import the CSV.', 'صدّروا العملاء المحتملين من نظام CRM أو الجدول مع التاريخ والمصدر والشريحة والحالة، ثم استوردوا ملف CSV.'));
  } else {
    const overall = l.filter(isQualified).length / l.length;
    const all = { metric: 'qualified_share', value: overall, rows: l.length, text: L(`All leads: ${pct(overall, 0)} qualified (${l.length} leads)`, `كل العملاء المحتملين: ${pct(overall, 0)} مؤهلون (${l.length} عميل محتمل)`) };
    const unknown = l.filter((x) => !x.source).length / l.length;
    if (unknown >= T.unknownSourceShare) {
      conclude('weak', 'leads', {
        id: 'src-unknown',
        title: L('The source of many leads is not recorded', 'مصدر كثير من العملاء المحتملين غير مسجَّل'),
        why: L('Leads with no source cannot be credited to any channel, so good channels look weaker than they are.', 'العملاء المحتملون بلا مصدر لا يُنسبون إلى أي قناة، فتبدو القنوات الجيدة أضعف مما هي.'),
        action: L('Add a required "How did you hear about us?" field or capture UTM values in the form.', 'أضيفوا حقلاً إلزامياً «كيف سمعتم عنا؟» أو التقطوا قيم UTM في النموذج.'),
        evidence: [{ metric: 'unknown_source_share', value: unknown, rows: l.length, text: L(`${pct(unknown, 0)} of ${l.length} leads have an empty source field.`, `${pct(unknown, 0)} من ${l.length} عميل محتمل حقل المصدر لديهم فارغ.`) }],
      });
    }
    const sources = [...groupBy(l, 'source')].map(([name, rs]) => ({ name, count: rs.length, qualified: rs.filter(isQualified).length, rate: rs.filter(isQualified).length / rs.length }));
    const sized = sources.filter((x) => x.count >= T.sourceMinLeads);
    if (!sized.length) {
      insufficient('src-best', 'leads', L('Lead sources cannot be compared yet', 'لا يمكن مقارنة مصادر العملاء المحتملين بعد'), L(`A source needs ${T.sourceMinLeads}+ leads before its quality can be judged.`, `يحتاج المصدر إلى ${T.sourceMinLeads} عميلاً محتملاً أو أكثر قبل الحكم على جودته.`));
    } else {
      const best = [...sized].sort((a, b) => b.rate - a.rate)[0];
      if (best.rate > overall * T.bestOverAverage) {
        conclude('strong', 'leads', {
          id: 'src-best',
          title: L(`${best.name} brings your best-quality leads`, `${best.name} يجلب أفضل عملائكم المحتملين جودةً`),
          why: L('Quality, not volume, is what turns into customers.', 'الجودة، لا العدد، هي ما يتحول إلى عملاء.'),
          action: L(`Protect and grow ${best.name}; study what these leads saw before enquiring.`, `حافظوا على ${best.name} ونمّوه؛ وادرسوا ما رآه هؤلاء العملاء قبل الاستفسار.`),
          evidence: [{ metric: 'qualified_share', value: best.rate, rows: best.count, text: L(`${best.name}: ${best.qualified} of ${best.count} leads qualified (${pct(best.rate, 0)})`, `${best.name}: ${best.qualified} من ${best.count} عميل محتمل مؤهلون (${pct(best.rate, 0)})`) }, all],
        });
      }
      const low = sources.filter((x) => x.count >= T.lowQualityMinLeads && x.rate < overall * T.lowQualityBelowAverage).sort((a, b) => b.count - a.count)[0];
      if (low) {
        conclude('weak', 'leads', {
          id: 'src-lowq',
          title: L(`${low.name} produces volume, not quality`, `${low.name} ينتج عدداً لا جودة`),
          why: L('Counting these leads as success would reward the wrong activity.', 'اعتبار هؤلاء العملاء نجاحاً يكافئ النشاط الخطأ.'),
          action: L(`Tighten the audience and message on ${low.name}: name who the offer is for, and add one qualifying question to the form.`, `ضيّقوا الجمهور والرسالة في ${low.name}: حدّدوا لمن العرض، وأضيفوا سؤال تأهيل واحداً إلى النموذج.`),
          evidence: [{ metric: 'qualified_share', value: low.rate, rows: low.count, text: L(`${low.name}: ${low.count} leads, ${pct(low.rate, 0)} qualified vs ${pct(overall, 0)} overall`, `${low.name}: ${low.count} عميل محتمل، ${pct(low.rate, 0)} مؤهلون مقابل ${pct(overall, 0)} إجمالاً`) }],
        });
      }
    }
    // Segments: the rule campaigns are built from ("Create campaign from this" in the Audit).
    const segments = [...groupBy(l, 'segment')]
      .map(([name, rs]) => ({ name, count: rs.length, qualified: rs.filter(isQualified).length, rate: rs.filter(isQualified).length / rs.length }))
      .filter((x) => x.count >= T.segmentMinLeads)
      .sort((a, b) => b.rate - a.rate);
    if (segments.length < 2) {
      insufficient('seg-best', 'leads', L('Customer segments cannot be compared yet', 'لا يمكن مقارنة شرائح العملاء بعد'), L(`Two segments need ${T.segmentMinLeads}+ leads each, with the segment filled in on the lead, before they can be compared.`, `تحتاج شريحتان إلى ${T.segmentMinLeads} عميلاً محتملاً أو أكثر لكل منهما، مع تعبئة الشريحة لكل عميل، قبل المقارنة.`));
    } else if (segments[0].rate > overall * T.segmentOverAverage) {
      const top = segments[0];
      conclude('opp', 'leads', {
        id: 'seg-best',
        title: L(`"${top.name}" is your strongest customer segment`, `«${top.name}» هي أقوى شريحة عملاء لديكم`),
        why: L('A campaign aimed at the segment that already qualifies best is the most evidence-backed way to raise lead quality.', 'حملة موجهة للشريحة الأعلى تأهيلاً هي أكثر طريقة مدعومة بالدليل لرفع جودة العملاء المحتملين.'),
        action: L(`Run a campaign addressed to ${top.name}, built only from approved product facts.`, `نفّذوا حملة موجهة إلى ${top.name}، مبنية فقط على حقائق المنتج المعتمدة.`),
        evidence: segments.map((x) => ({
          metric: 'qualified_share',
          value: x.rate,
          rows: x.count,
          text: L(`${x.name}: ${pct(x.rate, 0)} qualified (${x.count} leads${x.count < T.segmentSmallSample ? ', small sample' : ''})`, `${x.name}: ${pct(x.rate, 0)} مؤهلون (${x.count} عميل محتمل${x.count < T.segmentSmallSample ? '، عينة صغيرة' : ''})`),
        })),
      });
    }
  }

  /* ---- Social (Meta) ---- */
  const m = data.meta;
  if (!m.length) {
    insufficient('no-meta', 'meta', L('Social performance is not connected', 'أداء وسائل التواصل غير مربوط'), L('Import a Meta Business Suite export in Integrations & Data.', 'استوردوا تصدير Meta Business Suite من «التكاملات والبيانات».'));
  } else {
    // Engagement per person reached. Posts tagged "campaign" are not a content theme.
    const engagement = (rs) => sum(rs, 'engagements') / Math.max(1, sum(rs, 'reach'));
    const account = engagement(m);
    const themes = [...groupBy(m.filter((x) => x.theme !== 'campaign'), 'theme')]
      .filter(([, rs]) => rs.length >= T.themeMinPosts)
      .map(([name, rs]) => ({ name, posts: rs.length, rate: engagement(rs), clicks: sum(rs, 'link_clicks') / Math.max(1, sum(rs, 'reach')) }))
      .sort((a, b) => b.rate - a.rate);
    if (themes.length < 2) {
      insufficient('theme-best', 'meta', L('Content themes cannot be compared yet', 'لا يمكن مقارنة موضوعات المحتوى بعد'), L(`Two themes need ${T.themeMinPosts}+ posts each, with the theme filled in on the post, before they can be compared.`, `يحتاج موضوعان إلى ${T.themeMinPosts} منشورات أو أكثر لكل منهما، مع تعبئة الموضوع لكل منشور، قبل المقارنة.`));
    } else if (themes[0].rate > account * T.themeOverAverage) {
      const top = themes[0];
      const weakest = themes[themes.length - 1];
      conclude('strong', 'meta', {
        id: 'theme-best',
        title: L(`"${top.name}" is your strongest content theme`, `«${top.name}» هو أقوى موضوع محتوى لديكم`),
        why: L('Your own history shows what the audience responds to — a better guide than generic best practice.', 'تاريخكم نفسه يبيّن ما يتفاعل معه الجمهور — وهو دليل أفضل من الممارسات العامة.'),
        action: L(`Publish more "${top.name}" posts and end each with the primary CTA and a tracked link.`, `انشروا مزيداً من منشورات «${top.name}» واختموا كلاً منها بالدعوة الرئيسية ورابط متتبَّع.`),
        evidence: [
          { metric: 'engagement_rate', value: top.rate, rows: top.posts, text: L(`"${top.name}": engagement ${pct(top.rate, 1)} of reach across ${top.posts} posts; link clicks ${pct(top.clicks, 2)} of reach`, `«${top.name}»: التفاعل ${pct(top.rate, 1)} من الوصول عبر ${top.posts} منشور؛ نقرات الروابط ${pct(top.clicks, 2)} من الوصول`) },
          { metric: 'engagement_rate', value: account, rows: m.length, text: L(`Account average engagement: ${pct(account, 1)}; weakest theme "${weakest.name}": ${pct(weakest.rate, 1)}`, `متوسط تفاعل الحساب: ${pct(account, 1)}؛ أضعف موضوع «${weakest.name}»: ${pct(weakest.rate, 1)}`) },
          { text: L('Engagement is an awareness signal, not proof of enquiries.', 'التفاعل إشارة وعي، وليس دليلاً على استفسارات.') },
        ],
      });
    }

    // Posting cadence: the longest gap between two posting days.
    const days = [...new Set(m.map((x) => x.date))].sort();
    if (days.length < 2) {
      insufficient('cadence', 'meta', L('Posting rhythm cannot be checked yet', 'لا يمكن فحص انتظام النشر بعد'), L('Posts from at least two different days are needed.', 'يلزم وجود منشورات من يومين مختلفين على الأقل.'));
    } else {
      let gap = 0;
      let after = '';
      for (let i = 1; i < days.length; i++) {
        const d = dayDiff(days[i - 1], days[i]);
        if (d > gap) {
          gap = d;
          after = days[i - 1];
        }
      }
      if (gap > T.cadenceMaxGap) {
        conclude('weak', 'meta', {
          id: 'cadence',
          title: L(`Posting stopped for ${gap} days`, `توقف النشر لمدة ${gap} يوماً`),
          why: L('Irregular publishing makes results hard to read and gives followers no reason to expect you.', 'النشر غير المنتظم يصعّب قراءة النتائج ولا يعطي المتابعين سبباً لانتظاركم.'),
          action: L('Adopt a fixed weekly calendar; Campaign Studio generates one with each campaign.', 'اعتمدوا تقويماً أسبوعياً ثابتاً؛ استوديو الحملات ينشئ واحداً مع كل حملة.'),
          evidence: [
            { metric: 'posting_gap_days', value: gap, text: L(`No posts between ${after} and ${addDays(after, gap)}.`, `لا توجد منشورات بين ${after} و ${addDays(after, gap)}.`) },
            { metric: 'posts', value: m.length, rows: m.length, text: L(`${m.length} posts across ${days.length} posting days in the import.`, `${m.length} منشور في ${days.length} يوم نشر ضمن الاستيراد.`) },
          ],
        });
      }

      // Engagement in the last 28 days of posts against the earlier baseline (campaign posts left out of the recent window, as in the browser).
      const cut = addDays(days[days.length - 1], -(T.recentDays - 1));
      const recent = m.filter((x) => x.date >= cut && x.theme !== 'campaign');
      const earlier = m.filter((x) => x.date < cut);
      if (recent.length < T.recentMinPosts || earlier.length < T.baselineMinPosts) {
        insufficient('eng-drop', 'meta', L('Engagement trend cannot be checked yet', 'لا يمكن فحص اتجاه التفاعل بعد'), L(`${T.recentMinPosts}+ posts in the last ${T.recentDays} days and ${T.baselineMinPosts}+ earlier posts are needed (now: ${recent.length} and ${earlier.length}).`, `يلزم ${T.recentMinPosts} منشورات أو أكثر في آخر ${T.recentDays} يوماً و${T.baselineMinPosts} منشورات سابقة أو أكثر (حالياً: ${recent.length} و${earlier.length}).`));
      } else if (engagement(recent) < engagement(earlier) * T.engagementDrop) {
        conclude('weak', 'meta', {
          id: 'eng-drop',
          title: L('Engagement is below your own baseline', 'التفاعل أقل من مستواكم المعتاد'),
          why: L('The comparison is with your own earlier posts, not an industry benchmark.', 'المقارنة مع منشوراتكم السابقة وليس مع معيار للصناعة.'),
          action: L('Check the theme mix of recent posts against the strongest theme before changing anything else.', 'قارنوا موضوعات المنشورات الأخيرة بأقوى موضوع قبل تغيير أي شيء آخر.'),
          evidence: [
            { metric: 'engagement_rate', value: engagement(recent), rows: recent.length, text: L(`Last ${T.recentDays} days: ${pct(engagement(recent), 1)} engagement per reach (${recent.length} posts)`, `آخر ${T.recentDays} يوماً: ${pct(engagement(recent), 1)} تفاعل لكل وصول (${recent.length} منشور)`) },
            { metric: 'engagement_rate', value: engagement(earlier), rows: earlier.length, text: L(`Earlier baseline: ${pct(engagement(earlier), 1)} (${earlier.length} posts)`, `المستوى السابق: ${pct(engagement(earlier), 1)} (${earlier.length} منشور)`) },
            { text: L('Cause unknown: could be theme mix, the posting gap, or platform changes.', 'السبب غير معروف: قد يكون تنوع الموضوعات أو فجوة النشر أو تغييرات المنصة.') },
          ],
        });
      }
    }

    // Arabic against English posts. One language only is a normal state, not missing data.
    const langs = groupBy(m, 'language');
    const ar = langs.get('ar');
    const en = langs.get('en');
    if (ar && en) {
      if (ar.length < T.languageMinPosts || en.length < T.languageMinPosts) {
        insufficient('lang', 'meta', L('Arabic and English posts cannot be compared yet', 'لا يمكن مقارنة المنشورات العربية والإنجليزية بعد'), L(`${T.languageMinPosts}+ posts in each language are needed (now: ${ar.length} Arabic, ${en.length} English).`, `يلزم ${T.languageMinPosts} منشورات أو أكثر بكل لغة (حالياً: ${ar.length} عربي و${en.length} إنجليزي).`));
      } else {
        const a = engagement(ar);
        const b = engagement(en);
        if (Math.max(a, b) / Math.min(a, b) > T.languageGap) {
          conclude('opp', 'meta', {
            id: 'lang',
            title: a > b ? L('Arabic posts earn more engagement than English posts', 'المنشورات العربية تحقق تفاعلاً أعلى من الإنجليزية') : L('English posts earn more engagement than Arabic posts', 'المنشورات الإنجليزية تحقق تفاعلاً أعلى من العربية'),
            why: L('Language is a cheap lever: the same idea can be published in the language the audience prefers.', 'اللغة رافعة قليلة التكلفة: الفكرة نفسها يمكن نشرها باللغة التي يفضلها الجمهور.'),
            action: L('Lead campaigns with the stronger language and test whether it also brings more enquiries.', 'ابدؤوا الحملات باللغة الأقوى واختبروا هل تجلب استفسارات أكثر أيضاً.'),
            evidence: [
              { metric: 'engagement_rate', value: a, rows: ar.length, text: L(`Arabic: ${pct(a, 1)} of reach (${ar.length} posts)`, `العربية: ${pct(a, 1)} من الوصول (${ar.length} منشور)`) },
              { metric: 'engagement_rate', value: b, rows: en.length, text: L(`English: ${pct(b, 1)} of reach (${en.length} posts)`, `الإنجليزية: ${pct(b, 1)} من الوصول (${en.length} منشور)`) },
            ],
          });
        }
      }
    }

    // Without spend, cost per lead cannot be calculated. Not a conclusion about the business: a missing input.
    if (!sum(m, 'spend')) {
      insufficient('no-spend', 'meta', L('No spend data — cost per lead cannot be calculated', 'لا توجد بيانات إنفاق — تعذّر حساب تكلفة العميل'), L('Include the spend column when exporting paid posts.', 'أضيفوا عمود الإنفاق عند تصدير المنشورات المدفوعة.'));
    }

    // Facebook and Instagram side by side. One platform only is a normal state, not missing data.
    const platforms = groupBy(m, 'platform');
    const fb = platforms.get('facebook');
    const ig = platforms.get('instagram');
    if (fb && ig) {
      const clicks = (rs) => sum(rs, 'link_clicks') / Math.max(1, sum(rs, 'reach'));
      conclude('opp', 'meta', {
        id: 'plat-roles',
        title: L('Facebook and Instagram do different jobs', 'فيسبوك وإنستجرام يؤديان دورين مختلفين'),
        why: L('Treating both platforms the same wastes the strength of each.', 'معاملة المنصتين بالطريقة نفسها تهدر قوة كل منهما.'),
        action: clicks(fb) > clicks(ig)
          ? L('Use Facebook for posts that link to the landing page; use Instagram for attention and DMs.', 'استخدموا فيسبوك للمنشورات التي تقود إلى صفحة الهبوط، وإنستجرام لجذب الانتباه والرسائل.')
          : L('Use Instagram as the main traffic and enquiry driver; keep Facebook for reach among existing followers.', 'اجعلوا إنستجرام المحرك الأساسي للزيارات والاستفسارات، وفيسبوك للوصول إلى المتابعين الحاليين.'),
        evidence: [
          { metric: 'engagement_rate', value: engagement(fb), rows: fb.length, text: L(`Facebook: engagement ${pct(engagement(fb), 1)} of reach, link clicks ${pct(clicks(fb), 2)} (${fb.length} posts)`, `فيسبوك: تفاعل ${pct(engagement(fb), 1)} من الوصول، نقرات ${pct(clicks(fb), 2)} (${fb.length} منشور)`) },
          { metric: 'engagement_rate', value: engagement(ig), rows: ig.length, text: L(`Instagram: engagement ${pct(engagement(ig), 1)}, link clicks ${pct(clicks(ig), 2)} (${ig.length} posts)`, `إنستجرام: تفاعل ${pct(engagement(ig), 1)}، نقرات ${pct(clicks(ig), 2)} (${ig.length} منشور)`) },
          { text: L('Metric definitions differ between platforms; compare direction, not exact values.', 'تعريفات المقاييس تختلف بين المنصتين؛ قارنوا الاتجاه لا القيم الدقيقة.') },
        ],
      });
    }
  }

  /* ---- Brand, from approved facts only ---- */
  const tone = facts.filter((f) => f.cat === 'tone');
  const brand = facts.filter((f) => f.cat === 'brandid');
  if (tone.length && brand.length) {
    const used = [...tone, ...brand];
    items.push({
      id: 'brand-doc',
      kind: 'strong',
      basis: 'facts',
      synthetic: used.some((f) => f.synthetic),
      title: L('Tone of voice and colours are documented and approved', 'نبرة الصوت والألوان موثقة ومعتمدة'),
      why: L('Documented guidelines let every asset be checked automatically instead of by eye.', 'الإرشادات الموثقة تسمح بفحص كل مادة تلقائياً بدلاً من الفحص بالعين.'),
      action: L('Keep the approved guidelines up to date as the brand evolves.', 'حدّثوا الإرشادات المعتمدة كلما تطورت العلامة.'),
      evidence: used.map((f) => ({ factId: f.id, text: f.text })),
    });
  } else {
    const missing = [tone.length ? null : L('tone of voice', 'نبرة الصوت'), brand.length ? null : L('brand identity (colours)', 'هوية العلامة (الألوان)')].filter(Boolean).join(L(' and ', ' و'));
    insufficient('brand-doc', null, L('Brand guidelines are not approved yet', 'إرشادات العلامة غير معتمدة بعد'), L(`Approve a fact for ${missing} in the Knowledge Hub.`, `اعتمدوا حقيقة لـ${missing} في مركز المعرفة.`));
  }

  return { synthetic: items.some((i) => i.synthetic), items };
}

/** Audit for one company, from validated rows and approved facts only. */
export function audit(db, companyId, { lang = 'en' } = {}) {
  const d = createData(db);
  const data = Object.fromEntries(KINDS.map((k) => [k, d.rows(companyId, k)]));
  const dates = KINDS.flatMap((k) => data[k].map((r) => r.date)).sort();
  return {
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    ...computeAudit(data, createKnowledge(db).approvedFacts(companyId), { lang }),
  };
}
