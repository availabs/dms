# The DMS map stack — mapeditor, `map`, `map_dama`: architecture + unification recommendations

> Research pass 2026-07-10, driven by the Freight Atlas map redesign
> (`planning/transportny/tasks/current/freight-atlas-map-redesign.md` in the workspace root hub).
> Refines the existing story [map-component-unification.md](../tasks/current/map-component-unification.md).
> Live data references: section **2175271** (pattern 2175436 `freightatlas2_copy`, page `freight_atlas`) —
> the only production consumer of `map_dama`.

Paths (relative to `packages/dms/src/`):
- **mapeditor** = `patterns/mapeditor/` — authoring pattern; edits ONE symbology at a time
- **map** = `patterns/page/components/sections/components/ComponentRegistry/map/` — page section,
  one symbology, page-state aware
- **map_dama** = `…/ComponentRegistry/map_dama/` — page section, multiple symbologies, no page state
- **avl-map** = `ui/components/map/` (`avl-map.jsx`, `avl-layer.jsx`) — the shared MapLibre wrapper

---

## 1. The symbology data model (authoritative reference)

A **symbology** is a JSON object with one or more MapLibre layers, each attached to a pgEnv
source/view, plus legend + filter configuration. Wrapper shape as embedded in a section's
element-data (`symbologies[id]`):

```js
{ name, isVisible, description, categories, collection_id,
  _created_timestamp, _modified_timestamp, id,
  symbology: { id, isDamaSymbology, activeLayer, layers: { [layerId]: LAYER } } }
```

Per-LAYER keys (verified against live sym 2100225 "Freight Network Performance Measures" and the
renderers; a full example is archived at
`dms-template/scratchpad/npmrdsv5-dev2/symbology_2100225_example.json`):

| Key | Meaning |
|---|---|
| `id`, `name`, `order`, `isVisible` | identity; `order` drives z-sort (desc) and panel order |
| `type` | geometry style family: `fill` \| `line` \| `circle` |
| `layers[]` | the ACTUAL maplibre style layers (e.g. `_case` + main line), each `{id, type, paint, layout, source, source-layer}` |
| `sources[]` | maplibre vector sources; tiles URL `…/dama-admin/{pgEnv}/tiles/{view_id}/…` (+ `?cols=` & `join=` appended at runtime by `getLayerTileUrl`) |
| `view_id`, `source_id` | the pgEnv view/source this layer renders |
| `data-column` | column driving choropleth/category paint |
| `num-bins`, `bin-method`, `color-range`, `choroplethdata{max,breaks}` | choropleth config + computed breaks |
| `legend-data[]` | `{color, label}` rows — what legends render |
| `categories{}` | categorical paint config (when styling by class values) |
| `layer-type` | `'interactive'` marks a layer whose config is switched by interactive-filters |
| `interactive-filters[]` | **full layer-config snapshots** (each is itself a complete LAYER object with its own name/paint/legend); the row's dropdown swaps the active one |
| `selectedInteractiveFilterIndex` | which snapshot is live |
| `filter{}`, `dynamic-filters[]` | attribute filters (dynamic-filters: `{column_name, values, searchParamKey?, defaultValue?, dataType?}` → maplibre filter expressions + tile `?cols=`) |
| `filter-group[]`, `filterGroupEnabled`, `filter-group-name`, `filter-group-legend-column` | a dropdown that swaps `data-column` among a curated column list |
| `filter-source-views[]`, `viewGroupEnabled`, `view-group-name` | a dropdown that swaps `view_id` (string-replaces the id through `layers`/`sources`) |
| `hover` | `'hover'` enables the attribute popup (HoverComp fetches attributes via falcor UDA metadata + `dataById`) |
| **map-only additions** | `usePageFilters`, `searchParamKey`, `interactive-filters[].searchParamValue`, `click-filter.{enabled, mappings[{variable, field, useSearchParams, redirectOnClick}]}` |

**Live scale reference (section 2175271):** 7 tabs / 28 rows / 31 embedded symbologies (~450 KB
element-data). 6 symbologies carry interactive-filters (Alt Fuel Corridors ×5 fuels, Freight Network
Perf Measures ×2 [TTTR/AADT], Road Perf Measures ×7, STCC Tonnage ×12 commodities, STCC Value ×10,
Transearch Totals ×2 [tonnage/value]); ~10 use categorical paint; legends run 2–11 rows.

---

## 2. The `mapeditor` pattern (authoring)

