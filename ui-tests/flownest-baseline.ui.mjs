// UI regression (P1 checkpoint 1): the browser still produces exactly the recorded FlowNest recommendations.
// Run: npm run test:ui  (needs Google Chrome). Not part of `npm test`, which stays browser-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureFlowNest } from './lib/flownest.mjs';

const baseline = JSON.parse(readFileSync(new URL('../test/fixtures/flownest/baseline.json', import.meta.url), 'utf8'));

test('FlowNest: browser recommendations (EN + AR) and the server audit equal the recorded baseline', { timeout: 180_000 }, async () => {
  const cap = await captureFlowNest();
  assert.deepEqual(cap.counts, baseline.counts, 'the demo company itself changed (sources, findings or data rows)');
  assert.deepEqual(cap.recs.en.map((x) => x.id), baseline.recs.en.map((x) => x.id), 'recommendation ids or order changed');
  assert.deepEqual(cap.recs.en, baseline.recs.en);
  assert.deepEqual(cap.recs.ar, baseline.recs.ar);
  assert.deepEqual(cap.server, baseline.server);
});
