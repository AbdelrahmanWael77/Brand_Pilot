import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { canvaConfig, CANVA_SCOPES, CANVA_MCP_URL } from '../server/canva.js';
import { fitArgs, readResult, toolErrorCode, canvaBrief, TOOLS } from '../server/canvaStudio.js';

// Generate with Canva (task 10.4c). Nothing here touches the real network: Canva's token endpoint, its MCP
// server and its asset upload are a stubbed fetch. The tool schemas and answers below are MADE UP in a
// plausible shape — the real ones were not readable without a Canva sign-in.
const config = canvaConfig({ CANVA_CLIENT_ID: 'OC-CLIENT', CANVA_CLIENT_SECRET: 'cnv-secret', CANVA_REDIRECT_URI: 'https://app.example/api/integrations/canva/callback', TOKEN_KEY: 'd'.repeat(64) });

const SCHEMAS = {
  [TOOLS.design]: { type: 'object', properties: { query: { type: 'string' }, design_type: { type: 'string', enum: ['presentation', 'poster', 'instagram_post', 'facebook_post'] }, asset_ids: { type: 'array', items: { type: 'string' } }, user_intent: { type: 'string' } }, required: ['query', 'user_intent'] },
  [TOOLS.pick]: { type: 'object', properties: { job_id: { type: 'string' }, candidate_id: { type: 'string' }, user_intent: { type: 'string' } }, required: ['job_id', 'candidate_id'] },
  [TOOLS.image]: { type: 'object', properties: { prompt: { type: 'string' }, aspect_ratio: { type: 'string', enum: ['16:9', '1:1'] } }, required: ['prompt'] },
  [TOOLS.imageJob]: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
  [TOOLS.get]: { type: 'object', properties: { design_id: { type: 'string' } }, required: ['design_id'] },
  [TOOLS.export]: { type: 'object', properties: { design_id: { type: 'string' }, format: { type: 'object' } }, required: ['design_id', 'format'] },
};
const textResult = (o, isError) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }], ...(isError ? { isError: true } : {}) });

