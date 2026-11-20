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
import { buildContext, ask, ASK, cleanHistory } from './director.js';
import { suggestThemes, cleanPosts } from './themes.js';
import { draftBrief, cleanDraftRequest, polishPost, cleanPolishRequest } from './recs.js';
import { suggestBrief, cleanSuggestRequest } from './campaignBrief.js';
import { extractFacts, cleanRequest } from './extract.js';
import { websitePages } from './website.js';
import { websiteBrand } from './brand.js';
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
  { fetchUrl = createFetchUrl(), fetchLimit = { max: 60, windowMs: 10 * 60_000 }, ai = null, askLimit = { max: 20, windowMs: 10 * 60_000 }, reportLimit = { max: 30, windowMs: 10 * 60_000 }, extractLimit = { max: 60, windowMs: 10 * 60_000 }, demo = false } = {},
) {
  const knowledge = createKnowledge(db);
  const data = createData(db);
  const campaigns = createCampaigns(db);
  const fetchLimiter = createLimiter(fetchLimit); // outbound requests per user
  const askLimiter = createLimiter(askLimit); // AI questions per user
  const extractLimiter = createLimiter(extractLimit); // AI source readings per user
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
    putSettings: db.prepare(
      'UPDATE company_settings SET digits = ?, qualified_def = ? WHERE company_id = ?',
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
      // P1: how Arabic text writes numbers (company choice), and whether a "qualified lead" definition is written
      // (the audit's "defs" gap). Only these two facts leave the blob; the definition text stays in the state.
      const defs = state.defs && typeof state.defs === 'object' ? state.defs : null;
      q.putSettings.run(state.digits === 'arab' ? 'arab' : 'latn', defs ? (typeof defs.qualified === 'string' && defs.qualified.trim() ? 1 : 0) : null, req.company.id);
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

  // The recommendations (P1: the only source — every screen shows these). Each states its basis, evidence, period,
  // calculation, assumptions and confidence. range = the period the screen shows (default all data).
  router.get('/:id/audit', requireCompany, (req, res) => {
    const lang = req.query.lang === undefined ? 'en' : req.query.lang;
    if (!REPORT_LANGS.includes(lang)) return res.status(400).json({ error: 'invalid_lang' });
    const range = req.query.range === undefined ? 'all' : req.query.range;
    if (!RANGES.includes(range)) return res.status(400).json({ error: 'invalid_range' });
    res.json(audit(db, req.company.id, { lang, range }));
  });

  // What the AI Marketing Director is allowed to know about this company: approved facts, KPIs, audit items.
  router.get('/:id/director/context', requireCompany, (req, res) => {
    const range = RANGES.includes(String(req.query.range)) ? String(req.query.range) : '28';
    res.json(buildContext(db, req.company.id, { range }));
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
      // The period the owner is looking at (P3-pre): KPIs, recommendations and channels all cover it (default 28 days).
      const range = RANGES.includes(String(req.body.range)) ? String(req.body.range) : '28';
      res.json(await ask(db, ai, req.company.id, { question, lang, range, history: cleanHistory(req.body.history) }));
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      // The provider's own message stays in the server log.
      console.error(`director/ask: ${e.code}`, e.cause?.message ?? '');
      res.status(e.status).json({ error: e.code });
    }
  });

  // AI theme suggestions for a batch of post captions (themes.js). Nothing is stored: the user confirms in the browser.
  // Shares the per-user allowance of the AI questions.
  router.post('/:id/data/meta/suggest-themes', requireCompany, async (req, res) => {
    const posts = cleanPosts(req.body?.posts);
    if (!posts) return res.status(400).json({ error: 'invalid_posts' });
    const lang = req.body.lang ?? 'en';
    if (lang !== 'en' && lang !== 'ar') return res.status(400).json({ error: 'invalid_lang' });
    const wait = askLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    askLimiter.hit(req.user.id);
    if (!ai?.configured) return res.status(503).json({ error: 'ai_not_configured' });
    try {
      res.json(await suggestThemes(db, ai, req.company.id, { posts, lang }));
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      console.error(`suggest-themes: ${e.code}`, e.cause?.message ?? '');
      res.status(e.status).json({ error: e.code });
    }
  });

  // AI suggestion of a whole campaign brief from its name (campaignBrief.js, task 37): every brief field in English and
  // Arabic from approved facts only. Nothing is stored: the browser fills the brief and the user checks it. Shares the AI allowance.
  router.post('/:id/campaigns/suggest-brief', requireCompany, async (req, res) => {
    const request = cleanSuggestRequest(req.body);
    if (request.error) return res.status(400).json({ error: request.error });
    const wait = askLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    askLimiter.hit(req.user.id);
    if (!ai?.configured) return res.status(503).json({ error: 'ai_not_configured' });
    try {
      res.json(await suggestBrief(db, ai, req.company.id, req.company.name, request));
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      console.error(`campaigns/suggest-brief: ${e.code}`, e.cause?.message ?? '');
      res.status(e.status).json({ error: e.code });
    }
  });
  // AI draft of a creative brief for one recommended post (recs.js, task 16): headline, points, caption, visual
  // direction from approved facts only. Nothing is stored: the user edits the draft in the brief. Shares the AI allowance.
  router.post('/:id/recs/draft', requireCompany, async (req, res) => {
    const request = cleanDraftRequest(req.body);
    if (request.error) return res.status(400).json({ error: request.error });
    const wait = askLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    askLimiter.hit(req.user.id);
    if (!ai?.configured) return res.status(503).json({ error: 'ai_not_configured' });
    try {
      res.json(await draftBrief(db, ai, req.company.id, req.company.name, request));
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      console.error(`recs/draft: ${e.code}`, e.cause?.message ?? '');
      res.status(e.status).json({ error: e.code });
    }
  });

  // AI rewording of a business post (recs.js polishPost, task 16c): only the fields the browser marks editable are
  // reworded; the user's facts stay as typed. Nothing is stored. Shares the AI allowance.
  router.post('/:id/content/polish', requireCompany, async (req, res) => {
    const request = cleanPolishRequest(req.body);
    if (request.error) return res.status(400).json({ error: request.error });
    const wait = askLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    askLimiter.hit(req.user.id);
    if (!ai?.configured) return res.status(503).json({ error: 'ai_not_configured' });
    try {
      res.json(await polishPost(ai, req.company.name, request));
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      console.error(`content/polish: ${e.code}`, e.cause?.message ?? '');
      res.status(e.status).json({ error: e.code });
    }
  });

  // AI fact extraction from one source (extract.js). Nothing is stored: the browser adds the kept facts as
  // pending findings and the user approves or rejects them. Every kept fact carries a quote found in the text.
  router.post('/:id/sources/extract', requireCompany, async (req, res) => {
    const request = cleanRequest(req.body);
    if (request.error) return res.status(400).json({ error: request.error });
    const wait = extractLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    extractLimiter.hit(req.user.id);
    if (!ai?.configured) return res.status(503).json({ error: 'ai_not_configured' });
    try {
      res.json(await extractFacts(ai, request));
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      console.error(`sources/extract: ${e.code}`, e.cause?.message ?? '');
      res.status(e.status).json({ error: e.code });
    }
  });

  // Mirrored findings of this company. `?status=approved` is what later phases treat as facts.
  router.get('/:id/facts', requireCompany, (req, res) => {
    const status = req.query.status;
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'invalid_status' });
    res.json({ facts: knowledge.listFacts(req.company.id, status ?? null), ...(knowledge.tracked(req.company.id) ? { tracked: true } : {}) }); // tracked: approvals are recorded on the server (P4)
  });

  // P4: a person's decisions on facts — approve (with a review date), reject, or back to pending. The server records who
  // and when; the browser state can never grant an approval by itself once a company is tracked.
  // Demo mode only (BRANDPILOT_DEMO=1): put an approved fact past its review date, so expiry can be tried by hand.
  // Without demo mode the route does not exist (404), like any unknown path.
  router.post('/:id/facts/:fid/demo-expire', requireCompany, (req, res) => {
    if (!demo) return res.status(404).json({ error: 'not_found' });
    const r = knowledge.demoExpire(req.company.id, String(req.params.fid));
    if (r.error) return res.status(r.error === 'not_found' ? 404 : 409).json({ error: r.error });
    res.json({ fact: r.fact });
  });

  router.post('/:id/facts/decisions', requireCompany, (req, res) => {
    const list = req.body?.decisions;
    if (!Array.isArray(list) || !list.length || list.length > 500) return res.status(400).json({ error: 'invalid_decisions' });
    const ok = list.every((d) => d && typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 200 && ['approved', 'rejected', 'pending'].includes(d.status) && (d.reviewBy === undefined || typeof d.reviewBy === 'string'));
    if (!ok) return res.status(400).json({ error: 'invalid_decisions' });
    db.exec('BEGIN');
    let results;
    try {
      results = knowledge.decide(req.company.id, req.user.id, list.map((d) => ({ id: d.id, status: d.status, ...(d.reviewBy !== undefined ? { reviewBy: d.reviewBy } : {}) })));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json({ results });
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

  // Read the website's first page and propose which of its own pages to read next (website.js).
  // One outbound read, counted against the same allowance as `fetch-url`; the pages themselves are read
  // later, one `fetch-url` each, after the user has ticked them. Nothing is stored.
  router.post('/:id/website/pages', requireCompany, async (req, res) => {
    const url = req.body?.url;
    if (typeof url !== 'string' || !url.trim() || url.length > 2000) return res.status(400).json({ error: 'invalid_url' });
    const wait = fetchLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    fetchLimiter.hit(req.user.id);
    try {
      res.json(await websitePages(fetchUrl, ai, url));
    } catch (e) {
      if (e instanceof FetchUrlError) return res.status(e.status).json({ error: e.code });
      throw e;
    }
  });

  // Colour, font and logo candidates from the website's page, its style sheets and one logo image (brand.js).
  // Every one of those reads goes through the guarded reader. Counted as one read against the website
  // reader's allowance. No model call; nothing is stored — the browser shows the result for approval.
  router.post('/:id/website/brand', requireCompany, async (req, res) => {
    const url = req.body?.url;
    if (typeof url !== 'string' || !url.trim() || url.length > 2000) return res.status(400).json({ error: 'invalid_url' });
    const wait = fetchLimiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    fetchLimiter.hit(req.user.id);
    try {
      res.json(await websiteBrand(fetchUrl, url));
    } catch (e) {
      if (e instanceof FetchUrlError) return res.status(e.status).json({ error: e.code });
      throw e;
    }
  });

  return { router, requireCompany };
}
