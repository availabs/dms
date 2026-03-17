# Map Component Refactor — avl-map-2 → ui/components/map

## Objective

Create a clean, refactored map component in `ui/components/map/` based on the existing `avl-map-2` code. Remove dead UI code, eliminate the custom theme system (use Tailwind directly), eliminate unnecessary npm dependencies, and dynamically import maplibre-gl for code splitting — while preserving the external API surface for all consumers.

## Scope

**In scope:**
- New `ui/components/map/` folder with refactored code
- Dynamic import of maplibre-gl
- Remove all UI except hover component (+ nav controls, style picker)
- Remove the entire avl-map-2 theme system — replace with Tailwind classes
- Remove dead state management (modals)
- Migrate consumers to new import path
- Keep avl-map-2 in place (no modifications)

**Out of scope:**
- Removing avl-map-2 code
- Migrating non-map UI widgets (MultiLevelSelect, Input, Button, Legend) — those stay in avl-map-2
- Removing react-color from package.json (used by mapeditor ControlWrappers, not avl-map-2)

## Current State

The map component lives at:
```
src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/Map/avl-map-2/src/
```

25+ files including dead sidebars, modals, color pickers, panels. Dependencies include react-color, fuse.js, colorbrewer (all unused by core map). maplibre-gl is imported at module top-level, blocking first render. Custom theme system (ThemeContext, ThemeProvider, composeTheme, makeProxy, $compositions) used for only 4 Tailwind class strings.

## Active Consumer Files

All paths relative to `src/dms/packages/dms/src/patterns/`.

### gis_dataset Map

| File | avl-map-2 imports | Migration |
|------|------------------|-----------|
| `datasets/.../Map/Map.jsx` (L6-7) | `AvlMap`, `ThemeProvider` from `./avl-map-2/src`; `mapTheme` from `./map-theme` | Switch `AvlMap` → new; remove `ThemeProvider` wrapper + `mapTheme` import |
| `datasets/.../Map/map-theme/index.js` (L2-6) | `composeTheme`, `makeProxy`, `$compositions` from `../avl-map-2/src` | **DELETE file** |
| `datasets/.../Map/Layer2.jsx` (L6-17) | `Legend, AvlLayer, MultiLevelSelect, ColorRanges, ColorBar, Input, Button, useTheme, getScale, useClickOutside` from `./avl-map-2/src` | Split: `AvlLayer` → new; rest stays avl-map-2 |

### mapeditor

| File | avl-map-2 imports | Migration |
|------|------------------|-----------|
| `mapeditor/MapEditor/index.jsx` (L7) | `AvlMap as AvlMap2` from `../../datasets/.../avl-map-2/src` | Switch → new path. Note: L3 has `import mapboxgl from "maplibre-gl"` for `LngLatBounds` — keep as-is |
| `mapeditor/MapEditor/MapViewer.jsx` (L3) | `AvlMap as AvlMap2` from `../../datasets/.../avl-map-2/src` | Switch → new path |
| `mapeditor/MapEditor/components/PluginLayer.jsx` (L2) | `AvlLayer` from `../../../datasets/.../avl-map-2/src` | Switch → new path |
| `mapeditor/MapEditor/components/SymbologyViewLayer.jsx` (L3) | `AvlLayer` from `../../../datasets/.../avl-map-2/src` | Switch → new path |

### ComponentRegistry

| File | avl-map-2 imports | Migration |
|------|------------------|-----------|
| `page/.../ComponentRegistry/map/index.jsx` (L6) | `AvlMap` from `~/modules/avl-map-2/src` | Switch → new path. Note: L4 has `import mapboxgl from "maplibre-gl"` for `LngLatBounds` — keep as-is |
| `page/.../ComponentRegistry/map/SymbologyViewLayer.jsx` (L5) | `AvlLayer` from `~/modules/avl-map-2/src` | Switch → new path |

### Not migrated (stays on avl-map-2)

| File | Reason |
|------|--------|
| `mapeditor/MapEditor/components/PluginControls/PluginControls.jsx` | Imports `MultiLevelSelect` — UI widget, not map component |
| `datasets/.../Map/Layer2.jsx` (partial) | `Legend, MultiLevelSelect, ColorRanges, ColorBar, Input, Button, useTheme, getScale, useClickOutside` — UI widgets stay in avl-map-2 |

## Proposed Changes

### Phase 1: Create core map files — DONE

Created `src/dms/packages/dms/src/ui/components/map/` with 5 files (down from 25+):

