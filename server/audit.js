/**
 * Marketing audit computed on the server.
 *
 * Inputs are only what the server has validated: imported rows (`dataRows`) and
 * approved facts (`approvedFacts`). Nothing is read from the state blob, and pending
 * or rejected findings are never used.
 *
 * Every item says what it rests on:
 *   basis 'data'         — a conclusion drawn from imported numbers (quoted in `evidence`)
 *   basis 'facts'        — a conclusion drawn from approved facts (ids in `evidence`)
 *   basis 'insufficient' — NOT a conclusion: the inputs are missing or too small, and
 *                          `needs` says what would make the rule answerable
 *
 * The rules, their ids and their thresholds are ported from `audit(c)` in
 * public/index.html (which keeps the bilingual wording for the UI, keyed by the same
 * ids). Text here is English, for tests and for grounding later AI answers.
 * Ported so far: no-ga4, no-track, ch-best, ch-leak, mobile-gap, no-gsc, seo-q,
 * no-leads, src-unknown, src-best, src-lowq, no-meta, brand-doc.
 * Like the prototype, the audit looks at all imported rows, not one period.
 */
import { createData, KINDS } from './data.js';
import { createKnowledge } from './knowledge.js';

/** Thresholds, as in the prototype. */
export const T = {
  channelMinSessions: 200, // a channel needs this many sessions to be compared
  bestOverAverage: 1.2, // "best" = rate above 120% of the average
  leakMinShare: 0.2, // a leaking channel carries at least 20% of sessions…
  leakBelowAverage: 0.5, // …and converts below 50% of the average
  mobileMinShare: 0.3,
  mobileBelowDesktop: 0.6,
  queryMinImpressions: 1000,
  queryPosition: [5, 15],
  queryMaxCtr: 0.025,
  unknownSourceShare: 0.15,
  sourceMinLeads: 15, // to be called "best"
  lowQualityMinLeads: 20,
  lowQualityBelowAverage: 0.6,
  pageMinShare: 0.12, // a leaking landing page carries at least 12% of sessions…
  pageBelowAverage: 0.6, // …and converts below 60% of the site average
  themeMinPosts: 4, // a content theme needs this many posts to be compared
  themeOverAverage: 1.2, // "strongest" = engagement above 120% of the account average
  segmentMinLeads: 15, // a segment needs this many leads to be compared
  segmentOverAverage: 1.15, // "strongest" = qualified share above 115% of the overall share
  segmentSmallSample: 30, // below this the evidence line says "small sample"
};

const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const groupBy = (rows, k) => {
  const out = new Map();
  for (const r of rows) {
    if (!r[k]) continue;
    if (!out.has(r[k])) out.set(r[k], []);
    out.get(r[k]).push(r);
  }
  return out;
};
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const isQualified = (r) => r.status === 'qualified' || r.status === 'customer';

/** Sessions / enquiries per value of `key`, with the enquiry rate. */
const breakdown = (rows, key) =>
  [...groupBy(rows, key)].map(([name, rs]) => {
    const sessions = sum(rs, 'sessions');
    const enquiries = sum(rs, 'enquiries');
    return { name, sessions, enquiries, rate: enquiries / Math.max(1, sessions) };
  });

/**
 * @param {{meta: object[], ga4: object[], gsc: object[], leads: object[]}} data rows from `dataRows`
 * @param {object[]} facts approved facts from `approvedFacts`
 */
