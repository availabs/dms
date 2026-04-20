# DAMA datatypes migration to dms-server plugin system

## Status: NOT STARTED — guide for a first-pass conversion of `enhance_nfip_claims_v2`

## Objective

Port the legacy DAMA datatypes in `references/avail-falcor/dama/routes/data_types/**` to the new `registerDatatype` plugin system in `@availabs/dms-server`. Each ported datatype becomes a small, self-contained plugin that:

- Registers task-runner workers (replaces pg-boss workers)
- Defines Express routes mounted under `/dama-admin/:pgEnv/{name}/` (replaces Falcor route auto-discovery)
- Uses the new task system's `ctx.dispatchEvent` / `ctx.updateProgress` helpers (replaces the `handleEvent` / `init` / `fin` macros)

The ported code lives **outside** the `@availabs/dms` submodule — in `dms-template/data-types/` — and is registered by the dms-template's own startup glue. This keeps application-specific datatypes out of the shared library and avoids churn in the submodule when product-specific behavior changes.

## Why now

The dama-server-port task (completed 2026-04) removed the legacy DAMA server side of this monorepo. The old `references/avail-falcor/...` tree is reference-only — nothing in production points at it. Map editor features that used to publish NFIP claims (and NRI, SHELDUS, HMA projects, etc.) still need those datatypes to work; the new plugin shape is the migration path.

## Scope

### In scope for this task

- Directory layout for app-owned datatypes (`dms-template/data-types/...`)
- Bootstrapper glue in `dms-template` that registers plugins into dms-server before it starts listening
- Complete first-pass port of `enhance_nfip_claims_v2` as the reference implementation (guide walks through every step)
- Conversion guide (legacy-to-new API mapping, gotchas, testing checklist) that subsequent datatypes can follow

### Out of scope (follow-up tasks)

- Porting the remaining hazmit datatypes (`nri`, `sheldus`, `disaster_loss_summary`, `fusion`, `usda`, `flood_map`, etc.) — each is its own task using this guide as the template
- Porting the GIS-specific wrappers already handled by `dms-server/src/dama/upload/workers/`
- Rewriting the legacy `initialize_dama_src_metadata_using_view_2` PG stored procedure if it's needed — for now, call it as-is against a DAMA-role database
- Client-side route changes — tracked separately once the server-side endpoint lands

---

## Where things go

### Directory layout

```
dms-template/
├── data-types/                              ← NEW — app-owned datatypes
│   └── enhance-nfip-claims/
│       ├── index.js                         ← exports { workers, routes } — the plugin definition
│       ├── worker.js                        ← the publish worker (ctx → result)
│       └── enhance.js                       ← the big enhance SQL (pulled out for readability)
│
├── server/                                  ← NEW — dms-template's server glue
│   └── register-datatypes.js                ← entry point imported by dms-server at boot
│
└── src/dms/packages/dms-server/             ← @availabs/dms-server submodule (unchanged)
    └── src/
        ├── index.js                         ← calls the register-datatypes bootstrapper
        └── dama/datatypes/
            ├── index.js                     ← registerDatatype / mountDatatypeRoutes (unchanged)
            └── pmtiles.js                   ← stays here; example of a library-level plugin
```

**Rule of thumb:** datatypes that are part of the general DMS library (used by every app — e.g. `pmtiles`) stay inside the submodule. Datatypes specific to a vertical (hazmit, transport, etc.) live in the app repo under `data-types/` and are registered externally.

### Bootstrap wiring

The dms-server is designed to be import-hooked. It already calls `registerDatatype('pmtiles', ...)` from its own `index.js` before `mountDatatypeRoutes`. We extend that by reading an env var (or a fixed path) that points at the template's registration module:

```js
// src/dms/packages/dms-server/src/index.js  (small patch — see below)
const extraDatatypes = process.env.DMS_EXTRA_DATATYPES;
if (extraDatatypes) {
  const registerExtra = require(extraDatatypes);
  registerExtra({ registerDatatype });   // app-supplied hook
}
```

```js
// dms-template/server/register-datatypes.js
module.exports = function registerExtra({ registerDatatype }) {
  registerDatatype('enhance-nfip-claims', require('../data-types/enhance-nfip-claims'));
  // registerDatatype('nri', require('../data-types/nri'));
  // registerDatatype('sheldus', require('../data-types/sheldus'));
  // ... etc.
};
```

