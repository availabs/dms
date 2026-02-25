# DMS Server File Upload

## Objective

Move file upload, analysis, and publish routes out of the avail-falcor datamanager and into the DMS server as standalone, streamlined endpoints. The current client code hardcodes `https://graph.availabs.org` for these routes because they only exist on the production DAMA server. The goal is self-contained upload routes on dms-server with minimal infrastructure dependencies.

## Current State

### Client-Side Endpoints (datasets pattern)

The internal dataset upload flow (`components/upload.jsx`) uses these endpoints, all currently hardcoded to production:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/{pgEnv}/etl/new-context-id` | GET | Get tracking context ID |
| `/{pgEnv}/gis-dataset/upload` | POST | Upload file (multipart form) |
| `/{pgEnv}/gis-dataset/{id}/layers` | GET | Get layer metadata after processing |
| `/dms/{app}+{type}/publish` | POST | Publish parsed data into DMS tables |

The GIS dataset create flow (`pages/dataTypes/gis_dataset/pages/Create/`) uses additional endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/{pgEnv}/gis-dataset/{id}/layerNames` | GET | List layer names |
| `/{pgEnv}/gis-dataset/{id}/{layer}/layerAnalysis` | POST/GET | Analyze layer schema |
| `/{pgEnv}/staged-geospatial-dataset/{id}/{layer}/tableDescriptor` | GET | Get table schema |
| `/{pgEnv}/gis-dataset/publish` | POST | Publish GIS dataset to DAMA |
| `/{pgEnv}/csv-dataset/publish` | POST | Publish CSV dataset to DAMA |
| `/{pgEnv}/events/query?etl_context_id=X&event_id=-1` | GET | Poll async operation progress |

And the validate/download flows:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/dms/{app}+{type}/validate` | POST | Re-validate dataset rows |
| `/{pgEnv}/gis-dataset/create-download` | POST | Create download files |
| `/{pgEnv}/gis-dataset/delete-download` | DELETE | Delete download files |
| `/{pgEnv}/cache-pmtiles` | POST | Cache PMTiles for maps |

### Server-Side Reference Implementation

Located in `references/avail-falcor/dama/routes/data_types/file-upload/`:

| File | Purpose |
|------|---------|
| `upload.routes.js` | HTTP route: receives multipart upload via busboy, writes to disk, queues worker |
| `upload.worker.mjs` | Async worker: extracts ZIP/TAR archives, detects file types, extracts metadata |
| `analysis.routes.js` | HTTP routes: layer listing, layer analysis, table descriptor generation |
| `analysis.worker.mjs` | Async worker: GDAL-based schema analysis, CSV type inference via ogrinfo |
| `analyzeSchema.js` | Core logic: infers PG column types from data samples (INT/BIGINT/NUMERIC/TEXT) |
| `upload_utils.js` | Utilities: file metadata, directory management |

#### Heavy Infrastructure Dependencies

The reference implementation depends on significant datamanager infrastructure:

1. **pg-boss task queue** — PostgreSQL-backed job queue for async workers. Routes don't process files directly; they queue tasks that run in separate child processes with locking, retry, and host-ID validation.

2. **ETL context / event system** — `data_manager.etl_contexts` and `data_manager.event_store` tables. Every step emits events (`upload:INITIAL`, `upload:GIS_FILE_UPLOAD_PROGRESS`, `upload:FINAL`, etc.). Clients poll events to track progress.

3. **Worker subprocess isolation** — `task_runner.mjs` spawns detached child processes per task, acquires PostgreSQL advisory locks, validates host IDs to prevent cross-environment execution.

4. **GDAL / ogrinfo** — System-level geospatial tools for GIS file analysis. The `gdal-async` npm module and `ogrinfo` CLI command are used to read shapefiles, GeoJSON, GPKG, FileGDB formats.

5. **Config system** — `etlDir` (`/var/tmp-etl`), `dataDir`, `logDir`, `host_id` (UUID), etc.

6. **Database tables** — `data_manager.etl_contexts`, `data_manager.event_store`, pgboss schema tables.

## Design Principles

### Extensible File Type System

The upload system must be designed as a **pluggable processor architecture** so new file types can be added over time:

- **Tier 1 (this task):** CSV, Excel (.xlsx)
- **Tier 2 (future):** Spatial formats via GDAL — Shapefile (.shp), FileGDB (.gdb), GeoPackage (.gpkg), GeoJSON
- **Tier 3 (future):** Images, PDFs, other binary assets

Each file type is handled by a **processor module** that implements a common interface:
```
{ canHandle(fileInfo), analyze(filePath) → layers[], publish(filePath, layerName, columns) → rows[] }
```

New types are added by registering a new processor — no changes to the upload/polling/publish routes themselves.

### Async Upload + Polling (Not Synchronous)

Upload and analysis must be **separate routes with polling**, not a single synchronous request. Reasons:
- Large CSV/Excel files can take longer to parse than HTTP request timeouts allow
- Spatial formats (future) require GDAL processing that is inherently slow
- The client already has polling UI ("Uploading...") that works well with this pattern

The approach: upload returns an **upload ID** immediately. Analysis runs in the background (in-process, not a subprocess — no pg-boss needed). Client polls a status endpoint until analysis is ready. This is simpler than the reference implementation's event store but solves the same timeout problem.

### Backward-Compatible Route Design

The client needs to easily switch between the new dms-server routes and the current production DAMA routes. Two options (choose during implementation):

**Chosen approach: Mirror the DAMA route shape on dms-server.** Use the same URL patterns so the client only needs to swap the host:
- `POST /dama-admin/:pgEnv/gis-dataset/upload`
- `GET /dama-admin/:pgEnv/gis-dataset/:id/layers`
- `POST /dama-admin/dms/:appType/publish`
- `POST /dama-admin/dms/:appType/validate`
- `GET /dama-admin/:pgEnv/etl/new-context-id`

The `:pgEnv` param can be ignored or used for future multi-env support. The client switches servers by toggling `damaServerPath` between `https://graph.availabs.org/dama-admin/${pgEnv}` and `${API_HOST}/dama-admin/${pgEnv}`. No per-endpoint client changes needed — just one host swap.

