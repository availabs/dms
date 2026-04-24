#!/usr/bin/env node
'use strict';

/**
 * cleanup-stale-dmsenv-refs.js
 *
 * Scan every dmsEnv row's `data.sources` array and strip refs that point at
 * source rows that no longer exist. Belt-and-suspenders cleanup for the
 * primary safeguard in `routes/uda/uda.tasks.controller.js#deleteInternalSource`,
 * which already strips dmsEnv refs as part of every internal_table source
 * delete. Use this script when:
 *
 *   - A migration or hand-run SQL deleted source rows directly without going
 *     through the delete endpoint (e.g. the legacy `2140511` case).
 *   - You want to verify the invariant "every dmsEnv ref points at an extant
 *     source row" holds across the whole DB.
 *
 * Usage:
 *   node src/scripts/cleanup-stale-dmsenv-refs.js --source dms-mercury-3
 *   node src/scripts/cleanup-stale-dmsenv-refs.js --source dms-mercury-3 --app mitigat-ny-prod
 *   node src/scripts/cleanup-stale-dmsenv-refs.js --source dms-mercury-3 --apply
 *
 * Dry-run by default. Pass `--apply` to actually update rows.
 *
 * Handles both legacy split mode (shared `dms.data_items`) and per-app split
 * mode (`dms_{app}.data_items`) on PostgreSQL, plus SQLite (single
 * `data_items` table). Mirrors the per-app discovery used by
 * migrate-type-system.js.
 */

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { sanitize } = require('../db/table-resolver');

// ---------- CLI ----------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, app: null, apply: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--app': opts.app = args[++i]; break;
      case '--apply': opts.apply = true; break;
      case '-h': case '--help':
        console.log(`Usage: ${process.argv[1]} --source <db-config> [--app <name>] [--apply]`);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }
  if (!opts.source) {
    console.error('Missing --source <db-config>');
    process.exit(1);
  }
  return opts;
}

function createDb(configName) {
  const config = loadConfig(configName);
  if (config.type === 'postgres') return new PostgresAdapter(config);
  if (config.type === 'sqlite') return new SqliteAdapter(config);
  throw new Error(`Unknown database type: ${config.type}`);
}

// ---------- Discovery ----------

/**
 * Returns array of { app, table } where `table` is the fully-qualified
 * `data_items` table for that app. Mirrors loadAllApps in
 * migrate-type-system.js but only collects the table names we'll query.
 */
async function discoverAppTables(db, opts) {
  const results = [];

  if (db.type !== 'postgres') {
    // SQLite: single table; group by app
    const { rows } = await db.query(`SELECT DISTINCT app FROM data_items WHERE app IS NOT NULL ORDER BY app`);
    for (const r of rows) {
      if (opts.app && r.app !== opts.app) continue;
      results.push({ app: r.app, table: 'data_items' });
    }
    return results;
  }

  // PostgreSQL: try the shared table first, then per-app schemas
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT app FROM dms.data_items WHERE app IS NOT NULL ORDER BY app`
    );
    for (const r of rows) {
      if (opts.app && r.app !== opts.app) continue;
      results.push({ app: r.app, table: 'dms.data_items' });
    }
  } catch (_) {
    // dms.data_items may not exist on per-app-only deployments; ignore.
  }

  // Per-app schemas
  let schemas;
  if (opts.app) {
    schemas = [{ schema_name: `dms_${sanitize(opts.app)}` }];
  } else {
    const { rows } = await db.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'dms_%' ORDER BY schema_name`
    );
    schemas = rows;
  }

  for (const s of schemas) {
    const table = `${s.schema_name}.data_items`;
    try {
      const { rows } = await db.query(
        `SELECT DISTINCT app FROM ${table} WHERE app IS NOT NULL ORDER BY app`
      );
      for (const r of rows) {
        if (opts.app && r.app !== opts.app) continue;
        // Avoid duplicating an app already covered by the shared table
        if (results.some(x => x.app === r.app && x.table === table)) continue;
        results.push({ app: r.app, table });
      }
    } catch (_) {
      // Schema/table missing — skip silently.
    }
  }

  return results;
}

// ---------- Scan ----------

