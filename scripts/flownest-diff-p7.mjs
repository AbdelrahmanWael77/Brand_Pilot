// P7: every difference between the recorded FlowNest baseline and what BrandPilot recommends now (wording only expected).
//   node scripts/flownest-diff-p7.mjs → prints a Markdown table (needs Google Chrome)
import fs from 'node:fs';
import { captureFlowNest, stableIds } from '../ui-tests/lib/flownest.mjs';
const base = JSON.parse(fs.readFileSync(new URL('../test/fixtures/flownest/baseline.json', import.meta.url), 'utf8'));
const now = await captureFlowNest();
const rows = [];
const walk = (path, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(`${path}.${k}`, a[k], b[k]); return; }
  rows.push([path, a, b]);
};
walk('recs', base.recs, now.recs);
walk('server', base.server, stableIds(now.server));
const cell = (v) => String(v ?? '—').replace(/\|/g, '\|').replace(/\n/g, ' ');
console.log(`| Where | Before | Now |\n|---|---|---|\n${rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')}`);
console.error(rows.length, 'differences');
