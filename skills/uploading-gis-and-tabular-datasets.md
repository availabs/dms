# Uploading GIS & tabular datasets to a pgEnv (headless, via dms-server)

**Outcome:** ingest a **GIS** file (GeoPackage / Shapefile / GeoJSON) or a **tabular** file (CSV) into a
DaMa `pgEnv` (e.g. `npmrds2`) as a real DaMa **source + view + table** — so DMS pages (Card / Spreadsheet /
Graph / Map) can bind to it and downstream pipelines can join it. End-to-end over HTTP, no UI clicks, so an
agent can do it without a human.

> **Always use this path — never `INSERT` into `data_manager.*` or create a `gis_datasets` table by hand.**
> The dms-server upload flow writes the matching `data_manager.sources` + `data_manager.views` rows and
> picks the canonical `gis_datasets.s{source_id}_v{view_id}_{slug}` table name. Hand-made tables become
> **orphans** — they exist physically but don't resolve through `resolveView(source_id)`, so the CLI, the
> lineage UI, and every Card/Map binding behave inconsistently. (Worked rationale:
> `references/employment_estimates/notes/npmrds2_new_datasource_via_dmsserver.md`.)

This is for **datasets** (become DaMa sources). For a plain **file attachment** (a PDF, an audio file —
appears as a `file_upload` source, not a queryable table) use the different `/dms-admin/:app/file_upload`
path — see [`uploading-a-song-and-audio-player.md`](./uploading-a-song-and-audio-player.md).

## Endpoints (all on the API host; `damaServerPath = {API_HOST}/dama-admin/{pgEnv}`)
Client source of truth: `patterns/datasets/components/upload.jsx` + `…/gis_dataset/pages/Create/*`.
Server: `packages/dms-server/src/dama/upload/` (`index.js` routes, `gis-routes.js`, `metadata.js`).

| Step | Method · path | Purpose |
|---|---|---|
| 1 | `GET /etl/new-context-id` | mint an `etlContextId` (correlates all events for this ingest) |
| 2 | `POST /gis-dataset/upload` (multipart) | upload the file; **used for BOTH GIS and CSV**. Returns `[{ id }]` → `gisUploadId` (a `dms_<uuid>` string) |
| 2.5 | `GET /gis-dataset/:fileId/layerNames` until non-empty | **the upload processes ASYNC** — poll this until it returns a non-empty array (status `processing`→`ready`). Calling analysis before that fails with `Upload … not ready`. |
| 3 | (use the layer from 2.5) | GIS: real layer names; CSV: a single pseudo-layer |
| 4 | `POST /gis-dataset/:fileId/:layerName/layerAnalysis` | start GDAL/schema analysis → `{ etl_context_id }` |
| 5 | `GET /gis-dataset/:fileId/:layerName/layerAnalysis` | poll until done → column schema (types, geom) |
| 6 | `GET /staged-geospatial-dataset/:fileId/:layerName/tableDescriptor` | the `tableDescriptor` (columns + types) the publish needs |
| 7 | `POST /gis-dataset/publish` **or** `POST /csv-dataset/publish` | create source+view+table → `{ etl_context_id, source_id }` |
| 8 | `GET /events/query?etl_context_id=…&event_id=-1` | poll publish to completion (final event) |

Auth: every call needs the session JWT (`Authorization: Bearer <token>`). Mint it per
[`authenticating-the-dms-cli.md`](./authenticating-the-dms-cli.md) (`POST {API_HOST}/login`).

## Payloads (the two that matter)

**Step 2 — upload** (`multipart/form-data`):
`etlContextId`, `user_id`, `email`, `name` (the DaMa source name), `type` (`gis_dataset` | `csv_dataset`),
`fileSizeBytes`, `file` (the binary). → `[{ id }]`.

**Step 7 — publish** (`application/json`):
```json
{
  "source_id": null,                       // null = create a new source; or an existing id to add a view
  "source_values": { "name": "<source name>", "type": "gis_dataset" },   // or "csv_dataset"
  "layerName": "<layer from step 2.5>",    // ⚠️ REQUIRED, TOP-LEVEL — the worker reads it from the body,
                                           //    NOT from tableDescriptor.layerName. Omit it and the worker
                                           //    runs `SELECT * FROM "undefined"` → ogr2ogr "no such table".
  "tableDescriptor": { /* from step 6 — columns + types + geometry */ },
  "user_id": "<id>", "email": "<email>",
  "gisUploadId": "<fileId from step 2>",
  "etlContextId": "<from step 1>"
}
```
→ `{ etl_context_id, source_id }`. Publish is **async** (a queued task); poll step 8 until the final event
reports success. `metadata.js` then has created the source, the view, and the
`gis_datasets.s{source_id}_v{view_id}_{slug}` table.

