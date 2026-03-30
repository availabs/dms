#!/usr/bin/env node
'use strict';

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { buildCreateTableSQL, resolveTable } = require('../db/table-resolver');
const {
  findOrphanedPatterns, findOrphanedPages, findOrphanedSections,
  findOrphanedSources, findOrphanedViews,
} = require('./cleanup-db');
const { readFileSync } = require('fs');
const { join } = require('path');

let BATCH_SIZE = 1000;
let CURSOR_FETCH = 500;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, target: null, clearTarget: false, app: null, dryRun: false, skipOrphans: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--target': opts.target = args[++i]; break;
      case '--clear-target': opts.clearTarget = true; break;
      case '--app': opts.app = args[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--skip-orphans': opts.skipOrphans = true; break;
      case '--batch-size': opts.batchSize = parseInt(args[++i], 10); break;
      case '--cursor-fetch': opts.cursorFetch = parseInt(args[++i], 10); break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.source) { console.error('Missing --source <config>'); process.exit(1); }
  if (!opts.target) { console.error('Missing --target <config>'); process.exit(1); }
  if (opts.source === opts.target) {
    console.error('Source and target must be different config names');
    process.exit(1);
  }

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

/** Fully-qualified table name for the given adapter. */
function fqn(db, table) {
  return db.type === 'postgres' ? `dms.${table}` : table;
}

/** Ensure the target has the DMS schema (data_items, formats, dms_id_seq). */
async function ensureDmsSchema(db) {
  const schema = db.type === 'postgres' ? 'dms' : 'main';
  const exists = await db.tableExists(schema, 'data_items');
  if (exists) return;

  const sqlFile = db.type === 'sqlite' ? 'dms.sqlite.sql' : 'dms.sql';
  const sql = readFileSync(join(__dirname, '../db/sql/dms', sqlFile), 'utf8');

  if (db.type === 'sqlite') {
    for (const stmt of sql.split(';').filter(s => s.trim())) {
      await db.query(stmt + ';');
    }
  } else {
    await db.query(sql);
  }
  console.log('  Initialized DMS schema on target');
}

async function tableExists(db, table) {
  const schema = db.type === 'postgres' ? 'dms' : 'main';
  return db.tableExists(schema, table);
}

async function countRows(db, table, appFilter) {
  const name = fqn(db, table);
  const where = appFilter ? ' WHERE app = $1' : '';
  const values = appFilter ? [appFilter] : [];
  const { rows } = await db.query(`SELECT COUNT(*) AS count FROM ${name}${where}`, values);
  return Number(rows[0].count);
}

// ---------------------------------------------------------------------------
// Split table discovery
// ---------------------------------------------------------------------------

async function discoverSplitTables(db) {
  if (db.type === 'sqlite') {
    const { rows } = await db.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'data_items__%'`
    );
    return rows.map(r => r.name).sort();
  }
  const { rows } = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'dms' AND tablename LIKE 'data_items__%'`
  );
  return rows.map(r => r.tablename).sort();
}

async function ensureSplitTable(db, table) {
  const schema = db.type === 'postgres' ? 'dms' : 'main';
  const exists = await db.tableExists(schema, table);
  if (exists) return;

  const seqName = db.type === 'postgres' ? 'dms.data_items_id_seq' : null;
  const ddl = buildCreateTableSQL(schema, table, db.type, seqName);

  if (db.type === 'sqlite') {
    for (const stmt of ddl.split(';').filter(s => s.trim())) {
      await db.query(stmt + ';');
    }
  } else {
    await db.query(ddl);
  }
}

/**
 * Resolve the target table name for a source split table.
 * Reads one row to get the type, then uses resolveTable() to compute the
 * correct name for the target database (handles PG 63-char truncation).
 */
async function resolveTargetSplitTable(sourceDb, sourceTable, targetDbType) {
  const name = fqn(sourceDb, sourceTable);
  const { rows } = await sourceDb.query(`SELECT app, type FROM ${name} LIMIT 1`);
  if (rows.length === 0) return sourceTable;
  const { table } = resolveTable(rows[0].app, rows[0].type, targetDbType, 'legacy');
  return table;
}

// ---------------------------------------------------------------------------
// Clear target
// ---------------------------------------------------------------------------

