# AVAIL Data Manager (DAMA) - Current System Documentation

## Overview

DAMA (Data Access Management Architecture) is AVAIL's legacy server-side data management system. It provides ETL (Extract, Transform, Load) pipeline management for geospatial and tabular datasets, backed by PostgreSQL with a pg-boss task queue and Falcor API layer. The code lives in `references/avail-falcor/dama/` and the database schema SQL in `references/avail-falcor/db_service/sql/dama/`.

DAMA manages the full lifecycle of external datasets: upload, schema analysis, loading into PostgreSQL tables, metadata tracking, task orchestration, and data access via Falcor routes.

---

## Database Schema

### Schemas

| Schema | Purpose |
|--------|---------|
| `data_manager` | Core tables: sources, views, collections, symbologies, etl_contexts, event_store |
| `_data_manager_admin` | Utility views and functions for schema introspection, naming, metadata initialization |
| `pgboss` | Task queue tables managed by pg-boss library |
| `gis_datasets`, `geo`, `open_fema_data`, etc. | Per-dataset data tables created during ETL |

### Core Tables

#### `data_manager.sources`
The primary catalog of datasets. Each source represents a logical dataset (e.g., "NCEI Storm Events", "TIGER County Boundaries").

```sql
CREATE TABLE data_manager.sources (
  source_id             SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  display_name          TEXT,
  type                  TEXT,              -- datatype identifier (e.g., 'gis_dataset', 'csv_dataset', 'nri')
  update_interval       TEXT,
  category              TEXT[],
  description           TEXT,
  statistics            JSONB,             -- includes auth config: { auth: { users: {}, groups: {} } }
  metadata              JSONB,             -- column definitions: { columns: [{name, type, desc}] }
  categories            JSONB,
  source_dependencies   INTEGER[],         -- references other source_ids
  user_id               INTEGER,
  _created_timestamp    TIMESTAMP DEFAULT NOW(),
  _modified_timestamp   TIMESTAMP DEFAULT NOW()  -- auto-updated via trigger
);
```

**Auth model** (stored in `statistics.auth`):
```json
{
  "auth": {
    "users": { "1": "10" },           // user_id → permission level
    "groups": { "AVAIL": "10", "Public": "2" }  // group → permission level
  }
}
```

**Metadata** (stored in `metadata`):
```json
{
  "columns": [
    { "name": "ogc_fid", "type": "integer", "desc": null },
    { "name": "disaster_number", "type": "string", "desc": null }
  ]
}
```

#### `data_manager.views`
Versioned snapshots of a source. Each view points to an actual PostgreSQL table containing the data. A source can have multiple views (versions over time, different geographies, etc.).

```sql
CREATE TABLE data_manager.views (
  view_id               SERIAL PRIMARY KEY,
  source_id             INTEGER NOT NULL REFERENCES data_manager.sources ON DELETE CASCADE,
  data_type             TEXT,
  interval_version      TEXT,          -- e.g., year or year-month
  geography_version     TEXT,          -- e.g., 2-digit state code
  version               TEXT,
  source_url            TEXT,          -- external source URL
  publisher             TEXT,
  table_schema          TEXT,          -- PostgreSQL schema where data lives
  table_name            TEXT,          -- PostgreSQL table name
  data_table            TEXT,          -- alternative table reference
  download_url          TEXT,
  tiles_url             TEXT,
  start_date            DATE,
  end_date              DATE,
  last_updated          TIMESTAMP,
  statistics            JSONB,
  metadata              JSONB,
  user_id               INTEGER,
  etl_context_id        INTEGER REFERENCES data_manager.etl_contexts,
  view_dependencies     INTEGER[],     -- references other view_ids
  active_start_timestamp TIMESTAMP,
  active_end_timestamp   TIMESTAMP,
  _created_timestamp    TIMESTAMP DEFAULT NOW(),
  _modified_timestamp   TIMESTAMP DEFAULT NOW()
);
```

**Table naming convention**: `{table_schema}.{table_name}` where table_name is typically `s{source_id}_v{view_id}_{snake_case_source_name}` (truncated to 50 chars for Postgres limit).

#### `data_manager.etl_contexts`
Tracks ETL task execution contexts. Forms a tree structure via `parent_context_id`.

