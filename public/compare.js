/* BrandPilot — channel comparison (task 12). Pure functions: no DOM, no wording, no language.
   Loaded by public/index.html as a classic script (global BPCompare) and by test/compare.test.js through node:vm.
   Honesty rules (same as server/metrics.js and the Analytics screen):
   - a metric the data does not carry is null ("not measured"), never 0;
   - no conversion is credited to a platform: leads are counted by the source your team recorded in the CRM file;
   - GA4 sessions are given per platform only when the GA4 channel itself names the platform — otherwise social
     sessions stay one combined pool ("Organic Social", "Paid Social");
   - a rate is ranked only above a minimum sample, and only when at least two channels qualify. */
(function (root) {
  'use strict';
  const SOCIAL = ['facebook', 'instagram', 'linkedin'];
  const COLS = [...SOCIAL, 'search'];
  /* Minimum sample before a rate is ranked or used in a finding. */
  const MIN = { reach: 1000, sessions: 100, leads: 5, qual: 10, clicks: 30, lead: 3 };
  /* A leader must beat the runner-up by this much (relative) to be called a leader. */
  const EDGE = 0.1;

  const num = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? 0 : +v;
  const has = (rs, k) => rs.some(r => r[k] !== undefined && r[k] !== null && r[k] !== '');
  const sum = (rs, k) => rs.reduce((s, r) => s + num(r[k]), 0);
  const ratio = (a, b) => (a == null || b == null || !b) ? null : a / b;
  const dayN = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
  const days = (a, b) => Math.round(dayN(b) - dayN(a));
  const inP = p => r => !p || (r.date >= p[0] && r.date <= p[1]);
  const isQ = r => r.status === 'qualified' || r.status === 'customer';
  const span = rs => {
    let a = null, b = null;
    for (const r of rs) { if (!r.date) continue; if (!a || r.date < a) a = r.date; if (!b || r.date > b) b = r.date; }
    return a ? [a, b] : null;
  };

  /* The lead source a team typed → a channel column, or null when it cannot be tied to one.
     "Google" stays unassigned on purpose: it can mean organic search or paid ads. */
  function leadCol(src) {
    const s = String(src == null ? '' : src).trim().toLowerCase();
    if (!s) return null;
    if (/facebook|^fb\b|messenger/.test(s)) return 'facebook';
    if (/instagram|^ig\b/.test(s)) return 'instagram';
    if (/linkedin/.test(s)) return 'linkedin';
    if (/^(organic search|seo|google organic|organic google)$/.test(s)) return 'search';
    return null;
  }
  /* A GA4 channel → a column, 'social' (combined pool) or null (not a compared channel). */
  function ga4Col(ch) {
    const s = String(ch == null ? '' : ch).trim().toLowerCase();
    for (const p of SOCIAL) if (s.includes(p)) return p;
    if (s === 'organic search') return 'search';
    if (/social/.test(s)) return 'social';
    return null;
  }

  /* Every metric of every column for one period. */
  function measure(D, p) {
    const A = { meta: D.meta || [], ga4: D.ga4 || [], gsc: D.gsc || [], leads: D.leads || [] };
    const me = A.meta.filter(inP(p)), g = A.ga4.filter(inP(p)), s = A.gsc.filter(inP(p)), l = A.leads.filter(inP(p));
    const gaOn = A.ga4.length > 0, enqOn = has(A.ga4, 'enquiries');
    const leadOn = A.leads.length > 0 && has(A.leads, 'source');
    const split = new Set(A.ga4.map(r => ga4Col(r.channel)).filter(x => SOCIAL.includes(x)));
    const web = (k, ok) => {
      if (!gaOn || !ok) return { sessions: null, enq: null, enqRate: null };
      const rs = g.filter(r => ga4Col(r.channel) === k), se = sum(rs, 'sessions'), en = enqOn ? sum(rs, 'enquiries') : null;
      return { sessions: se, enq: en, enqRate: en == null ? null : ratio(en, se) };
    };
    /* Organic search is "not measured" unless some lead source names it: a 0 there would only mean
       "nobody typed SEO", while those leads may sit under "Google". A platform's own name is unambiguous, so 0 stays 0. */
    const lead = k => {
      if (!leadOn || (k === 'search' && !A.leads.some(r => leadCol(r.source) === 'search'))) return { leads: null, qual: null, qshare: null };
      const rs = l.filter(r => leadCol(r.source) === k), q = rs.filter(isQ).length;
      return { leads: rs.length, qual: q, qshare: ratio(q, rs.length) };
    };
    const out = {};
    for (const pl of SOCIAL) {
      const all = A.meta.filter(r => r.platform === pl), rs = me.filter(r => r.platform === pl), on = all.length > 0;
      const o = {
        posts: on ? rs.length : null,
        reach: on ? sum(rs, 'reach') : null,
        impr: on && has(all, 'impressions') ? sum(rs, 'impressions') : null,
        eng: on ? sum(rs, 'engagements') : null,
        clicks: on && has(all, 'link_clicks') ? sum(rs, 'link_clicks') : null,
        spend: on && has(all, 'spend') ? sum(rs, 'spend') : null,
        ...web(pl, split.has(pl)), ...lead(pl)
      };
      o.engRate = ratio(o.eng, o.reach);
      o.clickRate = ratio(o.clicks, o.reach);
      o.cpc = o.spend ? ratio(o.spend, o.clicks) : null;
      o.cpl = o.spend ? ratio(o.spend, o.leads) : null;
      out[pl] = o;
    }
    const gscOn = A.gsc.length > 0, si = gscOn ? sum(s, 'impressions') : null, sc = gscOn ? sum(s, 'clicks') : null;
    out.search = {
      simpr: si, sclicks: sc, sctr: ratio(sc, si),
      pos: gscOn && si ? s.reduce((t, r) => t + num(r.position) * num(r.impressions), 0) / si : null,
      spend: null, ...web('search', true), ...lead('search')
    };
    out.search.cpl = null;
    /* Social sessions GA4 could not split by platform, kept as one pool. */
    const poolRs = g.filter(r => ga4Col(r.channel) === 'social'), ps = sum(poolRs, 'sessions'), pe = enqOn ? sum(poolRs, 'enquiries') : null;
    const pool = gaOn && A.ga4.some(r => ga4Col(r.channel) === 'social') ? { sessions: ps, enq: pe, enqRate: pe == null ? null : ratio(pe, ps) } : null;
    /* Lead sources that cannot be tied to a compared channel. */
    const other = {};
    if (A.leads.length) l.filter(r => !leadCol(r.source)).forEach(r => {
      const n = String(r.source == null ? '' : r.source).trim();
      const x = other[n] = other[n] || { n, leads: 0, qual: 0 }; x.leads++; if (isQ(r)) x.qual++;
    });
    return { cols: out, pool, other: Object.values(other).sort((a, b) => b.leads - a.leads), leadsAll: A.leads.length ? l.length : null, qualAll: A.leads.length ? l.filter(isQ).length : null };
  }

  /* Comparable metrics: which way is better, and the minimum data a channel needs to be RANKED on it
     (`need`: [field, minimum] pairs — the field the rate is computed from). These are BrandPilot's own
     minimum-sample rules, not a statistical test: a channel below them is shown, never ranked.
     A rate that exists already implies its other inputs (cpc / cpl exist only with spend > 0). */
  const RANK = {
    engRate: { better: 'high', need: [['reach', MIN.reach]] },
    clickRate: { better: 'high', need: [['reach', MIN.reach]] },
    cpc: { better: 'low', need: [['clicks', MIN.clicks]] },
    enqRate: { better: 'high', need: [['sessions', MIN.sessions]] },
    leads: { better: 'high', need: [] },
    qshare: { better: 'high', need: [['leads', MIN.qual]] },
    cpl: { better: 'low', need: [['leads', MIN.leads]] }
  };
  /* The first unmet minimum of channel data `o` for metric k, or null when it may be ranked. */
  const short = (k, o) => { for (const [f, min] of RANK[k].need) if (!(o[f] >= min)) return { f, have: o[f] == null ? null : o[f], min }; return null; };
  for (const [k, r] of Object.entries(RANK)) r.ok = o => !short(k, o);

  /* For every rankable metric, the full story behind its ranking:
     status 'ranked' — `top` is the best eligible channel, at least EDGE ahead of `run` (the next eligible one);
            'close'  — two or more eligible channels, but the first is less than EDGE ahead (no leader named);
            'few'    — fewer than two channels have enough data (or, for leads, under MIN.leads in total);
     `obs` — the highest observed value among ALL channels with a value, eligible or not;
     `out` — channels with a value that were not ranked, each with the exact unmet minimum. */
  function rank(cols) {
    const best = {}, worst = {}, info = {};
    for (const [k, r] of Object.entries(RANK)) {
      const sort = xs => xs.sort((a, b) => r.better === 'high' ? b.v - a.v : a.v - b.v);
      const all = sort(COLS.filter(c => cols[c][k] != null).map(c => ({ c, v: cols[c][k] })));
      if (!all.length) continue;
      const out = all.filter(x => short(k, cols[x.c])).map(x => ({ ...x, ...short(k, cols[x.c]) }));
      const xs = all.filter(x => !short(k, cols[x.c]));
      const I = info[k] = { k, better: r.better, obs: all[0], out, eligible: xs.map(x => x.c), status: 'few', top: null, run: null, edge: null };
      if (xs.length < 2 || (k === 'leads' && xs.reduce((t, x) => t + x.v, 0) < MIN.leads)) continue;
      const top = xs[0], run = xs[1], end = xs[xs.length - 1];
      const edge = r.better === 'high' ? (run.v ? top.v / run.v - 1 : (top.v > 0 ? Infinity : 0)) : (top.v ? run.v / top.v - 1 : 0);
      Object.assign(I, { top, run, edge, status: edge >= EDGE ? 'ranked' : 'close' });
      if (I.status !== 'ranked') continue;
      best[k] = { c: top.c, v: top.v, run: run.c, rv: run.v, n: xs.length };
      worst[k] = { c: end.c, v: end.v };
    }
    return { best, worst, info };
  }

  /* Where each channel's data comes from in time: its own first / last date overall and in the period. */
  function coverage(D, p) {
    const A = { meta: D.meta || [], ga4: D.ga4 || [], gsc: D.gsc || [], leads: D.leads || [] }, out = {};
    const one = rs => {
      const all = span(rs), cur = span(rs.filter(inP(p)));
      if (!all) return null;
      return { first: all[0], last: all[1], from: cur && cur[0], to: cur && cur[1],
        gapEnd: p && all[1] < p[1] ? days(all[1], p[1]) : 0, gapStart: p && all[0] > p[0] ? days(p[0], all[0]) : 0 };
    };
    SOCIAL.forEach(pl => { out[pl] = one(A.meta.filter(r => r.platform === pl)); });
    out.search = one(A.gsc.concat(A.ga4.filter(r => ga4Col(r.channel) === 'search')));
    out.ga4 = one(A.ga4); out.leads = one(A.leads);
    return out;
  }

  /* Facts and gaps worth telling a marketer, each with the numbers behind it. The page words them. */
  function findings(m, prev, rk, cov) {
    const F = [], C = m.cols;
    const b = rk.best;
    /* Recorded leads by channel (CRM source). */
    if (m.leadsAll >= MIN.leads) {
      const xs = COLS.filter(c => C[c].leads).sort((x, y) => C[y].leads - C[x].leads);
      if (xs.length && C[xs[0]].leads >= MIN.lead) F.push({ id: 'lead-share', cls: 'fact', c: xs[0], v: C[xs[0]].leads, total: m.leadsAll, share: C[xs[0]].leads / m.leadsAll, run: xs[1] || null, rv: xs[1] ? C[xs[1]].leads : null });
    }
    /* A "best eligible" finding always carries the channel with a better observed value that was not ranked (`above`),
       so the page can never name a winner without saying who looked higher and why it was left out. */
    const above = k => { const I = rk.info[k]; return I && I.obs.c !== I.top?.c ? I.out.find(x => x.c === I.obs.c) || null : null; };
    const bestF = (k, cls, n0) => { if (b[k]) F.push({ id: 'best', k, cls, ...b[k], n0: C[b[k].c][n0], above: above(k) }); };
    bestF('qshare', 'fact', 'leads'); bestF('cpl', 'interp', 'leads'); bestF('engRate', 'interp', 'reach'); bestF('clickRate', 'interp', 'reach'); bestF('cpc', 'interp', 'clicks');
    /* The highest observed value belongs to a channel below the minimum: worth knowing, not yet a result. */
    ['qshare', 'cpl', 'engRate', 'clickRate', 'cpc', 'enqRate'].forEach(k => {
      const I = rk.info[k], x = I && I.out.find(o => o.c === I.obs.c);
      const lead = I && I.status === 'ranked';
      if (x) F.push({ id: 'unranked', cls: 'hyp', k, c: x.c, v: x.v, f: x.f, have: x.have, min: x.min, st: I.status, top: lead ? I.top.c : null, tv: lead ? I.top.v : null });
    });
    /* Website: organic search against all social together (same GA4 definition on both sides). */
    const se = C.search;
    if (m.pool && se.enqRate != null && m.pool.enqRate != null && se.sessions >= MIN.sessions && m.pool.sessions >= MIN.sessions)
      F.push({ id: 'web', cls: 'fact', s: se.enqRate, so: m.pool.enqRate, ss: se.sessions, sp: m.pool.sessions });
    /* Spend with no lead recorded from that channel. */
    if (m.leadsAll != null) SOCIAL.forEach(c => { if (C[c].spend > 0 && C[c].leads === 0) F.push({ id: 'spend-no-lead', cls: 'risk', c, v: C[c].spend }); });
    /* Biggest change against the previous period of the same length. */
    if (prev) {
      let mv = null;
      COLS.forEach(c => [['leads', MIN.leads], ['reach', MIN.reach], ['sessions', MIN.sessions]].forEach(([k, lo]) => {
        const a = C[c][k], p0 = prev.cols[c][k];
        if (a == null || p0 == null || p0 < lo) return;
        const d = a / p0 - 1;
        if (Math.abs(d) >= 0.3 && (!mv || Math.abs(d) > Math.abs(mv.d))) mv = { id: 'move', cls: 'fact', c, k, v: a, p: p0, d };
      }));
      if (mv) F.push(mv);
    }
    /* Gaps: a channel with no data, data that stops before the period ends, leads we cannot tie to a channel. */
    SOCIAL.forEach(c => { if (!cov[c]) F.push({ id: 'missing', cls: 'gap', c }); });
    if (!cov.search) F.push({ id: 'missing', cls: 'gap', c: 'search' });
    COLS.forEach(c => { if (cov[c] && cov[c].gapEnd >= 3) F.push({ id: 'stale', cls: 'gap', c, last: cov[c].last, d: cov[c].gapEnd }); });
    const un = m.other.reduce((t, x) => t + x.leads, 0);
    if (m.leadsAll && un / m.leadsAll >= 0.3) F.push({ id: 'unmapped', cls: 'gap', v: un, total: m.leadsAll, share: un / m.leadsAll, top: m.other.slice(0, 3).map(x => x.n) });
    if (m.leadsAll == null) F.push({ id: 'no-leads', cls: 'gap' });
    return F;
  }

  /* One call for the screen. cur / prev are [from, to] date strings (prev may be null). */
  function compare(D, cur, prev) {
    const m = measure(D, cur), p = prev ? measure(D, prev) : null, rk = rank(m.cols), cov = coverage(D, cur);
    const score = {};
    COLS.forEach(c => { score[c] = { wins: Object.keys(rk.best).filter(k => rk.best[k].c === c), trails: Object.keys(rk.worst).filter(k => rk.worst[k].c === c) }; });
    return { cur, prev, cols: COLS, now: m, before: p, best: rk.best, worst: rk.worst, rank: rk.info, score, cov, findings: findings(m, p, rk, cov) };
  }

  const api = { SOCIAL, COLS, MIN, EDGE, RANK, short, leadCol, ga4Col, measure, rank, coverage, findings, compare };
  root.BPCompare = api;
})(typeof window !== 'undefined' ? window : globalThis);
