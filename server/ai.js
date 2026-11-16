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
 *   - OpenRouter, the same Chat Completions format at openrouter.ai (BRANDPILOT_OPENROUTER_API_KEY;
 *     BRANDPILOT_OPENROUTER_MODEL = one model id or several, comma-separated; owner's request 2026-11-16).
 * AI_PROVIDER=anthropic|openai|openrouter forces the starting one; otherwise it is the first whose key is set
 * (Anthropic, then OpenAI, then OpenRouter). Every configured provider / model is an option
 * (`ai.options()`), and `ai.select(id)` switches between them while the server runs (Settings → AI model).
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
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** OpenRouter's own router, used when BRANDPILOT_OPENROUTER_MODEL is empty. */
export const DEFAULT_OPENROUTER_MODEL = 'openrouter/auto';
/** Chat Completions dialects: where to send, how the output cap and the effort are named. */
const CHAT = {
  openai: { url: OPENAI_URL, name: 'OpenAI', cap: 'max_completion_tokens', effort: (e) => ({ reasoning_effort: e }), headers: {} },
  openrouter: { url: OPENROUTER_URL, name: 'OpenRouter', cap: 'max_tokens', effort: (e) => ({ reasoning: { effort: e } }), headers: { 'x-title': 'BrandPilot' } },
};
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
function chatComplete({ apiKey, model, fetch: f = globalThis.fetch, timeoutMs, maxRetries, dialect = CHAT.openai }) {
  // The provider's error text is kept for the server log only (AiError.cause), cut short.
  const httpError = async (res) => new Error(`${dialect.name} HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  async function once(body) {
    let res;
    try {
      res = await f(dialect.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, ...dialect.headers },
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
      [dialect.cap]: maxTokens,
      ...(['low', 'medium', 'high'].includes(effort) ? dialect.effort(effort) : {}),
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
    if (!c || !c.message) throw new AiError('ai_failed', new Error(`${dialect.name} reply without a choice`));
    // A decline is HTTP 200 here too: a refusal text, or the content filter.
    if (c.message.refusal || c.finish_reason === 'content_filter') throw new AiError('ai_refused');
    const text = typeof c.message.content === 'string' ? c.message.content : '';
    return { text, model: j.model ?? model, stopReason: c.finish_reason, truncated: c.finish_reason === 'length' };
  };
}

/**
 * @param {object} [o]
 * @param {string} [o.apiKey]          Anthropic key; defaults to ANTHROPIC_API_KEY
 * @param {string} [o.openaiKey]       OpenAI key; defaults to OPENAI_API_KEY
 * @param {string} [o.openrouterKey]   OpenRouter key; defaults to BRANDPILOT_OPENROUTER_API_KEY
 * @param {string} [o.openrouterModel] one OpenRouter model id or several, comma-separated; defaults to BRANDPILOT_OPENROUTER_MODEL
 * @param {string} [o.provider]        'anthropic' | 'openai' | 'openrouter'; defaults to AI_PROVIDER, then to the first key that is set
 * @param {string} [o.model]           model for the starting provider; defaults to AI_MODEL, then the provider's default
 * @param {Function} [o.fetch]         the network (tests stub it here)
 * @param {number} [o.timeoutMs]       per request
 * @param {number} [o.maxRetries]      retries on connection errors and 5xx (the Anthropic SDK also retries 408 / 409 / 429)
 */
export function createAi({
  apiKey = process.env.ANTHROPIC_API_KEY,
  openaiKey = process.env.OPENAI_API_KEY,
  openrouterKey = process.env.BRANDPILOT_OPENROUTER_API_KEY,
  openrouterModel = process.env.BRANDPILOT_OPENROUTER_MODEL,
  provider = process.env.AI_PROVIDER,
  model = process.env.AI_MODEL,
  fetch,
  timeoutMs = 120_000,
  maxRetries = 1,
} = {}) {
  const which = ['anthropic', 'openai', 'openrouter'].includes(provider)
    ? provider
    : has(apiKey) ? 'anthropic' : has(openaiKey) ? 'openai' : has(openrouterKey) ? 'openrouter' : 'anthropic';
  const envModel = has(model) ? model.trim() : null;
  const opts = [];
  const add = (p, m, key) => { if (!opts.some((o) => o.id === `${p}:${m}`)) opts.push({ id: `${p}:${m}`, provider: p, model: m, key }); };
  if (has(apiKey)) add('anthropic', (which === 'anthropic' && envModel) || DEFAULT_MODEL, apiKey.trim());
  if (has(openaiKey)) add('openai', (which === 'openai' && envModel) || DEFAULT_OPENAI_MODEL, openaiKey.trim());
  if (has(openrouterKey)) {
    const listed = String(openrouterModel ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    (listed.length ? listed : [(which === 'openrouter' && envModel) || DEFAULT_OPENROUTER_MODEL]).forEach((m) => add('openrouter', m, openrouterKey.trim()));
  }
  // A forced provider without a key is "not configured" — never a silent switch to another key.
  let cur = opts.find((o) => o.provider === which) || null;
  const runners = new Map();
  const runner = (o) => {
    if (!runners.has(o.id)) {
      const base = { apiKey: o.key, model: o.model, fetch, timeoutMs, maxRetries };
      runners.set(o.id, o.provider === 'anthropic' ? anthropicComplete(base) : chatComplete({ ...base, dialect: CHAT[o.provider] }));
    }
    return runners.get(o.id);
  };

  /** One request, one answer. `messages` is an array of `{ role, content }`; `system` a string. */
  async function complete({ system, messages, maxTokens = 16000, effort } = {}) {
    if (!cur) throw new AiError('ai_not_configured');
    return runner(cur)({ system, messages, maxTokens, effort });
  }

  return {
    get configured() { return !!cur; },
    get provider() { return cur ? cur.provider : null; },
    get model() { return cur ? cur.model : null; },
    get selected() { return cur ? cur.id : null; },
    /** Every provider / model that has a key, without the key. */
    options: () => opts.map(({ id, provider: p, model: m }) => ({ id, provider: p, model: m })),
    /** Switch to an option by id; false (and no change) when the id is not an option. */
    select(id) { const o = opts.find((x) => x.id === id); if (!o) return false; cur = o; return true; },
    complete,
  };
}
