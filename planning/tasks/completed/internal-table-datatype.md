# Internal Table Dataset Type

## Objective

Create a new dataset type `internal_table` in the datasets pattern that combines dataset creation with file upload in a single step. When the user creates an `internal_table` dataset, they upload a file immediately, which auto-creates the first version and publishes its data. The data is stored in a per-type split table (one table per dataset version) using the existing dms-server table-splitting infrastructure.

## Motivation

- The current `internal_dataset` type requires multiple steps: create dataset → add version → navigate to upload page → upload file. This is cumbersome for the common case of "I have a CSV and want to make it a dataset."
- `internal_table` streamlines this into: name + file upload → dataset created with first version populated.
- Split tables are already supported server-side for UUID-based doc_types. The `isSplitType()` regex needs widening to also recognize name-based doc_types (e.g., `traffic_counts-1`), but the core infrastructure (resolveTable, ensureTable, allocateId) works unchanged.

## How It Differs from `internal_dataset`

| Aspect | `internal_dataset` | `internal_table` |
|--------|-------------------|------------------|
| Creation | Name only → empty dataset | Name + file upload → first version populated |
| First version | Manual: Admin → Add Version → Upload page | Automatic: created during dataset creation |
| `sourceCreate` | None (uses default create button) | Custom component with embedded upload |
| Post-creation pages | table, metadata, upload, validate | table, metadata, upload, validate (same) |
| `doc_type` | UUID (`crypto.randomUUID()`) | Sanitized source name (e.g., `traffic_counts`) |
| Data storage | Split tables (existing) | Split tables (same — automatic via type pattern) |

## Architecture

### Dataset Type Registration

Dataset types are registered in `siteConfig.jsx` (line 61):
```javascript
damaDataTypes: { csv_dataset, gis_dataset, internal_dataset, ...damaDataTypes }
```

Each type exports a config object with page definitions. Types with a `sourceCreate` key get a custom creation component rendered in `CreatePage.jsx` (line 48):
```javascript
const ExternalComp = damaDataTypes[data?.type]?.sourceCreate?.component;
```

When `ExternalComp` exists, `CreatePage` renders it instead of the default "Create" button. The `ExternalComp` receives `{context: DatasetsContext, source: data}` where `data` contains `{name, type}` from the form.

### Upload Flow

The shared upload component (`components/upload.jsx`) handles:
1. Get ETL context ID from `/dama-admin/{pgEnv}/etl/new-context-id`
2. Upload file to `/dama-admin/{pgEnv}/gis-dataset/upload`
3. Poll for `:final` ETL event
4. Fetch layer/sheet metadata from `/dama-admin/{pgEnv}/gis-dataset/{gisUploadId}/layers`
5. User selects sheet and maps columns
6. Publish to `/dama-admin/dms/{app}+{type}/publish`

For internal datasets, the upload type is `{doc_type}-{view_id}`. For `internal_table`, the `doc_type` is derived from the source name (sanitized: lowercased, spaces/hyphens → underscores, non-alphanumeric stripped), producing readable table names like `data_items__traffic_counts_1` instead of `data_items__550e8400_e29b_41d4_a716_446655440000_1`.

### doc_type Generation

`internal_dataset` uses `crypto.randomUUID()` for `doc_type`. `internal_table` derives `doc_type` from the source name:

```javascript
// Sanitize source name → doc_type
function nameToDocType(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')       // spaces/hyphens → underscores
    .replace(/[^a-z0-9_]/g, '');   // strip everything else
}

// Example: "Traffic Counts 2024" → "traffic_counts_2024"
// Data type for view 1: "traffic_counts_2024-1"
// Split table: data_items__traffic_counts_2024_1
```

Name collisions are deferred — for now, duplicate names will cause a collision. This can be addressed later with a suffix (e.g., `traffic_counts_2024_2`).

### Split Type Detection Update (Server)

The current `isSplitType()` regex only matches UUID-based patterns:
```
/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+(-invalid-entry)?$/
```

This won't match name-based types like `traffic_counts-1`. A second regex is needed:

```javascript
const UUID_SPLIT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+(-invalid-entry)?$/;
const NAME_SPLIT = /^[a-z][a-z0-9_]*-\d+(-invalid-entry)?$/;

function isSplitType(type) {
  return typeof type === 'string' && (UUID_SPLIT.test(type) || NAME_SPLIT.test(type));
}
```

**Why `NAME_SPLIT` is safe** — it cannot accidentally match DMS structural types:
- Structural types contain `|` or `+` characters (`myapp+page|cms-section`), excluded by `[a-z0-9_]`
- Simple types like `site` or `pattern` never end with `-\d+`
- `NAME_SPLIT` requires starting with a letter (`[a-z]`), avoiding overlap with UUID patterns (which start with hex digits)

### Version Management

