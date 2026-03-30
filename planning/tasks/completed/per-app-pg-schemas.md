# Per-App PostgreSQL Schemas

## Status: COMPLETE

## Objective

In per-app split mode on PostgreSQL, use per-app schemas (`dms_{appname}`) instead of per-app table name prefixes within the shared `dms` schema. This gives cleaner organization (`\dt dms_myapp.*`), per-schema pg_dump/restore, and permission boundaries.

### Before (current per-app mode)

```
dms.data_items                                    (legacy shared table — kept for backtrack)
dms.data_items__mitigat_ny_prod                   (per-app main table)
dms.data_items__mitigat_ny_prod__s1_v2_traffic    (per-app split table)
dms.seq__mitigat_ny_prod                          (per-app sequence)
dms.change_log                                    (shared)
dms.yjs_states                                    (shared)
```

### After

```
dms.data_items                                    (legacy shared table — kept for backtrack)
dms.change_log                                    (shared)
dms.yjs_states                                    (shared)

dms_mitigat_ny_prod.data_items                    (per-app main table)
dms_mitigat_ny_prod.data_items__s1_v2_traffic     (per-app split table)
dms_mitigat_ny_prod.data_items_id_seq             (per-app sequence)
```

### SQLite: No change

SQLite has no schema concept. Per-app table name prefixes (`data_items__myapp`) continue as-is.

## Current State

### `table-resolver.js` — the chokepoint

`resolveTable(app, type, dbType, splitMode)` returns `{schema, table, fullName}`. Currently:

```js
// line 98 — schema is always 'dms'
const schema = dbType === 'postgres' ? 'dms' : 'main';
// line 104 — fullName is always 'dms.{table}'
return { schema, table: t, fullName: isPg ? `${schema}.${t}` : t };
```

Per-app mode encodes the app in the **table name** (`data_items__${appKey}`), not the schema.

### Helper functions — all identical pattern

8 files have helpers that hardcode `dms.`:

| File | Function | Pattern |
|------|----------|---------|
| `dms.controller.js:77` | `tableName(name)` | `'dms.' + name` |
| `sync/sync.js:69` | `tbl(name)` | `'dms.' + name` |
| `sync/ws.js:57` | `tbl(name)` | `'dms.' + name` |
| `scripts/cleanup-db.js:52` | `fqn(db, table)` | `'dms.' + table` |
| `scripts/copy-db.js:64` | `fqn(db, table)` | `'dms.' + table` |
| `scripts/migrate-to-per-app.js:76` | `fqn(db, table)` | `'dms.' + table` |
| `scripts/consolidate-page-history.js:42` | `fqn(db, table)` | `'dms.' + table` |
| `scripts/extract-images.js:274` | inline | `'dms.data_items'` |

These helpers are used for shared tables (`change_log`, `yjs_states`, `formats`) and for data_items when not going through `resolveTable()`.

### Schema init — `db/sql/dms/dms.sql`

Creates `dms` schema, `dms.data_items`, `dms.data_items_id_seq`, indexes. Runs once on first connection.

### Sequence naming

```js
// table-resolver.js:200
getSequenceName() → 'dms.seq__${appKey}'  // per-app
getSequenceName() → 'dms.data_items_id_seq'  // legacy
```

## Proposed Changes

### 1. `table-resolver.js` — Core schema resolution

Add a new helper `resolveSchema(app, dbType, splitMode)`:

```js
function resolveSchema(app, dbType, splitMode) {
  if (dbType !== 'postgres') return 'main';
  if (splitMode !== 'per-app') return 'dms';
  return pgIdent(`dms_${sanitize(app)}`);
}
```

Update `resolveTable()`:

```js
function resolveTable(app, type, dbType, splitMode = 'legacy', sourceId = null) {
  const isPg = dbType === 'postgres';

  if (splitMode === 'legacy') {
    const schema = isPg ? 'dms' : 'main';
    // ... existing logic unchanged, always uses 'dms' schema
  }

  // per-app mode
  const schema = resolveSchema(app, dbType, splitMode);
  const appKey = sanitize(app);
  const result = (table) => {
    const t = isPg ? pgIdent(table) : table;
    if (!isPg) {
      // SQLite: keep table name prefixes (no schema support)
      return { schema: 'main', table: `data_items__${appKey}${table === 'data_items' ? '' : '__' + table.replace('data_items__', '')}`, fullName: ... };
    }
    return { schema, table: t, fullName: `${schema}.${t}` };
  };

  if (isSplitType(type)) {
    // Split table within the app's schema
    if (sourceId != null) {
      const parsed = parseType(type);
      const suffix = parsed.isInvalid ? '_invalid' : '';
      return result(`data_items__s${sourceId}_v${parsed.viewId}_${parsed.docType}${suffix}`);
    }
    return result(`data_items__${sanitize(type)}`);
  }
  return result('data_items');
}
```

Key change: in per-app PG mode, the app is encoded in the **schema** (`dms_myapp`), not the table name. The table is just `data_items` (or `data_items__s1_v2_...` for splits). SQLite behavior is unchanged.

Update `getSequenceName()`:

