# DAMA → dms-server Refactor: Research & Recommendations

## 1. Current Tech Stack Analysis

### pg-boss (Task Queue)

**What it is**: PostgreSQL-based job queue using `SKIP LOCKED` for distributed task claiming. Creates its own `pgboss` schema with `job`, `archive`, `schedule`, `subscription` tables.

**How DAMA uses it**:
- Queues long-running ETL jobs (data loading, schema analysis, mbtiles generation)
- Schedules recurring tasks via cron expressions
- Uses host_id-prefixed queue names to prevent cross-machine execution
- Workers are spawned as detached child processes (`child_process.spawn`)
- Task runner acquires a lock on the `:INITIAL` event to prevent duplicate execution

**Assessment**:
- pg-boss is a solid, battle-tested library (2.1M weekly npm downloads)
- However, it **requires PostgreSQL** — dms-server also supports SQLite
- The queue is used primarily for one thing: running ETL workers asynchronously
- The host_id queue naming, detached child processes, and event-locking are all complexity that was needed for a distributed multi-host deployment, which dms-server doesn't have
- pg-boss maintains its own schema and migration system — additional maintenance overhead

**Recommendation**: Replace pg-boss with a simpler built-in task runner. The actual requirement is: "run a function asynchronously, track progress, handle errors." This can be done with:
1. A simple `tasks` table (id, status, progress, result, error, timestamps)
2. In-process async execution (no child process spawning needed unless we need process isolation for memory)
3. If we do want process isolation for large ETL jobs, use `node:worker_threads` instead of detached child processes

### GDAL / ogr2ogr (Geospatial Processing)

**What it is**: `gdal-async` (Node bindings to GDAL C++ library) for reading spatial file metadata and `ogr2ogr` CLI for loading spatial data into PostgreSQL.

**How DAMA uses it**:
- Reads layer metadata from uploaded shapefiles/GeoJSON/etc.
- Analyzes schemas (field names, types, geometry type)
- Loads data into PostGIS tables via ogr2ogr
- Creates mbtiles/pmtiles for map tile serving

**Assessment**:
- This is the right tool for the job — no viable alternative for robust GIS file handling
- `gdal-async` has native compilation requirements which adds deployment complexity
- The upload pipeline is battle-tested and works well

**Recommendation**: Keep GDAL for GIS dataset processing. This is a genuine external dependency that earns its complexity. Consider making it an optional/lazy dependency so servers that only handle CSV data don't need GDAL installed.

### Falcor (API Layer)

**How DAMA uses it**: All data reading goes through Falcor routes in `routes/data_manager/multi-db.routes.js` (~73 routes). This includes source listing, view metadata, table data pagination, filtered queries, ETL context events, collections, and symbologies.

**Assessment**:
- The DAMA Falcor routes are the main thing that needs to be deprecated
- UDA routes in dms-server already handle most of the same data access patterns
- The frontend datasets pattern already uses UDA routes for source/view CRUD
- The remaining gap is table data reading (filtered/paginated queries on view tables)

**Recommendation**: Do NOT port the DAMA Falcor routes. Instead, ensure UDA covers all the data access patterns. The DAMA Falcor routes are ~1400 lines with complex multi-database routing that is no longer needed since dms-server handles database config natively.

### Event Store (ETL Tracking)

**How DAMA uses it**: Append-only log in `data_manager.event_store` with types like `:INITIAL`, `:FINAL`, `:ERROR`, and custom progress events. ETL contexts form a tree. Status transitions are enforced by PostgreSQL triggers.

**Assessment**:
- 12 million events in production — the event store is by far the largest table
- The event taxonomy is ad-hoc — each datatype invents its own event types
- The recursive CTE for querying context trees is expensive
- Event data is useful for debugging but most events are write-once, never-read progress noise
- The trigger-based status machine (event INSERT → UPDATE etl_context status) is clever but makes the system harder to understand and debug

**Recommendation**: Simplify to a `tasks` table with status, progress percentage, and a log/error field. Keep a lightweight event log for important milestones only (started, completed, failed, with error details). Drop the recursive context tree — flat task references (parent_task_id) with simple queries are sufficient.

### analyzeSchema.js (Type Inference)

