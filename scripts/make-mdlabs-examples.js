// Builds SYNTHETIC example files for the imports MD Labs has no real export for yet
// (GA4, Search Console, Leads / CRM), derived from the REAL MD Labs social exports in data/:
//   data/MD-Labs-facebook.csv, data/MD-Labs-instagram.csv,
//   data/MD-Labs LinkedIn content export (Nov 2025 - Nov 2026).xls  ("Metrics" + "All posts")
// so traffic, enquiries and leads rise and fall with the real posting activity.
// The numbers are invented. They are examples for testing imports, never evidence: every file
// name says SYNTHETIC and data/examples/README.md says how each one was made.
// Output goes to data/examples/ (git-ignored, like the real exports). Seeded: same output every run.
// Usage: node scripts/make-mdlabs-examples.js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const IN = path.resolve('data');
const OUT = path.resolve('data/examples');
const LI_FILE = 'MD-Labs LinkedIn content export (Nov 2025 - Nov 2026).xls';

let seed = 2017; // MD-Labs founding year — any fixed number works
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const weighted = (pairs) => { let x = rnd() * pairs.reduce((s, p) => s + p[1], 0); for (const p of pairs) if ((x -= p[1]) <= 0) return p[0]; return pairs[pairs.length - 1][0]; };
const poisson = (l) => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= rnd(); } while (p > L); return k - 1; };
const noise = (a = 0.75, b = 1.25) => a + rnd() * (b - a);

// ---------- read the real exports ----------
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}
const mdy = (s) => { const [m, d, y] = String(s).split(' ')[0].split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };

function loadXLSX() {
  const ctx = {}; ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.resolve('public/vendor/xlsx.full.min.js'), 'utf8'), ctx);
  return ctx.XLSX;
}

const need = ['MD-Labs-facebook.csv', 'MD-Labs-instagram.csv', LI_FILE].filter((f) => !fs.existsSync(path.join(IN, f)));
if (need.length) { console.error(`Missing real export(s) in data/: ${need.join(', ')}`); process.exit(1); }

const fb = parseCSV(fs.readFileSync(path.join(IN, 'MD-Labs-facebook.csv'), 'utf8'))
  .map((r) => ({ date: r.publish_time_pacific.slice(0, 10), views: +r.views || 0, title: r.post }));
const ig = parseCSV(fs.readFileSync(path.join(IN, 'MD-Labs-instagram.csv'), 'utf8'))
  .map((r) => ({ date: mdy(r['Publish time']), views: +r.Views || 0 }));
const XLSX = loadXLSX();
const wb = XLSX.read(fs.readFileSync(path.join(IN, LI_FILE)), { type: 'buffer' });
const sheet = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false });
const liDays = sheet('Metrics').slice(2).filter((r) => r[0]).map((r) => ({ date: mdy(r[0]), imp: +r[3] || 0, clicks: +r[7] || 0 }));
const liPosts = sheet('All posts').slice(2).filter((r) => r[5]).map((r) => ({ date: mdy(r[5]), imp: +r[9] || 0, title: String(r[0]).split('\n')[0] }));

