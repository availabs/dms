#!/usr/bin/env node
/**
 * Post-migration fix-up for map components.
 *
 * The original `migrate-dama-symbologies.js` rewrote keys inside
 * `element-data.symbologies` (DAMA id → DMS id) but did NOT rewrite the
 * matching references in `element-data.tabs[*].rows[*].symbologyId`. Rows
 * point at the OLD DAMA ids, so MapManager's lookup
 * `state.symbologies[row.symbologyId]` returns an empty object — the layer-
 * name input renders the "Layer Name" placeholder and the panel is blank
 * even though the map itself renders fine (layer rendering iterates the
 * symbologies object values and doesn't care about keys).
 *
 * This script walks every map component in an app and fixes:
 *   1. `tabs[*].rows[*].symbologyId`  — remap legacy DAMA id → new DMS id
 *   2. `tabs[*].rows[*].name`         — backfill from the DMS symbology's name
 *   3. `symbologies[<id>].name`       — backfill from the DMS symbology's name
 *
 * Uses the DMS symbology rows' `data.legacy_dama_symbology_id` to build the
 * id map (the migration script stamps every new row with this field).
 *
 * PostgreSQL only. Idempotent — a second run finds nothing to change.
 *
 * Usage:
 *   node src/scripts/backfill-component-symbology-names.js \
 *     --dms-config dms-mercury-3 \
 *     --app npmrdsv5 \
 *     [--apply]
 */

'use strict';

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

const COMPONENT_FETCH_BATCH = 200;

const progress = (msg) =>
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dmsConfig: null,
    app: null,
    apply: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dms-config': opts.dmsConfig = args[++i]; break;
      case '--app': opts.app = args[++i]; break;
      case '--apply': opts.apply = true; break;
      case '--help': case '-h': printHelp(); process.exit(0);
      default: console.error(`Unknown argument: ${arg}`); process.exit(1);
    }
  }
  const missing = ['dmsConfig', 'app'].filter((k) => !opts[k]);
  if (missing.length) {
    console.error(`Missing required args: ${missing.map((k) => '--' + camelToKebab(k)).join(', ')}`);
    printHelp();
    process.exit(1);
  }
  return opts;
}

function camelToKebab(s) { return s.replace(/([A-Z])/g, '-$1').toLowerCase(); }

