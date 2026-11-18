import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createFetchUrl, FetchUrlError } from '../server/fetchUrl.js';
import { parseColor, colorRole, readStyles, stylesheetLinks, logoCandidates, websiteBrand, logoHint, inlineLogos, BRAND } from '../server/brand.js';

// Brand identity from a website (task 9.8). Nothing here touches the real network: the reader's DNS and
// transport are stubbed as in test/fetchUrl.test.js.
const PUBLIC = '93.184.216.34';
const DNS = { 'site.test': [PUBLIC], 'cdn.test': ['8.8.8.8'], 'img.test': ['1.1.1.1'], 'internal.test': ['10.0.0.5'] };
const lookup = async (host) => {
  if (!(host in DNS)) throw new Error('ENOTFOUND');
  return DNS[host].map((address) => ({ address, family: 4 }));
};
const res = (body, type, status = 200, headers = {}) => () => ({ status, headers: { 'content-type': type, ...headers }, body: Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body)]) });
const html = (body) => res(body, 'text/html; charset=utf-8');
const css = (body) => res(body, 'text/css; charset=utf-8');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>';

function reader(routes) {
  const calls = [];
  const request = async (url, target) => {
    calls.push({ url: url.href, address: target.address, accept: target.accept });
    if (!routes[url.href]) throw new Error('ECONNREFUSED');
    return routes[url.href]();
  };
  return { fetchUrl: createFetchUrl({ lookup, request }), calls };
}

test('reader options: other content types only when the server caller asks; the limit can only shrink', async () => {
  const { fetchUrl, calls } = reader({ 'https://site.test/a.css': css('body{color:red}'), 'https://site.test/l.png': res(PNG, 'image/png'), 'https://site.test/': html('<title>T</title>') });
  const refused = (p) => assert.rejects(p, (e) => e instanceof FetchUrlError && e.code === 'unsupported_type');
  await refused(fetchUrl('https://site.test/a.css')); // default: HTML and plain text only
  await refused(fetchUrl('https://site.test/l.png'));
  await refused(fetchUrl('https://site.test/', { types: ['text/css'] }));
  assert.equal((await fetchUrl('https://site.test/a.css', { types: ['text/css'] })).text, 'body{color:red}');
  const img = await fetchUrl('https://site.test/l.png', { types: ['image/png'], binary: true, accept: 'image/png' });
  assert.deepEqual({ url: img.url, type: img.type, bytes: [...img.bytes] }, { url: 'https://site.test/l.png', type: 'image/png', bytes: [...PNG] });
  assert.equal(calls.at(-1).accept, 'image/png');
  await assert.rejects(fetchUrl('https://site.test/l.png', { types: ['image/png'], binary: true, maxBytes: 4 }), (e) => e.code === 'too_large');
  assert.equal((await fetchUrl('https://site.test/', { maxBytes: 1e12 })).title, 'T'); // asking for more than the reader allows changes nothing
  await assert.rejects(fetchUrl('http://internal.test/a.css', { types: ['text/css'] }), (e) => e.code === 'blocked_host');
});

test('parseColor: hex, rgb() and hsl() become 6-digit hex; anything else is refused', () => {
  const ok = { '#abc': '#AABBCC', '#ABCDEF': '#ABCDEF', '#abcdef80': '#ABCDEF', '#abcf': '#AABBCC', 'rgb(29, 78, 216)': '#1D4ED8', 'RGBA(29,78,216,.5)': '#1D4ED8', 'rgb(29 78 216 / 50%)': '#1D4ED8', 'rgb(100% 0% 0%)': '#FF0000', 'hsl(0, 100%, 50%)': '#FF0000', 'hsl(120deg 100% 25%)': '#008000', 'hsla(240, 100%, 50%, 0.3)': '#0000FF', ' #FFF ': '#FFFFFF' };
  for (const [raw, hex] of Object.entries(ok)) assert.equal(parseColor(raw), hex, raw);
  for (const bad of ['red', 'transparent', '#12', '#12345', '#gggggg', 'rgb(1,2)', 'rgb(a,b,c)', 'hsl(0,1,1)', '#0000', '#abcdef00', 'rgba(0,0,0,0)', 'hsla(0,0%,0%,0%)', 'var(--x)', '', null, 'url(#fff)']) assert.equal(parseColor(bad), null, String(bad));
});

