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
    const data = buildReport(db, companyId, { range, now, lang });
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

  // ---- Automatic reports (task 6.5) ----
  const sq = {
    get: db.prepare('SELECT every, range, lang, next_due FROM report_schedules WHERE company_id = ?'),
    put: db.prepare(
      `INSERT INTO report_schedules (company_id, every, range, lang, next_due, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id) DO UPDATE SET every = excluded.every, range = excluded.range, lang = excluded.lang,
         next_due = excluded.next_due, updated_at = excluded.updated_at`,
    ),
    del: db.prepare('DELETE FROM report_schedules WHERE company_id = ?'),
    due: db.prepare('SELECT company_id, every, range, lang, next_due FROM report_schedules WHERE next_due <= ? ORDER BY next_due'),
    move: db.prepare('UPDATE report_schedules SET next_due = ? WHERE company_id = ?'),
  };
  const shape = (r) => (r ? { every: r.every, range: r.range, lang: r.lang, nextDue: r.next_due } : null);

  /** The company's automatic-report setting, or null when it is off. */
  function getSchedule(companyId) {
    return shape(sq.get.get(companyId));
  }

  /**
   * Turns automatic reports on (`weekly` | `monthly`) or off. The first one is due one interval
   * from now. Changing only the language keeps the due date.
   */
  function setSchedule(companyId, { every, lang = 'en' } = {}, now = new Date()) {
    if (every === 'off') {
      sq.del.run(companyId);
      return null;
    }
    if (!SCHEDULES[every] || !REPORT_LANGS.includes(lang)) throw new TypeError('invalid schedule');
    const old = sq.get.get(companyId);
    const nextDue = old && old.every === every ? old.next_due : addInterval(now, every).toISOString();
    sq.put.run(companyId, every, SCHEDULES[every].range, lang, nextDue, now.toISOString());
    return getSchedule(companyId);
  }

  /**
   * Saves one automatic snapshot for every company whose report is due, then moves its due date
   * past `now` — so a long downtime produces one report, not one per missed interval.
   * One company failing does not stop the others. Returns how many were saved.
   */
  function runDue(now = new Date()) {
    let saved = 0;
    for (const s of sq.due.all(now.toISOString())) {
      try {
        if (save(s.company_id, { range: s.range, lang: s.lang, auto: true, now })) saved++;
        let next = new Date(s.next_due);
        for (let i = 0; i < 1000 && next <= now; i++) next = addInterval(next, s.every);
        if (next <= now) next = addInterval(now, s.every);
        sq.move.run(next.toISOString(), s.company_id);
      } catch (e) {
        console.error(`automatic report failed for company ${s.company_id}:`, e.message);
      }
    }
    return saved;
  }

  return { save, list, get, getSchedule, setSchedule, runDue };
}

/** How often, and which period the automatic report covers. */
export const SCHEDULES = { weekly: { range: '7' }, monthly: { range: '28' } };

/** `weekly` → +7 days; `monthly` → same day next month (the last day when that month is shorter). UTC. */
export function addInterval(date, every) {
  const d = new Date(date);
  if (every === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
