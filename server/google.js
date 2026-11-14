/**
 * Live Google connection (task 7.3): Google Analytics 4 + Search Console, read-only, one Google consent.
 *
 * Same design as server/meta.js:
 *   POST /api/companies/:id/integrations/google/start → { url } of Google's consent screen (offline access,
 *        so Google returns a refresh token). A one-time `state` (random, stored hashed, 10 minutes) binds the
 *        round trip to this user and company.
 *   GET  /api/integrations/google/callback?code&state → (signed-in session) exchanges the code on the server
 *        with the client secret, stores the refresh token encrypted (AES-256-GCM, TOKEN_KEY), redirects back.
 *   GET  /api/companies/:id/integrations/google → connection info and choices (never a token).
 *   GET  /api/companies/:id/integrations/google/options[?property=properties/N] → the GA4 properties and
 *        Search Console sites this Google account can read, and the key events of one property.
 *   PUT  /api/companies/:id/integrations/google { gaProperty, keyEvent, gscSite } → choices, each checked
 *        against what Google says this account can read.
 *   POST /api/companies/:id/integrations/google/sync { days, only: 'ga4' | 'gsc' } → RETURNS rows in the
 *        `ga4` / `gsc` import schemas; the browser imports them (origin google-api). Nothing is written to
 *        data_rows here.
 *   DELETE /api/companies/:id/integrations/google → revokes the token at Google (best effort) and forgets it.
 *
 * Mapping:
 *   GA4 (Data API v1beta runReport, dimensions date / sessionDefaultChannelGroup / landingPage / deviceCategory):
 *     sessions → sessions; enquiries → eventCount of the ONE key event the user chose (a second report filtered
 *     on eventName). No key event chosen → no enquiries column at all (never 0).
 *   Search Console (searchAnalytics.query, dimensions date / query / page, type web): clicks, impressions, position.
 *
 * Config: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (full URL of
 * /api/integrations/google/callback, registered in the Google Cloud OAuth client), TOKEN_KEY (64 hex).
 */
import crypto from 'node:crypto';
import express from 'express';
import { createLimiter } from './auth.js';
import { sealer } from './meta.js';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly'];
export const GOOGLE_LIMITS = { rows: 5000, stateMs: 10 * 60_000, timeoutMs: 20_000, gaPage: 10_000, gscPage: 25_000 };
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta/';
const DATA = 'https://analyticsdata.googleapis.com/v1beta/';
const GSC = 'https://www.googleapis.com/webmasters/v3/';

export class GoogleError extends Error {
  constructor(code, status, detail) {
    super(code);
    this.code = code; // google_not_configured | google_reauth | google_rate_limited | google_forbidden | google_failed
    this.status = status;
    this.detail = detail; // server log only
  }
}

