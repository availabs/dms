#!/usr/bin/env node
'use strict';

/**
 * Migrate datasets/forms pattern sources into dmsEnv rows.
 *
 * For each app, finds patterns with data.sources arrays, creates dmsEnv rows
 * to hold those source refs, and sets data.dmsEnvId on each pattern. Patterns
 * without sources get assigned to the app's default dmsEnv.
 *
 * Usage:
 *   node migrate-to-dmsenv.js --source dms-mercury-2                           # dry-run
 *   node migrate-to-dmsenv.js --source dms-mercury-2 --app mitigat-ny-prod     # single app
 *   node migrate-to-dmsenv.js --source dms-mercury-2 --app mitigat-ny-prod --apply
 *
 * Options:
 *   --source <config>  Database config name (required)
 *   --app <name>       Only migrate this app (optional)
 *   --apply            Actually create/update rows (default is dry-run)
 */

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const {
  resolveTable,
  ensureSchema,
  ensureSequence,
  getSequenceName,
} = require('../db/table-resolver');

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
// Helpers
// ---------------------------------------------------------------------------

function createDb(configName) {
  const config = loadConfig(configName);
  if (config.type === 'postgres') return { db: new PostgresAdapter(config), config };
  if (config.type === 'sqlite') return { db: new SqliteAdapter(config), config };
  throw new Error(`Unknown database type: ${config.type}`);
}

/**
 * Resolve the main data_items table for an app given the split mode.
 */
function mainTableFqn(app, dbType, splitMode) {
  const resolved = resolveTable(app, 'non-split-placeholder', dbType, splitMode);
  return resolved.fullName;
}

/**
 * Get the next ID for a new row. Uses the sequence in per-app mode,
 * or MAX(id)+1 in legacy mode.
 */
