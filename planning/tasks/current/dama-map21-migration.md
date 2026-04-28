# DAMA `map21` migration to the dms-server plugin system + HPMS TTM 2023 spec output

## Status: IMPLEMENTED — registered, smoke-tested fast-fail path on sqlite, HPMS 2023 spec validator confirmed against external validator. Full prod smoke test against `npmrds2` ClickHouse + real prod source still pending (would write to `data_manager.sources`, deferred to a controlled run).

## Implementation notes (2026-04-26)

- Registered as `map21` via `dms-template/server/register-datatypes.js`. The `_hello-world` smoke plugin from Part 1 was removed in the same change.
- `simple-statistics` and `moment` were dropped — their single call sites (R-7 quantile, `MM/DD/YYYY` formatter) were inlined to keep the plugin dependency-free. `lodash` already resolves from the dms-template root.
- ClickHouse adapter is `getChDb(pgEnv)` from `@availabs/dms-server/src/db`. Returns the `ClickHouseAdapter` whose `query({query, format: 'JSON'})` returns a result object with an async `.json()` method (matches `@clickhouse/client` natively). The legacy `chQuery({query}, pgEnv)` was swapped for that shape one-for-one.
- `createDamaView` does **not** accept a `version` field, so `newVersion` is set with a separate UPDATE statement after view creation (legacy parity).
- The 2023 HPMS column spec lives in `hpms-spec-2023.js`. Both `createHpmsCsv.js` (writer) and `validate.js` (post-publish validator) consume the same `SPEC` array — there's no second source of truth.
- Confirmed alignment with the external validator (`references/hpms/dama/validate-hpms-ttm-2023.cjs`): both report identical errors (56 phed-zero rows, same missing/extra columns) on the 2025 NY submittal CSV.
- A synthesized 2023-shape row built via `buildRow` validates cleanly with 0 errors — proves the writer's output matches the spec.

## Smoke test results

- Server boots with `Registered: pmtiles`, `Registered: map21`, `Mounted routes for 2 datatype(s)`.
- `POST /dama-admin/<pgEnv>/map21/publish` with empty body → `{"error":"npmrdsSourceId is required"}` (route validation).
- `POST` with `npmrdsSourceId` but no `years` → `{"error":"years (non-empty array) is required"}`.
- Full POST against `dama-sqlite-test`:
  - Route returned `{"etl_context_id":2,"source_id":999999}` (descriptor accepted, task queued).
  - Events stream: `queued → started → error`.
  - Task row: `status='error', error='map21 requires PostgreSQL for metadata'` — exactly the fast-fail the worker is supposed to emit when `db.type !== 'postgres'`.
- This proves the route → queueTask → worker registration → ctx → fail-and-record path is fully wired.

## Pending — full prod smoke test against `npmrds2`

The `npmrds2` pgEnv is the only configured one with ClickHouse (per `src/db/configs/npmrds2.config.json`). A full smoke would:

1. POST with `source_id=<known>`, `npmrdsSourceId=<known prod NPMRDS source>`, `years=[2023]`, `percentTmc=1`, `writeCsv=true`, `validateCsv=true`.
2. Verify the event stream contains `map21:VIEW_READY`, `map21:start`, `map21:progress` (~25), `map21:CSV_WRITE`, `map21:CSV_VALIDATE` (`HPMS 2023 spec OK`), `map21:complete`, `map21:FINAL`.
3. Cross-check the produced CSV with `node references/hpms/dama/validate-hpms-ttm-2023.cjs <path>` — should report 0 errors.
4. `SELECT COUNT(*) FROM gis_datasets.s<src>_v<view>` against the new view's data table — should equal the per-year-aggregated number of valid TMCs processed.

Defer this to a controlled run (it writes a real `data_manager.views` row per call). Plugin code is ready.



## Depends on

- [`datatypes-plugin-infrastructure.md`](./datatypes-plugin-infrastructure.md) — bootstrap path (env var, `register-datatypes.js`, `data-types/` layout). **Must be complete first.**
- [`dama-nfip-claims-migration.md`](./dama-nfip-claims-migration.md) — recommended read; the simpler enhance-style pattern that this port extends. Reuse the helpers and conventions established there.

## Objective

Port the legacy `references/avail-falcor/dama/routes/data_types/map21/` datatype to the `registerDatatype` plugin shape inside `dms-template/data-types/map21/`, and bring the FHWA HPMS Travel Time Metric output up to the **2023 draft spec** (the spec we validated against in `references/hpms/dama/validate-hpms-ttm-2023.cjs`).

The map21 datatype is materially more complex than `enhance-nfip-claims`:

- **Multi-year processing** — the descriptor carries an array of years; the worker iterates per-year inside the same task.
- **Cross-source dependencies** — reads NPMRDS prod source's data table (`table_name`, `table_schema`) and meta-layer view (`metadata.npmrds_meta_layer_view_id[year]`) before processing each year.
- **ClickHouse + PostgreSQL** — TMC time-series queries hit ClickHouse via `chQuery` (legacy) → must use the new UDA ClickHouse adapter (already shipped — see the completed "UDA ClickHouse support for DAMA pgEnv" task). Metadata writes still go to PG.
- **Multiple metric calculators** — `lottr` (LOTTR), `tttr` (TTTR, freight-vehicle), `phed` (PHED, peak-hour excessive delay). Each has its own time-bin config and helper module.
- **Two output paths** — (1) the `s{source}_v{view}` data table consumed by downstream maps; (2) optionally an FHWA HPMS TTM CSV file written to `etlDir`/storage. **The HPMS CSV must conform to the 2023 spec**, not the 2018 spec the legacy `createPm3Output.js` was written against.
- **Append-or-create behavior** — if `view_id` is supplied, append to an existing view's data table after deleting matching-year rows; otherwise create a new view.