```
map/
  index.js                    # Barrel export (no theme exports)
  avl-map.jsx                 # AvlMap with dynamic maplibre import, Tailwind styling
  avl-layer.jsx               # AvlLayer class + LayerRenderComponent
  components/
    HoverComponent.jsx        # HoverComponent + PinnedHoverComponent (Tailwind)
  utils.js                    # hasValue, useSetSize (internal only)
```

Key refactors completed:
- [x] `avl-map.jsx`: Dynamic `import("maplibre-gl")` wrapper (`AvlMap` → `AvlMapInner`), removed modals/sidebars/ComponentLibrary/useTheme, Tailwind classes, cleaned reducer (no modal actions), inlined LoadingIndicator, maplibre module stored in ref for `pinHoverComp` Marker creation
- [x] `avl-layer.jsx`: Removed `import mapboxgl from "maplibre-gl"` — replaced `new mapboxgl.Point()` with plain `{x, y}` object (MapLibre accepts PointLike). Removed `useTheme()` from DefaultHoverComp. Removed `modals` from DefaultOptions.
- [x] `components/HoverComponent.jsx`: Removed `useTheme()`/`useComponentLibrary()`, replaced with Tailwind (`bg-white`, `hover:text-blue-500`), inlined HoverComponentContainer as `<div className="grid grid-cols-1 gap-1">`
- [x] `utils.js`: Copied hasValue + useSetSize from avl-map-2, excluded colors.jsx and unused exports (capitalize, useSetRefs, strictNaN)
- [x] `index.js`: Clean barrel — AvlMap, DefaultStyles, AvlLayer, LayerRenderComponent, HoverComponent, PinnedHoverComponent

**Design notes:**
- `defaultMapIcon` (referenced in Navigationcontrols style picker) was undefined in original — replaced broken `<img>` with `<span className="fa fa-map">` icon
- `mapboxgl.Point` usage eliminated entirely — plain `{x, y}` objects work with MapLibre's `queryRenderedFeatures`
- `accessToken` prop removed from AvlMapInner (MapTiler uses key in URL, not token)
- `containerId.current` → `containerId` fix (it was already a string, not a ref)

### Phase 2: Migrate consumers — DONE

**gis_dataset Map (DONE):**
- [x] `Map/Map.jsx` — switched `AvlMap` import to `ui/components/map`; removed `ThemeProvider` wrapper + `mapTheme` import
- [x] `Map/map-theme/index.js` — **deleted file** (theme system removed)
- [x] `Map/Layer2.jsx` — split import: `AvlLayer` from `ui/components/map`; UI widgets (`Legend, MultiLevelSelect, ColorRanges, ColorBar, Input, Button, useTheme, getScale, useClickOutside`) stay avl-map-2

**mapeditor (DONE):**
- [x] `mapeditor/MapEditor/index.jsx` — switched `AvlMap as AvlMap2` to `../../../ui/components/map`
- [x] `mapeditor/MapEditor/MapViewer.jsx` — switched `AvlMap as AvlMap2` to `../../../ui/components/map`
- [x] `mapeditor/MapEditor/components/SymbologyViewLayer.jsx` — switched `AvlLayer` to `../../../../ui/components/map`
- [x] `mapeditor/MapEditor/components/PluginLayer.jsx` — switched `AvlLayer` to `../../../../ui/components/map`

**ComponentRegistry (DONE):**
- [x] `ComponentRegistry/map/index.jsx` — switched `AvlMap` from `~/modules/avl-map-2/src` to `../../../../../../../ui/components/map`
- [x] `ComponentRegistry/map/SymbologyViewLayer.jsx` — switched `AvlLayer` from `~/modules/avl-map-2/src` to `../../../../../../../ui/components/map`

### Phase 2b: Remove `~/modules/avl-components/src` from mapeditor — DONE

The mapeditor pattern had 12 files importing `Button`, `DndList`, `Dropdown`, and `useClickOutside` from `~/modules/avl-components/src` (a dead submodule not pulled into this project).

**DMS UI library additions:**
- [x] Added `DndList` to `ui/components/DndList.jsx` — children-wrapping drag-and-drop list (exported on `UI` object)
- [x] Added `themeOptions` support to `ui/components/Button.jsx` — `themeOptions={{ size, color }}` for colored action buttons
- [x] Updated `ui/index.js` to export `DndList`

**mapeditor context setup:**
- [x] Updated `mapeditor/siteConfig.jsx` — imports `UI` from `../../ui` and `ThemeContext` from `../../ui/themeContext`; wraps children with `ThemeContext.Provider value={{ UI }}`

