#!/usr/bin/env node
'use strict';

/**
 * Migrate internal_dataset sources to internal_table format.
 *
 * Finds dataset data rows in the main data_items table that use UUID-based or
 * uppercase-name type patterns (not matched by isSplitType), generates name-based
 * doc_types, and moves the rows into split tables where they belong.
 *
 * Two categories of rows are migrated:
 *   1. UUID types: {uuid}-{viewId} (from internal_dataset sources)
 *   2. Uppercase name types: {Name}-{viewId} (from DAMA-era sources)
 *
 * After migration, these types become lowercase name-based ({name}-{viewId})
 * which isSplitType() matches, so the server automatically routes them to
 * split tables on subsequent queries.
 *
 * Usage:
 *   node deprecate-internal-dataset.js --source dms-mercury-2                           # dry-run
 *   node deprecate-internal-dataset.js --source dms-mercury-2 --app mitigat-ny-prod     # single app
 *   node deprecate-internal-dataset.js --source dms-mercury-2 --app mitigat-ny-prod --apply
 *
 * Options:
 *   --source <config>  Database config name (required)
 *   --app <name>       Only migrate this app (optional)
 *   --apply            Actually move rows (default is dry-run)
 *   --batch-size <n>   Rows per INSERT batch (default 500)
 */

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const {
  resolveSchema,
  resolveTable,
  sanitize,
  isSplitType,
  ensureSchema,
  ensureTable,
  ensureSequence,
  getSequenceName,
  UUID_SPLIT_REGEX,
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
// Helpers
// ---------------------------------------------------------------------------

function createDb(configName) {
  const config = loadConfig(configName);
  if (config.type === 'postgres') return { db: new PostgresAdapter(config), config };
  if (config.type === 'sqlite') return { db: new SqliteAdapter(config), config };
  throw new Error(`Unknown database type: ${config.type}`);
}

/**
 * Convert a source name to a doc_type suitable for split table naming.
 * Must produce a string matching NAME_SPLIT_REGEX when combined with -{viewId}.
 */
function nameToDocType(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Extract the doc_type portion from a dataset row type string.
 * Handles both UUID ({uuid}-{viewId}) and name ({Name}-{viewId}) patterns.
 * Returns null if not a dataset row type.
 */
function extractDocType(type) {
  // UUID pattern: last segment after the 5th hyphen group is the viewId
  if (UUID_SPLIT_REGEX.test(type)) {
    const core = type.replace(/-invalid-entry$/, '');
    // UUID is 8-4-4-4-12, so the viewId is after the 5th hyphen group
    const match = core.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d+)$/);
    if (match) return { docType: match[1], viewId: match[2], isInvalid: type.endsWith('-invalid-entry') };
  }
  // Uppercase name pattern: {Name}-{viewId}
  const upperMatch = type.match(/^([A-Z][A-Za-z0-9_]*)-(\d+)(-invalid-entry)?$/);
  if (upperMatch) return { docType: upperMatch[1], viewId: upperMatch[2], isInvalid: !!upperMatch[3] };
  return null;
}

/**
 * Resolve the main data_items table for an app given the split mode.
 */