test('colorRole: greys, near-white and near-black are not brand colours', () => {
  for (const hex of ['#1D4ED8', '#38BDF8', '#E11D48', '#8B7355', '#047857']) assert.equal(colorRole(hex), 'brand', hex);
  for (const hex of ['#000000', '#111111', '#0F172A', '#333333', '#64748B', '#475569']) assert.equal(colorRole(hex), 'ink', hex);
  for (const hex of ['#FFFFFF', '#F3F5FC', '#E2E8F0', '#CCCCCC', '#FEF3C7']) assert.equal(colorRole(hex), 'surface', hex);
});

const PAGE = `<!doctype html><html><head><title>Nile Clinics</title>
<meta name="theme-color" content="#E11D48">
<meta property="og:image" content="https://img.test/share.jpg">
<link rel="stylesheet" href="/css/main.css?v=3">
<link rel="preload stylesheet" href="https://cdn.test/lib/theme.css">
<link rel="stylesheet" href="/css/main.css?v=3">
<link rel="preload" href="/css/not-a-sheet.css">
<link rel="icon" sizes="32x32" href="/fav-32.png"><link rel="icon" sizes="192x192" href="/fav-192.png">
<link rel="apple-touch-icon" href="/touch.png">
<!-- <link rel="stylesheet" href="/commented.css"> -->
<style>.hero{background:#1d4ed8;color:#fff} h1, h2 { font-family: "Playfair Display", Georgia, serif }</style>
</head><body>
<img src="/banner-logo-partners.png" alt="partners">
<header><a href="/"><img class="site-logo" src="/img/brand.svg" alt="Nile"></a><img src="/img/menu.png" alt="menu"></header>
<nav><img src="data:image/png;base64,AAAA" id="logo-inline"><img src="https://img.test/nav-logo.png" alt="Logo"></nav>
</body></html>`;
const MAIN = `/* brand: #ABCDEF must not count */
:root{--color-primary:#1D4ED8;--brand-accent: rgb(56 189 248);--blue-600:#2563eb;--cta:var(--blue-600);--spacing-main:12px;--color-text:#0F172A;--secondary: var(--missing, #10b981)}
html,body{font-family:var(--font-sans);color:#0f172a;background:#ffffff}
:root{--font-sans: system-ui, -apple-system, 'Inter', "Segoe UI", sans-serif}
.btn{background:#1d4ed8;border-color:#1D4ED8}.card{border:1px solid #e2e8f0;background:#fff}.muted{color:#64748b}
@media (min-width:600px){.btn:hover{background:#4338CA}.x{color:#4338ca}.y{color:#4338CA;border-color:#e2e8f0}}
.a{color:#F59E0B}`;
const THEME = '.t{color:#10B981}.u{color:#f59e0b;background:#F59E0B}';

test('stylesheetLinks and logoCandidates: what the page points at, in order', () => {
  const page = PAGE.replace(/<!--[\s\S]*?-->/g, '');
  assert.deepEqual(stylesheetLinks(page, 'https://site.test/'), ['https://site.test/css/main.css?v=3', 'https://cdn.test/lib/theme.css']);
  assert.deepEqual(logoCandidates(page, 'https://site.test/'), [
    { url: 'https://site.test/img/brand.svg', from: 'img in header', hint: null },
    { url: 'https://img.test/nav-logo.png', from: 'img in nav', hint: null },
    { url: 'https://site.test/banner-logo-partners.png', from: 'img on the page', hint: null },
    { url: 'https://site.test/touch.png', from: 'apple-touch-icon', hint: null, fallback: true },
    { url: 'https://site.test/fav-192.png', from: 'icon', hint: null, fallback: true },
    { url: 'https://site.test/fav-32.png', from: 'icon', hint: null, fallback: true },
    { url: 'https://img.test/share.jpg', from: 'og:image', hint: null, fallback: true },
  ]);
  assert.deepEqual(logoCandidates('<img src="javascript:alert(1)" class="logo"><img src="file:///etc/passwd" id="logo">', 'https://site.test/'), []);
});

