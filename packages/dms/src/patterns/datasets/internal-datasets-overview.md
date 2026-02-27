# Internal Datasets Overview

## What Is an Internal Dataset?

An internal dataset is a DMS-managed data source where both the metadata (column definitions, categories, description) and the actual row data live in the DMS `data_items` table. This is in contrast to external (DAMA) datasets, where metadata lives in `data_manager.sources` and row data lives in dedicated PostgreSQL tables managed by the DAMA ETL pipeline.

Internal datasets use the same `app + type` namespace as all other DMS content (sites, patterns, pages, sections). Everything shares a single `data_items` table.

## Data Model

A complete internal dataset creates multiple records in `data_items`:

### 1. Pattern Record (container)

The datasets pattern itself — contains a `sources` array referencing all datasets.

```
id: 10
app: 'myapp'
type: 'siteType|pattern'
data: {
  doc_type: 'abc-123',           // UUID, used as namespace for sources
  name: 'Datasets',
  pattern_type: 'datasets',
  sources: [
    {ref: 'myapp+abc-123|source', id: 20},
    {ref: 'myapp+abc-123|source', id: 21},
  ]
}
```

### 2. Source Record (dataset metadata)

One per dataset. Contains the dataset's name, column definitions, categories, and a views array.

```
id: 20
app: 'myapp'
type: 'abc-123|source'
data: {
  name: 'My Dataset',
  doc_type: 'def-456',           // UUID, used as namespace for this source's data
  type: 'internal_dataset',
  description: '{"root":{"children":[...]}}',   // Lexical JSON
  categories: [["Transportation", "Roads"]],
  config: '{"attributes":[...]}',               // Column definitions (JSON string)
  statistics: '{"auth":{"users":{},"groups":{}}}',
  views: [
    {ref: 'myapp+abc-123|source|view', id: 30},
  ]
}
```

### 3. View Record (version)

One per version of the dataset. Views are created via the Admin tab's "Add Version" button.

```
id: 30
app: 'myapp'
type: 'abc-123|source|view'
data: {
  name: 'version 1'
}
```

### 4. Data Rows

One `data_items` record per row of uploaded data. Created by the publish endpoint after CSV upload. The `type` is derived from the source's `doc_type` + the view ID.

```
id: 100 ... 10000
app: 'myapp'
type: 'def-456-30'              // source doc_type + '-' + view_id
data: {
  column_a: 'value1',
  column_b: 'value2',
  geoid: '36001',
  ...
}
```

Invalid entries from validation are stored with a `-invalid-entry` suffix:

```
type: 'def-456-30-invalid-entry'
```

### Relationship Diagram

```
Pattern (type: 'siteType|pattern')
  └─ data.sources[]: [{ref, id}]
       │
       ├─ Source (type: 'abc-123|source')
       │    ├─ data.config: column definitions
       │    ├─ data.categories: classification
       │    └─ data.views[]: [{ref, id}]
       │         │
       │         └─ View (type: 'abc-123|source|view')
       │              │
       │              ├─ Data Rows (type: 'def-456-30')
       │              │    └─ data: {col1: val, col2: val, ...}
       │              │
       │              └─ Invalid Rows (type: 'def-456-30-invalid-entry')
       │                   └─ data: {col1: val, col2: val, ...}
       │
       └─ Source 2 (type: 'abc-123|source')
            └─ ...
```

## Creation Flow

### Step 1: Create Dataset (CreatePage.jsx)

User navigates to `/create`, selects type ("Create new" or an external data type), enters a name, and clicks Create.

```
CreatePage.handleCreate()
  → newData = {name, doc_type: crypto.randomUUID()}
  → apiUpdate({
      data: {...parent, sources: [...existingSources, newData]},
      config: {format}
    })
```

This calls `dmsDataEditor` which:
1. Recognizes `sources` as a `dms-format` attribute (array of sub-items)
2. Calls `updateDMSAttrs` which:
   - For the new source (no `id`): `falcor.call(["dms", "data", "create"], [app, type, data])`
   - Server inserts: `INSERT INTO data_items (app, type, data) VALUES ($1, $2, $3)`
   - Returns `{ref: 'app+type|source', id: newId}`
3. Updates the pattern record's `data.sources` array with the new `{ref, id}`

### Step 2: Add Version (Admin tab → AddViewBtn)

User clicks "Add Version" in the Admin tab, enters a version name.

```
AddViewBtn.addView()
  → data = cloneDeep(source)
  → data.views = [...(data.views || []), {name: 'version 1'}]
  → apiUpdate({data, config: {format}})
```

This calls `dmsDataEditor` → `updateDMSAttrs`:
- Creates a new `data_items` record with `type: 'abc-123|source|view'`
- Updates the source record's `data.views` array

### Step 3: Upload Data (Upload tab)

Requires a version to be selected. User uploads a CSV/Excel file.

**Phase 1: File Upload**
```
POST /dama-admin/{pgEnv}/gis-dataset/upload
  → FormData: {etlContextId, user_id, email, fileSizeBytes, file}
  → Returns: [{id: gisUploadId}]
```

The server parses the file, extracts layer/sheet information and column metadata.

**Phase 2: Column Mapping**

The UI shows detected columns and lets the user:
- Map uploaded columns to existing metadata columns
- Mark geo columns
- Select a primary key column (for upsert behavior)
- See pivot column detection

