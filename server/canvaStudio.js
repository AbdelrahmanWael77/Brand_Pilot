/**
 * Generate with Canva (task 10.4c): BrandPilot's server is an MCP client of Canva's remote MCP server
 * (https://api.canva.com/connect/v1/mcp, Streamable HTTP, JSON-RPC 2.0), acting for one signed-in user with the
 * permission that user gave in server/canva.js. Nothing here is a design engine: Canva generates, BrandPilot
 * sends a brief built from the company's own approved material and keeps a record of what came back.
 *
 * Canva's tool schemas are only readable after a user has signed in, and none could be read while this was
 * written (no Canva keys on the machine). So nothing is hard-coded beyond the tool NAMES Canva documents:
 * the tools and their input schemas are read from `tools/list` for each user, arguments are fitted to the
 * schema that is really there (`fitArgs`), and answers are read tolerantly (`readResult`). A tool that is
 * missing, or that requires an argument BrandPilot cannot fill, is an honest error — never a pretend result.
 *
 * Routes (company routes, signed-in member; every record belongs to the user who made it — one user never
 * sees or uses another user's Canva results, as Canva's MCP usage policy asks):
 *   GET    /api/companies/:id/canva/tools                 → { image, design, exportable, names }
 *   GET    /api/companies/:id/canva/assets[?campaign=]    → { assets: [view] }, newest first
 *   POST   /api/companies/:id/canva/generate              { campaignId, assetId?, kind: 'image'|'design', lang?, note? } → { asset }
 *   POST   /api/companies/:id/canva/assets/:aid/refresh   → { asset }   (an image job still running; fresh links of a design)
 *   POST   /api/companies/:id/canva/assets/:aid/pick      { candidate } → { asset }   (a proposed design becomes a real Canva design)
 *   POST   /api/companies/:id/canva/assets/:aid/export    → { asset }   (PNG of the design; links land in `images`)
 *   POST   /api/companies/:id/canva/assets/:aid/image     { i } → { dataUrl, type }   (bytes of one picture, to keep in the campaign)
 *   DELETE /api/companies/:id/canva/assets/:aid           → { ok }   (forgets the record; nothing is deleted in Canva)
 */
import crypto from 'node:crypto';
import express from 'express';
import { createLimiter } from './auth.js';
import { CanvaError, CANVA_MCP_URL } from './canva.js';
import { campaigns, LANGS } from './campaigns.js';
import { createFetchUrl, FetchUrlError } from './fetchUrl.js';

export const TOOLS = { image: 'generate-image', imageJob: 'get-generate-image-job', design: 'generate-design', pick: 'create-design-from-candidate', get: 'get-design', export: 'export-design' };
export const STUDIO_LIMITS = { note: 500, field: 400, list: 50, shown: 8, raw: 20_000, imageBytes: 8 * 1024 * 1024, logoBytes: 500_000, callMs: 90_000, quickMs: 20_000, sessionMs: 30 * 60_000 };
const PROTOCOL = '2025-06-18';
const REST = 'https://api.canva.com/rest/v1/';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isUrl = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v) && v.length < 2000;
/** A link that can be a picture file: any https link except a page of Canva's own site (a design's edit / view / preview page). */
const isPic = (v) => isUrl(v) && !/^https:\/\/(www\.)?canva\.(com|cn)\//i.test(v);
const scalar = (v) => (typeof v === 'string' && v !== '') || typeof v === 'number';
const one = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* ---------- fitting arguments to the schema Canva really publishes ---------- */

/** What BrandPilot can offer a tool, and the property names it may be called. First match in the tool's schema wins. */
const ALIAS = {
  prompt: ['query', 'prompt', 'description', 'text', 'input'],
  designType: ['design_type', 'type', 'design_format'],
  aspect: ['aspect_ratio', 'ratio', 'size', 'dimensions'],
  assets: ['asset_ids', 'assets', 'image_asset_ids', 'asset_id'],
  jobId: ['job_id', 'generation_job_id', 'id'],
  candidateId: ['candidate_id', 'candidate'],
  designId: ['design_id', 'id'],
  format: ['format', 'export_format', 'file_type', 'type'],
  intent: ['user_intent', 'intent'],
  count: ['count', 'num_images', 'number_of_images', 'n'],
};
function coerce(prop, v) {
  const p = isObj(prop) ? prop : {};
  if (isObj(v) && Array.isArray(v.pick)) {
    // a preference list: the first one the schema allows; without an enum, the first preference
    const en = Array.isArray(p.enum) ? p.enum : null;
    if (p.type === 'object') return { type: v.pick[0] };
    if (!en) return v.pick[0];
    return v.pick.find((x) => en.includes(x)) ?? en.find((x) => v.pick.some((w) => String(x).toLowerCase().includes(String(w).toLowerCase().split('_')[0]))) ?? undefined;
  }
  if (p.type === 'array') return Array.isArray(v) ? v : [v];
  if (Array.isArray(v)) return p.type === 'string' ? v[0] : v;
  if (p.type === 'integer' || p.type === 'number') return Number(v);
  return v;
}
/** Pure: `want` (BrandPilot's names) → arguments under the names the tool's input schema uses. Throws when a required one cannot be filled. */
export function fitArgs(tool, want) {
  const schema = isObj(tool && tool.inputSchema) ? tool.inputSchema : {};
  const props = isObj(schema.properties) ? schema.properties : null;
  const args = {};
  for (const [k, v] of Object.entries(want)) {
    if (v === undefined || v === null || !ALIAS[k]) continue;
    // a schema without properties tells nothing: use the documented first name
    const name = props ? ALIAS[k].find((n) => n in props && !(n in args)) : ALIAS[k][0];
    if (!name) continue;
    const val = coerce(props ? props[name] : null, v);
    if (val !== undefined) args[name] = val;
  }
  const missing = (Array.isArray(schema.required) ? schema.required : []).filter((r) => !(r in args));
  if (missing.length) throw new CanvaError('canva_tool_changed', 502, `${tool.name} requires ${missing.join(', ')}; schema has ${props ? Object.keys(props).join(', ') : 'no properties'}`);
  return args;
}

