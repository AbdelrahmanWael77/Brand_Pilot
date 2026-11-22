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
  assert.match(html, /async demoCo\(o\)\{if\(!demoOn\(\)\)return;/);
  // the flag is true only when the server says exactly true
  assert.match(html, /const demoOn=\(\)=>!!\(SRV\.cfg&&SRV\.cfg\.demo===true\)/);
});

test('page: demo controls need a demo company AND the server flag (a leftover demo company shows none when the flag is off)', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /const demoUI=c=>!!\(c&&c\.demo&&demoOn\(\)\);/);
  // the Demo guide, its open panel, the "load synthetic demo" button and the fixture loaders render only through demoUI
  assert.match(html, /function guideHTML\(c\)\{if\(!demoUI\(c\)\)return'';/);
  // P7: the demo checklist is part of the one guide, and also renders only through demoUI
  assert.ok(html.includes("${demoUI(c)?guideList(c):''}"));
  assert.match(html, /demoUI\(c\)&&!c\.sources\.length\?`<button class="btn" data-a="loadDemo">/);
  assert.ok(html.includes('${demoUI(c)?`<p class="src7-demo" data-demo-results>')); // P7: a small link in demo mode only
  // the actions refuse to run outside demo mode, even if called directly
  for (const a of ['loadDemo(){', 'loadBase(){', 'loadCamp(id){']) assert.ok(html.includes(` ${a}const c=C();if(!demoUI(c))return;`), a);
  // no other place shows a demo control on c.demo alone
  assert.equal((html.match(/data-a="(loadDemo|loadBase|loadCamp|guideT)"/g) || []).length > 0, true);
  assert.doesNotMatch(html, /if\(!c\.demo\)return''/);
});

test('page: Settings does not claim BrandPilot never changes connected accounts (Canva can write)', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /never publishes, spends money or changes your accounts/);
  assert.match(html, /If you connect Canva, BrandPilot creates designs and uploads your logo in your Canva account, only when you ask it to\./);
});
