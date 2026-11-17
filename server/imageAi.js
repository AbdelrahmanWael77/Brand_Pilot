/**
 * Image generation (task 9.12, owner's choice 2026-11-15: Cloudflare Workers AI, FLUX.1 [schnell]).
 *
 * Only this module talks to the image model. One call:
 *   POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{model}
 *   Authorization: Bearer {CLOUDFLARE_AI_TOKEN}      body { prompt, steps }
 *   → { result: { image: <base64> }, success, errors }   (docs read 2026-11-15: the model's output schema has
 *   `image` "in Base64 format"; the REST envelope is result / success / errors / messages. The docs show the
 *   envelope for a text model only, so a bare `{ image }` reply is accepted too.)
 * Free allowance: 10,000 neurons a day on the Workers Free plan (developers.cloudflare.com/workers-ai/platform/pricing).
 *
 * The bytes are checked (JPEG / PNG / WebP signature, size cap) before they leave this module, and are returned as
 * a data URL. The key, the account id and the provider's error text never reach a response.
 *
 * Config: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN (a "Workers AI" API token: Workers AI Read + Edit),
 * optional AI_IMAGE_MODEL (default @cf/black-forest-labs/flux-1-schnell).
 */
import { AiError } from './ai.js';

export const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const IMAGE_LIMITS = { prompt: 2048, bytes: 4 * 1024 * 1024, steps: 6, timeoutMs: 60_000 };
const has = (s) => typeof s === 'string' && s.trim() !== '';

/** Pure: the image type from its first bytes, or null. */
export function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export function createImageAi({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  // CLOUDFLARE_API_TOKEN is accepted too (the name the owner used, 2026-11-17).
  token = process.env.CLOUDFLARE_AI_TOKEN || process.env.CLOUDFLARE_API_TOKEN,
  model = process.env.AI_IMAGE_MODEL,
  fetch: f = globalThis.fetch,
  timeoutMs = IMAGE_LIMITS.timeoutMs,
} = {}) {
  const acct = has(accountId) ? accountId.trim() : '';
  const configured = /^[0-9a-f]{32}$/i.test(acct) && has(token);
  const useModel = has(model) && /^@cf\/[\w.\-/]+$/.test(model.trim()) ? model.trim() : DEFAULT_IMAGE_MODEL;

  /** One picture for `prompt`. → { data: 'data:image/…;base64,…', type, model, bytes } */
  async function generate({ prompt }) {
    if (!configured) throw new AiError('ai_not_configured');
    const p = String(prompt || '').slice(0, IMAGE_LIMITS.prompt);
    if (!p.trim()) throw new AiError('ai_failed', new Error('empty prompt'));
    let res, data;
    try {
      res = await f(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${useModel}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token.trim()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: p, steps: IMAGE_LIMITS.steps }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 200) };
      }
    } catch (e) {
      throw new AiError(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'ai_timeout' : 'ai_failed', e);
    }
    const errs = Array.isArray(data?.errors) ? data.errors : [];
    const msg = errs.map((x) => `${x.code ?? ''} ${x.message ?? ''}`).join('; ') || data?.raw || '';
    const cause = new Error(`Cloudflare HTTP ${res.status}: ${msg}`.slice(0, 300));
    if (res.status === 401 || res.status === 403) throw new AiError('ai_auth_failed', cause);
    if (res.status === 429 || /neuron|quota|daily (free )?(allocation|limit)/i.test(msg)) throw new AiError('ai_rate_limited', cause);
    if (/nsfw|unsafe|safety|content (policy|filter)|flagged/i.test(msg)) throw new AiError('ai_refused', cause);
    if (!res.ok || data?.success === false) throw new AiError('ai_failed', cause);
    const b64 = data?.result?.image ?? data?.image;
    if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new AiError('ai_failed', new Error('reply without an image'));
    const buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
    if (buf.length > IMAGE_LIMITS.bytes) throw new AiError('ai_failed', new Error(`image too large: ${buf.length}`));
    const type = sniffImage(buf);
    if (!type) throw new AiError('ai_failed', new Error('reply is not a JPEG, PNG or WebP image'));
    return { data: `data:${type};base64,${buf.toString('base64')}`, type, model: useModel, bytes: buf.length };
  }

  return { configured, model: configured ? useModel : null, generate };
}