```sql
CREATE TABLE data_manager.etl_contexts (
  etl_context_id        SERIAL PRIMARY KEY,
  parent_context_id     INTEGER REFERENCES data_manager.etl_contexts ON DELETE CASCADE,
  source_id             INTEGER REFERENCES data_manager.sources ON DELETE CASCADE,
  etl_task_id           TEXT,
  etl_status            TEXT REFERENCES data_manager.etl_statuses,  -- 'OPEN', 'DONE', 'ERROR'
  initial_event_id      INTEGER REFERENCES data_manager.event_store ON DELETE CASCADE,
  latest_event_id       INTEGER REFERENCES data_manager.event_store ON DELETE CASCADE,
  _created_timestamp    TIMESTAMP DEFAULT NOW(),
  _modified_timestamp   TIMESTAMP DEFAULT NOW()
);
```

**Status transitions** (enforced by trigger on event_store INSERT):
- `NULL` → `OPEN` (on `:INITIAL` event)
- `OPEN` → `DONE` (on `:FINAL` event; fires `pg_notify('ETL_CONTEXT_FINAL_EVENT')`)
- `OPEN` → `ERROR` (on `:ERROR` event)
- `ERROR` → `OPEN` (on non-INITIAL/FINAL/ERROR event — allows retries)
- `DONE` → (immutable — raises exception if new events arrive)

#### `data_manager.event_store`
Append-only log of all events during ETL processing. Each event belongs to an etl_context.

```sql
CREATE TABLE data_manager.event_store (
  event_id              SERIAL PRIMARY KEY,
  etl_context_id        INTEGER NOT NULL REFERENCES data_manager.etl_contexts ON DELETE CASCADE,
  type                  TEXT NOT NULL,     -- e.g., 'gis-dataset:INITIAL', 'csv-dataset:FINAL'
  payload               JSONB,
  meta                  JSONB,             -- { user_id, email, note, ... }
  error                 BOOLEAN,
  _created_timestamp    TIMESTAMP DEFAULT NOW()
);
```

**Event type conventions**:
- `{source_type}:INITIAL` — Task queued
- `{source_type}:FINAL` — Task completed successfully
- `{source_type}:ERROR` — Task failed
- `{source_type}:WORKER_INIT` — Worker process started
- `{source_type}:SRC_CREATE` — Source record created
- `{source_type}:VIEW_CREATE` — View record created
- `{source_type}:LOAD_INIT` / `LOAD_FIN` — Data loading phase
- `{source_type}:FETCH_INIT` / `FETCH_FIN` — Data fetching phase
- `{source_type}:UPDATE_VIEW_INFO` — View metadata updated
- Custom progress events (e.g., `acs:attempt: 1; 20%`)

#### `data_manager.collections`
Groups of sources for organizational/display purposes.

```sql
CREATE TABLE data_manager.collections (
  collection_id         SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  metadata              JSONB,
  categories            JSONB,
  source_dependencies   INTEGER[],
  user_id               INTEGER,
  _created_timestamp    TIMESTAMP DEFAULT NOW(),
  _modified_timestamp   TIMESTAMP DEFAULT NOW()
);
```

#### `data_manager.symbologies`
Map styling definitions, optionally associated with collections.

```sql
CREATE TABLE data_manager.symbologies (
  symbology_id          SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  collection_id         INTEGER,           -- nullable FK to collections
  description           TEXT,
  metadata              JSONB,
  symbology             JSONB,             -- actual map style config
  categories            JSONB,
  source_dependencies   INTEGER[],
  _created_timestamp    TIMESTAMP DEFAULT NOW(),
  _modified_timestamp   TIMESTAMP DEFAULT NOW()
);
```

#### `data_manager.database_id`
Immutable single-row table holding a UUID that uniquely identifies the database instance. Protected by triggers that prevent INSERT/UPDATE/DELETE/TRUNCATE.

#### `data_manager.settings`
Single-row configuration table (e.g., `filtered_categories`).

### Admin Views and Functions

**`_data_manager_admin.table_column_types`** — Comprehensive view joining `pg_catalog` with `data_manager.views` to produce column metadata with JSON Schema types. Handles geometry columns via `geojson_json_schemas` lookup. Returns: `table_schema, table_name, column_name, column_type, column_not_null, column_number, column_pkey_number, json_type, is_geometry_col`.

**`_data_manager_admin.table_json_schema`** — Aggregates `table_column_types` into per-table JSON Schema objects and simplified schema arrays.

**`_data_manager_admin.dama_table_column_types`** — Joins table_column_types with `data_manager.views` to add `source_id` and `view_id`.

**`_data_manager_admin.dama_views_int_ids`** — Determines which views have simple integer primary keys or `__id__` columns for efficient indexed access.

**`_data_manager_admin.dama_views_comprehensive`** — Full view info with global IDs, naming, primary key detection, and geometry type.