## Proposed Approach

Start with CSV/Excel for internal datasets. Design the route contract and processor interface so spatial types and other file types can be added later without changing the route layer.

### Phase 1: Upload Route + Background Processing — DONE

**Implementation Steps:**

- [x] **Step 1.1:** Install dependencies — `busboy`, `read-excel-file`, `unzipper` added to package.json
- [x] **Step 1.2:** Create upload directory structure — `src/upload/` with `index.js`, `routes.js`, `processors/`, `store.js`
- [x] **Step 1.3:** Implement upload store — `store.js`: in-memory Map, status tracking, upload ID generation, context counter
- [x] **Step 1.4:** Implement CSV processor — `processors/csv.js`: header parsing with quoted field support, snake_case names
- [x] **Step 1.5:** Implement Excel processor — `processors/excel.js`: sheet enumeration, header extraction per sheet
- [x] **Step 1.6:** Implement archive extraction — ZIP extraction via unzipper, recursive data file discovery
- [x] **Step 1.7:** Implement routes — all three DAMA-compatible endpoints
- [x] **Step 1.8:** Register in `src/index.js` — after JWT middleware, removed `multipart/form-data` from urlencoded to avoid busboy conflict
- [x] **Step 1.9:** Smoke tested — raw CSV, zipped CSV both return correct layer metadata

**Design note:** busboy `finish` event fires before file write stream completes. Added `fileWritePromise` to await write stream `finish` event before starting analysis.

**New files:**
- `src/upload/index.js` — route registration (3 routes)
- `src/upload/routes.js` — handler implementations (newContextId, upload, getLayers, processUpload, extractZip, findDataFile)
- `src/upload/store.js` — in-memory upload state (create, get, setReady, setError, nextContextId, generateUploadId)
- `src/upload/processors/index.js` — processor registry
- `src/upload/processors/csv.js` — CSV/TSV processor
- `src/upload/processors/excel.js` — XLSX processor

