#!/usr/bin/env node
'use strict';
/**
 * SET AN APP UP FOR THE AUTH LAYER — bring one app's `data_items` to the shape the server reads.
 *
 *     node setup-app.js --db <dms config> --app <app>                         dry run: a report, no writes
 *     node setup-app.js --db <dms config> --app <app> --apply                 do the column step
 *     node setup-app.js --db <dms config> --app <app> --apply --add-uniqueness-guard [kind|all]
 *     node setup-app.js --db <dms config> --app <app> --apply --add-shape-checks
 *
 * Task: planning/tasks/current/new-app-auth-setup-and-db-constraints.md (A1, A1b, A2).
 *
 * WHAT IT DOES
 *
 * 1. THE TWO RETIRED COLUMNS. `parent_id` and `auth` were added per app by `migrate-row-auth.js`.
 *    The server no longer reads either (owner, 2026-11-10): parentage is `data.parent_id`, grants are
 *    `data.authPermissions` / `data.auth_permissions`. Where an app's table still has them, what
 *    only the column holds is moved into `data`, the move is verified, and the columns are dropped:
 *
 *      parent_id  → `data.parent_id`. The column wins over a `data.parent_id` that differs: the
 *                   column was written by the server after its check; the `data` key, until this
 *                   change, was whatever a client echoed in an edit.
 *      auth       → its grants go to `data` ONLY where `data` names no one, which is the one case the
 *                   server read them (`grantsOf` read `data` first). Column grants on a row whose
 *                   `data` already names someone were dead and are listed, not moved.
 *                   `view` (a source narrowing itself to its own grantees) goes into the row's grants.
 *                   `vocabulary` / `childRefs` go to `data.authVocabulary` / `data.childRefs`, the
 *                   stamp the server still reads when the app's `formats` table says nothing.
 *
 *    A row it cannot move safely (a `view` flag over grants stored per subdomain or as a JSON
 *    string) is listed and BLOCKS the drop of `auth`; nothing is guessed.
 *
 * 2. `data.parent_id` VALUES THAT FAIL THE CHECK. Until this change an edit merged a client's
 *    `parent_id` into `data` unchecked, and nothing read it. Now the auth walk follows it, so every
 *    stored value is held to the rule a create's claim is (`routes/dms/parentId.js
 *    isPlausibleParent`): the parent exists, in this app, and is the row's container or a sibling
 *    kind under it. `--apply` removes the ones that fail.
 *
 * 3. VALUES STORED AS TEXT. Grants (`data.authPermissions`, `data.auth_permissions`) were written as a
 *    JSON string of the object by the permissions editor and by provisioning until 2026-11-12; the
 *    server now stores an object on every write (routes/auth/grants.js). `--apply` rewrites the stored
 *    strings as the object they hold. A value that names no grants ('' , an array, text that is not
 *    JSON) becomes null, which is how it was already read. A `data.parent_id` stored as a string of
 *    digits becomes the number. Nothing a reader sees changes.
 *
 * 4. THE UNIQUENESS GUARD (opt-in, `--add-uniqueness-guard`): one row per `(app, type)` for each
 *    container kind, so an instance name resolves to one owner. Never added while duplicates exist;
 *    they are listed.
 *
 * 5. THE SHAPE CHECKS (opt-in, `--add-shape-checks`; db/table-resolver.js shapeChecks): CHECK
 *    constraints on the app's table for the three shapes above. Each is added only when no row
 *    violates it. Postgres only for an existing table (SQLite cannot add a constraint to one); a new
 *    app's table is created with them on both. ADD THEM ONLY AFTER every server writing to the
 *    database runs the code that stores grants as objects, or its writes will be refused.
 *
 * It also reports how many `formats` rows the app has, because the stamp in `data` is read only for
 * a kind `formats` does not declare.
 *
 * Idempotent: a second run reports nothing to do. Quiesce writes for `--apply` on a live app — the
 * column drop takes a table lock on Postgres.
 */
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');
const { resolveTable, resolveFormatsTable, shapeChecks } = require('../db/table-resolver');
const { GRANT_KEYS, storedGrants } = require('../routes/auth/grants');
const { getKind } = require('../db/type-utils.js');
const { isPlausibleParent } = require('../routes/dms/parentId');

const CONTAINER_KINDS = ['pattern', 'source', 'view', 'dmsenv', 'site'];
const CHUNK = 1000;

