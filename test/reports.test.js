import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createReports, REPORTS_MAX, addInterval } from '../server/reports.js';

let server, base, db, alice, bob, companyId, otherId;
before(async () => {
  db = openDb(':memory:');
  server = createApp({ db, reportLimit: { max: 5, windowMs: 60_000 } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  companyId = (await (await call('POST', '/api/companies', alice, { name: 'Nile Bakery' })).json()).company.id;
  otherId = (await (await call('POST', '/api/companies', bob, { name: 'Bob Co' })).json()).company.id;
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
const ga4 = (sessions) => ({ sources: [], findings: [], imports: [], data: { ga4: [{ date: '2026-11-01', channel: 'Search', device: 'desktop', sessions, enquiries: 10 }] } });
const put = (id, state, cookie = alice) => call('PUT', `/api/companies/${id}/state`, cookie, { state });
const sessionsOf = (report) => report.kpis.find((k) => k.id === 'sessions').value;

test('a saved report is a snapshot: it keeps its numbers when the data changes later', async () => {
  await put(companyId, ga4(500));
  const res = await call('POST', `/api/companies/${companyId}/reports`, alice, { range: 'all', lang: 'ar' });
  assert.equal(res.status, 201);
  const { report: saved } = await res.json();
  assert.match(saved.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual({ ...saved, id: 0, createdAt: 0 }, { id: 0, range: 'all', lang: 'ar', auto: false, createdAt: 0, period: { from: '2026-11-01', to: '2026-11-01', days: 1 }, synthetic: false });

  await put(companyId, ga4(9000)); // the company's data changes after the save

  const list = (await (await call('GET', `/api/companies/${companyId}/reports`, alice)).json()).reports;
  assert.deepEqual(list, [saved]);
  assert.equal('report' in list[0], false); // the list carries no bodies

  const one = await (await call('GET', `/api/companies/${companyId}/reports/${saved.id}`, alice)).json();
  assert.equal(sessionsOf(one.report), 500);
  assert.equal(one.report.generatedAt, saved.createdAt);
  const live = await (await call('GET', `/api/companies/${companyId}/report?range=all`, alice)).json();
  assert.equal(sessionsOf(live), 9000);

  // Rendered from the stored snapshot, in the language it was saved in.
  const md = await call('GET', `/api/companies/${companyId}/reports/${saved.id}?format=md`, alice);
  assert.match(md.headers.get('content-type'), /^text\/markdown/);
  assert.match(await md.text(), /\| جلسات الموقع \| 500 \|/);
  const html = await call('GET', `/api/companies/${companyId}/reports/${saved.id}?format=html`, alice);
  assert.match(html.headers.get('content-security-policy'), /default-src 'none'/);
  const page = await html.text();
  assert.match(page, /<html lang="ar" dir="rtl">/);
  assert.match(page, /<span class="ltr">500<\/span>/);
});

test('validation, defaults and the per-user rate limit', async () => {
  const post = (body) => call('POST', `/api/companies/${companyId}/reports`, alice, body);
  assert.equal((await post({ range: '5' })).status, 400);
  assert.equal((await post({ lang: 'fr' })).status, 400);
  assert.equal((await call('GET', `/api/companies/${companyId}/reports/nope?format=pdf`, alice)).status, 400);
  const d = await (await post({})).json(); // 2nd accepted save for alice
  assert.equal(d.report.range, '28');
  assert.equal(d.report.lang, 'en');
  for (let i = 0; i < 3; i++) assert.equal((await post({})).status, 201); // 3rd–5th
  const limited = await post({});
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  // Newest first.
  const list = (await (await call('GET', `/api/companies/${companyId}/reports`, alice)).json()).reports;
  assert.equal(list.length, 5);
  assert.ok(list[0].createdAt >= list[4].createdAt);
});

test('isolation: another user gets 404 on every route; an id from another company is not found', async () => {
  const mine = (await (await call('GET', `/api/companies/${companyId}/reports`, alice)).json()).reports[0];
  assert.equal((await call('POST', `/api/companies/${companyId}/reports`, bob, {})).status, 404);
  assert.equal((await call('GET', `/api/companies/${companyId}/reports`, bob)).status, 404);
  assert.equal((await call('GET', `/api/companies/${companyId}/reports/${mine.id}`, bob)).status, 404);
  // Bob asks for Alice's report id under his own company.
  const r = await call('GET', `/api/companies/${otherId}/reports/${mine.id}`, bob);
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: 'not_found' });
  assert.deepEqual((await (await call('GET', `/api/companies/${otherId}/reports`, bob)).json()).reports, []);
  assert.equal((await call('GET', `/api/companies/${companyId}/reports`)).status, 401);
});

test('store: keeps the newest REPORTS_MAX per company, automatic flag, unknown company, cascade on delete', async () => {
  const reports = createReports(db);
  assert.equal(reports.save('no-such-company'), null);
  assert.throws(() => reports.save(otherId, { range: 'x' }), TypeError);

  const t0 = Date.UTC(2026, 0, 1);
  let first;
  for (let i = 0; i < REPORTS_MAX + 3; i++) {
    const r = reports.save(otherId, { range: '7', auto: i % 2 === 0, now: new Date(t0 + i * 60_000) });
    if (i === 0) first = r;
  }
  const list = reports.list(otherId);
  assert.equal(list.length, REPORTS_MAX);
  assert.equal(list[0].createdAt, new Date(t0 + (REPORTS_MAX + 2) * 60_000).toISOString()); // newest first
  assert.equal(list[0].auto, true);
  assert.equal(reports.get(otherId, first.id), null); // the oldest were dropped
  assert.equal(reports.list(companyId).length, 5); // another company's history is untouched

  assert.equal((await call('DELETE', `/api/companies/${otherId}`, bob)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reports WHERE company_id = ?').get(otherId).n, 0);
});

// ---- automatic reports (injected clock; nothing here waits) ----
const at = (s) => new Date(s);

test('addInterval: a week is 7 days; a month keeps the day, or the last day of a shorter month', () => {
  assert.equal(addInterval(at('2026-11-12T09:00:00Z'), 'weekly').toISOString(), '2026-11-19T09:00:00.000Z');
  assert.equal(addInterval(at('2026-11-12T09:00:00Z'), 'monthly').toISOString(), '2026-12-12T09:00:00.000Z');
  assert.equal(addInterval(at('2026-12-31T09:00:00Z'), 'monthly').toISOString(), '2027-01-31T09:00:00.000Z');
  assert.equal(addInterval(at('2027-01-31T09:00:00Z'), 'monthly').toISOString(), '2027-02-28T09:00:00.000Z');
});

test('schedule: nothing before the due time, one automatic snapshot when due, one after a long gap, off stops it', async () => {
  const reports = createReports(db);
  const co = (await (await call('POST', '/api/companies', alice, { name: 'Scheduled Co' })).json()).company.id;
  await put(co, ga4(700));
  assert.equal(reports.getSchedule(co), null);

  const s = reports.setSchedule(co, { every: 'weekly', lang: 'ar' }, at('2026-11-01T10:00:00Z'));
  assert.deepEqual(s, { every: 'weekly', range: '7', lang: 'ar', nextDue: '2026-11-08T10:00:00.000Z' });

  assert.equal(reports.runDue(at('2026-11-08T09:59:59Z')), 0); // not yet
  assert.equal(reports.list(co).length, 0);

  assert.equal(reports.runDue(at('2026-11-08T10:00:00Z')), 1); // due
  let list = reports.list(co);
  assert.equal(list.length, 1);
  assert.deepEqual({ auto: list[0].auto, range: list[0].range, lang: list[0].lang, createdAt: list[0].createdAt }, { auto: true, range: '7', lang: 'ar', createdAt: '2026-11-08T10:00:00.000Z' });
  assert.equal(reports.getSchedule(co).nextDue, '2026-11-15T10:00:00.000Z');
  assert.equal(reports.runDue(at('2026-11-08T11:00:00Z')), 0); // the hourly check does not repeat it

  // The server was off for five weeks: one report, and the next due date is in the future.
  assert.equal(reports.runDue(at('2026-12-20T12:00:00Z')), 1);
  assert.equal(reports.list(co).length, 2);
  assert.equal(reports.getSchedule(co).nextDue, '2026-12-27T10:00:00.000Z');

  // Changing only the language keeps the due date; changing the interval restarts it.
  assert.equal(reports.setSchedule(co, { every: 'weekly', lang: 'en' }, at('2026-12-21T00:00:00Z')).nextDue, '2026-12-27T10:00:00.000Z');
  assert.deepEqual(reports.setSchedule(co, { every: 'monthly', lang: 'en' }, at('2026-12-21T00:00:00Z')), { every: 'monthly', range: '28', lang: 'en', nextDue: '2027-01-21T00:00:00.000Z' });

  assert.equal(reports.setSchedule(co, { every: 'off' }), null);
  assert.equal(reports.runDue(at('2030-01-01T00:00:00Z')), 0);
  assert.equal(reports.list(co).length, 2);
  assert.throws(() => reports.setSchedule(co, { every: 'daily' }), TypeError);
});

test('schedule: one failing company does not stop the others; deleting a company removes its schedule', async () => {
  const reports = createReports(db);
  const a = (await (await call('POST', '/api/companies', alice, { name: 'A' })).json()).company.id;
  const b = (await (await call('POST', '/api/companies', alice, { name: 'B' })).json()).company.id;
  reports.setSchedule(a, { every: 'weekly' }, at('2026-01-01T00:00:00Z'));
  reports.setSchedule(b, { every: 'weekly' }, at('2026-01-01T00:00:01Z'));
  // Corrupt A's schedule so its save throws (an unknown period).
  db.prepare("UPDATE report_schedules SET range = 'bogus' WHERE company_id = ?").run(a);
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(reports.runDue(at('2026-01-09T00:00:00Z')), 1);
  } finally {
    console.error = err;
  }
  assert.equal(reports.list(a).length, 0);
  assert.equal(reports.list(b).length, 1);

  assert.equal((await call('DELETE', `/api/companies/${b}`, alice)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM report_schedules WHERE company_id = ?').get(b).n, 0);
});

test('schedule routes: read, set, turn off; validation; isolation; a report id is still readable', async () => {
  const sched = (method, body, cookie = alice, id = companyId) => call(method, `/api/companies/${id}/reports/schedule`, cookie, body);
  assert.deepEqual(await (await sched('GET')).json(), { schedule: null });
  assert.equal((await sched('PUT', { every: 'daily' })).status, 400);
  assert.equal((await sched('PUT', { every: 'weekly', lang: 'fr' })).status, 400);
  const set = await (await sched('PUT', { every: 'monthly', lang: 'ar' })).json();
  assert.equal(set.schedule.every, 'monthly');
  assert.equal(set.schedule.range, '28');
  assert.equal(set.schedule.lang, 'ar');
  assert.ok(Date.parse(set.schedule.nextDue) > Date.now() + 27 * 86400_000);
  assert.deepEqual(await (await sched('GET')).json(), set);
  assert.equal((await sched('GET', undefined, bob)).status, 404);
  assert.equal((await sched('PUT', { every: 'off' }, bob)).status, 404);
  assert.deepEqual(await (await sched('GET')).json(), set); // bob changed nothing
  // `/reports/schedule` does not shadow real report ids.
  const mine = (await (await call('GET', `/api/companies/${companyId}/reports`, alice)).json()).reports[0];
  assert.equal((await call('GET', `/api/companies/${companyId}/reports/${mine.id}`, alice)).status, 200);
  assert.deepEqual(await (await sched('PUT', { every: 'off' })).json(), { schedule: null });
  assert.deepEqual(await (await sched('GET')).json(), { schedule: null });
});
