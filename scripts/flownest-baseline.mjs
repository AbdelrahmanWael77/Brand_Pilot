// Records the FlowNest recommendation baseline (P1 checkpoint 1).
//   node scripts/flownest-baseline.mjs          → capture and print a summary (writes nothing)
//   node scripts/flownest-baseline.mjs --write  → capture and (re)write test/fixtures/flownest/{baseline,state}.json
// Rewrite the baseline only on purpose: P1 compares the server's recommendations against it, and every difference
// must be listed with a reason. Needs Google Chrome (see ui-tests/lib/flownest.mjs).
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { captureFlowNest } from '../ui-tests/lib/flownest.mjs';

const DIR = new URL('../test/fixtures/flownest/', import.meta.url);
const cap = await captureFlowNest();
const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return null; } })();
const baseline = {
  about: 'Recommendations BrandPilot produced for the synthetic FlowNest demo company before P1 (rules engine, no AI). recs = browser audit(c) per language; server = GET /api/companies/:id/audit. Rebuild: node scripts/flownest-baseline.mjs --write',
  recordedAt: new Date().toISOString().slice(0, 10),
  commit,
  counts: cap.counts,
  recs: cap.recs,
  server: cap.server,
};
const kinds = (list) => list.reduce((o, x) => ((o[x.kind] = (o[x.kind] || 0) + 1), o), {});
console.log(JSON.stringify({ counts: cap.counts, browser: { total: cap.recs.en.length, byKind: kinds(cap.recs.en) }, server: { total: cap.server.items.length, byKind: kinds(cap.server.items), byBasis: cap.server.items.reduce((o, x) => ((o[x.basis] = (o[x.basis] || 0) + 1), o), {}) } }, null, 1));
if (process.argv.includes('--write')) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(new URL('baseline.json', DIR), JSON.stringify(baseline, null, 1) + '\n');
  fs.writeFileSync(new URL('state.json', DIR), JSON.stringify(cap.state) + '\n');
  console.log('written: test/fixtures/flownest/baseline.json, state.json');
}
