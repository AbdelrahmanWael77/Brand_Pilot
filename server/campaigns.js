/**
 * Server-side mirror of a company's campaigns (task 5.2).
 *
 * The Campaign Studio still works in the browser and keeps campaigns inside the state blob.
 * On every `PUT .../state` the server validates `state.campaigns` and copies the parts later
 * server features must be able to trust (name, recommendation link, brief wording, asset
 * text and status) into company-scoped tables — the same pattern as knowledge.js and data.js:
 * malformed items are skipped and counted, never fatal, and server code reads the tables,
 * never the blob. Not mirrored: design settings, colours, fonts, versions, uploaded images.
 */
import crypto from 'node:crypto';

export const LIMITS = { campaigns: 50, assets: 60, fields: 30, id: 64, name: 200, slug: 80, text: 1000, list: 10, field: 20000 };
export const CHANNELS = ['facebook', 'instagram', 'linkedin', 'email'];
export const ASSET_TYPES = ['post', 'landing', 'email', 'guide'];
export const ASSET_CHANNELS = [...CHANNELS, 'web', 'internal'];
export const LANGS = ['en', 'ar'];
export const ASSET_STATUSES = ['draft', 'approved'];
const BRIEF_TEXT = ['objective', 'concept', 'metric', 'audienceEn', 'audienceAr', 'messageEn', 'messageAr', 'offerEn', 'offerAr', 'ctaEn', 'ctaAr', 'url', 'tone'];
const BRIEF_LISTS = ['why', 'pointsEn', 'pointsAr'];

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isId = (x) => typeof x === 'string' && x.length > 0 && x.length <= LIMITS.id;
const text = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');

/** Pure: the trusted part of a brief. Missing or wrongly typed wording becomes '' / []. */
export function cleanBrief(b) {
  const src = isObj(b) ? b : {};
  const out = {};
  for (const k of BRIEF_TEXT) out[k] = text(src[k], LIMITS.text);
  for (const k of BRIEF_LISTS) {
    out[k] = (Array.isArray(src[k]) ? src[k] : []).filter((x) => typeof x === 'string' && x.trim() !== '').slice(0, LIMITS.list).map((x) => x.slice(0, LIMITS.text));
  }
  out.channels = [...new Set((Array.isArray(src.channels) ? src.channels : []).filter((x) => CHANNELS.includes(x)))];
  return out;
}

/** Pure: one asset → `{ asset, skipped }`, or `{ asset: null }` when it cannot be trusted. */
export function cleanAsset(a) {
  if (!isObj(a) || !isId(a.id) || !ASSET_TYPES.includes(a.type) || !LANGS.includes(a.lang) || !ASSET_CHANNELS.includes(a.channel) || !isObj(a.fields)) {
    return { asset: null, skipped: 0 };
  }
  const fields = {};
  let skipped = 0;
  let kept = 0;
  for (const [k, f] of Object.entries(a.fields)) {
    if (kept >= LIMITS.fields || !/^[A-Za-z0-9_]{1,40}$/.test(k) || !isObj(f) || typeof f.v !== 'string') {
      skipped++;
      continue;
    }
    fields[k] = { v: f.v.slice(0, LIMITS.field), edited: f.edited === true };
    kept++;
  }
  if (!kept) return { asset: null, skipped };
  return {
    asset: {
      id: a.id,
      type: a.type,
      lang: a.lang,
      channel: a.channel,
      n: Number.isInteger(a.n) && a.n >= 0 && a.n <= 99 ? a.n : 0,
      // An unknown status is never read as approved.
      status: ASSET_STATUSES.includes(a.status) ? a.status : 'draft',
      flagged: !!a.flag,
      fields,
    },
    skipped,
  };
}

/** Pure: one campaign → `{ campaign, skipped }`, or `{ campaign: null }` when it cannot be trusted. */
export function cleanCampaign(c) {
  if (!isObj(c) || !isId(c.id)) return { campaign: null, skipped: 0 };
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name || name.length > LIMITS.name) return { campaign: null, skipped: 0 };
  if (typeof c.slug !== 'string' || c.slug.length > LIMITS.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) return { campaign: null, skipped: 0 };
  if (!(c.rec === null || c.rec === undefined || isId(c.rec))) return { campaign: null, skipped: 0 };
  let skipped = 0;
  const assets = [];
  const seen = new Set();
  const list = Array.isArray(c.assets) ? c.assets : [];
  if (c.assets !== undefined && !Array.isArray(c.assets)) skipped++;
  for (const item of list) {
    const r = cleanAsset(item);
    skipped += r.skipped;
    if (!r.asset || seen.has(r.asset.id) || assets.length >= LIMITS.assets) {
      skipped++;
      continue;
    }
    seen.add(r.asset.id);
    assets.push(r.asset);
  }
  return {
    campaign: {
      id: c.id,
      name,
      slug: c.slug,
      rec: c.rec ?? null,
      approved: c.approved === true,
      createdAt: Number.isFinite(c.at) && c.at > 0 && c.at < 8.64e15 ? new Date(c.at).toISOString() : null,
      brief: cleanBrief(c.brief),
      assets,
    },
    skipped,
  };
}