**Route details:**

**`GET /dama-admin/:pgEnv/etl/new-context-id`** — Returns a tracking ID (incrementing integer for DAMA compat)

**`POST /dama-admin/:pgEnv/gis-dataset/upload`** — Receives multipart file upload
- Accepts file + metadata (etlContextId, userId, email, fileSizeBytes)
- Saves file to temp directory, generates upload ID
- Returns upload ID **immediately**: `[{ id: "upload-abc123" }]` (matches DAMA response shape)
- Kicks off analysis in background (in-process async, not subprocess)
- Analysis: extract archive if zipped, detect file type, delegate to processor, extract sheet/layer names + column metadata
- Stores result in-memory keyed by upload ID

**`GET /dama-admin/:pgEnv/gis-dataset/:id/layers`** — Poll for analysis completion
- Returns `[]` while analysis is still running (matches current DAMA behavior that the client already polls for)
- Returns `[{layerName, fieldsMetadata}]` when done

This keeps the exact same client flow and polling logic already in `upload.jsx`.

**Processor interface:**
```
{ canHandle(ext) → bool, analyze(filePath) → [{layerName, fieldsMetadata}], parseRows(filePath, layerName, columns) → rows[] }
```
- CSV processor: parse headers + read rows with column mappings
- Excel processor: read sheet names, parse headers per sheet, read rows per sheet
- Future: GDAL processor, image processor — same interface, different implementation

**Phase 1→2 bridge:** store now tracks `dataFilePath` so publish route can locate the uploaded data file. Processors need `parseRows()` method added in Phase 2.

### Phase 2: Publish Route — DONE

**`POST /dama-admin/dms/:appType/publish`** — Publish parsed data into DMS tables (`:appType` is `{app}+{type}`)
- Accepts `{ gisUploadId, layerName, columns, user_id, email }`
- Reads the previously uploaded file from temp directory
- Delegates to the file type's processor to parse rows with column mappings
- Writes rows into DMS `data_items` (or split table) using the existing DMS data layer
- Updates source config with column metadata
- Returns success/failure (can be synchronous for small files, or async with polling for large ones — use same status pattern)

This replaces: `POST /dms/{app}+{type}/publish` — same route path, just on dms-server instead of DAMA

**Implementation Steps:**

- [x] **Step 2.1:** Added `parseRows` to CSV and Excel processors — CSV returns array of arrays (header + data rows), Excel reads rows from named sheet
- [x] **Step 2.2:** Created `createPublishHandler(controller)` in routes.js — full row processing with validation, pivot columns, multiselect splitting, primary key upsert
- [x] **Step 2.3:** Added `findByDataKey` and `updateDataById` to dms.controller.js — used QueryBuilder for cross-DB parameter handling
- [x] **Step 2.4:** Registered publish route in upload/index.js — `POST /dama-admin/dms/:appType/publish`
- [x] **Step 2.5:** Smoke tested insert — 3 CSV rows created successfully, verified in SQLite
- [x] **Step 2.6:** Fixed `findByDataKey` parameter mismatch — `buildArrayComparison` for SQLite returns `IN (?, ?)` which mixed with `$N` params. Switched to `QueryBuilder` which generates consistent `?` for SQLite and `$N` for PostgreSQL.
- [x] **Step 2.7:** Smoke tested upsert — matching rows updated by primary key, non-matching rows inserted, mixed batch works correctly

**Bug fix:** `buildArrayComparison` generates `IN (?, ?)` for SQLite but the rest of the SQL used `$N` params. The SQLite adapter's `translateParams` only reorders `$N`-style values, causing a mismatch. Fixed by using `QueryBuilder` class which accumulates all params in a single style.

### Phase 3: Validate Route — DONE

**`POST /dama-admin/dms/:appType/validate`** — Re-validate dataset rows
- Accepts `{ parentId, parentDocType }`
- Re-validates rows against column rules
- Moves invalid rows to `{type}-invalid-entry` type
- Returns validation summary

