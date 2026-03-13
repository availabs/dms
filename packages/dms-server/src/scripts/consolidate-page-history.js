#!/usr/bin/env node
'use strict';

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, app: null, apply: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--app': opts.app = args[++i]; break;
      case '--apply': opts.apply = true; break;
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const startTime = Date.now();

  console.log('Consolidate Page Edit History');
  console.log(`  Source: ${args.source}`);
  if (args.app) console.log(`  App filter: ${args.app}`);
  console.log(`  Mode: ${args.apply ? 'APPLY' : 'dry run'}`);
  console.log();

  const db = createDb(args.source);
  const table = fqn(db, 'data_items');

  // Find all pages whose data.history is a JSON array (old format: array of {id, ref} objects).
  // New format pages have history as a single {id, ref} object (not an array).
  // We detect old format by checking if the history value starts with '['.
  const jsonExtract = db.type === 'postgres'
    ? `data->>'history'`
    : `json_extract(data, '$.history')`;

  let where = `type NOT LIKE '%|%' AND ${jsonExtract} LIKE '[%'`;
  const params = [];
  if (args.app) {
    where += ` AND app = $1`;
    params.push(args.app);
  }

  // Use ::TEXT for PG to get raw strings
  const dataCast = db.type === 'postgres' ? '::TEXT' : '';
  const { rows: pages } = await db.query(
    `SELECT id, app, type, data${dataCast} AS data FROM ${table} WHERE ${where} ORDER BY id`,
    params
  );

  console.log(`Found ${pages.length} pages with old-format history`);
  if (pages.length === 0) {
    await db.end();
    return;
  }

  let pagesProcessed = 0;
  let rowsConsolidated = 0;
  let rowsDeleted = 0;
  let pagesSkipped = 0;

  for (const page of pages) {
    const data = typeof page.data === 'string' ? JSON.parse(page.data) : page.data;
    const historyRefs = data.history;

    if (!Array.isArray(historyRefs) || historyRefs.length === 0) {
      pagesSkipped++;
      continue;
    }

    // Fetch all referenced page-edit rows.
    // History arrays can contain a mix of {id, ref} refs and inline entries
    // like {time, type, user}. Only extract numeric IDs — skip inline entries.
    const refIds = historyRefs
      .map(r => r.id)
      .filter(id => id != null && /^\d+$/.test(String(id)));
    if (refIds.length === 0) {
      pagesSkipped++;
      continue;
    }

    const placeholders = refIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: editRows } = await db.query(
      `SELECT id, data${dataCast} AS data FROM ${table} WHERE id IN (${placeholders})`,
      refIds
    );

    const editMap = new Map(editRows.map(r => [String(r.id), r]));

    // Build consolidated entries array
    const entries = [];
    for (const ref of historyRefs) {
      const refId = String(ref.id || ref);
      const editRow = editMap.get(refId);
      if (!editRow) continue;

      const editData = typeof editRow.data === 'string' ? JSON.parse(editRow.data) : editRow.data;
      entries.push({
        action: editData.type || editData.action || '',
        user: editData.user || '',
        time: editData.time || '',
      });
    }

    // Sort entries by time ascending
    entries.sort((a, b) => new Date(a.time) - new Date(b.time));

    // Pick the first (oldest) edit row to keep
    const keepId = refIds[0];
    const deleteIds = refIds.filter(id => String(id) !== String(keepId));

    if (args.apply) {
      // Update the kept row with consolidated entries
      const consolidatedData = JSON.stringify({ entries });
      if (db.type === 'postgres') {
        await db.query(
          `UPDATE ${table} SET data = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [consolidatedData, keepId]
        );
      } else {
        await db.query(
          `UPDATE ${table} SET data = $1, updated_at = datetime('now') WHERE id = $2`,
          [consolidatedData, keepId]
        );
      }

      // Delete the other edit rows
      if (deleteIds.length > 0) {
        const delPlaceholders = deleteIds.map((_, i) => `$${i + 1}`).join(',');
        await db.query(
          `DELETE FROM ${table} WHERE id IN (${delPlaceholders})`,
          deleteIds
        );
      }

      // Update the parent page: history changes from array to single ref
      const ref = historyRefs[0]?.ref || historyRefs.find(r => r.ref)?.ref || '';
      data.history = { id: String(keepId), ref };
      const pageDataStr = JSON.stringify(data);
      if (db.type === 'postgres') {
        await db.query(
          `UPDATE ${table} SET data = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [pageDataStr, page.id]
        );
      } else {
        await db.query(
          `UPDATE ${table} SET data = $1, updated_at = datetime('now') WHERE id = $2`,
          [pageDataStr, page.id]
        );
      }
    }

    pagesProcessed++;
    rowsConsolidated += entries.length;
    rowsDeleted += deleteIds.length;

    if (!args.apply) {
      console.log(`  page ${page.id}: ${refIds.length} edit rows → 1 row (${entries.length} entries, ${deleteIds.length} to delete)`);
    }

    if (pagesProcessed % 100 === 0) {
      process.stdout.write(`\r  Progress: ${pagesProcessed}/${pages.length} pages   `);
    }
  }

  if (pagesProcessed > 100) process.stdout.write('\n');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log(`Done in ${elapsed}s`);
  console.log(`  Pages processed: ${pagesProcessed}`);
  console.log(`  Pages skipped (no history): ${pagesSkipped}`);
  console.log(`  Entries consolidated: ${rowsConsolidated}`);
  console.log(`  Rows ${args.apply ? 'deleted' : 'to delete'}: ${rowsDeleted}`);

  await db.end();
}

if (require.main === module) {
  main().catch(err => {
    console.error(`\nFatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { main };
