/**
 * AI client (task 4.2): the one place that talks to a model provider. Nothing else in the server
 * may call a provider.
 *
 *   const ai = createAi();                 // keys, provider and model from the environment
 *   ai.configured                          // false when no key is set — then nothing is ever sent
 *   ai.provider                            // 'anthropic' | 'openai' | null
 *   await ai.complete({ system, messages }) → { text, model, stopReason, truncated }
 *
 * Two providers, same contract:
 *   - Claude, through the official Anthropic SDK (ANTHROPIC_API_KEY) — the default when both keys are set.
 *   - OpenAI, through its Chat Completions endpoint over plain HTTPS (OPENAI_API_KEY; owner's choice
 *     2026-11-14, no extra dependency).
 * AI_PROVIDER=anthropic|openai forces one; otherwise the provider is the one whose key is set.
 *
 * Failures are thrown as `AiError` with a short `code`; the provider's raw error body and the
 * API key never leave this module (the original error is kept on `cause` for server logs only).
 * What goes into `system` / `messages` is the caller's job — see `server/director.js`.
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/** Model id used with OpenAI when AI_MODEL is empty (the id OpenAI's own examples used on 2026-11-14). */
export const DEFAULT_OPENAI_MODEL = 'gpt-6-astra';
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
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

const has = (k) => typeof k === 'string' && k.trim() !== '';

/** Claude through the Anthropic SDK. */
function anthropicComplete({ apiKey, model, fetch, timeoutMs, maxRetries }) {
  const client = new Anthropic({ apiKey, ...(fetch ? { fetch } : {}), timeout: timeoutMs, maxRetries });
  return async ({ system, messages, maxTokens, effort }) => {
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
  };
}

/**
 * OpenAI Chat Completions over fetch. The system prompt is the first message; the output cap is
 * `max_completion_tokens`. `effort` is passed as `reasoning_effort` only for the three values both
 * providers share. Retries (connection failures and 5xx only) are done here.
 */
function openaiComplete({ apiKey, model, fetch: f = globalThis.fetch, timeoutMs, maxRetries }) {
  // The provider's error text is kept for the server log only (AiError.cause), cut short.
  const httpError = async (res) => new Error(`OpenAI HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  async function once(body) {
    let res;
    try {
      res = await f(OPENAI_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      throw Object.assign(new AiError(timeout ? 'ai_timeout' : 'ai_failed', e), { retry: !timeout });
    }
    if (res.ok) {
      try {
        return await res.json();
      } catch (e) {
        throw new AiError('ai_failed', e);
      }
    }
    const cause = await httpError(res);
    if (res.status === 401 || res.status === 403) throw new AiError('ai_auth_failed', cause);
    // 429 is also what an account without credit gets; that is not "try again in a few minutes".
    if (res.status === 429) throw new AiError(/insufficient_quota/.test(cause.message) ? 'ai_failed' : 'ai_rate_limited', cause);
    throw Object.assign(new AiError('ai_failed', cause), { retry: res.status >= 500 });
  }
  return async ({ system, messages, maxTokens, effort }) => {
    const body = {
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      max_completion_tokens: maxTokens,
      ...(['low', 'medium', 'high'].includes(effort) ? { reasoning_effort: effort } : {}),
    };
    let j;
    for (let attempt = 0; ; attempt++) {
      try {
        j = await once(body);
        break;
      } catch (e) {
        if (!(e.retry && attempt < maxRetries)) throw e;
      }
    }
    const c = j?.choices?.[0];
    if (!c || !c.message) throw new AiError('ai_failed', new Error('OpenAI reply without a choice'));
    // A decline is HTTP 200 here too: a refusal text, or the content filter.
    if (c.message.refusal || c.finish_reason === 'content_filter') throw new AiError('ai_refused');
    const text = typeof c.message.content === 'string' ? c.message.content : '';
    return { text, model: j.model ?? model, stopReason: c.finish_reason, truncated: c.finish_reason === 'length' };
  };
}

/**
 * @param {object} [o]
 * @param {string} [o.apiKey]     Anthropic key; defaults to ANTHROPIC_API_KEY
 * @param {string} [o.openaiKey]  OpenAI key; defaults to OPENAI_API_KEY
 * @param {string} [o.provider]   'anthropic' | 'openai'; defaults to AI_PROVIDER, then to the key that is set (Anthropic first)
 * @param {string} [o.model]      defaults to AI_MODEL, then the provider's default
 * @param {Function} [o.fetch]    the network (tests stub it here)
 * @param {number} [o.timeoutMs]  per request
 * @param {number} [o.maxRetries] retries on connection errors and 5xx (the Anthropic SDK also retries 408 / 409 / 429)
 */
export function createAi({
  apiKey = process.env.ANTHROPIC_API_KEY,
  openaiKey = process.env.OPENAI_API_KEY,
  provider = process.env.AI_PROVIDER,
  model = process.env.AI_MODEL,
  fetch,
  timeoutMs = 120_000,
  maxRetries = 1,
} = {}) {
  const which = provider === 'openai' || provider === 'anthropic' ? provider : has(apiKey) ? 'anthropic' : has(openaiKey) ? 'openai' : 'anthropic';
  const key = which === 'openai' ? openaiKey : apiKey;
  const configured = has(key);
  const useModel = has(model) ? model.trim() : which === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_MODEL;
  const run = !configured
    ? null
    : (which === 'openai' ? openaiComplete : anthropicComplete)({ apiKey: key.trim(), model: useModel, fetch, timeoutMs, maxRetries });

  /** One request, one answer. `messages` is an array of `{ role, content }`; `system` a string. */
  async function complete({ system, messages, maxTokens = 16000, effort } = {}) {
    if (!configured) throw new AiError('ai_not_configured');
    return run({ system, messages, maxTokens, effort });
  }

  return { configured, provider: configured ? which : null, model: configured ? useModel : null, complete };
}