**Functions**:
- `_data_manager_admin.to_snake_case(TEXT)` — Converts any string to snake_case
- `_data_manager_admin.dama_view_name(view_id)` — Generates canonical view table name: `s{source_id}_v{view_id}_{snake_case_name}` (max 50 chars)
- `_data_manager_admin.dama_view_global_id(view_id)` — `{db_id}_s{source_id}_v{view_id}`
- `_data_manager_admin.initialize_dama_src_metadata_using_view(view_id)` — Auto-populates source metadata from view's table schema

### Required Extensions
```sql
postgis, postgis_topology, uuid-ossp, postgis_raster (if PostGIS >= 3)
```

---

## Data in Production (hazmit_dms)

### Scale
| Table | Row Count |
|-------|-----------|
| sources | 363 |
| views | 709 (679 with data tables, 30 metadata-only) |
| etl_contexts | 9,019 |
| event_store | **12,156,157** |
| collections | 5 |
| symbologies | 247 |

### ETL Context Status
| Status | Count |
|--------|-------|
| DONE | 4,483 |
| NULL (never started) | 2,984 |
| OPEN (running/stalled) | 1,214 |
| ERROR | 338 |

### pgboss Queue
- Active jobs: 1,032 completed, 2 created
- Archived: 10,652 completed, 7 created, 4 failed

### Source Types (37 distinct)
The most active source types by view count:
- `gis_dataset` — 303 views across 202 sources (generic GIS uploads)
- `csv_dataset` — 124 views across 91 sources (generic CSV uploads)
- `hlr` (Hazard Loss Ratio) — 42 views, 1 source
- `eal` (Expected Annual Loss) — 38 views, 2 sources
- `flood_map` — 27 views, 2 sources
- `fusion` — 18 views, 1 source
- `tiger_full` — 15 views, 6 sources
- Plus 30 more domain-specific types (FEMA, NRI, NCEI, SBA, etc.)

### Data Table Schemas (20 distinct)
Views store data across 20 PostgreSQL schemas: `geo`, `gis_datasets`, `severe_weather_new`, `open_fema_data`, `national_risk_index`, `tiger`, `acs`, `analytics`, `file_uploads`, etc.

---

## Code Architecture

### Directory Structure
```
dama/
├── admin/
│   ├── index.js              # Main exports: spawnEtlContext, dispatchEvent, queryEvents,
│   │                         #   queueTask, scheduleTask, createSource, createView, logger
│   ├── events.js             # ETL context spawning, event dispatch, recursive event queries
│   ├── metadata.js           # Source/view creation, table description, INSERT generation
│   ├── logger.js             # Winston-based per-context logging
│   └── tasks/
│       ├── tasks_controller.js     # Task queue management, worker spawning
│       ├── pgboss_controller.js    # pg-boss wrapper (queue/schedule/status)
│       ├── task_runner.mjs         # Worker process entry point
│       └── sql/
│           └── create_dama_pgboss_view.sql
├── config/
│   └── index.js              # Host ID, directory paths (etlDir, dataDir, mbtilesDir, logDir)
└── routes/
    ├── index.js              # Recursive *.routes.js loader, mounts under /dama-admin
    ├── events/               # ETL context + event query endpoints
    ├── meta/                 # Collection publish, source/view delete
    ├── tiles/                # Tile serving
    ├── geoprocessing/        # 6 spatial analysis workers
    └── data_types/           # 25+ datatype handlers (the plugin system)
```

### Admin Module API

**Events** (`admin/events.js`):
```js
spawnEtlContext(source_id, parent_context_id, pgEnv)
  → INSERT INTO data_manager.etl_contexts → returns etl_context_id

dispatchEvent({ type, payload, meta, error }, etl_context_id, pgEnv)
  → INSERT INTO data_manager.event_store → returns event object

queryEvents(since_event_id, etl_context_id, pgEnv)
  → Recursive CTE traversing ETL context tree (ancestors + descendants)
  → Returns all events with event_id > since_event_id
```

**Metadata** (`admin/metadata.js`):
```js
describeTable(table_schema, table_name, pgEnv)
  → Queries _data_manager_admin.table_column_types
  → Returns { column_name: { column_type, column_number } }

createSource(new_row, pgEnv)
  → Auto-generates auth in statistics if user_id provided
  → INSERT INTO data_manager.sources → returns source object

createView(new_row, pgEnv, { setDefaultTable })
  → INSERT INTO data_manager.views
  → If setDefaultTable: calls _data_manager_admin.dama_view_name() to generate table name
  → Returns view object
```

