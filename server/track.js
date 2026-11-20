/**
 * P6 (2026-11-20): the track record — did the steps BrandPilot recommended move their number?
 *
 * When a recommendation becomes a campaign or a task, the server saves a plan: the metric the step should move (and the
 * channel, page, device, source or segment it is about), the baseline (that metric over the review window's length of
 * days before the step started, from the data on the server), the expected direction and the target (the baseline
 * moved by at least MIN_CHANGE in that direction), and the review window (the days from the start). Nothing comes from
 * the browser except which recommendation, which campaign or task, and the window length.
 *
 * Once the company's data reaches the end of the window, the step is evaluated once: met (moved the expected way by at
 * least MIN_CHANGE), no change (within it), not met (moved the other way by at least MIN_CHANGE), or inconclusive (too
 * few sessions, impressions or leads in either period to judge). The result is stored with the step and written to the
 * audit trail; it is never re-evaluated. The score (met ÷ evaluated, inconclusive excluded) is shown only from
 * SCORE_MIN evaluated steps on.
 *
 * Attribution limits: a result says what happened after a step, not that the step caused it.
 */
import crypto from 'node:crypto';
import { createData, KINDS } from './data.js';
import { audit } from './audit.js';
import { createTrail } from './trail.js';
export { TRACK_SCHEMA } from './trackSchema.js';

export const SCORE_MIN = 5;
export const MIN_CHANGE = 0.05;
export const WINDOWS = [7, 14, 28, 56, 90];
export const STEP_KINDS = ['campaign', 'task'];


const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const isQualified = (r) => r.status === 'qualified' || r.status === 'customer';

/**
 * Measures: dataset, how to compute it on rows, the sample it rests on and the smallest sample worth judging.
 * value(rows) → number or null (nothing to divide by); n(rows) → the sample size shown and checked against min.
 */
export const MEASURES = {
  enquiries: { kind: 'ga4', value: (r) => sum(r, 'enquiries'), n: (r) => sum(r, 'sessions'), min: 30, unit: 'count' },
  enquiry_rate: { kind: 'ga4', value: (r) => (sum(r, 'sessions') ? sum(r, 'enquiries') / sum(r, 'sessions') : null), n: (r) => sum(r, 'sessions'), min: 30, unit: 'rate' },
  ctr: { kind: 'gsc', value: (r) => (sum(r, 'impressions') ? sum(r, 'clicks') / sum(r, 'impressions') : null), n: (r) => sum(r, 'impressions'), min: 100, unit: 'rate' },
  qualified_leads: { kind: 'leads', value: (r) => r.filter(isQualified).length, n: (r) => r.length, min: 5, unit: 'count' },
  qualified_share: { kind: 'leads', value: (r) => (r.length ? r.filter(isQualified).length / r.length : null), n: (r) => r.length, min: 10, unit: 'rate' },
  unknown_source_share: { kind: 'leads', value: (r) => (r.length ? r.filter((x) => !x.source).length / r.length : null), n: (r) => r.length, min: 10, unit: 'rate' },
  posts: { kind: 'meta', value: (r) => r.length, n: (r) => r.length, min: 0, unit: 'count' },
  engagement_rate: { kind: 'meta', value: (r) => (sum(r, 'reach') ? sum(r, 'engagements') / sum(r, 'reach') : null), n: (r) => r.length, min: 3, unit: 'rate' },
};

/** Which number each recommendation should move. scope: the column the recommendation's subject is a value of. */
export const PLAN = {
  'no-track': { metric: 'enquiries', dir: 'up' },
  'ch-best': { metric: 'enquiries', scope: 'channel', dir: 'up' },
  'ch-leak': { metric: 'enquiry_rate', scope: 'channel', dir: 'up' },
  'page-leak': { metric: 'enquiry_rate', scope: 'landing_page', dir: 'up' },
  'mobile-gap': { metric: 'enquiry_rate', scope: 'device', value: 'mobile', dir: 'up' },
  'seo-q': { metric: 'ctr', dir: 'up' },
  'src-unknown': { metric: 'unknown_source_share', dir: 'down' },
  'src-best': { metric: 'qualified_leads', scope: 'source', dir: 'up' },
  'src-lowq': { metric: 'qualified_share', scope: 'source', dir: 'up' },
  'seg-best': { metric: 'qualified_leads', scope: 'segment', dir: 'up' },
  cadence: { metric: 'posts', dir: 'up' },
  'theme-best': { metric: 'engagement_rate', dir: 'up' },
  'eng-drop': { metric: 'engagement_rate', dir: 'up' },
  lang: { metric: 'engagement_rate', dir: 'up' },
  'plat-roles': { metric: 'engagement_rate', dir: 'up' },
};