**What it does**: Samples up to 10k rows from uploaded data and infers PostgreSQL column types (INT, BIGINT, REAL, DOUBLE PRECISION, NUMERIC, TEXT, BOOLEAN, DATE, TIMESTAMP). Special-cases GeoIDs (zero-padded numbers → TEXT).

**Assessment**: Good utility code, well-tested with edge cases. Should be preserved.

**Recommendation**: Port this utility into dms-server's upload module. It's standalone and has no DAMA-specific dependencies.

---

## 2. What to Port vs. Deprecate vs. Rewrite

### Port (keep the logic, adapt to dms-server)

| Component | Why | Effort |
|-----------|-----|--------|
| **GIS upload pipeline** | Battle-tested, handles complex file formats | Medium — needs task queue integration |
| **CSV upload pipeline** | Working well, simpler than GIS | Low — dms-server upload routes already handle CSV |
| **analyzeSchema.js** | Solid type inference, no dependencies | Low — copy and adapt |
| **Source/view CRUD** | Core data model | Already done (UDA routes) |
| **Schema introspection** (`table_column_types`) | Needed for dynamic column discovery | Medium — port the SQL views or reimplement |

### Deprecate (stop using, replace with existing dms-server functionality)

| Component | Replacement |
|-----------|-------------|
| **All DAMA Falcor routes** (73 routes) | UDA routes already cover source/view CRUD + data queries |
| **Multi-database routing** (`pgEnv` in every route) | dms-server's config system handles this |
| **`_data_manager_admin` views** (most of them) | Column metadata can be fetched on-demand; the comprehensive views are rarely queried |
| **`database_id` table** | Not needed — dms-server doesn't have multi-host coordination |
| **Collections + Symbologies** | These should become DMS patterns/pages, not special database tables |

### Rewrite (new implementation serving same purpose)

| Component | Current | Proposed |
|-----------|---------|----------|
| **Task queue** | pg-boss + child processes + event store | Simple `tasks` table + async runner (or worker_threads) |
| **Datatype plugins** | File-based auto-discovery under `routes/data_types/` | Registration API: `dama.registerDatatype(name, { routes, worker })` |
| **Auth on sources** | JSONB `statistics.auth` with numeric permission levels | Integrate with dms-server auth system (JWT + groups) |
| **ETL progress tracking** | 12M event_store rows | Task status field + optional structured log |

---

## 3. Key Design Decisions

### Decision 1: Internal vs. External Datasets — Unified Pipeline

**Current state**:
- "Internal datasets" (DMS) store data in `data_items` split tables with type-based routing
- "External datasets" (DAMA) store data in arbitrary PostgreSQL tables with `data_manager.views` pointing to them
- Upload to internal datasets goes through dms-server's `/dama-admin/dms/:appType/publish`
- Upload to external datasets goes through legacy DAMA's `/dama-admin/:pgEnv/gis-dataset/publish`

**Problem**: Two completely separate pipelines for the same operation (upload → validate → store → query).

**Recommendation**: Unify under one upload flow:
1. All uploads go through dms-server
2. After file analysis (layers, schema), the user chooses a target:
   - **Internal table** (DMS) → rows stored in `data_items` split tables, queryable via UDA
   - **External table** (PostgreSQL) → rows loaded into a dedicated PG table, view record created, queryable via UDA
3. The UDA routes already handle both via `getEssentials()` mode detection
4. The key integration point is the **publish step** — currently dms-server only publishes to DMS data_items; it needs a second path that creates a PostgreSQL table and loads data via COPY/INSERT

### Decision 2: Task Queue Strategy

**Options**:

**A. In-process async (simplest)**
```js
// No queue library needed
const tasks = new Map();
async function runTask(id, workerFn) {
  tasks.set(id, { status: 'running', progress: 0 });
  try {
    const result = await workerFn((progress) => tasks.get(id).progress = progress);
    tasks.set(id, { status: 'done', result });
  } catch (err) {
    tasks.set(id, { status: 'error', error: err.message });
  }
}
```
- Pro: Zero dependencies, works with SQLite
- Con: Tasks die if server restarts, no process isolation

**B. Worker threads with DB-backed state**
```js
// Task state in database, execution in worker_threads
const { Worker } = require('worker_threads');
// Store task status in tasks table, run heavy work in worker thread
```
- Pro: Process isolation for memory-heavy ETL, survives OOM
- Con: More complex, still dies on server restart

