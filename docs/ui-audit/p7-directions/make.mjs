// P7 checkpoint 0, round 2: three brand directions (static mockups, not the app). Real FlowNest content only:
// last 28 days (21 Sep – 18 Oct 2026); daily series in series.json come from the demo's data rows.
// node docs/ui-audit/p7-directions/make.mjs → <dir>-{palette,home-en,home-ar,next-en,next-ar}.html + contrast.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(fs.readFileSync(path.join(here, 'series.json'), 'utf8'));
const ff = (fam, file, w) => `@font-face{font-family:"${fam}";font-weight:${w};font-display:block;src:url(fonts/${file}-${w}-normal.woff2)}`;
const FONTS = [
  ...[400, 500, 600, 700].map((w) => ff('Geist', 'geist-sans-latin', w)), ...[400, 500, 600].map((w) => ff('Geist Mono', 'geist-mono-latin', w)),
  ...[400, 500, 600, 700].map((w) => ff('Readex Pro', 'readex-pro-arabic', w)), ...[400, 600].map((w) => ff('Readex Pro', 'readex-pro-latin', w)),
  ...[400, 500, 600, 700].map((w) => ff('Inter', 'inter-latin', w)), ...[400, 500, 600, 700].map((w) => ff('Noto Kufi Arabic', 'noto-kufi-arabic-arabic', w)),
  ...[500, 600, 700].map((w) => ff('Fraunces', 'fraunces-latin', w)), ...[400, 500, 600, 700].map((w) => ff('Manrope', 'manrope-latin', w)),
  ...[500, 600, 700].map((w) => ff('Noto Naskh Arabic', 'noto-naskh-arabic-arabic', w)), ...[400, 500, 700].map((w) => ff('Tajawal', 'tajawal-arabic', w)),
].join('');

// ---- content (real FlowNest numbers) ----
const C = {
  en: {
    dir: 'ltr', nav: ['Home', 'Next steps', 'Campaigns', 'Reports', 'Company'], foot: ['Data', 'Settings'], other: 'العربية',
    demo: 'Demo data · FlowNest is a sample company', guide: 'Guide', period: 'Last 28 days', co: 'FlowNest', me: 'FlowNest team',
    home: 'Home', hi: 'Good morning', status: ['Visits are steady, but few visitors get in touch. ', 'Biggest problem: social media visits rarely become enquiries.'],
    checked: 'Numbers checked', eyebrow: 'Your next step', next: 'Send social media visitors to one focused landing page',
    why: '37% of your visits come from social media, but only 0.39% of them enquire (1.36% across the site).', cta: 'Create this campaign', seeWhy: 'See why',
    stats: [['Visits', '4,774', '+1%'], ['Enquiries', '65', '+3%'], ['Qualified leads', '16', '+14%']], vs: 'vs the previous 28 days', all: 'All numbers',
    ask: 'Ask anything about your marketing…', askBtn: 'Ask', chips: ['What should we do first?', 'Why are enquiries low?', 'Which channel works best?'],
    ns: 'Next steps', nsLine: 'Five things to do, most important first.', filters: [['All', 5], ['Problems', 4], ['Risks', 1]],
    conf: { high: 'High confidence', med: 'Medium confidence' },
    items: [
      ['Social media brings many visits but few enquiries', '37% of visits · 0.39% enquire, against 1.36% across the site', 'med', 'Create campaign', 'weak'],
      ['Your materials state two different trial lengths', 'Website: 14 days · 2024 brochure: 7 days', 'high', 'Fix in Company', 'risk'],
      ['Mobile visitors enquire far less than desktop visitors', '62% of visits are mobile · 0.81% enquire, against 2.27% on desktop', 'med', 'Add to my tasks', 'weak'],
      ['The /pricing page under-converts', '1,676 visits · 0.42% enquire, against 1.36% across the site', 'med', 'Add to my tasks', 'weak'],
      ['The source of many leads is not recorded', '27% of 48 leads have no source', 'high', 'Add to my tasks', 'weak'],
    ],
  },
  ar: {
    dir: 'rtl', nav: ['الرئيسية', 'الخطوات التالية', 'الحملات', 'التقارير', 'الشركة'], foot: ['البيانات', 'الإعدادات'], other: 'English',
    demo: 'بيانات تجريبية · FlowNest شركة نموذجية', guide: 'الدليل', period: 'آخر 28 يوماً', co: 'FlowNest', me: 'فريق FlowNest',
    home: 'الرئيسية', hi: 'صباح الخير', status: ['الزيارات مستقرة، لكن قلة من الزوار يتواصلون معك. ', 'أكبر مشكلة: زيارات التواصل الاجتماعي نادراً ما تتحول إلى استفسارات.'],
    checked: 'الأرقام مُتحقَّق منها', eyebrow: 'خطوتك التالية', next: 'وجّه زوار التواصل الاجتماعي إلى صفحة هبوط واحدة مركّزة',
    why: '37% من زياراتك تأتي من التواصل الاجتماعي، لكن 0.39% منها فقط تستفسر (1.36% على مستوى الموقع).', cta: 'أنشئ هذه الحملة', seeWhy: 'لماذا؟',
    stats: [['الزيارات', '4,774', '+1%'], ['الاستفسارات', '65', '+3%'], ['العملاء المؤهلون', '16', '+14%']], vs: 'مقارنة بالـ 28 يوماً السابقة', all: 'كل الأرقام',
    ask: 'اسأل أي شيء عن تسويقك…', askBtn: 'اسأل', chips: ['ما الذي نفعله أولاً؟', 'لماذا الاستفسارات قليلة؟', 'أي قناة تعمل أفضل؟'],
    ns: 'الخطوات التالية', nsLine: 'خمسة أشياء لتفعلها، الأهم أولاً.', filters: [['الكل', 5], ['مشكلات', 4], ['مخاطر', 1]],
    conf: { high: 'ثقة عالية', med: 'ثقة متوسطة' },
    items: [
      ['التواصل الاجتماعي يجلب زيارات كثيرة واستفسارات قليلة', '37% من الزيارات · 0.39% تستفسر، مقابل 1.36% على مستوى الموقع', 'med', 'أنشئ حملة', 'weak'],
      ['موادك تذكر مدتين مختلفتين للتجربة المجانية', 'الموقع: 14 يوماً · كتيّب 2024: 7 أيام', 'high', 'أصلح في الشركة', 'risk'],
      ['زوار الجوال يستفسرون أقل بكثير من زوار سطح المكتب', '62% من الزيارات من الجوال · 0.81% تستفسر، مقابل 2.27% على سطح المكتب', 'med', 'أضف إلى مهامي', 'weak'],
      ['صفحة /pricing أقل تحويلاً من المتوسط', '1,676 زيارة · 0.42% تستفسر، مقابل 1.36% على مستوى الموقع', 'med', 'أضف إلى مهامي', 'weak'],
      ['مصدر كثير من العملاء المحتملين غير مسجَّل', '27% من 48 عميلاً محتملاً بلا مصدر', 'high', 'أضف إلى مهامي', 'weak'],
    ],
  },
};

