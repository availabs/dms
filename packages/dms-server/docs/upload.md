# Upload Routes

File upload, analysis, publish, and validation endpoints for DMS datasets. Routes mirror the DAMA server URL patterns (`/dama-admin/...`) so the client can switch between servers by changing only the host.

## Architecture

```
src/upload/
  index.js              # Route registration (Express)
  routes.js             # Route handlers (upload, publish, validate)
  store.js              # In-memory upload state (processing → ready → consumed)
  processors/
    index.js            # Processor registry
    csv.js              # CSV/TSV file processor
    excel.js            # Excel (.xlsx/.xls) processor
```

### Flow

```
Client                    Server                         Database
  │                         │                               │
  ├── POST upload ─────────►│ save file to disk             │
  │◄── [{ id }] ───────────│ return immediately             │
  │                         │                               │
  │                         │ (background) analyze file      │
  │                         │   detect type → run processor  │
  │                         │   store layers in memory       │
  │                         │                               │
  ├── GET layers (poll) ───►│ return [] while processing    │
  ├── GET layers (poll) ───►│ return [] while processing    │
  ├── GET layers ──────────►│ return [{layerName, fields}]  │
  │◄── layers ──────────────│                               │
  │                         │                               │
  │  (user maps columns)    │                               │
  │                         │                               │
  ├── POST publish ────────►│ parse rows from stored file   │
  │                         │ for each row:                 │
  │                         │   build data from col mapping │
  │                         │   upsert via controller ─────►│ data_items
  │◄── { data: results } ──│                               │
  │                         │                               │
  ├── POST validate ───────►│ load config + all rows ──────►│ data_items
  │                         │ re-validate each row          │
  │                         │ batch move types ────────────►│ data_items
  │◄── { data: "N updated" }│                               │
```

## Routes

### `GET /dama-admin/:pgEnv/etl/new-context-id`

Returns an incrementing integer as plain text. DAMA compatibility — the client expects a numeric context ID.

**Response:** `"1001"` (text/plain)

### `POST /dama-admin/:pgEnv/gis-dataset/upload`

Receives a multipart file upload via `busboy`. Saves the file to a temp directory, returns an upload ID immediately, then kicks off async file analysis in the background.

**Request:** `multipart/form-data` with fields:
- `file` — the file to upload (CSV, TSV, Excel, or ZIP containing one of these)
- `user_id`, `email`, `fileSizeBytes` — metadata (stored but not used by server)

**Response:** `[{ id: "dms_<uuid>" }]`

**Background processing:**
1. If ZIP, extracts and finds the first supported data file inside
2. Detects file type by extension
3. Runs the matching processor's `analyze()` method
4. Stores layer metadata in the in-memory store

**Supported file types:** `.csv`, `.tsv`, `.xlsx`, `.xls` (directly or inside a `.zip`)

### `GET /dama-admin/:pgEnv/gis-dataset/:id/layers`

Returns the analysis results for a previously uploaded file. The client polls this endpoint until it gets a non-empty array.

**Response while processing:** `[]`

**Response when ready:**
```json
[{
  "layerName": "Sheet1",
  "layerId": "Sheet1",
  "fieldsMetadata": [
    { "name": "county_name", "display_name": "County Name" },
    { "name": "population", "display_name": "Population" }
  ]
}]
```

**Response on error:** `{ "error": "..." }` with status 500

For CSV files, there is one layer named after the file. For Excel files, each sheet is a separate layer.

### `POST /dama-admin/dms/:appType/publish`

Reads a previously uploaded file, parses rows using column mappings from the client, and writes each row into `data_items` via the DMS controller.

**URL param:** `:appType` is `app+type` (e.g., `myapp+02d318d6-bbb8-450d-8c59-c6fd24263141-173`)

**Request body:**
```json
{
  "user_id": 1,
  "email": "user@example.com",
  "gisUploadId": "dms_abc123",
  "layerName": "Sheet1",
  "sourceId": 264,
  "columns": [
    {
      "name": "county_name",
      "display_name": "County Name",
      "existingColumnMatch": "county",
      "type": "text",
      "required": "yes",
      "isPrimary": false,
      "geo_col": false,
      "options": null
    }
  ]
}
```

- `sourceId` — (optional) the DMS row ID of the source record. When provided, the server saves the column metadata as `config` on the source after publishing. This replaces the client's fire-and-forget Falcor call which was unreliable.

