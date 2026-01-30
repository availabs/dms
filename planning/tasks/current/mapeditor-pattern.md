# Task: Convert MapEditor into a DMS Pattern

## Objective

Port the MapEditor from `availabs/datamanagerclient` into a standalone DMS pattern (`patterns/mapeditor`). The editor's functionality stays the same, but all persistence moves from the DAMA symbology API to DMS `data_items` storage.

## Background

The MapEditor currently lives in `datamanagerclient/MapEditor/` and stores symbology data in the DAMA PostgreSQL database via Falcor paths like `["dama", pgEnv, "symbologies", ...]`. Each symbology is a row with a `symbology` JSON column containing the full layer/style/filter configuration.

A secondary DMS-embedded version exists at `MapEditor/components/dms/MapComponent.jsx` that bridges both systems — it stores tab/row/visibility config as a DMS page section value, but still fetches symbology content from DAMA.

The goal is to make a self-contained DMS pattern where symbology records are `dms.data_items` rows, eliminating the DAMA dependency for symbology CRUD.

## Current Architecture

### Data Flow (DAMA)

```
MapEditor → Falcor → DAMA API → dama.symbologies table
                                  ├── symbology_id (PK)
                                  ├── name (text)
                                  ├── description (text)
                                  ├── collection_id (int)
                                  ├── symbology (jsonb)  ← full layer config
                                  └── categories (text)
```

### Key DAMA Falcor Paths Used

| Operation | Falcor Path |
|-----------|-------------|
| List | `["dama", pgEnv, "symbologies", "byIndex", ...]` |
| Get by ID | `["dama", pgEnv, "symbologies", "byId", id, "attributes", ...]` |
| Create | `falcor.call(["dama", "symbology", "symbology", "create"], [pgEnv, data])` |
| Update | `falcor.set(["dama", pgEnv, "symbologies", "byId", id, "attributes", key], value)` |
| Delete | `falcor.call(["dama", "symbology", "symbology", "delete"], [pgEnv, id])` |
| Color domain | `["dama", pgEnv, "symbologies", "byId", id, "colorDomain", "options", ...]` |

### Files That Touch DAMA Persistence

- `MapEditor/index.jsx` — Main component, loads symbology list and individual symbologies
- `MapEditor/stateUtils.jsx` — Falcor filter builders
- `MapEditor/components/LayerManager/SymbologyControl/components/CreateSymbologyMenu.jsx` — Create
- `MapEditor/components/LayerManager/SymbologyControl/components/SaveChangesMenu.jsx` — Save/update
- `MapEditor/components/LayerManager/SymbologyControl/components/SymbologyControlMenu.jsx` — Delete
- `MapEditor/components/LayerManager/SymbologySelector/SymbologiesList.jsx` — List all
- `MapEditor/components/LayerEditor/datamaps/` — Color domain requests

### Files That Do NOT Touch Persistence (pure UI/logic)

These can be ported with minimal changes:

- `MapEditor/components/SymbologyViewLayer.jsx` — Map rendering layer
- `MapEditor/components/LayerManager/LayerPanel.jsx` — Layer ordering UI
- `MapEditor/components/LayerManager/LegendPanel.jsx` — Legend rendering
- `MapEditor/components/LayerManager/SourceSelector/` — Source/view picker (still reads from DAMA for source metadata)
- `MapEditor/components/LayerEditor/` — All style editing controls
- `MapEditor/components/LayerManager/colors.js` — Color palettes
- `MapEditor/components/LayerManager/utils.jsx` — Utility functions
- `MapEditor/components/icons.jsx` — Icons

## Target Architecture

### DMS Data Model

```
patterns/mapeditor → DMS API → dms.data_items table
                                 ├── id (PK)
                                 ├── app = "{app}"
                                 ├── type = "{type}+map-symbology"
                                 ├── data (jsonb)
                                 │     ├── name (text)
                                 │     ├── description (text)
                                 │     └── symbology (json) ← full layer config
                                 └── created_at, updated_at
```

### DMS Falcor Paths (replacements)

| Operation | DMS Falcor Path |
|-----------|----------------|
| List | `["dms", "data", "{app}+map-symbology", "byIndex", ...]` |
| Get by ID | `["dms", "data", "byId", id, ...]` |
| Create | `falcor.call(["dms", "data", "create"], [app, type, {name, symbology}])` |
| Update | `falcor.call(["dms", "data", "edit"], [id, {name, symbology}])` |
| Delete | `falcor.call(["dms", "data", "delete"], [app, type, id])` |

