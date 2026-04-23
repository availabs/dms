# UDA ClickHouse Support (DAMA auxiliary pgEnv)

## Status: DONE — all checklist items verified against npmrds2

## Objective

Add ClickHouse support to dms-server's UDA layer so a DAMA `pgEnv` can route queries to either PostgreSQL or ClickHouse on a per-view basis. Very large static datasets (NPMRDS-style) have a much better performance profile on ClickHouse; some views should live there while the rest of DAMA stays in Postgres.

The scope is **auxiliary storage only**. The `data_manager` schema (including `sources` and `views` metadata tables) and all DMS content (`data_items`, patterns, sources, views rows) stay in PostgreSQL/SQLite. ClickHouse is a target for dataset *rows* that a view points at via `data_manager.views.table_schema` / `table_name`.

## Reference Implementation

`references/avail-falcor/` is the working reference. Key files:

| File | Role |
|------|------|
| `db_service/clickhouse.js` | `@clickhouse/client` wrapper — `getChDb(pgEnv)`, `chQuery`, `chExec`, `chInsert`, `chInsertFromFile`. Reads a `clickhouse` sub-object from the pgEnv config JSON. |
| `db_service/pgEnvs.js` | Exports both Postgres `getDb()` and ClickHouse `getChDb()` side by side from the same pgEnv config files |
| `routes/udaController.js` | Legacy UDA controller. Calls `getEssentials({ env, view_id, options })` to resolve db + db type, then dispatches to `querySets[dbType].XXX(...)` |
| `routes/uda_query_sets/index.js` | `{ pg: require('./postgres'), ch: require('./clickhouse') }` |
| `routes/uda_query_sets/postgres.js` / `clickhouse.js` | Parallel `simpleFilterLengthQuery`, `simpleFilterQuery`, `dataById` implementations |
| `routes/uda_query_sets/helpers.js` | `getViewDbType`, `getEssentials`, `handleFiltersCH`, `getClickhouseQueryParams` |

A view is routed to ClickHouse when its `data_manager.views.table_schema` is prefixed with `clickhouse.` (e.g., `clickhouse.npmrds`). The prefix is stripped before being inlined into SQL; the same prefix is the only signal that drives the dispatch and the db swap.

## Scope

**IN scope (this task)**
- ClickHouse adapter for UDA **read** queries on DAMA-mode views whose `table_schema` is prefixed `clickhouse.`
- Per-pgEnv ClickHouse connection, keyed off the same config file as the pgEnv's Postgres connection
- Dispatch of `simpleFilterLength`, `simpleFilter`, `dataById` to a CH-specific query set when the view lives in ClickHouse
- CH adapter cache parallel to the Postgres adapter cache in `src/db/index.js`

**OUT of scope**
- Storing `data_manager.sources` / `data_manager.views` / dama metadata on ClickHouse
- Storing DMS content (`dms.data_items`, split tables, sync) on ClickHouse
- UDA write paths to ClickHouse (CH data is populated by out-of-band ingestion)
- DMS-mode (`env.includes('+')`) CH support — DMS rows are never on CH
- SQLite parity

## Implementation

### Files added

| File | Purpose |
|------|---------|
| `packages/dms-server/src/db/adapters/clickhouse.js` | `ClickHouseAdapter` over `@clickhouse/client`. `query/exec/end` passthrough. |
| `packages/dms-server/src/routes/uda/query_sets/index.js` | `{ pg, ch }` barrel |
| `packages/dms-server/src/routes/uda/query_sets/postgres.js` | Extracted `simpleFilterLength`, `simpleFilter`, `dataById` from `uda.controller.js` (still exports `translatePgToSqlite` for the controller). |
| `packages/dms-server/src/routes/uda/query_sets/clickhouse.js` | CH versions of the three data-query functions, ported from avail-falcor (DAMA-only paths) |
| `packages/dms-server/src/routes/uda/query_sets/helpers.js` | `handleFiltersCH`, `getClickhouseQueryParams`, `handleGroupByCH/HavingCH/OrderByCH` |
| `packages/dms-server/src/db/configs/npmrds2.config.json` | DAMA pgEnv config with `clickhouse` sub-object — for live testing against neptune.availabs.org |

### Files modified