/* ---------- reading an answer whose exact shape was never seen ---------- */

function* walk(o, key = '', depth = 0) {
  if (depth > 8) return;
  yield [key, o];
  if (Array.isArray(o)) for (const x of o.slice(0, 50)) yield* walk(x, key, depth + 1);
  else if (isObj(o)) for (const [k, v] of Object.entries(o)) yield* walk(v, k, depth + 1);
}
/** The preview picture inside one item: a picture link under a thumbnail / preview / image key first, else any picture link. */
function picUnder(x) {
  for (const [k, v] of walk(x)) if (/thumb|preview|image/i.test(k)) for (const [, u] of walk(v)) if (isPic(u)) return u;
  for (const [, u] of walk(x)) if (isPic(u)) return u;
  return null;
}
const first = (o, re, ok = scalar) => {
  for (const [k, v] of walk(o)) if (re.test(k) && ok(v)) return v;
  return null;
};
/** Pure: an MCP tool result → what BrandPilot keeps. Unknown shapes give empty fields, never invented ones. */
export function readResult(result) {
  const texts = (Array.isArray(result && result.content) ? result.content : []).filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text);
  let o = isObj(result && result.structuredContent) ? result.structuredContent : null;
  for (const t of texts) {
    if (o) break;
    try {
      const j = JSON.parse(t);
      if (j && typeof j === 'object') o = j;
    } catch {
      /* plain text */
    }
  }
  const text = texts.join('\n');
  const found = o ? [] : (text.match(/https:\/\/[^\s"'<>)\]\\]+/g) || []).map((u) => u.replace(/[.,;]+$/, ''));
  o = o || {};
  const isEdit = (u) => /\/design\/[^/]+\/.*edit|\/edit(\?|$)/.test(u);
  const isView = (u) => /\/design\/[^/]+\/.*view|\/view(\?|$)/.test(u);
  let candidates = [];
  for (const [, v] of walk(o)) {
    if (Array.isArray(v) && v.length && v.every(isObj) && v.some((x) => Object.keys(x).some((k) => /candidate_?id/i.test(k)))) {
      candidates = v.slice(0, STUDIO_LIMITS.shown).map((x) => ({ id: String(first(x, /candidate_?id/i) ?? ''), thumb: picUnder(x) })).filter((c) => c.id);
      break;
    }
  }
  const editUrl = first(o, /edit_?url/i, isUrl) || found.find(isEdit) || null;
  const viewUrl = first(o, /view_?url/i, isUrl) || found.find(isView) || null;
  const fromLink = (editUrl || viewUrl || '').match(/\/design\/([A-Za-z0-9_-]{6,})/);
  const designId = first(o, /^design_?id$/i) ?? (isObj(o.design) && scalar(o.design.id) ? o.design.id : null) ?? (fromLink ? fromLink[1] : null);
  const images = [];
  const thumbs = new Set(candidates.map((c) => c.thumb));
  for (const [k, v] of walk(o)) if (isPic(v) && /url|thumb|image|download|preview/i.test(k) && !/edit|view/i.test(k) && !thumbs.has(v) && !images.includes(v)) images.push(v);
  for (const u of found) if (!isEdit(u) && !isView(u) && !/canva\.com\/design\//.test(u) && !images.includes(u)) images.push(u);
  const status = String(first(o, /^status$/i) ?? '').toLowerCase();
  let credits = null;
  for (const [k, v] of walk(o)) {
    if (/credit/i.test(k) && scalar(v)) {
      credits = `${k}: ${one(v, 60)}`;
      break;
    }
  }
  return {
    jobId: first(o, /^job_?id$/i) ?? (isObj(o.job) && scalar(o.job.id) ? o.job.id : null),
    status,
    failed: /fail|error|cancel/.test(status),
    candidates,
    designId: designId === null ? null : String(designId),
    editUrl,
    viewUrl,
    images: images.slice(0, STUDIO_LIMITS.shown),
    credits,
    text: one(text, 300),
  };
}

/** Pure: Canva's own words for a refused tool call → BrandPilot's error code. */
export function toolErrorCode(text) {
  const t = String(text || '').toLowerCase();
  if (/license_required|upgrade|not available on your plan|canva pro|premium|subscription/.test(t)) return ['canva_plan', 402];
  if (/credit|quota|usage limit|limit reached/.test(t)) return ['canva_credits', 402];
  if (/rate.?limit|too many requests/.test(t)) return ['canva_rate_limited', 429];
  if (/unauthori[sz]ed|invalid.?token|token.*(expired|revoked)/.test(t)) return ['canva_reauth', 409];
  if (/permission|scope|forbidden|not allowed|access denied/.test(t)) return ['canva_forbidden', 403];
  return ['canva_tool_error', 502];
}

/* ---------- the brief sent to Canva ---------- */

const CHANNEL_NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', email: 'email', web: 'web', internal: 'internal' };
const hexes = (list) => (Array.isArray(list) ? list : []).map((x) => (typeof x === 'string' ? x : isObj(x) ? x.hex : '')).filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 5);

/**
 * Pure: the text Canva receives. Only material of this company: its name, the campaign brief and the post's own
 * wording (both from the validated campaign mirror), approved colours, the user's extra direction.
 * An image is asked without any text or logo; a design is asked to use the wording as given and to add no claim.
 */
export function canvaBrief({ company, campaign, asset, kind, lang, colors, purpose, note, logoAttached }) {
  const ar = lang === 'ar';
  const b = campaign.brief || {};
  const pick = (en, arv) => one((ar ? arv : en) || en || arv, STUDIO_LIMITS.field);
  const lines = [];
  const add = (label, v) => {
    const s = one(v, STUDIO_LIMITS.field);
    if (s) lines.push(`${label}: ${s}`);
  };
  const where = asset ? CHANNEL_NAME[asset.channel] : (b.channels || []).map((c) => CHANNEL_NAME[c]).filter(Boolean)[0];
  if (kind === 'image') {
    lines.push(`A marketing picture for the company "${one(company, 200)}"${where ? `, to be used in a ${where} post` : ''}.`);
    add('Purpose', purpose || b.objective);
    add('Subject', b.concept || pick(b.messageEn, b.messageAr) || campaign.name);
    add('Audience', pick(b.audienceEn, b.audienceAr));
    add('Mood', b.tone);
    if (colors.length) lines.push(`Colour palette to lean on: ${colors.join(', ')}.`);
    lines.push('Style: clean and professional, with calm empty space where a headline can be placed later.');
    lines.push('The picture must contain no text, letters, numbers, prices, logos, brand marks or watermarks of any kind.');
  } else {
    lines.push(`A ${where ? where + ' ' : ''}social media post design for the company "${one(company, 200)}".`);
    lines.push(`Language of all text: ${ar ? 'Arabic (right to left)' : 'English'}.`);
    add('Purpose', purpose || b.objective);
    add('Audience', pick(b.audienceEn, b.audienceAr));
    add('Tone', b.tone);
    const words = [];
    // Not design wording: the caption / body that goes under the post, and template placeholders the user has not filled (⟦offer⟧).
    if (asset) {
      for (const [k, f] of Object.entries(asset.fields)) {
        const v = /⟦[^⟧]*⟧/.test(f.v) ? '' : one(f.v, STUDIO_LIMITS.field);
        if (v && k !== 'caption' && k !== 'body' && words.length < 4) words.push(`- ${k}: ${v}`);
      }
    }
    if (!words.length) {
      for (const [k, v] of [['message', pick(b.messageEn, b.messageAr)], ['offer', pick(b.offerEn, b.offerAr)], ['call to action', pick(b.ctaEn, b.ctaAr)]]) if (v) words.push(`- ${k}: ${v}`);
    }
    if (words.length) lines.push('Use this wording as given; shorten it if needed, but add no other text:', ...words);
    else lines.push(`Headline: ${one(campaign.name, 200)}. Add no other text.`);
    if (colors.length) lines.push(`Brand colours: ${colors.join(', ')}.`);
    lines.push(logoAttached ? 'Place the attached company logo unchanged. Do not draw, alter or imitate any other logo.' : 'Do not draw, invent or imitate a company logo; leave a clear corner where the real logo will be placed.');
    lines.push('Do not add prices, discounts, offers, dates, numbers, awards, testimonials or claims that are not in the wording above. No logos of other companies.');
  }
  const extra = one(note, STUDIO_LIMITS.note);
  if (extra) lines.push(`Extra direction from the user (style only): ${extra}`);
  return lines.join('\n');
}

/* ---------- MCP client (Streamable HTTP) ---------- */

function createMcp(fetchImpl, now) {
  const sessions = new Map(); // one per user and company; never shared between users
  async function post(token, sess, body, timeoutMs) {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (sess && sess.id) headers['mcp-session-id'] = sess.id;
    if (sess && sess.protocol) headers['mcp-protocol-version'] = sess.protocol;
    let res, text;
    try {
      res = await fetchImpl(CANVA_MCP_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      text = await res.text();
    } catch (e) {
      const slow = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new CanvaError(slow ? 'canva_timeout' : 'canva_failed', slow ? 504 : 502, `mcp network: ${e.message}`);
    }
    if (res.status === 401) throw new CanvaError('canva_reauth', 409, 'mcp 401');
    if (res.status === 403) throw new CanvaError('canva_forbidden', 403, `mcp 403 ${one(text, 200)}`);
    if (res.status === 429) throw new CanvaError('canva_rate_limited', 429, 'mcp 429');
    if (res.status === 404 && sess && sess.id) throw new CanvaError('canva_session', 502, 'mcp session ended');
    if (!res.ok) throw new CanvaError('canva_failed', 502, `mcp HTTP ${res.status} ${one(text, 200)}`);
    if (body.id === undefined) return { res };
    let msg = null;
    const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    try {
      if (type.includes('text/event-stream') || /^(event|data|id|:)/.test(text)) {
        for (const block of text.split(/\r?\n\r?\n/)) {
          const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
          if (!data) continue;
          const j = JSON.parse(data);
          if (j && j.id === body.id) msg = j;
        }
      } else msg = JSON.parse(text);
    } catch (e) {
      throw new CanvaError('canva_failed', 502, `mcp answer unreadable: ${e.message}`);
    }
    if (!msg) throw new CanvaError('canva_failed', 502, 'mcp: no answer to the request');
    if (msg.error) throw new CanvaError('canva_failed', 502, `mcp rpc ${msg.error.code}: ${one(msg.error.message, 300)}`);
    return { res, result: msg.result || {} };
  }
  let n = 0;
  const rpc = (method, params) => ({ jsonrpc: '2.0', id: ++n, method, params });

  async function session(key, token) {
    const have = sessions.get(key);
    if (have && have.at > now() - STUDIO_LIMITS.sessionMs) return have;
    const init = await post(token, null, rpc('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'BrandPilot', version: '1.0' } }), STUDIO_LIMITS.quickMs);
    const sess = { id: (init.res.headers && init.res.headers.get && init.res.headers.get('mcp-session-id')) || null, protocol: typeof init.result.protocolVersion === 'string' ? init.result.protocolVersion : PROTOCOL, tools: new Map(), at: now() };
    await post(token, sess, { jsonrpc: '2.0', method: 'notifications/initialized' }, STUDIO_LIMITS.quickMs);
    let cursor;
    for (let page = 0; page < 5; page++) {
      const r = (await post(token, sess, rpc('tools/list', cursor ? { cursor } : {}), STUDIO_LIMITS.quickMs)).result;
      for (const t of Array.isArray(r.tools) ? r.tools : []) if (t && typeof t.name === 'string') sess.tools.set(t.name, t);
      cursor = typeof r.nextCursor === 'string' && r.nextCursor ? r.nextCursor : null;
      if (!cursor) break;
    }
    sessions.set(key, sess);
    return sess;
  }
  /** The user's tools as Canva lists them for this user. */
  const tools = async (key, token) => (await session(key, token)).tools;
  async function callTool(key, token, name, want, timeoutMs = STUDIO_LIMITS.callMs) {
    for (let attempt = 0; ; attempt++) {
      const sess = await session(key, token);
      const tool = sess.tools.get(name);
      if (!tool) throw new CanvaError('canva_tool_missing', 501, `tool ${name} is not offered; offered: ${[...sess.tools.keys()].join(', ')}`);
      const args = fitArgs(tool, want);
      try {
        const { result } = await post(token, sess, rpc('tools/call', { name, arguments: args }), timeoutMs);
        if (result.isError) {
          const said = readResult(result).text;
          const [code, status] = toolErrorCode(said);
          const e = new CanvaError(code, status, `${name}: ${said}`);
          e.said = said;
          throw e;
        }
        return result;
      } catch (e) {
        if (e instanceof CanvaError && e.code === 'canva_session' && attempt === 0) {
          sessions.delete(key);
          continue;
        }
        throw e;
      }
    }
  }
  return { tools, callTool, forget: (key) => sessions.delete(key) };
}

/* ---------- routes ---------- */

export function createCanvaStudio(db, canva, { fetchUrl = createFetchUrl(), genLimit = { max: 12, windowMs: 10 * 60_000 }, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  db.exec(`
CREATE TABLE IF NOT EXISTS canva_assets (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  asset_id    TEXT,
  kind        TEXT NOT NULL,
  lang        TEXT NOT NULL,
  status      TEXT NOT NULL,            -- working | choose | ready | failed
  note        TEXT NOT NULL DEFAULT '',
  brief       TEXT NOT NULL DEFAULT '',
  job_id      TEXT,
  candidates  TEXT NOT NULL DEFAULT '[]',
  images      TEXT NOT NULL DEFAULT '[]',
  design_id   TEXT,
  edit_url    TEXT,
  view_url    TEXT,
  credits     TEXT,
  logo        TEXT,                     -- attached | not_supported | failed | none
  error       TEXT,
  said        TEXT,
  raw         TEXT,                     -- Canva's last answer, for the server's owner only (never sent to the browser)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS canva_assets_owner ON canva_assets (company_id, user_id, created_at);
CREATE TABLE IF NOT EXISTS canva_logos (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hash       TEXT NOT NULL,
  asset_id   TEXT NOT NULL,
  PRIMARY KEY (company_id, user_id, hash)
);`);
  const q = {
    add: db.prepare('INSERT INTO canva_assets (id, company_id, user_id, campaign_id, asset_id, kind, lang, status, note, brief, logo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    get: db.prepare('SELECT * FROM canva_assets WHERE id = ? AND company_id = ? AND user_id = ?'),
    list: db.prepare('SELECT * FROM canva_assets WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'),
    listCamp: db.prepare('SELECT * FROM canva_assets WHERE company_id = ? AND user_id = ? AND campaign_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'),
    set: db.prepare('UPDATE canva_assets SET status = ?, job_id = ?, candidates = ?, images = ?, design_id = ?, edit_url = ?, view_url = ?, credits = ?, error = ?, said = ?, raw = ?, updated_at = ? WHERE id = ?'),
    drop: db.prepare('DELETE FROM canva_assets WHERE id = ? AND company_id = ? AND user_id = ?'),
    state: db.prepare('SELECT data FROM company_state WHERE company_id = ?'),
    logo: db.prepare('SELECT asset_id FROM canva_logos WHERE company_id = ? AND user_id = ? AND hash = ?'),
    addLogo: db.prepare('INSERT OR REPLACE INTO canva_logos (company_id, user_id, hash, asset_id) VALUES (?, ?, ?, ?)'),
  };
  const now = canva.now;
  const mcp = createMcp(canva.fetch, now);
  const limiter = createLimiter(genLimit);
  const key = (req) => req.company.id + ' ' + req.user.id;
  const arr = (s) => {
    try {
      const a = JSON.parse(s);
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  };
  const view = (r) => ({
    id: r.id, campaignId: r.campaign_id, assetId: r.asset_id, kind: r.kind, lang: r.lang, status: r.status, note: r.note,
    candidates: arr(r.candidates).map((c) => ({ id: c.id, thumb: isPic(c.thumb) ? c.thumb : null })), images: arr(r.images).filter(isPic), designId: r.design_id, editUrl: r.edit_url, viewUrl: r.view_url,
    credits: r.credits, logo: r.logo, error: r.error, said: r.said, createdAt: new Date(r.created_at).toISOString(),
  });
  /** Writes what Canva answered into the record. An answer without a field keeps what the record had; `chosen` empties the proposals. */
  function store(row, got, result, status, chosen = false) {
    const merged = {
      job: got.jobId ?? row.job_id, candidates: chosen ? [] : got.candidates.length ? got.candidates : arr(row.candidates), images: got.images.length ? got.images : arr(row.images).filter(isPic),
      design: got.designId ?? row.design_id, edit: got.editUrl ?? row.edit_url, view: got.viewUrl ?? row.view_url, credits: got.credits ?? row.credits,
    };
    q.set.run(status, merged.job === null ? null : String(merged.job), JSON.stringify(merged.candidates), JSON.stringify(merged.images), merged.design, merged.edit, merged.view, merged.credits, null, null, JSON.stringify(result).slice(0, STUDIO_LIMITS.raw), now(), row.id);
  }
  /** What a record is after an answer: a design, proposals to choose from, pictures, a job to wait for — or nothing usable. */
  function statusOf(kind, got) {
    if (got.failed) return 'failed';
    if (got.designId || got.editUrl) return 'ready';
    if (kind === 'design' && got.candidates.length) return 'choose';
    if (kind === 'image' && got.images.length && !/progress|pending|queued|running/.test(got.status)) return 'ready';
    if (kind === 'image' && got.jobId) return 'working';
    return 'failed';
  }
  function failRow(row, e) {
    q.set.run('failed', row.job_id, row.candidates, row.images, row.design_id, row.edit_url, row.view_url, row.credits, e.code, e.said ? one(e.said, 300) : null, row.raw, now(), row.id);
  }
  const fail = (res, e, req, row) => {
    if (e instanceof FetchUrlError) {
      console.error(`Canva studio: a picture link could not be read (${e.code})`);
      return res.status(502).json({ error: 'canva_image_unreadable' });
    }
    if (!(e instanceof CanvaError)) throw e;
    if (e.detail) console.error(`Canva studio: ${e.code} (${e.detail})`);
    if (e.code === 'canva_reauth') {
      canva.needsReconnect(req.company.id, req.user.id);
      mcp.forget(key(req));
    }
    if (row) failRow(row, e);
    const body = { error: e.code };
    if (e.said) body.said = one(e.said, 300);
    if (row) body.asset = view(q.get.get(row.id, req.company.id, req.user.id));
    return res.status(e.status).json(body);
  };
  const token = (req) => canva.accessToken(req.company.id, req.user.id);

  /** Colours and logo live in the company's state blob; only well-formed values are taken from it. */
  function brandOf(companyId) {
    let st = null;
    try {
      const row = q.state.get(companyId);
      st = row ? JSON.parse(row.data) : null;
    } catch {
      st = null;
    }
    const brand = isObj(st && st.brand) ? st.brand : {};
    const media = (Array.isArray(st && st.media) ? st.media : []).find((m) => isObj(m) && m.id === brand.logo);
    const m = media && typeof media.data === 'string' ? media.data.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/) : null;
    const bytes = m ? Buffer.from(m[2], 'base64') : null;
    const camps = Array.isArray(st && st.campaigns) ? st.campaigns : [];
    return { colors: hexes(brand.colors), logo: bytes && bytes.length <= STUDIO_LIMITS.logoBytes ? { bytes, type: m[1] } : null, kindOf: (id) => one((camps.find((c) => isObj(c) && c.id === id) || {}).kind, 40).replace(/[^\w -]/g, '') };
  }
  /** The company's approved logo as an asset in this user's Canva (REST asset upload, once per logo). Null when it cannot be done. */
  async function logoAsset(req, logo, tok) {
    const hash = crypto.createHash('sha256').update(logo.bytes).digest('hex');
    const have = q.logo.get(req.company.id, req.user.id, hash);
    if (have) return have.asset_id;
    const rest = async (path, opts) => {
      const res = await canva.fetch(REST + path, { ...opts, headers: { authorization: `Bearer ${tok}`, ...(opts && opts.headers) }, signal: AbortSignal.timeout(STUDIO_LIMITS.quickMs) });
      const t = await res.text();
      if (!res.ok) throw new CanvaError('canva_failed', 502, `logo upload HTTP ${res.status} ${one(t, 200)}`);
      return t ? JSON.parse(t) : {};
    };
    let job = (await rest('asset-uploads', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'asset-upload-metadata': JSON.stringify({ name_base64: Buffer.from(`${one(req.company.name, 40)} logo`).toString('base64') }) }, body: logo.bytes })).job;
    for (let i = 0; i < 10 && job && job.status === 'in_progress'; i++) {
      await wait(1000);
      job = (await rest(`asset-uploads/${encodeURIComponent(job.id)}`)).job;
    }
    const id = job && job.status === 'success' && job.asset && job.asset.id;
    if (!id) throw new CanvaError('canva_failed', 502, `logo upload ended as ${job && job.status}`);
    q.addLogo.run(req.company.id, req.user.id, hash, String(id));
    return String(id);
  }

  const router = express.Router({ mergeParams: true });
  router.use((req, res, next) => {
    if (!canva.config.configured) return res.status(503).json({ error: 'canva_not_configured' });
    if (req.method !== 'GET' && req.method !== 'DELETE' && !canva.connected(req.company.id, req.user.id)) return res.status(409).json({ error: 'canva_reauth' });
    next();
  });

  router.get('/tools', async (req, res) => {
    if (!canva.connected(req.company.id, req.user.id)) return res.status(409).json({ error: 'canva_reauth' });
    try {
      const t = await mcp.tools(key(req), await token(req));
      res.json({ image: t.has(TOOLS.image), design: t.has(TOOLS.design), exportable: t.has(TOOLS.export), names: [...t.keys()].slice(0, 100) });
    } catch (e) {
      return fail(res, e, req);
    }
  });

  router.get('/assets', (req, res) => {
    const camp = typeof req.query.campaign === 'string' && req.query.campaign ? req.query.campaign : null;
    const rows = camp ? q.listCamp.all(req.company.id, req.user.id, camp, STUDIO_LIMITS.list) : q.list.all(req.company.id, req.user.id, STUDIO_LIMITS.list);
    res.json({ assets: rows.map(view) });
  });

  router.post('/generate', async (req, res) => {
    const b = isObj(req.body) ? req.body : {};
    if (b.kind !== 'image' && b.kind !== 'design') return res.status(400).json({ error: 'bad_request' });
    const campaign = typeof b.campaignId === 'string' ? campaigns(db, req.company.id).find((c) => c.id === b.campaignId) : null;
    if (!campaign) return res.status(404).json({ error: 'campaign_not_found' });
    const asset = b.assetId ? campaign.assets.find((a) => a.id === b.assetId) : null;
    if (b.assetId && !asset) return res.status(404).json({ error: 'asset_not_found' });
    const waitS = limiter.retryAfter(req.user.id);
    if (waitS) return res.status(429).set('Retry-After', String(waitS)).json({ error: 'too_many_attempts' });
    limiter.hit(req.user.id);
    const lang = LANGS.includes(b.lang) ? b.lang : asset ? asset.lang : 'en';
    const note = one(b.note, STUDIO_LIMITS.note);
    const brand = brandOf(req.company.id);
    let row = null;
    try {
      const tok = await token(req);
      const tools = await mcp.tools(key(req), tok);
      const name = b.kind === 'image' ? TOOLS.image : TOOLS.design;
      const tool = tools.get(name);
      if (!tool) throw new CanvaError('canva_tool_missing', 501, `tool ${name} is not offered; offered: ${[...tools.keys()].join(', ')}`);
      // The real logo goes to Canva as a file, never as a description. Only when the design tool takes assets.
      let logo = 'none';
      let logoId = null;
      if (b.kind === 'design' && brand.logo) {
        const props = isObj(tool.inputSchema) && isObj(tool.inputSchema.properties) ? tool.inputSchema.properties : {};
        if (!ALIAS.assets.some((n) => n in props)) logo = 'not_supported';
        else {
          try {
            logoId = await logoAsset(req, brand.logo, tok);
            logo = 'attached';
          } catch (e) {
            if (!(e instanceof CanvaError) && !(e instanceof SyntaxError)) throw e;
            console.error(`Canva studio: logo not attached (${e.detail || e.message})`);
            logo = 'failed';
          }
        }
      }
      const brief = canvaBrief({ company: req.company.name, campaign, asset, kind: b.kind, lang, colors: brand.colors, purpose: brand.kindOf(campaign.id), note, logoAttached: !!logoId });
      const id = crypto.randomUUID();
      q.add.run(id, req.company.id, req.user.id, campaign.id, asset ? asset.id : null, b.kind, lang, 'working', note, brief, logo, now(), now());
      row = q.get.get(id, req.company.id, req.user.id);
      const channel = asset ? asset.channel : (campaign.brief.channels || [])[0];
      const want = b.kind === 'image'
        ? { prompt: brief, aspect: { pick: ['1:1', 'square', '1024x1024'] }, intent: 'Create a campaign picture in BrandPilot' }
        : { prompt: brief, designType: { pick: [`${channel || 'instagram'}_post`, 'instagram_post', 'facebook_post', 'social_media', 'poster'] }, assets: logoId ? [logoId] : undefined, intent: 'Create a campaign post design in BrandPilot' };
      const result = await mcp.callTool(key(req), tok, name, want);
      const got = readResult(result);
      const status = statusOf(b.kind, got);
      store(row, got, result, status);
      if (status === 'failed') {
        const e = new CanvaError('canva_unreadable', 502, `${name} answered without a design, proposals, pictures or a job: ${one(JSON.stringify(result), 400)}`);
        return fail(res, e, req, q.get.get(id, req.company.id, req.user.id));
      }
      res.json({ asset: view(q.get.get(id, req.company.id, req.user.id)) });
    } catch (e) {
      return fail(res, e, req, row);
    }
  });

  const own = (req, res) => {
    const row = q.get.get(req.params.aid, req.company.id, req.user.id);
    if (!row) res.status(404).json({ error: 'not_found' });
    return row;
  };

  router.post('/assets/:aid/refresh', async (req, res) => {
    const row = own(req, res);
    if (!row) return;
    try {
      let result;
      if (row.kind === 'image' && row.status === 'working' && row.job_id) result = await mcp.callTool(key(req), await token(req), TOOLS.imageJob, { jobId: row.job_id, intent: 'Check a campaign picture in BrandPilot' }, STUDIO_LIMITS.quickMs);
      else if (row.design_id) result = await mcp.callTool(key(req), await token(req), TOOLS.get, { designId: row.design_id, intent: 'Open a campaign design from BrandPilot' }, STUDIO_LIMITS.quickMs);
      else return res.json({ asset: view(row) });
      const got = readResult(result);
      // a design's own thumbnail does not replace a picture the record already has (an export, the chosen proposal)
      if (row.design_id && arr(row.images).some(isPic)) got.images = [];
      const status = row.design_id ? row.status : got.failed ? 'failed' : got.images.length && !/progress|pending|queued|running/.test(got.status) ? 'ready' : 'working';
      store(row, got, result, status);
      res.json({ asset: view(q.get.get(row.id, req.company.id, req.user.id)) });
    } catch (e) {
      // a failed look does not spoil a record that was fine
      return fail(res, e, req, null);
    }
  });

  router.post('/assets/:aid/pick', async (req, res) => {
    const row = own(req, res);
    if (!row) return;
    const cand = arr(row.candidates).find((c) => c.id === String(isObj(req.body) ? req.body.candidate : ''));
    if (row.status !== 'choose' || !cand) return res.status(400).json({ error: 'bad_request' });
    try {
      const result = await mcp.callTool(key(req), await token(req), TOOLS.pick, { jobId: row.job_id, candidateId: cand.id, intent: 'Keep a campaign design proposal from BrandPilot' });
      const got = readResult(result);
      got.candidates = [];
      if (isPic(cand.thumb)) got.images = [cand.thumb];
      if (!got.designId && !got.editUrl) throw new CanvaError('canva_unreadable', 502, `${TOOLS.pick} answered without a design: ${one(JSON.stringify(result), 400)}`);
      // no preview came with the proposal or the new design: ask Canva for the design's thumbnail (a courtesy, never fatal)
      if (!got.images.length && got.designId) {
        try {
          got.images = readResult(await mcp.callTool(key(req), await token(req), TOOLS.get, { designId: got.designId, intent: 'Preview a campaign design in BrandPilot' }, STUDIO_LIMITS.quickMs)).images;
        } catch (e) {
          if (!(e instanceof CanvaError)) throw e;
        }
      }
      store(row, got, result, 'ready', true);
      res.json({ asset: view(q.get.get(row.id, req.company.id, req.user.id)) });
    } catch (e) {
      return fail(res, e, req, null);
    }
  });

  router.post('/assets/:aid/export', async (req, res) => {
    const row = own(req, res);
    if (!row) return;
    if (!row.design_id) return res.status(400).json({ error: 'bad_request' });
    try {
      const result = await mcp.callTool(key(req), await token(req), TOOLS.export, { designId: row.design_id, format: { pick: ['png'] }, intent: 'Export a campaign design to BrandPilot' });
      const got = readResult(result);
      if (!got.images.length) throw new CanvaError('canva_unreadable', 502, `${TOOLS.export} answered without a file link: ${one(JSON.stringify(result), 400)}`);
      got.designId = null;
      got.editUrl = null;
      got.viewUrl = null;
      store(row, got, result, row.status);
      res.json({ asset: view(q.get.get(row.id, req.company.id, req.user.id)) });
    } catch (e) {
      return fail(res, e, req, null);
    }
  });

  // The picture's bytes, so the browser can keep it in the campaign. The link came from Canva's answer to this
  // user; it is still read through the guarded reader (public https addresses only, images only, size cap).
  router.post('/assets/:aid/image', async (req, res) => {
    const row = own(req, res);
    if (!row) return;
    const list = [...arr(row.images), ...arr(row.candidates).map((c) => c.thumb)].filter(isPic);
    const url = list[Number.isInteger(isObj(req.body) ? req.body.i : null) ? req.body.i : 0];
    if (!url && !row.design_id) return res.status(400).json({ error: 'bad_request' });
    const read = (u) => fetchUrl(u, { types: ['image/png', 'image/jpeg', 'image/webp'], binary: true, maxBytes: STUDIO_LIMITS.imageBytes, accept: 'image/*' });
    try {
      let r = null;
      if (url) {
        try {
          r = await read(url);
        } catch (e) {
          if (!(e instanceof FetchUrlError) || !row.design_id) throw e;
          console.error(`Canva studio: preview link unreadable (${e.code}); exporting the design instead`);
        }
      }
      // A design without a readable preview (none given, or the link has expired): a fresh PNG export of the design.
      if (!r) {
        const result = await mcp.callTool(key(req), await token(req), TOOLS.export, { designId: row.design_id, format: { pick: ['png'] }, intent: 'Export a campaign design to BrandPilot' });
        const got = readResult(result);
        if (!got.images.length) throw new CanvaError('canva_unreadable', 502, `${TOOLS.export} answered without a file link: ${one(JSON.stringify(result), 400)}`);
        store(row, { ...got, designId: null, editUrl: null, viewUrl: null }, result, row.status);
        r = await read(got.images[0]);
      }
      res.json({ type: r.type, dataUrl: `data:${r.type};base64,${Buffer.from(r.bytes).toString('base64')}` });
    } catch (e) {
      return fail(res, e, req, null);
    }
  });

  router.delete('/assets/:aid', (req, res) => {
    q.drop.run(req.params.aid, req.company.id, req.user.id);
    res.json({ ok: true });
  });

  return { router };
}
