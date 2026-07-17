# csv_dataset publish → ClickHouse / Postgres / both target

**Library sub-task of** `planning/transportny/tasks/current/build-route-comparison-page.md`
(Task 1a). Enhance the DMS dataset upload/publish pipeline so a `csv_dataset` can be
materialized into **ClickHouse**, **Postgres**, or **both** on create — properly registered as
a DaMa source/view in a pgEnv. Driven by the Route Comparison page's need for a CH-side
`route_tmc` table joinable to the CH speed views (CH↔PG joins are impossible).

Decision (Alex, 2026-07-17): **build the full enhancement** (server + `/capabilities` probe +
Create-wizard target selector + `both`). BC: default `target='pg'` = today's behavior.

## Key facts (from the scope investigation)
- **Engine marker** = `data_manager.views.table_schema` prefix `clickhouse.<db>`. No engine
  column. Read path already routes on it: `routes/uda/utils.js:210-217 getEssentials` →
  `getChDb(env)` → `query_sets/clickhouse.js`. **A new CH view works for reads for free** once
  `table_schema='clickhouse.avail'` AND it has a **UInt64 `id`** column (`query_sets/clickhouse.js`
  `dataById` requires `id IN {ids:Array(UInt64)}`).
- **CH write path is net-new.** `db/adapters/clickhouse.js` `ClickHouseAdapter.exec()` exists
  but is unused; no CH DDL/insert anywhere. `getChDb(pgEnv)` (`db/index.js:554-564`) throws if
  no `config.clickhouse`.
- **CH detection** = `!!loadConfig(pgEnv).clickhouse` (`db/configs/{pgEnv}.config.json`; only
  npmrds2 has it today → neptune:8123 / db `avail`).
- **`both`** = two views under one source (one `table_schema` per view). Convention: PG view is
  the default/primary; the CH view is the alternate. Document it; route_tmc itself is CH-only so
  this path isn't exercised by the page build.

## Files to change
1. `dms-server/src/dama/upload/index.js` — mount `GET /dama-admin/:pgEnv/capabilities`.
2. `dms-server/src/dama/upload/gis-routes.js` — `csvPublish` (~:221): read+validate `target`
   against `loadConfig(pgEnv).clickhouse`; pass through descriptor.
3. `dms-server/src/dama/upload/workers/csv-publish.js` — replace PG guard (:16) with `target`
   dispatch; add CH create+insert; stamp view `table_schema='clickhouse.<db>'`; `both` = both + 2 views.
4. `dms-server/src/dama/upload/metadata.js` — `createDamaView` accept optional `table_schema`.
5. `dms-server/src/dama/upload/ch-types.js` — NEW: PG→CH type map (+ Nullable policy).
6. `packages/dms/src/patterns/datasets/.../Create/publish/index.jsx` (+ wizard reducer) — fetch
   `/capabilities`, conditional pg/ch/both selector, send `target` on publish body.

## Verify
- dms-server build/lint green; default publish (no target) still lands PG (BC).
- Publish a tiny CSV to npmrds2 `target=ch` → view row `table_schema='clickhouse.avail'`, CH
  table exists with UInt64 `id`, a Spreadsheet bound to it renders (read path).
- PG-only env rejects `target=ch` with a clear 400.
- `both` → two views under one source; both render.

## Status
- [ ] Not started (implementing now, 2026-07-17). No git/commits (Alex owns).
