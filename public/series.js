/* BrandPilot — AI Content Series workspace (task 17).
   A dedicated creative workspace for recurring editorial posts (Build Smarter, Tech news…), separate from Campaign Studio.
   Series Library → Creative references → Signature style (AI-read, reviewed, approved) → Topic → AI draft
   → finished branded creatives → compare → refine → save / approve / download.

   Loaded as a classic script BEFORE the main inline script of index.html; it only defines functions and the global
   BPSeries. Everything it uses from the app (S, C, R, A, V, L, esc, api, serOf, libOf, brandLogos…) is looked up when a
   function runs. index.html calls BPSeries.install() once, after its own definitions.

   What is real here:
   - The finished creative is COMPOSED in the browser on a canvas: series background, the AI illustration blended into
     it, the company's OFFICIAL logo file (never redrawn) and the approved text as real type. Text edits re-render at once.
   - The illustration is made by the server's image model (POST /series/illustration, wordless by construction).
   - The signature style is read from the reference pictures by a vision-capable model (POST /series/style-read), or —
     clearly labelled — measured from pixels, or taken from the brand kit. The user reviews and approves it.
   - Creative references are examples of HOW the brand communicates. They never become company facts.
   Data (company state): series[i].style (approved), series[i].styleProp (proposal under review), library[] items with
   sid + ref (references), sxd[sid] (the post being made, survives a refresh), creatives[] (saved posts). */