export function createCampaigns(db) {
  const q = {
    deleteAll: db.prepare('DELETE FROM campaigns WHERE company_id = ?'), // assets go with them (cascade)
    insertCampaign: db.prepare(
      'INSERT INTO campaigns (company_id, id, pos, name, slug, rec, approved, created_at, brief) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ),
    insertAsset: db.prepare(
      `INSERT INTO campaign_assets (company_id, campaign_id, id, pos, type, lang, channel, n, status, flagged, fields)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    getMirror: db.prepare('SELECT hash, result FROM campaign_mirror WHERE company_id = ?'),
    putMirror: db.prepare(
      `INSERT INTO campaign_mirror (company_id, hash, result) VALUES (?, ?, ?)
       ON CONFLICT(company_id) DO UPDATE SET hash = excluded.hash, result = excluded.result`,
    ),
    list: db.prepare(
      `SELECT c.id, c.name, c.slug, c.rec, c.approved, c.created_at,
              (SELECT COUNT(*) FROM campaign_assets a WHERE a.company_id = c.company_id AND a.campaign_id = c.id) AS assets,
              (SELECT COUNT(*) FROM campaign_assets a WHERE a.company_id = c.company_id AND a.campaign_id = c.id AND a.status = 'approved') AS approved_assets
       FROM campaigns c WHERE c.company_id = ? ORDER BY c.pos`,
    ),
    one: db.prepare('SELECT id, name, slug, rec, approved, created_at, brief FROM campaigns WHERE company_id = ? AND id = ?'),
    assets: db.prepare(
      'SELECT id, type, lang, channel, n, status, flagged, fields FROM campaign_assets WHERE company_id = ? AND campaign_id = ? ORDER BY pos',
    ),
  };
  const head = (r) => ({ id: r.id, name: r.name, slug: r.slug, rec: r.rec, approved: r.approved === 1, createdAt: r.created_at });

  /**
   * Replace the company's mirrored campaigns with what `state.campaigns` holds. Call inside the
   * caller's transaction. Skipped when that part of the state is identical to the last mirror.
   * → `{ campaigns, assets, skipped }`
   */
  function mirror(companyId, state) {
    const raw = state?.campaigns;
    const hash = crypto.createHash('sha256').update(JSON.stringify(raw ?? null)).digest('hex');
    const prev = q.getMirror.get(companyId);
    if (prev && prev.hash === hash) return JSON.parse(prev.result);

    const result = { campaigns: 0, assets: 0, skipped: 0 };
    if (raw !== undefined && !Array.isArray(raw)) result.skipped++;
    q.deleteAll.run(companyId);
    const seen = new Set();
    for (const item of Array.isArray(raw) ? raw : []) {
      const r = cleanCampaign(item);
      if (!r.campaign || seen.has(r.campaign.id) || result.campaigns >= LIMITS.campaigns) {
        result.skipped++;
        continue;
      }
      result.skipped += r.skipped;
      const c = r.campaign;
      seen.add(c.id);
      q.insertCampaign.run(companyId, c.id, result.campaigns, c.name, c.slug, c.rec, c.approved ? 1 : 0, c.createdAt, JSON.stringify(c.brief));
      c.assets.forEach((a, i) =>
        q.insertAsset.run(companyId, c.id, a.id, i, a.type, a.lang, a.channel, a.n, a.status, a.flagged ? 1 : 0, JSON.stringify(a.fields)),
      );
      result.campaigns++;
      result.assets += c.assets.length;
    }
    q.putMirror.run(companyId, hash, JSON.stringify(result));
    return result;
  }

  /** Campaigns of one company, in the order the Studio shows them, without brief and asset text. */
  function list(companyId) {
    return q.list.all(companyId).map((r) => ({ ...head(r), assets: r.assets, approvedAssets: r.approved_assets }));
  }

  /** One campaign with its brief and assets, or null. */
  function get(companyId, campaignId) {
    const r = q.one.get(companyId, String(campaignId));
    if (!r) return null;
    return {
      ...head(r),
      brief: JSON.parse(r.brief),
      assets: q.assets.all(companyId, r.id).map((a) => ({
        id: a.id, type: a.type, lang: a.lang, channel: a.channel, n: a.n, status: a.status, flagged: a.flagged === 1, fields: JSON.parse(a.fields),
      })),
    };
  }

  return { mirror, list, get };
}

/** The only read path later server code may use for campaigns: every campaign with brief and assets. */
export function campaigns(db, companyId) {
  const c = createCampaigns(db);
  return c.list(companyId).map((x) => c.get(companyId, x.id));
}
