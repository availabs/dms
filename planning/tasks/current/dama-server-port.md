# DAMA Server Port to dms-server

## Status: IN PROGRESS — Phase 0-4, 6 DONE, Phase 5 IN PROGRESS

## Objective

Port the Data Manager (DAMA) server-side infrastructure from the legacy `avail-falcor` codebase into `dms-server`. This covers:

1. A task queue system with ETL context tracking, event logging, and progress polling
2. The GIS/CSV dataset upload-to-publish pipeline (GDAL-based)
3. Multi-database pgEnv routing so one server can host multiple client sites with separate databases
4. Falcor routes for task/event data (currently DAMA-specific, migrating to UDA namespace)
5. A datatype plugin registration system so domain-specific ETL workers live outside dms-server
6. Migration path from legacy DAMA databases

## Background & References

- **Legacy code**: `references/avail-falcor/dama/` (admin, tasks, routes, config)
- **Legacy SQL schemas**: `references/avail-falcor/db_service/sql/dama/`
- **Current system documentation**: `documentation/dama-current-system.md`
- **Research & recommendations**: `research/dama-refactor.md`
- **Existing dms-server**: `packages/dms-server/`
- **Existing upload routes**: `packages/dms-server/src/upload/`
- **Existing UDA routes**: `packages/dms-server/src/routes/uda/`

## Key Design Decisions

### 1. Task queue: keep the hard parts, simplify the plumbing

The legacy system uses pg-boss, detached child processes, host_id-prefixed queue names, and event-locking to prevent duplicate execution. These features exist because:

- Multiple developers run servers against the same database
- Long-running ETL tasks must survive HTTP request timeouts
- Duplicate task execution can corrupt data (e.g., loading the same CSV twice)

**Decision**: Build a task runner that preserves these guarantees but without pg-boss as a dependency. The task system must:

- **Host isolation**: Tasks queued on one server instance are only picked up by that instance (host_id prefix or equivalent)
- **Process isolation**: Heavy ETL tasks (GDAL, ogr2ogr, large CSV parsing) run in worker_threads or child processes so OOM doesn't crash the main server
- **Idempotent execution**: Tasks acquire a lock before modifying the database; if they fail or crash, the database is not left in a partial state. The legacy system achieves this by locking the `:INITIAL` event row with `SELECT ... FOR UPDATE SKIP LOCKED`
- **Event logging**: Tasks dispatch progress events that the client can poll. This is the primary UX for long-running operations
- **Persistence**: Task state lives in the database (not just in-memory) so a server restart can detect stalled tasks and mark them as failed

**What we drop**: pg-boss library and its schema (job/archive/schedule/subscription/version tables). We replace it with our own `tasks` table and runner. The pg-boss abstraction added management overhead without providing much beyond what we need.

**What we keep conceptually**: The queue pattern, host_id scoping, event-based progress tracking, lock-based duplicate prevention, detached execution for heavy work.

### 2. Multi-database pgEnv routing

The current system routes all external dataset operations by `pgEnv` — a named database configuration. One dms-server instance may serve multiple client sites, each pointing to different PostgreSQL databases for their dataset storage.

**Decision**: Support pgEnv routing in the task system and UDA routes. The existing dms-server db config system (`src/db/configs/*.config.json` with `"role": "dama"`) already handles this. UDA's `getEssentials()` already detects DMS vs DAMA mode based on whether `env` contains `+`. The task and upload routes need to accept `pgEnv` and route to the correct database.

### 3. DAMA Falcor routes → UDA extension

The datasets pattern currently calls DAMA-specific Falcor routes for:

**Task/ETL monitoring** (no UDA equivalent — must be added):
- `dama[pgEnv].latest.events.length` / `dama[pgEnv].latest.events[indices][attrs]`
- `dama[pgEnv].latest.events.for.source[sourceId].length` / `...[indices][attrs]`
- `dama[pgEnv].etlContexts.byEtlContextId[id].allEvents.length` / `...[indices][attrs]`
- `dama[pgEnv].etlContexts.byEtlContextId[id].attributes[attrs]`

