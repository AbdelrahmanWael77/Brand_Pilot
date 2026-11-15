import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createAi, AiError, DEFAULT_MODEL, DEFAULT_OPENAI_MODEL, OPENAI_URL } from '../server/ai.js';

const KEY = 'test-key-never-real';
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const message = (over = {}) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'Hello ' }, { type: 'text', text: 'there' }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 }, ...over,
});
/** A fetch stub that records every request and answers with `reply(n)`. */
function net(reply) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : null });
    return reply(calls.length, init);
  };
  return { fetch, calls };
}
const ask = { system: 'You are a marketing director.', messages: [{ role: 'user', content: 'Hi' }] };
const fails = async (p, code) => {
  await assert.rejects(p, (e) => {
    assert.ok(e instanceof AiError, String(e));
    assert.equal(e.code, code);
    assert.doesNotMatch(e.message, new RegExp(KEY));
    return true;
  });
};

test('not configured: no key → configured false, complete() throws ai_not_configured and sends nothing', async () => {
  const n = net(() => json(200, message()));
  for (const apiKey of ['', '   ', null]) {
    const ai = createAi({ apiKey, fetch: n.fetch });
    assert.equal(ai.configured, false);
    assert.equal(ai.model, null);
    await fails(ai.complete(ask), 'ai_not_configured');
  }
  assert.equal(n.calls.length, 0);
});

