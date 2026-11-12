import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createAuth } from './auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Tests pass `{ db: openDb(':memory:') }`; production uses the default file database. */
export function createApp({ db = openDb() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const auth = createAuth(db);
  app.locals.db = db;
  app.locals.requireAuth = auth.requireAuth;

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'brandpilot' }));
  app.use('/api/auth', auth.router);

  // Frontend: public/index.html is the working copy of the BrandPilot.html prototype.
  app.use(express.static(path.join(root, 'public')));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err?.status >= 400 && err?.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'server_error' : 'bad_request' });
  });
  return app;
}