```bash
# .env (template root)
DMS_EXTRA_DATATYPES=/abs/path/to/dms-template/server/register-datatypes.js
```

**Why env var and not `require()` hardcoded in the submodule:** keeps the submodule agnostic of the consuming app. Multiple apps can consume `@availabs/dms-server` and each registers its own datatype bundle. Also makes testing/dev simpler — point `DMS_EXTRA_DATATYPES` at a mock file to test registration.

**Acceptable alternative (Option A — quicker, higher coupling):** edit `src/dms/packages/dms-server/src/index.js` directly to `require('../../../../../server/register-datatypes.js')`. Works, but creates a submodule→app upward dependency which we generally avoid. Use this only as a temporary bridge while the pattern is being validated.

---

## The plugin shape — quick reference

A datatype module exports a single object with two optional keys:

```js
// data-types/<name>/index.js
module.exports = {
  workers: {
    'enhance-nfip-claims/publish': require('./worker'),
    // ...additional worker paths as needed
  },
  routes: (router, helpers) => {
    router.post('/publish', require('./publish-route')(helpers));
    // ...additional routes
  },
};
```

### `workers` — map of workerPath → handler

- **workerPath is any string** but convention is `{datatypeName}/{action}` — it's what the task table stores in `worker_path` and how `registerHandler` keys it. It is **unrelated** to the URL the client hits.
- **Handler signature:** `async (ctx) => result` where `result` is whatever you want persisted on `tasks.result` (keep it small — clients poll it via `getTaskStatus`).
- **`ctx` shape** (from `src/dama/tasks/index.js` `startTaskWorker`):

| key | type | what it is |
|-----|------|------------|
| `ctx.task` | object | the row from `data_manager.tasks` (or `tasks` for sqlite). Has `task_id`, `descriptor` (the object you passed to `queueTask`), `source_id`, `worker_path`, etc. |
| `ctx.pgEnv` | string | the database config name the task is running against (e.g., `'npmrds2'`) |
| `ctx.db` | db adapter | `getDb(pgEnv)` — use `ctx.db.query(sql, params)`. `db.type` is `'postgres'` or `'sqlite'`. |
| `ctx.dispatchEvent` | fn | `(type, message, payload?) => Promise` — writes to `task_events`. `type` is a short tag (e.g., `'enhance-nfip:INITIAL'`); clients poll events and render them. |
| `ctx.updateProgress` | fn | `(progress: 0..1) => Promise` — sets `tasks.progress` for UI progress bars. |

### `routes(router, helpers)` — Express routes mounted at `/dama-admin/:pgEnv/{name}/`

- **`router`** is a fresh `express.Router({ mergeParams: true })` — so `req.params.pgEnv` is available.
- **URL prefix** is `/dama-admin/:pgEnv/{name}/` where `{name}` is the first arg to `registerDatatype`. A `router.post('/publish', ...)` becomes `POST /dama-admin/:pgEnv/enhance-nfip-claims/publish`.
- **`helpers`** — shared utilities passed in by `mountDatatypeRoutes`:

| helper | purpose |
|--------|---------|
| `helpers.queueTask(descriptor, pgEnv)` | enqueue a task. Returns `taskId`. `descriptor.workerPath` is required; everything else is plugin-defined and surfaces as `ctx.task.descriptor` in the worker. |
| `helpers.getTaskStatus(taskId, pgEnv)` | fetch the task row (status, progress, result, error). |
| `helpers.getTaskEvents(taskId, pgEnv, sinceEventId?)` | fetch events since a given event id — used for long-polling from the client. |
| `helpers.dispatchEvent(taskId, type, message, payload?, pgEnv)` | write an event out-of-band (rare in routes; used when the route wants to mark progress outside a worker). |
| `helpers.createDamaSource({ name, type, user_id, ... }, pgEnv)` | insert a `data_manager.sources` row. Handles name collisions with `_N` suffixes. |
| `helpers.createDamaView({ source_id, user_id, etl_context_id, metadata, ... }, pgEnv)` | insert a `data_manager.views` row, auto-populate `table_schema`/`table_name`/`data_table` as `gis_datasets.s{source_id}_v{view_id}`. |
| `helpers.ensureSchema(db, schemaName)` | `CREATE SCHEMA IF NOT EXISTS` (no-op on sqlite). |
| `helpers.getDb(pgEnv)` | raw db adapter, same as `ctx.db` in workers. |
| `helpers.loadConfig(pgEnv)` | read the database config JSON for the env. |
| `helpers.storage` | the local/S3 storage service — `.write(path, stream)`, `.read(path)`, `.getUrl(path)`. |