| File | Change |
|------|--------|
| `packages/dms-server/package.json` | Add `@clickhouse/client` to optionalDependencies (^1.18.3 installed) |
| `packages/dms-server/src/db/index.js` | Import `ClickHouseAdapter`; add `clickhouseDatabases` cache + `getChDb(pgEnv)` factory; export `getChDb` |
| `packages/dms-server/src/routes/uda/utils.js` | `let db` instead of `const`; in `getEssentials` DAMA branch, when `table_schema` starts with `clickhouse.` strip the prefix and swap `db = getChDb(env)`; both branches now return a `dbType` field (`'pg'` or `'ch'`). DMS branch is hard-pinned to `'pg'`. |
| `packages/dms-server/src/routes/uda/uda.controller.js` | Removed inline data-query logic + `translatePgToSqlite`. `simpleFilterLength`, `simpleFilter`, `dataById` are now thin dispatchers: `querySets[ctx.dbType].XXX(ctx, ...)`. Source/view metadata functions are unchanged (always PG). Meta lookups still re-enter `simpleFilter`, so cross-DB meta dispatches naturally. |

### Dispatch flow

```
Falcor route
  ↓
uda.controller.simpleFilter(env, view_id, options, attrs, indices)
  ↓
getEssentials({ env, view_id, options })   ← reads data_manager.views.table_schema
  ↓ ctx = { db, table_schema, table_name, dbType, ... }
querySets[ctx.dbType].simpleFilter(ctx, options, attrs, indices)
  ↓
postgres.js (PG/SQLite SQL)   OR   clickhouse.js (CH SQL via { query, query_params, format })
```

### Adapter shape

`ClickHouseAdapter` is a passthrough — its `query()` forwards `{ query, query_params, format }` to `@clickhouse/client` and lets the CH query set call `.json()` on the result. We deliberately do not coerce the response into the `{ rows }` shape used by Postgres/SQLite adapters because the CH query set is built around the upstream library's native shape.

## Testing Checklist

- [x] `npm install @clickhouse/client` succeeds (resolved to ^1.18.3, listed under optionalDependencies)
- [x] `getChDb(pgEnv)` returns a cached adapter; throws "No clickhouse config for pgEnv" when the pgEnv has no `clickhouse` sub-object
- [x] `getEssentials` returns `dbType: 'pg'` for PG-backed views and `dbType: 'ch'` (with stripped schema and CH adapter) for `clickhouse.`-prefixed views
- [x] `getEssentials` in DMS mode always returns `dbType: 'pg'` regardless of any other inputs
- [x] Controller compiles clean (`require('./uda.controller')` exports the expected surface)
- [x] Existing PG/SQLite UDA tests pass — pre-existing test failure on master (`Expected 2 sources, got 0`) confirmed not introduced by this change (verified by running tests against the unmodified tree)
- [x] Live smoke test against npmrds2:
  - `simpleFilterLength('npmrds2', 3113, {filter:{state:['NY']}})` → 52,023 rows (CH dispatch)
  - `simpleFilter` returned three real TMC rows for NY
  - View 121 (`gis_datasets` schema, no CH prefix) still returns through the PG query set (34,254 rows)
- [x] Cross-DB meta lookup verified against npmrds2: main query on CH view 3113 with meta lookup on PG view 121 (`gis_datasets.s103_v121_pm_3_others`). The `tmc` column was rewritten from TMC codes (`120P07026`) to their PG-sourced AADT values (`19973`, `44907`, `41240`) — proving the recursion dispatches to the PG query set even though the outer query dispatched to CH.
- [x] Documented in `packages/dms-server/CLAUDE.md` (new "ClickHouse auxiliary storage" subsection under Database Configs): config shape, `clickhouse.` prefix convention, dispatch flow, scope, dependency.
- [x] Confirm `npmrds2.config.json` is gitignored — covered by existing `src/db/configs/.gitignore` (`*.config.json` rule with `.example.` and `-test.` exceptions)

## Operational Notes

- The npmrds2 config file (`src/db/configs/npmrds2.config.json`) contains real credentials for neptune.availabs.org. The existing `src/db/configs/.gitignore` ignores `*.config.json` (with exceptions for `*.example.config.json` and `*-test*.config.json`), so this file is already untracked locally and will not be committed. New deployments need their own copy.
- ClickHouse driver is in `optionalDependencies`, matching the pattern for `pg` — installations that don't need CH won't be blocked by the dep failing to install.