let M; // the stand-in MCP server's behaviour for one test
const mcpCalls = [];
const restCalls = [];
function resetMcp() {
  mcpCalls.length = 0;
  restCalls.length = 0;
  M = {
    sessions: 0, status: null, sse: false, dropSession: false, tools: Object.keys(SCHEMAS),
    call: {
      [TOOLS.design]: () => textResult({ job: { id: 'JOB-D', status: 'success', result: { generated_designs: [{ candidate_id: 'C1', thumbnails: [{ url: 'https://cdn.canva.test/c1.png' }] }, { candidate_id: 'C2', thumbnails: [{ url: 'https://cdn.canva.test/c2.png' }] }] } } }),
      [TOOLS.pick]: () => textResult({ design: { id: 'DAGdesign01', title: 'Hiring', urls: { edit_url: 'https://www.canva.com/design/DAGdesign01/edit', view_url: 'https://www.canva.com/design/DAGdesign01/view' } } }),
      [TOOLS.image]: () => textResult({ job: { id: 'JOB-I', status: 'in_progress' } }),
      [TOOLS.imageJob]: () => textResult({ job: { id: 'JOB-I', status: 'success', result: { images: [{ url: 'https://cdn.canva.test/i1.png' }, { url: 'https://cdn.canva.test/i2.png' }] }, credits_used: 2 } }),
      [TOOLS.get]: () => textResult({ design: { id: 'DAGdesign01', urls: { edit_url: 'https://www.canva.com/design/DAGdesign01/edit?t=2', view_url: 'https://www.canva.com/design/DAGdesign01/view?t=2' }, thumbnail: { url: 'https://cdn.canva.test/thumb.png' } } }),
      [TOOLS.export]: () => textResult({ job: { id: 'EXP', status: 'success', urls: ['https://export.canva.test/out.png'] } }),
    },
  };
}
const reply = (status, body, headers = {}) => ({ ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
async function fakeFetch(url, opts = {}) {
  const u = new URL(url);
  const auth = opts.headers && opts.headers.authorization;
  if (u.pathname.endsWith('/oauth/token')) return reply(200, { access_token: 'ACCESS-' + (opts.body.includes('alice') ? 'A' : 'X'), refresh_token: 'REFRESH-1', expires_in: 14400, scope: CANVA_SCOPES.join(' ') });
  if (u.pathname.endsWith('/users/me/profile')) return reply(200, { profile: { display_name: 'Nile Design Team' } });
  if (u.pathname.endsWith('/oauth/revoke')) return reply(200, {});
  if (u.pathname.endsWith('/rest/v1/asset-uploads')) {
    restCalls.push({ auth, bytes: opts.body.length, meta: opts.headers['asset-upload-metadata'] });
    return reply(200, { job: { id: 'UP1', status: 'in_progress' } });
  }
  if (u.pathname.endsWith('/rest/v1/asset-uploads/UP1')) return reply(200, { job: { id: 'UP1', status: 'success', asset: { id: 'ASSET-LOGO' } } });
  if (url === CANVA_MCP_URL) {
    const body = JSON.parse(opts.body);
    mcpCalls.push({ auth, method: body.method, params: body.params, session: opts.headers['mcp-session-id'] });
    if (M.status) return reply(M.status, '');
    if (body.method === 'initialize') return reply(200, { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'canva' } } }, { 'content-type': 'application/json', 'mcp-session-id': 'S' + ++M.sessions });
    if (body.method === 'notifications/initialized') return reply(202, '');
    if (M.dropSession) {
      M.dropSession = false;
      return reply(404, '');
    }
    let result;
    if (body.method === 'tools/list') result = { tools: M.tools.map((name) => ({ name, inputSchema: SCHEMAS[name] })) };
    else if (body.method === 'tools/call') result = M.call[body.params.name](body.params.arguments);
    const msg = { jsonrpc: '2.0', id: body.id, result };
    return M.sse ? reply(200, `event: message\ndata: ${JSON.stringify(msg)}\n\n`, { 'content-type': 'text/event-stream' }) : reply(200, msg, { 'content-type': 'application/json' });
  }
  return reply(404, { code: 'not_found' });
}
const fetched = [];
const fetchUrl = async (url, o) => {
  fetched.push({ url, o });
  return { url, type: 'image/png', bytes: Buffer.from('PNGBYTES') };
};

const LOGO = 'data:image/png;base64,' + Buffer.from('logo-bytes').toString('base64');
const state = () => ({
  brand: { colors: ['#1D4ED8', '#0F172A', 'red'], logo: 'm1' },
  media: [{ id: 'm1', name: 'logo.png', data: LOGO, logo: true }],
  campaigns: [{
    id: 'k1', name: 'We are hiring', slug: 'we-are-hiring', rec: null, kind: 'hiring', at: 1_700_000_000_000,
    brief: { objective: 'Hire two dental assistants', tone: 'Warm and direct', audienceEn: 'Dental assistants in Cairo', audienceAr: 'مساعدو أطباء الأسنان في القاهرة', messageEn: 'Join our clinic', channels: ['instagram'] },
    assets: [
      { id: 'a1', type: 'post', lang: 'en', channel: 'instagram', n: 0, status: 'draft', fields: { headline: { v: 'We are hiring dental assistants' }, cta: { v: 'Apply today' } } },
      { id: 'a2', type: 'post', lang: 'ar', channel: 'facebook', n: 1, status: 'draft', fields: { headline: { v: 'نوظف مساعدي أطباء أسنان' } } },
    ],
  }],
});