## Implementation Steps

### Phase 1: Pattern Scaffold

1. **Create `patterns/mapeditor/` directory** with:
   ```
   patterns/mapeditor/
   ├── siteConfig.jsx        # Pattern config factory
   ├── mapeditor.format.js   # Format definition
   ├── context.jsx           # MapEditorContext (replaces DamaContext usage)
   └── index.js              # Export config array
   ```

2. **Define the format** (`mapeditor.format.js`):
   ```js
   const mapSymbologyFormat = {
     app: "dms-site",
     type: "map-symbology",
     attributes: [
       { key: "name", type: "text", required: true, default: "New Map" },
       { key: "description", type: "text" },
       { key: "symbology", type: "json", default: "{}" },
       { key: "categories", type: "text" },
     ]
   }
   ```

3. **Create `siteConfig.jsx`** following the page pattern structure:
   - Accept `{ app, type, baseUrl, themes, pattern, ... }`
   - Set up `MapEditorContext.Provider` with `{ app, type, baseUrl, falcor, user }`
   - Define routes:
     - `/*` — List view (symbology browser/manager)
     - `edit/:id` — Edit a symbology
     - `:id` — View/render a symbology (read-only map view)

4. **Register the pattern** in `patterns/index.js`

### Phase 2: Copy and Adapt MapEditor Components

5. **Copy the MapEditor component tree** into `patterns/mapeditor/components/`:
   ```
   patterns/mapeditor/components/
   ├── MapEditor.jsx                    # Main editor (from index.jsx)
   ├── SymbologyViewLayer.jsx
   ├── icons.jsx
   ├── LayerManager/
   │   ├── index.jsx
   │   ├── LayerPanel.jsx
   │   ├── LegendPanel.jsx
   │   ├── colors.js
   │   ├── utils.jsx
   │   ├── SourceSelector/
   │   ├── SymbologySelector/
   │   ├── SymbologyControl/
   │   ├── DuplicateLayerItem/
   │   └── ZoomToFit/
   └── LayerEditor/
       ├── (all sub-folders)
       └── datamaps/
   ```

6. **Port the `components/dms/` subfolder** into the pattern as page-embeddable section components (see Phase 7).

### Phase 3: Replace DAMA Persistence with DMS

This is the core migration. Each file that calls DAMA Falcor paths needs to be rewritten.

7. **Create a data hook** (`patterns/mapeditor/useMapEditorData.js`):
   ```js
   // Encapsulates all DMS CRUD for symbologies
   // Replaces scattered DAMA Falcor calls throughout the codebase
   export function useSymbologyList(falcor, app, type) { ... }
   export function useSymbology(falcor, id) { ... }
   export function createSymbology(falcor, app, type, data) { ... }
   export function saveSymbology(falcor, id, data) { ... }
   export function deleteSymbology(falcor, app, type, id) { ... }
   ```

8. **Update `MapEditor.jsx`** (main component):
   - Replace `DamaContext` reads with `MapEditorContext`
   - Replace `["dama", pgEnv, "symbologies", ...]` data loading with DMS equivalents
   - Symbology list: `["dms", "data", "{app}+map-symbology", "byIndex", ...]`
   - Individual symbology: `["dms", "data", "byId", id, "name", "symbology"]`
   - The `symbology_id` field becomes the DMS `id`

9. **Update `CreateSymbologyMenu.jsx`**:
   - `falcor.call(["dama", "symbology", "symbology", "create"], ...)` →
   - `falcor.call(["dms", "data", "create"], [app, "map-symbology", { name, symbology: { layers: {} } }])`

10. **Update `SaveChangesMenu.jsx`**:
    - `falcor.set(["dama", pgEnv, "symbologies", "byId", id, "attributes", "symbology"], ...)` →
    - `falcor.call(["dms", "data", "edit"], [id, { symbology: JSON.stringify(state.symbology) }])`
    - Same for `name` updates

11. **Update `SymbologyControlMenu.jsx`** (delete):
    - `falcor.call(["dama", "symbology", "symbology", "delete"], ...)` →
    - `falcor.call(["dms", "data", "delete"], [app, "map-symbology", id])`

