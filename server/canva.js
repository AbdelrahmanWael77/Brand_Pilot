/**
 * Canva connection (task 10.4a): each company connects its own Canva account. Sign-in only — no design calls yet.
 *
 * Same design as server/google.js, with what Canva asks for (docs read 2026-11-15, canva.dev/docs/apps/rest-apis):
 *   POST /api/companies/:id/integrations/canva/start → { url } of Canva's consent screen. Authorization code
 *        with PKCE: a one-time `state` (random, stored hashed, 10 minutes) binds the round trip to this user and
 *        company and carries the code verifier (stored encrypted, never sent to the browser).
 *   GET  /api/integrations/canva/callback?code&state → (signed-in session) exchanges the code on the server
 *        (client id + secret as HTTP Basic, plus the code verifier), stores the tokens encrypted (AES-256-GCM,
 *        TOKEN_KEY), reads the account's display name when the `profile:read` scope was granted, redirects back.
 *   GET  /api/companies/:id/integrations/canva → { configured, connected, name, scopes, connectedAt, needsReconnect }
 *        (never a token).
 *   POST /api/companies/:id/integrations/canva/check → asks Canva who the connection belongs to, with a fresh
 *        access token: proves the stored connection still works. → { ok: true, name }.
 *   DELETE /api/companies/:id/integrations/canva → revokes the token at Canva (best effort) and forgets it.
 *
 * Canva's refresh tokens are single use: every refresh returns a new one, which replaces the stored one in the
 * same statement as the new access token. `accessToken(companyId)` is what later design calls use.
 *
 * Config: CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_REDIRECT_URI (full URL of /api/integrations/canva/callback,
 * registered in the Canva Developer Portal), optional CANVA_SCOPES (space separated; each must be enabled on the
 * integration), TOKEN_KEY (64 hex).
 */
import crypto from 'node:crypto';
import express from 'express';
import { createLimiter } from './auth.js';
import { sealer } from './meta.js';

export const CANVA_SCOPES = ['profile:read', 'design:meta:read', 'design:content:read', 'design:content:write', 'asset:read', 'asset:write', 'brandtemplate:meta:read', 'brandtemplate:content:read'];
export const CANVA_LIMITS = { stateMs: 10 * 60_000, timeoutMs: 20_000, name: 200 };
const AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const API = 'https://api.canva.com/rest/v1/';
const SCOPE_OK = /^[a-z][a-z:_]{1,60}$/;

export class CanvaError extends Error {
  constructor(code, status, detail) {
    super(code);
    this.code = code; // canva_not_configured | canva_reauth | canva_rate_limited | canva_forbidden | canva_failed
    this.status = status;
    this.detail = detail; // server log only
  }
}

