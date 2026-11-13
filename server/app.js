import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createAuth } from './auth.js';
import { createCompanies } from './companies.js';
import { createAi } from './ai.js';
import { createMeta } from './meta.js';

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
 * production uses the defaults (`ai` is built from ANTHROPIC_API_KEY / AI_MODEL). `meta` takes
 * { config, fetch, syncLimit, now } for createMeta (tests pass a stubbed Graph network).
 */
export function createApp({ db = openDb(), authLimits, fetchUrl, fetchLimit, ai = createAi(), askLimit, reportLimit, meta: metaOptions, trustProxy = parseTrustProxy(process.env.TRUST_PROXY) } = {}) {
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
  app.use((req, res, next) =>
    (/^\/api\/companies\/[^/]+\/state\/?$/.test(req.path) ? jsonState : jsonDefault)(req, res, next),
  );

  const auth = createAuth(db, { limits: authLimits });
  app.locals.db = db;
  const companies = createCompanies(db, { fetchUrl, fetchLimit, ai, askLimit, reportLimit });
  app.locals.requireAuth = auth.requireAuth;
  app.locals.requireCompany = companies.requireCompany;
  app.locals.ai = ai;

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'brandpilot' }));
  app.use('/api/auth', auth.router);
  // Live Meta connection (meta.js). The OAuth callback is a browser redirect from Meta: without a session it
  // goes back to the app instead of answering JSON. The company routes need membership, like every company route.
  const meta = createMeta(db, metaOptions);
  app.get('/api/integrations/meta/callback', (req, res, next) => {
    const user = auth.currentUser(req);
    if (!user) return res.redirect(302, '/?meta=signin');
    req.user = user;
    next();
  }, meta.callback);
  app.get('/api/integrations/status', auth.requireAuth, meta.status);
  app.use('/api/companies/:id/integrations/meta', auth.requireAuth, companies.requireCompany, meta.company);
  app.use('/api/companies', auth.requireAuth, companies.router);
  // Whether an AI key is set on this server. Says nothing else: no key, no model, no provider detail.
  app.get('/api/ai/status', auth.requireAuth, (_req, res) => res.json({ configured: ai.configured }));

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
