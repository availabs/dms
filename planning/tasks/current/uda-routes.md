# UDA Routes in DMS Server

## Objective

Implement UDA (Universal Data Access) Falcor routes in dms-server. UDA provides a unified query interface across two data models:

- **DMS mode** (`app+type` envs) — queries `dms.data_items` with JSON `data` column
- **DAMA mode** (plain `pgEnv` envs) — queries `data_manager.sources`/`views` with real tables

Reference implementation: `references/avail-falcor/routes/uda.route.js` + `udaController.js` + `uda_query_sets/`

## Current State

- DMS routes exist at `src/routes/dms/` with factory controller + utils
- Database adapter layer (`db/index.js`) already supports multiple pgEnv configs via `getDb(pgEnv)`
- `initDama()` exists in `db/index.js` but references SQL scripts that don't exist yet (`create_dama_core_tables.sql`, etc.)
- Filter builders exist in `dms/utils.js` (`handleFilters`, `handleGroupBy`, `handleOrderBy`, `getValuesExceptNulls`)
- Dead DAMA code in `dms/utils.js` (`simpleFilterLength`, `simpleFilter` — not exported, references undefined `getDb`/`getDataTableFromViewId`) — to be cleaned up
- Route auto-discovery (`routes/index.js`) finds any `*route*.js` file recursively — new UDA routes will be discovered automatically

## Scope