test('request shape: Messages API through the SDK, key only in the auth header', async () => {
  const n = net(() => json(200, message()));
  const ai = createAi({ apiKey: KEY, model: 'claude-opus-5-5', fetch: n.fetch });
  assert.equal(ai.configured, true);
  const r = await ai.complete({ ...ask, maxTokens: 1000, effort: 'low' });
  assert.deepEqual(r, { text: 'Hello there', model: 'claude-opus-5-5', stopReason: 'end_turn', truncated: false });

  assert.equal(n.calls.length, 1);
  const c = n.calls[0];
  assert.equal(c.method.toUpperCase(), 'POST');
  assert.match(c.url, /^https:\/\/api\.anthropic\.com\/v1\/messages(\?|$)/);
  // The SDK decides which auth header carries the key (SDK 1.x: `authorization: Bearer`); it must be exactly one of them.
  const auth = [c.headers.get('x-api-key'), c.headers.get('authorization')].filter(Boolean);
  assert.equal(auth.length, 1);
  assert.ok(auth[0].endsWith(KEY));
  assert.ok(c.headers.get('anthropic-version'));
  assert.match(c.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(c.body.model, 'claude-opus-5-5');
  assert.equal(c.body.max_tokens, 1000);
  assert.equal(c.body.system, ask.system);
  assert.deepEqual(c.body.messages, ask.messages);
  assert.deepEqual(c.body.output_config, { effort: 'low' });
  assert.equal(c.body.fallbacks, 'default');
  // Removed parameters on current models must not be sent.
  for (const k of ['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice']) assert.equal(k in c.body, false, k);
  assert.doesNotMatch(JSON.stringify(c.body), new RegExp(KEY));
});

test('defaults: model from DEFAULT_MODEL, no effort unless asked', async () => {
  const n = net(() => json(200, message()));
  await createAi({ apiKey: KEY, model: undefined, fetch: n.fetch }).complete(ask);
  assert.equal(n.calls[0].body.model, process.env.AI_MODEL || DEFAULT_MODEL);
  assert.equal(n.calls[0].body.max_tokens, 16000);
  assert.equal('output_config' in n.calls[0].body, false);
});

test('max_tokens stop is reported as truncated; refusal is an error, not an answer', async () => {
  let n = net(() => json(200, message({ stop_reason: 'max_tokens' })));
  assert.equal((await createAi({ apiKey: KEY, fetch: n.fetch }).complete(ask)).truncated, true);
  n = net(() => json(200, message({ stop_reason: 'refusal', content: [], stop_details: { type: 'refusal', category: null, explanation: 'x' } })));
  await fails(createAi({ apiKey: KEY, fetch: n.fetch }).complete(ask), 'ai_refused');
});

test('errors map to codes and never carry the key or the provider body', async () => {
  const err = (type, m) => ({ type: 'error', error: { type, message: `${m} SECRET-PROVIDER-DETAIL` } });
  const cases = [
    [429, err('rate_limit_error', 'slow down'), 'ai_rate_limited'],
    [401, err('authentication_error', 'bad key'), 'ai_auth_failed'],
    [403, err('permission_error', 'no'), 'ai_auth_failed'],
    [400, err('invalid_request_error', 'bad'), 'ai_failed'],
    [500, err('api_error', 'boom'), 'ai_failed'],
    [529, err('overloaded_error', 'busy'), 'ai_failed'],
  ];
  for (const [status, body, code] of cases) {
    const n = net(() => json(status, body));
    const ai = createAi({ apiKey: KEY, fetch: n.fetch, maxRetries: 0 });
    await assert.rejects(ai.complete(ask), (e) => {
      assert.equal(e.code, code, String(status));
      assert.doesNotMatch(e.message, /SECRET-PROVIDER-DETAIL/);
      assert.ok(e.status >= 400);
      return true;
    });
    assert.equal(n.calls.length, 1);
  }
});

test('timeout → ai_timeout; network failure → ai_failed', async () => {
  const hang = (_n, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await fails(createAi({ apiKey: KEY, fetch: net(hang).fetch, timeoutMs: 40, maxRetries: 0 }).complete(ask), 'ai_timeout');
  const down = net(() => { throw new TypeError('fetch failed'); });
  await fails(createAi({ apiKey: KEY, fetch: down.fetch, maxRetries: 0 }).complete(ask), 'ai_failed');
});

test('retries once on a 5xx by default, then succeeds', async () => {
  const n = net((i) => (i === 1 ? json(500, { type: 'error', error: { type: 'api_error', message: 'x' } }) : json(200, message())));
  const r = await createAi({ apiKey: KEY, fetch: n.fetch }).complete(ask);
  assert.equal(r.text, 'Hello there');
  assert.equal(n.calls.length, 2);
});

// ---- HTTP route ----
let db;
const servers = [];
async function start(ai) {
  const server = createApp({ db, ai }).listen(0);
  await new Promise((r) => server.once('listening', r));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
before(() => {
  db = openDb(':memory:');
});
after(() => {
  servers.forEach((s) => s.close());
  db.close();
});

test('GET /api/ai/status: 401 signed out; { configured, images } only, never the key or model', async () => {
  const n = net(() => json(200, message()));
  const off = await start(createAi({ apiKey: '' }));
  const on = await start(createAi({ apiKey: KEY, fetch: n.fetch }));
  assert.equal((await fetch(`${off}/api/ai/status`)).status, 401);

  const reg = await fetch(`${off}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ai@example.com', password: 'correct horse' }) });
  const cookie = reg.headers.getSetCookie()[0].split(';')[0];
  const a = await fetch(`${off}/api/ai/status`, { headers: { cookie } });
  assert.equal(a.status, 200);
  assert.deepEqual(await a.json(), { configured: false, images: false });
  const b = await (await fetch(`${on}/api/ai/status`, { headers: { cookie } })).text(); // same DB, same session
  assert.deepEqual(JSON.parse(b), { configured: true, images: false });
  assert.doesNotMatch(b, new RegExp(KEY));
  assert.equal(n.calls.length, 0); // asking for the status never calls the provider
});

// ---------------------------------------------------------------------------------------------
// OpenAI provider (owner's choice 2026-11-14): same contract, Chat Completions over fetch.
// ---------------------------------------------------------------------------------------------
const OKEY = 'openai-test-key-never-real';
const completion = (over = {}, msg = {}) => ({
  id: 'chatcmpl_1', object: 'chat.completion', model: 'gpt-6-astra-2026-09-01',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hello there', refusal: null, ...msg }, finish_reason: 'stop', ...over }],
  usage: { prompt_tokens: 5, completion_tokens: 2 },
});
const openai = (reply, over = {}) => {
  const n = net(reply);
  return { n, ai: createAi({ apiKey: '', openaiKey: OKEY, fetch: n.fetch, ...over }) };
};
const oFails = async (p, code) => {
  await assert.rejects(p, (e) => {
    assert.ok(e instanceof AiError, String(e));
    assert.equal(e.code, code);
    assert.doesNotMatch(e.message, new RegExp(OKEY));
    return true;
  });
};

test('provider choice: the key that is set decides; Anthropic first when both are; an explicit provider wins', () => {
  assert.equal(createAi({ apiKey: '', openaiKey: '' }).provider, null);
  assert.equal(createAi({ apiKey: '', openaiKey: '' }).configured, false);
  const o = createAi({ apiKey: '', openaiKey: OKEY });
  assert.deepEqual([o.configured, o.provider, o.model], [true, 'openai', DEFAULT_OPENAI_MODEL]);
  const a = createAi({ apiKey: KEY, openaiKey: OKEY });
  assert.deepEqual([a.provider, a.model], ['anthropic', DEFAULT_MODEL]);
  assert.equal(createAi({ apiKey: KEY, openaiKey: OKEY, provider: 'openai' }).provider, 'openai');
  // forcing a provider whose key is missing is "not configured", never a silent switch to the other key
  assert.equal(createAi({ apiKey: KEY, openaiKey: '', provider: 'openai' }).configured, false);
  assert.equal(createAi({ apiKey: '', openaiKey: OKEY, provider: 'anthropic' }).configured, false);
  assert.equal(createAi({ apiKey: '', openaiKey: OKEY, model: ' my-model ' }).model, 'my-model');
  assert.equal(createAi({ apiKey: '', openaiKey: OKEY, provider: 'nonsense' }).provider, 'openai');
});

test('OpenAI request shape: Chat Completions, key only in the Authorization header, system prompt first', async () => {
  const n = net(() => json(200, completion()));
  const ai = createAi({ apiKey: '', openaiKey: ` ${OKEY} `, fetch: n.fetch });
  const r = await ai.complete({ ...ask, maxTokens: 900, effort: 'high' });
  assert.deepEqual(r, { text: 'Hello there', model: 'gpt-6-astra-2026-09-01', stopReason: 'stop', truncated: false });
  assert.equal(n.calls.length, 1);
  const c = n.calls[0];
  assert.equal(c.url, OPENAI_URL);
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.get('authorization'), `Bearer ${OKEY}`);
  assert.equal(c.headers.get('x-api-key'), null);
  assert.deepEqual(c.body, {
    model: DEFAULT_OPENAI_MODEL,
    messages: [{ role: 'system', content: ask.system }, { role: 'user', content: 'Hi' }],
    max_completion_tokens: 900,
    reasoning_effort: 'high',
  });
  assert.doesNotMatch(JSON.stringify(c.body), new RegExp(OKEY));
});

test('OpenAI defaults: 16000 tokens, effort only when both providers know the value, no system message when none is given', async () => {
  const { n, ai } = openai(() => json(200, completion()), { model: 'gpt-x' });
  await ai.complete({ messages: ask.messages });
  assert.deepEqual(n.calls[0].body, { model: 'gpt-x', messages: [{ role: 'user', content: 'Hi' }], max_completion_tokens: 16000 });
  await ai.complete({ ...ask, effort: 'max' });
  assert.equal('reasoning_effort' in n.calls[1].body, false);
});

test('OpenAI: a length stop is truncated; a refusal or the content filter is an error; a reply without a choice is ai_failed', async () => {
  assert.deepEqual(await openai(() => json(200, completion({ finish_reason: 'length' }))).ai.complete(ask), { text: 'Hello there', model: 'gpt-6-astra-2026-09-01', stopReason: 'length', truncated: true });
  await oFails(openai(() => json(200, completion({}, { content: null, refusal: 'I cannot help with that.' }))).ai.complete(ask), 'ai_refused');
  await oFails(openai(() => json(200, completion({ finish_reason: 'content_filter' }))).ai.complete(ask), 'ai_refused');
  await oFails(openai(() => json(200, { choices: [] })).ai.complete(ask), 'ai_failed');
  await oFails(openai(() => new Response('not json', { status: 200 })).ai.complete(ask), 'ai_failed');
  assert.equal((await openai(() => json(200, completion({}, { content: null }))).ai.complete(ask)).text, '');
});

test('OpenAI errors map to codes; the provider text stays on cause; an account without credit is not "rate limited"', async () => {
  const err = (status, code) => json(status, { error: { message: 'SECRET provider text', type: 'x', code } });
  const cases = [[401, 'invalid_api_key', 'ai_auth_failed'], [403, 'x', 'ai_auth_failed'], [429, 'rate_limit_exceeded', 'ai_rate_limited'], [429, 'insufficient_quota', 'ai_failed'], [400, 'model_not_found', 'ai_failed'], [404, 'model_not_found', 'ai_failed']];
  for (const [status, code, want] of cases) {
    const { n, ai } = openai(() => err(status, code));
    await assert.rejects(ai.complete(ask), (e) => {
      assert.equal(e.code, want, `${status} ${code}`);
      assert.doesNotMatch(e.message, /SECRET/);
      assert.match(e.cause.message, /SECRET provider text/); // for the server log only
      assert.doesNotMatch(e.cause.message, new RegExp(OKEY));
      return true;
    });
    assert.equal(n.calls.length, 1, `no retry on ${status}`);
  }
});

test('OpenAI: one retry on a 5xx or a connection failure, then success; no retry on a timeout', async () => {
  const a = openai((i) => (i === 1 ? json(503, { error: { message: 'overloaded' } }) : json(200, completion())));
  assert.equal((await a.ai.complete(ask)).text, 'Hello there');
  assert.equal(a.n.calls.length, 2);
  const b = openai((i) => { if (i === 1) throw new TypeError('fetch failed'); return json(200, completion()); });
  assert.equal((await b.ai.complete(ask)).text, 'Hello there');
  const c = openai(() => json(500, { error: { message: 'x' } }), { maxRetries: 0 });
  await oFails(c.ai.complete(ask), 'ai_failed');
  assert.equal(c.n.calls.length, 1);
  const d = openai((_, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))), { timeoutMs: 30 });
  await oFails(d.ai.complete(ask), 'ai_timeout');
  assert.equal(d.n.calls.length, 1);
});

test('OpenAI through the app: status says configured, and the Director route answers from its reply', async () => {
  const n = net(() => json(200, completion({}, { content: JSON.stringify({ answer: 'Use approved facts.', support: [], insufficient: false }) })));
  const at = await start(createAi({ apiKey: '', openaiKey: OKEY, fetch: n.fetch }));
  const post = (path, cookie, body, method = 'POST') => fetch(at + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const reg = await post('/api/auth/register', null, { email: 'gpt@example.com', password: 'correct horse' });
  const cookie = reg.headers.getSetCookie()[0].split(';')[0];
  assert.deepEqual(await (await fetch(`${at}/api/ai/status`, { headers: { cookie } })).json(), { configured: true, images: false });
  const co = (await (await post('/api/companies', cookie, { name: 'GPT Co' })).json()).company.id;
  const state = {
    sources: [{ id: 's1', title: 'a.txt', kind: 'document', text: 'x', date: '2026-11-14', demo: false }],
    findings: [{ id: 'f1', cat: 'product', text: 'Fresh bread daily', type: 'fact', status: 'approved', src: 's1', ev: 'Quote', needs: false, date: '2026-11-14' }],
    data: {}, imports: [],
  };
  assert.equal((await post(`/api/companies/${co}/state`, cookie, { state }, 'PUT')).status, 200);
  const r = await post(`/api/companies/${co}/director/ask`, cookie, { question: 'What should we post?' });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.answer, 'Use approved facts.');
  assert.equal(b.model, 'gpt-6-astra-2026-09-01');
  assert.equal(n.calls.length, 1);
  assert.equal(n.calls[0].url, OPENAI_URL);
  assert.match(n.calls[0].body.messages[0].content, /AI Marketing Director/);
  assert.match(n.calls[0].body.messages[1].content, /Fresh bread daily/);
});