**Tasks** (`admin/tasks/`):
```js
queueTask(dama_task_descr, pgboss_send_options, pgEnv)
  → Creates source/view if needed, spawns ETL context, dispatches :INITIAL, sends to pgboss

scheduleDamaTask(dama_task_descr, pgboss_send_options, pgEnv)
  → Schedules recurring task via pgboss cron (TZ: America/New_York)

unscheduleTask(queue_name, pgEnv)
  → Removes scheduled task
```

### Task Queue System

**Library**: pg-boss v9.0.3 (PostgreSQL-based job queue)

**Lifecycle**:
```
1. Route handler (HTTP POST) receives task parameters
2. Creates source + view if needed (via admin/metadata.js)
3. Spawns ETL context (via admin/events.js)
4. Dispatches :INITIAL event with task payload
5. Sends task to pgboss queue (queue name prefixed with host_id)
6. pg-boss worker picks up job
7. Spawns detached child process running task_runner.mjs
8. task_runner:
   a. Acquires lock on :INITIAL event (SELECT ... FOR UPDATE SKIP LOCKED)
   b. Dynamically imports worker module (*.worker.mjs)
   c. Calls worker's default export function
   d. Worker dispatches progress events
   e. Worker returns :FINAL event or throws → :ERROR
9. task_runner exits with code:
   - 0: DONE
   - 100: COULD_NOT_ACQUIRE_INITIAL_EVENT_LOCK (duplicate prevention)
   - 101: WORKER_THREW_ERROR
   - 102: WORKER_DID_NOT_RETURN_FINAL_EVENT
```

**Task Descriptor Format**:
```js
{
  dama_task_queue_name: "optional_custom_queue",
  worker_path: "/absolute/path/to/worker.mjs",
  source_id: 123,
  user_id: 1,
  email: "user@example.com",
  initial_event: {
    type: "gis-dataset:INITIAL",
    payload: { /* task-specific config */ },
    meta: { user_id, email }
  }
}
```

**Environment passed to worker process**:
- `AVAIL_DAMA_PG_ENV` — database config name
- `AVAIL_DAMA_ETL_CONTEXT_ID` — context for event dispatch
- Standard node env vars

### Upload Pipeline

#### GIS Dataset Upload
1. **Upload**: `POST /dama-admin/:pgEnv/gis-dataset/upload` — multipart ZIP/TAR via busboy → saves to `etlDir/{uuid}/` → dispatches progress events → queues analysis
2. **Publish**: `POST /dama-admin/:pgEnv/gis-dataset/publish` — queues `publish.worker.mjs` which:
   - Extracts layer metadata via GDAL (`gdal-async`)
   - Analyzes schema types (`analyzeSchema.js` — samples up to 10k rows, infers INT/BIGINT/REAL/TEXT/BOOLEAN/DATE/etc.)
   - Creates source + view records
   - Loads data via ogr2ogr into PostgreSQL
   - Optionally creates mbtiles/pmtiles for map rendering
   - Initializes source metadata from table schema

#### CSV Dataset Upload
Similar pattern via `POST /dama-admin/:pgEnv/csv-dataset/publish`, targeting tabular (non-spatial) data.

#### New File Upload (Images)
`POST /dama-admin/:pgEnv/file_upload` — processes images via Sharp (AVIF conversion, resize to 1400px max), stores in `dataDir/pg-{pgEnv}_s-{source_id}/v-{view_id}/filename`.

### Datatype Plugin System

Each datatype is a directory under `routes/data_types/{type}/` containing:
- `{type}.routes.js` — exports array of `{route, method, handler}` objects
- `{type}.worker.mjs` — exports default async function `(initial_task, etl_context_id, pgEnv)`

**Route loader** (`routes/index.js`) recursively discovers all `*.routes.js` files and registers them under `/dama-admin` base path.

**Worker signature**:
```js
export default async function(initial_task, etl_context_id, pgEnv) {
  const { initial_event: { payload } } = initial_task;
  // ... process data, dispatch events ...
  return { type: "mytype:FINAL", payload: { result }, meta: {} };
}
```

**Registered datatypes** (25+):
- **Generic**: `gis-dataset`, `csv-dataset`, `file-upload`
- **Census/Demographics**: `acs`, `tiger`
- **Transportation**: `npmrds`, `npmrds-raw`
- **Hazard Mitigation**: `hazmit/*` (12 specialized types: ncei, nri, open_fema, sheldus, sba, etc.)
- **Performance**: `pm3`, `pm3-aggregate`, `map21`
- **Other**: `qcew`, `infogroup`, `hubbound`, `osm`
- **Geoprocessing**: `aggregate_buildings`, `aggregate_hifld`, `parcels2footprints`, etc.

### Falcor Routes (Data Reading)