**In scope:** PostgreSQL-based DAMA queries and DMS JSON queries (both through the existing adapter layer)
**Out of scope:** ClickHouse support (the reference has it, we don't need it)

## Architecture

```
src/routes/uda/
  uda.route.js          # Falcor route definitions (GET/SET)
  uda.controller.js     # Controller (factory pattern like DMS)
  utils.js              # getEssentials, sanitizeName, filter helpers specific to UDA
```

### Environment Detection

The env string determines the mode:
- Contains `+` → DMS mode: split into `app+type`, query `dms.data_items`
- No `+` → DAMA mode: use env as pgEnv config name, query `data_manager.sources`/`views`
- Override: `options.isDama = true` forces DAMA mode even with `+` in env

### Route Hierarchy

10 Falcor routes in 3 groups:

**Source routes** (5):
1. `uda[{envs}].sources.length` — count of sources
2. `uda[{envs}].sources.byIndex[{indices}]` — sources by index (returns `$ref` to byId)
3. `uda[{envs}].sources.byId[{ids}][{attributes}]` — source metadata (GET + SET)
4. `uda[{envs}].sources.byId[{ids}].views.length` — view count per source
5. `uda[{envs}].sources.byId[{ids}].views.byIndex[{indices}]` — views by index (returns `$ref`)

**View routes** (1):
6. `uda[{envs}].views.byId[{ids}][{attributes}]` — view metadata (GET + SET)

**Data query routes** (4):
7. `uda[{envs}].viewsById[{viewIds}].options[{options}].length` — filtered row count
8. `uda[{envs}].viewsById[{viewIds}].options[{options}].dataByIndex[{indices}][{attributes}]` — filtered data with attributes
9. `uda[{envs}].viewsById[{viewIds}].options[{options}].byIndex[{indices}]` — filtered data by index (returns `$ref` to dataById)
10. `uda[{envs}].viewsById[{viewIds}].dataById[{ids}][{attributes}]` — direct data access by ID

### Options Format

Options are JSON-stringified objects passed as Falcor path keys:

```js
JSON.stringify({
  // Environment override
  isDama: false,            // force DAMA mode even if env has "+"

  // Simple filters (legacy, still supported)
  filter: { geoid: [36001, 36003], year: [2020] },
  exclude: { year: [2011, 2012] },
  gt: { amount: 1000 },
  gte: {}, lt: {}, lte: {},
  like: { name: "%search%" },
  filterRelation: "and",    // "and" or "or" between filter clauses

  // Complex filter groups (nested AND/OR)
  filterGroups: {
    op: "AND",
    groups: [
      { col: "status", op: "filter", value: ["active"] },
      { op: "OR", groups: [
        { col: "views", op: "gt", value: 1000 },
        { col: "likes", op: "gt", value: 50 }
      ]}
    ]
  },

  // Aggregation
  groupBy: ["geoid", "year"],
  having: ["sum(amount) > 1000"],
  orderBy: { geoid: "desc" },

  // Meta lookups (cross-reference to other views)
  meta: {
    "county_fips": "{\"view_id\": 750, \"keyAttribute\": \"geoid\", \"valueAttribute\": \"name\"}"
  },

  // Server-side recursive joins
  serverFn: {
    "breadcrumb": { joinKey: "id", valueKey: "data->>'title'", joinWithChar: " / ", env: "myapp+page" }
  }
})
```

### DMS Source/View Resolution

In DMS mode, sources and views don't map to `data_manager` tables. Instead:
- **Sources** = items from `dms.data_items` referenced in site pattern's `sources` JSON array
- **Views** = items from `dms.data_items` referenced in a source's `views` JSON array
- Resolution: env → `app` → find patterns (`type='pattern'`) → find forms patterns → extract `sources` array

### DAMA Table Schema

`data_manager.sources`:
```
source_id (SERIAL PK), name (TEXT), update_interval (TEXT), category (TEXT[]),
description (TEXT), statistics (JSONB), metadata (JSONB), categories (JSONB),
type (TEXT), display_name (TEXT), source_dependencies (INTEGER[]), user_id (INTEGER),
_created_timestamp (TIMESTAMP), _modified_timestamp (TIMESTAMP)
```

`data_manager.views`:
```
view_id (SERIAL PK), source_id (INTEGER FK → sources), data_type (TEXT),
interval_version (TEXT), geography_version (TEXT), version (TEXT),
source_url (TEXT), publisher (TEXT), table_schema (TEXT), table_name (TEXT),
data_table (TEXT), download_url (TEXT), tiles_url (TEXT),
start_date (DATE), end_date (DATE), last_updated (TIMESTAMP),
statistics (JSONB), metadata (JSONB), user_id (INTEGER), etl_context_id (INTEGER),
view_dependencies (INTEGER[]), _created_timestamp (TIMESTAMP), _modified_timestamp (TIMESTAMP)
```

The `table_schema` + `table_name` on a view point to the actual data table for that view.

## Implementation

### Phase 0: DAMA Schema Init — DONE

- [x] Created `src/db/sql/dama/create_dama_core_tables.sql` — PostgreSQL schema with `data_manager.sources`, `data_manager.views`, auto-update triggers
- [x] Created `src/db/sql/dama/create_dama_core_tables.sqlite.sql` — SQLite equivalent
- [x] Updated `initDama()` in `db/index.js` — checks for `sources`/`views` tables, references single SQL file

### Phase 1: UDA Controller + Utils — DONE

- [x] Created `src/routes/uda/utils.js` — `getEssentials`, `getSitePatterns`, `getSiteSources`, filter builders, sanitization
- [x] Created `src/routes/uda/uda.controller.js` — all source/view/data query functions with DMS+DAMA dual mode

### Phase 2: UDA Routes — DONE

- [x] Created `src/routes/uda/uda.route.js` — 10 Falcor routes (5 source, 1 view, 4 data query)
- [x] Verified auto-discovery via `routes/index.js`

### Phase 3: Tests — DONE

- [x] Created `tests/test-uda.js` — 21 integration tests (DMS mode: sources, views, data queries; DAMA mode: sources CRUD, views CRUD)
- [x] Created `src/db/configs/dama-sqlite-test.config.json` — DAMA test database config
- [x] Added `test:uda` script to package.json
- [x] Updated `tests/graph.js` to include UDA routes in test harness

### Phase 4: Cleanup — DONE

- [x] Removed dead DAMA code from `dms/utils.js`: deleted `simpleFilterLength`, `simpleFilter`, `handleHaving`, `mapFn`, `assign`, `getNestedValue`, `getOrderMultiplier`, `getCompareFn`, `sortRows`
  - Delete unused helpers: `mapFn`, `assign`, `getNestedValue`, `getOrderMultiplier`, `getCompareFn`, `cleanColName`, `sortRows`
  - Delete `extent` (only export not used by DMS controller)
  - Keep only: `handleFilters`, `handleGroupBy`, `handleOrderBy`, `handleHaving`, `getValuesExceptNulls`

## Files

| File | Action |
|------|--------|
| `src/db/sql/dama/create_dama_core_tables.sql` | Create — PostgreSQL DAMA schema |
| `src/db/sql/dama/create_dama_core_tables.sqlite.sql` | Create — SQLite DAMA schema |
| `src/db/index.js` | Modify — verify initDama script references |
| `src/routes/uda/utils.js` | Create — getEssentials, filters, sanitization |
| `src/routes/uda/uda.controller.js` | Create — all UDA business logic |
| `src/routes/uda/uda.route.js` | Create — Falcor route definitions |
| `src/routes/dms/utils.js` | Modify — remove dead DAMA code |
| `tests/test-uda.js` | Create — integration tests |
| `package.json` | Modify — add test:uda script |

## Reference File Mapping

| Reference file | Maps to |
|---------------|---------|
| `uda.route.js` | `src/routes/uda/uda.route.js` |
| `udaController.js` | `src/routes/uda/uda.controller.js` |
| `uda_query_sets/helpers.js` | `src/routes/uda/utils.js` |
| `uda_query_sets/postgres.js` | Inlined into `uda.controller.js` (query building) |
| `uda_query_sets/index.js` | Not needed (no ClickHouse, no query set dispatch) |
| `uda_query_sets/clickhouse.js` | Not needed |

## Verification

- [x] `npm test` — existing DMS tests still pass (regression)
- [x] `npm run test:uda` — 21 UDA tests pass against SQLite (DMS + DAMA modes)
- [ ] `npm run test:pg` — includes UDA tests (not yet wired into postgres-docker.js)
- [ ] Manual: start server, client can query `uda[pgEnv].sources.length` via Falcor

## SQLite Compatibility Fixes (discovered during implementation)

Several cross-database issues were discovered and fixed:

1. **SQLite `ANY()` not supported** — Integrated `_convertArraySyntax()` into `sqlite.js` query pipeline to convert `ANY($N)` → `IN(?,?,?)`
2. **PostgreSQL `::TYPE` casts** — Added universal `::TYPE` stripping in SQLite adapter (`queryText.replace(/::\w+(\[\])?/g, '')`)
3. **`array_agg` → `json_group_array`** — Made `getViewsByIndexBySourceId` db-type-aware
4. **`jsonb_array_length` → `json_array_length`** — Made `getViewLengthBySourceId` db-type-aware
5. **`data->'key'` returns string on SQLite** — Added JSON.parse for `getSiteSources` and `getViewsByIndexBySourceId`
6. **`JSONB_BUILD_OBJECT` not in SQLite** — Replaced with `jsonMerge()` from query-utils (json_patch)
7. **Column alias casing** — PostgreSQL lowercases aliases (`numRows` → `numrows`); SQLite preserves case. Used lowercase aliases consistently.
