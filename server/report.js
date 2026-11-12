/**
 * Marketing report (task 6.1): one company's numbers, findings and campaigns in one document.
 *
 * Built only from the trusted read paths — `metrics`, `audit`, `approvedFacts`, campaign list —
 * never from the state blob. A KPI without support is shown as "no data" / "not measured",
 * never as 0; audit items with basis `insufficient` are listed as open gaps, not as findings;
 * synthetic (demo) data is labeled wherever it appears.
 *
 *   buildReport(db, companyId, { range, now })  → plain object (also the JSON response)
 *   renderReport(report, lang)                  → Markdown, labels in English or Arabic
 *
 * Finding texts (titles, reasons, actions, evidence) come from `server/audit.js`, which writes
 * English only; the Arabic report says so instead of pretending they are translated.
 */
import { approvedFacts } from './knowledge.js';
import { metrics, RANGES } from './metrics.js';
import { audit } from './audit.js';
import { createCampaigns } from './campaigns.js';

export { RANGES };
export const REPORT_LANGS = ['en', 'ar'];

/** KPI order and how each value is written. */
export const KPI_FORMAT = {
  sessions: 'number', enquiries: 'number', enquiry_rate: 'percent',
  leads: 'number', qualified_leads: 'number', qualified_share: 'percent', customers: 'number',
  reach: 'number', impressions: 'number', engagements: 'number', link_clicks: 'number',
  search_clicks: 'number', search_impressions: 'number', ctr: 'percent',
  spend: 'money', cost_per_lead: 'money',
};
const SECTIONS = [
  ['strong', ['strong']],
  ['weak', ['weak']],
  ['opp', ['opp']],
  ['risk', ['risk', 'gap']],
];

/** Report data for one company. Returns null when the company does not exist. */
export function buildReport(db, companyId, { range = '28', now = new Date() } = {}) {
  const row = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
  if (!row) return null;
  const m = metrics(db, companyId, range);
  const a = audit(db, companyId);
  const facts = approvedFacts(db, companyId);
  const camps = createCampaigns(db).list(companyId);

  const kpis = Object.keys(KPI_FORMAT)
    .filter((id) => m.kpis[id])
    .map((id) => {
      const k = m.kpis[id];
      const out = { id, format: KPI_FORMAT[id], value: k.value, previous: k.previous ?? null, synthetic: !!k.synthetic };
      if (k.value === null) out.reason = k.reason;
      // Change against the previous period only when both numbers exist and the base is not zero.
      out.change = k.value !== null && typeof k.previous === 'number' && k.previous !== 0 ? (k.value - k.previous) / k.previous : null;
      return out;
    });
  const concluded = a.items.filter((i) => i.basis !== 'insufficient');
  const findings = Object.fromEntries(
    SECTIONS.map(([key, kinds]) => [
      key,
      concluded
        .filter((i) => kinds.includes(i.kind))
        .map((i) => ({ id: i.id, basis: i.basis, synthetic: !!i.synthetic, title: i.title, why: i.why, action: i.action, evidence: i.evidence.map((e) => e.text) })),
    ]),
  );
  return {
    company: { name: row.name },
    generatedAt: now.toISOString(),
    range: m.range,
    period: m.period,
    previous: m.previous,
    synthetic: !!m.synthetic || !!a.synthetic || facts.some((f) => f.synthetic),
    kpis,
    findings,
    gaps: a.items.filter((i) => i.basis === 'insufficient').map((i) => ({ id: i.id, title: i.title, needs: i.needs })),
    knowledge: { approvedFacts: facts.length, synthetic: facts.filter((f) => f.synthetic).length },
    campaigns: camps.map((c) => ({ id: c.id, name: c.name, approved: !!c.approved, assets: c.assets, approvedAssets: c.approvedAssets, rec: c.rec ?? null })),
  };
}