**Source metadata update** (no UDA equivalent — must be added):
- `dama.sources.metadata.update` (Falcor call)

**View dependency graphs** (used by ExternalVersionControls):
- `dama[pgEnv].viewDependencySubgraphs.byViewId[viewIds]`

**Settings** (per-pgEnv settings for category filtering):
- `dama-info[pgEnv].settings` (GET and SET)

**Data row by ID** (used for map hover tooltips):
- `dama[pgEnv].viewsbyId[viewId].databyId[id][attrs]`

**Decision**: Add these as UDA routes under the existing `uda[env]` namespace rather than porting the `dama[pgEnv]` namespace. This means the datasets pattern client code will need to be updated to call UDA paths, but it keeps one unified data access layer. The `env` parameter already supports both DMS mode (`app+type`) and DAMA mode (plain pgEnv name).

Routes to add to UDA:
- `uda[env].tasks.length` / `uda[env].tasks.byIndex[indices][attrs]`
- `uda[env].tasks.byId[id].events.length` / `...events[indices][attrs]`
- `uda[env].tasks.forSource[sourceId].length` / `...[indices][attrs]`
- `uda[env].sources.byId[id].update` (Falcor call for metadata update)
- `uda[env].settings` (GET/SET for per-env configuration)
- `uda[env].views.byId[id].databyId[rowId][attrs]` (single-row lookup)

### 4. Datatype plugin system

The legacy system auto-discovers datatypes from files in `routes/data_types/{name}/`. Each has `*.routes.js` (REST endpoints) and `*.worker.mjs` (async task worker).

