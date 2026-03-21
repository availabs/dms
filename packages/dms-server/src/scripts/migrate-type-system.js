#!/usr/bin/env node
'use strict';

/**
 * Migrate type column values from old format to new uniform type scheme.
 *
 * Old format:
 *   Site:      'prod'
 *   Pattern:   'prod|pattern'            (data.doc_type = 'docs-page')
 *   Page:      'docs-page'               (bare doc_type)
 *   Section:   'docs-page|cms-section'
 *   dmsEnv:    'dmsEnv'
 *   Source:    'my_datasets|source'       (data.doc_type = 'adamtest1')
 *   View:     'my_datasets|source|view'
 *   Data row: 'adamtest1-954604'
 *
 * New format:
 *   Site:      'prod:site'
 *   Pattern:   'prod|docs_page:pattern'
 *   Page:      'docs_page|page'
 *   Component: 'docs_page|component'     (was cms-section)
 *   dmsEnv:    'prod|my_env:dmsenv'
 *   Source:    'my_env|adamtest1:source'
 *   View:     'adamtest1|v1:view'
 *   Data row: 'adamtest1|v1:data'
 *
 * Usage:
 *   node migrate-type-system.js --source dms-mercury-types            # dry-run
 *   node migrate-type-system.js --source dms-mercury-types --apply    # execute
 *   node migrate-type-system.js --source dms-mercury-types --app myapp # single app
 *
 * Options:
 *   --source <config>  Database config name (required)
 *   --app <name>       Only migrate this app (optional)
 *   --apply            Actually update rows (default is dry-run)
 */

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { nameToSlug } = require('../db/type-utils');
const { resolveTable, sanitize, getSequenceName } = require('../db/table-resolver');

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

  if (!opts.source) {
    console.error('Usage: node migrate-type-system.js --source <config> [--app <name>] [--apply]');
    process.exit(1);
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTable(config) {
  if (config.type === 'postgres') return 'dms.data_items';
  return 'data_items';
}

function jsonField(config, field) {
  if (config.type === 'postgres') return `data->>'${field}'`;
  return `json_extract(data, '$.${field}')`;
}

/**
 * Derive a slug from a name, falling back to existing doc_type or UUID prefix.
 */
function deriveSlug(data, field = 'name') {
  const name = data?.[field];
  if (name) return nameToSlug(name);
  if (data?.doc_type) {
    // If doc_type is a UUID, use first 8 chars
    if (/^[0-9a-f]{8}-/.test(data.doc_type)) return data.doc_type.slice(0, 8);
    return nameToSlug(data.doc_type);
  }
  return null;
}

/**
 * Make a slug unique within a set by appending _2, _3, etc.
 */
function uniqueSlug(slug, existing) {
  if (!existing.has(slug)) return slug;
  let n = 2;
  while (existing.has(`${slug}_${n}`)) n++;
  return `${slug}_${n}`;
}

// Old split type regex (from table-resolver.js)
const NAME_SPLIT_REGEX = /^[a-z][a-z0-9_]*-\d+(-invalid-entry)?$/i;
const UUID_SPLIT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+(-invalid-entry)?$/;

function isOldSplitType(type) {
  return NAME_SPLIT_REGEX.test(type) || UUID_SPLIT_REGEX.test(type);
}

/**
 * Check if a type has already been migrated to the new format.
 * New format types contain ':' (e.g., 'site:site', 'prod|docs:pattern').
 * Old format types never contain ':'.
 */
function isAlreadyMigrated(type) {
  return typeof type === 'string' && type.includes(':');
}

function parseOldSplitType(type) {
  const isInvalid = type.endsWith('-invalid-entry');
  const core = isInvalid ? type.slice(0, -'-invalid-entry'.length) : type;
  const lastDash = core.lastIndexOf('-');
  return {
    docType: core.slice(0, lastDash),
    viewId: core.slice(lastDash + 1),
    isInvalid
  };
}

// ---------------------------------------------------------------------------
// Migration Logic
// ---------------------------------------------------------------------------

/**
 * Load rows from a table, only loading full `data` column for rows that
 * actually need it (sites, patterns, themes, dmsEnvs, sources, views).
 * Pages, sections, page-edits, and data rows only need id/app/type.
 */
async function loadTableRows(db, table, config, appFilter) {
  const whereApp = appFilter ? ` AND app = $1` : '';
  const params = appFilter ? [appFilter] : [];

  // Config rows that need data: sites/patterns/themes/dmsEnvs/sources/views
  // These are identified by type patterns: no pipe (sites), or ending in
  // |pattern, |source, |source|view, or exact matches 'pattern','theme','dmsEnv'
  const configTypes = `(
    type IN ('pattern', 'theme', 'dmsEnv')
    OR type LIKE '%|pattern'
    OR type LIKE '%|source'
    OR type LIKE '%|source|view'
    OR type LIKE '%|theme'
    OR type LIKE '%|dmsEnv'
    OR (type NOT LIKE '%|%'
        AND type NOT SIMILAR TO '[a-z][a-z0-9_]*-[0-9]+%'
        AND type NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9]+%')
  )`;

  // Load config rows with full data
  const configRows = await db.promise(
    `SELECT id, app, type, data FROM ${table} WHERE ${configTypes}${whereApp} ORDER BY id`,
    params
  );

  // Load all other rows without data (pages, sections, page-edits, data rows, templates)
  const otherRows = await db.promise(
    `SELECT id, app, type FROM ${table} WHERE NOT ${configTypes}${whereApp} ORDER BY id`,
    params
  );
  for (const row of otherRows) row.data = null;

  return [...configRows, ...otherRows];
}

/**
 * Discover all app tables. For per-app splitMode (postgres), each app has its own
 * schema `dms_{app}` with a `data_items` table. Also check the shared `dms.data_items`.
 * Returns array of { app, table, rows }.
 */
async function loadAllApps(db, config, opts) {
  const results = [];

  if (config.type === 'postgres') {
    // Check shared table first
    const sharedTable = 'dms.data_items';
    const sharedRows = await loadTableRows(db, sharedTable, config, opts.app);
    if (sharedRows.length > 0) {
      const byApp = {};
      for (const row of sharedRows) (byApp[row.app] ??= []).push(row);
      for (const [app, rows] of Object.entries(byApp)) {
        results.push({ app, table: sharedTable, rows });
      }
    }

    // Discover per-app schemas
    let schemas;
    if (opts.app) {
      const schemaName = `dms_${sanitize(opts.app)}`;
      schemas = [{ schema_name: schemaName }];
    } else {
      schemas = await db.promise(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'dms_%' ORDER BY schema_name`
      );
    }

    console.log(`Scanning ${schemas.length} per-app schemas...`);
    for (const s of schemas) {
      const perAppTable = `${s.schema_name}.data_items`;
      try {
        const rows = await loadTableRows(db, perAppTable, config, null);
        if (rows.length > 0) {
          const app = rows[0].app;
          if (opts.app && app !== opts.app) continue;
          console.log(`  ${s.schema_name}: ${rows.length} rows (app=${app})`);
          results.push({ app, table: perAppTable, rows });
        }
      } catch (e) {
        // Table doesn't exist in this schema, skip
      }
    }
  } else {
    // SQLite: just use data_items
    const table = 'data_items';
    const rows = await loadTableRows(db, table, config, opts.app);
    if (rows.length > 0) {
      const byApp = {};
      for (const row of rows) (byApp[row.app] ??= []).push(row);
      for (const [app, appRows] of Object.entries(byApp)) {
        results.push({ app, table, rows: appRows });
      }
    }
  }

  return results;
}

/**
 * Apply a batch of updates to the database.
 */
async function applyUpdates(db, config, updates) {
  let applied = 0;
  for (const update of updates) {
    const t = update.table;
    if (update.removeDocType) {
      if (config.type === 'postgres') {
        await db.promise(
          `UPDATE ${t} SET type = $1, data = data - 'doc_type', updated_at = NOW() WHERE id = $2`,
          [update.newType, update.id]
        );
      } else {
        await db.promise(
          `UPDATE ${t} SET type = $1, data = json_remove(data, '$.doc_type'), updated_at = datetime('now') WHERE id = $2`,
          [update.newType, update.id]
        );
      }
    } else {
      if (config.type === 'postgres') {
        await db.promise(
          `UPDATE ${t} SET type = $1, updated_at = NOW() WHERE id = $2`,
          [update.newType, update.id]
        );
      } else {
        await db.promise(
          `UPDATE ${t} SET type = $1, updated_at = datetime('now') WHERE id = $2`,
          [update.newType, update.id]
        );
      }
    }
    applied++;
    if (applied % 100 === 0) {
      process.stdout.write(`  ${applied}/${updates.length} rows updated\r`);
    }
  }
  if (updates.length > 0) {
    console.log(`  ${applied}/${updates.length} rows updated`);
  }
}

async function migrate(db, config, opts) {
  const isDry = !opts.apply;

  console.log(`\n${isDry ? '=== DRY RUN ===' : '=== APPLYING ==='}`);
  console.log(`Database: ${config.database || config.filename}\n`);

  // Discover tables but don't load rows yet
  const tablesToProcess = [];

  if (config.type === 'postgres') {
    tablesToProcess.push({ table: 'dms.data_items', label: 'shared' });
    let schemas;
    if (opts.app) {
      schemas = [{ schema_name: `dms_${sanitize(opts.app)}` }];
    } else {
      schemas = await db.promise(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'dms_%' ORDER BY schema_name`
      );
    }
    for (const s of schemas) {
      tablesToProcess.push({ table: `${s.schema_name}.data_items`, label: s.schema_name });
    }
  } else {
    tablesToProcess.push({ table: 'data_items', label: 'data_items' });
  }

  let grandTotalUpdates = 0;
  let grandTotalRows = 0;
  let grandTotalSkipped = 0;

  for (const tableInfo of tablesToProcess) {
    const { table, label } = tableInfo;

    // Load rows for this table
    let tableRows;
    try {
      tableRows = await loadTableRows(db, table, config, opts.app);
    } catch (e) {
      // Table doesn't exist, skip silently
      continue;
    }
    if (tableRows.length === 0) continue;

    // Group by app
    const byApp = {};
    for (const row of tableRows) (byApp[row.app] ??= []).push(row);

    for (const [app, appRows] of Object.entries(byApp)) {
    // Parse JSON data
    for (const row of appRows) {
      row._data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    }
    // Filter out already-migrated rows
    const unmigrated = appRows.filter(r => !isAlreadyMigrated(r.type));
    const alreadyDone = appRows.length - unmigrated.length;
    console.log(`\n── App: ${app} (${appRows.length} rows in ${table}, ${alreadyDone} already migrated) ──`);
    if (unmigrated.length === 0) {
      console.log(`  All rows already migrated, skipping`);
      continue;
    }

    const updates = []; // local updates for this app+table

    // Step 1: Find sites (rows with type that has no | and is not a split type and is not 'pattern' etc.)
    const sites = unmigrated.filter(r =>
      !r.type.includes('|') && !isOldSplitType(r.type) &&
      r.type !== 'pattern' && r.type !== 'dmsEnv' && r.type !== 'theme' &&
      // Exclude pages (identified by having URL slug or sections)
      !r._data?.url_slug && !r._data?.sections && !r._data?.draft_sections
    );

    // Heuristic: if no clear site rows found, try to find them from the admin pattern
    // Sites are rows referenced by the admin config
    const siteInstanceMap = new Map(); // oldType → newInstance
    const usedSlugs = new Set();

    for (const site of sites) {
      // Check if this looks like a site row (has patterns array or site_name)
      if (site._data?.patterns || site._data?.site_name || site._data?.themes) {
        const instance = site.type; // current type IS the site instance name
        siteInstanceMap.set(site.type, instance);
        const newType = `${instance}:site`;
        updates.push({ id: site.id, oldType: site.type, newType });
        console.log(`  Site: ${site.type} → ${newType}`);
      }
    }

    // Step 2: Find and rename patterns
    // Build patternMap from ALL patterns (including already-migrated) for partial re-runs
    const patternMap = new Map(); // oldDocType → newSlug

    // Process already-migrated patterns to rebuild the map
    const migratedPatterns = appRows.filter(r => r.type.endsWith(':pattern'));
    for (const pat of migratedPatterns) {
      const match = pat.type.match(/\|([^|]+):pattern$/);
      if (!match) continue;
      const slug = match[1];
      usedSlugs.add(slug);
      // Map by slug (for non-UUID doc_types that were slug-like already)
      patternMap.set(slug, slug);
      // If data.doc_type still exists (shouldn't after migration, but handle gracefully)
      if (pat._data?.doc_type) patternMap.set(pat._data.doc_type, slug);
    }

    // Process unmigrated patterns
    const patterns = unmigrated.filter(r => r.type.endsWith('|pattern') || r.type === 'pattern');
    for (const pat of patterns) {
      const docType = pat._data?.doc_type;
      const slug = deriveSlug(pat._data) || (docType ? nameToSlug(docType) : null);
      if (!slug) {
        console.log(`  WARNING: Pattern id=${pat.id} has no name or doc_type, skipping`);
        continue;
      }

      const uniqueName = uniqueSlug(slug, usedSlugs);
      usedSlugs.add(uniqueName);

      // Find site parent from old type
      const sitePrefix = pat.type.replace(/\|?pattern$/, '');
      const siteInstance = sitePrefix || [...siteInstanceMap.values()][0] || 'unknown';

      if (docType) patternMap.set(docType, uniqueName);

      const newType = `${siteInstance}|${uniqueName}:pattern`;
      updates.push({ id: pat.id, oldType: pat.type, newType, removeDocType: true });
      console.log(`  Pattern: ${pat.type} (doc_type=${docType}) → ${newType}`);
    }

    // Step 3: Find and rename themes
    const themes = unmigrated.filter(r => r.type === 'theme' || r.type.endsWith('|theme'));
    for (const thm of themes) {
      const name = thm._data?.name || thm._data?.theme_id || 'default';
      const slug = nameToSlug(name);
      const newType = `${slug}:theme`;
      updates.push({ id: thm.id, oldType: thm.type, newType });
      console.log(`  Theme: ${thm.type} → ${newType}`);
    }

    // Step 4: Find and rename dmsEnvs
    const dmsEnvMap = new Map(); // dmsEnv row id → newSlug

    // Rebuild from already-migrated dmsEnvs
    const migratedEnvs = appRows.filter(r => r.type.endsWith(':dmsenv'));
    for (const env of migratedEnvs) {
      const match = env.type.match(/\|([^|]+):dmsenv$/);
      if (match) dmsEnvMap.set(env.id, match[1]);
    }

    const dmsEnvs = unmigrated.filter(r => r.type === 'dmsEnv' || r.type.endsWith('|dmsEnv'));
    for (const env of dmsEnvs) {
      const name = env._data?.name || 'default';
      const slug = nameToSlug(name);
      const siteInstance = [...siteInstanceMap.values()][0] || 'unknown';
      const newType = `${siteInstance}|${slug}:dmsenv`;
      dmsEnvMap.set(env.id, slug);
      updates.push({ id: env.id, oldType: env.type, newType });
      console.log(`  dmsEnv: ${env.type} (name=${name}) → ${newType}`);
    }

    // Step 5: Find and rename sources
    const sourceMap = new Map(); // oldDocType → { slug, dmsEnvSlug }
    const sourceByPrefix = new Map(); // pattern doc_type (type prefix) → { slug, dmsEnvSlug }

    // Rebuild from already-migrated sources: '{dmsenv}|{slug}:source'
    const migratedSources = appRows.filter(r => r.type.endsWith(':source'));
    for (const src of migratedSources) {
      const match = src.type.match(/\|([^|]+):source$/);
      if (match) {
        const slug = match[1];
        const dmsEnvSlug = src.type.split('|')[0];
        sourceMap.set(slug, { slug, dmsEnvSlug });
        // Can't recover old doc_type or old type prefix from migrated sources
      }
    }

    const sources = unmigrated.filter(r => r.type.endsWith('|source') && !r.type.endsWith('|source|view'));

    for (const src of sources) {
      const docType = src._data?.doc_type;
      const slug = deriveSlug(src._data) || (docType ? nameToSlug(docType) : null);
      if (!slug) {
        console.log(`  WARNING: Source id=${src.id} has no name or doc_type, skipping`);
        continue;
      }

      // Find dmsEnv parent. Check if any dmsEnv references this source.
      let dmsEnvSlug = null;
      for (const env of dmsEnvs) {
        const envSources = env._data?.sources || [];
        const refs = envSources.map(s => typeof s === 'object' ? s.id : s);
        if (refs.includes(src.id) || refs.includes(String(src.id))) {
          dmsEnvSlug = dmsEnvMap.get(env.id);
          break;
        }
      }

      // Fallback: derive dmsEnv from pattern parent
      if (!dmsEnvSlug) {
        // Source type is like '{doc_type}|source' — find pattern with matching doc_type
        const parentDocType = src.type.replace(/\|source$/, '');
        // Try to find a dmsEnv that owns this source (via any pattern)
        for (const pat of patterns) {
          if (pat._data?.doc_type === parentDocType) {
            const dmsEnvId = pat._data?.dmsEnvId;
            if (dmsEnvId) {
              dmsEnvSlug = dmsEnvMap.get(+dmsEnvId);
            }
            break;
          }
        }
      }

      if (!dmsEnvSlug) {
        // Last resort: use first dmsEnv or 'default'
        dmsEnvSlug = [...dmsEnvMap.values()][0] || 'default';
      }

      if (docType) sourceMap.set(docType, { slug, dmsEnvSlug });
      // Also index by the type prefix (= pattern's doc_type) so views can find their source
      const typePrefix = src.type.replace(/\|source$/, '');
      sourceByPrefix.set(typePrefix, { slug, dmsEnvSlug, docType });

      const newType = `${dmsEnvSlug}|${slug}:source`;
      updates.push({ id: src.id, oldType: src.type, newType, removeDocType: true });
      console.log(`  Source: ${src.type} (doc_type=${docType}) → ${newType}`);
    }

    // Step 6: Find and rename views
    const viewIdToSlug = new Map(); // view row id → { viewSlug, sourceSlug }

    // Rebuild from already-migrated views: '{source_slug}|{view_slug}:view'
    const migratedViews = appRows.filter(r => r.type.endsWith(':view'));
    for (const view of migratedViews) {
      const match = view.type.match(/([^|]+)\|([^|]+):view$/);
      if (match) {
        viewIdToSlug.set(String(view.id), { viewSlug: match[2], sourceSlug: match[1] });
      }
    }

    const views = unmigrated.filter(r => r.type.endsWith('|source|view'));
    for (const view of views) {
      // View type is '{pattern_doc_type}|source|view' — prefix matches source type prefix
      const typePrefix = view.type.replace(/\|source\|view$/, '');
      const sourceInfo = sourceByPrefix.get(typePrefix);
      if (!sourceInfo) {
        console.log(`  WARNING: View id=${view.id} has no matching source for ${typePrefix}, skipping`);
        continue;
      }

      // View instance: use data.name or derive from view order
      const viewName = view._data?.name ? nameToSlug(view._data.name) : `v${view.id}`;
      viewIdToSlug.set(String(view.id), { viewSlug: viewName, sourceSlug: sourceInfo.slug });
      const newType = `${sourceInfo.slug}|${viewName}:view`;
      updates.push({ id: view.id, oldType: view.type, newType });
      console.log(`  View: ${view.type} → ${newType}`);
    }

    // Recovery for partial re-runs: if a page's old doc_type (UUID) isn't in patternMap,
    // try to recover the mapping from already-migrated sibling rows.
    // E.g., if components `c3309755...|cms-section` were migrated to `songs|component`,
    // then `c3309755...` maps to `songs`.
    const migratedComponents = appRows.filter(r => r.type.endsWith('|component'));
    for (const comp of migratedComponents) {
      const slug = comp.type.replace(/\|component$/, '');
      if (slug && !slug.includes(':') && !patternMap.has(slug)) {
        // This slug IS the pattern slug. But we need the old doc_type → slug mapping.
        // We don't know the old doc_type directly, but we can check unmigrated pages:
        // any page whose type doesn't have a mapping might match this slug.
        // Store slug → slug for now; the real match happens below via broader checks.
        patternMap.set(slug, slug);
      }
    }
    // Also check already-migrated pages: `{slug}|page` → slug is the pattern slug
    const migratedPages = appRows.filter(r => r.type.endsWith('|page') && !r.type.endsWith('|page-edit'));
    for (const pg of migratedPages) {
      const slug = pg.type.replace(/\|page$/, '');
      if (slug && !slug.includes(':') && !patternMap.has(slug)) {
        patternMap.set(slug, slug);
      }
    }

    // Step 7: Find and rename pages (rows with type = doc_type, have url_slug or sections)
    const pages = unmigrated.filter(r => {
      if (r.type.includes('|') || isOldSplitType(r.type)) return false;
      if (r.type === 'pattern' || r.type === 'dmsEnv' || r.type === 'theme') return false;
      // Must be a page: has url_slug, sections, or title+parent
      return r._data?.url_slug !== undefined || r._data?.sections || r._data?.draft_sections;
    });

    for (const page of pages) {
      // Page type is the pattern's doc_type
      const patternSlug = patternMap.get(page.type);
      if (!patternSlug) {
        console.log(`  WARNING: Page id=${page.id} type=${page.type} has no matching pattern, skipping`);
        continue;
      }
      const newType = `${patternSlug}|page`;
      updates.push({ id: page.id, oldType: page.type, newType });
    }
    if (pages.length) console.log(`  Pages: ${pages.length} rows → {pattern_slug}|page`);

    // Step 8: Find and rename sections (cms-section → component)
    const sections = unmigrated.filter(r => r.type.endsWith('|cms-section'));
    for (const section of sections) {
      const parentDocType = section.type.replace(/\|cms-section$/, '');
      const patternSlug = patternMap.get(parentDocType);
      if (!patternSlug) {
        console.log(`  WARNING: Section id=${section.id} type=${section.type} has no matching pattern, skipping`);
        continue;
      }
      const newType = `${patternSlug}|component`;
      updates.push({ id: section.id, oldType: section.type, newType });
    }
    if (sections.length) console.log(`  Components: ${sections.length} rows (was cms-section)`);

    // Step 9: Find and rename page-edit rows
    const pageEdits = unmigrated.filter(r => r.type.endsWith('|page-edit'));
    let peCount = 0;
    for (const pe of pageEdits) {
      const parentDocType = pe.type.replace(/\|page-edit$/, '');
      const patternSlug = patternMap.get(parentDocType);
      if (!patternSlug) continue;
      const newType = `${patternSlug}|page-edit`;
      updates.push({ id: pe.id, oldType: pe.type, newType });
      peCount++;
    }
    if (peCount) console.log(`  Page-edit: ${peCount} rows`);

    // Step 10: Find and rename data rows (split types)
    const dataRows = unmigrated.filter(r => isOldSplitType(r.type));
    const dataRowsByDocType = {};
    for (const dr of dataRows) {
      const parsed = parseOldSplitType(dr.type);
      (dataRowsByDocType[parsed.docType] ??= []).push({ row: dr, parsed });
    }

    for (const [docType, items] of Object.entries(dataRowsByDocType)) {
      const sourceInfo = sourceMap.get(docType);
      if (!sourceInfo) {
        console.log(`  WARNING: ${items.length} data rows with doc_type=${docType} have no matching source, skipping`);
        continue;
      }

      // Group data rows by viewId (= view row ID)
      const viewIds = new Set(items.map(i => i.parsed.viewId));

      for (const viewId of viewIds) {
        // Use viewIdToSlug map for slug resolution (viewId is the view row ID)
        const viewInfo = viewIdToSlug.get(viewId);
        const viewSlug = viewInfo?.viewSlug || `v${viewId}`;

        const viewItems = items.filter(i => i.parsed.viewId === viewId);
        const newType = `${sourceInfo.slug}|${viewSlug}:data`;

        for (const { row } of viewItems) {
          updates.push({ id: row.id, oldType: row.type, newType });
        }
        console.log(`  Data rows: ${viewItems.length} rows ${docType}-${viewId} → ${newType}`);
      }
    }

    // Step 11: Find and rename template rows
    const templates = unmigrated.filter(r => r.type.endsWith('|template'));
    for (const tmpl of templates) {
      const parentDocType = tmpl.type.replace(/\|template$/, '');
      const patternSlug = patternMap.get(parentDocType);
      if (!patternSlug) continue;
      const newType = `${patternSlug}|template`;
      updates.push({ id: tmpl.id, oldType: tmpl.type, newType });
    }
    if (templates.length) console.log(`  Templates: ${templates.length} rows`);

    // Tag updates with table and accumulate stats
    const taggedUpdates = updates.map(u => ({ ...u, table }));
    grandTotalUpdates += taggedUpdates.length;
    grandTotalRows += appRows.length;
    grandTotalSkipped += appRows.length - taggedUpdates.length;

    console.log(`  → ${taggedUpdates.length} updates for this app`);

    // Apply immediately if not dry-run (frees memory per table)
    if (opts.apply && taggedUpdates.length > 0) {
      await applyUpdates(db, config, taggedUpdates);
    }

    } // end byApp loop
    // Free rows for this table to reduce memory
    tableRows = null;
  }

  // Summary
  console.log(`\n── Summary ──`);
  console.log(`Total rows processed: ${grandTotalRows}`);
  console.log(`Total updates: ${grandTotalUpdates}`);
  console.log(`Rows unchanged: ${grandTotalSkipped}`);

  if (!opts.apply) {
    console.log('\n=== DRY RUN COMPLETE — use --apply to execute ===');
  } else {
    console.log('\n=== MIGRATION COMPLETE ===');
    console.log('Note: Existing split tables have not been renamed.');
    console.log('New data will be written to correctly-named tables.');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const config = loadConfig(opts.source);

  const db = config.type === 'postgres'
    ? new PostgresAdapter(config)
    : new SqliteAdapter(config);

  try {
    await migrate(db, config, opts);
  } finally {
    if (db.close) await db.close();
    if (db.pool?.end) await db.pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