// ---------- calendar ----------
const FIRST = liDays[0].date, LAST = liDays[liDays.length - 1].date; // the LinkedIn export's own range
const days = []; for (let t = Date.parse(FIRST + 'T00:00:00Z'); t <= Date.parse(LAST + 'T00:00:00Z'); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay(); // 5 Fri, 6 Sat = Egyptian weekend
const between = (d, a, b) => d >= a && d <= b;
// Approximate 2026 dates; MD Labs' own greeting posts fall on these days.
const RAMADAN = ['2026-02-18', '2026-03-19'], EID_FITR = ['2026-03-20', '2026-03-22'], EID_ADHA = ['2026-05-26', '2026-05-29'];
const dayFactor = (d) => (dow(d) === 5 || dow(d) === 6 ? 0.45 : 1)
  * (between(d, ...EID_FITR) || between(d, ...EID_ADHA) ? 0.35 : between(d, ...RAMADAN) ? 0.8 : 1)
  * (between(d, '2025-12-25', '2026-01-03') ? 0.75 : 1);

const liByDay = Object.fromEntries(liDays.map((r) => [r.date, r]));
// Meta posts have no link clicks in the exports; a post brings a little profile/site traffic for ~4 days.
const metaLift = {};
for (const p of [...fb, ...ig]) for (let k = 0; k < 4; k++) {
  const d = new Date(Date.parse(p.date + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
  metaLift[d] = (metaLift[d] || 0) + p.views * 0.004 * [1, 0.5, 0.25, 0.1][k];
}
// Brand interest after strong LinkedIn weeks (8-year post, AI Everything MEA) → more branded search.
const brandBoost = (d) => { const t = Date.parse(d + 'T00:00:00Z'); let s = 0; for (const p of liPosts) { const age = (t - Date.parse(p.date + 'T00:00:00Z')) / 864e5; if (age >= 0 && age < 14) s += p.imp / 2500 * Math.exp(-age / 5); } return 1 + Math.min(s, 1.5); };

// ---------- leads (CRM) ----------
// Sources typed the way a sales team would; compare.js maps LinkedIn/Facebook/Instagram/"Organic search".
const SEGMENTS = [['Education & e-learning', 4], ['Healthcare', 2], ['Logistics & distribution', 2], ['Retail & eCommerce', 3], ['Tech startups (MVP)', 4], ['Government', 1], ['NGOs', 1], ['Corporates', 2]];
const EVENT = { from: '2026-02-10', to: '2026-02-12', campaign: 'ai-everything-mea-2026' }; // real LinkedIn posts: team attended AI Everything MEA Egypt
const leads = [];
for (const d of days) {
  const f = dayFactor(d), li = liByDay[d] || { clicks: 0 };
  const rates = [
    ['LinkedIn', (0.05 + li.clicks * 0.0035) * f],
    ['Organic search', 0.07 * f * brandBoost(d)],
    ['Referral', 0.05 * f],
    ['Direct / website', 0.035 * f * brandBoost(d)],
    ['Facebook', 0.006 + (metaLift[d] || 0) * 0.01],
    ['Instagram', 0.002 + (metaLift[d] || 0) * 0.004],
    ['Email', 0.012 * f],
  ];
  if (between(d, EVENT.from, '2026-02-20')) rates.push(['Event — AI Everything MEA', between(d, EVENT.from, EVENT.to) ? 1.2 : 0.25]);
  for (const [source, l] of rates) for (let k = poisson(l); k > 0; k--) {
    const age = (Date.parse(LAST + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 864e5;
    const q = { LinkedIn: 0.45, 'Organic search': 0.35, Referral: 0.65, 'Direct / website': 0.4, Facebook: 0.2, Instagram: 0.15, Email: 0.3 }[source] ?? 0.4;
    const x = rnd();
    const status = age < 10 ? (x < 0.6 ? 'new' : 'contacted')
      : age < 30 ? (x < q * 0.8 ? 'qualified' : x < q + 0.3 ? 'contacted' : 'lost')
      : (x < q * 0.3 ? 'customer' : x < q ? 'qualified' : x < q + 0.12 ? 'contacted' : 'lost');
    const segment = source === 'Instagram' || source === 'Facebook' ? weighted([['Tech startups (MVP)', 3], ['Retail & eCommerce', 3], ['Education & e-learning', 1]]) : weighted(SEGMENTS);
    const campaign = source.startsWith('Event') ? EVENT.campaign : '';
    // Did the lead arrive through the website contact form? Those show up as GA4 enquiries.
    const web = { 'Organic search': 1, 'Direct / website': 1, LinkedIn: 0.4, Facebook: 0.5, Instagram: 0.5, Referral: 0.5 }[source] ?? 0;
    leads.push({ date: d, source, campaign, segment, status, _web: rnd() < web });
  }
}

// ---------- GA4 ----------
// Pages from the md-labs.net menu (Home, Services, Career, Blogs, Solutions); /contact-us only carries enquiries.
// Kept short on purpose: the page imports at most 5,000 rows per dataset (ROW_MAX in public/index.html).
const PAGES = {
  'Organic Search': [['/', 5], ['/services', 3], ['/career', 3]],
  'Organic Social': [['/', 4], ['/blogs', 3]],
  Direct: [['/', 1]],
  Referral: [['/', 3], ['/solutions', 1]],
  Email: [['/', 1]],
};
const ENQ_CH = { 'Organic search': 'Organic Search', 'Direct / website': 'Direct', LinkedIn: 'Organic Social', Facebook: 'Organic Social', Instagram: 'Organic Social', Referral: 'Referral' };
const enq = {}; // date|channel → count
for (const l of leads) if (l._web) { const k = `${l.date}|${ENQ_CH[l.source]}`; enq[k] = (enq[k] || 0) + 1; }

const ga4 = [], searchSessions = {};
for (const d of days) {
  const f = dayFactor(d), li = liByDay[d] || { clicks: 0 };
  const base = {
    'Organic Search': 26 * f * brandBoost(d),
    // LinkedIn "Clicks" counts every click (see more, profile…), so only a share reaches the site.
    'Organic Social': li.clicks * 0.28 + (metaLift[d] || 0) + 1.5 * f,
    Direct: 14 * f * brandBoost(d),
    Referral: 4 * f,
    Email: dow(d) === 2 ? 3 : 0.6 * f, // a Tuesday newsletter-style bump
  };
  for (const [channel, mean] of Object.entries(base)) {
    const total = Math.round(mean * noise());
    const e = enq[`${d}|${channel}`] || 0;
    if (!total && !e) continue;
    if (channel === 'Organic Search') searchSessions[d] = total;
    const cells = {}; // page|device → sessions
    for (let s = 0; s < total; s++) { const k = `${weighted(PAGES[channel])}|${rnd() < (channel === 'Organic Social' ? 0.62 : 0.42) ? 'mobile' : 'desktop'}`; cells[k] = (cells[k] || 0) + 1; }
    // Enquiries are the contact-form leads of that day and channel, counted on one contact-page row.
    let enqCell = Object.keys(cells).find((k) => k.startsWith('/contact-us|'));
    if (e && !enqCell) { enqCell = `/contact-us|${rnd() < 0.7 ? 'desktop' : 'mobile'}`; cells[enqCell] = e; }
    for (const [k, sessions] of Object.entries(cells)) {
      const [landing_page, device] = k.split('|');
      const mine = k === enqCell ? e : 0;
      const engaged = Math.min(sessions, Math.max(mine, Math.round(sessions * (device === 'desktop' ? 0.62 : 0.48) * noise(0.85, 1.15))));
      ga4.push({ date: d, channel, landing_page, device, sessions: Math.max(sessions, mine), engaged_sessions: engaged, enquiries: mine, campaign: channel === 'Referral' && between(d, EVENT.from, '2026-02-20') ? EVENT.campaign : '' });
    }
  }
}

// ---------- Search Console (weekly per query) ----------
// Clicks in a week ≈ GA4 Organic Search sessions of that week (minus a little: not every click lands a session).
const QUERIES = [ // [query, page, share of clicks, ctr, position, branded]
  ['md labs', '/', 0.16, 0.42, 1.3, true], ['md-labs', '/', 0.07, 0.45, 1.2, true], ['mdlabs', '/', 0.05, 0.38, 1.6, true],
  ['md labs careers', '/career', 0.07, 0.35, 1.8, true], ['md geeks internship', '/md-geeks', 0.08, 0.3, 2.4, true],
  ['software development company egypt', '/services', 0.07, 0.025, 14.5, false], ['mobile app development company cairo', '/services', 0.06, 0.03, 12.1, false],
  ['شركة برمجيات في مصر', '/', 0.05, 0.035, 9.8, false], ['تطوير تطبيقات الجوال', '/services', 0.04, 0.028, 13.4, false],
  ['mvp development egypt', '/services', 0.05, 0.06, 7.2, false], ['team as a service', '/services', 0.04, 0.012, 22.6, false],
  ['cto as a service', '/services', 0.03, 0.018, 17.9, false], ['sap s/4hana procurement integration', '/solutions', 0.02, 0.022, 15.3, false],
  ['iot fleet management platform', '/solutions', 0.02, 0.015, 19.8, false], ['software internship cairo', '/md-geeks', 0.06, 0.05, 6.4, false],
  ['agile software house egypt', '/about', 0.03, 0.04, 8.9, false], ['employee self service system', '/solutions', 0.02, 0.01, 24.1, false],
];
const gsc = [];
for (let i = 0; i < days.length; i += 7) {
  const wk = days.slice(i, i + 7), clicksWeek = wk.reduce((s, d) => s + (searchSessions[d] || 0), 0) * 0.92;
  const boost = wk.reduce((s, d) => s + brandBoost(d), 0) / wk.length; // branded queries take a bigger share after strong weeks
  const w = QUERIES.map((q) => q[2] * (q[5] ? boost : 1)), wSum = w.reduce((s, x) => s + x, 0);
  for (const [j, [query, page, , ctr, pos, branded]] of QUERIES.entries()) {
    const clicks = Math.round(clicksWeek * w[j] / wSum * noise(0.85, 1.15));
    const c = ctr * noise(0.8, 1.2), impressions = Math.max(clicks, Math.round(clicks / c + (branded ? 2 : 25) * rnd()));
    gsc.push({ date: wk[0], query, page, clicks, impressions, position: +(pos * noise(0.9, 1.1)).toFixed(1) });
  }
}

// ---------- write ----------
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
const sets = {
  ga4: [ga4, 'date,channel,landing_page,device,sessions,engaged_sessions,enquiries,campaign'],
  gsc: [gsc, 'date,query,page,clicks,impressions,position'],
  leads: [leads, 'date,source,campaign,segment,status'],
};
fs.mkdirSync(OUT, { recursive: true });
const sum = (rows, k) => rows.reduce((s, r) => s + (+r[k] || 0), 0);
for (const [name, [rows, cols]] of Object.entries(sets)) {
  const file = path.join(OUT, `MD-Labs-${name}-SYNTHETIC-example.csv`);
  fs.writeFileSync(file, toCSV(rows, cols.split(',')));
  console.log(`${path.relative(process.cwd(), file)}: ${rows.length} rows`);
}
console.log(`range ${FIRST} → ${LAST} (from the LinkedIn export) · GA4 sessions ${sum(ga4, 'sessions')}, enquiries ${sum(ga4, 'enquiries')} · GSC clicks ${sum(gsc, 'clicks')} · leads ${leads.length} (web-form ${leads.filter((l) => l._web).length})`);