test('readStyles: theme-color, brand-named variables, then the most used; greys apart; fonts', () => {
  const inline = '.hero{background:#1d4ed8;color:#fff} h1, h2 { font-family: "Playfair Display", Georgia, serif }';
  const r = readStyles(PAGE, [{ name: 'main.css', css: MAIN }, { name: 'theme.css', css: THEME }, { name: 'the page', css: inline }]);
  assert.deepEqual(r.colors, [
    { hex: '#E11D48', uses: 0, from: 'meta theme-color' },
    { hex: '#1D4ED8', uses: 4, from: '--color-primary in main.css' },
    { hex: '#38BDF8', uses: 1, from: '--brand-accent in main.css' },
    { hex: '#2563EB', uses: 1, from: '--cta in main.css' }, // followed through var(--blue-600)
    { hex: '#10B981', uses: 2, from: '--secondary in main.css' }, // fallback of a missing variable; also in theme.css
    { hex: '#4338CA', uses: 3, from: 'used 3 times in the styles' },
    { hex: '#F59E0B', uses: 3, from: 'used 3 times in the styles' },
  ]);
  assert.deepEqual(r.neutrals[0], { hex: '#FFFFFF', uses: 3, from: 'used 3 times in the styles', role: 'surface' });
  assert.deepEqual(r.neutrals.map((n) => [n.hex, n.role]).sort(), [['#0F172A', 'ink'], ['#64748B', 'ink'], ['#E2E8F0', 'surface'], ['#FFFFFF', 'surface']]);
  assert.ok(!r.colors.some((c) => c.hex === '#ABCDEF')); // inside a comment
  assert.deepEqual(r.fonts, [
    { family: 'Inter', role: 'body', from: 'body in main.css' },
    { family: 'Playfair Display', role: 'headings', from: 'headings in the page' },
  ]);
});

test('readStyles: framework style sheets do not count; Bootstrap defaults dropped; a customised primary and Bootstrap classes on the page count', () => {
  // the owner's case (2026-11-18): bootstrap.min.css alone put #0D6EFD, #DC3545, #198754, #FFC107 … on the brand list
  const BS = ':root{--bs-primary:#0d6efd;--bs-secondary:#6c757d;--bs-success:#198754;--bs-danger:#dc3545;--bs-warning:#ffc107;--bs-link-color:#0d6efd;--bs-primary-text-emphasis:#052c65}'
    + '.btn-primary{background:#0d6efd}.text-danger{color:#dc3545}.alert-success{color:#0f5132;background:#d1e7dd}.text-warning{color:#ffc107}'.repeat(10);
  const own = '.hero{background:#7C3AED}.cta{color:#7c3aed}';
  let r = readStyles('<p>x</p>', [{ name: 'bootstrap.min.css', css: BS }, { name: 'site.css', css: own }]);
  assert.deepEqual(r.colors.map((c) => c.hex), ['#7C3AED']);
  // Bootstrap's success colour IS on the website when the page uses its classes
  r = readStyles('<a class="btn btn-success">Go</a><span class="text-success x"></span>', [{ name: 'bootstrap.min.css', css: BS }, { name: 'site.css', css: own }]);
  assert.deepEqual(r.colors.map((c) => [c.hex, c.uses]), [['#7C3AED', 2], ['#198754', 2]]);
  assert.match(r.colors[1].from, /Bootstrap classes on the page/);
  // a customised Bootstrap primary is the brand colour
  r = readStyles('', [{ name: 'bootstrap.min.css', css: ':root{--bs-primary:#E11D48;--bs-danger:#dc3545}' }]);
  assert.deepEqual(r.colors, [{ hex: '#E11D48', uses: 0, from: '--bs-primary in bootstrap.min.css' }]);
  // a copy on a public CDN counts as a framework sheet, whatever its name
  assert.deepEqual(readStyles('', [{ name: 'theme.css', url: 'https://cdn.jsdelivr.net/npm/x/theme.css', css: '.a{color:#F97316}' }]).colors, []);
  // inline style attributes are the site's own
  assert.deepEqual(readStyles('<div style="background:#0EA5E9"></div>', []).colors.map((c) => c.hex), ['#0EA5E9']);
  // near-identical shades are one colour
  assert.deepEqual(readStyles('', [{ name: 'a.css', css: '.a{color:#152B44}.b{color:#152b44}.c{color:#152B45}' }]).colors.map((c) => c.hex), ['#152B44']);
});