## Why now

- The dama-server-port task removed the legacy DAMA Falcor route auto-discovery; map21 currently has no working production endpoint in the new server.
- HPMS submittal validation work in `references/hpms/dama/` (April 2026) confirmed the legacy `createPm3Output.js` output **does not match the 2023 spec**: column ordering for trucks (OVN-before-WE), `comments` column dropped, percentile sizes tightened, `metricsource` codes restricted to `{1, 2}`. We need the port to produce 2023-compliant output by default.
- The 2025 NY HPMS submittal (`references/hpms/dama/2025/hpms_map21_s2002_v3395_*.csv`) is the immediate driver.

## Scope

### In scope

- `dms-template/data-types/map21/` — full plugin (worker, route, calculators, helpers, constants, output, validation)
- HPMS TTM 2023 spec output — replace `createPm3Output.js` with a 2023-compliant generator and bake validation in (a JS port of `validate-hpms-ttm-2023.cjs` lives alongside the plugin)
- Smoke test against a disposable pgEnv with a single year and a small TMC subset (use the legacy `percentTmc` knob); verify data table populates + HPMS CSV passes the validator
- Wiring: `register-datatypes.js` registers `map21`; smoke test verifies the route mounts at `/dama-admin/:pgEnv/map21/publish`

### Out of scope

- Re-implementing NPMRDS prod source loaders (the source `npmrdsSourceId` references already-published data)
- Backfilling historic comparison logic (`COMPARE_AGAINST_HISTORIC`) — the legacy code already gates this off via the `pm3Config` constant; keep gated off in the port. Track resurrection as a follow-up.
- The legacy `ANALYSIS` flag (statewide aggregate metrics in view metadata) — keep gated off. The HPMS validator already computes the same statewide aggregates from the CSV; running them server-side is duplicate work for a feature no one currently consumes.
- ClickHouse-only deployments — the port assumes the existing UDA ClickHouse routing (PG metadata + CH timeseries) shipped in the dms-server port.
- The CATTLab traffic-distribution variants in `enums/CATTLabTrafficDistributionProfiles.js` and friends — only the live `enums/trafficDistributionProfiles.js` is wired by the legacy worker; port what's used.

### Open question to settle before implementation

**Single multi-year task vs. one task per year.** The legacy worker loops years inside one task. The new task system has cheap `helpers.queueTask` and good progress reporting per task — splitting one publish call into N year-tasks would give per-year progress, retries, and cancellation. **Recommendation:** keep the legacy single-task model for the first cut (lower diff), but expose `years: [year]` from the route so a caller *can* fan out client-side by issuing N requests. Revisit after the first production run.

> Plugin shape, helpers reference, legacy→new API mapping, and common gotchas live in [`datatypes-plugin-infrastructure.md`](./datatypes-plugin-infrastructure.md). This file references that doc instead of duplicating it.

---

## Reference inventory — what's in the legacy directory

`references/avail-falcor/dama/routes/data_types/map21/`

| File | Lines | Purpose | Port action |
|------|-------|---------|-------------|
| `publish.routes.js` | 95 | Express route — creates source if needed, queues task | Port to `index.js` `routes` callback (see step 3) |
| `publish.worker.mjs` | 533 | Per-year orchestrator — view setup, TMC fetch, metric loop, view metadata update, CSV output | Port to `worker.js` (see step 4) |
| `helpers.js` | 379 | `getListTmcId`, `createDataTable`, `getUpdateColumnsSqlForMap21`, `getDataInsertSqlForMap21`, `generateGetStateMetricsQuery` | Port verbatim to `helpers.js`; swap `query/chQuery` for `db.query` (PG) and the new ClickHouse adapter |
| `calcTtrMeasure.js` | 272 | LOTTR + TTTR calculator (percentile-based) | Port verbatim; takes `db` instead of pgEnv |
| `calcPhed.js` | 470 | PHED calculator (excessive-delay person-hours) | Port verbatim; takes `db` instead of pgEnv |
| `calcHistoricComparison.js` | 45 | Compares new metrics vs old DAMA values (gated off) | Port but leave gated |
| `analysis.js` | 37 | Two-source LOTTR diff query (gated off) | Port but leave gated |
| `constants.js` | 187 | BIN_NAMES, percentile constants, schema names | Port verbatim |
| `createPm3Output.js` | 92 | **HPMS TTM CSV writer (2018-spec column names)** | **Replace** with 2023-compliant generator (see step 5) |
| `enums/` | — | Day types, congestion levels, functional classes, traffic distribution profiles | Port verbatim (only what `calcPhed.js` and `calcTtrMeasure.js` import) |
| `static/` | — | CATTLab tables and DOW/month adjustment factors | Port only files imported by ported code |
| `SetUtils.js` | 27 | Tiny helper | Port verbatim |

