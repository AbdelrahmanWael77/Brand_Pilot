// Demo mode (P0, 2026-11-19): the synthetic FlowNest demo company may be offered only when the server runs with
// BRANDPILOT_DEMO=1. Off by default; the page reads the flag from GET /api/config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

async function start(opts) {
  const server = createApp({ db: openDb(':memory:'), ...opts }).listen(0);
  await new Promise((r) => server.once('listening', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
async function signIn(base) {
  const r = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@example.com', password: 'correct horse' }) });
  return r.headers.getSetCookie()[0].split(';')[0];
}

test('GET /api/config: 401 signed out; demo is off by default', async () => {
  const prev = process.env.BRANDPILOT_DEMO;
  delete process.env.BRANDPILOT_DEMO;
  const { server, base } = await start({});
  try {
    assert.equal((await fetch(`${base}/api/config`)).status, 401);
    const cookie = await signIn(base);
    assert.deepEqual(await (await fetch(`${base}/api/config`, { headers: { cookie } })).json(), { demo: false });
  } finally { server.close(); if (prev !== undefined) process.env.BRANDPILOT_DEMO = prev; }
});

test('GET /api/config: demo true only when turned on', async () => {
  const { server, base } = await start({ demo: true });
  try {
    const cookie = await signIn(base);
    assert.deepEqual(await (await fetch(`${base}/api/config`, { headers: { cookie } })).json(), { demo: true });
  } finally { server.close(); }
});

test('page: the FlowNest demo action renders and runs only when the server flag is on', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  // the command-menu entry is added only behind the flag
  assert.match(html, /demoOn\(\)\?\[\{t:L\('Create FlowNest demo company \(synthetic\)'/);
  // the action itself does nothing without the flag
  assert.match(html, /async demoCo\(\)\{if\(!demoOn\(\)\)return;/);
  // the flag is true only when the server says exactly true
  assert.match(html, /const demoOn=\(\)=>!!\(SRV\.cfg&&SRV\.cfg\.demo===true\)/);
});
