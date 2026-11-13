#!/usr/bin/env node
'use strict';
/**
 * ATTACH A PGENV TO A SITE — make sure the app has its one `:dmsenv` row for the pgEnv.
 *
 *     node attach-pgenv.js --db <dms config> --app <app> --pg-env <name> [--site <instance>] [--apply]
 *
 * A site keeps ONE row per pgEnv it uses: `{site}|{name}:dmsenv` with `data.pgEnv`. It carries the
 * site's env-level grants and vocabulary and is what `create-source` is asked of; without it the auth
 * layer refuses the pgEnv's sources for that site (`pgEnv … is not attached`, under `enforce`).
 * The pgEnv's sources and views are read from the pgEnv itself and get no rows (dama/pgEnv.js).
 *
 * The row is found, adopted from a `:dmsenv` row of the same name that predates `data.pgEnv`, or
 * created under the site row (`--site` names it when the app has several). Dry run by default. Idempotent.
 *
 * Tasks: planning/tasks/current/pgenv-auth-without-mirror-rows.md; the editor-side attach is
 * planning/tasks/current/pgenv-config-on-the-site-row.md.
 */
function parseArgs() {
  const a = process.argv.slice(2); const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--pg-env') o.pgEnv = a[++i];
    else if (a[i] === '--site') o.site = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app || !o.pgEnv) { console.error('--db, --app and --pg-env are required'); process.exit(1); }
  return o;
}

async function main() {
  const o = parseArgs();
  process.env.DMS_DB_ENV = o.db;                       // the row is written through the DMS controller of this db
  const { getDb, awaitReady } = require('../db');
  getDb(o.db); await awaitReady();
  const { ensureEnvRow } = require('../dama/pgEnv');
  console.log(`\nattach pgEnv — ${o.apply ? 'APPLY' : 'DRY RUN'}\n  db=${o.db}  app=${o.app}  pgEnv=${o.pgEnv}`);
  const r = await ensureEnvRow({ app: o.app, pgEnv: o.pgEnv, site: o.site || '', apply: o.apply, log: (l) => console.log(l) });
  console.log(`  env row: ${r.id ? `#${r.id} (already attached)` : r.create ? `${r.create} ${o.apply ? 'created' : 'to create'}` : `#${r.adopt} ${o.apply ? 'adopted' : 'to adopt'}`}`);
  if (!o.apply && !r.id) console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
