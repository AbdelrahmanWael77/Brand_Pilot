import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createAi, AiError, DEFAULT_MODEL } from '../server/ai.js';

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

test('GET /api/ai/status: 401 signed out; { configured } only, never the key or model', async () => {
  const n = net(() => json(200, message()));
  const off = await start(createAi({ apiKey: '' }));
  const on = await start(createAi({ apiKey: KEY, fetch: n.fetch }));
  assert.equal((await fetch(`${off}/api/ai/status`)).status, 401);

  const reg = await fetch(`${off}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ai@example.com', password: 'correct horse' }) });
  const cookie = reg.headers.getSetCookie()[0].split(';')[0];
  const a = await fetch(`${off}/api/ai/status`, { headers: { cookie } });
  assert.equal(a.status, 200);
  assert.deepEqual(await a.json(), { configured: false });
  const b = await (await fetch(`${on}/api/ai/status`, { headers: { cookie } })).text(); // same DB, same session
  assert.deepEqual(JSON.parse(b), { configured: true });
  assert.doesNotMatch(b, new RegExp(KEY));
  assert.equal(n.calls.length, 0); // asking for the status never calls the provider
});
