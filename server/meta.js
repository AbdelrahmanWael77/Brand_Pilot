/**
 * Live Meta connection (task 7.1): Facebook Pages + Instagram professional accounts, read-only.
 *
 * Flow (Facebook Login "manual flow", Graph API v27.0):
 *   POST /api/companies/:id/integrations/meta/start → { url } of Meta's consent dialog. A one-time
 *        `state` (random, stored hashed, 10 minutes) binds the round trip to this user and company.
 *   GET  /api/integrations/meta/callback?code&state → (signed-in session) exchanges the code on the
 *        server with the app secret, swaps it for a long-lived user token, reads the Pages the user
 *        manages (with each Page token and linked Instagram account), stores everything encrypted
 *        (AES-256-GCM, key TOKEN_KEY) and redirects back to the app.
 *   GET  /api/companies/:id/integrations/meta → connection info (never a token).
 *   POST /api/companies/:id/integrations/meta/sync { days } → reads posts and their insights and
 *        RETURNS rows in the Meta import schema; the browser imports them through the same pipeline
 *        as a file (validation, server mirror, audit and reports are unchanged). Nothing is written
 *        to data_rows here.
 *   DELETE /api/companies/:id/integrations/meta → forgets the tokens.
 *   GET  /api/integrations/status → { meta: { configured } }.
 *
 * Metrics (all checked against Meta's reference and deprecation pages, 2026-11):
 *   Facebook post: reach = post_total_media_view_unique, impressions = post_media_view (views),
 *     engagements = sum of post_reactions_by_type_total + shares.count, link_clicks = post_clicks_by_type["link clicks"].
 *     (post_impressions / post_impressions_unique were removed in 2025.) Comments are not counted.
 *   Instagram media: reach = reach, impressions = views, engagements = total_interactions (no link clicks).
 * A metric Meta does not return is left out of the row, never written as 0.
 *
 * Config (env, or createMeta({ config })): META_APP_ID, META_APP_SECRET, META_REDIRECT_URI (the full URL of
 * /api/integrations/meta/callback as registered in the Meta app), TOKEN_KEY (64 hex chars),
 * optional META_GRAPH_VERSION (default v27.0). Without all four the feature reports "not configured".
 */
import crypto from 'node:crypto';
import express from 'express';
import { createLimiter } from './auth.js';

export const META_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'read_insights', 'instagram_basic', 'instagram_manage_insights'];
export const META_LIMITS = { pages: 10, posts: 250, stateMs: 10 * 60_000, timeoutMs: 15_000, concurrency: 4 };
const FB_METRICS = ['post_total_media_view_unique', 'post_media_view', 'post_clicks_by_type', 'post_reactions_by_type_total'];
const IG_METRICS = ['reach', 'views', 'total_interactions'];
const THROTTLE = new Set([4, 17, 32, 613, 80001, 80002]);

export class MetaError extends Error {
  constructor(code, status, detail) {
    super(code);
    this.code = code; // meta_not_configured | meta_reauth | meta_rate_limited | meta_failed
    this.status = status;
    this.detail = detail; // server log only
  }
}

