# DAMA Server Port to dms-server

## Status: IN PROGRESS — Phase 0-4, 6 DONE, Phase 5 ~60%

All server-side infrastructure is complete. The GIS upload pipeline is working end-to-end on npmrds2. The remaining work is finishing the client-side migration (Phase 5) and production testing.

## Current State (as of 2026-04-15)

### What's Working

- **GIS upload → publish** end-to-end through dms-server (tested with GeoPackage on npmrds2)
  - Upload with ZIP extraction + GDAL analysis (ogrinfo for CSV type detection, gdal-async for GIS)
  - Schema editor with user-editable column names/types (user input honored through publish)
  - ogr2ogr loading: temp table (SELECT *) → final table with controlled schema (`ogc_fid` PK, `wkb_geometry`, snake_case columns from tableDescriptor)
  - Source metadata (columns with display_name from analysis) and view metadata (tiles config) auto-set
  - Worker runs in `child_process.fork()`, logs to `task_events`, uses `execFileSync` for ogr2ogr
- **Dynamic MVT tile serving** at `/dama-admin/:pgEnv/tiles/:view_id/{z}/{x}/{y}/t.pbf`
- **Task system** with host isolation, per-pgEnv polling, forked workers, event logging
- **Task pages** — new UDA-based pages at `/tasks-new` and `/task-new/:task_id`, plus per-source task list on admin page
- **Multi-pgEnv** — auto-discovers all dama-role configs on startup, recovers stalled tasks + polls each
- **Migration script** — ran in-place on npmrds2 (4,806 tasks + 7,844 events migrated)
- **Docker** — Dockerfile with GDAL, Sharp, build tools, tested and working
- **Storage service** — local disk + S3 abstraction
- **Plugin system** — `registerDatatype()` API with PMTiles as first plugin

### File Structure

All DAMA code moved under `src/dama/`:
```
src/dama/
  datatypes/     — Plugin registry + PMTiles
  storage/       — Local disk + S3
  tasks/         — Task queue, host ID, worker runner
  tiles/         — MVT tile serving (tiles.rest.js — not auto-discovered by Falcor)
  upload/        — Upload pipeline, analysis, metadata, workers, processors
```

### Key Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `DAMA_SERVER_URL` | Public URL for tile metadata | (relative paths) |
| `DMS_STORAGE_TYPE` | `local` or `s3` | `local` |
| `DAMA_SERVER_FILESTORAGE_PATH` | Local file storage root | `var/dama-files` |
| `DAMA_ETL_DIR` | Upload temp directory | `var/tmp-etl` |
| `DAMA_TASK_POLL_INTERVAL` | Task polling interval (ms) | `5000` |
| `AWS_*` | S3 credentials when `DMS_STORAGE_TYPE=s3` | — |
| `VITE_DAMA_HOST` | Client: DAMA server URL | falls back to `VITE_API_HOST` |

### Tests

| Suite | Count | Status |
|-------|-------|--------|
| Task system | 22 | Pass |
| Upload pipeline | 12 | Pass |
| Storage | 13 | Pass |
| Datatypes | 9 | Pass |
| Migration | 23 | Pass |
| Core (sqlite, controller, graph, workflow) | All | Pass |

### Bugs Fixed During Testing