### Task descriptor contract

When a route queues a task:

```js
const taskId = await helpers.queueTask({
  workerPath: 'enhance-nfip-claims/publish',   // required — the key in `workers`
  sourceId: req.body.existing_source_id ?? null, // optional — tracked on tasks.source_id for UI filtering
  // Everything else is plugin-free-form; worker reads it as ctx.task.descriptor.*
  table_name: req.body.table_name,
  nfip_schema: req.body.nfip_schema,
  user_id: req.user.id,
  // ...
}, req.params.pgEnv);

res.json({ etl_context_id: taskId, source_id: req.body.existing_source_id ?? null });
```

The response shape `{ etl_context_id, source_id }` matches what the legacy client expects — the new `task_id` *is* the legacy `etl_context_id`. The client's event polling loop (via `GET /dama-admin/:pgEnv/events/query?etl_context_id=X`) works unchanged because the task runner writes events in the legacy-compatible format.

---

## Legacy → new API mapping

| Legacy (avail-falcor/dama) | New (dms-server) |
|---------------------------|------------------|
| `const { queueTask } = require('#dama/admin/index.js')` | `helpers.queueTask` inside a route |
| `dama_task_descr = { parent_context_id, worker_path, initial_event: { payload, type }, meta }` | `descriptor = { workerPath, sourceId, ...anyFields }` — no more event envelope |
| `initial_task.initial_event.payload.table_name` (in worker) | `ctx.task.descriptor.table_name` |
| `const { createSource, createView, dispatchEvent, logger } = require('#dama/admin/index.js')` | `helpers.createDamaSource` + `helpers.createDamaView` + `ctx.dispatchEvent` + `console` |
| `await query(sql, pgEnv)` / `await query({ text, values }, pgEnv)` | `await ctx.db.query(sql, params)` — same SQL, different call shape |
| `await query("BEGIN"/"COMMIT", pgEnv)` in each step | Explicit `await ctx.db.query('BEGIN')` / `COMMIT` / `ROLLBACK`; wrap with try/finally. **The task runner does not auto-commit between event dispatches.** |
| `init({ payload, type, etl_context_id })` macro → (source_id, view_id) | Replace with direct `helpers.createDamaSource` + `helpers.createDamaView` calls + explicit `SRC_CREATE` / `VIEW_CREATE` events via `ctx.dispatchEvent`. |
| `handleEvent({ type, event, user_id, email, payload, etl_context_id, pgEnv })` | `ctx.dispatchEvent('{datatype}:{EVENT}', humanMessage, payload)` — the task_id is implicit, the pgEnv is implicit, user/email live in `ctx.task.descriptor` |
| `update_view({...})` macro | Direct `UPDATE data_manager.views SET table_schema = $1, table_name = $2, ...` through `ctx.db.query`. If the view should follow the new `s{source_id}_v{view_id}` naming, do nothing — `createDamaView` already set it. |
| `fin({ pgEnv, type, user_id, email, etl_context_id, payload })` | Return a `result` object from the worker + `ctx.dispatchEvent('{datatype}:FINAL', msg, payload)`. The task runner completes the task automatically when the handler returns. |
| `err({ e, pgEnv, ... })` — dispatches ERROR + `throw` | Just `throw` from the handler. The task runner catches and calls `failTask` which writes the error event. If you need a custom ERROR event shape, `await ctx.dispatchEvent(...)` before `throw`. |
| `logger.info`, `logger.error` | `console.log`/`console.error` — stdout is captured per-task with a `[task:X]` prefix by the worker runner (see `dama/tasks/worker-runner.js`). |
| `CALL _data_manager_admin.initialize_dama_src_metadata_using_view_2(view_id)` (inside `update_view`) | Same SQL, still works against DAMA-role PG. Run with `ctx.db.query` when the target db is `postgres`. |
| `prodURL` / `dama/config/index.js` | `process.env.DAMA_SERVER_URL` (or construct from request `req.protocol + req.get('host')` in the route). |
| route file exports `[{ route, method, handler }, ...]` | `routes(router, helpers)` callback — use standard Express router methods |

---

## Step-by-step: port `enhance_nfip_claims_v2`

Everything below is concrete — a developer following this guide produces a working plugin.

### 1. Create the directory

```bash
mkdir -p dms-template/data-types/enhance-nfip-claims
```

