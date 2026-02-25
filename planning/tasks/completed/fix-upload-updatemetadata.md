# Fix `updateMetaData` in Upload Component

## Objective

Fix the `updateMetaData` function in the datasets upload component so that source metadata (config/attributes) is correctly persisted to the database when publishing an internal dataset.

## Current State — How It Breaks

### The call chain

1. **SourcePage** (`pages/SourcePage.jsx:64`) derives `sourceFormat` with type `doc_type|source` and passes it to the Upload page along with `apiUpdate` from the wrapper.

2. **Upload page** (`dataTypes/internal/pages/upload.jsx:29`) overrides the format before passing to `Upload.EditComp`:
   ```jsx
   format={{app: source.app, type: `${source.doc_type}-${view_id}`, config: source.config}}
   ```
   This is the **dataset row type** (e.g., `traffic_counts-1`), needed for the publish POST request. It also passes `parent={source}` (the UDA source object).

3. **Upload.EditComp** (`components/upload.jsx:166-171`) defines `updateMetaData`:
   ```javascript
   const updateMetaData = (data, attrKey) => {
       if (!updateMeta) return;
       apiUpdate({
           data: {...parent, ...{[attrKey]: data}},
           config: {format, type: format?.type?.replace(`-${view_id}`, '')}
       })
   }
   ```

4. **`publish()`** calls `updateMetaData` (line 109) to save new column definitions:
   ```javascript
   updateMetaData(JSON.stringify({
       attributes: [...existingAttributes, ...newColumns]
   }), 'config');
   ```

### The bugs

**Bug 1: Wrong update path.** `updateMetaData` calls `apiUpdate` → `dmsDataEditor`, which edits `data_items` rows via `falcor.call(["dms", "data", "edit"], ...)`. But `parent` is a UDA source object (from `getSourceData`) — it has `source_id`, not `id`. If `id` is undefined, `dmsDataEditor` falls through to the **create** path and creates a garbage new row instead of updating the source.

**Bug 2: Wrong format type.** `config.format.type` is `"doc_type-view_id"` (the dataset row type). But the item being updated is a **source** (type `doc_type|source`). Even if the edit-by-id path fires, this is conceptually wrong. The `config.type` override (`format.type.replace(...)`) evaluates to `doc_type` — also wrong — and is ignored anyway since `dmsDataEditor` only reads `config.format`.

**Bug 3: `parent` contains UDA-shaped data.** The `source` object from `getSourceData()` has UDA fields (`source_id`, `name`, `categories`, `views`, `statistics`, etc.). Spreading this into `data` for `dmsDataEditor` sends UDA abstractions into the raw `data_items` edit path, which would corrupt or clutter the `data` column.

## Fix — DONE (apiUpdate with correct format + source_id)

Fixed the `apiUpdate` call to use the correct format and data. All DMS content lives in `data_items` and is edited through `apiUpdate` → `dmsDataEditor` → `falcor.call(["dms", "data", "edit"])`. The original code had the wrong format (dataset row type instead of source type), wrong id field, and sent the full parent spread instead of targeted fields.

### Changes Made

1. **`src/patterns/datasets/components/upload.jsx`** (write path fix)
   - [x] Added `parentFormat` prop — the format for the parent record (source format with type `doc_type|source`)
   - [x] Fixed `updateMetaData`: uses `parentFormat` when available (falls back to `format` for non-DMS contexts), sends only `{id: parent.source_id, [attrKey]: data}` instead of spreading the entire parent object
   - [x] Uses `parent.source_id` (not `parent.id`) — the `parent` is a UDA source object where `source_id` is the canonical DMS row id

2. **`src/patterns/datasets/pages/dataTypes/internal/pages/upload.jsx`** (props fix)
   - [x] Passes `parentFormat={format}` to Upload.EditComp — `format` here IS the sourceFormat from SourcePage (type `doc_type|source`)
   - [x] Uses `source` for all data (app, doc_type, config) — `source` is loaded via `getSourceData` in SourcePage and shaped to match the DAMA source interface

### Why this works

The source record lives at `data_items` with `type: 'doc_type|source'`. The `apiUpdate` call needs:
- `data.id` — the source's DMS row id (`source_id` on the UDA source object) so `dmsDataEditor` takes the update path, not create
- `data.config` — the field to update (merged into the `data` JSON column via `json_merge`)
- `config.format.app` and `config.format.type` — identifies the item type for `dmsDataEditor`

The `parentFormat` (sourceFormat from SourcePage) has `type: 'doc_type|source'` and `app` — exactly matching the source row. Since `config` is not a `dms-format` attribute, `dmsDataEditor` skips the `updateDMSAttrs` step and goes straight to `falcor.call(["dms", "data", "edit"], [id, {config: "..."}])`.

### Key insight: source vs item

The `source` object (from `getSourceData` via UDA) is the correct data source for all source-related fields. It uses `source_id` as the id field (matching DAMA interface). The `item`/`dmsItem` (from `loadDmsItem`) was added for views/versions, not as a source replacement.

## Testing Checklist

- [ ] Upload a CSV to an internal dataset — verify new columns appear in source config
- [ ] Upload to a source that already has columns — verify existing + new columns are merged
- [ ] Verify no garbage rows are created in data_items during publish
- [ ] Verify source config is readable after update (not double-stringified or corrupted)
- [ ] Verify the publish POST request still works correctly (row data upload is separate from metadata update)
- [ ] Check that non-DMS upload path still works if `updateMeta=false` (CMS usage)
- [ ] **Refresh test:** after uploading, refresh the page — verify existing columns are still shown (not reset)