## Headless script skeleton
```js
// node, dependency-free. ENV: API_HOST, PG_ENV, TOKEN (from /login), USER_ID, EMAIL
const base = `${API_HOST}/dama-admin/${PG_ENV}`;
const H = { Authorization: `Bearer ${TOKEN}` };
const j = async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };
const poll = async (url, done, ms = 2000, tries = 120) => {
  for (let i = 0; i < tries; i++) { const e = await j(await fetch(url, { headers: H }));
    if (done(e)) return e; await new Promise(s => setTimeout(s, ms)); }
  throw new Error("timeout: " + url);
};

// 1) context id
const { etlContextId } = await j(await fetch(`${base}/etl/new-context-id`, { headers: H }));
// 2) upload (use a multipart lib or FormData with a Blob/stream of the file)
const fd = new FormData();
fd.append("etlContextId", etlContextId); fd.append("user_id", USER_ID); fd.append("email", EMAIL);
fd.append("name", SOURCE_NAME); fd.append("type", TYPE /* gis_dataset|csv_dataset */);
fd.append("fileSizeBytes", String(size)); fd.append("file", fileBlob, fileName);
const [{ id: gisUploadId }] = await j(await fetch(`${base}/gis-dataset/upload`, { method: "POST", headers: H, body: fd }));
// 2.5) WAIT FOR READINESS — the upload processes async; layerNames is [] until status='ready'
const layers = await poll(`${base}/gis-dataset/${gisUploadId}/layerNames`,
  r => Array.isArray(r) && r.length > 0, 3000, 200);   // big .gpkg can take minutes
const layer = layers[0];
// 4-5) analysis (start, then poll)
await fetch(`${base}/gis-dataset/${gisUploadId}/${layer}/layerAnalysis`, { method: "POST", headers: H });
await poll(`${base}/gis-dataset/${gisUploadId}/${layer}/layerAnalysis`, e => !e?.message /* no "in progress" */);
// 6) descriptor
const tableDescriptor = await j(await fetch(`${base}/staged-geospatial-dataset/${gisUploadId}/${layer}/tableDescriptor`, { headers: H }));
// 7) publish
const pubUrl = `${base}/${TYPE === "csv_dataset" ? "csv-dataset" : "gis-dataset"}/publish`;
const { etl_context_id, source_id } = await j(await fetch(pubUrl, { method: "POST",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ source_id: null, source_values: { name: SOURCE_NAME, type: TYPE },
    layerName: layer,   // ⚠️ top-level, required
    tableDescriptor, user_id: USER_ID, email: EMAIL, gisUploadId, etlContextId }) }));
// 8) poll publish to completion
await poll(`${base}/events/query?etl_context_id=${etl_context_id}&event_id=-1`,
  evs => Array.isArray(evs) && evs.some(e => /publish/i.test(e?.type || "") && /done|complete|final/i.test(JSON.stringify(e))));
console.log("published source_id", source_id);
```
Get `USER_ID`/`EMAIL` from the dmsEnv / the logged-in user (the JWT payload carries them; the dev user is
`availabs@gmail.com`). Run the actual values against the live server — endpoint responses are the contract;
log each step's JSON the first time so you can adapt the `done(...)` predicates to the real event shapes.

## GIS vs tabular
- **GIS** (`.gpkg` / `.shp(.zip)` / `.geojson`): `type=gis_dataset`, publish `…/gis-dataset/publish`. GDAL
  analysis (step 4–5) infers geometry + column types; the table carries a geometry column → bindable by a
  **Map** section (choropleth) and by Card/Spreadsheet on attributes.
- **Tabular** (`.csv`): `type=csv_dataset`, publish `…/csv-dataset/publish`. Same upload + analysis
  endpoints (the upload route is shared); schema is column types only, no geometry → Card / Spreadsheet /
  Graph. Use this for long/attribute tables; use a GIS layer (or a join to a geography source) for maps.
  - **⚠️ CSV schema-inference mis-types "code" columns as INTEGER.** Identifier columns that *look* numeric
    get inferred as `INTEGER`, then the COPY dies with `invalid input syntax for type integer: "31-33"` when
    a non-numeric value appears (NAICS sector codes include ranges `31-33`/`44-45`/`48-49`; geoids have
    leading zeros). **Before publishing, walk `tableDescriptor.columnTypes` and force code/id columns to
    `TEXT`** (e.g. names matching `/geoid|naics_code|mpo_code|fips|_code$/`). GIS (.gpkg) analysis usually
    types these correctly already; it's the CSV path that needs the coercion. The error is **atomic** — one
    bad value fails the whole load, so a file with no ranges can sneak through while its sibling fails.

