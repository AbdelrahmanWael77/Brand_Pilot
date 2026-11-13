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
 * Finding texts (titles, reasons, actions, evidence) come from `server/audit.js` in the report's
 * language (`lang`). Reports saved before Arabic findings existed hold English texts; the Arabic
 * rendering of those says so.
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
export function buildReport(db, companyId, { range = '28', now = new Date(), lang = 'en' } = {}) {
  const row = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
  if (!row) return null;
  const m = metrics(db, companyId, range);
  const a = audit(db, companyId, { lang });
  const facts = approvedFacts(db, companyId);
  const camps = createCampaigns(db).list(companyId);
  const currency = db.prepare('SELECT currency FROM company_settings WHERE company_id = ?').get(companyId)?.currency ?? null;

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
    findingsLang: lang, // language of the finding and gap texts below
    currency, // of spend and cost per lead; null = not set, numbers are shown without a label
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
/** `cur` labels money values; reports saved before currencies existed have none. */
const fmt = (v, format, cur) => (format === 'percent' ? `${(v * 100).toFixed(2)}%` : format === 'money' && cur ? `${num(v)} ${cur}` : num(v));
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
    const value = k.value === null ? t[k.reason] ?? t.no_data : fmt(k.value, k.format, r.currency) + (k.synthetic ? ` (${t.syn})` : '');
    L.push(`| ${t.kpi[k.id] ?? k.id} | ${value} | ${k.change === null ? t.none : signed(k.change)} |`);
  }

  L.push('', `## ${t.findings}`, '');
  const any = SECTIONS.some(([key]) => r.findings[key].length);
  if (!any) L.push(t.noFindings);
  else {
    if (t.englishNote && r.findingsLang !== 'ar') L.push(`_${t.englishNote}_`, ''); // only for reports saved before Arabic findings existed
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

// ---- Printable HTML (task 6.3) ----
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CSS = `
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;color:#0f172a;line-height:1.5;margin:0;background:#f1f5f9}
main{max-width:820px;margin:24px auto;background:#fff;padding:32px 40px;border-radius:12px;box-shadow:0 1px 4px rgba(15,23,42,.12)}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;padding-bottom:4px;border-bottom:2px solid #e2e8f0}h3{font-size:15px;margin:18px 0 6px}
p{margin:6px 0}.meta{color:#475569;font-size:13px}.muted{color:#64748b;font-size:13px}
.warn{border:1px dashed #fb923c;background:#fff7ed;color:#9a3412;padding:8px 12px;border-radius:8px;font-weight:700;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:start}
th{font-size:12px;text-transform:uppercase;color:#475569}td.n,th.n{text-align:end;white-space:nowrap}
.nd{color:#64748b}.tag{display:inline-block;font-size:11px;font-weight:700;border-radius:99px;padding:1px 8px;background:#ecfdf5;color:#065f46}
.tag.syn{background:#fff7ed;color:#9a3412;border:1px dashed #fdba74}
.f{border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;margin:8px 0;break-inside:avoid}.f ul{margin:4px 0;padding-inline-start:20px;font-size:14px}
ul{padding-inline-start:20px}footer{margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px}
.ltr{direction:ltr;unicode-bidi:isolate}
@page{size:A4;margin:16mm}
@media print{body{background:#fff}main{margin:0;max-width:none;padding:0;border-radius:0;box-shadow:none}h2{break-after:avoid}tr{break-inside:avoid}}
`;

/**
 * Escaped text for the Arabic page: each Latin / numeric run ("Facebook 12%", "/pricing", "1233")
 * is wrapped in <bdi>, so it keeps its own left-to-right order inside right-to-left text and does
 * not decide the direction of a `dir="auto"` line. The frontend's `bd()` uses the same rule.
 */
const RUN = /(?:[+\-\/#@$](?=[A-Za-z0-9]))?[A-Za-z0-9](?:(?:[A-Za-z0-9 .,%\/:+'&_\-–→÷×=]|\([A-Za-z0-9 .,%\/:+'&_\-–→÷×=]*\))*(?:[A-Za-z0-9%]|\([A-Za-z0-9 .,%\/:+'&_\-–→÷×=]*\)))?/g;
export function bidi(s) {
  s = String(s ?? '');
  let out = '';
  let i = 0;
  for (const m of s.matchAll(RUN)) {
    out += `${h(s.slice(i, m.index))}<bdi>${h(m[0])}</bdi>`;
    i = m.index + m[0].length;
  }
  return out + h(s.slice(i));
}

/** One self-contained page (inline CSS, no scripts, no external requests) to print or save as PDF. */
export function renderReportHtml(r, lang = 'en') {
  const t = T[lang] ?? T.en;
  const rtl = lang === 'ar';
  const syn = ` <span class="tag syn">${h(t.syn)}</span>`;
  const ltr = (s) => `<span class="ltr">${h(s)}</span>`;
  const x = rtl ? bidi : h; // company and finding text: Latin / numeric runs isolated on the Arabic page
  const o = [];
  o.push(`<h1>${h(t.title)} — <span dir="auto">${h(r.company.name)}</span></h1>`);
  o.push(`<p class="meta">${h(t.generated)}: ${ltr(r.generatedAt.slice(0, 10))}</p>`);
  if (r.period) {
    o.push(`<p class="meta">${h(t.period)}: ${ltr(`${r.period.from} → ${r.period.to}`)}${r.range === 'all' ? ` (${h(t.allData)})` : ''}${r.previous ? ` · ${h(t.prevPeriod)} ${ltr(`${r.previous.from} → ${r.previous.to}`)}` : ''}</p>`);
  } else o.push(`<p class="meta">${h(t.noData)}</p>`);
  if (r.synthetic) o.push(`<p class="warn">${h(t.synthetic.replace(/\*/g, ''))}</p>`);

  o.push(`<h2>${h(t.kpis)}</h2><table><thead><tr><th>${h(t.metric)}</th><th class="n">${h(t.value)}</th><th class="n">${h(t.change)} (${h(t.vsPrev)})</th></tr></thead><tbody>`);
  for (const k of r.kpis) {
    const value = k.value === null ? `<span class="nd">${h(t[k.reason] ?? t.no_data)}</span>` : ltr(fmt(k.value, k.format, r.currency)) + (k.synthetic ? syn : '');
    o.push(`<tr><td>${h(t.kpi[k.id] ?? k.id)}</td><td class="n">${value}</td><td class="n">${k.change === null ? h(t.none) : ltr(signed(k.change))}</td></tr>`);
  }
  o.push('</tbody></table>');

  o.push(`<h2>${h(t.findings)}</h2>`);
  if (!SECTIONS.some(([key]) => r.findings[key].length)) o.push(`<p class="muted">${h(t.noFindings)}</p>`);
  else {
    if (t.englishNote && r.findingsLang !== 'ar') o.push(`<p class="muted">${h(t.englishNote)}</p>`);
    for (const [key] of SECTIONS) {
      if (!r.findings[key].length) continue;
      o.push(`<h3>${h(t[key])}</h3>`);
      for (const f of r.findings[key]) {
        o.push(`<div class="f"><p><b dir="auto">${x(f.title)}</b> <span class="tag">${h(t.basis[f.basis] ?? f.basis)}</span>${f.synthetic ? syn : ''}</p>`);
        if (f.why) o.push(`<p dir="auto">${x(f.why)}</p>`);
        if (f.evidence.length) o.push(`<p class="muted">${h(t.evidence)}:</p><ul>${f.evidence.map((e) => `<li dir="auto">${x(e)}</li>`).join('')}</ul>`);
        if (f.action) o.push(`<p dir="auto"><b>${h(t.action)}:</b> ${x(f.action)}</p>`);
        o.push('</div>');
      }
    }
  }

  if (r.gaps.length) {
    o.push(`<h2>${h(t.gaps)}</h2><p class="muted">${h(t.gapsNote)}</p><ul>${r.gaps.map((g) => `<li dir="auto"><b>${x(g.title)}</b> — ${x(g.needs)}</li>`).join('')}</ul>`);
  }
  o.push(`<h2>${h(t.knowledge)}</h2><p>${h(t.factsN(r.knowledge.approvedFacts))}${r.knowledge.synthetic ? ` (${r.knowledge.synthetic} ${h(t.syn)})` : ''}</p>`);
  o.push(`<h2>${h(t.campaigns)}</h2>`);
  if (!r.campaigns.length) o.push(`<p class="muted">${h(t.noCampaigns)}</p>`);
  else {
    o.push(`<ul>${r.campaigns.map((c) => `<li><b dir="auto">${h(c.name)}</b> — ${h(c.approved ? t.approved : t.draft)}; ${h(t.assets(c.approvedAssets, c.assets))}; ${c.rec ? `${h(t.fromRec)} <code>${h(c.rec)}</code>` : h(t.manual)}</li>`).join('')}</ul>`);
  }
  o.push(`<footer>${h(t.footer)}</footer>`);
  return `<!doctype html>\n<html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${h(t.title)} — ${h(r.company.name)}</title>\n<style>${CSS}</style>\n</head>\n<body>\n<main>\n${o.join('\n')}\n</main>\n</body>\n</html>\n`;
}
