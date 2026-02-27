# Fix Dataset Creation → Listing Bug

## Objective

Fix a bug where creating a new internal dataset via the CreatePage doesn't show up in the DatasetsList view.

## Root Cause Analysis

### Bug 1: Uncategorized sources hidden (Primary) — Phase 4

`DatasetsList/index.jsx` `visibleSources` memo filters out sources without categories:

```javascript
if (!cats.length) return false;  // ← hides ALL uncategorized sources
```

When CreatePage creates a new dataset, the source data has no `categories` field. The `visibleSources` filter unconditionally hides it, so it never appears in the list — even after a page reload, even though the UDA query returns it correctly.

### Bug 2: Falcor UDA cache stale after creation — Phase 5

After `CreatePage.handleCreate` creates a source via `apiUpdate`, the Falcor client-side cache for UDA paths (`['uda', env, 'sources', 'length']`, etc.) is not invalidated. `dmsDataEditor` only invalidates DMS paths (`['dms', 'data', 'byId', id]`). When DatasetsList remounts via React Router navigation, `falcor.get` returns the stale cached UDA data.

### Bug 3: `getSitePatterns` type mismatch (Fixed in Phase 1)

Pattern records created via admin have `type = 'undefined|pattern'` or `'siteType|pattern'`, but `getSitePatterns` only matched `type = 'pattern'`. Fixed with LIKE query.

### Bug 4: `dmsSiteFactory` missing siteType (Fixed in Phase 3)

`updateRegisteredFormats` and `updateAttributes` were called without `siteType`, causing `undefined|pattern` types. Fixed by passing `siteType`.

## Complete Data Flow: Create → List

### CreatePage.handleCreate (Client)

```
CreatePage.jsx:71-87
  data = {name: 'User Name'}  (no categories, no type by default)
  newData = cloneDeep(data)
  delete newData.id, newData.views
  newData.doc_type = crypto.randomUUID()

  → apiUpdate({
      data: {...parent, sources: [...existingUdaSources, newData]},
      config: {format}   // format = initializePatternFormat(datasetsFormat, app, patternDocType)
    })
```

- `parent` = pattern object from dmsSiteFactory (fully expanded by processNewData, has `id`)
- `format.app` = site app (e.g., `'avail-sqlite4'`)
- `format.type` = pattern's doc_type UUID (e.g., `'abc-123'`)
- `format.attributes[sources].format` = `'${app}+${docType}|source'` (from updateAttributes)

### dmsDataEditor (Client → Server)

```
api/index.js:205-310
  const { app, type } = config.format   // app = 'avail-sqlite4', type = 'abc-123' (UUID)
  row = {...parent, sources: [...]}
  row.id = parent.id  (EXISTS → goes to UPDATE path)

  1. Extract dms-format attrs from row:
     dmsAttrsConfigs = {sources: {format: 'avail-sqlite4+abc-123|source'}}
     dmsAttrsData = {sources: [...existingSources, newData]}
     delete row.sources

  2. updateDMSAttrs(dmsAttrsData, dmsAttrsConfigs, falcor):
     [app, type] = 'avail-sqlite4+abc-123|source'.split('+')
       → app = 'avail-sqlite4', type = 'abc-123|source'

     For existing sources (have id):
       → falcor.call(["dms", "data", "edit"], [id, d])
       → push {ref: 'avail-sqlite4+abc-123|source', id}

     For new source (no id):
       → falcor.call(["dms", "data", "create"], ['avail-sqlite4', 'abc-123|source', d])
       → Server: INSERT INTO data_items (app, type, data)
                 VALUES ('avail-sqlite4', 'abc-123|source', '{"name":"...","doc_type":"..."}')
       → push {ref: 'avail-sqlite4+abc-123|source', id: newId}

  3. row = {...row, sources: [{ref, id}, ...]}

  4. falcor.call(["dms", "data", "edit"], [parentId, row])
     → Server: UPDATE data_items SET data = json_merge(data, $1) WHERE id = $2
     → Pattern's data.sources = [{ref: '...', id: N}, ...]
```

### Database State After Creation

```
Pattern record:
  id = <pattern_id>
  app = 'avail-sqlite4'
  type = 'pattern'  (or 'site|pattern' for newer patterns)
  data = {doc_type: 'abc-123', name: 'Datasets', pattern_type: 'datasets',
          sources: [{ref: 'avail-sqlite4+abc-123|source', id: <source_id>}]}

Source record:
  id = <source_id>
  app = 'avail-sqlite4'
  type = 'abc-123|source'
  data = {name: 'My Dataset', doc_type: '<new-uuid>'}  ← NO categories field
```

### DatasetsList Listing (Client → Server)

