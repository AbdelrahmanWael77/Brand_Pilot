/* BrandPilot — when to post (task 24c, moved here in 25). Pure functions: no DOM, no wording, no language.
   Loaded by public/index.html as a classic script (global BPSchedule) and by test/schedule.test.js through node:vm.
   Honesty: days and hours come from the company's OWN organic posts when there are enough ('data'); otherwise
   general peak-time guidance ('peak'), which the screen always labels as such. */
(function (root) {
  'use strict';
  /* Sun–Thu work week where it applies (UAE moved to Mon–Fri in 2022). 0 = Sunday. */
  const workDays = (z) => /^(Africa\/Cairo|Asia\/(Riyadh|Kuwait|Qatar|Bahrain|Muscat|Baghdad|Amman)|Asia\/Aden)$/.test(z) ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5];
  /* Middle East zones get the regional windows; every other zone the global ones. */
  const region = (z) => /^(Africa\/Cairo|Asia\/(Riyadh|Dubai|Kuwait|Qatar|Bahrain|Muscat|Baghdad|Amman|Aden|Beirut))$/.test(z) ? 'mena' : 'global';
  /* General guidance (local time, end hour exclusive): used only until the company's own posts say otherwise, and always
     labelled "general guidance from published studies" on screen. mid = the middle three days of the work week, else all
     work days. Sources (2026-11-18), generic and mostly vendor data — hence the label:
     - Sprout Social 2026 (~2B engagements, ~307k profiles): overall Tue–Wed 11–18, Facebook Tue–Wed 12–20, Sunday weakest.
       https://sproutsocial.com/insights/best-times-to-post-on-social-media/
     - Instagram mid-week late morning–early afternoon; LinkedIn Tue–Thu office hours + late afternoon (third-party
       roundups, they disagree): https://postfa.st/blog/best-time-to-post-on-social-media
     - Middle East: 9-country Facebook study (300k posts, Ramadan): Egypt 16:00, UAE 19:00, KSA 22:00; Saudi Instagram
       11–12 and ~22: https://thinkmarketingmagazine.com/?p=26033 ,
       https://timetopost.co/best-time-to-post/instagram/gulf-weekend-split/ */
  const PEAK = {
    global: { facebook: { h: [[12, 14], [18, 20]], mid: true }, instagram: { h: [[11, 13], [17, 19]], mid: true }, linkedin: { h: [[10, 12], [15, 17]], mid: true }, email: { h: [[10, 11]], mid: true } },
    mena: { facebook: { h: [[16, 18], [20, 22]] }, instagram: { h: [[12, 14], [20, 22]] }, linkedin: { h: [[10, 12], [13, 15]], mid: true }, email: { h: [[10, 11]], mid: true } },
  };
  /* Hour h on day dISO in zone `from`, as an hour in zone `to`. A bad zone leaves the hour as it is. */
  /* Wall-clock parts of an instant in zone z, read from formatToParts (never from a locale's date text). */
  function partsIn(z, ms) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date(ms));
    const g = (k) => +p.find((x) => x.type === k).value;
    return { y: g('year'), m: g('month'), d: g('day'), h: g('hour') % 24 };
  }
  const isoOf = (p) => p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
  /* Day dISO at hour h in zone `from`, as {date, hour} in zone `to`. Throws on a bad zone. */
  function shift(dISO, h, from, to) {
    const t = Date.UTC(+dISO.slice(0, 4), +dISO.slice(5, 7) - 1, +dISO.slice(8, 10), h);
    const f = partsIn(from, t), off = (Date.UTC(f.y, f.m - 1, f.d, f.h) - t) / 36e5;
    const p = partsIn(to, t - off * 36e5);
    return { date: isoOf(p), hour: p.h };
  }
  function hourIn(dISO, h, from, to) {
    try { return shift(dISO, h, from, to).hour; } catch (e) { return h; }
  }
  /* The weekday a post went out where the audience lives: from its publish hour + zone when known, else its date. */
  function localWeekday(r, z) {
    let d = r.date;
    if (r.hour != null && r.hour !== '') { try { d = shift(r.date, +r.hour, r.htz || z, z).date; } catch (e) { d = r.date; } }
    return new Date(d + 'T00:00:00Z').getUTCDay();
  }
  /* Best days and hours for one channel. rows = the company's social post rows (c.data.meta); z = audience zone. */
  function bestTimes(rows, ch, z) {
    const wd = workDays(z), P = PEAK[region(z)], pk = P[ch] || P.linkedin, out = { tz: z, wd, ch };
    const own = (rows || []).filter((r) => r.platform === ch && !(+r.spend > 0) && +r.reach > 0 && r.engagements != null && r.engagements !== '');
    const rate = (xs) => { const R = xs.reduce((s, r) => s + (+r.reach || 0), 0); return R ? xs.reduce((s, r) => s + (+r.engagements || 0), 0) / R : 0; };
    const avg = rate(own);
    if (own.length >= 8 && avg > 0) {
      const by = [0, 1, 2, 3, 4, 5, 6].map((d) => { const xs = own.filter((r) => localWeekday(r, z) === d); return { d, n: xs.length, r: rate(xs) }; })
        .filter((x) => x.n >= 2 && x.r > avg * 1.1).sort((a, b) => b.r - a.r).slice(0, 2);
      if (by.length) out.days = { src: 'data', d: by.map((x) => x.d), n: own.length, lift: Math.round((by[0].r / avg - 1) * 100) };
    }
    if (!out.days) out.days = { src: 'peak', d: pk.mid ? wd.slice(1, 4) : wd.slice(0, 5) };
    const hr = own.filter((r) => r.hour != null && r.hour !== '');
    if (hr.length >= 8 && avg > 0) {
      const blk = [0, 3, 6, 9, 12, 15, 18, 21].map((b) => { const xs = hr.filter((r) => { const h = hourIn(r.date, +r.hour, r.htz || z, z); return h >= b && h < b + 3; }); return { b, n: xs.length, r: rate(xs) }; })
        .filter((x) => x.n >= 3).sort((a, b) => b.r - a.r)[0];
      if (blk) out.hours = { src: 'data', h: [[blk.b, blk.b + 3]], n: hr.length };
    }
    if (!out.hours) out.hours = { src: 'peak', h: pk.h };
    return out;
  }

  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const weekday = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const hh = (h) => String(h).padStart(2, '0') + ':00';
  /* Today's date (YYYY-MM-DD) where the audience lives; UTC when the zone is unknown. */
  function localToday(z, now) {
    try { return isoOf(partsIn(z, now.getTime())); } catch (e) { return now.toISOString().slice(0, 10); }
  }
  /* Calendar placement (owner 2026-11-18). items: {key, ch, lang, pair} in asset order; pair = the twin key, so the
     English and Arabic versions of one post share a day (English in the first window, Arabic in the second).
     A group takes the first free best day within 14 days of the start, else the first free work day there, else the
     first free day. start: the user's date, or tomorrow in the audience zone when missing, garbled or earlier. */
  function place(items, timesFor, start, z, now) {
    const earliest = addDays(localToday(z, now), 1);
    const s = typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start) && !Number.isNaN(Date.parse(start)) && addDays(start, 0) === start && start >= earliest ? start : earliest;
    const groups = [];
    for (const it of items) { const g = groups.find((x) => x.pair === it.pair); if (g) g.items.push(it); else groups.push({ pair: it.pair, ch: it.ch, items: [it] }); }
    const used = new Set(), rows = [];
    for (const g of groups) {
      const t = timesFor(g.ch);
      const free = (ok, max) => { for (let k = 0; k < max; k++) { const d = addDays(s, k); if (!used.has(d) && ok(weekday(d))) return d; } return null; };
      const d = free((w) => t.days.d.includes(w), 14) || free((w) => t.wd.includes(w), 14) || free(() => true, 366);
      used.add(d);
      const src = t.days.src === 'data' || t.hours.src === 'data' ? 'data' : 'peak', h = t.hours.h;
      // The window follows the language (English first), so all slides of one carousel language go out together.
      const langs = [...new Set(g.items.map((it) => it.lang))].sort((a, b) => (a === 'en' ? 0 : 1) - (b === 'en' ? 0 : 1));
      g.items.slice().sort((a, b) => langs.indexOf(a.lang) - langs.indexOf(b.lang)).forEach((it) => {
        const k = langs.indexOf(it.lang);
        const hour = h.length === 1 && k > 0 ? Math.min(h[0][0] + 2 * k, 23) : h[k % h.length][0];
        rows.push({ key: it.key, date: d, time: hh(hour), src });
      });
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }

  /* A publish hour from an import cell: an integer 0–23, "19", "19:00" or "7 PM". Anything else → undefined (the post
     is kept without an hour; a blank cell must never become 00:00 and pose as the company's own data). */
  function cleanHour(v) {
    if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 23 ? v : undefined;
    const m = /^\s*(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?\s*$/i.exec(String(v ?? ''));
    if (!m || (m[2] !== undefined && +m[2] > 59)) return undefined;
    let h = +m[1];
    if (m[3]) { if (h < 1 || h > 12) return undefined; h = h % 12 + (/pm/i.test(m[3]) ? 12 : 0); }
    return h <= 23 ? h : undefined;
  }

  root.BPSchedule = { workDays, region, PEAK, hourIn, bestTimes, localToday, place, cleanHour };
})(typeof window !== 'undefined' ? window : globalThis);
