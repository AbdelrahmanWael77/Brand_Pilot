/* BrandPilot — content recommendations "What to post next" (task 16). Pure functions: no DOM, no wording, no language.
   Loaded by public/index.html as a classic script (global BPRecs) and by test/recs.test.js through node:vm.
   Honesty rules (same spirit as public/compare.js):
   - posts are only ever compared with posts of the SAME platform (a LinkedIn "click" is not a Facebook "link click");
   - paid posts (spend > 0) and posts younger than MIN.ageDays are left out of every comparison, and counted;
   - a column the posts do not carry is "not measured", never 0;
   - a series is called better or worse only with MIN.posts posts on both sides, MIN.reach reach on both sides
     (rates) and a relative difference of at least EDGE. Below that, a recommendation is an experiment ("test"), never a finding;
   - leads are not recorded per post: a "leads" series is judged by link clicks and says so (limit 'proxy_leads');
   - a series with no published post gets an experiment, never invented evidence. */
(function (root) {
  'use strict';
  const PLATFORMS = ['linkedin', 'facebook', 'instagram'];
  const OBJECTIVES = ['engagement', 'awareness', 'traffic', 'leads'];
  /* What each objective is judged by, per post. `den` null = average per post. */
  const METRIC = {
    engagement: { num: 'engagements', den: 'reach' },
    awareness: { num: 'reach', den: null },
    traffic: { num: 'link_clicks', den: 'reach' },
    leads: { num: 'link_clicks', den: 'reach', proxy: true },
  };
  const MIN = { posts: 5, reach: 1000, ageDays: 7 };
  const EDGE = 0.2;
  /* Order of the recommendations: evidence first, then experiments. */
  const ORDER = { repeat: 0, improve: 1, promising: 2, start: 3, grow: 4, format: 5 };

  const num = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? 0 : +v;
  const has = (r, k) => r[k] !== undefined && r[k] !== null && r[k] !== '' && !isNaN(+r[k]);
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const flat = s => norm(s).replace(/[^a-z0-9؀-ۿ]+/g, '');
  const day = d => Date.parse(String(d).slice(0, 10) + 'T00:00:00Z');

  /** A stable key for one imported post: the platform's own id when the file has one. */
  function postKey(r) {
    return r.post_id ? 'id:' + String(r.post_id).slice(0, 200) : ['p', r.platform, r.date, String(r.text || '').slice(0, 60)].join('|');
  }

  /** Which series a post belongs to, and how BrandPilot knows:
   *  'manual' — the user chose it (a manual choice of "none" is sid null, how 'manual');
   *  'theme'  — the post's theme is one the user linked to the series (counted like a manual choice);
   *  'text'   — the caption names the series ("Build Smarter", "#BuildSmarter"): only a SUGGESTION, not counted until confirmed. */
  function seriesOf(r, series, manual) {
    const k = postKey(r);
    if (manual && Object.prototype.hasOwnProperty.call(manual, k)) {
      const sid = manual[k];
      return { sid: sid && series.some(s => s.id === sid) ? sid : null, how: 'manual' };
    }
    const th = norm(r.theme);
    if (th) { const s = series.find(s => (s.themes || []).some(t => norm(t) === th)); if (s) return { sid: s.id, how: 'theme' }; }
    const tx = flat(r.text);
    if (tx) { const s = series.find(s => flat(s.name).length >= 4 && tx.includes(flat(s.name))); if (s) return { sid: s.id, how: 'text' }; }
    return { sid: null, how: null };
  }

  const isPaid = r => num(r.spend) > 0;
  const isFresh = (r, today) => today && (day(today) - day(r.date)) / 864e5 < MIN.ageDays;

  /** One group of posts measured for one objective. value null = not measured. */
  function measure(rows, objective) {
    const M = METRIC[objective] || METRIC.engagement;
    const rs = rows.filter(r => has(r, M.num) && (!M.den || has(r, M.den)));
    const reach = rs.reduce((s, r) => s + num(r.reach), 0);
    if (!rs.length) return { n: 0, posts: rows.length, reach, value: null };
    const top = rs.reduce((s, r) => s + num(r[M.num]), 0);
    const value = M.den ? (reach > 0 ? top / reach : null) : top / rs.length;
    return { n: rs.length, posts: rows.length, reach, value };
  }
  const per = (r, objective) => { const M = METRIC[objective] || METRIC.engagement; if (!has(r, M.num)) return null; if (!M.den) return num(r[M.num]); return num(r.reach) > 0 ? num(r[M.num]) / num(r.reach) : null; };

  /** The first minimum a comparison does not meet: { f: 'posts' | 'reach', side: 'series' | 'rest', have, min } or null. */
  function short(a, b, objective) {
    const rate = !!(METRIC[objective] || METRIC.engagement).den;
    if (a.n < MIN.posts) return { f: 'posts', side: 'series', have: a.n, min: MIN.posts };
    if (b.n < MIN.posts) return { f: 'posts', side: 'rest', have: b.n, min: MIN.posts };
    if (rate && a.reach < MIN.reach) return { f: 'reach', side: 'series', have: a.reach, min: MIN.reach };
    if (rate && b.reach < MIN.reach) return { f: 'reach', side: 'rest', have: b.reach, min: MIN.reach };
    return null;
  }

  /** Topic ideas of a series that have not been turned into a post yet. */
  function nextTopic(s, used) {
    const u = new Set((used || []).map(norm));
    return String(s.ideas || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).find(x => !u.has(norm(x))) || null;
  }

  /**
   * recommend({ posts, series, manual, today, used: { [sid]: [topics already made] }, dismissed: [rec ids] })
   * → { recs, assign: { counted, suggested, unassigned }, left: { paid, fresh }, missing: [codes] }
   * rec = { id, kind, level: 'supported' | 'test', sid, platform, objective, series: m, rest: m, lift, gap, period, posts, limits, topic }
   */
  function recommend(input) {
    const posts = Array.isArray(input.posts) ? input.posts : [];
    const series = (Array.isArray(input.series) ? input.series : []).filter(s => s && s.id && s.name);
    const manual = input.manual || {};
    const today = input.today || null;
    const dismissed = new Set(input.dismissed || []);
    const missing = [];
    if (!series.length) missing.push('no_series');
    if (!posts.length) missing.push('no_posts');

    const tagged = posts.map(r => ({ r, k: postKey(r), ...seriesOf(r, series, manual) }));
    const assign = {
      counted: tagged.filter(t => t.sid && t.how !== 'text').length,
      suggested: tagged.filter(t => t.sid && t.how === 'text').length,
      unassigned: tagged.filter(t => !t.sid).length,
    };
    const paid = tagged.filter(t => isPaid(t.r));
    const fresh = tagged.filter(t => !isPaid(t.r) && isFresh(t.r, today));
    const usable = tagged.filter(t => !isPaid(t.r) && !isFresh(t.r, today));
    const left = { paid: paid.length, fresh: fresh.length };
    if (posts.length && series.length && !assign.counted) missing.push('no_assigned');
    if (posts.length && !posts.some(r => has(r, 'link_clicks'))) missing.push('no_clicks');

    const recs = [];
    for (const s of series) {
      const objective = OBJECTIVES.includes(s.objective) ? s.objective : 'engagement';
      const M = METRIC[objective];
      const mine = usable.filter(t => t.sid === s.id && t.how !== 'text');
      const base = { sid: s.id, objective, topic: nextTopic(s, (input.used || {})[s.id]) };
      const limitsOf = (platform, extra) => {
        const l = extra.slice();
        if (M.proxy) l.push({ code: 'proxy_leads' });
        if (M.num === 'link_clicks' && platform === 'linkedin') l.push({ code: 'linkedin_clicks' });
        if (left.paid) l.push({ code: 'paid_out', n: left.paid });
        if (left.fresh) l.push({ code: 'fresh_out', n: left.fresh, days: MIN.ageDays });
        return l;
      };
      if (!mine.length) {
        const platform = PLATFORMS.includes(s.channel) ? s.channel : 'linkedin';
        recs.push({ ...base, id: 'start:' + s.id, kind: 'start', level: 'test', platform, series: null, rest: null, lift: null, gap: null, period: null, posts: [], limits: limitsOf(platform, [{ code: 'no_history' }]) });
        continue;
      }
      const plats = PLATFORMS.filter(p => mine.some(t => t.r.platform === p));
      for (const platform of plats) {
        const a = mine.filter(t => t.r.platform === platform).map(t => t.r);
        const b = usable.filter(t => t.r.platform === platform && t.sid !== s.id).map(t => t.r);
        const ma = measure(a, objective), mb = measure(b, objective);
        if (ma.value === null) { missing.push('not_measured:' + objective + ':' + platform); continue; }
        const ds = a.concat(b).map(r => String(r.date).slice(0, 10)).sort();
        const period = { from: ds[0], to: ds[ds.length - 1] };
        const lift = mb.value ? ma.value / mb.value - 1 : null;
        const gap = short(ma, mb, objective);
        const top = a.slice().sort((x, y) => (per(y, objective) || 0) - (per(x, objective) || 0)).slice(0, 5)
          .map(r => ({ key: postKey(r), date: String(r.date).slice(0, 10), text: String(r.text || '').slice(0, 140), reach: num(r.reach), value: per(r, objective), theme: r.theme || '' }));
        let kind, level = 'test';
        const lim = [];
        if (!gap && lift !== null && lift >= EDGE) { kind = 'repeat'; level = 'supported'; }
        else if (!gap && lift !== null && lift <= -EDGE) { kind = 'improve'; level = 'supported'; }
        else if (!gap) { kind = 'format'; lim.push({ code: 'no_difference' }); }
        else if (lift !== null && lift >= EDGE) { kind = 'promising'; lim.push({ code: 'small_sample', ...gap }); }
        else { kind = 'grow'; lim.push({ code: 'small_sample', ...gap }); }
        if (mb.value === null || !b.length) lim.push({ code: 'no_baseline' });
        recs.push({ ...base, id: kind + ':' + s.id + ':' + platform, kind, level, platform, series: ma, rest: mb, lift, gap, period, posts: top, limits: limitsOf(platform, lim) });
      }
    }
    recs.sort((x, y) => (ORDER[x.kind] - ORDER[y.kind]) || ((y.lift || 0) - (x.lift || 0)) || (y.series ? y.series.n : 0) - (x.series ? x.series.n : 0));
    return { recs: recs.filter(r => !dismissed.has(r.id)), hidden: recs.filter(r => dismissed.has(r.id)).length, assign, left, missing };
  }

  const api = { PLATFORMS, OBJECTIVES, METRIC, MIN, EDGE, postKey, seriesOf, measure, short, nextTopic, recommend };
  root.BPRecs = api;
})(typeof window !== 'undefined' ? window : globalThis);
