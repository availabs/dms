#!/usr/bin/env node
/**
 * Retype view rows so a view's type names the SOURCE that owns it.
 *
 *     node retype-views-to-source.js --db <config> --app <app> [--apply] [--out <file>]
 *
 * WHY. A view's type should be `{sourceInstance}|{viewInstance}:view`. On data carried forward from
 * the old standalone forms pattern it instead names the PATTERN instance — `form1|version_1:view`,
 * where `form1` was the datasets pattern's instance name at the time. The cause is
 * `updateAttributes` (dms-manager/_utils.jsx), which rewrites every `dms-format` attribute to
 * `{app}+{patternInstance}|{kind}`, so the generic child-create path stamped the pattern instance
 * into every view it made. Explicit creation paths (sourceCreate, AddViewBtn, changeHistory,
 * tenantProvisioning, file-upload-dms-route) all derive the slug from the source and are correct;
 * the last bad row predates the 2026-04-20 fix (75ceabbf).
 *
 * WHAT IT BREAKS TODAY. Two cascades resolve a view through the type path and therefore miss:
 *
 *   dms.controller.js:637  cascadeSourceDelete   WHERE type LIKE '{sourceInstance}|%:view'
 *   dms.controller.js:656  cascadeViewDelete     getParent(row.type) -> lookupSourceId
 *
 * so deleting one of these sources drops neither its view rows nor their split tables.
 *
 * THE AUTHORITY is `source.data.views` — the array the app itself navigates by, and the only place
 * that ever knew the true owner. Run prune-unlisted-views.js first so the arrays and the view rows
 * agree; this script refuses to guess an owner for a view no source lists.
 *
 * SAFE FOR SPLIT TABLES. A view's data table is named from the `:data` row's type and the source
 * id (`splitTableName`, db/table-resolver.js), never from the view row's type, so retyping moves no
 * data. Verified on rowauth-test: 0 of 91 tables carried a pattern-instance slug.
 *
 * COLLISIONS ARE SKIPPED, NOT RESOLVED. Two sources may share an instance name, which makes two
 * views land on one type string. Those are reported and left alone — the fix is to rename one
 * source, which also means renaming its split tables (uda.controller.js:973 builds the `:data` type
 * from the source's CURRENT slug).
 *
 * ⚠ Writes the `type` column. Dry run unless `--apply`. `--out` records the old -> new mapping.
 */
const { getDb, awaitReady, loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');
const { writeFileSync } = require('fs');

const refId = (x) => String(x && typeof x === 'object' ? x.id : x);
const instanceOf = (type) => (type || '').split('|')[1]?.split(':')[0] || null;
const containerOf = (type) => (type || '').split('|')[0] || null;

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }

  const db = getDb(o.db); await awaitReady();
  const config = loadConfig(o.db);
  const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const t = resolveTable(o.app, '', db.type, splitMode);
  const T = db.type === 'postgres' ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;

  console.log(`retype views to their source — ${o.apply ? 'APPLY (writes type)' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}\n`);

  const sources = (await db.query(
    `SELECT id, type, data->'views' AS views FROM ${T} WHERE app = $1 AND type LIKE '%:source'`,
    [o.app])).rows;
  const views = (await db.query(
    `SELECT id, type FROM ${T} WHERE app = $1 AND type LIKE '%:view' ORDER BY id`, [o.app])).rows;

  const owner = new Map();
  for (const s of sources) for (const x of (s.views || [])) owner.set(refId(x), s);

  const plan = [], unowned = [], already = [];
  for (const v of views) {
    const s = owner.get(String(v.id));
    if (!s) { unowned.push(v); continue; }
    const srcInstance = instanceOf(s.type);
    const viewInstance = instanceOf(v.type);
    if (!srcInstance || !viewInstance) { unowned.push(v); continue; }
    const newType = `${srcInstance}|${viewInstance}:view`;
    if (newType === v.type) { already.push(v); continue; }
    plan.push({ id: v.id, oldType: v.type, newType, sourceId: s.id, sourceType: s.type });
  }

  // A new type held by more than one view means two sources share an instance name.
  const byNew = new Map();
  for (const p of plan) byNew.set(p.newType, (byNew.get(p.newType) || []).concat(p));
  const collide = [...byNew].filter(([, list]) => list.length > 1);
  const blocked = new Set(collide.flatMap(([, list]) => list.map(p => p.id)));
  // A type a DIFFERENT, already-correct view holds is equally a collision.
  for (const v of already) {
    for (const p of plan) if (p.newType === v.type) blocked.add(p.id);
  }
  const doable = plan.filter(p => !blocked.has(p.id));

  console.log(`view rows ${views.length}   already correct ${already.length}   to retype ${plan.length}   unowned ${unowned.length}`);
  for (const p of doable) {
    console.log(`   #${p.id}  ${p.oldType}  ->  ${p.newType}      (source #${p.sourceId})`);
  }
  if (collide.length) {
    console.log(`\n  SKIPPED — two sources share an instance name, so these would collide:`);
    for (const [nt, list] of collide) {
      console.log(`     ${nt}`);
      for (const p of list) console.log(`        #${p.id} ${p.oldType}   from source #${p.sourceId} ${p.sourceType}`);
    }
  }
  if (unowned.length) {
    console.log(`\n  SKIPPED — no source lists these (run prune-unlisted-views.js):`);
    for (const v of unowned) console.log(`     #${v.id} ${v.type}`);
  }
  console.log(`\n  will retype ${doable.length}, skip ${plan.length - doable.length}`);

  if (o.out) {
    writeFileSync(o.out, JSON.stringify({ app: o.app, db: o.db, at: new Date().toISOString(), plan: doable }, null, 1));
    console.log(`  mapping written to ${o.out}`);
  }
  if (!o.apply) { console.log('\nDRY RUN — nothing was changed. Re-run with --apply.'); process.exit(0); }

  await db.withTransaction(async (tx) => {
    for (const p of doable) {
      await tx.promise(`UPDATE ${T} SET type = $2 WHERE id = $1`, [p.id, p.newType]);
    }
  });
  console.log(`\n  retyped ${doable.length} view row(s).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
