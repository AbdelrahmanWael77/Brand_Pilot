// UI regression (P1 checkpoint 1): the browser still produces exactly the recorded FlowNest recommendations.
// Run: npm run test:ui  (needs Google Chrome). Not part of `npm test`, which stays browser-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureFlowNest } from './lib/flownest.mjs';

const baseline = JSON.parse(readFileSync(new URL('../test/fixtures/flownest/baseline.json', import.meta.url), 'utf8'));

test('FlowNest: the recommendations on screen (all data and 28 days, EN + AR) and the server audit equal the recorded baseline', { timeout: 180_000 }, async () => {
  const cap = await captureFlowNest();
  assert.deepEqual(cap.counts, baseline.counts, 'the demo company itself changed (sources, findings or data rows)');
  for (const range of Object.keys(baseline.recs)) {
    assert.deepEqual(cap.recs[range].en.map((x) => x.id), baseline.recs[range].en.map((x) => x.id), `${range}: recommendation ids or order changed`);
    assert.deepEqual(cap.recs[range].en, baseline.recs[range].en);
    assert.deepEqual(cap.recs[range].ar, baseline.recs[range].ar);
  }
  assert.deepEqual(cap.server, baseline.server);
});
