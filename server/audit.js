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
import { periods, RANGES } from './metrics.js';
import { sourceRules, decorate } from './auditMeta.js';

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
const pctPlain = (x, d = 1) => (x * 100).toFixed(d) + '%';
/** The default number wording (plain digits, as before P1). */
const PLAIN = { int: (v) => String(v), dec: (v, d) => Number(v).toFixed(d), pct: pctPlain };
/** Number wording for one language and digit style: Western digits by default, Arabic-Indic when the company chose them. */
export function makeFmt(lang = 'en', digits = 'latn') {
  // Western digits (the default, also in Arabic text) use plain en-US grouping: no invisible direction marks inside Arabic sentences.
  const loc = lang === 'ar' && digits === 'arab' ? 'ar-EG' : 'en-US';
  const nf = (o) => new Intl.NumberFormat(loc, o);
  return {
    arab: loc === 'ar-EG',
    int: (v) => nf({ maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0)),
    dec: (v, d) => nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0),
    pct: (x, d = 1) => nf({ style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(x) || 0),
  };
}
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
export function computeAudit(data, facts, { lang = 'en', prev = null, postedBefore = null, periodEnd = null, findings = null, sources = null, defs = null, now = null, fmt = null, period = null, cover = null } = {}) {
  /** Wording in the asked language; the rules and numbers are the same. */
  const L = (en, ar) => (lang === 'ar' ? ar : en);
  /** Number wording: plain digits by default (unchanged for callers that pass no formatter); `audit()` passes the locale one. */
  const F = fmt || PLAIN;
  const pct = F.pct;
  const n = F.int;
  const items = [];
  const syn = Object.fromEntries(KINDS.map((k) => [k, data[k].some((r) => r.synthetic)]));
  const conclude = (kind, dataset, o) => items.push({ ...o, kind, basis: 'data', synthetic: syn[dataset], dataset });
  const insufficient = (id, dataset, title, needs) =>
    items.push({ id, kind: 'gap', basis: 'insufficient', synthetic: dataset ? syn[dataset] : false, dataset, title, why: L('Not enough verified input to draw a conclusion here.', 'لا توجد مدخلات موثّقة كافية للوصول إلى استنتاج هنا.'), action: needs, needs, evidence: [] });

  /* ---- Website (GA4) ---- */
  const g = data.ga4;
  if (!g.length) {
    insufficient('no-ga4', 'ga4', L('Website performance is not connected', 'أداء الموقع غير مربوط'), L('Import a GA4 export (CSV) in Integrations & Data.', 'استورد تصدير GA4 (CSV) من «التكاملات والبيانات».'));
  } else {
    const S = sum(g, 'sessions');
    const E = sum(g, 'enquiries');
    if (!E) {
      conclude('weak', 'ga4', {
        id: 'no-track',
        q: { n: S, min: T.channelMinSessions, margin: 1, unit: L('sessions', 'جلسة') },
        calc: [L(`0 enquiry events ÷ ${n(S)} sessions = 0% (rule: ${n(T.channelMinSessions)}+ sessions and no enquiry event).`, `0 حدث استفسار ÷ ${n(S)} جلسة = 0٪ (القاعدة: ${n(T.channelMinSessions)} جلسة أو أكثر بلا أي حدث استفسار).`)],
        title: L('The website records no enquiry events', 'الموقع لا يسجل أي أحداث استفسار'),
        why: L('Without a key event for form submissions, WhatsApp clicks or bookings, nobody can tell which channel or page produces enquiries.', 'بدون حدث رئيسي لإرسال النموذج أو نقرات واتساب أو الحجز، لا يمكن معرفة أي قناة أو صفحة تجلب الاستفسارات.'),
        action: L('Define one GA4 key event per enquiry path (form submit, WhatsApp click, call click) and re-import.', 'عرّف حدثاً رئيسياً في GA4 لكل مسار استفسار (إرسال النموذج، نقرة واتساب، نقرة اتصال) ثم أعد الاستيراد.'),
        evidence: [
          { metric: 'sessions', value: S, rows: g.length, text: L(`${n(S)} sessions imported, 0 enquiry key events in the whole period.`, `تم استيراد ${n(S)} جلسة، و0 حدث استفسار رئيسي في كامل الفترة.`) },
          { text: L('Interpretation: tracking is most likely not configured (a true zero is unlikely at this traffic level).', 'تفسير: على الأرجح التتبع غير مُعدّ (الصفر الحقيقي غير مرجّح عند هذا الحجم من الزيارات).') },
        ],
      });
    } else {
      const rate = E / S;
      const site = { metric: 'enquiry_rate', value: rate, rows: g.length, text: L(`Site average: ${pct(rate, 2)} (${n(E)} enquiries from ${n(S)} sessions)`, `متوسط الموقع: ${pct(rate, 2)} (${n(E)} استفسار من ${n(S)} جلسة)`) };
      const channels = breakdown(g, 'channel').filter((x) => x.sessions >= T.channelMinSessions).sort((a, b) => b.rate - a.rate);
      if (channels.length < 2) {
        insufficient('ch-best', 'ga4', L('Traffic channels cannot be compared yet', 'لا يمكن مقارنة قنوات الزيارات بعد'), L(`At least two channels with ${n(T.channelMinSessions)}+ sessions each are needed (now: ${n(channels.length)}).`, `يلزم وجود قناتين على الأقل، لكل منهما ${n(T.channelMinSessions)} جلسة أو أكثر (حالياً: ${n(channels.length)}).`));
      } else {
        const best = channels[0];
        if (best.rate > rate * T.bestOverAverage) {
          conclude('strong', 'ga4', {
            id: 'ch-best',
            subject: best.name,
            q: { n: best.sessions, min: T.channelMinSessions, margin: best.rate / (rate * T.bestOverAverage) - 1, unit: L('sessions', 'جلسة') },
            calc: [L(`${best.name}: ${n(best.enquiries)} enquiries ÷ ${n(best.sessions)} sessions = ${pct(best.rate, 2)}`, `${best.name}: ${n(best.enquiries)} استفسار ÷ ${n(best.sessions)} جلسة = ${pct(best.rate, 2)}`), L(`Site: ${n(E)} ÷ ${n(S)} = ${pct(rate, 2)}; rule: above 120% of the site rate (${pct(rate * T.bestOverAverage, 2)}), channels with ${n(T.channelMinSessions)}+ sessions`, `الموقع: ${n(E)} ÷ ${n(S)} = ${pct(rate, 2)}؛ القاعدة: أعلى من 120٪ من معدل الموقع (${pct(rate * T.bestOverAverage, 2)})، للقنوات ذات ${n(T.channelMinSessions)} جلسة أو أكثر`)],
            title: L(`${best.name} visitors enquire at the highest rate`, `زوار ${best.name} هم الأعلى في معدل الاستفسار`),
            why: L('This channel already brings people with intent; growing it is lower-risk than fixing a weak one.', 'هذه القناة تجلب بالفعل زواراً لديهم نية؛ تنميتها أقل مخاطرة من إصلاح قناة ضعيفة.'),
            action: L(`Invest more effort in ${best.name}: more content, better pages, clearer follow-up.`, `استثمر جهداً أكبر في ${best.name}: محتوى أكثر، صفحات أفضل، متابعة أوضح.`),
            evidence: [{ metric: 'enquiry_rate', value: best.rate, text: L(`${best.name}: ${n(best.enquiries)} enquiries from ${n(best.sessions)} sessions (${pct(best.rate, 2)})`, `${best.name}: ${n(best.enquiries)} استفسار من ${n(best.sessions)} جلسة (${pct(best.rate, 2)})`) }, site],
          });
        }
        const leak = channels.filter((x) => x.sessions / S >= T.leakMinShare && x.rate < rate * T.leakBelowAverage).sort((a, b) => b.sessions - a.sessions)[0];
        if (leak) {
          conclude('weak', 'ga4', {
            id: 'ch-leak',
            subject: leak.name,
            q: { n: leak.sessions, min: T.channelMinSessions, margin: 1 - leak.rate / (rate * T.leakBelowAverage), unit: L('sessions', 'جلسة') },
            calc: [L(`${leak.name}: ${n(leak.enquiries)} enquiries ÷ ${n(leak.sessions)} sessions = ${pct(leak.rate, 2)}; site ${n(E)} ÷ ${n(S)} = ${pct(rate, 2)}`, `${leak.name}: ${n(leak.enquiries)} استفسار ÷ ${n(leak.sessions)} جلسة = ${pct(leak.rate, 2)}؛ الموقع ${n(E)} ÷ ${n(S)} = ${pct(rate, 2)}`), L(`Rule: 20%+ of sessions (${pct(leak.sessions / S, 0)}) and a rate below half the site rate (${pct(rate * T.leakBelowAverage, 2)})`, `القاعدة: 20٪ أو أكثر من الجلسات (${pct(leak.sessions / S, 0)}) ومعدل أقل من نصف معدل الموقع (${pct(rate * T.leakBelowAverage, 2)})`)],
            title: L(`${leak.name} brings many visits but few enquiries`, `${leak.name} تجلب زيارات كثيرة واستفسارات قليلة`),
            why: L('Attention is being won but not converted.', 'نكسب الانتباه ولا نحوّله إلى استفسارات.'),
            action: L(`Send ${leak.name} traffic to a dedicated landing page with one CTA instead of general pages.`, `وجّه زيارات ${leak.name} إلى صفحة هبوط مخصصة بدعوة واحدة لاتخاذ إجراء بدلاً من الصفحات العامة.`),
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
            subject: page.name,
            q: { n: page.sessions, min: T.channelMinSessions, margin: 1 - page.rate / (rate * T.pageBelowAverage), unit: L('sessions', 'جلسة') },
            calc: [L(`${page.name}: ${n(page.enquiries)} ÷ ${n(page.sessions)} = ${pct(page.rate, 2)}; site ${pct(rate, 2)}; rule: 12%+ of sessions and below 60% of the site rate (${pct(rate * T.pageBelowAverage, 2)})`, `${page.name}: ${n(page.enquiries)} ÷ ${n(page.sessions)} = ${pct(page.rate, 2)}؛ الموقع ${pct(rate, 2)}؛ القاعدة: 12٪ أو أكثر من الجلسات وأقل من 60٪ من معدل الموقع (${pct(rate * T.pageBelowAverage, 2)})`)],
            title: L(`Landing page ${page.name} under-converts`, `صفحة الهبوط ${page.name} أقل تحويلاً من المتوسط`),
            why: L('A high-traffic page converting below the site average is the cheapest place to gain enquiries: the visitors are already there.', 'صفحة عالية الزيارات بتحويل أقل من متوسط الموقع هي أرخص مكان لكسب استفسارات: الزوار موجودون بالفعل.'),
            action: L(`Review ${page.name}: put the primary CTA above the fold, shorten the form, state the offer in the first screen.`, `راجع ${page.name}: ضع الدعوة الرئيسية في أعلى الصفحة، اختصر النموذج، واذكر العرض في الشاشة الأولى.`),
            evidence: [{ metric: 'enquiry_rate', value: page.rate, text: L(`${page.name}: ${n(page.sessions)} sessions (${pct(page.sessions / S, 0)}), enquiry rate ${pct(page.rate, 2)} vs site ${pct(rate, 2)}`, `${page.name}: ${n(page.sessions)} جلسة (${pct(page.sessions / S, 0)})، معدل الاستفسار ${pct(page.rate, 2)} مقابل ${pct(rate, 2)} للموقع`) }],
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
          q: { n: mo.sessions, min: T.channelMinSessions, margin: 1 - mo.rate / (de.rate * T.mobileBelowDesktop), unit: L('sessions', 'جلسة') },
          calc: [L(`Mobile: ${n(mo.enquiries)} ÷ ${n(mo.sessions)} = ${pct(mo.rate, 2)}; desktop: ${n(de.enquiries)} ÷ ${n(de.sessions)} = ${pct(de.rate, 2)}`, `الجوال: ${n(mo.enquiries)} ÷ ${n(mo.sessions)} = ${pct(mo.rate, 2)}؛ سطح المكتب: ${n(de.enquiries)} ÷ ${n(de.sessions)} = ${pct(de.rate, 2)}`), L(`Rule: mobile 30%+ of sessions and below 60% of the desktop rate (${pct(de.rate * T.mobileBelowDesktop, 2)})`, `القاعدة: الجوال 30٪ أو أكثر من الجلسات وأقل من 60٪ من معدل سطح المكتب (${pct(de.rate * T.mobileBelowDesktop, 2)})`)],
          title: L('Mobile visitors enquire far less than desktop visitors', 'زوار الجوال يستفسرون أقل بكثير من زوار سطح المكتب'),
          why: L('If the mobile path is harder, every channel pays for it.', 'إذا كان مسار الجوال أصعب، فكل القنوات تدفع الثمن.'),
          action: L('Test the enquiry path on a phone: form length, button size, load time, WhatsApp/click-to-call option.', 'اختبر مسار الاستفسار على الهاتف: طول النموذج، حجم الأزرار، زمن التحميل، وخيار واتساب أو الاتصال بنقرة.'),
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
    insufficient('no-gsc', 'gsc', L('Organic search visibility is unknown', 'الظهور في البحث العضوي غير معروف'), L('Import a Search Console performance export.', 'استورد تصدير الأداء من Search Console.'));
  } else {
    const queries = [...groupBy(data.gsc, 'query')].map(([name, rs]) => {
      const impressions = sum(rs, 'impressions');
      return { name, impressions, clicks: sum(rs, 'clicks'), position: rs.reduce((s, x) => s + (Number(x.position) || 0) * x.impressions, 0) / Math.max(1, impressions) };
    });
    const big = queries.filter((x) => x.impressions >= T.queryMinImpressions);
    if (!big.length) {
      insufficient('seo-q', 'gsc', L('Search queries are too small to judge yet', 'استعلامات البحث أصغر من أن يُحكم عليها بعد'), L(`A query needs ${n(T.queryMinImpressions)}+ impressions before its click rate means anything.`, `يحتاج الاستعلام إلى ${n(T.queryMinImpressions)} ظهور أو أكثر قبل أن يكون لمعدل النقر معنى.`));
    } else {
      const missed = big
        .filter((x) => x.position >= T.queryPosition[0] && x.position <= T.queryPosition[1] && x.clicks / x.impressions < T.queryMaxCtr)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 3);
      if (missed.length) {
        conclude('opp', 'gsc', {
          id: 'seo-q',
          q: { n: missed[0].impressions, min: T.queryMinImpressions, margin: 1 - (missed[0].clicks / missed[0].impressions) / T.queryMaxCtr, unit: L('impressions', 'ظهور') },
          calc: [L(`Rule: ${n(T.queryMinImpressions)}+ impressions, average position 5–15, click rate under ${pct(T.queryMaxCtr, 1)}; ${n(missed.length)} quer(ies) match`, `القاعدة: ${n(T.queryMinImpressions)} ظهور أو أكثر، متوسط المركز 5–15، معدل نقر أقل من ${pct(T.queryMaxCtr, 1)}؛ ${n(missed.length)} استعلام مطابق`)],
          title: L('People search for what you offer but rarely reach you', 'الناس يبحثون عمّا تقدمه لكنهم قلّما يصلون إليك'),
          why: L('These queries already show your pages. Moving a few positions up usually costs less than buying the same visits.', 'هذه الاستعلامات تُظهر صفحاتك بالفعل. التقدم بضعة مراكز يكلّف عادةً أقل من شراء الزيارات نفسها.'),
          action: L('Create or improve one page per query: put the phrase in the title, answer the need directly, add the primary CTA.', 'أنشئ أو حسّن صفحة لكل استعلام: ضع العبارة في العنوان، أجب عن الحاجة مباشرة، وأضف الدعوة الرئيسية.'),
          evidence: missed.map((x) => ({ metric: 'ctr', value: x.clicks / x.impressions, text: L(`"${x.name}": ${n(x.impressions)} impressions, ${n(x.clicks)} clicks (${pct(x.clicks / x.impressions, 1)}), average position ${F.dec(x.position, 1)}`, `«${x.name}»: ${n(x.impressions)} ظهور، ${n(x.clicks)} نقرة (${pct(x.clicks / x.impressions, 1)})، متوسط المركز ${F.dec(x.position, 1)}`) })),
        });
      }
    }
  }

  /* ---- Leads ---- */
  const l = data.leads;
  if (!l.length) {
    insufficient('no-leads', 'leads', L('Lead quality and sales outcomes are not connected', 'جودة العملاء المحتملين ونتائج المبيعات غير مربوطة'), L('Export leads from your CRM or sheet with date, source, segment and status, and import the CSV.', 'صدّر العملاء المحتملين من نظام CRM أو الجدول مع التاريخ والمصدر والشريحة والحالة، ثم استورد ملف CSV.'));
  } else {
    const overall = l.filter(isQualified).length / l.length;
    const all = { metric: 'qualified_share', value: overall, rows: l.length, text: L(`All leads: ${pct(overall, 0)} qualified (${n(l.length)} leads)`, `كل العملاء المحتملين: ${pct(overall, 0)} مؤهلون (${n(l.length)} عميل محتمل)`) };
    const unknown = l.filter((x) => !x.source).length / l.length;
    if (unknown >= T.unknownSourceShare) {
      conclude('weak', 'leads', {
        id: 'src-unknown',
        q: { n: l.length, min: T.sourceMinLeads, margin: unknown / T.unknownSourceShare - 1, unit: L('leads', 'عميل محتمل') },
        calc: [L(`${n(l.filter((x) => !x.source).length)} leads without a source ÷ ${n(l.length)} = ${pct(unknown, 0)} (rule: ${pct(T.unknownSourceShare, 0)} or more)`, `${n(l.filter((x) => !x.source).length)} عميل بلا مصدر ÷ ${n(l.length)} = ${pct(unknown, 0)} (القاعدة: ${pct(T.unknownSourceShare, 0)} أو أكثر)`)],
        title: L('The source of many leads is not recorded', 'مصدر كثير من العملاء المحتملين غير مسجَّل'),
        why: L('Leads with no source cannot be credited to any channel, so good channels look weaker than they are.', 'العملاء المحتملون بلا مصدر لا يُنسبون إلى أي قناة، فتبدو القنوات الجيدة أضعف مما هي.'),
        action: L('Add a required "How did you hear about us?" field or capture UTM values in the form.', 'أضف حقلاً إلزامياً «كيف سمعتم عنا؟» أو التقط قيم UTM في النموذج.'),
        evidence: [{ metric: 'unknown_source_share', value: unknown, rows: l.length, text: L(`${pct(unknown, 0)} of ${n(l.length)} leads have an empty source field.`, `${pct(unknown, 0)} من ${n(l.length)} عميل محتمل حقل المصدر لديهم فارغ.`) }],
      });
    }
    const sources = [...groupBy(l, 'source')].map(([name, rs]) => ({ name, count: rs.length, qualified: rs.filter(isQualified).length, rate: rs.filter(isQualified).length / rs.length }));
    const sized = sources.filter((x) => x.count >= T.sourceMinLeads);
    if (!sized.length) {
      insufficient('src-best', 'leads', L('Lead sources cannot be compared yet', 'لا يمكن مقارنة مصادر العملاء المحتملين بعد'), L(`A source needs ${n(T.sourceMinLeads)}+ leads before its quality can be judged.`, `يحتاج المصدر إلى ${n(T.sourceMinLeads)} عميلاً محتملاً أو أكثر قبل الحكم على جودته.`));
    } else {
      const best = [...sized].sort((a, b) => b.rate - a.rate)[0];
      if (best.rate > overall * T.bestOverAverage) {
        conclude('strong', 'leads', {
          id: 'src-best',
          subject: best.name,
          q: { n: best.count, min: T.sourceMinLeads, margin: best.rate / (overall * T.bestOverAverage) - 1, unit: L('leads', 'عميل محتمل') },
          calc: [L(`${best.name}: ${n(best.qualified)} ÷ ${n(best.count)} = ${pct(best.rate, 0)} qualified; all leads ${pct(overall, 0)}; rule: above 120% of the overall share (${pct(overall * T.bestOverAverage, 0)}), sources with ${n(T.sourceMinLeads)}+ leads`, `${best.name}: ${n(best.qualified)} ÷ ${n(best.count)} = ${pct(best.rate, 0)} مؤهلون؛ كل العملاء ${pct(overall, 0)}؛ القاعدة: أعلى من 120٪ من النسبة العامة (${pct(overall * T.bestOverAverage, 0)})، للمصادر ذات ${n(T.sourceMinLeads)} عميلاً أو أكثر`)],
          title: L(`${best.name} brings your best-quality leads`, `${best.name} يجلب أفضل عملائك المحتملين جودةً`),
          why: L('Quality, not volume, is what turns into customers.', 'الجودة، لا العدد، هي ما يتحول إلى عملاء.'),
          action: L(`Protect and grow ${best.name}; study what these leads saw before enquiring.`, `حافظ على ${best.name} ونمّه؛ وادرس ما رآه هؤلاء العملاء قبل الاستفسار.`),
          evidence: [{ metric: 'qualified_share', value: best.rate, rows: best.count, text: L(`${best.name}: ${n(best.qualified)} of ${n(best.count)} leads qualified (${pct(best.rate, 0)})`, `${best.name}: ${n(best.qualified)} من ${n(best.count)} عميل محتمل مؤهلون (${pct(best.rate, 0)})`) }, all],
        });
      }
      const low = sources.filter((x) => x.count >= T.lowQualityMinLeads && x.rate < overall * T.lowQualityBelowAverage).sort((a, b) => b.count - a.count)[0];
      if (low) {
        conclude('weak', 'leads', {
          id: 'src-lowq',
          subject: low.name,
          q: { n: low.count, min: T.lowQualityMinLeads, margin: 1 - low.rate / (overall * T.lowQualityBelowAverage), unit: L('leads', 'عميل محتمل') },
          calc: [L(`${low.name}: ${n(low.qualified)} ÷ ${n(low.count)} = ${pct(low.rate, 0)} qualified; rule: ${n(T.lowQualityMinLeads)}+ leads and below 60% of the overall share (${pct(overall * T.lowQualityBelowAverage, 0)})`, `${low.name}: ${n(low.qualified)} ÷ ${n(low.count)} = ${pct(low.rate, 0)} مؤهلون؛ القاعدة: ${n(T.lowQualityMinLeads)} عميلاً أو أكثر وأقل من 60٪ من النسبة العامة (${pct(overall * T.lowQualityBelowAverage, 0)})`)],
          title: L(`${low.name} produces volume, not quality`, `${low.name} ينتج عدداً لا جودة`),
          why: L('Counting these leads as success would reward the wrong activity.', 'اعتبار هؤلاء العملاء نجاحاً يكافئ النشاط الخطأ.'),
          action: L(`Tighten the audience and message on ${low.name}: name who the offer is for, and add one qualifying question to the form.`, `ضيّق الجمهور والرسالة في ${low.name}: حدّد لمن العرض، وأضف سؤال تأهيل واحداً إلى النموذج.`),
          evidence: [{ metric: 'qualified_share', value: low.rate, rows: low.count, text: L(`${low.name}: ${n(low.count)} leads, ${pct(low.rate, 0)} qualified vs ${pct(overall, 0)} overall`, `${low.name}: ${n(low.count)} عميل محتمل، ${pct(low.rate, 0)} مؤهلون مقابل ${pct(overall, 0)} إجمالاً`) }],
        });
      }
    }
    // Segments: the rule campaigns are built from ("Create campaign from this" in the Audit).
    const segments = [...groupBy(l, 'segment')]
      .map(([name, rs]) => ({ name, count: rs.length, qualified: rs.filter(isQualified).length, rate: rs.filter(isQualified).length / rs.length }))
      .filter((x) => x.count >= T.segmentMinLeads)
      .sort((a, b) => b.rate - a.rate);
    if (segments.length < 2) {
      insufficient('seg-best', 'leads', L('Customer segments cannot be compared yet', 'لا يمكن مقارنة شرائح العملاء بعد'), L(`Two segments need ${n(T.segmentMinLeads)}+ leads each, with the segment filled in on the lead, before they can be compared.`, `تحتاج شريحتان إلى ${n(T.segmentMinLeads)} عميلاً محتملاً أو أكثر لكل منهما، مع تعبئة الشريحة لكل عميل، قبل المقارنة.`));
    } else if (segments[0].rate > overall * T.segmentOverAverage) {
      const top = segments[0];
      conclude('opp', 'leads', {
        id: 'seg-best',
        subject: top.name,
        seg: top.name,
        q: { n: top.count, min: T.segmentMinLeads, margin: top.rate / (overall * T.segmentOverAverage) - 1, unit: L('leads', 'عميل محتمل') },
        calc: [L(`${top.name}: ${n(top.qualified)} ÷ ${n(top.count)} = ${pct(top.rate, 0)} qualified; all leads ${pct(overall, 0)}; rule: above 115% of the overall share (${pct(overall * T.segmentOverAverage, 0)})`, `${top.name}: ${n(top.qualified)} ÷ ${n(top.count)} = ${pct(top.rate, 0)} مؤهلون؛ كل العملاء ${pct(overall, 0)}؛ القاعدة: أعلى من 115٪ من النسبة العامة (${pct(overall * T.segmentOverAverage, 0)})`)],
        title: L(`"${top.name}" is your strongest customer segment`, `«${top.name}» هي أقوى شريحة عملاء لديك`),
        why: L('A campaign aimed at the segment that already qualifies best is the most evidence-backed way to raise lead quality.', 'حملة موجهة للشريحة الأعلى تأهيلاً هي أكثر طريقة مدعومة بالدليل لرفع جودة العملاء المحتملين.'),
        action: L(`Run a campaign addressed to ${top.name}, built only from approved product facts.`, `نفّذ حملة موجهة إلى ${top.name}، مبنية فقط على حقائق المنتج المعتمدة.`),
        evidence: segments.map((x) => ({
          metric: 'qualified_share',
          value: x.rate,
          rows: x.count,
          text: L(`${x.name}: ${pct(x.rate, 0)} qualified (${n(x.count)} leads${x.count < T.segmentSmallSample ? ', small sample' : ''})`, `${x.name}: ${pct(x.rate, 0)} مؤهلون (${n(x.count)} عميل محتمل${x.count < T.segmentSmallSample ? '، عينة صغيرة' : ''})`),
        })),
      });
    }
  }

  /* ---- Social (Meta) ---- */
  const m = data.meta;
  // Posting cadence (fix 2026-11-20, owner review of P1): a gap that started before the period is still a problem inside
  // it, so with a period chosen the gaps are counted from the last post BEFORE the period (postedBefore); and a gap that
  // is still open at the end of the period (no posts since) counts too (periodEnd). Without these options: as before.
  const postingGap = (rows) => {
    const days = [...new Set(rows.map((x) => x.date))].sort();
    const seq = postedBefore ? [postedBefore, ...days] : days;
    let gap = 0;
    let after = '';
    let open = false;
    for (let i = 1; i < seq.length; i++) {
      const d = dayDiff(seq[i - 1], seq[i]);
      if (d > gap) { gap = d; after = seq[i - 1]; }
    }
    if (periodEnd && seq.length && seq[seq.length - 1] < periodEnd) {
      const d = dayDiff(seq[seq.length - 1], periodEnd);
      if (d > gap) { gap = d; after = seq[seq.length - 1]; open = true; }
    }
    return { days, seq, gap, after, open };
  };
  const cadenceItem = (rows, pg) => {
    const where = postedBefore ? L('in this period', 'في هذه الفترة') : L('in the import', 'ضمن الاستيراد');
    conclude('weak', 'meta', {
      id: 'cadence',
      q: pg.open
        ? { level: 'med', why: L(`no posts in your imported data since ${pg.after}; if your last social export ended earlier, the gap may be in the export rather than in your posting.`, `لا منشورات في بياناتك المستوردة منذ ${pg.after}؛ إن كان آخر تصدير للمنشورات قد انتهى قبل ذلك فقد تكون الفجوة في التصدير لا في النشر.`) }
        : { n: rows.length, min: 10, margin: pg.gap / T.cadenceMaxGap - 1, unit: L('posts', 'منشور') },
      calc: [L(`Longest gap between posting days: ${n(pg.gap)} days (rule: more than ${n(T.cadenceMaxGap)})${postedBefore ? `, counted from the last post before this period (${postedBefore})` : ''}${pg.open ? `, still open on ${periodEnd}` : ''}`, `أطول فجوة بين أيام النشر: ${n(pg.gap)} يوماً (القاعدة: أكثر من ${n(T.cadenceMaxGap)})${postedBefore ? `، محسوبة من آخر منشور قبل هذه الفترة (${postedBefore})` : ''}${pg.open ? `، وما زالت مستمرة في ${periodEnd}` : ''}`)],
      title: pg.open ? L(`No posts for ${n(pg.gap)} days`, `لا منشورات منذ ${n(pg.gap)} يوماً`) : L(`Posting stopped for ${n(pg.gap)} days`, `توقف النشر لمدة ${n(pg.gap)} يوماً`),
      why: L('Irregular publishing makes results hard to read and gives followers no reason to expect you.', 'النشر غير المنتظم يصعّب قراءة النتائج ولا يعطي المتابعين سبباً لانتظارك.'),
      action: L('Adopt a fixed weekly calendar; Campaign Studio generates one with each campaign.', 'اعتمد تقويماً أسبوعياً ثابتاً؛ استوديو الحملات ينشئ واحداً مع كل حملة.'),
      evidence: [
        pg.open
          ? { metric: 'posting_gap_days', value: pg.gap, text: L(`No posts since ${pg.after} (until ${periodEnd}).`, `لا منشورات منذ ${pg.after} (حتى ${periodEnd}).`) }
          : { metric: 'posting_gap_days', value: pg.gap, text: L(`No posts between ${pg.after} and ${addDays(pg.after, pg.gap)}.`, `لا توجد منشورات بين ${pg.after} و ${addDays(pg.after, pg.gap)}.`) },
        { metric: 'posts', value: rows.length, rows: rows.length, text: L(`${n(rows.length)} posts across ${n(pg.days.length)} posting days ${where}.`, `${n(rows.length)} منشور في ${n(pg.days.length)} يوم نشر ${where}.`) },
      ],
      ...(pg.open ? { assume: [L('Counts only the posts in your imported data.', 'يحسب فقط المنشورات الموجودة في بياناتك المستوردة.')] } : {}),
    });
  };
  if (!m.length && postedBefore) {
    // Social data exists, but no post falls in this period: the gap is the finding, not a missing connection.
    const pg = postingGap(m);
    if (pg.gap > T.cadenceMaxGap) cadenceItem(m, pg);
  } else if (!m.length) {
    insufficient('no-meta', 'meta', L('Social performance is not connected', 'أداء وسائل التواصل غير مربوط'), L('Import a Meta Business Suite export in Integrations & Data.', 'استورد تصدير Meta Business Suite من «التكاملات والبيانات».'));
  } else {
    // Engagement per person reached. Posts tagged "campaign" are not a content theme.
    const engagement = (rs) => sum(rs, 'engagements') / Math.max(1, sum(rs, 'reach'));
    const account = engagement(m);
    const themes = [...groupBy(m.filter((x) => x.theme !== 'campaign'), 'theme')]
      .filter(([, rs]) => rs.length >= T.themeMinPosts)
      .map(([name, rs]) => ({ name, posts: rs.length, rate: engagement(rs), clicks: sum(rs, 'link_clicks') / Math.max(1, sum(rs, 'reach')) }))
      .sort((a, b) => b.rate - a.rate);
    if (themes.length < 2) {
      insufficient('theme-best', 'meta', L('Content themes cannot be compared yet', 'لا يمكن مقارنة موضوعات المحتوى بعد'), L(`Two themes need ${n(T.themeMinPosts)}+ posts each, with the theme filled in on the post, before they can be compared.`, `يحتاج موضوعان إلى ${n(T.themeMinPosts)} منشورات أو أكثر لكل منهما، مع تعبئة الموضوع لكل منشور، قبل المقارنة.`));
    } else if (themes[0].rate > account * T.themeOverAverage) {
      const top = themes[0];
      const weakest = themes[themes.length - 1];
      conclude('strong', 'meta', {
        id: 'theme-best',
        subject: top.name,
        weakest: weakest.name,
        q: { n: top.posts, min: T.themeMinPosts, margin: top.rate / (account * T.themeOverAverage) - 1, unit: L('posts', 'منشور') },
        calc: [L(`"${top.name}": engagements ÷ reach = ${pct(top.rate, 1)}; account ${pct(account, 1)}; rule: above 120% of the account rate (${pct(account * T.themeOverAverage, 1)}), themes with ${n(T.themeMinPosts)}+ posts`, `«${top.name}»: التفاعل ÷ الوصول = ${pct(top.rate, 1)}؛ الحساب ${pct(account, 1)}؛ القاعدة: أعلى من 120٪ من معدل الحساب (${pct(account * T.themeOverAverage, 1)})، للموضوعات ذات ${n(T.themeMinPosts)} منشورات أو أكثر`)],
        title: L(`"${top.name}" is your strongest content theme`, `«${top.name}» هو أقوى موضوع محتوى لديك`),
        why: L('Your own history shows what the audience responds to — a better guide than generic best practice.', 'تاريخك نفسه يبيّن ما يتفاعل معه الجمهور — وهو دليل أفضل من الممارسات العامة.'),
        action: L(`Publish more "${top.name}" posts and end each with the primary CTA and a tracked link.`, `انشر مزيداً من منشورات «${top.name}» واختم كلاً منها بالدعوة الرئيسية ورابط متتبَّع.`),
        evidence: [
          { metric: 'engagement_rate', value: top.rate, rows: top.posts, text: L(`"${top.name}": engagement ${pct(top.rate, 1)} of reach across ${n(top.posts)} posts; link clicks ${pct(top.clicks, 2)} of reach`, `«${top.name}»: التفاعل ${pct(top.rate, 1)} من الوصول عبر ${n(top.posts)} منشور؛ نقرات الروابط ${pct(top.clicks, 2)} من الوصول`) },
          { metric: 'engagement_rate', value: account, rows: m.length, text: L(`Account average engagement: ${pct(account, 1)}; weakest theme "${weakest.name}": ${pct(weakest.rate, 1)}`, `متوسط تفاعل الحساب: ${pct(account, 1)}؛ أضعف موضوع «${weakest.name}»: ${pct(weakest.rate, 1)}`) },
          { text: L('Engagement is an awareness signal, not proof of enquiries.', 'التفاعل إشارة وعي، وليس دليلاً على استفسارات.') },
        ],
      });
    }

    // Posting cadence: the longest gap between two posting days (see postingGap above).
    const pg = postingGap(m);
    const days = pg.days;
    if (pg.seq.length < 2 && !pg.open) {
      insufficient('cadence', 'meta', L('Posting rhythm cannot be checked yet', 'لا يمكن فحص انتظام النشر بعد'), L('Posts from at least two different days are needed.', 'يلزم وجود منشورات من يومين مختلفين على الأقل.'));
    } else {
      if (pg.gap > T.cadenceMaxGap) cadenceItem(m, pg);

      // Engagement in the last 28 days of posts against the earlier baseline (campaign posts left out of the recent window, as in the browser).
      const cut = addDays(days[days.length - 1], -(T.recentDays - 1));
      // P1: with a period chosen (prev given) the trend compares this period with the period before it, like the KPIs.
      const byPeriod = !!(prev && prev.meta);
      const recent = byPeriod ? m.filter((x) => x.theme !== 'campaign') : m.filter((x) => x.date >= cut && x.theme !== 'campaign');
      const earlier = byPeriod ? prev.meta : m.filter((x) => x.date < cut);
      if (recent.length < T.recentMinPosts || earlier.length < T.baselineMinPosts) {
        insufficient('eng-drop', 'meta', L('Engagement trend cannot be checked yet', 'لا يمكن فحص اتجاه التفاعل بعد'), L(`${n(T.recentMinPosts)}+ posts in the last ${n(T.recentDays)} days and ${n(T.baselineMinPosts)}+ earlier posts are needed (now: ${n(recent.length)} and ${n(earlier.length)}).`, `يلزم ${n(T.recentMinPosts)} منشورات أو أكثر في آخر ${n(T.recentDays)} يوماً و${n(T.baselineMinPosts)} منشورات سابقة أو أكثر (حالياً: ${n(recent.length)} و${n(earlier.length)}).`));
      } else if (engagement(recent) < engagement(earlier) * T.engagementDrop) {
        conclude('weak', 'meta', {
          id: 'eng-drop',
          q: { n: recent.length, min: T.recentMinPosts, margin: 1 - engagement(recent) / (engagement(earlier) * T.engagementDrop), unit: L('posts', 'منشور') },
          calc: [L(`Recent ${pct(engagement(recent), 1)} vs earlier ${pct(engagement(earlier), 1)}; rule: below 85% of the earlier rate (${pct(engagement(earlier) * T.engagementDrop, 1)})`, `الأخيرة ${pct(engagement(recent), 1)} مقابل السابقة ${pct(engagement(earlier), 1)}؛ القاعدة: أقل من 85٪ من المعدل السابق (${pct(engagement(earlier) * T.engagementDrop, 1)})`)],
          title: L('Engagement is below your own baseline', 'التفاعل أقل من مستواك المعتاد'),
          why: L('The comparison is with your own earlier posts, not an industry benchmark.', 'المقارنة مع منشوراتك السابقة وليس مع معيار للصناعة.'),
          action: L('Check the theme mix of recent posts against the strongest theme before changing anything else.', 'قارن موضوعات المنشورات الأخيرة بأقوى موضوع قبل تغيير أي شيء آخر.'),
          evidence: [
            { metric: 'engagement_rate', value: engagement(recent), rows: recent.length, text: byPeriod ? L(`This period: ${pct(engagement(recent), 1)} engagement per reach (${n(recent.length)} posts)`, `هذه الفترة: ${pct(engagement(recent), 1)} تفاعل لكل وصول (${n(recent.length)} منشور)`) : L(`Last ${n(T.recentDays)} days: ${pct(engagement(recent), 1)} engagement per reach (${n(recent.length)} posts)`, `آخر ${n(T.recentDays)} يوماً: ${pct(engagement(recent), 1)} تفاعل لكل وصول (${n(recent.length)} منشور)`) },
            { metric: 'engagement_rate', value: engagement(earlier), rows: earlier.length, text: byPeriod ? L(`The period before: ${pct(engagement(earlier), 1)} (${n(earlier.length)} posts)`, `الفترة السابقة: ${pct(engagement(earlier), 1)} (${n(earlier.length)} منشور)`) : L(`Earlier baseline: ${pct(engagement(earlier), 1)} (${n(earlier.length)} posts)`, `المستوى السابق: ${pct(engagement(earlier), 1)} (${n(earlier.length)} منشور)`) },
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
        insufficient('lang', 'meta', L('Arabic and English posts cannot be compared yet', 'لا يمكن مقارنة المنشورات العربية والإنجليزية بعد'), L(`${n(T.languageMinPosts)}+ posts in each language are needed (now: ${n(ar.length)} Arabic, ${n(en.length)} English).`, `يلزم ${n(T.languageMinPosts)} منشورات أو أكثر بكل لغة (حالياً: ${n(ar.length)} عربي و${n(en.length)} إنجليزي).`));
      } else {
        const a = engagement(ar);
        const b = engagement(en);
        if (Math.max(a, b) / Math.min(a, b) > T.languageGap) {
          conclude('opp', 'meta', {
            id: 'lang',
            q: { n: Math.min(ar.length, en.length), min: T.languageMinPosts, margin: Math.max(a, b) / Math.min(a, b) / T.languageGap - 1, unit: L('posts', 'منشور') },
            calc: [L(`Arabic ${pct(a, 1)} vs English ${pct(b, 1)} engagement per reach; rule: the stronger more than 12% ahead, ${n(T.languageMinPosts)}+ posts each`, `العربية ${pct(a, 1)} مقابل الإنجليزية ${pct(b, 1)} تفاعل لكل وصول؛ القاعدة: الأقوى متقدمة بأكثر من 12٪، و${n(T.languageMinPosts)} منشورات أو أكثر لكل لغة`)],
            title: a > b ? L('Arabic posts earn more engagement than English posts', 'المنشورات العربية تحقق تفاعلاً أعلى من الإنجليزية') : L('English posts earn more engagement than Arabic posts', 'المنشورات الإنجليزية تحقق تفاعلاً أعلى من العربية'),
            why: L('Language is a cheap lever: the same idea can be published in the language the audience prefers.', 'اللغة رافعة قليلة التكلفة: الفكرة نفسها يمكن نشرها باللغة التي يفضلها الجمهور.'),
            action: L('Lead campaigns with the stronger language and test whether it also brings more enquiries.', 'ابدأ الحملات باللغة الأقوى واختبر هل تجلب استفسارات أكثر أيضاً.'),
            evidence: [
              { metric: 'engagement_rate', value: a, rows: ar.length, text: L(`Arabic: ${pct(a, 1)} of reach (${n(ar.length)} posts)`, `العربية: ${pct(a, 1)} من الوصول (${n(ar.length)} منشور)`) },
              { metric: 'engagement_rate', value: b, rows: en.length, text: L(`English: ${pct(b, 1)} of reach (${n(en.length)} posts)`, `الإنجليزية: ${pct(b, 1)} من الوصول (${n(en.length)} منشور)`) },
            ],
          });
        }
      }
    }

    // Without spend, cost per lead cannot be calculated. Not a conclusion about the business: a missing input.
    if (!sum(m, 'spend')) {
      items.push({
        id: 'no-spend', kind: 'gap', basis: 'insufficient', synthetic: syn.meta, dataset: 'meta',
        title: L('No spend data — cost per lead cannot be calculated', 'لا توجد بيانات إنفاق — تعذّر حساب تكلفة العميل'),
        why: L('Cost per lead needs both spend and leads tied to the same campaign.', 'تكلفة العميل تحتاج الإنفاق والعملاء مرتبطين بنفس الحملة.'),
        action: L('Include the spend column when exporting paid posts.', 'أضف عمود الإنفاق عند تصدير المنشورات المدفوعة.'),
        needs: L('Include the spend column when exporting paid posts.', 'أضف عمود الإنفاق عند تصدير المنشورات المدفوعة.'),
        evidence: [{ metric: 'spend', value: 0, rows: m.length, text: L('The spend column is empty in all imported social post rows.', 'عمود الإنفاق فارغ في كل صفوف منشورات التواصل المستوردة.') }],
        calc: [L(`Spend summed over ${n(m.length)} social post rows = 0.`, `مجموع الإنفاق في ${n(m.length)} صف منشورات = 0.`)],
        q: { certain: true, why: L(`Counted directly: no spend in ${n(m.length)} post rows.`, `معدود مباشرة: لا إنفاق في ${n(m.length)} صف منشورات.`) },
      });
    }

    // Facebook and Instagram side by side. One platform only is a normal state, not missing data.
    const platforms = groupBy(m, 'platform');
    const fb = platforms.get('facebook');
    const ig = platforms.get('instagram');
    if (fb && ig) {
      const clicks = (rs) => sum(rs, 'link_clicks') / Math.max(1, sum(rs, 'reach'));
      conclude('opp', 'meta', {
        id: 'plat-roles',
        q: { n: Math.min(fb.length, ig.length), min: 5, margin: Math.abs(clicks(fb) - clicks(ig)) / Math.max(1e-9, clicks(fb), clicks(ig)), unit: L('posts', 'منشور') },
        calc: [L(`Link clicks ÷ reach: Facebook ${pct(clicks(fb), 2)}, Instagram ${pct(clicks(ig), 2)}`, `النقرات ÷ الوصول: فيسبوك ${pct(clicks(fb), 2)}، إنستجرام ${pct(clicks(ig), 2)}`)],
        title: L('Facebook and Instagram do different jobs', 'فيسبوك وإنستجرام يؤديان دورين مختلفين'),
        why: L('Treating both platforms the same wastes the strength of each.', 'معاملة المنصتين بالطريقة نفسها تهدر قوة كل منهما.'),
        action: clicks(fb) > clicks(ig)
          ? L('Use Facebook for posts that link to the landing page; use Instagram for attention and DMs.', 'استخدم فيسبوك للمنشورات التي تقود إلى صفحة الهبوط، وإنستجرام لجذب الانتباه والرسائل.')
          : L('Use Instagram as the main traffic and enquiry driver; keep Facebook for reach among existing followers.', 'اجعل إنستجرام المحرك الأساسي للزيارات والاستفسارات، وفيسبوك للوصول إلى المتابعين الحاليين.'),
        evidence: [
          { metric: 'engagement_rate', value: engagement(fb), rows: fb.length, text: L(`Facebook: engagement ${pct(engagement(fb), 1)} of reach, link clicks ${pct(clicks(fb), 2)} (${n(fb.length)} posts)`, `فيسبوك: تفاعل ${pct(engagement(fb), 1)} من الوصول، نقرات ${pct(clicks(fb), 2)} (${n(fb.length)} منشور)`) },
          { metric: 'engagement_rate', value: engagement(ig), rows: ig.length, text: L(`Instagram: engagement ${pct(engagement(ig), 1)}, link clicks ${pct(clicks(ig), 2)} (${n(ig.length)} posts)`, `إنستجرام: تفاعل ${pct(engagement(ig), 1)}، نقرات ${pct(clicks(ig), 2)} (${n(ig.length)} منشور)`) },
          { text: L('Metric definitions differ between platforms; compare direction, not exact values.', 'تعريفات المقاييس تختلف بين المنصتين؛ قارن الاتجاه لا القيم الدقيقة.') },
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
      dataset: null,
      q: { certain: true, why: L(`Read directly: ${n(used.length)} approved facts for tone and brand identity.`, `مقروء مباشرة: ${n(used.length)} حقائق معتمدة للنبرة وهوية العلامة.`) },
      calc: [L(`Approved tone facts: ${n(tone.length)}; approved brand identity facts: ${n(brand.length)} (rule: at least one of each)`, `حقائق النبرة المعتمدة: ${n(tone.length)}؛ حقائق هوية العلامة المعتمدة: ${n(brand.length)} (القاعدة: واحدة على الأقل من كل نوع)`)],
      kind: 'strong',
      basis: 'facts',
      synthetic: used.some((f) => f.synthetic),
      title: L('Tone of voice and colours are documented and approved', 'نبرة الصوت والألوان موثقة ومعتمدة'),
      why: L('Documented guidelines let every asset be checked automatically instead of by eye.', 'الإرشادات الموثقة تسمح بفحص كل مادة تلقائياً بدلاً من الفحص بالعين.'),
      action: L('Keep the approved guidelines up to date as the brand evolves.', 'حدّث الإرشادات المعتمدة كلما تطورت العلامة.'),
      evidence: used.map((f) => ({ factId: f.id, text: f.text })),
      sourcesUsed: [...new Set(used.map((f) => f.srcTitle).filter(Boolean))],
    });
  } else {
    const missing = [tone.length ? null : L('tone of voice', 'نبرة الصوت'), brand.length ? null : L('brand identity (colours)', 'هوية العلامة (الألوان)')].filter(Boolean).join(L(' and ', ' و'));
    insufficient('brand-doc', null, L('Brand guidelines are not approved yet', 'إرشادات العلامة غير معتمدة بعد'), L(`Approve a fact for ${missing} in Company knowledge.`, `اعتمد حقيقة لـ${missing} في معرفة الشركة.`));
  }

  /* ---- Documents and portfolio (P1: ported from the browser; only when the caller passes the company's findings) ---- */
  if (findings) sourceRules({ L, findings, facts, sources: sources || [], defs, now, hasLeads: data.leads.length > 0, push: (o) => items.push(o) });

  const counts = Object.fromEntries(KINDS.map((k) => [k, data[k].length]));
  decorate(items, { L, fmt: F, period, rows: counts, cover, arab: lang === 'ar' && fmt && fmt.arab });
  // Highest priority first, as every screen lists them (stable for equal scores).
  items.sort((a, b) => b.score - a.score);
  return { synthetic: items.some((i) => i.synthetic), items };
}

/**
 * Audit for one company, from validated rows, the knowledge mirror and the company settings only — the ONLY source of
 * recommendations since P1 (every screen, the report and the AI Director read it).
 *   range  '7' | '28' | '90' | 'all' (default 'all'): the rows of that period, ending at the latest data date, exactly
 *          as `metrics()` counts them, so a rate shown here equals the same rate on every other screen
 *   lang   'en' | 'ar';  digits from company_settings ('latn' default, 'arab' = Arabic-Indic in Arabic)
 *   now    the date the portfolio age is measured from (tests pass a fixed one)
 */
export function audit(db, companyId, { lang = 'en', range = 'all', now = null } = {}) {
  const d = createData(db);
  const all = Object.fromEntries(KINDS.map((k) => [k, d.rows(companyId, k)]));
  const r = RANGES.includes(range) ? range : 'all';
  const p = periods(all, r);
  const within = (x) => !p || (x.date >= p.cur[0] && x.date <= p.cur[1]);
  const data = r === 'all' ? all : Object.fromEntries(KINDS.map((k) => [k, all[k].filter(within)]));
  const dates = KINDS.flatMap((k) => data[k].map((x) => x.date)).sort();
  const period = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  const len = p ? p.days : 0;
  const cover = (k) => {
    if (!p || !data[k].length) return null;
    const ds = data[k].map((x) => x.date).sort();
    return { days: dayDiff(ds[0], ds[ds.length - 1]) + 1, len };
  };
  const knowledge = createKnowledge(db);
  const settings = db.prepare('SELECT digits, qualified_def FROM company_settings WHERE company_id = ?').get(companyId) || {};
  const sources = db.prepare('SELECT id, title, text FROM sources WHERE company_id = ? ORDER BY rowid').all(companyId);
  return {
    period,
    ...computeAudit(data, knowledge.approvedFacts(companyId), {
      lang,
      prev: p && p.prev && r !== 'all' ? { meta: all.meta.filter((x) => x.date >= p.prev[0] && x.date <= p.prev[1]) } : null,
      postedBefore: r !== 'all' && p ? all.meta.map((x) => x.date).filter((d) => d < p.cur[0]).sort().pop() ?? null : null,
      periodEnd: p ? p.cur[1] : null,
      findings: knowledge.listFacts(companyId),
      sources,
      defs: settings.qualified_def === null || settings.qualified_def === undefined ? null : { qualified: settings.qualified_def === 1 },
      now: now || new Date(),
      fmt: makeFmt(lang, settings.digits === 'arab' ? 'arab' : 'latn'),
      period: period ? { ...period, range: r, days: len } : null,
      cover,
    }),
  };
}
