/**
 * P3 (2026-11-20): the Director's rules engine, on the server. It used to run in the page (director(c, q) in
 * public/index.html) and the page reported its answer to the trail; now the server produces the answer from its own
 * audit, KPIs, data rows and approved facts, checks its numbers and records it.
 *
 * Same intents and titles as the page version (fixed rules over keywords, not free-form understanding), plus "what
 * should we do first?". The answer is plain text (paragraphs, "- " bullets, "1. " steps, **bold**) so the page renders
 * it, and checks its numbers, exactly like an AI answer.
 */
import { audit } from './audit.js';
import { metrics } from './metrics.js';
import { approvedFacts } from './knowledge.js';
import { dataRows } from './data.js';
import { portfolio } from './auditMeta.js';
import { gaps } from './gaps.js';

const fmtN = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v);
const pct = (q, n) => (n ? `${((q / n) * 100).toFixed(0)}%` : '—');

/** → { title, cls, text, used: [string], actions: [{ l, a, v }], support: [{ type, id }], insufficient } */
export function rulesAnswer(db, companyId, { question, lang = 'en', range = '28' }) {
  const L = (en, ar) => (lang === 'ar' ? ar : en);
  const A = audit(db, companyId, { lang, range })?.items ?? [];
  const t = String(question).toLowerCase();
  const conf = (k) => ({ high: L('High', 'عالية'), med: L('Medium', 'متوسطة'), low: L('Low', 'منخفضة') }[k] || k || '—');
  const clsL = (x) => (x.basis === 'data' ? L('Measured', 'مقاس') : x.basis === 'facts' ? L('Approved facts', 'حقائق معتمدة') : x.basis === 'sources' ? L('Company sources', 'مصادر الشركة') : L('Not enough data', 'بيانات غير كافية'));
  const card = (x) => [
    `**${x.title}**`,
    x.why || '',
    ...(x.ev ?? (x.evidence ?? []).map((e) => e.text)).map((e) => `- ${e}`),
    `**${L('Proposed action', 'الإجراء المقترح')}:** ${x.action || '—'}`,
    `${L('Metric to watch', 'المقياس للمتابعة')}: ${x.metric || '—'} · ${L('Confidence', 'الثقة')}: ${conf(x.conf ?? x.confidence?.level)}`,
  ].filter(Boolean).join('\n');
  const acts = (x) => [
    { l: L('Add to my tasks', 'أضف إلى مهامي'), a: 'recTask', v: x.id },
    ...(x.make === 'campaign' || x.seg ? [{ l: L('Create campaign from this', 'أنشئ حملة من هذا'), a: 'recCamp', v: x.id }] : []),
    ...(x.exp ? [{ l: L('Create experiment', 'أنشئ تجربة'), a: 'recExp', v: x.id }] : []),
  ];
  const used = (x) => [x.plat, clsL(x)].filter(Boolean);
  const R = (title, text, { used: u = [], actions = [], cls = 'rec', support = [], insufficient = false } = {}) => ({ title, cls, text, used: u, actions, support, insufficient });
  const sup = (...xs) => xs.filter(Boolean).map((x) => ({ type: 'audit', id: x.id }));
  const integ = { l: L('Open Integrations & Data', 'افتح التكاملات والبيانات'), a: 'go', v: 'integ' };
  const none = R(L('I cannot answer that from the data I have', 'لا أستطيع الإجابة من البيانات المتاحة'), L('No source or imported dataset covers this yet. Add sources in Company sources or import data in Integrations & Data.', 'لا يوجد مصدر أو بيانات مستوردة تغطي هذا بعد. أضف مصادر أو استورد بيانات.'), { actions: [integ], cls: 'unknown', insufficient: true });
  const find = (id) => A.find((y) => y.id === id && y.basis !== 'insufficient');
  const ranked = A.filter((y) => y.basis !== 'insufficient');

  // project experience (company CV / portfolio), checked first as the page version did
  if (/project|portfolio|experience|industr|\bcv\b|case stud|خبر|مشاريع|مشروع|قطاع|سيرة/i.test(question)) {
    const findings = db.prepare('SELECT id, cat, text, type, status FROM facts WHERE company_id = ?').all(companyId).map((f) => ({ ...f }));
    const P = portfolio(findings);
    const pf = A.filter((x) => x.id.startsWith('pf-'));
    if (!P.pr.length) return R(L('No project portfolio yet', 'لا سجل مشاريع بعد'), L('No source contains projects or case studies, so I cannot say what your experience proves. Upload a company CV in Company sources.', 'لا مصدر يحتوي مشاريع أو دراسات حالة، فلا أستطيع القول ما تثبته خبرتك. ارفع السيرة المؤسسية من مصادر الشركة.'), { actions: [{ l: L('Open Company sources', 'افتح مصادر الشركة'), a: 'go', v: 'onboard' }], cls: 'unknown', insufficient: true });
    const text = [
      L(`${P.pr.length} projects on record (${P.pr.filter((p) => p.ok).length} approved for use in campaigns).`, `${P.pr.length} مشروعاً مسجلاً (${P.pr.filter((p) => p.ok).length} معتمد للاستخدام في الحملات).`),
      `**${L('By industry / segment', 'حسب القطاع / الشريحة')}:** ${P.ind.map((i) => `${i.n} (${i.c})`).join(' · ') || '—'}`,
      `**${L('By service', 'حسب الخدمة')}:** ${P.svc.map((i) => `${i.n} (${i.c})`).join(' · ') || '—'}`,
      ...pf.map((x) => [`**${x.title}**`, ...(x.ev ?? []).slice(0, 4).map((e) => `- ${e}`), `**${L('Proposed action', 'الإجراء المقترح')}:** ${x.action}`].join('\n')),
    ].join('\n\n');
    const acts2 = pf.filter((x) => x.make === 'campaign').slice(0, 2).map((x) => ({ l: L('Create campaign for ', 'أنشئ حملة لـ ') + x.seg, a: 'recCamp', v: x.id }))
      .concat(pf.filter((x) => x.make === 'task').slice(0, 1).map((x) => ({ l: L('Add task: ', 'أضف مهمة: ') + (x.title.length > 30 ? `${x.title.slice(0, 30)}…` : x.title), a: 'recTask', v: x.id })));
    return R(L('What your project experience supports', 'ما الذي تدعمه خبرة مشاريعك'), text, { used: [L('Company CV & portfolio', 'السيرة المؤسسية والمشاريع'), L('Approved knowledge', 'معلومات الشركة المعتمدة')], actions: acts2, cls: 'interp', support: sup(...pf) });
  }
  if (/additional data|data do you need|missing data|what data|بيانات (إضافية|ناقصة)|ما البيانات/.test(t)) {
    const g = A.filter((x) => x.basis === 'insufficient');
    const gs = gaps(db, companyId, { range, lang }) ?? [];
    return R(L('Data that would improve my decisions', 'بيانات تحسّن قراراتي'), gs.length ? gs.map((x) => `**${x.title}**\n- ${L('What you have', 'ما لديك')}: ${x.have}\n- ${L('What you need', 'ما تحتاجه')}: ${x.need}\n- ${L('What it unlocks', 'ما الذي يتيحه')}: ${x.unlocks}`).join('\n\n') : L('All core datasets are present. The next improvement is sales outcomes per lead.', 'كل البيانات الأساسية موجودة. التحسين التالي هو نتائج المبيعات لكل عميل.'), { used: [L('Measurement completeness checks', 'فحوص اكتمال القياس')], actions: [integ], cls: 'fact', support: sup(...g) });
  }
  if (/create.*campaign|أنشئ.*حملة|launch.*campaign/.test(t)) {
    const x = find('seg-best') || ranked.find((y) => y.make === 'campaign');
    if (!x) return none;
    return R(L('Proposed campaign', 'حملة مقترحة'), `${card(x)}\n\n${L('Approving creates a draft campaign in Campaign Studio. Nothing is published.', 'الموافقة تنشئ مسودة حملة في إنشاء حملة. لا يُنشر شيء.')}`, { used: used(x), actions: [{ l: L('Approve: create draft campaign', 'وافق: أنشئ مسودة حملة'), a: 'recCamp', v: x.id }], support: sup(x) });
  }
  if (/content plan|calendar|خطة محتوى|تقويم/.test(t)) {
    const x = find('theme-best');
    return R(L('Content plan focused on enquiries', 'خطة محتوى تركز على الاستفسارات'), `${x ? card(x) : L('No theme data yet, so the plan uses approved product facts only.', 'لا توجد بيانات مواضيع بعد، فالخطة تعتمد على حقائق المنتج المعتمدة فقط.')}\n\n${L('A campaign draft includes a two-week bilingual calendar with tracked links.', 'مسودة الحملة تتضمن تقويماً ثنائي اللغة لأسبوعين بروابط متتبَّعة.')}`, { used: x ? used(x) : [L('Approved knowledge', 'معلومات الشركة المعتمدة')], actions: [{ l: L('Approve: create campaign with calendar', 'وافق: أنشئ حملة بتقويم'), a: 'recCamp', v: x ? x.id : '' }], support: sup(x) });
  }
  if (/landing page|dedicated page|صفحة الهبوط|صفحة هبوط|صفحة الحملة|صفحة الدخول|صفحة مخصصة|الصفحة المخصصة/.test(t)) {
    const x = find('page-leak') || find('mobile-gap') || find('no-track');
    return x ? R(L('Landing page improvement', 'تحسين صفحة الحملة'), card(x), { used: used(x), actions: acts(x), support: sup(x) }) : none;
  }
  if (/weak|ضعف/.test(t)) {
    const x = ranked.find((y) => y.kind === 'weak');
    return x ? R(L('Your biggest marketing weakness right now', 'أكبر نقطة ضعف تسويقية الآن'), `${card(x)}\n\n${L('Ranked by business value, evidence strength, urgency and effort.', 'مرتبة حسب قيمة العمل وقوة الدليل والإلحاح والجهد.')}`, { used: used(x), actions: acts(x), support: sup(x) }) : none;
  }
  if (/\bfirst\b|start with|where (do|should) (we|i) (start|begin)|أولا|أولاً|ابدأ|نبدأ|البداية/.test(t)) {
    const [x, ...rest] = ranked.filter((y) => y.kind !== 'strong');
    if (!x) return none;
    const next = rest.slice(0, 2);
    return R(L('What to do first', 'ما الذي نفعله أولاً'), `${card(x)}${next.length ? `\n\n**${L('Then', 'بعد ذلك')}:**\n${next.map((y, i) => `${i + 1}. ${y.title} — ${y.action}`).join('\n')}` : ''}\n\n${L('Ranked by business value, evidence strength, urgency and effort.', 'مرتبة حسب قيمة العمل وقوة الدليل والإلحاح والجهد.')}`, { used: used(x), actions: acts(x), support: sup(x, ...next) });
  }
  if (/platform|facebook|instagram|منصة|فيسبوك|إنستجرام|انستجرام/.test(t)) {
    const x = find('plat-roles');
    if (!x) return none;
    const leads = dataRows(db, companyId, 'leads');
    const by = new Map();
    for (const r of leads) {
      const s = String(r.source || '');
      if (!/facebook|instagram/i.test(s)) continue;
      const o = by.get(s) || { c: 0, q: 0 };
      o.c++;
      if (r.status === 'qualified' || r.status === 'customer') o.q++;
      by.set(s, o);
    }
    const ls = [...by].map(([n, o]) => `- ${n}: ${fmtN(o.c)} ${L('leads', 'عميل')}, ${pct(o.q, o.c)} ${L('qualified', 'مؤهلون')}`);
    return R(L('Facebook vs Instagram', 'فيسبوك مقابل إنستجرام'), card(x) + (ls.length ? `\n\n**${L('Lead quality by platform (all imported leads)', 'جودة العملاء حسب المنصة (كل العملاء المستوردين)')}:**\n${ls.join('\n')}` : ''), { used: used(x).concat(ls.length ? [L('Leads import', 'استيراد العملاء')] : []), actions: acts(x), cls: 'interp', support: sup(x) });
  }
  if (/traffic|enquir|inquir|زيارات|استفسار/.test(t)) {
    const xs = ['no-track', 'ch-leak', 'page-leak', 'mobile-gap'].map(find).filter(Boolean);
    if (!xs.length) return none;
    return R(L('Why traffic is not turning into enquiries', 'لماذا لا تتحول الزيارات إلى استفسارات'), xs.map(card).join('\n\n'), { used: ['GA4', L('Measured', 'مقاس')], actions: acts(xs[0]), cls: 'interp', support: sup(...xs) });
  }
  if (/content|worked|محتوى/.test(t)) {
    const x = find('theme-best');
    return x ? R(L('What content has worked best', 'أفضل محتوى أداءً'), card(x), { used: used(x), actions: acts(x), cls: 'fact', support: sup(x) }) : none;
  }
  if (/service|promote|product|خدمة|منتج|نروّج|نروج/.test(t)) {
    const x = find('seg-best');
    const pr = approvedFacts(db, companyId).filter((f) => f.cat === 'products' && (lang === 'ar' ? /[؀-ۿ]/.test(f.text) : !/[؀-ۿ]/.test(f.text))).map((f) => f.text);
    if (!pr.length) return none;
    return R(L('What to promote first', 'ما الذي نروّج له أولاً'), [
      L('I have no per-product performance data, so I cannot rank your products by results. That is an unknown, not a guess.', 'لا توجد بيانات أداء لكل منتج، فلا أستطيع ترتيب المنتجات حسب النتائج. هذا مجهول وليس تخميناً.'),
      `**${L('What I can support', 'ما أستطيع دعمه')}:** ${x ? L(`lead the next campaign with the segment that qualifies best (“${x.seg}”) and present these approved facts: `, `ابدأ الحملة التالية بالشريحة الأعلى تأهيلاً («${x.seg}») واعرض هذه الحقائق المعتمدة: `) : L('present these approved facts: ', 'اعرض هذه الحقائق المعتمدة: ')}${pr.slice(0, 4).join(' · ')}.`,
      L('To answer properly: tag campaigns per product (utm_content) and import the results.', 'للإجابة الدقيقة: وسِّم الحملات لكل منتج (utm_content) واستورد النتائج.'),
    ].join('\n\n'), { used: [L('Approved products', 'المنتجات المعتمدة')].concat(x ? used(x) : []), actions: x ? acts(x) : [], cls: 'hyp', support: sup(x) });
  }
  if (/week|أسبوع|اسبوع/.test(t)) {
    const p = ranked.filter((y) => y.kind !== 'strong').slice(0, 5);
    return p.length ? R(L('This week’s plan', 'خطة هذا الأسبوع'), p.map((x, i) => `${i + 1}. ${x.title} — ${x.action}`).join('\n'), { used: [L('Audit priorities', 'أولويات التقييم')], actions: p.slice(0, 3).map((x) => ({ l: L('Add task: ', 'أضف مهمة: ') + (x.title.length > 34 ? `${x.title.slice(0, 34)}…` : x.title), a: 'recTask', v: x.id })), support: sup(...p) }) : none;
  }
  if (/qualified|attract|clients|مؤهل|عملاء/.test(t)) {
    const xs = ['seg-best', 'src-best', 'src-lowq', 'src-unknown', 'defs', 'no-leads'].map((id) => A.find((y) => y.id === id)).filter(Boolean);
    return xs.length ? R(L('How to attract more qualified clients', 'كيف نجذب عملاء مؤهلين أكثر'), xs.slice(0, 3).map((x) => (x.basis === 'insufficient' ? `**${x.title}**\n${x.needs || x.need || ''}` : card(x))).join('\n\n'), { used: [L('Leads import', 'استيراد العملاء')], actions: acts(xs[0]), support: sup(...xs.slice(0, 3)) }) : none;
  }
  if (/campaign|حملة/.test(t)) {
    const camps = db.prepare('SELECT name, slug FROM campaigns WHERE company_id = ? ORDER BY pos').all(companyId);
    const ga4 = dataRows(db, companyId, 'ga4');
    const leads = dataRows(db, companyId, 'leads');
    const rows = camps.map((k) => {
      const g = ga4.filter((r) => r.campaign === k.slug);
      const l = leads.filter((r) => r.campaign === k.slug);
      if (!g.length && !l.length) return null;
      const s = g.reduce((a, r) => a + (Number(r.sessions) || 0), 0);
      const e = g.reduce((a, r) => a + (Number(r.enquiries) || 0), 0);
      const q = l.filter((r) => r.status === 'qualified' || r.status === 'customer').length;
      return `- **${k.name}**: ${fmtN(s)} ${L('visits', 'زيارة')}, ${fmtN(e)} ${L('enquiries', 'استفسار')}, ${fmtN(l.length)} ${L('leads', 'عميل محتمل')} (${pct(q, l.length)} ${L('qualified', 'مؤهلون')})`;
    }).filter(Boolean);
    if (!rows.length) return R(L('No campaign results yet', 'لا توجد نتائج حملات بعد'), L('No imported rows carry a campaign tag that matches a BrandPilot campaign. Import results with the utm_campaign value shown in Campaign Studio.', 'لا توجد صفوف مستوردة بوسم حملة يطابق حملة في BrandPilot. استورد النتائج بقيمة utm_campaign الظاهرة في إنشاء حملة.'), { actions: [integ], cls: 'unknown', insufficient: true });
    return R(L('Campaign review', 'مراجعة الحملات'), `${rows.join('\n')}\n\n${L('Campaign and non-campaign traffic differ in audience and timing, so differences are associations, not proof of cause.', 'زيارات الحملة وغيرها تختلف في الجمهور والتوقيت، فالفروق ارتباطات لا إثبات سببية.')}`, { used: [L('Campaign-tagged rows (all imported data)', 'الصفوف الموسومة بالحملة (كل البيانات المستوردة)')], actions: [{ l: L('Open Automation & Improvement', 'افتح الأتمتة والتحسين'), a: 'go', v: 'auto' }], cls: 'interp' });
  }
  if (/chang|تغيّر|تغير|اتغير/.test(t)) {
    const m = metrics(db, companyId, range);
    const names = { sessions: L('Visits', 'الزيارات'), enquiries: L('Enquiries', 'الاستفسارات'), leads: L('Leads', 'العملاء المحتملون'), qualified_leads: L('Qualified leads', 'العملاء المؤهلون'), reach: L('Reach', 'الوصول'), engagements: L('Engagements', 'التفاعلات') };
    const lines = Object.entries(names).filter(([k]) => m.kpis[k] && m.kpis[k].value !== null && m.kpis[k].previous !== null).map(([k, n]) => `- ${n}: ${fmtN(m.kpis[k].value)} (${L('previous period', 'الفترة السابقة')}: ${fmtN(m.kpis[k].previous)})`);
    return R(L('What changed', 'ما الذي تغيّر'), lines.length ? lines.join('\n') : L('No comparison period is available in the imported data.', 'لا توجد فترة مقارنة في البيانات المستوردة.'), { used: [L('Imported datasets', 'البيانات المستوردة')], actions: [{ l: L('Open Analytics', 'افتح التحليلات'), a: 'go', v: 'analytics' }], cls: 'fact', support: lines.length ? Object.keys(names).filter((k) => m.kpis[k]?.value !== null).map((k) => ({ type: 'metric', id: k })) : [], insufficient: !lines.length });
  }
  if (/30|60|90/.test(t)) {
    const w = ranked.find((y) => y.kind === 'weak');
    const o = ranked.find((y) => y.kind === 'opp');
    const s = ranked.find((y) => y.kind === 'strong');
    const lines = [[L('30 days', '30 يوماً'), w], [L('60 days', '60 يوماً'), o], [L('90 days', '90 يوماً'), s]].filter(([, x]) => x).map(([d, x]) => `**${d}:** ${x.action}`);
    return lines.length ? R(L('30 / 60 / 90-day objectives', 'أهداف 30 / 60 / 90 يوماً'), lines.join('\n\n'), { used: [L('Audit priorities', 'أولويات التقييم')], actions: [{ l: L('Open Growth & Leads', 'افتح النمو والعملاء'), a: 'go', v: 'growth' }], support: sup(w, o, s) }) : none;
  }
  return R(L('That is outside what the rules engine can answer', 'هذا خارج ما يستطيع نظام القواعد الإجابة عنه'), L('Without an AI model, the Director answers from fixed rules over your approved knowledge and imported data, so it does not understand free-form questions. Try one of the suggested questions, ask an administrator to set up an AI model on the server, or export the context package to your own Claude and import its answer.', 'من دون نموذج ذكاء اصطناعي، يجيب مدير التسويق بقواعد ثابتة على معلومات شركتك المعتمدة وبياناتك المستوردة، فلا يفهم الأسئلة الحرة. جرّب أحد الأسئلة المقترحة، أو اطلب من المسؤول إعداد نموذج على الخادم، أو صدّر حزمة معلومات الشركة إلى Claude الخاص بك واستورد إجابته.'), { actions: [{ l: L('Copy context package for Claude', 'انسخ حزمة معلومات الشركة لـ Claude'), a: 'copyPkg', v: question }], cls: 'unknown', insufficient: true });
}