~17,700 lines / ~65 files. Registered in `patterns/index.js:6,14`; config `mapeditor/siteConfig.jsx`.

**Storage — symbologies are ordinary DMS data items.** Format `mapeditor/mapeditor.format.js`:
attributes `name`, `description`, `symbology` (json), `categories`; child type
`"<patternInstance>|symbology"` (e.g. `map_editor_test|symbology`) via `initializePatternFormat`
(`siteConfig.jsx:35-36`). The outer `"/*"` route deliberately lists with
`filter.attributes:["name"]` only — 247 symbologies ≈ 5 MB of JSONB otherwise (`siteConfig.jsx:51-58`).
Routes: list `""`, `edit/:id` → `MapEditor`, `view/:id` → `MapViewer` (`siteConfig.jsx:90-104`).

**Editing model — one symbology at a time, immer store + localStorage drafts.**
`MapEditor/index.jsx` seeds state from a localStorage draft (`mapeditor_symbology_<id>`,
`index.jsx:231,300-326`) or the DB item, else `DEFAULT_BLANK_SYMBOLOGY` (`:233-241`). Writes go
through **falcor DMS RPC**, not apiUpdate: save = `falcor.call(["dms","data","edit"],[app, id,
{symbology}])` (`SaveChangesMenu.jsx:77-84`), create/save-as = `["dms","data","create"]` (with all
layer ids regenerated on save-as, `:102-126`), delete = `["dms","data","delete"]`
(`SymbologySelector/index.jsx:15-23`). The page side loads the same items via `apiLoad` with
`{app, type:"<inst>|symbology"}` built from `mapeditorKeys` (`map/index.jsx:240-265`).

**symbology object:** `{ activeLayer, layers:{[layerId]: LAYER}, plugins:{}, pluginData:{},
zoomToFit, zoomToFilterBounds }` — `layers` is an id-keyed object (ids are random slugs,
`SourceSelector/index.jsx:100`), z-order via each layer's `order`.

**Layer creation (canonical shape):** `SourceSelector` browses UDA sources/views
(`"uda",pgEnv,"sources"…`, `:32-72`); `addLayer` (`:97-151`) builds the layer from the view's
`metadata.tiles`: `sources[]` copied **verbatim from view metadata** (the dama-admin tile URL is
produced server-side and stored in the view; the client only appends `?cols=`/`&join=` at render),
and `layers[]` (the real maplibre style layers) built by `getLayer()` (`LayerManager/utils.jsx:192-211`)
— fill/line = `[<id>_case]` casing + `[<id>]` main (paint at `layers[1]`), circle/heatmap = single
layer (paint at `layers[0]`). Paint-path lookup: `stateUtils.jsx:26-37`; `extractState`
(`stateUtils.jsx:10-116`) is the authoritative reader of every layer key + defaults.

**Editing UI:** two floating panels (`index.jsx:1167-1198`) —
- **LayerManager** (left): SymbologyControl header (name/create/open/save/delete) + tabs
  Legend / Layers / Plugins + `SourceSelector` add-layer. Layers tab = DnD list writing `order`
  (`LayerPanel.jsx:121-155`); Legend tab renders live legends + `VisibilityButton` + end-user
  dynamic-filter pickers (`LegendPanel.jsx`, 946 lines).
- **LayerEditor** (right): tabs Style / Legend / Popup / Filter / Join for the `activeLayer`.
  Style is **declarative**: `typeConfigs.jsx` (1,221 lines) maps geometry `type` → control groups,
  each control writing a `path` into the layer (e.g. "Color By" → `['data-column']`, "Fill" →
  `['color-range']`, stroke → `layers[0].paint['line-color']`); implementations in `Controls.jsx`
  (1,257 lines). In interactive mode all control paths are rewritten into the selected
  `interactive-filters[i]` snapshot (`StyleEditor.jsx:28-46`).

**Choropleth breaks are computed server-side.** The editor requests
`["uda", pgEnv, "viewsById", viewId, "colorDomain", JSON({column,numbins,method,filters,join})]`
(`index.jsx:734-811`, cached by a `legendFilterKey`); the dms-server controller
(`routes/uda/uda.colorDomain.controller.js`, 397 lines, PG-only) implements `equalInterval`/
`quantile`/`standardDeviation`/`ckmeans` (exact ≤50k rows, else histogram + weighted ckmeans) and
returns `{breaks, min, max, count}`. The client turns breaks into `step` paint expressions +
`legend-data` via `choroplethPaint()` (`datamaps/index.js:71-123`); categorical paint via
`categoryPaint()` (`match` expression, `:5-47`). `bin-method:'custom'` breaks are edited client-side
(`Controls.jsx:719-831`). Legend queries carry the same UDA filter envelope as the tiles
(`stateUtils.jsx:218-336`) so legends match the filtered data.

