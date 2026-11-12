/**
 * Grounding context for the AI Marketing Director (task 4.1) — no AI call here.
 *
 * `buildContext` is the ONLY material a later prompt may be built from. It reads one
 * company through the trusted read paths and nothing else:
 *   - `approvedFacts`  approved findings with evidence (never pending / rejected ones)
 *   - `metrics`        KPIs from validated rows (null + reason when not supported)
 *   - `audit`          audit items, each with its basis ('data' | 'facts' | 'insufficient')
 * It never reads the state blob. Text taken from company sources is DATA for the model,
 * not instructions; the prompt builder (4.3) must present it that way.
 */
import { approvedFacts } from './knowledge.js';
import { metrics } from './metrics.js';
import { audit } from './audit.js';

/** Size limits, so one company cannot produce an unbounded prompt. */
export const CAPS = { facts: 200, factText: 500, evidence: 300, auditEvidence: 10 };

const cut = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) : t;
};

/** Pure: shapes already-trusted inputs into the context object. */
export function shapeContext({ name, facts, metrics: m, audit: a }) {
  const kept = facts.slice(0, CAPS.facts);
  const outFacts = kept.map((f) => ({
    id: f.id,
    cat: f.cat,
    text: cut(f.text, CAPS.factText),
    // A fact typed in by the user has no quote; say so instead of leaving a blank that looks like missing evidence.
    ev: f.type === 'user' ? '' : cut(f.ev, CAPS.evidence),
    enteredManually: f.type === 'user',
    srcTitle: f.srcTitle ?? null,
    synthetic: !!f.synthetic,
  }));
  const kpis = Object.fromEntries(
    Object.entries(m.kpis).map(([k, v]) => [
      k,
      v.value === null ? { value: null, reason: v.reason, synthetic: !!v.synthetic } : { value: v.value, rows: v.rows, synthetic: !!v.synthetic },
    ]),
  );
  const items = a.items.map((i) => ({
    id: i.id,
    kind: i.kind,
    basis: i.basis,
    synthetic: !!i.synthetic,
    title: i.title,
    why: i.why,
    action: i.action,
    evidence: i.evidence.slice(0, CAPS.auditEvidence).map((e) => ({ ...e, text: cut(e.text, CAPS.evidence) })),
    ...(i.needs ? { needs: i.needs } : {}),
  }));
  const out = {
    company: { name: cut(name, 200) },
    facts: outFacts,
    metrics: { range: m.range, period: m.period, synthetic: !!m.synthetic, kpis },
    audit: { period: a.period ?? null, synthetic: !!a.synthetic, items },
    synthetic: outFacts.some((f) => f.synthetic) || !!m.synthetic || !!a.synthetic,
  };
  if (facts.length > kept.length) out.truncated = { facts: facts.length - kept.length };
  return out;
}

/** Context for one company. Returns null when the company does not exist. */
export function buildContext(db, companyId) {
  const row = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
  if (!row) return null;
  return shapeContext({
    name: row.name,
    facts: approvedFacts(db, companyId),
    metrics: metrics(db, companyId, 'all'),
    audit: audit(db, companyId),
  });
}