**Phase 3: Publish**
```
POST /dama-admin/dms/{app}+{type}/publish
  → Body: {user_id, email, gisUploadId, layerName, columns}
  → type = 'def-456-30' (source.doc_type + '-' + view_id)
```

The publish endpoint:
1. Reads the uploaded file data
2. Creates one `data_items` row per data row: `INSERT INTO data_items (app, type, data) VALUES ($1, $2, $3)`
3. Each row's `data` column contains the mapped column values as a flat JSON object
4. If a primary column is set, existing rows with matching values are updated instead of inserted

If new columns are detected during upload, the source's `config` is updated with the new column definitions.

### Step 4: Define Columns Manually (Metadata tab / MetadataComp)

Instead of or in addition to uploading, users can define columns through the MetadataComp UI.

The `config` field stores column definitions as a JSON string:

```json
{
  "attributes": [
    {
      "name": "geoid",
      "display_name": "Geographic ID",
      "type": "text",
      "required": "yes",
      "description": "Census FIPS code"
    },
    {
      "name": "status",
      "display_name": "Status",
      "type": "select",
      "options": [
        {"value": "active", "label": "Active"},
        {"value": "inactive", "label": "Inactive"}
      ],
      "required": "no"
    }
  ]
}
```

MetadataComp provides:
- Drag-and-drop reordering of columns
- Add/remove columns
- Edit column name, display name, type, required flag, options
- Dirty flag tracking (sets `is_dirty: true` when metadata changes since last validation)

## Querying Data

### Source Listing (UDA Routes)

The DatasetsList page queries sources through UDA Falcor routes:

```
falcor.get(['uda', 'myapp+abc-123', 'sources', 'length'])
falcor.get(['uda', 'myapp+abc-123', 'sources', 'byIndex', {from:0, to:N}, attributes])
```

Server-side (`uda.controller.js`):
1. `getSourcesLength(env)` → `getSitePatterns({app})` → `getSiteSources({pattern_ids, doc_types})`
2. Finds patterns with matching app, extracts `data.sources` arrays
3. Returns source metadata from `data_items` using `data->>'name' AS name` style queries

### Data Table View (UDA Routes)

The table component queries row data:

```
falcor.get(['uda', 'myapp+abc-123', 'viewsById', 30, 'options', filterJSON, 'length'])
falcor.get(['uda', 'myapp+abc-123', 'viewsById', 30, 'options', filterJSON, 'dataByIndex', {from:0, to:9}, columns])
```

Server-side (`uda.controller.js`):
1. `getEssentials({env, view_id})` resolves the database, table, and type
2. For DMS mode: `table_schema = 'dms'`, `table_name = 'data_items'`
3. View ID lookup determines the versioned type (e.g., `def-456-30`)
4. `simpleFilter()` builds SQL: `SELECT data->>'col' AS col FROM data_items WHERE app=$1 AND type=$2 ...`

### Mass Edit (Validation)

ValidateComp can batch-update invalid values:

```
falcor.call(['dms', 'data', 'massedit'], [app, type, column, maps])
```

Where `maps` is `[{invalidValue, validValue}, ...]`. The controller runs:
```sql
UPDATE data_items
SET data = json_merge(data, '{"column": "valid_value"}')
WHERE app = $1 AND type = $2 AND data->>'column' = 'invalid_value'
```

## Key Files

| Purpose | File |
|---------|------|
| Dataset creation | `pages/CreatePage.jsx` |
| Dataset listing | `pages/DatasetsList/index.jsx` |
| Source detail page | `pages/SourcePage.jsx` |
| Source overview tab | `pages/dataTypes/default/overview.jsx` |
| Admin tab (versions) | `pages/dataTypes/default/admin.jsx` |
| Version management | `pages/dataTypes/default/version.jsx` |
| Internal dataset config | `pages/dataTypes/internal/index.js` |
| Upload component | `components/upload.jsx` |
| Metadata editor | `components/MetadataComp/index.jsx` |
| Validation | `components/ValidateComp.jsx` |
| Source data utils | `pages/dataTypes/default/utils.jsx` |
| Datasource helpers | `utils/datasources.js` |
| Format definition | `datasets.format.js` |
| Site config (routes) | `siteConfig.jsx` |

### Server Files

| Purpose | File |
|---------|------|
| DMS Falcor routes | `dms-server/src/routes/dms/dms.route.js` |
| DMS controller | `dms-server/src/routes/dms/dms.controller.js` |
| UDA Falcor routes | `dms-server/src/routes/uda/uda.route.js` |
| UDA controller | `dms-server/src/routes/uda/uda.controller.js` |
| UDA utils | `dms-server/src/routes/uda/utils.js` |
| Schema (PostgreSQL) | `dms-server/src/db/sql/dms/dms.sql` |
| Schema (SQLite) | `dms-server/src/db/sql/dms/dms.sqlite.sql` |

## Performance Concern

All DMS content — sites, patterns, pages, sections, dataset metadata, AND dataset row data — lives in a single `data_items` table. A dataset with 100,000 rows creates 100,000 records in the same table that stores the site's 50 pages and 200 sections. This has implications for:

- **Query performance**: Every DMS query scans the same table. The `(app, type)` index helps, but the table can grow very large.
- **Backup/restore**: The entire DMS database must be backed up as a unit.
- **Isolation**: A runaway dataset import can affect all DMS operations.

The table-splitting feature (see task file) aims to address this by routing high-volume data types to separate per-type tables while keeping the API surface unchanged.