## Reference inventory — HPMS validation work

`references/hpms/`

| File | Purpose | How it informs the port |
|------|---------|-------------------------|
| `dama/validate-hpms-ttm-2023.cjs` | Validator implementing FHWA 2023 draft spec (Table 20). Lowercase column names, OVN-before-WE truck ordering, `comments` removed, percentile sizes tightened, `metricsource ∈ {1, 2}`. | **Authoritative spec for the port's CSV output.** Lift the `SPEC` array verbatim into `data-types/map21/hpms-spec-2023.js` and have both the CSV generator and the post-publish validator share it. |
| `dama/upload-years.cjs` | Loops years calling the new `/dama-admin/:pgEnv/gis-dataset/upload` + `/publish` endpoints, polling tasks via `events/query`. | Demonstrates the new-style client polling pattern — useful as the model for any map21 client wrapper. Not ported as part of this task; cited for client-PR reviewers. |
| `dama/validate-hpms-ttm.cjs` | Older 2018-spec validator (kept for cross-checking historic submittals). | Reference only — do not use as the port's spec. |
| `FHWA-2023-0014-0003_attachment_1.pdf` | The actual FHWA spec. Chapter 8 / Table 20 is the schema. | Source of truth when the validator and the spec disagree — read the PDF. |
| `dama/2025/*.csv`, `dama/submital/*.csv`, `dama/submital_2023/*.csv` | Real submittal CSVs produced by the legacy pipeline + the 2023 draft submittal. | Use these as smoke-test inputs for the port's validator: a known-good 2025 CSV must pass `validate.run()`, a 2018-format CSV must fail with column-name errors. |

---

## Implementation steps

### 1. Create the directory structure

```bash
mkdir -p dms-template/data-types/map21/{enums,static}
```

Files to write or copy:

```
dms-template/data-types/map21/
├── index.js                ← plugin definition (route + worker registration)
├── worker.js               ← per-year orchestrator (port of publish.worker.mjs)
├── helpers.js              ← TMC fetch, table creation, SQL generators
├── calcTtrMeasure.js       ← LOTTR + TTTR calculator
├── calcPhed.js             ← PHED calculator
├── calcHistoricComparison.js (gated off)
├── analysis.js             (gated off)
├── constants.js
├── createHpmsCsv.js        ← NEW — replaces createPm3Output.js, follows 2023 spec
├── hpms-spec-2023.js       ← NEW — column rules lifted from validate-hpms-ttm-2023.cjs
├── validate.js             ← NEW — internal validator that uses hpms-spec-2023.js
├── SetUtils.js
├── enums/                  ← copy only files imported by the ported code
└── static/                 ← copy only files imported by the ported code
```

### 2. Port the calculators and helpers (mechanical)

For each of `helpers.js`, `calcTtrMeasure.js`, `calcPhed.js`, `calcHistoricComparison.js`, `analysis.js`, `constants.js`, `SetUtils.js`, `enums/*`, `static/*`:

- Replace `import { query, chQuery } from '#db/pgEnvs.js'` with a `db` parameter (postgres) and a `chDb` parameter (ClickHouse).
- Replace `await query(sql, pgEnv)` with `await db.query(sql)`; replace `await chQuery(sql, pgEnv)` with `await chDb.query(sql)`.
- Replace `logger.info`/`logger.error` with `console.log`/`console.error` (worker stdout is captured per-task — see infrastructure doc).
- Convert ESM `import`/`export` to CommonJS `require`/`module.exports` to match the rest of dms-server.
- Drop `#dama/admin/index.js` imports — those macros are gone.

The ClickHouse adapter to use is the one shipped under the "UDA ClickHouse support for DAMA pgEnv" task. Look at the existing UDA controller's PG-vs-CH dispatch for the call shape; mirror it.

### 3. `index.js` — route and worker registration

