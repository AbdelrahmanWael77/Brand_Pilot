import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createFetchUrl, isBlockedAddress, pinnedRequest, FetchUrlError } from '../server/fetchUrl.js';

// No test here touches the real network: DNS and transport are stubbed, or point at a local server.
const PUBLIC = '93.184.216.34';
const DNS = {
  'site.test': [PUBLIC],
  'v6.test': ['2606:2800:220:1:248:1893:25c8:1946'],
  'internal.test': ['10.0.0.5'],
  'mixed.test': [PUBLIC, '127.0.0.1'],
  'meta.test': ['169.254.169.254'],
  'empty.test': [],
};
const lookup = async (host) => {
  if (!(host in DNS)) throw new Error('ENOTFOUND');
  return DNS[host].map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};
const page = (body, headers = {}, status = 200) => ({ status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body: Readable.from([Buffer.from(body)]) });

/** Builds a fetcher whose transport answers from `routes` (url → response factory) and records every call. */
function fetcher(routes, opts = {}) {
  const calls = [];
  const request = async (url, target) => {
    calls.push({ url: url.href, address: target.address });
    const r = routes[url.href];
    if (!r) throw new Error('ECONNREFUSED');
    return r(target);
  };
  return { fetchUrl: createFetchUrl({ lookup, request, ...opts }), calls };
}
const rejects = (promise, code, status) =>
  assert.rejects(promise, (e) => e instanceof FetchUrlError && e.code === code && e.status === status, `expected ${code}`);

test('isBlockedAddress: private, loopback, link-local and reserved ranges are blocked; public ones are not', () => {
  const bad = [
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0',
    '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '192.0.2.10',
    '::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '64:ff9b::7f00:1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '::127.0.0.1',
    'not-an-ip', '', '999.1.1.1',
  ];
  for (const ip of bad) assert.equal(isBlockedAddress(ip), true, ip);
  const ok = [PUBLIC, '8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '192.167.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808'];
  for (const ip of ok) assert.equal(isBlockedAddress(ip), false, ip);
});

test('successful fetch returns final url, title and text, connecting to the checked address', async () => {
  const { fetchUrl, calls } = fetcher({ 'https://site.test/about': () => page('<html><title> Nile\n Bakery </title><h2>Services</h2><p>نخبز الخبز</p></html>') });
  const r = await fetchUrl('  https://site.test/about ');
  assert.equal(r.url, 'https://site.test/about');
  assert.equal(r.title, 'Nile Bakery');
  assert.match(r.text, /نخبز الخبز/);
  assert.deepEqual(calls, [{ url: 'https://site.test/about', address: PUBLIC }]);
  // Public IPv6 and plain text work too.
  const v6 = fetcher({ 'http://v6.test/': () => page('plain words', { 'content-type': 'text/plain' }) });
  assert.deepEqual(await v6.fetchUrl('http://v6.test'), { url: 'http://v6.test/', title: '', text: 'plain words' });
});

test('only http/https, no credentials, standard ports', async () => {
  const { fetchUrl, calls } = fetcher({});
  for (const u of ['ftp://site.test/', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://site.test', 'not a url', '', 'http://', 'https://user:pw@site.test/']) {
    await rejects(fetchUrl(u), 'invalid_url', 400);
  }
  for (const u of ['http://site.test:22/', 'http://site.test:5432/', 'https://site.test:3000/']) await rejects(fetchUrl(u), 'blocked_host', 400);
  assert.equal(calls.length, 0);
});

test('literal private and loopback addresses are blocked in every spelling, without any request', async () => {
  const { fetchUrl, calls } = fetcher({});
  const urls = [
    'http://127.0.0.1/', 'http://localhost.internal.test/', 'http://10.1.2.3/', 'http://192.168.0.1/', 'http://172.20.0.1/', 'http://169.254.169.254/latest/meta-data/',
    'http://0.0.0.0/', 'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://127.1/',
    'http://[::1]/', 'http://[fe80::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[::ffff:c0a8:1]/',
  ];
  for (const u of urls.filter((x) => !x.includes('localhost.internal'))) await rejects(fetchUrl(u), 'blocked_host', 400);
  assert.equal(calls.length, 0);
});

test('hostnames resolving to any non-public address are blocked; unknown hosts fail', async () => {
  const { fetchUrl, calls } = fetcher({});
  for (const h of ['internal.test', 'mixed.test', 'meta.test']) await rejects(fetchUrl(`http://${h}/`), 'blocked_host', 400);
  await rejects(fetchUrl('http://empty.test/'), 'fetch_failed', 502);
  await rejects(fetchUrl('http://nxdomain.test/'), 'fetch_failed', 502);
  assert.equal(calls.length, 0);
});

test('redirects are followed and every hop is re-checked', async () => {
  const redirect = (location) => () => ({ status: 302, headers: { location }, body: Readable.from([]) });
  const ok = fetcher({ 'http://site.test/': redirect('/home'), 'http://site.test/home': redirect('https://v6.test/final'), 'https://v6.test/final': () => page('<title>Final</title>') });
  assert.equal((await ok.fetchUrl('http://site.test/')).url, 'https://v6.test/final');
  assert.equal(ok.calls.length, 3);

  for (const target of ['http://127.0.0.1/admin', 'http://internal.test/', 'http://[::1]/', 'http://169.254.169.254/', 'file:///etc/passwd', 'http://site.test:6379/']) {
    const f = fetcher({ 'http://site.test/': redirect(target) });
    await assert.rejects(f.fetchUrl('http://site.test/'), (e) => e instanceof FetchUrlError && ['blocked_host', 'invalid_url'].includes(e.code), target);
    assert.deepEqual(f.calls.map((c) => c.url), ['http://site.test/'], target); // the blocked hop is never requested
  }

  const loop = fetcher({ 'http://site.test/': redirect('/') });
  await rejects(loop.fetchUrl('http://site.test/'), 'fetch_failed', 502);
  assert.equal(loop.calls.length, 4); // first request + 3 redirects, then stop
});

test('non-2xx, wrong content type and oversize bodies are refused', async () => {
  await rejects(fetcher({ 'http://site.test/': () => page('nope', {}, 404) }).fetchUrl('http://site.test/'), 'fetch_failed', 502);
  await rejects(fetcher({ 'http://site.test/': () => page('nope', {}, 500) }).fetchUrl('http://site.test/'), 'fetch_failed', 502);
  await rejects(fetcher({}).fetchUrl('http://site.test/'), 'fetch_failed', 502); // connection refused
  for (const type of ['application/pdf', 'image/png', 'application/json', 'application/octet-stream', '']) {
    await rejects(fetcher({ 'http://site.test/': () => page('x', { 'content-type': type }) }).fetchUrl('http://site.test/'), 'unsupported_type', 415);
  }
  // Declared too large, and too large without a declared length (stream is cut off).
  const opts = { maxBytes: 1000 };
  await rejects(fetcher({ 'http://site.test/': () => page('x', { 'content-length': '5000' }) }, opts).fetchUrl('http://site.test/'), 'too_large', 413);
  let produced = 0;
  const endless = () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: Readable.from((function* () { for (;;) { produced++; yield Buffer.alloc(400, 97); } })()) });
  await rejects(fetcher({ 'http://site.test/': endless }, opts).fetchUrl('http://site.test/'), 'too_large', 413);
  assert.ok(produced <= 5, `read stopped early (${produced} chunks)`);
  assert.equal((await fetcher({ 'http://site.test/': () => page('a'.repeat(1000)) }, opts).fetchUrl('http://site.test/')).text.length, 1000);
});

