/**
 * Server-side reader for a company's public website page.
 *
 * The server makes this request on behalf of a signed-in user, so it must never
 * be usable to reach the server's own network (SSRF). Rules, applied to the first
 * URL and to every redirect hop:
 *   - http/https only, standard web ports only, no credentials in the URL;
 *   - the host must resolve ONLY to public addresses (any private, loopback,
 *     link-local, CGNAT, multicast or reserved address blocks the request);
 *   - the connection is pinned to the address that was checked, so a second DNS
 *     answer cannot redirect it elsewhere (no DNS-rebinding window);
 *   - text/html or text/plain only, at most `maxBytes`, `timeoutMs` in total.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export class FetchUrlError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const fail = (code, status) => new FetchUrlError(code, status);

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const TEXT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];

const blocked = new net.BlockList();
for (const [addr, bits] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]) blocked.addSubnet(addr, bits, 'ipv4');
for (const [addr, bits] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 (embeds an IPv4 address)
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
]) blocked.addSubnet(addr, bits, 'ipv6');

/** True when `ip` is not a public unicast address. Unparseable input counts as blocked. */
export function isBlockedAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family !== 6) return true;
  // IPv4-mapped (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) and IPv4-compatible (::a.b.c.d): judge the embedded IPv4.
  const m = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip) || /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (m) {
    const v4 = m[2] === undefined ? m[1] : [m[1], m[2]].map((h) => parseInt(h, 16)).flatMap((n) => [n >> 8, n & 255]).join('.');
    return net.isIP(v4) !== 4 || blocked.check(v4, 'ipv4');
  }
  return blocked.check(ip, 'ipv6');
}

/** Default transport: one GET, connection pinned to `address` (already checked by the caller). */
export function pinnedRequest(url, { address, family, signal }) {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(
      url,
      {
        method: 'GET',
        agent: false,
        signal,
        headers: { 'user-agent': 'BrandPilot-website-reader/0.1', accept: 'text/html,text/plain;q=0.9', 'accept-encoding': 'identity' },
        // Never resolve the name again: connect to the address that passed the check.
        lookup: (_host, opts, cb) => (opts && opts.all ? cb(null, [{ address, family }]) : cb(null, address, family)),
      },
      (res) => resolve({ status: res.statusCode, headers: res.headers, body: res }),
    );
    req.on('error', reject);
    req.end();
  });
}

/** Reject as soon as the signal aborts, even if `promise` never settles. */
const withAbort = (promise, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    promise.then(resolve, reject);
  });

const defaultLookup =(host) => dns.promises.lookup(host, { all: true, verbatim: true });

/**
 * @param {object} [o]
 * @param {(host: string) => Promise<{address: string, family: number}[]>} [o.lookup] injectable resolver
 * @param {typeof pinnedRequest} [o.request] injectable transport
 */
export function createFetchUrl({ lookup = defaultLookup, request = pinnedRequest, timeoutMs = 10_000, maxBytes = 1024 * 1024, maxRedirects = 3 } = {}) {
  /** Validate one URL and return the address to connect to. */
  async function check(url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw fail('invalid_url', 400);
    if (url.username || url.password || !url.hostname) throw fail('invalid_url', 400);
    if (!ALLOWED_PORTS.has(url.port)) throw fail('blocked_host', 400);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const literal = net.isIP(host);
    if (literal) {
      if (isBlockedAddress(host)) throw fail('blocked_host', 400);
      return { address: host, family: literal };
    }
    let addrs;
    try {
      addrs = await lookup(host);
    } catch {
      throw fail('fetch_failed', 502);
    }
    if (!Array.isArray(addrs) || !addrs.length) throw fail('fetch_failed', 502);
    if (addrs.some((a) => isBlockedAddress(a.address))) throw fail('blocked_host', 400);
    return { address: addrs[0].address, family: net.isIP(addrs[0].address) };
  }

  async function read(body, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.length;
      if (size > limit) throw fail('too_large', 413);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  return async function fetchUrl(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl).trim());
    } catch {
      throw fail('invalid_url', 400);
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res = null;
    try {
      for (let hop = 0; ; hop++) {
        const target = await withAbort(check(url), ac.signal);
        res = await withAbort(request(url, { ...target, signal: ac.signal }), ac.signal);
        const status = res.status;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.body?.destroy?.();
          if (hop >= maxRedirects) throw fail('fetch_failed', 502);
          try {
            url = new URL(String(res.headers.location), url);
          } catch {
            throw fail('fetch_failed', 502);
          }
          continue;
        }
        if (status < 200 || status >= 300) throw fail('fetch_failed', 502);
        const type = String(res.headers['content-type'] || '').toLowerCase();
        if (!TEXT_TYPES.some((t) => type.startsWith(t))) throw fail('unsupported_type', 415);
        if (Number(res.headers['content-length']) > maxBytes) throw fail('too_large', 413);
        const buf = await withAbort(read(res.body, maxBytes), ac.signal);
        let text;
        try {
          text = new TextDecoder(/charset=["']?([\w-]+)/.exec(type)?.[1] || 'utf-8').decode(buf);
        } catch {
          text = new TextDecoder('utf-8').decode(buf);
        }
        const title = /<title[^>]*>([^<]{1,300})/i.exec(text)?.[1].replace(/\s+/g, ' ').trim() || '';
        return { url: url.href, title, text };
      }
    } catch (e) {
      res?.body?.destroy?.();
      if (e instanceof FetchUrlError) throw e;
      throw ac.signal.aborted ? fail('timeout', 504) : fail('fetch_failed', 502);
    } finally {
      clearTimeout(timer);
    }
  };
}
