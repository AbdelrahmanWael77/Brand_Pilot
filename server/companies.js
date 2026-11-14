import express from 'express';
import crypto from 'node:crypto';
import { createKnowledge, STATUSES } from './knowledge.js';
import { createData } from './data.js';
import { createCampaigns } from './campaigns.js';
import { buildReport, renderReport, renderReportHtml, REPORT_LANGS } from './report.js';
import { createReports } from './reports.js';
import { campaignQa } from './campaignQa.js';
import { metrics, RANGES } from './metrics.js';
import { audit } from './audit.js';
import { buildContext, ask, ASK } from './director.js';
import { AiError } from './ai.js';
import { createFetchUrl, FetchUrlError } from './fetchUrl.js';
import { createLimiter } from './auth.js';

const MAX_NAME = 120;

/**
 * Company routes. Mount behind requireAuth (needs req.user).
 * Every company-scoped route must go through `requireCompany`, which is the
 * single place that enforces per-company data isolation.
 */
export function createCompanies(
  db,
  { fetchUrl = createFetchUrl(), fetchLimit = { max: 20, windowMs: 10 * 60_000 }, ai = null, askLimit = { max: 20, windowMs: 10 * 60_000 }, reportLimit = { max: 30, windowMs: 10 * 60_000 } } = {},
) {
  const knowledge = createKnowledge(db);
  const data = createData(db);
  const campaigns = createCampaigns(db);
  const fetchLimiter = createLimiter(fetchLimit); // outbound requests per user
  const askLimiter = createLimiter(askLimit); // AI questions per user
  const reports = createReports(db);
  const reportLimiter = createLimiter(reportLimit); // saved reports per user
  /** One report in the asked format: JSON, a Markdown download, or a printable page. */
  const sendReport = (res, report, format, lang) => {
    if (format === 'json') return res.json(report);
    if (format === 'html') {
      // A page to print or save as PDF: inline styles only, nothing may load or run.
      return res
        .type('text/html; charset=utf-8')
        .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
        .set('X-Content-Type-Options', 'nosniff')
        .set('Cache-Control', 'no-store')
        .send(renderReportHtml(report, lang));
    }
    return res
      .type('text/markdown; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="marketing-report-${report.generatedAt.slice(0, 10)}.md"`)
      .send(renderReport(report, lang));
  };
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
    renameCompany: db.prepare('UPDATE companies SET name = ? WHERE id = ?'),
    putCurrency: db.prepare(
      'INSERT INTO company_settings (company_id, currency) VALUES (?, ?) ON CONFLICT(company_id) DO UPDATE SET currency = excluded.currency',
    ),
    deleteCompany: db.prepare('DELETE FROM companies WHERE id = ?'),
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

  // Owner only. Memberships, state, sources and facts go with it (ON DELETE CASCADE).
  router.delete('/:id', requireCompany, (req, res) => {
    if (req.company.role !== 'owner') return res.status(403).json({ error: 'forbidden' });
    q.deleteCompany.run(req.company.id);
    res.json({ ok: true });
  });

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
    // Optional `name` keeps companies.name in step with the name edited inside the state object.
    let name = null;
    if (req.body.name !== undefined) {
      name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name || name.length > MAX_NAME) return res.status(400).json({ error: 'invalid_name' });
    }
    const updatedAt = new Date().toISOString();
    // Blob, name and the knowledge, data and campaign mirrors change together or not at all.
    let mirrored, mirroredData, mirroredCampaigns;
    db.exec('BEGIN');
    try {
      q.putState.run(req.company.id, JSON.stringify(state), updatedAt);
      if (name && name !== req.company.name) q.renameCompany.run(name, req.company.id);
      mirrored = knowledge.mirror(req.company.id, state);
      mirroredData = data.mirror(req.company.id, state);
      mirroredCampaigns = campaigns.mirror(req.company.id, state);
      // Currency of the money columns: a 3-letter code, or none (then reports show plain numbers).
      q.putCurrency.run(req.company.id, typeof state.currency === 'string' && /^[A-Z]{3}$/.test(state.currency) ? state.currency : null);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json({ ok: true, updatedAt, knowledge: mirrored, data: mirroredData, campaigns: mirroredCampaigns });
  });

  // Campaigns the server holds for this company (validated copy of the Campaign Studio's state).
  router.get('/:id/campaigns', requireCompany, (req, res) => {
    res.json({ campaigns: campaigns.list(req.company.id) });
  });

  router.get('/:id/campaigns/:cid', requireCompany, (req, res) => {
    const campaign = campaigns.get(req.company.id, req.params.cid);
    if (!campaign) return res.status(404).json({ error: 'not_found' });
    res.json({ campaign });
  });

  // The server's own content checks for one campaign (approved CTA / offer, claims, placeholders, recommendation).
  router.get('/:id/campaigns/:cid/qa', requireCompany, (req, res) => {
    const result = campaignQa(db, req.company.id, req.params.cid);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.json(result);
  });

  // Marketing report: KPIs, audit findings with evidence, open gaps and campaigns. JSON, or Markdown to download.
  router.get('/:id/report', requireCompany, (req, res) => {
    const range = req.query.range === undefined ? '28' : req.query.range;
    if (!RANGES.includes(range)) return res.status(400).json({ error: 'invalid_range' });
    const format = req.query.format === undefined ? 'json' : req.query.format;
    if (!['json', 'md', 'html'].includes(format)) return res.status(400).json({ error: 'invalid_format' });
    const lang = req.query.lang === undefined ? 'en' : req.query.lang;
    if (!REPORT_LANGS.includes(lang)) return res.status(400).json({ error: 'invalid_lang' });
    sendReport(res, buildReport(db, req.company.id, { range, lang }), format, lang);
  });

  // Report history: save what the report says now, list the saved ones, read one back (never rebuilt).
  router.post('/:id/reports', requireCompany, (req, res) => {
    const range = req.body?.range ?? '28';
    if (!RANGES.includes(range)) return res.status(400).json({ error: 'invalid_range' });
    const lang = req.body?.lang ?? 'en';
    if (!REPORT_LANGS.includes(lang)) return res.status(400).json({ error: 'invalid_lang' });
    const wait = reportLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    reportLimiter.hit(req.user.id);
    res.status(201).json({ report: reports.save(req.company.id, { range, lang }) });
  });
  router.get('/:id/reports', requireCompany, (req, res) => {
    res.json({ reports: reports.list(req.company.id) });
  });
  // Automatic reports: off, weekly or monthly. Declared before `/:rid` so "schedule" is not read as a report id.
  router.get('/:id/reports/schedule', requireCompany, (req, res) => {
    res.json({ schedule: reports.getSchedule(req.company.id) });
  });
  router.put('/:id/reports/schedule', requireCompany, (req, res) => {
    const every = req.body?.every;
    if (!['off', 'weekly', 'monthly'].includes(every)) return res.status(400).json({ error: 'invalid_schedule' });
    const lang = req.body?.lang ?? 'en';
    if (!REPORT_LANGS.includes(lang)) return res.status(400).json({ error: 'invalid_lang' });
    res.json({ schedule: reports.setSchedule(req.company.id, { every, lang }) });
  });
  router.get('/:id/reports/:rid', requireCompany, (req, res) => {
    const format = req.query.format === undefined ? 'json' : req.query.format;
    if (!['json', 'md', 'html'].includes(format)) return res.status(400).json({ error: 'invalid_format' });
    const saved = reports.get(req.company.id, req.params.rid);
    if (!saved) return res.status(404).json({ error: 'not_found' });
    if (format === 'json') return res.json(saved);
    sendReport(res, saved.report, format, saved.lang); // in the language it was saved in
  });

  // What imported data the server holds for this company, per dataset.
  router.get('/:id/data/summary', requireCompany, (req, res) => {
    res.json({ data: data.summary(req.company.id) });
  });

  // KPIs from the validated rows. Missing measures come back as null with a reason, never 0.
  router.get('/:id/metrics', requireCompany, (req, res) => {
    const range = req.query.range === undefined ? '28' : req.query.range;
    if (!RANGES.includes(range)) return res.status(400).json({ error: 'invalid_range' });
    res.json(metrics(db, req.company.id, range));
  });

  // Audit items from validated rows and approved facts; each states its basis and evidence.
  router.get('/:id/audit', requireCompany, (req, res) => {
    const lang = req.query.lang === undefined ? 'en' : req.query.lang;
    if (!REPORT_LANGS.includes(lang)) return res.status(400).json({ error: 'invalid_lang' });
    res.json(audit(db, req.company.id, { lang }));
  });

  // What the AI Marketing Director is allowed to know about this company: approved facts, KPIs, audit items.
  router.get('/:id/director/context', requireCompany, (req, res) => {
    res.json(buildContext(db, req.company.id));
  });

  // One question to the AI Marketing Director, answered only from this company's context (director.js).
  router.post('/:id/director/ask', requireCompany, async (req, res) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question || question.length > ASK.question) return res.status(400).json({ error: 'invalid_question' });
    const lang = req.body.lang ?? 'en';
    if (lang !== 'en' && lang !== 'ar') return res.status(400).json({ error: 'invalid_lang' });
    const wait = askLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    askLimiter.hit(req.user.id);
    if (!ai?.configured) return res.status(503).json({ error: 'ai_not_configured' });
    try {
      res.json(await ask(db, ai, req.company.id, { question, lang }));
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      // The provider's own message stays in the server log.
      console.error(`director/ask: ${e.code}`, e.cause?.message ?? '');
      res.status(e.status).json({ error: e.code });
    }
  });

  // Mirrored findings of this company. `?status=approved` is what later phases treat as facts.
  router.get('/:id/facts', requireCompany, (req, res) => {
    const status = req.query.status;
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'invalid_status' });
    res.json({ facts: knowledge.listFacts(req.company.id, status ?? null) });
  });

  // Read one public web page for this company (the browser cannot: cross-origin rules).
  // All network-safety rules live in fetchUrl.js. Nothing is stored here; the client adds the source.
  router.post('/:id/fetch-url', requireCompany, async (req, res) => {
    const url = req.body?.url;
    if (typeof url !== 'string' || !url.trim() || url.length > 2000) return res.status(400).json({ error: 'invalid_url' });
    const wait = fetchLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    fetchLimiter.hit(req.user.id);
    try {
      res.json(await fetchUrl(url));
    } catch (e) {
      if (e instanceof FetchUrlError) return res.status(e.status).json({ error: e.code });
      throw e;
    }
  });

  return { router, requireCompany };
}
