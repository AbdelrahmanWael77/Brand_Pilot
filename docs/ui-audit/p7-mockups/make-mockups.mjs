// P7 checkpoint 0: two visual directions for Home (static mockups, not the app). FlowNest's real numbers, last 28 days.
// node docs/ui-audit/p7-mockups/make-mockups.mjs → mockup-a-en.html, mockup-a-ar.html, mockup-b-en.html, mockup-b-ar.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const F = '../../../public/vendor/fonts/';
const fonts = [400, 500, 600, 700, 800].map((w) => `@font-face{font-family:"Plus Jakarta Sans";font-weight:${w};src:url(${F}plus-jakarta-sans-latin-${w}-normal.woff2)}`).join('')
  + [400, 500, 600, 700].map((w) => `@font-face{font-family:"IBM Plex Sans Arabic";font-weight:${w};src:url(${F}ibm-plex-sans-arabic-arabic-${w}-normal.woff2)}`).join('');

const T = {
  en: {
    dir: 'ltr', nav: ['Home', 'Next steps', 'Campaigns', 'Reports', 'Company'], foot: ['Data', 'Settings'], lang: 'العربية',
    demo: 'Demo data — FlowNest is a sample company. Nothing here is real.', guide: 'Guide',
    title: 'Home', period: 'Last 28 days', hi: 'Good morning, Sara',
    status: 'Visits are steady, but few visitors get in touch. The biggest problem: people who come from social media rarely enquire.',
    checked: 'Numbers checked',
    nextEyebrow: 'Your next step', next: 'Send social media visitors to one focused landing page',
    why: '37% of your visits come from social media, but only 0.39% of them enquire.',
    cta: 'Create this campaign', seeWhy: 'See why',
    numbers: 'Key numbers', all: 'All numbers',
    stats: [['Visits', '4,774', '+1%', 'up'], ['Enquiries', '65', '+3%', 'up'], ['Qualified leads', '16', '+14%', 'up']],
    vs: 'vs the 28 days before',
    ask: 'Ask anything about your marketing…', send: 'Ask',
    chips: ['What should we do first?', 'Why are enquiries low?', 'Which channel works best?'],
    user: 'Sara',
  },
  ar: {
    dir: 'rtl', nav: ['الرئيسية', 'الخطوات التالية', 'الحملات', 'التقارير', 'الشركة'], foot: ['البيانات', 'الإعدادات'], lang: 'English',
    demo: 'بيانات تجريبية — FlowNest شركة نموذجية. لا شيء هنا حقيقي.', guide: 'الدليل',
    title: 'الرئيسية', period: 'آخر 28 يوماً', hi: 'صباح الخير يا سارة',
    status: 'الزيارات مستقرة، لكن قلة من الزوار يتواصلون معك. أكبر مشكلة: زوار التواصل الاجتماعي نادراً ما يستفسرون.',
    checked: 'الأرقام مُتحقَّق منها',
    nextEyebrow: 'خطوتك التالية', next: 'وجّه زوار التواصل الاجتماعي إلى صفحة هبوط واحدة مركّزة',
    why: '37% من زياراتك تأتي من التواصل الاجتماعي، لكن 0.39% منها فقط تستفسر.',
    cta: 'أنشئ هذه الحملة', seeWhy: 'لماذا؟',
    numbers: 'أهم الأرقام', all: 'كل الأرقام',
    stats: [['الزيارات', '4,774', '+1%', 'up'], ['الاستفسارات', '65', '+3%', 'up'], ['العملاء المؤهلون', '16', '+14%', 'up']],
    vs: 'مقارنة بالـ 28 يوماً السابقة',
    ask: 'اسأل أي شيء عن تسويقك…', send: 'اسأل',
    chips: ['ما الذي نفعله أولاً؟', 'لماذا الاستفسارات قليلة؟', 'أي قناة تعمل أفضل؟'],
    user: 'سارة',
  },
};

// one small icon set (Lucide-style strokes, 18px)
const I = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  next: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  camp: '<path d="M3 11l18-8v18l-18-8z"/><path d="M7 13v5a2 2 0 0 0 4 0v-3"/>',
  rep: '<path d="M4 4h16v16H4z"/><path d="M8 15v-3M12 15V8M16 15v-5"/>',
  co: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20"/>',
  data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.7H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10.3 3V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 4.6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  spark: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>', chev: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M7 17 17 7M8 7h9v9"/>',
};
const ic = (n, s = 18, cls = '') => `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
const flip = (t) => (t.dir === 'rtl' ? ' style="transform:scaleX(-1)"' : '');

function shell(t, cls, body, side) {
  const navIcons = ['home', 'next', 'camp', 'rep', 'co'];
  return `<!doctype html><html lang="${t === T.ar ? 'ar' : 'en'}" dir="${t.dir}"><head><meta charset="utf-8"><title>BrandPilot — Home mockup</title><style>${fonts}${side}</style></head>
