/**
 * P5 (2026-11-20): the audit trail — an append-only record per company of what BrandPilot recommended and answered, and
 * of what people decided.
 *
 *   recommendation     one row per recommendation, written only when its inputs change (data, approved facts, period,
 *                      rules version): the same audit read twice is not recorded twice
 *   answer             one row per Director answer: engine (rules, or the AI model id), prompt version, the support
 *   fact_decision      a person approved, rejected or reset a fact (review date, the fact's text at that moment)
 *   tracking_started   the server started recording approvals; the facts already approved then
 *   strategy_approval  a person approved a campaign's strategy (and the facts it uses)
 *   report             a report snapshot was saved, with the trail ids of the recommendations in it
 *   step_tracked       P6: a recommendation became a campaign or task; its plan (metric, baseline, direction, target, window)
 *   evaluation         P6: that step's window is covered by data; the result and the outcome
 *
 * Every row keeps: when, who (user id and the e-mail at that moment), engine, prompt or rules version, and the data
 * fingerprint (data_mirror hash + the approved facts) the row rests on.
 *
 * Append-only: the triggers below refuse every UPDATE, any INSERT that would replace a row, and every DELETE except the
 * cascade when the whole company is deleted (its data goes with it, as everywhere else). No route updates or deletes
 * trail rows (test/trail.test.js calls every route to check).
 */
import crypto from 'node:crypto';

export const RULES_VERSION = 'rules-2026-11-20';
export const TRAIL_KINDS = ['recommendation', 'answer', 'fact_decision', 'tracking_started', 'strategy_approval', 'report', 'step_tracked', 'evaluation'];

export const TRAIL_SCHEMA = `
CREATE TABLE IF NOT EXISTS trail (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  at             TEXT NOT NULL,
  kind           TEXT NOT NULL,
  subject        TEXT,
  user_id        TEXT,
  user_email     TEXT,
  engine         TEXT,
  prompt_version TEXT,
  data_hash      TEXT,
  batch          TEXT,
  detail         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trail_company ON trail (company_id, at);
CREATE TRIGGER IF NOT EXISTS trail_no_update BEFORE UPDATE ON trail
BEGIN SELECT RAISE(ABORT, 'the audit trail is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trail_no_delete BEFORE DELETE ON trail
WHEN EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id)
BEGIN SELECT RAISE(ABORT, 'the audit trail is append-only'); END;
-- INSERT OR REPLACE would remove the old row without firing the delete trigger: refuse a second row with the same id
CREATE TRIGGER IF NOT EXISTS trail_no_replace BEFORE INSERT ON trail
WHEN EXISTS (SELECT 1 FROM trail WHERE id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'the audit trail is append-only'); END;
-- Helper, not part of the trail: the last recorded fingerprint of a company's recommendations per period.
CREATE TABLE IF NOT EXISTS trail_marks (
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  batch       TEXT NOT NULL,
  ids         TEXT NOT NULL,
  PRIMARY KEY (company_id, key)
);
`;

const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 16);
const cut = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) : s) : '');