(function (root) {
  'use strict';
  const W = 1080;
  const HEX = /^#[0-9a-f]{6}$/i;
  const SX = { img: {}, specs: {}, busy: {}, fonts: false, autoT: {} };
  const PEND_MS = 150000; // a picture still "pending" after this was interrupted (page closed / server restarted)

  /* ---------- small helpers ---------- */
  const isHex = (h) => HEX.test(String(h || ''));
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => { const [r, g, b] = rgbOf(h).map((x) => x / 255); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const hue = (h) => { const [r, g, b] = rgbOf(h).map((x) => x / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (!d) return 0; const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
  /** Skin and hair tones the style read lists from the characters: not brand colours for props and clothing. */
  const skinLike = (h) => { const u = hue(h); return u >= 10 && u <= 50 && sat(h) < 0.5 && lum(h) > 0.35; };
  const sat = (h) => { const v = rgbOf(h).map((x) => x / 255), mx = Math.max(...v), mn = Math.min(...v); return mx === 0 ? 0 : (mx - mn) / mx; };
  const toHex = (a) => '#' + a.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (h, k, t) => toHex(rgbOf(h).map((x, i) => x + (rgbOf(k)[i] - x) * t));
  const rgba = (h, a) => { const [r, g, b] = rgbOf(isHex(h) ? h : '#000000'); return `rgba(${r},${g},${b},${a})`; };
  const lang = () => (S.lang === 'ar' ? 'ar' : 'en');
  const creativesOf = (c) => (Array.isArray(c.creatives) ? c.creatives : (c.creatives = []));
  const draftsOf = (c) => (c.sxd && typeof c.sxd === 'object' && !Array.isArray(c.sxd) ? c.sxd : (c.sxd = {}));
  const refsOf = (c, sid) => libOf(c).filter((x) => x.sid === sid && x.img && c.media.some((m) => m.id === x.img));
  const curSeries = (c) => serOf(c).find((s) => s.id === S.ui.sx) || null;
  const media = (c, id) => c.media.find((m) => m.id === id);
  const errMsg = (e, what) => e && e.status === 429 ? L('Too many requests — try again in a few minutes.', 'طلبات كثيرة — حاول بعد دقائق.')
    : e && e.status === 503 ? (what === 'img' ? L('The image model is not set up on this server (CLOUDFLARE_ACCOUNT_ID / token). You can upload your own illustration instead.', 'نموذج الصور غير مُعدّ على هذا الخادم. يمكنك رفع رسمك الخاص بدلاً منه.') : L('The AI is not set up on this server.', 'الذكاء الاصطناعي غير مُعدّ على هذا الخادم.'))
    : e && e.status === 422 ? L('The selected AI model could not see the pictures. Choose a vision-capable model in Settings, or use the pixel measurement.', 'لم يستطع نموذج الذكاء الاصطناعي المختار رؤية الصور. اختر نموذجاً يرى الصور من الإعدادات أو استخدم قياس البكسلات.')
    : what === 'img' ? L('The illustration could not be made. Try again.', 'تعذّر إنشاء الرسم. حاول مجدداً.') : L('That did not work. Try again.', 'لم ينجح ذلك. حاول مجدداً.');

  /* ---------- the signature style ---------- */
  /** A style from the brand kit only (before anything was learned from posts). */
  function kitStyle(c) {
    const cols = ((c.brand && c.brand.colors) || []).filter(isHex);
    const byL = cols.slice().sort((a, b) => lum(a) - lum(b));
    const base = byL.find((h) => sat(h) > 0.3) || byL[0] || '#14306B';
    const dark = lum(base) > 0.25 ? mix(base, '#000000', 0.55) : base;
    const accent = cols.filter((h) => sat(h) > 0.35 && lum(h) > 0.4).sort((a, b) => lum(b) - lum(a))[0] || '#5CB8F5';
    return { bg: [mix(dark, '#000000', 0.15), dark], ink: '#FFFFFF', accent, sub: '#DCE8F5', palette: [dark, accent, '#FFFFFF'], headline: 'Two short sentences on two lines; the second line in the accent colour.', twoTone: true, upper: false, type: 'Bold geometric sans-serif', logoPos: 'tr', layout: 'stack', illustration: 'Polished, softly lit 3D illustration with friendly characters and objects that explain the topic.', composition: '', tone: 'Clear, practical and friendly.', footnote: false, aspects: ['1:1'], read: 'kit' };
  }
  const styleOf = (c, s) => (s && s.style) || kitStyle(c);
  const fixStyle = (st) => {
    const k = kitStyle(C());
    const o = Object.assign({}, k, st || {});
    o.bg = (Array.isArray(o.bg) ? o.bg : []).filter(isHex);
    if (!o.bg.length) o.bg = k.bg;
    if (o.bg.length < 2) o.bg = [o.bg[0], o.bg[0]];
    ['ink', 'accent', 'sub'].forEach((x) => { if (!isHex(o[x])) o[x] = k[x]; });
    o.palette = (o.palette || []).filter(isHex).slice(0, 6);
    if (!['stack', 'split', 'hero'].includes(o.layout)) o.layout = 'stack';
    if (!['tr', 'tl', 'br', 'bl', 'none'].includes(o.logoPos)) o.logoPos = 'tr';
    return o;
  };

  /* ---------- images: cache, letterbox crop, pixel measurement ---------- */
  function img(c, id) {
    const m = media(c, id);
    if (!m) return null;
    let im = SX.img[id];
    if (!im || im.src !== m.data) { im = new Image(); im.onload = () => paintAll(); im.src = m.data; SX.img[id] = im; }
    return im.complete && im.naturalWidth ? im : null;
  }
  const loadImg = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
  /** Phone screenshots: keep only the post (drop the black status bar / bands), then shrink to ≤ 900 px JPEG. */
  async function prepRef(dataUrl) {
    const im = await loadImg(dataUrl);
    const w = 120, h = Math.max(1, Math.round(im.naturalHeight * (w / im.naturalWidth)));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const dark = [];
    for (let y = 0; y < h; y++) { let d = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (px[i] + px[i + 1] + px[i + 2] < 54) d++; } dark.push(d / w > 0.88); }
    let best = [0, h], run = null;
    for (let y = 0; y <= h; y++) { if (y < h && !dark[y]) { if (run === null) run = y; } else if (run !== null) { if (y - run > best[1] - best[0] || best[1] - best[0] === h) best = (y - run > 0.3 * h) ? [run, y] : best; run = null; } }
    let [t, b] = best;
    if (b - t >= h * 0.95) { t = 0; b = h; }
    const sy = Math.round(t * im.naturalHeight / h), sh = Math.round((b - t) * im.naturalHeight / h);
    const s = Math.min(1, 900 / Math.max(im.naturalWidth, sh));
    const out = document.createElement('canvas'); out.width = Math.round(im.naturalWidth * s); out.height = Math.round(sh * s);
    out.getContext('2d').drawImage(im, 0, sy, im.naturalWidth, sh, 0, 0, out.width, out.height);
    return { data: out.toDataURL('image/jpeg', 0.82), cropped: t > 0 || b < h };
  }
  /** Honest fallback without a vision model: colours measured from the pixels only. */
  async function measure(c, ids) {
    const top = [], bot = [], acc = [];
    for (const id of ids) {
      const m = media(c, id); if (!m) continue;
      const im = await loadImg(m.data).catch(() => null); if (!im) continue;
      const w = 64, h = Math.max(1, Math.round(im.naturalHeight * 64 / im.naturalWidth)), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.drawImage(im, 0, 0, w, h); const p = g.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, hx = toHex([p[i], p[i + 1], p[i + 2]]);
        if (y < h * 0.12) top.push(hx); else if (y > h * 0.9) bot.push(hx);
        if (sat(hx) > 0.45 && lum(hx) > 0.45 && lum(hx) < 0.9) acc.push(hx);
      }
    }
    const avg = (a) => a.length ? toHex([0, 1, 2].map((k) => a.reduce((s, h) => s + rgbOf(h)[k], 0) / a.length)) : null;
    const bg0 = avg(top), bg1 = avg(bot.filter((h) => lum(h) < 0.4)) || bg0;
    if (!bg0) return null;
    const accent = avg(acc) || kitStyle(c).accent, light = lum(bg0) > 0.5;
    return { bg: [bg0, bg1], ink: light ? '#0E1726' : '#FFFFFF', accent, sub: light ? '#3A4A63' : '#DCE8F5', palette: [bg0, accent], read: 'pixels' };
  }

  /* ---------- the compositor (one canvas per preview; 1080 design units) ---------- */
  const fmtH = (fmt) => (fmt === '4:5' ? 1350 : W);
  function pickLogo(c, bg) {
    const vs = (typeof brandLogos === 'function' ? brandLogos(c) : []).map((v) => ({ v, m: media(c, v.id) })).filter((o) => o.m);
    if (!vs.length) return null;
    const dk = lum(bg) < 0.5;
    const fit = (o) => (o.v.use === (dk ? 'dark' : 'light') ? 3 : o.v.use === 'auto' && o.m.tone === (dk ? 'light' : 'dark') ? 2 : o.v.use === 'auto' && !o.m.tone ? 1 : 0);
    vs.sort((a, b) => fit(b) - fit(a));
    return { id: vs[0].m.id, ok: fit(vs[0]) > 0 };
  }
  function wrap(g, text, max) {
    const words = String(text || '').split(/\s+/).filter(Boolean), out = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w; } }
    if (cur) out.push(cur);
    return out;
  }
  /** The illustration with soft edges, at the size it is drawn on screen (z = design size × scale). */
  function feather(im, z, f) {
    const S_ = Math.max(64, Math.round(z));
    const cv = document.createElement('canvas'); cv.width = cv.height = S_;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0, S_, S_);
    g.globalCompositeOperation = 'destination-in';
    const band = (x0, y0, x1, y1, a) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(Math.min(1, a), 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, S_, S_); };
    if (f.t) band(0, 0, 0, S_, f.t); if (f.b) band(0, S_, 0, 0, f.b); if (f.l) band(0, 0, S_, 0, f.l); if (f.r) band(S_, 0, 0, 0, f.r);
    return cv;
  }
  /** Draw one slide. P = { st, copy, ill (img|null), logo ({id,ok}|null), fmt, layout, lang, slide, slides, kicker } */
  function draw(cv, P, scale) {
    const H = fmtH(P.fmt), st = P.st, ar = P.lang === 'ar', c = C();
    cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    const g = cv.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, st.bg[0]); bg.addColorStop(1, st.bg[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const gl = g.createRadialGradient(W * 0.6, H * 0.74, 0, W * 0.6, H * 0.74, W * 0.62); gl.addColorStop(0, rgba(st.accent, 0.16)); gl.addColorStop(1, rgba(st.accent, 0)); g.fillStyle = gl; g.fillRect(0, 0, W, H);
    const m = 78, cover = !P.slide, last = P.slide && P.slide === P.slides - 1 && P.copy.cta;
    const lay = cover ? P.layout : 'stack';
    // 1. measure the official logo (the company's own file, placed — never drawn) and the text block
    let lg = null, lh = 0;
    if (P.logo && st.logoPos !== 'none') {
      const li = img(c, P.logo.id);
      if (li) {
        let h = last ? 96 : 58, w = h * li.naturalWidth / li.naturalHeight; if (w > (last ? 460 : 300)) { w = last ? 460 : 300; h = w * li.naturalHeight / li.naturalWidth; }
        const pos = last ? 'c' : st.logoPos;
        lg = { li, w, h, x: last ? (W - w) / 2 : pos[1] === 'r' ? W - m - w : m, y: last ? H * 0.62 : pos[0] === 't' ? m * 0.72 : H - m * 0.72 - h };
        if (pos[0] === 't') lh = h;
      }
    }
    const face = (wt, px) => `${wt} ${px}px ${ar ? '"Noto Sans Arabic","Plus Jakarta Sans"' : '"Plus Jakarta Sans","Noto Sans Arabic"'},system-ui,sans-serif`;
    g.direction = ar ? 'rtl' : 'ltr'; g.textAlign = ar ? 'right' : 'left'; g.textBaseline = 'alphabetic';
    const up = (s) => (st.upper && !ar ? String(s || '').toUpperCase() : String(s || ''));
    const textW = cover && lay === 'split' ? W * 0.48 - m : W - 2 * m;
    const tx = ar ? (cover && lay === 'split' ? W * 0.52 : W - m) : m;
    const ops = []; // text drawn after the picture
    let bottom = 0;
    if (cover) {
      const l1 = up(P.copy.l1), l2 = up(P.copy.l2), maxL = lay === 'split' ? 6 : 3;
      let fs = lay === 'split' ? 70 : 82, L1, L2;
      for (; fs >= 46; fs -= 4) { g.font = face(800, fs); L1 = wrap(g, l1, textW); L2 = wrap(g, l2, textW); if (L1.length + L2.length <= maxL) break; }
      let y = (lay === 'split' ? H * 0.26 : m * 0.72 + (lh ? lh + 64 : 36)) + fs * 0.82;
      L1.forEach((s) => { ops.push([face(800, fs), st.ink, s, tx, y]); y += fs * 1.08; });
      L2.forEach((s) => { ops.push([face(800, fs), st.twoTone !== false ? st.accent : st.ink, s, tx, y]); y += fs * 1.08; });
      if (P.copy.sub && st.sub) { y += 8; g.font = face(500, 32); wrap(g, P.copy.sub, textW).slice(0, lay === 'split' ? 4 : 2).forEach((s) => { ops.push([face(500, 32), st.sub, s, tx, y]); y += 44; }); }
      bottom = y - 20;
      if (st.footnote && P.copy.foot) ops.push([face(400, 22), rgba(st.sub || st.ink, 0.75), P.copy.foot, tx, H - m * 0.6]);
    }
    // 2. the illustration — part of the composition, blended into the series background (never a framed picture in a
    //    banner) and fitted to the space the text leaves, so the subject never sits under the headline
    if (P.ill) {
      if (cover && lay === 'stack') {
        const S_ = Math.max(W * 0.62, Math.min(W * 1.06, (H - bottom) / 0.86)), y = H - S_ * 0.97;
        g.drawImage(feather(P.ill, S_ * scale, { t: 0.3, l: S_ < W ? 0.16 : 0.08, r: S_ < W ? 0.16 : 0.08 }), (W - S_) / 2, y, S_, S_);
      } else if (cover && lay === 'split') { const S_ = H; g.drawImage(feather(P.ill, S_ * scale, { l: 0.5, t: 0.06, b: 0.06 }), P.made === 'split' ? (ar ? -S_ * 0.08 : W - S_ * 0.92) : (ar ? -S_ * 0.3 : W - S_ * 0.7), 0, S_, S_); }
      else if (cover && lay === 'hero') {
        const S_ = Math.max(W, H); g.drawImage(P.ill, (W - S_) / 2, H - S_, S_, S_);
        const ov = g.createLinearGradient(0, 0, 0, Math.min(H, bottom + 140)); ov.addColorStop(0, rgba(st.bg[0], 0.94)); ov.addColorStop(0.75, rgba(st.bg[0], 0.75)); ov.addColorStop(1, rgba(st.bg[0], 0)); g.fillStyle = ov; g.fillRect(0, 0, W, Math.min(H, bottom + 140));
      } else { g.save(); g.globalAlpha = last ? 0.35 : 0.2; const S_ = W * 0.62; g.drawImage(feather(P.ill, S_ * scale, { t: 0.3, l: 0.3 }), W - S_ * 0.9, H - S_ * 0.9, S_, S_); g.restore(); }
    }
    // 3. logo and text on top
    if (lg) g.drawImage(lg.li, lg.x, lg.y, lg.w, lg.h);
    if (cover) {
      ops.forEach(([f, col, s, x, y]) => { g.font = f; g.fillStyle = col; g.fillText(s, x, y); });
    } else if (last) {
      g.textAlign = 'center'; g.font = face(800, 76); g.fillStyle = st.ink; let y = H * 0.36;
      wrap(g, P.copy.cta, W - 2 * m).slice(0, 3).forEach((s) => { g.fillText(s, W / 2, y); y += 86; });
      g.font = face(600, 30); g.fillStyle = st.accent; g.fillText(P.kicker || '', W / 2, y + 20);
    } else {
      const pt = (P.copy.pts || [])[P.slide - 1] || '';
      g.font = face(800, 150); g.fillStyle = st.accent; g.fillText(String(P.slide).padStart(2, '0'), tx, m * 0.72 + (lh ? lh + 60 : 30) + 130);
      g.font = face(800, 68); g.fillStyle = st.ink; let y = m * 0.72 + (lh ? lh + 60 : 30) + 250;
      wrap(g, up(pt), W - 2 * m).slice(0, 6).forEach((s) => { g.fillText(s, tx, y); y += 80; });
      g.font = face(600, 28); g.fillStyle = rgba(st.sub || st.ink, 0.85); g.fillText(`${P.kicker || ''}  ·  ${P.slide}/${P.slides - 1 - (P.copy.cta ? 1 : 0)}`, tx, H - m * 0.7);
    }
  }
  /** Register a preview; the canvas is painted right after each render (and when a picture finishes loading). */
  function cvHTML(key, spec, scale, label, cls) {
    SX.specs[key] = spec;
    const P = spec();
    return `<canvas class="sx-cv ${cls || ''}" data-sxp="${esc(key)}" data-sc="${scale}" width="${Math.round(W * scale)}" height="${Math.round(fmtH(P.fmt) * scale)}" role="img" aria-label="${esc(label || [P.copy.l1, P.copy.l2].filter(Boolean).join(' '))}"></canvas>`;
  }
  function paintAll() {
    document.querySelectorAll('canvas[data-sxp]').forEach((cv) => {
      const f = SX.specs[cv.dataset.sxp];
      if (!f) return;
      try { draw(cv, f(), +cv.dataset.sc || 0.5); } catch (e) { console.error('series preview', e); }
    });
  }

  /* ---------- the post being made (one per series; persisted so a refresh keeps it) ---------- */
  function draftOf(c, s) {
    const D = draftsOf(c);
    let d = D[s.id];
    if (!d) d = D[s.id] = { topic: '', lang: lang(), fmt: 'single', aspect: null, copy: { l1: '', l2: '', sub: '', pts: ['', '', ''], foot: '', caption: '', cta: '' }, concept: '', drafted: false, vars: [], pick: null, rec: null, facts: null, warn: null, claims: null, ack: false, at: Date.now() };
    // a picture still "pending" after a reload / restart was interrupted: say so, never show it as finished
    d.vars.forEach((v) => { if (v.status === 'pending' && !SX.busy[v.id] && Date.now() - (v.t || 0) > PEND_MS) { v.status = 'failed'; v.err = L('Interrupted (the page or the server restarted). Try again.', 'انقطع (أُعيد تحميل الصفحة أو الخادم). حاول مجدداً.'); } });
    return d;
  }
  /** The AI headline as the series writes it: sentence case when the style says so (acronyms kept), and — for a two-tone
   *  style — two lines: at a sentence break, else at a natural joint near the middle ("Three questions / before building…"). */
  function splitHead(h, st) {
    let t = String(h || '').trim();
    const w0 = t.split(/\s+/);
    if ((!st || (st.case || 'sentence') === 'sentence') && w0.length > 2 && w0.filter((w) => /^[A-Z][a-z]/.test(w)).length >= w0.length * 0.6)
      t = w0.map((w, i) => (i && /^[A-Z][a-z]+[.,:;!?]?$/.test(w) ? w.toLowerCase() : w)).join(' ');
    const m = t.match(/^(.+?[.!?:؟])\s+(.+)$/);
    if (m) return [m[1], m[2].charAt(0).toUpperCase() + m[2].slice(1)];
    if (st && st.twoTone === false) return [t, ''];
    const w = t.split(/\s+/);
    if (w.length < 4) return [t, ''];
    const J = /^(before|after|for|to|with|without|when|while|that|and|but|so|in|on|vs\.?|or|قبل|بعد|مع|عندما|لكن|في)$/i;
    let k = -1;
    for (let i = 2; i < w.length - 1; i++) if (J.test(w[i]) && (k < 0 || Math.abs(i - w.length / 2) < Math.abs(k - w.length / 2))) k = i;
    if (k < 0) k = Math.ceil(w.length / 2);
    return [w.slice(0, k).join(' '), w.slice(k).join(' ')];
  }
  const aspectOf = (c, s, d) => d.aspect || ((fixStyle(styleOf(c, s)).aspects || [])[0] === '4:5' ? '4:5' : '1:1');
  const slidesOf = (d) => (d.fmt === 'carousel' ? 1 + d.copy.pts.filter((x) => x.trim()).length + (d.copy.cta ? 1 : 0) : 1);
  function specOf(c, s, d, v, slide, st0) {
    return () => {
      const st = fixStyle(st0 || styleOf(c, s));
      return { st, copy: { ...d.copy, pts: d.copy.pts.filter((x) => x.trim()) }, ill: v && v.ill ? img(c, v.ill) : null, made: (v && v.made) || 'stack', logo: pickLogo(c, st.bg[0]), fmt: d.aspect || ((st.aspects || [])[0] === '4:5' ? '4:5' : '1:1'), layout: (v && v.layout) || st.layout, lang: d.lang, slide: slide || 0, slides: slidesOf(d), kicker: s.name };
    };
  }
  function dropMedia(c, id) {
    if (!id) return;
    const used = creativesOf(c).some((k) => k.ill === id) || Object.values(draftsOf(c)).some((d) => d.vars.some((v) => v.ill === id));
    if (!used) { c.media = c.media.filter((m) => m.id !== id); delete SX.img[id]; }
  }

  /* ---------- views ---------- */
  const chip = (t, cls) => `<span class="sx-chip ${cls || ''}">${t}</span>`;
  const swatches = (st) => `<span class="sx-sw" aria-hidden="true">${[st.bg[0], st.bg[1], st.accent, st.ink].filter(isHex).map((h) => `<i style="background:${h}"></i>`).join('')}</span>`;
  const styleState = (s) => (s.style ? chip('✓ ' + L('Signature style approved', 'الأسلوب المميز معتمد'), 'ok') : s.styleProp ? chip(L('Style waiting for your review', 'أسلوب بانتظار مراجعتك'), 'warn') : chip(L('Style not set yet', 'لم يُحدَّد الأسلوب بعد'), ''));

  function homeView(c) {
    const ss = serOf(c), R_ = typeof nxRun === 'function' ? nxRun(c) : { recs: [] }, all = creativesOf(c);
    const head = ph(L('AI Content Series', 'سلاسل المحتوى الذكية'), L('Recurring branded posts in your own signature style. Teach BrandPilot how a series looks, give it a topic, approve a finished post.', 'منشورات متكررة بأسلوب علامتك المميز. علّم BrandPilot شكل السلسلة، أعطه موضوعاً، واعتمد منشوراً جاهزاً.'), `<button class="btn pri" data-a="sxNewT">${ic('plus', 16)}${L('New series', 'سلسلة جديدة')}</button>`);
    const setup = S.ui.sxNew || !ss.length ? setupHTML(c, !ss.length) : '';
    const cards = ss.map((s) => {
      const st = fixStyle(styleOf(c, s)), mine = all.filter((k) => k.sid === s.id), refs = refsOf(c, s.id), rec = R_.recs.find((r) => r.sid === s.id), d = draftsOf(c)[s.id];
      const pics = mine.slice(-3).reverse().map((k) => cvHTML('h-' + k.id, specOf(c, s, k, { ill: k.ill, layout: k.layout, made: k.made }, 0, k.st), 0.3, k.copy.l1)).concat(refs.slice(-3).map((x) => `<img src="${media(c, x.img).data}" alt="${esc(L('Reference post', 'منشور مرجعي'))}" loading="lazy">`)).slice(0, 3);
      const topic = (rec && rec.topic) || String(s.ideas || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || '';
      return `<article class="sx-card" style="--sx-a:${st.bg[0]};--sx-b:${st.bg[1]};--sx-c:${st.accent}">
        <button class="sx-card-art" data-a="sxOpen" data-v="${esc(s.id)}" aria-label="${esc(L('Open series', 'افتح السلسلة') + ' ' + s.name)}">${pics.length ? `<span class="sx-fan n${pics.length}">${pics.join('')}</span>` : `<span class="sx-card-empty">${ic('upload', 22)}<span>${L('Add previous posts to show this series’ look', 'أضف منشورات سابقة لإظهار شكل هذه السلسلة')}</span></span>`}</button>
        <div class="sx-card-b"><div class="sx-card-t"><h3 dir="auto">${esc(s.name)}</h3>${swatches(st)}</div>
        ${s.purpose ? `<p class="sx-pur" dir="auto">${esc(s.purpose)}</p>` : ''}
        <p class="sx-meta">${styleState(s)}${chip((CHN[s.channel] || 'LinkedIn'))}${chip(mine.length + ' ' + L('posts made', 'منشور'))}${d && d.vars.length ? chip(L('Post in progress', 'منشور قيد الإعداد'), 'warn') : ''}</p>
        ${rec && rec.kind !== 'start' ? `<p class="sx-rec small">${nxBadge(rec.level)} ${nxText(c, rec).t}</p>` : ''}
        <form class="sx-quick" data-s="sxQuick" data-v="${esc(s.id)}"><input name="t" dir="auto" maxlength="200" value="${esc(topic)}" aria-label="${esc(L('Topic for the next post', 'موضوع المنشور التالي'))}" placeholder="${esc(L('Topic for the next post…', 'موضوع المنشور التالي…'))}"><button class="btn pri sm">${L('Create', 'أنشئ')}</button></form></div></article>`;
    }).join('');
    const next = ss.length ? nextHTML(c, R_) : '';
    const recent = all.slice(-8).reverse();
    const gal = recent.length ? `<section class="sx-sec"><h2>${L('Latest posts', 'أحدث المنشورات')}</h2><div class="sx-gal">${recent.map((k) => { const s = ss.find((x) => x.id === k.sid); return s ? `<button class="sx-gi" data-a="sxZoomK" data-v="${esc(k.id)}">${cvHTML('g-' + k.id, specOf(c, s, k, { ill: k.ill, layout: k.layout, made: k.made }, 0, k.st), 0.3, k.copy.l1)}<span>${k.status === 'approved' ? chip('✓ ' + L('Approved', 'معتمد'), 'ok') : chip(L('Saved draft', 'مسودة محفوظة'))}</span></button>` : ''; }).join('')}</div></section>` : '';
    return head + setup + next + (ss.length ? `<div class="sx-lib">${cards}</div>` : '') + gal + zoomHTML(c);
  }

  /** "What to post next" — the recommendations from the company's own post results, one card at a time (moved from Performance). */
  function nextHTML(c, R_) {
    if (typeof nxTop !== 'function') return '';
    const top = nxTop(R_), pick = top.find((r) => r.id === S.ui.nxPick) || top[0], rest = top.filter((r) => r !== pick).slice(0, 3);
    const main = pick ? nxCard(c, pick, true) : `<section class="card nx-card"><p class="nx-b">${R_.hidden ? L('You set aside every suggestion for now.', 'أجّلت كل الاقتراحات حالياً.') : L('No suggestion yet — see below what BrandPilot needs.', 'لا اقتراح بعد — انظر أدناه ما يحتاجه BrandPilot.')}</p>${R_.hidden ? `<button class="btn" data-a="nxUnskip">${L('Show them again', 'اعرضها مجدداً')}</button>` : ''}</section>`;
    const more = rest.length || R_.hidden ? `<section class="card"><h3 style="margin-top:0">${L('Other ideas', 'أفكار أخرى')}</h3>${rest.map((r) => nxCard(c, r, false)).join('')}${R_.hidden && pick ? `<button class="btn sm" data-a="nxUnskip" style="margin-top:8px">${L(`Show ${R_.hidden} set-aside idea(s)`, `اعرض ${R_.hidden} فكرة مؤجلة`)}</button>` : ''}</section>` : '';
    return `<section class="sx-sec sx-next2" id="sx-next"><h2>${L('What to post next', 'ماذا تنشر بعد ذلك')}</h2><p class="muted">${L('From your own imported post results. A finding needs enough comparable posts; otherwise it is labelled as an experiment.', 'من نتائج منشوراتك المستوردة. النتيجة تحتاج منشورات كافية قابلة للمقارنة؛ وإلا تُوسم كتجربة.')}</p><div class="sx-next2-g"><div class="stack">${main}</div><div class="stack">${more}${nxMissHTML(c, R_)}</div></div></section>`;
  }

  const PURPOSES = () => [[L('Practical education', 'تعليم عملي'), L('Practical, educational posts that help our audience make better decisions.', 'منشورات عملية تعليمية تساعد جمهورنا على اتخاذ قرارات أفضل.')], [L('Technology news', 'أخبار التقنية'), L('Short explanations of relevant technology news and what it means for our audience.', 'شرح قصير لأخبار التقنية المهمة وما تعنيه لجمهورنا.')], [L('Tips', 'نصائح'), L('One useful, practical tip per post.', 'نصيحة عملية مفيدة في كل منشور.')], [L('Industry insights', 'رؤى القطاع'), L('Insights about our industry, trends and common mistakes.', 'رؤى عن قطاعنا والاتجاهات والأخطاء الشائعة.')], [L('Thought leadership', 'قيادة فكرية'), L('Our point of view on where our field is going.', 'وجهة نظرنا في اتجاه مجالنا.')]];
  function setupHTML(c, first) {
    const f = SX.form || (SX.form = { name: '', purpose: '', channel: 'linkedin', objective: 'engagement', sources: [] });
    const ideas = typeof nxIdeas === 'function' ? nxIdeas(c).slice(0, 5) : [];
    const srcs = (c.sources || []).filter((x) => c.findings.some((ff) => ff.src === x.id && ff.status === 'approved'));
    return `<section class="card sx-setup">${first ? `<div class="sx-how"><div><b>1</b><span>${L('Name a recurring series', 'سمِّ سلسلة متكررة')}</span></div><div><b>2</b><span>${L('Upload a few previous posts', 'ارفع بعض المنشورات السابقة')}</span></div><div><b>3</b><span>${L('Approve the signature style', 'اعتمد الأسلوب المميز')}</span></div><div><b>4</b><span>${L('Give a topic — get a finished post', 'أعطِ موضوعاً — واحصل على منشور جاهز')}</span></div></div>` : ''}
      <form data-s="sxCreate" class="sx-form"><h2>${L('New content series', 'سلسلة محتوى جديدة')}</h2>
      <label class="f">${L('Series name', 'اسم السلسلة')}<input name="name" required maxlength="60" dir="auto" value="${esc(f.name)}" placeholder="${esc(L('e.g. Build Smarter', 'مثال: Build Smarter'))}"></label>
      ${ideas.length ? `<p class="small sx-sug"><span class="muted">${L('From your approved themes', 'من موضوعاتك المعتمدة')}:</span> ${ideas.map((t) => `<button type="button" class="btn sm ghost" data-a="sxSug" data-k="name" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</p>` : ''}
      <label class="f">${L('What is it for?', 'ما الغرض منها؟')}<textarea name="purpose" rows="2" maxlength="400" dir="auto" placeholder="${esc(L('One sentence — or pick one below', 'جملة واحدة — أو اختر من الأسفل'))}">${esc(f.purpose)}</textarea></label>
      <p class="small sx-sug">${PURPOSES().map(([t, p]) => `<button type="button" class="btn sm ghost" data-a="sxSug" data-k="purpose" data-v="${esc(p)}">${esc(t)}</button>`).join('')}</p>
      <div class="sx-row"><label class="f">${L('Main channel', 'القناة الرئيسية')}<select name="channel">${['linkedin', 'instagram', 'facebook'].map((k) => `<option value="${k}" ${f.channel === k ? 'selected' : ''}>${CHN[k]}</option>`).join('')}</select></label>
      <label class="f">${L('Goal', 'الهدف')}<select name="objective">${Object.keys(NXO).map((k) => `<option value="${k}" ${f.objective === k ? 'selected' : ''}>${nxL(NXO[k])}</option>`).join('')}</select></label></div>
      ${srcs.length ? `<fieldset class="sx-src"><legend class="small"><b>${L('Knowledge it may use', 'المعرفة التي يمكنها استخدامها')}</b> <span class="muted">${L('(approved facts only; none ticked = all approved knowledge)', '(الحقائق المعتمدة فقط؛ بلا تحديد = كل المعرفة المعتمدة)')}</span></legend>${srcs.map((x) => `<label class="small"><input type="checkbox" name="src" value="${esc(x.id)}"> ${esc(x.title || x.id)}</label>`).join('')}</fieldset>` : ''}
      <p class="muted small">${L('Your brand kit (colours, official logo) is applied automatically. You can change everything later.', 'تُطبَّق هوية علامتك (الألوان والشعار الرسمي) تلقائياً. يمكنك تغيير كل شيء لاحقاً.')}</p>
      <div class="row"><button class="btn pri">${L('Create series', 'أنشئ السلسلة')}</button>${first ? '' : `<button type="button" class="btn ghost" data-a="sxNewT">${L('Cancel', 'إلغاء')}</button>`}</div></form></section>`;
  }

  function seriesView(c, s) {
    const st = fixStyle(styleOf(c, s)), d = draftOf(c, s), refs = refsOf(c, s.id), mine = creativesOf(c).filter((k) => k.sid === s.id).reverse();
    const lg = pickLogo(c, st.bg[0]);
    const head = `<div class="sx-top"><button class="linklike" data-a="sxHome">${S.lang === 'ar' ? '→' : '←'} ${L('All series', 'كل السلاسل')}</button></div>
      <header class="sx-hero" style="--sx-a:${st.bg[0]};--sx-b:${st.bg[1]};--sx-c:${st.accent}"><div><p class="sx-eyebrow">${L('AI Content Series', 'سلاسل المحتوى الذكية')}</p><h1 dir="auto">${esc(s.name)}</h1>${s.purpose ? `<p dir="auto">${esc(s.purpose)}</p>` : ''}<p class="sx-meta">${styleState(s)}${chip(CHN[s.channel] || 'LinkedIn')}${chip(nxL(NXO[s.objective] || NXO.engagement))}${chip(mine.length + ' ' + L('posts', 'منشور'))}</p></div>${swatches(st)}</header>`;
    const warnLogo = !lg ? `<p class="note w">${L('No official logo in the brand kit — the post is made without one. BrandPilot never draws a logo. Add it under Your company → Brand.', 'لا شعار رسمي في هوية العلامة — يُصنع المنشور بدونه. لا يرسم BrandPilot شعاراً أبداً. أضفه من شركتك ← الهوية.')}</p>` : !lg.ok ? `<p class="note w">${L('Your logo versions are all meant for light backgrounds; it may be hard to read on this background. Add a light version in the brand kit.', 'نسخ شعارك مخصصة للخلفيات الفاتحة؛ قد يصعب رؤيته على هذه الخلفية. أضف نسخة فاتحة في الهوية.')}</p>` : '';
    if (!d.drafted && !d.copy.l1 && !d.vars.length && !s.topicAI && !SX.autoT[s.id] && !topicIdeas(c, s, null).length) { SX.autoT[s.id] = 1; setTimeout(() => aiTopics(c, s, true), 0); }
    return head + `<div class="sx-ws"><div class="sx-main">${composerHTML(c, s, d, st)}${warnLogo}${resultsHTML(c, s, d)}${postsHTML(c, s, mine)}</div><aside class="sx-side">${styleHTML(c, s, st)}${refsHTML(c, s, refs)}${learnHTML(c, s)}${workHTML(c, s)}</aside></div>` + zoomHTML(c);
  }

  function composerHTML(c, s, d, st) {
    const busy = SX.busy['draft-' + s.id], R_ = typeof nxRun === 'function' ? nxRun(c) : { recs: [] }, rec = R_.recs.find((r) => r.sid === s.id);
    const recBox = d.rec ? `<div class="sx-recbox"><p class="small"><b>${L('From a recommendation', 'من توصية')}</b> ${nxBadge(d.rec.level)} · ${L('Goal', 'الهدف')}: ${nxL(NXO[d.rec.objective] || NXO.engagement)} · ${CHN[d.rec.channel] || ''} · ${L('Format', 'الشكل')}: ${nxL(NXF[d.rec.format] || NXF.single)}</p>${d.rec.why ? `<p class="small" dir="auto">${esc(d.rec.why)}</p>` : ''}${d.rec.measure ? `<p class="muted small" dir="auto">${esc(d.rec.measure)}</p>` : ''}</div>` : '';
    const step = !d.drafted && !d.copy.l1 ? 1 : !d.vars.length ? 2 : 3;
    const steps = [L('Topic', 'الموضوع'), L('Words', 'الكلمات'), L('Creatives', 'التصاميم')].map((t, i) => `<li class="${i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}">${t}</li>`).join('');
    const topicRow = `<form class="sx-topic" data-s="sxPrep" data-v="${esc(s.id)}"><label class="sr-only" for="sxT">${L('Topic', 'الموضوع')}</label><input id="sxT" name="t" dir="auto" maxlength="200" value="${esc(d.topic)}" placeholder="${esc(L('What is the next post about?', 'عن ماذا المنشور التالي؟'))}"><button class="btn pri" ${busy ? 'disabled' : ''}>${busy ? L('Preparing…', 'جارٍ التجهيز…') : d.drafted ? L('Re-draft with AI', 'أعد الصياغة بالذكاء') : L('Prepare with AI', 'جهّز بالذكاء الاصطناعي')}</button></form>
      <div class="sx-opts" role="group" aria-label="${esc(L('Format', 'الشكل'))}">${[['single', L('Single image', 'صورة واحدة')], ['carousel', L('Carousel', 'منشور دوّار')]].map(([k, t]) => `<button class="sx-seg ${d.fmt === k ? 'on' : ''}" aria-pressed="${d.fmt === k}" data-a="sxFmt" data-v="${k}">${t}</button>`).join('')}<span class="sx-sp"></span>${[['1:1', '1:1'], ['4:5', '4:5']].map(([k, t]) => `<button class="sx-seg ${aspectOf(c, s, d) === k ? 'on' : ''}" aria-pressed="${aspectOf(c, s, d) === k}" data-a="sxAsp" data-v="${k}" title="${k === '4:5' ? L('Portrait — more space in the feed', 'طولي — مساحة أكبر في الخلاصة') : L('Square', 'مربع')}">${t}</button>`).join('')}<span class="sx-sp"></span>${['en', 'ar'].map((k) => `<button class="sx-seg ${d.lang === k ? 'on' : ''}" aria-pressed="${d.lang === k}" data-a="sxLang" data-v="${k}">${k === 'en' ? 'English' : 'العربية'}</button>`).join('')}</div>`;
    const words = d.drafted || d.copy.l1 ? wordsHTML(c, s, d) : '';
    return `<section class="card sx-comp"><div class="sx-comp-h"><h2>${L('New post', 'منشور جديد')}</h2><ol class="sx-steps">${steps}</ol>${d.topic || d.vars.length ? `<button class="btn sm ghost" data-a="sxReset" data-v="${esc(s.id)}">${L('Start over', 'ابدأ من جديد')}</button>` : ''}</div>${recBox}${topicRow}${step === 1 && !busy ? topicsHTML(c, s, rec) : ''}${words}</section>`;
  }

  /** Topic ideas for one series: the recommended topic, the series' own topic list, then AI ideas — topics already made are left out. */
  function topicIdeas(c, s, rec) {
    const seen = new Set(creativesOf(c).filter((k) => k.sid === s.id).map((k) => norm(k.topic || ''))), out = [];
    const add = (t, src, why, fmt) => { t = String(t || '').trim(); const k = norm(t); if (!t || seen.has(k)) return; seen.add(k); out.push({ t, src, why: why || '', fmt: fmt || '' }); };
    if (rec && rec.topic) add(rec.topic, 'rec', '', nxFmt(rec));
    String(s.ideas || '').split(/\r?\n/).forEach((t) => add(t, 'list'));
    ((s.topicAI || {}).items || []).forEach((x) => add(x.t, 'ai', x.why, x.fmt));
    return out;
  }
  function topicsHTML(c, s, rec) {
    const ideas = topicIdeas(c, s, rec).slice(0, 8), busy = SX.busy['topics-' + s.id], ai = s.topicAI;
    const tag = (i) => i.src === 'rec' ? chip(L('Recommended from your results', 'موصى به من نتائجك'), 'ok') : i.src === 'list' ? chip(L('Your topic list', 'قائمة مواضيعك')) : chip(L('AI idea', 'فكرة ذكاء اصطناعي'));
    return `<div class="sx-tops"><div class="sx-tops-h"><div><h3>${L('Topic ideas for', 'أفكار مواضيع لـ')} <span dir="auto">${esc(s.name)}</span></h3><p class="muted small">${L('Pick one — BrandPilot writes the words in the series style. Or type your own topic above.', 'اختر واحداً — يكتب BrandPilot الكلمات بأسلوب السلسلة. أو اكتب موضوعك أعلاه.')}</p></div>
      <button class="btn sm" data-a="sxTopics" data-v="${esc(s.id)}" ${busy ? 'disabled' : ''}>${busy ? L('Thinking of topics…', 'جارٍ التفكير في مواضيع…') : ai ? L('More ideas', 'أفكار أخرى') : L('Suggest topics with AI', 'اقترح مواضيع بالذكاء الاصطناعي')}</button></div>
      ${ideas.length ? `<div class="sx-tl">${ideas.map((i) => `<button class="sx-ti" data-a="sxIdea" data-v="${esc(s.id)}" data-k="${esc(i.t)}" data-f="${esc(i.fmt)}"><span class="sx-tt" dir="auto">${esc(i.t)}</span>${i.why ? `<span class="sx-tw" dir="auto">${esc(i.why)}</span>` : ''}<span class="sx-tm">${tag(i)}${i.fmt === 'carousel' ? chip(L('Carousel', 'منشور دوّار')) : ''}</span></button>`).join('')}</div>`
        : busy ? `<p class="muted small">${L('BrandPilot is thinking of topics for this series…', 'يفكر BrandPilot في مواضيع لهذه السلسلة…')}</p>` : `<p class="muted small">${L('No topic ideas yet. Ask the AI, or type your own topic above.', 'لا أفكار مواضيع بعد. اطلبها من الذكاء الاصطناعي، أو اكتب موضوعك أعلاه.')}</p>`}
      ${ai && !ai.facts ? `<p class="muted small">${L('These AI ideas come from the series purpose only — approve facts in Your company for ideas closer to what you do.', 'أفكار الذكاء الاصطناعي هذه من غرض السلسلة فقط — اعتمد حقائق في شركتك لأفكار أقرب لعملك.')}</p>` : ''}</div>`;
  }
  async function aiTopics(c, s, quiet) {
    const key = 'topics-' + s.id;
    if (SX.busy[key]) return;
    if (!(await aiOn())) { if (!quiet) toast(L('The AI is not set up on this server — type your own topic.', 'الذكاء الاصطناعي غير مُعدّ — اكتب موضوعك بنفسك.'), 'err'); return; }
    const d = draftOf(c, s), have = creativesOf(c).filter((k) => k.sid === s.id).map((k) => k.topic || '').concat(topicIdeas(c, s, null).map((i) => i.t)).filter(Boolean).slice(-40);
    SX.busy[key] = 1; R();
    try {
      await synced(c);
      const r = await api('POST', '/api/companies/' + c.id + '/series/topics', { series: { name: s.name, purpose: s.purpose || '', objective: s.objective || 'engagement', audience: s.audience || '', sources: s.sources || [] }, channel: s.channel || 'linkedin', lang: d.lang === 'ar' ? 'ar' : 'en', have });
      const prev = (s.topicAI && s.topicAI.items) || [];
      s.topicAI = { items: r.topics.map((x) => ({ t: x.topic, why: x.why, fmt: x.format })).concat(prev).slice(0, 16), facts: r.facts, model: r.model, at: Date.now() };
    } catch (e) { if (!quiet) toast(errMsg(e), 'err'); }
    delete SX.busy[key]; save(); if (C() === c) R();
  }

  function wordsHTML(c, s, d) {
    const fld = (k, l, v, max, ph_) => `<label class="f">${l}<input data-i="sxIn" data-k="${k}" dir="auto" maxlength="${max}" value="${esc(v)}" ${ph_ ? `placeholder="${esc(ph_)}"` : ''}></label>`;
    const st = fixStyle(styleOf(c, s)), busy = d.vars.some((v) => v.status === 'pending');
    const warn = (d.warn && d.warn.length) || (d.claims && d.claims.length);
    return `<div class="sx-words"><div class="sx-wl">
      ${fld('l1', L('Headline — line 1', 'العنوان — السطر 1'), d.copy.l1, 90)}
      ${fld('l2', L('Headline — line 2', 'العنوان — السطر 2') + (st.twoTone !== false ? ` <span class="sx-dot" style="background:${st.accent}" title="${esc(L('accent colour', 'لون التمييز'))}"></span>` : ''), d.copy.l2, 90, L('optional', 'اختياري'))}
      ${fld('sub', L('Supporting line', 'السطر الداعم'), d.copy.sub, 160)}
      <fieldset class="sx-pts"><legend>${d.fmt === 'carousel' ? L('Points — one slide each', 'النقاط — شريحة لكل نقطة') : L('Points — in the caption', 'النقاط — في النص المرافق')}</legend>${[0, 1, 2].map((i) => `<input data-i="sxIn" data-k="p${i}" dir="auto" maxlength="90" value="${esc(d.copy.pts[i] || '')}" aria-label="${esc(L('Point', 'نقطة') + ' ' + (i + 1))}">`).join('')}</fieldset>
      ${d.fmt === 'carousel' ? fld('cta', L('Closing slide', 'الشريحة الختامية'), d.copy.cta, 60) : ''}
      ${st.footnote ? fld('foot', L('Source line (small, bottom)', 'سطر المصدر (صغير، أسفل)'), d.copy.foot, 90, L('e.g. Source: Google Developers Blog, 9 Nov 2026', 'مثال: المصدر: مدونة مطوري Google')) : ''}
      </div><div class="sx-wr">
      <label class="f">${L('Caption', 'النص المرافق')}<textarea data-i="sxIn" data-k="caption" rows="7" dir="auto" maxlength="3000">${esc(d.copy.caption)}</textarea></label>
      <label class="f">${L('Visual concept for the illustration', 'فكرة الرسم')}<textarea data-i="sxIn" data-k="concept" rows="3" dir="auto" maxlength="600">${esc(d.concept)}</textarea></label>
      ${warn ? `<div class="note w small">${d.warn && d.warn.length ? `<p>${L('Numbers not found in your approved knowledge', 'أرقام غير موجودة في معرفتك المعتمدة')}: <b>${esc(d.warn.join(', '))}</b></p>` : ''}${d.claims && d.claims.length ? `<p>${L('Statements about the company to check', 'عبارات عن الشركة يجب التحقق منها')}:</p><ul>${d.claims.map((x) => `<li dir="auto">${esc(x)}</li>`).join('')}</ul>` : ''}<label><input type="checkbox" data-c="sxAck" ${d.ack ? 'checked' : ''}> ${L('I checked these', 'تحققت منها')}</label></div>` : ''}
      ${d.facts && d.facts.length ? `<details class="small"><summary>${L('Approved knowledge used', 'المعرفة المعتمدة المستخدمة')} (${d.facts.length})</summary><ul>${d.facts.map((f) => `<li dir="auto">${esc(f.text)}</li>`).join('')}</ul></details>` : ''}
      </div></div>
      <div class="sx-genbar"><button class="btn pri" data-a="sxGen" data-v="${esc(s.id)}" ${busy || !d.copy.l1.trim() ? 'disabled' : ''}>${ic('spark', 16)}${d.vars.length ? L('Make 2 new creatives', 'اصنع تصميمين جديدين') : L('Generate 2 creatives', 'أنشئ تصميمين')}</button><span class="muted small">${L('Each creative: a new illustration in the series style + your official logo + this text as real type. You can edit the words after generating.', 'كل تصميم: رسم جديد بأسلوب السلسلة + شعارك الرسمي + هذا النص ككتابة حقيقية. يمكنك تعديل الكلمات بعد الإنشاء.')}</span></div>`;
  }

  function resultsHTML(c, s, d) {
    if (!d.vars.length) return '';
    const n = slidesOf(d);
    const card = (v, i) => {
      const on = d.pick === v.id, st = v.status;
      const body = st === 'pending' ? `<div class="sx-wait" style="aspect-ratio:${aspectOf(c, s, d) === '4:5' ? '4/5' : '1/1'}"><span class="sx-spin" aria-hidden="true"></span><b>${L('Painting the illustration…', 'جارٍ رسم الصورة…')}</b><span class="muted small">${L('Usually 5–40 seconds. The words and logo are added as soon as it arrives.', 'عادة 5–40 ثانية. تُضاف الكلمات والشعار فور وصوله.')}</span></div>`
        : st === 'failed' ? `<div class="sx-wait bad" style="aspect-ratio:${aspectOf(c, s, d) === '4:5' ? '4/5' : '1/1'}"><b>${L('No illustration', 'لا يوجد رسم')}</b><span class="small">${esc(v.err || '')}</span><span class="row"><button class="btn sm" data-a="sxRe" data-v="${esc(v.id)}">${L('Try again', 'حاول مجدداً')}</button><label class="btn sm">${L('Upload your own', 'ارفع رسمك')}<input type="file" accept="image/png,image/jpeg,image/webp" data-c="sxOwnIll" data-v="${esc(v.id)}" class="sr-only"></label></span></div>`
        : `<button class="sx-pv" data-a="sxZoom" data-v="${esc(v.id)}" aria-label="${esc(L('Inspect full size', 'افحص بالحجم الكامل'))}">${cvHTML('v-' + v.id, specOf(c, s, d, v, 0), 0.55)}</button>${n > 1 ? `<div class="sx-strip">${Array.from({ length: n - 1 }, (_, k) => cvHTML(`v-${v.id}-${k + 1}`, specOf(c, s, d, v, k + 1), 0.14, L('Slide', 'شريحة') + ' ' + (k + 2))).join('')}</div>` : ''}`;
      return `<article class="sx-var ${on ? 'on' : ''}">${body}<div class="sx-var-f">
        <label class="sx-pick"><input type="radio" name="sxpick" data-c="sxPick" value="${esc(v.id)}" ${on ? 'checked' : ''} ${st !== 'ready' ? 'disabled' : ''}> ${L('Option', 'خيار')} ${String.fromCharCode(65 + i)}</label>
        ${st === 'ready' ? `<span class="sx-lay" role="group" aria-label="${esc(L('Layout', 'التخطيط'))}">${[['stack', L('Text top', 'النص أعلى')], ['split', L('Side by side', 'جنباً إلى جنب')], ['hero', L('Full picture', 'صورة كاملة')]].map(([k, t]) => `<button class="sx-seg sm ${v.layout === k ? 'on' : ''}" aria-pressed="${v.layout === k}" data-a="sxLay" data-v="${esc(v.id)}" data-k="${k}">${t}</button>`).join('')}</span>
        ${v.layout !== (v.made || 'stack') && v.model !== 'upload' ? `<p class="small sx-hint">${L('This picture was painted for another layout.', 'رُسمت هذه الصورة لتخطيط آخر.')} <button class="btn sm" data-a="sxRe" data-v="${esc(v.id)}">${L('Repaint for this layout', 'أعد الرسم لهذا التخطيط')}</button></p>` : ''}<details class="sx-ref"><summary class="btn sm ghost">${L('Refine illustration', 'حسّن الرسم')}</summary><form data-s="sxRefine" data-v="${esc(v.id)}"><input name="note" maxlength="200" dir="auto" value="${esc(v.note || '')}" placeholder="${esc(L('e.g. a woman founder at a desk, warmer light, fewer objects', 'مثال: مؤسِّسة على مكتب، إضاءة أدفأ، عناصر أقل'))}"><button class="btn sm">${L('New illustration', 'رسم جديد')}</button></form></details>` : ''}
      </div></article>`;
    };
    const pick = d.vars.find((v) => v.id === d.pick && v.status === 'ready');
    const needAck = ((d.warn && d.warn.length) || (d.claims && d.claims.length)) && !d.ack;
    return `<section class="sx-res"><div class="sx-res-h"><h2>${L('Compare and choose', 'قارن واختر')}</h2><button class="btn sm" data-a="sxMore" data-v="${esc(s.id)}" ${d.vars.some((v) => v.status === 'pending') ? 'disabled' : ''}>${L('Another variation', 'تنويع آخر')}</button></div>
      <div class="sx-vars">${d.vars.map(card).join('')}</div>
      <div class="sx-act"><button class="btn pri" data-a="sxSave" data-v="${esc(s.id)}" ${pick ? '' : 'disabled'}>${L('Save to series', 'احفظ في السلسلة')}</button><button class="btn" data-a="sxSave" data-v="${esc(s.id)}" data-k="approve" ${pick && !needAck ? '' : 'disabled'}>${ic('check', 16)}${L('Save and approve', 'احفظ واعتمد')}</button><button class="btn ghost" data-a="sxDl" data-v="${esc(pick ? pick.id : '')}" ${pick ? '' : 'disabled'}>${ic('dl', 16)}${L('Download PNG', 'نزّل PNG')}</button>
      <span class="muted small">${!pick ? L('Choose an option first.', 'اختر خياراً أولاً.') : needAck ? L('Check the flagged statements before approving.', 'تحقق من العبارات المُعلَّمة قبل الاعتماد.') : L('Editable Canva copy: not available for series posts yet — download the PNG or the illustration.', 'نسخة Canva قابلة للتعديل: غير متاحة لمنشورات السلاسل بعد — نزّل PNG أو الرسم.')}</span></div></section>`;
  }

  function postsHTML(c, s, mine) {
    if (!mine.length) return '';
    return `<section class="sx-sec"><h2>${L('Posts in this series', 'منشورات هذه السلسلة')}</h2><div class="sx-gal">${mine.map((k) => `<button class="sx-gi" data-a="sxZoomK" data-v="${esc(k.id)}">${cvHTML('p-' + k.id, specOf(c, s, k, { ill: k.ill, layout: k.layout, made: k.made }, 0, k.st), 0.3, k.copy.l1)}<span>${k.status === 'approved' ? chip('✓ ' + L('Approved', 'معتمد'), 'ok') : chip(L('Saved draft', 'مسودة محفوظة'))}${k.rec ? chip(L('From recommendation', 'من توصية')) : ''}</span><span class="small" dir="auto">${esc(k.topic)}</span></button>`).join('')}</div></section>`;
  }

  function styleHTML(c, s, st) {
    const P = s.styleProp, rd = (r) => ({ vision: L('Read by AI from your reference posts', 'قرأه الذكاء الاصطناعي من منشوراتك المرجعية'), pixels: L('Colours measured from pixels only — the rest is from your brand kit (no AI looked at the pictures)', 'ألوان مقاسة من البكسلات فقط — والباقي من هوية علامتك (لم ينظر الذكاء الاصطناعي إلى الصور)'), kit: L('From your brand kit — not learned from posts yet', 'من هوية علامتك — لم يُتعلَّم من المنشورات بعد') }[r] || '');
    if (P) {
      const p = fixStyle(P.style), col = (k, l) => `<label class="sx-col">${l}<input type="color" value="${esc((k === 'bg0' ? p.bg[0] : k === 'bg1' ? p.bg[1] : p[k]).toLowerCase())}" data-c="sxSt" data-k="${k}"></label>`;
      const sel = (k, l, o) => `<label class="f">${l}<select data-c="sxSt" data-k="${k}">${o.map(([v, t]) => `<option value="${v}" ${String(p[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
      const txt = (k, l, rows) => `<label class="f">${l}<textarea data-c="sxSt" data-k="${k}" rows="${rows}" dir="auto">${esc(p[k] || '')}</textarea></label>`;
      return `<section class="card sx-style rev"><h2>${L('Review the signature style', 'راجع الأسلوب المميز')}</h2><p class="muted small">${rd(P.read)}${P.model ? ' · ' + esc(P.model) : ''}${P.seen ? ' · ' + P.seen + ' ' + L('pictures seen', 'صور شوهدت') : ''}</p>
        <div class="sx-mini">${cvHTML('sp-' + s.id, () => ({ st: fixStyle(s.styleProp ? s.styleProp.style : st), copy: { l1: L('Your headline here.', 'عنوانك هنا.'), l2: L('Second line in accent.', 'سطر ثانٍ مميز.'), sub: L('A supporting line under the headline', 'سطر داعم تحت العنوان'), pts: [] }, ill: null, logo: pickLogo(c, fixStyle(s.styleProp ? s.styleProp.style : st).bg[0]), fmt: '1:1', layout: fixStyle(s.styleProp ? s.styleProp.style : st).layout, lang: lang(), slide: 0, slides: 1, kicker: s.name }), 0.28, L('Style preview', 'معاينة الأسلوب'))}</div>
        ${P.notes && P.notes.length ? `<details class="small"><summary>${L('What the AI saw in each picture', 'ما رآه الذكاء الاصطناعي في كل صورة')}</summary><ul>${P.notes.map((x) => `<li dir="auto">${esc(x)}</li>`).join('')}</ul></details>` : ''}
        <div class="sx-cols">${col('bg0', L('Background top', 'الخلفية أعلى'))}${col('bg1', L('Background bottom', 'الخلفية أسفل'))}${col('ink', L('Headline', 'العنوان'))}${col('accent', L('Accent', 'التمييز'))}${col('sub', L('Supporting', 'الداعم'))}</div>
        ${sel('layout', L('Layout', 'التخطيط'), [['stack', L('Headline on top, illustration below', 'العنوان أعلى والرسم أسفل')], ['split', L('Text one side, illustration the other', 'النص في جانب والرسم في الآخر')], ['hero', L('Full illustration, text over a calm area', 'رسم كامل ونص فوق منطقة هادئة')]])}
        ${sel('logoPos', L('Official logo position', 'موضع الشعار الرسمي'), [['tr', L('Top right', 'أعلى اليمين')], ['tl', L('Top left', 'أعلى اليسار')], ['br', L('Bottom right', 'أسفل اليمين')], ['bl', L('Bottom left', 'أسفل اليسار')], ['none', L('No logo', 'بدون شعار')]])}
        <div class="sx-checks"><label class="small"><input type="checkbox" data-c="sxSt" data-k="twoTone" ${p.twoTone !== false ? 'checked' : ''}> ${L('Second headline line in the accent colour', 'السطر الثاني من العنوان بلون التمييز')}</label><label class="small"><input type="checkbox" data-c="sxSt" data-k="footnote" ${p.footnote ? 'checked' : ''}> ${L('Small source line at the bottom', 'سطر مصدر صغير في الأسفل')}</label></div>
        ${txt('illustration', L('Illustration style', 'أسلوب الرسم'), 3)}${txt('headline', L('Headline structure', 'بنية العنوان'), 2)}${txt('tone', L('Editorial tone', 'النبرة التحريرية'), 2)}
        <p class="muted small">${L('This is design direction only. Nothing written on your reference posts becomes a company fact.', 'هذا توجيه تصميمي فقط. لا يصبح أي شيء مكتوب في منشوراتك المرجعية حقيقة عن الشركة.')}</p>
        <div class="row"><button class="btn pri" data-a="sxStOk" data-v="${esc(s.id)}">${L('Approve this style', 'اعتمد هذا الأسلوب')}</button><button class="btn ghost" data-a="sxStX" data-v="${esc(s.id)}">${L('Discard', 'تجاهل')}</button></div></section>`;
    }
    return `<section class="card sx-style"><div class="sx-style-h"><h2>${L('Signature style', 'الأسلوب المميز')}</h2>${s.style ? `<button class="btn sm ghost" data-a="sxStEd" data-v="${esc(s.id)}">${L('Edit', 'عدّل')}</button>` : ''}</div>
      <div class="sx-mini">${cvHTML('ss-' + s.id, () => ({ st: fixStyle(styleOf(c, s)), copy: { l1: s.name + '.', l2: L('Same look, new topic.', 'نفس الشكل، موضوع جديد.'), sub: '', pts: [] }, ill: null, logo: pickLogo(c, fixStyle(styleOf(c, s)).bg[0]), fmt: '1:1', layout: fixStyle(styleOf(c, s)).layout, lang: lang(), slide: 0, slides: 1, kicker: s.name }), 0.28, L('Style preview', 'معاينة الأسلوب'))}</div>
      <p class="muted small">${s.style ? `${rd(s.style.read)}${s.style.approvedAt ? ' · ' + L('approved', 'اعتُمد') + ' ' + esc(s.style.approvedAt) : ''}` : rd('kit')}</p>
      ${s.style ? `<ul class="sx-spec small"><li>${esc(s.style.illustration || '')}</li><li>${esc(s.style.headline || '')}</li><li>${L('Logo', 'الشعار')}: ${esc({ tr: L('top right', 'أعلى اليمين'), tl: L('top left', 'أعلى اليسار'), br: L('bottom right', 'أسفل اليمين'), bl: L('bottom left', 'أسفل اليسار'), none: L('none', 'لا شيء') }[st.logoPos])}</li></ul>` : `<p class="small">${L('Upload 3–8 previous posts of this series, select them, and let BrandPilot read the style. Or approve the brand-kit style as it is.', 'ارفع 3–8 منشورات سابقة من هذه السلسلة وحددها ودع BrandPilot يقرأ الأسلوب. أو اعتمد أسلوب الهوية كما هو.')}</p><button class="btn sm" data-a="sxStKit" data-v="${esc(s.id)}">${L('Review the brand-kit style', 'راجع أسلوب الهوية')}</button>`}</section>`;
  }

  function refsHTML(c, s, refs) {
    const sel = refs.filter((x) => x.ref), busy = SX.busy['read-' + s.id];
    return `<section class="card sx-refs"><h2>${L('Creative references', 'المراجع الإبداعية')}</h2><p class="muted small">${L('Previous posts that show how this series looks. Used for style only — never as company facts.', 'منشورات سابقة تُظهر شكل هذه السلسلة. تُستخدم للأسلوب فقط — وليس كحقائق عن الشركة.')}</p>
      <label class="sx-drop">${ic('upload', 18)}<span>${L('Add previous posts (images, several at once)', 'أضف منشورات سابقة (صور، عدة مرات واحدة)')}</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" data-c="sxRefUp" data-v="${esc(s.id)}" class="sr-only"></label>
      ${refs.length ? `<div class="sx-rg">${refs.map((x) => `<div class="sx-rt ${x.ref ? 'on' : ''}"><img src="${media(c, x.img).data}" alt="${esc(x.cap || L('Reference post', 'منشور مرجعي'))}" loading="lazy"><label><input type="checkbox" data-c="sxRefSel" value="${esc(x.id)}" ${x.ref ? 'checked' : ''}> ${L('Style', 'أسلوب')}</label><button class="sx-rx" data-a="sxRefDel" data-v="${esc(x.id)}" aria-label="${esc(L('Remove reference', 'احذف المرجع'))}">${ic('x', 14)}</button></div>`).join('')}</div>
      <div class="row"><button class="btn sm pri" data-a="sxRead" data-v="${esc(s.id)}" ${!sel.length || busy ? 'disabled' : ''}>${busy ? L('Reading the pictures…', 'جارٍ قراءة الصور…') : L(`Read the style from ${Math.min(6, sel.length)} selected`, `اقرأ الأسلوب من ${Math.min(6, sel.length)} محددة`)}</button><button class="btn sm ghost" data-a="sxMeasure" data-v="${esc(s.id)}" ${!sel.length ? 'disabled' : ''} title="${esc(L('Without AI: measures colours only', 'بدون ذكاء اصطناعي: يقيس الألوان فقط'))}">${L('Measure colours only', 'قِس الألوان فقط')}</button></div>` : ''}</section>`;
  }

  /** The company's own best organic posts on the series' channel — writing guidance from results, never market data. */
  function workHTML(c, s) {
    const R = root.BPRecs, ch = s.channel || 'linkedin', posts = ((c.data && c.data.meta) || []).filter((r) => r.platform === ch && !(+r.spend > 0));
    if (!R || !posts.length) return '';
    const ss = serOf(c), man = typeof psOf === 'function' ? psOf(c) : {};
    const best = (o) => posts.map((r) => ({ r, v: R.measure([r], o).value, n: +r.reach || 0 })).filter((x) => x.v != null && (o === 'awareness' || x.n >= 100)).sort((a, b) => b.v - a.v).slice(0, 2);
    const fmtV = (o, v) => o === 'awareness' ? fmt(Math.round(v)) + ' ' + L('reach', 'وصول') : (v * 100).toFixed(1) + '%';
    const rows = [['engagement', L('Most engaging', 'الأكثر تفاعلاً'), L('engagements ÷ reach', 'التفاعلات ÷ الوصول')], ['awareness', L('Widest reach', 'الأوسع وصولاً'), ''], ['traffic', ch === 'linkedin' ? L('Most clicks', 'أكثر نقرات') : L('Most link clicks (closest to leads)', 'أكثر نقرات روابط (الأقرب للعملاء)'), ch === 'linkedin' ? L('clicks ÷ reach — LinkedIn counts every click on a post, such as opening the image or “see more”, not only link clicks, so this is not a leads measure', 'النقرات ÷ الوصول — LinkedIn يحسب كل نقرة على المنشور مثل فتح الصورة أو «عرض المزيد»، وليس نقرات الروابط فقط، لذا ليس مقياساً للعملاء') : L('clicks ÷ reach', 'النقرات ÷ الوصول')]]
      .map(([o, t, m]) => [o, t, m, best(o)]).filter((x) => x[3].length);
    if (!rows.length) return '';
    const sname = (r) => { const x = R.seriesOf(r, ss, man); const z = x.sid && ss.find((y) => y.id === x.sid); return z ? z.name : ''; };
    return `<section class="card sx-work"><h2>${L('What works in your posts', 'ما ينجح في منشوراتك')}</h2><p class="muted small">${L(`Your best organic ${CHN[ch] || ch} posts so far — use them as a guide for headline, format and tone. From your imported results only, not market data.`, `أفضل منشوراتك العضوية على ${CHN[ch] || ch} حتى الآن — استرشد بها في العنوان والشكل والأسلوب. من نتائجك المستوردة فقط، ليست بيانات سوق.`)}</p>
      ${rows.map(([o, t, m, xs]) => `<h3>${t}${m ? ` <span class="muted small">(${m})</span>` : ''}</h3><ul>${xs.map((x) => `<li><b>${fmtV(o, x.v)}</b> <span dir="auto">${esc(String(x.r.text || L('(no text)', '(بدون نص)')).slice(0, 110))}</span> <span class="muted small">· ${esc(String(x.r.date || '').slice(0, 10))}${sname(x.r) ? ' · ' + esc(sname(x.r)) : ''}</span></li>`).join('')}</ul>`).join('')}
      ${posts.length < 5 ? `<p class="muted small">${L('Fewer than 5 posts — a hint, not a pattern.', 'أقل من 5 منشورات — تلميح لا نمط.')}</p>` : ''}</section>`;
  }

  function learnHTML(c, s) {
    const R_ = typeof nxRun === 'function' ? nxRun(c) : { recs: [] }, rec = R_.recs.find((r) => r.sid === s.id);
    if (!rec) return '';
    return `<section class="card sx-learn"><h2>${L('What the results suggest', 'ما تقترحه النتائج')}</h2><p class="small">${nxBadge(rec.level)}</p><p class="small" dir="auto">${nxText(c, rec).t}</p>${rec.kind === 'start' || rec.level === 'test' ? `<p class="muted small">${L('Not enough comparable posts yet — treat this as an experiment, not a finding.', 'لا توجد منشورات كافية قابلة للمقارنة بعد — اعتبرها تجربة لا نتيجة.')}</p>` : ''}${rec.topic ? `<button class="btn sm" data-a="sxRec" data-v="${esc(rec.id)}">${L('Use this suggestion', 'استخدم هذا الاقتراح')}</button>` : ''} <button class="linklike small" data-a="sxPerf" data-v="${esc(rec.id)}">${L('See the evidence', 'اعرض الأدلة')}</button></section>`;
  }

  function zoomHTML(c) {
    const z = S.ui.sxZ;
    if (!z) return '';
    let spec, k = null, s = null, n = 1, title = '';
    if (z.k) { k = creativesOf(c).find((x) => x.id === z.k); s = k && serOf(c).find((x) => x.id === k.sid); if (!k || !s) return ''; n = slidesOf(k); title = k.topic; }
    else { s = serOf(c).find((x) => x.id === z.sid); const d = s && draftsOf(c)[s.id], v = d && d.vars.find((x) => x.id === z.v); if (!v || v.status !== 'ready') return ''; n = slidesOf(d); title = d.topic; spec = (i) => specOf(c, s, d, v, i); }
    if (k) spec = (i) => specOf(c, s, k, { ill: k.ill, layout: k.layout, made: k.made }, i, k.st);
    const i = Math.min(z.i || 0, n - 1);
    return `<div class="sx-zoom" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sx-zoom-in"><div class="sx-zoom-h"><b dir="auto">${esc(title)}</b>${n > 1 ? `<span class="row">${Array.from({ length: n }, (_, j) => `<button class="sx-seg sm ${j === i ? 'on' : ''}" data-a="sxZi" data-v="${j}">${j + 1}</button>`).join('')}</span>` : ''}<button class="btn sm ghost" data-a="sxZx" aria-label="${esc(L('Close', 'أغلق'))}">${ic('x', 18)}</button></div>
      ${cvHTML('z', spec(i), 0.7)}
      ${k ? `<div class="sx-zoom-f"><p class="small">${k.status === 'approved' ? chip('✓ ' + L('Approved', 'معتمد') + (k.approvedBy ? ' · ' + esc(k.approvedBy) : '') + ' · ' + esc(k.approvedAt || ''), 'ok') : chip(L('Saved draft', 'مسودة محفوظة'))}${k.rec ? ' ' + chip(L('From recommendation', 'من توصية') + ': ' + esc(nxL(NXO[k.rec.objective] || NXO.engagement))) : ''}</p>${k.copy.caption ? `<details class="small"><summary>${L('Caption', 'النص المرافق')}</summary><p dir="auto" style="white-space:pre-wrap">${esc(k.copy.caption)}</p><button class="btn sm" data-a="sxCopyCap" data-v="${esc(k.id)}">${ic('copy', 14)}${L('Copy caption', 'انسخ النص')}</button></details>` : ''}
      <div class="row">${k.status !== 'approved' ? `<button class="btn pri sm" data-a="sxAppr" data-v="${esc(k.id)}">${ic('check', 14)}${L('Approve', 'اعتمد')}</button>` : `<button class="btn sm" data-a="sxUnappr" data-v="${esc(k.id)}">${L('Back to draft', 'أعده مسودة')}</button>`}<button class="btn sm" data-a="sxDlK" data-v="${esc(k.id)}">${ic('dl', 14)}${L('Download PNG', 'نزّل PNG')}</button><button class="btn sm ghost" data-a="sxDlIll" data-v="${esc(k.id)}">${L('Illustration only', 'الرسم فقط')}</button><button class="btn sm ghost" data-a="sxEdit" data-v="${esc(k.id)}">${L('Edit as a new post', 'عدّل كمنشور جديد')}</button><button class="btn sm ghost" data-a="sxDelK" data-v="${esc(k.id)}">${L('Delete', 'احذف')}</button></div></div>` : ''}</div></div>`;
  }

  function view(c) {
    const s = curSeries(c);
    if (S.ui.sx && !s) S.ui.sx = null;
    return `<div class="sx">${s ? seriesView(c, s) : homeView(c)}</div>`;
  }

  /* ---------- actions ---------- */
  const go = (sid) => { S.ui.sx = sid; S.ui.sxZ = null; if (S.ui.view !== 'series') A.go('series'); else { R(); scrollTo(0, 0); } };
  function startDraft(c, s, topic, rec) {
    const old = draftsOf(c)[s.id];
    if (old) { delete draftsOf(c)[s.id]; old.vars.forEach((v) => dropMedia(c, v.ill)); }
    const d = draftOf(c, s);
    d.topic = String(topic || '').trim().slice(0, 200);
    if (rec) { d.rec = rec; if (rec.format === 'carousel') d.fmt = 'carousel'; }
    return d;
  }
  async function aiDraft(c, s) {
    const d = draftOf(c, s), key = 'draft-' + s.id;
    if (SX.busy[key]) return;
    if (!d.topic.trim()) return toast(L('Type a topic first.', 'اكتب موضوعاً أولاً.'), 'err');
    if (!(await aiOn())) { if (!d.copy.l1) d.copy.l1 = d.topic; d.drafted = true; save(); R(); return toast(L('The AI is not set up on this server — write the words yourself.', 'الذكاء الاصطناعي غير مُعدّ — اكتب الكلمات بنفسك.'), 'err'); }
    const st = fixStyle(styleOf(c, s)), ex = refsOf(c, s.id).filter((x) => x.cap).slice(-5).map((x) => x.cap);
    SX.busy[key] = 1; R();
    try {
      await synced(c);
      const r = await api('POST', '/api/companies/' + c.id + '/recs/draft', { series: { name: s.name, purpose: s.purpose || '', objective: s.objective || 'engagement', audience: s.audience || '', sources: s.sources || [] }, topic: d.topic, channel: s.channel || 'linkedin', lang: d.lang, format: d.fmt === 'carousel' ? 'carousel' : 'single', examples: ex, style: { colors: [st.bg[0], st.accent, st.ink].filter(isHex), note: [st.headline && 'Headline: ' + st.headline, st.tone && 'Tone: ' + st.tone, st.illustration && 'Illustration: ' + st.illustration].filter(Boolean).join(' ').slice(0, 600) } });
      if (!r.draft) toast(L('No approved knowledge yet — approve facts in Your company first, or write the words yourself.', 'لا معرفة معتمدة بعد — اعتمد الحقائق أولاً أو اكتب الكلمات بنفسك.'), 'err');
      else {
        const x = r.draft, [a, b] = splitHead(x.headline, st);
        Object.assign(d.copy, { l1: a, l2: b, sub: x.support || '', pts: [0, 1, 2].map((i) => x.points[i] || ''), caption: x.caption + (x.hashtags.length ? '\n\n' + x.hashtags.join(' ') : ''), cta: x.cta || '' });
        d.concept = x.visual || d.topic; d.facts = r.facts; d.drafted = true; d.ack = false;
        const w = r.warnings || []; d.warn = (w.find((y) => y.code === 'unsupported_numbers') || {}).numbers || null; d.claims = (w.find((y) => y.code === 'company_claims') || {}).claims || null;
        toast(L('Draft ready — edit anything, then generate.', 'المسودة جاهزة — عدّل ما تشاء ثم أنشئ.'), 'ok');
      }
    } catch (e) { toast(errMsg(e), 'err'); if (!d.copy.l1) d.copy.l1 = d.topic; d.drafted = true; }
    delete SX.busy[key]; save(); R();
  }
  async function genVar(c, s, d, v) {
    v.status = 'pending'; v.t = Date.now(); v.err = ''; SX.busy[v.id] = 1; save(); R();
    const st = fixStyle(styleOf(c, s));
    try {
      const r = await api('POST', '/api/companies/' + c.id + '/series/illustration', { style: { bg: st.bg, palette: (st.palette.filter((h) => !skinLike(h)).length ? st.palette.filter((h) => !skinLike(h)) : [st.accent]), illustration: st.illustration || '' }, concept: (d.concept || d.topic).slice(0, 600), layout: v.layout, note: v.note || '', variant: v.variant });
      const mid = uid('m'), old = v.ill;
      c.media.push({ id: mid, name: 'Series illustration — ' + d.topic.slice(0, 60), data: r.image, series: s.id });
      v.ill = mid; v.status = 'ready'; v.model = r.model; v.prompt = r.prompt; v.made = v.layout; dropMedia(c, old);
      if (!d.pick) d.pick = v.id;
    } catch (e) { v.status = 'failed'; v.err = errMsg(e, 'img'); }
    delete SX.busy[v.id]; save(); if (C() === c) R();
  }
  function newVars(c, s, d, n) {
    const st = fixStyle(styleOf(c, s)), base = creativesOf(c).filter((k) => k.sid === s.id).length + d.vars.length;
    const out = Array.from({ length: n }, (_, i) => ({ id: uid('sv'), layout: st.layout, variant: (base + i) % 4, status: 'pending', ill: null, note: '' }));
    d.vars.push(...out);
    return out;
  }
  function download(c, s, k, v) {
    const n = slidesOf(k), base = (s.name + '-' + (k.topic || 'post')).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'post';
    for (let i = 0; i < n; i++) {
      const cv = document.createElement('canvas');
      draw(cv, specOf(c, s, k, v, i, k.st)(), 1);
      cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = base + (n > 1 ? `-${i + 1}` : '') + '.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }, 'image/png');
    }
  }

  const actions = {
    sxHome() { S.ui.sx = null; S.ui.sxZ = null; R(); scrollTo(0, 0); },
    sxOpen(sid) { go(sid); },
    sxNewT() { S.ui.sxNew = !S.ui.sxNew; R(); },
    sxSug(v, el) { const f = el.closest('form'), k = el.dataset.k; if (f && f.elements[k]) { f.elements[k].value = v; f.elements[k].focus(); } },
    sxCreate(fd) {
      const c = C(), name = String(fd.get('name') || '').trim().slice(0, 60);
      if (!name) return toast(L('Name the series.', 'سمِّ السلسلة.'), 'err');
      if (serOf(c).some((s) => norm(s.name) === norm(name))) return toast(L('A series with this name exists.', 'توجد سلسلة بهذا الاسم.'), 'err');
      const s = { id: uid('sr'), at: Date.now(), name, purpose: String(fd.get('purpose') || '').trim().slice(0, 400), objective: Object.keys(NXO).includes(fd.get('objective')) ? fd.get('objective') : 'engagement', channel: ['linkedin', 'instagram', 'facebook'].includes(fd.get('channel')) ? fd.get('channel') : 'linkedin', audience: '', ideas: '', sources: fd.getAll('src').map(String).slice(0, 20), themes: [], look: '' };
      serOf(c).push(s); SX.form = null; S.ui.sxNew = false;
      log(c, 'campaign', `Content series “${name}” created`, `تم إنشاء سلسلة المحتوى «${name}»`);
      toast(L('Series created. Next: add a few previous posts so BrandPilot learns its look.', 'أُنشئت السلسلة. التالي: أضف منشورات سابقة ليتعلم BrandPilot شكلها.'), 'ok');
      save(); go(s.id);
    },
    sxQuick(fd, f) { const c = C(), s = serOf(c).find((x) => x.id === f.dataset.v); if (!s) return; const t = String(fd.get('t') || '').trim(); if (!t) return toast(L('Type a topic.', 'اكتب موضوعاً.'), 'err'); startDraft(c, s, t, null); save(); go(s.id); aiDraft(c, s); },
    sxIdea(sid, el) { const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s) return; const d = draftOf(c, s); d.topic = el.dataset.k; if (!d.rec && (el.dataset.f === 'carousel' || el.dataset.f === 'single')) d.fmt = el.dataset.f; save(); aiDraft(c, s); },
    sxTopics(sid) { const c = C(), s = serOf(c).find((x) => x.id === sid); if (s) aiTopics(c, s, false); },
    sxPrep(fd, f) { const c = C(), s = serOf(c).find((x) => x.id === f.dataset.v); if (!s) return; const d = draftOf(c, s), t = String(fd.get('t') || '').trim().slice(0, 200); if (t !== d.topic && d.vars.length) startDraft(c, s, t, d.rec); else d.topic = t; aiDraft(c, s); },
    sxReset(sid) { const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s) return; const d = draftsOf(c)[sid]; if (d) { delete draftsOf(c)[sid]; d.vars.forEach((v) => dropMedia(c, v.ill)); } save(); R(); },
    sxFmt(v) { const c = C(), s = curSeries(c); if (!s) return; draftOf(c, s).fmt = v === 'carousel' ? 'carousel' : 'single'; save(); R(); },
    sxAsp(v) { const c = C(), s = curSeries(c); if (!s) return; draftOf(c, s).aspect = v === '4:5' ? '4:5' : '1:1'; save(); R(); },
    sxLang(v) { const c = C(), s = curSeries(c); if (!s) return; const d = draftOf(c, s); if (d.lang === v) return; d.lang = v === 'ar' ? 'ar' : 'en'; save(); R(); if (d.drafted && d.topic) toast(L('Language changed — use “Re-draft with AI” to write the words in this language.', 'تغيّرت اللغة — استخدم «أعد الصياغة» لكتابة الكلمات بهذه اللغة.')); },
    sxIn(val, el) { const c = C(), s = curSeries(c); if (!s) return; const d = draftOf(c, s), k = el.dataset.k; if (/^p\d$/.test(k)) d.copy.pts[+k[1]] = val; else if (k === 'concept') d.concept = val; else d.copy[k] = val; save(); paintAll(); const g = document.querySelector('[data-a="sxGen"]'); if (g && k === 'l1') g.disabled = !val.trim() || d.vars.some((v) => v.status === 'pending'); },
    sxAck(v, el) { const c = C(), s = curSeries(c); if (!s) return; draftOf(c, s).ack = !!el.checked; save(); R(); },
    sxGen(sid) { const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s) return; const d = draftOf(c, s); if (!d.copy.l1.trim()) return; if (!d.drafted) d.drafted = true; newVars(c, s, d, 2).forEach((v) => genVar(c, s, d, v)); },
    sxMore(sid) { const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s) return; const d = draftOf(c, s); newVars(c, s, d, 1).forEach((v) => genVar(c, s, d, v)); },
    sxRe(id) { const c = C(), s = curSeries(c), d = s && draftOf(c, s), v = d && d.vars.find((x) => x.id === id); if (v) genVar(c, s, d, v); },
    sxRefine(fd, f) { const c = C(), s = curSeries(c), d = s && draftOf(c, s), v = d && d.vars.find((x) => x.id === f.dataset.v); if (!v) return; v.note = String(fd.get('note') || '').slice(0, 200); v.variant = (v.variant + 1) % 4; genVar(c, s, d, v); },
    sxLay(id, el) { const c = C(), s = curSeries(c), d = s && draftOf(c, s), v = d && d.vars.find((x) => x.id === id); if (!v) return; v.layout = el.dataset.k; save(); R(); },
    sxPick(id) { const c = C(), s = curSeries(c); if (!s) return; draftOf(c, s).pick = id; save(); R(); },
    async sxOwnIll(_, el) {
      const c = C(), s = curSeries(c), d = s && draftOf(c, s), v = d && d.vars.find((x) => x.id === el.dataset.v), f = el.files && el.files[0];
      if (!v || !f) return; if (f.size > 8e6) return toast(L('Image too large (max 8 MB).', 'الصورة كبيرة جداً (8 م.ب).'), 'err');
      const raw = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
      const p = await prepRef(raw).catch(() => null); if (!p) return toast(L('Could not read that image.', 'تعذّرت قراءة الصورة.'), 'err');
      const mid = uid('m'); c.media.push({ id: mid, name: 'Own illustration — ' + d.topic.slice(0, 60), data: p.data, series: s.id }); dropMedia(c, v.ill);
      v.ill = mid; v.status = 'ready'; v.err = ''; v.model = 'upload'; if (!d.pick) d.pick = v.id; save(); R();
    },
    sxSave(sid, el) {
      const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s) return;
      const d = draftOf(c, s), v = d.vars.find((x) => x.id === d.pick && x.status === 'ready'); if (!v) return;
      const ok = el && el.dataset.k === 'approve';
      if (ok && ((d.warn && d.warn.length) || (d.claims && d.claims.length)) && !d.ack) return toast(L('Check the flagged statements first.', 'تحقق من العبارات المُعلَّمة أولاً.'), 'err');
      const k = { id: uid('cr'), sid: s.id, topic: d.topic, lang: d.lang, fmt: d.fmt, aspect: aspectOf(c, s, d), layout: v.layout, made: v.made || 'stack', copy: JSON.parse(JSON.stringify(d.copy)), concept: d.concept, ill: v.ill, model: v.model || '', st: fixStyle(styleOf(c, s)), styleRead: (s.style && s.style.read) || 'kit', rec: d.rec || null, status: ok ? 'approved' : 'saved', at: Date.now(), date: today() };
      if (ok) { k.approvedBy = (typeof USER !== 'undefined' && USER && USER.email) || ''; k.approvedAt = today(); }
      creativesOf(c).push(k);
      delete draftsOf(c)[s.id]; d.vars.forEach((x) => { if (x.ill !== k.ill) dropMedia(c, x.ill); });
      log(c, 'campaign', `Series post “${d.topic}” ${ok ? 'approved' : 'saved'} in ${s.name}`, `منشور السلسلة «${d.topic}» ${ok ? 'اعتُمد' : 'حُفظ'} في ${s.name}`);
      toast(ok ? L('Approved and saved. The next post starts in the same style.', 'اعتُمد وحُفظ. يبدأ المنشور التالي بنفس الأسلوب.') : L('Saved to the series. The next post starts in the same style.', 'حُفظ في السلسلة. يبدأ المنشور التالي بنفس الأسلوب.'), 'ok');
      save(); R(); scrollTo(0, 0);
    },
    sxDl(id) { const c = C(), s = curSeries(c), d = s && draftOf(c, s), v = d && d.vars.find((x) => x.id === id); if (v) download(c, s, d, v); },
    sxDlK(id) { const c = C(), k = creativesOf(c).find((x) => x.id === id), s = k && serOf(c).find((x) => x.id === k.sid); if (k && s) download(c, s, k, { ill: k.ill, layout: k.layout, made: k.made }); },
    sxDlIll(id) { const c = C(), k = creativesOf(c).find((x) => x.id === id), m = k && media(c, k.ill); if (!m) return toast(L('This post has no illustration.', 'لا رسم في هذا المنشور.'), 'err'); const a = document.createElement('a'); a.href = m.data; a.download = 'illustration.' + (/png/.test(m.data.slice(0, 20)) ? 'png' : 'jpg'); a.click(); },
    sxZoom(id) { const c = C(), s = curSeries(c); S.ui.sxZ = { sid: s && s.id, v: id, i: 0 }; R(); },
    sxZoomK(id) { S.ui.sxZ = { k: id, i: 0 }; R(); },
    sxZi(i) { if (S.ui.sxZ) { S.ui.sxZ.i = +i; R(); } },
    sxZx() { S.ui.sxZ = null; R(); },
    sxAppr(id) { const c = C(), k = creativesOf(c).find((x) => x.id === id); if (!k) return; k.status = 'approved'; k.approvedBy = (typeof USER !== 'undefined' && USER && USER.email) || ''; k.approvedAt = today(); log(c, 'approve', `Series post “${k.topic}” approved`, `اعتُمد منشور السلسلة «${k.topic}»`); save(); R(); },
    sxUnappr(id) { const c = C(), k = creativesOf(c).find((x) => x.id === id); if (!k) return; k.status = 'saved'; delete k.approvedBy; delete k.approvedAt; save(); R(); },
    sxDelK(id) { const c = C(), k = creativesOf(c).find((x) => x.id === id); if (!k) return; c.creatives = creativesOf(c).filter((x) => x !== k); dropMedia(c, k.ill); S.ui.sxZ = null; toast(L('Post deleted.', 'حُذف المنشور.'), 'ok'); save(); R(); },
    sxEdit(id) { const c = C(), k = creativesOf(c).find((x) => x.id === id), s = k && serOf(c).find((x) => x.id === k.sid); if (!s) return; const d = startDraft(c, s, k.topic, k.rec); Object.assign(d, { lang: k.lang, fmt: k.fmt, aspect: k.aspect || '1:1', copy: JSON.parse(JSON.stringify(k.copy)), concept: k.concept || k.topic, drafted: true }); const v = { id: uid('sv'), layout: k.layout, made: k.made, variant: 0, status: 'ready', ill: k.ill, note: '', model: k.model }; d.vars.push(v); d.pick = v.id; S.ui.sxZ = null; save(); go(s.id); },
    sxCopyCap(id) { const k = creativesOf(C()).find((x) => x.id === id); if (k && navigator.clipboard) navigator.clipboard.writeText(k.copy.caption).then(() => toast(L('Copied', 'تم النسخ'), 'ok'), () => {}); },
    async sxRefUp(_, el) {
      const c = C(), s = serOf(c).find((x) => x.id === el.dataset.v), fs = [...(el.files || [])].slice(0, 12); el.value = '';
      if (!s || !fs.length) return;
      let n = 0, cut = 0;
      for (const f of fs) {
        if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 12e6) continue;
        const raw = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
        const p = await prepRef(raw).catch(() => null); if (!p) continue;
        const mid = uid('m'); c.media.push({ id: mid, name: 'Reference — ' + f.name.slice(0, 60), data: p.data, ref: true });
        libOf(c).push({ id: uid('lp'), img: mid, cap: '', url: '', plat: s.channel || 'linkedin', date: '', sid: s.id, sig: false, ref: true, avg: null, perf: null, src: 'upload', at: Date.now() });
        n++; if (p.cropped) cut++;
      }
      toast(n ? L(`${n} reference post(s) added${cut ? ` (${cut} phone screenshot(s) trimmed to the post)` : ''}. They are selected for the style read.`, `أُضيف ${n} منشور مرجعي${cut ? ` (قُصّت ${cut} لقطة شاشة إلى المنشور)` : ''}. وهي محددة لقراءة الأسلوب.`) : L('No usable image (PNG, JPEG or WebP, max 12 MB).', 'لا صورة صالحة (PNG أو JPEG أو WebP، 12 م.ب).'), n ? 'ok' : 'err');
      save(); R();
    },
    sxRefSel(v, el) { const it = libOf(C()).find((x) => x.id === v); if (it) { it.ref = !!el.checked; save(); R(); } },
    sxRefDel(id) { const c = C(), it = libOf(c).find((x) => x.id === id); if (!it) return; c.library = libOf(c).filter((x) => x !== it); if (!libOf(c).some((x) => x.img === it.img)) c.media = c.media.filter((m) => m.id !== it.img); save(); R(); },
    async sxRead(sid) {
      const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s) return;
      const ids = refsOf(c, sid).filter((x) => x.ref).slice(-6).map((x) => x.img), key = 'read-' + sid;
      if (!ids.length || SX.busy[key]) return;
      if (!(await aiOn())) return toast(L('The AI is not set up on this server. Use “Measure colours only”.', 'الذكاء الاصطناعي غير مُعدّ. استخدم «قِس الألوان فقط».'), 'err');
      SX.busy[key] = 1; R();
      try {
        const r = await api('POST', '/api/companies/' + c.id + '/series/style-read', { series: s.name, images: ids.map((id) => media(c, id).data) });
        s.styleProp = { style: Object.assign({}, r.style, { read: 'vision' }), read: 'vision', model: r.model, seen: r.seen, notes: r.notes, refs: ids, at: Date.now() };
        toast(L(`Style read from ${r.seen} picture(s). Review it, correct anything, then approve.`, `قُرئ الأسلوب من ${r.seen} صورة. راجعه وصحّح ما تشاء ثم اعتمده.`), 'ok');
      } catch (e) { toast(errMsg(e), 'err'); }
      delete SX.busy[key]; save(); R();
    },
    async sxMeasure(sid) {
      const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s) return;
      const ids = refsOf(c, sid).filter((x) => x.ref).map((x) => x.img), m = await measure(c, ids);
      if (!m) return toast(L('No colours could be measured.', 'تعذّر قياس الألوان.'), 'err');
      s.styleProp = { style: Object.assign(kitStyle(c), m), read: 'pixels', model: '', seen: 0, notes: [], refs: ids, at: Date.now() };
      save(); R();
    },
    sxStKit(sid) { const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s) return; s.styleProp = { style: kitStyle(c), read: 'kit', model: '', seen: 0, notes: [], refs: [], at: Date.now() }; save(); R(); },
    sxStEd(sid) { const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s || !s.style) return; s.styleProp = { style: JSON.parse(JSON.stringify(s.style)), read: s.style.read, model: s.style.model || '', seen: 0, notes: [], refs: s.style.refs || [], at: Date.now() }; save(); R(); },
    sxSt(v, el) {
      const s = curSeries(C()); if (!s || !s.styleProp) return; const p = s.styleProp.style, k = el.dataset.k;
      if (k === 'bg0' || k === 'bg1') { p.bg = Array.isArray(p.bg) ? p.bg.slice() : []; p.bg[k === 'bg0' ? 0 : 1] = String(v).toUpperCase(); if (!p.bg[0]) p.bg[0] = p.bg[1]; }
      else if (k === 'twoTone' || k === 'footnote') p[k] = !!el.checked;
      else if (['ink', 'accent', 'sub'].includes(k)) p[k] = String(v).toUpperCase();
      else p[k] = String(v).slice(0, 500);
      save(); paintAll();
    },
    sxStOk(sid) {
      const c = C(), s = serOf(c).find((x) => x.id === sid); if (!s || !s.styleProp) return;
      const P = s.styleProp;
      s.style = Object.assign(fixStyle(P.style), { read: P.read, model: P.model || '', refs: P.refs || [], approvedAt: today(), approvedBy: (typeof USER !== 'undefined' && USER && USER.email) || '', v: ((s.style && s.style.v) || 0) + 1 });
      s.styleProp = null;
      log(c, 'approve', `Signature style approved for the series “${s.name}”`, `اعتُمد الأسلوب المميز لسلسلة «${s.name}»`);
      toast(L('Signature style approved. Every new post in this series uses it.', 'اعتُمد الأسلوب المميز. كل منشور جديد في السلسلة يستخدمه.'), 'ok'); save(); R();
    },
    sxStX(sid) { const s = serOf(C()).find((x) => x.id === sid); if (s) { s.styleProp = null; save(); R(); } },
    sxRec(id) { const c = C(), R_ = nxRun(c), r = R_.recs.find((x) => x.id === id), s = r && serOf(c).find((x) => x.id === r.sid); if (s) root.nxPrep(c, r, s, r.topic || ''); },
    sxPerf(id) { S.ui.sx = null; S.ui.sxZ = null; S.ui.nxPick = id; S.ui.nxEv = 1; if (S.ui.view !== 'series') A.go('series'); else R(); const el = document.getElementById('sx-next'); if (el) el.scrollIntoView({ block: 'start' }); },
  };

  /** A series recommendation (or a series topic from anywhere) opens the series workspace — never Campaign Studio. */
  function fromRec(c, r, s, topic) {
    let why = '', measure_ = '';
    try { const T = nxText(c, r); why = nxUn(T.b + ' ' + T.why); measure_ = nxUn(nxMeasure(c, r)); } catch (e) { /* own topic: no recommendation text */ }
    const rec = r && r.kind !== 'own' ? { id: r.id, kind: r.kind, level: r.level, objective: r.objective, channel: r.platform, format: nxFmt(r), why, measure: measure_ } : null;
    startDraft(c, s, topic, rec);
    if (rec) log(c, 'campaign', `Series post started from a recommendation in ${s.name}`, `بدأ منشور سلسلة من توصية في ${s.name}`);
    save(); go(s.id);
    if (topic) aiDraft(c, s);
  }

  function install() {
    V.series = view;
    Object.assign(A, actions);
    const r0 = root.render;
    root.render = function () { r0.apply(this, arguments); try { paintAll(); } catch (e) { console.error(e); } };
    root.nxPrep = fromRec;
    // Campaign Studio's "post in your content series" lane now points here.
    root.serLane = () => `<div class="card sx-pointer"><div><b>${L('Series posts have their own workspace', 'لمنشورات السلاسل مساحة عمل خاصة')}</b><p class="small">${L('AI Content Series: your signature style, a topic, a finished branded post.', 'سلاسل المحتوى الذكية: أسلوبك المميز وموضوع ومنشور جاهز بهويتك.')}</p></div><button class="btn pri" data-a="go" data-v="series">${L('Open AI Content Series', 'افتح سلاسل المحتوى الذكية')}</button></div>`;
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && S && S.ui && S.ui.sxZ && S.ui.view === 'series') { e.stopImmediatePropagation(); S.ui.sxZ = null; R(); } }, true);
    if (document.fonts && document.fonts.load) Promise.all(['800 40px "Plus Jakarta Sans"', '500 20px "Plus Jakarta Sans"', '800 40px "Noto Sans Arabic"'].map((f) => document.fonts.load(f).catch(() => null))).then(() => paintAll());
  }

  root.BPSeries = { install, view, draw, kitStyle, fixStyle, splitHead, paintAll };
})(window);
