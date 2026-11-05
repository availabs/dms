#!/usr/bin/env node
'use strict';
/**
 * STAMP THE AUTH RULES — put each row's rules (and vocabulary) where routes/auth reads them.
 *
 *     node packages/dms/scripts/emit-auth-vocabulary.mjs > manifest.json
 *     node stamp-auth-rules.js --db <config> --app <app> --manifest manifest.json [--apply]
 *
 * A pattern row carries its type's rules as `data.authRules` and its vocabulary as
 * `data.authVocabulary` (`auth.vocabulary` on a migrated table); the site row carries the
 * site-level kinds' rules (`:site` in the manifest) and the site vocabulary; each `:dmsenv` row
 * carries the env vocabulary. New rows get all of this from the client at create
 * (patterns/registry.js `stampPatternRow` / `stampSiteRow`); this is the one-off for rows that
 * predate a declaration or a change to it (planning/tasks/current/auth-rules-stamp-backfill.md).
 *
 * Idempotent: a row already carrying the manifest's value is left alone, so a dry run after an
 * apply reports nothing to write. Rows of a type the manifest does not declare are listed, never
 * touched — pass `--extra` to the emitter for a host app's own types.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable } = require('../db/table-resolver');
const { rowAuthCaps } = require('../routes/dms/rowAuthCaps');

function parseArgs() {
  const a = process.argv.slice(2); const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--manifest') o.manifest = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app || !o.manifest) { console.error('--db, --app and --manifest are required'); process.exit(1); }
  return o;
}

const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
// jsonb does not keep key order, so compare canonically
const canonical = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);

async function main() {
  const o = parseArgs();
  const manifest = JSON.parse(require('fs').readFileSync(o.manifest, 'utf8'));
  const config = loadConfig(o.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(o.app, '', config.type, config.splitMode);
  const T = config.type === 'postgres' ? `"${t.schema}"."${t.table}"` : t.table;
  let caps = { auth: false };
  try { caps = await rowAuthCaps(db, t.schema, t.table, config.type); } catch { /* unmigrated */ }
  const sqlite = config.type === 'sqlite';
  const setData = (key) => sqlite
    ? `data = json_set(COALESCE(data, '{}'), '$.${key}', json($2))`
    : `data = jsonb_set(COALESCE(data, '{}'::jsonb), '{${key}}', $2::jsonb)`;
  const setAuth = (key) => sqlite
    ? `auth = json_set(COALESCE(auth, '{}'), '$.${key}', json($2))`
    : `auth = jsonb_set(COALESCE(auth, '{}'::jsonb), '{${key}}', $2::jsonb)`;

  console.log(`\nstamp auth rules — ${o.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}  manifest=${o.manifest}  vocabulary → ${caps.auth ? 'auth.vocabulary' : 'data.authVocabulary'}\n`);

  const rows = await q(`SELECT id, type, ${caps.auth ? 'auth' : 'NULL AS auth'}, data FROM ${T}
                         WHERE app = $1 AND (type LIKE '%:pattern' OR type LIKE '%:site' OR type LIKE '%:dmsenv')`, [o.app]);
  const writes = [];   // [id, column, key, value]
  const undeclared = new Map();
  let same = 0;
  const want = (row) => {
    const type = row.type || '';
    if (/:site$/.test(type)) return manifest[':site'] || null;
    if (/:dmsenv$/.test(type)) return manifest[':dmsenv'] || null;
    return manifest[(parse(row.data) || {}).pattern_type] || null;
  };
  for (const r of rows) {
    const m = want(r);
    if (!m) { const k = /:pattern$/.test(r.type) ? (parse(r.data) || {}).pattern_type || '(none)' : r.type; undeclared.set(k, (undeclared.get(k) || 0) + 1); continue; }
    const data = parse(r.data) || {}, auth = parse(r.auth) || {};
    const curRules = data.authRules ?? null;
    const curVocab = caps.auth ? (auth.vocabulary ?? data.authVocabulary ?? null) : (data.authVocabulary ?? null);
    const curRefs = caps.auth ? (auth.childRefs ?? data.childRefs ?? null) : (data.childRefs ?? null);
    let changed = false;
    if (m.rules && canonical(curRules) !== canonical(m.rules)) { writes.push([r.id, 'data', 'authRules', m.rules]); changed = true; }
    if (m.vocabulary && canonical(curVocab) !== canonical(m.vocabulary)) { writes.push([r.id, caps.auth ? 'auth' : 'data', caps.auth ? 'vocabulary' : 'authVocabulary', m.vocabulary]); changed = true; }
    if (m.childRefs && canonical(curRefs) !== canonical(m.childRefs)) { writes.push([r.id, caps.auth ? 'auth' : 'data', 'childRefs', m.childRefs]); changed = true; }
    if (!changed) same++;
  }

  console.log(`  rows (site, patterns, envs)   ${rows.length}`);
  console.log(`  already current               ${same}`);
  console.log(`  values to write               ${writes.length}`);
  for (const [type, n] of undeclared) console.log(`  not in the manifest           ${type} ×${n}   ← declare it, or --extra on the emitter`);
  for (const [id, col, key] of writes) console.log(`    #${id}  ${col}.${key}`);

  if (o.apply) {
    for (const [id, col, key, value] of writes) {
      await q(`UPDATE ${T} SET ${col === 'auth' ? setAuth(key) : setData(key)} WHERE id = $1`, [id, JSON.stringify(value)]);
    }
    console.log(`\n  wrote ${writes.length} value(s)`);
  } else if (writes.length) {
    console.log('\n  dry run — re-run with --apply to write');
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