test('slow responses time out (headers never arrive, or the body stalls)', async () => {
  const never = () => new Promise(() => {});
  await rejects(fetcher({ 'http://site.test/': never }, { timeoutMs: 40 }).fetchUrl('http://site.test/'), 'timeout', 504);
  const stalled = () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: new Readable({ read() {} }) });
  await rejects(fetcher({ 'http://site.test/': stalled }, { timeoutMs: 40 }).fetchUrl('http://site.test/'), 'timeout', 504);
  const slowDns = createFetchUrl({ lookup: never, request: never, timeoutMs: 40 });
  await rejects(slowDns('http://site.test/'), 'timeout', 504);
});

test('default transport connects to the pinned address, not to whatever the name resolves to', async () => {
  const srv = http.createServer((req, res) => res.setHeader('content-type', 'text/html').end(`host=${req.headers.host}`)).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  try {
    // "pinned.invalid" does not exist in DNS; the request can only succeed if the given address is used.
    const url = new URL(`http://pinned.invalid:${srv.address().port}/x`);
    const res = await pinnedRequest(url, { address: '127.0.0.1', family: 4, signal: new AbortController().signal });
    let body = '';
    for await (const c of res.body) body += c;
    assert.equal(res.status, 200);
    assert.equal(body, `host=pinned.invalid:${srv.address().port}`);
  } finally {
    srv.close();
  }
});

// ---- HTTP route ----
let server, base, db, alice, bob, companyId, routeCalls;
before(async () => {
  db = openDb(':memory:');
  const f = fetcher({ 'https://site.test/': () => page('<title>Home</title><p>Hello</p>') });
  routeCalls = f.calls;
  server = createApp({ db, fetchUrl: f.fetchUrl, fetchLimit: { max: 6, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  companyId = (await (await call('POST', '/api/companies', alice, { name: 'Nile Bakery' })).json()).company.id;
});
after(() => {
  server.close();
  db.close();
});
const call = (method, path, cookie, body) =>
  fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}
const fetchPath = () => `/api/companies/${companyId}/fetch-url`;

test('route: members only; input validated; errors mapped; per-user rate limit', async () => {
  assert.equal((await call('POST', fetchPath(), null, { url: 'https://site.test/' })).status, 401);
  assert.equal((await call('POST', fetchPath(), bob, { url: 'https://site.test/' })).status, 404);
  assert.equal(routeCalls.length, 0);

  for (const body of [{}, { url: 5 }, { url: '' }, { url: 'https://site.test/' + 'a'.repeat(2000) }]) {
    const r = await call('POST', fetchPath(), alice, body);
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: 'invalid_url' });
  }

  const ok = await call('POST', fetchPath(), alice, { url: 'https://site.test/' }); // 1
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { url: 'https://site.test/', title: 'Home', text: '<title>Home</title><p>Hello</p>' });

  const cases = [['http://127.0.0.1/', 400, 'blocked_host'], ['http://internal.test/', 400, 'blocked_host'], ['ftp://site.test/', 400, 'invalid_url'], ['https://site.test/missing', 502, 'fetch_failed']];
  for (const [url, status, error] of cases) { // 2–5
    const r = await call('POST', fetchPath(), alice, { url });
    assert.equal(r.status, status, url);
    assert.deepEqual(await r.json(), { error }, url);
  }

  assert.equal((await call('POST', fetchPath(), alice, { url: 'https://site.test/' })).status, 200); // 6
  const limited = await call('POST', fetchPath(), alice, { url: 'https://site.test/' });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: 'too_many_attempts' });
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
});
