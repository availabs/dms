#!/usr/bin/env node
/**
 * Migrate legacy DAMA symbologies into DMS.
 *
 * Reads rows from a DAMA-role PostgreSQL database (`data_manager.symbologies`)
 * and writes them as `{patternInstance}|symbology` rows in a DMS-role database's
 * per-app schema. Then rewrites map component references in the same app so that
 * `element-data.symbologies[<dama_symbology_id>]` entries point at the new DMS
 * row IDs instead.
 *
 * PostgreSQL only. Idempotent — re-runs skip already-migrated symbologies and
 * components whose refs have already been rewritten.
 *
 * ┌──────────────┐                  ┌──────────────────────────────┐
 * │  DAMA DB     │                  │   DMS DB  (per-app schema)   │
 * │              │                  │                              │
 * │ data_manager │  migrate:        │ data_items                   │
 * │ .symbologies │─────▶ type =     │   {app}+{patternInstance}    │
 * │              │   {patternInst}  │     |symbology               │
 * │              │   |symbology     │   data.legacy_dama_symbology │
 * │              │                  │     _id = <old id>           │
 * └──────────────┘                  └──────────────────────────────┘
 *                                              ▲
 *                                              │ rewrite refs
 *                                              │
 *                                   data_items (components)
 *                                     where data.element
 *                                       .element-type ∈ { "Map",
 *                                       "Map: Dama Map", "Map: NRI", ...}
 *                                     element-data.symbologies[old_id]
 *                                       → element-data.symbologies[new_id]
 *
 * Usage:
 *   node src/scripts/migrate-dama-symbologies.js \
 *     --dama-config hazmit_dama \
 *     --dms-config dms-mercury-3 \
 *     --app mitigat-ny-prod \
 *     --pattern-instance map_editor_test \
 *     [--apply] \
 *     [--no-prune-dangling]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { resolveTable } = require('../db/table-resolver');

const MAP_ELEMENT_TYPES = [
  'Map',
  'MapDama',
  'Map: Dama Map',
  'Map: NRI',
  'Map: Fusion Events Map',
  'Map: FEMA Disaster Loss',
  'Map: Buildings',
];

const INSERT_BATCH = 50;
const COMPONENT_FETCH_BATCH = 200;

// Unbuffered progress logging — console.log is block-buffered when stdout is
// a pipe/file, which masks progress during long paging loops.
const progress = (msg) => process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    damaConfig: null,
    dmsConfig: null,
    app: null,
    patternInstance: null,
    apply: false,
    pruneDangling: true,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dama-config': opts.damaConfig = args[++i]; break;
      case '--dms-config': opts.dmsConfig = args[++i]; break;
      case '--app': opts.app = args[++i]; break;
      case '--pattern-instance': opts.patternInstance = args[++i]; break;
      case '--apply': opts.apply = true; break;
      case '--prune-dangling': opts.pruneDangling = true; break;
      case '--no-prune-dangling': opts.pruneDangling = false; break;
      case '--help': case '-h': printHelp(); process.exit(0);
      default: console.error(`Unknown argument: ${arg}`); process.exit(1);
    }
  }
  const missing = ['damaConfig', 'dmsConfig', 'app', 'patternInstance'].filter((k) => !opts[k]);
  if (missing.length) {
    console.error(`Missing required args: ${missing.map((k) => '--' + camelToKebab(k)).join(', ')}`);
    printHelp();
    process.exit(1);
  }
  return opts;
}

function camelToKebab(s) { return s.replace(/([A-Z])/g, '-$1').toLowerCase(); }

function printHelp() {
  console.log(`migrate-dama-symbologies — port legacy DAMA symbologies into DMS

Required:
  --dama-config <name>       DAMA-role PG config (e.g. hazmit_dama)
  --dms-config <name>        DMS-role PG config (e.g. dms-mercury-3)
  --app <name>               DMS app to migrate into (e.g. mitigat-ny-prod)
  --pattern-instance <slug>  Mapeditor pattern instance to own migrated rows
                             (e.g. map_editor_test). Must already exist.

Optional:
  --apply                    Execute writes. Without this, runs dry-run only.
  --no-prune-dangling        Leave dangling DAMA-id references in components
                             rather than stripping them (default: strip).
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  console.log('Options:', JSON.stringify(opts, null, 2));

  const dama = await connect(opts.damaConfig);
  const dms = await connect(opts.dmsConfig);

  try {
    // --- 1. Preflight: resolve target table + pattern
    const splitMode = loadConfig(opts.dmsConfig).splitMode || 'per-app';
    const targetTbl = resolveTable(opts.app, 'noop', 'postgres', splitMode).fullName;
    const symbologyType = `${opts.patternInstance}|symbology`;
    console.log(`\nTarget: ${targetTbl}  (type=${symbologyType})`);

    const patternRow = await findPattern(dms, targetTbl, opts.app, opts.patternInstance);
    if (!patternRow) {
      throw new Error(
        `No mapeditor pattern found in ${targetTbl} for app='${opts.app}' ` +
        `instance='${opts.patternInstance}'. Expected a row with type LIKE '%|${opts.patternInstance}:pattern'.`
      );
    }
    console.log(`Pattern: id=${patternRow.id} type=${patternRow.type} name='${patternRow.name || ''}'`);

    // --- 2. Fetch DAMA symbologies
    const damaRows = await fetchDamaSymbologies(dama);
    console.log(`\nFetched ${damaRows.length} DAMA symbologies from data_manager.symbologies`);

    // --- 3. Build existing ID map (for idempotency)
    const alreadyMigrated = await fetchExistingMigratedMap(dms, targetTbl, opts.app, symbologyType);
    console.log(`Already migrated: ${alreadyMigrated.size} rows`);

    const toMigrate = damaRows.filter((r) => !alreadyMigrated.has(r.symbology_id));
    console.log(`To migrate: ${toMigrate.length} rows`);

    // --- 4. Plan/write symbology rows
    const newIdMap = new Map(alreadyMigrated); // damaId → dmsId

    if (!opts.apply) {
      console.log(`\n[DRY-RUN] Would insert ${toMigrate.length} rows. Sample:`);
      toMigrate.slice(0, 3).forEach((r) => {
        console.log(`  ${r.symbology_id}: "${r.name}" (collection=${r.collection_id ?? 'null'})`);
      });
      // Populate a synthetic mapping so the rewrite-planning phase correctly
      // distinguishes TRUE dangling refs (DAMA id missing from the source
      // table) from "would-be-migrated" refs. Uses negative placeholder IDs.
      toMigrate.forEach((r) => {
        if (!newIdMap.has(r.symbology_id)) newIdMap.set(r.symbology_id, -r.symbology_id);
      });
    } else if (toMigrate.length) {
      console.log(`\nInserting ${toMigrate.length} rows in batches of ${INSERT_BATCH}...`);
      for (let i = 0; i < toMigrate.length; i += INSERT_BATCH) {
        const batch = toMigrate.slice(i, i + INSERT_BATCH);
        const inserted = await insertSymbologies(dms, targetTbl, opts.app, symbologyType, batch);
        for (const { damaId, dmsId } of inserted) newIdMap.set(damaId, dmsId);
        console.log(`  Inserted ${Math.min(i + batch.length, toMigrate.length)}/${toMigrate.length}`);
      }
    }

    // --- 5. Scan map components via keyset pagination
    // Single query per page using `id > lastId ORDER BY id LIMIT N`, which
    // uses the primary-key index and pulls only what we need (element-data as
    // text). Avoids the slow ANY(bigint[]) path we previously used.
    progress(`Scanning map components in ${targetTbl}...`);
    const rewrites = [];
    const danglingRefs = new Set();
    let lastId = 0;
    let scanned = 0;
    for (;;) {
      const t0 = Date.now();
      const batch = await fetchMapComponentsPage(dms, targetTbl, opts.app, lastId, COMPONENT_FETCH_BATCH);
      const fetchMs = Date.now() - t0;
      if (!batch.length) break;
      for (const c of batch) {
        const plan = planRewrite(c, newIdMap, { pruneDangling: opts.pruneDangling });
        if (!plan) continue;
        if (plan.dangling.length) plan.dangling.forEach((id) => danglingRefs.add(id));
        rewrites.push(plan);
      }
      scanned += batch.length;
      lastId = Number(batch[batch.length - 1].id);
      progress(`  +${batch.length} rows in ${fetchMs}ms (scanned ${scanned}, rewrites ${rewrites.length}, lastId=${lastId})`);
    }
    progress(`Components needing rewrite: ${rewrites.length}`);
    if (danglingRefs.size) {
      console.log(`Dangling DAMA symbology IDs (not in DAMA table): ${[...danglingRefs].sort((a, b) => a - b).join(', ')}`);
      console.log(`  → ${opts.pruneDangling ? 'stripping from components' : 'leaving in place (pass --prune-dangling to strip)'}`);
    }

    if (!opts.apply) {
      console.log(`\n[DRY-RUN] Would rewrite ${rewrites.length} components. Sample:`);
      rewrites.slice(0, 3).forEach((r) => {
        console.log(`  component id=${r.id}: rekeying ${Object.keys(r.newSymbologies).length} symbology entries`);
      });
    } else if (rewrites.length) {
      console.log(`\nRewriting ${rewrites.length} components...`);
      let done = 0;
      for (let i = 0; i < rewrites.length; i += COMPONENT_FETCH_BATCH) {
        const batch = rewrites.slice(i, i + COMPONENT_FETCH_BATCH);
        await applyRewrites(dms, targetTbl, batch);
        done += batch.length;
        console.log(`  Rewrote ${done}/${rewrites.length}`);
      }
    }

    // --- 7. Persist ID map + report
    const scratchDir = path.join(process.cwd(), 'scratchpad', opts.app);
    if (opts.apply) {
      fs.mkdirSync(scratchDir, { recursive: true });
      const idMapPath = path.join(scratchDir, 'symbology-id-map.json');
      const idMapJson = Object.fromEntries([...newIdMap.entries()].sort((a, b) => a[0] - b[0]));
      fs.writeFileSync(idMapPath, JSON.stringify(idMapJson, null, 2));
      console.log(`\nID map written to: ${idMapPath}`);
    }

    console.log(`\n=== Migration Report ===`);
    console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`DAMA symbologies scanned: ${damaRows.length}`);
    console.log(`Already migrated (skipped): ${alreadyMigrated.size}`);
    console.log(`${opts.apply ? 'Migrated now' : 'Would migrate'}: ${toMigrate.length}`);
    console.log(`Map components scanned: ${scanned}`);
    console.log(`Components ${opts.apply ? 'rewritten' : 'needing rewrite'}: ${rewrites.length}`);
    console.log(`Dangling DAMA ids: ${danglingRefs.size}${opts.pruneDangling ? ' (stripped)' : ' (left in place)'}`);
    console.log(`New pattern_instance|symbology rows total: ${newIdMap.size}`);
  } finally {
    await dama.end();
    await dms.end();
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function connect(configName) {
  const config = loadConfig(configName);
  if (config.type && config.type !== 'postgres') {
    throw new Error(`${configName}: PostgreSQL only (got ${config.type})`);
  }
  const db = new PostgresAdapter({ ...config, type: 'postgres' });
  // Probe to force connection resolution upfront.
  await db.query('SELECT 1');
  return db;
}

async function findPattern(dms, table, app, patternInstance) {
  const sql = `
    SELECT id, type, data->>'name' AS name
    FROM ${table}
    WHERE app = $1
      AND type LIKE '%|' || $2 || ':pattern'
    ORDER BY id ASC
    LIMIT 1
  `;
  const { rows } = await dms.query(sql, [app, patternInstance]);
  return rows[0] || null;
}

async function fetchDamaSymbologies(dama) {
  const { rows } = await dama.query(`
    SELECT
      symbology_id,
      name,
      collection_id,
      description,
      metadata,
      symbology,
      categories,
      source_dependencies,
      _created_timestamp,
      _modified_timestamp
    FROM data_manager.symbologies
    ORDER BY symbology_id
  `);
  return rows;
}

async function fetchExistingMigratedMap(dms, table, app, symbologyType) {
  const sql = `
    SELECT
      id,
      (data->>'legacy_dama_symbology_id')::int AS dama_id
    FROM ${table}
    WHERE app = $1
      AND type = $2
      AND data ? 'legacy_dama_symbology_id'
  `;
  const { rows } = await dms.query(sql, [app, symbologyType]);
  const map = new Map();
  for (const r of rows) {
    if (r.dama_id != null) map.set(Number(r.dama_id), Number(r.id));
  }
  return map;
}

async function insertSymbologies(dms, table, app, symbologyType, batch) {
  // One INSERT per row so we can RETURNING id easily. Could be multi-row but
  // the per-row perf is fine for 247 records and keeps the mapping simple.
  const inserted = [];
  for (const r of batch) {
    const data = {
      name: r.name,
      description: r.description || 'map',
      symbology: r.symbology,
      metadata: r.metadata,
      categories: r.categories,
      legacy_dama_symbology_id: r.symbology_id,
      legacy_collection_id: r.collection_id,
      legacy_source_dependencies: r.source_dependencies,
      _migrated_at: new Date().toISOString(),
      _migrated_from_created: r._created_timestamp,
      _migrated_from_modified: r._modified_timestamp,
    };
    const { rows } = await dms.query(
      `INSERT INTO ${table} (app, type, data) VALUES ($1, $2, $3::jsonb) RETURNING id`,
      [app, symbologyType, JSON.stringify(data)]
    );
    inserted.push({ damaId: r.symbology_id, dmsId: Number(rows[0].id) });
  }
  return inserted;
}

/**
 * Keyset-paginate through map-like components with DAMA symbology references.
 *
 * Pulls only what we need — `element-data` as text — rather than the full
 * `data` JSONB (100KB+/row for maps). Filters at the SQL level:
 *   - app + `|component` type
 *   - element-type ∈ MAP_ELEMENT_TYPES
 *   - element-data contains `"symbology_id"` (fast substring scan, drops
 *     empty-map and DMS-only maps)
 *   - id > lastId (keyset pagination via primary-key index)
 */