**C. pg-boss (keep current)**
- Pro: Survives restarts, distributed, battle-tested
- Con: Requires PostgreSQL, heavyweight for our use case

**Recommendation**: **Option B** with a simple fallback. Most tasks (CSV upload, validation) can run in-process. Only GIS processing (GDAL, ogr2ogr) genuinely benefits from process isolation. Use a `tasks` table in the database for state persistence, and `worker_threads` for heavy operations. If the server restarts, stalled tasks can be detected and either resumed or marked as failed.

### Decision 3: Datatype Plugin Architecture

**Current**: File-based auto-discovery — drop files in `routes/data_types/{name}/` and they're automatically loaded. Workers are `.mjs` files spawned as child processes.

**Proposed**: Registration-based plugins that live in the consuming application (dms-site, dms-template), not in dms-server.

```js
// In dms-site or dms-template:
import { registerDatatype } from '@availabs/dms-server';

registerDatatype('nri', {
  // Optional: custom publish route handler
  publish: async (req, res, { createSource, createView, runTask }) => {
    const source = await createSource({ name: req.body.name, type: 'nri' });
    await runTask('nri-load', async (progress) => {
      // ... fetch NRI data from FEMA API, load into table ...
      progress(50);
      // ... create view pointing to table ...
      progress(100);
    });
    res.json({ source_id: source.source_id });
  },
  // Optional: custom data transformations, validation rules, etc.
});
```

**Key principle**: dms-server provides the infrastructure (task running, source/view management, file upload handling, data loading). Datatypes provide the domain logic (where to fetch data, how to transform it, what schema to expect).