Three files go in here: `enhance.js`, `worker.js`, `index.js`.

### 2. `enhance.js` — the SQL helper

Copy the body of `references/avail-falcor/dama/routes/data_types/hazmit/enhance_nfip_claims_v2/enhance.mjs`. Two changes:

- Swap `import { query } from '#db/pgEnvs.js'` for a parameter: the function now takes a `db` adapter.
- Swap `await query(sql, pgEnv)` for `await db.query(sql)`.
- Export as CommonJS (`module.exports = ...`) to match the rest of dms-server's code style.

```js
// data-types/enhance-nfip-claims/enhance.js
/**
 * Enhance NFIP claims: joins against disaster declarations, FEMA counties,
 * and state-specific jurisdictions to produce an enhanced claims table.
 * Ported verbatim from avail-falcor/dama/routes/data_types/hazmit/enhance_nfip_claims_v2/enhance.mjs.
 */
module.exports = async function enhance({
  db,
  table_name,
  nfip_schema, nfip_table,
  dds_schema, dds_table,
  county_schema, county_table,
  jurisdiction_schema, jurisdiction_table,
}) {
  const sql = `
    WITH disasters AS (
      SELECT
        disaster_number::text,
        incident_type,
        fips_state_code || fips_county_code AS geoid,
        MIN(incident_begin_date) AS incident_begin_date,
        MAX(incident_end_date)   AS incident_end_date
      FROM ${dds_schema}.${dds_table}
      WHERE disaster_number NOT BETWEEN 3000 AND 3999
        AND incident_type IN (
          'Coastal Storm', 'Dam/Levee Break', 'Flood', 'Hurricane',
          'Severe Storm', 'Severe Storm(s)', 'Tornado', 'Tsunami', 'Typhoon'
        )
      GROUP BY 1, 2, 3
      ORDER BY 1 DESC
    ),
    enhanced_geoids AS (
      SELECT geoid, nfip.*
      FROM ${nfip_schema}.${nfip_table} nfip
      LEFT JOIN ${county_schema}.${county_table} county
        ON ST_Contains(county.geom, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326))
      WHERE county_code IS NULL
        AND latitude + longitude IS NOT NULL
      UNION ALL
      SELECT county_code AS geoid, *
      FROM ${nfip_schema}.${nfip_table} nfip
      WHERE county_code IS NOT NULL
         OR latitude + longitude IS NULL
    ),
    nfip_ny AS (
      SELECT * FROM enhanced_geoids WHERE state = 'NY'
    ),
    jurisdiction_match AS (
      SELECT
        nfip.*,
        j.geoid AS jurisdiction_geoid
      FROM nfip_ny nfip
      LEFT JOIN LATERAL (
        SELECT j.geoid
        FROM ${jurisdiction_schema}.${jurisdiction_table} j
        WHERE j.census_type IN ('place', 'cousub')
          AND j.geom && ST_SetSRID(ST_MakePoint(nfip.longitude, nfip.latitude), 4326)
          AND ST_Contains(j.geom, ST_SetSRID(ST_MakePoint(nfip.longitude, nfip.latitude), 4326))
        ORDER BY
          CASE j.census_type WHEN 'place' THEN 1 WHEN 'cousub' THEN 2 ELSE 3 END
        LIMIT 1
      ) j ON TRUE
      UNION ALL
      SELECT nfip.*, NULL AS jurisdiction_geoid
      FROM enhanced_geoids nfip
      WHERE nfip.state <> 'NY'
    )
    SELECT * INTO ${nfip_schema}.${table_name}
    FROM (
      SELECT
        dd.disaster_number::text,
        dd.incident_type,
        nfip.*,
        ST_SetSRID(ST_MakePoint(nfip.longitude, nfip.latitude), 4326) AS wkb_geometry,
        COALESCE(amount_paid_on_contents_claim, 0) +
        COALESCE(amount_paid_on_building_claim, 0) +
        COALESCE(amount_paid_on_increased_cost_of_compliance_claim, 0) AS total_amount_paid
      FROM jurisdiction_match nfip
      LEFT JOIN disasters dd
        ON nfip.geoid = dd.geoid
       AND nfip.date_of_loss BETWEEN dd.incident_begin_date AND dd.incident_end_date
    ) final_table;

    ALTER TABLE ${nfip_schema}.${table_name}
      ADD COLUMN ogc_fid SERIAL PRIMARY KEY;
  `;

  await db.query(sql);
};
```

