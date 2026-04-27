# DAMA `enhance_nfip_claims_v2` migration to the dms-server plugin system

## Status: NOT STARTED — first concrete plugin built on the new bootstrap path

## Depends on

[`datatypes-plugin-infrastructure.md`](./datatypes-plugin-infrastructure.md) — that task sets up `data-types/`, `server/register-datatypes.js`, the `DMS_EXTRA_DATATYPES` submodule patch, and a smoke-test plugin. **Complete it first.** This task picks up where the smoke test ends — replacing the throwaway `_hello-world` plugin with the real `enhance-nfip-claims` plugin.

## Objective

Port the legacy `references/avail-falcor/dama/routes/data_types/hazmit/enhance_nfip_claims_v2/` datatype to the new `registerDatatype` plugin shape inside `dms-template/data-types/enhance-nfip-claims/`. The new plugin:

- Registers a publish worker (replaces pg-boss worker)
- Defines an Express `POST /publish` route mounted at `/dama-admin/:pgEnv/enhance-nfip-claims/`
- Uses the new task system's `ctx.dispatchEvent` / `ctx.updateProgress` helpers (replaces `handleEvent` / `init` / `fin` macros)
- Calls the legacy `_data_manager_admin.initialize_dama_src_metadata_using_view_2(view_id)` PG stored proc as-is, against a DAMA-role database

This task serves as the **reference implementation** for every subsequent hazmit datatype port (`map21`, `nri`, `sheldus`, etc.). Subsequent ports should mirror its structure.

## Scope

### In scope

- `dms-template/data-types/enhance-nfip-claims/{index.js, worker.js, enhance.js}`
- One-line registration in `dms-template/server/register-datatypes.js`
- Smoke test against a disposable pgEnv (events stream, table populates, `data_manager.sources`/`views` rows present)

### Out of scope

- Porting any other hazmit datatype — each gets its own task using this one as the template
- Rewriting the legacy `initialize_dama_src_metadata_using_view_2` PG stored procedure — call it as-is
- Client-side route changes — tracked separately once the server endpoint lands

> Plugin shape, helpers reference, legacy→new API mapping, and common gotchas live in [`datatypes-plugin-infrastructure.md`](./datatypes-plugin-infrastructure.md). This file references that doc instead of duplicating it.

---

## Step-by-step port

### 1. Create the directory

```bash
mkdir -p dms-template/data-types/enhance-nfip-claims
```

Three files: `enhance.js`, `worker.js`, `index.js`.

### 2. `enhance.js` — the SQL helper

Copy the body of `references/avail-falcor/dama/routes/data_types/hazmit/enhance_nfip_claims_v2/enhance.mjs`. Three changes:

- Swap `import { query } from '#db/pgEnvs.js'` for a parameter — the function now takes a `db` adapter.
- Swap `await query(sql, pgEnv)` for `await db.query(sql)`.
- Export as CommonJS (`module.exports = ...`) to match the rest of dms-server's code style.

```js
// data-types/enhance-nfip-claims/enhance.js
/**
 * Joins NFIP claims against disaster declarations, FEMA counties, and
 * state-specific jurisdictions to produce an enhanced claims table.
 * Ported verbatim from avail-falcor/.../hazmit/enhance_nfip_claims_v2/enhance.mjs.
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
- No `err` macro — any throw becomes a task failure; if you want a domain-specific error event, dispatch it before throwing.
- Transaction boundaries are explicit — `BEGIN` / `COMMIT` / `ROLLBACK` go around the bulk SQL so a failure doesn't leave a half-populated table behind.

```js
// data-types/enhance-nfip-claims/worker.js
const enhance = require('./enhance');
const { createDamaSource, createDamaView, ensureSchema } = require(
  '@availabs/dms-server/src/dama/upload/metadata'  // or relative path if not resolvable
);

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
    existing_source_id,
    source_name,                   // used only when existing_source_id is null
    user_id,
    email,
    table_name,                    // base name; view_id gets appended
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
      metadata: { email },
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

**URL the client POSTs to:** `POST /dama-admin/:pgEnv/enhance-nfip-claims/publish` — different from legacy `POST /:pgEnv/hazard_mitigation/enhance-nfip-claims-v2`. The client calling code needs one URL update — flag this in the migration PR so the map editor / admin front-end is updated in lockstep.

### 5. Register the plugin

```js
// dms-template/server/register-datatypes.js
module.exports = function registerExtra({ registerDatatype }) {
  registerDatatype('enhance-nfip-claims', require('../data-types/enhance-nfip-claims'));
  // (delete the _hello-world line from the infrastructure task at the same time)
};
```

### 6. Remove the smoke-test plugin

Part 1 left `data-types/_hello-world/` and a `registerDatatype('hello-world', ...)` line behind. Delete both as part of this PR — the real plugin obsoletes the smoke test.

### 7. Smoke test

