# DAMA — Data Manager subsystem

DAMA is the dms-server subsystem that owns **external datasets** — Postgres-backed sources, views, per-view physical tables, the long-running task queue that builds them, and the dataType plugin system that lets app code register custom workers and routes.

DMS content (sites, patterns, pages) lives in `data_items`. DAMA content (datasets) lives in `data_manager.sources` / `data_manager.views` with row data routed to per-view physical tables in `gis_datasets.*`. The two systems share the same dms-server process, the same auth, the same Falcor router — but the schemas are separate and a pgEnv is configured for one role at a time (`role: "dama"` vs `role: "dms"`).

---

## Directory layout

```
src/dama/
├── datatypes/         # plugin registry: registerDatatype, mountDatatypeRoutes
│   ├── index.js       # the registry itself
│   └── pmtiles.js     # built-in datatype (always loaded)
├── tasks/             # database-backed task queue (replaces pg-boss)
│   ├── index.js       # queueTask, registerHandler, polling loop
│   ├── host-id.js     # host-isolation: one server only runs its own tasks
│   └── worker-runner.js
├── upload/            # file upload + ETL pipeline (CSV, GIS, internal_table)
│   ├── index.js       # mountUploadRoutes
│   ├── metadata.js    # createDamaSource, createDamaView, ensureSchema
│   ├── routes.js      # /dama-admin/:pgEnv/{upload,publish,...}
│   ├── workers/       # csv-publish, gis-publish, internal-table-publish
│   └── analyze*.js    # column-type inference, header analysis
├── tiles/             # /dama-admin/:pgEnv/tiles/:viewId/:z/:x/:y/t.pbf
│   └── tiles.rest.js
└── storage/           # local FS / S3 backend for uploaded files
    ├── index.js
    ├── local.js
    └── s3.js
```

---

## Core data model

### `data_manager.sources`

One row per logical dataset (e.g. "FEMA NFIP Claims", "WCDB FM Now Playing"). Columns of note:

| Column | Type | Used for |
|---|---|---|
| `source_id` | SERIAL PK | All references |
| `name` | TEXT UNIQUE | Display name. Auto-suffixed `_2`, `_3`, … on collision (see `metadata.js#createDamaSource`). |
| `type` | TEXT | DataType identifier — matches the plugin name registered via `registerDatatype` (e.g. `now_playing_stream`, `fima_nfip_claims_v2_enhanced`, `csv_dataset`). The client-side `damaDataTypes[type]` is keyed on this. |
| `categories` | JSONB | `[[<top>, <sub>]]` for grouping in the UI. |
| `metadata` | JSONB | **Cross-DAMA contract** — see "metadata.columns contract" below. |
| `statistics` | JSONB | Per-source state: auth grants (`auth: { users: { [user_id]: '10' }, groups: {} }`), plus plugin-specific keys (e.g. `webhook_secret`, `acr_project_id`, `backfill: { … }`). |
| `user_id` | INT | Creator. |

### `data_manager.views`

One row per **versioned snapshot** of a source. Most plugins create exactly one view per source on provision; CSV/GIS upload creates a new view per re-upload.

| Column | Type | Used for |
|---|---|---|
| `view_id` | SERIAL PK | |
| `source_id` | INT FK → sources | |
| `table_schema` | TEXT | Default `gis_datasets` (settable for ClickHouse routing — see below). |
| `table_name` | TEXT | Default `s{source_id}_v{view_id}_{source_name_slug}` (e.g. `s42_v17_traffic_counts`). The slug is `nameToSlug(source.name)` truncated to 40 chars to keep the full identifier under Postgres's 63-char limit. Falls back to `s{source_id}_v{view_id}` when the source has no name. Existing tables created before this convention keep their original names — this only affects views created from now on. |
| `data_table` | TEXT | Convenience: `{schema}.{name}`. |
| `metadata` | JSONB | Per-view: tile config, `schema` tag, etc. **Distinct from the source's metadata** — view metadata is per-snapshot (e.g. tile sources change between uploads), source metadata is the contract. |
| `etl_context_id` | INT | The task that produced this view. Resolves back via `data_manager.tasks`. |
| `view_dependencies` | INT[] | Other view_ids this view was derived from. |

### Per-view physical tables

Each view has its own physical table at `{table_schema}.{table_name}`. The schema is whatever the producing worker decided — DAMA doesn't constrain it.

For DAMA's column-aware UI to work against a view, the **source's** `metadata.columns` must accurately describe the columns the view's table actually has. (DAMA assumes one schema across all views of a source. If a future migration changes columns, write a new source.)

### `data_manager.tasks` and `data_manager.task_events`

The task queue. See "Tasks" below.

---

## metadata.columns contract