test('readStyles: at most 8 colours; nothing found is an empty answer', () => {
  const many = Array.from({ length: 30 }, (_, i) => `.c${i}{color:hsl(${i * 12}, 80%, 45%)}`).join('');
  assert.equal(readStyles('', [{ name: 'a.css', css: many }]).colors.length, BRAND.colors);
  assert.deepEqual(readStyles('<p>hi</p>', []), { colors: [], neutrals: [], fonts: [] });
  assert.deepEqual(readStyles('', [{ name: 'a.css', css: 'body{font-family:sans-serif}h1{font-family:inherit}' }]).fonts, []);
});

const SITE = {
  'https://site.test/': html(PAGE),
  'https://site.test/css/main.css?v=3': css(MAIN),
  'https://cdn.test/lib/theme.css': css(THEME),
  'https://site.test/img/brand.svg': res(SVG, 'image/svg+xml'),
};

test('websiteBrand: page, style sheets and the first logo, each through the guarded reader', async () => {
  const { fetchUrl, calls } = reader(SITE);
  const r = await websiteBrand(fetchUrl, 'https://site.test/');
  assert.equal(r.url, 'https://site.test/');
  assert.deepEqual(r.colors.map((c) => c.hex), ['#E11D48', '#1D4ED8', '#38BDF8', '#2563EB', '#10B981', '#4338CA', '#F59E0B']);
  assert.deepEqual(r.fonts.map((f) => f.family), ['Inter', 'Playfair Display']);
  assert.deepEqual(r.logo, { url: 'https://site.test/img/brand.svg', type: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64'), from: 'img in header', hint: null });
  assert.equal(r.logos[0], r.logo);
  assert.deepEqual(calls.map((c) => [c.url, c.address]), [
    ['https://site.test/', PUBLIC],
    ['https://site.test/css/main.css?v=3', PUBLIC],
    ['https://cdn.test/lib/theme.css', '8.8.8.8'], // another host: allowed, and address-checked like any read
    ['https://site.test/img/brand.svg', PUBLIC],
    ['https://img.test/nav-logo.png', '1.1.1.1'], // the other versions are tried too (not served by this stand-in site)
    ['https://site.test/banner-logo-partners.png', PUBLIC],
  ]);
  assert.deepEqual(r.notes.map((n) => n.code), ['logo_failed', 'logo_failed']);
});

test('websiteBrand: logo order — too large, wrong type and missing files are skipped and noted', async () => {
  const big = Buffer.alloc(BRAND.logoBytes + 1, 1);
  const { fetchUrl, calls } = reader({
    ...SITE,
    'https://site.test/img/brand.svg': res(big, 'image/svg+xml'), // an SVG over the limit
    'https://img.test/nav-logo.png': res('<html>not an image</html>', 'text/html'), // another host, wrong type
    // /banner-logo-partners.png is missing
    'https://site.test/touch.png': res(PNG, 'image/png'),
  });
  const r = await websiteBrand(fetchUrl, 'https://site.test/');
  assert.deepEqual(r.logo, { url: 'https://site.test/touch.png', type: 'image/png', dataUrl: 'data:image/png;base64,' + PNG.toString('base64'), from: 'apple-touch-icon', hint: null });
  assert.deepEqual(r.logos, [r.logo]);
  assert.deepEqual(r.notes, [
    { code: 'logo_failed', url: 'https://site.test/img/brand.svg', error: 'too_large' },
    { code: 'logo_failed', url: 'https://img.test/nav-logo.png', error: 'unsupported_type' },
    { code: 'logo_failed', url: 'https://site.test/banner-logo-partners.png', error: 'fetch_failed' },
  ]);
  assert.equal(calls.find((c) => c.url === 'https://img.test/nav-logo.png').address, '1.1.1.1');
  assert.equal(calls.filter((c) => /png|svg|jpg/.test(c.url)).length, 4); // three logo-named images, then the apple-touch-icon; the other icons are never tried
});

test('websiteBrand: private addresses are never requested; the share image is flagged; an empty page says so', async () => {
  const page = `<link rel="stylesheet" href="http://internal.test/admin.css"><link rel="stylesheet" href="http://169.254.169.254/latest/meta-data/">
    <link rel="stylesheet" href="/ok.css"><link rel="stylesheet" href="/missing.css"><link rel="stylesheet" href="/page.html">
    ${Array.from({ length: 4 }, (_, i) => `<link rel="stylesheet" href="/extra${i}.css">`).join('')}
    <header><img src="http://127.0.0.1/logo.png" alt="logo"></header><meta property="og:image" content="/share.jpg">`;
  const { fetchUrl, calls } = reader({ 'https://site.test/': html(page), 'https://site.test/ok.css': css('a{color:#E11D48}'), 'https://site.test/page.html': html('<p>x</p>'), 'https://site.test/share.jpg': res(PNG, 'image/jpeg') });
  const r = await websiteBrand(fetchUrl, 'https://site.test/');
  assert.deepEqual(r.colors, [{ hex: '#E11D48', uses: 1, from: 'used 1 time in the styles' }]);
  assert.equal(r.logo.from, 'og:image');
  assert.deepEqual(r.notes, [
    { code: 'stylesheets_skipped', count: 4 },
    { code: 'stylesheet_failed', url: 'http://internal.test/admin.css', error: 'blocked_host' },
    { code: 'stylesheet_failed', url: 'http://169.254.169.254/latest/meta-data/', error: 'blocked_host' },
    { code: 'stylesheet_failed', url: 'https://site.test/missing.css', error: 'fetch_failed' },
    { code: 'stylesheet_failed', url: 'https://site.test/page.html', error: 'unsupported_type' },
    { code: 'no_fonts' },
    { code: 'logo_failed', url: 'http://127.0.0.1/logo.png', error: 'blocked_host' },
    { code: 'logo_share_image' },
  ]);
  assert.ok(!calls.some((c) => /internal|169\.254|127\.0/.test(c.url)));

  const bare = reader({ 'https://site.test/': html('<p>Hello</p>') });
  assert.deepEqual(await websiteBrand(bare.fetchUrl, 'https://site.test/'), { url: 'https://site.test/', colors: [], neutrals: [], fonts: [], logo: null, logos: [], notes: [{ code: 'no_colors' }, { code: 'no_fonts' }, { code: 'no_logo' }] });
  await assert.rejects(websiteBrand(bare.fetchUrl, 'http://internal.test/'), (e) => e instanceof FetchUrlError && e.code === 'blocked_host');
});

// ---- HTTP route ----
let server, base, alice, bob, companyId, routeCalls;
before(async () => {
  const db = openDb(':memory:');
  const f = reader(SITE);
  routeCalls = f.calls;
  server = createApp({ db, fetchUrl: f.fetchUrl, fetchLimit: { max: 3, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  companyId = (await (await call('POST', '/api/companies', alice, { name: 'Nile Clinics' })).json()).company.id;
});
after(() => server.close());
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
const brand = (body, cookie = alice) => call('POST', `/api/companies/${companyId}/website/brand`, cookie, body);

test('route: members only; input validated; nothing stored; errors mapped; allowance shared with the website reader', async () => {
  assert.equal((await brand({ url: 'https://site.test/' }, null)).status, 401);
  assert.equal((await brand({ url: 'https://site.test/' }, bob)).status, 404);
  for (const body of [{}, { url: 5 }, { url: ' ' }, { url: 'https://site.test/' + 'a'.repeat(2000) }]) {
    const r = await brand(body);
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: 'invalid_url' });
  }
  assert.equal(routeCalls.length, 0);

  const ok = await brand({ url: 'https://site.test/' }); // 1
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.deepEqual(Object.keys(j), ['url', 'colors', 'neutrals', 'fonts', 'logo', 'logos', 'notes']);
  assert.equal(j.colors[1].from, '--color-primary in main.css');
  assert.equal(j.logo.type, 'image/svg+xml');
  const state = await (await call('GET', `/api/companies/${companyId}/state`, alice)).json();
  assert.equal(state.state, null); // the route saved nothing

  const blocked = await brand({ url: 'http://127.0.0.1/' }); // 2
  assert.equal(blocked.status, 400);
  assert.deepEqual(await blocked.json(), { error: 'blocked_host' });
  // The browser cannot use the route below to read a style sheet or an image: the default types still apply.
  const cssRead = await call('POST', `/api/companies/${companyId}/fetch-url`, alice, { url: 'https://site.test/css/main.css?v=3', types: ['text/css'], binary: true }); // 3
  assert.equal(cssRead.status, 415);

  const limited = await brand({ url: 'https://site.test/' });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: 'too_many_attempts' });
});

// ---- task 9.23: every logo version ----
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);
const PNG3 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 7, 7, 7, 7]);
const png = (b) => res(b, 'image/png');
const dataUrl = (type, body) => `data:${type};base64,${Buffer.from(body).toString('base64')}`;
const unurl = (l) => Buffer.from(l.dataUrl.split(',')[1], 'base64').toString();
const brandOf = (page, routes = {}) => websiteBrand(reader({ 'https://site.test/': html(page), ...routes }).fetchUrl, 'https://site.test/');