export function metaConfig(env = process.env) {
  const c = {
    appId: String(env.META_APP_ID || '').trim(),
    appSecret: String(env.META_APP_SECRET || '').trim(),
    redirectUri: String(env.META_REDIRECT_URI || '').trim(),
    tokenKey: String(env.TOKEN_KEY || '').trim(),
    version: String(env.META_GRAPH_VERSION || 'v27.0').trim(),
  };
  c.configured = !!(c.appId && c.appSecret && /^https?:\/\//.test(c.redirectUri) && /^[0-9a-f]{64}$/i.test(c.tokenKey));
  return c;
}

/** AES-256-GCM: "iv.tag.ciphertext" in base64url. */
export function sealer(hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  return {
    seal(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
      return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
    },
    open(sealed) {
      const [iv, tag, ct] = String(sealed).split('.').map((s) => Buffer.from(s, 'base64url'));
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    },
  };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const day = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
/** Script of a caption: 'ar' when Arabic letters outnumber Latin ones, 'en' for the reverse, nothing when neither. */
export function scriptLang(text) {
  const s = String(text || '');
  const ar = (s.match(/[؀-ۿ]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  if (!ar && !en) return undefined;
  return ar >= en ? 'ar' : 'en';
}
const metricValue = (item) => {
  if (!item) return undefined;
  if (item.total_value && 'value' in item.total_value) return item.total_value.value;
  return Array.isArray(item.values) && item.values.length ? item.values[0].value : undefined;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const sumObj = (v) => (v && typeof v === 'object' ? Object.values(v).reduce((s, x) => s + (Number(x) || 0), 0) : num(v));

/** Facebook post + its insights → one Meta row, or null when Meta gave no reach. */
export function fbRow(post, insights) {
  const by = Object.fromEntries((insights || []).map((m) => [m.name, metricValue(m)]));
  const reach = num(by.post_total_media_view_unique);
  const date = day(post.created_time);
  if (reach === undefined || !date) return null;
  const reactions = by.post_reactions_by_type_total;
  const row = { date, platform: 'facebook', post_id: String(post.id), reach };
  const views = num(by.post_media_view);
  if (views !== undefined) row.impressions = views;
  const shares = num(post.shares && post.shares.count) ?? 0;
  row.engagements = (sumObj(reactions) ?? 0) + shares;
  const clicks = by.post_clicks_by_type;
  if (clicks && typeof clicks === 'object') row.link_clicks = num(clicks['link clicks']) ?? 0;
  const lang = scriptLang(post.message);
  if (lang) row.language = lang;
  return row;
}

/** Instagram media + its insights → one Meta row, or null when Meta gave no reach. */
export function igRow(media, insights) {
  const by = Object.fromEntries((insights || []).map((m) => [m.name, metricValue(m)]));
  const reach = num(by.reach);
  const date = day(media.timestamp);
  if (reach === undefined || !date) return null;
  const row = { date, platform: 'instagram', post_id: String(media.id), reach, engagements: num(by.total_interactions) ?? 0 };
  const views = num(by.views);
  if (views !== undefined) row.impressions = views;
  if (media.media_type) row.format = String(media.media_type).toLowerCase();
  const lang = scriptLang(media.caption);
  if (lang) row.language = lang;
  return row;
}

/** Runs `fn` over `items` with at most `n` at a time. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

export function createMeta(db, { config = metaConfig(), fetch: fetchImpl = globalThis.fetch, syncLimit = { max: 6, windowMs: 10 * 60_000 }, now = () => Date.now() } = {}) {
  db.exec(`
CREATE TABLE IF NOT EXISTS meta_states (
  state_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta_connections (
  company_id   TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_token   TEXT NOT NULL,
  expires_at   INTEGER,
  pages        TEXT NOT NULL,
  connected_at INTEGER NOT NULL,
  last_sync_at INTEGER,
  last_error   TEXT
);`);
  const q = {
    addState: db.prepare('INSERT INTO meta_states (state_hash, user_id, company_id, expires_at) VALUES (?, ?, ?, ?)'),
    takeState: db.prepare('DELETE FROM meta_states WHERE state_hash = ? RETURNING user_id, company_id, expires_at'),
    dropOld: db.prepare('DELETE FROM meta_states WHERE expires_at < ?'),
    member: db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND company_id = ?'),
    save: db.prepare(`INSERT INTO meta_connections (company_id, user_id, user_token, expires_at, pages, connected_at, last_sync_at, last_error)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
      ON CONFLICT(company_id) DO UPDATE SET user_id = excluded.user_id, user_token = excluded.user_token, expires_at = excluded.expires_at,
        pages = excluded.pages, connected_at = excluded.connected_at, last_sync_at = NULL, last_error = NULL`),
    get: db.prepare('SELECT * FROM meta_connections WHERE company_id = ?'),
    synced: db.prepare('UPDATE meta_connections SET last_sync_at = ?, last_error = NULL WHERE company_id = ?'),
    failed: db.prepare('UPDATE meta_connections SET last_error = ? WHERE company_id = ?'),
    drop: db.prepare('DELETE FROM meta_connections WHERE company_id = ?'),
  };
  const box = config.configured ? sealer(config.tokenKey) : null;
  const limiter = createLimiter(syncLimit);
  const GRAPH = `https://graph.facebook.com/${config.version}/`;

  /** One Graph GET. `pathOrUrl` is a path under the version, or a paging.next URL from Graph itself. */
  async function graph(pathOrUrl, params = {}, token) {
    let url;
    if (/^https:\/\//.test(pathOrUrl)) {
      if (!pathOrUrl.startsWith('https://graph.facebook.com/')) throw new MetaError('meta_failed', 502, 'unexpected paging host');
      url = new URL(pathOrUrl);
    } else {
      url = new URL(GRAPH + pathOrUrl.replace(/^\/+/, ''));
      for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    }
    if (token) {
      url.searchParams.set('access_token', token);
      url.searchParams.set('appsecret_proof', crypto.createHmac('sha256', config.appSecret).update(token).digest('hex'));
    }
    let res, body;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(META_LIMITS.timeoutMs) });
      body = await res.json();
    } catch (e) {
      throw new MetaError('meta_failed', 502, `network: ${e.message}`);
    }
    if (body && body.error) {
      const c = Number(body.error.code);
      if (c === 190) throw new MetaError('meta_reauth', 409, body.error.message);
      if (THROTTLE.has(c)) throw new MetaError('meta_rate_limited', 429, body.error.message);
      const e = new MetaError('meta_failed', 502, `${c}: ${body.error.message}`);
      e.graphCode = c;
      throw e;
    }
    if (!res.ok) throw new MetaError('meta_failed', 502, `HTTP ${res.status}`);
    return body;
  }

  const notConfigured = (res) => res.status(503).json({ error: 'meta_not_configured' });
  const info = (row) => {
    if (!row) return { connected: false };
    const pages = JSON.parse(row.pages).map((p) => ({ id: p.id, name: p.name, instagram: !!p.ig }));
    return { connected: true, pages, connectedAt: new Date(row.connected_at).toISOString(), expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null, needsReconnect: row.last_error === 'reauth' };
  };
  const fail = (res, e, companyId) => {
    if (!(e instanceof MetaError)) throw e;
    if (e.detail) console.error(`Meta: ${e.code} (${e.detail})`);
    if (e.code === 'meta_reauth' && companyId) q.failed.run('reauth', companyId);
    return res.status(e.status).json({ error: e.code });
  };

  /* ---- GET /api/integrations/status and GET /api/integrations/meta/callback (signed in; mounted in app.js) ---- */
  const status = (_req, res) => res.json({ meta: { configured: config.configured } });

  const callback = async (req, res) => {
    const back = (r) => res.redirect(302, `/?meta=${r}`);
    if (!config.configured) return back('not_configured');
    q.dropOld.run(now());
    const st = req.query.state ? q.takeState.get(sha(String(req.query.state))) : null;
    if (!st || st.user_id !== req.user.id || st.expires_at < now() || !q.member.get(req.user.id, st.company_id)) return back('invalid');
    if (req.query.error || !req.query.code) return back('denied');
    try {
      const short = await graph('oauth/access_token', { client_id: config.appId, redirect_uri: config.redirectUri, client_secret: config.appSecret, code: String(req.query.code) });
      const long = await graph('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: config.appId, client_secret: config.appSecret, fb_exchange_token: short.access_token });
      const token = long.access_token || short.access_token;
      const expiresIn = Number(long.expires_in || short.expires_in) || null;
      const pages = [];
      let page = await graph('me/accounts', { fields: 'id,name,access_token,instagram_business_account', limit: 50 }, token);
      while (page && pages.length < META_LIMITS.pages) {
        for (const p of page.data || []) {
          if (pages.length >= META_LIMITS.pages) break;
          if (!p.id || !p.access_token) continue;
          pages.push({ id: String(p.id), name: String(p.name || '').slice(0, 200), token: box.seal(p.access_token), ig: p.instagram_business_account && p.instagram_business_account.id ? String(p.instagram_business_account.id) : null });
        }
        page = page.paging && page.paging.next ? await graph(page.paging.next) : null;
      }
      q.save.run(st.company_id, req.user.id, box.seal(token), expiresIn ? now() + expiresIn * 1000 : null, JSON.stringify(pages), now());
      return back(pages.length ? 'connected' : 'no_pages');
    } catch (e) {
      if (!(e instanceof MetaError)) throw e;
      console.error(`Meta connect: ${e.code} (${e.detail})`);
      return back('failed');
    }
  };

  /* ---- routes under /api/companies/:id/integrations/meta (signed in, member) ---- */
  const company = express.Router({ mergeParams: true });
  company.get('/', (req, res) => res.json({ configured: config.configured, ...info(q.get.get(req.company.id)) }));

  company.post('/start', (req, res) => {
    if (!config.configured) return notConfigured(res);
    const state = crypto.randomBytes(32).toString('base64url');
    q.dropOld.run(now());
    q.addState.run(sha(state), req.user.id, req.company.id, now() + META_LIMITS.stateMs);
    const u = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
    u.searchParams.set('client_id', config.appId);
    u.searchParams.set('redirect_uri', config.redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', META_SCOPES.join(','));
    res.json({ url: u.toString() });
  });

  company.delete('/', (req, res) => {
    q.drop.run(req.company.id);
    res.json({ ok: true });
  });

  company.post('/sync', async (req, res) => {
    if (!config.configured) return notConfigured(res);
    const row = q.get.get(req.company.id);
    if (!row) return res.status(404).json({ error: 'not_connected' });
    const days = req.body && req.body.days !== undefined ? Number(req.body.days) : 90;
    if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'invalid_days' });
    const wait = limiter.retryAfter(req.user.id);
    if (wait) return res.status(429).set('Retry-After', String(wait)).json({ error: 'too_many_attempts' });
    limiter.hit(req.user.id);
    const since = now() - days * 86_400_000;
    const sinceIso = new Date(since).toISOString();
    const rows = [];
    const skipped = { noInsights: 0, errors: 0 };
    let capped = false;
    let accounts = { pages: 0, instagram: 0 };
    try {
      for (const p of JSON.parse(row.pages)) {
        const pageToken = box.open(p.token);
        accounts.pages++;
        // Facebook: the Page feed, newest first, until posts are older than the window.
        const posts = [];
        let feed = await graph(`${p.id}/feed`, { fields: 'id,created_time,message,shares', limit: 100 }, pageToken);
        outer: while (feed) {
          for (const post of feed.data || []) {
            if (String(post.created_time) < sinceIso) break outer;
            if (rows.length + posts.length >= META_LIMITS.posts) { capped = true; break outer; }
            posts.push(post);
          }
          feed = feed.paging && feed.paging.next ? await graph(feed.paging.next) : null;
        }
        const fb = await pool(posts, META_LIMITS.concurrency, async (post) => {
          try {
            const ins = await graph(`${post.id}/insights`, { metric: FB_METRICS.join(',') }, pageToken);
            return fbRow(post, ins.data);
          } catch (e) {
            if (e instanceof MetaError && e.code === 'meta_failed') { skipped.errors++; return undefined; }
            throw e;
          }
        });
        for (const r of fb) if (r) rows.push(r); else if (r === null) skipped.noInsights++;
        // Instagram: the linked professional account's media in the window.
        if (p.ig && !capped) {
          accounts.instagram++;
          const media = [];
          let page = await graph(`${p.ig}/media`, { fields: 'id,timestamp,media_type,caption', since: Math.floor(since / 1000), limit: 100 }, pageToken);
          outer2: while (page) {
            for (const m of page.data || []) {
              if (String(m.timestamp) < sinceIso) break outer2;
              if (rows.length + media.length >= META_LIMITS.posts) { capped = true; break outer2; }
              media.push(m);
            }
            page = page.paging && page.paging.next ? await graph(page.paging.next) : null;
          }
          const ig = await pool(media, META_LIMITS.concurrency, async (m) => {
            try {
              const ins = await graph(`${m.id}/insights`, { metric: IG_METRICS.join(',') }, pageToken);
              return igRow(m, ins.data);
            } catch (e) {
              if (e instanceof MetaError && e.code === 'meta_failed') { skipped.errors++; return undefined; }
              throw e;
            }
          });
          for (const r of ig) if (r) rows.push(r); else if (r === null) skipped.noInsights++;
        }
        if (capped) break;
      }
    } catch (e) {
      return fail(res, e, req.company.id);
    }
    q.synced.run(now(), req.company.id);
    const dates = rows.map((r) => r.date).sort();
    res.json({ rows, from: dates[0] || null, to: dates[dates.length - 1] || null, accounts, skipped, capped, days });
  });

  return { status, callback, company, config };
}