<body class="${cls}"><div class="demo" role="note">${ic('spark', 14)}<span>${t.demo}</span></div>
<div class="app"><aside class="side"><div class="logo"><span class="mark">B</span><b>BrandPilot</b></div>
<button class="co">FlowNest ${ic('chev', 16)}</button>
<nav>${t.nav.map((n, i) => `<a class="${i === 0 ? 'on' : ''}">${ic(navIcons[i])}<span>${n}</span></a>`).join('')}</nav>
<nav class="foot">${t.foot.map((n, i) => `<a>${ic(i ? 'set' : 'data')}<span>${n}</span></a>`).join('')}<a>${ic('globe')}<span>${t.lang}</span></a><div class="me"><span class="av">${t.user[0]}</span>${t.user}</div></nav></aside>
<main>${body}</main></div><button class="guide">${ic('help', 16)}${t.guide}</button></body></html>`;
}

// ---- Direction A: quiet workspace (two columns, cards with a light border) ----
const cssA = `:root{--bg:#F7F7F8;--surface:#fff;--line:#E7E7EB;--ink:#16181D;--ink2:#4A4F5A;--ink3:#7B8190;--accent:#2F5BEA;--accent-soft:#EEF2FE;--good:#15803D;--good-bg:#ECFDF3;--warn:#B45309;--warn-bg:#FFF7E8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Plus Jakarta Sans","IBM Plex Sans Arabic",system-ui,sans-serif}html[dir=rtl] body{font-family:"IBM Plex Sans Arabic","Plus Jakarta Sans",system-ui,sans-serif}
.demo{height:32px;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--warn-bg);color:var(--warn);font-size:13px;border-bottom:1px solid #F5E3C3}
.app{display:grid;grid-template-columns:240px 1fr;min-height:calc(100vh - 32px)}
.side{background:var(--surface);border-inline-end:1px solid var(--line);padding:16px 12px;display:flex;flex-direction:column;gap:8px}
.logo{display:flex;align-items:center;gap:10px;padding:4px 8px 12px;font-size:16px}.mark{width:28px;height:28px;border-radius:8px;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700}
.co{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 12px;font:600 14px inherit;font-family:inherit;color:var(--ink);margin-bottom:8px}
nav{display:flex;flex-direction:column;gap:2px}nav a{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;color:var(--ink2);font-size:14px;font-weight:500}nav a.on{background:#F1F2F4;color:var(--ink);font-weight:600}
nav.foot{margin-top:auto;border-top:1px solid var(--line);padding-top:8px}.me{display:flex;align-items:center;gap:8px;padding:8px;font-size:13px;color:var(--ink2)}.av{width:24px;height:24px;border-radius:50%;background:#E4E7EC;display:grid;place-items:center;font-size:12px;font-weight:700;color:var(--ink)}
main{padding:32px 40px 48px}.wrap{max-width:1120px;margin:0 auto}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px}.top h1{font-size:14px;font-weight:600;color:var(--ink3);margin:0;letter-spacing:.01em}
.sel{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:500}
.grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:24px;align-items:start}
.hi{font-size:32px;line-height:1.2;font-weight:700;letter-spacing:-.02em;margin:0 0 12px}.status{font-size:18px;line-height:1.55;color:var(--ink2);margin:0 0 12px;max-width:620px}
.chk{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--good);background:var(--good-bg);border-radius:999px;padding:3px 10px;font-weight:600}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px}
.next{margin-top:24px}.eye{font-size:12px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px}html[dir=rtl] .eye{letter-spacing:0}
.next h2{font-size:20px;line-height:1.35;margin:0 0 8px;font-weight:650}.next p{margin:0 0 20px;color:var(--ink2)}
.row{display:flex;align-items:center;gap:16px}.btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:8px;background:var(--accent);color:#fff;font:600 14px inherit;font-family:inherit;border:0}
.link{color:var(--accent);font-weight:600;font-size:14px}
.nums h3{font-size:14px;margin:0 0 16px;color:var(--ink2);font-weight:600}.stat{padding:12px 0;border-top:1px solid var(--line)}.stat:first-of-type{border-top:0;padding-top:0}
.stat .l{font-size:13px;color:var(--ink3)}.stat .v{display:flex;align-items:baseline;gap:10px}.stat b{font-size:28px;font-weight:700;letter-spacing:-.02em}.d{font-size:13px;font-weight:600;color:var(--good)}
.vs{font-size:12px;color:var(--ink3);margin:12px 0 0}.nums .link{display:inline-flex;gap:6px;align-items:center;margin-top:12px}
.ask{margin-top:24px;grid-column:1/-1}.askbox{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px 8px 8px 20px;box-shadow:0 1px 2px rgba(16,24,40,.04)}html[dir=rtl] .askbox{padding:8px 20px 8px 8px}
.askbox span{flex:1;color:var(--ink3);font-size:16px;padding:10px 0}.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.chips a{font-size:13px;color:var(--ink2);background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 12px}
.guide{position:fixed;inset-block-end:24px;inset-inline-end:24px;display:flex;align-items:center;gap:6px;background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:8px 14px;font:600 13px inherit;font-family:inherit;box-shadow:0 4px 12px rgba(16,24,40,.08)}`;
function bodyA(t) {
  return `<div class="wrap"><div class="top"><h1>${t.title}</h1><span class="sel">${t.period} ${ic('chev', 14)}</span></div>