**Consumer files migrated to ThemeContext (all get UI from `const { UI } = useContext(ThemeContext) || {}`):**
- [x] `SourceCategories.jsx` — `Button` from UI context; `useClickOutside` inlined locally (single consumer, simple hook)
- [x] `SourceLayout.jsx` — `Dropdown` from UI context in `Header` and `DataManagerHeader`
- [x] `LayerPanel.jsx` — `DndList` from UI context
- [x] `PopoverControls.jsx` — `DndList, Button` from UI context
- [x] `CategoryControl/index.jsx` — `DndList` from UI context
- [x] `FilterEditor/index.jsx` — `Button` from UI context
- [x] `DynamicFilterBuilder.jsx` — `DndList` from UI context
- [x] `InteractiveFilterControl/index.jsx` — `Button` from UI context
- [x] `FilterGroupControl/ColumnSelectControl.jsx` — `DndList, Button` from UI context
- [x] `ViewGroupControl/index.jsx` — `DndList` from UI context
- [x] `SymbologyControlMenu.jsx` — `Button` from UI context
- [x] `SymbologySelector/index.jsx` — `Button` from UI context

**Deleted:**
- [x] `mapeditor/ui.jsx` — replaced by DMS UI library components accessed through ThemeContext

**Skipped (commented-out/deprecated):**
- `SourceSelector/index.jsx` — commented-out import
- `SaveChangesMenu.jsx` — commented-out import
- `dms_OLD/*` — deprecated files

### Phase 3: Verify — NOT STARTED

- [ ] Dev server runs without errors
- [ ] gis_dataset map page loads correctly
- [ ] Hover component works (mouse over features)
- [ ] Pinned hover works (click to pin)
- [ ] Layer loading indicator shows
- [ ] mapeditor loads and functions
- [ ] ComponentRegistry map component works
- [ ] maplibre-gl loads dynamically (check network tab — separate chunk)
- [ ] No console errors or warnings

## Files Requiring Changes

**New files** (Phase 1):
- `src/dms/packages/dms/src/ui/components/map/index.js`
- `src/dms/packages/dms/src/ui/components/map/avl-map.jsx`
- `src/dms/packages/dms/src/ui/components/map/avl-layer.jsx`
- `src/dms/packages/dms/src/ui/components/map/components/HoverComponent.jsx`
- `src/dms/packages/dms/src/ui/components/map/utils.js`

**New files** (Phase 2b):
- `src/dms/packages/dms/src/ui/components/DndList.jsx`

**Modified files** (Phase 2):
- `Map/Map.jsx` — import path change, remove ThemeProvider
- `Map/Layer2.jsx` — split imports (AvlLayer from new, widgets from old)
- `mapeditor/MapEditor/index.jsx` — import path change
- `mapeditor/MapEditor/MapViewer.jsx` — import path change
- `mapeditor/*/SymbologyViewLayer.jsx` — import path change
- `mapeditor/*/PluginLayer.jsx` — import path change
- `ComponentRegistry/map/index.jsx` — import path change
- `ComponentRegistry/map/SymbologyViewLayer.jsx` — import path change

**Modified files** (Phase 2b):
- `ui/components/Button.jsx` — added `themeOptions` support
- `ui/index.js` — added `DndList` export
- `mapeditor/siteConfig.jsx` — added ThemeContext provider with UI
- 12 mapeditor consumer files — switched from direct imports to ThemeContext

**Deleted files** (Phase 2):
- `Map/map-theme/index.js` — theme system removed

**Deleted files** (Phase 2b):
- `mapeditor/ui.jsx` — replaced by UI context pattern

## Theme Removal Details

The avl-map-2 theme system is **entirely removed**. Only 4 theme keys were ever used by kept components:

| Theme key | Tailwind replacement |
|-----------|---------------------|
| `theme.bg` | `bg-white` |
| `theme.text` | `text-gray-800` |
| `theme.textHighlight` | `text-blue-500` |
| `theme.textHighlightHover` | `hover:text-blue-500` |

No ThemeProvider, no useTheme, no composeTheme, no makeProxy, no $compositions.

## Required Public API

```javascript
// Core
export { AvlMap, DefaultStyles }
export { AvlLayer, LayerRenderComponent }

// Hover
export { HoverComponent, PinnedHoverComponent }
```

No theme exports, no utils exports. Utils are internal-only (used by avl-map/avl-layer, not by consumers).

## Testing Checklist

- [ ] `npm run dev` starts without errors
- [ ] Navigate to a gis_dataset map page — map renders
- [ ] Hover over map features — hover tooltip appears
- [ ] Click a feature — pinned hover appears
- [ ] Layer loading spinner shows during data fetch
- [ ] mapeditor page loads and renders map
- [ ] ComponentRegistry map component renders in page pattern
- [ ] Network tab: maplibre-gl is a separate dynamic chunk
- [ ] No regression in existing avl-map-2 consumers (if any still use old paths)
