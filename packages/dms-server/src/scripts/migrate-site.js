#!/usr/bin/env node
'use strict';

/**
 * Migrate a single site from a legacy database to a modern database with:
 * - New type scheme: {parent}:{instance}|{rowKind}
 * - Split tables for data rows
 * - dmsEnvironments for dataset/form sources
 *
 * Source: legacy database (single data_items table, old type format)
 * Target: modern database (per-app or legacy mode, new type format)
 *
 * Only copies rows reachable from the site record via parent-child references.
 * Orphaned sections, unreferenced pages, etc. are skipped.
 *
 * Usage:
 *   node migrate-site.js --source legacy-db --target modern-db --app myapp --type prod
 *   node migrate-site.js --source legacy-db --target modern-db --app myapp --type prod --apply
 *   node migrate-site.js --source legacy-db --target modern-db --app myapp --type prod --ignore docs,blog
 *   node migrate-site.js --source legacy-db --target modern-db --app myapp --type prod --include songs,redesign
 */

const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { nameToSlug } = require('../db/type-utils');
const {
  resolveTable, ensureTable, ensureSequence, sanitize,
} = require('../db/table-resolver');
const { readFileSync, mkdirSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { processRow: extractImages } = require('./extract-images');

const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Checkpoint (resume support)
// ---------------------------------------------------------------------------

function checkpointPath(app) {
  return join(__dirname, `migrate-progress-${app}.json`);
}

function loadCheckpoint(app) {
  const p = checkpointPath(app);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch { return null; }
}

function saveCheckpoint(app, data) {
  writeFileSync(checkpointPath(app), JSON.stringify(data, null, 2));
}

function clearCheckpoint(app) {
  const p = checkpointPath(app);
  if (existsSync(p)) {
    const { unlinkSync } = require('fs');
    unlinkSync(p);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, target: null, app: null, type: null, apply: false, reset: false, resume: false, ignore: [], include: [], imgOutput: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--target': opts.target = args[++i]; break;
      case '--app': opts.app = args[++i]; break;
      case '--type': opts.type = args[++i]; break;
      case '--apply': opts.apply = true; break;
      case '--reset': opts.reset = true; break;
      case '--resume': opts.resume = true; opts.apply = true; break;
      case '--ignore': opts.ignore = args[++i].split(',').map(s => s.trim()).filter(Boolean); break;
      case '--include': opts.include = args[++i].split(',').map(s => s.trim()).filter(Boolean); break;
      case '--img-output': opts.imgOutput = args[++i]; break;
      case '--no-img': opts.imgOutput = false; break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.source) { console.error('Missing --source <config>'); process.exit(1); }
  if (!opts.target) { console.error('Missing --target <config>'); process.exit(1); }
  if (!opts.app) { console.error('Missing --app <name>'); process.exit(1); }
  if (!opts.type) { console.error('Missing --type <site-type>'); process.exit(1); }
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
  if (config.type === 'postgres') return { db: new PostgresAdapter(config), config };
  if (config.type === 'sqlite') return { db: new SqliteAdapter(config), config };
  throw new Error(`Unknown database type: ${config.type}`);
}

function getTable(config, app) {
  const splitMode = config.splitMode || 'legacy';
  if (app && splitMode === 'per-app') {
    const resolved = resolveTable(app, '', config.type, splitMode);
    return resolved.fullName;
  }
  return config.type === 'postgres' ? 'dms.data_items' : 'data_items';
}

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

function toJsonStr(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function sqliteVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ---------------------------------------------------------------------------
// Row loading from source
// ---------------------------------------------------------------------------

async function loadRowsByType(db, table, app, type) {
  const rows = await db.promise(
    `SELECT * FROM ${table} WHERE app = $1 AND type = $2 ORDER BY id`, [app, type]
  );
  for (const row of rows) {
    row._data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  }
  return rows;
}

async function countRowsByType(db, table, app, type) {
  const rows = await db.promise(
    `SELECT COUNT(*) as cnt FROM ${table} WHERE app = $1 AND type = $2`, [app, type]
  );
  return +(rows[0]?.cnt || 0);
}

/**
 * Process rows in batches to avoid loading everything into memory.
 * Calls `fn(batch)` for each batch. Returns total rows processed.
 */
async function forEachBatch(db, table, app, type, batchSize, fn) {
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = await db.promise(
      `SELECT * FROM ${table} WHERE app = $1 AND type = $2 ORDER BY id LIMIT $3 OFFSET $4`,
      [app, type, batchSize, offset]
    );
    if (!rows.length) break;
    for (const row of rows) {
      row._data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
    }
    await fn(rows);
    total += rows.length;
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}

async function loadRowsByIds(db, table, ids) {
  if (!ids.length) return [];
  const result = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, j) => `$${j + 1}`).join(',');
    const rows = await db.promise(
      `SELECT * FROM ${table} WHERE id IN (${placeholders})`, batch
    );
    for (const row of rows) {
      row._data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
    }
    result.push(...rows);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Row writing to target
// ---------------------------------------------------------------------------

async function writeRows(db, fullTableName, rows) {
  if (!rows.length) return;

  if (db.type === 'sqlite') {
    const rawDb = db.getPool();
    const stmt = rawDb.prepare(
      `INSERT INTO ${fullTableName} (id, app, type, data, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAll = rawDb.transaction((batch) => {
      for (const row of batch) {
        stmt.run(
          row.id, row.app, row.type, sqliteVal(row.data),
          row.created_at, row.created_by ?? null,
          row.updated_at, row.updated_by ?? null
        );
      }
    });
    insertAll(rows);
  } else {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await db.query(`
        INSERT INTO ${fullTableName} (id, app, type, data, created_at, created_by, updated_at, updated_by)
        SELECT u.id, u.app, u.type, u.data::jsonb, u.created_at::timestamptz, u.created_by::int, u.updated_at::timestamptz, u.updated_by::int
        FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
        AS u(id, app, type, data, created_at, created_by, updated_at, updated_by)
        ON CONFLICT (id) DO NOTHING
      `, [
        batch.map(r => r.id),
        batch.map(r => r.app),
        batch.map(r => r.type),
        batch.map(r => toJsonStr(r.data)),
        batch.map(r => r.created_at),
        batch.map(r => r.created_by ?? null),
        batch.map(r => r.updated_at),
        batch.map(r => r.updated_by ?? null),
      ]);
    }
  }
}

// ---------------------------------------------------------------------------
// Row transformation helpers
// ---------------------------------------------------------------------------

function buildRow(sourceRow, newType, dataOverrides) {
  const data = dataOverrides !== undefined ? dataOverrides : sourceRow._data || sourceRow.data;
  return {
    id: sourceRow.id,
    app: sourceRow.app,
    type: newType,
    data,
    created_at: sourceRow.created_at,
    created_by: sourceRow.created_by,
    updated_at: sourceRow.updated_at,
    updated_by: sourceRow.updated_by,
  };
}

function uniqueSlug(slug, existing) {
  if (!existing.has(slug)) return slug;
  let n = 2;
  while (existing.has(`${slug}_${n}`)) n++;
  return `${slug}_${n}`;
}

// Legacy split type detection
const NAME_SPLIT_REGEX = /^[a-z][a-z0-9_]*-\d+(-invalid-entry)?$/i;
const UUID_SPLIT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+(-invalid-entry)?$/;

function isOldSplitType(type) {
  return NAME_SPLIT_REGEX.test(type) || UUID_SPLIT_REGEX.test(type);
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

/** Extract IDs from a refs array (handles {ref, id} objects and bare IDs). */
function extractRefIds(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.map(r => typeof r === 'object' ? +r.id : +r).filter(id => !isNaN(id));
}

/** Update ref format in an array of {ref, id} objects. */
function updateRefs(refs, newRefFormat) {
  if (!Array.isArray(refs)) return refs;
  return refs.map(r => {
    if (typeof r === 'object' && r !== null) {
      return { ...r, ref: newRefFormat };
    }
    return r;
  });
}

/**
 * Consolidate history from various legacy formats into a single page-edit row.
 * Returns { row, data } or null if no history row to copy.
 */
function consolidateHistory(history, pageEditMap) {
  if (!history) return null;

  // Case 1: Single ref {ref, id}
  if (typeof history === 'object' && !Array.isArray(history) && history.id) {
    const peRow = pageEditMap.get(+history.id);
    if (!peRow) return null;
    return { row: peRow, data: peRow._data };
  }

  // Case 2: Array of refs [{ref, id}, ...]
  if (Array.isArray(history)) {
    const firstItem = history[0];
    if (!firstItem) return null;

    if (typeof firstItem === 'object' && firstItem.ref && firstItem.id) {
      const allEntries = [];
      let primaryRow = null;
      for (const ref of history) {
        const peRow = pageEditMap.get(+ref.id);
        if (!peRow) continue;
        if (!primaryRow) primaryRow = peRow;
        const entries = peRow._data?.entries;
        if (Array.isArray(entries)) {
          allEntries.push(...entries);
        } else if (peRow._data?.time || peRow._data?.type || peRow._data?.user) {
          // Legacy format: each row IS an entry (has {time, type, user} directly)
          allEntries.push(peRow._data);
        }
      }
      if (!primaryRow) return null;
      return { row: primaryRow, data: { entries: allEntries } };
    }
    // Array of inline entries — no separate row
    return null;
  }

  // Case 3: Object with inline entries and an id
  if (typeof history === 'object' && history.entries && history.id) {
    const peRow = pageEditMap.get(+history.id);
    if (peRow) return { row: peRow, data: peRow._data };
  }

  return null;
}

function deduplicateById(rows) {
  const seen = new Set();
  return rows.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

async function findDataRowTypes(db, table, app, docType) {
  // Load all types for this app and filter in JS to avoid LIKE underscore escaping issues
  const rows = await db.promise(
    `SELECT DISTINCT type FROM ${table} WHERE app = $1 ORDER BY type`, [app]
  );
  const prefix = `${docType}-`;
  return rows.map(r => r.type).filter(t => t.startsWith(prefix) && isOldSplitType(t));
}

// ---------------------------------------------------------------------------
// ID conflict checking
// ---------------------------------------------------------------------------

async function checkIdConflicts(db, mainTable, ids) {
  if (!ids.length) return 0;
  let conflicts = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, j) => `$${j + 1}`).join(',');
    const rows = await db.promise(
      `SELECT COUNT(*) as cnt FROM ${mainTable} WHERE id IN (${placeholders})`, batch
    );
    conflicts += +(rows[0]?.cnt || 0);
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Sequence helpers
// ---------------------------------------------------------------------------

async function resetSequence(db, app, dbType, splitMode, maxId) {
  if (!maxId || maxId < 0) return;
  if (dbType === 'postgres') {
    const seqName = splitMode === 'per-app'
      ? `dms_${sanitize(app)}.data_items_id_seq`
      : 'dms.data_items_id_seq';
    await db.promise(
      `SELECT setval('${seqName}', GREATEST($1, (SELECT COALESCE(MAX(id), 0) FROM dms.data_items)))`,
      [maxId]
    );
  } else {
    const seqTable = splitMode === 'per-app' ? `seq__${sanitize(app)}` : 'dms_id_seq';
    try {
      await db.query(`DELETE FROM ${seqTable}`);
      await db.query(`INSERT INTO ${seqTable} (id) VALUES ($1)`, [maxId]);
    } catch {
      // Sequence table may not exist — ignore
    }
  }
}

async function allocateId(db, dbType, seqName) {
  if (dbType === 'postgres') {
    const rows = await db.promise(`SELECT nextval('${seqName}') as id`);
    return +rows[0].id;
  }
  const result = await db.query(`INSERT INTO ${seqName} DEFAULT VALUES`);
  return result.lastInsertRowid || result.rows?.[0]?.id;
}

// ---------------------------------------------------------------------------
// Negative ID resolution (for auto-created dmsEnvs)
// ---------------------------------------------------------------------------

function updateNegativeIdRefs(pendingWrites, oldNegId, newId) {
  for (const pw of pendingWrites) {
    for (const row of pw.rows) {
      if (row.id === oldNegId) row.id = newId;

      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (!data) continue;

      let changed = false;
      for (const key of ['patterns', 'dms_envs', 'theme_refs', 'sources']) {
        if (Array.isArray(data[key])) {
          for (const ref of data[key]) {
            if (typeof ref === 'object' && +ref.id === oldNegId) {
              ref.id = newId;
              changed = true;
            }
          }
        }
      }
      if (data.dmsEnvId === oldNegId) { data.dmsEnvId = newId; changed = true; }
      if (changed) row.data = data;
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(stats, siteType, opts) {
  console.log(`\n=== Migration Report ===`);
  console.log(`Site: ${opts.type} → ${siteType}`);
  console.log(`Patterns: ${stats.patterns.copied} copied, ${stats.patterns.ignored} ignored`);

  for (const d of stats.patternDetails) {
    const parts = [];
    if (d.pages) parts.push(`${d.pages} pages`);
    if (d.components) parts.push(`${d.components} components`);
    if (d.history) parts.push(`${d.history} history rows`);
    if (d.sources) parts.push(`${d.sources} sources`);
    if (d.views) parts.push(`${d.views} views`);
    if (d.dataRows) parts.push(`${d.dataRows} data rows`);
    if (d.splitTables) parts.push(`${d.splitTables} split tables`);
    console.log(`  - ${d.name} (${d.type}): ${parts.join(', ')}`);
  }

  console.log(`Themes: ${stats.themes} copied`);
  console.log(`DmsEnvs: ${stats.dmsEnvs.existing} existing + ${stats.dmsEnvs.created} created`);
  console.log(`Total rows: ${stats.totalRows}`);
  if (stats.templatedPages) {
    console.log(`Templated pages skipped: ${stats.templatedPages}`);
  }
  if (stats.orphanedSections) {
    console.log(`Orphaned sections skipped: ${stats.orphanedSections}`);
  }
  if (stats.images.extracted) {
    const mb = (stats.images.totalBytes / 1024 / 1024).toFixed(1);
    console.log(`Images: ${stats.images.extracted} extracted (${mb} MB)`);
  }
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function runMigration(sourceDb, targetDb, sourceConfig, targetConfig, opts) {
  const isDry = !opts.apply;
  const { app, ignore, include } = opts;
  const srcTable = getTable(sourceConfig);
  const tgtMainTable = getTable(targetConfig, app);
  const tgtDbType = targetDb.type;
  const tgtSplitMode = targetConfig.splitMode || 'legacy';

  const pendingWrites = []; // { table, rows, splitInfo? }
  const stats = {
    site: 0, themes: 0,
    dmsEnvs: { existing: 0, created: 0 },
    patterns: { copied: 0, ignored: 0 },
    patternDetails: [],
    orphanedSections: 0,
    templatedPages: 0,
    totalRows: 0,
    images: { extracted: 0, totalBytes: 0 },
  };

  // Image extraction: defaults to ./img/${app}/, --no-img to disable
  const imgOutput = opts.imgOutput === false ? null
    : (opts.imgOutput || join('img', app));
  const imgUrlPrefix = imgOutput ? `/img/${app}/` : null;
  const pendingImages = []; // { filename, buffer }

  function addRows(tableName, rows, splitInfo) {
    if (!rows.length) return;
    pendingWrites.push({ table: tableName, rows, splitInfo });
    stats.totalRows += rows.length;
  }

  // Resume: load checkpoint from prior run
  let checkpoint = null;
  const completedPatternIds = new Set();
  if (opts.resume) {
    checkpoint = loadCheckpoint(app);
    if (checkpoint) {
      for (const id of (checkpoint.completedPatternIds || [])) completedPatternIds.add(id);
      for (const s of (checkpoint.usedSlugs || [])) usedSlugs.add(s);
      console.log(`\n=== RESUMING (${completedPatternIds.size} patterns already completed) ===`);
    } else {
      console.log('\n=== RESUME requested but no checkpoint found — starting fresh ===');
    }
  }

  console.log(`\n${isDry ? '=== DRY RUN ===' : opts.resume && checkpoint ? '=== RESUMING ===' : '=== APPLYING ==='}`);
  console.log(`Source: ${sourceConfig.database || sourceConfig.filename}`);
  console.log(`Target: ${targetConfig.database || targetConfig.filename}`);
  console.log(`App: ${app}, Site type: ${opts.type}`);
  console.log(`Images: ${imgOutput ? `extract to ${imgOutput}/ (serve at /img/${app}/)` : 'disabled'}\n`);

  // =========================================================================
  // Step 1: Load and validate site record
  // =========================================================================

  const siteRows = await loadRowsByType(sourceDb, srcTable, app, opts.type);
  if (!siteRows.length) {
    console.error(`No site record found for app=${app} type=${opts.type}`);
    process.exit(1);
  }
  const site = siteRows[0];
  if (!site._data?.patterns) {
    console.error(`Site record id=${site.id} has no patterns array — is this really a site?`);
    process.exit(1);
  }

  const siteInstance = nameToSlug(opts.type) || opts.type;
  const siteType = `${siteInstance}:site`;
  console.log(`Site: ${opts.type} → ${siteType} (id=${site.id})`);

  const usedSlugs = new Set();
  usedSlugs.add(siteInstance);
  const siteData = { ...site._data };

  // =========================================================================
  // Step 2: Copy themes
  // =========================================================================

  const themeRefIds = extractRefIds(siteData.theme_refs);
  const newThemeRefs = [];

  if (themeRefIds.length) {
    const themeRows = await loadRowsByIds(sourceDb, srcTable, themeRefIds);
    for (const theme of themeRows) {
      const themeName = theme._data?.name || theme._data?.theme_id || 'default';
      const themeSlug = uniqueSlug(nameToSlug(themeName), usedSlugs);
      usedSlugs.add(themeSlug);
      const newType = `${themeSlug}:theme`;
      console.log(`  Theme: ${theme.type} → ${newType} (id=${theme.id})`);
      addRows(tgtMainTable, [buildRow(theme, newType)]);
      newThemeRefs.push({ ref: `${app}+${themeSlug}:theme`, id: theme.id });
      stats.themes++;
    }
  }
  siteData.theme_refs = newThemeRefs;

  // =========================================================================
  // Step 3: Copy dmsEnvs
  // =========================================================================

  const dmsEnvRefIds = extractRefIds(siteData.dms_envs);
  const dmsEnvMap = new Map(); // oldId → { slug, data, row }
  const newDmsEnvRefs = [];

  if (dmsEnvRefIds.length) {
    const envRows = await loadRowsByIds(sourceDb, srcTable, dmsEnvRefIds);
    for (const env of envRows) {
      const envName = env._data?.name || 'default';
      const envSlug = uniqueSlug(nameToSlug(envName), usedSlugs);
      usedSlugs.add(envSlug);
      console.log(`  dmsEnv: ${env.type} → ${siteInstance}|${envSlug}:dmsenv (id=${env.id})`);
      dmsEnvMap.set(env.id, { slug: envSlug, data: { ...env._data }, row: env });
      newDmsEnvRefs.push({ ref: `${app}+${siteInstance}|dmsenv`, id: env.id });
      stats.dmsEnvs.existing++;
    }
  }

  // =========================================================================
  // Step 3b: Pre-scan all sources to build doc_type → slug map
  // (Needed so page pattern sections can update embedded sourceInfo refs)
  // =========================================================================

  const sourceDocTypeMap = new Map(); // old source doc_type → new source name slug
  const prePatternRefIds = extractRefIds(siteData.patterns);
  if (prePatternRefIds.length) {
    const allPatterns = await loadRowsByIds(sourceDb, srcTable, prePatternRefIds);
    for (const p of allPatterns) {
      const pDocType = p._data?.doc_type;
      const pType = Array.isArray(p._data?.pattern_type) ? p._data.pattern_type[0] : p._data?.pattern_type;
      if ((pType === 'datasets' || pType === 'forms') && pDocType) {
        const sources = await loadRowsByType(sourceDb, srcTable, app, `${pDocType}|source`);
        for (const src of sources) {
          const srcDocType = src._data?.doc_type;
          const srcName = src._data?.name;
          if (srcDocType && srcName) {
            sourceDocTypeMap.set(srcDocType, nameToSlug(srcName));
          }
        }
      }
    }
    if (sourceDocTypeMap.size) {
      console.log(`  Source doc_type mappings: ${[...sourceDocTypeMap.entries()].map(([k,v]) => `${k} → ${v}`).join(', ')}`);
    }
  }

  // =========================================================================
  // Ensure target schema exists before pattern loop (data rows may write directly)
  // =========================================================================

  if (opts.apply) {
    await ensureDmsSchema(targetDb);
    if (tgtSplitMode === 'per-app') {
      const seqName = await ensureSequence(targetDb, app, tgtDbType, tgtSplitMode);
      const resolved = resolveTable(app, '', tgtDbType, tgtSplitMode);
      await ensureTable(targetDb, resolved.schema, resolved.table, tgtDbType, seqName);
    }
    // Reset: delete existing rows for this app in the target (skip on resume)
    if (opts.reset && !opts.resume) {
      const deleted = await targetDb.promise(
        `DELETE FROM ${tgtMainTable} WHERE app = $1`, [app]
      );
      const count = deleted?.changes ?? deleted?.rowCount ?? deleted?.length ?? 0;
      if (count) console.log(`  Reset: deleted ${count} existing rows for app=${app} from ${tgtMainTable}`);

      if (tgtSplitMode === 'per-app' && tgtDbType === 'postgres') {
        const resolved = resolveTable(app, '', tgtDbType, tgtSplitMode);
        const splitTables = await targetDb.promise(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name != 'data_items'`,
          [resolved.schema]
        );
        for (const t of splitTables) {
          await targetDb.promise(`DROP TABLE IF EXISTS "${resolved.schema}"."${t.table_name}"`, []);
          console.log(`  Reset: dropped split table ${resolved.schema}.${t.table_name}`);
        }
      }
    }
  }

  // =========================================================================
  // Step 4: Copy patterns and their children
  // =========================================================================

  const patternRefIds = extractRefIds(siteData.patterns);
  const newPatternRefs = [];
  const migratedIds = new Set(); // Track IDs across patterns to skip duplicates (shared doc_type)

  // Resume: rebuild migratedIds from rows already in target DB
  if (opts.resume && completedPatternIds.size > 0) {
    console.log('  Rebuilding migratedIds from target DB...');
    let rebuilt = 0;
    const existingIds = await targetDb.promise(
      `SELECT id FROM ${tgtMainTable} WHERE app = $1`, [app]
    );
    for (const r of existingIds) { migratedIds.add(+r.id); rebuilt++; }
    // Also scan split tables for data row IDs
    if (tgtSplitMode === 'per-app' && tgtDbType === 'postgres') {
      const resolved = resolveTable(app, '', tgtDbType, tgtSplitMode);
      const splitTables = await targetDb.promise(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name != 'data_items'`,
        [resolved.schema]
      );
      for (const t of splitTables) {
        const rows = await targetDb.promise(
          `SELECT id FROM "${resolved.schema}"."${t.table_name}"`, []
        );
        for (const r of rows) migratedIds.add(+r.id);
        rebuilt += rows.length;
      }
    }
    console.log(`  Rebuilt ${rebuilt} migratedIds from target`);
    // Restore dmsEnvMap from checkpoint
    if (checkpoint?.dmsEnvState) {
      for (const [key, val] of checkpoint.dmsEnvState) {
        if (!dmsEnvMap.has(+key)) dmsEnvMap.set(+key, val);
      }
    }
  }

  if (patternRefIds.length) {
    const patternRows = await loadRowsByIds(sourceDb, srcTable, patternRefIds);

    for (const pattern of patternRows) {
      const patternName = pattern._data?.name;
      const docType = pattern._data?.doc_type;
      // pattern_type can be a JSON array string like '["page"]' in some records
      const rawPType = pattern._data?.pattern_type;
      const patternType = Array.isArray(rawPType) ? rawPType[0] : rawPType;

      const matchesName = (list) => list.some(item =>
        patternName === item || docType === item ||
        nameToSlug(patternName || '') === nameToSlug(item)
      );

      if (matchesName(ignore)) {
        console.log(`  Pattern: ${patternName} (id=${pattern.id}) — IGNORED (--ignore)`);
        stats.patterns.ignored++;
        continue;
      }

      if (include.length && !matchesName(include)) {
        console.log(`  Pattern: ${patternName} (id=${pattern.id}) — SKIPPED (not in --include)`);
        stats.patterns.ignored++;
        continue;
      }

      const slug = nameToSlug(patternName) || (docType ? nameToSlug(docType) : null);
      if (!slug) {
        console.log(`  WARNING: Pattern id=${pattern.id} has no name or doc_type, skipping`);
        stats.patterns.ignored++;
        continue;
      }

      const patternSlug = uniqueSlug(slug, usedSlugs);
      usedSlugs.add(patternSlug);
      const newType = `${siteInstance}|${patternSlug}:pattern`;

      const patternData = { ...pattern._data };
      // Backfill name from doc_type/slug when missing (legacy patterns used doc_type as identifier)
      if (!patternData.name && (docType || patternSlug)) {
        patternData.name = patternName || docType || patternSlug;
      }
      // Normalize pattern_type arrays (e.g., '["page"]' → 'page')
      if (Array.isArray(patternData.pattern_type)) {
        patternData.pattern_type = patternData.pattern_type[0];
      }
      delete patternData.doc_type;

      // Resume: skip patterns already completed in a prior run
      if (completedPatternIds.has(+pattern.id)) {
        console.log(`  Pattern: ${patternName || docType} (${patternType}) → ${newType} (id=${pattern.id}) — RESUMED (skipped)`);
        newPatternRefs.push({ ref: `${app}+${siteInstance}|pattern`, id: pattern.id });
        stats.patterns.copied++;
        stats.patternDetails.push({
          name: patternData.name || patternName || docType || patternSlug, type: patternType,
          pages: 0, components: 0, history: 0, sources: 0, views: 0, dataRows: 0, splitTables: 0,
          resumed: true,
        });
        continue;
      }

      console.log(`  Pattern: ${patternName || docType} (${patternType}) → ${newType} (id=${pattern.id})`);
      addRows(tgtMainTable, [buildRow(pattern, newType, patternData)]);
      newPatternRefs.push({ ref: `${app}+${siteInstance}|pattern`, id: pattern.id });
      stats.patterns.copied++;

      const detail = {
        name: patternData.name || patternName || docType || patternSlug, type: patternType,
        pages: 0, components: 0, history: 0,
        sources: 0, views: 0, dataRows: 0, splitTables: 0,
      };

      if (patternType === 'page') {
        await migratePageChildren(
          sourceDb, srcTable, app, docType, patternSlug,
          detail, stats, addRows, tgtMainTable, migratedIds, sourceDocTypeMap,
          opts.apply ? targetDb : null, imgOutput, imgUrlPrefix
        );
      } else if (patternType === 'datasets' || patternType === 'forms') {
        await migrateDatasetChildren(
          sourceDb, srcTable, app, docType, patternSlug, siteInstance,
          pattern, patternData, dmsEnvMap, newDmsEnvRefs, usedSlugs,
          detail, stats, addRows, tgtMainTable, tgtDbType, tgtSplitMode,
          opts.apply ? targetDb : null
        );
      }

      stats.patternDetails.push(detail);

      // Save checkpoint after each pattern so we can resume on failure
      if (opts.apply) {
        completedPatternIds.add(+pattern.id);
        saveCheckpoint(app, {
          completedPatternIds: [...completedPatternIds],
          usedSlugs: [...usedSlugs],
          dmsEnvState: [...dmsEnvMap.entries()].map(([k, v]) => [k, { slug: v.slug, data: v.data }]),
        });
      }
    }
  }
  siteData.patterns = newPatternRefs;

  // =========================================================================
  // Write dmsEnvs (after Step 6 may have added sources)
  // =========================================================================

  for (const [, envInfo] of dmsEnvMap) {
    const newType = `${siteInstance}|${envInfo.slug}:dmsenv`;
    addRows(tgtMainTable, [buildRow(envInfo.row, newType, envInfo.data)]);
  }
  siteData.dms_envs = newDmsEnvRefs;

  // Write site row
  addRows(tgtMainTable, [buildRow(site, siteType, siteData)]);
  stats.site = 1;

  // =========================================================================
  // Execute
  // =========================================================================

  const allPositiveIds = [];
  for (const pw of pendingWrites) {
    for (const row of pw.rows) {
      if (row.id > 0) allPositiveIds.push(row.id);
    }
  }

  if (opts.apply) {
    // Schema and reset already handled before pattern loop

    // Check for ID conflicts (skip on resume — existing rows are expected)
    if (allPositiveIds.length && !opts.resume) {
      const conflicts = await checkIdConflicts(targetDb, tgtMainTable, allPositiveIds);
      if (conflicts > 0) {
        console.error(`\nERROR: ${conflicts} ID conflicts in target. Use --reset to clear existing data first.`);
        process.exit(1);
      }
    }

    // Allocate real IDs for synthetic rows (negative IDs)
    const negativeIdRows = [];
    for (const pw of pendingWrites) {
      for (const row of pw.rows) {
        if (row.id < 0) negativeIdRows.push(row);
      }
    }
    if (negativeIdRows.length) {
      // Set sequence past all existing positive IDs to avoid collisions
      const maxExisting = Math.max(...allPositiveIds, 0);
      const seqName = await ensureSequence(targetDb, app, tgtDbType, tgtSplitMode);
      if (maxExisting > 0) {
        await resetSequence(targetDb, app, tgtDbType, tgtSplitMode, maxExisting);
      }
      for (const row of negativeIdRows) {
        const oldId = row.id;
        const newId = await allocateId(targetDb, tgtDbType, seqName);
        row.id = newId;
        updateNegativeIdRefs(pendingWrites, oldId, newId);
        allPositiveIds.push(newId); // track for final sequence reset
      }
    }

    // Ensure split tables exist
    for (const pw of pendingWrites) {
      if (pw.splitInfo) {
        const seqName = await ensureSequence(targetDb, app, tgtDbType, tgtSplitMode);
        await ensureTable(targetDb, pw.splitInfo.schema, pw.splitInfo.table, tgtDbType, seqName);
      }
    }

    // Extract embedded images from component rows
    if (imgOutput) {
      for (const pw of pendingWrites) {
        for (const row of pw.rows) {
          const { modified, images } = extractImages(row.id, row.data, imgUrlPrefix, 0);
          if (modified && images.length) {
            row.data = JSON.parse(modified);
            for (const img of images) {
              pendingImages.push(img);
              stats.images.extracted++;
              stats.images.totalBytes += img.decodedBytes;
            }
          }
        }
      }
      if (pendingImages.length) {
        mkdirSync(imgOutput, { recursive: true });
        for (const img of pendingImages) {
          writeFileSync(join(imgOutput, img.filename), img.buffer);
        }
        console.log(`  Images: ${pendingImages.length} extracted to ${imgOutput}/`);
      }
    }

    // Write all rows
    for (const pw of pendingWrites) {
      await writeRows(targetDb, pw.table, pw.rows);
    }

    // Reset sequence
    const maxId = Math.max(...allPositiveIds, 0);
    if (maxId > 0) {
      await resetSequence(targetDb, app, tgtDbType, tgtSplitMode, maxId);
    }

    clearCheckpoint(app);
    console.log('\n=== MIGRATION COMPLETE ===');
  } else {
    // Dry run: still report image counts
    if (imgOutput !== null) {
      for (const pw of pendingWrites) {
        for (const row of pw.rows) {
          const { images } = extractImages(row.id, JSON.stringify(row.data), imgUrlPrefix, 0);
          if (images.length) {
            stats.images.extracted += images.length;
            for (const img of images) stats.images.totalBytes += img.decodedBytes;
          }
        }
      }
    }
    console.log('\n=== DRY RUN COMPLETE — use --apply to execute ===');
  }

  printReport(stats, siteType, opts);
}

// ---------------------------------------------------------------------------
// Step 5: Page pattern children
// ---------------------------------------------------------------------------

async function migratePageChildren(
  sourceDb, srcTable, app, docType, patternSlug,
  detail, stats, addRows, tgtMainTable, migratedIds = new Set(), sourceDocTypeMap = new Map(),
  targetDb = null, imgOutput = null, imgUrlPrefix = null
) {
  if (!docType) {
    console.log(`    WARNING: Page pattern has no doc_type, cannot find children`);
    return;
  }

  // 5a: Stream pages in batches, filtering templated + already migrated
  // Collect referenced section IDs and history IDs without loading everything at once
  const pages = [];
  const referencedSectionIds = new Set();
  const referencedHistoryIds = new Set();
  let alreadyMigrated = 0;
  let templatedSkipped = 0;

  await forEachBatch(sourceDb, srcTable, app, docType, BATCH_SIZE, async (batch) => {
    for (const p of batch) {
      if (migratedIds.has(+p.id)) { alreadyMigrated++; continue; }
      const tid = p._data?.template_id;
      if (tid != null && tid !== -99 && tid !== '-99' && tid !== 'undefined') {
        templatedSkipped++; continue;
      }
      // Collect section refs
      extractRefIds(p._data?.sections).forEach(id => referencedSectionIds.add(id));
      extractRefIds(p._data?.draft_sections).forEach(id => referencedSectionIds.add(id));
      // Collect history refs
      const hist = p._data?.history;
      if (hist) {
        if (typeof hist === 'object' && !Array.isArray(hist) && hist.id) {
          referencedHistoryIds.add(+hist.id);
        } else if (Array.isArray(hist)) {
          for (const ref of hist) {
            if (typeof ref === 'object' && ref.id) referencedHistoryIds.add(+ref.id);
          }
        }
      }
      pages.push(p);
    }
  });

  const skipParts = [];
  if (alreadyMigrated) skipParts.push(`${alreadyMigrated} already migrated`);
  if (templatedSkipped) skipParts.push(`${templatedSkipped} templated`);
  console.log(`    Pages: ${pages.length}${skipParts.length ? ` (${skipParts.join(', ')}, skipped)` : ''}`);
  stats.templatedPages += templatedSkipped;

  // 5b: Remove already-migrated IDs from referenced sets
  for (const id of referencedSectionIds) {
    if (migratedIds.has(id)) referencedSectionIds.delete(id);
  }

  // Process sections in batches to avoid OOM on large patterns (100K+ sections)
  // Transform and write each batch, then discard to free memory
  const sectionIdBatches = [];
  const allSectionIds = [...referencedSectionIds];
  for (let i = 0; i < allSectionIds.length; i += BATCH_SIZE) {
    sectionIdBatches.push(allSectionIds.slice(i, i + BATCH_SIZE));
  }

  let sectionCount = 0;
  for (const idBatch of sectionIdBatches) {
    const batchRows = await loadRowsByIds(sourceDb, srcTable, idBatch);
    const transformed = batchRows.map(s => {
      const sData = { ...s._data };
      if (sourceDocTypeMap.size && sData?.element?.['element-data']) {
        try {
          const elemData = typeof sData.element['element-data'] === 'string'
            ? JSON.parse(sData.element['element-data'])
            : sData.element['element-data'];
          if (elemData?.sourceInfo?.env) {
            let updated = false;
            for (const [oldDocType, newSlug] of sourceDocTypeMap) {
              if (elemData.sourceInfo.env.includes(oldDocType)) {
                elemData.sourceInfo.env = `${app}+${newSlug}`;
                updated = true;
              }
              if (elemData.sourceInfo.type === oldDocType) {
                elemData.sourceInfo.type = newSlug;
                updated = true;
              }
              if (elemData.sourceInfo.srcEnv && elemData.sourceInfo.srcEnv.includes(oldDocType)) {
                elemData.sourceInfo.srcEnv = `${app}+${newSlug}`;
                updated = true;
              }
            }
            if (updated) {
              sData.element = { ...sData.element, 'element-data': JSON.stringify(elemData) };
            }
          }
        } catch (e) { /* leave element-data as-is if parse fails */ }
      }
      return buildRow(s, `${patternSlug}|component`, sData);
    });
    // Extract images + write in --apply mode; count only in dry-run (don't buffer)
    if (targetDb) {
      if (imgOutput) {
        for (const row of transformed) {
          const { modified, images } = extractImages(row.id, row.data, imgUrlPrefix, 0);
          if (modified && images.length) {
            row.data = JSON.parse(modified);
            mkdirSync(imgOutput, { recursive: true });
            for (const img of images) {
              writeFileSync(join(imgOutput, img.filename), img.buffer);
              stats.images.extracted++;
              stats.images.totalBytes += img.decodedBytes;
            }
          }
        }
      }
      await writeRows(targetDb, tgtMainTable, transformed);
    } else if (imgOutput !== null) {
      // Dry run with image counting — count images per batch, don't buffer rows
      for (const row of transformed) {
        const { images } = extractImages(row.id, JSON.stringify(row.data), imgUrlPrefix, 0);
        if (images.length) {
          stats.images.extracted += images.length;
          for (const img of images) stats.images.totalBytes += img.decodedBytes;
        }
      }
    }
    // Don't buffer section rows in pendingWrites — they're the biggest memory consumer
    for (const r of transformed) migratedIds.add(+r.id);
    sectionCount += transformed.length;
  }
  detail.components = sectionCount;

  // Count orphaned sections without loading them
  const totalSectionCount = await countRowsByType(sourceDb, srcTable, app, `${docType}|cms-section`);
  const orphanedCount = totalSectionCount - sectionCount;
  if (orphanedCount > 0) {
    console.log(`    Orphaned sections skipped: ${orphanedCount}`);
    stats.orphanedSections += orphanedCount;
  }

  // 5c: Load only referenced page-edit rows (avoids loading 30K+ unreferenced history rows)
  const pageEditType = `${docType}|page-edit`;
  const referencedPageEdits = await loadRowsByIds(sourceDb, srcTable, [...referencedHistoryIds]);
  const pageEditMap = new Map();
  for (const pe of referencedPageEdits) pageEditMap.set(+pe.id, pe);

  const totalPageEditCount = await countRowsByType(sourceDb, srcTable, app, pageEditType);
  const unreferencedEdits = totalPageEditCount - referencedPageEdits.length;
  if (unreferencedEdits > 0) {
    console.log(`    Unreferenced page-edits skipped: ${unreferencedEdits}`);
  }

  // 5d: Build page rows with updated refs + history
  const pageRows = [];
  const historyRows = [];

  for (const page of pages) {
    const pageData = { ...page._data };

    // Update section refs to new format
    pageData.sections = updateRefs(pageData.sections, `${app}+${patternSlug}|component`);
    pageData.draft_sections = updateRefs(pageData.draft_sections, `${app}+${patternSlug}|component`);

    // Handle history
    const history = pageData.history;
    if (history) {
      const consolidated = consolidateHistory(history, pageEditMap);
      if (consolidated) {
        historyRows.push(buildRow(consolidated.row, `${patternSlug}|page-edit`, consolidated.data));
        pageData.history = { ref: `${app}+${patternSlug}|page-edit`, id: consolidated.row.id };
      }
    }

    pageRows.push(buildRow(page, `${patternSlug}|page`, pageData));
  }
  detail.pages = pageRows.length;

  const uniqueHistory = deduplicateById(historyRows);
  detail.history = uniqueHistory.length;

  if (targetDb) {
    await writeRows(targetDb, tgtMainTable, [...pageRows, ...uniqueHistory]);
  } else {
    addRows(tgtMainTable, [...pageRows, ...uniqueHistory]);
  }
  console.log(`    Components: ${detail.components}, History: ${uniqueHistory.length}`);

  for (const r of pageRows) migratedIds.add(+r.id);
  for (const r of uniqueHistory) migratedIds.add(+r.id);
}

// ---------------------------------------------------------------------------
// Step 6: Dataset/form pattern children
// ---------------------------------------------------------------------------

async function migrateDatasetChildren(
  sourceDb, srcTable, app, docType, patternSlug, siteInstance,
  pattern, patternData, dmsEnvMap, newDmsEnvRefs, usedSlugs,
  detail, stats, addRows, tgtMainTable, tgtDbType, tgtSplitMode,
  targetDb = null
) {
  if (!docType) {
    console.log(`    WARNING: Dataset pattern has no doc_type, cannot find children`);
    return;
  }

  // 6a: Determine or create dmsEnv
  let dmsEnvSlug = null;
  const dmsEnvId = pattern._data?.dmsEnvId;
  if (dmsEnvId && dmsEnvMap.has(+dmsEnvId)) {
    dmsEnvSlug = dmsEnvMap.get(+dmsEnvId).slug;
  }

  if (!dmsEnvSlug) {
    const envName = `${patternSlug}_env`;
    dmsEnvSlug = uniqueSlug(nameToSlug(envName), usedSlugs);
    usedSlugs.add(dmsEnvSlug);

    const newEnvId = -(dmsEnvMap.size + 1); // temporary negative ID
    const envData = { name: envName, sources: [] };
    const envRow = {
      id: newEnvId, app,
      type: `${siteInstance}|${dmsEnvSlug}:dmsenv`,
      data: envData, _data: envData,
      created_at: new Date().toISOString(), created_by: null,
      updated_at: new Date().toISOString(), updated_by: null,
    };
    dmsEnvMap.set(newEnvId, { slug: dmsEnvSlug, data: envData, row: envRow });
    newDmsEnvRefs.push({ ref: `${app}+${siteInstance}|dmsenv`, id: newEnvId });
    stats.dmsEnvs.created++;
    console.log(`    Created dmsEnv: ${dmsEnvSlug} (for pattern ${patternSlug})`);

    patternData.dmsEnvId = newEnvId;
  }

  // 6b: Load sources
  const sources = await loadRowsByType(sourceDb, srcTable, app, `${docType}|source`);
  console.log(`    Sources: ${sources.length}`);

  const sourceRows = [];
  const sourceMap = new Map(); // oldDocType → { slug, rowId }, also sourceId → { slug, rowId }
  const dmsEnvInfo = [...dmsEnvMap.values()].find(e => e.slug === dmsEnvSlug);

  for (const src of sources) {
    const srcName = src._data?.name;
    const srcDocType = src._data?.doc_type;
    const sourceSlug = nameToSlug(srcName) || (srcDocType ? nameToSlug(srcDocType) : `source_${src.id}`);
    const uniqueSrcSlug = uniqueSlug(sourceSlug, usedSlugs);
    usedSlugs.add(uniqueSrcSlug);

    const newType = `${dmsEnvSlug}|${uniqueSrcSlug}:source`;

    const srcData = { ...src._data };
    delete srcData.doc_type;

    sourceRows.push(buildRow(src, newType, srcData));
    const srcInfo = { slug: uniqueSrcSlug, rowId: src.id };
    if (srcDocType) sourceMap.set(srcDocType, srcInfo);
    sourceMap.set(String(src.id), srcInfo);

    // Add source ref to dmsEnv data
    if (dmsEnvInfo) {
      dmsEnvInfo.data.sources = dmsEnvInfo.data.sources || [];
      dmsEnvInfo.data.sources.push({ ref: `${app}+${dmsEnvSlug}|source`, id: src.id });
    }
    detail.sources++;
  }

  // 6c: Load views
  const views = await loadRowsByType(sourceDb, srcTable, app, `${docType}|source|view`);
  console.log(`    Views: ${views.length}`);

  const viewRows = [];
  const viewMap = new Map(); // viewRowId → { viewSlug, sourceSlug }

  for (const view of views) {
    // In legacy, views share the same type prefix (pattern's doc_type) as sources.
    // Match view to source: use the docType key in sourceMap
    const srcInfo = sourceMap.get(docType) || [...sourceMap.values()][0];
    if (!srcInfo) {
      console.log(`    WARNING: View id=${view.id} has no matching source, skipping`);
      continue;
    }

    const viewName = view._data?.name ? nameToSlug(view._data.name) : `v${view.id}`;
    const newType = `${srcInfo.slug}|${viewName}:view`;

    viewRows.push(buildRow(view, newType));
    viewMap.set(String(view.id), { viewSlug: viewName, sourceSlug: srcInfo.slug });
    detail.views++;
  }

  // 6d: Migrate data rows into split tables
  // Data rows use the source's doc_type (not the pattern's doc_type) as their type prefix.
  // Collect all source doc_types to search for data rows.
  const sourceDocTypes = new Set();
  for (const src of sources) {
    const srcDocType = src._data?.doc_type;
    if (srcDocType) sourceDocTypes.add(srcDocType);
  }

  let totalDataRows = 0;
  const seenSplitTables = new Set();

  for (const srcDocType of sourceDocTypes) {
    const dataRowTypes = await findDataRowTypes(sourceDb, srcTable, app, srcDocType);

    for (const oldType of dataRowTypes) {
      const parsed = parseOldSplitType(oldType);
      const srcInfo = sourceMap.get(parsed.docType);
      if (!srcInfo) {
        console.log(`    WARNING: Data rows type=${oldType} have no matching source, skipping`);
        continue;
      }

      const newType = `${srcInfo.slug}|${parsed.viewId}:data`;
      const resolved = resolveTable(app, newType, tgtDbType, tgtSplitMode, srcInfo.rowId);

      if (!seenSplitTables.has(resolved.fullName) && resolved.table !== 'data_items') {
        seenSplitTables.add(resolved.fullName);
        detail.splitTables++;
      }

      // Stream data rows in batches to avoid OOM on large datasets
      const count = await forEachBatch(sourceDb, srcTable, app, oldType, BATCH_SIZE, async (batch) => {
        const transformed = batch.map(row => {
          const rowData = { ...row._data };
          if (parsed.isInvalid && rowData.isValid === undefined) {
            rowData.isValid = false;
          }
          return buildRow(row, newType, rowData);
        });
        if (targetDb) {
          // Write immediately during --apply to avoid buffering in memory
          const seqName = await ensureSequence(targetDb, app, tgtDbType, tgtSplitMode);
          await ensureTable(targetDb, resolved.schema, resolved.table, tgtDbType, seqName);
          await writeRows(targetDb, resolved.fullName, transformed);
        } else {
          // Dry run: just count (don't buffer)
        }
        stats.totalRows += transformed.length;
      });
      totalDataRows += count;
    }
  }
  detail.dataRows = totalDataRows;

  // Write source and view rows to main table
  addRows(tgtMainTable, [...sourceRows, ...viewRows]);

  console.log(`    Data rows: ${totalDataRows}${detail.splitTables ? ` (${detail.splitTables} split tables)` : ''}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const { db: sourceDb, config: sourceConfig } = createDb(opts.source);
  const { db: targetDb, config: targetConfig } = createDb(opts.target);

  try {
    await runMigration(sourceDb, targetDb, sourceConfig, targetConfig, opts);
  } finally {
    if (sourceDb.end) await sourceDb.end();
    else if (sourceDb.pool?.end) await sourceDb.pool.end();
    if (targetDb.end) await targetDb.end();
    else if (targetDb.pool?.end) await targetDb.pool.end();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = {
  buildRow, extractRefIds, updateRefs, consolidateHistory,
  deduplicateById, uniqueSlug, parseOldSplitType, isOldSplitType,
  runMigration,
};
