// Brand identity read from a company's website: colour, font and logo CANDIDATES (task 9.8; every logo
// version, task 9.23: images, <picture> sources, CSS backgrounds and inline SVG — found by rules, no model).
// The page is read through the guarded reader (fetchUrl.js); so is every stylesheet it links and the one
// logo images that are downloaded — the same address checks apply to each of those reads, whatever host
// they point at. No model is called and nothing is stored: the browser shows the result as pending
// findings and the user approves or rejects them (task 9.9).
//
// SVG logos: an SVG file can carry scripts. The data URL returned here must only ever be used as the
// source of an <img> or as a CSS background image, where scripts do not run. It must never be inlined
// into a page as markup. An SVG over the size limit is refused like any other image.
import { FetchUrlError } from './fetchUrl.js';

export const BRAND = { colors: 8, neutrals: 4, fonts: 4, sheets: 5, sheetBytes: 1024 * 1024, logoBytes: 500_000, logoTries: 8, logos: 4, notes: 20, url: 2000 };
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const BRAND_NAME = /primary|brand|accent|secondary|main|theme|highlight|cta|link|action/i;
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont', 'inherit', 'initial', 'unset', 'revert']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos);/gi, (_m, n) => ENTITIES[n.toLowerCase()]).replace(/&#(\d{1,7});/g, (_m, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)));
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(' ' + tag);
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '').trim() : null;
};
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map((m) => m[1]);
const fileName = (u) => {
  try {
    const x = new URL(u);
    return x.pathname.split('/').filter(Boolean).pop() || x.host;
  } catch {
    return 'stylesheet';
  }
};
const resolve = (href, base) => {
  try {
    const u = new URL(href, base);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.href.length <= BRAND.url ? u.href : null;
  } catch {
    return null;
  }
};

// ---- colours ----
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const toHex = (r, g, b) => '#' + (hex2(r) + hex2(g) + hex2(b)).toUpperCase();
const num = (s, scale) => (s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s));
function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
/** Pure: one CSS colour (hex, rgb(), rgba(), hsl(), hsla()) as 6-digit upper-case hex; null for anything else or a fully transparent colour. */
export function parseColor(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) return h[3] === '0' ? null : '#' + [...h.slice(0, 3)].map((c) => c + c).join('').toUpperCase();
    if (h.length === 6 || h.length === 8) return h.slice(6) === '00' ? null : '#' + h.slice(0, 6).toUpperCase();
    return null;
  }
  m = /^(rgb|hsl)a?\(([^()]*)\)$/.exec(s);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4 || parts.some((p) => !/^-?[\d.]+(%|deg)?$/.test(p))) return null;
  if (parts[3] !== undefined && num(parts[3], 1) === 0) return null;
  if (m[1] === 'rgb') return toHex(num(parts[0], 255), num(parts[1], 255), num(parts[2], 255));
  if (!parts[1].endsWith('%') || !parts[2].endsWith('%')) return null;
  return toHex(...hslToRgb(parseFloat(parts[0]), Math.min(1, num(parts[1], 1)), Math.min(1, num(parts[2], 1))));
}
/** Pure: 'brand' for a colour with a clear hue; 'ink' for near-black and dark greys; 'surface' for near-white, pale tints and light greys. */
export function colorRole(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  // Chroma, not HSL saturation: HSL calls a very light or very dark tint "saturated".
  if (l >= 0.88 || l <= 0.14 || max - min < 0.18) return l < 0.5 ? 'ink' : 'surface';
  return 'brand';
}
const COLOR_RE = /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\([^()]*\)/gi;

/** Pure: CSS text without comments, as `[{ selector, body }]` for the innermost rule blocks (rules inside @media included). */
function rules(css) {
  return [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}
const declarations = (body) =>
  body.split(';').map((d) => {
    const i = d.indexOf(':');
    return i < 0 ? null : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).replace(/!important/i, '').trim()];
  }).filter(Boolean);

/**
 * Pure: colour and font candidates from the page and its style sheets.
 * `sheets` = `[{ name, css }]` in reading order (the page's own <style> blocks included by the caller).
 * → `{ colors: [{ hex, uses, from }], neutrals: [{ hex, uses, role, from }], fonts: [{ family, role, from }] }`
 * Order of colours: theme-color, then custom properties named for brand use, then the most used ones.
 * Greys, near-white and near-black never enter `colors`; the most used of them are listed in `neutrals`.
 */