12. **Update `SymbologiesList.jsx`** (list):
    - Replace DAMA list fetching with DMS `byIndex` pattern

13. **Update `stateUtils.jsx`**:
    - Remove DAMA-specific filter builders
    - Adapt for DMS data shape (data is in `data ->> 'key'` format)

### Phase 4: Handle the Color Domain Problem

14. **Color domain calculation** — This is the hardest part. Currently the DAMA server computes statistical breaks via:
    ```
    ["dama", pgEnv, "symbologies", "byId", id, "colorDomain", "options", jsonOptions]
    ```
    This queries the actual data source tables to compute ckmeans/quantile breaks.

    Options for migration:
    - **Option A (recommended initially)**: Keep calling the DAMA API for color domain calculations only. The MapEditor pattern uses DMS for symbology CRUD but still calls DAMA for break computation. This is acceptable because the data sources themselves (vector tiles, tabular data) remain in DAMA regardless.
    - **Option B (future)**: Add a DMS server route that proxies the color domain request to the DAMA database, or implement break calculation client-side using the data already fetched for category/filter rendering.

### Phase 5: Source/View Metadata

15. **Source and view metadata** — The SourceSelector and layer configuration read source metadata (column names, view tile URLs, etc.) from DAMA:
    ```
    ["dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata"]
    ["dama", pgEnv, "sources", "byId", sourceId, "views", ...]
    ```
    These calls should remain as-is. The map data sources live in DAMA — only the symbology configuration moves to DMS. The pattern's context needs to provide `pgEnv` and a DAMA-connected Falcor instance for these reads.

### Phase 6: Local Storage Draft System

16. **Adapt localStorage drafts**:
    - Key format changes from `mapeditor_symbology_${symbology_id}` to `mapeditor_symbology_${dms_id}`
    - Alternatively, leverage DMS's built-in `draft_sections` / `has_changes` / `published` fields for draft management, removing the need for localStorage entirely

### Phase 7: Page Section Components (components/dms/)

The existing `MapEditor/components/dms/` subfolder contains Edit/View components that let maps be embedded as sections inside DMS pages. These should be adapted and brought forward into the pattern, not discarded.

#### How Section Registration Works in DMS

The page pattern has a global mutable component registry:

```js
// patterns/page/components/sections/section.jsx
export let RegisteredComponents = ComponentRegistry;
export const registerComponents = (comps = {}) => {
    RegisteredComponents = {...RegisteredComponents, ...comps}
}
```

Section components are resolved by `element-type` string key. The registry is populated at module load time. Any code that imports and calls `registerComponents()` before `DmsSite` renders will contribute components to the page section type selector.

Each registered component must export:
```js
{
    name: 'Map',
    type: 'map',
    useDataSource: false,
    controls: { more: [...] },     // Settings controls for the section toolbar
    EditComp: MapEditComponent,    // Rendered in page edit mode
    ViewComp: MapViewComponent,    // Rendered in page view mode
}
```

#### Implementation

17. **Adapt `components/dms/MapComponent.jsx`** into `patterns/mapeditor/components/section/`:
    ```
    patterns/mapeditor/components/section/
    ├── index.jsx              # Component registry entry ({ name, EditComp, ViewComp, controls })
    ├── MapSectionEdit.jsx     # Edit component (symbology selector, tab/row manager, bounds config)
    ├── MapSectionView.jsx     # View component (read-only map render)
    └── MapManager/            # Adapted from dms/MapManager/ (tab/row/symbology selection UI)
    ```

18. **Update data flow** — the old `dms/MapComponent.jsx` stored symbology ID references in the section value and fetched symbology content from DAMA at render time. The adapted version should:
    - Store symbology IDs (DMS `data_items` IDs) in the section's `element-data`
    - Fetch symbology content from DMS via `["dms", "data", "byId", id, ...]` instead of DAMA
    - Keep the tab/row/visibility state structure in `element-data`:
      ```json
      {
        "tabs": [{ "name": "Layers", "rows": [{ "type": "symbology", "symbologyId": 123, "name": "..." }] }],
        "symbologies": { "123": { "isVisible": true } },
        "initialBounds": { "center": [...], "zoom": 10 },
        "height": "full",
        "hideControls": false,
        "blankBaseMap": false,
        "zoomPan": true
      }
      ```