```js
// data-types/map21/index.js
const worker = require('./worker');

module.exports = {
  workers: {
    'map21/publish': worker,
  },
  routes: (router, helpers) => {
    router.post('/publish', async (req, res) => {
      try {
        const { pgEnv } = req.params;
        const {
          source_id,
          source_values,                  // used only when source_id is null (new-source path)
          view_id,                        // optional — when set, append/update existing view
          npmrdsSourceId,                 // required — the prod NPMRDS source the port reads from
          years,                          // required — array of integer years to process
          customViewAttributes,
          viewMetadata,
          viewDependency,
          newVersion,
          percentTmc = 100,               // smoke-test knob — process subset of TMCs
          parent_context_id,
          user_id,
          email,
          // Output toggles — replace the legacy module-scope booleans
          writeCsv = true,                // emit HPMS TTM CSV by default
          validateCsv = true,             // run the 2023-spec validator on the emitted CSV
        } = req.body || {};

        if (!npmrdsSourceId) return res.status(400).json({ error: 'npmrdsSourceId is required' });
        if (!Array.isArray(years) || !years.length)
          return res.status(400).json({ error: 'years (non-empty array) is required' });

        // Create the source up-front if not supplied — keeps legacy contract
        // (the response includes source_id even before the worker runs).
        let resolvedSourceId = source_id;
        let isNewSourceCreate = false;
        if (!resolvedSourceId) {
          isNewSourceCreate = true;
          const sv = { ...(source_values || {}) };
          if (user_id) {
            sv.user_id = user_id;
            sv.statistics = { auth: { users: { [user_id]: '10' }, groups: {} } };
          }
          const created = await helpers.createDamaSource(sv, pgEnv);
          resolvedSourceId = created.source_id;
        }

        const taskId = await helpers.queueTask({
          workerPath: 'map21/publish',
          sourceId: resolvedSourceId,
          source_id: resolvedSourceId,
          view_id: view_id ?? null,
          npmrdsSourceId,
          years,
          customViewAttributes, viewMetadata, viewDependency, newVersion,
          percentTmc,
          parent_context_id,
          user_id, email,
          isNewSourceCreate,
          writeCsv, validateCsv,
        }, pgEnv);

        // Match legacy: link the queued task into a parent etl_context if supplied
        if (parent_context_id) {
          const db = helpers.getDb(pgEnv);
          await db.query(
            'UPDATE data_manager.etl_contexts SET source_id = $1 WHERE etl_context_id = $2',
            [resolvedSourceId, parent_context_id]
          );
        }

        res.json({ etl_context_id: taskId, source_id: resolvedSourceId });
      } catch (err) {
        console.error('[map21] route failed:', err);
        res.status(500).json({ error: err.message });
      }
    });
  },
};
```

**URL the client POSTs to:** `POST /dama-admin/:pgEnv/map21/publish` — different from legacy `POST /:pgEnv/map21/publish`. Diff is the `/dama-admin` prefix. Coordinate with the client-side change.

### 4. `worker.js` — per-year orchestrator

The shape mirrors the legacy worker but rewires the data dependencies:

