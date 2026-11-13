#!/usr/bin/env node
'use strict';
/**
 * AUDIT THE INVARIANTS THE AUTH LAYER RELIES ON — read-only counts, per app, of the rows that would
 * violate each constraint proposed in planning/tasks/current/new-app-auth-setup-and-db-constraints.md
 * (Part B). A constraint is only added where its count is zero, so this is what the owner picks from.
 *
 *     node audit-db-invariants.js --db <dms config> --app <app> [--app <app>]… [--auth-db <auth config>] [--json]
 *
 * It writes nothing: every statement is a SELECT, and it opens the adapters directly (no server init).
 *
 *   B1  unique containers     more than one row per (app, type) for pattern / source / view / dmsenv / site
 *   B2  parent exists         `data.parent_id` that names no row of the app's table (a report; no FK is possible)
 *   B4  no self parent        `data.parent_id` equal to the row's own id
 *   B5  app matches schema    rows in a per-app table whose `app` is another app
 *   B7  shapes                `data` that is not an object; grants stored as anything but an object;
 *                             `data.parent_id` that is not a number
 *   B8  type grammar          types that parse to no kind, and the bare (no `|`, no `:`) types in use
 *   B10 one env row per pgEnv more than one `:dmsenv` row naming the same pgEnv; mirror rows left over
 *                             (the per-source stubs were removed 2026-11-12)
 *   B9 / B12 roles            what the connecting role may do to `formats` and `change_log` today
 *   B11 auth tables           (--auth-db) foreign keys present, and links that name no group / project / user
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable, resolveFormatsTable } = require('../db/table-resolver');
const { parseRowType } = require('../db/type-utils.js');

const CONTAINER_KINDS = ['pattern', 'source', 'view', 'dmsenv', 'site'];
const LIST = 8;   // examples shown per finding

function parseArgs(argv) {
  const o = { apps: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') o.db = argv[++i];
    else if (argv[i] === '--app') o.apps.push(argv[++i]);
    else if (argv[i] === '--auth-db') o.authDb = argv[++i];
    else if (argv[i] === '--json') o.json = true;
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(1); }
  }
  if (!o.db || !o.apps.length) { console.error('--db and at least one --app are required'); process.exit(1); }
  return o;
}

const open = (name) => { const c = loadConfig(name); return { config: c, db: c.type === 'postgres' ? new PostgresAdapter(c) : new SqliteAdapter(c) }; };
/** The two dialects name JSON types differently; one vocabulary for the report. */
const jsonType = (t) => ({ text: 'string', integer: 'number', real: 'number', true: 'boolean', false: 'boolean' }[t] || t || 'absent');

