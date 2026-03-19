#!/usr/bin/env node
'use strict';

/**
 * Rename old-style split tables to new naming convention.
 *
 * Old naming: data_items__{sanitized_type}  (e.g., data_items__actions_revised_1074456)
 * New naming: data_items__s{sourceId}_v{viewId}_{docType}  (e.g., data_items__s1029065_v1074456_actions_revised)
 *
 * Also renames associated indexes.
 *
 * Usage:
 *   node rename-split-tables.js --db dms-mercury-2
 *   node rename-split-tables.js --db dms-mercury-2 --apply
 */

const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { sanitize, parseType, isSplitType } = require('../db/table-resolver');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { db: null, apply: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--db': opts.db = args[++i]; break;
      case '--apply': opts.apply = true; break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }
  if (!opts.db) { console.error('Missing --db <config>'); process.exit(1); }
  return opts;
}

async function run(opts) {
  const config = loadConfig(opts.db);
  if (config.type !== 'postgres') {
    console.error('This script only supports PostgreSQL databases');
    process.exit(1);
  }

  const db = new PostgresAdapter(config);
  const splitMode = config.splitMode || 'legacy';
  console.log(`Database: ${opts.db} (split: ${splitMode})`);
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}\n`);

  // Find all per-app schemas
  const { rows: schemas } = await db.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'dms_%' ORDER BY schema_name`
  );

  let totalRenamed = 0;

  for (const { schema_name } of schemas) {
    console.log(`\n--- Schema: ${schema_name} ---`);

    // Get all split tables in this schema (old naming: no 's' prefix after data_items__)
    const { rows: tables } = await db.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = $1
         AND tablename LIKE 'data_items__%'
         AND tablename != 'data_items'
         AND tablename NOT LIKE 'data_items__s%'
       ORDER BY tablename`,
      [schema_name]
    );

    if (!tables.length) {
      console.log('  No old-named tables found');
      continue;
    }

    // Get all sources in this schema
    const { rows: sources } = await db.query(
      `SELECT id, data->>'doc_type' as doc_type, data->'views' as views
       FROM ${schema_name}.data_items
       WHERE type LIKE '%|source'`
    );

    // Build a map: view_id → source_id
    const viewToSource = new Map();
    for (const src of sources) {
      const views = typeof src.views === 'string' ? JSON.parse(src.views) : (src.views || []);
      for (const v of views) {
        if (v.id) viewToSource.set(String(v.id), { sourceId: src.id, docType: src.doc_type });
      }
    }

    // Build a map: sanitized doc_type → source_id (for fallback)
    const docTypeToSource = new Map();
    for (const src of sources) {
      const key = sanitize(src.doc_type);
      // If multiple sources have the same sanitized doc_type, keep the latest (highest ID)
      if (!docTypeToSource.has(key) || src.id > docTypeToSource.get(key).sourceId) {
        docTypeToSource.set(key, { sourceId: src.id, docType: src.doc_type });
      }
    }

    for (const { tablename } of tables) {
      // Parse the old table name to extract doc_type and view_id
      // Old naming: data_items__{doc_type}_{view_id} or data_items__{doc_type}_{view_id}_invalid_entry
      const isInvalid = tablename.endsWith('_invalid_entry');
      const core = tablename.replace('data_items__', '').replace(/_invalid_entry$/, '');

      // The view_id is the last numeric segment after underscore
      const match = core.match(/^(.+?)_(\d+)$/);
      if (!match) {
        console.log(`  SKIP ${tablename} (can't parse doc_type/view_id)`);
        continue;
      }

      const [, docTypePart, viewId] = match;

      // Try to find the source via view_id → source mapping first
      let sourceId = null;
      const viewMapping = viewToSource.get(viewId);
      if (viewMapping && sanitize(viewMapping.docType) === docTypePart) {
        sourceId = viewMapping.sourceId;
      }

      // Fallback: match by sanitized doc_type
      if (!sourceId) {
        const dtMapping = docTypeToSource.get(docTypePart);
        if (dtMapping) sourceId = dtMapping.sourceId;
      }

      if (!sourceId) {
        console.log(`  SKIP ${tablename} (no source found for doc_type=${docTypePart})`);
        continue;
      }

      const invalidSuffix = isInvalid ? '_invalid' : '';
      const newName = `data_items__s${sourceId}_v${viewId}_${docTypePart}${invalidSuffix}`;

      if (newName === tablename) {
        continue; // Already correct
      }

      // Check if new name already exists
      const { rows: existing } = await db.query(
        `SELECT 1 FROM pg_tables WHERE schemaname = $1 AND tablename = $2`,
        [schema_name, newName]
      );
      if (existing.length) {
        console.log(`  SKIP ${tablename} → ${newName} (target already exists)`);
        continue;
      }

      console.log(`  RENAME ${tablename} → ${newName}`);

      if (opts.apply) {
        await db.query(`ALTER TABLE ${schema_name}."${tablename}" RENAME TO "${newName}"`);

        // Rename associated indexes
        const { rows: indexes } = await db.query(
          `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
          [schema_name, newName]  // after rename, tablename is newName
        );
        for (const { indexname } of indexes) {
          // Generate new index name based on new table name
          const newIndexName = indexname.replace(tablename, newName).slice(0, 63);
          if (newIndexName !== indexname) {
            console.log(`    INDEX ${indexname} → ${newIndexName}`);
            await db.query(`ALTER INDEX ${schema_name}."${indexname}" RENAME TO "${newIndexName}"`);
          }
        }
      }

      totalRenamed++;
    }
  }

  console.log(`\n${opts.apply ? 'Renamed' : 'Would rename'} ${totalRenamed} tables`);
  if (!opts.apply && totalRenamed > 0) {
    console.log('Re-run with --apply to execute.');
  }

  process.exit(0);
}

const opts = parseArgs();
run(opts).catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
