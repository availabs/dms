#!/usr/bin/env node
/**
 * Delete pages (and their components) whose type names a pattern that does not exist.
 *
 *     node delete-orphan-pages.js --db <config> --app <app> [--apply]
 *
 * WHY. A page's type is `{patternInstance}|page` and that is how it is LOADED — the route format
 * from `initializePatternFormat` asks for `{app}+{patternInstance}|page`. So a page whose container
 * segment matches no pattern row cannot be reached by anything: not the router, not the nav, not
 * the admin lists. Its components (`{patternInstance}|component`) go with it; they are parented to
 * the page by `parent_id` and have no other route in.
 *
 * HOW THEY HAPPEN. An earlier pattern-duplicate implementation (since fixed) created the copy's
 * pages under the SOURCE pattern's instance with a `_copy` suffix rather than the new pattern's
 * instance, and left `parent_id` null. Renaming or deleting the duplicate pattern afterwards left
 * the rows with no owner in either place the ownership is recorded.
 *
 * WHY NOT REATTACH. Reattaching needs three writes — the page's `parent_id`, the page's type
 * container, and the components' type container — and all three need to know WHICH pattern owns
 * each page. Nothing records it. On rowauth-test the 338 orphans were six copies of one template
 * made in five bursts, against five candidate patterns that all had zero pages; only one burst
 * could be matched to a pattern at all (by creation time, 1.4 min apart). So this script deletes.
 * If a future case can identify the owner, reattach instead — this is not the general answer, it
 * is the answer when ownership is unrecoverable.
 *
 * ⚠ DELETES ROWS, and the count is large by design (one page carries dozens of components).
 * Dry run unless `--apply`. It refuses if a page outside the orphan set names one of them as its
 * `data.parent`, or if any component in the set is parented outside it.
 */
const { getDb, awaitReady, loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');

const kindOf = (ty) => {
  const last = String(ty || '').split('|').pop();
  return last.includes(':') ? last.split(':').pop() : last;
};
const instOf = (ty) => {
  const s = String(ty || '');
  const seg = s.includes('|') ? s.split('|')[1] : s;
  return seg && seg.includes(':') ? seg.split(':')[0] : null;
};
const contOf = (ty) => (String(ty || '').includes('|') ? String(ty).split('|')[0] : null);

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }

  const db = getDb(o.db); await awaitReady();
  const config = loadConfig(o.db);
  const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const t = resolveTable(o.app, '', db.type, splitMode);
  const T = db.type === 'postgres' ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;

  console.log(`delete orphan pages — ${o.apply ? 'APPLY (deletes rows)' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}\n`);

  const rows = await q(`SELECT id, type, parent_id FROM ${T} WHERE app = $1`, [o.app]);
  const patterns = new Set(rows.filter(r => kindOf(r.type) === 'pattern').map(r => instOf(r.type)));

  const pages = rows.filter(r => kindOf(r.type) === 'page' && !patterns.has(contOf(r.type)));
  const pageIds = new Set(pages.map(r => String(r.id)));
  const comps = rows.filter(r => kindOf(r.type) === 'component' &&
    (pageIds.has(String(r.parent_id)) || !patterns.has(contOf(r.type))));

  const byContainer = new Map();
  for (const r of pages) byContainer.set(contOf(r.type), (byContainer.get(contOf(r.type)) || 0) + 1);

  console.log(`patterns ${patterns.size}   orphan pages ${pages.length}   their components ${comps.length}`);
  for (const [c, n] of byContainer) console.log(`   container "${c}"  ${n} page(s)  — no pattern has this instance`);
  if (!pages.length && !comps.length) { console.log('\nNothing to do.'); process.exit(0); }

  // A component in the set whose parent is NOT one of these pages would lose its page silently.
  const strayComps = comps.filter(c => !pageIds.has(String(c.parent_id)));
  if (strayComps.length) {
    console.log(`\n  ⚠ ${strayComps.length} component(s) in the set are not parented to an orphan page — refusing:`);
    for (const c of strayComps.slice(0, 10)) console.log(`     #${c.id} ${c.type} parent=${c.parent_id}`);
    process.exit(1);
  }

  // A page OUTSIDE the set naming one of these as its data.parent would be left pointing at nothing.
  const outside = await q(
    `SELECT id, type, data->>'parent' AS p FROM ${T} WHERE app = $1 AND ${kindClause(db)} AND data->>'parent' IS NOT NULL`,
    [o.app]);
  const broken = outside.filter(r => pageIds.has(String(r.p)) && !pageIds.has(String(r.id)));
  if (broken.length) {
    console.log(`\n  ⚠ ${broken.length} page(s) outside the set name one of these as data.parent — refusing:`);
    for (const r of broken.slice(0, 10)) console.log(`     #${r.id} ${r.type} parent=${r.p}`);
    process.exit(1);
  }

  const [{ bytes }] = await q(
    `SELECT pg_size_pretty(sum(pg_column_size(data))::bigint) AS bytes FROM ${T} WHERE id = ANY($1)`,
    [[...pages, ...comps].map(r => Number(r.id))]);
  console.log(`\n  will delete ${pages.length + comps.length} rows (${bytes})`);

  if (!o.apply) { console.log('\nDRY RUN — nothing was deleted. Re-run with --apply.'); process.exit(0); }

  await db.withTransaction(async (tx) => {
    await tx.promise(`DELETE FROM ${T} WHERE id = ANY($1)`, [comps.map(r => Number(r.id))]);
    await tx.promise(`DELETE FROM ${T} WHERE id = ANY($1)`, [pages.map(r => Number(r.id))]);
  });
  console.log(`\n  deleted ${comps.length} component(s) and ${pages.length} page(s).`);
  process.exit(0);
}

// Pages are the only kind that carries `data.parent` as a page reference.
function kindClause() { return `type LIKE '%|page'`; }

main().catch(e => { console.error(e); process.exit(1); });