```js
// data-types/map21/worker.js — high-level pseudocode
module.exports = async function publish(ctx) {
  const { task, pgEnv, db, dispatchEvent, updateProgress } = ctx;
  if (db.type !== 'postgres') throw new Error('map21 requires PostgreSQL for metadata');
  const chDb = getClickHouseAdapter(pgEnv);  // see the UDA ClickHouse code for the shape

  const {
    source_id, view_id, npmrdsSourceId, years,
    customViewAttributes, viewMetadata, viewDependency, newVersion,
    percentTmc, user_id, email, isNewSourceCreate,
    writeCsv, validateCsv,
  } = task.descriptor;

  await dispatchEvent('map21:INITIAL', 'map21 publish started', { source_id, view_id, years });
  await updateProgress(0.02);

  // 1. Resolve or create the view (and clear matching-year rows on append)
  const damaView = view_id
    ? await selectAndClearYears(db, source_id, view_id, years)   // DELETE rows where begindate matches years
    : await helpers.createDamaView({                             // create fresh view (legacy convention: setDefaultTable)
        source_id, user_id, etl_context_id: task.task_id,
        version: newVersion,
        view_dependencies: viewDependency,
        metadata: { ...(customViewAttributes || {}), ...(viewMetadata || {}),
                    npmrds_prod_source_id: npmrdsSourceId, years },
      }, pgEnv);
  await dispatchEvent('map21:VIEW_READY', `view_id=${damaView.view_id}`, { view_id: damaView.view_id });
  await updateProgress(0.05);

  // 2. Read prod NPMRDS source's data-table location + per-year meta-layer mapping
  const { dataTableName, npmrdsMetaLayerByYear, npmrdsRawByYear } = await readProdSource(db, npmrdsSourceId);

  const allResults = {};                  // tmcId -> { meta, lottr, tttr, phed }
  const yearToRawViewId = { ...(damaView.metadata?.npmrds_raw_view_id_to_year || {}) };

  for (const year of years) {
    yearToRawViewId[year] = npmrdsRawByYear[year] || [];

    // 3. Per-year setup
    const metaLayer = await readMetaLayer(db, npmrdsMetaLayerByYear[year]);  // table_schema/table_name
    const tmcIds = await helpers.getListTmcId({ db: chDb, dataTableName, year });
    await helpers.createDataTable({ db, table_schema: damaView.table_schema, table_name: damaView.table_name });

    await dispatchEvent('map21:start', `year=${year} tmcs=${tmcIds.length}`,
      { etl_context_id: task.task_id, damaSourceId: npmrdsSourceId, damaViewId: damaView.view_id, year });

    // 4. Per-TMC metric loop (LOTTR / TTTR / PHED)
    const numTmc = Math.floor((tmcIds.length * percentTmc) / 100);
    const everyN = Math.max(1, Math.floor(numTmc / 25));
    let columnsInitialized = false;

    for (let i = 0; i < numTmc; i++) {
      const tmcId = tmcIds[i];
      const tmcMeta = await fetchTmcMeta(db, metaLayer, tmcId);   // generateTmcIdMetaQuery from helpers
      if (!tmcMeta || !checkMeta(tmcMeta)) continue;              // checkMeta lifted verbatim from legacy

      const result = { meta: tmcMeta };
      for (const [name, cfg] of Object.entries(METRIC_CONFIGS)) {
        result[name] = await cfg.calculator({
          db, chDb, pgEnv,
          curTmcId: tmcId, year,
          damaSourceId: npmrdsSourceId, viewId: damaView.view_id,
          table_name: damaView.table_name, table_schema: damaView.table_schema,
          dataTableName, etl_context_id: task.task_id,
          tmcMeta,
          ...cfg,
          metricName: name,
        });
      }
      allResults[tmcId] = result;

      if (!columnsInitialized) {
        await db.query(helpers.getUpdateColumnsSqlForMap21({
          result, table_schema: damaView.table_schema, table_name: damaView.table_name, METRIC_NAMES,
        }));
        columnsInitialized = true;
      }
      await db.query(helpers.getDataInsertSqlForMap21({
        result, table_schema: damaView.table_schema, table_name: damaView.table_name, METRIC_NAMES,
      }));

      if (i % everyN === 0) {
        const pct = Math.floor((i / numTmc) * 100);
        await dispatchEvent('map21:progress', `year=${year} ${pct}%`,
          { year, etl_context_id: task.task_id, damaViewId: damaView.view_id, data: { progress: pct } });
        await updateProgress(0.05 + 0.85 * (years.indexOf(year) + (i / numTmc)) / years.length);
      }
    }
  }

  await updateProgress(0.92);

  // 5. Update view metadata with year→raw-view mapping
  await db.query(`
    UPDATE data_manager.views
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
     WHERE view_id = $2
  `, [{ npmrds_raw_view_id_to_year: yearToRawViewId }, damaView.view_id]);

  // 6. (Optional) emit HPMS TTM CSV — see step 5 below for the generator
  let csvPath = null;
  if (writeCsv) {
    const { writeHpmsCsv } = require('./createHpmsCsv');
    csvPath = await writeHpmsCsv({
      results: allResults,
      year: years[years.length - 1],   // 2023 spec keys datayear per row; uses each row's year
      stateId: deriveStateIdFromMeta(allResults),
      storage: ctx.storage,            // helpers.storage exposed via ctx (or falls back to etlDir)
      filename: `map21_s${source_id}_v${damaView.view_id}.csv`,
    });
    await dispatchEvent('map21:CSV_WRITE', `wrote ${csvPath}`, { csvPath });
  }

  // 7. Validate the CSV against the 2023 spec — fail loudly if it doesn't pass
  if (writeCsv && validateCsv) {
    const { validateFile } = require('./validate');
    const report = validateFile(csvPath);
    const errCount = [...report.errors.values()].reduce((s, e) => s + e.count, 0);
    await dispatchEvent('map21:CSV_VALIDATE',
      errCount === 0 ? 'HPMS 2023 spec OK' : `${errCount} validation errors`,
      report.summary);
    if (errCount > 0) throw new Error(`HPMS validation failed: ${errCount} errors`);
  }

  // 8. Bootstrap source metadata when this is a new source (DAMA-only)
  if (isNewSourceCreate) {
    try {
      await db.query('CALL _data_manager_admin.initialize_dama_src_metadata_using_view($1)', [damaView.view_id]);
      await dispatchEvent('map21:CREATE_META', 'Source metadata initialized', { view_id: damaView.view_id });
    } catch (e) {
      console.error('[map21] initialize_dama_src_metadata_using_view failed:', e.message);
      // legacy code swallowed this — preserve that behavior; surface via console only
    }
  }

  await updateProgress(1);
  const result = {
    source_id, view_id: damaView.view_id, table: `${damaView.table_schema}.${damaView.table_name}`,
    csvPath, years,
  };
  await dispatchEvent('map21:complete', 'map21 complete', result);
  await dispatchEvent('map21:FINAL', 'map21 done', result);
  return result;
};
```

The pseudocode is intentionally collapsed — the per-TMC metric loop and the meta/raw-view lookups port verbatim from the legacy worker (lines ~144–365 of `publish.worker.mjs`). Three things change:

1. **Database calls** — `query(sql, pgEnv)` → `db.query(sql)` (PG); `chQuery(sql, pgEnv)` → `chDb.query(sql)` (ClickHouse).
2. **Event dispatch** — `dispatchEvent({type, payload, meta}, etl_context_id, pgEnv)` → `ctx.dispatchEvent(type, message, payload)`. The `meta.user_id`/`meta.email`/`meta.timestamp` legacy meta envelope is dropped; user/email already in `ctx.task.descriptor`, timestamp added by the events table.
3. **Progress** — legacy's "approx 25 progress events" pattern is preserved, but now also calls `ctx.updateProgress(0..1)` so the UI progress bar updates.

### 5. Replace `createPm3Output.js` with the 2023-spec HPMS generator

The legacy `createPm3Output.js` predates the 2023 spec. Three concrete divergences:

| Aspect | 2018 (legacy) | 2023 (new) |
|--------|---------------|------------|
| Column-name case | `BeginDate`, `LOTTRAMP`, `TTAMP50PCT` (mixed → flatlower-cased on emit) | All-lowercase, no underscores: `begindate`, `lottramp`, `ttamp50pct` |
| Truck metric ordering | `tttramp`, `tttrmidd`, `tttrpmp`, `tttrwe`, `tttrovn` | `tttramp`, `tttrmidd`, `tttrpmp`, `tttrovn`, `tttrwe` (**OVN before WE**) |
| `comments` column | Present (always empty in legacy output) | **Removed** |
| `metricsource` codes | Free-form integer | Restricted to `{1, 2}` (`1`=NPMRDS, `2`=other) |
| `lottr*` percentile size | `Numeric(5)` | `Numeric(4)` — tighter; rendering must respect 4-digit cap |
| `phed` | Optional, may be empty | Required to be `> 0` if present |
| Delimiter | Comma in legacy emitter | **Pipe (`|`)** is the spec — emitter should default to pipe |

