/**
 * KPIs computed on the server from validated imported rows (`dataRows`), never from the blob.
 *
 * The period and aggregation rules mirror the frontend Analytics screen (`dataRange`,
 * `periods`, `agg`, `tracked` in public/index.html) so both show the same numbers:
 *   - a period ends at the latest date found in the company's data, not today;
 *   - range 7 / 28 / 90 = that many days ending there, clamped to the first data date;
 *   - a previous period of equal length exists only when it fits inside the data.
 *
 * Honesty rule: a KPI with nothing behind it is `value: null` with a `reason`
 * (`no_data` = no rows in the period, `not_measured` = the rows do not carry that
 * measure). It is never reported as 0. Rates are fractions (0.25 = 25%).
 */
import { createData, KINDS } from './data.js';

export const RANGES = ['7', '28', '90', 'all'];

const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
/** Sum of an optional column, or 'not_measured' when no row carries it (an absent column is not a 0). */
const sumOpt = (rows, k) => (rows.some((r) => r[k] !== undefined && r[k] !== null) ? sum(rows, k) : 'not_measured');
const isQualified = (r) => r.status === 'qualified' || r.status === 'customer';

/** First and last date across all datasets, or null when there is no data. */
function dataRange(data) {
  let from = null;
  let to = null;
  for (const k of KINDS) {
    for (const r of data[k]) {
      if (from === null || r.date < from) from = r.date;
      if (to === null || r.date > to) to = r.date;
    }
  }
  return from === null ? null : [from, to];
}

function periods(data, range) {
  const dr = dataRange(data);
  if (!dr) return null;
  let from = range === 'all' ? dr[0] : addDays(dr[1], -(Number(range) - 1));
  if (from < dr[0]) from = dr[0];
  const days = dayDiff(from, dr[1]) + 1;
  const prevFrom = addDays(from, -days);
  return { cur: [from, dr[1]], prev: range === 'all' || prevFrom < dr[0] ? null : [prevFrom, addDays(from, -1)], days };
}

/** Raw totals for one period; `null` period = all rows. */
function aggregate(data, p) {
  const within = (r) => !p || (r.date >= p[0] && r.date <= p[1]);
  const me = data.meta.filter(within);
  const g = data.ga4.filter(within);
  const s = data.gsc.filter(within);
  const l = data.leads.filter(within);
  return {
    rows: { meta: me.length, ga4: g.length, gsc: s.length, leads: l.length },
    synthetic: { meta: me.some((r) => r.synthetic), ga4: g.some((r) => r.synthetic), gsc: s.some((r) => r.synthetic), leads: l.some((r) => r.synthetic) },
    reach: sum(me, 'reach'),
    impressions: sumOpt(me, 'impressions'),
    engagements: sum(me, 'engagements'),
    link_clicks: sumOpt(me, 'link_clicks'),
    spend: sum(me, 'spend'),
    sessions: sum(g, 'sessions'),
    enquiries: sum(g, 'enquiries'),
    search_clicks: sum(s, 'clicks'),
    search_impressions: sum(s, 'impressions'),
    leads: l.length,
    qualified_leads: l.filter(isQualified).length,
    customers: l.filter((r) => r.status === 'customer').length,
  };
}

/**
 * @param {{meta: object[], ga4: object[], gsc: object[], leads: object[]}} data rows from `dataRows`
 * @param {'7'|'28'|'90'|'all'} range
 */
export function computeMetrics(data, range = '28') {
  const P = periods(data, range);
  const a = aggregate(data, P ? P.cur : ['9', '0']); // no data: an empty period
  const b = P && P.prev ? aggregate(data, P.prev) : null;
  // Like the Analytics screen: enquiries count as tracked once any GA4 row ever recorded one.
  const enquiriesTracked = sum(data.ga4, 'enquiries') > 0;

  /** One KPI. `kinds` = datasets it depends on; `value(x)` returns a number, or a reason string. */
  const kpi = (kinds, value) => {
    const missing = kinds.find((k) => a.rows[k] === 0);
    const cur = missing ? 'no_data' : value(a);
    const out = { value: typeof cur === 'number' ? cur : null, rows: Math.min(...kinds.map((k) => a.rows[k])), synthetic: kinds.some((k) => a.synthetic[k]) };
    if (typeof cur !== 'number') out.reason = cur;
    const prev = b && !kinds.some((k) => b.rows[k] === 0) ? value(b) : null;
    out.previous = typeof prev === 'number' ? prev : null;
    return out;
  };
  const total = (kind, key) => kpi([kind], (x) => x[key]);
  const ratio = (num, den) => (x) => (x[den] > 0 ? x[num] / x[den] : 'no_data');
  const spend = (x) => (x.spend > 0 ? x.spend : 'not_measured'); // a blank or absent spend column sums to 0

  const kpis = {
    reach: total('meta', 'reach'),
    impressions: total('meta', 'impressions'),
    engagements: total('meta', 'engagements'),
    link_clicks: total('meta', 'link_clicks'),
    spend: kpi(['meta'], spend),
    sessions: total('ga4', 'sessions'),
    enquiries: kpi(['ga4'], (x) => (enquiriesTracked ? x.enquiries : 'not_measured')),
    enquiry_rate: kpi(['ga4'], (x) => (enquiriesTracked ? ratio('enquiries', 'sessions')(x) : 'not_measured')),
    search_clicks: total('gsc', 'search_clicks'),
    search_impressions: total('gsc', 'search_impressions'),
    ctr: kpi(['gsc'], ratio('search_clicks', 'search_impressions')),
    leads: total('leads', 'leads'),
    qualified_leads: total('leads', 'qualified_leads'),
    qualified_share: kpi(['leads'], ratio('qualified_leads', 'leads')),
    customers: total('leads', 'customers'),
    cost_per_lead: kpi(['meta', 'leads'], (x) => (x.spend > 0 ? x.spend / x.leads : 'not_measured')),
  };
  return {
    range,
    period: P ? { from: P.cur[0], to: P.cur[1], days: P.days } : null,
    previous: P && P.prev ? { from: P.prev[0], to: P.prev[1] } : null,
    synthetic: KINDS.some((k) => a.synthetic[k]),
    kpis,
  };
}

/** KPIs for one company. The only way later server code (audit, AI director) should obtain numbers. */
export function metrics(db, companyId, range = '28') {
  const d = createData(db);
  return computeMetrics(Object.fromEntries(KINDS.map((k) => [k, d.rows(companyId, k)])), range);
}