**Filter machinery (authoring semantics):**
- `filter` + `filterMode` — static attribute filters → maplibre `setFilter` expressions AND tile
  `?cols=`; mirrored to SQL (`filterToUda`) for legend/colorDomain requests.
- `dynamic-filters` — end-user value pickers; can drive `zoomToFilterBounds` via UDA `ST_Extent`.
- `interactive-filters` — **full layer-config snapshots** made by copying the active layer
  (`InteractiveFilterControl/index.jsx:70-93`); selecting one **flattens the snapshot onto the
  layer** (spread, preserving name/order, `index.jsx:589-644`). This is why each snapshot in the
  live Freight Atlas data duplicates the whole layer JSON.
- `filter-group` — swaps which **column** is styled (`data-column`) at runtime; seeds from current
  column on enable (`index.jsx:1064-1081`).
- view group (`filter-source-views`/`view-group-id`) — swaps which **view** (time slice) backs the
  layer; triggers full source rebuild; colorDomain targets the active group view
  (`index.jsx:1083-1103`).
- `join` — second view joined at tile-request time (`&join=<encoded>` on the tile URL +
  join-aware colorDomain; see `references/map-joins.md`).

**Rendering core:** editor + viewer wrap each layer in `new SymbologyViewLayer(l)` over the shared
`AvlMap`/`AvlLayer` (`ui/components/map/`); `ViewLayerRender` imperatively syncs sources (rebuild on
data/filter/view change via `getLayerTileUrl`), order (`moveLayer`), paint/layout, filters, and
bounds (`SymbologyViewLayer.jsx:14-304`). Existing cross-pattern coupling note: `map`'s copy already
imports `normalizeLayerClickFilterConfig` from mapeditor's `stateUtils` (`map/SymbologyViewLayer.jsx:11`).

---

## 3. The `map` component (one symbology, page-state aware)

Registered `type: 'Map'` (`map/config.jsx:56-65`), with `componentFunctions` declaring the page
interaction contract — providers `hover_publish`/`click_publish`, subscribers
`hover_highlight`/`click_highlight` (`config.jsx:9-53`) — and `controls: MapControls` (the edit-time
settings tree; there is **no on-map layer panel** in `map`).

```
MapSection (index.jsx:209)                       ← isEdit prop toggles edit/view
 └─ MapContext.Provider {state,setState,falcor,falcorCache,pgEnv,doApiLoad}
     ├─ <AvlMap layers=[new SymbologyViewLayer(l) | new PluginLayer(l)] layerProps onMapStyleSelect …/>
     ├─ absolute {legendPosition}        → <LegendPanel/>
     └─ absolute {pluginControlPosition} → <ExternalPluginPanel/>
```

- **State** (`index.jsx:220-238`): map_dama's shape **plus** `display._functions`
  (providers/subscribers), `zoomToFitBounds`, `legendPosition`, `pluginControlPosition`,
  `basemapStyle` (persisted via `onMapStyleSelect`, `:838-842`).
- **Single-symbology semantics live in AUTHORING, not rendering**: `activeSym` = first visible
  symbology (`:311-313`); the symbology picker **replaces** `state.symbologies` with one entry
  (`settings/symbologySelector.jsx:83-86`). The layer-building effect (`:648-710`) already handles
  multiple — a critical unification fact.
- **Page-state binding (the URL-shareability model)** — `map` reads AND writes `pageState.filters`
  (PageContext, `index.jsx:217`):
  - **Read**: non-action page filters (`:344-346`, action-guard `:360-365`) drive
    `selectedInteractiveFilterIndex` (matching `searchParamKey` → filter `searchKey`, `:376-397`)
    and `dynamic-filters[].values` (`:391-419`).
  - **Write**: layer click-filter mappings with `useSearchParams:true` call
    `updatePageStateFilters` (`SymbologyViewLayer.jsx:1016-1067`, write at `:1037`); hover/click
    *publish* uses `setActionParam`/`clearActionParam` (transient, never URL).
  - **URL round-trip lives in the page pattern, not the map**: `view.jsx:86-88` +
    `_utils/index.js:440-478` (URL→state incl. first-load init) and `view.jsx:113-149` +
    `convertToUrlParams` (state→URL, `'|||'`-joined) for every filter with `useSearchParams:true`.
