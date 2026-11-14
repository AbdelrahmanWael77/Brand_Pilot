// Writes example import files (CSV + JSON) for every dataset to sample-data/.
// Columns follow SCHEMAS in server/data.js. Seeded, so the output is the same on every run.
// Usage: node scripts/make-sample-data.js
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('sample-data');
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const weighted = (pairs) => { let x = rnd() * pairs.reduce((s, p) => s + p[1], 0); for (const p of pairs) if ((x -= p[1]) <= 0) return p[0]; return pairs[0][0]; };

const START = new Date('2026-08-17T00:00:00Z'); // 12 weeks ending 2026-11-08
const DAYS = 84;
const day = (i) => new Date(START.getTime() + i * 864e5).toISOString().slice(0, 10);
const CAMPAIGNS = ['', '', 'back-to-work', 'agency-trial'];

// Meta + LinkedIn posts (same template; platform column decides)
const THEMES = ['how-to tips', 'customer story', 'product update', 'behind the scenes', 'offer'];
const FORMATS = ['image', 'carousel', 'reel', 'video', 'text'];
function posts(platforms, everyNDays) {
  const rows = []; let n = 1;
  for (let i = 0; i < DAYS; i += everyNDays) for (const platform of platforms) {
    const fmt = platform === 'linkedin' ? pick(['image', 'text', 'carousel']) : pick(FORMATS);
    const theme = pick(THEMES);
    const base = { facebook: 2000, instagram: 3000, linkedin: 900 }[platform];
    const boost = (fmt === 'reel' ? 1.8 : fmt === 'carousel' ? 1.3 : 1) * (theme === 'customer story' ? 1.4 : 1);
    const reach = Math.round(base * boost * (0.6 + rnd()));
    const er = { facebook: 0.03, instagram: 0.05, linkedin: 0.04 }[platform] * (0.6 + rnd());
    const ctr = { facebook: 0.012, instagram: 0.004, linkedin: 0.015 }[platform] * (0.5 + rnd());
    const campaign = pick(CAMPAIGNS);
    rows.push({
      date: day(i + int(0, everyNDays - 1)), platform, post_id: `${platform.slice(0, 2)}-${n++}`, format: fmt, theme,
      language: rnd() < 0.6 ? 'ar' : 'en', reach, impressions: Math.round(reach * (1.15 + rnd() * 0.4)),
      engagements: Math.round(reach * er), link_clicks: Math.round(reach * ctr),
      spend: campaign ? int(300, 1500) : 0, campaign,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// GA4
const CHANNELS = [['Organic Search', 1, 0.035], ['Organic Social', 0.6, 0.015], ['Paid Social', 0.5, 0.02], ['Direct', 0.7, 0.03], ['Referral', 0.2, 0.05], ['Email', 0.15, 0.06]];
const PAGES = [['/', 0.035], ['/pricing', 0.06], ['/features', 0.03], ['/blog/remote-teams', 0.008], ['/signup', 0.12]];
function ga4() {
  const rows = [];
  for (let i = 0; i < DAYS; i++) for (const [channel, w, cr] of CHANNELS) for (const device of ['mobile', 'desktop']) {
    const [page, pcr] = pick(PAGES);
    const sessions = Math.max(1, Math.round(60 * w * (device === 'mobile' ? 1.4 : 0.8) * (0.7 + rnd() * 0.6) * (i % 7 >= 5 ? 0.6 : 1)));
    const enq = Math.round(sessions * (cr + pcr) / 2 * (device === 'mobile' ? 0.7 : 1.3) * (0.5 + rnd()));
    rows.push({ date: day(i), channel, landing_page: page, device, sessions, engaged_sessions: Math.round(sessions * (0.45 + rnd() * 0.3)), enquiries: enq, campaign: channel === 'Paid Social' ? pick(['back-to-work', 'agency-trial']) : '' });
  }
  return rows;
}

// Search Console (weekly rows per query)
const QUERIES = [['task management app egypt', '/'], ['برنامج إدارة المهام', '/'], ['best project management tool for agencies', '/features'], ['flownest pricing', '/pricing'], ['how to manage remote team', '/blog/remote-teams'], ['free kanban board', '/features'], ['team task tracker arabic', '/']];
function gsc() {
  const rows = [];
  for (let i = 0; i < DAYS; i += 7) for (const [query, page] of QUERIES) {
    const impressions = int(200, 3000), position = +(2 + rnd() * 18).toFixed(1);
    const ctr = Math.max(0.005, 0.3 / position) * (0.6 + rnd() * 0.8);
    rows.push({ date: day(i), query, page, clicks: Math.round(impressions * ctr), impressions, position });
  }
  return rows;
}

// Leads
const SOURCES = [['Facebook', 4, 0.3], ['Instagram', 3, 0.15], ['Google', 3, 0.5], ['LinkedIn', 1, 0.55], ['Referral', 1, 0.6], ['WhatsApp', 2, 0.35]];
const SEGMENTS = ['Agencies', 'Software houses', 'Retail', 'Education'];
function leads() {
  const rows = [];
  for (let i = 0; i < DAYS; i++) for (let k = int(1, 5); k > 0; k--) {
    const src = weighted(SOURCES.map((s) => [s, s[1]])), q = src[2];
    const x = rnd();
    const status = x < q * 0.35 ? 'customer' : x < q ? 'qualified' : x < q + 0.25 ? 'contacted' : rnd() < 0.5 ? 'new' : 'lost';
    rows.push({ date: day(i), source: src[0], campaign: src[0] === 'Facebook' || src[0] === 'Instagram' ? pick(CAMPAIGNS) : '', segment: pick(SEGMENTS), status });
  }
  return rows;
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

const sets = {
  meta: [posts(['facebook', 'instagram'], 2), 'date,platform,post_id,format,theme,language,reach,impressions,engagements,link_clicks,spend,campaign'],
  linkedin: [posts(['linkedin'], 3), 'date,platform,post_id,format,theme,language,reach,impressions,engagements,link_clicks,spend,campaign'],
  ga4: [ga4(), 'date,channel,landing_page,device,sessions,engaged_sessions,enquiries,campaign'],
  gsc: [gsc(), 'date,query,page,clicks,impressions,position'],
  leads: [leads(), 'date,source,campaign,segment,status'],
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, [rows, cols]] of Object.entries(sets)) {
  fs.writeFileSync(path.join(OUT, `${name}.csv`), toCSV(rows, cols.split(',')));
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(rows, null, 2) + '\n');
  console.log(`${name}: ${rows.length} rows`);
}
