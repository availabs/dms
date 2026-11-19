#!/usr/bin/env node
'use strict';
/**
 * Remove rows nothing in the database can reach (planning/tasks/current/orphan-sweeper.md).
 * The rules and the apply are in routes/dms/orphanSweep.js; this prints and drives them.
 *
 *     node src/scripts/sweep-orphans.js --db <config> [--app <app>]… [--only <category>,…]
 *          [--min-age <hours>] [--json] [--apply [--expect '<json>']] [--drop-schemas <a,b>]
 *
 *   (default)        DRY RUN: counts and sizes per app and category, what is blocked and why, and the
 *                    junk schemas. Nothing is written.
 *   --apply          back up, then delete what the plan lists (re-checked per app in its transaction).
 *   --drop-schemas   with --apply: drop these junk schemas (only names the dry run lists). Never implied.
 *   --only           unlisted_children, dead_containers, unlisted_patterns (the default: all three), other_kinds
 *   --min-age        keep rows created or updated within this many hours (default 24)
 *   --expect         {"<app>": {"<category>": n}}: refuse when the fresh plan differs
 *
 * Categories:
 *   unlisted_children   rows of a declared child kind (childRefs: components, page history) no live row lists
 *   dead_containers     rows under a container no live row is (a page whose pattern is gone, and its rows)
 *   unlisted_patterns   pattern rows no site lists: `duplicate` (a listed twin has the same type) or `alone`
 *   other_kinds         OPT-IN, only when --only names it: rows of a kind that is not page content (map
 *                       symbologies) whose pattern is gone, and an unlisted pattern still holding such rows
 *                       (counted here too: it goes with what it holds).
 *                       Without it they are kept and listed as "held". Deleting them is a deliberate choice.
 *
 * No change_log entries (owner, 2026-11-18). Backups go to DMS_DELETE_BACKUP_DIR
 * (default var/delete-backups) as gzipped NDJSON. The database is opened directly: the server's own
 * init (getDb) runs DDL migrations, which a dry run must not.
 */
const { loadConfig } = require('../db/config');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { planSweep, applySweep, listJunkSchemas, publicPlan, CATEGORIES } = require('../routes/dms/orphanSweep');

function parseArgs(argv) {
  const o = { apps: [], only: null, minAge: 24, json: false, apply: false, expect: null, dropSchemas: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') o.db = argv[++i];
    else if (a === '--app') o.apps.push(argv[++i]);
    else if (a === '--only') o.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--min-age') o.minAge = Number(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--apply') o.apply = true;
    else if (a === '--expect') o.expect = JSON.parse(argv[++i]);
    else if (a === '--drop-schemas') o.dropSchemas = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else { console.error(`Unknown argument: ${a}`); process.exit(1); }
  }
  if (!o.db) { console.error('--db <config> is required'); process.exit(1); }
  if (o.only && o.only.some(c => !CATEGORIES.includes(c))) { console.error(`--only takes: ${CATEGORIES.join(', ')}`); process.exit(1); }
  if (!Number.isFinite(o.minAge) || o.minAge < 0) { console.error('--min-age takes a number of hours'); process.exit(1); }
  if (o.dropSchemas.length && !o.apply) { console.error('--drop-schemas needs --apply (the dry run lists them)'); process.exit(1); }
  return o;
}