Two new files:

```js
// data-types/map21/hpms-spec-2023.js
// Lifted verbatim from references/hpms/dama/validate-hpms-ttm-2023.cjs (the SPEC array
// + the rule factories: numeric, decimal, enumNumeric, varchar). Both the writer and
// the validator import this — single source of truth.
module.exports = {
  SPEC: [
    { name: 'datayear',       required: true,  rule: numeric(4, { min: 1900, max: 2100, integer: true }) },
    { name: 'stateid',        required: true,  rule: numeric(2, { min: 1, max: 99, integer: true }) },
    { name: 'traveltimecode', required: true,  rule: varchar(50) },
    // ... rest of Table 20 (40 fields total) ...
  ],
  numeric, decimal, enumNumeric, varchar,
  HEADERS_PIPE_ORDER: [/* lowercase no-underscore names in spec order */],
};
```

```js
// data-types/map21/createHpmsCsv.js
const { SPEC, HEADERS_PIPE_ORDER } = require('./hpms-spec-2023');

// Map from internal worker result keys to lowercase HPMS column names.
// (Internal keys still match the legacy createPm3Output mapping; only the OUTPUT side moves to 2023.)
const INTERNAL_TO_HPMS = {
  active_start_date:     'begindate',
  state_code:            'stateid',
  tmc:                   'traveltimecode',
  f_system:              'fsystem',
  urban_code:            'urbanid',
  faciltype:             'facilitytype',
  nhs:                   'nhs',
  miles:                 'segmentlength',
  direction:             'directionality',
  directionalaadt:       'diraadt',
  avg_vehicle_occupancy: 'occfac',
  AMP_lottr:             'lottramp',
  AMP_lottr_50_PCT:      'ttamp50pct',
  AMP_lottr_80_PCT:      'ttamp80pct',
  MIDD_lottr:            'lottrmidd',
  MIDD_lottr_50_PCT:     'ttmidd50pct',
  MIDD_lottr_80_PCT:     'ttmidd80pct',
  PMP_lottr:             'lottrpmp',
  PMP_lottr_50_PCT:      'ttpmp50pct',
  PMP_lottr_80_PCT:      'ttpmp80pct',
  WE_lottr:              'lottrwe',
  WE_lottr_50_PCT:       'ttwe50pct',
  WE_lottr_80_PCT:       'ttwe80pct',
  AMP_tttr:              'tttramp',
  AMP_tttr_50_PCT:       'tttamp50pct',
  AMP_tttr_95_PCT:       'tttamp95pct',
  MIDD_tttr:             'tttrmidd',
  MIDD_tttr_50_PCT:      'tttmidd50pct',
  MIDD_tttr_95_PCT:      'tttmidd95pct',
  PMP_tttr:              'tttrpmp',
  PMP_tttr_50_PCT:       'tttpmp50pct',
  PMP_tttr_95_PCT:       'tttpmp95pct',
  // 2023 ORDERING SWAP — OVN before WE for trucks
  OVN_tttr:              'tttrovn',
  OVN_tttr_50_PCT:       'tttovn50pct',
  OVN_tttr_95_PCT:       'tttovn95pct',
  WE_tttr:               'tttrwe',
  WE_tttr_50_PCT:        'tttwe50pct',
  WE_tttr_95_PCT:        'tttwe95pct',
  all_xdelay_phrs:       'phed',
  // 'COMMENTS' column intentionally dropped (2023 removed it)
  // metricsource is set per-row, default 1 (NPMRDS-derived)
};

async function writeHpmsCsv({ results, storage, filename, delimiter = '|' }) {
  const rows = [];
  for (const tmcId of Object.keys(results)) {
    const r = results[tmcId];
    const out = { metricsource: 1 };           // default: NPMRDS-derived
    for (const [intKey, val] of flatten(r)) {  // walks { meta, lottr, tttr, phed }
      const hpmsKey = INTERNAL_TO_HPMS[intKey];
      if (hpmsKey) out[hpmsKey] = val;
    }
    rows.push(out);
  }

  const headers = HEADERS_PIPE_ORDER;
  const lines = [headers.join(delimiter)];
  for (const r of rows) {
    lines.push(headers.map(h => formatCell(r[h])).join(delimiter));
  }
  const csv = lines.join('\n');
  const writePath = await storage.write(`map21/${filename}`, Buffer.from(csv, 'utf8'));
  return writePath;
}

module.exports = { writeHpmsCsv, INTERNAL_TO_HPMS };
```

```js
// data-types/map21/validate.js
// In-process port of references/hpms/dama/validate-hpms-ttm-2023.cjs.
// Reuses SPEC from hpms-spec-2023.js so the writer and validator never drift.
const fs = require('fs');
const { SPEC } = require('./hpms-spec-2023');

function validateFile(filePath, { delimiter = '|', limit = 5 } = {}) {
  // Same body as references/hpms/dama/validate-hpms-ttm-2023.cjs validateFile()
  // — but takes SPEC by argument and returns the report object instead of printing.
}

module.exports = { validateFile };
```