Internal datasets store versions in `source.views[]` array. The admin page (`default/admin.jsx`) has an "Add Version" button that appends to this array via `apiUpdate`. Each view gets a numeric `view_id` used in URLs and as part of the split table type.

### SourcePage Routing

`SourcePage.jsx` hardcodes `sourceType = 'internal_dataset'` when `isDms=true` (line 82). For `internal_table` to use different page configs, the SourcePage needs to look up the type from the source data or the new type needs to share the same page set as `internal_dataset`.

**Design decision**: Since `internal_table` has the same post-creation pages (table, metadata, upload, validate) as `internal_dataset`, two approaches are possible:

1. **Share pages** — `internal_table` reuses the exact same page components from `internal_dataset`. SourcePage continues to hardcode `'internal_dataset'` for `isDms=true`, and `internal_table`'s pages are the same set.
2. **Separate type lookup** — SourcePage reads a `sourceType` or `datasetType` field from the source data to pick the right page config. This allows `internal_table` to define different pages in the future.

**Recommended: Option 1** (share pages). The pages are identical — only the creation flow differs. If `internal_table` needs different pages later, that can be added then. The `sourceCreate` component is the only unique piece.

## Files

### New Files

| File | Purpose |
|------|---------|
| `pages/dataTypes/internal_table/index.js` | Type config — same pages as `internal_dataset`, plus `sourceCreate` |
| `pages/dataTypes/internal_table/pages/sourceCreate.jsx` | Custom create component — name input + upload in one step |

### Modified Files

| File | Change |
|------|--------|
| `siteConfig.jsx` | Import `internal_table`, add to `damaDataTypes` |
| `src/db/table-resolver.js` (dms-server) | Add `NAME_SPLIT` regex to `isSplitType()` |
| `tests/test-table-splitting.js` (dms-server) | Add tests for name-based split type detection |

## Implementation Phases

### Phase 1: Server — Name-Based Split Type Detection — DONE

Update the table resolver to recognize name-based doc_types:

- [x] Update `src/db/table-resolver.js`:
  - Renamed `SPLIT_TYPE_REGEX` → `UUID_SPLIT_REGEX`, added `NAME_SPLIT_REGEX`
  - `isSplitType()` checks both regexes: `UUID_SPLIT_REGEX.test(type) || NAME_SPLIT_REGEX.test(type)`
  - Backward compat alias: `SPLIT_TYPE_REGEX: UUID_SPLIT_REGEX` in exports
- [x] Update `tests/test-table-splitting.js`:
  - 5 positive name-based tests: `traffic_counts-1`, `my_dataset-42`, `a-1`, `test_data-1-invalid-entry`, `dataset2024-100`
  - 2 additional negative tests: `my-app+type`, `my-app+type|source`
  - `testResolveTableNameBased()`: 4 assertions verifying readable table names in legacy/per-app/SQLite/PG
  - `testNameBasedSplitCreate()`: full CRUD integration (create → verify table → query Falcor → delete)
  - `testNameBasedInvalidEntry()`: name-based invalid entry split table
- [x] 71 tests pass (was 52), 0 failures; cleanup-db tests (40) also pass

### Phase 2: Client — Type Registration + Config — DONE

Create the `internal_table` type config and register it:

- [x] Create `pages/dataTypes/internal_table/index.js`:
  - Imports Table, Metadata from gis_dataset; Upload, Validate from internal; SourceCreate local
  - Config has same pages as internal_dataset + `sourceCreate` key
- [x] Create placeholder `pages/dataTypes/internal_table/pages/sourceCreate.jsx` (fleshed out in Phase 3)
- [x] Update `siteConfig.jsx`:
  - Added `import internal_table from "./pages/dataTypes/internal_table"`
  - Added to `damaDataTypes`: `{ csv_dataset, gis_dataset, internal_dataset, internal_table, ...damaDataTypes }`
- [x] Vite build passes — `internal_table` will appear in the type dropdown on Create page

### Phase 3: sourceCreate Component — DONE

Create the custom creation component that combines naming + file upload:

- [x] Create `pages/dataTypes/internal_table/pages/sourceCreate.jsx`:
  - Receives `{context, source}` props from `CreatePage`
  - `source.name` comes from the parent `CreatePage` form
  - **Step 1: Create source** — direct Falcor calls to create source + view as separate data_items rows
  - **Step 2: Upload** — render the shared `Upload.EditComp` with `format.type = '{doc_type}-{view_id}'`
  - **Step 3: Post-upload** — "Go to Dataset" button navigates to `{baseUrl}/internal_source/{id}`
- [x] Implement `nameToDocType(name)` helper:
  - Lowercase, trim, spaces/hyphens → underscores, strip non-alphanumeric/underscore
  - Example: `"Traffic Counts 2024"` → `"traffic_counts_2024"`