test('logo versions: header images in page order, srcset only when there is no src, hint words, logo = logos[0]', async () => {
  const page = `<header><a class="logo"><img class="logo-dark" src="/a.png"></a><img alt="Site logo white" src="/b.png">
    <img class="logo" srcset="/c.png 1x, /c2.png 2x"><img class="logo" src="/d.png" srcset="/d2.png 2x"><img src="/menu.png"></header>`;
  const r = await brandOf(page, { 'https://site.test/a.png': png(PNG), 'https://site.test/b.png': png(PNG2), 'https://site.test/c.png': png(PNG3), 'https://site.test/d.png': png(Buffer.from([0x89, 5, 5])) });
  assert.deepEqual(r.logos.map((l) => [l.url, l.hint]), [['https://site.test/a.png', 'dark'], ['https://site.test/b.png', 'light'], ['https://site.test/c.png', null], ['https://site.test/d.png', null]]);
  assert.equal(r.logo, r.logos[0]);
  assert.ok(r.logos.every((l) => l.type === 'image/png' && l.from === 'img in header'));
  assert.equal(logoHint('logo-dark-white'), null);
  assert.equal(logoHint('darkroom'), null); // whole words only
  assert.equal(logoHint('x/logo_inverted.svg'), 'light');
});

test('logo versions: a <picture> with a dark-scheme source; format-only sources are not versions', () => {
  const page = `<picture><source media="(prefers-color-scheme: dark)" srcset="/dark.png 1x, /dark2.png 2x"><source type="image/webp" srcset="/l.webp"><img class="logo" src="/main.png"></picture>
    <picture><source media="(prefers-color-scheme: dark)" srcset="/other.png"><img src="/photo.jpg"></picture>`;
  const c = logoCandidates(page, 'https://site.test/');
  assert.deepEqual(c.map((x) => [x.url, x.hint]), [['https://site.test/main.png', null], ['https://site.test/dark.png', 'dark-scheme']]);
  assert.equal(c[1].from, 'source in picture');
});