// ---- Markdown ----
const T = {
  en: {
    title: 'Marketing report', generated: 'Generated', period: 'Period', to: 'to', allData: 'all imported data', noData: 'No data imported yet.',
    prevPeriod: 'compared with', synthetic: '**Contains synthetic demo data — not real performance.**', syn: 'synthetic',
    kpis: 'Key numbers', metric: 'Metric', value: 'Value', change: 'Change', vsPrev: 'vs previous period',
    no_data: 'no data', not_measured: 'not measured', none: '—',
    findings: 'Findings', strong: 'Strengths', weak: 'Weaknesses', opp: 'Opportunities', risk: 'Risks',
    noFindings: 'No finding is supported by the current data and approved facts.',
    basis: { data: 'from your imported data', facts: 'from your approved facts' },
    evidence: 'Evidence', action: 'Recommended action',
    gaps: 'Not enough data yet', gapsNote: 'These checks could not be answered. They are not conclusions.',
    knowledge: 'Approved knowledge', factsN: (n) => `${n} approved fact(s) in the Knowledge Hub`,
    campaigns: 'Campaigns', noCampaigns: 'No campaigns yet.', approved: 'approved', draft: 'draft', assets: (a, n) => `${a} of ${n} assets approved`,
    fromRec: 'from recommendation', manual: 'created manually',
    footer: 'Numbers come from validated imported rows; findings from the server audit; facts are the ones approved in the Knowledge Hub.',
    kpi: {
      sessions: 'Website sessions', enquiries: 'Enquiries', enquiry_rate: 'Enquiry rate', leads: 'Leads', qualified_leads: 'Qualified leads',
      qualified_share: 'Qualified share', customers: 'Customers', reach: 'Reach', impressions: 'Impressions', engagements: 'Engagements',
      link_clicks: 'Link clicks', search_clicks: 'Search clicks', search_impressions: 'Search impressions', ctr: 'Search click rate',
      spend: 'Spend', cost_per_lead: 'Cost per lead',
    },
  },
  ar: {
    title: 'التقرير التسويقي', generated: 'تاريخ الإنشاء', period: 'الفترة', to: 'إلى', allData: 'كل البيانات المستوردة', noData: 'لم تُستورد بيانات بعد.',
    prevPeriod: 'مقارنةً بـ', synthetic: '**يحتوي على بيانات تجريبية اصطناعية — ليست أداءً حقيقياً.**', syn: 'اصطناعي',
    kpis: 'الأرقام الرئيسية', metric: 'المقياس', value: 'القيمة', change: 'التغيّر', vsPrev: 'مقابل الفترة السابقة',
    no_data: 'لا توجد بيانات', not_measured: 'غير مُقاس', none: '—',
    findings: 'النتائج', strong: 'نقاط القوة', weak: 'نقاط الضعف', opp: 'الفرص', risk: 'المخاطر',
    noFindings: 'لا توجد نتيجة مدعومة بالبيانات الحالية والحقائق المعتمدة.',
    basis: { data: 'من بياناتكم المستوردة', facts: 'من حقائقكم المعتمدة' },
    evidence: 'الدليل', action: 'الإجراء الموصى به',
    gaps: 'لا توجد بيانات كافية بعد', gapsNote: 'تعذّرت الإجابة عن هذه الفحوص. هذه ليست استنتاجات.',
    knowledge: 'المعرفة المعتمدة', factsN: (n) => `${n} حقيقة معتمدة في مركز المعرفة`,
    campaigns: 'الحملات', noCampaigns: 'لا توجد حملات بعد.', approved: 'معتمدة', draft: 'مسودة', assets: (a, n) => `${a} من ${n} مادة معتمدة`,
    fromRec: 'من التوصية', manual: 'أُنشئت يدوياً',
    footer: 'الأرقام من الصفوف المستوردة المتحقق منها؛ والنتائج من تدقيق الخادم؛ والحقائق هي المعتمدة في مركز المعرفة.',
    englishNote: 'نصوص النتائج (العناوين والأدلة والإجراءات) يكتبها تدقيق الخادم بالإنجليزية حالياً.',
    kpi: {
      sessions: 'جلسات الموقع', enquiries: 'الاستفسارات', enquiry_rate: 'معدل الاستفسار', leads: 'العملاء المحتملون', qualified_leads: 'العملاء المؤهلون',
      qualified_share: 'نسبة المؤهلين', customers: 'العملاء', reach: 'الوصول', impressions: 'مرات الظهور', engagements: 'التفاعلات',
      link_clicks: 'نقرات الروابط', search_clicks: 'نقرات البحث', search_impressions: 'مرات الظهور في البحث', ctr: 'معدل النقر في البحث',
      spend: 'الإنفاق', cost_per_lead: 'تكلفة العميل المحتمل',
    },
  },
};

