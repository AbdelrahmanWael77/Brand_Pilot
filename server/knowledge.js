/**
 * Server-side mirror of a company's knowledge.
 *
 * The frontend keeps sources and findings inside the opaque state blob. On every
 * state save the server copies them into the `sources` and `facts` tables so that
 * later phases can ask "which facts are approved?" without trusting the blob.
 *
 * `approvedFacts` is the ONLY read path other server code may use for facts.
 *
 * P4 (2026-11-20): approval is the server's record, not the browser's. fact_approvals holds each person's decision (who,
 * when, review-by date). A fact counts as approved only with an approved record whose review date has not passed
 * ("expired" otherwise). Tracking starts with the company's FIRST recorded decision: the facts the browser state shows as
 * approved at that moment get a legacy record ("approved before tracking began"). From then on an approval that exists
 * only in the browser state is "pending" (never trusted), while a rejection in the browser state always counts. Until
 * the first decision the browser state is used as before P4 (older clients keep working).
 *
 * Evidence invariant: a finding is mirrored as `approved` only when it carries a
 * non-empty evidence quote, or was typed by a person (`type: 'user'`). Any other
 * "approved" finding is stored as `pending` and reported back as downgraded.
 */

const STATUSES = ['pending', 'approved', 'rejected'];
const MAX_ID = 200;

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;
const str = (v) => (typeof v === 'string' ? v : '');
const strOrNull = (v) => (typeof v === 'string' && v ? v : null);

/** Returns a clean source row, or null when the item is not a usable source. */
function cleanSource(s) {
  if (s === null || typeof s !== 'object' || Array.isArray(s)) return null;
  if (!isId(s.id) || typeof s.title !== 'string') return null;
  if (s.text !== null && s.text !== undefined && typeof s.text !== 'string') return null;
  return { id: s.id, title: s.title, kind: str(s.kind), text: strOrNull(s.text), demo: s.demo === true ? 1 : 0, date: str(s.date) };
}

/** True when a finding may count as an approved fact. */
export const hasEvidence = (f) => f.type === 'user' || f.ev.trim() !== '';

/** Returns a clean fact row, or null when the item is not a usable finding. */
function cleanFact(f) {
  if (f === null || typeof f !== 'object' || Array.isArray(f)) return null;
  if (!isId(f.id) || typeof f.text !== 'string' || !STATUSES.includes(f.status)) return null;
  return {
    id: f.id,
    cat: str(f.cat),
    text: f.text,
    type: str(f.type),
    status: f.status,
    src: strOrNull(f.src),
    ev: str(f.ev),
    needs: f.needs === true ? 1 : 0,
    date: str(f.date),
  };
}

function cleanList(list, clean) {
  const rows = [];
  const seen = new Set();
  let skipped = 0;
  for (const item of Array.isArray(list) ? list : []) {
    const row = clean(item);
    if (!row || seen.has(row.id)) {
      skipped++;
      continue;
    }
    seen.add(row.id);
    rows.push(row);
  }
  return { rows, skipped };
}

/** Default review period of an approval, and the longest allowed. */
export const REVIEW = { days: 365, maxDays: 3 * 365 };
const DAY = 864e5;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));