export function canvaConfig(env = process.env) {
  const asked = String(env.CANVA_SCOPES || '').trim().split(/\s+/).filter((s) => SCOPE_OK.test(s));
  const c = {
    clientId: String(env.CANVA_CLIENT_ID || '').trim(),
    clientSecret: String(env.CANVA_CLIENT_SECRET || '').trim(),
    redirectUri: String(env.CANVA_REDIRECT_URI || '').trim(),
    tokenKey: String(env.TOKEN_KEY || '').trim(),
    scopes: asked.length ? asked : CANVA_SCOPES,
  };
  c.configured = !!(c.clientId && c.clientSecret && /^https?:\/\//.test(c.redirectUri) && /^[0-9a-f]{64}$/i.test(c.tokenKey));
  return c;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** PKCE: a verifier of 43–128 unreserved characters and its SHA-256 challenge, base64url. */
export function pkce() {
  const verifier = crypto.randomBytes(64).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

export function createCanva(db, { config = canvaConfig(), fetch: fetchImpl = globalThis.fetch, checkLimit = { max: 20, windowMs: 10 * 60_000 }, now = () => Date.now() } = {}) {
  db.exec(`
CREATE TABLE IF NOT EXISTS canva_states (
  state_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  verifier   TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS canva_connections (
  company_id     TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token  TEXT NOT NULL,
  access_token   TEXT,
  access_expires INTEGER,
  scopes         TEXT NOT NULL DEFAULT '',
  name           TEXT,
  connected_at   INTEGER NOT NULL,
  last_error     TEXT
);`);
  const q = {
    addState: db.prepare('INSERT INTO canva_states (state_hash, user_id, company_id, verifier, expires_at) VALUES (?, ?, ?, ?, ?)'),
    takeState: db.prepare('DELETE FROM canva_states WHERE state_hash = ? RETURNING user_id, company_id, verifier, expires_at'),
    dropOld: db.prepare('DELETE FROM canva_states WHERE expires_at < ?'),
    member: db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND company_id = ?'),
    save: db.prepare(`INSERT INTO canva_connections (company_id, user_id, refresh_token, access_token, access_expires, scopes, name, connected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id) DO UPDATE SET user_id = excluded.user_id, refresh_token = excluded.refresh_token, access_token = excluded.access_token,
        access_expires = excluded.access_expires, scopes = excluded.scopes, name = excluded.name, connected_at = excluded.connected_at, last_error = NULL`),
    get: db.prepare('SELECT * FROM canva_connections WHERE company_id = ?'),
    rotate: db.prepare('UPDATE canva_connections SET refresh_token = ?, access_token = ?, access_expires = ?, last_error = NULL WHERE company_id = ?'),
    named: db.prepare('UPDATE canva_connections SET name = ? WHERE company_id = ?'),
    failed: db.prepare('UPDATE canva_connections SET last_error = ? WHERE company_id = ?'),
    drop: db.prepare('DELETE FROM canva_connections WHERE company_id = ?'),
  };
  const box = config.configured ? sealer(config.tokenKey) : null;
  const limiter = createLimiter(checkLimit);
  const basic = () => `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;

  async function call(url, { method = 'GET', token, form } = {}) {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (form) {
      headers.authorization = basic();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
    let res, data;
    try {
      res = await fetchImpl(url, { method, headers, body: form ? new URLSearchParams(form).toString() : undefined, signal: AbortSignal.timeout(CANVA_LIMITS.timeoutMs) });
      const text = await res.text();
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      throw new CanvaError('canva_failed', 502, `network: ${e.message}`);
    }
    if (res.ok) return data;
    const msg = `${data && (data.code || data.error)}: ${data && (data.message || data.error_description || '')}`;
    if (res.status === 401 || (data && (data.error === 'invalid_grant' || data.code === 'invalid_grant'))) throw new CanvaError('canva_reauth', 409, msg);
    if (res.status === 429) throw new CanvaError('canva_rate_limited', 429, msg);
    if (res.status === 403) throw new CanvaError('canva_forbidden', 403, msg);
    throw new CanvaError('canva_failed', 502, `HTTP ${res.status} ${msg}`);
  }

  /** One refresh at a time per company: Canva's refresh tokens are single use, so two parallel refreshes would lose the connection. */
  const refreshing = new Map();
  /** A valid access token for this company's connection, refreshed (and the refresh token replaced) when it is about to expire. */
  async function accessToken(companyId) {
    if (!config.configured) throw new CanvaError('canva_not_configured', 503);
    const row = q.get.get(companyId);
    if (!row) throw new CanvaError('canva_reauth', 409, 'not connected');
    if (row.access_token && row.access_expires > now() + 60_000) return box.open(row.access_token);
    if (refreshing.has(companyId)) return refreshing.get(companyId);
    const p = (async () => {
      try {
        const t = await call(`${API}oauth/token`, { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: box.open(row.refresh_token) } });
        if (!t.access_token || !t.refresh_token) throw new CanvaError('canva_failed', 502, 'no tokens on refresh');
        q.rotate.run(box.seal(t.refresh_token), box.seal(t.access_token), now() + (Number(t.expires_in) || 14_400) * 1000, companyId);
        return t.access_token;
      } finally {
        refreshing.delete(companyId);
      }
    })();
    refreshing.set(companyId, p);
    return p;
  }

  async function displayName(token) {
    const r = await call(`${API}users/me/profile`, { token });
    const n = r && r.profile && typeof r.profile.display_name === 'string' ? r.profile.display_name.trim().slice(0, CANVA_LIMITS.name) : '';
    return n || null;
  }

  const info = (row) => {
    if (!row) return { connected: false };
    return { connected: true, name: row.name || null, scopes: row.scopes ? row.scopes.split(' ') : [], connectedAt: new Date(row.connected_at).toISOString(), needsReconnect: row.last_error === 'reauth' };
  };
  const fail = (res, e, companyId) => {
    if (!(e instanceof CanvaError)) throw e;
    if (e.detail) console.error(`Canva: ${e.code} (${e.detail})`);
    if (e.code === 'canva_reauth' && companyId) q.failed.run('reauth', companyId);
    return res.status(e.status).json({ error: e.code });
  };

  const callback = async (req, res) => {
    const back = (r) => res.redirect(302, `/?canva=${r}`);
    if (!config.configured) return back('not_configured');
    q.dropOld.run(now());
    const st = req.query.state ? q.takeState.get(sha(String(req.query.state))) : null;
    if (!st || st.user_id !== req.user.id || st.expires_at < now() || !q.member.get(req.user.id, st.company_id)) return back('invalid');
    if (req.query.error || !req.query.code) return back('denied');
    try {
      const t = await call(`${API}oauth/token`, { method: 'POST', form: { grant_type: 'authorization_code', code: String(req.query.code), code_verifier: box.open(st.verifier), redirect_uri: config.redirectUri } });
      if (!t.access_token || !t.refresh_token) return back('no_refresh');
      const granted = String(t.scope || '').split(/\s+/).filter((s) => SCOPE_OK.test(s));
      let name = null;
      if (granted.includes('profile:read')) {
        try {
          name = await displayName(t.access_token);
        } catch (e) {
          if (!(e instanceof CanvaError)) throw e; // the name is a courtesy: the connection stands without it
        }
      }
      q.save.run(st.company_id, req.user.id, box.seal(t.refresh_token), box.seal(t.access_token), now() + (Number(t.expires_in) || 14_400) * 1000, granted.join(' '), name, now());
      return back('connected');
    } catch (e) {
      if (!(e instanceof CanvaError)) throw e;
      console.error(`Canva connect: ${e.code} (${e.detail})`);
      return back('failed');
    }
  };

  const company = express.Router({ mergeParams: true });
  company.get('/', (req, res) => res.json({ configured: config.configured, ...info(q.get.get(req.company.id)) }));

  company.post('/start', (req, res) => {
    if (!config.configured) return res.status(503).json({ error: 'canva_not_configured' });
    const state = crypto.randomBytes(32).toString('base64url');
    const { verifier, challenge } = pkce();
    q.dropOld.run(now());
    q.addState.run(sha(state), req.user.id, req.company.id, box.seal(verifier), now() + CANVA_LIMITS.stateMs);
    const u = new URL(AUTH_URL);
    u.searchParams.set('code_challenge', challenge);
    u.searchParams.set('code_challenge_method', 'S256');
    u.searchParams.set('scope', config.scopes.join(' '));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', config.clientId);
    u.searchParams.set('state', state);
    u.searchParams.set('redirect_uri', config.redirectUri);
    res.json({ url: u.toString() });
  });

  company.post('/check', async (req, res) => {
    if (!config.configured) return res.status(503).json({ error: 'canva_not_configured' });
    if (!q.get.get(req.company.id)) return res.status(404).json({ error: 'not_connected' });
    const wait = limiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    limiter.hit(req.user.id);
    try {
      const name = await displayName(await accessToken(req.company.id));
      if (name) q.named.run(name, req.company.id);
      res.json({ ok: true, name });
    } catch (e) {
      return fail(res, e, req.company.id);
    }
  });

  company.delete('/', async (req, res) => {
    const row = q.get.get(req.company.id);
    if (row && box) {
      try {
        await call(`${API}oauth/revoke`, { method: 'POST', form: { token: box.open(row.refresh_token) } });
      } catch (e) {
        if (!(e instanceof CanvaError)) throw e; // revoking is best effort: the token is forgotten either way
      }
    }
    q.drop.run(req.company.id);
    res.json({ ok: true });
  });

  return { callback, company, config, accessToken };
}