### 6. Register the plugin

```js
// dms-template/server/register-datatypes.js
module.exports = function registerExtra({ registerDatatype }) {
  registerDatatype('enhance-nfip-claims', require('../data-types/enhance-nfip-claims'));
  registerDatatype('map21',               require('../data-types/map21'));
};
```

### 7. Smoke test

```bash
cd dms-template
npm run server:dev

# Expected startup log:
#   [datatypes] Registered: pmtiles
#   [datatypes] Registered: enhance-nfip-claims
#   [datatypes] Registered: map21
#   [datatypes] Mounted routes for 3 datatype(s)

# Subset run — small TMC set, single year, against a disposable pgEnv
curl -X POST http://localhost:3001/dama-admin/npmrds2/map21/publish \
  -H 'Content-Type: application/json' \
  -d '{
    "npmrdsSourceId": <prod_npmrds_source_id>,
    "years": [2023],
    "user_id": 1,
    "email": "test@example.com",
    "percentTmc": 1,
    "writeCsv": true,
    "validateCsv": true,
    "source_values": { "name": "map21_smoke_test", "type": "map21" }
  }'

# Expected: { "etl_context_id": <taskId>, "source_id": <newSrcId> }

curl "http://localhost:3001/dama-admin/npmrds2/events/query?etl_context_id=<taskId>&event_id=-1"

# Expected event types in order:
#   map21:INITIAL
#   map21:VIEW_READY
#   map21:start            (per-year)
#   map21:progress         (~25 of these per year)
#   map21:CSV_WRITE
#   map21:CSV_VALIDATE     (message: "HPMS 2023 spec OK")
#   map21:CREATE_META      (only if new source)
#   map21:complete
#   map21:FINAL

# Cross-check against the spec validator on the disk-written CSV:
node references/hpms/dama/validate-hpms-ttm-2023.cjs <csvPath>
# Should report 0 errors. If it does not, the in-process validator has drifted from the spec — fix.
```

### 8. Cross-validation against existing real submittals

Once the plugin runs end-to-end, validate that its output matches the format of real 2025/2023 submittals:

```bash
# Existing 2025 submittal — should pass
node references/hpms/dama/validate-hpms-ttm-2023.cjs \
  references/hpms/dama/2025/hpms_map21_s2002_v3395_042226_DRAFT_donotsubmit.csv

# Plugin output for the same source/view — should also pass
node references/hpms/dama/validate-hpms-ttm-2023.cjs <plugin csvPath>

# Diff column orderings, row counts, column-by-column aggregate stats.
```

---

## Plugin-specific design notes

### ClickHouse vs PostgreSQL routing

- TMC time-series (`getListTmcId`, the `chQuery` calls inside `calcTtrMeasure.js` and `calcPhed.js`) hit ClickHouse.
- Source/view/meta-layer metadata (`data_manager.sources`, `data_manager.views`, the meta-layer table itself) hit PostgreSQL.

The new UDA controller already routes per-pgEnv (see the completed "UDA ClickHouse support for DAMA pgEnv" task). The worker should pull both adapters at the top — `db = ctx.db` (PG, the default), `chDb = getClickHouseAdapter(pgEnv)`. If the pgEnv has no ClickHouse config, the worker should fail fast at startup.

### Source / view naming

Map21 keeps the `s{source_id}_v{view_id}` table naming that `helpers.createDamaView` produces by default. **No override needed** — unlike NFIP, downstream consumers of map21 already use that scheme. (Check: existing real submittal `hpms_map21_s2002_v3395_042226_DRAFT_donotsubmit.csv` references `s2002_v3395`.)

### View metadata shape

The legacy worker writes two metadata blobs onto the view:

1. `npmrds_raw_view_id_to_year` — `{ "2023": ["s17_v44"], "2022": ["s17_v45"], ... }` — used downstream to trace which raw NPMRDS view fed each year.
2. `tiles` (only when ANALYSIS is on, and only for the legacy path) — currently gated off; do not emit.

Preserve `npmrds_raw_view_id_to_year` exactly. Skip the rest until someone asks for it.

### Append-vs-create logic

When `view_id` is supplied:

```sql
DELETE FROM ${view.table_schema}.${view.table_name}
 WHERE begindate ~ '^(2022|2023)';      -- regex over the supplied years
```

This matches the legacy semantics. Wrap inside a transaction with the metric-loop inserts so a failure mid-process doesn't leave the table half-deleted-half-reinserted.

### `metricsource` is now restricted to `{1, 2}`

The 2023 spec accepts `metricsource ∈ {1, 2}`. Default to `1` (NPMRDS-derived). If the worker ever produces metric values from a non-NPMRDS source, set `2`. Any other value is a validation error.

### Event types: keep legacy strings

The map editor / admin UI polls event types like `map21:INITIAL`, `map21:start`, `map21:progress`, `map21:complete`, `map21:FINAL`. **Don't rename.** New types added by the port (`map21:VIEW_READY`, `map21:CSV_WRITE`, `map21:CSV_VALIDATE`, `map21:CREATE_META`) are additive and won't break the legacy poller.

