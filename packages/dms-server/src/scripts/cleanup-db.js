#!/usr/bin/env node
'use strict';

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { isSplitType } = require('../db/table-resolver');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, app: null, type: null, delete: false, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--app': opts.app = args[++i]; break;
      case '--type': opts.type = args[++i]; break;
      case '--delete': opts.delete = true; break;
      case '--dry-run': opts.dryRun = true; break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.source) { console.error('Missing --source <config>'); process.exit(1); }

  const validTypes = ['patterns', 'pages', 'sections', 'page_edits', 'views', 'sources'];
  if (opts.type && !validTypes.includes(opts.type)) {
    console.error(`Invalid --type. Must be one of: ${validTypes.join(', ')}`);
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

function createDbWithConfig(configName) {
  const config = loadConfig(configName);
  let db;
  if (config.type === 'postgres') db = new PostgresAdapter(config);
  else if (config.type === 'sqlite') db = new SqliteAdapter(config);
  else throw new Error(`Unknown database type: ${config.type}`);
  return { db, config };
}

// Mirrors table-resolver.js sanitize()
function sanitizeApp(app) {
  return app.toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
}

function getSplitMode(config) {
  return (config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy') === 'per-app'
    ? 'per-app' : 'legacy';
}

// Returns the schema-qualified data_items table for a given app.
function resolveAppTable(db, app, splitMode) {
  if (db.type === 'postgres') {
    return splitMode === 'per-app'
      ? `dms_${sanitizeApp(app)}.data_items`
      : 'dms.data_items';
  }
  // SQLite
  return splitMode === 'per-app'
    ? `data_items__${sanitizeApp(app)}`
    : 'data_items';
}

// Legacy helper — used when we don't yet know the app (e.g. for loadApps).
function fqn(db, table) {
  return db.type === 'postgres' ? `dms.${table}` : table;
}

// ---------------------------------------------------------------------------
// App discovery
// ---------------------------------------------------------------------------

/**
 * In per-app PostgreSQL mode, each app gets its own schema (dms_{sanitized_app}).
 * Discover apps by listing all dms_* schemas that have a data_items table.
 */
async function loadAppsPerAppPG(db) {
  const { rows: schemaRows } = await db.query(`
    SELECT t.table_schema
    FROM information_schema.tables t
    WHERE t.table_schema LIKE 'dms_%'
      AND t.table_name = 'data_items'
    ORDER BY t.table_schema
  `);

  const apps = [];
  for (const { table_schema } of schemaRows) {
    try {
      const { rows } = await db.query(`SELECT app FROM ${table_schema}.data_items LIMIT 1`);
      if (rows[0]?.app) apps.push(rows[0].app);
    } catch { /* empty or inaccessible schema */ }
  }
  return apps;
}

async function loadApps(db, splitMode) {
  if (db.type === 'postgres' && splitMode === 'per-app') {
    return loadAppsPerAppPG(db);
  }
  // Legacy mode or SQLite: query the main table directly.
  const table = fqn(db, 'data_items');
  try {
    const { rows } = await db.query(`SELECT DISTINCT app FROM ${table} ORDER BY app`);
    return rows.map(r => r.app);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Data loading helpers
// ---------------------------------------------------------------------------

/**
 * Load all rows matching a type pattern from a specific table.
 */
async function loadByTypeLike(db, pattern, appFilter, { skipData = false } = {}, table = null) {
  const tbl = table || fqn(db, 'data_items');
  const cols = skipData ? 'id, app, type' : 'id, app, type, data';
  let where = `type LIKE $1`;
  const values = [pattern];
  if (appFilter) {
    where += ` AND app = $2`;
    values.push(appFilter);
  }
  const { rows } = await db.query(`SELECT ${cols} FROM ${tbl} WHERE ${where}`, values);
  return rows;
}

/**
 * Load all rows matching an exact type from a specific table.
 */
async function loadByType(db, type, appFilter, table = null) {
  const tbl = table || fqn(db, 'data_items');
  let where = `type = $1`;
  const values = [type];
  if (appFilter) {
    where += ` AND app = $2`;
    values.push(appFilter);
  }
  const { rows } = await db.query(`SELECT id, app, type, data FROM ${tbl} WHERE ${where}`, values);
  return rows;
}

// ---------------------------------------------------------------------------
// Reference extraction
// ---------------------------------------------------------------------------

/**
 * Extract IDs from a JSON array field in a row's data.
 */
function extractRefIds(data, field) {
  if (!data || !data[field]) return [];
  const arr = data[field];
  if (!Array.isArray(arr)) return [];

  const ids = [];
  for (const item of arr) {
    if (item == null) continue;
    if (typeof item === 'number') {
      ids.push(item);
    } else if (typeof item === 'string' && /^\d+$/.test(item)) {
      ids.push(Number(item));
    } else if (typeof item === 'object') {
      if (item.id != null) {
        ids.push(Number(item.id));
      } else if (item.$type === 'ref' && Array.isArray(item.value)) {
        const last = item.value[item.value.length - 1];
        if (last != null) ids.push(Number(last));
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// PostgreSQL-optimized orphan detection
// ---------------------------------------------------------------------------

/**
 * PostgreSQL CASE expression to extract an integer ID from a jsonb array element.
 */
function pgRefId(elem) {
  return `CASE
    WHEN jsonb_typeof(${elem}) = 'number' THEN (${elem} #>> '{}')::int
    WHEN jsonb_typeof(${elem}) = 'string' AND (${elem} #>> '{}') ~ '^\\d+$'
      THEN (${elem} #>> '{}')::int
    WHEN jsonb_typeof(${elem}) = 'object' AND ${elem}->>'id' IS NOT NULL
      THEN (${elem}->>'id')::int
    WHEN jsonb_typeof(${elem}) = 'object' AND ${elem}->>'$type' = 'ref'
      AND jsonb_typeof(${elem}->'value') = 'array'
      THEN (${elem}->'value'->(jsonb_array_length(${elem}->'value') - 1) #>> '{}')::int
    ELSE NULL
  END`;
}

async function pgFindOrphanedPatterns(db, table, appFilter) {
  const { rows } = await db.query(`
    WITH referenced AS (
      SELECT DISTINCT ${pgRefId('elem')} AS ref_id
      FROM ${table} site,
           LATERAL jsonb_array_elements(site.data->'patterns') AS elem
      WHERE site.data IS NOT NULL
        AND jsonb_typeof(site.data->'patterns') = 'array'
        AND ($1::text IS NULL OR site.app = $1)
    )
    SELECT p.id, p.app, p.type
    FROM ${table} p
    WHERE (p.type LIKE '%|pattern' OR p.type LIKE '%:pattern')
      AND ($1::text IS NULL OR p.app = $1)
      AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.ref_id = p.id)
  `, [appFilter || null]);
  return rows;
}

async function pgFindOrphanedPages(db, table, appFilter) {
  const { rows } = await db.query(`
    WITH all_pattern_instances AS (
      -- Old type model: doc_type on page-type patterns
      SELECT pat.app, pat.data->>'doc_type' AS instance
      FROM ${table} pat
      WHERE pat.type LIKE '%|pattern'
        AND pat.data->>'pattern_type' = 'page'
        AND pat.data->>'doc_type' IS NOT NULL
        AND ($1::text IS NULL OR pat.app = $1)
      UNION ALL
      -- New type model: instance encoded in type as {site}|{instance}:pattern
      SELECT pat.app, split_part(split_part(pat.type, '|', 2), ':', 1) AS instance
      FROM ${table} pat
      WHERE pat.type LIKE '%:pattern'
        AND ($1::text IS NULL OR pat.app = $1)
    )
    SELECT pg.id, pg.app, pg.type
    FROM ${table} pg
    WHERE pg.type LIKE '%|page'
      AND ($1::text IS NULL OR pg.app = $1)
      AND NOT EXISTS (
        SELECT 1 FROM all_pattern_instances api
        WHERE api.app = pg.app
          AND api.instance = split_part(pg.type, '|', 1)
      )
  `, [appFilter || null]);
  return rows;
}

async function pgFindOrphanedSections(db, table, appFilter) {
  const { rows } = await db.query(`
    WITH referenced AS (
      SELECT DISTINCT ref_id FROM (
        SELECT ${pgRefId('elem')} AS ref_id
        FROM ${table} page,
             LATERAL jsonb_array_elements(page.data->'sections') AS elem
        WHERE page.data IS NOT NULL
          AND jsonb_typeof(page.data->'sections') = 'array'
          AND ($1::text IS NULL OR page.app = $1)
        UNION ALL
        SELECT ${pgRefId('elem')} AS ref_id
        FROM ${table} page,
             LATERAL jsonb_array_elements(page.data->'draft_sections') AS elem
        WHERE page.data IS NOT NULL
          AND jsonb_typeof(page.data->'draft_sections') = 'array'
          AND ($1::text IS NULL OR page.app = $1)
      ) sub
      WHERE ref_id IS NOT NULL
    )
    SELECT s.id, s.app, s.type
    FROM ${table} s
    WHERE (s.type LIKE '%|cms-section' OR s.type LIKE '%|component')
      AND ($1::text IS NULL OR s.app = $1)
      AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.ref_id = s.id)
  `, [appFilter || null]);
  return rows;
}

async function pgFindOrphanedSources(db, table, appFilter) {
  const { rows } = await db.query(`
    WITH valid_source_types AS (
      SELECT pat.app, (pat.data->>'doc_type') || '|source' AS source_type
      FROM ${table} pat
      WHERE pat.type LIKE '%|pattern'
        AND pat.data->>'pattern_type' IN ('datasets', 'forms')
        AND pat.data->>'doc_type' IS NOT NULL
        AND ($1::text IS NULL OR pat.app = $1)
    )
    SELECT s.id, s.app, s.type
    FROM ${table} s
    WHERE s.type LIKE '%|source'
      AND s.type NOT LIKE '%|source|view'
      AND ($1::text IS NULL OR s.app = $1)
      AND NOT EXISTS (
        SELECT 1 FROM valid_source_types vst
        WHERE vst.app = s.app AND vst.source_type = s.type
      )
  `, [appFilter || null]);
  return rows;
}

async function pgFindOrphanedViews(db, table, appFilter) {
  const { rows } = await db.query(`
    WITH referenced AS (
      SELECT DISTINCT ${pgRefId('elem')} AS ref_id
      FROM ${table} src,
           LATERAL jsonb_array_elements(src.data->'views') AS elem
      WHERE src.type LIKE '%|source'
        AND src.type NOT LIKE '%|source|view'
        AND src.data IS NOT NULL
        AND jsonb_typeof(src.data->'views') = 'array'
        AND ($1::text IS NULL OR src.app = $1)
    )
    SELECT v.id, v.app, v.type
    FROM ${table} v
    WHERE v.type LIKE '%|source|view'
      AND ($1::text IS NULL OR v.app = $1)
      AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.ref_id = v.id)
  `, [appFilter || null]);
  return rows;
}

async function pgFindOrphanedPageEdits(db, table, appFilter) {
  const { rows } = await db.query(`
    WITH referenced AS (
      SELECT DISTINCT ${pgRefId('elem')} AS ref_id
      FROM ${table} page,
           LATERAL jsonb_array_elements(page.data->'history') AS elem
      WHERE page.data IS NOT NULL
        AND jsonb_typeof(page.data->'history') = 'array'
        AND ($1::text IS NULL OR page.app = $1)
    )
    SELECT pe.id, pe.app, pe.type
    FROM ${table} pe
    WHERE pe.type LIKE '%|page-edit'
      AND ($1::text IS NULL OR pe.app = $1)
      AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.ref_id = pe.id)
  `, [appFilter || null]);
  return rows;
}

// ---------------------------------------------------------------------------
// Orphan detectors (SQLite fallback — loads rows into JS for ref extraction)
// ---------------------------------------------------------------------------

async function findOrphanedPatterns(db, table, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedPatterns(db, table, appFilter);

  // Both old (%|pattern) and new (%:pattern) format patterns
  const patternsOld = await loadByTypeLike(db, '%|pattern', appFilter, { skipData: true }, table);
  const patternsNew = (await loadByTypeLike(db, '%:pattern', appFilter, { skipData: true }, table))
    .filter(p => /\|[^|]+:pattern$/.test(p.type));
  const patterns = [...patternsOld, ...patternsNew];
  if (patterns.length === 0) return [];

  // Load sites (rows whose data has a patterns array)
  let siteQuery = `SELECT id, app, type, data FROM ${table} WHERE type NOT LIKE '%|%' AND type NOT LIKE '%:%'`;
  const siteVals = [];
  if (appFilter) { siteQuery += ` AND app = $1`; siteVals.push(appFilter); }
  const { rows: topLevel } = await db.query(siteQuery, siteVals);
  const sites = topLevel.filter(r => r.data && Array.isArray(r.data.patterns));

  const referencedIds = new Set();
  for (const site of sites) {
    for (const id of extractRefIds(site.data, 'patterns')) referencedIds.add(id);
  }

  return patterns.filter(p => !referencedIds.has(p.id));
}

async function findOrphanedPages(db, table, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedPages(db, table, appFilter);

  const patternsOld = await loadByTypeLike(db, '%|pattern', appFilter, {}, table);
  const patternsNew = (await loadByTypeLike(db, '%:pattern', appFilter, {}, table))
    .filter(p => /\|[^|]+:pattern$/.test(p.type));

  // Valid instances: old model (doc_type), new model (instance from type)
  const validInstances = new Set();
  for (const p of patternsOld) {
    if (p.data?.pattern_type === 'page' && p.data?.doc_type) validInstances.add(p.data.doc_type);
  }
  for (const p of patternsNew) {
    const m = p.type.match(/\|([^|:]+):pattern$/);
    if (m) validInstances.add(m[1]);
  }

  // New-model pages: type LIKE '%|page'
  const newPages = await loadByTypeLike(db, '%|page', appFilter, { skipData: true }, table);
  const orphans = [];
  for (const pg of newPages) {
    const instance = pg.type.replace(/\|page$/, '');
    if (!validInstances.has(instance)) orphans.push(pg);
  }
  return orphans;
}

async function findOrphanedSections(db, table, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedSections(db, table, appFilter);

  // Both old (cms-section) and new (component) section types
  const sectionsOld = await loadByTypeLike(db, '%|cms-section', appFilter, { skipData: true }, table);
  const sectionsNew = await loadByTypeLike(db, '%|component', appFilter, { skipData: true }, table);
  const sections = [...sectionsOld, ...sectionsNew];
  if (sections.length === 0) return [];

  // Determine which page types to load for each section type
  const referencedIds = new Set();
  const pageTypesToLoad = new Set();
  for (const s of sections) {
    if (s.type.endsWith('|component')) {
      // New model: pages have type '{instance}|page'
      pageTypesToLoad.add(s.type.replace(/\|component$/, '|page'));
    } else {
      // Old model: pages have type == base doctype
      pageTypesToLoad.add(s.type.replace(/\|cms-section$/, ''));
    }
  }

  for (const pageType of pageTypesToLoad) {
    const pages = await loadByType(db, pageType, appFilter, table);
    for (const page of pages) {
      for (const id of extractRefIds(page.data, 'sections')) referencedIds.add(id);
      for (const id of extractRefIds(page.data, 'draft_sections')) referencedIds.add(id);
    }
  }

  return sections.filter(s => !referencedIds.has(s.id));
}

async function findOrphanedPageEdits(db, table, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedPageEdits(db, table, appFilter);

  const pageEdits = await loadByTypeLike(db, '%|page-edit', appFilter, { skipData: true }, table);
  if (pageEdits.length === 0) return [];

  const referencedIds = new Set();
  const baseTypes = new Set(pageEdits.map(pe => pe.type.replace(/\|page-edit$/, '')));
  for (const baseType of baseTypes) {
    const pages = await loadByType(db, baseType, appFilter, table);
    for (const page of pages) {
      for (const id of extractRefIds(page.data, 'history')) referencedIds.add(id);
    }
  }

  return pageEdits.filter(pe => !referencedIds.has(pe.id));
}

async function findOrphanedSources(db, table, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedSources(db, table, appFilter);

  const allSourceLike = await loadByTypeLike(db, '%|source', appFilter, { skipData: true }, table);
  const sources = allSourceLike.filter(r => !r.type.endsWith('|source|view'));
  if (sources.length === 0) return [];

  const patterns = await loadByTypeLike(db, '%|pattern', appFilter, {}, table);
  const validSourceTypes = new Set();
  for (const p of patterns) {
    if (p.data && (p.data.pattern_type === 'datasets' || p.data.pattern_type === 'forms') && p.data.doc_type) {
      validSourceTypes.add(`${p.app}|${p.data.doc_type}|source`);
    }
  }

  return sources.filter(s => !validSourceTypes.has(`${s.app}|${s.type}`));
}

async function findOrphanedViews(db, table, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedViews(db, table, appFilter);

  const views = await loadByTypeLike(db, '%|source|view', appFilter, { skipData: true }, table);
  if (views.length === 0) return [];

  const referencedIds = new Set();
  const baseTypes = new Set(views.map(v => v.type.replace(/\|view$/, '')));
  for (const key of baseTypes) {
    const [app, ...rest] = key.split('|');
    const sources = await loadByType(db, rest.join('|'), appFilter, table);
    for (const source of sources) {
      for (const id of extractRefIds(source.data, 'views')) referencedIds.add(id);
    }
  }

  return views.filter(v => !referencedIds.has(v.id));
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

const DELETE_BATCH = 5000;

async function deleteOrphans(db, table, orphanIds) {
  if (orphanIds.length === 0) return;

  for (let i = 0; i < orphanIds.length; i += DELETE_BATCH) {
    const batch = orphanIds.slice(i, i + DELETE_BATCH);
    if (db.type === 'sqlite') {
      const placeholders = batch.map((_, j) => `$${j + 1}`).join(', ');
      await db.query(`DELETE FROM ${table} WHERE id IN (${placeholders})`, batch);
    } else {
      await db.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [batch]);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function groupByType(orphans) {
  const groups = {};
  for (const row of orphans) {
    if (!groups[row.type]) groups[row.type] = [];
    groups[row.type].push(row);
  }
  return groups;
}

function printAnalysis(label, orphans) {
  if (orphans.length === 0) return;
  const byType = groupByType(orphans);
  for (const [type, rows] of Object.entries(byType)) {
    console.log(`  Orphaned ${label}: ${rows.length.toString().padStart(6)}  (type: ${type})`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  const { db, config } = createDbWithConfig(args.source);
  const splitMode = getSplitMode(config);

  const mode = args.delete ? 'Cleanup' : 'Analysis';
  console.log(`DMS Dead Row ${mode} — ${args.source} (splitMode: ${splitMode})`);
  if (args.app) console.log(`  App filter: ${args.app}`);
  if (args.type) console.log(`  Type filter: ${args.type}`);
  console.log();

  // Discover apps
  let apps = await loadApps(db, splitMode);
  if (args.app) apps = apps.filter(a => a === args.app);

  if (apps.length === 0) {
    console.log('No apps found.');
    await db.end();
    return;
  }

  const allOrphans = { patterns: [], pages: [], sections: [], page_edits: [], views: [], sources: [] };
  const detectors = {
    patterns:   findOrphanedPatterns,
    sections:   findOrphanedSections,
    page_edits: findOrphanedPageEdits,
    pages:      findOrphanedPages,
    sources:    findOrphanedSources,
    views:      findOrphanedViews,
  };

  // Pages are analysis-only: detection is heuristic and deletion could remove valid content.
  const ANALYSIS_ONLY = new Set(['pages']);

  const typesToCheck = args.type ? [args.type] : Object.keys(detectors);

  for (const app of apps) {
    const table = resolveAppTable(db, app, splitMode);
    const appOrphans = {};
    let appTotal = 0;

    console.log(`App: ${app}  (table: ${table})`);

    for (const t of typesToCheck) {
      process.stdout.write(`  Checking ${t}...`);
      const t0 = Date.now();
      const orphans = await detectors[t](db, table, app);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(` ${orphans.length} orphans (${secs}s)\n`);
      appOrphans[t] = orphans;
      allOrphans[t] = allOrphans[t].concat(orphans);
      appTotal += orphans.length;
    }

    if (appTotal === 0) {
      console.log('  No orphaned rows found.\n');
      continue;
    }

    for (const t of typesToCheck) printAnalysis(t, appOrphans[t]);
    console.log();
  }

  // Summary
  const totalOrphans = Object.values(allOrphans).reduce((sum, arr) => sum + arr.length, 0);

  if (totalOrphans === 0) {
    console.log('No orphaned rows found.');
    await db.end();
    return;
  }

  const breakdown = Object.entries(allOrphans)
    .filter(([, arr]) => arr.length > 0)
    .map(([type, arr]) => `${arr.length} ${type}`)
    .join(', ');

  console.log(`Summary:`);
  console.log(`  Total orphaned rows: ${totalOrphans}`);
  console.log(`  Breakdown: ${breakdown}`);

  if (args.delete) {
    console.log();
    let deletedTotal = 0;
    for (const [type, orphans] of Object.entries(allOrphans)) {
      if (orphans.length === 0) continue;
      if (ANALYSIS_ONLY.has(type)) {
        console.log(`  Skipping ${orphans.length} orphaned ${type} (analysis-only)`);
        continue;
      }
      const table = resolveAppTable(db, orphans[0].app, splitMode);
      const ids = orphans.map(r => r.id);
      process.stdout.write(`  Deleting ${ids.length} orphaned ${type}...`);
      await deleteOrphans(db, table, ids);
      console.log(' done');
      deletedTotal += ids.length;
    }
    console.log(`\nDeleted ${deletedTotal} rows total.`);
  }

  await db.end();
}

if (require.main === module) {
  main().catch(err => {
    console.error(`\nFatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  createDb,
  extractRefIds,
  pgRefId,
  findOrphanedPatterns,
  findOrphanedPages,
  findOrphanedSections,
  findOrphanedPageEdits,
  findOrphanedSources,
  findOrphanedViews,
  deleteOrphans,
};