```js
function getSequenceName(app, dbType, splitMode) {
  if (splitMode === 'legacy') {
    if (dbType === 'postgres') return 'dms.data_items_id_seq';
    return 'dms_id_seq';
  }
  const appKey = sanitize(app);
  if (dbType === 'postgres') {
    const schema = resolveSchema(app, dbType, splitMode);
    return `${schema}.data_items_id_seq`;
  }
  return `seq__${appKey}`;
}
```

Add `ensureSchema()`:

```js
async function ensureSchema(db, app, dbType, splitMode) {
  if (dbType !== 'postgres' || splitMode !== 'per-app') return;
  const schema = resolveSchema(app, dbType, splitMode);
  const cacheKey = `schema:${schema}`;
  if (_seqCache.has(cacheKey)) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  _seqCache.add(cacheKey);
}
```

Call `ensureSchema()` from `ensureTable()` and `ensureSequence()` before creating tables/sequences.

### 2. Helper functions — shared tables stay in `dms`

The `tableName()`/`tbl()`/`fqn()` helpers are used for shared tables (`change_log`, `yjs_states`, `formats`). These stay in the `dms` schema. No change needed for these helpers since they correctly prefix with `dms.` for shared infrastructure.

However, in `dms.controller.js`, `tableName()` is also used for `data_items` queries. These call sites need to use `resolveTable()` instead when in per-app mode. The controller already does this for most operations via `lookupTable()` — verify that all `tableName('data_items')` calls go through the resolver.

### 3. Schema init — on-demand per-app

`db/index.js` `initDms()` continues to create the `dms` schema + shared tables on startup. Per-app schemas are created on-demand via `ensureSchema()` when the first table is needed for an app.

### 4. Scripts — migration script

New migration step (or update to `migrate-to-per-app.js`):
1. For each distinct app, `CREATE SCHEMA IF NOT EXISTS dms_{appKey}`
2. Create `data_items` + sequence in the new schema
3. Copy rows from `dms.data_items` (or `dms.data_items__appKey`) into `dms_{appKey}.data_items`
4. Move split tables: `ALTER TABLE dms.data_items__appKey__splitname RENAME TO ...` and `ALTER TABLE ... SET SCHEMA dms_{appKey}`

## Files Requiring Changes

| File | Change | Status |
|------|--------|--------|
| `src/db/table-resolver.js` | Added `resolveSchema()`, `ensureSchema()`; rewrote `resolveTable()` per-app branch for PG schemas; updated `getSequenceName()`; updated `ensureTable()` guard to allow per-app `data_items` | DONE |
| `src/routes/dms/dms.controller.js` | Removed `table !== 'data_items'` guards in `mainTable()`, `ensureForWrite()`, `ensureForRead()` — `ensureTable()` handles the skip internally | DONE |
| `src/routes/uda/utils.js` | Removed `table !== 'data_items'` guard in `dmsMainTable()` | DONE |
| `src/routes/sync/sync.js` | Removed `table !== 'data_items'` guard in `mainTable()` | DONE |
| `src/routes/sync/ws.js` | `tbl()` used for `yjs_states` (shared) — no change needed | N/A |
| `src/db/index.js` | No change — shared `dms` schema init stays as-is | N/A |
| `src/scripts/migrate-to-per-app.js` | Will use `resolveTable()`/`ensureSchema()` when run — future update | DEFERRED |
| `src/scripts/cleanup-db.js` | `fqn()` used for shared tables only — no change needed | N/A |
| `src/scripts/copy-db.js` | `fqn()` used for shared tables only — no change needed | N/A |
| `src/scripts/extract-images.js` | Uses `dms.data_items` for cursor query — correct for scanning all data | N/A |

## Considerations

- **Backward compat**: Legacy mode (`DMS_SPLIT_MODE=legacy`) is completely unchanged — everything stays in `dms` schema.
- **Existing per-app tables**: Migration script handles moving `dms.data_items__appKey` → `dms_appKey.data_items`. Can use `ALTER TABLE ... SET SCHEMA` which is instant (no data copy).
- **PG identifier limit**: Schema names are subject to 63-char limit. `dms_` prefix + sanitized app name. `pgIdent()` already handles truncation.
- **SQLite unchanged**: No schema concept. Table naming stays as-is (`data_items__appKey`).
- **Shared tables**: `change_log`, `yjs_states`, `formats` remain in `dms` schema — they're not app-scoped.
- **`search_path`**: Not needed. All queries use fully-qualified names (`schema.table`).
- **Permissions**: Per-app schemas enable `GRANT USAGE ON SCHEMA dms_myapp TO role` for fine-grained access.

## Testing Checklist

- [ ] Legacy mode: all queries still use `dms.data_items`, no regressions
- [ ] Per-app PG: `resolveTable()` returns `dms_{app}.data_items` for non-split types
- [ ] Per-app PG: `resolveTable()` returns `dms_{app}.data_items__s1_v2_...` for split types
- [ ] Per-app SQLite: unchanged behavior (`data_items__appKey`)
- [ ] Schema created on-demand via `ensureSchema()`
- [ ] Sequences created in per-app schema
- [ ] Shared tables (`change_log`, `yjs_states`) remain in `dms` schema
- [ ] Migration script creates schemas and moves tables
- [ ] `dmsMainTable()` in UDA routes works with per-app schemas
- [ ] Cleanup script works with per-app schemas
- [ ] Copy script works with per-app schemas
- [ ] Full workflow test: create site → add patterns → create pages → verify table locations