### 3. `worker.js` — the publish worker

Reads task descriptor, creates source + view on first run, runs `enhance.js`, updates view metadata with tiles config, dispatches `FINAL`.

Key structural differences vs the legacy worker:

- No `initial_event.payload` envelope — the route passes fields directly into the descriptor.
- No `init()` macro — `createDamaSource` / `createDamaView` are called inline.
- No `err` macro — any throw becomes a task failure; if you need a domain-specific error event, dispatch it before throwing.
- Transaction boundaries are explicit — `BEGIN` / `COMMIT` / `ROLLBACK` go around the bulk SQL so a failure doesn't leave a half-populated table behind.

```js
// data-types/enhance-nfip-claims/worker.js
const enhance = require('./enhance');
const { createDamaSource, createDamaView, ensureSchema } = require(
  '@availabs/dms-server/src/dama/upload/metadata'  // or relative path if not resolvable
);

// Default style for the tiles config — matches the legacy default.
const DEFAULT_POINT_STYLE = {
  type: 'circle',
  paint: { 'circle-color': '#8ac', 'circle-radius': 4, 'circle-opacity': 0.8 },
};

module.exports = async function enhanceNfipClaimsWorker(ctx) {
  const { task, pgEnv, db, dispatchEvent, updateProgress } = ctx;

  if (db.type !== 'postgres') {
    throw new Error('enhance-nfip-claims requires PostgreSQL');
  }

  const {
    // source + user metadata
    existing_source_id,
    source_name,                   // used only when existing_source_id is null
    user_id,
    email,
    // table info
    table_name,                    // base name; view_id gets appended
    // dependencies
    nfip_schema, nfip_table,
    dds_schema, dds_table,
    county_schema, county_table,
    jurisdiction_schema, jurisdiction_table,
  } = task.descriptor;

  const srcType = table_name;      // legacy used table_name as the event type tag
  const shouldCreateSource = !existing_source_id;

  await dispatchEvent(`${srcType}:INITIAL`, 'enhance-nfip-claims started', null);
  await updateProgress(0.05);

  // 1. Ensure source + view exist
  let sourceId = existing_source_id;
  if (shouldCreateSource) {
    const src = await createDamaSource(
      { name: source_name, type: srcType, user_id },
      pgEnv
    );
    sourceId = src.source_id;
    await dispatchEvent(`${srcType}:SRC_CREATE`, `Source created (id=${sourceId})`, { source_id: sourceId });
  }

  const view = await createDamaView(
    {
      source_id: sourceId,
      user_id,
      etl_context_id: task.task_id,
      metadata: { email },         // anything you want on the view row up front
    },
    pgEnv
  );
  const viewId = view.view_id;
  await dispatchEvent(`${srcType}:VIEW_CREATE`, `View created (id=${viewId})`, { view_id: viewId });
  await updateProgress(0.1);

  // 2. Make sure the target schema exists
  await ensureSchema(db, nfip_schema);

  // 3. Run enhance inside a transaction
  const enhancedTableName = `${table_name}_${viewId}`;   // legacy convention

  await dispatchEvent(`${srcType}:ENHANCE_INIT`, 'Running enhance SQL', null);
  await db.query('BEGIN');
  try {
    await enhance({
      db,
      table_name: enhancedTableName,
      nfip_schema, nfip_table,
      dds_schema, dds_table,
      county_schema, county_table,
      jurisdiction_schema, jurisdiction_table,
    });
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    // Domain-specific error event before rethrow; task runner writes a generic ERROR event on throw.
    await dispatchEvent(`${srcType}:ENHANCE_ERROR`, err.message, null);
    throw err;
  }
  await dispatchEvent(`${srcType}:ENHANCE_FIN`, 'Enhance SQL complete', null);
  await updateProgress(0.85);

  // 4. Point the view at the enhanced table and wire up tiles metadata
  const tilesMeta = {
    tiles: {
      sources: [{
        id: enhancedTableName,
        source: {
          tiles: [`${process.env.DAMA_SERVER_URL || ''}/dama-admin/${pgEnv}/tiles/${viewId}/{z}/{x}/{y}/t.pbf`],
          format: 'pbf',
          type: 'vector',
        },
      }],
      layers: [{
        id: `s${sourceId}_v${viewId}_tPoint`,
        ...DEFAULT_POINT_STYLE,
        source: enhancedTableName,
        'source-layer': `view_${viewId}`,
      }],
    },
  };

  await db.query(`
    UPDATE data_manager.views
       SET table_schema = $1,
           table_name   = $2,
           data_table   = $3,
           metadata     = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
     WHERE view_id = $5
  `, [
    nfip_schema,
    enhancedTableName,
    `${nfip_schema}.${enhancedTableName}`,
    tilesMeta,
    viewId,
  ]);
  await dispatchEvent(`${srcType}:UPDATE_VIEW_INFO`, 'View metadata written', null);

  // 5. Run the legacy admin stored proc ONLY when we just created the source.
  if (shouldCreateSource) {
    await db.query(`CALL _data_manager_admin.initialize_dama_src_metadata_using_view_2($1)`, [viewId]);
    await dispatchEvent(`${srcType}:CREATE_META`, 'Source metadata initialized', null);
  }

  await updateProgress(1);

  const result = { source_id: sourceId, view_id: viewId, table: `${nfip_schema}.${enhancedTableName}` };
  await dispatchEvent(`${srcType}:FINAL`, 'enhance-nfip-claims complete', result);
  return result;
};
```