test('logo versions: a CSS background logo, relative to its own style sheet; private addresses refused', async () => {
  const page = '<link rel="stylesheet" href="https://cdn.test/css/site.css"><style>.logo-mark{background-image:url(/inline.png)}</style>';
  const sheet = '/* .logo{background:url(/no.png)} */ .nav .logo, .foot-logo{background: #fff url("../img/bg-logo.png") no-repeat}.logo-white{background-image:url(data:image/png;base64,AAAA)}@media (min-width:1px){.logo.dark{background:url(http://127.0.0.1/x.png)}}.hero{background:url(/hero.png)}';
  const r = await brandOf(page, { 'https://cdn.test/css/site.css': css(sheet), 'https://cdn.test/img/bg-logo.png': png(PNG), 'https://site.test/inline.png': png(PNG2) });
  assert.deepEqual(r.logos.map((l) => l.url), ['https://cdn.test/img/bg-logo.png', 'https://site.test/inline.png']);
  assert.equal(r.logos[0].from, 'background of .nav .logo, .foot-logo in site.css');
  assert.equal(r.logos[1].from, 'background of .logo-mark in the page');
  assert.deepEqual(r.notes.filter((n) => n.code === 'logo_failed'), [{ code: 'logo_failed', url: 'http://127.0.0.1/x.png', error: 'blocked_host' }]);
});

