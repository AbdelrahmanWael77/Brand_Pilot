// Builds test/fixtures/pre-p4.db with the code BEFORE P4 (run once, on commit 6dce193): a user, the FlowNest company saved
// through the normal routes (its facts approved in the browser state, as every company before P4), and a saved report.
// P4's migration test opens a copy of it with the new code.
import fs from 'node:fs';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

const out = new URL('../test/fixtures/pre-p4.db', import.meta.url);
const file = out.pathname.replace(/^\/([A-Za-z]:)/, '$1');
for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
const state = JSON.parse(fs.readFileSync(new URL('../test/fixtures/flownest/state.json', import.meta.url), 'utf8'));
// plus one campaign saved before P4 (no fact ids yet)
state.campaigns = [{ id: 'k-legacy', name: 'Legacy campaign', slug: 'legacy-campaign', rec: 'ch-best', approved: true, at: Date.UTC(2026, 10, 1), brief: { ctaEn: 'Start a free trial' }, channels: ['facebook'], assets: [{ id: 'a1', type: 'post', lang: 'en', channel: 'facebook', n: 1, status: 'approved', fields: { headline: { v: 'Start a free trial' } } }] }];
const db = openDb(file);
const server = createApp({ db }).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const reg = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', password: 'correct horse battery' }) });
const h = { 'content-type': 'application/json', cookie: reg.headers.getSetCookie()[0].split(';')[0] };
const co = (await (await fetch(`${base}/api/companies`, { method: 'POST', headers: h, body: JSON.stringify({ name: 'FlowNest' }) })).json()).company;
const put = await fetch(`${base}/api/companies/${co.id}/state`, { method: 'PUT', headers: h, body: JSON.stringify({ state }) });
if (put.status !== 200) throw new Error('state ' + put.status);
const rep = await fetch(`${base}/api/companies/${co.id}/reports`, { method: 'POST', headers: h, body: JSON.stringify({ range: '28', lang: 'en' }) });
if (rep.status !== 201) throw new Error('report ' + rep.status);
server.close();
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
for (const f of [file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
console.log('written', file, fs.statSync(file).size, 'bytes; company', co.id);
