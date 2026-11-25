#!/usr/bin/env node
/**
 * Count, and with --apply fill in, the Editable flag on every source of one database.
 *
 *     node backfill-source-editable.js --db <config> [--app <app>[,<app>…]] [--apply] [--out <file>]
 *
 * WHY. `isEditable` is one flag for every source, internal and external, in the same place
 * (planning/tasks/current/source-editable-flag-everywhere.md):
 *
 *   external (DAMA)   data_manager.sources.metadata.isEditable
 *   internal (DMS)    the source row's data.metadata.isEditable
 *
 * New sources get a value when they are created (dama/upload/metadata.js createDamaSource: false;
 * routes/dms/sourceEditable.js: true). This gives one to the sources created before that:
 *
 *   internal, no value             → true   (internal rows were always editable)
 *   external, metadata but no value → false
 *   external, metadata NULL        → not written: no metadata reads as not editable (owner, 2026-11-25)
 *   metadata that is not a JSON object, or an isEditable that is not a boolean → listed, never written
 *
 * A config whose role includes `dama` is read as external sources; one whose role includes `dms` as internal
 * sources, for the apps `--app` names (required for a DMS database: its tables are per app).
 *
 * WITHOUT --apply NOTHING IS WRITTEN: the run prints the counts by source type, which is the audit. With
 * --apply it also writes the changed ids to `--out` (default ./backfill-source-editable.<db>.<time>.json).
 * Safe to run again: a source that has a value is never touched.
 *
 * The internal write is a direct UPDATE: no change_log row, so a browser's local copy of the source row
 * picks the flag up at its next full load. Readers treat a missing value as editable for an internal
 * source, so nothing changes for it in the meantime.
 */
const fs = require('fs');
const path = require('path');
const { getDb, awaitReady, loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');
const { jsonMerge } = require('../db/query-utils');

const BUCKETS = ['true', 'false', 'blank', 'none', 'not_object', 'not_boolean'];

const asObject = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v.trim()) return null;
  try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
};

/** Which bucket a metadata value falls in. `none`: no metadata at all. `blank`: an object with no isEditable. */
function bucketOf(metadata) {
  if (metadata === null || metadata === undefined || metadata === '') return 'none';
  const m = asObject(metadata);
  if (!m) return 'not_object';
  if (!('isEditable' in m)) return 'blank';
  return typeof m.isEditable === 'boolean' ? String(m.isEditable) : 'not_boolean';
}

const emptyCounts = () => Object.fromEntries(BUCKETS.map(b => [b, 0]));
function tally(rows) {
  const byType = {};
  for (const r of rows) (byType[r.type || '(no type)'] ||= emptyCounts())[r.bucket]++;
  return byType;
}

// ── external (DAMA) ──────────────────────────────────────────────────────────────────────────────────

/** The bucket of a `data_manager.sources` row, in SQL: hazmit_dama has 13,562 of them, metadata included. */
const damaBucketSql = (db) => db.type === 'postgres'
  ? `CASE WHEN metadata IS NULL THEN 'none'
          WHEN jsonb_typeof(metadata) <> 'object' THEN 'not_object'
          WHEN NOT (metadata ? 'isEditable') THEN 'blank'
          WHEN jsonb_typeof(metadata->'isEditable') = 'boolean' THEN metadata->>'isEditable'
          ELSE 'not_boolean' END`
  : `CASE WHEN metadata IS NULL THEN 'none'
          WHEN json_valid(metadata) = 0 OR json_type(metadata) <> 'object' THEN 'not_object'
          WHEN json_type(metadata, '$.isEditable') IS NULL THEN 'blank'
          WHEN json_type(metadata, '$.isEditable') IN ('true', 'false') THEN json_type(metadata, '$.isEditable')
          ELSE 'not_boolean' END`;

const damaTable = (db) => (db.type === 'postgres' ? 'data_manager.sources' : 'sources');

/** External sources of a DAMA database as [{ id, type, bucket }]. */
async function auditDama(db) {
  const { rows } = await db.query(`SELECT source_id AS id, type, ${damaBucketSql(db)} AS bucket FROM ${damaTable(db)} ORDER BY source_id`);
  return rows.map(r => ({ id: +r.id, type: r.type, bucket: r.bucket }));
}

/** Gives every external source that has metadata but no value `isEditable: false`. Returns the ids written. */
async function backfillDama(db) {
  const set = db.type === 'postgres'
    ? `metadata = metadata || '{"isEditable": false}'::jsonb`
    : `metadata = json_set(metadata, '$.isEditable', json('false'))`;
  const { rows } = await db.query(`UPDATE ${damaTable(db)} SET ${set} WHERE ${damaBucketSql(db)} = 'blank' RETURNING source_id`);
  return rows.map(r => +r.source_id);
}

// ── internal (DMS) ───────────────────────────────────────────────────────────────────────────────────

