// WCAG 2.1 contrast check for the visible text of the current page (runs inside the page via page.evaluate).
// Text is compared with the first opaque background behind it; text over an image or gradient is reported as
// "unknown" (not judged). AA: 4.5:1, or 3:1 for large text (≥ 24px, or ≥ 18.66px bold).
export function contrastAudit() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mix = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { unknown: true };
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) bg = mix(l, bg);
    return bg;
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim()) continue;
    seen.add(el);
    if (el.closest('[aria-hidden="true"],script,style,svg,[disabled],.vh,.sr-only,option')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    if (op < 0.1) continue; // effectively invisible (e.g. a closed menu drawn at opacity 0)
    const bg = bgOf(el);
    if (bg.unknown) continue;
    const fg0 = parse(cs.color); if (!fg0) continue;
    const fg = mix({ ...fg0, a: fg0.a * op }, bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio + 1e-9 < need) out.push({ ratio: Math.round(ratio * 100) / 100, need, text: n.textContent.trim().slice(0, 50), cls: (el.className && el.className.baseVal === undefined ? el.className : '') || el.tagName.toLowerCase(), color: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, size });
  }
  return out;
}
