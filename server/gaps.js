/**
 * P3 checkpoint 2 (owner 2026-11-20): every "not enough data" item says three things:
 *   have     what the company has now (measured on the server, for the period on screen)
 *   need     what is missing (the audit item's own "needs" text)
 *   unlocks  what BrandPilot can do once it is there
 * The audit items themselves are not changed (their output is a recorded baseline); this is read next to them.
 */
import { audit } from './audit.js';
import { metrics } from './metrics.js';
import { dataRows } from './data.js';

const LABEL = { meta: ['social post', 'منشور تواصل'], ga4: ['website (GA4)', 'زيارات موقع (GA4)'], gsc: ['Search Console', 'Search Console'], leads: ['lead', 'عميل محتمل'] };

const UNLOCKS = {
  'no-ga4': ['Enquiry rate by channel, landing page and device, and the website steps in Next steps.', 'معدل الاستفسار حسب القناة وصفحة الهبوط والجهاز، وخطوات الموقع في «الخطوات التالية».'],
  'no-meta': ['Engagement by theme, language and platform, your posting rhythm, and the content plan.', 'التفاعل حسب الموضوع واللغة والمنصة، وإيقاع النشر، وخطة المحتوى.'],
  'no-gsc': ['The search queries that already show your pages but get few clicks.', 'استعلامات البحث التي تُظهر صفحاتك لكنها تجلب نقرات قليلة.'],
  'no-leads': ['Lead quality by source and segment, and qualified leads per channel.', 'جودة العملاء حسب المصدر والشريحة، والعملاء المؤهلون لكل قناة.'],
  'ch-best': ['Which channel’s visitors enquire best, to put more effort there.', 'أي قناة يستفسر زوارها أكثر، لتضع جهداً أكبر فيها.'],
  'page-leak': ['Which landing page loses enquiries.', 'أي صفحة هبوط تخسر الاستفسارات.'],
  'mobile-gap': ['Whether mobile visitors enquire less than desktop visitors.', 'هل يستفسر زوار الجوال أقل من زوار سطح المكتب.'],
  'seo-q': ['Search queries worth a better page.', 'استعلامات بحث تستحق صفحة أفضل.'],
  'seg-best': ['Which segment brings the most qualified leads, and a campaign for it.', 'أي شريحة تجلب أكثر العملاء المؤهلين، وحملة لها.'],
  'src-best': ['Which lead source brings the most qualified leads.', 'أي مصدر عملاء يجلب أكثر العملاء المؤهلين.'],
  'theme-best': ['Which content themes bring engagement and clicks.', 'أي مواضيع المحتوى تجلب التفاعل والنقرات.'],
  lang: ['Whether your Arabic or English posts work better.', 'هل تعمل منشوراتك العربية أم الإنجليزية بشكل أفضل.'],
  'eng-drop': ['Whether engagement is falling, and since when.', 'هل يتراجع التفاعل، ومنذ متى.'],
  cadence: ['Gaps in your posting rhythm.', 'الفجوات في إيقاع النشر.'],
  'no-spend': ['Cost per lead and cost per click, per channel.', 'تكلفة العميل المحتمل وتكلفة النقرة لكل قناة.'],
  'know-gaps': ['Campaign copy built only from approved company facts.', 'نصوص حملات مبنية فقط على حقائق الشركة المعتمدة.'],
  defs: ['Lead quality numbers everyone reads the same way.', 'أرقام جودة العملاء يقرؤها الجميع بالمعنى نفسه.'],
  'pf-none': ['Campaigns built on your project experience.', 'حملات مبنية على خبرة مشاريعك.'],
  'brand-doc': ['Brand checks of colours and calls to action in Brand QA.', 'فحوص العلامة للألوان والدعوات إلى الإجراء في فحص الجودة.'],
};
const DATASET_UNLOCKS = { meta: UNLOCKS['no-meta'], ga4: UNLOCKS['no-ga4'], gsc: UNLOCKS['no-gsc'], leads: UNLOCKS['no-leads'] };