const parse = (v) => { if (v == null) return null; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** Key-order-independent text, for comparing two JSON values. */
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
/** Does a grants object name anyone? The test `grantsOf` used to decide whether to read the column. */
const names = (g) => isObj(g) && (g.groups !== undefined || g.users !== undefined);

function parseArgs(argv) {
  const o = { apply: false, guard: null, checks: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') o.db = argv[++i];
    else if (argv[i] === '--app') o.app = argv[++i];
    else if (argv[i] === '--apply') o.apply = true;
    else if (argv[i] === '--add-shape-checks') o.checks = true;
    else if (argv[i] === '--add-uniqueness-guard') o.guard = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'all';
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }
  if (o.guard && o.guard !== 'all' && !CONTAINER_KINDS.includes(o.guard)) {
    console.error(`--add-uniqueness-guard takes one of: all, ${CONTAINER_KINDS.join(', ')}`); process.exit(1);
  }
  return o;
}

/**
 * What one `auth` column value changes in a row's `data`: `{ patch, dead, blocked }`.
 *   patch    top-level `data` keys to write (whole values), or null
 *   dead     the column held grants the server never read (data already names someone, and differs)
 *   blocked  a reason this row cannot be moved by rule
 * Pure, so the test can pin every case.
 */
function planAuthMove(row) {
  const col = parse(row.auth);
  if (!isObj(col)) return { patch: null, dead: false, blocked: null };
  const data = parse(row.data) || {};
  const { vocabulary, childRefs, view, ...grants } = col;
  const patch = {};
  let dead = false, blocked = null;

  // the key this kind keeps its grants under: a source's attribute is `auth_permissions`
  const key = data.auth_permissions !== undefined || getKind(row.type || '') === 'source' ? 'auth_permissions' : 'authPermissions';
  const raw = data.authPermissions !== undefined ? data.authPermissions : data.auth_permissions;
  const stored = parse(raw);
  const plain = raw === undefined || raw === null || (isObj(raw) && raw['*'] === undefined);   // not a string, not per-subdomain
  let next = null;                                                                           // the grants value to write, if any

  if (Object.keys(grants).length) {
    const dataNames = isObj(stored) && (stored['*'] !== undefined || names(stored) || stored.self !== undefined || stored.descendants !== undefined);
    if (!dataNames) next = { ...(isObj(stored) ? stored : {}), ...grants };
    else if (canonical(stored) !== canonical(grants)) dead = true;
  }
  if (view !== undefined) {
    const base = next || (isObj(stored) ? stored : {});
    if (base.view !== view) {
      if (!next && !plain) blocked = '`view` over grants stored per subdomain or as a JSON string';
      else next = { ...base, view };
    }
  }
  if (next) patch[key] = next;
  // the declarations: the column won over `data`, so its value is the one to keep
  if (isObj(vocabulary) && canonical(parse(data.authVocabulary)) !== canonical(vocabulary)) patch.authVocabulary = vocabulary;
  if (isObj(childRefs) && canonical(parse(data.childRefs)) !== canonical(childRefs)) patch.childRefs = childRefs;
  return { patch: Object.keys(patch).length ? patch : null, dead, blocked };
}

async function setupApp(db, { app, splitMode, apply = false, guard = null, checks = false, log = console.log }) {
  const pg = db.type === 'postgres';
  const q = (sql, v) => db.promise(sql, v).then(r => r.rows ?? r);
  const t = resolveTable(app, '', db.type, splitMode);
  const T = pg ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;
  const J = (key) => (pg ? `data->>'${key}'` : `CAST(json_extract(data, '$.${key}') AS TEXT)`);
  const report = { columns: {}, parentIdMoved: 0, authMoved: 0, authDead: 0, authBlocked: [], invalidParents: [], dropped: [], guard: {}, formats: null,
    text: { grants: 0, grantsToNull: 0, grantsNotObject: 0, parentIds: 0 }, checks: {} };

  const exists = pg
    ? (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [t.schema, t.table])).length > 0
    : (await q(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`, [t.table])).length > 0;
  if (!exists) { log(`  ${T} does not exist — nothing to set up (a new app's table is created in the current shape).`); return report; }

  const columns = async () => new Set((pg
    ? await q(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`, [t.schema, t.table])
    : await q(`SELECT name FROM pragma_table_info($1)`, [t.table])).map(r => r.name));
  let cols = await columns();
  report.columns = { parent_id: cols.has('parent_id'), auth: cols.has('auth') };
  const total = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1`, [app]))[0].n;
  log(`  rows                         ${total}`);
  log(`  retired columns present      parent_id: ${cols.has('parent_id') ? 'yes' : 'no'}   auth: ${cols.has('auth') ? 'yes' : 'no'}`);

  // ---- 1a. parent_id column → data.parent_id
  const PARENT_DIFFERS = `parent_id IS NOT NULL AND (${J('parent_id')} IS NULL OR ${J('parent_id')} <> CAST(parent_id AS TEXT))`;
  if (cols.has('parent_id')) {
    const filled = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND parent_id IS NOT NULL`, [app]))[0].n;
    const toMove = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND ${PARENT_DIFFERS}`, [app]))[0].n;
    report.parentIdMoved = toMove;
    log(`\n1a. parent_id column → data.parent_id`);
    log(`    rows with the column filled  ${filled}`);
    log(`    rows whose data lacks it     ${toMove}${apply ? '' : '   (would be written)'}`);
    if (apply && toMove) {
      await q(pg
        ? `UPDATE ${T} SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{parent_id}', to_jsonb(parent_id)) WHERE app = $1 AND ${PARENT_DIFFERS}`
        : `UPDATE ${T} SET data = json_set(COALESCE(data, '{}'), '$.parent_id', parent_id) WHERE app = $1 AND ${PARENT_DIFFERS}`, [app]);
    }
  }

  // ---- 1b. auth column → data
  if (cols.has('auth')) {
    log(`\n1b. auth column → data`);
    const filled = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND auth IS NOT NULL`, [app]))[0].n;
    let last = 0, moved = 0, dead = 0; const deadIds = [];
    for (;;) {
      const rows = await q(`SELECT id, type, auth, data FROM ${T} WHERE app = $2 AND auth IS NOT NULL AND id > $1 ORDER BY id LIMIT ${CHUNK}`, [last, app]);
      if (!rows.length) break;
      last = rows[rows.length - 1].id;
      for (const row of rows) {
        const plan = planAuthMove(row);
        if (plan.blocked) report.authBlocked.push({ id: String(row.id), type: row.type, why: plan.blocked });
        if (plan.dead) { dead++; if (deadIds.length < 10) deadIds.push(`${row.id} (${row.type})`); }
        if (!plan.patch) continue;
        moved++;
        if (apply) {
          // each key is written whole (a shallow merge), the same in both dialects
          if (pg) await q(`UPDATE ${T} SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb WHERE id = $2`, [JSON.stringify(plan.patch), row.id]);
          else await q(`UPDATE ${T} SET data = $1 WHERE id = $2`, [JSON.stringify({ ...(parse(row.data) || {}), ...plan.patch }), row.id]);
        }
      }
    }
    report.authMoved = moved; report.authDead = dead;
    log(`    rows with the column filled  ${filled}`);
    log(`    rows with something to move  ${moved}${apply ? '' : '   (would be written)'}`);
    log(`    rows whose column grants the server never read (data names someone, and differs): ${dead}`);
    if (deadIds.length) log(`       ${deadIds.join(', ')}${dead > deadIds.length ? ', …' : ''}`);
    if (report.authBlocked.length) {
      log(`    ⚠ ${report.authBlocked.length} row(s) cannot be moved by rule — the auth column is NOT dropped:`);
      for (const b of report.authBlocked.slice(0, 20)) log(`       ${b.id}  ${b.type}  ${b.why}`);
    }
  }

  // ---- drop the columns, each only when nothing is left in it that `data` lacks. The checks below
  // are over the WHOLE table: under legacy split mode it is shared, and another app's rows would go too.
  if (apply && cols.has('parent_id')) {
    const left = +(await q(`SELECT count(*) AS n FROM ${T} WHERE ${PARENT_DIFFERS}`))[0].n;
    if (left) throw new Error(`${left} row(s) still differ between the parent_id column and data.parent_id; the column was not dropped`);
    if (pg) await q(`ALTER TABLE ${T} DROP COLUMN parent_id`);      // its index goes with it
    else {
      for (const ix of await q(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = $1 AND sql LIKE '%parent_id%'`, [t.table])) {
        await q(`DROP INDEX IF EXISTS "${ix.name}"`);
      }
      await q(`ALTER TABLE ${T} DROP COLUMN parent_id`);
    }
    report.dropped.push('parent_id');
  }
  if (apply && cols.has('auth') && !report.authBlocked.length) {
    let last = 0, left = 0;
    for (;;) {
      const rows = await q(`SELECT id, type, auth, data FROM ${T} WHERE auth IS NOT NULL AND id > $1 ORDER BY id LIMIT ${CHUNK}`, [last]);
      if (!rows.length) break;
      last = rows[rows.length - 1].id;
      left += rows.filter(r => planAuthMove(r).patch).length;
    }
    if (left) throw new Error(`${left} row(s) still hold something in the auth column that data lacks; the column was not dropped`);
    await q(`ALTER TABLE ${T} DROP COLUMN auth`);
    report.dropped.push('auth');
  }
  if (report.dropped.length) log(`\n    dropped: ${report.dropped.join(', ')}`);
  cols = await columns();

  // ---- 2. data.parent_id values that fail the check a create's claim is held to
  log(`\n2.  data.parent_id held to the create-time check`);
  // The value the row WILL carry: while the column is still there (a dry run), it is the column's
  // where set, since step 1a writes that over whatever `data` holds.
  const RAW = pg ? `c.data->>'parent_id'` : `CAST(json_extract(c.data, '$.parent_id') AS TEXT)`;
  const VAL = cols.has('parent_id') ? `COALESCE(CAST(c.parent_id AS TEXT), ${RAW})` : RAW;
  const NUM = pg ? `${VAL} ~ '^[0-9]+$'` : `(${VAL} GLOB '[0-9]*' AND ${VAL} NOT GLOB '*[^0-9]*')`;
  const HAS = (pg ? `c.data ? 'parent_id'` : `json_type(c.data, '$.parent_id') IS NOT NULL`)
    + (cols.has('parent_id') ? ' OR c.parent_id IS NOT NULL' : '');
  const PID = `(CASE WHEN ${NUM} THEN CAST(${VAL} AS ${pg ? 'bigint' : 'INTEGER'}) END)`;
  const stamped = await q(
    `SELECT c.id, c.type, ${VAL} AS pid, p.type AS ptype, p.app AS papp
       FROM ${T} c LEFT JOIN ${T} p ON p.id = ${PID}
      WHERE c.app = $1 AND (${HAS})`, [app]);
  for (const r of stamped) {
    const why = !/^[0-9]+$/.test(String(r.pid ?? '')) ? 'not an id'
      : r.ptype == null ? 'names no row'
      : String(r.papp) !== String(app) ? `names a row of app ${r.papp}`
      : !isPlausibleParent(r.type, r.ptype, null) ? `names ${r.ptype}, outside its container`
      : null;
    if (why) report.invalidParents.push({ id: String(r.id), type: r.type, parent_id: r.pid, why });
  }
  log(`    rows carrying one            ${stamped.length}`);
  log(`    …that fail the check         ${report.invalidParents.length}${apply || !report.invalidParents.length ? '' : '   (would be removed)'}`);
  const byWhy = new Map();
  for (const r of report.invalidParents) byWhy.set(r.why.replace(/names .*?, outside/, 'names a row outside'), (byWhy.get(r.why.replace(/names .*?, outside/, 'names a row outside')) || 0) + 1);
  for (const [why, n] of byWhy) log(`       ${String(n).padStart(6)}  ${why}`);
  for (const r of report.invalidParents.slice(0, 10)) log(`       ${r.id}  ${r.type}  parent_id=${r.parent_id}  ${r.why}`);
  if (apply && report.invalidParents.length) {
    const ids = report.invalidParents.map(r => r.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
      await q(pg ? `UPDATE ${T} SET data = data - 'parent_id' WHERE id IN (${ph})`
                 : `UPDATE ${T} SET data = json_remove(data, '$.parent_id') WHERE id IN (${ph})`, chunk);
    }
    log(`    removed from ${ids.length} row(s)`);
  }

  // ---- 3. values stored as text: grants as a JSON string of the object, parent_id as a string of digits
  log(`\n3.  values stored as text`);
  const TYPE_OF = (key) => (pg ? `jsonb_typeof(data->'${key}')` : `json_type(data, '$.${key}')`);
  const TEXT = pg ? 'string' : 'text';
  for (const key of GRANT_KEYS) {
    // few distinct values hold most rows (one string is on 79,537 components of one app), so the
    // rewrite is one UPDATE per distinct value, parsed here by the function the write path uses
    const values = await q(`SELECT ${J(key)} AS v, count(*) AS n FROM ${T} WHERE app = $1 AND ${TYPE_OF(key)} = '${TEXT}' GROUP BY 1 ORDER BY 2 DESC`, [app]);
    const strings = values.reduce((s, x) => s + +x.n, 0);
    const toNull = values.filter(x => storedGrants(x.v) === null);
    // not a string, an object or null: an array (the format's old `default: []`), a number, a boolean
    const other = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND ${TYPE_OF(key)} NOT IN ('${TEXT}', 'object', 'null')`, [app]))[0].n;
    report.text.grants += strings;
    report.text.grantsToNull += toNull.reduce((s, x) => s + +x.n, 0);
    report.text.grantsNotObject += other;
    log(`    data.${key.padEnd(17)} JSON strings: ${strings}${strings ? `   (${values.length} distinct value(s); ${toNull.reduce((s, x) => s + +x.n, 0)} row(s) name no grants and become null)` : ''}${other ? `   other non-objects: ${other} (become null)` : ''}`);
    for (const x of toNull.slice(0, 5)) log(`       → null  ×${x.n}  ${JSON.stringify(String(x.v).slice(0, 60))}`);
    if (!apply) continue;
    for (const x of values) {
      const next = JSON.stringify(storedGrants(x.v));
      await q(pg
        ? `UPDATE ${T} SET data = jsonb_set(data, '{${key}}', $1::jsonb) WHERE app = $2 AND ${TYPE_OF(key)} = 'string' AND ${J(key)} = $3`
        : `UPDATE ${T} SET data = json_set(data, '$.${key}', json($1)) WHERE app = $2 AND ${TYPE_OF(key)} = 'text' AND ${J(key)} = $3`,
        [next, app, x.v]);
    }
    if (other) {
      await q(pg
        ? `UPDATE ${T} SET data = jsonb_set(data, '{${key}}', 'null'::jsonb) WHERE app = $1 AND ${TYPE_OF(key)} NOT IN ('string', 'object', 'null')`
        : `UPDATE ${T} SET data = json_set(data, '$.${key}', json('null')) WHERE app = $1 AND ${TYPE_OF(key)} NOT IN ('text', 'object', 'null')`, [app]);
    }
    const left = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND ${TYPE_OF(key)} NOT IN ('object', 'null')`, [app]))[0].n;
    if (left) throw new Error(`${left} row(s) still hold data.${key} as something other than an object`);
    if (strings || other) log(`       rewritten: ${strings + other} row(s)`);
  }
  {
    const DIGITS = pg ? `data->>'parent_id' ~ '^[0-9]+$'` : `(${J('parent_id')} GLOB '[0-9]*' AND ${J('parent_id')} NOT GLOB '*[^0-9]*')`;
    report.text.parentIds = +(await q(`SELECT count(*) AS n FROM ${T} WHERE app = $1 AND ${TYPE_OF('parent_id')} = '${TEXT}' AND ${DIGITS}`, [app]))[0].n;
    log(`    data.parent_id         strings of digits: ${report.text.parentIds}`);
    if (apply && report.text.parentIds) {
      await q(pg
        ? `UPDATE ${T} SET data = jsonb_set(data, '{parent_id}', to_jsonb((data->>'parent_id')::bigint)) WHERE app = $1 AND ${TYPE_OF('parent_id')} = 'string' AND ${DIGITS}`
        : `UPDATE ${T} SET data = json_set(data, '$.parent_id', CAST(json_extract(data, '$.parent_id') AS INTEGER)) WHERE app = $1 AND ${TYPE_OF('parent_id')} = 'text' AND ${DIGITS}`, [app]);
      log(`       rewritten: ${report.text.parentIds} row(s)`);
    }
  }

  // ---- 4. the uniqueness guard
  log(`\n4.  one row per (app, type) for each container kind`);
  for (const kind of CONTAINER_KINDS) {
    const clashes = await q(
      `SELECT type, count(*) AS n, min(id) AS a, max(id) AS b FROM ${T} WHERE app = $1 AND type LIKE $2
        GROUP BY type HAVING count(*) > 1 ORDER BY count(*) DESC`, [app, `%:${kind}`]);
    const idx = `${t.table}_${kind}_type_uniq`;
    const has = pg
      ? (await q(`SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2`, [t.schema, idx])).length > 0
      : (await q(`SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = $1`, [idx])).length > 0;
    const wanted = guard === 'all' || guard === kind;
    let state = has ? 'guarded' : clashes.length ? `${clashes.length} duplicate type(s)` : 'clean, no guard';
    if (!has && wanted && apply && !clashes.length) {
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS "${idx}" ON ${T}(app, type) WHERE type LIKE '%:${kind}'`);
      state = 'guard added';
    } else if (!has && wanted && clashes.length) state += ' — guard NOT added';
    else if (!has && wanted && !apply) state += ' (would be added)';
    report.guard[kind] = state;
    log(`    ${kind.padEnd(8)} ${state}`);
    for (const c of clashes.slice(0, 5)) log(`       ${c.type}  ×${c.n}   (ids include ${c.a}, ${c.b})`);
  }

  // ---- 5. the shape checks. A constraint is the TABLE's, so violations are counted over all of it
  // (under legacy split mode the table is shared).
  log(`\n5.  shape checks on ${T}`);
  for (const c of shapeChecks(db.type)) {
    const has = pg
      ? (await q(`SELECT 1 FROM pg_constraint c JOIN pg_class k ON k.oid = c.conrelid JOIN pg_namespace n ON n.oid = k.relnamespace
                   WHERE n.nspname = $1 AND k.relname = $2 AND c.conname = $3`, [t.schema, t.table, c.name])).length > 0
      : (await q(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1 AND sql LIKE $2`, [t.table, `%CONSTRAINT ${c.name} %`])).length > 0;
    const bad = has ? 0 : +(await q(`SELECT count(*) AS n FROM ${T} WHERE NOT (${c.expr})`))[0].n;
    let state = has ? 'in place' : bad ? `${bad} row(s) violate it` : 'no violations, not added';
    if (!has && checks && !pg) state += ' — cannot be added to an existing SQLite table (a new app\'s table is created with it)';
    else if (!has && checks && bad) state += apply ? ' — NOT added' : ' (step 3 rewrites what it can; added on --apply only if none are left)';
    else if (!has && checks && !apply) state += ' (would be added)';
    else if (!has && checks && apply) {
      // NOT VALID then VALIDATE: the scan holds a lock that lets reads and writes through
      await q(`ALTER TABLE ${T} ADD CONSTRAINT ${c.name} CHECK (${c.expr}) NOT VALID`);
      await q(`ALTER TABLE ${T} VALIDATE CONSTRAINT ${c.name}`);
      state = 'added';
    }
    report.checks[c.name] = state;
    log(`    ${c.name.padEnd(16)} ${state}`);
  }

  // ---- the app's registered declarations
  const f = resolveFormatsTable(app, db.type, splitMode);
  const hasFormats = pg
    ? (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [f.schema, f.table])).length > 0
    : (await q(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`, [f.table])).length > 0;
  report.formats = hasFormats
    ? +(await q(`SELECT count(*) AS n FROM ${pg ? `"${f.schema}"."${f.table}"` : `"${f.table}"`} WHERE app = $1`, [app]))[0].n
    : 0;
  log(`\n    formats rows registered      ${report.formats}${report.formats ? '' : '   (run register-formats.js: until then rules and vocabulary come from the stamp in data, then the built-in copy)'}`);
  return report;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const config = loadConfig(o.db);
  const db = config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config);
  console.log(`\nsetup-app — ${o.apply ? 'APPLY' : 'DRY RUN'}\n  db=${o.db}  app=${o.app}  split mode=${config.splitMode}\n`);
  try {
    const r = await setupApp(db, { app: o.app, splitMode: config.splitMode, apply: o.apply, guard: o.guard, checks: o.checks });
    if (!o.apply) console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
    await db.end();
    process.exit(r.authBlocked.length ? 2 : 0);
  } catch (e) {
    console.error(`\nERROR: ${e.message}`);
    await db.end().catch(() => {});
    process.exit(1);
  }
}

module.exports = { setupApp, planAuthMove, CONTAINER_KINDS };
if (require.main === module) main();