async function auditApp(db, { app, splitMode }) {
  const pg = db.type === 'postgres';
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(app, '', db.type, splitMode);
  const T = pg ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;
  const J = (key) => (pg ? `data->>'${key}'` : `CAST(json_extract(data, '$.${key}') AS TEXT)`);
  const typeOf = (key) => (pg ? `jsonb_typeof(data::jsonb->'${key}')` : `json_type(data, '$.${key}')`);
  const dataType = pg ? `jsonb_typeof(data::jsonb)` : `CASE WHEN json_valid(data) THEN json_type(data) ELSE 'invalid' END`;
  const r = { app, table: pg ? `${t.schema}.${t.table}` : t.table, exists: false };

  r.exists = pg
    ? (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [t.schema, t.table])).length > 0
    : (await q(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`, [t.table])).length > 0;
  if (!r.exists) return r;

  r.rows = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1`, [app]))[0].n;

  // what the table already enforces
  r.indexes = pg
    ? (await q(`SELECT indexname AS name, indexdef AS def FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY 1`, [t.schema, t.table]))
        .map(x => `${x.name}${/UNIQUE/.test(x.def) ? ' (unique)' : ''}`)
    : (await q(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = $1 ORDER BY 1`, [t.table]))
        .map(x => `${x.name}${/UNIQUE/i.test(x.sql || '') ? ' (unique)' : ''}`);
  r.constraints = pg
    ? (await q(`SELECT c.conname AS name, c.contype AS kind FROM pg_constraint c JOIN pg_class k ON k.oid = c.conrelid JOIN pg_namespace n ON n.oid = k.relnamespace
                WHERE n.nspname = $1 AND k.relname = $2 ORDER BY 1`, [t.schema, t.table])).map(x => `${x.name} (${({ p: 'primary key', u: 'unique', c: 'check', f: 'foreign key' })[x.kind] || x.kind})`)
    : [];

  // B1 (unique containers)
  r.b1 = {};
  for (const kind of CONTAINER_KINDS) {
    const d = await q(`SELECT type, count(*) AS n FROM ${T} WHERE app = $1 AND type LIKE $2 GROUP BY type HAVING count(*) > 1 ORDER BY 2 DESC`, [app, `%:${kind}`]);
    r.b1[kind] = { types: d.length, extraRows: d.reduce((s, x) => s + (+x.n - 1), 0), examples: d.slice(0, LIST).map(x => `${x.type} ×${x.n}`) };
  }

  // B2 (parent exists), B4 (no self parent)
  r.parentIdRows = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND ${J('parent_id')} IS NOT NULL`, [app]))[0].n;
  const dangling = await q(`SELECT c.id, c.type, ${J('parent_id').replace(/data/g, 'c.data')} AS parent FROM ${T} c
    WHERE c.app = $1 AND ${J('parent_id').replace(/data/g, 'c.data')} IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ${T} p WHERE CAST(p.id AS TEXT) = ${J('parent_id').replace(/data/g, 'c.data')}) LIMIT 500`, [app]);
  r.b2 = { count: dangling.length, capped: dangling.length === 500, examples: dangling.slice(0, LIST).map(x => `#${x.id} ${x.type} → ${x.parent}`) };
  r.b4 = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND ${J('parent_id')} = CAST(id AS TEXT)`, [app]))[0].n;

  // B5 (app matches the schema): only meaningful where the table is the app's own
  r.b5 = splitMode === 'per-app'
    ? (await q(`SELECT app, count(*) AS n FROM ${T} WHERE app <> $1 OR app IS NULL GROUP BY app ORDER BY 2 DESC`, [app])).map(x => `${x.app}=${x.n}`)
    : null;

  // B7 (shapes)
  const groups = async (expr, where = '') => Object.fromEntries((await q(`SELECT ${expr} AS t, count(*) AS n FROM ${T} WHERE app = $1 ${where} GROUP BY 1`, [app])).map(x => [jsonType(x.t), +x.n]));
  r.b7 = {
    data: await groups(dataType),
    authPermissions: await groups(typeOf('authPermissions'), `AND ${typeOf('authPermissions')} IS NOT NULL`),
    auth_permissions: await groups(typeOf('auth_permissions'), `AND ${typeOf('auth_permissions')} IS NOT NULL`),
    parent_id: await groups(typeOf('parent_id'), `AND ${typeOf('parent_id')} IS NOT NULL`),
  };

  // B8 (type grammar)
  const types = await q(`SELECT type, count(*) AS n FROM ${T} WHERE app = $1 GROUP BY type`, [app]);
  const bare = [], noKind = [], kinds = {};
  for (const x of types) {
    const p = parseRowType(x.type);
    if (!p.kind) noKind.push(x);
    else if (p.parent === null && p.instance === null) bare.push(x);
    kinds[p.kind || '(none)'] = (kinds[p.kind || '(none)'] || 0) + +x.n;
  }
  const byRows = (a, b) => +b.n - +a.n;
  r.b8 = {
    distinctTypes: types.length,
    noKind: { types: noKind.length, rows: noKind.reduce((s, x) => s + +x.n, 0), examples: noKind.sort(byRows).slice(0, LIST).map(x => `${JSON.stringify(x.type)} ×${x.n}`) },
    bare: { types: bare.length, rows: bare.reduce((s, x) => s + +x.n, 0), examples: bare.sort(byRows).slice(0, 20).map(x => `${x.type} ×${x.n}`) },
    kinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k}=${n}`),
  };

  // B10 (one env row per pgEnv; mirror leftovers)
  const envs = await q(`SELECT ${J('pgEnv')} AS env, count(*) AS n FROM ${T} WHERE app = $1 AND type LIKE '%:dmsenv' AND ${J('pgEnv')} IS NOT NULL GROUP BY 1 ORDER BY 1`, [app]);
  r.b10 = {
    attached: envs.map(x => x.env),
    duplicateEnvRows: envs.filter(x => +x.n > 1).map(x => `${x.env} ×${x.n}`),
    mirrorRows: +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND (type LIKE '%:source' OR type LIKE '%:view') AND ${J('pgEnv')} IS NOT NULL
      AND (${J('source_id')} IS NOT NULL OR ${J('view_id')} IS NOT NULL)`, [app]))[0].n,
  };

  // formats, and B9 / B12 (what the connecting role may do)
  const f = resolveFormatsTable(app, db.type, splitMode);
  const F = pg ? `"${f.schema}"."${f.table}"` : `"${f.table}"`;
  const hasFormats = pg
    ? (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [f.schema, f.table])).length > 0
    : (await q(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`, [f.table])).length > 0;
  r.formats = hasFormats ? +(await q(`SELECT count(*) AS n FROM ${F} WHERE app = $1`, [app]).catch(() => q(`SELECT count(*) AS n FROM ${F}`)))[0].n : null;
  if (pg) {
    const role = (await q(`SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su`))[0];
    const may = async (tbl, schema = t.schema) => {
      const there = (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [schema, tbl])).length > 0;
      if (!there) return 'no table';
      const p = (await q(`SELECT has_table_privilege(current_user, $1, 'INSERT') AS i, has_table_privilege(current_user, $1, 'UPDATE') AS u, has_table_privilege(current_user, $1, 'DELETE') AS d`, [`"${schema}"."${tbl}"`]))[0];
      return ['INSERT', 'UPDATE', 'DELETE'].filter((_, i) => [p.i, p.u, p.d][i]).join(', ') || 'read only';
    };
    r.roles = { user: role.u, superuser: !!role.su, formats: await may(f.table), change_log: await may('change_log', 'dms') };   // one change_log per database, in `dms`
  }
  return r;
}