### 4. `index.js` — the plugin definition

```js
// data-types/enhance-nfip-claims/index.js
const worker = require('./worker');

module.exports = {
  workers: {
    'enhance-nfip-claims/publish': worker,
  },
  routes: (router, helpers) => {
    router.post('/publish', async (req, res) => {
      try {
        const { pgEnv } = req.params;
        const {
          existing_source_id, source_name,
          user_id, email,
          table_name,
          nfip_schema, nfip_table,
          dds_schema, dds_table,
          county_schema, county_table,
          jurisdiction_schema, jurisdiction_table,
        } = req.body || {};

        if (!table_name) return res.status(400).json({ error: 'table_name is required' });
        if (!nfip_schema || !nfip_table)
          return res.status(400).json({ error: 'nfip_schema + nfip_table required' });

        const taskId = await helpers.queueTask({
          workerPath: 'enhance-nfip-claims/publish',
          sourceId: existing_source_id ?? null,
          existing_source_id: existing_source_id ?? null,
          source_name,
          user_id, email,
          table_name,
          nfip_schema, nfip_table,
          dds_schema, dds_table,
          county_schema, county_table,
          jurisdiction_schema, jurisdiction_table,
        }, pgEnv);

        // etl_context_id is what the legacy client polls — it IS the task_id here.
        res.json({ etl_context_id: taskId, source_id: existing_source_id ?? null });
      } catch (err) {
        console.error('[enhance-nfip-claims] route failed:', err);
        res.status(500).json({ error: err.message });
      }
    });
  },
};
```

**URL the client POSTs to:** `POST /dama-admin/:pgEnv/enhance-nfip-claims/publish` — different from legacy `POST /:pgEnv/hazard_mitigation/enhance-nfip-claims-v2`, so the client calling code needs one URL update. Flag this in the migration PR so the map editor / admin front-end is updated in lockstep.

### 5. Register the plugin

```js
// dms-template/server/register-datatypes.js
module.exports = function registerExtra({ registerDatatype }) {
  registerDatatype('enhance-nfip-claims', require('../data-types/enhance-nfip-claims'));
};
```

### 6. Small submodule patch to invite the bootstrapper

Add after the `registerDatatype('pmtiles', ...)` line in `src/dms/packages/dms-server/src/index.js` (~line 158):

```js
const extraDatatypes = process.env.DMS_EXTRA_DATATYPES;
if (extraDatatypes) {
  try {
    const registerExtra = require(extraDatatypes);
    registerExtra({ registerDatatype });
  } catch (e) {
    console.error(`[datatypes] Failed to load DMS_EXTRA_DATATYPES=${extraDatatypes}:`, e.message);
  }
}
```

This is a **3-line submodule change**. Proposed upstream (not a hard dependency of this task — an Option A fallback that hardcodes `require('../../../../../server/register-datatypes.js')` works today). Prefer the env-var approach because it's backward-compatible and other apps consuming the library need the same hook.

### 7. Wire the env var

```bash
# dms-template/.env
DMS_EXTRA_DATATYPES=/home/alex/code/avail/dms-template/server/register-datatypes.js
```

For Docker: set the env var in the server container's environment; mount `data-types/` and `server/` into the image (or install them as a package — either works).

### 8. Smoke test