<div class="grid"><section><h2 class="hi">${t.hi}</h2><p class="status">${t.status}</p><span class="chk">${ic('check', 14)}${t.checked}</span>
<div class="card next"><p class="eye">${t.nextEyebrow}</p><h2>${t.next}</h2><p>${t.why}</p><div class="row"><button class="btn">${t.cta}<span${flip(t)}>${ic('arrow', 16)}</span></button><a class="link">${t.seeWhy}</a></div></div></section>
<aside class="card nums"><h3>${t.numbers}</h3>${t.stats.map(([l, v, d]) => `<div class="stat"><div class="l">${l}</div><div class="v"><b>${v}</b><bdi dir="ltr" class="d">${d}</bdi></div></div>`).join('')}<p class="vs">${t.vs}</p><a class="link">${t.all}<span${flip(t)}>${ic('arrow', 14)}</span></a></aside>
<section class="ask"><div class="askbox">${ic('spark', 20)}<span>${t.ask}</span><button class="btn">${t.send}</button></div><div class="chips">${t.chips.map((c) => `<a>${c}</a>`).join('')}</div></section></div></div>`;
}

// ---- Direction B: focused page (one column, editorial type, almost no boxes) ----
const cssB = `:root{--bg:#fff;--side:#FAFAF9;--line:#ECECEA;--ink:#111111;--ink2:#48484A;--ink3:#8A8A8E;--accent:#2563EB;--tint:#F4F6FB;--good:#15803D;--warn:#A16207;--warn-bg:#FEF9E7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "Plus Jakarta Sans","IBM Plex Sans Arabic",system-ui,sans-serif}html[dir=rtl] body{font-family:"IBM Plex Sans Arabic","Plus Jakarta Sans",system-ui,sans-serif}
.demo{height:30px;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--warn-bg);color:var(--warn);font-size:12.5px}
.app{display:grid;grid-template-columns:232px 1fr;min-height:calc(100vh - 30px)}
.side{background:var(--side);padding:20px 14px;display:flex;flex-direction:column;gap:6px}
.logo{display:flex;align-items:center;gap:10px;padding:0 8px 16px;font-size:15px}.mark{width:26px;height:26px;border-radius:7px;background:var(--ink);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px}
.co{display:flex;justify-content:space-between;align-items:center;border:0;background:transparent;padding:6px 8px;font:600 14px inherit;font-family:inherit;color:var(--ink);margin-bottom:12px}
nav{display:flex;flex-direction:column;gap:2px}nav a{display:flex;align-items:center;gap:12px;padding:8px;border-radius:6px;color:var(--ink2);font-size:14px}nav a.on{color:var(--ink);font-weight:600;background:#EFEFEC}
nav.foot{margin-top:auto}.me{display:flex;align-items:center;gap:8px;padding:8px;font-size:13px;color:var(--ink2)}.av{width:24px;height:24px;border-radius:50%;background:#E5E5E2;display:grid;place-items:center;font-size:12px;font-weight:700}
main{padding:56px 48px 64px}.col{max-width:760px;margin:0 auto}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:40px;color:var(--ink3);font-size:14px}.sel{display:flex;align-items:center;gap:4px;color:var(--ink2);font-weight:500}
.hi{font-size:40px;line-height:1.15;font-weight:700;letter-spacing:-.025em;margin:0 0 16px}.status{font-size:21px;line-height:1.55;color:var(--ink2);margin:0 0 16px}
.status mark{background:linear-gradient(transparent 62%,#FDE68A 62%);color:var(--ink)}
.chk{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3)}.chk .ic{color:var(--good)}
.next{margin:40px 0;background:var(--tint);border-radius:16px;padding:32px}.eye{font-size:13px;font-weight:600;color:var(--accent);margin:0 0 8px}
.next h2{font-size:24px;line-height:1.3;margin:0 0 8px;font-weight:700;letter-spacing:-.01em}.next p{margin:0 0 24px;color:var(--ink2)}
.row{display:flex;align-items:center;gap:20px}.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 20px;border-radius:10px;background:var(--ink);color:#fff;font:600 15px inherit;font-family:inherit;border:0}
.link{color:var(--ink2);font-weight:600;font-size:14px;text-decoration:underline;text-underline-offset:3px;text-decoration-color:#C9C9C6}
.nums{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:12px}
.stat{padding:24px 0;padding-inline-start:24px;border-inline-start:1px solid var(--line)}.stat:first-child{border-inline-start:0;padding-inline-start:0}
.stat .l{font-size:13px;color:var(--ink3)}.stat b{display:block;font-size:34px;font-weight:700;letter-spacing:-.025em;line-height:1.2;margin:4px 0}.d{font-size:13px;font-weight:600;color:var(--good)}
.below{display:flex;justify-content:space-between;font-size:13px;color:var(--ink3);margin-bottom:40px}
.askbox{display:flex;align-items:center;gap:12px;border:1px solid #DADAD6;border-radius:999px;padding:8px;padding-inline-start:24px;box-shadow:0 6px 24px rgba(0,0,0,.06)}
.askbox span{flex:1;color:var(--ink3);font-size:17px}.askbox .btn{border-radius:999px}.chips{display:flex;gap:16px;flex-wrap:wrap;margin-top:16px;font-size:14px}.chips a{color:var(--ink2)}.chips a::before{content:"→ ";color:var(--ink3)}html[dir=rtl] .chips a::before{content:"← "}
.guide{position:fixed;inset-block-end:24px;inset-inline-end:24px;display:flex;align-items:center;gap:6px;background:var(--ink);color:#fff;border:0;border-radius:999px;padding:9px 16px;font:600 13px inherit;font-family:inherit}`;
function bodyB(t) {
  const hl = t.dir === 'rtl' ? t.status.replace('زوار التواصل الاجتماعي نادراً ما يستفسرون', '<mark>زوار التواصل الاجتماعي نادراً ما يستفسرون</mark>') : t.status.replace('people who come from social media rarely enquire', '<mark>people who come from social media rarely enquire</mark>');
  return `<div class="col"><div class="top"><span>${t.title}</span><span class="sel">${t.period} ${ic('chev', 14)}</span></div>
<h1 class="hi">${t.hi}</h1><p class="status">${hl}</p><span class="chk">${ic('check', 14)}${t.checked}</span>
<section class="next"><p class="eye">${t.nextEyebrow}</p><h2>${t.next}</h2><p>${t.why}</p><div class="row"><button class="btn">${t.cta}<span${flip(t)}>${ic('arrow', 16)}</span></button><a class="link">${t.seeWhy}</a></div></section>
<div class="nums">${t.stats.map(([l, v, d]) => `<div class="stat"><div class="l">${l}</div><b>${v}</b><bdi dir="ltr" class="d">${d}</bdi></div>`).join('')}</div>
<div class="below"><span>${t.vs}</span><a class="link">${t.all}</a></div>
<div class="askbox">${ic('spark', 20)}<span>${t.ask}</span><button class="btn">${t.send}</button></div><div class="chips">${t.chips.map((c) => `<a>${c}</a>`).join('')}</div></div>`;
}

for (const [k, css, body] of [['a', cssA, bodyA], ['b', cssB, bodyB]]) for (const lang of ['en', 'ar']) fs.writeFileSync(path.join(here, `mockup-${k}-${lang}.html`), shell(T[lang], `dir-${k}`, body(T[lang]), css));
console.log('ok');