- **Edit UI**: `settings/controls.jsx` (516 lines) renders a clean nav-menu tree (Symbology, Layer,
  Filters [page-filters toggle, search-param key, interactive/dynamic/click-filter panels], Height,
  Legend/Plugin position, zoom/pan, viewport, blank basemap, zoom-to-fit), with handlers in
  `settings/{more,filters,symbology,layers,symbologySelector}.jsx` via `useMapSettingsControls`.
- **Dead code**: `map/pmtiles/*` (11 files — every `PMTilesProtocol` reference commented out:
  `index.jsx:5,832`, `SymbologyViewLayer.jsx:508-516`), `map/SymbologySelector.jsx`,
  `map/controls/{FilterControls,MoreControls}.jsx`, `map/tmp-cache-files/*` (all commented out of
  `index.jsx:10-17, 814-822`).

## 4. The `map_dama` component (multi-symbology, page-state blind)

Registered `name: 'Map: Dama'`, `type: 'Map'` (`map_dama/config.js:7-19`) — **no**
`componentFunctions`, **no** `controls`; everything happens inside on-map panels.

```
MapDamaEdit (index.jsx:77) / MapDamaView (:291)   ← two near-identical components
 └─ MapContext.Provider {state,setState,falcor,falcorCache,pgEnv[,doApiLoad edit-only]}
     ├─ <AvlMap layers=[new SymbologyViewLayer(l) per layer of EVERY symbology] layerProps …/>
     ├─ <MapManager/>   (left panel · 340px · view-gated by !state.hideControls)
     └─ <LegendPanel/>  (right)
```

- **Element-data (saved)**: `{tabs:[{icon,name,rows:[{name,type:'symbology',symbologyId}]}],
  symbologies:{[id]: wrapper}, height, isEdit, zoomPan, blankBaseMap, hideControls, initialBounds,
  setInitialBounds}` — symbologies **embedded whole**; view mode never re-fetches by id.
  `doApiLoad` (edit only, `index.jsx:93-118`) fetches the full symbology catalog from every
  mapeditor pattern (`mapeditorKeys`) for the add/update flows only.
- **Zero PageContext** — no references to pageState/searchParams/`_functions` anywhere (verified).
  Structural reason it can't do URL state or page filters today.
- **Interactive-filter swap effect** (`index.jsx:203-247` / `:383-428`): swaps in
  `interactive-filters[selectedInteractiveFilterIndex]` as the layer config and forces sub-layer
  `layout.visibility` to match `isVisible`.
- **Basemap**: hardcoded `defaultStyles`/`blankStyles` inline (`index.jsx:29-75`); no
  `onMapStyleSelect`, choice not persisted.

### 4a. The current view-mode UI (the "clunky" baseline being redesigned)

All in `MapManager/MapManager.jsx` (919 lines):
1. **Panel shell** (`:655-804`): fixed 340px card, top-left. Left **icon-only tab rail** (45px,
   `:679-791`) — one cryptic icon per category, no labels; one tab's rows visible at a time.
2. **SymbologyRow** (`:83-482`): visibility **checkbox** (`:341-346` → flips
   `symbologies[id].isVisible` + every sub-layer visibility, `:115-127`); clicking the name also
   toggles in view (`:348`). Below the name, stacked full-width dropdowns appear per configuration
   (`groupSelectorElements`, `:166-281`): interactive-filter select ("Filters:", `:167-194`),
   filter-group select (`:196-230`, swaps `data-column`), view-group select (`:231-278`, swaps
   `view_id` by string-replacing through the JSON — brittle), dynamic-filter checkbox popup
   (`:806-917`).
3. **LegendPanel** (`LegendPanel.jsx:274-331`): read-only blocks per visible symbology
   (Category/Step/Horizontal/Circle legends, `:214-272`); a leftover `VisibilityButton` (`:15-42`)
   references non-existent `state.symbology` — dead.
4. AvlMap NavigationControls (basemap swatch + zoom) bottom-right.

UX problems, empirically (screenshots in the FA task): unlabeled icon tabs; no cross-category
view of what's ON; no search; per-row dropdowns eat the panel and it's unclear which layer they
belong to; dead whitespace; no share/permalink; per-row falcor view-list fetches fire for every
row with a `sourceId` — up to 31 round-trips at panel render even in view (`MapManager.jsx:141-164`).