function mainTableFqn(app, dbType, splitMode) {
  const resolved = resolveTable(app, 'non-split-placeholder', dbType, splitMode);
  return resolved.fullName;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function migrate(opts) {
  const { db, config } = createDb(opts.source);
  const dbType = db.type;
  const isPg = dbType === 'postgres';
  const splitMode = config.splitMode || 'legacy';

  console.log(`Database: ${opts.source} (${dbType})`);
  console.log(`Split mode: ${splitMode}`);
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Batch size: ${opts.batchSize}\n`);

  // 1. Find apps with dataset data rows to migrate
  const appClause = opts.app ? ` AND app = '${opts.app.replace(/'/g, "''")}'` : '';

  let apps;
  if (splitMode === 'per-app' && isPg) {
    // In per-app mode, query each app's schema directly
    // First, find schemas
    const { rows: schemaRows } = await db.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'dms_%' ORDER BY schema_name`
    );
    apps = [];
    for (const { schema_name } of schemaRows) {
      // Derive app name from schema: dms_{sanitized_app} → need to find actual app
      const { rows } = await db.query(
        `SELECT DISTINCT app FROM ${schema_name}.data_items LIMIT 1`
      );
      if (rows.length > 0) {
        const app = rows[0].app;
        if (opts.app && app !== opts.app) continue;
        apps.push({ app, schema: schema_name });
      }
    }
  } else {
    // Legacy mode or SQLite: query the shared table
    const mainTable = splitMode === 'legacy'
      ? (isPg ? 'dms.data_items' : 'data_items')
      : mainTableFqn(opts.app || '', dbType, splitMode);

    const { rows } = await db.query(
      `SELECT DISTINCT app FROM ${mainTable}${appClause ? ' WHERE ' + appClause.trim().replace(/^AND /, '') : ''}`
    );
    apps = rows.map(r => ({ app: r.app, schema: null }));
  }

  if (apps.length === 0) {
    console.log('No apps found.');
    if (db.close) db.close();
    return;
  }

  let totalMigrated = 0;
  let totalRowsMoved = 0;

  for (const { app, schema: appSchema } of apps) {
    const mainFqn = mainTableFqn(app, dbType, splitMode);
    const seqName = getSequenceName(app, dbType, splitMode);

    // 2. Find dataset data types that need migration
    // These are types in the main table that look like dataset rows but aren't split-eligible
    const { rows: typeRows } = await db.query(
      `SELECT type, count(*) as cnt FROM ${mainFqn} WHERE app = $1 GROUP BY type ORDER BY type`,
      [app]
    );

    // Group by doc_type
    const docTypeGroups = new Map(); // oldDocType → { types: [{type, cnt, viewId, isInvalid}], totalRows }
    for (const { type, cnt } of typeRows) {
      if (isSplitType(type)) continue; // Already split-eligible, skip
      const parsed = extractDocType(type);
      if (!parsed) continue; // Not a dataset row type

      if (!docTypeGroups.has(parsed.docType)) {
        docTypeGroups.set(parsed.docType, { types: [], totalRows: 0 });
      }
      const group = docTypeGroups.get(parsed.docType);
      group.types.push({ type, cnt: +cnt, viewId: parsed.viewId, isInvalid: parsed.isInvalid });
      group.totalRows += +cnt;
    }

    if (docTypeGroups.size === 0) continue;

    console.log(`--- App: ${app} (${docTypeGroups.size} datasets to migrate) ---`);

    // 3. Find source records for these doc_types (if they exist)
    const sourceMap = new Map(); // oldDocType → { id, name, type }
    const { rows: sourceRows } = await db.query(
      `SELECT id, data->>'name' as name, data->>'type' as dtype, data->>'doc_type' as doc_type
       FROM ${mainFqn} WHERE app = $1 AND type LIKE '%|source'`,
      [app]
    );
    for (const row of sourceRows) {
      if (row.doc_type) sourceMap.set(row.doc_type, row);
    }

    // 4. Generate new doc_types and check for collisions
    const usedDocTypes = new Set();
    // Collect existing name-based doc_types to avoid collisions
    for (const row of sourceRows) {
      if (row.doc_type && !UUID_SPLIT_REGEX.test(row.doc_type + '-0')) {
        usedDocTypes.add(row.doc_type);
      }
    }

    const migrations = []; // { oldDocType, newDocType, source, group }
    for (const [oldDocType, group] of docTypeGroups) {
      const source = sourceMap.get(oldDocType);
      let baseName;
      if (source?.name) {
        baseName = nameToDocType(source.name);
      } else {
        // No source record — derive from the old doc_type
        if (UUID_SPLIT_REGEX.test(oldDocType + '-0')) {
          // UUID: use prefix
          baseName = 'ds_' + oldDocType.slice(0, 8);
        } else {
          // Uppercase name: just lowercase it
          baseName = nameToDocType(oldDocType);
        }
      }

      if (!baseName) {
        console.log(`  SKIP ${oldDocType}: cannot generate valid doc_type`);
        continue;
      }

      // Collision avoidance
      let newDocType = baseName;
      let suffix = 2;
      while (usedDocTypes.has(newDocType)) {
        newDocType = `${baseName}_${suffix}`;
        suffix++;
      }
      usedDocTypes.add(newDocType);

      migrations.push({ oldDocType, newDocType, source, group });
    }

    // 5. Execute migrations
    for (const { oldDocType, newDocType, source, group } of migrations) {
      const versions = group.types.filter(t => !t.isInvalid).length;
      const invalidTypes = group.types.filter(t => t.isInvalid).length;
      const label = source?.name ? `"${source.name}"` : oldDocType;
      console.log(`  ${label}: ${oldDocType} → ${newDocType} (${group.totalRows} rows, ${versions} versions${invalidTypes ? `, ${invalidTypes} invalid types` : ''})`);

      if (!opts.apply) {
        totalRowsMoved += group.totalRows;
        totalMigrated++;
        continue;
      }

      // Ensure schema/sequence exist
      await ensureSchema(db, app, dbType, splitMode);
      await ensureSequence(db, app, dbType, splitMode);

      for (const { type: oldType, cnt, viewId, isInvalid } of group.types) {
        // Compute new type string
        const newType = isInvalid
          ? `${newDocType}-${viewId}-invalid-entry`
          : `${newDocType}-${viewId}`;

        // Verify new type is split-eligible
        if (!isSplitType(newType)) {
          console.log(`    ERROR: generated type '${newType}' is not split-eligible, skipping`);
          continue;
        }

        // Resolve target split table
        const sourceId = source?.id || null;
        const resolved = resolveTable(app, newType, dbType, splitMode, sourceId);
        await ensureTable(db, resolved.schema, resolved.table, dbType, seqName);

        // Move rows in batches: INSERT into split table, then DELETE from main
        let moved = 0;
        while (moved < cnt) {
          const { rows: batch } = await db.query(
            `SELECT id, app, type, data, created_at, created_by, updated_at, updated_by
             FROM ${mainFqn} WHERE app = $1 AND type = $2 ORDER BY id LIMIT $3`,
            [app, oldType, opts.batchSize]
          );
          if (batch.length === 0) break;

          if (isPg) {
            const ids = batch.map(r => r.id);
            const apps = batch.map(r => r.app);
            const types = batch.map(() => newType); // Use new type
            const datas = batch.map(r => typeof r.data === 'object' ? JSON.stringify(r.data) : r.data);
            const createdAts = batch.map(r => r.created_at);
            const createdBys = batch.map(r => r.created_by);
            const updatedAts = batch.map(r => r.updated_at);
            const updatedBys = batch.map(r => r.updated_by);

            await db.query(
              `INSERT INTO ${resolved.fullName} (id, app, type, data, created_at, created_by, updated_at, updated_by)
               SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::jsonb[], $5::timestamptz[], $6::int[], $7::timestamptz[], $8::int[])
               ON CONFLICT (id) DO NOTHING`,
              [ids, apps, types, datas, createdAts, createdBys, updatedAts, updatedBys]
            );

            // Delete from main table
            await db.query(
              `DELETE FROM ${mainFqn} WHERE id = ANY($1::bigint[])`,
              [ids]
            );
          } else {
            for (const row of batch) {
              await db.query(
                `INSERT OR IGNORE INTO ${resolved.fullName} (id, app, type, data, created_at, created_by, updated_at, updated_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [row.id, row.app, newType, typeof row.data === 'object' ? JSON.stringify(row.data) : row.data,
                 row.created_at, row.created_by, row.updated_at, row.updated_by]
              );
              await db.query(`DELETE FROM ${mainFqn} WHERE id = $1`, [row.id]);
            }
          }

          moved += batch.length;
        }

        // Verify
        const { rows: verifyRows } = await db.query(
          `SELECT count(*) as cnt FROM ${resolved.fullName} WHERE app = $1 AND type = $2`,
          [app, newType]
        );
        const verifiedCount = +(verifyRows[0]?.cnt || 0);
        const ok = verifiedCount >= cnt;
        console.log(`    ${oldType} → ${resolved.fullName} (${verifiedCount}/${cnt} rows) ${ok ? '✓' : '✗ MISMATCH'}`);

        totalRowsMoved += moved;
      }

      // Update source record if it exists
      if (source) {
        if (isPg) {
          await db.query(
            `UPDATE ${mainFqn} SET data = jsonb_set(jsonb_set(data, '{type}', $1::jsonb), '{doc_type}', $2::jsonb),
             updated_at = now() WHERE id = $3`,
            [JSON.stringify('internal_table'), JSON.stringify(newDocType), source.id]
          );
        } else {
          await db.query(
            `UPDATE ${mainFqn} SET data = json_set(json_set(data, '$.type', $1), '$.doc_type', $2),
             updated_at = datetime('now') WHERE id = $3`,
            ['internal_table', newDocType, source.id]
          );
        }
        console.log(`    Updated source #${source.id}: type=internal_table, doc_type=${newDocType}`);
      }

      totalMigrated++;
    }

    // 6. Clean phantom source refs from pattern records
    if (opts.apply) {
      const { rows: patternRows } = await db.query(
        `SELECT id, data FROM ${mainFqn}
         WHERE app = $1 AND type LIKE '%|pattern' AND data->>'pattern_type' = 'datasets'`,
        [app]
      );
      // Also check legacy 'pattern' type
      const { rows: legacyPatternRows } = await db.query(
        `SELECT id, data FROM ${mainFqn}
         WHERE app = $1 AND type = 'pattern' AND data->>'pattern_type' = 'datasets'`,
        [app]
      );

      for (const row of [...patternRows, ...legacyPatternRows]) {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        const sources = data.sources || [];
        if (sources.length === 0) continue;

        // Check which source refs actually exist
        const sourceIds = sources.map(s => parseInt(s.id)).filter(id => !isNaN(id));
        if (sourceIds.length === 0) continue;

        const placeholders = sourceIds.map((_, i) => `$${i + 2}`).join(', ');
        const { rows: existingRows } = await db.query(
          `SELECT id FROM ${mainFqn} WHERE id IN (${placeholders}) AND app = $1`,
          [app, ...sourceIds]
        );
        const existingIds = new Set(existingRows.map(r => r.id));

        const validSources = sources.filter(s => existingIds.has(parseInt(s.id)));
        const removed = sources.length - validSources.length;
        if (removed > 0) {
          data.sources = validSources;
          if (isPg) {
            await db.query(
              `UPDATE ${mainFqn} SET data = $1::jsonb, updated_at = now() WHERE id = $2`,
              [JSON.stringify(data), row.id]
            );
          } else {
            await db.query(
              `UPDATE ${mainFqn} SET data = $1, updated_at = datetime('now') WHERE id = $2`,
              [JSON.stringify(data), row.id]
            );
          }
          console.log(`  Cleaned ${removed} phantom source ref(s) from pattern #${row.id}`);
        }
      }
    }

    console.log();
  }

  // Summary
  console.log(`=== Summary ===`);
  console.log(`Datasets ${opts.apply ? 'migrated' : 'to migrate'}: ${totalMigrated}`);
  console.log(`Rows ${opts.apply ? 'moved' : 'to move'}: ${totalRowsMoved}`);

  if (!opts.apply && totalMigrated > 0) {
    console.log(`\nRe-run with --apply to execute.`);
  }

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
