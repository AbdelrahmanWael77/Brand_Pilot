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
  function hourIn(dISO, h, from, to) {
    try {
      const t = Date.UTC(+dISO.slice(0, 4), +dISO.slice(5, 7) - 1, +dISO.slice(8, 10), h);
      const off = (z) => {
        const p = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date(t));
        const g = (k) => +p.find((x) => x.type === k).value;
        return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour')) - t) / 36e5;
      };
      return ((h - off(from) + off(to)) % 24 + 24) % 24;
    } catch (e) { return h; }
  }
  /* Best days and hours for one channel. rows = the company's social post rows (c.data.meta); z = audience zone. */
  function bestTimes(rows, ch, z) {
    const wd = workDays(z), P = PEAK[region(z)], pk = P[ch] || P.linkedin, out = { tz: z, wd, ch };
    const own = (rows || []).filter((r) => r.platform === ch && !(+r.spend > 0) && +r.reach > 0 && r.engagements != null && r.engagements !== '');
    const rate = (xs) => { const R = xs.reduce((s, r) => s + (+r.reach || 0), 0); return R ? xs.reduce((s, r) => s + (+r.engagements || 0), 0) / R : 0; };
    const avg = rate(own);
    if (own.length >= 8 && avg > 0) {
      const by = [0, 1, 2, 3, 4, 5, 6].map((d) => { const xs = own.filter((r) => new Date(r.date + 'T00:00:00Z').getUTCDay() === d); return { d, n: xs.length, r: rate(xs) }; })
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

  root.BPSchedule = { workDays, region, PEAK, hourIn, bestTimes };
})(typeof window !== 'undefined' ? window : globalThis);