## After publish — metadata + verify
- **Fill metadata** so the dataset is usable: set `sources.metadata.columns` (per-column `display_name`,
  `description`, `units`), `categories`, and a description. (Edit the source row via the CLI / datasets
  admin — same `data_items` source row.)
- **Verify it resolves** (no orphan): `dms dataset list` / `dms dataset show <id-or-name>` /
  `dms dataset views <id>` should show the new source/view; a Card/Map `externalSource` bound to
  `{ source_id, view_id, env: '<pgEnv>' }` renders. The physical table is
  `gis_datasets.s{source_id}_v{view_id}_{slug}`.

## Gotchas
- **Run upload → publish CONTINUOUSLY (no long gap).** The uploaded file is staged on the dms-server's
  local FS (`var/tmp-etl/<fileId>/…`) and is **cleaned up** between sessions. If you upload, wander off to
  debug, then publish minutes later, the `gis-publish` worker throws **"Data file not found"** (it errors
  *before* its first `INITIAL` event — that signature = the staged file is gone). Do the whole flow in one run.
- **Publish creates the source row BEFORE the worker validates the file** — so a failed publish leaves an
  **orphan `data_manager.sources` row with no view/table**. On retry, **pass that `source_id`** (instead of
  `null`) so the worker just adds the missing view+table to it — otherwise `createDamaSource` makes a
  name-suffixed duplicate (`…_2`). Don't hand-delete the orphan from the prod DB; reuse it (or use a proper
  DaMa delete path).
- **Upload is async** — poll `layerNames` until non-empty before analysis (step 2.5).
- **Never hand-write `data_manager.*` / `gis_datasets` tables** — orphan-table hazard (top of file).
- **Publish is async** — you MUST poll `/events/query` (step 8); the POST returns immediately with an
  `etl_context_id`, not a finished table.
- **`fileId` is `resValue[0].id`** — the upload returns an array (`[{ id }]`), not a bare object.
- **Auth on every call** — the `/dama-admin/*` routes are behind the JWT middleware; a missing token reads
  as `no-access`/401.
- **`events/query` does NOT return the message text** — only `{event_id, type, payload, meta, error,
  created_at}`. The actual worker log/error strings (e.g. the ogr2ogr stderr) live in the
  `data_manager.task_events.message` column and in the **dms-server console**: publish workers run as a
  **forked child** (`runWorkerInBackground` → `worker-runner.js`) whose stdout/stderr the parent prints
  prefixed `[task:<id>]`. So to debug a failed publish, watch the server terminal (or read
  `task_events.message`) — polling `events/query` only tells you the *sequence* of events
  (`INITIAL → VIEW_CREATE → ogr2ogr_start → ogr2ogr_progress → error`), not why it failed.
- **A failed publish leaves partial state**: the source row (created by the route up-front) and, if it
  reached `VIEW_CREATE`, a view row with an empty/failed table. Reuse the source on retry; clean stray views
  via a DaMa path, not raw SQL.
- **Big files** — stream the file in the multipart body; GDAL analysis on large `.gpkg` can take a while,
  so size the poll timeout generously.
- **Confirm `pgEnv` + version with the user** before ingesting a persistent source (promoting a fixture is
  cheap; un-publishing a malformed source is not).

## Worked example (employment_estimates → npmrds2)
Upload `references/employment_estimates/out/v4/employment_by_industry_tract_2022.gpkg` as a GIS source to
`npmrds2` (name `employment_by_industry_tract_2022`, `type=gis_dataset`), then the block-group and block
`.gpkg`; upload the long `…_2022.csv` as `csv_dataset` for the by-NAICS charts; then fill `metadata.columns`
(`est_emp`, `est_emp_low/high`, `bp_emp`, `wac_emp`, `data_confidence`, `bp_trust`, `naics_code`→sector) and
category `["Employment","NYS 2022"]`. Consumer: `planning/transportny/.../employment-statistics-pages.md`.

## Source of truth (code)
- Routes: `packages/dms-server/src/dama/upload/index.js`; handlers `gis-routes.js`; source/view/table +
  `s{id}_v{id}_{slug}` naming `metadata.js`; schema `analyzeSchema.js` / `analysis.js`; GDAL `gdal.js`.
- Client flow: `patterns/datasets/components/upload.jsx`, `…/gis_dataset/pages/Create/{uploadFile,
  selectLayer,schemaEditor,publish}/index.jsx`.
- Cross-refs: `internal-datasets-overview.md` (the DMS-internal variant), `authenticating-the-dms-cli.md`.
