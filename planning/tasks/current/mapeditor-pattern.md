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

6. **Do NOT copy the `components/dms/` subfolder** — that is the old bridge approach. The new pattern replaces it entirely.

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

### Phase 7: DMS Page Section Integration

17. **Create a new DMS section type** for embedding maps in pages:
    - Register a section format type (e.g., `cms-section-map`) that stores:
      ```json
      {
        "symbology_ids": [123, 456],
        "tabs": [...],
        "initialBounds": { "center": [...], "zoom": 10 },
        "height": "full",
        "hideControls": false
      }
      ```
    - The section's Edit/View components render the map using symbology data fetched from DMS (not DAMA)
    - This replaces `MapEditor/components/dms/MapComponent.jsx`

### Phase 8: Pattern Registration and Routing

18. **Register in `patterns/index.js`**:
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

19. **Add to App.jsx site configuration** as a pattern type available in the admin panel

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

### What gets removed
- The `components/dms/` bridge subfolder (replaced by the pattern itself)
- Direct DAMA symbology table dependency
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
- [ ] Map section embedding in DMS pages works
- [ ] localStorage draft caching works (or DMS draft system)
- [ ] Build passes with no errors