### Statewide aggregate metrics — defer

The legacy `ANALYSIS` flag wrote statewide `lottr_interstate`, `lottr_non_interstate`, `tttr_interstate`, `phed`, `vmt` into the view's metadata. The HPMS validator (`validate-hpms-ttm-2023.cjs`) already computes these aggregates from the CSV in its report output. Until someone asks for the aggregates back on the view-metadata side, leave them off — having the validator compute them on demand is enough.

---

## Files requiring changes

- **NEW** `dms-template/data-types/map21/index.js`
- **NEW** `dms-template/data-types/map21/worker.js`
- **NEW** `dms-template/data-types/map21/helpers.js` (port of legacy)
- **NEW** `dms-template/data-types/map21/calcTtrMeasure.js`
- **NEW** `dms-template/data-types/map21/calcPhed.js`
- **NEW** `dms-template/data-types/map21/calcHistoricComparison.js` (gated off)
- **NEW** `dms-template/data-types/map21/analysis.js` (gated off)
- **NEW** `dms-template/data-types/map21/constants.js`
- **NEW** `dms-template/data-types/map21/createHpmsCsv.js` — replaces legacy `createPm3Output.js`
- **NEW** `dms-template/data-types/map21/hpms-spec-2023.js` — single-source-of-truth column spec
- **NEW** `dms-template/data-types/map21/validate.js` — in-process validator
- **NEW** `dms-template/data-types/map21/SetUtils.js`
- **NEW** `dms-template/data-types/map21/enums/*` (only files imported by ported code)
- **NEW** `dms-template/data-types/map21/static/*` (only files imported by ported code)
- **EDIT** `dms-template/server/register-datatypes.js` — add `registerDatatype('map21', ...)` line

## Migration checklist

- [x] Part 1 (`datatypes-plugin-infrastructure.md`) merged
- [ ] Part 2 (`dama-nfip-claims-migration.md`) — skipped per user; not a hard dependency
- [x] All ported source files compile and import cleanly under CommonJS
- [x] Worker fails fast on non-Postgres pgEnv (verified via the dama-sqlite-test smoke)
- [ ] Worker fails fast when `chDb` (ClickHouse) is unavailable for the pgEnv (code path written; not yet exercised — needs a non-CH PG pgEnv to confirm)
- [ ] Smoke test (single year, 1% TMC subset) completes; data table populated; CSV emitted *(needs `npmrds2` controlled run)*
- [ ] In-process validator reports 0 errors on the smoke-test CSV *(needs `npmrds2` run)*
- [x] External `validate-hpms-ttm-2023.cjs` and in-process `validate.js` agree exactly on the 2025 submittal cross-check
- [x] OVN-before-WE truck ordering verified in column header (`HEADERS`: `…tttrpmp, tttpmp50pct, tttpmp95pct, tttrovn, tttovn50pct, tttovn95pct, tttrwe, tttwe50pct, tttwe95pct…`)
- [x] No `comments` column in output
- [x] `metricsource` rule restricts to `{1,2}` (rule + default)
- [x] Delimiter is pipe (`|`) (writer + spec match)
- [x] Append path (`view_id` supplied) deletes matching-year rows before re-inserting (`selectViewAndClearYears` in worker)
- [x] Event types `map21:INITIAL`, `map21:VIEW_READY`, `map21:start`, `map21:progress`, `map21:CSV_WRITE`, `map21:CSV_VALIDATE`, `map21:CREATE_META`, `map21:complete`, `map21:FINAL` all dispatched in legacy-compatible format
- [ ] Client-side: separate PR updates the map editor's `/map21/publish` callers to `/dama-admin/:pgEnv/map21/publish`

## Open questions

1. **CSV storage location.** Legacy code wrote to a uuid-named subdir of `etlDir`. The new plugin should write via `helpers.storage` (S3 or local). Decide a stable path scheme — proposal: `map21/s{source_id}_v{view_id}_<ISO timestamp>.csv` so re-runs don't clobber. Submit-ready filenames are renamed by the user manually (legacy behavior).
2. **2023 spec is still draft.** The "2023 draft" attached to the FHWA RFC may shift before final. Anchoring `hpms-spec-2023.js` to the validator means flipping to a v2024/v2025 spec is one new file + one require swap — don't try to make the spec swappable at runtime.
3. **State-code derivation.** `stateid` in the spec is per-row (FIPS 1–99). The legacy code reads it from `tmcMeta.state_code`. Confirm that `state_code` in the meta layer is always FIPS-numeric, not USPS-alpha. Add a one-shot guard at the start of CSV emit: any non-FIPS value short-circuits with a clear error.
4. **Multi-year and multi-source CSVs.** The 2023 validator handles a single CSV with mixed `datayear` rows. Confirm the worker emits one CSV across all years (legacy behavior) vs one CSV per year. Default: one CSV across all requested years.
5. **Bridge compat with the 2018 submittal validator.** `references/hpms/dama/validate-hpms-ttm.cjs` (2018 spec) is still in the repo. If a downstream consumer needs 2018-format output for historic comparison, add `hpms-spec-2018.js` and a `specVersion: '2018' | '2023'` toggle on the descriptor. Out of scope for this task; flag as follow-up.