/** The plan for one audit item, or null when it has no number to move (an information gap). */
export function planFor(item) {
  if (!item || item.basis === 'insufficient') return null;
  const p = PLAN[item.id];
  if (!p) return null;
  const value = p.value ?? (p.scope ? item.subject ?? null : null);
  if (p.scope && !value) return null;
  return { metric: p.metric, dir: p.dir, scopeKey: p.scope ?? null, scopeValue: p.scope ? value : null };
}

/** Pure: met | no_change | not_met for a baseline and a result, given the expected direction. */
export function judge(baseline, result, dir) {
  const up = dir === 'up';
  if (baseline === 0) {
    if (result === 0) return 'no_change';
    return (result > 0) === up ? 'met' : 'not_met';
  }
  const change = (result - baseline) / Math.abs(baseline);
  if (Math.abs(change) < MIN_CHANGE) return 'no_change';
  return (change > 0) === up ? 'met' : 'not_met';
}
const targetOf = (baseline, dir) => (baseline === null ? null : dir === 'up' ? (baseline === 0 ? 0 : baseline * (1 + MIN_CHANGE)) : baseline * (1 - MIN_CHANGE));

export function createTrack(db) {
  const data = createData(db);
  const trail = createTrail(db);
  const q = {
    insert: db.prepare(`INSERT INTO track_steps (id, company_id, kind, ref, rec_id, title_en, title_ar, metric, scope_key, scope_value, direction,
      baseline, baseline_n, baseline_from, baseline_to, target, window_days, start, window_end, created_by, created_at, data_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    byRef: db.prepare('SELECT * FROM track_steps WHERE company_id = ? AND kind = ? AND ref = ?'),
    list: db.prepare('SELECT * FROM track_steps WHERE company_id = ? ORDER BY created_at DESC, rowid DESC'),
    pending: db.prepare('SELECT * FROM track_steps WHERE company_id = ? AND outcome IS NULL AND metric IS NOT NULL'),
    evaluate: db.prepare('UPDATE track_steps SET outcome = ?, result = ?, result_n = ?, evaluated_at = ?, trail_id = ? WHERE id = ? AND outcome IS NULL'),
    email: db.prepare('SELECT email FROM users WHERE id = ?'),
  };

  const rowsOf = (companyId, kind) => data.rows(companyId, kind);
  const lastDate = (rows) => rows.reduce((m, r) => (r.date > m ? r.date : m), '');
  const within = (rows, from, to, s) => rows.filter((r) => r.date >= from && r.date <= to && (!s.scope_key || r[s.scope_key] === s.scope_value));
  const measure = (rows, metric) => {
    const M = MEASURES[metric];
    return { value: M.value(rows), n: M.n(rows) };
  };

  /**
   * Save the plan when a recommendation becomes a campaign or a task. Idempotent per (kind, ref): the first plan stays.
   * → { step } | { error: 'not_found' (no such recommendation now) | 'invalid' }
   */
  function start(companyId, userId, { recId, kind, ref, range = '28', windowDays = 28 }, { now = new Date() } = {}) {
    if (!STEP_KINDS.includes(kind) || typeof ref !== 'string' || !ref || ref.length > 200 || typeof recId !== 'string') return { error: 'invalid' };
    if (!WINDOWS.includes(windowDays)) return { error: 'invalid' };
    const old = q.byRef.get(companyId, kind, ref);
    if (old) return { step: view(old) };
    const en = audit(db, companyId, { lang: 'en', range, now });
    const item = en?.items.find((x) => x.id === recId);
    if (!item) return { error: 'not_found' };
    const ar = audit(db, companyId, { lang: 'ar', range, now })?.items.find((x) => x.id === recId);
    const plan = planFor(item);
    const startDay = isoDay(now);
    const windowEnd = addDays(startDay, windowDays - 1);
    let baseline = null;
    let baselineN = null;
    let bFrom = null;
    let bTo = null;
    if (plan) {
      const rows = rowsOf(companyId, MEASURES[plan.metric].kind);
      // the window's length of days before the step started, ending at the last day of data before the start
      const end = [addDays(startDay, -1), lastDate(rows)].filter(Boolean).sort()[0];
      if (end) {
        bTo = end;
        bFrom = addDays(end, -(windowDays - 1));
        const m = measure(within(rows, bFrom, bTo, { scope_key: plan.scopeKey, scope_value: plan.scopeValue }), plan.metric);
        baseline = m.value;
        baselineN = m.n;
      }
    }
    const id = crypto.randomUUID();
    db.exec('SAVEPOINT track_start');
    try {
      q.insert.run(id, companyId, kind, ref, recId, item.title, ar?.title ?? null, plan?.metric ?? null, plan?.scopeKey ?? null, plan?.scopeValue ?? null, plan?.dir ?? null,
        baseline, baselineN, bFrom, bTo, plan ? targetOf(baseline, plan.dir) : null, windowDays, startDay, windowEnd, userId, now.toISOString(), trail.fingerprint(companyId));
      const s = q.byRef.get(companyId, kind, ref);
      trail.append(companyId, { kind: 'step_tracked', subject: recId, userId, now, engine: 'rules', dataHash: s.data_hash, detail: { stepId: id, stepKind: kind, ref, title: { en: s.title_en, ar: s.title_ar }, metric: s.metric, scope: s.scope_key ? { [s.scope_key]: s.scope_value } : null, direction: s.direction, baseline: s.baseline, baselineN: s.baseline_n, baselinePeriod: s.baseline_from ? [s.baseline_from, s.baseline_to] : null, target: s.target, window: [s.start, s.window_end] } });
      db.exec('RELEASE track_start');
    } catch (e) {
      db.exec('ROLLBACK TO track_start');
      db.exec('RELEASE track_start');
      throw e;
    }
    return { step: view(q.byRef.get(companyId, kind, ref)) };
  }

  /** Evaluate every step whose window the data now covers. Each evaluation is written once, with a trail row. */
  function evaluateDue(companyId, { now = new Date() } = {}) {
    let done = 0;
    for (const s of q.pending.all(companyId)) {
      const rows = rowsOf(companyId, MEASURES[s.metric].kind);
      if (lastDate(rows) < s.window_end) continue; // the data does not reach the end of the window yet
      const m = measure(within(rows, s.start, s.window_end, s), s.metric);
      const min = MEASURES[s.metric].min;
      const enough = s.baseline !== null && m.value !== null && (s.baseline_n ?? 0) >= min && m.n >= min && (min > 0 || s.baseline_n > 0 || m.n > 0);
      const outcome = enough ? judge(s.baseline, m.value, s.direction) : 'inconclusive';
      db.exec('SAVEPOINT track_eval');
      try {
        const tid = trail.append(companyId, { kind: 'evaluation', subject: s.rec_id, now, engine: 'rules', dataHash: trail.fingerprint(companyId), detail: { stepId: s.id, stepKind: s.kind, ref: s.ref, title: { en: s.title_en, ar: s.title_ar }, metric: s.metric, scope: s.scope_key ? { [s.scope_key]: s.scope_value } : null, direction: s.direction, baseline: s.baseline, baselineN: s.baseline_n, baselinePeriod: [s.baseline_from, s.baseline_to], result: m.value, resultN: m.n, window: [s.start, s.window_end], outcome, minChange: MIN_CHANGE } });
        q.evaluate.run(outcome, m.value, m.n, now.toISOString(), tid, s.id);
        db.exec('RELEASE track_eval');
        done++;
      } catch (e) {
        db.exec('ROLLBACK TO track_eval');
        db.exec('RELEASE track_eval');
        throw e;
      }
    }
    return done;
  }

  /** The track record: the steps (newest first), the score once SCORE_MIN steps are evaluated, the next review date. */
  function record(companyId, { now = new Date() } = {}) {
    evaluateDue(companyId, { now });
    const steps = q.list.all(companyId).map(view);
    const judged = steps.filter((s) => ['met', 'no_change', 'not_met'].includes(s.outcome));
    const met = judged.filter((s) => s.outcome === 'met').length;
    const waiting = steps.filter((s) => s.metric && !s.outcome).map((s) => s.window[1]).sort();
    // the data has to reach this date before the next step can be evaluated
    const dataTo = Object.fromEntries(KINDS.map((k) => [k, lastDate(rowsOf(companyId, k)) || null]));
    return {
      steps,
      evaluated: judged.length,
      needed: SCORE_MIN,
      score: judged.length >= SCORE_MIN ? { met, of: judged.length, share: met / judged.length } : null,
      waitingUntil: waiting[0] ?? null,
      dataTo,
      minChange: MIN_CHANGE,
    };
  }

  return { start, evaluateDue, record };
}

/** A step as the API returns it. */
function view(s) {
  return {
    id: s.id, kind: s.kind, ref: s.ref, recId: s.rec_id, title: { en: s.title_en, ar: s.title_ar },
    metric: s.metric, scope: s.scope_key ? { key: s.scope_key, value: s.scope_value } : null, direction: s.direction,
    baseline: s.baseline, baselineN: s.baseline_n, baselinePeriod: s.baseline_from ? [s.baseline_from, s.baseline_to] : null,
    target: s.target, unit: s.metric ? MEASURES[s.metric].unit : null, window: [s.start, s.window_end], windowDays: s.window_days,
    createdAt: s.created_at, outcome: s.outcome, result: s.result, resultN: s.result_n, evaluatedAt: s.evaluated_at, trailId: s.trail_id,
  };
}