Located in `references/avail-falcor/routes/data_manager/multi-db.routes.js` — approximately 73 routes.

**Key route paths** (prefix: `dama[{keys:pgEnvs}]`):

| Category | Route Pattern | Purpose |
|----------|--------------|---------|
| **Sources** | `.sources.length` | Total source count |
| | `.sources.byIndex[{integers}]` | Paginated source list |
| | `.sources.byId[{keys}][{attributes}]` | Source metadata (GET/SET) |
| | `.sources.byId[...].views.byIndex[{integers}]` | Views for a source |
| | `.sources.byId[...].dependents` | Dependent views |
| | `.sources.byCategory[{keys}]` | Filter by category |
| **Views** | `.views.length` | Total view count |
| | `.views.byIndex[{integers}]` | Paginated view list |
| | `.views.byId[{keys}][{attributes}]` | View metadata (GET/SET) |
| | `.views.byId[...].dependents` | Dependent views |
| **Table Data** | `.viewsbyId[...].data.length` | Row count |
| | `.viewsbyId[...].databyIndex[{integers}]` | Paginated rows |
| | `.viewsbyId[...].databyId[{keys}][{keys}]` | Rows by ID + columns |
| | `.viewsbyId[...].options[{keys}].databyIndex[...]` | Filtered/grouped data |
| **ETL** | `.etlContexts[...].allEvents[...]` | Event log for context |
| | `.etlContextsbyDamaSourceId[...].byIndex[...]` | Contexts for a source |
| **Collections** | `.collections.byId[{keys}][{attributes}]` | Collection metadata |
| **Symbologies** | `.symbologies.byId[{keys}][{attributes}]` | Symbology data |

**Source attributes**: `source_id, type, name, display_name, update_interval, category, categories, description, statistics, metadata`

**View attributes**: `view_id, source_id, data_type, interval_version, geography_version, version, source_url, publisher, table_schema, table_name, data_table, download_url, tiles_url, start_date, end_date, last_updated, statistics, metadata, user_id, etl_context_id, view_dependencies, _created_timestamp, _modified_timestamp`

### Configuration

```js
// config/index.js exports:
{
  host_id,      // UUID persisted in var/dama_host_id — identifies this machine
  damaHost,     // hostname for file ID generation
  etlDir,       // var/tmp-etl — working directory for active ETL tasks
  dataDir,      // var/dama-files (or DAMA_SERVER_FILESTORAGE_PATH) — published outputs
  mbtilesDir,   // var/dama_mbtiles — tile cache
  logDir,       // var/logs — per-context log files
  rootDir,      // repository root
  prodURL       // https://graph.availabs.org (or PROD_URL)
}
```

### Frontend Integration

The frontend datasets pattern (`src/dms/src/patterns/datasets/`) uses a dual-path approach:
- **UDA routes** (`uda[env].sources`, `uda[env].views`) for source/view CRUD — already ported to dms-server
- **DAMA routes** (`dama[pgEnv].viewsbyId[...].data*`) for reading actual table data — still hitting the legacy Falcor server

The UDA `getEssentials()` function detects mode based on the `env` parameter:
- Contains `+` → DMS mode (internal datasets stored in `data_items`)
- No `+` → DAMA mode (external datasets in `data_manager.sources/views`)

---

## Database Connections

| Database | Host | Port | User | Database | Role |
|----------|------|------|------|----------|------|
| hazmit_dms | mercury.availabs.org | 5435 | postgres | hazmit_dms | dama |
| kari | mercury.availabs.org | 5532 | dama_dev_user | kari | dama |
| freight_data | mercury.availabs.org | 5435 | postgres | freight_data | dama |
| nysdot_sandbox | neptune.availabs.org | 5757 | nysdot_user | nysdot_sandbox | dama |
| dama-test (SQLite) | local | — | — | ../data/dama-test.sqlite | dama |

---

## What Already Exists in dms-server

### DAMA Schema Init
dms-server already has `create_dama_core_tables.sql` (PG) and `create_dama_core_tables.sqlite.sql` that create `data_manager.sources` and `data_manager.views` with timestamps and triggers. This is a simplified version — missing: `etl_contexts`, `event_store`, `collections`, `symbologies`, `database_id`, and all `_data_manager_admin` utilities.

### UDA Routes
Provide source/view CRUD and data querying (filter, groupBy, orderBy). Handle both DMS and DAMA mode via `getEssentials()`.

### Upload Routes
REST endpoints at `/dama-admin/` handling file upload, layer analysis, publish (CSV/Excel → DMS data_items), and validation. Currently only publishes to DMS internal datasets, not to DAMA external tables.