export function createKnowledge(db) {
  const q = {
    approvals: db.prepare(
      `SELECT a.fact_id, a.status, a.by_user, a.at, a.review_by, a.legacy, u.email FROM fact_approvals a
       LEFT JOIN users u ON u.id = a.by_user WHERE a.company_id = ?`,
    ),
    since: db.prepare('SELECT approvals_since FROM company_settings WHERE company_id = ?'),
    setSince: db.prepare(
      'INSERT INTO company_settings (company_id, approvals_since) VALUES (?, ?) ON CONFLICT(company_id) DO UPDATE SET approvals_since = COALESCE(company_settings.approvals_since, excluded.approvals_since)',
    ),
    legacy: db.prepare("INSERT OR IGNORE INTO fact_approvals (company_id, fact_id, status, legacy) VALUES (?, ?, 'approved', 1)"),
    decide: db.prepare(
      `INSERT INTO fact_approvals (company_id, fact_id, status, by_user, at, review_by, legacy) VALUES (?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(company_id, fact_id) DO UPDATE SET status = excluded.status, by_user = excluded.by_user, at = excluded.at,
       review_by = excluded.review_by, legacy = 0`,
    ),
    undecide: db.prepare('DELETE FROM fact_approvals WHERE company_id = ? AND fact_id = ?'),
    oneFact: db.prepare('SELECT id, type, ev, status FROM facts WHERE company_id = ? AND id = ?'),
    deleteSources: db.prepare('DELETE FROM sources WHERE company_id = ?'),
    deleteFacts: db.prepare('DELETE FROM facts WHERE company_id = ?'),
    insertSource: db.prepare(
      'INSERT INTO sources (company_id, id, title, kind, text, demo, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    insertFact: db.prepare(
      `INSERT INTO facts (company_id, id, cat, text, type, status, src, ev, needs, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    facts: db.prepare(
      `SELECT f.id, f.cat, f.text, f.type, f.status, f.src, f.ev, f.needs, f.date, s.title AS src_title, s.demo AS src_demo
       FROM facts f LEFT JOIN sources s ON s.company_id = f.company_id AND s.id = f.src
       WHERE f.company_id = ? AND (? IS NULL OR f.status = ?) ORDER BY f.rowid`,
    ),
  };

  /**
   * Replace the company's mirrored sources and facts with what `state` holds.
   * Malformed items are skipped, never fatal. Call inside the caller's transaction.
   */
  function mirror(companyId, state) {
    const sources = cleanList(state?.sources, cleanSource);
    const facts = cleanList(state?.findings, cleanFact);
    const downgraded = [];
    for (const f of facts.rows) {
      if (f.status === 'approved' && !hasEvidence(f)) {
        f.status = 'pending';
        downgraded.push(f.id);
      }
    }
    q.deleteFacts.run(companyId);
    q.deleteSources.run(companyId);
    for (const s of sources.rows) q.insertSource.run(companyId, s.id, s.title, s.kind, s.text, s.demo, s.date);
    for (const f of facts.rows) {
      q.insertFact.run(companyId, f.id, f.cat, f.text, f.type, f.status, f.src, f.ev, f.needs, f.date);
    }
    return { sources: sources.rows.length, facts: facts.rows.length, skipped: sources.skipped + facts.skipped, downgraded };
  }

  /**
   * Facts of one company with their effective status (P4): 'approved' | 'expired' | 'rejected' | 'pending', and
   * `approval` { by (email or null), at, reviewBy, legacy } when a decision is recorded. `status` filters on the
   * effective status. `now` decides expiry (tests pass a fixed date).
   */
  function listFacts(companyId, status = null, { now = Date.now() } = {}) {
    const recs = new Map(q.approvals.all(companyId).map((a) => [a.fact_id, a]));
    const tracked = !!q.since.get(companyId)?.approvals_since;
    const today = isoDay(now);
    const rows = q.facts.all(companyId, null, null).map((r) => {
      const a = recs.get(r.id);
      let st;
      if (a && a.status === 'rejected') st = 'rejected';
      else if (a && r.status === 'rejected') st = 'rejected'; // rejected in the browser: withdrawn
      else if (a) st = a.review_by && a.review_by < today ? 'expired' : 'approved';
      else if (!tracked) st = r.status; // before the first recorded decision: the browser state, as before P4
      else st = r.status === 'rejected' ? 'rejected' : 'pending'; // approved in the browser, not recorded: not trusted
      return {
        id: r.id,
        cat: r.cat,
        text: r.text,
        type: r.type,
        status: st,
        src: r.src,
        srcTitle: r.src_title ?? null,
        synthetic: r.src_demo === 1, // comes from a labeled demo source, not real company material
        ev: r.ev,
        needs: r.needs === 1,
        date: r.date,
        ...(a ? { approval: { by: a.email ?? null, at: a.at, reviewBy: a.review_by, legacy: a.legacy === 1 } } : {}),
      };
    });
    return status ? rows.filter((r) => r.status === status) : rows;
  }

  /**
   * P4: record one person's decisions. decisions = [{ id, status: 'approved' | 'rejected' | 'pending', reviewBy? }]
   * (pending removes the decision). Approving needs evidence (a source quote or a fact typed by a person), the review
   * date defaults to one year and may not be in the past or more than three years away. Returns per id the fact with its
   * effective status, or { id, error } ('not_found' | 'no_evidence' | 'invalid_review'). Call inside a transaction.
   */
  function decide(companyId, userId, decisions, { now = Date.now() } = {}) {
    const today = isoDay(now);
    const max = isoDay(now + REVIEW.maxDays * DAY);
    const out = [];
    // The first recorded decision starts tracking: what the browser state shows as approved now was approved before.
    if (!q.since.get(companyId)?.approvals_since) {
      const now0 = new Set(decisions.map((d) => d.id)); // decided in this request: recorded as this person's
      for (const f of q.facts.all(companyId, 'approved', 'approved')) if (!now0.has(f.id)) q.legacy.run(companyId, f.id);
      q.setSince.run(companyId, new Date(now).toISOString());
    }
    const recs = new Map(q.approvals.all(companyId).map((a) => [a.fact_id, a]));
    for (const d of decisions) {
      const f = q.oneFact.get(companyId, d.id);
      if (!f) { out.push({ id: d.id, error: 'not_found' }); continue; }
      if (d.status === 'pending') { q.undecide.run(companyId, d.id); out.push({ id: d.id }); continue; }
      if (d.status === 'approved' && !hasEvidence(f)) { out.push({ id: d.id, error: 'no_evidence' }); continue; }
      // the browser re-sends what it shows as approved; that never turns "approved before tracking began" into a new
      // approval — only an explicit re-approval (with a review date) does
      const prev = recs.get(d.id);
      if (d.status === 'approved' && !d.reviewBy && prev && prev.status === 'approved' && (prev.legacy === 1 || (prev.review_by && prev.review_by >= today))) { out.push({ id: d.id }); continue; }
      let reviewBy = null;
      if (d.status === 'approved') {
        reviewBy = d.reviewBy ?? isoDay(now + REVIEW.days * DAY);
        if (!isDate(reviewBy) || reviewBy <= today || reviewBy > max) { out.push({ id: d.id, error: 'invalid_review' }); continue; }
      }
      q.decide.run(companyId, d.id, d.status, userId, new Date(now).toISOString(), reviewBy);
      out.push({ id: d.id });
    }
    const by = new Map(listFacts(companyId, null, { now }).map((x) => [x.id, x]));
    return out.map((o) => (o.error ? o : { id: o.id, fact: by.get(o.id) }));
  }

  const tracked = (companyId) => !!q.since.get(companyId)?.approvals_since;
  /** Demo mode only (the route checks it): an approved, recorded fact gets yesterday as its review date. */
  function demoExpire(companyId, factId, { now = Date.now() } = {}) {
    if (!q.oneFact.get(companyId, factId)) return { error: 'not_found' };
    const r = db.prepare("UPDATE fact_approvals SET review_by = ? WHERE company_id = ? AND fact_id = ? AND status = 'approved'").run(isoDay(now - DAY), companyId, factId);
    if (!r.changes) return { error: 'not_approved' };
    return { fact: listFacts(companyId, null, { now }).find((f) => f.id === factId) };
  }
  return { mirror, listFacts, decide, tracked, demoExpire, approvedFacts: (companyId, o) => listFacts(companyId, 'approved', o) };
}

/** The only read path later phases may use for "facts": approved ones, for one company. */
export function approvedFacts(db, companyId) {
  return createKnowledge(db).approvedFacts(companyId);
}

export { STATUSES };