```bash
# 1. Boot the server
cd dms-template
npm run server:dev   # or wherever dms-server gets started

# Expect startup log:
#   [datatypes] Registered: pmtiles
#   [datatypes] Registered: enhance-nfip-claims
#   [datatypes] Mounted routes for 2 datatype(s)

# 2. POST a test payload (replace schema/table names with real test-env targets)
curl -X POST http://localhost:3001/dama-admin/npmrds2/enhance-nfip-claims/publish \
  -H 'Content-Type: application/json' \
  -d '{
    "table_name": "nfip_claims_enhanced_test",
    "user_id": 1,
    "email": "test@example.com",
    "nfip_schema": "open_fema",
    "nfip_table": "fima_nfip_claims",
    "dds_schema": "open_fema",
    "dds_table": "disaster_declarations_summaries_v2",
    "county_schema": "geo",
    "county_table": "tl_2019_us_county",
    "jurisdiction_schema": "geo",
    "jurisdiction_table": "jurisdictions"
  }'

# Expected response:
#   { "etl_context_id": 1234, "source_id": null }

# 3. Poll events
curl "http://localhost:3001/dama-admin/npmrds2/events/query?etl_context_id=1234&event_id=-1"

# Expected event stream:
#   nfip_claims_enhanced_test:INITIAL
#   nfip_claims_enhanced_test:SRC_CREATE
#   nfip_claims_enhanced_test:VIEW_CREATE
#   nfip_claims_enhanced_test:ENHANCE_INIT
#   nfip_claims_enhanced_test:ENHANCE_FIN
#   nfip_claims_enhanced_test:UPDATE_VIEW_INFO
#   nfip_claims_enhanced_test:CREATE_META
#   nfip_claims_enhanced_test:FINAL

# 4. Verify the rows landed:
#   SELECT * FROM data_manager.sources WHERE type = 'nfip_claims_enhanced_test';
#   SELECT * FROM data_manager.views WHERE source_id = <id>;
#   SELECT COUNT(*) FROM open_fema.nfip_claims_enhanced_test_<view_id>;
```

---

## Known gotchas / design notes

### pgEnv semantics changed

- **Legacy:** `pgEnv` was a key in the `env_json` env-array used by `#db/pgEnvs.js`. Some legacy workers opened one connection per pgEnv via raw pg client pools.
- **New:** `pgEnv` is a `db/configs/*.config.json` filename (without extension). `ctx.db` / `helpers.getDb(pgEnv)` uses the shared adapter layer, which handles pooling + postgres/sqlite abstraction. **Don't** open your own `pg.Client` in workers.

### Transactions are explicit

The legacy `#db/pgEnvs.js` autoran queries and used `BEGIN`/`COMMIT` interspersed with event dispatches to ensure progress was visible. The new `ctx.db.query` is a straight query call on the adapter — no implicit transactions. When porting, wrap the "bulk work" in an explicit transaction **inside** the worker. Event dispatches (`ctx.dispatchEvent`) write to the same connection but to `data_manager.task_events`, which is a separate table — they commit independently, which is what we want (progress visible even mid-transaction).

### `initial_event` envelope is gone

Legacy workers destructured `initial_task.initial_event.payload`. The new ctx is just `task.descriptor` — everything the route put in the queueTask call surfaces here at the top level. When porting, flatten the legacy payload into the descriptor.

### Event type naming

Legacy used `${table_name}:${EVENT}` (e.g., `nfip_claims_enhanced:INITIAL`). The client's event polling is keyed on the legacy `type` field, so **keep the same format** when porting. The new `ctx.dispatchEvent(type, message, payload)` stores `type` verbatim — no namespacing is enforced.

### Source / view naming divergence

- Legacy `update_view` set `table_schema`/`table_name` to `<schema>.<table_name>_<view_id>` (e.g., `nfip.nfip_claims_v2_12345`).
- New `createDamaView` defaults to `gis_datasets.s<source_id>_v<view_id>` (e.g., `gis_datasets.s42_v17`).

For the NFIP port, the enhanced table goes in the user-chosen schema (e.g., `nfip`), not `gis_datasets`. The worker explicitly overrides `table_schema` / `table_name` in the final `UPDATE data_manager.views` call — see step 4 of the worker. You **must** decide per datatype whether to keep the legacy naming or adopt the new `s<source_id>_v<view_id>` convention. For this datatype: keep legacy, because existing views and downstream consumers assume the `{table_name}_{view_id}` pattern.

### `initialize_dama_src_metadata_using_view_2` is a DAMA PG stored proc