**The two generic datatypes** (`gis_dataset` and `csv_dataset`) should remain in dms-server since they handle the universal upload flow. All 25+ domain-specific datatypes (acs, nri, npmrds, hazmit/*, etc.) should be plugins.

### Decision 4: What Happens to Collections and Symbologies

**Current**: Dedicated database tables with Falcor routes.

**Assessment**: Collections have 5 rows in production. Symbologies have 247. Both are metadata groupings that could be modeled as DMS content.

**Recommendation**: 
- **Collections** → DMS pages or a lightweight pattern. They're just named groups of source references.
- **Symbologies** → Store in source/view metadata JSONB, or as DMS content items. Map styling config doesn't need its own table.
- Don't port these as first-class database entities. If needed, they can be DMS patterns.

### Decision 5: Schema Introspection

**Current**: The `_data_manager_admin` schema has 8+ SQL views that provide comprehensive table metadata, JSON Schema generation, primary key detection, and geometry type identification. These are expensive views that join pg_catalog with data_manager.views.

**Recommendation**: Port selectively:
- `table_column_types` — **Port this**. It's the foundation for schema discovery and is used by the upload pipeline.
- `dama_view_name()` function — **Port this** for consistent table naming.
- Everything else — **Don't port**. The comprehensive views, metadata conformity checks, and column variance analysis are never queried in application code. They were admin tools.

---

## 4. Data Model Simplification

### Current Overengineering

1. **`etl_contexts` + `event_store`**: 9K contexts and 12M events for 709 views. The context tree (parent/child relationships) is used to group related operations but adds complexity. Most events are never read.

2. **`statistics.auth`** on sources: Permission levels stored as string numbers ("10", "2") in a JSONB blob nested three levels deep. This predates the dms-server auth system.

3. **`view_dependencies` + `source_dependencies`**: Integer arrays referencing other views/sources. Used for derived datasets but rarely populated in practice.

4. **Multiple timestamp columns**: `active_start_timestamp`, `active_end_timestamp`, `last_updated`, `_created_timestamp`, `_modified_timestamp` — five time-related columns on views, most rarely used.

5. **`data_table` vs `table_schema.table_name`**: Three columns to identify a table location, with `data_table` as a redundant alternative.

### Proposed Simplified Schema

For the dms-server port, the schema should be reduced to what's actually used:

```sql
-- Sources (already in dms-server, mostly fine as-is)
-- Consider: drop source_dependencies, simplify statistics

-- Views (already in dms-server, could trim)
-- Consider: drop data_table (redundant with table_schema+table_name),
--   drop active_start/end_timestamp, drop interval_version/geography_version
--   (rarely used — these can go in metadata JSONB)

-- NEW: Tasks (replaces etl_contexts + event_store + pgboss)
CREATE TABLE data_manager.tasks (
  task_id         SERIAL PRIMARY KEY,
  source_id       INTEGER REFERENCES data_manager.sources ON DELETE CASCADE,
  view_id         INTEGER REFERENCES data_manager.views ON DELETE SET NULL,
  type            TEXT NOT NULL,       -- 'upload', 'publish', 'transform', etc.
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, running, done, error
  progress        INTEGER DEFAULT 0,   -- 0-100
  config          JSONB,               -- task input parameters
  result          JSONB,               -- task output / final state
  error           TEXT,                -- error message if failed
  log             JSONB,               -- structured log entries [{ts, msg}]
  user_id         INTEGER,
  _created_timestamp  TIMESTAMP DEFAULT NOW(),
  _modified_timestamp TIMESTAMP DEFAULT NOW()
);
```

This single table replaces:
- `etl_contexts` (9K rows) → `tasks` with status tracking
- `event_store` (12M rows) → `tasks.log` for important events, `tasks.progress` for status
- `pgboss.job/archive` → Task execution managed in-process

---

## 5. Migration Strategy

### Phase 1: Task System Foundation
1. Add `tasks` table to dms-server DAMA schema (PG + SQLite)
2. Implement task runner (in-process async + optional worker_threads)
3. Add task status/progress REST endpoints
4. Add task status/progress Falcor routes (for frontend polling)

### Phase 2: Unified Upload Pipeline
1. Extend dms-server upload routes to support "external table" target
2. For GIS datasets: integrate GDAL analysis + ogr2ogr loading as a task
3. For CSV datasets: extend existing publish handler to create PG tables
4. Ensure UDA routes can query both DMS data_items and external PG tables (already works via `getEssentials()`)

### Phase 3: Datatype Plugin System
1. Design registration API for external datatypes
2. Move all 25+ domain-specific datatypes out of dms-server into consuming repos
3. Keep `gis_dataset` and `csv_dataset` as built-in types

### Phase 4: Frontend Migration
1. Update datasets pattern to use only UDA routes (drop `dama[pgEnv]` Falcor paths)
2. Update ETL progress tracking to poll task status instead of event store
3. Remove `pgEnv` routing from frontend — dms-server handles database config

### Phase 5: Cleanup
1. Deprecate legacy DAMA Falcor routes
2. Remove `collections` and `symbologies` tables (or model as DMS content)
3. Clean up event_store data (or archive)

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GIS upload regression | Medium | High | Port existing upload code with minimal changes; add integration tests with sample files |
| Task queue reliability | Medium | Medium | Start with in-process tasks; add persistence via DB; can always add pg-boss back if needed |
| Frontend breaking changes | High | High | Run old and new in parallel during migration; UDA already handles most paths |
| GDAL deployment issues | Low | Medium | Make GDAL optional; gracefully degrade for non-GIS deployments |
| Performance regression on large datasets | Medium | Medium | Benchmark ogr2ogr loading and filtered queries against current system |
| Plugin API design churn | Medium | Low | Start with 2-3 real plugins to validate the API before documenting |

---

## 7. Summary of Recommendations

1. **Don't port the DAMA Falcor routes** — UDA already covers data access, extend it where needed
2. **Replace pg-boss with a simple task system** — database-backed status + in-process async + optional worker_threads
3. **Unify upload pipeline** — one entry point, two targets (DMS data_items or PG table)
4. **Keep GDAL** for GIS processing but make it optional
5. **Plugin architecture** for domain-specific datatypes — registration API, code lives in consuming repos
6. **Simplify the data model** — one `tasks` table replaces etl_contexts + event_store + pgboss
7. **Drop collections/symbologies** as database entities — model as DMS content if needed
8. **Port `table_column_types` and `dama_view_name()`** — these are genuinely useful utilities
9. **Integrate auth** with dms-server's existing JWT/groups system instead of the `statistics.auth` JSONB pattern
10. **Phase the migration** — task system first, then upload unification, then plugins, then frontend
