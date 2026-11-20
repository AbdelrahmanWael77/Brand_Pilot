/**
 * P3 (2026-11-20): the number check. Every number in an answer (AI, rules engine, a pasted answer, campaign copy) is
 * looked up in what BrandPilot itself knows for the period on screen; nothing the answer says is trusted.
 *
 *   extractNumbers(text)        every number, with its position, value, decimals and whether it is a percentage.
 *                               Arabic-Indic digits (٠-٩, ۰-۹), the Arabic decimal and thousands marks (٫ ٬) and the
 *                               Arabic percent sign (٪) are read like Western ones. Dates, years and list markers are
 *                               not numbers to check; small counts (0-10, no decimals, no %) are not checked either.
 *   buildPool(db, id, {range})  the known numbers: KPIs of the period (and of the previous period, marked as such),
 *                               the changes between the two, audit evidence and calculations, the per-channel
 *                               comparison, approved facts. Each one keeps where it comes from and, from its own
 *                               wording, which subject (mobile, a channel, a page…) and which metric it is about.
 *   checkText(text, pool, o)    one result per number: verified (with its source), unverified (not found), other_period
 *                               (a number of the previous period presented as this period's) or mismatch (the value
 *                               exists but belongs to another subject or metric: a swapped number).
 *
 * A number matches when the known value, rounded to the precision the answer wrote, equals it: 1.3615% may be written
 * 1.36% or 1.4%, never 1.37%. After "about / around / حوالي" a round number may be rounded further (4,800 for 4,774).
 */
import { buildContext } from './director.js';
import { audit } from './audit.js';
import { metrics } from './metrics.js';

const DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٫': '.', '٬': ',', '٪': '%' };
/** Same length as the input, so positions found in the result are positions in the original text. */
export const normalize = (s) => String(s ?? '').replace(/[٠-٩۰-۹٫٬٪]/g, (c) => DIGITS[c]);

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const AR_MONTHS = 'يناير|فبراير|مارس|أبريل|إبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر';
const DATE_SPANS = [
  /\d{4}-\d{1,2}-\d{1,2}/g,
  /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b\\.?(?:,?\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b(?:${MONTHS})\\b\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\d{1,2}\\s+(?:${AR_MONTHS})(?:\\s+\\d{4})?`, 'g'),
  new RegExp(`(?:${AR_MONTHS})\\s+\\d{4}`, 'g'),
];
const NUM = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?[kK]\b)?(\s?%|\s?(?:percent|per cent|في المئة|في المائة|بالمئة|بالمائة))?/g;
const APPROX = /(about|around|roughly|nearly|almost|approximately|some|over|under|more than|less than|حوالي|حوالى|نحو|قرابة|تقريبا|تقريبًا|أكثر من|أقل من|ما يقارب)\s*$/i;

/** Every number in the text. → [{ raw, start, end, value, decimals, step, pct, plain }] (plain = not checked). */
export function extractNumbers(text) {
  const t = normalize(text);
  const skip = [];
  for (const re of DATE_SPANS) for (const m of t.matchAll(re)) skip.push([m.index, m.index + m[0].length]);
  const out = [];
  for (const m of t.matchAll(NUM)) {
    const start = m.index;
    const end = start + m[0].length;
    const prev = t[start - 1] || '';
    const next = t[end] || '';
    // part of a word or another token (GA4, utm_content2, v1.2.3, #1 stays a number)
    if (/[A-Za-z_\d.]/.test(prev) && !(prev === '.' && !/\d/.test(t[start - 2] || ''))) continue;
    if (!m[4] && /[A-Za-z_]/.test(next)) continue;
    if (skip.some(([a, b]) => start >= a && start < b)) continue;
    const intPart = m[1].replace(/,/g, '');
    const decimals = m[2] ? m[2].length - 1 : 0;
    let value = Number(intPart + (m[2] || ''));
    let step = 10 ** -decimals;
    if (m[3]) { value *= 1000; step *= 1000; }
    const pct = !!m[4];
    const raw = text.slice(start, end).trim();
    const lineStart = t.lastIndexOf('\n', start - 1) + 1;
    const listMarker = /^\s*$/.test(t.slice(lineStart, start)) && /^[.)]\s/.test(t.slice(end, end + 2)) && !pct && !decimals;
    const year = !pct && !decimals && !m[3] && /^(19|20)\d\d$/.test(intPart) && !m[1].includes(',');
    const small = !pct && !decimals && !m[3] && value <= 10;
    let approxStep = step;
    if (APPROX.test(t.slice(Math.max(0, start - 22), start)) && !decimals) {
      const zeros = (intPart.match(/0+$/) || [''])[0].length;
      approxStep = Math.max(step, 10 ** zeros);
    }
    out.push({ raw, start, end: start + m[0].trimEnd().length, value, decimals, step: approxStep, pct, plain: listMarker || year || small });
  }
  return out;
}

// ---- what a number is about, read from the words around it ------------------------------------------------------

/** Subjects: who or what a number is about. Names found in the data (channels, pages, sources) are added per company. */
const SUBJECTS = {
  mobile: ['mobile', 'phone', 'phones', 'smartphone', 'جوال', 'الجوال', 'موبايل', 'الموبايل', 'الهاتف', 'هاتف', 'الهواتف'],
  desktop: ['desktop', 'computer', 'سطح المكتب', 'ديسكتوب', 'الديسكتوب', 'الكمبيوتر', 'الحاسوب'],
  facebook: ['facebook', 'فيسبوك', 'فيس بوك'],
  instagram: ['instagram', 'إنستجرام', 'انستجرام', 'إنستغرام', 'انستغرام'],
  linkedin: ['linkedin', 'لينكدإن', 'لينكد إن'],
  search: ['organic search', 'search', 'البحث العضوي', 'البحث', 'محركات البحث'],
  social: ['organic social', 'social', 'السوشيال', 'التواصل الاجتماعي', 'التواصل'],
  email: ['email', 'e-mail', 'newsletter', 'البريد', 'الإيميل', 'البريد الإلكتروني'],
  direct: ['direct', 'مباشر', 'المباشر', 'المباشرة'],
  referral: ['referral', 'إحالة', 'الإحالات', 'الإحالة'],
  site: ['site', 'website', 'overall', 'site-wide', 'sitewide', 'all channels', 'in total', 'total', 'altogether', 'الموقع', 'إجمالي', 'الإجمالي', 'كل القنوات'],
};
/** Metrics: what kind of number it is. */
const METRICS = {
  enquiry_rate: ['enquiry rate', 'inquiry rate', 'conversion rate', 'converts', 'convert', 'enquire at', 'معدل الاستفسار', 'معدل التحويل', 'يستفسرون', 'تحويل'],
  enquiries: ['enquiries', 'enquiry', 'inquiries', 'inquiry', 'استفسار', 'استفسارات', 'استفساراً', 'استفسارا', 'الاستفسارات'],
  sessions: ['sessions', 'session', 'visits', 'visit', 'traffic', 'visitors', 'جلسة', 'جلسات', 'الجلسات', 'زيارة', 'زيارات', 'الزيارات', 'زوار', 'الزوار'],
  leads: ['leads', 'lead', 'محتمل', 'محتملين', 'محتملًا', 'محتملاً', 'المحتملين'],
  qualified: ['qualified', 'مؤهل', 'مؤهلين', 'مؤهلًا', 'مؤهلاً', 'مؤهلون', 'المؤهلين'],
  customers: ['customers', 'customer', 'clients', 'paying'],
  ctr: ['click rate', 'ctr', 'click-through', 'clicks', 'click', 'معدل النقر', 'نقرات', 'النقر', 'نقرة'],
  impressions: ['impressions', 'impression', 'ظهور', 'مرات الظهور'],
  position: ['position', 'positions', 'rank', 'ranking', 'ترتيب', 'موضع', 'المركز', 'مركز'],
  engagement: ['engagement', 'engagements', 'تفاعل', 'التفاعل'],
  reach: ['reach', 'الوصول'],
  spend: ['spend', 'spent', 'budget', 'إنفاق', 'الإنفاق', 'ميزانية'],
  posts: ['posts', 'post', 'منشور', 'منشورات', 'المنشورات'],
};
const PREV = /\b(previous|prior|before|earlier|last period|fell|rose|dropped|declined|grew|increased|decreased|down from|up from|compared with|compared to|versus the|was|were)\b|السابقة|السابق|الماضية|قبل|انخفض|ارتفع|تراجع|زاد|مقارنة|كان|كانت/i;
const CLAUSE = /[;:()\[\]،؛\n]|,(?!\d{3})|\s(?:vs\.?|versus|against|compared with|while|whereas|but|مقابل|بينما|لكن)\s/gi;
const SENTENCE = /[.!?؟\n](?!\d)/g;

const lower = (s) => normalize(s).toLowerCase();
function termsIn(s, groups) {
  const t = ` ${lower(s)} `;
  const out = new Set();
  for (const [k, words] of Object.entries(groups)) {
    for (const w of words) {
      const i = t.indexOf(w.toLowerCase());
      if (i < 0) continue;
      const before = t[i - 1];
      const after = t[i + w.length];
      // whole words for Latin terms; Arabic terms may carry prefixes (ال، و، ب، ل)
      if (/[a-z]/.test(w[0]) && (/[a-z0-9]/.test(before) || /[a-z]/.test(after))) continue;
      out.add(k);
      break;
    }
  }
  return out;
}

/** The clause a position is in, and the clauses before it in the same sentence (nearest first). */
function clausesAround(t, pos) {
  let s0 = 0;
  for (const m of t.matchAll(SENTENCE)) { if (m.index < pos) s0 = m.index + 1; else break; }
  let s1 = t.length;
  SENTENCE.lastIndex = 0;
  for (const m of t.matchAll(SENTENCE)) if (m.index >= pos) { s1 = m.index; break; }
  const sentence = t.slice(s0, s1);
  const cuts = [0];
  for (const m of sentence.matchAll(CLAUSE)) cuts.push(m.index, m.index + m[0].length);
  cuts.push(sentence.length);
  const parts = [];
  for (let i = 0; i < cuts.length; i += 2) parts.push([s0 + cuts[i], s0 + cuts[i + 1]]);
  const idx = parts.findIndex(([a, b]) => pos >= a && pos <= b);
  const own = idx < 0 ? [s0, s1] : parts[idx];
  const before = idx < 0 ? [] : parts.slice(0, idx).reverse();
  return { sentence, own: t.slice(own[0], own[1]), ownAt: own, before: before.map(([a, b]) => t.slice(a, b)) };
}

/** Subject and metric of the number at `pos` in `text`: its own clause first, else the nearest clause before it. */
function aboutAt(text, pos, subjects) {
  const { sentence, ownAt, before } = clausesAround(text, pos);
  // the words that belong to this number: from the previous number in its clause up to it, and after it up to the next
  // number, unless "of" ties it to that next number ("31 of the site's 65": "site" is about 65)
  const [a, b] = ownAt;
  const clause = text.slice(a, b);
  const rel = pos - a;
  let from = 0;
  let to = clause.length;
  let end = rel;
  for (const m of clause.matchAll(/\d[\d,.]*\s?%?/g)) {
    if (m.index + m[0].length <= rel) from = m.index + m[0].length;
    else if (m.index <= rel) end = m.index + m[0].length;
    else { to = m.index; break; }
  }
  const after = clause.slice(end, to);
  const local = clause.slice(from, rel) + (to < clause.length && /^\s*(of|out of|من)\s/i.test(after) ? '' : after);
  let subj = termsIn(local, subjects);
  if (!subj.size) subj = termsIn(clause.slice(0, rel), subjects); // earlier in the same clause
  // an earlier clause: words tied to another number by "of" ("31 of the site's 65") are about that number, not the topic
  for (const x of before) { if (subj.size) break; subj = termsIn(x.replace(/\b(?:of|out of)\s+(?:the\s+)?[^\d]{0,40}?\d[\d,.]*%?|من\s+[^\d]{0,40}?\d[\d,.]*%?/gi, ' '), subjects); }
  // Facebook and Instagram named together: GA4 counts their visits as one social channel
  if (subj.has('facebook') && subj.has('instagram')) subj.add('social');
  const ownMetric = termsIn(local, METRICS);
  let metric = ownMetric;
  for (const b of before) { if (metric.size) break; metric = termsIn(b, METRICS); }
  return { subj, metric, ownMetric, sentence };
}

// ---- the pool of known numbers ----------------------------------------------------------------------------------

const RATE = /rate|share|ctr|qshare|sctr/i;
const KPI_METRIC = { sessions: 'sessions', enquiries: 'enquiries', enquiry_rate: 'enquiry_rate', leads: 'leads', qualified_leads: 'qualified', qualified_share: 'qualified', customers: 'customers', search_clicks: 'ctr', search_impressions: 'impressions', ctr: 'ctr', reach: 'reach', impressions: 'impressions', engagements: 'engagement', link_clicks: 'ctr', spend: 'spend', cost_per_lead: 'spend' };
const CH_METRIC = { posts: 'posts', reach: 'reach', impr: 'impressions', eng: 'engagement', engRate: 'engagement', clicks: 'ctr', clickRate: 'ctr', spend: 'spend', cpc: 'spend', sessions: 'sessions', enq: 'enquiries', enqRate: 'enquiry_rate', leads: 'leads', qual: 'qualified', qshare: 'qualified', cpl: 'spend', simpr: 'impressions', sclicks: 'ctr', sctr: 'ctr', pos: 'position' };
const CH_SUBJ = { facebook: 'facebook', instagram: 'instagram', linkedin: 'linkedin', search: 'search' };

/**
 * The known numbers of one company for one period. Text sources are read with the same clause rules as answers, so a
 * number in "Mobile: 62% of sessions, enquiry rate 0.81%" knows it is about mobile, and which metric.
 */
export function buildPool(db, companyId, { range = '28', question = '', extraFacts = null } = {}) {
  const ctx = buildContext(db, companyId, { range });
  if (!ctx) return null;
  const subjects = { ...SUBJECTS };
  const entries = [];
  const period = ctx.metrics.period;
  const m = metrics(db, companyId, ctx.metrics.range);
  const prevPeriod = m.previous ?? ctx.channels?.previous ?? null;
  const add = (e) => entries.push({ subj: new Set(), metric: new Set(), ownMetric: new Set(), period: 'cur', ...e });
  const pctOf = (v) => v * 100;

  // names from the audit (channels, pages, sources, segments) become subjects of their own
  const auditEn = audit(db, companyId, { lang: 'en', range });
  const auditAr = audit(db, companyId, { lang: 'ar', range });
  for (const i of auditEn?.items ?? []) {
    const s = i.subject ?? i.seg;
    if (typeof s === 'string' && s.trim() && s.length < 80) {
      const k = s.trim().toLowerCase();
      const known = Object.entries(SUBJECTS).find(([, ws]) => ws.includes(k));
      if (!known) subjects[`name:${k}`] = [k];
    }
  }

  // KPIs, their previous values and the change between them
  for (const [name, k] of Object.entries(ctx.metrics.kpis)) {
    if (k.value === null || typeof k.value !== 'number') continue;
    const metric = new Set([KPI_METRIC[name]].filter(Boolean));
    const isRate = RATE.test(name);
    const src = { type: 'metric', id: name, label: name, period };
    add({ value: isRate ? pctOf(k.value) : k.value, pct: isRate, subj: new Set(['site']), metric, ownMetric: metric, source: src });
    const prev = typeof m.kpis[name]?.previous === 'number' ? m.kpis[name].previous : null;
    if (prev === null) continue;
    add({ value: isRate ? pctOf(prev) : prev, pct: isRate, subj: new Set(['site']), metric, ownMetric: metric, period: 'prev', source: { ...src, label: `${name} (previous period)`, period: prevPeriod } });
    if (prev !== 0) add({ value: Math.abs((k.value - prev) / prev) * 100, pct: true, subj: new Set(['site']), metric, source: { ...src, label: `${name}: change against the previous period` } });
    add({ value: Math.abs(k.value - prev) * (isRate ? 100 : 1), pct: isRate, subj: new Set(['site']), metric, source: { ...src, label: `${name}: difference from the previous period` } });
  }
  // KPI row counts ("20 social post rows")
  for (const [name, k] of Object.entries(ctx.metrics.kpis)) if (typeof k.rows === 'number') add({ value: k.rows, pct: false, source: { type: 'metric', id: name, label: `${name}: rows behind it`, period } });

  // per-channel comparison, this period and the previous one
  const chans = (tbl, per) => {
    for (const [ch, row] of Object.entries(tbl ?? {})) {
      for (const [key, v] of Object.entries(row)) {
        if (typeof v !== 'number') continue;
        const isRate = RATE.test(key);
        const metric = new Set([CH_METRIC[key]].filter(Boolean));
        add({ value: isRate ? pctOf(v) : v, pct: isRate, subj: new Set([CH_SUBJ[ch] ?? `name:${ch}`]), metric, ownMetric: metric, period: per, source: { type: 'channel', id: `${ch}.${key}`, label: `${ch}.${key}${per === 'prev' ? ' (previous period)' : ''}`, period: per === 'prev' ? prevPeriod : ctx.channels.period } });
      }
    }
  };
  if (ctx.channels) {
    chans(ctx.channels.channels, 'cur');
    chans(ctx.channels.previousPeriod, 'prev');
    for (const [ch, row] of Object.entries(ctx.channels.channels ?? {})) {
      const p = ctx.channels.previousPeriod?.[ch];
      if (!p) continue;
      for (const [key, v] of Object.entries(row)) {
        const pv = p[key];
        if (typeof v !== 'number' || typeof pv !== 'number' || pv === 0) continue;
        add({ value: Math.abs((v - pv) / pv) * 100, pct: true, subj: new Set([CH_SUBJ[ch] ?? `name:${ch}`]), metric: new Set([CH_METRIC[key]].filter(Boolean)), source: { type: 'channel', id: `${ch}.${key}`, label: `${ch}.${key}: change against the previous period`, period: ctx.channels.period } });
      }
    }
    // other numeric leaves (social traffic combined, unassigned lead sources)
    const walk = (o, p, subj) => { for (const [k, v] of Object.entries(o ?? {})) { if (typeof v === 'number' && !/^(dataFrom|dataTo)$/.test(k)) add({ value: RATE.test(k) ? pctOf(v) : v, pct: RATE.test(k), subj: new Set([subj]), metric: new Set([CH_METRIC[k]].filter(Boolean)), source: { type: 'channel', id: `${p}.${k}`, label: `${p}.${k}`, period: ctx.channels.period } }); else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${p}.${k}`, subj); } };
    walk(ctx.channels.socialWebsiteCombined, 'socialWebsiteCombined', 'social');
    for (const u of ctx.channels.unassignedLeadSources ?? []) if (u && typeof u === 'object') walk(u, `unassigned.${u.source ?? u.name ?? ''}`, `name:${String(u.source ?? u.name ?? '').toLowerCase()}`);
  }

  // text written by BrandPilot itself for this period: audit evidence, calculations, titles, confidence
  const fromText = (text, source, perTag = 'cur', defaultSubj = null) => {
    const t = String(text ?? '');
    for (const n of extractNumbers(t)) {
      const a = aboutAt(normalize(t), n.start, subjects);
      const prevWords = /previous|before|earlier|السابقة|قبل/.test(a.sentence.toLowerCase());
      add({ value: n.value, pct: n.pct, decimals: n.decimals, subj: a.subj.size || !defaultSubj ? a.subj : defaultSubj, metric: a.metric, ownMetric: a.ownMetric.size ? a.ownMetric : rateOf(a.metric, n.pct), period: perTag === 'cur' && prevWords && /this period|الفترة/i.test(a.sentence) ? 'any' : perTag, source: { ...source, label: t.slice(0, 300) } });
    }
  };
  for (const [items, lang] of [[auditEn?.items ?? [], 'en'], [auditAr?.items ?? [], 'ar']]) {
    for (const i of items) {
      if (i.basis === 'insufficient') continue;
      const src = { type: 'audit', id: i.id, period: i.period ?? period, lang };
      // a line that names no subject is about the recommendation's own subject (its channel, page, source), else its title's
      const named = typeof (i.subject ?? i.seg) === 'string' ? (i.subject ?? i.seg).trim().toLowerCase() : '';
      const own = named ? termsIn(named, subjects) : new Set();
      const dflt = own.size ? own : named ? new Set([`name:${named}`]) : termsIn(i.title, subjects);
      for (const e of i.evidence ?? []) {
        fromText(e.text, src, 'cur', dflt);
        if (typeof e.value === 'number' && e.metric) add({ value: RATE.test(e.metric) ? pctOf(e.value) : e.value, pct: RATE.test(e.metric), metric: new Set([e.metric === 'enquiry_rate' ? 'enquiry_rate' : e.metric === 'engagement_rate' ? 'engagement' : e.metric === 'qualified_share' ? 'qualified' : e.metric === 'ctr' ? 'ctr' : e.metric]), subj: aboutAt(normalize(e.text), 0, subjects).subj, source: { ...src, label: e.text } });
      }
      for (const c of i.calc ?? []) fromText(c, src, 'cur', dflt);
      fromText(i.title, src, 'cur', dflt);
      fromText(i.why, src, 'cur', dflt);
      fromText(i.action, src, 'cur', dflt);
      if (i.confidence?.why) fromText(i.confidence.why, src, 'cur', dflt);
      for (const a of i.assumptions ?? []) fromText(a, src, 'cur', dflt);
    }
  }
  // approved facts (no period: they are true until their review date)
  for (const f of extraFacts ?? ctx.facts) fromText(f.text, { type: 'fact', id: f.id, period: null }, 'any');
  // the question itself, and the period's length
  if (question) fromText(question, { type: 'question', id: 'question', period: null }, 'any');
  if (period) add({ value: period.days, pct: false, period: 'any', unit: /^\s*-?\s*(day|days|يوم|يوماً|يومًا|أيام)/i, source: { type: 'period', id: 'days', label: `${period.from} → ${period.to}`, period } });
  return { entries, subjects, period, prevPeriod, range };
}

