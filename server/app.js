import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createAuth } from './auth.js';
import { createCompanies } from './companies.js';
import { createAi } from './ai.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Tests pass `{ db: openDb(':memory:') }` (and optionally small `authLimits`, a stubbed `fetchUrl`
 * from createFetchUrl, a small `fetchLimit`, or an `ai` client from createAi with a stubbed network);
 * production uses the defaults (`ai` is built from ANTHROPIC_API_KEY / AI_MODEL).
 */
export function createApp({ db = openDb(), authLimits, fetchUrl, fetchLimit, ai = createAi(), askLimit } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // 1 MB JSON everywhere except the company state blob, which may hold sources and imported data.
  const jsonDefault = express.json({ limit: '1mb' });
  const jsonState = express.json({ limit: '5mb' });
  app.use((req, res, next) =>
    (/^\/api\/companies\/[^/]+\/state\/?$/.test(req.path) ? jsonState : jsonDefault)(req, res, next),
  );

  const auth = createAuth(db, { limits: authLimits });
  app.locals.db = db;
  const companies = createCompanies(db, { fetchUrl, fetchLimit, ai, askLimit });
  app.locals.requireAuth = auth.requireAuth;
  app.locals.requireCompany = companies.requireCompany;
  app.locals.ai = ai;

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'brandpilot' }));
  app.use('/api/auth', auth.router);
  app.use('/api/companies', auth.requireAuth, companies.router);
  // Whether an AI key is set on this server. Says nothing else: no key, no model, no provider detail.
  app.get('/api/ai/status', auth.requireAuth, (_req, res) => res.json({ configured: ai.configured }));

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