- [x] Wire up the creation flow:
  - "Create & Upload" button triggers `handleCreate`:
    1. Create source data_items row via `falcor.call(["dms", "data", "create"], [app, type|source, data])`
    2. Create view data_items row via `falcor.call(["dms", "data", "create"], [app, type|source|view, data])`
    3. Update source with view ref: `{ref, id: viewId}`
    4. Update parent with source ref: `{ref, id: sourceId}`
    5. Invalidate caches, transition to upload stage
  - Uses direct Falcor calls (not `apiUpdate`) because:
    - `apiUpdate` is not passed to `sourceCreate` by `CreatePage`
    - Direct calls give precise control over source ID + view_id retrieval
    - Matches what `updateDMSAttrs` does internally (creates child rows, stores refs)
- [x] Handle the creation-before-upload sequencing:
  - State machine: `idle` → `creating` → `uploading`
  - Source + view created before upload UI appears
  - `localApiUpdate` wrapper handles metadata updates from Upload.EditComp (post-publish column config)
- [x] Vite build passes

### Phase 4: Testing + Polish

- [ ] Manual test: full creation flow (name → upload → column mapping → publish → redirected to source page)
- [ ] Verify table page shows uploaded data
- [ ] Verify subsequent uploads (new versions) work on the same source via the Upload tab
- [ ] Verify validate page works with uploaded data
- [ ] Verify metadata page correctly reflects uploaded columns
- [ ] Verify the dataset appears in the datasets list after creation
- [ ] Verify split table has readable name (e.g., `data_items__traffic_counts_1`)
- [ ] Edge cases: cancel during upload, upload error, empty file

## Key Implementation Details

### sourceCreate Component Flow

```
CreatePage renders:
  1. Type selector → user picks "internal_table"
  2. Name input → user types dataset name (e.g., "Traffic Counts")
  3. ExternalComp replaces the default "Create" button
     └─ sourceCreate.jsx:
        a. Show upload UI (file drop zone)
        b. On file drop/select:
           - Generate doc_type = nameToDocType("Traffic Counts") → "traffic_counts"
           - Create source via apiUpdate with views: [{name: 'version 1'}]
           - Wait for source ID + view_id
           - Start upload flow with format: {app, type: "traffic_counts-{view_id}", config: '{}'}
        c. User maps columns, clicks publish
        d. On publish complete: navigate to internal_source/:id
```

### Split Table Auto-Creation

When the upload publishes data to type `traffic_counts-1`:
1. The controller calls `resolveTable(app, type, dbType, splitMode)`
2. `isSplitType(type)` returns `true` (matches `NAME_SPLIT_REGEX`: starts with letter, ends with `-\d+`)
3. `resolveTable` returns `data_items__traffic_counts_1` (readable!)
4. `ensureTable` auto-creates the table on first write

### Upload.EditComp Props

From `internal/pages/upload.jsx` (the existing pattern):
```javascript
<Upload.EditComp
    onChange={() => {}}
    size={1}
    format={{app: source.app, type: `${source.doc_type}-${view_id}`, config: source.config}}
    view_id={view_id}
    parent={source}
    apiLoad={apiLoad}
    apiUpdate={apiUpdate}
    context={DatasetsContext}
/>
```

The `sourceCreate` component needs to replicate this, but with the freshly-created source data instead of a pre-existing source.

### Getting Source ID + View ID After Creation

After `apiUpdate` creates the source, we need the source's assigned ID and the view_id of the first version. The `apiUpdate` call updates the parent pattern's `sources` array. To get the new source's ID:
- Option A: Re-fetch the sources list and find the new one by `doc_type`
- Option B: Use the Falcor response from `apiUpdate` which includes the updated data

The view_id is assigned by the server when processing the `views` array addition.

## Testing Checklist

### Server (automated)
- [ ] `isSplitType('traffic_counts-1')` returns `true`
- [ ] `isSplitType('my_dataset-42')` returns `true`
- [ ] `isSplitType('a-1')` returns `true` (minimal name)
- [ ] `isSplitType('test_data-1-invalid-entry')` returns `true`
- [ ] Existing UUID patterns still match
- [ ] Structural types still don't match (`site`, `app|pattern`, `app+type`, `test-type`)
- [ ] `resolveTable` produces `data_items__traffic_counts_1` for type `traffic_counts-1`
- [ ] All 52 existing splitting tests pass

### Client (manual)
- [ ] `internal_table` appears in the Create page type dropdown
- [ ] Selecting `internal_table` shows the upload UI (not the default "Create" button)
- [ ] Upload flow works: file → sheet selection → column mapping → publish
- [ ] After publish, user is redirected to the new source page
- [ ] Table page displays the uploaded data
- [ ] Upload tab allows adding more versions
- [ ] Validate tab works with the uploaded data
- [ ] Metadata page reflects the uploaded columns
- [ ] Dataset appears in the datasets list
- [ ] Split table has readable name (e.g., `data_items__traffic_counts_1`)