/** A pool of approved facts only (campaign copy: its numbers must be approved wording, not data). */
export function factPool(facts) {
  const entries = [];
  for (const f of facts) {
    for (const n of extractNumbers(f.text)) entries.push({ value: n.value, pct: n.pct, subj: new Set(), metric: new Set(), ownMetric: new Set(), period: 'any', source: { type: 'fact', id: f.id, label: f.text, period: null } });
  }
  return { entries, subjects: SUBJECTS, period: null };
}

const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const matches = (n, e) => n.pct === e.pct && (near(Math.round(e.value / n.step) * n.step, n.value) || near(e.value, n.value));
/** A known number's metric when its own words name none: the clause before it decides; a percentage of enquiries and
 *  sessions together is an enquiry rate (a percentage "of sessions" alone is a share of traffic). */
function rateOf(metric, pct) {
  const m = new Set(metric);
  if (pct && m.has('enquiries') && m.has('sessions')) m.add('enquiry_rate'); // enquiries ÷ sessions
  return m;
}
const overlap = (a, b) => [...a].some((x) => b.has(x));

/**
 * Checks every number of one text. `support` = ids the answer cites ("audit:mobile-gap", "metric:sessions",
 * "channel:search.enq"): among equal candidates those win. → { numbers, counts }
 */