async function fetchMapComponentsPage(dms, table, app, lastId, limit) {
  const { rows } = await dms.query(
    `SELECT
       id,
       data->'element'->>'element-data' AS element_data_str
     FROM ${table}
     WHERE app = $1
       AND type LIKE '%|component'
       AND (data->'element'->>'element-type') = ANY($2::text[])
       AND (data->'element'->>'element-data') LIKE '%symbology_id%'
       AND id > $3
     ORDER BY id
     LIMIT $4`,
    [app, MAP_ELEMENT_TYPES, lastId, limit]
  );
  // Reshape to match planRewrite's expected input.
  return rows.map((r) => ({
    id: r.id,
    data: { element: { 'element-data': r.element_data_str } },
  }));
}

// ---------------------------------------------------------------------------
// Rewrite planning
// ---------------------------------------------------------------------------

/**
 * Decide how to rewrite a map component's element-data.symbologies object.
 *
 * Returns `null` if there's nothing to change (no DAMA-only references).
 * Otherwise returns:
 *   { id, newElementDataString, newSymbologies, dangling }
 *
 * `newSymbologies` is for logging only.
 * `dangling` is the list of DAMA ids with no mapping (not in damaToDms).
 */
function planRewrite(component, damaToDms, { pruneDangling = true } = {}) {
  const element = component.data && component.data.element;
  if (!element) return null;

  const edRaw = element['element-data'];
  if (!edRaw) return null;
  let ed;
  try { ed = typeof edRaw === 'string' ? JSON.parse(edRaw) : edRaw; }
  catch { return null; }
  if (!ed.symbologies || typeof ed.symbologies !== 'object') return null;

  const newSymbologies = {};
  const dangling = [];
  let changed = false;

  for (const [key, val] of Object.entries(ed.symbologies)) {
    // Detection: a DAMA reference has `symbology_id` set and either no `id`
    // or an `id` equal to `symbology_id` (legacy). A DMS reference has only
    // `id` (no `symbology_id`) OR `id` that doesn't match `symbology_id`.
    const symId = val && val.symbology_id != null ? Number(val.symbology_id) : null;
    const dmsId = val && val.id != null ? Number(val.id) : null;
    const isDamaRef = symId != null && (dmsId == null || dmsId === symId);

    if (!isDamaRef) {
      // Leave DMS-native entries untouched.
      newSymbologies[key] = val;
      continue;
    }

    const mappedId = damaToDms.get(symId);
    if (mappedId == null) {
      // Dangling — the referenced DAMA id was not found in the DAMA table.
      dangling.push(symId);
      if (!pruneDangling) {
        newSymbologies[key] = val; // leave in place
      } else {
        changed = true; // dropping is a change
      }
      continue;
    }

    // Rewrite: rekey entry under the new DMS id, clear symbology_id, set id,
    // clear isDamaSymbology flag if present.
    const rewritten = {
      ...val,
      id: mappedId,
      symbology_id: undefined,
      symbology: val.symbology ? {
        ...val.symbology,
        id: mappedId,
        isDamaSymbology: false,
      } : val.symbology,
    };
    delete rewritten.symbology_id;
    newSymbologies[String(mappedId)] = rewritten;
    changed = true;
  }

  if (!changed && dangling.length === 0) return null;
  if (!changed) return null; // all dangling, not pruning → nothing to write

  const newEd = { ...ed, symbologies: newSymbologies };
  const newElementDataString = JSON.stringify(newEd);
  return {
    id: component.id,
    newElementDataString,
    newSymbologies,
    dangling,
  };
}

// ---------------------------------------------------------------------------
// Apply rewrites
// ---------------------------------------------------------------------------

async function applyRewrites(dms, table, batch) {
  // Each component gets its own UPDATE — we need to set a nested JSONB path
  // (data.element.element-data) to a string value. `jsonb_set` handles this
  // cleanly in PostgreSQL.
  for (const r of batch) {
    await dms.query(
      `UPDATE ${table}
       SET data = jsonb_set(
             data,
             '{element,element-data}',
             to_jsonb($2::text),
             false
           ),
           updated_at = NOW()
       WHERE id = $1`,
      [r.id, r.newElementDataString]
    );
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFATAL:', err);
    process.exit(1);
  });
}

module.exports = { planRewrite };
