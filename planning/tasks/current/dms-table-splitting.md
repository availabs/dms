# DMS Table Splitting — Per-App and Per-Type Table Isolation

## Objective

Split the monolithic `data_items` table into per-app tables (`data_items__{app}`) and further split high-volume dataset row types into per-type tables (`data_items__{app}__{type}`). This gives each app its own isolated table with a per-app ID sequence, and gives each dataset version a homogeneous table where targeted indexes (json_extract virtual columns, jsonb path indexes) are practical.

The feature is implemented in two tiers:
- **Tier 1 (Per-type splitting)**: Server-only, zero client API changes — dataset row data routes to per-type tables transparently
- **Tier 2 (Per-app isolation)**: Adds `app` to `byId`/`edit` Falcor routes, backwards-compatible with legacy single-table databases

## Motivation

Currently ALL DMS content lives in a single `data_items` table:
- Sites, patterns, pages, sections (~hundreds of rows)
- Dataset metadata (source records, view records — ~tens of rows)
- **Dataset row data** (~thousands to millions of rows per dataset version)

Problems:
- **Index inefficiency**: The GIN jsonb index covers rows with wildly different `data` structures — dataset rows (flat key-value) mixed with page sections (nested Lexical JSON). Per-type tables enable targeted indexes.
- **No per-type indexing**: Can't create indexes on specific json fields (e.g., `json_extract(data, '$.geoid')` in SQLite, or jsonb path indexes in PostgreSQL) because the `data` column structure varies by type.
- **No app isolation**: Multiple apps share one table, one sequence, one set of indexes. A heavy dataset import in one app affects queries in another.
- **Homogeneous split tables**: When all rows in a table share the same `data` structure, virtual columns, partial indexes, and jsonb indexes become practical and efficient.

## Design

### Split Modes

The server supports a `splitMode` configuration:

| Mode | Table structure | ID sequence | API requirements |
|------|----------------|-------------|-----------------|
| `legacy` | Single `data_items` for all apps | One global sequence | Current API (no app on byId/edit) |
| `per-app` | `data_items__{app}` per app + `data_items__{app}__{type}` for dataset rows | One sequence per app | App required on byId/edit |

New DMS applications default to `per-app`. Existing databases continue in `legacy` mode until migrated.

### Table Resolver

```javascript
function resolveTable(app, type, dbType, splitMode) {
  const schema = dbType === 'postgres' ? 'dms' : 'main';

  if (splitMode === 'legacy') {
    // Tier 1 only: split types get their own table, everything else in data_items
    if (isSplitType(type)) {
      return { schema, table: `data_items__${sanitize(type)}` };
    }
    return { schema, table: 'data_items' };
  }

  // per-app mode: every app gets its own table
  const appKey = sanitize(app);
  if (isSplitType(type)) {
    return { schema, table: `data_items__${appKey}__${sanitize(type)}` };
  }
  return { schema, table: `data_items__${appKey}` };
}
```

### Split Type Detection

Dataset row data has a distinctive type pattern:

```
{uuid}-{view_id}                    → data rows
{uuid}-{view_id}-invalid-entry      → invalid data rows
```

Regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+(-invalid-entry)?$/`

This clearly distinguishes from DMS content types (`site`, `siteType|pattern`, `uuid|page`, `uuid|section`, `uuid|source`, `uuid|source|view`).

### Table Naming / Sanitization

Rules:
- Replace `-` with `_`
- Lowercase
- Prefix with `data_items__`
- Max length: 63 chars (PostgreSQL limit)

Examples:
- App `myapp`, non-split type → `data_items__myapp`
- App `myapp`, type `def-456-30` → `data_items__myapp__def_456_30`
- App `myapp`, type `def-456-30-invalid-entry` → `data_items__myapp__def_456_30_invalid_entry`
- Legacy mode, type `def-456-30` → `data_items__def_456_30`

### Table Schema

All tables (per-app and per-type) mirror `data_items`:

```sql
-- PostgreSQL: per-app sequence
CREATE SEQUENCE IF NOT EXISTS dms.seq__{appKey};
CREATE TABLE IF NOT EXISTS dms.data_items__{key} (
    id bigint NOT NULL DEFAULT nextval('dms.seq__{appKey}'::regclass),
    app text NOT NULL,
    type text NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by integer,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by integer,
    CONSTRAINT data_items__{key}_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_data_items__{key}_app_type
    ON dms.data_items__{key} (app, type);

-- SQLite: per-app sequence table
CREATE TABLE IF NOT EXISTS seq__{appKey} (id INTEGER PRIMARY KEY AUTOINCREMENT);
CREATE TABLE IF NOT EXISTS data_items__{key} (
    id INTEGER PRIMARY KEY,
    app TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    created_by INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_data_items__{key}_app_type
    ON data_items__{key} (app, type);
```

### ID Sequences — Per-App

Each app has its own ID sequence. All tables for an app (the main per-app table + any per-type split tables) share that app's sequence. No cross-app ID coordination needed because clients only interact with one app at a time.

**PostgreSQL**: `CREATE SEQUENCE dms.seq__{appKey}` — referenced by all tables for that app via `DEFAULT nextval(...)`.

**SQLite**: Simulated via `CREATE TABLE seq__{appKey} (id INTEGER PRIMARY KEY AUTOINCREMENT)`. Before INSERT into any of the app's tables:
```sql
INSERT INTO seq__{appKey} DEFAULT VALUES;
-- use last_insert_rowid() as explicit id
```

**Legacy mode**: Uses the existing `dms.data_items_id_seq` (PostgreSQL) or `data_items` AUTOINCREMENT (SQLite). Per-type split tables in legacy mode need a shared sequence — PostgreSQL reuses `dms.data_items_id_seq`, SQLite uses a single `dms_id_seq` table.

### Table Lifecycle

- **Auto-created**: When the first INSERT targets a new table, it's created if it doesn't exist
- **Cached**: Table existence is checked once per process lifetime and cached in memory
- **No auto-drop**: Tables persist even if all rows are deleted

## Tier 1: Per-Type Splitting (Server-Only)

Zero client API changes. Works in both `legacy` and `per-app` modes.

### Operations That Already Have app+type

| Operation | Falcor call | Server receives | Status |
|-----------|-------------|-----------------|--------|
| **create** | `['dms','data','create'], [app, type, data]` | `(args=[app,type,data])` | Has app+type |
| **delete** | `['dms','data','delete'], [app, type, ...ids]` | `(ids)` — drops app+type | Has app+type (server ignores it) |
| **massedit** | `['dms','data','massedit'], [app, type, col, maps]` | `(app, type, column, maps)` | Has app+type |
| **byIndex** | `['dms','data','byIndex', app+type, ...]` | has app+type in path | Has app+type |
| **searchOne** | `['dms','data','searchOne', app+type, ...]` | has app+type in path | Has app+type |
| **UDA queries** | `['uda', env, 'viewsById', ...]` | `getEssentials` resolves type | Has app+type |

### Operations That Don't Need app+type (Tier 1)

| Operation | Falcor call | Why safe |
|-----------|-------------|---------|
| **byId GET** | `['dms','data','byId', id, attrs]` | Never called for row data — only DMS content which stays in `data_items` |
| **edit** | `['dms','data','edit'], [id, data]` | Never called for row data — individual row edits go through massedit |

Evidence: Row data is always accessed via `create`/`delete`/`massedit`/UDA routes. The `byId` and `edit` routes are only used by `dmsDataLoader`, `processNewData`, `dmsDataEditor`, `updateDMSAttrs`, and `componentsIndexTable` — all for pages, sections, patterns, sources, and views.

### Tier 1 Server Changes

| Component | Change |
|-----------|--------|
| `db/table-resolver.js` | NEW — `resolveTable()`, `isSplitType()`, `sanitize()`, `ensureTable()`, `allocateId()`, table cache |
| `routes/dms/dms.controller.js` | `createData`, `setMassData`, query functions — use `resolveTable()` |
| `routes/dms/dms.route.js` | `delete` handler — pass app+type through to `deleteData` |
| `routes/uda/utils.js` | `getEssentials` — use `resolveTable()` for `table_name` when `isDms` |

## Tier 2: Per-App Isolation (API Migration)

Requires adding `app` to the `byId` and `edit` Falcor routes so the server can resolve the correct per-app table for ALL operations, not just row data.

### API Changes

**New Falcor routes (added alongside existing):**

```
GET:  dms.data[{keys:apps}].byId[{keys:ids}][{keys:attrs}]
CALL: dms.data.edit  args: [app, id, data]     (3 args = new)
```

**Legacy routes (kept for backwards compatibility):**

```
GET:  dms.data.byId[{keys:ids}][{keys:attrs}]   → queries data_items
CALL: dms.data.edit  args: [id, data]            (2 args = legacy)
```

The server detects legacy vs new `edit` calls by argument count (2 = legacy, 3 = new).

The `$ref` returns from `byIndex`/`searchOne` switch based on split mode:
- Legacy: `$ref(["dms", "data", "byId", id])`
- Per-app: `$ref(["dms", "data", app, "byId", id])`

### Client-Side Change Assessment

All callers of `byId`/`edit` were audited. The app is available everywhere — it's in `config.format.app`, in function parameters, and encoded in ref strings (`{app}+{type}`).

**`edit` callers (~4 production sites) — all EASY:**

| File | Location | App source |
|------|----------|-----------|
| `api/index.js` | `dmsDataEditor` line 277 | `config.format.app` |
| `api/updateDMSAttrs.js` | line 46 | parsed from config |
| `api/index.js` | type edit line 262 | `config.format.app` |
| CLI `raw.js` | line 196 | `--app` flag |

**`byId` GET callers — mostly EASY/MODERATE:**

| File | Location | App source | Difficulty |
|------|----------|-----------|------------|
| `api/index.js` | `dmsDataLoader` | `config.format.app` | EASY |
| `api/createRequest.js` | `getIdPath` | `format.app` | EASY |
| `api/updateDMSAttrs.js` | cache read line 28 | parsed from config | EASY |
| `api/proecessNewData.js` | cache reads, ref loads | `app` param + `ref.split('+')[0]` | MODERATE — app is available as function param and in ref strings, needs threading through cache reads |
| `componentsIndexTable.jsx` | lines 252, 301 | available from site context | MODERATE — currently fetches byId to discover app; needs app from context instead |
| CLI `raw.js`, `data.js` | various | `--app` flag / config | EASY |

**`invalidate` calls (~3 sites) — all EASY:**

| File | Location | App source |
|------|----------|-----------|
| `api/index.js` | lines 263, 278 | `config.format.app` |
| `api/updateDMSAttrs.js` | line 50 | parsed from config |

**Total: ~25 call sites. ~15 EASY, ~10 MODERATE, 0 HARD.**

The MODERATE sites require:
- `processNewData`: Thread `app` through cache path construction (function already receives `app` as a parameter)
- `componentsIndexTable`: Get `app` from component context rather than fetching byId to discover it

### Backwards Compatibility

**Option A: Dual routes (recommended)**

Both old and new Falcor routes exist simultaneously. Legacy databases use old routes pointing at `data_items`. Migrated databases use new app-namespaced routes. The client API layer (`dmsDataLoader`/`dmsDataEditor`) checks a flag (from site config or server response) to decide which path format to use.

**Option B: Migration script + breaking change**

A one-time migration script:
1. Creates per-app tables (`data_items__{app}`)
2. Copies rows from `data_items` grouped by `app`
3. Creates per-app sequences initialized to max(id) for that app
4. Optionally splits dataset row types into per-type tables
5. Verifies row counts match
6. Old `data_items` can be kept as read-only fallback or dropped

Client code switches to new API paths. No dual-route complexity.

**Recommendation**: Start with Option A (dual routes) for a smooth rollout. The server overhead of maintaining both route sets is minimal. Once all deployments are migrated, the legacy routes can be removed.

## Implementation Phases

### Phase 1: Table Resolver Module — DONE

Created `dms-server/src/db/table-resolver.js`:

- [x] `isSplitType(type)` — detect types eligible for per-type splitting (UUID-viewId regex)
- [x] `sanitize(name)` — convert app/type to safe SQL identifier
- [x] `resolveTable(app, type, dbType, splitMode)` — return `{schema, table, fullName}` supporting both legacy and per-app modes
- [x] `ensureTable(db, schema, table, dbType, seqName)` — create table if not exists, with in-memory cache
- [x] `allocateId(db, app, dbType, splitMode)` — allocate ID from per-app sequence (or global in legacy mode)
- [x] `ensureSequence(db, app, dbType, splitMode)` — create per-app sequence if not exists
- [x] `buildCreateTableSQL(schema, table, dbType, seqName)` — DDL builder for split tables
- [x] `clearCaches()` — clear table/sequence caches (for testing)

### Phase 2: ID Sequences — DONE

- [x] Legacy mode — PostgreSQL: reuse `dms.data_items_id_seq` for split tables; SQLite: `dms_id_seq` table
- [x] Per-app mode — PostgreSQL: `CREATE SEQUENCE dms.seq__{appKey}`; SQLite: `CREATE TABLE seq__{appKey} (...)`
- [x] `allocateId` implementation for both modes and both databases
- [x] Updated `dms.sqlite.sql` — added `dms_id_seq` table for legacy mode shared sequence

Note: Comment in dms.sqlite.sql must NOT contain semicolons — SQLite adapter splits on `;` including inside comments.

### Phase 3: DMS Controller Integration (Tier 1 — Server Only) — DONE

Updated `dms-server/src/routes/dms/dms.controller.js`:

- [x] Import resolver functions from `#db/table-resolver.js`
- [x] `createController` accepts `options.splitMode` (defaults to env `DMS_SPLIT_MODE` or 'legacy')
- [x] Helper functions: `resolve(app, type)`, `ensureForWrite(app, type)`, `ensureForRead(app, type)`
- [x] `createData` — resolve table, ensure exists, allocate ID for SQLite split tables
- [x] `setMassData` — now async, resolves table via `ensureForWrite`
- [x] `deleteData` — signature changed from `(ids, user)` to `(app, type, ids, user)`, resolves table
- [x] Query functions (`dataLength`, `dataByIndex`, `dataSearch`, `filteredDataLength`, `filteredDataByIndex`) — resolve table per-key via `.map(async ...)`
- [x] `getDataById` and `setDataById` — unchanged, query `data_items` only (Tier 1)
- [x] Fixed `dataSearch` async bug — changed `forEach(async ...)` to `flatMap(... => map(async ...))` so promises are properly collected

Updated `dms-server/src/routes/dms/dms.route.js`:

- [x] `delete` handler — now passes `app, type` through to `deleteData(app, type, ids, this.user)`

### Phase 4: UDA Integration (Tier 1) — DONE

Updated `dms-server/src/routes/uda/utils.js`:

- [x] Import `resolveTable`, `ensureSequence`, `ensureTable`, `getSequenceName` from `#db/table-resolver.js`
- [x] `getEssentials` — when `isDms`, use `resolveTable()` for `table_schema`/`table_name` after type resolution
- [x] Split tables auto-ensured for reads (creates empty table if not yet created)
- [x] View/source ID lookups still query `data_items` directly (correct — DMS content isn't split)
- [x] `simpleFilter`, `simpleFilterLength` — no changes (already use `table_schema.table_name` from `getEssentials`)

### Phase 5: Tier 1 Testing — DONE

Created `tests/test-table-splitting.js` — 52 tests, all passing:

- [x] Unit: `isSplitType` correctly identifies dataset row types vs DMS content types (14 tests)
- [x] Unit: `sanitize` converts names properly (6 tests)
- [x] Unit: `resolveTable` legacy mode — split/non-split type detection (5 tests)
- [x] Unit: `resolveTable` per-app mode — app isolation, app+type tables (4 tests)
- [x] Integration: split type creates separate table on first insert
- [x] Integration: non-split types still use `data_items`
- [x] Integration: data in split table queryable via `byIndex` and `length` DMS routes
- [x] Integration: mass edit works on split tables
- [x] Integration: delete works on split tables (with app+type passthrough)
- [x] Integration: invalid-entry type also gets split table
- [x] Integration: IDs unique across split tables (shared sequence)
- [x] Integration: multiple rows — verifies data is in split table, NOT in data_items
- [x] Existing test suites all pass: `test:graph`, `test:workflow`, `test:uda`, `test:auth` (24/24)
- [x] Test on PostgreSQL — 52/52 splitting tests + full PG suite (graph, workflow, auth 103/103)

Added `npm run test:splitting` script to `package.json`.

Updated `tests/graph.js` — `createTestGraph` now accepts `splitMode` option, passes through to `createController`.

### Phase 6: Per-App API Routes (Tier 2 — Server)

Update `dms-server/src/routes/dms/dms.route.js`:

- [ ] Add new route: `dms.data[{keys:apps}].byId[{keys:ids}][{keys:attrs}]` — resolves per-app table
- [ ] Update `edit` call handler — detect 3-arg `[app, id, data]` vs 2-arg `[id, data]`
- [ ] Update `$ref` returns in `byIndex`/`searchOne`/`opts.byIndex` — include app when `splitMode === 'per-app'`
- [ ] `getDataById` / `setDataById` — accept optional `app`, resolve table when provided

### Phase 7: Per-App API Routes (Tier 2 — Client)

Update client API layer:

- [ ] `api/index.js` — `dmsDataLoader`: use `['dms', 'data', app, 'byId', id, attrs]` path when split mode enabled
- [ ] `api/index.js` — `dmsDataEditor`: pass `[app, id, data]` to edit call
- [ ] `api/index.js` — `invalidate` calls: use app-namespaced paths
- [ ] `api/proecessNewData.js` — thread `app` through cache path construction (extract from ref strings where needed)
- [ ] `api/updateDMSAttrs.js` — update byId cache reads and edit calls
- [ ] `api/createRequest.js` — update `getIdPath` to include app
- [ ] `componentsIndexTable.jsx` — get app from site context instead of fetching byId to discover it
- [ ] CLI commands — update byId paths to include app (already have `--app` flag)

### Phase 8: Tier 2 Testing

- [ ] Test: new app-namespaced byId route returns correct data from per-app table
- [ ] Test: legacy byId route still works against `data_items`
- [ ] Test: edit with 3 args routes to per-app table
- [ ] Test: edit with 2 args falls back to `data_items` (legacy)
- [ ] Test: $ref returns use correct path format per split mode
- [ ] Test: per-app ID sequences are independent (no cross-app interference)
- [ ] Test: two apps with same type don't interfere
- [ ] Run full test suite on both databases

### Phase 9: Migration Script

- [ ] Script: scan `data_items` for distinct `app` values
- [ ] Script: create per-app tables and sequences
- [ ] Script: copy rows from `data_items` to `data_items__{app}` grouped by app
- [ ] Script: further split dataset row types into `data_items__{app}__{type}` tables
- [ ] Script: initialize per-app sequences to max(id) for that app
- [ ] Script: verify row counts match
- [ ] Script: optionally drop or rename original `data_items` as backup
- [ ] Support both PostgreSQL and SQLite
- [ ] Idempotent (safe to re-run)

### Phase 10: DMS Routes API Documentation

Document the complete DMS Falcor routes API for both legacy and per-app modes:

- [ ] Document all DMS Falcor routes (`dms.data.*`) — path shapes, arguments, return values, `$ref` behavior
- [ ] Document all UDA Falcor routes (`uda.*`) — env resolution, source/view queries, filter options
- [ ] Document legacy vs per-app route differences (dual-route behavior, arg count detection on `edit`)
- [ ] Document table resolver behavior — split mode config, type detection, table naming conventions
- [ ] Document ID sequence behavior — per-app sequences, allocation flow for both PostgreSQL and SQLite
- [ ] Document the `delete` route's app+type passthrough (and why it was previously dropped)
- [ ] Document migration path — when to use legacy vs per-app, how to switch modes
- [ ] Place docs in `dms-server/docs/` or `dms-server/API.md`

## Notes for Future Tasks

### Per-Type Indexing (future task: new dataset type)

Once table splitting is in place, per-type tables enable targeted indexing that isn't practical on the shared `data_items` table. The following should be addressed in a future task when creating a new dataset type:

- **SQLite**: `json_extract` virtual columns with indexes — e.g., `CREATE INDEX idx_geoid ON data_items__app__type (json_extract(data, '$.geoid'))`. Requires knowing the column names for the dataset type.
- **PostgreSQL**: jsonb path operator indexes — e.g., `CREATE INDEX idx_geoid ON dms.data_items__app__type ((data->>'geoid'))`. Also supports GIN indexes on specific jsonb subpaths, partial indexes filtered by type.
- **Index lifecycle**: Should indexes be auto-created based on the source's `config.attributes`? Or manually defined per dataset? The metadata (column definitions) is already stored in the source record's `config` field.
- **Virtual columns for SQLite**: SQLite doesn't support expression indexes on older versions (requires 3.9+). The `json_extract` approach works on 3.38+ (which includes `->>`). Check minimum supported SQLite version.
- **Query planner impact**: Per-type tables with targeted indexes should dramatically improve `simpleFilter`/`simpleFilterLength` performance for large datasets — the query planner can use the index instead of scanning all rows and extracting json per row.

## Risk Assessment

**Tier 1 — Low risk**: Purely server-side routing. Zero client changes. Fallback to `data_items` if any issue.

**Tier 2 — Moderate risk**: Client API changes (~25 call sites, all have app available). Mitigated by:
- Dual routes: legacy paths continue to work against `data_items`
- Incremental rollout: Tier 1 can ship and run in production before Tier 2
- Per-app ID sequences: No cross-app coordination, no global sequence complexity

**Per-app ID isolation**: Each app's tables share one sequence. Clients only interact with one app at a time, so no ID collision risk between apps. Within an app, all tables (per-app + per-type splits) share the same sequence, ensuring uniqueness.

**Migration**: The migration script copies data — it doesn't move or delete. The original `data_items` can remain as a read-only fallback. Legacy routes continue to query it. Only after confirming the migrated data is correct do you switch to per-app mode.

## Files Requiring Changes

### Tier 1 (Server Only)

| File | Change |
|------|--------|
| `src/db/table-resolver.js` | NEW — resolver, split detection, table creation, ID allocation |
| `src/routes/dms/dms.controller.js` | Use resolver in `createData`, `setMassData`, `deleteData`, query functions |
| `src/routes/dms/dms.route.js` | Pass app+type through `delete` handler |
| `src/routes/uda/utils.js` | Use resolver in `getEssentials` |
| `tests/test-table-splitting.js` | NEW — integration tests |

### Tier 2 (API Migration)

| File | Change |
|------|--------|
| `src/routes/dms/dms.route.js` | Add app-namespaced `byId` route, update `edit` arg detection, update `$ref` returns |
| `src/routes/dms/dms.controller.js` | `getDataById`/`setDataById` — accept optional app, resolve table |
| `packages/dms/src/api/index.js` | `dmsDataLoader`/`dmsDataEditor` — use app-namespaced paths |
| `packages/dms/src/api/proecessNewData.js` | Thread app through cache path construction |
| `packages/dms/src/api/updateDMSAttrs.js` | Update byId/edit paths |
| `packages/dms/src/api/createRequest.js` | Update `getIdPath` |
| `packages/dms/src/patterns/page/.../componentsIndexTable.jsx` | Get app from context |
| `packages/dms/cli/src/commands/raw.js`, `cli/src/utils/data.js` | Update byId paths |
| `tests/test-table-splitting.js` | Add Tier 2 tests |

### Migration

| File | Change |
|------|--------|
| `scripts/migrate-to-per-app.js` | NEW — migration script |

## Testing Checklist

- [x] `npm run test` — all existing tests pass (SQLite)
- [x] `npm run test:uda` — UDA tests pass (24/24)
- [x] `npm run test:pg` — PostgreSQL tests pass (graph, workflow, auth 103/103)
- [x] `npm run test:splitting` — 52 tests pass (SQLite)
- [x] Tier 1: split table auto-created on first insert
- [x] Tier 1: DMS CRUD works on split tables
- [x] Tier 1: UDA integration (getEssentials resolves split tables)
- [x] Tier 1: mass edit / delete work on split tables
- [x] Tier 1: non-split types unaffected
- [ ] Tier 2: app-namespaced byId returns correct data
- [ ] Tier 2: legacy byId still works
- [ ] Tier 2: per-app sequences are independent
- [ ] Tier 2: two apps with same type don't interfere
- [ ] Migration: row counts match after migration
- [ ] Migration: app queries work against per-app tables
- [ ] `npm run build` — no compile errors
