import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { buildReport, renderReport, renderReportHtml, bidi, KPI_FORMAT } from '../server/report.js';

let server, base, db, alice, bob, companyId, emptyId;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  companyId = (await (await call('POST', '/api/companies', alice, { name: 'Nile | Bakery *Co*' })).json()).company.id;
  emptyId = (await (await call('POST', '/api/companies', alice, { name: 'Empty Co' })).json()).company.id;
});
after(() => {
  server.close();
  db.close();
});
const call = (method, path, cookie, body) =>
  fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}
const get = (id, q = '', cookie = alice) => call('GET', `/api/companies/${id}/report${q}`, cookie);
const finding = (id, cat, status, text, extra = {}) => ({ id, cat, text, type: 'fact', status, src: 's1', ev: `Quote: ${text}`, needs: false, date: '2026-11-12', ...extra });
const field = (v) => ({ v, edited: false });
const state = () => ({
  sources: [{ id: 's1', title: 'about.txt', kind: 'document', text: 'x', date: '2026-11-12', demo: false }],
  findings: [
    finding('tone', 'tone', 'approved', 'Warm and friendly'),
    finding('pend', 'product', 'pending', 'PENDING claim'),
    finding('rej', 'product', 'rejected', 'REJECTED claim'),
  ],
  data: {
    ga4: [
      // previous 7 days (the previous period is reported only when it lies inside the data)
      { date: '2026-10-21', channel: 'Search', device: 'desktop', sessions: 400, enquiries: 10 },
      // current 7 days (ends at the latest date)
      { date: '2026-11-01', channel: 'Search', device: 'desktop', sessions: 500, enquiries: 20 },
      { date: '2026-11-02', channel: 'Social', device: 'desktop', sessions: 1000, enquiries: 5 },
      { date: '2026-11-03', channel: 'Email', device: 'desktop', sessions: 500, enquiries: 10 },
      { date: '2026-11-03', channel: 'Social', device: 'desktop', sessions: -1, enquiries: 999 }, // refused by the mirror
    ],
  },
  imports: [],
  campaigns: [
    {
      id: 'k1', name: 'Search push', slug: 'search-push', at: Date.UTC(2026, 10, 12), rec: 'ch-best', approved: false, brief: {},
      assets: [
        { id: 'a1', type: 'post', lang: 'en', channel: 'facebook', n: 1, status: 'approved', flag: null, fields: { headline: field('Hi') } },
        { id: 'a2', type: 'post', lang: 'ar', channel: 'facebook', n: 1, status: 'draft', flag: null, fields: { headline: field('مرحبا') } },
      ],
    },
  ],
});