```
DatasetsList/index.jsx:110
  envs = buildEnvsForListing(datasources, format)
  → envs = {'avail-sqlite4+abc-123': {isDms: true, srcAttributes: [...]}}

DatasetsList/index.jsx:116
  getSources({envs, falcor})
  → falcor.get(['uda', 'avail-sqlite4+abc-123', 'sources', 'length'])

  Server: uda.controller.js getSourcesLength('avail-sqlite4+abc-123')
    → getEssentials({env}): app = 'avail-sqlite4', type = 'abc-123'
    → getSitePatterns({db, app: 'avail-sqlite4'})
        SELECT id FROM data_items
        WHERE app = 'avail-sqlite4' AND (type = 'pattern' OR type LIKE '%|pattern')
        → returns [<pattern_id>, ...]  ✓
    → getSiteSources({db, pattern_ids, pattern_doc_types: ['abc-123']})
        SELECT data->'sources' AS sources FROM data_items
        WHERE id = ANY($1) AND data->>'doc_type' = ANY($2)
        → Pattern has doc_type = 'abc-123' → MATCH ✓
        → returns [{ref: '...', id: <source_id>}]
    → return 1  ✓

  → falcor.get(['uda', env, 'sources', 'byIndex', 0, srcAttributes])

  Server: getSourceIdsByIndex → [<source_id>]
         getSourceById → {id, name: 'My Dataset', categories: null, ...}

DatasetsList/index.jsx:133 — visibleSources filter:
  source.categories = null
  Array.isArray(null) → false
  cats = [].map(c => c[0]) → []
  cats.length === 0 → return false  ← BUG: SOURCE HIDDEN!
```

### Why sources appear in CreatePage but not DatasetsList

- CreatePage dropdown shows ALL UDA sources (no category filter)
- DatasetsList `visibleSources` filters out sources without categories
- Same UDA data, different rendering logic

## Implementation

### Phase 1: Fix `getSitePatterns` query (Server) — DONE

**File**: `packages/dms-server/src/routes/uda/utils.js`

Changed to match both `'pattern'` and `'%|pattern'` types.

### Phase 2: Add regression test (Server) — DONE

**File**: `packages/dms-server/tests/test-uda.js`

Added `testDmsModeRealWorldPatternType` test (3 assertions).

### Phase 3: Fix `dmsSiteFactory` type parameter (Client) — DONE

**File**: `packages/dms/src/render/spa/dmsSiteFactory.jsx`

Pass `siteType` to `updateRegisteredFormats`/`updateAttributes`.

### Phase 4: Fix category filter (Client) — DONE

**File**: `packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx`

Changed `visibleSources` filter:
- [x] `if (!cats.length) return false;` → `if (!cats.length) return showUncategorized;` — visibility of uncategorized sources controlled by settings (default: shown)

### Phase 5: Fix UDA Falcor cache staleness — DONE

**File**: `packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx`

- [x] Added `falcor.invalidate(['uda', e, 'sources'])` for each env before `getSources` in `useEffect` — ensures fresh data on every mount (e.g., after creating a source in CreatePage)

### Phase 6: Remove sources from CreatePage type dropdown — DONE

**File**: `packages/dms/src/patterns/datasets/pages/CreatePage.jsx`

- [x] Removed existing UDA sources from `selectOptions` — dropdown now only shows "Create new" and damaDataTypes
- [x] Removed source-cloning logic from `handleSelectChange` — no longer needed

### Phase 7: Add show_uncategorized setting — DONE

**Files**: `DatasetsList/index.jsx`, `SettingsPage.jsx`

- [x] `DatasetsList`: Added `showUncategorized` state (default `true`), loaded from `dama-info` settings, used in `visibleSources` filter
- [x] `SettingsPage`: Added `showUncategorized` toggle button, `saveSettings` now takes an updates object to persist both `filtered_categories` and `show_uncategorized` together
- [x] Renamed settings page heading from "Category Settings" to "Dataset Settings"

## Files Changed

| File | Change |
|---|---|
| `packages/dms-server/src/routes/uda/utils.js` | `getSitePatterns` WHERE clause: match both `'pattern'` and `'%\|pattern'` |
| `packages/dms-server/tests/test-uda.js` | Added `testDmsModeRealWorldPatternType` regression test |
| `packages/dms/src/render/spa/dmsSiteFactory.jsx` | Pass `siteType` to format initialization |
| `packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx` | Show/hide uncategorized via settings, invalidate UDA cache on mount |
| `packages/dms/src/patterns/datasets/pages/CreatePage.jsx` | Remove existing sources from type dropdown |
| `packages/dms/src/patterns/datasets/pages/SettingsPage.jsx` | Add show_uncategorized toggle, refactor saveSettings to object API |

## Testing Checklist

- [x] `npm run test:uda` — all 24 tests pass
- [x] Regression test: pattern with `type = 'undefined|pattern'` found by `getSitePatterns`
- [x] `npm run build` — no compile errors
- [ ] Manual: Create an internal dataset via CreatePage → shows up in DatasetsList
- [ ] Manual: Create a second internal dataset → first one is still listed
- [ ] Manual: Navigate to a listed dataset → SourcePage loads correctly
- [ ] Manual: Sources with categories still filter correctly in sidebar
- [ ] Manual: CreatePage type dropdown only shows "Create new" and external data types (no existing sources)
- [ ] Manual: Settings page toggle hides/shows uncategorized sources on the list page
