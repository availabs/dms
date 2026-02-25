#!/usr/bin/env node
'use strict';

/**
 * Migrate from legacy single-table mode to per-app table isolation.
 *
 * Copies rows from the shared `data_items` table into per-app tables
 * (`data_items__{app}`), with split types further routed to per-type
 * tables (`data_items__s{sourceId}_v{viewId}_{docType}`).
 *
 * After migration, switch to per-app mode by setting DMS_SPLIT_MODE=per-app.
 *
 * Usage:
 *   node migrate-to-per-app.js --source dms-sqlite                # dry-run
 *   node migrate-to-per-app.js --source dms-sqlite --apply        # execute
 *   node migrate-to-per-app.js --source dms-postgres --app myapp  # single app
 *
 * Options:
 *   --source <config>  Database config name (required)
 *   --app <name>       Only migrate this app (optional)
 *   --apply            Actually copy rows (default is dry-run)
 *   --batch-size <n>   Rows per INSERT batch (default 500)
 */

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const {
  resolveTable,
  sanitize,
  isSplitType,
  parseType,
  ensureTable,
  ensureSequence,
  getSequenceName,
  buildCreateTableSQL,
} = require('../db/table-resolver');

const BATCH_SIZE_DEFAULT = 500;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, app: null, apply: false, batchSize: BATCH_SIZE_DEFAULT };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--app': opts.app = args[++i]; break;
      case '--apply': opts.apply = true; break;
      case '--batch-size': opts.batchSize = parseInt(args[++i], 10); break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.source) { console.error('Missing --source <config>'); process.exit(1); }
  return opts;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

function createDb(configName) {
  const config = loadConfig(configName);
  if (config.type === 'postgres') return new PostgresAdapter(config);
  if (config.type === 'sqlite') return new SqliteAdapter(config);
  throw new Error(`Unknown database type: ${config.type}`);
}

function fqn(db, table) {
  return db.type === 'postgres' ? `dms.${table}` : table;
}

function jsonField(db, field) {
  return db.type === 'postgres'
    ? `data->>'${field}'`
    : `json_extract(data, '$.${field}')`;
}

// ---------------------------------------------------------------------------
// Source ID lookup (for split table naming)
// ---------------------------------------------------------------------------

const sourceIdCache = new Map();