```bash
cd dms-template
npm run server:dev

# Expect startup log:
#   [datatypes] Registered: pmtiles
#   [datatypes] Registered: enhance-nfip-claims
#   [datatypes] Mounted routes for 2 datatype(s)

# POST a test payload (replace schema/table names with real test-env targets)
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

# Poll events:
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

# Verify the rows landed:
#   SELECT * FROM data_manager.sources WHERE type = 'nfip_claims_enhanced_test';
#   SELECT * FROM data_manager.views WHERE source_id = <id>;
#   SELECT COUNT(*) FROM open_fema.nfip_claims_enhanced_test_<view_id>;
```

---

## Plugin-specific design notes

### Source / view naming divergence

- Legacy `update_view` set `table_schema`/`table_name` to `<schema>.<table_name>_<view_id>` (e.g., `nfip.nfip_claims_v2_12345`).
- New `createDamaView` defaults to `gis_datasets.s<source_id>_v<view_id>` (e.g., `gis_datasets.s42_v17`).

For NFIP, the enhanced table goes in the user-chosen schema (e.g., `nfip`), not `gis_datasets`. The worker explicitly overrides `table_schema` / `table_name` in the final `UPDATE data_manager.views` call (step 4 of the worker). **Keep legacy naming** here — existing views and downstream consumers assume the `{table_name}_{view_id}` pattern.

### `initialize_dama_src_metadata_using_view_2` is DAMA-only

This stored proc lives in `_data_manager_admin` schema, loaded by DAMA init scripts. The worker only calls it when `shouldCreateSource` is true, which only happens against DAMA DBs in production. If a non-DAMA DB ever calls this with no `existing_source_id`, the call will fail — sufficient gate for now.

### Event type tag

Legacy used `${table_name}:${EVENT}` (e.g., `nfip_claims_enhanced:INITIAL`). The client's event polling keys on this `type` field. **Keep the same format** — `ctx.dispatchEvent(type, message, payload)` stores `type` verbatim.

---

## Files requiring changes

- **NEW** `dms-template/data-types/enhance-nfip-claims/index.js`
- **NEW** `dms-template/data-types/enhance-nfip-claims/worker.js`
- **NEW** `dms-template/data-types/enhance-nfip-claims/enhance.js`
- **EDIT** `dms-template/server/register-datatypes.js` — add `enhance-nfip-claims` line, remove `_hello-world` line
- **DELETE** `dms-template/data-types/_hello-world/` (cleaned up alongside the registration line)

## Migration checklist

- [ ] Part 1 (`datatypes-plugin-infrastructure.md`) is complete and merged
- [ ] `data-types/enhance-nfip-claims/{index.js, worker.js, enhance.js}` created
- [ ] `server/register-datatypes.js` registers `enhance-nfip-claims`
- [ ] `_hello-world` plugin and registration line removed
- [ ] Server boots; startup log includes `Registered: enhance-nfip-claims`
- [ ] Smoke test: POST payload against a disposable pgEnv; events stream; enhanced table populated; `data_manager.sources`/`data_manager.views` rows present
- [ ] Client-side: separate PR updates the map-editor / admin UI call sites that POST to `/hazard_mitigation/enhance-nfip-claims-v2` to hit `/enhance-nfip-claims/publish` instead

## Open questions

1. **Backward-compat shim?** Should we add a passthrough route `POST /:pgEnv/hazard_mitigation/enhance-nfip-claims-v2 → /dama-admin/:pgEnv/enhance-nfip-claims/publish` so the client can be migrated gradually? Same approach as the existing `/events/query` shim. Decide based on how many client call sites need to flip at once.
2. **Shared worker boilerplate.** `enhance_nfip_claims_v2` shares its skeleton (init → SQL → update_view → fin) with several other hazmit datatypes (`enhance_hma_projects_v4`, `enhance_ihp`, `enhance_ncei`, `enhance_pa_funded_projects_v1/v2`, `usda_enhanced`). Consider extracting a small helper in `data-types/_shared/enhance-pipeline.js` once the **second** enhance-style port lands — premature otherwise.
3. **Test fixture.** No tests exist for these datatypes today. Add a graph-harness-style integration test that seeds a minimal pg fixture, POSTs, polls, and asserts the task completes. Mirror the pattern in `tests/test-upload-pipeline.js`.

## Follow-up datatypes (separate tasks)

Once this lands, each of the following is its own task using this guide as the template:

- [`map21`](./dama-map21-migration.md) — already drafted (Part 3); ports the PM3 / HPMS TTM pipeline
- `nri` — NRI dataset publish (utils/ subdir with extra helpers)
- `sheldus` — SHELDUS dataset
- `disaster_loss_summary` — multi-source fusion
- `fusion` — multi-source fusion pipeline
- `enhance_hma_projects_v4` — HMA projects enhance (geocoding)
- `enhance_ihp`, `enhance_ncei`, `enhance_pa_funded_projects_v1/v2` — enhance-style pipelines
- `flood_map` — flood extent rasters (non-vector)
- `jurisdiction` — jurisdiction geometry sources
- `open_fema_data` — base FEMA loaders (may already be covered by new CSV/GIS pipelines)
- `sba`, `usda`, `usda_enhanced`, `ncei` — additional enhance/load pipelines

The pattern is always the same: `index.js` (plugin shape) + `worker.js` (port the `.worker.mjs`) + any SQL helpers extracted for readability.