export function readStyles(html, sheets) {
  const clean = sheets.map((s) => ({ name: s.name, css: String(s.css ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ') }));
  // Every custom property, so that `--primary: var(--blue-600)` can be followed.
  const vars = new Map();
  const parsed = clean.map((s) => ({ name: s.name, rules: rules(s.css).map((r) => ({ selector: r.selector, decls: declarations(r.body) })) }));
  for (const s of parsed) for (const r of s.rules) for (const [k, v] of r.decls) if (k.startsWith('--') && !vars.has(k)) vars.set(k, v);
  const follow = (v) => {
    for (let i = 0; i < 4; i++) {
      const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
      if (!m) break;
      v = vars.get(m[1].toLowerCase()) ?? (m[2] ?? '').trim();
    }
    return v;
  };

  const uses = new Map();
  for (const s of clean) for (const m of s.css.match(COLOR_RE) ?? []) {
    const hex = parseColor(m);
    if (hex) uses.set(hex, (uses.get(hex) ?? 0) + 1);
  }
  const named = [];
  for (const tag of tags(html, 'meta')) {
    if ((attr(tag, 'name') ?? '').toLowerCase() !== 'theme-color') continue;
    const hex = parseColor(attr(tag, 'content'));
    if (hex) named.push({ hex, from: 'meta theme-color' });
  }
  for (const s of parsed) for (const r of s.rules) for (const [k, v] of r.decls) {
    if (!k.startsWith('--') || !BRAND_NAME.test(k)) continue;
    const hex = parseColor(follow(v));
    if (hex) named.push({ hex, from: `${k} in ${s.name}` });
  }
  const ranked = [...uses.entries()].sort((a, b) => b[1] - a[1]);
  const colors = [];
  const neutrals = [];
  const seen = new Set();
  const offer = (hex, from) => {
    if (seen.has(hex)) return;
    seen.add(hex);
    const role = colorRole(hex);
    const item = { hex, uses: uses.get(hex) ?? 0, from };
    if (role === 'brand') {
      if (colors.length < BRAND.colors) colors.push(item);
    } else if (neutrals.filter((n) => n.role === role).length < BRAND.neutrals / 2) neutrals.push({ ...item, role });
  };
  for (const n of named) offer(n.hex, n.from);
  for (const [hex, n] of ranked) offer(hex, `used ${n} time${n === 1 ? '' : 's'} in the styles`);

  // Fonts: the first named family of body text and of headings.
  const fonts = [];
  const family = (v) => {
    for (const part of follow(v).split(',')) {
      const name = follow(part.trim()).split(',')[0].trim().replace(/^["']|["']$/g, '').trim();
      if (name && !GENERIC.has(name.toLowerCase()) && !/^var\(/.test(name) && name.length <= 60) return name;
    }
    return null;
  };
  const want = { body: /^(?:html|body|:root)$/i, headings: /^h[1-6]$/i };
  for (const role of ['body', 'headings']) {
    search: for (const s of parsed) for (const r of s.rules) {
      if (!r.selector.split(',').some((x) => want[role].test(x.trim()))) continue;
      for (const [k, v] of r.decls) {
        if (k !== 'font-family') continue;
        const name = family(v);
        if (name) {
          fonts.push({ family: name, role, from: `${role} in ${s.name}` });
          break search;
        }
      }
    }
  }
  return { colors, neutrals, fonts: fonts.slice(0, BRAND.fonts) };
}

/** Pure: the style sheets a page links, as absolute addresses in page order, once each. */
export function stylesheetLinks(html, pageUrl) {
  const out = [];
  for (const tag of tags(html, 'link')) {
    if (!/(?:^|\s)stylesheet(?:\s|$)/i.test(attr(tag, 'rel') ?? '')) continue;
    const u = resolve(attr(tag, 'href') ?? '', pageUrl);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

// A word in the site's own naming → which background the logo was drawn for. NEVER used to decide anything:
// sites use "logo-dark" both for a dark logo (made to sit on a light background) and for a logo made for dark
// backgrounds, so the word is only shown to the user as a hint. A dark word and a light word together → no hint.
const word = (w) => new RegExp('(?<![a-z])(?:' + w + ')(?![a-z])', 'i');
const DARK_WORD = word('dark|black|mono');
const LIGHT_WORD = word('light|white|inverse|inverted|negative|reversed');
export function logoHint(...parts) {
  const text = parts.map((p) => p ?? '').join(' ');
  const d = DARK_WORD.test(text);
  const l = LIGHT_WORD.test(text);
  return d && !l ? 'dark' : l && !d ? 'light' : null;
}
const firstSrcset = (v) => (v ?? '').split(',')[0].trim().split(/\s+/)[0] || null;

/**
 * Pure: where the logo may be, as `{ url, from, hint }` once each, in this order:
 *  1 an image named "logo" in <header> / <nav>, then elsewhere on the page (its src; the first address of its
 *    srcset only when it has no usable src — a 2x file is the same logo, not another version);
 *  2 inside a <picture> that holds a logo-named image, each <source srcset> that has a media query or no type
 *    (a source with only a type is the same logo in another file format); prefers-color-scheme: dark →
 *    hint 'dark-scheme';
 *  3 a style rule whose selector contains "logo" with background / background-image: url(…), resolved against
 *    the address of its style sheet (`sheets` = `[{ name, css, url }]`);
 *  4 fallbacks, flagged `fallback: true`: the apple-touch-icon, the largest icon, and last the share image
 *    (og:image), which is often a picture and not the logo.
 */
export function logoCandidates(html, pageUrl, sheets = []) {
  const out = [];
  const add = (href, from, hint, fallback = false, base = pageUrl) => {
    const u = href && !/^data:/i.test(href) ? resolve(href, base) : null;
    if (u && !out.some((c) => c.url === u)) out.push({ url: u, from, hint: hint ?? logoHint(href), ...(fallback ? { fallback: true } : {}) });
  };
  const names = (tag) => ['src', 'alt', 'class', 'id'].map((a) => attr(tag, a) ?? '').join(' ');
  const logoImgs = (part, from) => {
    for (const tag of tags(part, 'img')) {
      if (!/logo/i.test(names(tag))) continue;
      const src = attr(tag, 'src');
      const hint = logoHint(names(tag));
      if (src && !/^data:/i.test(src)) add(src, from, hint);
      else add(firstSrcset(attr(tag, 'srcset')), from, hint);
    }
  };
  for (const m of html.matchAll(/<(header|nav)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) logoImgs(m[2], 'img in ' + m[1].toLowerCase());
  logoImgs(html, 'img on the page');
  for (const m of html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture\s*>/gi)) {
    if (!tags(m[1], 'img').some((t) => /logo/i.test(names(t)))) continue;
    for (const tag of tags(m[1], 'source')) {
      const media = attr(tag, 'media') ?? '';
      if (!media && attr(tag, 'type')) continue;
      const address = firstSrcset(attr(tag, 'srcset'));
      add(address, 'source in picture', /prefers-color-scheme\s*:\s*dark/i.test(media) ? 'dark-scheme' : logoHint(address, media));
    }
  }
  for (const sh of sheets) {
    for (const r of rules(String(sh.css ?? '').replace(/\/\*[\s\S]*?\*\//g, ' '))) {
      if (!/logo/i.test(r.selector)) continue;
      for (const [k, v] of declarations(r.body)) {
        if (k !== 'background' && k !== 'background-image') continue;
        for (const u of v.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
          add(decode(u[2].trim()), 'background of ' + r.selector.replace(/\s+/g, ' ').slice(0, 80) + ' in ' + sh.name, logoHint(r.selector, u[2]), false, sh.url ?? pageUrl);
        }
      }
    }
  }
  const links = tags(html, 'link').map((tag) => ({ rel: (attr(tag, 'rel') ?? '').toLowerCase(), href: attr(tag, 'href'), size: Math.max(0, ...(attr(tag, 'sizes') ?? '').split(/\s+/).map((s) => parseInt(s, 10) || 0)) }));
  for (const l of links.filter((x) => /apple-touch-icon/.test(x.rel)).sort((a, b) => b.size - a.size)) add(l.href, 'apple-touch-icon', null, true);
  for (const l of links.filter((x) => /(?:^|\s)icon(?:\s|$)/.test(x.rel)).sort((a, b) => b.size - a.size)) add(l.href, 'icon', null, true);
  for (const tag of tags(html, 'meta')) if ((attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase() === 'og:image') add(attr(tag, 'content'), 'og:image', null, true);
  return out;
}

/**
 * Pure: the logo drawn in the page as an inline <svg> in <header> / <nav> (its own class / id / aria-label /
 * <title>, or the element or link around it, contains "logo"), made into stand-alone SVG images.
 * → `{ found: [{ from, hint, versions: [{ svg, recoloured? }] }], skipped: [reason] }`
 * An SVG with a script, an event attribute, <foreignObject>, or any reference that is not "#…" (href, url(),
 * <use> to another file, @import) is refused: reason 'script' | 'event_attribute' | 'foreign_object' |
 * 'external_reference' | 'too_large' | 'no_viewbox'. Its colour may come from the page (currentColor, or no
 * fill of its own) and cannot be known here: then TWO versions are returned, with #111111 and with #FFFFFF,
 * both `recoloured: true`.
 */
export function inlineLogos(html) {
  const found = [];
  const skipped = [];
  const seen = new Set();
  for (const m of html.matchAll(/<(header|nav)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const part = m[2];
    for (const sm of part.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg\s*>/gi)) {
      const before = part.slice(0, sm.index);
      const around = [];
      const prev = /<\w+\b([^>]*)>\s*$/.exec(before);
      if (prev) around.push(prev[1]);
      const openA = before.lastIndexOf('<a ');
      if (openA >= 0 && openA > before.lastIndexOf('</a')) around.push(before.slice(openA, before.indexOf('>', openA) + 1));
      const own = ['class', 'id', 'aria-label'].map((a) => attr(sm[1], a) ?? '').join(' ') + ' ' + (/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(sm[2])?.[1] ?? '');
      const ctx = around.map((t) => ['class', 'id'].map((a) => attr(t, a) ?? '').join(' ')).join(' ');
      if (!/logo/i.test(own + ' ' + ctx)) continue;
      const svg = sm[0];
      if (seen.has(svg)) continue;
      seen.add(svg);
      const bad = /<script/i.test(svg) ? 'script'
        : /\son[a-z]+\s*=/i.test(svg) ? 'event_attribute'
        : /<foreignObject/i.test(svg) ? 'foreign_object'
        : /\b(?:xlink:)?href\s*=\s*(?!["']?#)/i.test(svg) || /url\(\s*(?!["']?#)/i.test(svg) || /@import/i.test(svg) ? 'external_reference'
        : null;
      if (bad) {
        skipped.push(bad);
        continue;
      }
      let open = '<svg' + sm[1].replace(/\/\s*$/, '');
      if (!/\sxmlns\s*=/i.test(' ' + sm[1])) open += ' xmlns="http://www.w3.org/2000/svg"';
      if (/xlink:/i.test(svg) && !/xmlns:xlink/i.test(sm[1])) open += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
      if (!attr(sm[1], 'viewBox')) {
        const w = parseFloat(attr(sm[1], 'width') ?? '');
        const h = parseFloat(attr(sm[1], 'height') ?? '');
        if (!(w > 0 && h > 0)) {
          skipped.push('no_viewbox');
          continue;
        }
        open += ' viewBox="0 0 ' + w + ' ' + h + '"';
      }
      const base = open + '>' + sm[2] + '</svg>';
      const fromPage = /currentColor/i.test(base) || !/\b(?:fill|stroke|stop-color)\s*[=:]/i.test(base);
      const versions = fromPage
        ? ['#111111', '#FFFFFF'].map((c) => ({ svg: /currentColor/i.test(base) ? base.replace(/currentColor/gi, c) : base.replace(/^<svg/, '<svg fill="' + c + '"'), recoloured: true }))
        : [{ svg: base }];
      if (versions.some((v) => Buffer.byteLength(v.svg) > BRAND.logoBytes)) {
        skipped.push('too_large');
        continue;
      }
      found.push({ from: 'inline svg in header', hint: logoHint(own, ctx), versions });
    }
  }
  return { found, skipped };
}

const code = (e) => (e instanceof FetchUrlError ? e.code : 'fetch_failed');

const ACCEPT = 'image/png,image/svg+xml,image/webp,image/jpeg,image/gif';

/**
 * Brand candidates of one website page. `fetchUrl` is the guarded reader; a failure to read the page
 * itself passes through as its error, a failed style sheet or logo becomes a note.
 * → `{ url, colors, neutrals, fonts, logo, logos: [{ url, type, dataUrl, from, hint, recoloured? }], notes }`
 * `logos` is every logo version found, best first, at most `BRAND.logos`; `logo` = `logos[0] ?? null`
 * (what the 9.9 screen reads). An inline SVG has `url: null`. The icon and og:image are tried only when no
 * logo-named image or inline SVG was kept.
 * Note codes: stylesheet_failed { url, error }, stylesheets_skipped { count }, logo_failed { url, error },
 * logo_inline_skipped { reason }, logos_more { count }, logo_share_image, no_logo, no_colors, no_fonts.
 */
export async function websiteBrand(fetchUrl, rawUrl) {
  const page = await fetchUrl(rawUrl);
  const html = String(page.text ?? '').replace(/<!--[\s\S]*?-->/g, ' ');
  const notes = [];
  const note = (n) => notes.length < BRAND.notes && notes.push(n);

  const hrefs = stylesheetLinks(html, page.url);
  if (hrefs.length > BRAND.sheets) note({ code: 'stylesheets_skipped', count: hrefs.length - BRAND.sheets });
  const read = await Promise.all(
    hrefs.slice(0, BRAND.sheets).map((u) =>
      fetchUrl(u, { types: ['text/css'], maxBytes: BRAND.sheetBytes, accept: 'text/css,*/*;q=0.1' }).then(
        (r) => ({ name: fileName(r.url), css: r.text, url: r.url }),
        (e) => ({ failed: { code: 'stylesheet_failed', url: u, error: code(e) } }),
      ),
    ),
  );
  for (const r of read) if (r.failed) note(r.failed); // in page order, whichever answered first
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1]).join('\n');
  const sheets = [...read.filter((r) => !r.failed), ...(inline.trim() ? [{ name: 'the page', css: inline, url: page.url }] : [])];
  const { colors, neutrals, fonts } = readStyles(html, sheets);
  if (!colors.length) note({ code: 'no_colors' });
  if (!fonts.length) note({ code: 'no_fonts' });

  const logos = [];
  const seen = new Set();
  let tries = 0;
  let left = 0;
  const keep = (v) => {
    if (seen.has(v.dataUrl)) return false; // the same bytes under another address
    seen.add(v.dataUrl);
    logos.push(v);
    return true;
  };
  const download = async (c) => {
    tries++;
    try {
      const r = await fetchUrl(c.url, { types: IMAGE_TYPES, binary: true, maxBytes: BRAND.logoBytes, accept: ACCEPT });
      if (!r.bytes.length) throw new FetchUrlError('fetch_failed', 502);
      return keep({ url: r.url, type: r.type, dataUrl: `data:${r.type};base64,${r.bytes.toString('base64')}`, from: c.from, hint: c.hint });
    } catch (e) {
      note({ code: 'logo_failed', url: c.url, error: code(e) });
      return false;
    }
  };
  const all = logoCandidates(html, page.url, sheets);
  for (const c of all.filter((x) => !x.fallback)) {
    if (logos.length >= BRAND.logos || tries >= BRAND.logoTries) left++;
    else await download(c);
  }
  const svgs = inlineLogos(html);
  for (const reason of svgs.skipped) note({ code: 'logo_inline_skipped', reason });
  for (const s of svgs.found) {
    if (logos.length + s.versions.length > BRAND.logos) left++;
    else for (const v of s.versions) keep({ url: null, type: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,' + Buffer.from(v.svg).toString('base64'), from: s.from, hint: s.hint, ...(v.recoloured ? { recoloured: true } : {}) });
  }
  if (left) note({ code: 'logos_more', count: left });
  if (!logos.length) {
    for (const c of all.filter((x) => x.fallback)) {
      if (tries >= BRAND.logoTries) break;
      if (await download(c)) {
        if (c.from === 'og:image') note({ code: 'logo_share_image' });
        break;
      }
    }
  }
  if (!logos.length) note({ code: 'no_logo' });
  return { url: page.url, colors, neutrals, fonts, logo: logos[0] ?? null, logos, notes };
}
