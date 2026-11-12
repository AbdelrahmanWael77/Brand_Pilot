/**
 * Server-side mirror of a company's knowledge.
 *
 * The frontend keeps sources and findings inside the opaque state blob. On every
 * state save the server copies them into the `sources` and `facts` tables so that
 * later phases can ask "which facts are approved?" without trusting the blob.
 *
 * `approvedFacts` is the ONLY read path other server code may use for facts.
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

export function createKnowledge(db) {
  const q = {
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

  /** Facts of one company, optionally filtered by status (must be one of STATUSES or null). */
  function listFacts(companyId, status = null) {
    return q.facts.all(companyId, status, status).map((r) => ({
      id: r.id,
      cat: r.cat,
      text: r.text,
      type: r.type,
      status: r.status,
      src: r.src,
      srcTitle: r.src_title ?? null,
      synthetic: r.src_demo === 1, // comes from a labeled demo source, not real company material
      ev: r.ev,
      needs: r.needs === 1,
      date: r.date,
    }));
  }

  return { mirror, listFacts, approvedFacts: (companyId) => listFacts(companyId, 'approved') };
}

/** The only read path later phases may use for "facts": approved ones, for one company. */
export function approvedFacts(db, companyId) {
  return createKnowledge(db).approvedFacts(companyId);
}

export { STATUSES };