async function auditAuthDb(db) {
  const pg = db.type === 'postgres';
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const r = { foreignKeys: [], orphans: {} };
  if (pg) {
    r.foreignKeys = (await q(`SELECT k.relname AS tbl, c.conname AS name, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class k ON k.oid = c.conrelid
      WHERE c.contype = 'f' AND k.relname IN ('groups_in_projects', 'users_in_groups') ORDER BY 1, 2`)).map(x => `${x.tbl}: ${x.def}`);
  } else {
    for (const tbl of ['groups_in_projects', 'users_in_groups']) {
      for (const x of await q(`SELECT "table" AS ref, "from" AS col FROM pragma_foreign_key_list($1)`, [tbl])) r.foreignKeys.push(`${tbl}: ${x.col} → ${x.ref}`);
    }
  }
  const orphan = async (label, tbl, col, ref, refCol) => {
    r.orphans[label] = +(await q(`SELECT count(*) AS n FROM ${tbl} l WHERE NOT EXISTS (SELECT 1 FROM ${ref} p WHERE p.${refCol} = l.${col})`))[0].n;
  };
  await orphan('groups_in_projects → groups', 'groups_in_projects', 'group_name', 'groups', 'name');
  await orphan('groups_in_projects → projects', 'groups_in_projects', 'project_name', 'projects', 'name');
  await orphan('users_in_groups → users', 'users_in_groups', 'user_email', 'users', 'email');
  await orphan('users_in_groups → groups', 'users_in_groups', 'group_name', 'groups', 'name');
  return r;
}

