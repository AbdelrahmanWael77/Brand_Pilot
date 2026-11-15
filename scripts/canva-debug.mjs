// Prints what Canva really answered for the stored "Generate with Canva" records, to fix the reading of real
// answers (task 10.4d). Run on the machine where BrandPilot runs:   node scripts/canva-debug.mjs [path-to-db] [chars]
// No token is stored in these records. Link query strings (they carry signatures) are cut down to parameter names.
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] || process.env.BRANDPILOT_DB || 'data/brandpilot.db');
const max = Number(process.argv[3]) || 3000;
const red = (s) => String(s ?? '').replace(/\?[^"\s\\]+/g, (q) => '?' + q.slice(1).split('&').map((p) => p.split('=')[0]).join('&'));
let rows;
try {
  rows = db.prepare('SELECT kind, status, job_id, candidates, images, design_id, edit_url, view_url, credits, logo, error, said, raw FROM canva_assets ORDER BY created_at DESC LIMIT 6').all();
} catch (e) {
  console.log('No Canva records in this database (' + e.message + '). Is this the database the running app uses?');
  process.exit(0);
}
if (!rows.length) console.log('No Canva records yet.');
for (const r of rows) {
  console.log(`\n===== ${r.kind} · ${r.status} · job ${r.job_id} · design ${r.design_id} · logo ${r.logo} · error ${r.error} ${r.said || ''} · credits ${r.credits}`);
  console.log('proposals:', red(r.candidates).slice(0, 600));
  console.log('pictures :', red(r.images).slice(0, 600));
  console.log('edit link:', red(r.edit_url), '| view link:', red(r.view_url));
  console.log('Canva answered:', red(r.raw).slice(0, max));
}