const mb = (b) => b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`;
const pad = (s, n) => String(s).padStart(n);

function printPlan(plan) {
  const totals = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  let bytes = 0;
  for (const a of plan.apps) {
    if (a.skipped) { console.log(`\n${a.app}: skipped (${a.skipped})`); continue; }
    if (!a.total && !a.blocked.length && !(a.held || []).length && !(a.notes || []).length) continue;
    console.log(`\n${a.app}  (${a.table}, ${a.rowsInApp} rows)`);
    for (const n of a.notes || []) console.log(`  note: ${n}`);
    if (a.total) {
      console.log(`  ${CATEGORIES.map(c => `${c} ${a.counts[c]}`).join('   ')}   total ${a.total} (${mb(a.bytes)})`);
      for (const g of a.groups.slice(0, 15)) console.log(`   ${pad(g.rows, 7)}  ${g.type}  ${g.category}: ${g.reason}`);
      if (a.groups.length > 15) console.log(`   … ${a.groups.length - 15} more group(s)`);
    }
    if (a.duplicates.length) console.log(`  duplicate pattern rows: ${a.duplicates.map(d => `#${d.id} ${d.type}`).join(', ')}`);
    if ((a.held || []).length) {
      const n = a.held.reduce((s, h) => s + h.rows, 0);
      console.log(`  held, not page content (${n}; --only other_kinds would take them):`);
      for (const h of a.held.slice(0, 10)) console.log(`   ${pad(h.rows, 7)}  ${h.type}  ${h.reason}`);
      if (a.held.length > 10) console.log(`   … ${a.held.length - 10} more group(s)`);
    }
    if (a.blocked.length) {
      console.log(`  kept, still referenced (${a.blocked.length}):`);
      for (const b of a.blocked.slice(0, 10)) {
        console.log(`   #${b.id} ${b.type}  ← ${b.by.map(r => `${r.table} #${r.id} ${r.type}`).join('; ')}${b.more ? ` (+${b.more})` : ''}`);
      }
      if (a.blocked.length > 10) console.log(`   … ${a.blocked.length - 10} more`);
    }
    for (const c of CATEGORIES) totals[c] += a.counts[c];
    bytes += a.bytes;
  }
  const total = Object.values(totals).reduce((x, y) => x + y, 0);
  console.log(`\nTOTAL  ${CATEGORIES.map(c => `${c} ${totals[c]}`).join('   ')}   rows ${total} (${mb(bytes)})`);
}

function printJunk(junk) {
  if (!junk.supported) { console.log('\nJunk schemas: Postgres per-app databases only.'); return; }
  console.log(`\nJUNK SCHEMAS (${junk.schemas.length}) — dropped only when named with --drop-schemas:`);
  for (const s of junk.schemas) {
    const apps = Object.entries(s.apps).map(([a, n]) => `${a}:${n}`).join(' ');
    console.log(`   ${s.schema.padEnd(58)} ${s.reason.padEnd(14)} tables ${s.tables}  rows ${s.rows}  ${mb(s.bytes)}${apps ? `  [${apps}]` : ''}`);
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const config = loadConfig(o.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  const log = o.json ? () => {} : (m) => console.log(m);
  const t0 = Date.now();
  try {
    if (!o.json) console.log(`sweep orphans — ${o.apply ? 'APPLY (deletes rows)' : 'DRY RUN'}   db=${o.db}  splitMode=${config.splitMode}  min-age=${o.minAge}h`);
    const plan = await planSweep(db, { config, apps: o.apps, only: o.only, minAgeHours: o.minAge, log });
    const junk = await listJunkSchemas(db, { config });
    if (o.json && !o.apply) { console.log(JSON.stringify({ plan: publicPlan(plan), junkSchemas: junk }, null, 2)); return; }
    if (!o.json) { printPlan(plan); printJunk(junk); }
    if (!o.apply) { console.log(`\nDRY RUN — nothing was changed (${((Date.now() - t0) / 1000).toFixed(0)}s). Re-run with --apply.`); return; }
    const out = await applySweep(db, plan, { config, expect: o.expect, dropSchemas: o.dropSchemas, log });
    if (o.json) console.log(JSON.stringify(out, null, 2));
    else console.log(`\nDone (${((Date.now() - t0) / 1000).toFixed(0)}s). Backup: ${out.backup}`);
  } finally {
    await db.end();
  }
}

main().catch(e => { console.error(`\nFatal: ${e.message}`); process.exit(1); });