function printHelp() {
  console.log(`backfill-component-symbology-names — fix map component references
missed by the initial DAMA→DMS symbology migration.

Remaps legacy DAMA symbology ids in element-data.tabs[*].rows[*].symbologyId
to new DMS ids, and backfills missing .name on both the rows and the
element-data.symbologies entries.

Required:
  --dms-config <name>        DMS-role PG config (e.g. dms-mercury-3)
  --app <name>               DMS app (e.g. npmrdsv5)

Optional:
  --apply                    Execute writes. Without this, runs dry-run only.
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  console.log('Options:', JSON.stringify(opts, null, 2));

  const dms = await connect(opts.dmsConfig);

  try {
    const splitMode = loadConfig(opts.dmsConfig).splitMode || 'per-app';
    const targetTbl = resolveTable(opts.app, 'noop', 'postgres', splitMode).fullName;
    console.log(`\nTarget: ${targetTbl}`);

    // 1. Build maps from DMS symbology rows:
    //    damaToDms: legacy_dama_symbology_id → new dms id
    //    namesByDms: dms id → name
    const { damaToDms, namesByDms } = await fetchSymbologyMaps(dms, targetTbl, opts.app);
    console.log(`Fetched ${namesByDms.size} DMS symbology rows`);
    console.log(`  ${damaToDms.size} carry legacy_dama_symbology_id (migrated)`);
    const withName = [...namesByDms.values()].filter((v) => v && v.trim()).length;
    const emptyNames = namesByDms.size - withName;
    if (emptyNames) console.log(`  ${emptyNames} DMS rows have empty .name — can't be used for name backfill`);

    // 2. Scan components, plan fixes.
    progress(`Scanning map components in ${targetTbl}...`);
    const plans = [];
    let lastId = 0;
    let scanned = 0;
    let rowsRemapped = 0;
    let rowsNamed = 0;
    let entriesNamed = 0;
    const unresolvedIds = new Set();

    for (;;) {
      const t0 = Date.now();
      const batch = await fetchMapComponentsPage(dms, targetTbl, opts.app, lastId, COMPONENT_FETCH_BATCH);
      const fetchMs = Date.now() - t0;
      if (!batch.length) break;
      for (const c of batch) {
        const plan = planFix(c, damaToDms, namesByDms);
        if (!plan) continue;
        rowsRemapped += plan.rowsRemapped;
        rowsNamed += plan.rowsNamed;
        entriesNamed += plan.entriesNamed;
        for (const id of plan.unresolved) unresolvedIds.add(id);
        plans.push(plan);
      }
      scanned += batch.length;
      lastId = Number(batch[batch.length - 1].id);
      progress(`  +${batch.length} rows in ${fetchMs}ms (scanned ${scanned}, plans ${plans.length}, lastId=${lastId})`);
    }
    progress(`Components needing fix-up: ${plans.length}`);
    console.log(`  tabs[].rows[].symbologyId remapped: ${rowsRemapped}`);
    console.log(`  tabs[].rows[].name filled:          ${rowsNamed}`);
    console.log(`  symbologies[*].name filled:         ${entriesNamed}`);
    if (unresolvedIds.size) {
      console.log(`  unresolved ids (no DMS mapping):    ${[...unresolvedIds].sort((a, b) => a - b).join(', ')}`);
    }

    if (!opts.apply) {
      console.log(`\n[DRY-RUN] Would update ${plans.length} components. Sample:`);
      plans.slice(0, 5).forEach((p) => {
        console.log(`  component id=${p.id}: rowsRemapped=${p.rowsRemapped} rowsNamed=${p.rowsNamed} entriesNamed=${p.entriesNamed}`);
      });
    } else if (plans.length) {
      console.log(`\nUpdating ${plans.length} components...`);
      let done = 0;
      for (const p of plans) {
        await dms.query(
          `UPDATE ${targetTbl}
           SET data = jsonb_set(data, '{element,element-data}', to_jsonb($2::text), false),
               updated_at = NOW()
           WHERE id = $1`,
          [p.id, p.newElementDataString]
        );
        done++;
        if (done % 25 === 0 || done === plans.length) {
          console.log(`  Updated ${done}/${plans.length}`);
        }
      }
    }

    console.log('\n=== Fix-up Report ===');
    console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Components scanned:                     ${scanned}`);
    console.log(`Components changed:                     ${plans.length}`);
    console.log(`tabs[].rows[].symbologyId remapped:     ${rowsRemapped}`);
    console.log(`tabs[].rows[].name filled:              ${rowsNamed}`);
    console.log(`symbologies[*].name filled:             ${entriesNamed}`);
    if (unresolvedIds.size) {
      console.log(`Unresolved ids:                         ${unresolvedIds.size}`);
    }
  } finally {
    await dms.close?.();
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function connect(configName) {
  const config = loadConfig(configName);
  if (config.type !== 'postgres') {
    throw new Error(`${configName}: PostgreSQL only (got ${config.type})`);
  }
  const db = new PostgresAdapter({ ...config, type: 'postgres' });
  await db.query('SELECT 1');
  return db;
}

/**
 * One pass over the symbology rows — returns two maps.
 */
async function fetchSymbologyMaps(dms, table, app) {
  const { rows } = await dms.query(
    `SELECT
       id,
       data->>'name' AS name,
       (data->>'legacy_dama_symbology_id')::int AS legacy_dama_id
     FROM ${table}
     WHERE app = $1
       AND type LIKE '%|symbology'`,
    [app]
  );
  const damaToDms = new Map();
  const namesByDms = new Map();
  for (const r of rows) {
    const dmsId = Number(r.id);
    namesByDms.set(dmsId, r.name || '');
    if (r.legacy_dama_id != null) damaToDms.set(Number(r.legacy_dama_id), dmsId);
  }
  return { damaToDms, namesByDms };
}

async function fetchMapComponentsPage(dms, table, app, lastId, limit) {
  const { rows } = await dms.query(
    `SELECT
       id,
       data->'element'->>'element-data' AS element_data_str
     FROM ${table}
     WHERE app = $1
       AND type LIKE '%|component'
       AND (data->'element'->>'element-type') = ANY($2::text[])
       AND id > $3
     ORDER BY id
     LIMIT $4`,
    [app, MAP_ELEMENT_TYPES, lastId, limit]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

function isMissingName(val) {
  if (!val || typeof val !== 'object') return false;
  const n = val.name;
  return n == null || (typeof n === 'string' && n.trim() === '');
}

/**
 * Plan changes for a single component.
 *
 * Returns `null` if nothing needs changing, otherwise:
 *   { id, newElementDataString, rowsRemapped, rowsNamed, entriesNamed, unresolved[] }
 */
function planFix(component, damaToDms, namesByDms) {
  const edRaw = component.element_data_str;
  if (!edRaw) return null;
  let ed;
  try { ed = JSON.parse(edRaw); } catch { return null; }
  if (!ed || typeof ed !== 'object') return null;

  const existingEntryIds = new Set(
    ed.symbologies && typeof ed.symbologies === 'object'
      ? Object.keys(ed.symbologies).map(Number).filter(Number.isFinite)
      : []
  );

  let rowsRemapped = 0;
  let rowsNamed = 0;
  let entriesNamed = 0;
  const unresolved = [];
  let changed = false;

  // --- 1. Remap tabs[].rows[].symbologyId legacy DAMA → DMS id, fill .name ---
  if (Array.isArray(ed.tabs)) {
    for (const tab of ed.tabs) {
      if (!tab || !Array.isArray(tab.rows)) continue;
      for (let i = 0; i < tab.rows.length; i++) {
        const row = tab.rows[i];
        if (!row || row.type !== 'symbology') continue;
        const currentId = row.symbologyId != null ? Number(row.symbologyId) : null;
        if (!Number.isFinite(currentId)) continue;

        let newId = currentId;

        // If this id doesn't resolve to an existing symbologies entry, check
        // if it's a legacy DAMA id we have a mapping for.
        if (!existingEntryIds.has(currentId) && damaToDms.has(currentId)) {
          newId = damaToDms.get(currentId);
          rowsRemapped++;
          changed = true;
        }

        // Backfill name from the DMS row if the row is missing it.
        let newRow = newId !== currentId ? { ...row, symbologyId: newId } : row;
        if (isMissingName(newRow)) {
          const nm = namesByDms.get(newId);
          if (nm && nm.trim()) {
            newRow = { ...newRow, name: nm };
            rowsNamed++;
            changed = true;
          } else if (!damaToDms.has(currentId) && !existingEntryIds.has(currentId)) {
            unresolved.push(currentId);
          }
        }

        if (newRow !== row) tab.rows[i] = newRow;
      }
    }
  }

  // --- 2. Backfill missing .name on symbologies[*] entries ---
  if (ed.symbologies && typeof ed.symbologies === 'object') {
    for (const [key, val] of Object.entries(ed.symbologies)) {
      if (!isMissingName(val)) continue;
      const entryId = val && val.id != null ? Number(val.id) : Number(key);
      if (!Number.isFinite(entryId)) continue;
      const nm = namesByDms.get(entryId);
      if (!nm || !nm.trim()) {
        unresolved.push(entryId);
        continue;
      }
      ed.symbologies[key] = { ...val, name: nm };
      entriesNamed++;
      changed = true;
    }
  }

  if (!changed) return null;

  return {
    id: component.id,
    newElementDataString: JSON.stringify(ed),
    rowsRemapped,
    rowsNamed,
    entriesNamed,
    unresolved,
  };
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

module.exports = { planFix };
