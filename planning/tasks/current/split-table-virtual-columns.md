# Split Table Virtual Columns & Indexes

## Objective

Add virtual columns and indexes to dataset split tables based on the source's `config.attributes`. This gives B-tree index speed for filtering, sorting, and grouping on dataset columns — currently all queries do full table scans via `data->>'column'` expressions.

## Context

Dataset row data lives in split tables (e.g., `data_items__app__s4_v5_actions_6`) with all values in a single `data` JSON column. Every UDA query (`simpleFilter`, `simpleFilterLength`, `handleOrderBy`) accesses fields via `data->>'column_name'`, which requires scanning every row. For datasets with thousands+ rows this is slow.

Each dataset source already stores its column schema in `data->>'config'` as `{ attributes: [{ name, display_name, type, dataType, ... }] }`. We can use this to generate:

- **SQLite**: `GENERATED ALWAYS AS (json_extract(data, '$.col')) VIRTUAL` columns + `CREATE INDEX`
- **PostgreSQL**: Expression indexes on `(data->>'col')` (no virtual columns needed — jsonb expression indexes are the idiomatic approach)

## Key Design Decisions

- **Zero write overhead** — SQLite virtual columns are computed on read, not stored
- **Additive only** — SQLite can't drop generated columns; new attributes add new columns, stale ones return NULL
- **Type affinity** — Map attribute `dataType` to SQL types for correct numeric comparison/sorting
- **Column tracking cache** — Track which virtual columns already exist per table to avoid duplicate `ALTER TABLE` calls
- **Opt-in query optimization** — When virtual columns exist, UDA queries reference them directly instead of `data->>'col'`
- **Trigger point** — Columns/indexes are created at publish time (attributes are known) or lazily on first query when `dmsAttributes` are resolved

## Attribute Config Shape

From the source's `data->>'config'`:

```json
{
  "attributes": [
    { "name": "geoid", "display_name": "GeoID", "type": "text" },
    { "name": "traffic_count", "display_name": "Traffic Count", "dataType": "integer" },
    { "name": "speed_limit", "display_name": "Speed Limit", "dataType": "integer" },
    { "name": "road_name", "display_name": "Road Name" }
  ]
}
```

## Type Mapping

| Attribute `dataType` | SQLite Virtual Column Type | PG Expression Index Cast |
|---|---|---|
| `integer` | `INTEGER` | `((data->>'col')::integer)` |
| `number`, `numeric`, `real` | `REAL` | `((data->>'col')::numeric)` |
| `text` (default) | `TEXT` | `(data->>'col')` |

## Implementation

### Phase 1: Column/Index Infrastructure (`table-resolver.js`)

Add functions to `src/db/table-resolver.js`:

**`ensureVirtualColumns(db, schema, table, dbType, attributes)`**:
- Takes the resolved split table name + attributes array
- For each attribute in `attributes`:
  - Skip if column already exists (check `_columnCache` or `PRAGMA table_info` / `information_schema`)
  - **SQLite**: `ALTER TABLE {table} ADD COLUMN {name} {type} GENERATED ALWAYS AS (json_extract(data, '$.{name}')) VIRTUAL`
  - **PostgreSQL**: No-op for columns (expression indexes only)
- Create indexes:
  - **SQLite**: `CREATE INDEX IF NOT EXISTS idx_{table}_{name} ON {table}({name})`
  - **PostgreSQL**: `CREATE INDEX IF NOT EXISTS idx_{table}_{name} ON {schema}.{table} ((data->>'{name}'))`

**Column existence cache**: `_columnCache` — Map of `"schema.table"` → `Set<column_name>`. Populated on first check via:
- SQLite: `PRAGMA table_info({table})`
- PostgreSQL: `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`

For PostgreSQL index existence, use `pg_indexes` catalog or just rely on `CREATE INDEX IF NOT EXISTS`.

**Export** `ensureVirtualColumns` and `clearCaches` (update to also clear `_columnCache`).

- [ ] Add `_columnCache` Map
- [ ] Add `getExistingColumns(db, schema, table, dbType)` helper
- [ ] Add `ensureVirtualColumns(db, schema, table, dbType, attributes)`
- [ ] Add type mapping logic (`dataType` → SQL type)
- [ ] Update `clearCaches()` to include `_columnCache`
- [ ] Unit tests for `ensureVirtualColumns` (both SQLite and PG)

### Phase 2: Integration with UDA (`utils.js`)

Update `getEssentials()` in `src/routes/uda/utils.js` to call `ensureVirtualColumns` when `dmsAttributes` are available and the table is a split table.

After the existing table ensure block (lines ~150-155), add:

```js
if (dmsAttributes?.length && isSplitType(type)) {
  await ensureVirtualColumns(db, table_schema, table_name, db.type, dmsAttributes);
}
```