export function checkText(text, pool, { support = [] } = {}) {
  const t = normalize(text);
  const sup = new Set(support);
  const numbers = [];
  for (const n of extractNumbers(text)) {
    if (n.plain) continue;
    const about = aboutAt(t, n.start, pool.subjects);
    const after = t.slice(n.end, n.end + 12);
    const cands = pool.entries.filter((e) => matches(n, e) && (!e.unit || e.unit.test(after)));
    const r = { raw: n.raw, start: n.start, end: n.end, value: n.value, pct: n.pct };
    if (!cands.length) { numbers.push({ ...r, status: 'unverified' }); continue; }
    const subjOk = (e) => !about.subj.size || !e.subj.size || overlap(about.subj, e.subj) || (e.subj.has('site') && !about.subj.size);
    const metricOk = (e) => !about.ownMetric.size || !e.ownMetric.size || overlap(about.ownMetric, e.ownMetric);
    const fits = cands.filter((e) => subjOk(e) && metricOk(e));
    const prevOk = PREV.test(about.sentence);
    const inPeriod = fits.filter((e) => e.period !== 'prev' || prevOk);
    const rank = (e) => (sup.has(`${e.source.type}:${e.source.id}`) ? 0 : 1) + (e.period === 'cur' ? 0 : 0.5) + (overlap(about.subj, e.subj) ? 0 : 0.25);
    if (inPeriod.length) {
      const best = inPeriod.sort((a, b) => rank(a) - rank(b))[0];
      numbers.push({ ...r, status: 'verified', source: best.source });
    } else if (fits.length) {
      numbers.push({ ...r, status: 'other_period', actual: fits[0].source });
    } else {
      numbers.push({ ...r, status: 'mismatch', actual: cands[0].source });
    }
  }
  const counts = { verified: 0, unverified: 0, other_period: 0, mismatch: 0 };
  for (const x of numbers) counts[x.status]++;
  return { numbers, counts };
}

