import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createFetchUrl, FetchUrlError } from '../server/fetchUrl.js';
import { parseColor, colorRole, readStyles, stylesheetLinks, logoCandidates, websiteBrand, BRAND } from '../server/brand.js';

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
    { url: 'https://site.test/img/brand.svg', from: 'img in header' },
    { url: 'https://img.test/nav-logo.png', from: 'img in nav' },
    { url: 'https://site.test/banner-logo-partners.png', from: 'img on the page' },
    { url: 'https://site.test/touch.png', from: 'apple-touch-icon' },
    { url: 'https://site.test/fav-192.png', from: 'icon' },
    { url: 'https://site.test/fav-32.png', from: 'icon' },
    { url: 'https://img.test/share.jpg', from: 'og:image' },
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
  assert.deepEqual(r.logo, { url: 'https://site.test/img/brand.svg', type: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64'), from: 'img in header' });
  assert.deepEqual(r.notes, []);
  assert.deepEqual(calls.map((c) => [c.url, c.address]), [
    ['https://site.test/', PUBLIC],
    ['https://site.test/css/main.css?v=3', PUBLIC],
    ['https://cdn.test/lib/theme.css', '8.8.8.8'], // another host: allowed, and address-checked like any read
    ['https://site.test/img/brand.svg', PUBLIC],
  ]);
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
  assert.deepEqual(r.logo, { url: 'https://site.test/touch.png', type: 'image/png', dataUrl: 'data:image/png;base64,' + PNG.toString('base64'), from: 'apple-touch-icon' });
  assert.deepEqual(r.notes, [
    { code: 'logo_failed', url: 'https://site.test/img/brand.svg', error: 'too_large' },
    { code: 'logo_failed', url: 'https://img.test/nav-logo.png', error: 'unsupported_type' },
    { code: 'logo_failed', url: 'https://site.test/banner-logo-partners.png', error: 'fetch_failed' },
  ]);
  assert.equal(calls.find((c) => c.url === 'https://img.test/nav-logo.png').address, '1.1.1.1');
  assert.equal(calls.filter((c) => /png|svg|jpg/.test(c.url)).length, BRAND.logoTries); // then it stops trying
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
  assert.deepEqual(await websiteBrand(bare.fetchUrl, 'https://site.test/'), { url: 'https://site.test/', colors: [], neutrals: [], fonts: [], logo: null, notes: [{ code: 'no_colors' }, { code: 'no_fonts' }, { code: 'no_logo' }] });
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
  assert.deepEqual(Object.keys(j), ['url', 'colors', 'neutrals', 'fonts', 'logo', 'notes']);
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