**Decision**: Provide a registration API. dms-server ships with two built-in datatypes (`gis_dataset`, `csv_dataset`) that handle the universal upload flow. All domain-specific datatypes (acs, nri, npmrds, hazmit/*, etc.) register as plugins from the consuming application.

```js
// In dms-site or dms-template:
import { registerDatatype } from '@availabs/dms-server/datatypes';

registerDatatype('nri', {
  routes: (router, { createSource, createView, queueTask }) => {
    router.post('/:pgEnv/nri/publish', async (req, res) => { ... });
  },
  worker: async (task, ctx) => { ... }
});
```

The built-in upload pipeline (upload → analyze → publish) should work for both internal DMS datasets and external PG datasets — the difference is the publish target (data_items split table vs dedicated PG table).

### 5. Migration from legacy DAMA

Old DAMA instances have `data_manager.*` tables plus `pgboss.*` tables with historical task data. We need a migration path that:

- Preserves `sources` and `views` table data (already compatible — dms-server has the same schema)
- Converts `etl_contexts` + `event_store` data into the new `tasks` table format (or at minimum allows read-only access to historical task data)
- Does NOT require pg-boss to be running (the new system replaces it)
- Handles the case where the old database has views pointing to data tables in various schemas (geo, open_fema_data, severe_weather_new, etc.)

**Decision**: Write a migration script that:
1. Creates the new `tasks` table alongside existing `etl_contexts`/`event_store`
2. Backfills `tasks` from `etl_contexts` (mapping status, timestamps, source_id)
3. Keeps `event_store` as read-only historical data (optionally accessible via a `task.events` route)
4. Does not touch `pgboss.*` tables (they become inert without pg-boss running)

This is a non-destructive migration — old tables stay, new table is added.

---

## Database Schema Changes

### New table: `data_manager.tasks`

```sql
-- PostgreSQL
CREATE TABLE IF NOT EXISTS data_manager.tasks (
    task_id             SERIAL PRIMARY KEY,
    host_id             TEXT NOT NULL,           -- server instance that owns this task
    source_id           INTEGER REFERENCES data_manager.sources ON DELETE SET NULL,
    view_id             INTEGER REFERENCES data_manager.views ON DELETE SET NULL,
    type                TEXT NOT NULL,            -- 'gis_dataset:publish', 'csv_dataset:publish', etc.
    status              TEXT NOT NULL DEFAULT 'queued',  -- queued, locked, running, done, error
    progress            INTEGER DEFAULT 0,       -- 0-100
    config              JSONB,                   -- task input parameters (what legacy calls initial_event.payload)
    result              JSONB,                   -- task output (what legacy returns as :FINAL payload)
    error               TEXT,                    -- error message if failed
    worker_path         TEXT,                    -- module path for the worker (plugin system)
    user_id             INTEGER,
    email               TEXT,
    parent_task_id      INTEGER REFERENCES data_manager.tasks ON DELETE SET NULL,
    _created_timestamp  TIMESTAMP NOT NULL DEFAULT NOW(),
    _started_timestamp  TIMESTAMP,
    _completed_timestamp TIMESTAMP,
    _modified_timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_host_status ON data_manager.tasks (host_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON data_manager.tasks (source_id);
```

```sql
-- SQLite
CREATE TABLE IF NOT EXISTS tasks (
    task_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id             TEXT NOT NULL,
    source_id           INTEGER REFERENCES sources (source_id) ON DELETE SET NULL,
    view_id             INTEGER REFERENCES views (view_id) ON DELETE SET NULL,
    type                TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'queued',
    progress            INTEGER DEFAULT 0,
    config              TEXT,
    result              TEXT,
    error               TEXT,
    worker_path         TEXT,
    user_id             INTEGER,
    email               TEXT,
    parent_task_id      INTEGER REFERENCES tasks (task_id) ON DELETE SET NULL,
    _created_timestamp  TEXT DEFAULT (datetime('now')),
    _started_timestamp  TEXT,
    _completed_timestamp TEXT,
    _modified_timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_host_status ON tasks (host_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks (source_id);
```

### New table: `data_manager.task_events`

Lightweight event log for task progress. Replaces `event_store` but much simpler.

```sql
-- PostgreSQL
CREATE TABLE IF NOT EXISTS data_manager.task_events (
    event_id            SERIAL PRIMARY KEY,
    task_id             INTEGER NOT NULL REFERENCES data_manager.tasks ON DELETE CASCADE,
    type                TEXT NOT NULL,           -- 'progress', 'log', 'error', 'milestone'
    message             TEXT,
    payload             JSONB,
    _created_timestamp  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task ON data_manager.task_events (task_id);
```

```sql
-- SQLite
CREATE TABLE IF NOT EXISTS task_events (
    event_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id             INTEGER NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    type                TEXT NOT NULL,
    message             TEXT,
    payload             TEXT,
    _created_timestamp  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events (task_id);
```

### Settings table

```sql
-- PostgreSQL
CREATE TABLE IF NOT EXISTS data_manager.settings (
    key                 TEXT PRIMARY KEY,
    value               JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

### Existing tables unchanged

`data_manager.sources` and `data_manager.views` already exist in dms-server with the correct schema. No changes needed.

---

## Implementation Phases

### Phase 0: Task system foundation — DONE

**Files created:**
- `src/tasks/host-id.js` — Host ID generation and persistence (UUID in `var/dama_host_id`)
- `src/tasks/index.js` — Task runner: `queueTask()`, `claimNextTask()`, `startTaskWorker()`, `dispatchEvent()`, `getTaskStatus()`, `getTaskEvents()`, `recoverStalledTasks()`, `startPolling()`/`stopPolling()`, `registerHandler()`
- `src/db/sql/dama/create_dama_task_tables.sql` — PG schema for `data_manager.tasks` + `data_manager.task_events`
- `src/db/sql/dama/create_dama_task_tables.sqlite.sql` — SQLite equivalents
- `tests/test-tasks.js` — 15 integration tests

**Files modified:**
- `src/db/index.js` — Added `initDamaTasks()` called after `initDama()` for dama-role databases
- `src/index.js` — Task system startup (recover stalled + start polling) gated on `DAMA_DB_ENV` env var
- `package.json` — Added `test:tasks` script
- `.gitignore` — Added `**/var/` for host ID file

**Key implementation details:**
- PG locking: atomic `UPDATE ... WHERE task_id = (SELECT ... FOR UPDATE SKIP LOCKED)` — no transaction wrapper needed
- SQLite locking: `BEGIN IMMEDIATE` via direct `db.getPool().exec()` call, then SELECT + UPDATE + COMMIT
- Phase 0 implements `async` worker mode only (in-process). `thread` and `fork` modes for Phase 2
- Task tables initialized as part of `dama` role (no separate role needed)
- Server integration opt-in via `DAMA_DB_ENV` env var — existing DMS-only servers unaffected
- 15 tests: queue, claim, host isolation, FIFO order, full lifecycle (success + failure), unregistered handler, event dispatch, sinceEventId filtering, stall recovery, cross-host isolation

### Phase 1: UDA task/event routes — DONE

**Files created:**
- `src/routes/uda/uda.tasks.route.js` — Falcor route definitions for tasks, events, settings, source update (auto-discovered by `routes/index.js`)
- `src/routes/uda/uda.tasks.controller.js` — Query functions: getTasksLength, getTaskIdsByIndex, getTaskById, getTasksForSourceLength/ByIndex, getTaskEventsLength/ByIndex, getSettings, setSettings, updateSourceMetadata

**SQL schemas modified:**
- `create_dama_task_tables.sql` — Added `data_manager.settings` table (key/value JSONB)
- `create_dama_task_tables.sqlite.sql` — Added `settings` table (key/value TEXT)

**Routes implemented:**
- `uda[env].tasks.length` / `.byIndex` / `.byId[id][attrs]` — Task listing and detail
- `uda[env].tasks.forSource[sourceId].length` / `.byIndex` — Per-source task filtering
- `uda[env].tasks.byId[id].events.length` / `.events.byIndex[indices][attrs]` — Task event listing
- `uda[env].settings` — GET/SET for per-env settings (category filters, etc.)
- `uda.sources.update` — CALL route for source metadata updates

**Note:** `uda[env].views.byId[id].databyId[rowId][attrs]` already exists in `uda.route.js` — no new route needed.

**Tests added:** 7 Falcor-level tests in `test-tasks.js` (22 total):
- tasks.length, byId, byIndex, forSource, events length+byIndex, settings round-trip, sources.update call

### Phase 2: GIS + CSV dataset upload pipeline — DONE

**Files created (8):**
- `src/upload/gdal.js` — GDAL availability detection (try/catch `require('gdal-async')`)
- `src/upload/analysis.js` — Layer analysis + table descriptor generation (`analyzeLayer`, `generateTableDescriptor`, `toSnakeCase`)
- `src/upload/metadata.js` — Source/view creation (`createDamaSource`, `createDamaView`, `ensureSchema`); all views go to `gis_datasets` schema with table name `s{source_id}_v{view_id}`
- `src/upload/gis-routes.js` — 8 route handlers: `layerNames`, `startLayerAnalysis`, `getLayerAnalysis`, `getTableDescriptor`, `gisPublish`, `csvPublish`, `eventsQuery` (compat shim), `gisGuard` (501 middleware)
- `src/upload/processors/gis.js` — GIS file processor using GDAL (`canHandle`, `analyze` for .shp/.gpkg/.geojson/.json)
- `src/upload/workers/gis-publish.js` — ogr2ogr worker: creates source/view, generates temp→final table SQL, spawns ogr2ogr with `-F PostgreSQL -t_srs EPSG:4326 -preserve_fid -doo PRELUDE/CLOSING --config PG_USE_COPY YES`
- `src/upload/workers/csv-publish.js` — pg-copy-streams worker: creates source/view, streams CSV via COPY, adds ogc_fid PRIMARY KEY
- `src/upload/workers/analysis.js` — Layer analysis task worker, caches results to disk
- `src/upload/workers/index.js` — Conditional worker registration (GDAL for GIS, pg for CSV)
- `tests/test-upload-pipeline.js` — 12 integration tests

**Files modified (5):**
- `src/upload/index.js` — Registered 7 new routes (layerNames, layerAnalysis GET/POST, tableDescriptor, gis/csv publish, events/query)
- `src/upload/routes.js` — Extended `findDataFile()` with GIS extensions (.shp, .gpkg, .geojson, .json)
- `src/upload/processors/index.js` — Added GIS processor to registry
- `src/index.js` — Worker registration before task polling
- `package.json` — Added optional deps (gdal-async, pg-copy-streams, split2), `test:upload` script

**REST endpoints added (7, all at `/dama-admin/`):**
- `GET /:pgEnv/gis-dataset/:fileId/layerNames`
- `POST /:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis` (GDAL required)
- `GET /:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis`
- `GET /:pgEnv/staged-geospatial-dataset/:fileId/:layerName/tableDescriptor`
- `POST /:pgEnv/gis-dataset/publish` (GDAL required)
- `POST /:pgEnv/csv-dataset/publish`
- `GET /:pgEnv/events/query` (compat shim: maps etl_context_id→task_id, returns legacy event format)

**Key decisions:**
- GDAL is optional via `optionalDependencies`; GIS routes return 501 without it
- All data tables go into `gis_datasets` schema
- Event compat shim preserves legacy client polling (`etl_context_id` maps to `task_id`, events returned with legacy field names)
- Table naming: `s{source_id}_v{view_id}` (simpler than legacy `_data_manager_admin.dama_view_name()`)
- Workers dispatch events with exact legacy type strings (`upload:FINAL`, `analysis:FINAL`, `gis-dataset:FINAL`, `csv-dataset:FINAL`) for client compatibility

**Tests:** 12 upload pipeline tests + 22 task tests + all existing tests pass

### Phase 3: File storage service + downloads + file upload — DONE

**Files created (8):**
- `src/storage/index.js` — Storage facade (reads env vars, selects local or S3 backend)
- `src/storage/local.js` — Local disk backend (write/read/remove/getUrl/exists)
- `src/storage/s3.js` — S3-compatible backend (@aws-sdk/client-s3, works with MinIO/R2/etc.)
- `src/upload/sharp.js` — Sharp availability detection (image processing optional)
- `src/upload/download-routes.js` — create-download (queues task) + delete-download (sync, clears files + metadata)
- `src/upload/workers/create-download.js` — ogr2ogr export worker: CSV/Shapefile/GeoJSON/GPKG with optional groupedByColumn, writes to storage, updates view metadata
- `src/upload/file-upload-route.js` — Generic file upload: busboy parsing, optional Sharp image processing (resize >1400px, convert to AVIF), writes to storage, creates source+view
- `tests/test-storage.js` — 13 tests (local backend CRUD, facade API, stream support, directory ops, Sharp detection)

**Files modified (4):**
- `src/upload/index.js` — Registered 3 new routes (create-download, delete-download, file_upload)
- `src/upload/workers/index.js` — Registered `gis/create-download` handler
- `src/index.js` — Mounted `express.static` at `/files/` for local storage mode (before JWT middleware)
- `package.json` — Added `@aws-sdk/client-s3`, `sharp` to optionalDependencies, `test:storage` script

**Storage configuration (env vars):**
- `DMS_STORAGE_TYPE` = `local` (default) | `s3`
- `DAMA_SERVER_FILESTORAGE_PATH` = local root (default: `var/dama-files`)
- `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_STORAGE_BUCKET`, `AWS_BUCKET_URL`, `AWS_DEFAULT_REGION`

**REST endpoints added (3):**
- `POST /dama-admin/:pgEnv/gis-dataset/create-download` (GDAL required)
- `DELETE /dama-admin/:pgEnv/gis-dataset/delete-download`
- `POST /dama-admin/:pgEnv/file_upload`

**PMTiles (cache-pmtiles) deferred to Phase 4** — requires Tippecanoe, will be a plugin.

**Tests:** 13 storage + 12 upload + 22 task + all existing tests pass

### Phase 4: Datatype plugin system + PMTiles — DONE

**Files created (3):**
- `src/datatypes/index.js` — Plugin registry: `registerDatatype(name, { workers, routes })`, `mountDatatypeRoutes(app, helpers)`, `getDatatypes()`
- `src/datatypes/pmtiles.js` — PMTiles plugin: `pmtiles/generate` worker (PG → GeoJSON stream → gzip → Tippecanoe → PMTiles → storage), `POST /cache-pmtiles` route, default MapBox GL styles per geometry type
- `tests/test-datatypes.js` — 9 tests

**Files modified (2):**
- `src/index.js` — Registers PMTiles plugin, mounts plugin routes with helpers object (`queueTask`, `createDamaSource`, `createDamaView`, `ensureSchema`, `getDb`, `loadConfig`, `storage`, etc.)
- `package.json` — Added `test:datatypes` script

**Plugin API:**
```js
registerDatatype('my-type', {
  workers: { 'my-type/run': async (ctx) => { ... } },
  routes: (router, helpers) => { router.post('/publish', ...); }
});
```
- Workers registered immediately via task system's `registerHandler()`
- Routes mounted at `/dama-admin/:pgEnv/{datatypeName}/` via Express Router
- Helpers provide full access to task system, metadata creation, storage, database

**PMTiles worker flow:**
1. Queries PostGIS view → streams GeoJSON features (batched, gzipped)
2. Spawns `tippecanoe` with `--no-feature-limit --no-tile-size-limit --generate-ids -r1`
3. Stores output via storage service at `tiles/{tilesetName}.pmtiles`
4. Updates view metadata with MapBox GL tiles config (sources + layers with default styles)
5. Requires: Tippecanoe on PATH, PostgreSQL with PostGIS

**Tests:** 9 datatype tests (registration, worker execution, route mounting, helper passing, failure propagation, PMTiles plugin registration)

### Phase 5: Client-side migration (datasets pattern) — IN PROGRESS

Update the datasets pattern to use UDA task routes instead of DAMA Falcor routes, AND simplify the GIS create flow to use the task system directly instead of the legacy event polling pattern.

**Completed so far:**
- [x] `SettingsPage.jsx` — `dama-info` → `uda` for settings GET/SET
- [x] `DatasetsList/index.jsx` — `dama-info` → `uda` for settings GET
- [x] `Layer2.jsx` — `dama[pgEnv].viewsbyId` → `uda[pgEnv].viewsById` for hover tooltip + cache read; `dama.sources.metadata.update` → `uda.sources.update` for symbology save

**Remaining:**
- [ ] `TaskList.jsx` — Replace `dama_falcor` → `falcor`, remap `dama[pgEnv].latest.events.*` → `uda[pgEnv].tasks.*`, update attribute list
- [ ] `TaskPage.jsx` — Remap `dama[pgEnv].etlContexts.*` → `uda[pgEnv].tasks.*`, update event attributes
- [ ] `ExternalVersionControls.jsx` — Update REST URLs (`DAMA_HOST` → `API_HOST`), rewrite ETL polling to UDA task polling, update pmtiles route path
- [ ] `Create/` (GIS wizard) — Simplify state machine: drop etlContextId/analysisContextId, poll tasks via Falcor instead of REST events
- [ ] `siteConfig.jsx` + `dmsPageFactory.jsx` — Remove `dama_falcor` and `DAMA_HOST`
- [ ] Server cleanup: remove `/events/query` compat shim, deprecate `newContextId`

**Files to modify:**
- `patterns/datasets/pages/Tasks/TaskList.jsx` — Replace `dama_falcor` calls with UDA task routes
- `patterns/datasets/pages/Tasks/TaskPage.jsx` — Replace ETL context calls with UDA task event routes
- `patterns/datasets/components/ExternalVersionControls.jsx` — Replace ETL polling with UDA task polling
- `patterns/datasets/pages/DatasetsList/index.jsx` — Replace `dama-info` settings with UDA settings route
- `patterns/datasets/pages/SettingsPage.jsx` — Replace `dama-info` settings with UDA settings route
- `patterns/datasets/pages/dataTypes/gis_dataset/pages/Map/Layer2.jsx` — Replace `dama` data route with UDA view data route
- `patterns/datasets/pages/dataTypes/gis_dataset/pages/Create/` — **Major refactor** (see below)

**Key mapping (Falcor routes):**

| Old (DAMA) | New (UDA) |
|------------|-----------|
| `dama[pgEnv].latest.events.*` | `uda[pgEnv].tasks.*` |
| `dama[pgEnv].etlContexts.byEtlContextId[id].*` | `uda[pgEnv].tasks.byId[id].*` |
| `dama[pgEnv].sources.byId[id].*` | `uda[pgEnv].sources.byId[id].*` (already exists) |
| `dama-info[pgEnv].settings` | `uda[pgEnv].settings` |
| `dama[pgEnv].viewsbyId[id].databyId[rowId][attrs]` | `uda[pgEnv].views.byId[id].databyId[rowId][attrs]` |
| `dama.sources.metadata.update` | `uda.sources.update` |

**GIS create flow simplification:**

The legacy flow uses a complex multi-context-id state machine:
1. `GET /etl/new-context-id` → etlContextId (counter)
2. Upload sends `etlContextId` as form field
3. Polls `GET /events/query?etl_context_id=etlContextId` for `upload:FINAL`
4. Analysis POST returns separate `analysisContextId`
5. Polls `GET /events/query?etl_context_id=analysisContextId` for `analysis:FINAL`
6. Publish returns yet another `etl_context_id`

**Simplified flow** (no backward compat needed):
1. `POST /gis-dataset/upload` returns `{ id: uploadId, task_id }` — upload IS the task
2. Client polls `uda[env].tasks.byId[task_id].status` via Falcor for upload progress
3. `POST /layerAnalysis` returns `{ task_id }` — client polls same UDA route
4. `POST /gis-dataset/publish` returns `{ task_id, source_id }` — client polls same UDA route
5. No `/events/query` REST endpoint needed
6. No `new-context-id` needed
7. No `etlContextId` / `analysisContextId` separate tracking

This collapses the state machine from 3 context IDs + 2 polling loops + REST shim to: each step returns `task_id`, poll one UDA route.

**Also update:**
- `dama_falcor` import → use standard `falcor` (UDA routes go through the same Falcor endpoint)
- Drop `DAMA_HOST` config — use `API_HOST` for everything (dms-server handles all routes)
- `damaServerPath` construction can stay as `${API_HOST}/dama-admin/${pgEnv}` since the REST routes use that prefix
- Remove the `/events/query` compat shim from Phase 2 once client migration is complete

### Phase 6: Legacy DAMA in-place migration script — DONE

**Files created (2):**
- `src/scripts/migrate-dama-tasks.js` — In-place migration: creates `tasks`/`task_events` tables alongside existing `etl_contexts`/`event_store`, backfills via `INSERT ... SELECT ... ON CONFLICT DO NOTHING`. Old tables untouched.
- `tests/test-migrate-dama.js` — 23 tests on seeded SQLite

**CLI:** `node migrate-dama-tasks.js --source <config> [--apply] [--events]`

**What it does (all additive, non-destructive):**
1. Ensures task tables exist (idempotent DDL)
2. Backfills `tasks` from `etl_contexts`: preserves IDs, maps status (DONE→done, ERROR→error, OPEN→running, NULL→queued), extracts worker_path from event meta, maps timestamps from INITIAL/FINAL events
3. Optionally backfills milestone events (`:INITIAL`, `:FINAL`, `:ERROR`) into `task_events` — skips 12M progress noise rows
4. Handles legacy settings table schema conflict (old single-row → rename to `settings_legacy`, create new key/value table)
5. Resets PG sequences past max migrated IDs

**Dry-run against hazmit_dama verified:**
- 9,021 etl_contexts → tasks (4,483 done, 2,986 queued, 1,214 running, 338 error)
- Old settings table detected, schema migration planned
- No writes in dry-run mode

**Tests:** 23 passing (status mapping, timestamp mapping, worker_path extraction, idempotency, event backfill, old tables untouched)

---

## What's NOT in scope

- **Porting domain-specific datatypes** (acs, nri, npmrds, hazmit/*, etc.) — these become plugins registered by consuming applications, not part of dms-server
- **Collections and symbologies tables** — these can be modeled as DMS content if needed later
- **The `_data_manager_admin` schema views** — most are unused admin tools. `table_column_types` may be ported selectively if needed for schema introspection
- **The `database_id` immutable table** — dms-server doesn't need cross-database global IDs
- **Tile serving routes** — out of scope for this task (separate concern)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GDAL native compilation issues on deploy | Medium | High | Make GDAL optional; GIS routes return 501 without it |
| Task locking edge cases (SQLite vs PG) | Medium | Medium | Thorough testing on both databases; SQLite is simpler (single-writer) |
| Legacy event format differences | Medium | Medium | Compat shim for `/events/query`; old clients work until migrated |
| Multi-pgEnv connection pooling | Low | Medium | Use existing dms-server `getDb()` which already handles this |
| Large dataset upload OOM | Medium | Medium | Worker threads with configurable `--max-old-space-size`; streaming where possible |
| Plugin API design churn | Medium | Low | Start with gis_dataset + csv_dataset; validate API before documenting |

## Dependencies

- Phase 1 depends on Phase 0 (task routes need task table)
- Phase 2 depends on Phase 0 (GIS publish uses task runner)
- Phase 3 depends on Phase 0 + 2 (downloads/pmtiles use task runner and GIS infrastructure)
- Phase 4 depends on Phase 0 + 2 (plugin system wraps existing built-in datatypes)
- Phase 5 depends on Phase 1 (client needs UDA task routes)
- Phase 6 is independent (migration script, can be developed in parallel)

Phases 0+1 are the foundation. Phase 2 is the bulk of the work. Phases 3-6 can be sequenced flexibly.

## Testing Checklist

- [ ] Task queue: create, lock, run, complete, error lifecycle
- [ ] Task queue: host isolation (tasks for host A not picked up by host B)
- [ ] Task queue: duplicate prevention (same task not run twice)
- [ ] Task queue: crash recovery (stalled tasks detected on restart)
- [ ] Task events: dispatch, query, pagination
- [ ] UDA task routes: list, filter by source, get events
- [ ] UDA settings: get and set per-env
- [ ] UDA source update: metadata update call
- [ ] UDA view data: single-row lookup
- [ ] GIS upload: file upload, layer discovery, schema analysis
- [ ] GIS publish: source + view creation, ogr2ogr loading
- [ ] CSV publish: source + view creation, COPY loading
- [ ] Event polling: client receives progress updates
- [ ] Plugin registration: custom datatype routes and workers
- [ ] Migration script: etl_contexts → tasks conversion
- [ ] Migration script: idempotent re-run
- [ ] Client: TaskList renders from UDA routes
- [ ] Client: TaskPage shows events from UDA routes
- [ ] Client: upload progress polling works through new system
- [ ] Client: settings page reads/writes via UDA
- [ ] Multi-pgEnv: two different databases accessible from one server
- [ ] SQLite + PostgreSQL: all phases tested on both