This replaces: `POST /dms/{app}+{type}/validate` — same route path, just on dms-server instead of DAMA

**Implementation Steps:**

- [x] **Step 3.1:** Added `getSourceConfig`, `getRowsByTypes`, and `batchUpdateType` methods to dms.controller.js
- [x] **Step 3.2:** Created `createValidateHandler(controller)` in routes.js — fetches config, loads all rows (valid + invalid types), re-validates each row against column rules, batch moves rows between types
- [x] **Step 3.3:** Registered validate route in upload/index.js — `POST /dama-admin/dms/:appType/validate`
- [x] **Step 3.4:** Smoke tested — 6 test rows: 2 invalid in valid type moved to invalid, 1 valid in invalid type moved to valid, 3 correctly placed stayed put
- [x] **Step 3.5:** Verified idempotent — re-running validate returns "0 rows updated"

**Design note:** Follows same pattern as reference implementation — only the `type` column is updated (not the `data.isValid` flag). The type column is the authoritative indicator; `data.isValid` is set during publish but the reference validate also doesn't persist it back.

### Phase 4: Client Migration — DONE

Update the client upload component (`components/upload.jsx`) to:
- [x] Change `damaServerPath` from `https://graph.availabs.org/dama-admin/${pgEnv}` to `${API_HOST}/dama-admin/${pgEnv}`
- [x] Change `dmsServerPath` from `https://graph.availabs.org/dama-admin` to `${API_HOST}/dama-admin`
- [x] Remove `awaitFinalEvent` Falcor polling (layers HTTP polling handles this)
- [x] Remove `SKIP_FALCOR_POLLING` toggle
- [x] Keep existing upload UI unchanged
- [x] `ValidateComp.jsx` already uses `${API_HOST}/dama-admin` — no changes needed

### Phase 5: Cleanup — DONE

- [x] Remove hardcoded `https://graph.availabs.org` from upload.jsx
- [x] Remove ETL context ID state, useEffect, and formData field
- [x] Remove unused imports (`get` from lodash, `update` from lodash)
- [x] Remove `falcor` and `pgEnv` from `uploadGisDataset` params (no longer needed)
- [x] Remove `falcor` from Edit component context destructure
- [x] Remove debug `console.log('testing'...)` line
- [x] Verified build succeeds with no errors
- [x] GIS create flow (`gis_dataset/pages/Create/`) stays on DAMA for now — migrates when GDAL processor is added

## Files Requiring Changes

### Server (dms-server)
- `src/routes/` — new upload route file(s)
- `package.json` — add `busboy` or `multer` for multipart parsing, `read-excel-file` for XLSX

### Client (patterns/datasets)
- `components/upload.jsx` — main upload component, remove hardcoded URLs, use new endpoints
- `components/ValidateComp.jsx` — update validate endpoint (line 287: `dmsServerPath`)
- `pages/dataTypes/internal/pages/upload.jsx` — may need format/prop adjustments

## Out of Scope (This Task)

- **GDAL spatial processors** — Shapefile, GDB, GPKG support is a future tier, not this task. Design the interface now, implement later.
- **Image/binary upload processors** — future tier
- External dataset create flow (`gis_dataset/pages/Create/`) — stays on DAMA until GDAL processor exists
- Download creation / PMTiles caching — stays on DAMA server
- pg-boss task queue — not needed; simple in-process async is sufficient
- ETL context / event store tables — replaced by upload ID + status endpoint

## Future Extensibility Notes

When adding spatial format support (Tier 2):
- Add a GDAL processor module implementing `{ canHandle, analyze, publish }`
- Register it in the processor registry
- No route changes needed — the upload route delegates to whichever processor matches
- GDAL processing is slow, but the async polling pattern already handles this
- May need `gdal-async` and system `ogrinfo` as optional dependencies
- Consider the GIS create flow client (`gis_dataset/pages/Create/`) migration at that point

