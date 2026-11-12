/**
 * Report history (task 6.4): saved snapshots of the marketing report.
 *
 * A snapshot stores the JSON `buildReport` produced at that moment. Reading it back never
 * rebuilds it, so a saved report still says what it said when the company's data changes later.
 * Every query is scoped by company id; an id from another company is simply not found.
 */
import crypto from 'node:crypto';
import { buildReport, RANGES, REPORT_LANGS } from './report.js';

/** Newest snapshots kept per company; older ones are deleted when a new one is saved. */
export const REPORTS_MAX = 50;

export function createReports(db) {
  const q = {
    insert: db.prepare('INSERT INTO reports (id, company_id, range, lang, auto, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    list: db.prepare('SELECT id, range, lang, auto, created_at, data FROM reports WHERE company_id = ? ORDER BY created_at DESC, rowid DESC'),
    one: db.prepare('SELECT id, range, lang, auto, created_at, data FROM reports WHERE company_id = ? AND id = ?'),
    trim: db.prepare(
      `DELETE FROM reports WHERE company_id = ? AND id NOT IN
         (SELECT id FROM reports WHERE company_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
    ),
  };
  const head = (r, data) => ({
    id: r.id,
    range: r.range,
    lang: r.lang,
    auto: r.auto === 1,
    createdAt: r.created_at,
    period: data.period ?? null,
    synthetic: !!data.synthetic,
  });

  /** Builds the report now and stores it. Returns the list entry, or null for an unknown company. */
  function save(companyId, { range = '28', lang = 'en', auto = false, now = new Date() } = {}) {
    if (!RANGES.includes(range) || !REPORT_LANGS.includes(lang)) throw new TypeError('invalid report options');
    const data = buildReport(db, companyId, { range, now });
    if (!data) return null;
    const row = { id: crypto.randomUUID(), range, lang, auto: auto ? 1 : 0, created_at: data.generatedAt };
    db.exec('BEGIN');
    try {
      q.insert.run(row.id, companyId, row.range, row.lang, row.auto, row.created_at, JSON.stringify(data));
      q.trim.run(companyId, companyId, REPORTS_MAX);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return head(row, data);
  }

  /** Newest first, without the report bodies. */
  function list(companyId) {
    return q.list.all(companyId).map((r) => head(r, JSON.parse(r.data)));
  }

  /** One snapshot with its stored report, or null. */
  function get(companyId, id) {
    const r = q.one.get(companyId, String(id));
    if (!r) return null;
    const data = JSON.parse(r.data);
    return { ...head(r, data), report: data };
  }

  return { save, list, get };
}
