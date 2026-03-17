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

  const validTypes = ['patterns', 'pages', 'sections', 'views', 'sources'];
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

function fqn(db, table) {
  return db.type === 'postgres' ? `dms.${table}` : table;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * Load all rows matching a type pattern, optionally filtered by app.
 * Returns rows with id, app, type, data.
 */
async function loadByTypeLike(db, pattern, appFilter) {
  const table = fqn(db, 'data_items');
  let where = `type LIKE $1`;
  const values = [pattern];
  if (appFilter) {
    where += ` AND app = $2`;
    values.push(appFilter);
  }
  const { rows } = await db.query(
    `SELECT id, app, type, data FROM ${table} WHERE ${where}`,
    values
  );
  return rows;
}

/**
 * Load all rows matching an exact type, optionally filtered by app.
 */
async function loadByType(db, type, appFilter) {
  const table = fqn(db, 'data_items');
  let where = `type = $1`;
  const values = [type];
  if (appFilter) {
    where += ` AND app = $2`;
    values.push(appFilter);
  }
  const { rows } = await db.query(
    `SELECT id, app, type, data FROM ${table} WHERE ${where}`,
    values
  );
  return rows;
}

/**
 * Load all distinct apps from data_items.
 */
async function loadApps(db) {
  const table = fqn(db, 'data_items');
  const { rows } = await db.query(`SELECT DISTINCT app FROM ${table} ORDER BY app`);
  return rows.map(r => r.app);
}

// ---------------------------------------------------------------------------
// Reference extraction
// ---------------------------------------------------------------------------

/**
 * Extract IDs from a JSON array field in a row's data.
 * Handles multiple formats:
 *   - {id: N} objects (standard DMS references)
 *   - Plain numbers
 *   - {$type: "ref", value: [...]} Falcor refs
 *   - String number values
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
        // Falcor ref — last segment is the ID
        const last = item.value[item.value.length - 1];
        if (last != null) ids.push(Number(last));
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// PostgreSQL-optimized orphan detection
//
// Uses single-pass CTEs to collect all referenced IDs, then hash anti-joins
// to find orphans. This avoids correlated NOT EXISTS with per-row
// jsonb_array_elements expansion, which is O(candidates × parents × array_len).
// ---------------------------------------------------------------------------

/**
 * PostgreSQL CASE expression to extract an integer ID from a jsonb array element.
 * Handles the same formats as extractRefIds():
 *   {id: N}, plain numbers, string numbers, {$type: "ref", value: [...]}
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

async function pgFindOrphanedPatterns(db, appFilter) {
  const { rows } = await db.query(`
    WITH referenced AS (
      SELECT DISTINCT ${pgRefId('elem')} AS ref_id
      FROM dms.data_items site,
           LATERAL jsonb_array_elements(site.data->'patterns') AS elem
      WHERE site.data IS NOT NULL
        AND jsonb_typeof(site.data->'patterns') = 'array'
        AND ($1::text IS NULL OR site.app = $1)
    )
    SELECT p.id, p.app, p.type
    FROM dms.data_items p
    WHERE p.type LIKE '%|pattern'
      AND ($1::text IS NULL OR p.app = $1)
      AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.ref_id = p.id)
  `, [appFilter || null]);
  return rows;
}

async function pgFindOrphanedPages(db, appFilter) {
  const { rows } = await db.query(`
    WITH valid_page_types AS (
      SELECT pat.app, pat.data->>'doc_type' AS doc_type
      FROM dms.data_items pat
      WHERE pat.type LIKE '%|pattern'
        AND pat.data->>'pattern_type' = 'page'
        AND pat.data->>'doc_type' IS NOT NULL
        AND ($1::text IS NULL OR pat.app = $1)
    )
    SELECT pg.id, pg.app, pg.type
    FROM dms.data_items pg
    WHERE pg.type NOT LIKE '%|%'
      AND ($1::text IS NULL OR pg.app = $1)
      AND NOT (pg.data IS NOT NULL AND jsonb_typeof(pg.data->'patterns') = 'array')
      AND pg.type !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\\d+'
      AND pg.type !~ '^[a-z][a-z0-9_]*-\\d+(-invalid-entry)?$'
      AND NOT EXISTS (
        SELECT 1 FROM valid_page_types vpt
        WHERE vpt.app = pg.app AND vpt.doc_type = pg.type
      )
  `, [appFilter || null]);
  return rows;
}

async function pgFindOrphanedSections(db, appFilter) {
  const { rows } = await db.query(`
    WITH referenced AS (
      SELECT DISTINCT ref_id FROM (
        SELECT ${pgRefId('elem')} AS ref_id
        FROM dms.data_items page,
             LATERAL jsonb_array_elements(page.data->'sections') AS elem
        WHERE page.data IS NOT NULL
          AND jsonb_typeof(page.data->'sections') = 'array'
          AND ($1::text IS NULL OR page.app = $1)
        UNION ALL
        SELECT ${pgRefId('elem')} AS ref_id
        FROM dms.data_items page,
             LATERAL jsonb_array_elements(page.data->'draft_sections') AS elem
        WHERE page.data IS NOT NULL
          AND jsonb_typeof(page.data->'draft_sections') = 'array'
          AND ($1::text IS NULL OR page.app = $1)
      ) sub
      WHERE ref_id IS NOT NULL
    )
    SELECT s.id, s.app, s.type
    FROM dms.data_items s
    WHERE s.type LIKE '%|cms-section'
      AND ($1::text IS NULL OR s.app = $1)
      AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.ref_id = s.id)
  `, [appFilter || null]);
  return rows;
}

async function pgFindOrphanedSources(db, appFilter) {
  const { rows } = await db.query(`
    WITH valid_source_types AS (
      SELECT pat.app, (pat.data->>'doc_type') || '|source' AS source_type
      FROM dms.data_items pat
      WHERE pat.type LIKE '%|pattern'
        AND pat.data->>'pattern_type' IN ('datasets', 'forms')
        AND pat.data->>'doc_type' IS NOT NULL
        AND ($1::text IS NULL OR pat.app = $1)
    )
    SELECT s.id, s.app, s.type
    FROM dms.data_items s
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

async function pgFindOrphanedViews(db, appFilter) {
  const { rows } = await db.query(`
    WITH referenced AS (
      SELECT DISTINCT ${pgRefId('elem')} AS ref_id
      FROM dms.data_items src,
           LATERAL jsonb_array_elements(src.data->'views') AS elem
      WHERE src.type LIKE '%|source'
        AND src.type NOT LIKE '%|source|view'
        AND src.data IS NOT NULL
        AND jsonb_typeof(src.data->'views') = 'array'
        AND ($1::text IS NULL OR src.app = $1)
    )
    SELECT v.id, v.app, v.type
    FROM dms.data_items v
    WHERE v.type LIKE '%|source|view'
      AND ($1::text IS NULL OR v.app = $1)
      AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.ref_id = v.id)
  `, [appFilter || null]);
  return rows;
}

// ---------------------------------------------------------------------------
// Orphan detectors (SQLite fallback — loads rows into JS for ref extraction)
// ---------------------------------------------------------------------------

/**
 * Find orphaned patterns — type ends in |pattern, but no site references
 * this pattern's ID in its data.patterns[].
 */
async function findOrphanedPatterns(db, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedPatterns(db, appFilter);

  // Load all patterns
  const patterns = await loadByTypeLike(db, '%|pattern', appFilter);
  if (patterns.length === 0) return [];

  // Load all sites — rows where data.patterns exists (sites have no | in type suffix)
  // Sites are identified by having a patterns array in their data
  const table = fqn(db, 'data_items');
  let siteQuery = `SELECT id, app, type, data FROM ${table} WHERE type NOT LIKE '%|%'`;
  const values = [];
  if (appFilter) {
    siteQuery += ` AND app = $1`;
    values.push(appFilter);
  }
  const { rows: allTopLevel } = await db.query(siteQuery, values);

  // Filter to actual sites (those with data.patterns)
  const sites = allTopLevel.filter(r => r.data && Array.isArray(r.data.patterns));

  // Build set of all referenced pattern IDs
  const referencedIds = new Set();
  for (const site of sites) {
    for (const id of extractRefIds(site.data, 'patterns')) {
      referencedIds.add(id);
    }
  }

  // Patterns not referenced by any site are orphaned
  return patterns.filter(p => !referencedIds.has(p.id));
}

/**
 * Find orphaned pages — type matches a doc_type from a page-pattern,
 * but no such pattern exists anymore.
 *
 * Pattern rows have data.pattern_type and data.doc_type.
 * A page's type string is "{app}+{doc_type}".
 * If no pattern exists with pattern_type=page and that doc_type, the page is orphaned.
 */
async function findOrphanedPages(db, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedPages(db, appFilter);

  // Load all pattern rows
  const patterns = await loadByTypeLike(db, '%|pattern', appFilter);

  // Collect valid page type strings from page-type patterns
  const validPageTypes = new Set();
  for (const p of patterns) {
    if (p.data && p.data.pattern_type === 'page' && p.data.doc_type) {
      // The page type string is app+doc_type
      validPageTypes.add(`${p.app}+${p.data.doc_type}`);
    }
  }

  // Load all top-level rows that are NOT sites and NOT patterns
  // Pages have types like "{app}+{doc_type}" — no pipe suffix
  const table = fqn(db, 'data_items');
  let query = `SELECT id, app, type, data FROM ${table} WHERE type NOT LIKE '%|%'`;
  const values = [];
  if (appFilter) {
    query += ` AND app = $1`;
    values.push(appFilter);
  }
  const { rows: topLevel } = await db.query(query, values);

  // Filter to pages: not sites (no data.patterns) and not dataset types
  const orphans = [];
  for (const row of topLevel) {
    // Skip sites
    if (row.data && Array.isArray(row.data.patterns)) continue;

    // Skip dataset data rows (UUID-viewId types)
    if (isSplitType(row.type.replace(/^[^+]*\+/, ''))) continue;

    // Check if this row's type is claimed by any page pattern
    const typeKey = `${row.app}+${row.type}`;
    if (!validPageTypes.has(typeKey)) {
      orphans.push(row);
    }
  }

  return orphans;
}

/**
 * Find orphaned sections — type ends in |cms-section, but no page
 * references this section's ID in data.sections[] or data.draft_sections[].
 */
async function findOrphanedSections(db, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedSections(db, appFilter);

  // Load all sections
  const sections = await loadByTypeLike(db, '%|cms-section', appFilter);
  if (sections.length === 0) return [];

  // For each section type like "app+doctype|cms-section",
  // pages have type "app+doctype" — load all pages for these base types
  const baseTypes = new Set();
  for (const s of sections) {
    // Type is like "doctype|cms-section", base is "doctype"
    const base = s.type.replace(/\|cms-section$/, '');
    baseTypes.add(`${s.app}|${base}`);
  }

  // Load all pages for each base type
  const referencedIds = new Set();
  for (const key of baseTypes) {
    const [app, baseType] = key.split('|');
    const pages = await loadByType(db, baseType, app);
    for (const page of pages) {
      for (const id of extractRefIds(page.data, 'sections')) {
        referencedIds.add(id);
      }
      for (const id of extractRefIds(page.data, 'draft_sections')) {
        referencedIds.add(id);
      }
    }
  }

  return sections.filter(s => !referencedIds.has(s.id));
}

/**
 * Find orphaned sources — type ends in |source (but not |source|view),
 * but no datasets/forms pattern exists with matching doc_type.
 */
async function findOrphanedSources(db, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedSources(db, appFilter);

  // Load all sources (not views)
  const allSourceLike = await loadByTypeLike(db, '%|source', appFilter);
  const sources = allSourceLike.filter(r => !r.type.endsWith('|source|view'));
  if (sources.length === 0) return [];

  // Load all patterns and collect valid source type strings
  const patterns = await loadByTypeLike(db, '%|pattern', appFilter);
  const validSourceTypes = new Set();
  for (const p of patterns) {
    if (p.data && (p.data.pattern_type === 'datasets' || p.data.pattern_type === 'forms') && p.data.doc_type) {
      // Source type is "{doc_type}|source"
      validSourceTypes.add(`${p.app}|${p.data.doc_type}|source`);
    }
  }

  return sources.filter(s => {
    // Type is like "doctype|source" — check if any pattern claims the base doc_type
    const key = `${s.app}|${s.type}`;
    return !validSourceTypes.has(key);
  });
}

/**
 * Find orphaned views — type ends in |source|view, but no source
 * references this view's ID in data.views[].
 */
async function findOrphanedViews(db, appFilter) {
  if (db.type === 'postgres') return pgFindOrphanedViews(db, appFilter);

  // Load all views
  const views = await loadByTypeLike(db, '%|source|view', appFilter);
  if (views.length === 0) return [];

  // For each view type like "doctype|source|view",
  // sources have type "doctype|source" — load all sources for these base types
  const baseTypes = new Set();
  for (const v of views) {
    const base = v.type.replace(/\|view$/, '');
    baseTypes.add(`${v.app}|${base}`);
  }

  const referencedIds = new Set();
  for (const key of baseTypes) {
    const [app, baseType] = key.split(/\|(.+)/);
    const sources = await loadByType(db, baseType, app);
    for (const source of sources) {
      for (const id of extractRefIds(source.data, 'views')) {
        referencedIds.add(id);
      }
    }
  }

  return views.filter(v => !referencedIds.has(v.id));
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

const DELETE_BATCH = 5000;

async function deleteOrphans(db, orphanIds) {
  if (orphanIds.length === 0) return;

  const table = fqn(db, 'data_items');

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

function groupByApp(orphans) {
  const groups = {};
  for (const row of orphans) {
    if (!groups[row.app]) groups[row.app] = [];
    groups[row.app].push(row);
  }
  return groups;
}

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

  const mode = args.delete ? 'Cleanup' : 'Analysis';
  console.log(`DMS Dead Row ${mode} — ${args.source}`);
  if (args.app) console.log(`  App filter: ${args.app}`);
  if (args.type) console.log(`  Type filter: ${args.type}`);
  console.log();

  const db = createDb(args.source);

  // Discover apps
  let apps = await loadApps(db);
  if (args.app) apps = apps.filter(a => a === args.app);

  if (apps.length === 0) {
    console.log('No apps found.');
    await db.end();
    return;
  }

  // Run detection per app
  const allOrphans = { patterns: [], pages: [], sections: [], views: [], sources: [] };
  const detectors = {
    patterns: findOrphanedPatterns,
    sections: findOrphanedSections,
    pages: findOrphanedPages,
    sources: findOrphanedSources,
    views: findOrphanedViews,
  };

  // If --type is set, only run that detector
  const typesToCheck = args.type ? [args.type] : Object.keys(detectors);

  for (const app of apps) {
    const appOrphans = {};
    let appTotal = 0;

    for (const t of typesToCheck) {
      process.stdout.write(`  Checking ${t}...`);
      const t0 = Date.now();
      const orphans = await detectors[t](db, app);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(` ${orphans.length} orphans (${secs}s)\n`);
      appOrphans[t] = orphans;
      allOrphans[t] = allOrphans[t].concat(orphans);
      appTotal += orphans.length;
    }

    if (appTotal === 0) continue;

    // Find the site type for display
    const table = fqn(db, 'data_items');
    const { rows: siteRows } = await db.query(
      `SELECT type FROM ${table} WHERE app = $1 AND type NOT LIKE '%|%' LIMIT 5`,
      [app]
    );
    const siteType = siteRows.find(r => {
      // Attempt parse — site rows have data.patterns
      return true; // We already know the app, just pick first type
    });
    const siteLabel = siteType ? siteType.type : '';

    console.log(`App: ${app}${siteLabel ? ` (${app}+${siteLabel})` : ''}`);

    for (const t of typesToCheck) {
      printAnalysis(t, appOrphans[t]);
    }
    console.log();
  }

  // Summary
  const totalOrphans = Object.values(allOrphans).reduce((sum, arr) => sum + arr.length, 0);

  if (totalOrphans === 0) {
    console.log('No orphaned rows found.');
    await db.end();
    return;
  }

  // Summary line
  const breakdown = Object.entries(allOrphans)
    .filter(([, arr]) => arr.length > 0)
    .map(([type, arr]) => `${arr.length} ${type}`)
    .join(', ');

  console.log(`Summary:`);
  console.log(`  Total orphaned rows: ${totalOrphans}`);
  console.log(`  Breakdown: ${breakdown}`);

  // Delete mode
  if (args.delete) {
    console.log();
    for (const [type, orphans] of Object.entries(allOrphans)) {
      if (orphans.length === 0) continue;
      const ids = orphans.map(r => r.id);
      process.stdout.write(`  Deleting ${ids.length} orphaned ${type}...`);
      await deleteOrphans(db, ids);
      console.log(' done');
    }
    console.log(`\nDeleted ${totalOrphans} rows total.`);
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
  findOrphanedSources,
  findOrphanedViews,
  deleteOrphans,
};