// ---- one icon set (Lucide-style, 1.75 stroke) ----
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', next: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  camp: 'M3 11l18-8v18l-18-8zM7 13v5a2 2 0 0 0 4 0v-3', rep: 'M4 4h16v16H4zM8 15v-3M12 15V8M16 15v-5', co: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20',
  data: 'M4 5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  set: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15l1.2 2-2 3.4-2.3-.5a8 8 0 0 1-1.7 1L14.2 23h-4l-.4-2.1a8 8 0 0 1-1.7-1l-2.3.5-2-3.4 1.2-2a8 8 0 0 1 0-2l-1.2-2 2-3.4 2.3.5a8 8 0 0 1 1.7-1L9.8 1h4l.4 2.1a8 8 0 0 1 1.7 1l2.3-.5 2 3.4-1.2 2a8 8 0 0 1 0 2z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18', check: 'M20 6 9 17l-5-5', arrow: 'M5 12h14M13 6l6 6-6 6',
  spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z', help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01', chev: 'M6 9l6 6 6-6',
  up: 'M7 17 17 7M8 7h9v9', alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
};
const ic = (n, s = 18, sw = 1.75) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]}"/></svg>`;
const arrow = (c, s = 16) => `<span class="arr"${c.dir === 'rtl' ? ' style="display:inline-flex;transform:scaleX(-1)"' : ''}>${ic('arrow', s)}</span>`;
const ltr = (x) => `<bdi dir="ltr">${x}</bdi>`;
function spark(arr, w = 120, h = 32, cls = 'sp') {
  const max = Math.max(...arr), min = Math.min(...arr), n = arr.length;
  const pts = arr.map((v, i) => [(i / (n - 1)) * w, h - 2 - ((v - min) / (max - min || 1)) * (h - 4)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return `<svg class="${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="area" d="${d} L${w} ${h} L0 ${h} Z"/><path class="line" d="${d}"/></svg>`;
}
const SER = [S.sessions, S.enquiries, S.qualCum];

// ---- the three directions ----
const D = {
  violet: {
    name: 'Midnight Violet', mood: { en: 'Confident and sharp', ar: 'واثق وحاد' },
    font: { en: '"Geist","Readex Pro",system-ui,sans-serif', ar: '"Readex Pro","Geist",system-ui,sans-serif', num: '"Geist","Readex Pro",sans-serif' },
    typeNote: 'Geist for English (headings 600, tight tracking), Readex Pro for Arabic (same geometric feel). Numbers: Geist 600 with tabular figures.',
    palette: [['Brand · Violet', '#6A4BFF', 'Primary actions, active nav, focus'], ['Accent · Mint', '#22C9A0', 'Good news, positive change'], ['Ink · Sidebar', '#16132B', 'Sidebar, headings'],
      ['Canvas', '#F6F5FB', 'Page background'], ['Surface', '#FFFFFF', 'Cards'], ['Line', '#E7E5F0', 'Borders, dividers'], ['Text', '#16132B', 'Body text'], ['Text 2', '#56526E', 'Secondary text'], ['Text 3', '#6E6A86', 'Hints, labels'],
      ['Good', '#0B7349', 'Status: good'], ['Attention', '#B45309', 'Status: needs attention'], ['Problem', '#C4342D', 'Status: real problem']],
    pairs: [['#16132B', '#FFFFFF'], ['#56526E', '#FFFFFF'], ['#6E6A86', '#F6F5FB'], ['#FFFFFF', '#6A4BFF'], ['#C9C3F2', '#16132B'], ['#0B7349', '#E8F7F1'], ['#B45309', '#FFF6E6'], ['#5B3BF0', '#EEEAFF']],
    css: `--bg:#F6F5FB;--surface:#fff;--line:#E7E5F0;--ink:#16132B;--ink2:#56526E;--ink3:#6E6A86;--brand:#6A4BFF;--brand-ink:#5B3BF0;--brand-soft:#EEEAFF;--mint:#22C9A0;--good:#0B7349;--good-bg:#E8F7F1;--warn:#B45309;--warn-bg:#FFF6E6;--bad:#C4342D;--side:#16132B;--side-ink:#C9C3F2;--side-on:#fff;
      body{background:var(--bg)}
      .side{background:var(--side);color:var(--side-ink);border:0}.side .logo b{color:#fff}.side .mark{background:linear-gradient(135deg,#8A6BFF,#5B3BF0);box-shadow:0 6px 18px rgba(106,75,255,.45)}
      .side nav a{color:var(--side-ink)}.side nav a:hover{background:rgba(255,255,255,.06);color:#fff}.side nav a.on{background:rgba(106,75,255,.22);color:#fff;box-shadow:inset 3px 0 0 var(--brand)}[dir=rtl] .side nav a.on{box-shadow:inset -3px 0 0 var(--brand)}
      .side .co{background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.08)}.side .foot{border-top:1px solid rgba(255,255,255,.08)}.side .av{background:#2B2650;color:#fff}
      .card{background:var(--surface);border-radius:16px;box-shadow:0 1px 2px rgba(22,19,43,.04),0 8px 24px -12px rgba(22,19,43,.12);border:1px solid #EEECF5}
      .next{position:relative;overflow:hidden}.next::before{content:"";position:absolute;inset-block:0;inset-inline-start:0;width:4px;background:linear-gradient(var(--brand),var(--mint))}
      .eyebrow{color:var(--brand-ink)}.btn{background:var(--brand);color:#fff;box-shadow:0 6px 16px -6px rgba(106,75,255,.6)}.btn:hover{background:#5B3BF0}
      .stat b{font-family:var(--num)}.delta{color:var(--good);background:var(--good-bg)}.sp .line{stroke:var(--brand)}.sp .area{fill:url(#none);fill:rgba(106,75,255,.08)}
      .askbox{border:1px solid #E1DEF0;box-shadow:0 10px 30px -14px rgba(22,19,43,.18)}.askbox .ic{color:var(--brand)}.chip:hover{border-color:var(--brand);color:var(--brand-ink)}
      .checked{color:var(--good)}.demo{background:#16132B;color:#C9C3F2}.demo .dot{background:var(--mint)}
      .tag.high{color:var(--good);background:var(--good-bg)}.tag.med{color:var(--warn);background:var(--warn-bg)}.rank{background:var(--brand-soft);color:var(--brand-ink)}.item.risk .rank{background:#FFF1F0;color:var(--bad)}
      .seg a.on{background:var(--ink);color:#fff}.btn2{border:1px solid var(--line);background:#fff;color:var(--ink)}.btn2:hover{border-color:var(--brand);color:var(--brand-ink)}`,
  },
  night: {
    name: 'Night Signal', mood: { en: 'Smart and techy', ar: 'ذكي وتقني' },
    font: { en: '"Inter","Noto Kufi Arabic",system-ui,sans-serif', ar: '"Noto Kufi Arabic","Inter",system-ui,sans-serif', num: '"Inter","Noto Kufi Arabic",sans-serif' },
    typeNote: 'Inter for English (headings 600), Noto Kufi Arabic for Arabic (clean, technical). Numbers: Inter with tabular figures and a soft glow; Geist Mono only for small technical labels.',
    palette: [['Brand · Signal blue', '#4F8CFF', 'Primary actions, focus, glow'], ['Accent · Cyan', '#22D3EE', 'Highlights, live data'], ['Canvas', '#0A0C11', 'Page background'],
      ['Surface', '#11141B', 'Cards'], ['Raised', '#171B24', 'Inputs, hover'], ['Line', '#242A37', 'Borders'], ['Text', '#ECEEF3', 'Body text'], ['Text 2', '#A7AEBE', 'Secondary text'], ['Text 3', '#8790A3', 'Hints, labels'],
      ['Good', '#34D399', 'Status: good'], ['Attention', '#FBBF24', 'Status: needs attention'], ['Problem', '#F87171', 'Status: real problem']],
    pairs: [['#ECEEF3', '#11141B'], ['#A7AEBE', '#11141B'], ['#8790A3', '#0A0C11'], ['#0A0C11', '#4F8CFF'], ['#34D399', '#11141B'], ['#FBBF24', '#11141B'], ['#F87171', '#11141B'], ['#22D3EE', '#11141B']],
    css: `--bg:#0A0C11;--surface:#11141B;--raised:#171B24;--line:#242A37;--ink:#ECEEF3;--ink2:#A7AEBE;--ink3:#8790A3;--brand:#4F8CFF;--cyan:#22D3EE;--good:#34D399;--warn:#FBBF24;--bad:#F87171;
      body{background:radial-gradient(1200px 600px at 70% -10%,rgba(79,140,255,.12),transparent 60%),var(--bg);color:var(--ink)}
      .side{background:rgba(10,12,17,.6);border-inline-end:1px solid var(--line)}.side .mark{background:#0A0C11;border:1px solid rgba(79,140,255,.6);color:var(--brand);box-shadow:0 0 18px rgba(79,140,255,.45)}
      .side nav a{color:var(--ink2)}.side nav a:hover{background:var(--raised);color:var(--ink)}.side nav a.on{background:var(--raised);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}.side nav a.on .ic{color:var(--brand)}
      .side .co{background:var(--raised);color:var(--ink);border:1px solid var(--line)}.side .foot{border-top:1px solid var(--line)}.side .av{background:var(--raised);color:var(--ink)}
      .card{background:linear-gradient(180deg,rgba(255,255,255,.025),transparent),var(--surface);border:1px solid var(--line);border-radius:14px}
      .next{border-color:rgba(79,140,255,.45);box-shadow:0 0 0 1px rgba(79,140,255,.15),0 20px 60px -20px rgba(79,140,255,.35)}
      .eyebrow{color:var(--cyan)}.btn{background:var(--brand);color:#0A0C11;box-shadow:0 0 0 1px rgba(79,140,255,.6),0 8px 30px -6px rgba(79,140,255,.7)}.btn:hover{background:#6B9DFF}
      .stat b{font-family:var(--num);font-weight:600;letter-spacing:-.03em;text-shadow:0 0 24px rgba(79,140,255,.35)}.delta{color:var(--good);background:rgba(52,211,153,.12)}.sp .line{stroke:var(--cyan)}.sp .area{fill:rgba(34,211,238,.08)}
      .askbox{background:var(--raised);border:1px solid var(--line)}.askbox:focus-within,.askbox:hover{border-color:rgba(79,140,255,.6);box-shadow:0 0 0 4px rgba(79,140,255,.12)}.askbox .ic{color:var(--cyan)}.chip{background:transparent;border:1px solid var(--line);color:var(--ink2)}.chip:hover{border-color:var(--brand);color:var(--ink)}
      .checked{color:var(--good)}.demo{background:#0E1320;color:#A7AEBE;border-bottom:1px solid var(--line)}.demo .dot{background:var(--warn);box-shadow:0 0 8px var(--warn)}
      .tag.high{color:var(--good);background:rgba(52,211,153,.12)}.tag.med{color:var(--warn);background:rgba(251,191,36,.12)}.rank{background:rgba(79,140,255,.14);color:#8FB4FF;font-family:var(--num)}.item.risk .rank{background:rgba(248,113,113,.14);color:var(--bad)}
      .seg{background:var(--raised);border:1px solid var(--line)}.seg a.on{background:#232937;color:var(--ink)}.btn2{border:1px solid var(--line);background:var(--raised);color:var(--ink)}.btn2:hover{border-color:var(--brand)}
      .top .sel,.guide{background:var(--raised);color:var(--ink);border-color:var(--line)}.item:hover{border-color:#33405A}`,
  },
  sun: {
    name: 'Sunroom', mood: { en: 'Warm and human', ar: 'دافئ وإنساني' },
    font: { en: '"Manrope","Tajawal",system-ui,sans-serif', ar: '"Tajawal","Manrope",system-ui,sans-serif', head: { en: '"Fraunces",Georgia,serif', ar: '"Noto Naskh Arabic","Tajawal",serif' }, num: '"Fraunces",Georgia,serif' },
    typeNote: 'Fraunces (soft serif) for English headings and numbers, Manrope for text; Noto Naskh Arabic for Arabic headings, Tajawal for Arabic text.',
    palette: [['Brand · Terracotta', '#C2410C', 'Primary actions, highlights'], ['Accent · Plum', '#6D28D9', 'Links, the AI'], ['Ink', '#2A1F17', 'Headings'],
      ['Canvas · Cream', '#FBF6EF', 'Page background'], ['Surface', '#FFFFFF', 'Cards'], ['Line', '#EFE4D6', 'Borders'], ['Text', '#2A1F17', 'Body text'], ['Text 2', '#5E5045', 'Secondary text'], ['Text 3', '#776759', 'Hints, labels'],
      ['Good', '#15803D', 'Status: good'], ['Attention', '#B45309', 'Status: needs attention'], ['Problem', '#B91C1C', 'Status: real problem']],
    pairs: [['#2A1F17', '#FFFFFF'], ['#5E5045', '#FFFFFF'], ['#776759', '#FBF6EF'], ['#FFFFFF', '#C2410C'], ['#9A3412', '#FFEDE2'], ['#15803D', '#EAF6EE'], ['#B45309', '#FFF4E2'], ['#6D28D9', '#FFFFFF']],
    css: `--bg:#FBF6EF;--surface:#fff;--line:#EFE4D6;--ink:#2A1F17;--ink2:#5E5045;--ink3:#776759;--brand:#C2410C;--brand-soft:#FFEDE2;--plum:#6D28D9;--good:#15803D;--good-bg:#EAF6EE;--warn:#B45309;--warn-bg:#FFF4E2;--bad:#B91C1C;
      body{background:radial-gradient(900px 500px at 100% 0,#FFE9D9 0,transparent 60%),radial-gradient(700px 400px at 0 100%,#F3E8FF 0,transparent 60%),var(--bg)}
      .side{background:rgba(255,255,255,.55);backdrop-filter:blur(8px);border-inline-end:1px solid var(--line)}.side .mark{background:radial-gradient(circle at 30% 30%,#F59E0B,#C2410C);border-radius:50%}
      .side nav a{color:var(--ink2)}.side nav a:hover{background:#fff}.side nav a.on{background:#fff;color:var(--ink);box-shadow:0 2px 8px rgba(120,72,30,.08)}.side nav a.on .ic{color:var(--brand)}
      .side .co{background:#fff;border:1px solid var(--line)}.side .foot{border-top:1px solid var(--line)}.side .av{background:var(--brand-soft);color:#9A3412}
      h1,.hi,h2,.ns-t{font-family:var(--head)}.hi{font-weight:600;letter-spacing:-.01em}
      .card{background:var(--surface);border-radius:20px;box-shadow:0 1px 0 rgba(120,72,30,.04),0 12px 32px -18px rgba(120,72,30,.25);border:1px solid #F3EADF}
      .next{background:linear-gradient(135deg,#FFF3EA 0%,#FFE6D4 55%,#FCE7F3 100%);border:0;position:relative;overflow:hidden}.next .illo{position:absolute;inset-inline-end:18px;inset-block-start:14px;opacity:.85;width:86px;height:68px}.next h2,.next p{max-width:470px}[dir=rtl] .next .illo{transform:scaleX(-1)}
      .eyebrow{color:#9A3412}.btn{background:var(--brand);color:#fff;border-radius:999px;box-shadow:0 8px 20px -10px rgba(194,65,12,.7)}.btn:hover{background:#9A3412}
      .stat b{font-family:var(--num);font-weight:600}.delta{color:var(--good);background:var(--good-bg)}.sp .line{stroke:#EA7A3A}.sp .area{fill:rgba(234,122,58,.10)}
      .askbox{border-radius:999px;border:1px solid var(--line);box-shadow:0 14px 34px -18px rgba(120,72,30,.35)}.askbox .ic{color:var(--plum)}.askbox .btn{border-radius:999px}.chip{background:rgba(255,255,255,.7);border:1px solid var(--line);border-radius:999px}.chip:hover{border-color:var(--plum);color:var(--plum)}
      .checked{color:var(--good)}.demo{background:#2A1F17;color:#F5E6D3}.demo .dot{background:#F59E0B}
      .tag.high{color:var(--good);background:var(--good-bg)}.tag.med{color:var(--warn);background:var(--warn-bg)}.rank{background:var(--brand-soft);color:#9A3412;font-family:var(--num)}.item.risk .rank{background:#FDECEC;color:var(--bad)}
      .seg{background:#fff;border:1px solid var(--line);border-radius:999px}.seg a{border-radius:999px}.seg a.on{background:var(--ink);color:#fff}.btn2{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px}.btn2:hover{border-color:var(--brand);color:#9A3412}
      .top .sel{border-radius:999px}.guide{border-radius:999px}`,
  },
};

// ---- shared structure (same layout in all three: one main thing per screen) ----
const BASE = `*{box-sizing:border-box}html,body{margin:0}body{color:var(--ink);font:15px/1.55 var(--font);-webkit-font-smoothing:antialiased}
.demo{height:30px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12.5px;font-weight:500}.demo .dot{width:6px;height:6px;border-radius:50%}
.app{display:grid;grid-template-columns:248px minmax(0,1fr);height:calc(100vh - 30px)}
.side{padding:18px 14px;display:flex;flex-direction:column;gap:6px}.logo{display:flex;align-items:center;gap:10px;padding:2px 8px 16px;font-size:16px}.mark{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:14px}
.co{display:flex;justify-content:space-between;align-items:center;border-radius:10px;padding:9px 12px;font:600 14px var(--font);margin-bottom:10px;cursor:pointer}
nav{display:flex;flex-direction:column;gap:2px}nav a{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:9px;font-size:14px;font-weight:500;cursor:pointer;transition:background .15s,color .15s}
.foot{margin-top:auto;padding-top:10px}.me{display:flex;align-items:center;gap:10px;padding:8px 10px;font-size:13px}.av{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700}
main{overflow:auto;padding:28px 44px 32px}.wrap{max-width:1140px;margin:0 auto}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}.crumb{font-size:13px;font-weight:600;color:var(--ink3);letter-spacing:.02em}.tools{display:flex;gap:10px;align-items:center}
.sel{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:7px 12px;font-size:13px;font-weight:600;color:var(--ink)}
.hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:24px;align-items:stretch}
.hi{font-size:40px;line-height:1.1;font-weight:650;letter-spacing:-.025em;margin:0 0 12px}.status{font-size:19px;line-height:1.5;color:var(--ink2);margin:0 0 14px;max-width:660px}.status b{color:var(--ink);font-weight:650}
.checked{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;cursor:pointer}
.card{padding:26px}.next{margin-top:22px}.eyebrow{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px}[dir=rtl] .eyebrow{letter-spacing:0;font-size:13px}
.next h2{font-size:22px;line-height:1.3;margin:0 0 8px;font-weight:650;letter-spacing:-.01em;max-width:560px}.next p{margin:0 0 22px;color:var(--ink2);max-width:560px}
.row{display:flex;align-items:center;gap:18px}.btn{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:10px;border:0;font:600 14.5px var(--font);cursor:pointer;transition:transform .12s,background .15s}.btn:hover{transform:translateY(-1px)}
.link{font-weight:600;font-size:14px;color:var(--ink2);text-decoration:underline;text-underline-offset:4px;text-decoration-color:var(--line)}
.nums{display:flex;flex-direction:column;gap:0}.nums h3{margin:0 0 6px;font-size:13px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em}[dir=rtl] .nums h3{letter-spacing:0;font-size:14px}
.stat{display:grid;grid-template-columns:1fr auto;align-items:end;gap:8px;padding:14px 0;border-bottom:1px solid var(--line)}.stat:last-of-type{border-bottom:0}
.stat .l{font-size:13px;color:var(--ink3);font-weight:500;grid-column:1/-1;margin-bottom:-4px}.stat b{font-size:34px;line-height:1.1;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.delta{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;margin-inline-start:10px;vertical-align:middle;letter-spacing:0}.sp .line{fill:none;stroke-width:1.8}
.foot2{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:var(--ink3);padding-top:10px}
.ask{margin-top:24px}.askbox{display:flex;align-items:center;gap:14px;background:var(--surface);border-radius:16px;padding:8px;padding-inline-start:22px;transition:box-shadow .15s,border-color .15s}
.askbox span{flex:1;font-size:16.5px;color:var(--ink3)}.chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.chip{font-size:13.5px;font-weight:500;color:var(--ink2);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:7px 13px;cursor:pointer;transition:border-color .15s,color .15s}
.guide{position:fixed;inset-block-end:22px;inset-inline-end:22px;display:flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:12px;padding:9px 14px;font:600 13px var(--font);box-shadow:0 8px 24px -10px rgba(0,0,0,.25)}
/* Next steps */
.pt{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:22px}.ns-t{font-size:34px;line-height:1.15;margin:0 0 6px;font-weight:650;letter-spacing:-.02em}.ns-l{margin:0;color:var(--ink2);font-size:16px}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:var(--surface);border:1px solid var(--line)}.seg a{padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;color:var(--ink2)}.seg a span{opacity:.7;margin-inline-start:6px}
.list{display:flex;flex-direction:column;gap:10px}.item{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:18px;align-items:center;padding:18px 22px;transition:border-color .15s,transform .12s}.item:hover{transform:translateY(-1px)}
.rank{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-weight:700;font-size:15px}
.it{font-size:16.5px;font-weight:650;margin:0 0 4px;letter-spacing:-.005em}.ev{margin:0;font-size:14px;color:var(--ink2)}.meta{display:flex;align-items:center;gap:12px}
.tag{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap}.btn2{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:10px;font:600 13.5px var(--font);cursor:pointer;white-space:nowrap;transition:border-color .15s,color .15s}
.first{padding:22px}.first .it{font-size:18px}
/* palette sheet */
.pal{padding:40px 56px;max-width:1440px}.pal h1{font-size:44px;margin:0 0 6px;letter-spacing:-.02em}.pal .mood{font-size:20px;color:var(--ink2);margin:0 0 30px}
.sw{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}.s{border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--surface)}.s i{display:block;height:86px}.s div{padding:10px 12px;font-size:12.5px}.s b{display:block;font-size:13px}.s code{font-family:"Geist Mono",monospace;font-size:12px;color:var(--ink2)}
.ty{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:30px}.ty .card{padding:24px}.ty .k{font-size:12px;color:var(--ink3);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
.aa{margin-top:24px;font-size:13px;color:var(--ink2)}.aa span{display:inline-block;margin:4px 10px 4px 0;padding:4px 10px;border-radius:8px;border:1px solid var(--line);background:var(--surface)}`;

function page(d, lang, body, title) {
  const c = C[lang];
  const head = d.font.head ? `--head:${d.font.head[lang]};` : `--head:${d.font[lang]};`;
  const navI = ['home', 'next', 'camp', 'rep', 'co'];
  const active = title === 'home' ? 0 : title === 'next' ? 1 : -1;
  const shell = title === 'palette' ? body : `<div class="demo" role="note"><span class="dot"></span>${c.demo}</div><div class="app"><aside class="side"><div class="logo"><span class="mark">B</span><b>BrandPilot</b></div>
<button class="co">${c.co}${ic('chev', 16)}</button><nav>${c.nav.map((n, i) => `<a class="${i === active ? 'on' : ''}">${ic(navI[i])}<span>${n}</span></a>`).join('')}</nav>
<nav class="foot">${c.foot.map((n, i) => `<a>${ic(i ? 'set' : 'data')}<span>${n}</span></a>`).join('')}<a>${ic('globe')}<span>${c.other}</span></a><div class="me"><span class="av">F</span>${c.me}</div></nav></aside>
<main><div class="wrap">${body}</div></main></div><button class="guide">${ic('help', 16)}${c.guide}</button>`;
  return `<!doctype html><html lang="${lang}" dir="${c.dir}"><head><meta charset="utf-8"><title>${d.name} — ${title}</title><style>${FONTS}:root{--font:${d.font[lang]};--num:${d.font.num};${head}${d.css.split('\n')[0]}}${BASE}${d.css.split('\n').slice(1).join('\n')}</style></head><body>${shell}</body></html>`;
}

const illo = `<svg class="illo" width="112" height="88" viewBox="0 0 112 88" aria-hidden="true"><circle cx="78" cy="30" r="22" fill="#FDBA74" opacity=".55"/><circle cx="78" cy="30" r="12" fill="#F97316" opacity=".55"/><path d="M8 74c18-22 34-26 50-14s30 10 46-8" fill="none" stroke="#C2410C" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 7"/><path d="M96 46l8 6-9 4" fill="none" stroke="#C2410C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function home(d, lang) {
  const c = C[lang];
  return `<div class="top"><span class="crumb">${c.home}</span><div class="tools"><span class="sel">${c.period}${ic('chev', 14)}</span></div></div>
<div class="hero"><section><h1 class="hi">${c.hi}</h1><p class="status">${c.status[0]}<b>${c.status[1]}</b></p><span class="checked">${ic('check', 14, 2.2)}${c.checked}</span>
<div class="card next">${d === D.sun ? illo : ''}<p class="eyebrow">${c.eyebrow}</p><h2>${c.next}</h2><p>${c.why.replace(/(\d[\d.,]*%)/g, (m) => ltr(m))}</p><div class="row"><button class="btn">${c.cta}${arrow(c)}</button><a class="link">${c.seeWhy}</a></div></div></section>
<aside class="card nums"><h3>${c.period}</h3>${c.stats.map(([l, v, dd], i) => `<div class="stat"><span class="l">${l}</span><b>${ltr(v)}<span class="delta">${ltr(dd)}</span></b>${spark(SER[i])}</div>`).join('')}<div class="foot2"><span>${c.vs}</span><a class="link">${c.all}</a></div></aside></div>
<section class="ask"><div class="askbox">${ic('spark', 20)}<span>${c.ask}</span><button class="btn">${c.askBtn}</button></div><div class="chips">${c.chips.map((x) => `<a class="chip">${x}</a>`).join('')}</div></section>`;
}
function next(d, lang) {
  const c = C[lang];
  return `<div class="top"><span class="crumb">${c.ns}</span><div class="tools"><span class="sel">${c.period}${ic('chev', 14)}</span></div></div>
<div class="pt"><div><h1 class="ns-t">${c.ns}</h1><p class="ns-l">${c.nsLine}</p></div><div class="seg">${c.filters.map(([n, k], i) => `<a class="${i ? '' : 'on'}">${n}<span>${ltr(k)}</span></a>`).join('')}</div></div>
<div class="list">${c.items.map(([t, ev, cf, act, kind], i) => `<div class="card item ${kind}${i ? '' : ' first'}"><span class="rank">${i + 1}</span><div><p class="it">${t.replace('/pricing', ltr('/pricing'))}</p><p class="ev">${ev.replace(/(\d[\d.,]*%?)/g, (m) => ltr(m))}</p></div><div class="meta"><span class="tag ${cf}">${c.conf[cf]}</span>${i ? `<button class="btn2">${act}</button>` : `<button class="btn">${act}${arrow(c)}</button>`}</div></div>`).join('')}</div>`;
}

// contrast (WCAG 2.1)
const lum = (hex) => { const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const contrast = {};
function palette(d) {
  contrast[d.name] = d.pairs.map(([f, b]) => ({ fg: f, bg: b, ratio: +ratio(f, b).toFixed(2), aa: ratio(f, b) >= 4.5 }));
  const sample = (lang) => `<div class="card"><div class="k">${lang === 'en' ? 'English' : 'العربية'}</div><div style="font-family:var(--head);font-size:34px;font-weight:650;letter-spacing:-.02em;line-height:1.15">${C[lang].hi}</div><p style="font-size:18px;color:var(--ink2);margin:8px 0 14px">${C[lang].status[0]}</p><div style="font-family:var(--num);font-size:44px;font-weight:650;letter-spacing:-.02em">${ltr('4,774')} <span style="font-size:16px;color:var(--ink3);font-family:var(--font)">${C[lang].stats[0][0]}</span></div><p style="color:var(--ink3);font-size:13px;margin:10px 0 0">${lang === 'en' ? d.typeNote : ''}</p></div>`;
  return `<div class="pal"><h1 style="font-family:var(--head)">${d.name}</h1><p class="mood">${d.mood.en} · ${d.mood.ar}</p>
<div class="sw">${d.palette.map(([n, h, u]) => `<div class="s"><i style="background:${h}"></i><div><b>${n}</b><code>${h}</code><br>${u}</div></div>`).join('')}</div>
<div class="ty"><div lang="en" dir="ltr" style="--font:${d.font.en};--head:${d.font.head ? d.font.head.en : d.font.en}">${sample('en')}</div><div lang="ar" dir="rtl" style="font-family:${d.font.ar};--font:${d.font.ar};--head:${d.font.head ? d.font.head.ar : d.font.ar}">${sample('ar')}</div></div>
<div class="aa"><b>Text contrast (WCAG AA ≥ 4.5:1):</b> ${contrast[d.name].map((p) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.fg};border:1px solid #888;vertical-align:-1px"></span> on <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.bg};border:1px solid #888;vertical-align:-1px"></span> ${p.ratio}:1 ${p.aa ? '✓' : '✗'}</span>`).join('')}</div></div>`;
}

for (const [k, d] of Object.entries(D)) {
  fs.writeFileSync(path.join(here, `${k}-palette.html`), page(d, 'en', palette(d), 'palette'));
  for (const lang of ['en', 'ar']) {
    fs.writeFileSync(path.join(here, `${k}-home-${lang}.html`), page(d, lang, home(d, lang), 'home'));
    fs.writeFileSync(path.join(here, `${k}-next-${lang}.html`), page(d, lang, next(d, lang), 'next'));
  }
}
fs.writeFileSync(path.join(here, 'contrast.json'), JSON.stringify(contrast, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(contrast).map(([n, l]) => [n, l.map((p) => `${p.fg}/${p.bg} ${p.ratio}${p.aa ? '' : ' FAIL'}`)])), null, 1));
