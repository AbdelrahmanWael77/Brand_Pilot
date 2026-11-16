/**
 * Channel comparison for server code (task 12): the AI Marketing Director's context gets the same per-channel
 * numbers the Analytics "Compare channels" tab shows. The math is NOT duplicated: `public/compare.js` (a classic
 * browser script, pure, no DOM) is run here in a vm sandbox, so the browser and the server always agree.
 * Input rows come only from the trusted read path (`dataRows`), never from the state blob.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { periods, RANGES } from './metrics.js';

const sandbox = {};
vm.runInNewContext(readFileSync(new URL('../public/compare.js', import.meta.url), 'utf8'), sandbox, { filename: 'public/compare.js' });
/** The same object the browser uses as `window.BPCompare`. */
export const BPCompare = sandbox.BPCompare;

export { RANGES };
const KEEP = ['posts', 'reach', 'impr', 'eng', 'engRate', 'clicks', 'clickRate', 'spend', 'cpc', 'sessions', 'enq', 'enqRate', 'leads', 'qual', 'qshare', 'cpl', 'simpr', 'sclicks', 'sctr', 'pos'];
const round = (v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
const pick = (o) => Object.fromEntries(KEEP.filter((k) => k in o).map((k) => [k, round(o[k])]));

/** The rules the numbers follow, given to the model with them so it does not over-read them. */
export const CHANNEL_RULES = [
  'Every channel uses the same dates ("period"). null = not measured, never zero.',
  'leads / qual / qshare count leads by the source the team recorded in its CRM file. They are not conversions tracked by a platform. Lead sources that name no channel are in "unassignedLeadSources" ("Google" may be organic search or ads).',
  'cpl = spend from the post files divided by leads recorded from that source: a rough guide, not a tracked cost per acquisition.',
  'sessions / enq / enqRate come from GA4. GA4 does not split social visits by platform unless its channel names the platform; then they are only in "socialWebsiteCombined".',
  'reach, engagements and link clicks are reported by each platform and counted its own way: compare large gaps only. engRate = engagements / reach, clickRate = link clicks / reach.',
  'Rates are fractions (0.033 = 3.3%). "leaders" lists a metric only when two channels have enough data and the leader is at least 10% ahead.',
  'spend, cpc and cpl are amounts in "currency" (an ISO code). When "currency" is null, give the amounts without any currency sign.',
];

/** Pure: per-channel comparison for one range of already-validated rows, or null when there are no rows. */
export function channelSummary(data, range = '28', currency = null) {
  const P = periods(data, range);
  if (!P) return null;
  // Through JSON so the result carries this realm's prototypes (it comes out of the vm sandbox).
  const R = JSON.parse(JSON.stringify(BPCompare.compare(data, P.cur, P.prev)));
  return {
    range,
    currency: typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : null,
    period: { from: P.cur[0], to: P.cur[1] },
    previous: P.prev ? { from: P.prev[0], to: P.prev[1] } : null,
    rules: CHANNEL_RULES,
    channels: Object.fromEntries(R.cols.map((c) => [c, { ...pick(R.now.cols[c]), dataFrom: R.cov[c]?.first ?? null, dataTo: R.cov[c]?.last ?? null }])),
    previousPeriod: R.before ? Object.fromEntries(R.cols.map((c) => [c, pick(R.before.cols[c])])) : null,
    socialWebsiteCombined: R.now.pool ? pick(R.now.pool) : null,
    unassignedLeadSources: R.now.other.slice(0, 10).map((x) => ({ source: x.n, leads: x.leads, qual: x.qual })),
    leaders: Object.fromEntries(Object.entries(R.best).map(([k, b]) => [k, { channel: b.c, value: round(b.v), next: b.run, nextValue: round(b.rv) }])),
    synthetic: Object.values(data).some((rs) => rs.some((r) => r.synthetic)),
  };
}