export function computeAudit(data, facts) {
  const items = [];
  const syn = Object.fromEntries(KINDS.map((k) => [k, data[k].some((r) => r.synthetic)]));
  const conclude = (kind, dataset, o) => items.push({ ...o, kind, basis: 'data', synthetic: syn[dataset] });
  const insufficient = (id, dataset, title, needs) =>
    items.push({ id, kind: 'gap', basis: 'insufficient', synthetic: dataset ? syn[dataset] : false, title, why: 'Not enough verified input to draw a conclusion here.', action: needs, needs, evidence: [] });

  /* ---- Website (GA4) ---- */
  const g = data.ga4;
  if (!g.length) {
    insufficient('no-ga4', 'ga4', 'Website performance is not connected', 'Import a GA4 export (CSV) in Integrations & Data.');
  } else {
    const S = sum(g, 'sessions');
    const E = sum(g, 'enquiries');
    if (!E) {
      conclude('weak', 'ga4', {
        id: 'no-track',
        title: 'The website records no enquiry events',
        why: 'Without a key event for form submissions, WhatsApp clicks or bookings, nobody can tell which channel or page produces enquiries.',
        action: 'Define one GA4 key event per enquiry path (form submit, WhatsApp click, call click) and re-import.',
        evidence: [
          { metric: 'sessions', value: S, rows: g.length, text: `${S} sessions imported, 0 enquiry key events in the whole period.` },
          { text: 'Interpretation: tracking is most likely not configured (a true zero is unlikely at this traffic level).' },
        ],
      });
    } else {
      const rate = E / S;
      const site = { metric: 'enquiry_rate', value: rate, rows: g.length, text: `Site average: ${pct(rate, 2)} (${E} enquiries from ${S} sessions)` };
      const channels = breakdown(g, 'channel').filter((x) => x.sessions >= T.channelMinSessions).sort((a, b) => b.rate - a.rate);
      if (channels.length < 2) {
        insufficient('ch-best', 'ga4', 'Traffic channels cannot be compared yet', `At least two channels with ${T.channelMinSessions}+ sessions each are needed (now: ${channels.length}).`);
      } else {
        const best = channels[0];
        if (best.rate > rate * T.bestOverAverage) {
          conclude('strong', 'ga4', {
            id: 'ch-best',
            title: `${best.name} visitors enquire at the highest rate`,
            why: 'This channel already brings people with intent; growing it is lower-risk than fixing a weak one.',
            action: `Invest more effort in ${best.name}: more content, better pages, clearer follow-up.`,
            evidence: [{ metric: 'enquiry_rate', value: best.rate, text: `${best.name}: ${best.enquiries} enquiries from ${best.sessions} sessions (${pct(best.rate, 2)})` }, site],
          });
        }
        const leak = channels.filter((x) => x.sessions / S >= T.leakMinShare && x.rate < rate * T.leakBelowAverage).sort((a, b) => b.sessions - a.sessions)[0];
        if (leak) {
          conclude('weak', 'ga4', {
            id: 'ch-leak',
            title: `${leak.name} brings many visits but few enquiries`,
            why: 'Attention is being won but not converted.',
            action: `Send ${leak.name} traffic to a dedicated landing page with one CTA instead of general pages.`,
            evidence: [
              { metric: 'enquiry_rate', value: leak.rate, text: `${leak.name}: ${pct(leak.sessions / S, 0)} of sessions, enquiry rate ${pct(leak.rate, 2)} vs site ${pct(rate, 2)}` },
              { text: 'Hypothesis, not a measurement: posts send people to pages that do not match what the post promised.' },
            ],
          });
        }
      }
      const pages = breakdown(g, 'landing_page');
      if (!pages.length) {
        insufficient('page-leak', 'ga4', 'Landing pages cannot be compared yet', 'GA4 rows need a landing_page column.');
      } else {
        const page = pages.filter((x) => x.sessions / S >= T.pageMinShare && x.rate < rate * T.pageBelowAverage).sort((a, b) => b.sessions - a.sessions)[0];
        if (page) {
          conclude('weak', 'ga4', {
            id: 'page-leak',
            title: `Landing page ${page.name} under-converts`,
            why: 'A high-traffic page converting below the site average is the cheapest place to gain enquiries: the visitors are already there.',
            action: `Review ${page.name}: put the primary CTA above the fold, shorten the form, state the offer in the first screen.`,
            evidence: [{ metric: 'enquiry_rate', value: page.rate, text: `${page.name}: ${page.sessions} sessions (${pct(page.sessions / S, 0)}), enquiry rate ${pct(page.rate, 2)} vs site ${pct(rate, 2)}` }],
          });
        }
      }
      const devices = breakdown(g, 'device');
      const mo = devices.find((x) => x.name === 'mobile');
      const de = devices.find((x) => x.name === 'desktop');
      if (!mo || !de) {
        insufficient('mobile-gap', 'ga4', 'Mobile and desktop visitors cannot be compared yet', 'GA4 rows need a device column with both mobile and desktop sessions.');
      } else if (mo.sessions / S >= T.mobileMinShare && mo.rate < de.rate * T.mobileBelowDesktop) {
        conclude('weak', 'ga4', {
          id: 'mobile-gap',
          title: 'Mobile visitors enquire far less than desktop visitors',
          why: 'If the mobile path is harder, every channel pays for it.',
          action: 'Test the enquiry path on a phone: form length, button size, load time, WhatsApp/click-to-call option.',
          evidence: [
            { metric: 'enquiry_rate', value: mo.rate, text: `Mobile: ${pct(mo.sessions / S, 0)} of sessions, enquiry rate ${pct(mo.rate, 2)}` },
            { metric: 'enquiry_rate', value: de.rate, text: `Desktop: enquiry rate ${pct(de.rate, 2)}` },
          ],
        });
      }
    }
  }

  /* ---- Organic search (Search Console) ---- */
  if (!data.gsc.length) {
    insufficient('no-gsc', 'gsc', 'Organic search visibility is unknown', 'Import a Search Console performance export.');
  } else {
    const queries = [...groupBy(data.gsc, 'query')].map(([name, rs]) => {
      const impressions = sum(rs, 'impressions');
      return { name, impressions, clicks: sum(rs, 'clicks'), position: rs.reduce((s, x) => s + (Number(x.position) || 0) * x.impressions, 0) / Math.max(1, impressions) };
    });
    const big = queries.filter((x) => x.impressions >= T.queryMinImpressions);
    if (!big.length) {
      insufficient('seo-q', 'gsc', 'Search queries are too small to judge yet', `A query needs ${T.queryMinImpressions}+ impressions before its click rate means anything.`);
    } else {
      const missed = big
        .filter((x) => x.position >= T.queryPosition[0] && x.position <= T.queryPosition[1] && x.clicks / x.impressions < T.queryMaxCtr)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 3);
      if (missed.length) {
        conclude('opp', 'gsc', {
          id: 'seo-q',
          title: 'People search for what you offer but rarely reach you',
          why: 'These queries already show your pages. Moving a few positions up usually costs less than buying the same visits.',
          action: 'Create or improve one page per query: put the phrase in the title, answer the need directly, add the primary CTA.',
          evidence: missed.map((x) => ({ metric: 'ctr', value: x.clicks / x.impressions, text: `"${x.name}": ${x.impressions} impressions, ${x.clicks} clicks (${pct(x.clicks / x.impressions, 1)}), average position ${x.position.toFixed(1)}` })),
        });
      }
    }
  }

  /* ---- Leads ---- */
  const l = data.leads;
  if (!l.length) {
    insufficient('no-leads', 'leads', 'Lead quality and sales outcomes are not connected', 'Export leads from your CRM or sheet with date, source, segment and status, and import the CSV.');
  } else {
    const overall = l.filter(isQualified).length / l.length;
    const all = { metric: 'qualified_share', value: overall, rows: l.length, text: `All leads: ${pct(overall, 0)} qualified (${l.length} leads)` };
    const unknown = l.filter((x) => !x.source).length / l.length;
    if (unknown >= T.unknownSourceShare) {
      conclude('weak', 'leads', {
        id: 'src-unknown',
        title: 'The source of many leads is not recorded',
        why: 'Leads with no source cannot be credited to any channel, so good channels look weaker than they are.',
        action: 'Add a required "How did you hear about us?" field or capture UTM values in the form.',
        evidence: [{ metric: 'unknown_source_share', value: unknown, rows: l.length, text: `${pct(unknown, 0)} of ${l.length} leads have an empty source field.` }],
      });
    }
    const sources = [...groupBy(l, 'source')].map(([name, rs]) => ({ name, count: rs.length, qualified: rs.filter(isQualified).length, rate: rs.filter(isQualified).length / rs.length }));
    const sized = sources.filter((x) => x.count >= T.sourceMinLeads);
    if (!sized.length) {
      insufficient('src-best', 'leads', 'Lead sources cannot be compared yet', `A source needs ${T.sourceMinLeads}+ leads before its quality can be judged.`);
    } else {
      const best = [...sized].sort((a, b) => b.rate - a.rate)[0];
      if (best.rate > overall * T.bestOverAverage) {
        conclude('strong', 'leads', {
          id: 'src-best',
          title: `${best.name} brings your best-quality leads`,
          why: 'Quality, not volume, is what turns into customers.',
          action: `Protect and grow ${best.name}; study what these leads saw before enquiring.`,
          evidence: [{ metric: 'qualified_share', value: best.rate, rows: best.count, text: `${best.name}: ${best.qualified} of ${best.count} leads qualified (${pct(best.rate, 0)})` }, all],
        });
      }
      const low = sources.filter((x) => x.count >= T.lowQualityMinLeads && x.rate < overall * T.lowQualityBelowAverage).sort((a, b) => b.count - a.count)[0];
      if (low) {
        conclude('weak', 'leads', {
          id: 'src-lowq',
          title: `${low.name} produces volume, not quality`,
          why: 'Counting these leads as success would reward the wrong activity.',
          action: `Tighten the audience and message on ${low.name}: name who the offer is for, and add one qualifying question to the form.`,
          evidence: [{ metric: 'qualified_share', value: low.rate, rows: low.count, text: `${low.name}: ${low.count} leads, ${pct(low.rate, 0)} qualified vs ${pct(overall, 0)} overall` }],
        });
      }
    }
    // Segments: the rule campaigns are built from ("Create campaign from this" in the Audit).
    const segments = [...groupBy(l, 'segment')]
      .map(([name, rs]) => ({ name, count: rs.length, qualified: rs.filter(isQualified).length, rate: rs.filter(isQualified).length / rs.length }))
      .filter((x) => x.count >= T.segmentMinLeads)
      .sort((a, b) => b.rate - a.rate);
    if (segments.length < 2) {
      insufficient('seg-best', 'leads', 'Customer segments cannot be compared yet', `Two segments need ${T.segmentMinLeads}+ leads each, with the segment filled in on the lead, before they can be compared.`);
    } else if (segments[0].rate > overall * T.segmentOverAverage) {
      const top = segments[0];
      conclude('opp', 'leads', {
        id: 'seg-best',
        title: `"${top.name}" is your strongest customer segment`,
        why: 'A campaign aimed at the segment that already qualifies best is the most evidence-backed way to raise lead quality.',
        action: `Run a campaign addressed to ${top.name}, built only from approved product facts.`,
        evidence: segments.map((x) => ({
          metric: 'qualified_share',
          value: x.rate,
          rows: x.count,
          text: `${x.name}: ${pct(x.rate, 0)} qualified (${x.count} leads${x.count < T.segmentSmallSample ? ', small sample' : ''})`,
        })),
      });
    }
  }

  /* ---- Social (Meta) ---- */
  const m = data.meta;
  if (!m.length) {
    insufficient('no-meta', 'meta', 'Social performance is not connected', 'Import a Meta Business Suite export in Integrations & Data.');
  } else {
    // Engagement per person reached. Posts tagged "campaign" are not a content theme.
    const engagement = (rs) => sum(rs, 'engagements') / Math.max(1, sum(rs, 'reach'));
    const account = engagement(m);
    const themes = [...groupBy(m.filter((x) => x.theme !== 'campaign'), 'theme')]
      .filter(([, rs]) => rs.length >= T.themeMinPosts)
      .map(([name, rs]) => ({ name, posts: rs.length, rate: engagement(rs), clicks: sum(rs, 'link_clicks') / Math.max(1, sum(rs, 'reach')) }))
      .sort((a, b) => b.rate - a.rate);
    if (themes.length < 2) {
      insufficient('theme-best', 'meta', 'Content themes cannot be compared yet', `Two themes need ${T.themeMinPosts}+ posts each, with the theme filled in on the post, before they can be compared.`);
    } else if (themes[0].rate > account * T.themeOverAverage) {
      const top = themes[0];
      const weakest = themes[themes.length - 1];
      conclude('strong', 'meta', {
        id: 'theme-best',
        title: `"${top.name}" is your strongest content theme`,
        why: 'Your own history shows what the audience responds to — a better guide than generic best practice.',
        action: `Publish more "${top.name}" posts and end each with the primary CTA and a tracked link.`,
        evidence: [
          { metric: 'engagement_rate', value: top.rate, rows: top.posts, text: `"${top.name}": engagement ${pct(top.rate, 1)} of reach across ${top.posts} posts; link clicks ${pct(top.clicks, 2)} of reach` },
          { metric: 'engagement_rate', value: account, rows: m.length, text: `Account average engagement: ${pct(account, 1)}; weakest theme "${weakest.name}": ${pct(weakest.rate, 1)}` },
          { text: 'Engagement is an awareness signal, not proof of enquiries.' },
        ],
      });
    }
  }

  /* ---- Brand, from approved facts only ---- */
  const tone = facts.filter((f) => f.cat === 'tone');
  const brand = facts.filter((f) => f.cat === 'brandid');
  if (tone.length && brand.length) {
    const used = [...tone, ...brand];
    items.push({
      id: 'brand-doc',
      kind: 'strong',
      basis: 'facts',
      synthetic: used.some((f) => f.synthetic),
      title: 'Tone of voice and colours are documented and approved',
      why: 'Documented guidelines let every asset be checked automatically instead of by eye.',
      action: 'Keep the approved guidelines up to date as the brand evolves.',
      evidence: used.map((f) => ({ factId: f.id, text: f.text })),
    });
  } else {
    const missing = [tone.length ? null : 'tone of voice', brand.length ? null : 'brand identity (colours)'].filter(Boolean).join(' and ');
    insufficient('brand-doc', null, 'Brand guidelines are not approved yet', `Approve a fact for ${missing} in the Knowledge Hub.`);
  }

  return { synthetic: items.some((i) => i.synthetic), items };
}

/** Audit for one company, from validated rows and approved facts only. */
export function audit(db, companyId) {
  const d = createData(db);
  const data = Object.fromEntries(KINDS.map((k) => [k, d.rows(companyId, k)]));
  const dates = KINDS.flatMap((k) => data[k].map((r) => r.date)).sort();
  return {
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    ...computeAudit(data, createKnowledge(db).approvedFacts(companyId)),
  };
}