const num = (v) => (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
const fmt = (v, format) => (format === 'percent' ? `${(v * 100).toFixed(2)}%` : num(v));
const signed = (c) => `${c >= 0 ? '+' : '−'}${Math.abs(c * 100).toFixed(1)}%`;
/** Company text goes into Markdown: keep it on one line and out of table / emphasis syntax. */
const md = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/([\\|*_`<>#[\]])/g, '\\$1');

export function renderReport(r, lang = 'en') {
  const t = T[lang] ?? T.en;
  const L = [];
  L.push(`# ${t.title} — ${md(r.company.name)}`, '');
  L.push(`${t.generated}: ${r.generatedAt.slice(0, 10)}`);
  if (r.period) {
    L.push(`${t.period}: ${r.period.from} ${t.to} ${r.period.to}${r.range === 'all' ? ` (${t.allData})` : ''}`);
    if (r.previous) L.push(`${t.prevPeriod}: ${r.previous.from} ${t.to} ${r.previous.to}`);
  } else L.push(t.noData);
  if (r.synthetic) L.push('', t.synthetic);

  L.push('', `## ${t.kpis}`, '');
  L.push(`| ${t.metric} | ${t.value} | ${t.change} (${t.vsPrev}) |`, '|---|---:|---:|');
  for (const k of r.kpis) {
    const value = k.value === null ? t[k.reason] ?? t.no_data : fmt(k.value, k.format) + (k.synthetic ? ` (${t.syn})` : '');
    L.push(`| ${t.kpi[k.id] ?? k.id} | ${value} | ${k.change === null ? t.none : signed(k.change)} |`);
  }

  L.push('', `## ${t.findings}`, '');
  const any = SECTIONS.some(([key]) => r.findings[key].length);
  if (!any) L.push(t.noFindings);
  else {
    if (t.englishNote) L.push(`_${t.englishNote}_`, '');
    for (const [key] of SECTIONS) {
      if (!r.findings[key].length) continue;
      L.push(`### ${t[key]}`, '');
      for (const f of r.findings[key]) {
        L.push(`**${md(f.title)}** — ${t.basis[f.basis] ?? f.basis}${f.synthetic ? ` (${t.syn})` : ''}`, '');
        if (f.why) L.push(md(f.why), '');
        if (f.evidence.length) L.push(`${t.evidence}:`, ...f.evidence.map((e) => `- ${md(e)}`), '');
        if (f.action) L.push(`${t.action}: ${md(f.action)}`, '');
      }
    }
  }

  if (r.gaps.length) {
    L.push(`## ${t.gaps}`, '', t.gapsNote, '');
    for (const g of r.gaps) L.push(`- **${md(g.title)}** — ${md(g.needs)}`);
    L.push('');
  }

  L.push(`## ${t.knowledge}`, '', t.factsN(r.knowledge.approvedFacts) + (r.knowledge.synthetic ? ` (${r.knowledge.synthetic} ${t.syn})` : ''), '');

  L.push(`## ${t.campaigns}`, '');
  if (!r.campaigns.length) L.push(t.noCampaigns);
  for (const c of r.campaigns) {
    L.push(`- **${md(c.name)}** — ${c.approved ? t.approved : t.draft}; ${t.assets(c.approvedAssets, c.assets)}; ${c.rec ? `${t.fromRec} \`${md(c.rec)}\`` : t.manual}`);
  }
  L.push('', '---', t.footer, '');
  return L.join('\n');
}