/** The first sentence of a text that holds a checked number (the main claim of a text without structured claims). */
function firstClaimSpan(text) {
  const t = normalize(text);
  const nums = extractNumbers(text).filter((n) => !n.plain);
  const first = nums[0];
  if (!first) return null;
  let s0 = 0;
  for (const m of t.matchAll(SENTENCE)) { if (m.index < first.start) s0 = m.index + 1; else break; }
  let s1 = t.length;
  for (const m of t.matchAll(SENTENCE)) if (m.index >= first.start) { s1 = m.index + 1; break; }
  return [s0, s1];
}

/**
 * The whole check of one answer. `claims` (from the AI): [{ text, support: [{type,id}], main }]; the main claim is the
 * one marked main, else the first; without claims, the first sentence that holds a number. The answer is blocked when
 * a number of the main claim is not verified.
 * → { numbers, counts, main: [start, end] | null, blocked, reason: { code, raw, actual? } | null }
 */
export function checkAnswer(text, pool, { claims = [], support = [] } = {}) {
  const supIds = [...support, ...claims.flatMap((c) => c.support ?? [])].map((s) => (typeof s === 'string' ? s : `${s.type}:${s.id}`));
  const res = checkText(text, pool, { support: supIds });
  let main = null;
  const cl = Array.isArray(claims) ? claims.filter((c) => c && typeof c.text === 'string' && c.text.trim()) : [];
  const m = cl.find((c) => c.main === true) ?? cl[0];
  if (m) {
    const needle = m.text.trim();
    let i = text.indexOf(needle);
    if (i < 0) i = text.indexOf(needle.slice(0, 60));
    if (i >= 0) main = [i, i + needle.length];
  }
  if (!main) main = firstClaimSpan(text);
  const bad = main ? res.numbers.find((x) => x.status !== 'verified' && x.start >= main[0] && x.start < main[1]) : null;
  return { ...res, main, blocked: !!bad, reason: bad ? { code: bad.status, raw: bad.raw, ...(bad.actual ? { actual: bad.actual.label } : {}) } : null };
}