function print(r, log = console.log) {
  log(`\n=== ${r.app}   ${r.table}`);
  if (!r.exists) { log('  table does not exist'); return; }
  const mark = (n) => (n ? `${n}` : '0  ✓');
  const fmt = (o) => Object.entries(o).map(([k, n]) => `${k}=${n}`).join('  ') || 'none';
  log(`  rows                              ${r.rows}`);
  log(`  indexes                           ${r.indexes.join(', ') || 'none'}`);
  log(`  constraints                       ${r.constraints.join(', ') || 'none listed'}`);
  log(`  B1  (unique containers)`);
  for (const k of CONTAINER_KINDS) {
    const x = r.b1[k];
    log(`        ${k.padEnd(8)} duplicated types: ${mark(x.types)}${x.types ? `   extra rows: ${x.extraRows}   ${x.examples.join('; ')}` : ''}`);
  }
  log(`  rows carrying data.parent_id      ${r.parentIdRows}`);
  log(`  B2  (parent exists) dangling      ${mark(r.b2.count)}${r.b2.capped ? '+' : ''}${r.b2.examples.length ? `   ${r.b2.examples.join('; ')}` : ''}`);
  log(`  B4  (no self parent)              ${mark(r.b4)}`);
  if (r.b5) log(`  B5  (app matches schema) others   ${r.b5.length ? r.b5.join('  ') : '0  ✓'}`);
  log(`  B7  (shapes) data                 ${fmt(r.b7.data)}`);
  log(`        data.authPermissions        ${fmt(r.b7.authPermissions)}`);
  log(`        data.auth_permissions       ${fmt(r.b7.auth_permissions)}`);
  log(`        data.parent_id              ${fmt(r.b7.parent_id)}`);
  log(`  B8  (type grammar) distinct types ${r.b8.distinctTypes}`);
  log(`        no kind                     ${mark(r.b8.noKind.types)}${r.b8.noKind.types ? `   rows: ${r.b8.noKind.rows}   ${r.b8.noKind.examples.join('; ')}` : ''}`);
  log(`        bare types                  ${r.b8.bare.types}   rows: ${r.b8.bare.rows}${r.b8.bare.examples.length ? `\n           ${r.b8.bare.examples.join('; ')}` : ''}`);
  log(`        rows by kind                ${r.b8.kinds.join('  ')}`);
  log(`  B10 (one env row per pgEnv)       attached: ${r.b10.attached.join(', ') || 'none'}   duplicates: ${r.b10.duplicateEnvRows.join(', ') || '0  ✓'}   mirror rows left: ${mark(r.b10.mirrorRows)}`);
  log(`  formats rows                      ${r.formats === null ? 'no table' : r.formats}`);
  if (r.roles) log(`  B9 / B12 (roles) connecting as    ${r.roles.user}${r.roles.superuser ? ' (superuser)' : ''}   formats: ${r.roles.formats}   change_log: ${r.roles.change_log}`);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const { config, db } = open(o.db);
  const out = { db: o.db, splitMode: config.splitMode, apps: [], auth: null };
  let auth = null;
  try {
    for (const app of o.apps) out.apps.push(await auditApp(db, { app, splitMode: config.splitMode }));
    if (o.authDb) { auth = open(o.authDb).db; out.auth = await auditAuthDb(auth); }
    if (o.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`\naudit-db-invariants — READ ONLY\n  db=${o.db}  split mode=${config.splitMode}`);
      out.apps.forEach(r => print(r));
      if (out.auth) {
        console.log(`\n=== auth tables   ${o.authDb}`);
        console.log(`  B11 foreign keys present\n        ${out.auth.foreignKeys.join('\n        ') || 'none'}`);
        for (const [k, n] of Object.entries(out.auth.orphans)) console.log(`  B11 orphan links ${k.padEnd(32)} ${n ? n : '0  ✓'}`);
      }
      console.log('\nNothing was written.');
    }
    await db.end(); if (auth) await auth.end();
    process.exit(0);
  } catch (e) {
    console.error(`\nERROR: ${e.message}`);
    await db.end().catch(() => {}); if (auth) await auth.end().catch(() => {});
    process.exit(1);
  }
}

module.exports = { auditApp, auditAuthDb };
if (require.main === module) main();
