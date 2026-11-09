#!/usr/bin/env node
'use strict';
/**
 * REGISTER THE FORMAT DECLARATIONS — write what a site's client bundle declares about its row kinds
 * (auth rules, permission vocabulary, childRefs, attributes) into the site's `formats` table the auth
 * layer reads (routes/auth/formats.js; `dms_<app>.formats` under per-app split mode, made on first use). The ONLY writer of that table: no browser and no CLI can
 * (owner, 2026-11-06).
 *
 *     node register-formats.js --db <dms config> --app <app> [--file formats.json] [--extra <format.js>]... [--apply]
 *
 * The rows come from the client package's emitter, `packages/dms/scripts/emit-formats.mjs`, which
 * derives them from the format modules exactly as the browser's registry does. Without `--file` this
 * script runs the emitter itself from the sibling checkout (`--extra` is passed through, for a host
 * app's own types: `--extra ../../src/patterns/qa/qa.format.js`). With `--file`, the emitter's saved
 * output is used instead.
 *
 * Dry run by default: prints each key that would be written or removed and which of its columns
 * differ. `--apply` writes; the payload is the whole set, so a stored key the rows leave out is
 * removed. Idempotent: a second run reports nothing to write. A running server reads the new rows
 * within 30 seconds (routes/auth/formats.js TTL_MS). Verify from anywhere with `dms formats diff`.
 */
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
const { resolve } = require('path');

function parseArgs() {
  const a = process.argv.slice(2); const o = { apply: false, extra: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--file') o.file = a[++i];
    else if (a[i] === '--extra') o.extra.push(a[++i]);
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }
  return o;
}

/** The rows: a saved emitter file, or the emitter run now from the sibling client package. */
function loadRows(o) {
  if (o.file) {
    const parsed = JSON.parse(readFileSync(resolve(process.cwd(), o.file), 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : parsed && parsed.formats;
    if (!Array.isArray(rows)) throw new Error(`${o.file}: expected the emitter's output (an array of { type, … })`);
    return rows;
  }
  const emitter = resolve(__dirname, '../../../dms/scripts/emit-formats.mjs');
  const args = [emitter, ...o.extra.flatMap(f => ['--extra', resolve(process.cwd(), f)])];
  return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'inherit'] }));
}

async function main() {
  const o = parseArgs();
  process.env.DMS_DB_ENV = o.db;
  const { getDb, awaitReady } = require('../db');
  const { listFormats, upsertFormats, canonical } = require('../routes/auth/formats');
  const rows = loadRows(o);
  await awaitReady(getDb(o.db));

  console.log(`\nregister formats — ${o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}  rows=${rows.length} (${o.file ? o.file : 'emit-formats.mjs' + (o.extra.length ? ` --extra ${o.extra.join(' ')}` : '')})\n`);

  const have = new Map((await listFormats(o.app)).map(r => [r.type, r]));
  const want = new Map(rows.map(r => [r.type, r]));
  const COLS = ['attributes', 'authVocabulary', 'authRules', 'childRefs'];
  let same = 0;
  const changes = [];
  for (const [type, w] of want) {
    const h = have.get(type);
    if (!h) { changes.push(`  + ${type}`); continue; }
    const diff = COLS.filter(c => canonical(h[c]) !== canonical(w[c]));
    if (diff.length) changes.push(`  ~ ${type}  (${diff.join(', ')})`); else same++;
  }
  for (const type of have.keys()) if (!want.has(type)) changes.push(`  - ${type}`);
  console.log(`  already current   ${same}`);
  console.log(`  to write          ${changes.filter(c => !c.startsWith('  - ')).length}`);
  console.log(`  to remove         ${changes.filter(c => c.startsWith('  - ')).length}`);
  for (const c of changes) console.log(c);

  if (o.apply) {
    const r = await upsertFormats(o.app, rows);
    console.log(`\n  wrote ${r.written.length}, removed ${r.removed.length}, unchanged ${r.same}`);
  } else if (changes.length) {
    console.log('\n  dry run — re-run with --apply to write');
  }
  const db = getDb(o.db);
  if (db.end) await db.end();
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