**Column mapping logic:**
- `existingColumnMatch` — maps this upload column to an existing dataset column name
- `isPrimary` — if true, used for upsert: matching rows are updated instead of inserted
- `type` — `"select"` or `"multiselect"` triggers validation against `options`
- `required` — `"yes"` means empty values mark the row as invalid

**Pivot columns:** When multiple upload columns map to the same `existingColumnMatch`, their column headers become values in the destination column (e.g., columns "Flooding" and "Wind" both mapping to "hazard_types" produces `["Flooding", "Wind"]`).

**Row validity:** Each row gets an `isValid` flag. Invalid rows are stored with the `-invalid-entry` type suffix so they can be reviewed separately.

**Response:**
```json
{
  "data": [
    { "row": 1, "action": "created", "id": 42 },
    { "row": 2, "action": "updated", "id": 15 },
    { "row": 3, "action": "error", "error": "..." }
  ]
}
```

### `POST /dama-admin/dms/:appType/validate`

Re-validates all dataset rows against the current column rules (required fields, select/multiselect options). Moves rows between the valid type and invalid-entry type as needed.

**URL param:** `:appType` is `app+type` where type is the invalid-entry type (e.g., `myapp+doctype-1-invalid-entry`)

**Request body:**
```json
{
  "parentId": 172,
  "parentDocType": "my_dataset|source"
}
```

**Process:**
1. Loads config (column definitions with validation rules) from the parent source record
2. Fetches all rows of both valid and invalid types
3. Re-validates each row against current rules
4. Batch-moves rows that changed validity status

**Response:** `{ "data": "N rows updated." }`

## In-Memory Store

Upload state is stored in memory (not persisted to database). Each entry tracks:

| Field | Description |
|-------|-------------|
| `id` | Upload ID (`dms_<uuid>`) |
| `status` | `processing` → `ready` or `error` |
| `layers` | Array of `{ layerName, fieldsMetadata }` (set when ready) |
| `dataFilePath` | Path to the data file on disk (for publish to read later) |
| `fileExt` | File extension (e.g., `.csv`) — determines which processor parses rows |
| `error` | Error message (if status is `error`) |

State is lost on server restart. Uploaded files persist in the OS temp directory (`/tmp/dms-uploads/`).

## Processors

Each processor implements:

```js
{
  canHandle(ext)                    // returns boolean
  analyze(filePath)                 // returns [{ layerName, fieldsMetadata }]
  parseRows(filePath, layerName)    // returns [[cell, cell, ...], ...] (first row = headers)
}
```

**CSV processor** (`.csv`, `.tsv`): Reads header row, produces one layer named after the file. Column names are snake_cased.

**Excel processor** (`.xlsx`, `.xls`): Reads all sheets, each becomes a layer. Uses `read-excel-file` for parsing.

### Adding a new processor

1. Create `processors/<type>.js` implementing `canHandle`, `analyze`, and `parseRows`
2. Register it in `processors/index.js`

## Controller Methods Used

The publish and validate handlers use these DMS controller methods:

| Method | Used By | Purpose |
|--------|---------|---------|
| `createData(args, user)` | publish | Insert a new data row |
| `findByDataKey(app, types, key, value)` | publish | Find existing row for upsert |
| `updateDataById(id, type, data, userId)` | publish | Update an existing row |
| `getSourceConfig(app, parentId, parentDocType)` | validate | Load column definitions |
| `getRowsByTypes(app, types)` | validate | Fetch all rows of given types |
| `batchUpdateType(app, fromType, toType, ids)` | validate | Move rows between valid/invalid types |

## Logging

All route handlers log with prefixed tags for easy filtering:

- `[upload]` — file received, ZIP extraction, analysis results, failures
- `[publish]` — request params, row count, completion summary (created/updated/errors)
- `[validate]` — request params, row/rule counts, move counts

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DMS_DB_ENV` | `dms-sqlite` | Database config for the publish/validate controller |

## Client Integration

The client-side upload component (`patterns/datasets/components/upload.jsx`) uses these routes:

1. **Upload phase:** Sends file to `POST /dama-admin/:pgEnv/gis-dataset/upload`
2. **Poll phase:** Polls `GET /dama-admin/:pgEnv/gis-dataset/:id/layers` every 2 seconds
3. **Column mapping:** User maps upload columns to dataset attributes in the UI
4. **Publish:** Sends mapped columns to `POST /dama-admin/dms/:appType/publish`
5. **Validate:** Triggered from the validate page via `POST /dama-admin/dms/:appType/validate`

The `damaServerPath` and `dmsServerPath` are derived from the site's `API_HOST`, so the client talks to the local DMS server rather than production.