test('logo versions: identical bytes kept once; cap of 4 with logos_more; eight tries at most', async () => {
  const imgs = Array.from({ length: 7 }, (_, i) => `<img class="logo" src="/l${i}.png">`).join('');
  const routes = { 'https://site.test/l0.png': png(PNG), 'https://site.test/l1.png': png(PNG) }; // same bytes
  for (let i = 2; i < 7; i++) routes[`https://site.test/l${i}.png`] = png(Buffer.from([0x89, i]));
  const r = await brandOf(`<header>${imgs}</header>`, routes);
  assert.deepEqual(r.logos.map((l) => l.url), ['l0', 'l2', 'l3', 'l4'].map((n) => `https://site.test/${n}.png`));
  assert.deepEqual(r.notes.filter((n) => n.code === 'logos_more'), [{ code: 'logos_more', count: 2 }]);

  const many = Array.from({ length: 12 }, (_, i) => `<img class="logo" src="/m${i}.png">`).join('');
  const { fetchUrl, calls } = reader({ 'https://site.test/': html(`<header>${many}</header>`) }); // none of them exists
  const q = await websiteBrand(fetchUrl, 'https://site.test/');
  assert.equal(calls.length - 1, BRAND.logoTries);
  assert.equal(q.notes.filter((n) => n.code === 'logo_failed').length, 8);
  assert.deepEqual(q.notes.filter((n) => n.code === 'logos_more'), [{ code: 'logos_more', count: 4 }]);
  assert.equal(q.logo, null);
});

test('logo versions: the icon and the share image are fallbacks — not added when a logo was kept', async () => {
  const links = '<link rel="apple-touch-icon" href="/t.png"><link rel="icon" href="/i.png"><meta property="og:image" content="/s.png">';
  const routes = { 'https://site.test/a.png': png(PNG), 'https://site.test/t.png': png(PNG2), 'https://site.test/s.png': png(PNG3) };
  const kept = await brandOf(`${links}<header><img class="logo" src="/a.png"></header>`, routes);
  assert.deepEqual(kept.logos.map((l) => l.url), ['https://site.test/a.png']);
  const none = await brandOf(`${links}<p>no logo</p>`, routes);
  assert.deepEqual(none.logos.map((l) => l.from), ['apple-touch-icon']);
});

const wrap = (svg) => `<header><a href="/" class="brand-logo">${svg}</a></header>`;
const OWN = '<svg viewBox="0 0 10 10"><title>Nile logo</title><path fill="#e11d48" d="M0 0h10v10z"/></svg>';

