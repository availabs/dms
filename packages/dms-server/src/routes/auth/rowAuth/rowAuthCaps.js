'use strict';

/**
 * Row-auth schema capabilities — "does this app's table have the auth columns yet?"
 *
 * The hub's rule (planning/tasks/current/server-side-auth-general.md, "Running on unmigrated
 * schema") is that the server runs on an unmigrated schema and falls back to TODAY'S BEHAVIOUR, not
 * to a default. These probes are how a caller picks its query shape.
 *
 * Memoised per process and per table, in the style of sync.js's `hasChangeLog()`: the probe cost is
 * paid once, never per request. A probe that throws is cached as `false` — a migration that has not
 * run must not turn into a request-time error.
 */

const _cache = new Map();                          // "schema.table" → { auth, parentId }

const key = (schema, table) => `${schema}.${table}`;

/**
 * Which of the row-auth columns exist on one table. Returns `{ auth, parentId }`.
 *
 * `db` is a dms adapter (postgres or sqlite). Both answer `information_schema`-shaped questions
 * differently, so this asks each in its own dialect rather than assuming one.
 */
async function rowAuthCaps(db, schema, table = 'data_items', dbType = 'postgres') {
  const k = key(schema, table);
  if (_cache.has(k)) return _cache.get(k);

  const probe = (async () => {
    try {
      const cols = dbType === 'sqlite'
        // `pragma_table_info(...)` as a TABLE-VALUED FUNCTION, not `PRAGMA table_info(...)`.
        // The adapter dispatches on the statement's first word (db/adapters/sqlite.js): only
        // SELECT and WITH are run with `.all()`, so a bare PRAGMA goes through `.run()` and comes
        // back EMPTY — which this probe would read as "no columns", i.e. unmigrated, for every
        // sqlite app forever. The same reason `runMigrationFile` queries it this way.
        ? (await db.promise(`SELECT name FROM pragma_table_info($1)`, [table])).map(r => r.name)
        : (await db.promise(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = $2`, [schema, table]
          )).map(r => r.column_name);
      const caps = { auth: cols.includes('auth'), parentId: cols.includes('parent_id') };
      // Once per table per process. Without the column, ancestry comes from the type path, which
      // routes a component to its PATTERN and skips its page — so a page's own restriction does not
      // reach its sections. Harmless under `log`, wrong under `enforce`, and silent either way
      // until someone says so. (`data.parent` used to paper over this and was retired 2026-10-29;
      // see rowAuth.js's header.)
      if (!caps.parentId) {
        // `info`, not `warn`: an unmigrated table is an expected state, not a fault — and every
        // auth suite that counts console.warn as "would-deny lines" would otherwise see this one
        // probe as a denial. It still prints.
        console.info(`[row-auth] ${k} has no parent_id column — ancestry falls back to the type `
          + `path, which skips a component's page. Run migrate-row-auth.js --add-columns on it.`);
      }
      return caps;
    } catch (e) {
      // An absent table, a permissions problem, a dialect surprise — all mean "not migrated".
      console.warn(`[row-auth] capability probe failed for ${k}: ${e.message} — assuming unmigrated`);
      return { auth: false, parentId: false };
    }
  })();

  _cache.set(k, probe);                            // cache the PROMISE: concurrent callers probe once
  const caps = await probe;
  _cache.set(k, caps);
  return caps;
}

/**
 * The column list to select for `rowAuth.resolve()`, given what the table actually has.
 *
 * This is the projection the resolver's caller contract requires — never `data` when the `auth`
 * column exists, because production rows average ~10KB of jsonb and selecting it exhausts the heap
 * in bulk. `data` is now the GRANTS fallback only: a table without `parent_id` resolves through the
 * type path rather than through `data.parent`, which was retired (rowAuth.js's header). A table
 * without `auth` still needs `data.authPermissions`, so callers resolving large sets against one
 * must chunk.
 */
function authColumns(caps, dbType = 'postgres') {
  const cols = ['id', 'type'];
  if (caps.parentId) cols.push('parent_id');
  if (caps.auth) cols.push('auth');
  if (!caps.auth) return [...cols, 'data'];
  // No extra column for the pattern vocabulary: it lives inside `auth` (row-auth-vocabulary.md),
  // which is already selected. On an unmigrated table it comes from `data`, which is too.
  return cols;
}

/** Tests only. */
function _resetCaps() { _cache.clear(); }

module.exports = { rowAuthCaps, authColumns, _resetCaps };