async function getNextId(db, mainFqn, app, dbType, splitMode) {
  if (dbType === 'postgres' && splitMode === 'per-app') {
    const seqName = getSequenceName(app, dbType, splitMode);
    const { rows } = await db.query(`SELECT nextval('${seqName}') as id`);
    return +rows[0].id;
  }
  // Fallback: MAX(id)+1
  const { rows } = await db.query(`SELECT MAX(id) as maxid FROM ${mainFqn}`);
  return (+rows[0]?.maxid || 0) + 1;
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
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}\n`);

  // 1. Find apps
  const appClause = opts.app ? ` AND app = '${opts.app.replace(/'/g, "''")}'` : '';

  let apps;
  if (splitMode === 'per-app' && isPg) {
    const { rows: schemaRows } = await db.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'dms_%' ORDER BY schema_name`
    );
    apps = [];
    for (const { schema_name } of schemaRows) {
      const { rows } = await db.query(
        `SELECT DISTINCT app FROM ${schema_name}.data_items LIMIT 1`
      );
      if (rows.length > 0) {
        const app = rows[0].app;
        if (opts.app && app !== opts.app) continue;
        apps.push(app);
      }
    }
  } else {
    const mainTable = splitMode === 'legacy'
      ? (isPg ? 'dms.data_items' : 'data_items')
      : mainTableFqn(opts.app || '', dbType, splitMode);

    const { rows } = await db.query(
      `SELECT DISTINCT app FROM ${mainTable}${appClause ? ' WHERE ' + appClause.trim().replace(/^AND /, '') : ''}`
    );
    apps = rows.map(r => r.app);
  }

  if (apps.length === 0) {
    console.log('No apps found.');
    if (db.close) db.close();
    return;
  }

  let totalEnvsCreated = 0;
  let totalPatternsUpdated = 0;

  for (const app of apps) {
    const mainFqn = mainTableFqn(app, dbType, splitMode);

    // 2. Find datasets/forms patterns with sources
    const { rows: patternRows } = await db.query(
      `SELECT id, data FROM ${mainFqn}
       WHERE app = $1
         AND (type LIKE '%|pattern' OR type = 'pattern')
         AND data->>'pattern_type' IN ('datasets', 'forms')`,
      [app]
    );

    if (patternRows.length === 0) continue;

    // Parse data
    const patterns = patternRows.map(row => {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return { id: row.id, data };
    });

    // Skip patterns that already have dmsEnvId
    const toMigrate = patterns.filter(p => !p.data.dmsEnvId);
    if (toMigrate.length === 0) {
      console.log(`--- App: ${app} — all ${patterns.length} patterns already have dmsEnvId, skipping ---`);
      continue;
    }

    console.log(`--- App: ${app} (${toMigrate.length} patterns to migrate) ---`);

    // 3. Find the site record to get the siteType for the dmsEnv type string
    const { rows: siteRows } = await db.query(
      `SELECT id, type, data FROM ${mainFqn}
       WHERE app = $1
         AND type NOT LIKE '%|%'
         AND data->>'patterns' IS NOT NULL
       ORDER BY id LIMIT 1`,
      [app]
    );

    if (siteRows.length === 0) {
      console.log(`  WARNING: No site record found for app ${app}, skipping`);
      continue;
    }

    const siteRow = siteRows[0];
    const siteData = typeof siteRow.data === 'string' ? JSON.parse(siteRow.data) : siteRow.data;
    const siteType = siteRow.type;
    const dmsEnvType = `dmsEnv`; // type string for dmsEnv rows

    console.log(`  Site: ${siteType} (ID ${siteRow.id})`);

    // 4. Group patterns by source set identity
    // Each unique set of source IDs gets one dmsEnv
    const sourceGroups = new Map(); // JSON key of sorted source IDs → { sources, patterns }

    for (const pattern of toMigrate) {
      const sources = pattern.data.sources || [];
      const sortedIds = sources
        .map(s => +s.id)
        .filter(id => !isNaN(id))
        .sort((a, b) => a - b);
      const key = JSON.stringify(sortedIds);

      if (!sourceGroups.has(key)) {
        sourceGroups.set(key, { sources, patterns: [] });
      }
      sourceGroups.get(key).patterns.push(pattern);
    }

    // 5. Create dmsEnv for each source group
    const existingDmsEnvs = siteData.dms_envs || [];
    const newDmsEnvRefs = [...existingDmsEnvs];

    for (const [key, group] of sourceGroups) {
      const sourceCount = group.sources.filter(s => s.id).length;
      // Derive env name from the first pattern's name, or "Default" if only one group
      const envName = sourceGroups.size === 1
        ? 'Default'
        : (group.patterns[0].data.name || `Env ${totalEnvsCreated + 1}`);

      const patternNames = group.patterns.map(p => `"${p.data.name || `#${p.id}`}"`).join(', ');
      console.log(`  dmsEnv "${envName}" (${sourceCount} sources) → patterns: ${patternNames}`);

      if (opts.apply) {
        // Create dmsEnv row
        const envData = {
          name: envName,
          sources: group.sources.filter(s => s.id),
        };

        if (isPg) {
          await ensureSchema(db, app, dbType, splitMode);
          await ensureSequence(db, app, dbType, splitMode);

          const envId = await getNextId(db, mainFqn, app, dbType, splitMode);
          await db.query(
            `INSERT INTO ${mainFqn} (id, app, type, data, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, now(), now())`,
            [envId, app, dmsEnvType, JSON.stringify(envData)]
          );

          console.log(`    Created dmsEnv ID ${envId}`);

          // Update each pattern with dmsEnvId and remove sources
          for (const pattern of group.patterns) {
            await db.query(
              `UPDATE ${mainFqn}
               SET data = (data - 'sources') || jsonb_build_object('dmsEnvId', $1::int),
                   updated_at = now()
               WHERE id = $2`,
              [envId, pattern.id]
            );
            console.log(`    Pattern #${pattern.id} "${pattern.data.name || ''}" → dmsEnvId=${envId}`);
            totalPatternsUpdated++;
          }

          // Add ref to site's dms_envs
          newDmsEnvRefs.push({ ref: `${app}+${dmsEnvType}`, id: envId });

        } else {
          // SQLite
          const envId = await getNextId(db, mainFqn, app, dbType, splitMode);
          await db.query(
            `INSERT INTO ${mainFqn} (id, app, type, data, created_at, updated_at)
             VALUES ($1, $2, $3, $4, datetime('now'), datetime('now'))`,
            [envId, app, dmsEnvType, JSON.stringify(envData)]
          );

          console.log(`    Created dmsEnv ID ${envId}`);

          for (const pattern of group.patterns) {
            const updatedData = { ...pattern.data, dmsEnvId: envId };
            delete updatedData.sources;
            await db.query(
              `UPDATE ${mainFqn} SET data = $1, updated_at = datetime('now') WHERE id = $2`,
              [JSON.stringify(updatedData), pattern.id]
            );
            console.log(`    Pattern #${pattern.id} "${pattern.data.name || ''}" → dmsEnvId=${envId}`);
            totalPatternsUpdated++;
          }

          newDmsEnvRefs.push({ ref: `${app}+${dmsEnvType}`, id: envId });
        }
      } else {
        // Dry-run: just count
        for (const pattern of group.patterns) {
          console.log(`    Pattern #${pattern.id} "${pattern.data.name || ''}" → would get dmsEnvId`);
          totalPatternsUpdated++;
        }
      }

      totalEnvsCreated++;
    }

    // 6. Update site record with dms_envs refs
    if (opts.apply && newDmsEnvRefs.length > existingDmsEnvs.length) {
      const updatedSiteData = { ...siteData, dms_envs: newDmsEnvRefs };
      if (isPg) {
        await db.query(
          `UPDATE ${mainFqn} SET data = $1::jsonb, updated_at = now() WHERE id = $2`,
          [JSON.stringify(updatedSiteData), siteRow.id]
        );
      } else {
        await db.query(
          `UPDATE ${mainFqn} SET data = $1, updated_at = datetime('now') WHERE id = $2`,
          [JSON.stringify(updatedSiteData), siteRow.id]
        );
      }
      console.log(`  Updated site record #${siteRow.id} with ${newDmsEnvRefs.length} dms_envs refs`);
    }

    console.log();
  }

  // Summary
  console.log(`=== Summary ===`);
  console.log(`dmsEnvs ${opts.apply ? 'created' : 'to create'}: ${totalEnvsCreated}`);
  console.log(`Patterns ${opts.apply ? 'updated' : 'to update'}: ${totalPatternsUpdated}`);

  if (!opts.apply && totalEnvsCreated > 0) {
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
