import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* public/recs.js is a classic browser script; run it in a sandbox and take its global. */
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../public/recs.js', import.meta.url), 'utf8'), ctx);
const B = ctx.BPRecs;
const J = x => JSON.parse(JSON.stringify(x));

const TODAY = '2026-11-17';
let n = 0;
const post = (platform, reach, engagements, extra = {}) => ({ date: '2026-10-' + String(1 + (n++ % 25)).padStart(2, '0'), platform, reach, engagements, post_id: 'p' + n, ...extra });
const many = (k, platform, reach, eng, extra) => Array.from({ length: k }, () => post(platform, reach, eng, extra));
const SMART = { id: 's1', name: 'Build Smarter', objective: 'engagement', channel: 'linkedin', themes: ['Tips'], ideas: '3 questions to ask before building your mobile app\nWhat an MVP should include' };
const RADAR = { id: 's2', name: 'Tech Radar', objective: 'engagement', channel: 'linkedin', themes: ['Articles'] };

test('a post belongs to a series by manual choice first, then by linked theme; a caption match is only a suggestion', () => {
  const r = post('linkedin', 100, 3, { theme: 'Tips', text: 'Tech Radar: news' });
  assert.deepEqual(J(B.seriesOf(r, [SMART, RADAR], {})), { sid: 's1', how: 'theme' });
  assert.deepEqual(J(B.seriesOf(r, [SMART, RADAR], { [B.postKey(r)]: 's2' })), { sid: 's2', how: 'manual' });
  assert.deepEqual(J(B.seriesOf(r, [SMART, RADAR], { [B.postKey(r)]: '' })), { sid: null, how: 'manual' });
  const t = post('linkedin', 100, 3, { text: 'Our new #BuildSmarter post' });
  assert.deepEqual(J(B.seriesOf(t, [SMART, RADAR], {})), { sid: 's1', how: 'text' });
  const out = B.recommend({ posts: [t], series: [SMART], today: TODAY });
  assert.equal(out.assign.suggested, 1);
  assert.equal(out.assign.counted, 0, 'a suggestion is not evidence until confirmed');
  assert.equal(out.recs[0].kind, 'start');
});

test('no series → no recommendation, and says so; a series without posts gets an experiment with its next topic idea', () => {
  const none = B.recommend({ posts: many(3, 'linkedin', 100, 2), series: [], today: TODAY });
  assert.equal(none.recs.length, 0);
  assert.ok(none.missing.includes('no_series'));
  const r = B.recommend({ posts: [], series: [SMART], today: TODAY, used: { s1: ['3 Questions to ask before building your mobile app'] } });
  const s = r.recs[0];
  assert.equal(s.kind, 'start');
  assert.equal(s.level, 'test');
  assert.equal(s.platform, 'linkedin');
  assert.equal(s.series, null, 'no invented evidence');
  assert.equal(s.topic, 'What an MVP should include', 'a topic already made is skipped (case ignored)');
  assert.ok(s.limits.some(l => l.code === 'no_history'));
});

test('a clear lead with enough posts and reach on the same platform is "supported"', () => {
  const posts = [...many(6, 'linkedin', 400, 20, { theme: 'Tips' }), ...many(8, 'linkedin', 400, 8, { theme: 'Articles' })];
  const r = B.recommend({ posts, series: [SMART, RADAR], today: TODAY });
  const top = r.recs[0];
  assert.equal(top.kind, 'repeat');
  assert.equal(top.level, 'supported');
  assert.equal(top.sid, 's1');
  assert.equal(top.series.n, 6);
  assert.equal(top.rest.n, 8);
  assert.ok(Math.abs(top.lift - 1.5) < 1e-9);
  assert.equal(top.posts.length, 5);
  const radar = r.recs.find(x => x.sid === 's2');
  assert.equal(radar.kind, 'improve');
});

test('a better-looking series with too few posts is only "worth testing", with the unmet minimum', () => {
  const posts = [...many(2, 'linkedin', 900, 60, { theme: 'Tips' }), ...many(8, 'linkedin', 400, 8, { theme: 'Articles' })];
  const r = B.recommend({ posts, series: [SMART], today: TODAY });
  const s = r.recs[0];
  assert.equal(s.kind, 'promising');
  assert.equal(s.level, 'test');
  assert.deepEqual(J(s.gap), { f: 'posts', side: 'series', have: 2, min: 5 });
  assert.ok(s.limits.some(l => l.code === 'small_sample'));
});

test('enough posts but too little reach is not a finding either', () => {
  const posts = [...many(6, 'linkedin', 50, 10, { theme: 'Tips' }), ...many(8, 'linkedin', 400, 8, { theme: 'Articles' })];
  const s = B.recommend({ posts, series: [SMART], today: TODAY }).recs[0];
  assert.equal(s.level, 'test');
  assert.equal(s.gap.f, 'reach');
});

test('platforms are never mixed: Instagram posts do not count against LinkedIn ones', () => {
  const posts = [...many(6, 'linkedin', 400, 8, { theme: 'Tips' }), ...many(8, 'instagram', 400, 80, { theme: 'Articles' })];
  const r = B.recommend({ posts, series: [SMART], today: TODAY });
  const li = r.recs.find(x => x.platform === 'linkedin');
  assert.equal(li.rest.n, 0);
  assert.equal(li.level, 'test');
  assert.ok(li.limits.some(l => l.code === 'no_baseline'));
});

test('paid posts and posts younger than 7 days are left out and counted', () => {
  const posts = [...many(6, 'linkedin', 400, 20, { theme: 'Tips' }), ...many(8, 'linkedin', 400, 8, { theme: 'Articles' }),
    post('linkedin', 99999, 9999, { theme: 'Articles', spend: 50 }), { date: '2026-11-15', platform: 'linkedin', reach: 99999, engagements: 1, theme: 'Articles', post_id: 'new' }];
  const r = B.recommend({ posts, series: [SMART, RADAR], today: TODAY });
  assert.deepEqual(J(r.left), { paid: 1, fresh: 1 });
  const top = r.recs[0];
  assert.equal(top.kind, 'repeat');
  assert.equal(top.rest.n, 8);
  assert.ok(top.limits.some(l => l.code === 'paid_out' && l.n === 1));
  assert.ok(top.limits.some(l => l.code === 'fresh_out' && l.n === 1));
});

test('a leads series is judged by link clicks and says so; LinkedIn clicks are flagged; no click column = not measured', () => {
  const LEADS = { ...SMART, objective: 'leads' };
  const posts = [...many(6, 'linkedin', 400, 8, { theme: 'Tips', link_clicks: 30 }), ...many(8, 'linkedin', 400, 8, { theme: 'Articles', link_clicks: 10 })];
  const s = B.recommend({ posts, series: [LEADS], today: TODAY }).recs[0];
  assert.equal(s.kind, 'repeat');
  assert.ok(s.limits.some(l => l.code === 'proxy_leads'));
  assert.ok(s.limits.some(l => l.code === 'linkedin_clicks'));
  const bare = B.recommend({ posts: many(6, 'linkedin', 400, 8, { theme: 'Tips' }), series: [LEADS], today: TODAY });
  assert.equal(bare.recs.length, 0);
  assert.ok(bare.missing.includes('not_measured:leads:linkedin'));
  assert.ok(bare.missing.includes('no_clicks'));
});

test('a dismissed recommendation is hidden and counted', () => {
  const r = B.recommend({ posts: [], series: [SMART, RADAR], today: TODAY, dismissed: ['start:s1'] });
  assert.equal(r.recs.length, 1);
  assert.equal(r.recs[0].sid, 's2');
  assert.equal(r.hidden, 1);
});