test('inline svg logo: own colours → one stand-alone version; currentColor or no fill → two recoloured versions', async () => {
  const r = await brandOf(wrap(OWN));
  assert.equal(r.logos.length, 1);
  assert.deepEqual(r.logos[0], { url: null, type: 'image/svg+xml', dataUrl: dataUrl('image/svg+xml', OWN.replace('<svg viewBox="0 0 10 10">', '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">')), from: 'inline svg in header', hint: null });

  const cc = '<svg xmlns="http://www.w3.org/2000/svg" class="logo" viewBox="0 0 4 4"><path fill="currentColor" d="M0 0h4v4z"/></svg>';
  const two = await brandOf(wrap(cc));
  assert.deepEqual(two.logos.map(unurl), [cc.replace('currentColor', '#111111'), cc.replace('currentColor', '#FFFFFF')]);
  assert.ok(two.logos.every((l) => l.recoloured === true && l.url === null));

  const nofill = await brandOf(wrap('<svg aria-label="logo" width="20" height="10"><path d="M0 0h4v4z"/></svg>'));
  const d2 = nofill.logos.map(unurl);
  assert.equal(d2.length, 2);
  assert.ok(d2[0].includes('viewBox="0 0 20 10"') && d2[0].includes('xmlns="http://www.w3.org/2000/svg"') && d2[0].includes('fill="#111111"') && d2[1].includes('fill="#FFFFFF"'));
});

test('inline svg logo: unsafe or unusable → refused with a note; other svgs ignored', async () => {
  const bads = {
    script: '<svg viewBox="0 0 1 1" class="logo"><script>alert(1)</script></svg>',
    event_attribute: '<svg viewBox="0 0 1 1" class="logo"><rect fill="red" onload="x()"/></svg>',
    foreign_object: '<svg viewBox="0 0 1 1" class="logo"><foreignObject><p>x</p></foreignObject></svg>',
    external_reference: '<svg viewBox="0 0 1 1" class="logo"><use href="https://evil.test/a.svg#x"/></svg>',
    no_viewbox: '<svg class="logo"><rect fill="red"/></svg>',
  };
  for (const [reason, svg] of Object.entries(bads)) {
    const r = await brandOf(wrap(svg));
    assert.deepEqual(r.logos, [], reason);
    assert.ok(r.notes.some((n) => n.code === 'logo_inline_skipped' && n.reason === reason), reason);
  }
  for (const svg of ['<svg viewBox="0 0 1 1" class="logo"><image href="data:image/png;base64,AAAA"/></svg>', '<svg viewBox="0 0 1 1" class="logo"><rect fill="url(https://evil.test/p)"/></svg>']) {
    assert.equal(inlineLogos(wrap(svg)).skipped[0], 'external_reference');
  }
  assert.equal(inlineLogos(wrap('<svg viewBox="0 0 1 1" class="logo"><use href="#a"/><rect id="a" fill="url(#g)"/></svg>')).found.length, 1); // inside itself is fine
  assert.equal(inlineLogos(wrap(`<svg viewBox="0 0 1 1" class="logo"><path fill="red" d="${'M0 0'.repeat(BRAND.logoBytes / 3)}"/></svg>`)).skipped[0], 'too_large');
  assert.equal(inlineLogos('<header><svg viewBox="0 0 1 1" class="menu-icon"><path fill="red"/></svg></header><svg class="logo" viewBox="0 0 1 1"><path fill="red"/></svg>').found.length, 0);
});

test('inline svg logo: shares the cap of 4 (a recoloured pair needs two places)', async () => {
  const routes = {};
  for (let i = 0; i < 3; i++) routes[`https://site.test/p${i}.png`] = png(Buffer.from([0x89, i]));
  const page = `<header>${[0, 1, 2].map((i) => `<img class="logo" src="/p${i}.png">`).join('')}</header>` + wrap('<svg viewBox="0 0 1 1" class="logo"><path d="M0 0"/></svg>');
  const r = await brandOf(page, routes);
  assert.equal(r.logos.length, 3);
  assert.deepEqual(r.notes.filter((n) => n.code === 'logos_more'), [{ code: 'logos_more', count: 1 }]);
});
