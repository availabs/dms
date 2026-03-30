#!/usr/bin/env node
'use strict';

/**
 * Copy source + view rows from one database to another, and update
 * the dmsEnv refs to point to the (potentially new) IDs.
 *
 * Reads source IDs from a dmsEnv row in the target database, copies
 * the actual source rows (and their view children) from the source
 * database, and updates the dmsEnv refs if any IDs changed.
 *
 * Usage:
 *   node copy-sources-to-dmsenv.js --from dms-mercury --to dms-mercury-2 --env-id 2051753
 *   node copy-sources-to-dmsenv.js --from dms-mercury --to dms-mercury-2 --env-id 2051753 --apply
 */

const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { from: null, to: null, envId: null, apply: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from': opts.from = args[++i]; break;
      case '--to': opts.to = args[++i]; break;
      case '--env-id': opts.envId = +args[++i]; break;
      case '--apply': opts.apply = true; break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.from) { console.error('Missing --from <config>'); process.exit(1); }
  if (!opts.to) { console.error('Missing --to <config>'); process.exit(1); }
  if (!opts.envId) { console.error('Missing --env-id <id>'); process.exit(1); }
  return opts;
}

function createDb(configName) {
  const config = loadConfig(configName);
  if (config.type === 'postgres') return { db: new PostgresAdapter(config), config };
  if (config.type === 'sqlite') return { db: new SqliteAdapter(config), config };
  throw new Error(`Unknown database type: ${config.type}`);
}

