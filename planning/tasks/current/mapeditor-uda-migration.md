# MapEditor Pattern: Migrate from DAMA to UDA Routes

## Status: NOT STARTED

## Objective

The MapEditor pattern uses `dama[pgEnv]` Falcor routes for loading sources, views, symbologies, and view data. These routes point at the legacy DAMA server which is being replaced by dms-server's UDA routes. Update all Falcor calls to use the `uda[env]` namespace.

## Problem

With `VITE_DAMA_HOST` now defaulting to `API_HOST` (dms-server), the MapEditor's `dama[pgEnv]` Falcor calls go to dms-server which doesn't have `dama.*` routes — only `uda.*` routes. Sources don't display.

## Scope

22 files across the MapEditor pattern use `dama[pgEnv]` Falcor paths. The calls fall into 4 categories:

### 1. Source/View Listing (6 files)

| Old Path | New Path | Notes |
|----------|----------|-------|
| `dama[pgEnv].sources.length` | `uda[pgEnv].sources.length` | Already exists in UDA |
| `dama[pgEnv].sources.byIndex[{from,to}].attributes[attrs]` | `uda[pgEnv].sources.byIndex[{from,to}][attrs]` | UDA doesn't nest under `.attributes` |
| `dama[pgEnv].sources.byId[id].attributes[attrs]` | `uda[pgEnv].sources.byId[id][attrs]` | Same |
| `dama[pgEnv].sources.byId[id].views.length` | `uda[pgEnv].sources.byId[id].views.length` | Already exists in UDA |
| `dama[pgEnv].sources.byId[id].views.byIndex[{from,to}].attributes[attrs]` | `uda[pgEnv].views.byId[viewId][attrs]` | Views are top-level in UDA, not nested under sources |

**Files:**
- `MapEditor/components/LayerManager/SourceSelector/index.jsx` (lines 33-39, 56-62)
- `MapEditor/components/LayerManager/SourceSelector/SourceList.jsx` (lines 18-32, 41-42, 180-187)
- `SourceLayout.jsx` (lines 127-138)
- `MapEditor/components/LayerEditor/ViewGroupControl/index.jsx` (lines 52-58, 66-68)
- `MapEditor/index.jsx` (lines 565, 573, 577)
- `MapEditor/MapViewer.jsx` (lines 118-120)

### 2. Symbology CRUD (8 files)

Symbologies in the MapEditor are stored as DMS content items (via `dms.data.create/edit/delete`), NOT as `data_manager.symbologies` rows. The `dama[pgEnv].symbologies.*` routes were the old way to list them from the DAMA server. Now they're DMS items loaded via `apiLoad` / `dms.data` routes.

| Old Path | Status |
|----------|--------|
| `dama[pgEnv].symbologies.length` | Replace with DMS-based listing (apiLoad) |
| `dama[pgEnv].symbologies.byIndex[...]` | Replace with DMS-based listing |
| `dama[pgEnv].symbologies.byId[id].attributes[...]` | Replace with `dms.data.byId[id]` |

**Files:**
- `MapEditor/index.jsx` (lines 147-168)
- `MapEditor/MapViewer.jsx` (lines 49-69)
- `MapEditor/components/LayerManager/SymbologySelector/index.jsx` (lines 18-21)
- `MapEditor/components/LayerManager/SymbologySelector/SymbologiesList.jsx`
- `MapEditor/components/LayerManager/SymbologyControl/components/SaveChangesMenu.jsx` (lines 98-143)
- `MapEditor/components/LayerManager/SymbologyControl/components/CreateSymbologyMenu.jsx` (lines 82-87)
- `MapEditor/components/LayerManager/SymbologyControl/components/SymbologyControlMenu.jsx` (lines 51, 82, 109, 138, 192)
- `MapEditor/components/SymbologyViewLayer.jsx`

### 3. View Data Queries (5 files)

| Old Path | New Path |
|----------|----------|
| `dama[pgEnv].viewsbyId[id].options[opts].databyIndex[{from,to}][attrs]` | `uda[pgEnv].viewsById[id].options[opts].dataByIndex[{from,to}][attrs]` |
| `dama[pgEnv].viewsbyId[id].databyId[id]` | `uda[pgEnv].viewsById[id].dataById[id][attrs]` |

**Note:** Case difference — `viewsbyId` → `viewsById`, `databyIndex` → `dataByIndex`, `databyId` → `dataById`

**Files:**
- `MapEditor/stateUtils.jsx` (line 179)
- `MapEditor/components/LayerEditor/FilterEditor/DynamicFilterBuilder.jsx` (lines 67-76)
- `MapEditor/components/LayerEditor/FilterEditor/FilterControls.jsx` (line 400)
- `MapEditor/components/LayerEditor/FilterGroupControl/ColumnSelectControl.jsx` (line 125)
- `MapEditor/components/LayerEditor/PopoverEditor/PopoverControls.jsx` (lines 125, 135)

### 4. Map Bounds / Zoom (2 files)

These use view data to compute geographic bounds for zoom-to-fit.

**Files:**
- `MapEditor/components/MapViewerLegend.jsx` (lines 91-93, 768, 829)
- `MapEditor/components/LayerManager/ZoomToFit/index.jsx` (lines 45-47)

## Attribute Mapping

The DAMA routes nest attributes under `.attributes` — UDA puts them at the same level:

```js
// DAMA: 
falcor.get(["dama", pgEnv, "sources", "byId", id, "attributes", "name"])
// response: json.dama[pgEnv].sources.byId[id].attributes.name

// UDA:
falcor.get(["uda", pgEnv, "sources", "byId", id, "name"])
// response: json.uda[pgEnv].sources.byId[id].name
```

This affects both the request path and the response parsing in every file.

## Implementation Plan

### Phase 1: Source/View paths (low risk, high impact)
Update the 6 source/view listing files. This is the most impactful change — sources will display again. Test by verifying the MapEditor source selector shows sources.

### Phase 2: View data queries (medium risk)
Update the 5 filter/data query files. The `viewsbyId` → `viewsById` case change needs careful find-replace. Test by verifying layer data loads and filters work.

### Phase 3: Symbologies (needs investigation)
The symbology routes may already work through DMS — the MapEditor stores symbologies as DMS content items. If the old `dama[pgEnv].symbologies.*` routes were just reading the same data via DAMA, switching to DMS-based loading may already work. Need to investigate whether the symbology listing in the MapEditor already uses `apiLoad` or if it exclusively uses the DAMA Falcor paths.

### Phase 4: Map bounds
Update the 2 zoom-to-fit files. Low risk — these just read view data for geographic extent.

## Key Files

- `patterns/mapeditor/context.jsx` — provides `falcor`, `falcorCache`, `pgEnv` to all children
- `patterns/mapeditor/attributes.jsx` — `SourceAttributes`, `ViewAttributes`, `DamaSymbologyAttributes`
- `patterns/mapeditor/siteConfig.jsx` — pattern config, passes `pgEnv`

## Testing

- [ ] Source selector shows sources from the configured pgEnv
- [ ] View selector shows views for a selected source
- [ ] Layer data loads (symbology renders on map)
- [ ] Filters work (filter editor, dynamic filter builder)
- [ ] Symbology CRUD (create, save, delete, duplicate)
- [ ] Zoom to fit works
- [ ] Map viewer (read-only) renders symbologies correctly