**Edit-mode UI**: same panel + editable tab/row names, add-tab, add-symbology
(`SelectSymbology` modal → `SymbologiesList` gallery, `MapManager/SymbologySelector/*`), icon
picker, tab remove/move, row reorder/remove/"Update symbology" (re-clone from catalog preserving
visibility), and a map-settings MenuDots (height, controls, zoom/pan, viewport, blank basemap).

### 4b. Perf profile (31 symbologies / ~450 KB element-data)

- Eager: full JSON parse, 31 `SymbologyViewLayer` mounts, all sources+layers registered on the
  style up-front (`avl-layer.jsx:72-134`); no lazy anything.
- Saving grace: hidden layers are added `visibility:'none'`, and **MapLibre only fetches tiles for
  sources referenced by a visible layer** — network cost is visibility-gated.
- Re-render amplification: one immer object for all symbologies; any toggle re-runs the
  flatten/diff effects + LegendPanel memo over all 31.

## 5. Shared vs duplicated code

**`SymbologyViewLayer` — three forks of the same renderer:**

| Copy | Lines | Context | Interactions |
|---|---|---|---|
| `mapeditor/MapEditor/components/SymbologyViewLayer.jsx` | 1,144 | MapEditorContext | none (authoring) |
| `map_dama/SymbologyViewLayer.jsx` | 736 | MapContext | none |
| `map/SymbologyViewLayer.jsx` | 2,179 | MapContext + **PageContext** | full (publish/subscribe, click-filter, highlights, join-aware `resolveFeatureProperties`) |

Common core in all three: the `ViewLayerRender` effect (imperative
add/removeSource/Layer/setPaint/setLayout/setFilter on style changes), `getLayerTileUrl`
(`?cols=` + `join=`), the maplibre filter-expression builder (duplicated near-verbatim), and
`class ViewLayer extends AvlLayer` with HoverComp wiring. `map`'s adds ~1,400 lines of
interaction machinery (hover-publish `:818-924`, click handler `:934-1189`, subscriber-highlights
`:1191-1339`, join lookups `:1346-1509`) and a formatted HoverComp (`:1747-2179`) vs map_dama's
plain one (`:578-736`).

**LegendPanel** — copy-paste siblings that drifted (map honors plugin legend opt-out + CMSContext
`dataSourcesBaseUrl`; map_dama adds per-symbology name headers, hardcodes `/datasources/source/…`).
**avl-map** — genuinely shared; both pass the same props; only `map` passes `onMapStyleSelect`.

---

## 6. Recommendations — one component, backwards compatible for `map`

Confirms the base decision in [map-component-unification.md](../tasks/current/map-component-unification.md)
(build on `map/`) and refines it with what this pass established:

### 6.1 BC invariants for `map` (must not change)
1. Saved `map` element-data renders identically with zero migration: state fields are a strict
   superset; new fields get defaults that reproduce today's behavior.
2. Single-symbology semantics preserved **by default**: authoring keeps replace-on-pick until the
   author opts into "multi-layer library" mode; `activeSym`-derived behaviors (filter sync,
   runtime legend refresh) keep working when exactly one symbology is visible.
3. `display._functions` providers/subscribers, click-filter mappings, `searchParamKey` channels,
   basemap persistence, legend/plugin positions — untouched.
4. The settings-tree edit model stays (`settings/controls.jsx`); map_dama's on-map edit menus are
   NOT ported (their functions move into the settings tree).

### 6.2 What actually needs porting (smaller than it looks)
- `map`'s layer-building effect **already renders multiple symbologies** (`index.jsx:648-710`) —
  multi-visible is an authoring + panel-UI unlock, not a renderer rewrite.
- Port from map_dama: the `tabs[]` grouping concept, `isVisible` multi-toggle semantics, the
  interactive-filter/filter-group/view-group row selectors, per-symbology legend blocks (+name
  headers), and the add-symbology catalog modal (as a settings-tree panel).
- Do NOT port `MapManager` wholesale: replace the view-mode panel with the redesigned **Layer
  Library / Active Map** panel (see the Freight Atlas mockup `freight-atlas-map.html`, 2026-07-10) —
  labeled category accordion + search + pinned active-composition list with inline
  interactive-filter selects + stacked legend with per-layer eye toggles. Same element-data
  underneath (tabs = categories; toggles = `isVisible`; selects = `selectedInteractiveFilterIndex`;
  drag = `order`).