/** Counts for the trail (no text). */
export const summary = (c) => ({ ...c.counts, blocked: !!c.blocked, ...(c.reason ? { reason: c.reason.code } : {}) });

const AR_DIG = (s) => String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]).replace(/\./g, '٫').replace(/,/g, '٬');
const fmt = (v, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

/**
 * Demo only (the route checks BRANDPILOT_DEMO): a sample answer built from this company's real numbers with deliberate
 * mistakes in it, so a tester can watch the real check catch them. `kind` says which mistake each number is; it is a
 * label for the test table, never an input of the check. → { text, expected: [{ start, end, raw, kind }] } | null
 */
export function demoSample(db, companyId, { range = '28', lang = 'en' } = {}) {
  const m = metrics(db, companyId, range);
  const k = m.kpis;
  const ar = lang === 'ar';
  const mob = audit(db, companyId, { lang: 'en', range })?.items.find((i) => i.id === 'mobile-gap');
  const desk = mob?.evidence.find((e) => /desktop/i.test(e.text))?.value;
  const pool = buildPool(db, companyId, { range });
  const unknown = (v, pct) => !pool.entries.some((e) => e.pct === pct && Math.abs(e.value - v) < 0.5);
  const parts = [];
  const expected = [];
  const say = (en, a) => parts.push(ar ? a : en);
  const num = (raw, kind) => { const text = parts.join(''); expected.push({ start: text.length, end: text.length + raw.length, raw, kind }); parts.push(raw); };
  if (k.enquiry_rate?.value != null) {
    const wrong = Math.round(k.enquiry_rate.value * 10000 + 1) / 100; // the right value plus 0.01 percentage point
    say('Your site converts at ', 'معدل الاستفسار في موقعك ');
    num(`${fmt(wrong, 2)}%`, 'wrong_rounding');
    say(' of visits this period. ', ' من الزيارات في هذه الفترة. ');
  }
  if (typeof desk === 'number') {
    say('Mobile visitors enquire at ', 'زوار الجوال يستفسرون بمعدل ');
    num(`${fmt(desk * 100, 2)}%`, 'swapped');
    say('. ', '. ');
  }
  if (typeof k.enquiries?.previous === 'number' && k.enquiries.previous !== k.enquiries.value) {
    say('This period brought ', 'جاءت في هذه الفترة ');
    num(fmt(k.enquiries.previous), 'other_period');
    say(' enquiries. ', ' استفسارات. ');
  }
  if (k.sessions?.value != null) {
    let fake = Math.round(k.sessions.value * 1.113);
    while (!unknown(fake, false)) fake += 7;
    say('The site had ', 'سجّل الموقع ');
    num(ar ? AR_DIG(fmt(fake)) : fmt(fake), ar ? 'invented_arabic_digits' : 'invented');
    say(' sessions. ', ' جلسة. ');
  }
  let fakePct = 250;
  while (!unknown(fakePct, true)) fakePct += 15;
  say('Instagram leads grew ', 'نما عدد العملاء المحتملين من إنستجرام بنسبة ');
  num(`${fakePct}%`, 'fake_percentage');
  say('. ', '. ');
  if (k.sessions?.value != null && k.leads?.value != null) {
    say('For comparison, true numbers: the site had ', 'للمقارنة، أرقام صحيحة: سجّل الموقع ');
    num(ar ? AR_DIG(fmt(k.sessions.value)) : fmt(k.sessions.value), ar ? 'true_arabic_digits' : 'true');
    say(' sessions and ', ' جلسة و');
    num(ar ? AR_DIG(fmt(k.leads.value)) : fmt(k.leads.value), ar ? 'true_arabic_digits' : 'true');
    say(' leads in total.', ' عميلًا محتملًا في الإجمالي.');
  }
  return expected.length ? { text: parts.join(''), expected } : null;
}