async function findStaleRefsForApp(db, { app, table }) {
  const stale = []; // { dmsEnvId, dmsEnvName, dmsEnvType, sourceIds: number[], total: number, kept: array, newSources: array }

  // Load all dmsEnvs for this app+table
  const { rows: envRows } = await db.query(
    `SELECT id, type, data->>'name' AS name, data AS data FROM ${table} WHERE app = $1 AND type LIKE '%:dmsenv'`,
    [app]
  );

  for (const env of envRows) {
    const data = typeof env.data === 'string' ? JSON.parse(env.data) : (env.data || {});
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    if (!sources.length) continue;

    // Collect numeric ids from refs (skip malformed entries)
    const refIds = sources.map(s => +s.id).filter(Number.isFinite);
    if (!refIds.length) continue;

    // Which of these IDs exist as rows in this table?
    const { rows: extantRows } = await db.query(
      `SELECT id FROM ${table} WHERE id = ANY($1::int[])`,
      [refIds]
    );
    const extant = new Set(extantRows.map(r => +r.id));

    const kept = sources.filter(s => extant.has(+s.id));
    const dropped = sources.filter(s => !extant.has(+s.id));

    if (dropped.length) {
      stale.push({
        dmsEnvId: +env.id,
        dmsEnvName: env.name,
        dmsEnvType: env.type,
        sourceIds: dropped.map(s => +s.id),
        totalBefore: sources.length,
        totalAfter: kept.length,
        newSources: kept,
        data,
      });
    }
  }

  return stale;
}

async function applyStripSourcesForEnv(db, { table }, env) {
  const newData = { ...env.data, sources: env.newSources };
  await db.query(
    `UPDATE ${table} SET data = $1 WHERE id = $2`,
    [JSON.stringify(newData), env.dmsEnvId]
  );
}

// ---------- Main ----------

async function main() {
  const opts = parseArgs();
  const db = createDb(opts.source);

  const mode = opts.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`Cleanup stale dmsEnv refs — ${mode}`);
  console.log(`  source=${opts.source}  ${opts.app ? `app=${opts.app}` : '(all apps)'}`);
  console.log();

  const appTables = await discoverAppTables(db, opts);
  if (!appTables.length) {
    console.log('No matching apps found.');
    if (db.end) await db.end();
    return;
  }

  let totalDmsEnvs = 0;
  let totalStaleRefs = 0;
  let totalEnvsUpdated = 0;

  for (const at of appTables) {
    const stale = await findStaleRefsForApp(db, at);
    // Quick count of dmsEnvs scanned
    const { rows: countRows } = await db.query(
      `SELECT count(*)::int AS n FROM ${at.table} WHERE app = $1 AND type LIKE '%:dmsenv'`,
      [at.app]
    );
    totalDmsEnvs += countRows[0]?.n ?? 0;

    if (!stale.length) {
      console.log(`${at.app} (${at.table}): clean — no stale refs in ${countRows[0]?.n ?? 0} dmsEnvs`);
      continue;
    }

    console.log(`${at.app} (${at.table}): found stale refs in ${stale.length} of ${countRows[0]?.n ?? 0} dmsEnvs`);
    for (const env of stale) {
      const removed = env.totalBefore - env.totalAfter;
      console.log(
        `  dmsEnv id=${env.dmsEnvId} name=${env.dmsEnvName || '(unnamed)'}: ` +
        `removing ${removed} of ${env.totalBefore} refs ` +
        `(stale source ids: ${env.sourceIds.join(',')})`
      );
      totalStaleRefs += removed;

      if (opts.apply) {
        await applyStripSourcesForEnv(db, at, env);
        totalEnvsUpdated++;
      }
    }
  }

  console.log();
  console.log('Summary:');
  console.log(`  dmsEnvs scanned: ${totalDmsEnvs}`);
  console.log(`  stale refs found: ${totalStaleRefs}`);
  if (opts.apply) {
    console.log(`  dmsEnvs updated: ${totalEnvsUpdated}`);
  } else {
    console.log(`  Dry-run — no changes made. Re-run with --apply to strip the refs above.`);
  }

  if (db.end) await db.end();
}

if (require.main === module) {
  main().catch(err => {
    console.error('FATAL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}
