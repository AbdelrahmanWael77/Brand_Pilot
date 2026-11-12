import express from 'express';
import crypto from 'node:crypto';

const MAX_NAME = 120;

/**
 * Company routes. Mount behind requireAuth (needs req.user).
 * Every company-scoped route must go through `requireCompany`, which is the
 * single place that enforces per-company data isolation.
 */
export function createCompanies(db) {
  const q = {
    insertCompany: db.prepare('INSERT INTO companies (id, name, created_by, created_at) VALUES (?, ?, ?, ?)'),
    insertMembership: db.prepare('INSERT INTO memberships (user_id, company_id, role) VALUES (?, ?, ?)'),
    listForUser: db.prepare(
      `SELECT c.id, c.name, m.role FROM memberships m JOIN companies c ON c.id = m.company_id
       WHERE m.user_id = ? ORDER BY c.created_at, c.id`,
    ),
    getForUser: db.prepare(
      `SELECT c.id, c.name, m.role FROM memberships m JOIN companies c ON c.id = m.company_id
       WHERE m.user_id = ? AND c.id = ?`,
    ),
    getState: db.prepare('SELECT data, updated_at FROM company_state WHERE company_id = ?'),
    putState: db.prepare(
      `INSERT INTO company_state (company_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(company_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ),
  };

  /** Sets req.company for members; 404 for everyone else so ids cannot be probed. */
  function requireCompany(req, res, next) {
    const row = q.getForUser.get(req.user.id, String(req.params.id));
    if (!row) return res.status(404).json({ error: 'not_found' });
    req.company = { id: row.id, name: row.name, role: row.role };
    next();
  }

  const router = express.Router();

  router.post('/', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > MAX_NAME) return res.status(400).json({ error: 'invalid_name' });
    const company = { id: crypto.randomUUID(), name, role: 'owner' };
    db.exec('BEGIN');
    try {
      q.insertCompany.run(company.id, name, req.user.id, new Date().toISOString());
      q.insertMembership.run(req.user.id, company.id, company.role);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.status(201).json({ company });
  });

  router.get('/', (req, res) => {
    res.json({ companies: q.listForUser.all(req.user.id).map((r) => ({ id: r.id, name: r.name, role: r.role })) });
  });

  router.get('/:id', requireCompany, (req, res) => res.json({ company: req.company }));

  // One JSON object per company: server-side home for the prototype's per-company data.
  router.get('/:id/state', requireCompany, (req, res) => {
    const row = q.getState.get(req.company.id);
    res.json({ state: row ? JSON.parse(row.data) : null, updatedAt: row ? row.updated_at : null });
  });

  router.put('/:id/state', requireCompany, (req, res) => {
    const state = req.body?.state;
    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ error: 'invalid_state' });
    }
    const updatedAt = new Date().toISOString();
    q.putState.run(req.company.id, JSON.stringify(state), updatedAt);
    res.json({ ok: true, updatedAt });
  });

  return { router, requireCompany };
}