async function clearTarget(db) {
  const splitTables = await discoverSplitTables(db);
  for (const t of splitTables) {
    await db.query(`DELETE FROM ${fqn(db, t)}`);
  }
  await db.query(`DELETE FROM ${fqn(db, 'data_items')}`);
  await db.query(`DELETE FROM ${fqn(db, 'formats')}`);

  if (db.type === 'sqlite') {
    const seqExists = await db.tableExists('main', 'dms_id_seq');
    if (seqExists) await db.query('DELETE FROM dms_id_seq');
  }
  console.log(`  Cleared ${2 + splitTables.length} tables`);
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function selectColumns(table) {
  // Cast JSON columns to TEXT to avoid the pg driver parsing jsonb into JS objects
  // (which would then be re-stringified on write). SQLite adapter strips ::TEXT casts.
  if (table === 'formats') {
    return 'id, app, type, attributes::TEXT AS attributes, created_at::TEXT AS created_at, updated_at::TEXT AS updated_at';
  }
  return 'id, app, type, data::TEXT AS data, created_at::TEXT AS created_at, created_by, updated_at::TEXT AS updated_at, updated_by';
}

async function readBatch(db, table, lastId, appFilter) {
  const name = fqn(db, table);
  const cols = selectColumns(table);
  let where = 'id > $1';
  const values = [lastId];
  if (appFilter) {
    where += ' AND app = $2';
    values.push(appFilter);
  }
  const { rows } = await db.query(
    `SELECT ${cols} FROM ${name} WHERE ${where} ORDER BY id LIMIT ${BATCH_SIZE}`,
    values
  );
  return rows;
}

function buildInsert(db, table, row) {
  const name = fqn(db, table);

  if (table === 'formats') {
    const override = db.type === 'postgres' ? ' OVERRIDING SYSTEM VALUE' : '';
    return {
      text: `INSERT INTO ${name} (id, app, type, attributes, created_at, updated_at)${override} VALUES ($1, $2, $3, $4, $5, $6)`,
      values: [row.id, row.app, row.type, row.attributes, row.created_at, row.updated_at]
    };
  }

  return {
    text: `INSERT INTO ${name} (id, app, type, data, created_at, created_by, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    values: [row.id, row.app, row.type, row.data, row.created_at, row.created_by, row.updated_at, row.updated_by]
  };
}

// ---------------------------------------------------------------------------
// Copy a single table
// ---------------------------------------------------------------------------

/** Convert a JS value for raw better-sqlite3 .run() — stringify objects, pass through primitives. */
function sqliteVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Ensure a JSON column value is a string (or null) for PG unnest text[] → ::jsonb cast. */
function toJsonStr(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * Create a write function for the target database.
 * SQLite targets use better-sqlite3's synchronous prepared-statement API
 * (one prepare, transaction wrapper) which is ~100x faster than routing
 * every row through the async adapter with per-row SQL parsing.
 * PostgreSQL targets use unnest() for bulk inserts — one statement per batch.
 */
function createWriter(targetDb, tgtTable, isFormats) {
  if (targetDb.type === 'sqlite') {
    const rawDb = targetDb.getPool();
    const stmt = isFormats
      ? rawDb.prepare(`INSERT INTO ${tgtTable} (id, app, type, attributes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      : rawDb.prepare(`INSERT INTO ${tgtTable} (id, app, type, data, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    return rawDb.transaction((rows) => {
      for (const row of rows) {
        if (isFormats) {
          stmt.run(row.id, row.app, row.type, sqliteVal(row.attributes), row.created_at, row.updated_at);
        } else {
          stmt.run(row.id, row.app, row.type, sqliteVal(row.data), row.created_at, row.created_by ?? null, row.updated_at, row.updated_by ?? null);
        }
      }
    });
  }

  // PostgreSQL: bulk insert via unnest() — one statement per batch
  const name = fqn(targetDb, tgtTable);

  if (isFormats) {
    return async (rows) => {
      if (rows.length === 0) return;
      await targetDb.query(`
        INSERT INTO ${name} (id, app, type, attributes, created_at, updated_at)
        OVERRIDING SYSTEM VALUE
        SELECT u.id, u.app, u.type, u.attrs::jsonb, u.created_at::timestamptz, u.updated_at::timestamptz
        FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
        AS u(id, app, type, attrs, created_at, updated_at)
      `, [
        rows.map(r => r.id),
        rows.map(r => r.app),
        rows.map(r => r.type),
        rows.map(r => toJsonStr(r.attributes)),
        rows.map(r => r.created_at),
        rows.map(r => r.updated_at),
      ]);
    };
  }

  return async (rows) => {
    if (rows.length === 0) return;
    await targetDb.query(`
      INSERT INTO ${name} (id, app, type, data, created_at, created_by, updated_at, updated_by)
      SELECT u.id, u.app, u.type, u.data::jsonb, u.created_at::timestamptz, u.created_by::int, u.updated_at::timestamptz, u.updated_by::int
      FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
      AS u(id, app, type, data, created_at, created_by, updated_at, updated_by)
    `, [
      rows.map(r => r.id),
      rows.map(r => r.app),
      rows.map(r => r.type),
      rows.map(r => toJsonStr(r.data)),
      rows.map(r => r.created_at),
      rows.map(r => r.created_by ?? null),
      rows.map(r => r.updated_at),
      rows.map(r => r.updated_by ?? null),
    ]);
  };
}

/** Format seconds as 1h 23m 45s / 5m 12s / 30s. */
function formatEta(secs) {
  secs = Math.round(secs);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60) % 60;
  const h = Math.floor(secs / 3600);
  return h > 0 ? `${h}h ${m}m ${secs % 60}s` : `${m}m ${secs % 60}s`;
}

/** Write a progress line: label: 12345/100000 rows (12.3%) — ETA 3m 22s */
function writeProgress(label, copied, total, startMs) {
  const pct = ((copied / total) * 100).toFixed(1);
  const elapsed = (Date.now() - startMs) / 1000;
  let eta = '';
  if (copied > 0 && copied < total) {
    const remaining = (elapsed / copied) * (total - copied);
    eta = ` — ETA ${formatEta(remaining)}`;
  }
  process.stdout.write(`\r  ${label}: ${copied}/${total} rows (${pct}%)${eta}   `);
}

/**
 * Copy rows from source to target using cursor-based streaming for PostgreSQL
 * sources (avoids pg driver buffering entire result sets in memory) and
 * LIMIT/OFFSET-style batching for SQLite sources.
 */
async function copyTable(sourceDb, targetDb, srcTable, tgtTable, appFilter, dryRun, excludeIds) {
  const label = appFilter ? `${srcTable} (app=${appFilter})` : srcTable;

  // Skip tables that don't exist in the source
  if (!await tableExists(sourceDb, srcTable)) {
    console.log(`  ${label}: table not found (skip)`);
    return 0;
  }

  const total = await countRows(sourceDb, srcTable, appFilter);

  if (total === 0) {
    console.log(`  ${label}: 0 rows (skip)`);
    return 0;
  }
  if (dryRun) {
    const skipped = excludeIds ? excludeIds.size : 0;
    const effective = skipped ? `~${total - skipped}` : `${total}`;
    console.log(`  ${label}: ${effective} rows (dry run${skipped ? `, skipping ${skipped} orphans` : ''})`);
    return total - skipped;
  }

  const isFormats = srcTable === 'formats';
  const writeBatch = createWriter(targetDb, tgtTable, isFormats);
  const showProgress = total > BATCH_SIZE;
  const startMs = Date.now();

  let copied = 0;
  let skipped = 0;

  // Use cursor-based streaming for PostgreSQL sources to avoid OOM
  if (sourceDb.type === 'postgres') {
    const client = await sourceDb.getConnection();
    try {
      const name = fqn(sourceDb, srcTable);
      const cols = selectColumns(srcTable);
      let where = appFilter ? ' WHERE app = $1' : '';
      const values = appFilter ? [appFilter] : [];

      await client.query('BEGIN');
      await client.query(
        `DECLARE copy_cursor NO SCROLL CURSOR FOR SELECT ${cols} FROM ${name}${where} ORDER BY id`,
        values
      );

      let writeBuffer = [];

      while (true) {
        const { rows: chunk } = await client.query(`FETCH ${CURSOR_FETCH} FROM copy_cursor`);
        if (chunk.length === 0) {
          // Flush remaining buffer
          if (writeBuffer.length > 0) {
            await writeBatch(writeBuffer);
            copied += writeBuffer.length;
            writeBuffer = [];
          }
          break;
        }

        // Filter out orphaned rows
        let filtered = chunk;
        if (excludeIds && excludeIds.size > 0) {
          const before = filtered.length;
          filtered = filtered.filter(r => !excludeIds.has(r.id));
          skipped += before - filtered.length;
        }

        writeBuffer.push(...filtered);

        // Flush when buffer reaches BATCH_SIZE
        if (writeBuffer.length >= BATCH_SIZE) {
          await writeBatch(writeBuffer);
          copied += writeBuffer.length;
          writeBuffer = [];

          if (showProgress) writeProgress(label, copied, total, startMs);
        }
      }

      await client.query('CLOSE copy_cursor');
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  } else {
    // SQLite: use LIMIT-based batching (synchronous driver, no buffering issue)
    let lastId = 0;
    while (true) {
      let rows = await readBatch(sourceDb, srcTable, lastId, appFilter);
      if (rows.length === 0) break;

      lastId = rows[rows.length - 1].id;

      // Filter out orphaned rows
      if (excludeIds && excludeIds.size > 0) {
        const before = rows.length;
        rows = rows.filter(r => !excludeIds.has(r.id));
        skipped += before - rows.length;
      }

      if (rows.length > 0) {
        await writeBatch(rows);
      }

      copied += rows.length;

      if (showProgress) writeProgress(label, copied, total, startMs);
    }
  }

  if (showProgress) process.stdout.write('\n');
  const elapsed = formatEta((Date.now() - startMs) / 1000);
  const skipMsg = skipped > 0 ? ` (${skipped} orphans skipped)` : '';
  console.log(`  ${label}: ${copied} rows in ${elapsed}${skipMsg}`);
  return copied;
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

async function getMaxId(db, tables) {
  let maxId = 0;
  for (const table of tables) {
    const count = await countRows(db, table, null);
    if (count === 0) continue;
    const { rows } = await db.query(`SELECT MAX(id) AS max_id FROM ${fqn(db, table)}`);
    maxId = Math.max(maxId, Number(rows[0].max_id) || 0);
  }
  return maxId;
}

async function resetSequences(db, dataMaxId) {
  if (db.type === 'postgres') {
    // Reset data_items sequence
    await db.query(
      `SELECT setval('dms.data_items_id_seq', GREATEST($1, 1))`, [dataMaxId]
    );
    // Reset formats identity sequence
    const { rows } = await db.query(
      `SELECT pg_get_serial_sequence('dms.formats', 'id') AS seq`
    );
    if (rows[0]?.seq) {
      const fmtMax = await getMaxId(db, ['formats']);
      await db.query(`SELECT setval($1, GREATEST($2, 1))`, [rows[0].seq, fmtMax]);
    }
  } else {
    // SQLite: advance dms_id_seq autoincrement counter
    const seqExists = await db.tableExists('main', 'dms_id_seq');
    if (seqExists && dataMaxId > 0) {
      await db.query('DELETE FROM dms_id_seq');
      await db.query('INSERT INTO dms_id_seq (id) VALUES ($1)', [dataMaxId]);
    }
  }
  console.log('  Sequences reset');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const startTime = Date.now();

  console.log('DMS Database Copy');
  console.log(`  Source: ${args.source}`);
  console.log(`  Target: ${args.target}`);
  if (args.app) console.log(`  App filter: ${args.app}`);
  if (args.batchSize) BATCH_SIZE = args.batchSize;
  if (args.cursorFetch) CURSOR_FETCH = args.cursorFetch;
  if (args.skipOrphans) console.log(`  Skip orphans: yes`);
  if (args.dryRun) console.log(`  Dry run: yes`);
  if (args.batchSize) console.log(`  Batch size: ${args.batchSize}`);
  if (args.cursorFetch) console.log(`  Cursor fetch: ${args.cursorFetch}`);
  console.log();

  // Connect
  const sourceDb = createDb(args.source);
  const targetDb = createDb(args.target);

  console.log(`  Source db: ${sourceDb.type} (${sourceDb.getDb()})`);
  console.log(`  Target db: ${targetDb.type} (${targetDb.getDb()})`);
  console.log();

  // Ensure target has DMS tables
  await ensureDmsSchema(targetDb);

  // Validate target is empty (or --clear-target)
  if (!args.dryRun) {
    const dataCount = await countRows(targetDb, 'data_items', null);
    const fmtCount = await countRows(targetDb, 'formats', null);

    if (dataCount > 0 || fmtCount > 0) {
      if (!args.clearTarget) {
        console.error(`Target has existing data (${dataCount} data_items, ${fmtCount} formats).`);
        console.error('Use --clear-target to delete existing data first.');
        process.exit(1);
      }
      console.log('Clearing target...');
      await clearTarget(targetDb);
    }
  }

  // --- Detect orphans ---
  let excludeIds = null;
  if (args.skipOrphans) {
    console.log('Detecting orphans...');
    const detectors = [
      findOrphanedPatterns, findOrphanedPages, findOrphanedSections,
      findOrphanedSources, findOrphanedViews,
    ];
    excludeIds = new Set();
    for (const detect of detectors) {
      const orphans = await detect(sourceDb, args.app);
      for (const row of orphans) excludeIds.add(row.id);
    }
    console.log(`  Found ${excludeIds.size} orphaned rows to skip`);
    console.log();
  }

  // --- Copy tables ---
  console.log('Copying...');
  const results = {};

  // 1. formats (orphans are data_items only, never formats)
  results.formats = await copyTable(sourceDb, targetDb, 'formats', 'formats', args.app, args.dryRun);

  // 2. data_items (apply orphan exclusion)
  results.data_items = await copyTable(sourceDb, targetDb, 'data_items', 'data_items', args.app, args.dryRun, excludeIds);

  // 3. split tables (orphans don't exist in split tables — dataset row data)
  const splitTables = await discoverSplitTables(sourceDb);
  results.splitRows = 0;
  results.splitCount = splitTables.length;

  for (const srcTable of splitTables) {
    const tgtTable = await resolveTargetSplitTable(sourceDb, srcTable, targetDb.type);
    if (!args.dryRun) await ensureSplitTable(targetDb, tgtTable);
    results.splitRows += await copyTable(sourceDb, targetDb, srcTable, tgtTable, args.app, args.dryRun);
  }

  // --- Reset sequences ---
  if (!args.dryRun) {
    const allDataTables = ['data_items', ...await discoverSplitTables(targetDb)];
    const maxId = await getMaxId(targetDb, allDataTables);
    await resetSequences(targetDb, maxId);
  }

  // --- Verify ---
  if (!args.dryRun) {
    console.log('\nVerifying...');
    let ok = true;
    const skipped = excludeIds ? excludeIds.size : 0;

    for (const table of ['formats', 'data_items']) {
      if (!await tableExists(sourceDb, table)) continue;
      const src = await countRows(sourceDb, table, args.app);
      const tgt = await countRows(targetDb, table, args.app);
      const expectedDiff = (table === 'data_items') ? skipped : 0;
      if (src - expectedDiff !== tgt) {
        console.log(`  MISMATCH ${table}: source=${src} target=${tgt}${expectedDiff ? ` (expected diff: ${expectedDiff} orphans)` : ''}`);
        ok = false;
      }
    }

    for (const srcTable of splitTables) {
      const tgtTable = await resolveTargetSplitTable(sourceDb, srcTable, targetDb.type);
      const src = await countRows(sourceDb, srcTable, args.app);
      const tgt = await countRows(targetDb, tgtTable, args.app);
      if (src !== tgt) {
        console.log(`  MISMATCH ${srcTable}: source=${src} target=${tgt}`);
        ok = false;
      }
    }

    console.log(ok ? '  All counts match' : '  VERIFICATION FAILED');
  }

  // --- Summary ---
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
  console.log(`  formats: ${results.formats} rows`);
  console.log(`  data_items: ${results.data_items} rows`);
  if (results.splitCount > 0) {
    console.log(`  split tables (${results.splitCount}): ${results.splitRows} rows`);
  }

  // Cleanup
  await sourceDb.end();
  await targetDb.end();
}

if (require.main === module) {
  main().catch(err => {
    console.error(`\nFatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { createDb, fqn, ensureDmsSchema, countRows, discoverSplitTables, copyTable, clearTarget, resetSequences, getMaxId };
