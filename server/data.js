/**
 * Server-side mirror of a company's imported performance data.
 *
 * The frontend parses CSV/JSON exports and keeps the rows inside the state blob
 * (`state.data.{meta,ga4,gsc,leads}`). On every state save the server validates the
 * rows and copies the valid ones into `data_rows`, so metrics and the audit can be
 * computed from data the server has checked, never from the blob.
 *
 * Same rules as the knowledge mirror: malformed rows are skipped and counted, never
 * fatal; everything is scoped by company id.
 */
import crypto from 'node:crypto';

/** Column schemas per dataset — keep in step with `SCH` in public/index.html. */
export const SCHEMAS = {
  meta: {
    req: ['date', 'platform', 'reach', 'engagements'],
    opt: ['post_id', 'format', 'theme', 'language', 'impressions', 'link_clicks', 'spend', 'campaign'],
    num: ['reach', 'impressions', 'engagements', 'link_clicks', 'spend'],
  },
  ga4: {
    req: ['date', 'channel', 'sessions'],
    opt: ['landing_page', 'device', 'engaged_sessions', 'enquiries', 'campaign'],
    num: ['sessions', 'engaged_sessions', 'enquiries'],
  },
  gsc: { req: ['date', 'query', 'clicks', 'impressions'], opt: ['page', 'position'], num: ['clicks', 'impressions', 'position'] },
  leads: { req: ['date', 'status'], opt: ['source', 'campaign', 'segment'], num: [] },
};
export const KINDS = Object.keys(SCHEMAS);
const MAX_CELL = 500;

/** A date that exists on the calendar, written YYYY-MM-DD. */
export function isRealDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Returns the row reduced to its schema columns, or null when it must not be trusted. */
export function cleanRow(kind, r) {
  const sc = SCHEMAS[kind];
  if (!sc || r === null || typeof r !== 'object' || Array.isArray(r)) return null;
  if (!isRealDate(r.date)) return null;
  const out = { date: r.date };
  for (const col of [...sc.req, ...sc.opt]) {
    if (col === 'date') continue;
    const required = sc.req.includes(col);
    const v = r[col];
    if (sc.num.includes(col)) {
      if (v === undefined || v === null || v === '') {
        if (required) return null;
        continue; // optional number not provided: left out, not stored as 0
      }
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
      out[col] = v;
    } else {
      if (v === undefined || v === null) {
        if (required) return null;
        continue;
      }
      if (typeof v !== 'string') return null;
      const s = v.trim().slice(0, MAX_CELL);
      if (!s) {
        if (required) return null;
        continue;
      }
      out[col] = s;
    }
  }
  return out;
}

/** Datasets that include rows loaded from the labeled demo fixtures (per the import log). */
function syntheticKinds(state) {
  const kinds = new Set();
  for (const i of Array.isArray(state?.imports) ? state.imports : []) {
    if (i && typeof i === 'object' && i.origin === 'fixture' && KINDS.includes(i.kind)) kinds.add(i.kind);
  }
  return kinds;
}

export function createData(db) {
  const q = {
    deleteRows: db.prepare('DELETE FROM data_rows WHERE company_id = ?'),
    insertRow: db.prepare('INSERT INTO data_rows (company_id, kind, date, row, synthetic) VALUES (?, ?, ?, ?, ?)'),
    getMirror: db.prepare('SELECT hash, result FROM data_mirror WHERE company_id = ?'),
    putMirror: db.prepare(
      `INSERT INTO data_mirror (company_id, hash, result) VALUES (?, ?, ?)
       ON CONFLICT(company_id) DO UPDATE SET hash = excluded.hash, result = excluded.result`,
    ),
    summary: db.prepare(
      `SELECT kind, COUNT(*) AS n, MIN(date) AS first, MAX(date) AS last, SUM(synthetic) AS syn
       FROM data_rows WHERE company_id = ? GROUP BY kind`,
    ),
    rows: db.prepare('SELECT date, row, synthetic FROM data_rows WHERE company_id = ? AND kind = ? ORDER BY date, rowid'),
  };

  /**
   * Replace the company's mirrored rows with what `state.data` holds. Call inside the
   * caller's transaction. Saves happen on every UI change, so the rewrite is skipped
   * when the data part of the state is byte-identical to what was mirrored last time.
   */
  function mirror(companyId, state) {
    const data = state?.data !== null && typeof state?.data === 'object' && !Array.isArray(state.data) ? state.data : {};
    const syn = syntheticKinds(state);
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify([KINDS.map((k) => data[k] ?? null), [...syn].sort()]))
      .digest('hex');
    const prev = q.getMirror.get(companyId);
    if (prev && prev.hash === hash) return JSON.parse(prev.result);

    const result = { rows: {}, skipped: 0 };
    q.deleteRows.run(companyId);
    for (const kind of KINDS) {
      let n = 0;
      const list = data[kind];
      if (list !== undefined && !Array.isArray(list)) result.skipped++;
      for (const item of Array.isArray(list) ? list : []) {
        const row = cleanRow(kind, item);
        if (!row) {
          result.skipped++;
          continue;
        }
        q.insertRow.run(companyId, kind, row.date, JSON.stringify(row), syn.has(kind) ? 1 : 0);
        n++;
      }
      result.rows[kind] = n;
    }
    q.putMirror.run(companyId, hash, JSON.stringify(result));
    return result;
  }

  /** Per dataset: row count, first and last date, and how many rows are synthetic demo data. */
  function summary(companyId) {
    const out = Object.fromEntries(KINDS.map((k) => [k, { rows: 0, from: null, to: null, synthetic: 0 }]));
    for (const r of q.summary.all(companyId)) out[r.kind] = { rows: r.n, from: r.first, to: r.last, synthetic: r.syn };
    return out;
  }

  /** Validated rows of one dataset, oldest first. The only read path for imported data on the server. */
  function rows(companyId, kind) {
    if (!KINDS.includes(kind)) return [];
    return q.rows.all(companyId, kind).map((r) => ({ ...JSON.parse(r.row), synthetic: r.synthetic === 1 }));
  }

  return { mirror, summary, rows };
}

/** The only read path later server code may use for imported data rows. */
export function dataRows(db, companyId, kind) {
  return createData(db).rows(companyId, kind);
}