/** An app's main table, quoted. */
function dmsTable(db, app, splitMode) {
  const t = resolveTable(app, '', db.type, splitMode);
  return db.type === 'postgres' ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;
}

/** Internal sources of one app as [{ id, type, bucket, metadata }] (`type`: the dataset kind, `data.type`). */
async function auditDms(db, app, splitMode) {
  // `{env}|{name}:source`, and the legacy `{doc}|source`
  const { rows } = await db.query(
    `SELECT id, data FROM ${dmsTable(db, app, splitMode)} WHERE app = $1 AND (type LIKE '%:source' OR type LIKE '%|source') ORDER BY id`, [app]);
  return rows.map(r => {
    const data = asObject(r.data) || {};
    const bucket = bucketOf(data.metadata);
    // an internal source with no metadata at all is as blank as one whose metadata lacks the flag
    return { id: +r.id, type: data.type || null, bucket: bucket === 'none' ? 'blank' : bucket, metadata: asObject(data.metadata) };
  });
}

/** Gives every internal source of the app that has no value `isEditable: true`. Returns the ids written. */
async function backfillDms(db, app, splitMode) {
  const table = dmsTable(db, app, splitMode);
  const written = [];
  for (const row of (await auditDms(db, app, splitMode)).filter(r => r.bucket === 'blank')) {
    await db.query(`UPDATE ${table} SET data = ${jsonMerge('data', '$1', db.type)} WHERE id = $2`,
      [JSON.stringify({ metadata: { ...(row.metadata || {}), isEditable: true } }), row.id]);
    written.push(row.id);
  }
  return written;
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────────

function printCounts(title, rows) {
  const byType = tally(rows);
  const total = emptyCounts();
  for (const c of Object.values(byType)) for (const b of BUCKETS) total[b] += c[b];
  console.log(`\n${title}: ${rows.length} source(s)`);
  console.log(`  ${'type'.padEnd(34)} ${BUCKETS.map(b => b.padStart(11)).join(' ')}`);
  for (const [type, c] of Object.entries(byType).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${type.slice(0, 34).padEnd(34)} ${BUCKETS.map(b => String(c[b]).padStart(11)).join(' ')}`);
  }
  console.log(`  ${'TOTAL'.padEnd(34)} ${BUCKETS.map(b => String(total[b]).padStart(11)).join(' ')}`);
  const odd = rows.filter(r => r.bucket === 'not_object' || r.bucket === 'not_boolean');
  if (odd.length) console.log(`  never written (fix by hand): ${odd.map(r => `${r.id} (${r.bucket})`).join(', ')}`);
}

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db) { console.error('--db is required'); process.exit(1); }

  const config = loadConfig(o.db);
  const roles = [].concat(config.role);
  const apps = (o.app || '').split(',').map(s => s.trim()).filter(Boolean);
  if (roles.includes('dms') && !roles.includes('dama') && !apps.length) {
    console.error('--app is required for a DMS database (comma-separated for several)'); process.exit(1);
  }
  const db = getDb(o.db); await awaitReady();
  console.log(`source Editable flag: ${o.apply ? 'APPLY' : 'DRY RUN'}  db=${o.db}  roles=${roles.join(',')}${apps.length ? `  apps=${apps.join(',')}` : ''}`);

  const changed = {};
  if (roles.includes('dama')) {
    const before = await auditDama(db);
    printCounts('external sources', before);
    const blank = before.filter(r => r.bucket === 'blank').length;
    console.log(`  to write (metadata but no value → false): ${blank};  left alone (no metadata, reads as not editable): ${before.filter(r => r.bucket === 'none').length}`);
    if (o.apply) {
      changed.external = await backfillDama(db);
      printCounts('external sources, after', await auditDama(db));
    }
  }
  if (roles.includes('dms')) {
    for (const app of apps) {
      const before = await auditDms(db, app, config.splitMode);
      printCounts(`internal sources of ${app}`, before);
      console.log(`  to write (no value → true): ${before.filter(r => r.bucket === 'blank').length}`);
      if (o.apply) {
        (changed.internal ||= {})[app] = await backfillDms(db, app, config.splitMode);
        printCounts(`internal sources of ${app}, after`, await auditDms(db, app, config.splitMode));
      }
    }
  }

  if (!o.apply) { console.log('\nDRY RUN: nothing was written. Re-run with --apply.'); process.exit(0); }
  const out = o.out || path.resolve(`backfill-source-editable.${o.db}.${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify({ db: o.db, at: new Date().toISOString(), changed }, null, 1));
  const n = (changed.external || []).length + Object.values(changed.internal || {}).reduce((s, ids) => s + ids.length, 0);
  console.log(`\nwrote ${n} source(s); ids in ${out}`);
  process.exit(0);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { bucketOf, auditDama, backfillDama, auditDms, backfillDms };