It only exists in a DAMA-role PG database (the `_data_manager_admin` schema is loaded by the DAMA init scripts). When running against a non-DAMA DB, skip the call. The worker gates on `shouldCreateSource` today — sufficient because new-source runs only happen against DAMA DBs.

### `prodURL` is gone

The legacy `dama/config/index.js` exported a hardcoded prod URL. In the new world, use `process.env.DAMA_SERVER_URL` (already referenced by other parts of the system) or derive from the request — but workers don't have a request context. Use the env var. Fall back to an empty string (relative URLs) for local dev where tile paths go through the same origin as the UI.

### Logging

- `console.log` from a worker is captured by `dama/tasks/worker-runner.js` and prefixed `[task:XXXX]` in the parent process's stdout.
- Don't use `logger.info`/`logger.error` — no shared logger exists in the new tree.
- If the line is useful post-mortem (i.e., you want it in `task_events`, not just server logs), use `ctx.dispatchEvent` instead of `console.log`.

---

## Migration checklist

- [ ] Create `dms-template/data-types/enhance-nfip-claims/{index.js,worker.js,enhance.js}` per step 2–4
- [ ] Create `dms-template/server/register-datatypes.js` with the NFIP registration
- [ ] Patch `src/dms/packages/dms-server/src/index.js` to invite `DMS_EXTRA_DATATYPES` (3-line addition — upstream to the submodule)
- [ ] Add `DMS_EXTRA_DATATYPES` to `.env.example` (root + dms-server)
- [ ] Smoke test: startup log includes `Registered: enhance-nfip-claims`
- [ ] Smoke test: POST a test payload against a disposable pgEnv; events stream; enhanced table populates; `data_manager.sources`/`data_manager.views` rows present
- [ ] Client-side: update the map-editor / admin UI call sites that POST to `/hazard_mitigation/enhance-nfip-claims-v2` to hit `/enhance-nfip-claims/publish` instead (separate PR, flag in this one's description)
- [ ] Add an entry to the submodule's `planning/todo.md` under a new "datatypes" topic (the template's `dms-template/planning/...` if we start tracking there)
- [ ] Follow-up tasks for remaining hazmit datatypes referenced in the overview below

## Follow-up datatypes (tasks to create)

Each of the directories in `references/avail-falcor/dama/routes/data_types/hazmit/` becomes its own follow-up task, using this guide as the template. Some are complex enough to warrant separate task files:

- `nri` — NRI dataset publish (has a `utils/` directory with additional helpers)
- `sheldus` — SHELDUS dataset
- `disaster_loss_summary` — fusion across multiple sources
- `fusion` — multi-source fusion pipeline
- `enhance_hma_projects_v4` — HMA projects enhance (geocoding)
- `enhance_ihp`, `enhance_ncei`, `enhance_pa_funded_projects_v1/v2` — similar enhance-style pipelines
- `flood_map` — flood extent rasters (non-vector)
- `jurisdiction` — jurisdiction geometry sources
- `open_fema_data` — base FEMA loaders (may already be covered by the new CSV/GIS pipelines)
- `sba`, `usda`, `usda_enhanced`, `ncei` — additional enhance/load pipelines

The pattern is always the same. Each file boils down to: `index.js` (plugin shape) + `worker.js` (port the `.worker.mjs`) + any SQL helpers extracted for readability.

---

## Open questions for review

1. **Where does the bootstrapper live exactly?** `dms-template/server/register-datatypes.js` feels right but hasn't been ratified — check with the team before committing the env-var name `DMS_EXTRA_DATATYPES`.
2. **Should the port be one-to-one or should we take the opportunity to consolidate?** Several `enhance_*` datatypes share a nearly identical worker skeleton (init → SQL → update_view → fin). Consider a small helper module in `data-types/_shared/` that centralizes the boilerplate. Decide before porting the second datatype.
3. **Testing strategy.** The legacy tree has no tests for these datatypes. At minimum, add a graph-harness-style integration test per datatype that seeds a sqlite fixture, POSTs, polls, and asserts task completes — same pattern as `tests/test-upload-pipeline.js`.
4. **Client call-site updates.** The URL change from `/hazard_mitigation/enhance-nfip-claims-v2` → `/enhance-nfip-claims/publish` needs a coordinated front-end change. Worth maintaining a backward-compat shim in `dms-server/src/dama/upload/routes.js` (like the existing `/events/query` compat shim) if a gradual migration is preferred.