When adding image support (Tier 3):
- Add an image processor that extracts dimensions, format, EXIF metadata
- "Layers" concept may not apply — processor returns a single entry with file metadata
- Publish step stores the file reference rather than parsed rows

## Testing Checklist

### Phase 1 (Upload + Analysis)
- [x] `GET /dama-admin/:pgEnv/etl/new-context-id` → returns incrementing integer
- [x] `POST /dama-admin/:pgEnv/gis-dataset/upload` with raw CSV → returns `[{ id }]`, layers ready on poll
- [x] `POST /dama-admin/:pgEnv/gis-dataset/upload` with zipped CSV → extraction + analysis works
- [ ] Upload Excel file → layers include sheet names with column metadata per sheet
- [ ] Large file upload → doesn't timeout, polling returns result when ready
- [ ] `GET /dama-admin/:pgEnv/gis-dataset/:id/layers` → returns `[]` while processing, layers when ready
- [ ] Error cases: unsupported file type, corrupt archive, empty file
- [ ] Client upload flow works end-to-end against local dms-server

### Phase 2 (Publish)
- [x] `POST /dama-admin/dms/:appType/publish` → rows written to data_items
- [x] Publish with column mappings → columns renamed correctly
- [x] Publish with primary key → existing rows updated on match (upsert)
- [x] Publish mixed batch → updates existing rows + inserts new ones
- [ ] Publish with pivot columns → headers become values
- [ ] Client publish flow works end-to-end against local dms-server

### Phase 3 (Validate)
- [x] `POST /dama-admin/dms/:appType/validate` → invalid rows moved to `-invalid-entry` type
- [x] Validate with mixed valid/invalid rows → correct type changes
- [x] Re-validate (idempotent) → 0 rows updated

### Phase 4+5 (Client Migration + Cleanup)
- [x] `damaServerPath` and `dmsServerPath` use `API_HOST` instead of hardcoded production URL
- [x] `awaitFinalEvent`, `SKIP_FALCOR_POLLING`, ETL context fetch removed
- [x] Unused imports and params cleaned up
- [x] Build succeeds with no errors
- [x] `ValidateComp.jsx` already used `API_HOST` — no changes needed
- [x] GIS create flow stays on DAMA (out of scope)

### Post-Implementation Fixes
- [x] `ExternalSourceAttributes` missing `app` and `doc_type` → tables/validate pages showed blank (`undefined+undefined`)
- [x] SQLite identifier error: digit-prefixed column aliases (e.g. `2_federal_state_local_coordination`) need double-quoting → added `quoteAlias()` to `uda/utils.js`, applied in `getSourceById`, `getViewById`, `simpleFilter`, `dataById`, `applyMeta`
- [x] PostgreSQL adapter `query()` had no error logging → added try/catch with SQL + values output matching SQLite adapter format
- [x] Upload/publish/validate route logging added (`[upload]`, `[publish]`, `[validate]` prefixes)
- [x] Same `quoteAlias` fix applied to reference avail-falcor (`udaController.js`, `uda_query_sets/helpers.js`, `uda_query_sets/postgres.js`)
- [x] Table splitting: UUID-based types (internal_dataset) no longer split — stay in `data_items` like production. Only name-based types (internal_table) get split tables. Updated `isSplitType()` in `table-resolver.js`, 74 tests pass.
- [x] Developer docs written: `dms-server/docs/upload.md` — routes, architecture, flow, processors, controller methods, logging
- [x] UDA `getSourceById` DMS path: `source_id` returned null because `data->>'source_id'` doesn't exist in DMS rows — added COALESCE fallback to row `id` (same pattern as `getViewById`'s `view_id` mapping). Same fix applied to reference avail-falcor `udaController.js`.
- [x] Publish handler now saves config (column metadata) on the source record directly — client's fire-and-forget `apiUpdate` was unreliable (navigate() in wrapper.jsx could interrupt the Falcor call). Server derives source ID from the publish type's doc_type via `controller.findSourceIdByDocType()` when client doesn't provide `sourceId`. Also accepts optional `sourceId` in request body as a direct path. Config is merged via `setDataById`.