/** → [{ id, title, have, need, unlocks }] for the audit's "not enough data" items of this period and language. */
export function gaps(db, companyId, { range = '28', lang = 'en' } = {}) {
  const ar = lang === 'ar';
  const L = (en, a) => (ar ? a : en);
  const n = (v) => new Intl.NumberFormat('en-US').format(v);
  const a = audit(db, companyId, { lang, range });
  if (!a) return null;
  const m = metrics(db, companyId, range);
  const per = m.period;
  const inPer = (rows) => (per ? rows.filter((r) => r.date >= per.from && r.date <= per.to) : rows);
  const rows = Object.fromEntries(['meta', 'ga4', 'gsc', 'leads'].map((k) => [k, dataRows(db, companyId, k)]));
  const facts = db.prepare("SELECT status, type, cat FROM facts WHERE company_id = ?").all(companyId);
  const approved = facts.filter((f) => f.status === 'approved').length;
  const open = facts.filter((f) => f.status === 'pending').length;
  const span = per ? L(` (${per.from} → ${per.to})`, ` (من ${per.from} إلى ${per.to})`) : '';

  const haveFor = (it) => {
    const ds = it.dataset;
    if (it.id === 'no-spend') return L(`${n(inPer(rows.meta).length)} social post rows${span}; the spend column is empty in all of them.`, `صفوف منشورات التواصل: ${n(inPer(rows.meta).length)}${span}؛ عمود الإنفاق فارغ فيها كلها.`);
    if (it.id === 'seg-best') { const l = inPer(rows.leads); return L(`${n(l.length)} leads${span}, ${n(l.filter((r) => r.segment).length)} of them with a segment.`, `العملاء المحتملون: ${n(l.length)}${span}، وعدد من سُجّلت شريحته: ${n(l.filter((r) => r.segment).length)}.`); }
    if (it.id === 'src-best') { const l = inPer(rows.leads); return L(`${n(l.length)} leads${span}, ${n(l.filter((r) => r.source).length)} of them with a source.`, `العملاء المحتملون: ${n(l.length)}${span}، وعدد من سُجّل مصدره: ${n(l.filter((r) => r.source).length)}.`); }
    if (it.id === 'know-gaps' || it.id === 'defs' || it.id === 'pf-none' || it.id === 'brand-doc' || !ds) return L(`${n(approved)} approved facts and ${n(open)} open questions in Company knowledge.`, `في معرفة الشركة: الحقائق المعتمدة ${n(approved)}، والأسئلة المفتوحة ${n(open)}.`);
    const all = rows[ds] ?? [];
    if (!all.length) return L(`No ${LABEL[ds][0]} data imported yet.`, `لا توجد بيانات (${LABEL[ds][1]}) مستوردة بعد.`);
    const p = inPer(all).length;
    return L(`${n(p)} ${LABEL[ds][0]} rows${span}${p !== all.length ? ` (${n(all.length)} in all imported data)` : ''}.`, `صفوف ${LABEL[ds][1]}: ${n(p)}${span}${p !== all.length ? `، وفي كل البيانات المستوردة: ${n(all.length)}` : ''}.`);
  };
  return a.items.filter((it) => it.basis === 'insufficient').map((it) => {
    const u = UNLOCKS[it.id] ?? DATASET_UNLOCKS[it.dataset] ?? ['More reliable recommendations in this area.', 'توصيات أدق في هذا المجال.'];
    return { id: it.id, title: it.title, have: haveFor(it), need: it.id === 'know-gaps' ? L(`Answers to the ${n(open)} open questions in Company knowledge.`, `إجابات الأسئلة المفتوحة في معرفة الشركة (${n(open)}).`) : it.needs || it.need || it.action || '', unlocks: L(u[0], u[1]) };
  });
}
