#!/usr/bin/env node
'use strict';

/**
 * Migrate split table names from the old format to the new source-aware format.
 *
 * Old: data_items__{sanitized_type}       (e.g., data_items__traffic_counts_1)
 * New: data_items__s{sourceId}_v{viewId}_{docType}  (e.g., data_items__s290_v1_traffic_counts)
 *
 * Usage:
 *   node migrate-split-tables.js --source dms-sqlite           # dry-run (default)
 *   node migrate-split-tables.js --source dms-sqlite --apply   # execute renames
 *   node migrate-split-tables.js --source dms-postgres --apply
 *
 * Options:
 *   --source <config>  Database config name (required)
 *   --app <name>       Only migrate tables for this app (optional)
 *   --apply            Actually rename tables (default is dry-run)
 */

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { isSplitType, sanitize, parseType } = require('../db/table-resolver');

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

/**
 * List all split tables (data_items__* but not per-app tables like data_items__{app}).
 * Returns array of table name strings.
 */
async function listSplitTables(db) {
  if (db.type === 'postgres') {
    const { rows } = await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'dms' AND tablename LIKE 'data_items__%'`
    );
    return rows.map(r => r.tablename);
  }
  // SQLite
  const { rows } = await db.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'data_items__%'`
  );
  return rows.map(r => r.name);
}

/**
 * Reverse-engineer the original type string from an old-format table name.
 * data_items__traffic_counts_1 → traffic_counts-1
 * data_items__traffic_counts_1_invalid_entry → traffic_counts-1-invalid-entry
 *
 * Returns the type string, or null if the table doesn't match the old naming pattern.
 */
function reverseOldTableName(tableName) {
  // Strip data_items__ prefix
  if (!tableName.startsWith('data_items__')) return null;
  const rest = tableName.slice('data_items__'.length);

  // Skip tables that already use new naming (s{id}_v{id}_...)
  if (/^s\d+_v\d+_/.test(rest)) return null;

  // Skip per-app tables (contain double underscore: data_items__{app}__{type})
  if (rest.includes('__')) return null;

  // Reverse sanitization: restore hyphens before numeric parts
  // The old naming is sanitize(type) where type is like "traffic_counts-1" → "traffic_counts_1"
  // We need to find the last underscore before a numeric-only suffix to restore the hyphen.

  // Handle invalid_entry suffix first
  let isInvalid = false;
  let core = rest;
  if (core.endsWith('_invalid_entry')) {
    isInvalid = true;
    core = core.slice(0, -'_invalid_entry'.length);
  }

  // Find the view_id: last underscore-separated numeric segment
  const lastUnderscore = core.lastIndexOf('_');
  if (lastUnderscore === -1) return null;

  const possibleViewId = core.slice(lastUnderscore + 1);
  if (!/^\d+$/.test(possibleViewId)) return null;

  const docType = core.slice(0, lastUnderscore);
  if (!docType) return null;

  // Reconstruct the original type
  const type = `${docType}-${possibleViewId}${isInvalid ? '-invalid-entry' : ''}`;

  // Verify it's actually a split type
  if (!isSplitType(type)) return null;

  return type;
}

/**
 * Look up source_id for a given app + docType.
 */
async function findSourceId(db, app, docType) {
  const jsonExpr = db.type === 'postgres'
    ? "data->>'doc_type'"
    : "json_extract(data, '$.doc_type')";
  const tbl = db.type === 'postgres' ? 'dms.data_items' : 'data_items';
  const { rows } = await db.query(
    `SELECT id FROM ${tbl} WHERE app = $1 AND ${jsonExpr} = $2 AND type LIKE '%|source' ORDER BY id DESC LIMIT 1`,
    [app, docType]
  );
  return rows[0]?.id || null;
}

/**
 * Get the distinct apps that have data in a given table.
 */
async function getAppsInTable(db, tableName) {
  const tbl = db.type === 'postgres' ? `dms.${tableName}` : tableName;
  const { rows } = await db.query(`SELECT DISTINCT app FROM ${tbl}`);
  return rows.map(r => r.app);
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function migrate(opts) {
  const db = createDb(opts.source);
  console.log(`Database: ${opts.source} (${db.type})`);
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}\n`);

  const tables = await listSplitTables(db);
  console.log(`Found ${tables.length} data_items__* tables\n`);

  let renamed = 0;
  let skipped = 0;
  let failed = 0;

  for (const oldTable of tables) {
    const type = reverseOldTableName(oldTable);
    if (!type) {
      // Could be a per-app table or already new-format — skip
      continue;
    }

    const parsed = parseType(type);
    if (!parsed) {
      console.log(`  SKIP ${oldTable} — could not parse type "${type}"`);
      skipped++;
      continue;
    }

    // Get the apps that have data in this table
    const apps = await getAppsInTable(db, oldTable);
    if (apps.length === 0) {
      console.log(`  SKIP ${oldTable} — empty table`);
      skipped++;
      continue;
    }

    if (opts.app && !apps.includes(opts.app)) {
      continue; // Not for our target app
    }

    // For each app that uses this table, look up the source_id
    // (In practice, a split table should only have one app's data)
    const app = opts.app || apps[0];
    const sourceId = await findSourceId(db, app, parsed.docType);

    if (!sourceId) {
      console.log(`  SKIP ${oldTable} — no source record found for app="${app}" doc_type="${parsed.docType}"`);
      skipped++;
      continue;
    }

    const suffix = parsed.isInvalid ? '_invalid' : '';
    const newTable = `data_items__s${sourceId}_v${parsed.viewId}_${parsed.docType}${suffix}`;

    if (oldTable === newTable) {
      console.log(`  SKIP ${oldTable} — already has new name`);
      skipped++;
      continue;
    }

    console.log(`  ${oldTable} → ${newTable}`);

    if (opts.apply) {
      try {
        if (db.type === 'postgres') {
          await db.query(`ALTER TABLE dms.${oldTable} RENAME TO ${newTable}`);
          // Rename the index too
          const oldIdx = `ix_${oldTable}`.slice(0, 63);
          const newIdx = `ix_${newTable}`.slice(0, 63);
          try {
            await db.query(`ALTER INDEX IF EXISTS dms.${oldIdx} RENAME TO ${newIdx}`);
          } catch (e) {
            // Index might not exist or have a different name — not fatal
          }
        } else {
          await db.query(`ALTER TABLE ${oldTable} RENAME TO ${newTable}`);
          // SQLite: indexes cannot be renamed, must drop and recreate
          try {
            await db.query(`DROP INDEX IF EXISTS idx_${oldTable}_app_type`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_${newTable}_app_type ON ${newTable} (app, type)`);
          } catch (e) {
            console.log(`    Warning: index recreation failed: ${e.message}`);
          }
        }
        renamed++;
      } catch (e) {
        console.log(`    ERROR: ${e.message}`);
        failed++;
      }
    } else {
      renamed++;
    }
  }

  console.log(`\nSummary: ${renamed} ${opts.apply ? 'renamed' : 'would rename'}, ${skipped} skipped, ${failed} failed`);

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