test('empty company: no numbers shown as zero, no findings, gaps listed, both languages render', async () => {
  const r = await (await get(emptyId)).json();
  assert.deepEqual(r.company, { name: 'Empty Co' });
  assert.equal(r.period, null);
  assert.equal(r.synthetic, false);
  assert.deepEqual(r.kpis.map((k) => k.id), Object.keys(KPI_FORMAT));
  for (const k of r.kpis) {
    assert.equal(k.value, null, k.id);
    assert.ok(['no_data', 'not_measured'].includes(k.reason));
    assert.equal(k.change, null);
  }
  assert.deepEqual(Object.values(r.findings).flat(), []);
  assert.ok(r.gaps.length >= 4);
  for (const g of r.gaps) assert.ok(g.title && g.needs);
  assert.deepEqual(r.knowledge, { approvedFacts: 0, synthetic: 0 });
  assert.deepEqual(r.campaigns, []);

  const en = renderReport(r, 'en');
  assert.match(en, /^# Marketing report — Empty Co/);
  assert.match(en, /No data imported yet\./);
  assert.match(en, /\| Website sessions \| no data \| — \|/);
  assert.match(en, /No finding is supported/);
  assert.match(en, /## Not enough data yet/);
  assert.match(en, /No campaigns yet\./);
  assert.doesNotMatch(en, /\| 0 \|/); // a missing number is never written as 0
  const ar = renderReport(r, 'ar');
  assert.match(ar, /^# التقرير التسويقي — Empty Co/);
  assert.match(ar, /\| جلسات الموقع \| لا توجد بيانات \| — \|/);
});

test('report from validated data: KPIs with change, findings by section with evidence, campaigns; nothing unapproved', async () => {
  assert.equal((await call('PUT', `/api/companies/${companyId}/state`, alice, { state: state() })).status, 200);
  const r = await (await get(companyId, '?range=7')).json();

  assert.equal(r.range, '7');
  assert.deepEqual(r.period, { from: '2026-10-28', to: '2026-11-03', days: 7 });
  assert.deepEqual(r.previous, { from: '2026-10-21', to: '2026-10-27' });
  const k = Object.fromEntries(r.kpis.map((x) => [x.id, x]));
  assert.equal(k.sessions.value, 2000); // the refused row is not counted
  assert.equal(k.sessions.previous, 400);
  assert.equal(k.sessions.change, 4);
  assert.equal(k.enquiries.value, 35);
  assert.ok(Math.abs(k.enquiry_rate.value - 35 / 2000) < 1e-9);
  assert.equal(k.enquiry_rate.format, 'percent');
  assert.equal(k.leads.value, null);
  assert.equal(k.leads.reason, 'no_data');

  // Audit conclusions land in their sections; insufficient items only under gaps.
  assert.deepEqual(r.findings.strong.map((f) => f.id), ['ch-best']);
  assert.deepEqual(r.findings.weak.map((f) => f.id), ['ch-leak']);
  assert.equal(r.findings.strong[0].basis, 'data');
  assert.match(r.findings.strong[0].evidence[0], /^Search: /);
  const ids = Object.values(r.findings).flat().map((f) => f.id);
  for (const g of r.gaps) assert.equal(ids.includes(g.id), false, g.id);
  assert.ok(r.gaps.some((g) => g.id === 'no-leads'));

  assert.deepEqual(r.knowledge, { approvedFacts: 1, synthetic: 0 });
  assert.deepEqual(r.campaigns, [{ id: 'k1', name: 'Search push', approved: false, assets: 2, approvedAssets: 1, rec: 'ch-best' }]);
  assert.doesNotMatch(JSON.stringify(r), /PENDING|REJECTED/);
  assert.deepEqual({ ...buildReport(db, companyId, { range: '7' }), generatedAt: r.generatedAt }, r);
});

test('Markdown download: headers, numbers, escaping of company text, Arabic labels with the honest English note', async () => {
  const res = await get(companyId, '?range=7&format=md');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/markdown; charset=utf-8/);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="marketing-report-\d{4}-\d{2}-\d{2}\.md"$/);
  const en = await res.text();
  // The company name cannot break the heading or inject Markdown.
  assert.match(en, /^# Marketing report — Nile \\\| Bakery \\\*Co\\\*\n/);
  assert.match(en, /Period: 2026-10-28 to 2026-11-03/);
  assert.match(en, /compared with: 2026-10-21 to 2026-10-27/);
  assert.match(en, /\| Website sessions \| 2,000 \| \+400\.0% \|/);
  assert.match(en, /\| Enquiry rate \| 1\.75% \| /);
  assert.match(en, /\| Leads \| no data \| — \|/);
  assert.match(en, /### Strengths\n\n\*\*Search visitors enquire at the highest rate\*\* — from your imported data/);
  assert.match(en, /Evidence:\n- Search: 30 enquiries from 900 sessions/); // the audit looks at all rows, not one period
  assert.match(en, /### Weaknesses/);
  assert.match(en, /1 approved fact\(s\) in the Knowledge Hub/);
  assert.match(en, /- \*\*Search push\*\* — draft; 1 of 2 assets approved; from recommendation `ch-best`/);
  assert.doesNotMatch(en, /synthetic/i);

  const ar = await (await get(companyId, '?range=7&format=md&lang=ar')).text();
  assert.match(ar, /^# التقرير التسويقي — /);
  assert.match(ar, /\| جلسات الموقع \| 2,000 \| \+400\.0% \|/);
  assert.match(ar, /### نقاط القوة/);
  // Findings are written in Arabic by the server audit; no "findings are English" note.
  assert.match(ar, /\*\*زوار Search هم الأعلى في معدل الاستفسار\*\* — من بياناتكم المستوردة/);
  assert.match(ar, /- Search: 30 استفسار من 900 جلسة \(3\.33%\)/);
  assert.match(ar, /الظهور في البحث العضوي غير معروف\*\* — استوردوا تصدير الأداء من Search Console\./);
  assert.doesNotMatch(ar, /بالإنجليزية حالياً|visitors enquire|Import a /);
  assert.doesNotMatch(en, /[\u0600-\u06FF]/); // and the English report has no Arabic in it
  // JSON in Arabic on request; English by default.
  const j = await (await get(companyId, '?range=7&lang=ar')).json();
  assert.equal(j.findingsLang, 'ar');
  assert.equal(j.findings.strong[0].title, 'زوار Search هم الأعلى في معدل الاستفسار');
  assert.equal((await (await get(companyId, '?range=7')).json()).findingsLang, 'en');
  // A report saved before Arabic findings existed (English texts, no findingsLang) still says so in Arabic.
  const old = await (await get(companyId, '?range=7')).json();
  delete old.findingsLang;
  assert.match(renderReport(old, 'ar'), /بالإنجليزية حالياً/);
  assert.match(ar, /مسودة/);
});

test('synthetic data is labeled in the JSON and in the document', async () => {
  const s = state();
  s.imports = [{ kind: 'ga4', origin: 'fixture' }];
  await call('PUT', `/api/companies/${companyId}/state`, alice, { state: s });
  const r = await (await get(companyId, '?range=all')).json();
  assert.equal(r.synthetic, true);
  assert.equal(r.kpis.find((k) => k.id === 'sessions').synthetic, true);
  assert.equal(r.findings.strong[0].synthetic, true);
  const en = renderReport(r, 'en');
  assert.match(en, /\*\*Contains synthetic demo data — not real performance\.\*\*/);
  assert.match(en, /\(all imported data\)/);
  assert.match(en, /\| Website sessions \| 2,400 \(synthetic\) \| — \|/);
  assert.match(en, /from your imported data \(synthetic\)/);
});

test('printable HTML: self-contained, locked down, escaped, right direction per language', async () => {
  // A hostile company name and a hostile approved fact category must arrive as text.
  const evil = (await (await call('POST', '/api/companies', alice, { name: '<script>alert(1)</script> "Co" & \'Sons\'' })).json()).company.id;
  const s = state();
  s.campaigns[0].name = '<img src=x onerror=alert(2)>';
  await call('PUT', `/api/companies/${evil}/state`, alice, { state: s });

  const res = await get(evil, '?range=7&format=html');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html; charset=utf-8/);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.doesNotMatch(csp, /script-src/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const en = await res.text();
  assert.match(en, /^<!doctype html>\n<html lang="en" dir="ltr">/);
  assert.doesNotMatch(en, /<script|<img|<link|<iframe|<a\s|<form|<object|<embed|javascript:/i); // no tag that runs or loads anything
  assert.match(en, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;Co&quot; &amp; &#39;Sons&#39;/);
  assert.match(en, /&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.match(en, /<td>Website sessions<\/td><td class="n"><span class="ltr">2,000<\/span><\/td><td class="n"><span class="ltr">\+400\.0%<\/span><\/td>/);
  assert.match(en, /<td>Leads<\/td><td class="n"><span class="nd">no data<\/span><\/td>/);
  assert.match(en, /<h3>Strengths<\/h3>/);
  assert.match(en, /Search: 30 enquiries from 900 sessions/);
  assert.match(en, /@media print/);
  assert.doesNotMatch(en, />0<\/span><\/td>/); // sessions etc. exist; missing numbers are never 0
  assert.doesNotMatch(en, /PENDING|REJECTED/);

  const ar = await (await get(evil, '?range=7&format=html&lang=ar')).text();
  assert.match(ar, /^<!doctype html>\n<html lang="ar" dir="rtl">/);
  assert.match(ar, /<td>جلسات الموقع<\/td>/);
  assert.match(ar, /هم الأعلى في معدل الاستفسار/);
  assert.doesNotMatch(ar, /بالإنجليزية حالياً/);
  // Latin / numeric runs inside Arabic finding text are isolated on the Arabic page only.
  assert.match(ar, /<li dir="auto">[^<]*<bdi>[A-Za-z0-9]/);
  assert.doesNotMatch(en, /<bdi>/);
  assert.doesNotMatch(ar, /<bdi>[^<]*[؀-ۿ]/); // no Arabic letter is ever inside a run
  assert.doesNotMatch(ar, /<script|<img/i); // escaping still holds inside and around the runs
  assert.doesNotMatch(await (await get(evil, '?range=7&format=md&lang=ar')).text(), /<bdi>/); // Markdown untouched

  // Synthetic data is labeled in the page too.
  s.imports = [{ kind: 'ga4', origin: 'fixture' }];
  await call('PUT', `/api/companies/${evil}/state`, alice, { state: s });
  const syn = await (await get(evil, '?range=all&format=html')).text();
  assert.match(syn, /<p class="warn">Contains synthetic demo data — not real performance\.<\/p>/);
  assert.match(syn, /<span class="tag syn">synthetic<\/span>/);

  assert.equal((await get(evil, '?format=html', bob)).status, 404);
});

test('currency: money values carry the company currency; none or invalid → plain numbers; old snapshots still render', async () => {
  const co = (await (await call('POST', '/api/companies', alice, { name: 'Money Co' })).json()).company.id;
  const s = {
    sources: [], findings: [], imports: [],
    data: {
      meta: [{ date: '2026-11-01', platform: 'facebook', reach: 1000, engagements: 50, spend: 4200 }],
      leads: Array.from({ length: 50 }, () => ({ date: '2026-11-01', status: 'new', source: 'Ads' })),
    },
  };
  await call('PUT', `/api/companies/${co}/state`, alice, { state: s });
  let r = await (await get(co, '?range=all')).json();
  assert.equal(r.currency, null);
  assert.match(renderReport(r, 'en'), /\| Spend \| 4,200 \| — \|/);

  await call('PUT', `/api/companies/${co}/state`, alice, { state: { ...s, currency: 'EGP' } });
  r = await (await get(co, '?range=all')).json();
  assert.equal(r.currency, 'EGP');
  const en = renderReport(r, 'en');
  assert.match(en, /\| Spend \| 4,200 EGP \| — \|/);
  assert.match(en, /\| Cost per lead \| 84 EGP \| — \|/);
  assert.match(en, /\| Reach \| 1,000 \| — \|/); // only money is labeled
  assert.match(renderReport(r, 'ar'), /\| الإنفاق \| 4,200 EGP \|/);
  const html = await (await get(co, '?range=all&format=html&lang=ar')).text();
  assert.match(html, /<td>الإنفاق<\/td><td class="n"><span class="ltr">4,200 EGP<\/span>/);

  for (const bad of ['egp', 'EGPX', '<b>', 42, null]) {
    await call('PUT', `/api/companies/${co}/state`, alice, { state: { ...s, currency: bad } });
    assert.equal((await (await get(co, '?range=all')).json()).currency, null, String(bad));
  }
  // A report saved before currencies existed has no such field.
  const old = { ...r };
  delete old.currency;
  assert.match(renderReport(old, 'en'), /\| Spend \| 4,200 \| — \|/);
  assert.match(renderReportHtml(old, 'en'), /<span class="ltr">4,200<\/span>/);
});

test('validation and isolation', async () => {
  assert.equal((await get(companyId, '?range=5')).status, 400);
  assert.equal((await get(companyId, '?format=pdf')).status, 400);
  assert.equal((await get(companyId, '?lang=fr')).status, 400);
  assert.equal((await get(companyId, '', bob)).status, 404);
  assert.equal((await get(companyId, '?format=md', bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${companyId}/report`)).status, 401);
  assert.equal(buildReport(db, 'no-such-company'), null);
});

test('bidi isolates Latin and numeric runs and escapes everything', () => {
  assert.equal(bidi('Facebook: 12% من الجلسات (1233 جلسة)'), '<bdi>Facebook: 12%</bdi> من الجلسات (<bdi>1233</bdi> جلسة)');
  assert.equal(bidi('الصفحة /pricing تحمل 14.5% من الجلسات'), 'الصفحة <bdi>/pricing</bdi> تحمل <bdi>14.5%</bdi> من الجلسات');
  assert.equal(bidi('Meta (Facebook) و Instagram'), '<bdi>Meta (Facebook)</bdi> و <bdi>Instagram</bdi>');
  assert.equal(bidi('(GA4) جلسات.'), '(<bdi>GA4</bdi>) جلسات.'); // brackets and the full stop stay with the Arabic text
  assert.equal(bidi('نص عربي فقط'), 'نص عربي فقط');
  assert.equal(bidi('<script>x</script> & "R&D"'), '&lt;<bdi>script</bdi>&gt;<bdi>x</bdi>&lt;<bdi>/script</bdi>&gt; &amp; &quot;<bdi>R&amp;D</bdi>&quot;');
  assert.equal(bidi(null), '');
});
