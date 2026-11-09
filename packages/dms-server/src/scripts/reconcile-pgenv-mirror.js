#!/usr/bin/env node
'use strict';
/**
 * THE PGENV MIRROR RECONCILE — make a site's mirror of a pgEnv equal to the pgEnv (dama/mirror.js).
 *
 *     node reconcile-pgenv-mirror.js --db <dms config> --app <app> [--pg-env <name>] [--apply] [--verify]
 *
 * For each pgEnv (the one named, else every pgEnv the app has a `:dmsenv` row for):
 *   1. the env row: `{site}|{pgEnv}:dmsenv` with `data.pgEnv`, created under the site row (or adopted from
 *      a row of the same name that predates the attribute) — what `ensure-pgenv-rows.js` used to do;
 *   2. a DMS row per `data_manager.sources` / `views` row, parented env → source → view, with the
 *      source's grants: created, updated or deleted so the two sides agree;
 *   3. the app registered in the pgEnv's `settings.mirror_apps`, so the hooks in `createDamaSource`,
 *      `createDamaView`, `updateSource`, `updateView`, `deleteDamaSource` and `deleteDamaView` keep it
 *      current from here on.
 *
 * Dry run by default; `--apply` writes (through the DMS controller, so change_log and sync see it);
 * `--verify` exits non-zero while anything differs. Idempotent. Run it again whenever a plugin wrote
 * `data_manager` by direct SQL (the hooks cannot see that), or after the three grant scripts.
 *
 * Planning: planning/tasks/current/pgenv-mirror-into-dms.md.
 */
function parseArgs() {
  const a = process.argv.slice(2); const o = { apply: false, verify: false, pgEnvs: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--pg-env') o.pgEnvs.push(a[++i]);
    else if (a[i] === '--apply') o.apply = true;
    else if (a[i] === '--verify') o.verify = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }
  return o;
}

async function main() {
  const o = parseArgs();
  process.env.DMS_DB_ENV = o.db;                       // the mirror writes through the DMS controller of this db
  const { getDb, awaitReady } = require('../db');
  const { jsonExtract } = require('../db/query-utils');
  const { dmsMainTable } = require('../routes/uda/utils');
  const mirror = require('../dama/mirror');
  const dms = getDb(o.db); await awaitReady();

  let pgEnvs = o.pgEnvs;
  if (!pgEnvs.length) {
    const tbl = await dmsMainTable(dms, o.app, (require('../db').loadConfig(o.db).splitMode) || process.env.DMS_SPLIT_MODE || 'legacy');
    const { rows } = await dms.query(`SELECT ${jsonExtract('data', 'pgEnv', dms.type)} AS pgenv FROM ${tbl} WHERE app = $1 AND type LIKE '%:dmsenv'`, [o.app]);
    pgEnvs = [...new Set(rows.map(r => r.pgenv).filter(Boolean))];
    if (!pgEnvs.length) { console.log(`  ${o.app} has no :dmsenv row naming a pgEnv; pass --pg-env <name> to create one.`); process.exit(0); }
  }

  console.log(`\npgEnv mirror — ${o.verify ? 'VERIFY' : o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}  pgEnvs=${pgEnvs.join(', ')}`);
  let clean = true;
  for (const pgEnv of pgEnvs) {
    console.log(`\n== ${pgEnv}`);
    getDb(pgEnv); await awaitReady();
    const r = await mirror.reconcile({ app: o.app, pgEnv, apply: o.apply && !o.verify, log: (l) => console.log(l) });
    const sum = (k) => `${r[k].create} to create, ${r[k].update} to update, ${r[k].delete} to delete, ${r[k].same} same`;
    console.log(`  env row: ${r.env.id ? `#${r.env.id}` : r.env.create ? 'to create' : `adopt #${r.env.adopt}`}`);
    console.log(`  sources: ${sum('sources')}`);
    console.log(`  views:   ${sum('views')}`);
    clean = clean && r.clean;
  }
  if (o.verify) {
    console.log(clean ? '\n  ✓ THE MIRROR EQUALS THE PGENV.' : '\n  ✗ the mirror differs from the pgEnv.');
    process.exit(clean ? 0 : 1);
  }
  if (!o.apply) console.log('\nDRY RUN — nothing was written. Re-run with --apply, then --verify.');
  else console.log('\n  done. Re-run with --verify.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
