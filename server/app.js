import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createAuth } from './auth.js';
import { createCompanies } from './companies.js';
import { createAi } from './ai.js';
import { createMeta } from './meta.js';
import { createGoogle } from './google.js';
import { createCanva } from './canva.js';
import { createImageAi } from './imageAi.js';
import { seriesRoutes } from './series.js';
import { campaignImageRoute } from './campaignImage.js';
import { visualCopyRoute } from './visualCopy.js';
import { createLimiter } from './auth.js';
import { createCanvaStudio } from './canvaStudio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** TRUST_PROXY: empty / 0 / false → off; a number → that many proxies in front; anything else is passed to Express as is. */
export function parseTrustProxy(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '0' || s.toLowerCase() === 'false') return false;
  if (s.toLowerCase() === 'true') return 1; // "trust everything" is never what a deployment needs
  return /^\d+$/.test(s) ? Number(s) : s;
}

/**
 * Tests pass `{ db: openDb(':memory:') }` (and optionally small `authLimits`, a stubbed `fetchUrl`
 * from createFetchUrl, a small `fetchLimit`, or an `ai` client from createAi with a stubbed network);
 * production uses the defaults (`ai` is built from ANTHROPIC_API_KEY / AI_MODEL). `meta` and `google` take
 * { config, fetch, syncLimit, now } for createMeta / createGoogle (tests pass a stubbed network).
 */
export function createApp({ db = openDb(), authLimits, fetchUrl, fetchLimit, ai = createAi(), imageAi = createImageAi(), imageLimit = { max: 20, windowMs: 10 * 60_000 }, visualLimit = { max: 30, windowMs: 10 * 60_000 }, askLimit, reportLimit, extractLimit, meta: metaOptions, google: googleOptions, canva: canvaOptions, trustProxy = parseTrustProxy(process.env.TRUST_PROXY) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a reverse proxy the client's address is in X-Forwarded-For; trusted only when the owner says so
  // (TRUST_PROXY=1 for one proxy in front). Without it a client could fake its address and dodge the login limit.
  if (trustProxy) app.set('trust proxy', trustProxy);
  // Every response: no content sniffing, no framing by other sites, no referrer to other sites.
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  // 1 MB JSON everywhere except the company state blob, which may hold sources and imported data.
  const jsonDefault = express.json({ limit: '1mb' });
  const jsonState = express.json({ limit: '5mb' });
  // Reference pictures for the series style read (series.js): up to 6 shrunk images.
  const jsonImages = express.json({ limit: '12mb' }); // up to 8 reference pictures (series style read)
  app.use((req, res, next) =>
    (/^\/api\/companies\/[^/]+\/state\/?$/.test(req.path) ? jsonState : /^\/api\/companies\/[^/]+\/series\/style-read\/?$/.test(req.path) ? jsonImages : jsonDefault)(req, res, next),
  );

  const auth = createAuth(db, { limits: authLimits });
  app.locals.db = db;
  const companies = createCompanies(db, { fetchUrl, fetchLimit, ai, askLimit, reportLimit, extractLimit });
  app.locals.requireAuth = auth.requireAuth;
  app.locals.requireCompany = companies.requireCompany;
  app.locals.ai = ai;

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'brandpilot' }));
  app.use('/api/auth', auth.router);
  // Live Meta connection (meta.js). The OAuth callback is a browser redirect from Meta: without a session it
  // goes back to the app instead of answering JSON. The company routes need membership, like every company route.
  const meta = createMeta(db, metaOptions);
  const google = createGoogle(db, googleOptions);
  const canva = createCanva(db, canvaOptions);
  const imageLimiter = createLimiter(imageLimit); // one image allowance per user, shared by campaign and series pictures
  const canvaStudio = createCanvaStudio(db, canva, { ...(fetchUrl ? { fetchUrl } : {}), ...((canvaOptions && canvaOptions.studio) || {}) });
  const signedInOrBack = (name) => (req, res, next) => {
    const user = auth.currentUser(req);
    if (!user) return res.redirect(302, `/?${name}=signin`);
    req.user = user;
    next();
  };
  app.get('/api/integrations/meta/callback', signedInOrBack('meta'), meta.callback);
  app.get('/api/integrations/google/callback', signedInOrBack('google'), google.callback);
  app.get('/api/integrations/canva/callback', signedInOrBack('canva'), canva.callback);
  app.get('/api/integrations/status', auth.requireAuth, (_req, res) => res.json({ meta: { configured: meta.config.configured }, google: { configured: google.config.configured }, canva: { configured: canva.config.configured } }));
  app.use('/api/companies/:id/integrations/meta', auth.requireAuth, companies.requireCompany, meta.company);
  app.use('/api/companies/:id/integrations/google', auth.requireAuth, companies.requireCompany, google.company);
  app.use('/api/companies/:id/integrations/canva', auth.requireAuth, companies.requireCompany, canva.company);
  app.use('/api/companies/:id/canva', auth.requireAuth, companies.requireCompany, canvaStudio.router);
  // A picture for one campaign post (campaignImage.js, image model in imageAi.js). Own allowance: images cost more than text.
  app.post('/api/companies/:id/campaigns/:cid/assets/:aid/image', auth.requireAuth, companies.requireCompany, campaignImageRoute(db, imageAi, imageLimiter));
  // AI Content Series (series.js): style read from reference posts (vision model) and series illustrations (image model).
  const seriesRouter = express.Router();
  seriesRoutes(seriesRouter, { db, requireCompany: companies.requireCompany, ai, imageAi, askLimiter: createLimiter(visualLimit), imageLimiter, textCheck: process.env.BRANDPILOT_IMAGE_TEXT_CHECK !== 'off' });
  app.use('/api/companies', auth.requireAuth, seriesRouter);
  // A short headline and supporting line for one post's artwork (visualCopy.js): a suggestion from the post's own wording.
  app.post('/api/companies/:id/campaigns/:cid/assets/:aid/visual-copy', auth.requireAuth, companies.requireCompany, visualCopyRoute(db, ai, createLimiter(visualLimit)));
  app.use('/api/companies', auth.requireAuth, companies.router);
  // Whether an AI key is set on this server. Says nothing else: no key, no model, no provider detail.
  // AI model choice (owner's request 2026-11-16): every provider / model with a key is an option; the choice
  // is server-wide and saved in app_settings, so it survives a restart. Keys never leave the server.
  const canPick = typeof ai.select === 'function' && typeof ai.options === 'function';
  if (canPick) {
    const saved = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_model'").get();
    if (saved) ai.select(saved.value);
  }
  const aiStatus = () => ({
    configured: ai.configured,
    images: imageAi.configured,
    ...(canPick ? { provider: ai.provider, model: ai.model, selected: ai.selected, options: ai.options() } : {}),
  });
  app.get('/api/ai/status', auth.requireAuth, (_req, res) => res.json(aiStatus()));
  app.put('/api/ai/model', auth.requireAuth, (req, res) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    if (!canPick || !ai.select(id)) return res.status(400).json({ error: 'unknown_model' });
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('ai_model', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(id);
    res.json(aiStatus());
  });

  // Browsers ask for /favicon.ico on their own; answer with the app icon instead of a 404.
  app.get('/favicon.ico', (_req, res) => res.sendFile(path.join(root, 'public', 'favicon.svg')));
  // Frontend: public/index.html is the working copy of the BrandPilot.html prototype.
  app.use(express.static(path.join(root, 'public')));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err?.status >= 400 && err?.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    const error = status === 500 ? 'server_error' : status === 413 ? 'too_large' : 'bad_request';
    res.status(status).json({ error });
  });
  return app;
}