async function lookupSourceId(db, app, docType) {
  const key = `${app}:${docType}`;
  if (sourceIdCache.has(key)) return sourceIdCache.get(key);

  const tbl = fqn(db, 'data_items');
  const { rows } = await db.query(
    `SELECT id FROM ${tbl} WHERE app = $1 AND ${jsonField(db, 'doc_type')} = $2 AND type LIKE '%|source' ORDER BY id DESC LIMIT 1`,
    [app, docType]
  );
  const id = rows[0]?.id || null;
  sourceIdCache.set(key, id);
  return id;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function migrate(opts) {
  const db = createDb(opts.source);
  const dbType = db.type;
  const schema = dbType === 'postgres' ? 'dms' : 'main';
  const mainTable = fqn(db, 'data_items');

  console.log(`Database: ${opts.source} (${dbType})`);
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Batch size: ${opts.batchSize}\n`);

  // 1. Get distinct apps
  const appFilter = opts.app ? ` WHERE app = '${opts.app}'` : '';
  const { rows: appRows } = await db.query(
    `SELECT DISTINCT app, COUNT(*) as cnt FROM ${mainTable}${appFilter} GROUP BY app ORDER BY app`
  );

  if (appRows.length === 0) {
    console.log('No apps found in data_items.');
    if (db.close) db.close();
    return;
  }

  console.log(`Found ${appRows.length} app(s):`);
  for (const r of appRows) {
    console.log(`  ${r.app}: ${r.cnt} rows`);
  }
  console.log();

  let totalCopied = 0;
  let totalTables = 0;

  for (const { app, cnt } of appRows) {
    console.log(`--- Migrating app: ${app} (${cnt} rows) ---`);

    // 2. Create per-app table and sequence
    const appKey = sanitize(app);
    const perAppTable = `data_items__${appKey}`;
    const seqName = getSequenceName(app, dbType, 'per-app');

    if (opts.apply) {
      await ensureSequence(db, app, dbType, 'per-app');
      await ensureTable(db, schema, perAppTable, dbType, seqName);
    }
    console.log(`  Table: ${perAppTable}`);

    // 3. Get all rows for this app, grouped by type
    const { rows: typeRows } = await db.query(
      `SELECT type, COUNT(*) as cnt FROM ${mainTable} WHERE app = $1 GROUP BY type ORDER BY type`,
      [app]
    );

    for (const { type, cnt: typeCnt } of typeRows) {
      // Determine target table
      let targetTable;

      if (isSplitType(type)) {
        // Split type — route to per-type table
        const parsed = parseType(type);
        const sourceId = parsed ? await lookupSourceId(db, app, parsed.docType) : null;
        const resolved = resolveTable(app, type, dbType, 'per-app', sourceId);
        targetTable = resolved.table;

        if (opts.apply) {
          await ensureTable(db, schema, targetTable, dbType, seqName);
        }
      } else {
        // Non-split — goes into per-app table
        targetTable = perAppTable;
      }

      const targetFqn = fqn(db, targetTable);

      // Check if target already has these rows (idempotent)
      if (opts.apply) {
        const { rows: existing } = await db.query(
          `SELECT COUNT(*) as cnt FROM ${targetFqn} WHERE app = $1 AND type = $2`,
          [app, type]
        );
        const existingCount = +(existing[0]?.cnt || 0);
        if (existingCount >= +typeCnt) {
          console.log(`  ${type}: ${typeCnt} rows → ${targetTable} (already migrated, skipping)`);
          continue;
        }
      }

      console.log(`  ${type}: ${typeCnt} rows → ${targetTable}`);

      if (!opts.apply) {
        totalCopied += +typeCnt;
        continue;
      }

      // 4. Copy rows in batches
      let offset = 0;
      let batchCopied = 0;

      while (offset < +typeCnt) {
        const { rows: batch } = await db.query(
          `SELECT id, app, type, data, created_at, created_by, updated_at, updated_by FROM ${mainTable} WHERE app = $1 AND type = $2 ORDER BY id LIMIT $3 OFFSET $4`,
          [app, type, opts.batchSize, offset]
        );

        if (batch.length === 0) break;

        if (dbType === 'postgres') {
          // PostgreSQL: bulk insert with unnest
          const ids = batch.map(r => r.id);
          const apps = batch.map(r => r.app);
          const types = batch.map(r => r.type);
          const datas = batch.map(r => typeof r.data === 'object' ? JSON.stringify(r.data) : r.data);
          const createdAts = batch.map(r => r.created_at);
          const createdBys = batch.map(r => r.created_by);
          const updatedAts = batch.map(r => r.updated_at);
          const updatedBys = batch.map(r => r.updated_by);

          await db.query(
            `INSERT INTO ${targetFqn} (id, app, type, data, created_at, created_by, updated_at, updated_by)
             SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::jsonb[], $5::timestamptz[], $6::int[], $7::timestamptz[], $8::int[])
             ON CONFLICT (id) DO NOTHING`,
            [ids, apps, types, datas, createdAts, createdBys, updatedAts, updatedBys]
          );
        } else {
          // SQLite: INSERT OR IGNORE per row
          for (const row of batch) {
            await db.query(
              `INSERT OR IGNORE INTO ${targetFqn} (id, app, type, data, created_at, created_by, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [row.id, row.app, row.type, typeof row.data === 'object' ? JSON.stringify(row.data) : row.data, row.created_at, row.created_by, row.updated_at, row.updated_by]
            );
          }
        }

        batchCopied += batch.length;
        offset += batch.length;
      }

      totalCopied += batchCopied;
    }

    // 5. Initialize per-app sequence to max(id) for this app
    if (opts.apply) {
      // Find max id across all tables for this app
      const allTables = [perAppTable];
      for (const { type } of typeRows) {
        if (isSplitType(type)) {
          const parsed = parseType(type);
          const sourceId = parsed ? await lookupSourceId(db, app, parsed.docType) : null;
          const resolved = resolveTable(app, type, dbType, 'per-app', sourceId);
          if (!allTables.includes(resolved.table)) allTables.push(resolved.table);
        }
      }

      let maxId = 0;
      for (const table of allTables) {
        const { rows } = await db.query(`SELECT MAX(id) as max_id FROM ${fqn(db, table)}`);
        const tableMax = +(rows[0]?.max_id || 0);
        if (tableMax > maxId) maxId = tableMax;
      }

      if (maxId > 0) {
        if (dbType === 'postgres') {
          await db.query(`SELECT setval('${fqn(db, seqName)}', $1, true)`, [maxId]);
        } else {
          // SQLite: insert a row with the max id to advance the sequence
          const seqTable = seqName;
          const { rows: seqRows } = await db.query(`SELECT MAX(id) as max_id FROM ${seqTable}`);
          const seqMax = +(seqRows[0]?.max_id || 0);
          if (maxId > seqMax) {
            await db.query(`INSERT INTO ${seqTable} (id) VALUES ($1)`, [maxId]);
          }
        }
        console.log(`  Sequence ${seqName} set to ${maxId}`);
      }

      totalTables += allTables.length;
    }

    console.log();
  }

  // 6. Verify row counts
  if (opts.apply) {
    console.log('--- Verification ---');
    for (const { app, cnt } of appRows) {
      const appKey = sanitize(app);
      const perAppTable = fqn(db, `data_items__${appKey}`);

      // Count rows in per-app table
      const { rows: perAppCount } = await db.query(
        `SELECT COUNT(*) as cnt FROM ${perAppTable} WHERE app = $1`,
        [app]
      );

      // Count rows in all split tables for this app
      const { rows: typeRows } = await db.query(
        `SELECT type, COUNT(*) as cnt FROM ${mainTable} WHERE app = $1 AND type NOT IN (SELECT DISTINCT type FROM ${perAppTable} WHERE app = $1) GROUP BY type`,
        [app]
      );

      let splitCount = 0;
      for (const { type, cnt: tc } of typeRows) {
        if (isSplitType(type)) {
          const parsed = parseType(type);
          const sourceId = parsed ? await lookupSourceId(db, app, parsed.docType) : null;
          const resolved = resolveTable(app, type, dbType, 'per-app', sourceId);
          const { rows } = await db.query(
            `SELECT COUNT(*) as cnt FROM ${fqn(db, resolved.table)} WHERE app = $1 AND type = $2`,
            [app, type]
          );
          splitCount += +(rows[0]?.cnt || 0);
        }
      }

      const totalMigrated = +(perAppCount[0]?.cnt || 0) + splitCount;
      const match = totalMigrated >= +cnt;
      console.log(`  ${app}: ${cnt} source → ${totalMigrated} migrated ${match ? '✓' : '✗ MISMATCH'}`);
    }
  }

  console.log(`\nSummary: ${totalCopied} rows ${opts.apply ? 'copied' : 'would copy'}, ${totalTables} tables ${opts.apply ? 'created' : ''}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Verify data in per-app tables`);
  console.log(`  2. Set DMS_SPLIT_MODE=per-app to activate`);
  console.log(`  3. The original data_items table is preserved as read-only fallback`);

  if (db.close) db.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const opts = parseArgs();
migrate(opts).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