### 6.3 URL-shareable maps (the Freight Atlas requirement)
Generalize `map`'s existing channel — no new machinery, reuse the page pattern's
`useSearchParams:true` filter round-trip (`view.jsx` + `_utils`):
- `layers=<id>,<id>…` → which symbologies have `isVisible:true`
- `f_<symId>=<idx>` → that symbology's `selectedInteractiveFilterIndex`
  (extend later: `fg_`/`vg_` for filter-group/view-group selections)
- Implement as pageState filters with `useSearchParams:true` owned by the map section (read on
  mount via the existing `updatePageStateFiltersOnSearchParamChange` path; write via
  `updatePageStateFilters` on toggle). Default OFF (`useSearchParams:false`) so existing `map`
  sections don't suddenly grow URL params — the Freight Atlas section opts in.
- Guard: URL ids must exist in the section's `symbologies{}` — ignore unknown ids (links survive
  symbology removal).

### 6.4 map_dama migration & retirement
- Freight Atlas section 2175271 is the ONLY production consumer → one-shot migration script
  (dry-run + `--apply`) mapping `{tabs, symbologies}` into the unified shape; add missing
  defaults (`legendPosition`, `basemapStyle`, `pluginControlPosition`, `zoomToFitBounds`);
  keep local-filter behavior (no page binding) unless opted in.
- Then delete `map_dama/` and the `'Map: Dama'` registry alias (existing plan U6).

### 6.5 Perf fixes to fold in (cheap, high value at 31 symbologies)
- Defer `SymbologyViewLayer` construction + style registration until first `isVisible:true`.
- Kill the per-row view-list falcor fetch in view mode (only needed when a row's
  `viewGroupEnabled`; fetch lazily on dropdown open).
- Keep symbologies embedded (works offline-ish, no fetch fan-out) but consider trimming
  `interactive-filters[]` snapshots (each duplicates full layer JSON — the dominant share of the
  450 KB).

### 6.6 Dead code to delete alongside
`map/pmtiles/*`, `map/SymbologySelector.jsx`, `map/controls/{FilterControls,MoreControls}.jsx`,
`map/tmp-cache-files/*`, map_dama `LegendPanel` `VisibilityButton` (`:15-42`).

### 6.7 Renderer consolidation (follow-on, not a blocker)
Three `SymbologyViewLayer` copies (2,179 / 1,144 / 736 lines) re-implement the same
`getLayerTileUrl` + filter-expression + source-rebuild core against the same symbology JSON.
Unifying map+map_dama removes the 736-line copy for free. Folding the mapeditor copy in too means
promoting the shared core out of both patterns (cross-pattern imports are forbidden — precedent:
`utils/auth.js`; note `map/SymbologyViewLayer.jsx:11` already violates this by importing mapeditor
`stateUtils`). Suggested seam: a shared "symbology renderer" module under `ui/components/map/`
(where `AvlLayer` already lives) exposing the render effect + tile-URL/filter builders, with
interaction hooks injected — the page copy binds PageContext machinery, the editor binds none.
Do this AFTER the map_dama retirement so only two copies remain to reconcile.

---

## Appendix — section 2175271 category/layer inventory

| Category (tab) | Rows |
|---|---|
| Geographies | Counties · REDC Regions · NYS MPOs · Census Tracts |
| Freight Facilities | Intermodal Facilities · Pipeline System · Border Crossings · Air Cargo Facilities · Pipeline Terminals · Truck Parking Inventory Buffer |
| Maritime Network | Canal System · Marine Highways · Major Ports |
| Rail Network | 2024 Core Rail Freight Network · Core Rail by Class · Rail Served Facilities · STRACNET |
| Road Network | NYS Freight Core Highway Network · National Freight Highway Network · Roads · NYC Truck Routes · STRAHNET |
| Network & Commodity Data | Road Condition · Apple Orchards · Dairy Cow Inventory · Alt Fuel Corridors · Freight Network Perf Measures · Road Perf Measures |
| Transearch Freight Movement | STCC Value (10 commodities) · STCC Tonnage (12) · Transearch Totals (tonnage/value) |

Legend/ramp examples used in the redesign: FCHN `aadt_actua` 9-bin yellow→red (#f7e76e→#ce141f)
+ "No data" #ccc; Transearch Totals `total_tonnage` 7 bins; Road Condition IRI 3 custom bins;
Rail by Class 3 categories; Major Ports 10 categories + Other.