- Upload store → forked process: `dataFilePath` passed in task descriptor (in-memory store not accessible from child)
- `etl_context_id` FK conflict: views don't set `etl_context_id` (FK to legacy `etl_contexts`); `task_id` in metadata instead
- Source name dedup: appends `_2`, `_3` on unique constraint violation
- Geometry column: ogr2ogr names it per-format (`geom`, `wkb_geometry`), copy step discovers and remaps to `wkb_geometry`
- FID column: GeoPackage uses `fid` not `ogc_fid`, copy step discovers and remaps
- Column name case: ogr2ogr lowercases, copy step matches by lowercasing `tableDescriptor.key`
- `-sql SELECT *` needed (not explicit column SELECT) so ogr2ogr includes geometry
- Settings schema: controller handles both old (single-row `settings` column) and new (`key/value`) schemas
- `execFileSync` for ogr2ogr in forked processes (async spawn/execFile don't fire events in fork)
- Auth refresh redirect: `AuthProvider` initializes `authed: true` from localStorage token
- nodemon restart on file write: `--ignore var/` in dev script
- Per-pgEnv polling: `queueTask` auto-starts polling for the target pgEnv
- Worker/plugin registration moved outside `DAMA_DB_ENV` gate (always available)
- `buildEnvsForListing`: strip `|source` suffix from `format.type` to get pattern instance for UDA lookup

---

## Phase 5: Client Migration — Remaining Work

### Done

- [x] `SettingsPage.jsx` — `dama-info` → `uda` settings GET/SET
- [x] `DatasetsList/index.jsx` — `dama-info` → `uda` settings GET; `buildEnvsForListing` uses pattern instance
- [x] `Layer2.jsx` — hover tooltip + symbology save → UDA routes
- [x] `UdaTaskList.jsx` / `UdaTaskPage.jsx` / `UdaTasks.jsx` — NEW task pages using UDA
- [x] `siteConfig.jsx` — Routes at `/tasks-new` and `/task-new/:task_id`
- [x] `admin.jsx` — Shows both UdaTaskList (new) and TaskList (legacy)
- [x] `map_dama` component — Fixed imports (AvlMap from ui/components/map, lodash-es, Button via ThemeContext)
- [x] `datasources.js` — `buildEnvsForListing` strips `|source` from format.type for correct UDA pattern matching
- [x] `App.jsx` — `DAMA_HOST` defaults to `API_HOST` (not graph.availabs.org)

### Remaining

- [ ] **`ExternalVersionControls.jsx`** — REST URLs still use `DAMA_HOST`, ETL polling uses `dama` prefix, pmtiles route path needs update
- [ ] **`Create/` (GIS wizard)** — Still uses `new-context-id` + `/events/query` polling. Works but could be simplified to poll tasks via Falcor instead of REST
- [ ] **`TaskList.jsx` / `TaskPage.jsx`** — Old legacy pages still use `dama_falcor`. Keep for now, deprecate once new pages verified
- [ ] **`siteConfig.jsx` + `dmsPageFactory.jsx`** — `dama_falcor` and `DAMA_HOST` still in context (needed by legacy pages above)
- [ ] **Server cleanup** — Remove `/events/query` compat shim and `newContextId` once client fully migrated
- [x] **CSV analyzer hybrid pass** — See `tasks/current/dama-csv-analyzer.md`. Implementation complete 2026-04-16: ported legacy `analyzeSchema.js`, wired it as default CSV analyzer (ogrinfo available via `DAMA_CSV_ANALYZER=ogrinfo`), fixed index-based mapping in `generateTableDescriptor` (the root cause of view 3384's TEXT columns). 22 new tests + 12 existing upload tests passing. Awaiting end-to-end production verification.

### Approach for remaining work

The GIS create wizard currently works against dms-server via the `/events/query` compat shim — no immediate breakage. The simplification (dropping `etlContextId`, polling tasks via Falcor) can happen when there's time to test the full flow end-to-end.

ExternalVersionControls needs `DAMA_HOST` → `API_HOST` for download/pmtiles REST calls. The pmtiles route moved from `/dama-admin/:pgEnv/cache-pmtiles` to `/dama-admin/:pgEnv/pmtiles/cache-pmtiles` (plugin mount path).

Once the new task pages are verified in production, the old `TaskList`/`TaskPage` + `dama_falcor` can be removed entirely.

---

## What Needs Testing Before Ship

1. **Production GIS upload** on dmsserver.availabs.org — verify ogr2ogr speed, tiles, metadata
2. **CSV-to-PG upload** — `csv-publish` worker tested on 2026-04-16: upload + publish work correctly, but type detection diverges from the legacy analyzer (see §6). Blocked on the "CSV analyzer hybrid pass" task under Remaining before production use on CSVs with zero-padded codes.
3. **Downloads** — `create-download` worker untested with real data
4. **PMTiles** — requires Tippecanoe installed on production server
5. **Multiple pgEnvs** — verify hazmit_dama + npmrds2 both work from one server
6. **Clean up test sources** on npmrds2 (sources 1968-1991)

---

## Completed Phase Details

### Phase 0: Task system — DONE (22 tests)
`src/dama/tasks/` — task queue with host isolation, `FOR UPDATE SKIP LOCKED` locking, forked worker processes, event logging, stall recovery. Tables: `data_manager.tasks` + `data_manager.task_events` + `data_manager.settings`.

### Phase 1: UDA task routes — DONE (7 tests in Phase 0 suite)
`src/routes/uda/uda.tasks.route.js` + `uda.tasks.controller.js` — Falcor routes for task listing, events, settings, source update.

### Phase 2: GIS/CSV pipeline — DONE (12 tests)
`src/dama/upload/` — Full upload → analyze → publish pipeline. ogr2ogr for GIS, pg-copy-streams for CSV. GDAL optional. ogrinfo for CSV type detection.

### Phase 3: Storage + downloads + file upload — DONE (13 tests)
`src/dama/storage/` — Local/S3 abstraction. Download creation via ogr2ogr export. File upload with Sharp image processing.

### Phase 4: Plugin system + PMTiles — DONE (9 tests)
`src/dama/datatypes/` — `registerDatatype()` API. PMTiles plugin (Tippecanoe).

### Phase 6: Migration script — DONE (23 tests)
`src/scripts/migrate-dama-tasks.js` — In-place migration, ran on npmrds2 production. Non-destructive.

---

## Docker

Dockerfile at `packages/dms-server/Dockerfile` includes GDAL, Sharp, build tools. Image ~2.3GB. Tested and working.

```bash
docker build -t dms-server .
docker run -d --env-file .env -p 5555:5555 -v /path/to/data:/app/var --restart unless-stopped dms-server
```

---

## Reference: Key Design Decisions

### 1. Task queue: keep the hard parts, simplify the plumbing

Replaced pg-boss with our own `tasks` table and runner. Preserved: host isolation (host_id on task rows), process isolation (child_process.fork for workers), idempotent execution (`FOR UPDATE SKIP LOCKED` on PG, `BEGIN IMMEDIATE` on SQLite), event-based progress tracking (`task_events` table). Dropped: pg-boss schema, its migration system, the `pgboss.*` tables.

Workers run in forked child processes (`src/dama/tasks/worker-runner.js`). The parent process claims the task (`claimTaskById`), forks the runner with env vars (`DAMA_TASK_ID`, `DAMA_PG_ENV`, `DAMA_WORKER_PATH`), and the child loads the handler, executes it, and writes results directly to the database. Console.log in the child is captured as `task_events` entries. The parent pipes stdout/stderr with `[task:XXXX]` prefix.

Key lesson: async `spawn`/`execFile` events don't fire reliably inside forked processes — use `execFileSync` for external commands (ogr2ogr) in workers.

### 2. Multi-database pgEnv routing

Auto-discovers all `*.config.json` files with `"role": "dama"` on startup. Recovers stalled tasks and starts polling for each. `queueTask()` also auto-starts polling for the target pgEnv on demand.

### 3. DAMA Falcor routes → UDA extension

Added task/event/settings routes to UDA namespace (`uda.tasks.route.js`). Key mapping:

| Old (DAMA) | New (UDA) |
|------------|-----------|
| `dama[pgEnv].latest.events.*` | `uda[pgEnv].tasks.*` |
| `dama[pgEnv].etlContexts.byEtlContextId[id].*` | `uda[pgEnv].tasks.byId[id].*` |
| `dama-info[pgEnv].settings` | `uda[pgEnv].settings` |
| `dama.sources.metadata.update` | `uda.sources.update` |

### 4. GIS publish worker flow (gis-publish.js)

1. Create view record (no `etl_context_id` — FK to legacy table; `task_id` in metadata)
2. Ensure `gis_datasets` schema exists
3. ogr2ogr loads with `SELECT * FROM "layerName"` into temp table (`-overwrite`, `-lco SCHEMA=gis_datasets`)
4. Discover temp table's FID column (`fid` or `ogc_fid`) and geometry column (`geom` or `wkb_geometry`)
5. Create final table with exact types from `tableDescriptor.columnTypes`
6. `INSERT INTO final SELECT "fid" AS ogc_fid, CAST("original name"::TEXT AS TYPE) AS "snake_name", ..., "geom" AS wkb_geometry FROM temp`
7. Drop temp, create spatial index on `wkb_geometry`, ANALYZE
8. Initialize source metadata (columns from tableDescriptor with display_name from original field names)
9. Detect geometry type (`ST_GeometryType`), write MapBox GL tiles config to view metadata
10. Dispatch `gis-dataset:FINAL` event

Key: ogr2ogr lowercases all column names. The copy step matches `tableDescriptor.key` (original mixed-case) to temp columns by lowercasing.

### 5. Event compat shim (/events/query)

The GIS create wizard polls `/events/query?etl_context_id=X&event_id=-1`. The shim:
- First checks the in-memory upload store via `store.getByContext(contextId)` — returns synthetic `upload:FINAL` or `upload:ERROR` events for file processing status
- Falls back to `task_events` lookup by `task_id` — returns events in legacy format with `event_id`, `etl_context_id`, `type`, `payload`, `meta`, `error` fields

Upload store links `etlContextId` → `uploadId` when the upload POST includes `etlContextId` as a form field.

### 6. Analysis (ogrinfo for CSV type detection)

`analyzeLayer()` in `analysis.js` uses three tiers:
1. CSV/TSV + ogrinfo available: `ogrinfo -oo AUTODETECT_TYPE=YES -oo AUTODETECT_SIZE_LIMIT=0` (scans entire file)
2. GIS files + gdal-async: Node GDAL bindings for field metadata
3. Any file + ogrinfo: fallback

Type map: `Integer→INTEGER`, `Integer64→BIGINT`, `Real→DOUBLE PRECISION`, `String→TEXT`, `Date→DATE`

#### Comparison with the legacy analyzer (2026-04-16)

The legacy DAMA analyzer lives at `references/avail-falcor/dama/routes/data_types/file-upload/analyzeSchema.js`. It's a custom JS state machine over the first **10,000 parsed rows** that walks value-by-value and narrows each column's type. Key behaviors the new ogrinfo path **does not** reproduce:

| Behavior | Legacy (`analyzeSchema.js`) | New (ogrinfo) |
|---|---|---|
| Sample size | First 10K rows | Entire file (`AUTODETECT_SIZE_LIMIT=0`) |
| Zero-padded IDs (`"036001"`) | Forced to `TEXT` (GEOID heuristic) | Parsed as `INTEGER` — leading zero lost |
| Column-name heuristic | `^(block\|block_group\|tract\|county\|uza\|state)(_geo)?(id\|code)$` and `^geo_?(id\|code)$` → `TEXT` before any value | None |
| Integer ladder | `INT` → `BIGINT` at ±2.1B; `TEXT` beyond BigInt range | OGR: `Integer` or `Integer64`; overflow → load-time cast failure |
| Decimal ladder | `REAL` (≤6) → `DOUBLE PRECISION` (≤15) → `NUMERIC` (sink) | Always `DOUBLE PRECISION` — no arbitrary-precision fallback |
| Scientific notation | Forced to `NUMERIC` | Whatever OGR picks (usually `Real`) |
| Date detection | Commented out ("Punting on Date Types") | OGR autodetects `Date`/`DateTime` — net improvement |
| Sample collection | 10 per type per column, biased toward most-commas and largest numerics | None |
| `nonnull` / `null` counts | Accurate | Always `0 / 0` |
| Mixed-type sticky TEXT | Yes | OGR also falls back to String, but for different reasons |

Output envelope is preserved (`schemaAnalysis: [{key, summary:{db_type, nonnull, null}}]`) so the publish worker is unaffected.

**Known regressions this introduces**:
- **Zero-padded codes silently cast to integer** — FIPS (`statecode`, `countycode`), urban codes (`urbancode`), zip codes, GEOIDs. Critical for HPMS/NPMRDS CSVs where `"36"` must stay `"36"` not `36`.
- **UI loses samples + null counts** — the analysis override screen has less to show the user.

**Path forward when this is prioritized**: keep ogrinfo as the fast first pass (handles dates + large files well), then layer the two highest-value legacy heuristics on top:
1. After ogrinfo, for any column typed `INTEGER`/`BIGINT`, sample a few thousand rows for `^0[1-9]` → override to `TEXT`.
2. Apply the GEOID column-name regex → force `TEXT` regardless of ogrinfo verdict.
3. Optionally walk N rows for `null/nonnull` counts + sample collection to restore UI affordances.

See "Remaining" below for the open task item.

### 7. Database schema

**`data_manager.tasks`** (actual, as deployed):
```
task_id SERIAL PK, host_id TEXT NOT NULL, source_id INTEGER, worker_path TEXT NOT NULL,
status TEXT DEFAULT 'queued', progress REAL DEFAULT 0, result JSONB, error TEXT,
descriptor JSONB, queued_at TIMESTAMP, started_at TIMESTAMP, completed_at TIMESTAMP,
worker_pid INTEGER
```

**`data_manager.task_events`**:
```
event_id SERIAL PK, task_id INTEGER NOT NULL FK, type TEXT NOT NULL,
message TEXT, payload JSONB, created_at TIMESTAMP
```

**`data_manager.settings`** (key/value, replaces legacy single-row):
```
key TEXT PK, value JSONB DEFAULT '{}'
```

### 8. REST endpoints (16 total at /dama-admin/)

```
GET  /:pgEnv/etl/new-context-id
POST /:pgEnv/gis-dataset/upload
GET  /:pgEnv/gis-dataset/:id/layers
POST /dms/:appType/publish
POST /dms/:appType/validate
GET  /:pgEnv/gis-dataset/:fileId/layerNames
POST /:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis
GET  /:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis
GET  /:pgEnv/staged-geospatial-dataset/:fileId/:layerName/tableDescriptor
POST /:pgEnv/gis-dataset/publish
POST /:pgEnv/csv-dataset/publish
POST /:pgEnv/gis-dataset/create-download
DELETE /:pgEnv/gis-dataset/delete-download
POST /:pgEnv/file_upload
GET  /:pgEnv/tiles/:view_id/:z/:x/:y/t.pbf
GET  /:pgEnv/events/query
```