async function run(opts) {
  const { db: fromDb, config: fromConfig } = createDb(opts.from);
  const { db: toDb, config: toConfig } = createDb(opts.to);
  const toSplitMode = toConfig.splitMode || 'legacy';
  const isPgTo = toConfig.type === 'postgres';

  console.log(`From: ${opts.from} (${fromConfig.type})`);
  console.log(`To: ${opts.to} (${toConfig.type}, split: ${toSplitMode})`);
  console.log(`dmsEnv ID: ${opts.envId}`);
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}\n`);

  // 1. Read dmsEnv row from target to get source refs and app
  const toTable = toSplitMode === 'legacy'
    ? (isPgTo ? 'dms.data_items' : 'data_items')
    : null; // will resolve per-app below

  // First find the dmsEnv row — try all schemas if per-app
  let envRow;
  if (toSplitMode === 'per-app' && isPgTo) {
    const { rows: schemas } = await toDb.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'dms_%' ORDER BY schema_name`
    );
    for (const { schema_name } of schemas) {
      const { rows } = await toDb.query(
        `SELECT id, app, type, data FROM ${schema_name}.data_items WHERE id = $1`,
        [opts.envId]
      );
      if (rows.length) {
        envRow = { ...rows[0], schema: schema_name };
        break;
      }
    }
  } else {
    const { rows } = await toDb.query(
      `SELECT id, app, type, data FROM ${toTable} WHERE id = $1`,
      [opts.envId]
    );
    if (rows.length) envRow = rows[0];
  }

  if (!envRow) {
    console.error(`dmsEnv row ${opts.envId} not found in target database`);
    process.exit(1);
  }

  const envData = typeof envRow.data === 'string' ? JSON.parse(envRow.data) : envRow.data;
  const app = envRow.app;
  const destTable = envRow.schema ? `${envRow.schema}.data_items` : toTable;

  console.log(`App: ${app}`);
  console.log(`dmsEnv name: ${envData.name}`);
  console.log(`Dest table: ${destTable}`);
  console.log(`Source refs: ${envData.sources?.length || 0}\n`);

  const sourceIds = (envData.sources || []).map(s => +s.id).filter(id => !isNaN(id));
  if (!sourceIds.length) {
    console.log('No source refs to process.');
    process.exit(0);
  }

  // 2. Read source rows from the origin database
  const fromTable = fromConfig.splitMode === 'legacy' || !fromConfig.splitMode
    ? (fromConfig.type === 'postgres' ? 'dms.data_items' : 'data_items')
    : null;

  // Try legacy table first, then per-app
  let sourceRows;
  if (fromTable) {
    const { rows } = await fromDb.query(
      `SELECT id, app, type, data, created_at, created_by, updated_at, updated_by
       FROM ${fromTable} WHERE id = ANY($1)`,
      [sourceIds]
    );
    sourceRows = rows;
  }

  console.log(`Source rows found in origin: ${sourceRows.length} of ${sourceIds.length}`);

  // 3. Find view children
  const allViewIds = [];
  for (const row of sourceRows) {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const views = data?.views || [];
    views.forEach(v => { if (v.id) allViewIds.push(+v.id); });
  }

  let viewRows = [];
  if (allViewIds.length) {
    const { rows } = await fromDb.query(
      `SELECT id, app, type, data, created_at, created_by, updated_at, updated_by
       FROM ${fromTable} WHERE id = ANY($1)`,
      [allViewIds]
    );
    viewRows = rows;
  }

  console.log(`View rows found in origin: ${viewRows.length}`);
  console.log(`Total rows to copy: ${sourceRows.length + viewRows.length}\n`);

  // 4. Check which already exist in target
  const allIds = [...sourceIds, ...allViewIds];
  const { rows: existingRows } = await toDb.query(
    `SELECT id FROM ${destTable} WHERE id = ANY($1)`,
    [allIds]
  );
  const existingIds = new Set(existingRows.map(r => +r.id));
  const newSourceRows = sourceRows.filter(r => !existingIds.has(+r.id));
  const newViewRows = viewRows.filter(r => !existingIds.has(+r.id));

  console.log(`Already exist in target: ${existingIds.size}`);
  console.log(`New source rows to insert: ${newSourceRows.length}`);
  console.log(`New view rows to insert: ${newViewRows.length}\n`);

  if (!opts.apply) {
    if (newSourceRows.length + newViewRows.length > 0) {
      console.log('Rows to insert:');
      for (const r of newSourceRows) {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        console.log(`  source #${r.id} "${d.name}" (${r.type})`);
      }
      for (const r of newViewRows) {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        console.log(`  view   #${r.id} "${d.name}" (${r.type})`);
      }
      console.log('\nRe-run with --apply to execute.');
    } else {
      console.log('All rows already exist. Nothing to do.');
    }
    process.exit(0);
  }

  // 5. Insert rows (preserving original IDs)
  const allNewRows = [...newSourceRows, ...newViewRows];
  if (allNewRows.length) {
    if (isPgTo) {
      const ids = allNewRows.map(r => +r.id);
      const apps = allNewRows.map(r => r.app);
      const types = allNewRows.map(r => r.type);
      const datas = allNewRows.map(r => typeof r.data === 'object' ? JSON.stringify(r.data) : r.data);
      const createdAts = allNewRows.map(r => r.created_at);
      const createdBys = allNewRows.map(r => r.created_by);
      const updatedAts = allNewRows.map(r => r.updated_at);
      const updatedBys = allNewRows.map(r => r.updated_by);

      await toDb.query(
        `INSERT INTO ${destTable} (id, app, type, data, created_at, created_by, updated_at, updated_by)
         SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::jsonb[], $5::timestamptz[], $6::int[], $7::timestamptz[], $8::int[])
         ON CONFLICT (id) DO NOTHING`,
        [ids, apps, types, datas, createdAts, createdBys, updatedAts, updatedBys]
      );
    } else {
      for (const row of allNewRows) {
        await toDb.query(
          `INSERT OR IGNORE INTO ${destTable} (id, app, type, data, created_at, created_by, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [row.id, row.app, row.type,
           typeof row.data === 'object' ? JSON.stringify(row.data) : row.data,
           row.created_at, row.created_by, row.updated_at, row.updated_by]
        );
      }
    }

    console.log(`Inserted ${allNewRows.length} rows into ${destTable}`);
  }

  // 6. Verify all source IDs now exist
  const { rows: verifyRows } = await toDb.query(
    `SELECT id FROM ${destTable} WHERE id = ANY($1)`,
    [sourceIds]
  );
  const foundIds = new Set(verifyRows.map(r => +r.id));
  const missing = sourceIds.filter(id => !foundIds.has(id));

  if (missing.length) {
    console.log(`\nWARNING: ${missing.length} source IDs still missing: ${missing.join(', ')}`);
  } else {
    console.log(`\nAll ${sourceIds.length} source rows verified in target.`);
  }

  // 7. Update sequence if needed (so new inserts don't collide)
  if (isPgTo && toSplitMode === 'per-app' && envRow.schema) {
    const seqName = `${envRow.schema}.data_items_id_seq`;
    const maxId = Math.max(...allIds);
    await toDb.query(
      `SELECT setval('${seqName}', GREATEST(nextval('${seqName}'), $1))`,
      [maxId + 1]
    );
    console.log(`Updated sequence ${seqName} to at least ${maxId + 1}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

const opts = parseArgs();
run(opts).catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