let server, base, db, alice, bob, co, coB;
before(async () => {
  resetMcp();
  db = openDb(':memory:');
  server = createApp({ db, fetchUrl, canva: { config, fetch: fakeFetch, studio: { wait: async () => {}, genLimit: { max: 40, windowMs: 60_000 } } } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
  co = (await (await call('POST', '/api/companies', alice, { name: 'Nile Dental' })).json()).company.id;
  coB = (await (await call('POST', '/api/companies', bob, { name: 'Bob Co' })).json()).company.id;
  await call('PUT', `/api/companies/${co}/state`, alice, { state: state() });
  await call('PUT', `/api/companies/${coB}/state`, bob, { state: state() });
});
after(() => {
  server.close();
  db.close();
});
const call = (method, path, cookie, body) =>
  fetch(base + path, { method, redirect: 'manual', headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
async function register(email) {
  const r = await call('POST', '/api/auth/register', null, { email, password: 'correct horse' });
  return r.headers.getSetCookie()[0].split(';')[0];
}
const S = (id = co) => `/api/companies/${id}/canva`;
async function connect(cookie = alice, id = co, code = 'alice') {
  const u = new URL((await (await call('POST', `/api/companies/${id}/integrations/canva/start`, cookie)).json()).url);
  const r = await call('GET', `/api/integrations/canva/callback?code=${code}&state=${u.searchParams.get('state')}`, cookie);
  assert.equal(r.headers.get('location'), '/?canva=connected');
}
const gen = async (body, cookie = alice, id = co) => {
  const r = await call('POST', S(id) + '/generate', cookie, body);
  return { status: r.status, body: await r.json() };
};
const toolCalls = (name) => mcpCalls.filter((c) => c.method === 'tools/call' && c.params.name === name);

test('fitArgs: uses the names of the schema that is there, picks an allowed value, refuses an unfillable required argument', () => {
  const a = fitArgs({ name: 'generate-design', inputSchema: SCHEMAS[TOOLS.design] }, { prompt: 'p', designType: { pick: ['linkedin_post', 'instagram_post'] }, assets: ['A'], intent: 'i', count: 2 });
  assert.deepEqual(a, { query: 'p', design_type: 'instagram_post', asset_ids: ['A'], user_intent: 'i' });
  assert.deepEqual(fitArgs({ name: 'x', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, size: { type: 'string' } } } }, { prompt: 'p', aspect: { pick: ['1:1'] }, intent: 'i' }), { prompt: 'p', size: '1:1' });
  // a string format and an object format
  assert.deepEqual(fitArgs({ name: 'e', inputSchema: { properties: { design_id: {}, format: { type: 'string', enum: ['pdf', 'png'] } } } }, { designId: 'D', format: { pick: ['png'] } }), { design_id: 'D', format: 'png' });
  assert.deepEqual(fitArgs({ name: 'e', inputSchema: SCHEMAS[TOOLS.export] }, { designId: 'D', format: { pick: ['png'] } }), { design_id: 'D', format: { type: 'png' } });
  // no value the schema allows → left out
  assert.deepEqual(fitArgs({ name: 'e', inputSchema: { properties: { prompt: {}, design_type: { enum: ['doc'] } } } }, { prompt: 'p', designType: { pick: ['instagram_post'] } }), { prompt: 'p' });
  assert.throws(() => fitArgs({ name: 'generate-design', inputSchema: { properties: { query: {}, brand_kit_id: {} }, required: ['query', 'brand_kit_id'] } }, { prompt: 'p' }), (e) => e.code === 'canva_tool_changed' && /brand_kit_id/.test(e.detail));
  // a tool without a schema gets the documented names
  assert.deepEqual(fitArgs({ name: 'g' }, { designId: 'D' }), { design_id: 'D' });
});

test('readResult: structured or text JSON or plain text; unknown shapes give empty fields', () => {
  const d = readResult(M.call[TOOLS.design]());
  assert.equal(d.jobId, 'JOB-D');
  assert.deepEqual(d.candidates, [{ id: 'C1', thumb: 'https://cdn.canva.test/c1.png' }, { id: 'C2', thumb: 'https://cdn.canva.test/c2.png' }]);
  assert.equal(d.designId, null);
  const p = readResult({ structuredContent: JSON.parse(M.call[TOOLS.pick]().content[0].text) });
  assert.deepEqual([p.designId, p.editUrl, p.viewUrl], ['DAGdesign01', 'https://www.canva.com/design/DAGdesign01/edit', 'https://www.canva.com/design/DAGdesign01/view']);
  const i = readResult(M.call[TOOLS.imageJob]());
  assert.deepEqual(i.images, ['https://cdn.canva.test/i1.png', 'https://cdn.canva.test/i2.png']);
  assert.equal(i.credits, 'credits_used: 2');
  const t = readResult(textResult('Your design is ready: https://www.canva.com/design/DAGtext0001/edit. Preview https://cdn.canva.test/p.png'));
  assert.deepEqual([t.designId, t.editUrl, t.images], ['DAGtext0001', 'https://www.canva.com/design/DAGtext0001/edit', ['https://cdn.canva.test/p.png']]);
  const none = readResult({ content: [{ type: 'text', text: 'Done.' }] });
  assert.deepEqual([none.jobId, none.designId, none.editUrl, none.candidates, none.images], [null, null, null, [], []]);
  assert.equal(readResult(textResult({ job: { status: 'failed' } })).failed, true);
  assert.equal(readResult(null).text, '');
});

test('readResult: a Canva page link is never taken for a picture; the thumbnail is found wherever it sits', () => {
  const r = readResult(textResult({ job: { id: 'J', status: 'success', result: { generated_designs: [
    { candidate_id: 'C1', url: 'https://www.canva.com/design/DAGx/preview?x=1', thumbnails: [{ url: 'https://cdn.canva.test/t1.png' }] },
    { candidate_id: 'C2', url: 'https://www.canva.com/design/DAGy/preview' },
  ] } } }));
  assert.deepEqual(r.candidates, [{ id: 'C1', thumb: 'https://cdn.canva.test/t1.png' }, { id: 'C2', thumb: null }]);
  assert.deepEqual(r.images, []);
  const d = readResult(textResult({ design: { id: 'DAGz', url: 'https://www.canva.com/design/DAGz/watch', urls: { edit_url: 'https://www.canva.com/design/DAGz/edit' }, thumbnail: { url: 'https://cdn.canva.test/z.png' } } }));
  assert.deepEqual([d.designId, d.images], ['DAGz', ['https://cdn.canva.test/z.png']]);
});

test('toolErrorCode and canvaBrief', () => {
  assert.deepEqual(toolErrorCode('license_required: premium element'), ['canva_plan', 402]);
  assert.deepEqual(toolErrorCode('You have no AI credits left'), ['canva_credits', 402]);
  assert.deepEqual(toolErrorCode('Missing scope asset:write'), ['canva_forbidden', 403]);
  assert.deepEqual(toolErrorCode('boom'), ['canva_tool_error', 502]);
  const camp = { name: 'We are hiring', brief: { objective: 'Hire two', tone: 'Warm', audienceEn: 'Assistants', audienceAr: 'مساعدون', messageEn: 'Join', channels: ['instagram'] } };
  const asset = { channel: 'instagram', lang: 'en', fields: { headline: { v: 'We are hiring' }, sub: { v: '⟦p1⟧ · ⟦p2⟧' }, cta: { v: 'Apply  today' }, caption: { v: 'Long caption under the post' } } };
  const img = canvaBrief({ company: 'Nile Dental', campaign: camp, asset, kind: 'image', lang: 'en', colors: ['#1D4ED8'], purpose: 'hiring', note: 'bright' });
  assert.match(img, /no text, letters, numbers, prices, logos/);
  assert.ok(!img.includes('Apply today') && !img.includes('We are hiring\n')); // a picture carries no wording
  assert.match(img, /#1D4ED8/);
  assert.match(img, /Extra direction from the user \(style only\): bright/);
  const des = canvaBrief({ company: 'Nile Dental', campaign: camp, asset, kind: 'design', lang: 'en', colors: [], note: '' });
  assert.match(des, /- headline: We are hiring\n- cta: Apply today/);
  assert.ok(!des.includes('⟦') && !des.includes('Long caption')); // unfilled placeholders and the caption are not design wording
  assert.match(des, /Do not draw, write, invent or imitate any logo/);
  assert.match(des, /Do not add prices, discounts, offers/);
  const ar = canvaBrief({ company: 'Nile Dental', campaign: camp, asset: null, kind: 'design', lang: 'ar', colors: [] });
  assert.match(ar, /Arabic \(right to left\)/);
  assert.match(ar, /Audience: مساعدون/);
  assert.match(ar, /the real logo is placed there afterwards/); // never "place the attached logo": Canva redrew it
});

test('without a connection: tools and generate answer 409, the list is empty; outsiders 404; signed out 401', async () => {
  resetMcp();
  assert.equal((await call('GET', S() + '/tools', alice)).status, 409);
  assert.deepEqual(await gen({ campaignId: 'k1', kind: 'image' }), { status: 409, body: { error: 'canva_reauth' } });
  assert.deepEqual(await (await call('GET', S() + '/assets', alice)).json(), { assets: [] });
  assert.equal((await call('GET', S() + '/assets', bob)).status, 404);
  assert.equal((await call('POST', S() + '/generate', null, {})).status, 401);
  assert.equal(mcpCalls.length, 0);
});

test('design: the user’s own token calls Canva, the logo goes as a file, proposals → pick → design link → export → picture bytes', async () => {
  resetMcp();
  await connect();
  const t = await (await call('GET', S() + '/tools', alice)).json();
  assert.deepEqual([t.image, t.design, t.exportable], [true, true, true]);
  const r = await gen({ campaignId: 'k1', assetId: 'a1', kind: 'design', note: 'minimal' });
  assert.equal(r.status, 200);
  const a = r.body.asset;
  assert.deepEqual([a.status, a.kind, a.campaignId, a.assetId, a.lang, a.logo], ['choose', 'design', 'k1', 'a1', 'en', 'attached']);
  assert.equal(a.candidates.length, 2);
  assert.ok(mcpCalls.every((c) => c.auth === 'Bearer ACCESS-A'));
  assert.deepEqual(mcpCalls.slice(0, 3).map((c) => c.method), ['initialize', 'notifications/initialized', 'tools/list']);
  const g = toolCalls(TOOLS.design)[0].params.arguments;
  assert.equal(g.design_type, 'instagram_post');
  assert.equal(g.asset_ids, undefined); // the logo is uploaded to the user's Canva but not handed to the generator
  assert.match(g.query, /Do not draw, write, invent or imitate any logo/);
  assert.match(g.query, /"Nile Dental"/);
  assert.match(g.query, /- headline: We are hiring dental assistants/);
  assert.match(g.query, /#1D4ED8, #0F172A\./); // 'red' is not a colour value BrandPilot passes on
  assert.match(g.query, /Purpose: hiring/);
  assert.equal(restCalls.length, 1);
  assert.equal(restCalls[0].auth, 'Bearer ACCESS-A');
  assert.equal(restCalls[0].bytes, 10);
  // nothing secret or internal reaches the browser
  assert.ok(!JSON.stringify(r.body).includes('ACCESS') && !('raw' in a) && !('brief' in a));

  assert.equal((await call('POST', `${S()}/assets/${a.id}/pick`, alice, { candidate: 'nope' })).status, 400);
  const p = (await (await call('POST', `${S()}/assets/${a.id}/pick`, alice, { candidate: 'C2' })).json()).asset;
  assert.deepEqual([p.status, p.designId, p.editUrl, p.candidates, p.images], ['ready', 'DAGdesign01', 'https://www.canva.com/design/DAGdesign01/edit', [], ['https://cdn.canva.test/c2.png']]);
  assert.deepEqual(toolCalls(TOOLS.pick)[0].params.arguments, { job_id: 'JOB-D', candidate_id: 'C2', user_intent: 'Keep a campaign design proposal from BrandPilot' });

  const f = (await (await call('POST', `${S()}/assets/${a.id}/refresh`, alice)).json()).asset;
  assert.equal(f.editUrl, 'https://www.canva.com/design/DAGdesign01/edit?t=2');
  assert.deepEqual(f.images, ['https://cdn.canva.test/c2.png']);

  const x = (await (await call('POST', `${S()}/assets/${a.id}/export`, alice)).json()).asset;
  assert.deepEqual(x.images, ['https://export.canva.test/out.png']);
  assert.equal(x.editUrl, f.editUrl);
  assert.deepEqual(toolCalls(TOOLS.export)[0].params.arguments, { design_id: 'DAGdesign01', format: { type: 'png' } });

  const img = await (await call('POST', `${S()}/assets/${a.id}/image`, alice, { i: 0 })).json();
  assert.equal(img.dataUrl, 'data:image/png;base64,' + Buffer.from('PNGBYTES').toString('base64'));
  assert.equal(fetched.at(-1).url, 'https://export.canva.test/out.png');
  assert.equal(fetched.at(-1).o.binary, true);

  // a second design reuses the uploaded logo and the open session
  const before = mcpCalls.filter((c) => c.method === 'initialize').length;
  await gen({ campaignId: 'k1', assetId: 'a2', kind: 'design' });
  assert.equal(restCalls.length, 1);
  assert.equal(mcpCalls.filter((c) => c.method === 'initialize').length, before);
  assert.match(toolCalls(TOOLS.design)[1].params.arguments.query, /Arabic \(right to left\)/);
  assert.equal(toolCalls(TOOLS.design)[1].params.arguments.design_type, 'facebook_post');

  const list = (await (await call('GET', S() + '/assets?campaign=k1', alice)).json()).assets;
  assert.deepEqual(list.map((v) => v.assetId), ['a2', 'a1']);
  assert.deepEqual((await (await call('GET', S() + '/assets?campaign=other', alice)).json()).assets, []);
});

test('records belong to the user who made them: another company’s user cannot read, use or delete them', async () => {
  const id = (await (await call('GET', S() + '/assets', alice)).json()).assets[0].id;
  await connect(bob, coB, 'bob');
  assert.deepEqual((await (await call('GET', S(coB) + '/assets', bob)).json()).assets, []);
  for (const p of ['refresh', 'pick', 'export', 'image']) assert.equal((await call('POST', `${S(coB)}/assets/${id}/${p}`, bob, {})).status, 404);
  assert.equal((await call('POST', `${S()}/assets/${id}/refresh`, bob, {})).status, 404);
  await call('DELETE', `${S(coB)}/assets/${id}`, bob);
  assert.equal((await (await call('GET', S() + '/assets', alice)).json()).assets.length, 2);
  // bob's own generation runs with bob's token
  resetMcp();
  const r = await gen({ campaignId: 'k1', kind: 'image' }, bob, coB);
  assert.equal(r.status, 200);
  assert.ok(mcpCalls.length > 0 && mcpCalls.every((c) => c.auth === 'Bearer ACCESS-X'));
});

test('image: a job that is still running is polled; pictures arrive with the credit note; event-stream answers are read', async () => {
  resetMcp();
  M.sse = true;
  const r = await gen({ campaignId: 'k1', assetId: 'a1', kind: 'image' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.asset.status, r.body.asset.images, r.body.asset.logo], ['working', [], 'none']);
  const g = toolCalls(TOOLS.image)[0].params.arguments;
  assert.equal(g.aspect_ratio, '1:1');
  assert.match(g.prompt, /must contain no text/);
  assert.equal(restCalls.length, 0); // a picture never gets the logo
  const done = (await (await call('POST', `${S()}/assets/${r.body.asset.id}/refresh`, alice)).json()).asset;
  assert.deepEqual([done.status, done.images.length, done.credits], ['ready', 2, 'credits_used: 2']);
  assert.deepEqual(toolCalls(TOOLS.imageJob)[0].params.arguments, { job_id: 'JOB-I' });
  await call('DELETE', `${S()}/assets/${done.id}`, alice);
  assert.ok(!(await (await call('GET', S() + '/assets', alice)).json()).assets.some((v) => v.id === done.id));
});

test('failures are told as they are: plan limit, missing tool, changed tool, unreadable answer, ended session, bad input', async () => {
  resetMcp();
  M.dropSession = false;
  M.call[TOOLS.design] = () => textResult('license_required: this element needs Canva Pro', true);
  let r = await gen({ campaignId: 'k1', kind: 'design' });
  assert.equal(r.status, 402);
  assert.deepEqual([r.body.error, r.body.said, r.body.asset.status, r.body.asset.error], ['canva_plan', 'license_required: this element needs Canva Pro', 'failed', 'canva_plan']);

  M.call[TOOLS.design] = () => textResult('All done!');
  r = await gen({ campaignId: 'k1', kind: 'design' });
  assert.deepEqual([r.status, r.body.error, r.body.asset.status], [502, 'canva_unreadable', 'failed']);

  assert.deepEqual(await gen({ campaignId: 'nope', kind: 'design' }), { status: 404, body: { error: 'campaign_not_found' } });
  assert.deepEqual(await gen({ campaignId: 'k1', assetId: 'zz', kind: 'design' }), { status: 404, body: { error: 'asset_not_found' } });
  assert.equal((await gen({ campaignId: 'k1', kind: 'video' })).status, 400);
});

test('a tool Canva does not offer this user → 501 without a call; the offered one still works', async () => {
  const db2 = openDb(':memory:');
  resetMcp();
  M.tools = [TOOLS.design];
  const s2 = createApp({ db: db2, fetchUrl, canva: { config, fetch: fakeFetch } }).listen(0);
  await new Promise((r) => s2.once('listening', r));
  const keep = base;
  base = `http://127.0.0.1:${s2.address().port}`;
  try {
    const ck = await register('carol@example.com');
    const id = (await (await call('POST', '/api/companies', ck, { name: 'Carol Co' })).json()).company.id;
    await call('PUT', `/api/companies/${id}/state`, ck, { state: state() });
    await connect(ck, id, 'carol');
    const t = await (await call('GET', S(id) + '/tools', ck)).json();
    assert.deepEqual([t.image, t.design, t.exportable], [false, true, false]);
    let r = await gen({ campaignId: 'k1', kind: 'image' }, ck, id);
    assert.deepEqual([r.status, r.body.error], [501, 'canva_tool_missing']);
    r = await gen({ campaignId: 'k1', kind: 'design' }, ck, id);
    assert.equal(r.status, 200);
    assert.equal(toolCalls(TOOLS.image).length, 0);
  } finally {
    base = keep;
    s2.close();
    db2.close();
  }
});

test('an ended MCP session is opened again once; Canva 401 → 409 and the connection says "connect again"; 429 → 429', async () => {
  resetMcp();
  M.dropSession = true; // the next request inside the cached session answers 404
  let r = await gen({ campaignId: 'k1', kind: 'design' });
  // the 404 hit the cached session's tools/call; the retry opened a new session
  assert.equal(r.status, 200);
  assert.equal(mcpCalls.filter((c) => c.method === 'initialize').length, 1);

  M.status = 429;
  r = await gen({ campaignId: 'k1', kind: 'design' });
  assert.deepEqual([r.status, r.body.error], [429, 'canva_rate_limited']);

  M.status = 401;
  r = await gen({ campaignId: 'k1', kind: 'design' });
  assert.deepEqual([r.status, r.body.error], [409, 'canva_reauth']);
  const info = await (await call('GET', `/api/companies/${co}/integrations/canva`, alice)).json();
  assert.equal(info.needsReconnect, true);
  M.status = null;
  // earlier results stay listed after the connection broke
  assert.ok((await (await call('GET', S() + '/assets', alice)).json()).assets.length >= 2);
  await call('DELETE', `/api/companies/${co}/integrations/canva`, alice);
  assert.equal((await gen({ campaignId: 'k1', kind: 'design' })).status, 409);
});

test('not configured: every route answers 503 and nothing is called', async () => {
  const db2 = openDb(':memory:');
  const s2 = createApp({ db: db2, canva: { config: canvaConfig({}), fetch: () => assert.fail('no network') } }).listen(0);
  await new Promise((r) => s2.once('listening', r));
  const keep = base;
  base = `http://127.0.0.1:${s2.address().port}`;
  try {
    const ck = await register('dan@example.com');
    const id = (await (await call('POST', '/api/companies', ck, { name: 'Dan Co' })).json()).company.id;
    assert.equal((await call('GET', S(id) + '/tools', ck)).status, 503);
    assert.equal((await call('GET', S(id) + '/assets', ck)).status, 503);
    assert.equal((await call('POST', S(id) + '/generate', ck, { campaignId: 'k1', kind: 'image' })).status, 503);
  } finally {
    base = keep;
    s2.close();
    db2.close();
  }
});

test("readResult: Canva's real answers of 2026-11-15 — design_summary gives the design id, a link token is not an id, a canva.com page is not a picture", () => {
  const token = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0';
  const real = readResult({ content: [{ type: 'text', text: JSON.stringify({ design_summary: { id: 'DAHa_afhb2c', title: 'Post 1', urls: { edit_url: `https://www.canva.com/api/design/${token}/edit?utm_source=x`, view_url: `https://www.canva.com/api/design/${token}/view?utm_source=x` }, page_count: 1 } }) }] });
  assert.equal(real.designId, 'DAHa_afhb2c');
  assert.match(real.editUrl, /\/edit\?/);
  assert.deepEqual(real.images, []);
  // without any id in the answer, the token inside the link is not taken for one
  assert.equal(readResult({ content: [{ type: 'text', text: JSON.stringify({ urls: { edit_url: `https://www.canva.com/api/design/${token}/edit` } }) }] }).designId, null);
  // a proposal carries a page link and a thumbnail: the thumbnail is the preview, the page is never a picture
  const prop = readResult({ structuredContent: { job: { id: 'J1' }, candidates: [{ candidate_id: 'C1', url: 'https://www.canva.com/d/ThlLGWm6LRJ7076', thumbnail: { url: 'https://design.canva.ai/thumb1.png' } }, { candidate_id: 'C2', url: 'https://www.canva.com/d/abc' }] } });
  assert.deepEqual(prop.candidates, [{ id: 'C1', thumb: 'https://design.canva.ai/thumb1.png' }, { id: 'C2', thumb: null }]);
  assert.deepEqual(prop.images, []);
});

test('16c: a business post gets a structured, editable brief; a series post an editorial, illustrated one in its signature style', () => {
  const camp = { name: 'Senior Flutter Developer', brief: { objective: 'Hiring post', channels: ['linkedin'] } };
  const asset = { channel: 'linkedin', lang: 'en', fields: { headline: { v: 'Senior Flutter Developer' }, kicker: { v: "We're hiring" }, sub: { v: 'Build apps people love' }, details: { v: 'Cairo · Full-time' }, cta: { v: 'Apply now' } } };
  const hire = canvaBrief({ company: 'MD Labs', campaign: camp, asset, kind: 'design', lang: 'en', colors: ['#084298'], purpose: 'hiring' });
  assert.match(hire, /recruitment post design/);
  assert.match(hire, /structured, editable layout/);
  assert.match(hire, /- details: Cairo · Full-time/);
  assert.match(hire, /- cta: Apply now/, 'all five pieces of wording are kept for a business post');
  assert.ok(!/illustration that explains the topic/.test(hire));
  const idea = { series: 'Build Smarter', topic: '3 questions to ask before building your mobile app', visual: 'Deep #084298 background, friendly 3D smartphone illustration.', fmt: 'carousel' };
  const slide = { channel: 'linkedin', lang: 'en', fields: { headline: { v: 'Who will use the app?' }, kicker: { v: 'Question 1 / 3' }, slide: { v: '2/5' } } };
  const ser = canvaBrief({ company: 'MD Labs', campaign: camp, asset: slide, kind: 'design', lang: 'en', colors: ['#084298'], purpose: 'tip', idea });
  assert.match(ser, /editorial LinkedIn post design for the content series "Build Smarter"/);
  assert.match(ser, /friendly 3D smartphone illustration/);
  assert.match(ser, /slide 2 of 5 of one carousel/);
  assert.ok(!ser.includes('- slide:'), 'the slide marker is not design wording');
  assert.match(ser, /Do not draw, write, invent or imitate any logo/);
  const pic = canvaBrief({ company: 'MD Labs', campaign: camp, asset: slide, kind: 'image', lang: 'en', colors: [], idea });
  assert.match(pic, /Visual direction \(approved by the company\): Deep #084298/);
});