This ensures columns/indexes exist before any query runs, and only for split tables with known attributes.

- [ ] Import `ensureVirtualColumns` in utils.js
- [ ] Call after `ensureTable` when `dmsAttributes` is available
- [ ] Verify no performance regression (cache should make repeated calls instant)

### Phase 3: Query Optimization (`uda.controller.js` / `utils.js`)

Update UDA query builders to use virtual column names directly instead of `data->>'col'` when available.

**SQLite**: Replace `data->>'col'` with just `col` in SELECT, WHERE, ORDER BY, GROUP BY when the virtual column exists. This is simpler SQL and the optimizer uses the index.

**PostgreSQL**: Keep `data->>'col'` syntax — PostgreSQL's optimizer matches expression indexes automatically when the expression in the query matches the indexed expression.

Key areas to update:
- `handleFilters` / `handleFilterGroups` — column references in WHERE
- `handleOrderBy` — column references + type casting (virtual columns already have the right type)
- `simpleFilter` SELECT list — can use `col` instead of `data->>'col' AS col`
- `buildCombinedWhere` — DMS app/type filter conditions

**Approach**: Add a helper `resolveColumnExpr(colName, dbType, virtualColumns)` that returns:
- SQLite + column exists: just `colName`
- PostgreSQL or column doesn't exist: `data->>'${colName}'`

Pass the set of known virtual columns through from `getEssentials` (already returns `dmsAttributes`).

- [ ] Add `resolveColumnExpr` helper
- [ ] Update `handleFiltersType` to use resolved column expressions
- [ ] Update `handleOrderBy` to skip `::type` cast when virtual column has correct affinity
- [ ] Update `simpleFilter` SELECT clause
- [ ] Update `buildCombinedWhere` if needed
- [ ] Integration tests: verify queries use indexes (EXPLAIN QUERY PLAN for SQLite)

### Phase 4: Publish-Time Column Creation

Update `src/routes/upload/routes.js` publish handler to create virtual columns immediately after publishing data (not waiting for first query).

After the data insertion loop, when the split table already exists and attributes are known:

```js
const { ensureVirtualColumns } = require('#db/table-resolver.js');
// ... after publish loop ...
await ensureVirtualColumns(db, schema, tableName, dbType, columns);
```

This ensures indexes are ready before the user navigates to the dataset view.

- [ ] Import `ensureVirtualColumns` in upload routes
- [ ] Call after publish loop with the column definitions
- [ ] Map upload `columns` format to the `attributes` format expected by `ensureVirtualColumns`

### Phase 5: Testing

- [ ] Unit tests: `ensureVirtualColumns` creates correct DDL for SQLite
- [ ] Unit tests: `ensureVirtualColumns` creates correct expression indexes for PostgreSQL
- [ ] Unit tests: Column cache prevents duplicate ALTER TABLE calls
- [ ] Unit tests: Type mapping (`integer`, `real`, `text` affinity)
- [ ] Integration test: Publish data → virtual columns exist → query uses index
- [ ] Integration test: Verify `EXPLAIN QUERY PLAN` shows index usage (SQLite)
- [ ] Integration test: Query results identical with/without virtual columns
- [ ] Integration test: Schema evolution — add new attribute → new column added
- [ ] Cross-DB: Run on both SQLite and PostgreSQL
- [ ] Performance: Measure query time with/without indexes on a dataset with 1000+ rows

## Files Requiring Changes

| File | Changes |
|---|---|
| `src/db/table-resolver.js` | `ensureVirtualColumns()`, `_columnCache`, type mapping |
| `src/routes/uda/utils.js` | Call `ensureVirtualColumns` in `getEssentials()` |
| `src/routes/uda/uda.controller.js` | Use virtual column names in queries (SQLite) |
| `src/routes/upload/routes.js` | Call `ensureVirtualColumns` after publish |
| `tests/test-table-splitting.js` | Virtual column + index tests |

## Risks / Open Questions

- **SQLite `ALTER TABLE ADD COLUMN` with `GENERATED ALWAYS`** — Supported since SQLite 3.31.0 (2020-01-22). Verify `better-sqlite3` bundles a recent enough version.
- **Column name collisions** — Virtual column names must not collide with existing real columns (`id`, `app`, `type`, `data`, `created_at`, etc.). Filter these out.
- **Large attribute counts** — Datasets with 50+ columns would create 50+ virtual columns + indexes. Consider a threshold or only indexing columns that appear in filter/orderBy usage patterns.
- **Index maintenance cost** — While virtual columns have zero write overhead, indexes on them do have write cost (updated on INSERT/UPDATE). For bulk publish this is acceptable but worth noting.