export function createTrail(db) {
  const q = {
    insert: db.prepare('INSERT INTO trail (id, company_id, at, kind, subject, user_id, user_email, engine, prompt_version, data_hash, batch, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    email: db.prepare('SELECT email FROM users WHERE id = ?'),
    list: db.prepare('SELECT * FROM trail WHERE company_id = ? ORDER BY at DESC, rowid DESC LIMIT ?'),
    batch: db.prepare('SELECT * FROM trail WHERE company_id = ? AND batch = ? ORDER BY rowid'),
    mark: db.prepare('SELECT fingerprint, batch, ids FROM trail_marks WHERE company_id = ? AND key = ?'),
    setMark: db.prepare('INSERT INTO trail_marks (company_id, key, fingerprint, batch, ids) VALUES (?, ?, ?, ?, ?) ON CONFLICT(company_id, key) DO UPDATE SET fingerprint = excluded.fingerprint, batch = excluded.batch, ids = excluded.ids'),
    dataHash: db.prepare('SELECT hash FROM data_mirror WHERE company_id = ?'),
    facts: db.prepare("SELECT fact_id, status, review_by FROM fact_approvals WHERE company_id = ? ORDER BY fact_id"),
    blobFacts: db.prepare("SELECT id FROM facts WHERE company_id = ? AND status = 'approved' ORDER BY id"),
  };

  /** Append one row. Returns its id. */
  function append(companyId, { kind, subject = null, userId = null, engine = null, promptVersion = null, dataHash = null, batch = null, detail = {}, now = new Date() }) {
    if (!TRAIL_KINDS.includes(kind)) throw new TypeError('unknown trail kind ' + kind);
    const id = crypto.randomUUID();
    const email = userId ? q.email.get(userId)?.email ?? null : null;
    q.insert.run(id, companyId, now.toISOString(), kind, subject === null ? null : cut(String(subject), 500), userId, email, engine, promptVersion, dataHash, batch, JSON.stringify(detail));
    return id;
  }

  /** What the company's recommendations rest on: the imported data and the approved facts (with their review dates). */
  function fingerprint(companyId) {
    return sha([q.dataHash.get(companyId)?.hash ?? 'no-data', q.facts.all(companyId).map((f) => [f.fact_id, f.status, f.review_by]), q.blobFacts.all(companyId).map((f) => f.id)]);
  }

  /**
   * Record the recommendations of one period if their inputs changed since the last record; otherwise return the
   * earlier record. → { batch, ids: { itemId: trailId } }. items are in `lang`; `other()` returns the same items in the
   * other language (called only when a record is written), so every title is stored in English and Arabic.
   */
  function recordRecs(companyId, range, items, { now = new Date(), lang = 'en', other = null } = {}) {
    const fp = sha([fingerprint(companyId), range, RULES_VERSION, now.getUTCFullYear(), items.map((x) => [x.id, x.kind, x.conf, x.rule])]);
    const key = 'recs:' + range;
    const m = q.mark.get(companyId, key);
    if (m && m.fingerprint === fp) return { batch: m.batch, ids: JSON.parse(m.ids) };
    const batch = crypto.randomUUID();
    const dataHash = fingerprint(companyId);
    const alt = new Map((other ? other() || [] : []).map((x) => [x.id, x.title]));
    const ids = {};
    for (const x of items) {
      const title = lang === 'ar' ? { en: alt.get(x.id) ?? null, ar: x.title } : { en: x.title, ar: alt.get(x.id) ?? null };
      ids[x.id] = append(companyId, {
        kind: 'recommendation', subject: x.id, engine: 'rules', promptVersion: RULES_VERSION, dataHash, batch, now,
        detail: { range, title, kind: x.kind, basis: x.basis, confidence: x.confidence || null, calc: x.calc || [], period: x.period || null, rule: !!x.rule },
      });
    }
    q.setMark.run(companyId, key, fp, batch, JSON.stringify(ids));
    return { batch, ids };
  }

  /** Newest first, with a one-line summary in the asked language. */
  function list(companyId, { limit = 100, lang = 'en' } = {}) {
    return q.list.all(companyId, Math.min(Math.max(1, limit | 0), 500)).map((r) => view(r, lang));
  }
  const batchRows = (companyId, batch, lang = 'en') => q.batch.all(companyId, batch).map((r) => view(r, lang));

  return { append, recordRecs, fingerprint, list, batch: batchRows };
}

const OUT = { en: { met: 'met', no_change: 'no change', not_met: 'not met', inconclusive: 'inconclusive' }, ar: { met: 'تحقّق', no_change: 'بلا تغيير', not_met: 'لم يتحقّق', inconclusive: 'غير حاسم' } };
/** A recommendation title in one language (a plain string in rows written before titles were bilingual). */
const titleIn = (t, lang) => (typeof t === 'string' ? t : (t && (t[lang] || t.en || t.ar)) || '');

/** A trail row as the API returns it (the stored detail plus a readable summary). */
function view(r, lang) {
  const d = JSON.parse(r.detail);
  const L = (en, ar) => (lang === 'ar' ? ar : en);
  const DEMO = (x) => (x.demo ? L('Demo history (synthetic data): ', 'سجل تجريبي (بيانات اصطناعية): ') : '');
  const st = { approved: L('approved', 'اعتُمدت'), rejected: L('rejected', 'رُفضت'), pending: L('sent back to review', 'أعيدت إلى المراجعة'), demo_expired: L('put past its review date (demo)', 'جُعلت متجاوزة لتاريخ مراجعتها (تجربة)') };
  const summary = {
    recommendation: () => L(`Recommendation recorded: ${titleIn(d.title, 'en')}`, `سُجّلت توصية: ${titleIn(d.title, 'ar')}`),
    answer: () => L(`AI Director answered (${r.engine === 'rules' ? 'rules engine' : r.engine}): ${r.subject}`, `أجاب مدير التسويق (${r.engine === 'rules' ? 'محرك القواعد' : r.engine}): ${r.subject}`),
    fact_decision: () => L(`Fact ${st[d.status] || d.status}: “${d.text}”${d.reviewBy ? ` (review by ${d.reviewBy})` : ''}`, `حقيقة — ${st[d.status] || d.status}: «${d.text}»${d.reviewBy ? ` (المراجعة قبل ${d.reviewBy})` : ''}`),
    tracking_started: () => L(`Approval tracking started; ${d.legacy} fact(s) approved before it`, `بدأ تسجيل الاعتمادات؛ ${d.legacy} حقيقة اعتُمدت قبله`),
    strategy_approval: () => L(`Strategy approved: ${d.name}`, `اعتُمدت الاستراتيجية: ${d.name}`),
    step_tracked: () => DEMO(d) + L(`Step tracked (${d.stepKind === 'campaign' ? 'campaign' : 'task'}): ${titleIn(d.title, 'en')}`, `بدأت متابعة خطوة (${d.stepKind === 'campaign' ? 'حملة' : 'مهمة'}): ${titleIn(d.title, 'ar')}`),
    evaluation: () => DEMO(d) + L(`Step evaluated — ${OUT.en[d.outcome] || d.outcome}: ${titleIn(d.title, 'en')}`, `قُيّمت خطوة — ${OUT.ar[d.outcome] || d.outcome}: ${titleIn(d.title, 'ar')}`),
    report: () => L(`Report saved (${d.range === 'all' ? 'all data' : `last ${d.range} days`}, ${d.lang === 'ar' ? 'Arabic' : 'English'})`, `حُفظ تقرير (${d.range === 'all' ? 'كل البيانات' : `آخر ${d.range} يوماً`}، ${d.lang === 'ar' ? 'العربية' : 'الإنجليزية'})`),
  }[r.kind];
  return { id: r.id, at: r.at, kind: r.kind, subject: r.subject, by: r.user_email, engine: r.engine, promptVersion: r.prompt_version, dataHash: r.data_hash, batch: r.batch, detail: d, summary: summary ? summary() : r.kind };
}
