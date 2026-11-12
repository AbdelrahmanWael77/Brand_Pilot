/**
 * AI client (task 4.2): the one place that talks to the model provider (Claude, through the
 * official Anthropic SDK). Nothing else in the server may call the provider.
 *
 *   const ai = createAi();                 // key and model from the environment
 *   ai.configured                          // false when no key is set — then nothing is ever sent
 *   await ai.complete({ system, messages }) → { text, model, stopReason, truncated }
 *
 * Failures are thrown as `AiError` with a short `code`; the provider's raw error body and the
 * API key never leave this module (the original error is kept on `cause` for server logs only).
 * What goes into `system` / `messages` is the caller's job — see `server/director.js`.
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/** On a safety decline the API re-runs the request on a fallback model inside the same call. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** code → HTTP status a route should answer with. */
export const AI_ERRORS = {
  ai_not_configured: 503,
  ai_auth_failed: 502,
  ai_rate_limited: 429,
  ai_timeout: 504,
  ai_refused: 422,
  ai_failed: 502,
};

export class AiError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = 'AiError';
    this.code = code;
    this.status = AI_ERRORS[code] ?? 502;
  }
}

function mapError(e) {
  if (e instanceof AiError) return e;
  // Most specific first: the timeout class extends the connection class.
  if (e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.RequestTimeoutError) return new AiError('ai_timeout', e);
  if (e instanceof Anthropic.RateLimitError) return new AiError('ai_rate_limited', e);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('ai_auth_failed', e);
  return new AiError('ai_failed', e);
}

/**
 * @param {object} [o]
 * @param {string} [o.apiKey]    defaults to ANTHROPIC_API_KEY; empty → not configured
 * @param {string} [o.model]     defaults to AI_MODEL, then DEFAULT_MODEL
 * @param {Function} [o.fetch]   passed to the SDK (tests stub the network here)
 * @param {number} [o.timeoutMs] per request
 * @param {number} [o.maxRetries] SDK retries on 408 / 409 / 429 / 5xx and connection errors
 */
export function createAi({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.AI_MODEL || DEFAULT_MODEL,
  fetch,
  timeoutMs = 120_000,
  maxRetries = 1,
} = {}) {
  const configured = typeof apiKey === 'string' && apiKey.trim() !== '';
  const client = configured ? new Anthropic({ apiKey: apiKey.trim(), ...(fetch ? { fetch } : {}), timeout: timeoutMs, maxRetries }) : null;

  /** One request, one answer. `messages` is the Messages API array; `system` a string. */
  async function complete({ system, messages, maxTokens = 16000, effort } = {}) {
    if (!configured) throw new AiError('ai_not_configured');
    let r;
    try {
      r = await client.beta.messages.create({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages,
        ...(effort ? { output_config: { effort } } : {}),
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
      });
    } catch (e) {
      throw mapError(e);
    }
    // A refusal is HTTP 200: check before reading the content.
    if (r.stop_reason === 'refusal') throw new AiError('ai_refused');
    const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, model: r.model, stopReason: r.stop_reason, truncated: r.stop_reason === 'max_tokens' };
  }

  return { configured, model: configured ? model : null, complete };
}