19. **Register the section component from the pattern's entry point**:
    ```js
    // patterns/mapeditor/index.js
    import siteConfig from './siteConfig'
    import MapSectionComponent from './components/section'
    import { registerComponents } from '../page/components/sections/section'

    // When the mapeditor pattern is included in a project,
    // its map section type becomes available in the page editor
    registerComponents({ 'Map': MapSectionComponent })

    export default siteConfig
    ```

    This means: if a project includes the mapeditor pattern, pages automatically gain the ability to embed map sections. If the pattern isn't included, there's no dead code — the `Map` section type simply doesn't appear in the selector.

20. **Optionally extend section attributes** — if the map section needs custom fields on the `cms-section` format, the pattern can declare `additionalSectionAttributes` on its pattern config. The page pattern's siteConfig already supports this:
    ```js
    // patterns/page/siteConfig.jsx (existing code)
    if (pattern?.additionalSectionAttributes?.length) {
      (format.registerFormats || [])
        .find(f => f.type.includes('cms-section'))
        .attributes.push(...pattern.additionalSectionAttributes)
    }
    ```

### Phase 8: Pattern Registration and Routing

21. **Register in `patterns/index.js`**:
    ```js
    import mapeditorConfig from './mapeditor'
    const patterns = {
      page: pageConfig,
      forms: formsConfig,
      admin: adminConfig,
      auth: authConfig,
      datasets: datasetsConfig,
      mapeditor: mapeditorConfig,
    }
    ```

22. **Add to App.jsx site configuration** as a pattern type available in the admin panel

## Migration Boundaries

### What moves to DMS
- Symbology records (name, description, symbology JSON, categories)
- Symbology CRUD operations
- Symbology listing/selection
- Draft/publish state (optionally via DMS built-in fields)

### What stays in DAMA
- Data sources and views (tile URLs, metadata, column schemas)
- Color domain / statistical break computation
- Actual geospatial data serving (vector tiles, tabular queries)
- Source/view browsing in SourceSelector

### What gets adapted (not removed)
- `components/dms/MapComponent.jsx` and `components/dms/MapManager/` — ported into `patterns/mapeditor/components/section/` as page-embeddable section components, with DAMA symbology reads replaced by DMS reads
- The section components auto-register via `registerComponents()` when the mapeditor pattern is included

### What gets removed
- Direct DAMA symbology table dependency for CRUD
- The `pgEnv`-scoped symbology namespace (DMS uses `app+type` namespace instead)

## Files to Create

| File | Purpose |
|------|---------|
| `patterns/mapeditor/index.js` | Pattern export |
| `patterns/mapeditor/siteConfig.jsx` | Route config factory |
| `patterns/mapeditor/mapeditor.format.js` | DMS format definition |
| `patterns/mapeditor/context.jsx` | MapEditorContext provider |
| `patterns/mapeditor/useMapEditorData.js` | DMS CRUD hooks for symbologies |
| `patterns/mapeditor/components/` | Ported MapEditor component tree |
| `patterns/mapeditor/components/section/` | Page-embeddable section components (Edit/View) |
| `patterns/mapeditor/components/section/MapManager/` | Tab/row/symbology selection UI for page sections |

## Files to Modify

| File | Change |
|------|--------|
| `patterns/index.js` | Add mapeditor pattern |

## Testing Checklist

- [ ] Can create a new symbology from the map editor
- [ ] Symbology saves to DMS (verify in `dms.data_items` table)
- [ ] Can load and edit an existing symbology
- [ ] Can delete a symbology
- [ ] Symbology list shows all saved maps
- [ ] Layer styling (choropleth, categories, simple) works correctly
- [ ] Source/view selector loads sources from DAMA
- [ ] Color domain breaks compute correctly (DAMA pass-through)
- [ ] Legend rendering works
- [ ] Filters (data filters, interactive filters) work
- [ ] Hover/popover config works
- [ ] Map section type appears in page editor section selector when mapeditor pattern is included
- [ ] Map section type does NOT appear when mapeditor pattern is not included
- [ ] Map section edit mode: can select/configure symbologies, set bounds, toggle controls
- [ ] Map section view mode: renders map with selected symbologies correctly
- [ ] localStorage draft caching works (or DMS draft system)
- [ ] Build passes with no errors