This is the single most important thing for any new dataType plugin. **Whenever you create a per-view table, you must also write a column descriptor list to the source's `metadata.columns`.** Without it, DataWrapper, the built-in Table page, the column-aware filter UI, and any downstream UDA-driven page section have no idea what the table looks like and silently render nothing useful.

### Shape

```js
metadata.columns = [
  { name: 'received_at',   display_name: 'Received At',   type: 'TIMESTAMPTZ', desc: null },
  { name: 'title',         display_name: 'Title',         type: 'TEXT',        desc: null },
  { name: 'score',         display_name: 'Score',         type: 'INTEGER',     desc: 'ACR confidence (0-100)' },
  { name: 'raw',           display_name: 'Raw',           type: 'JSONB',       desc: 'Full untouched ACR payload' },
  // …
];
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Must match the physical column name. |
| `display_name` | yes | Header text in the Table page; falls back to `name` if missing but always set it. |
| `type` | yes | Bare Postgres type (`TEXT`, `TIMESTAMPTZ`, `INTEGER`, `JSONB`, etc.). No constraints (`NOT NULL`, `PRIMARY KEY`) — those go in the CREATE TABLE, not here. |
| `desc` | optional | Tooltip / metadata-page description. |

### How to write it

JSONB merge so future writes don't clobber other top-level metadata keys (e.g. tile config that the worker sets later):

```js
await db.query(
  `UPDATE data_manager.sources
   SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
   WHERE source_id = $2 AND (metadata IS NULL OR NOT (metadata ? 'columns'))`,
  [JSON.stringify({ columns, schema: 'my_schema_tag_v1' }), source_id]
);
```

The `AND … NOT (metadata ? 'columns')` guard means a re-run of provisioning won't clobber a hand-edited column list. Drop it if you want re-runs to be authoritative.

### Curated default vs. all columns

Plugins that have many columns (e.g. now_playing's ~50) typically write a **curated default** to `metadata.columns` — the 10-20 worth surfacing in the Table page — and keep a `JSONB raw` column for the full payload. The physical table still has every column; `metadata.columns` only controls what's visible by default. See `data-types/now_playing/schema.js` for a worked example with `COLUMN_METADATA` (curated) and `ALL_COLUMN_METADATA` (full).

### Reference implementations

- `dama/upload/workers/csv-publish.js#L137-L154` — CSV inference path (columns derived from the inferred `tableDescriptor`).
- `dama/upload/workers/gis-publish.js#L253-L267` — GIS path (columns from ogr2ogr's reported types).
- `data-types/now_playing/routes.js#POST /streams` — fixed schema written at provision (no inference needed).

---

## Plugin system (`datatypes/`)

External plugins get loaded at boot via `DMS_EXTRA_DATATYPES` (an env var pointing at a CommonJS bootstrap module). The bootstrap calls `registerDatatype(name, definition)` for each plugin.

### Plugin definition shape

```js
{
  workers: {
    'my_plugin/publish': async (ctx) => { /* ... */ },
  },
  routes: (router, helpers) => {
    router.post('/publish', async (req, res) => { /* ... */ });
  },
}
```

### Mount path

`registerDatatype('my_plugin', def)` → routes mount at `/dama-admin/:pgEnv/my_plugin/*`. The `:pgEnv` segment is mandatory and is what callers (admin UI, plugin pages) use to pick which DAMA database to operate on.

### Worker `ctx`

Passed to every worker handler:

| Field | Type | Notes |
|---|---|---|
| `task` | row from `tasks` | `task.task_id`, `task.descriptor` (whatever was in `queueTask`), `task.source_id`. |
| `pgEnv` | string | DB env name. |
| `db` | adapter | `db.query(sql, params)`. `db.type === 'postgres' \| 'sqlite'`. |
| `dispatchEvent` | fn | `(type, message, payload?) => Promise`. Writes to `task_events`. Type strings double as the polling key — keep the legacy `<datatype>:<EVENT>` format if a client is already polling. |
| `updateProgress` | fn | `(progress: 0..1) => Promise`. Drives the UI progress bar. |

### Route `helpers`

Passed to every `routes` registration:

| Helper | Signature | Purpose |
|---|---|---|
| `queueTask(descriptor, pgEnv)` | `→ Promise<taskId>` | Enqueue a task. `descriptor.workerPath` is the only required field; everything else surfaces as `ctx.task.descriptor.*` in the worker. |
| `getTaskStatus(taskId, pgEnv)` | `→ Promise<row>` | |
| `getTaskEvents(taskId, pgEnv, sinceEventId?)` | `→ Promise<rows>` | |
| `dispatchEvent(taskId, type, message, payload?, pgEnv)` | `→ Promise` | Out-of-band event from a route (rare). |
| `createDamaSource(values, pgEnv)` | `→ Promise<sourceRow>` | Inserts into `data_manager.sources`; auto-suffixes on name collision. Sets default `auth` grant if `user_id` is provided. |
| `createDamaView(values, pgEnv)` | `→ Promise<viewRow>` | Inserts a view, auto-derives `table_schema = 'gis_datasets'` and `table_name = 's{source_id}_v{view_id}'`. Override after the fact via UPDATE if you need different naming. |
| `ensureSchema(db, schemaName)` | `→ Promise` | `CREATE SCHEMA IF NOT EXISTS` on Postgres; no-op on SQLite. |
| `getDb(pgEnv)` | `→ adapter` | Direct DB handle. |
| `loadConfig(pgEnv)` | `→ config` | The raw db config JSON. |
| `storage` | `{ write, read, getUrl }` | Local FS or S3 abstraction. |

### Response contract

Routes that queue a task **must** return `{ etl_context_id, source_id }`. `etl_context_id === task_id` — the legacy admin-UI poll loop hits `/dama-admin/:pgEnv/events/query?etl_context_id=…` and that path still works.

---

## Tasks

`dama/tasks/` is a Postgres-backed task queue. The polling loop runs per-pgEnv (default 5s, override with `DAMA_TASK_POLL_INTERVAL`).

### Lifecycle

1. Route calls `helpers.queueTask({ workerPath, sourceId?, ...descriptor }, pgEnv)`. Inserts a row in `data_manager.tasks` with `status='queued'`, `host_id=<this server>`.
2. Polling loop sees the queued task, runs `UPDATE … SET status='running' … RETURNING …` (row-level locking, no double-claim).
3. Worker runs (`handlers[workerPath](ctx)`) and either resolves with a result (saved to `tasks.result`, `status='done'`) or throws (`status='failed'`, error message saved).
4. Throughout, the worker calls `dispatchEvent` and `updateProgress` to write to `task_events` for client-side polling.

### Host isolation

Every task row carries `host_id`. The polling loop only claims tasks whose `host_id` matches this server's. So if you have two dms-server instances pointing at the same DAMA pgEnv, each only runs the tasks it queued — safe even before adding a load-balancer-aware queue.

### When to use a worker vs. a synchronous route

Use a worker when the operation:
- Takes longer than ~5s,
- Needs progress reporting,
- Should survive a brief client disconnect,
- Or pages through external APIs (e.g. backfills).

Use a synchronous route when the operation is sub-second and the response IS the result (e.g. `now_playing/streams/:id` admin info, webhook ingest).

---

## ClickHouse auxiliary storage (DAMA only)

A DAMA pgEnv config can carry an optional `clickhouse: { ... }` sub-object. When a view's `table_schema` starts with `clickhouse.` (e.g. `clickhouse.npmrds_raw`), DAMA's read path swaps the adapter to a ClickHouse client; the meta lookup (sources, views) still goes to PostgreSQL.

Scope:
- ClickHouse is **read-only auxiliary storage for view rows**. Source/view metadata always lives in PostgreSQL.
- DMS content (`dms.data_items`, split tables) never lives on ClickHouse.
- Write paths aren't implemented — ClickHouse views are populated by out-of-band ingestion.

See `dms-server/CLAUDE.md#ClickHouse auxiliary storage` for config shape.

---

## Common pitfalls

- **"relation `data_manager.sources` does not exist"** on a brand-new pgEnv — the config is missing `"type": "postgres"` (or has it set wrong), so `initDama` never ran. See `dms-server/CLAUDE.md#Database Configs`. The strict config loader now throws at load time when `type` or `role` is missing.
- **"webhook URL points at localhost"** on the create page — `DMS_PUBLIC_URL` isn't set in the deploy env. Without it, the server falls back to `http://localhost:${PORT}` which external services can't reach.
- **Forgetting to write `metadata.columns`** — the per-view table gets created and rows insert fine, but the Table page renders an empty grid and DataWrapper-driven sections show "no columns." The CSV/GIS workers handle this for you; custom dataType plugins must do it explicitly.
- **`table_schema` mismatch** — `createDamaView` sets `table_schema='gis_datasets'` by default. If your worker writes the table somewhere else, UPDATE the view row before relying on `data_table` downstream.
- **Mixing source `metadata` and view `metadata`** — they're both JSONB but different. Source metadata is the schema (columns); view metadata is per-snapshot (tile sources, dependencies, schema-version tag).
- **JSONB array stringification** — `node-postgres` serializes JS arrays as PG array literals (`'{{"x"}}'`), which doesn't cast to JSONB. Always `JSON.stringify(value)` before passing into a `$N::jsonb` slot. `metadata.js` already does this for the canonical fields.
