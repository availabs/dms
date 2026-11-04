#!/usr/bin/env node
'use strict';
/**
 * Give every EXTERNAL env (pgEnv) a `:dmsenv` row, so an external source has the same ancestor an
 * internal one has.
 *
 *     node ensure-pgenv-rows.js --db <config> --app <app> --pg-envs hazmit_dama,npmrds2 [--apply]
 *
 * WHY. A source's vocabulary is declared on its env (`admin.format.js` `dmsEnvFormat`) and reached
 * by walking `parent_id`. Internal sources already have that — measured on `rowauth-test`, 71 of 71
 * point at a `:dmsenv` row. External sources live in a pgEnv's `data_manager.sources`, in a
 * different database, and their "env" was only ever a connection name: no row, nothing to declare
 * on, nothing to walk to. That is why `rowSourceAuth.mergedAuthForSource` had to manufacture a
 * chain out of whatever datasets pattern the REQUEST happened to name — the hole `readAuth.js`
 * calls a placeholder and not a boundary.
 *
 * This creates the missing row. It does NOT create rows for the external SOURCES — 13,847 of them
 * stay where they are, in `data_manager.sources`. Only the env comes across, which is all that is
 * needed for both populations to share one vocabulary reached the same way.
 *
 * The row is an ordinary `{site}|{name}:dmsenv` with `data.pgEnv` naming the external env, so
 * `migrate-row-auth.js --sync-vocabulary` stamps it in pass 1b like any other, and the ancestry
 * provider finds it by that attribute.
 *
 * ⚠ CREATES ROWS. Dry run unless `--apply`. Idempotent: an env that already has a row is skipped.
 *
 * See planning/tasks/current/row-auth-uda-unify-api.md, Phase 2.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable } = require('../db/table-resolver');
const { getInstance } = require('../db/type-utils.js');

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { apply: false, pgEnvs: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--pg-envs') o.pgEnvs = String(a[++i]).split(',').map(s => s.trim()).filter(Boolean);
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }
  if (!o.pgEnvs.length) { console.error('--pg-envs is required (comma-separated)'); process.exit(1); }
  return o;
}

async function main() {
  const o = parseArgs();
  const config = loadConfig(o.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(o.app, '', config.type, config.splitMode);
  const T = config.type === 'postgres' ? `"${t.schema}"."${t.table}"` : t.table;

  console.log(`\nensure pgEnv rows — ${o.apply ? 'APPLY (creates rows)' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}  pgEnvs=${o.pgEnvs.join(', ')}\n`);

  const sites = await q(`SELECT id, type FROM ${T} WHERE app = $1 AND type LIKE '%:site'`, [o.app]);
  if (sites.length !== 1) {
    console.error(`  expected exactly one :site row, found ${sites.length} — resolve by hand.`);
    process.exit(1);
  }
  const site = sites[0];
  const siteInstance = getInstance(site.type);
  console.log(`  site #${site.id} ${site.type}  (instance "${siteInstance}")`);

  const existing = await q(
    `SELECT id, type, data->>'pgEnv' AS pgenv, data->>'name' AS name
       FROM ${T} WHERE app = $1 AND type LIKE '%:dmsenv'`, [o.app]);
  const byPgEnv = new Map(existing.filter(r => r.pgenv).map(r => [r.pgenv, r]));
  const byName  = new Map(existing.map(r => [r.name, r]));
  console.log(`  existing :dmsenv rows ${existing.length}   already naming a pgEnv ${byPgEnv.size}\n`);

  const plan = [];
  for (const pg of o.pgEnvs) {
    if (byPgEnv.has(pg)) { console.log(`  = ${pg}  already has #${byPgEnv.get(pg).id}`); continue; }
    // A row whose NAME matches but which does not yet declare `pgEnv` is the same env recorded
    // before this attribute existed: claim it rather than creating a duplicate.
    if (byName.has(pg)) {
      console.log(`  ~ ${pg}  row #${byName.get(pg).id} matches by name — will set data.pgEnv on it`);
      plan.push({ pgEnv: pg, adopt: byName.get(pg).id });
      continue;
    }
    const type = `${siteInstance}|${pg}:dmsenv`;
    console.log(`  + ${pg}  create ${type}  parent_id=${site.id}`);
    plan.push({ pgEnv: pg, type });
  }

  console.log(`\n  to create ${plan.filter(p => !p.adopt).length}, to adopt ${plan.filter(p => p.adopt).length}`);
  if (!o.apply) { console.log('\nDRY RUN — nothing was written. Re-run with --apply.'); await db.end(); return; }

  for (const p of plan) {
    if (p.adopt) {
      await q(`UPDATE ${T} SET data = jsonb_set(COALESCE(data,'{}'::jsonb), '{pgEnv}', $2::jsonb) WHERE id = $1`,
        [p.adopt, JSON.stringify(p.pgEnv)]);
      console.log(`  adopted #${p.adopt} for ${p.pgEnv}`);
    } else {
      const data = { name: p.pgEnv, pgEnv: p.pgEnv, sources: [] };
      const rows = await q(
        `INSERT INTO ${T} (app, type, data, parent_id) VALUES ($1, $2, $3::jsonb, $4) RETURNING id`,
        [o.app, p.type, JSON.stringify(data), site.id]);
      console.log(`  created #${rows[0].id}  ${p.type}`);
    }
  }
  console.log(`\n  done. Now run migrate-row-auth.js --sync-vocabulary to stamp them (pass 1b).`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