export function googleConfig(env = process.env) {
  const c = {
    clientId: String(env.GOOGLE_CLIENT_ID || '').trim(),
    clientSecret: String(env.GOOGLE_CLIENT_SECRET || '').trim(),
    redirectUri: String(env.GOOGLE_REDIRECT_URI || '').trim(),
    tokenKey: String(env.TOKEN_KEY || '').trim(),
  };
  c.configured = !!(c.clientId && c.clientSecret && /^https?:\/\//.test(c.redirectUri) && /^[0-9a-f]{64}$/i.test(c.tokenKey));
  return c;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const gaDate = (s) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const int = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** GA4 report rows (sessions, and optionally the chosen key event's counts) → `ga4` import rows. */
export function ga4Rows(sessionRows, eventRows) {
  const key = (r) => r.dimensionValues.map((d) => d.value).join('\u0001');
  const events = eventRows ? new Map(eventRows.map((r) => [key(r), int(r.metricValues[0] && r.metricValues[0].value) ?? 0])) : null;
  const out = [];
  for (const r of sessionRows || []) {
    const [date, channel, landing, device] = r.dimensionValues.map((d) => d.value);
    const sessions = int(r.metricValues[0] && r.metricValues[0].value);
    const d = gaDate(date);
    if (!d || sessions === null || !channel) continue;
    const row = { date: d, channel, sessions, landing_page: landing || '(not set)', device: String(device || '(not set)').toLowerCase() };
    if (events) row.enquiries = events.get(key(r)) ?? 0;
    out.push(row);
  }
  return out;
}

/** Search Console rows (dimensions date, query, page) → `gsc` import rows. */
export function gscRows(rows) {
  const out = [];
  for (const r of rows || []) {
    const [date, query, page] = r.keys || [];
    const clicks = int(r.clicks);
    const impressions = int(r.impressions);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !query || clicks === null || impressions === null) continue;
    const row = { date, query, clicks, impressions };
    if (page) row.page = page;
    if (int(r.position) !== null) row.position = Math.round(r.position * 10) / 10;
    out.push(row);
  }
  return out;
}

export function createGoogle(db, { config = googleConfig(), fetch: fetchImpl = globalThis.fetch, syncLimit = { max: 10, windowMs: 10 * 60_000 }, now = () => Date.now() } = {}) {
  db.exec(`
CREATE TABLE IF NOT EXISTS google_states (
  state_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS google_connections (
  company_id     TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token  TEXT NOT NULL,
  access_token   TEXT,
  access_expires INTEGER,
  ga_property    TEXT,
  ga_name        TEXT,
  key_event      TEXT,
  gsc_site       TEXT,
  connected_at   INTEGER NOT NULL,
  last_sync_at   INTEGER,
  last_error     TEXT
);`);
  const q = {
    addState: db.prepare('INSERT INTO google_states (state_hash, user_id, company_id, expires_at) VALUES (?, ?, ?, ?)'),
    takeState: db.prepare('DELETE FROM google_states WHERE state_hash = ? RETURNING user_id, company_id, expires_at'),
    dropOld: db.prepare('DELETE FROM google_states WHERE expires_at < ?'),
    member: db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND company_id = ?'),
    save: db.prepare(`INSERT INTO google_connections (company_id, user_id, refresh_token, access_token, access_expires, connected_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id) DO UPDATE SET user_id = excluded.user_id, refresh_token = excluded.refresh_token, access_token = excluded.access_token,
        access_expires = excluded.access_expires, connected_at = excluded.connected_at, last_error = NULL`),
    get: db.prepare('SELECT * FROM google_connections WHERE company_id = ?'),
    access: db.prepare('UPDATE google_connections SET access_token = ?, access_expires = ? WHERE company_id = ?'),
    choose: db.prepare('UPDATE google_connections SET ga_property = ?, ga_name = ?, key_event = ?, gsc_site = ? WHERE company_id = ?'),
    synced: db.prepare('UPDATE google_connections SET last_sync_at = ?, last_error = NULL WHERE company_id = ?'),
    failed: db.prepare('UPDATE google_connections SET last_error = ? WHERE company_id = ?'),
    drop: db.prepare('DELETE FROM google_connections WHERE company_id = ?'),
  };
  const box = config.configured ? sealer(config.tokenKey) : null;
  const limiter = createLimiter(syncLimit);

  async function call(url, { method = 'GET', token, body, form } = {}) {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body) headers['content-type'] = 'application/json';
    if (form) headers['content-type'] = 'application/x-www-form-urlencoded';
    let res, data;
    try {
      res = await fetchImpl(url, { method, headers, body: body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined, signal: AbortSignal.timeout(GOOGLE_LIMITS.timeoutMs) });
      const text = await res.text();
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      throw new GoogleError('google_failed', 502, `network: ${e.message}`);
    }
    if (res.ok) return data;
    const err = data && data.error;
    const msg = typeof err === 'string' ? `${err}: ${data.error_description || ''}` : `${err && err.status} ${err && err.message}`;
    if (err === 'invalid_grant' || res.status === 401) throw new GoogleError('google_reauth', 409, msg);
    if (res.status === 429) throw new GoogleError('google_rate_limited', 429, msg);
    if (res.status === 403) throw new GoogleError('google_forbidden', 403, msg);
    throw new GoogleError('google_failed', 502, `HTTP ${res.status} ${msg}`);
  }

  /** A valid access token for this connection, refreshed when it is about to expire. */
  async function accessToken(row) {
    if (row.access_token && row.access_expires > now() + 60_000) return box.open(row.access_token);
    const t = await call(TOKEN_URL, { method: 'POST', form: { client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token', refresh_token: box.open(row.refresh_token) } });
    if (!t.access_token) throw new GoogleError('google_failed', 502, 'no access_token on refresh');
    q.access.run(box.seal(t.access_token), now() + (Number(t.expires_in) || 3600) * 1000, row.company_id);
    return t.access_token;
  }

  async function properties(token) {
    const out = [];
    let pageToken;
    do {
      const u = new URL(ADMIN + 'accountSummaries');
      u.searchParams.set('pageSize', '200');
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      const r = await call(u, { token });
      for (const a of r.accountSummaries || []) for (const p of a.propertySummaries || []) if (/^properties\/\d+$/.test(p.property)) out.push({ id: p.property, name: String(p.displayName || p.property), account: String(a.displayName || '') });
      pageToken = r.nextPageToken;
    } while (pageToken && out.length < 1000);
    return out;
  }
  async function sites(token) {
    const r = await call(GSC + 'sites', { token });
    return (r.siteEntry || []).filter((s) => s.siteUrl && s.permissionLevel !== 'siteUnverifiedUser').map((s) => ({ url: String(s.siteUrl), permission: String(s.permissionLevel || '') }));
  }
  async function keyEvents(token, property) {
    const out = [];
    let pageToken;
    do {
      const u = new URL(`${ADMIN}${property}/keyEvents`);
      u.searchParams.set('pageSize', '200');
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      const r = await call(u, { token });
      for (const k of r.keyEvents || []) if (k.eventName) out.push(String(k.eventName));
      pageToken = r.nextPageToken;
    } while (pageToken && out.length < 500);
    return out;
  }
  /** All rows of one runReport, paged with offset until `cap`. */
  async function report(token, property, body, cap) {
    const rows = [];
    let offset = 0;
    for (;;) {
      const r = await call(`${DATA}${property}:runReport`, { method: 'POST', token, body: { ...body, limit: String(GOOGLE_LIMITS.gaPage), offset: String(offset) } });
      const got = r.rows || [];
      rows.push(...got);
      offset += got.length;
      if (!got.length || rows.length >= cap || offset >= Number(r.rowCount || 0)) break;
    }
    return rows.slice(0, cap);
  }

  const info = (row) => {
    if (!row) return { connected: false };
    return { connected: true, gaProperty: row.ga_property, gaPropertyName: row.ga_name, keyEvent: row.key_event, gscSite: row.gsc_site,
      connectedAt: new Date(row.connected_at).toISOString(), lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null, needsReconnect: row.last_error === 'reauth' };
  };
  const fail = (res, e, companyId) => {
    if (!(e instanceof GoogleError)) throw e;
    if (e.detail) console.error(`Google: ${e.code} (${e.detail})`);
    if (e.code === 'google_reauth' && companyId) q.failed.run('reauth', companyId);
    return res.status(e.status).json({ error: e.code });
  };

  const callback = async (req, res) => {
    const back = (r) => res.redirect(302, `/?google=${r}`);
    if (!config.configured) return back('not_configured');
    q.dropOld.run(now());
    const st = req.query.state ? q.takeState.get(sha(String(req.query.state))) : null;
    if (!st || st.user_id !== req.user.id || st.expires_at < now() || !q.member.get(req.user.id, st.company_id)) return back('invalid');
    if (req.query.error || !req.query.code) return back('denied');
    try {
      const t = await call(TOKEN_URL, { method: 'POST', form: { client_id: config.clientId, client_secret: config.clientSecret, code: String(req.query.code), grant_type: 'authorization_code', redirect_uri: config.redirectUri } });
      if (!t.refresh_token) return back('no_refresh');
      const granted = String(t.scope || '').split(/\s+/);
      if (!GOOGLE_SCOPES.some((s) => granted.includes(s))) return back('no_scope');
      q.save.run(st.company_id, req.user.id, box.seal(t.refresh_token), t.access_token ? box.seal(t.access_token) : null, now() + (Number(t.expires_in) || 3600) * 1000, now());
      return back('connected');
    } catch (e) {
      if (!(e instanceof GoogleError)) throw e;
      console.error(`Google connect: ${e.code} (${e.detail})`);
      return back('failed');
    }
  };

  const company = express.Router({ mergeParams: true });
  company.get('/', (req, res) => res.json({ configured: config.configured, ...info(q.get.get(req.company.id)) }));

  company.post('/start', (req, res) => {
    if (!config.configured) return res.status(503).json({ error: 'google_not_configured' });
    const state = crypto.randomBytes(32).toString('base64url');
    q.dropOld.run(now());
    q.addState.run(sha(state), req.user.id, req.company.id, now() + GOOGLE_LIMITS.stateMs);
    const u = new URL(AUTH_URL);
    u.searchParams.set('client_id', config.clientId);
    u.searchParams.set('redirect_uri', config.redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent'); // always return a refresh token, also when connecting again
    u.searchParams.set('include_granted_scopes', 'true');
    u.searchParams.set('state', state);
    res.json({ url: u.toString() });
  });

  company.get('/options', async (req, res) => {
    if (!config.configured) return res.status(503).json({ error: 'google_not_configured' });
    const row = q.get.get(req.company.id);
    if (!row) return res.status(404).json({ error: 'not_connected' });
    const prop = req.query.property ? String(req.query.property) : null;
    if (prop && !/^properties\/\d+$/.test(prop)) return res.status(400).json({ error: 'invalid_property' });
    try {
      const token = await accessToken(row);
      const [props, siteList] = await Promise.all([properties(token), sites(token).catch((e) => (e.code === 'google_forbidden' ? [] : Promise.reject(e)))]);
      const out = { properties: props, sites: siteList };
      if (prop) {
        if (!props.some((p) => p.id === prop)) return res.status(400).json({ error: 'invalid_property' });
        out.keyEvents = await keyEvents(token, prop);
      }
      res.json(out);
    } catch (e) {
      return fail(res, e, req.company.id);
    }
  });

  company.put('/', async (req, res) => {
    if (!config.configured) return res.status(503).json({ error: 'google_not_configured' });
    const row = q.get.get(req.company.id);
    if (!row) return res.status(404).json({ error: 'not_connected' });
    const b = req.body || {};
    const ga = b.gaProperty ? String(b.gaProperty) : null;
    const ev = b.keyEvent ? String(b.keyEvent).slice(0, 100) : null;
    const site = b.gscSite ? String(b.gscSite).slice(0, 300) : null;
    if ((ga && !/^properties\/\d+$/.test(ga)) || (ev && !ga)) return res.status(400).json({ error: 'invalid_choice' });
    try {
      const token = await accessToken(row);
      let name = null;
      if (ga) {
        const p = (await properties(token)).find((x) => x.id === ga);
        if (!p) return res.status(400).json({ error: 'invalid_choice' });
        name = p.name;
        if (ev && !(await keyEvents(token, ga)).includes(ev)) return res.status(400).json({ error: 'invalid_choice' });
      }
      if (site && !(await sites(token)).some((s) => s.url === site)) return res.status(400).json({ error: 'invalid_choice' });
      q.choose.run(ga, name, ev, site, req.company.id);
      res.json({ configured: true, ...info(q.get.get(req.company.id)) });
    } catch (e) {
      return fail(res, e, req.company.id);
    }
  });

  company.delete('/', async (req, res) => {
    const row = q.get.get(req.company.id);
    if (row && box) {
      try {
        await call(REVOKE_URL, { method: 'POST', form: { token: box.open(row.refresh_token) } });
      } catch (e) {
        if (!(e instanceof GoogleError)) throw e; // revoking is best effort: the token is forgotten either way
      }
    }
    q.drop.run(req.company.id);
    res.json({ ok: true });
  });

  company.post('/sync', async (req, res) => {
    if (!config.configured) return res.status(503).json({ error: 'google_not_configured' });
    const row = q.get.get(req.company.id);
    if (!row) return res.status(404).json({ error: 'not_connected' });
    const b = req.body || {};
    const days = b.days !== undefined ? Number(b.days) : 90;
    const only = b.only;
    if (!Number.isInteger(days) || days < 1 || days > 365 || !['ga4', 'gsc'].includes(only)) return res.status(400).json({ error: 'invalid_sync' });
    if (only === 'ga4' && !row.ga_property) return res.status(409).json({ error: 'choose_property' });
    if (only === 'gsc' && !row.gsc_site) return res.status(409).json({ error: 'choose_site' });
    const wait = limiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    limiter.hit(req.user.id);
    const startDate = isoDay(now() - days * 86_400_000);
    const endDate = isoDay(now() - 86_400_000); // up to yesterday: today is still incomplete
    try {
      const token = await accessToken(row);
      let rows;
      if (only === 'ga4') {
        const dims = ['date', 'sessionDefaultChannelGroup', 'landingPage', 'deviceCategory'].map((name) => ({ name }));
        const base = { dateRanges: [{ startDate, endDate }], dimensions: dims };
        const sessions = await report(token, row.ga_property, { ...base, metrics: [{ name: 'sessions' }] }, GOOGLE_LIMITS.rows + 1);
        const events = row.key_event
          ? await report(token, row.ga_property, { ...base, metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: row.key_event } } } }, 100_000)
          : null;
        rows = ga4Rows(sessions, events);
      } else {
        const raw = [];
        for (let startRow = 0; raw.length <= GOOGLE_LIMITS.rows; startRow += GOOGLE_LIMITS.gscPage) {
          const r = await call(`${GSC}sites/${encodeURIComponent(row.gsc_site)}/searchAnalytics/query`, { method: 'POST', token, body: { startDate, endDate, dimensions: ['date', 'query', 'page'], type: 'web', rowLimit: GOOGLE_LIMITS.gscPage, startRow } });
          const got = r.rows || [];
          raw.push(...got);
          if (got.length < GOOGLE_LIMITS.gscPage) break;
        }
        rows = gscRows(raw);
      }
      const capped = rows.length > GOOGLE_LIMITS.rows;
      if (capped) rows = rows.slice(0, GOOGLE_LIMITS.rows);
      q.synced.run(now(), req.company.id);
      const dates = rows.map((r) => r.date).sort();
      res.json({ kind: only, rows, from: dates[0] || null, to: dates[dates.length - 1] || null, requested: { startDate, endDate }, capped, enquiries: only === 'ga4' ? row.key_event || null : undefined });
    } catch (e) {
      return fail(res, e, req.company.id);
    }
  });

  const status = (_req, res) => res.json({ google: { configured: config.configured } });
  return { status, callback, company, config };
}
