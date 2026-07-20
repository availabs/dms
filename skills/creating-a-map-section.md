# Creating a map section (headless): symbology + page-variable wiring

**Outcome:** put a working DaMa-tile map on a DMS page from a build script — a `Map` section
with a from-scratch symbology (choropleth/categories/boundaries), dynamic filters bound to the
page's variables (a page filter drives the map; selecting a value can zoom the map to the
filtered features), and a correct legend.

Companions: `editing-map-symbologies.md` (symbology anatomy §2, MapLibre paint §3, style
recipes §4 — read it FIRST; this skill covers the page/section side and the wiring),
`creating-interactive-pages.md` (the page-variable system the map binds to). Worked example:
the tsmo2 reliability map (`build_tsmo_reliability.mjs` §03, catalog symbology 2193672) —
LOTTR choropleth + NYSDOT-region boundaries, year + region page-variable-bound.

## 1. Component choice — `Map`, not `Map: Dama Map`

Two registered map section types (`ComponentRegistry/index.jsx`):
- **`Map`** (`map/`) — single-symbology semantics, **page-state aware**: reads/writes
  `pageState.filters`, supports `dynamic-filters` bound to page variables, interactive-filter
  variants via `searchParamKey`, zoom-to-filter-bounds, `display._functions`
  providers/subscribers, share-state. **Use this** for anything that must react to page filters.
- **`Map: Dama Map`** (`map_dama/`) — multi-symbology Layer-Library browser (the Freight Atlas
  map). Page-state blind. Only for standalone layer-catalog pages.

## 2. Pre-flight: verify your tile sources (5 minutes, saves hours)

Tiles are served per-VIEW from the dama server:
`https://graph.availabs.org/dama-admin/{pgEnv}/tiles/{view_id}/{z}/{x}/{y}/t.pbf?cols=<c1,c2>`

- `curl -w "%{http_code} %{size_download}"` a real z/x/y. **200 + bytes = the view has geometry;
  204 empty = it doesn't** (tabular views 204 — you need a different view or a join).
- Tiles carry NO attributes unless requested via `?cols=`. Sniff what came back:
  `re.findall(rb'[ -~]{4,}', tile_bytes)` on the pbf shows property names/values.
- `?cols=` accepts plain column names only — **SQL expressions (`greatest(...) AS x`) 204**.
  Compute derived values client-side in paint expressions (e.g. `["max", ...]`).
- **Verify VALUES byte-for-byte** when a column must match page-filter values: pbf strings are
  length-prefixed — check the length byte, not a regex (a trailing space is invisible otherwise;
  the reliability Region wiring only worked after re-pointing the filter control to the SAME
  source the map layer uses, so control options, filter leaves, and tiles share one vocabulary).

## 3. The section payload

`element-type: "Map"`, `element-data` (JSON string) top-level keys (state seed,
`map/index.jsx:336-354`):

```js
{
  tabs: [{ name: "Layers", rows: [{ name, type: "symbology", symbologyId: SYM_ID }] }],
  symbologies: { [SYM_ID]: WRAPPER },          // embedded WHOLE — rendering reads only this
  display: { _functions: { providers: [], subscribers: [] } },
  height: "2/3",          // HEIGHT_OPTIONS: full(95vh) | screen | 1(900px) | "2/3"(600) | "1/3" | "1/4"
  zoomPan: true, hideControls: true, blankBaseMap: false, basemapStyle: "Default",
  legendPosition: "bottom-left",               // PANEL_POSITION_OPTIONS keys
  setInitialBounds: false, initialBounds: null // default center [-75.17,42.85] z6.6 = NY state
}
```

The wrapper/layer anatomy is `editing-map-symbologies.md` §2. Minimal from-scratch shape per
layer: `{ id, name, type, "layer-type", source_id, view_id, order, isVisible, sources[],
layers[] (canonical _case+main pair), "legend-data", "dynamic-filters", "hover-columns" }`.
Give ids short unique slugs (`lottrl001`); source ids `{env}_{slug}_{source_id}_{layerId}`;
sub-layer `source-layer` is ALWAYS `view_{view_id}`.

## 4. ⚠ `?cols=` is REBUILT at runtime — `data-column` is the carrier

`SymbologyViewLayer.getLayerTileUrl` strips whatever `?cols=` you baked into the source URL and
recomposes it from: `data-column` (or `filter-group` columns when `filterGroupEnabled`) +
ACTIVE dynamic-filter columns + static-filter columns. Consequences:

- Every column your paint reads MUST be named in `data-column`. It is composed with
  `join(",")`, so a **comma-joined list works**: `"data-column": "lottr_amp,lottr_midd,lottr_pmp,lottr_we"`.
- A dynamic filter's column is only appended while it HAS values — never rely on it for paint.
- Bake sensible `?cols=` into the saved URL anyway (documentation + editor parity), but know
  the runtime rebuilds it.

### 4a. ⚠ Dynamic-filters are CLIENT-side; use `serverSide` for huge views

A plain `dynamic-filter` compiles to a MapLibre `["in", …]` expression on the LIVE layer — it
filters features AFTER the whole tile downloads. Fine for small/standard networks; **fatal for
a per-row view** (e.g. `transcom_event_tmc` view 2799 = one row per event×TMC → **~64MB/tile**).
For those, flag the filter `serverSide: true` — `getLayerTileUrl` then emits a
`&filter=<col> = '<v>'` (or `IN (…)`) WHERE clause and the tile route filters rows in PostGIS
`ST_AsMVT` BEFORE emitting (64MB → ~2KB for one event_id). Only on a BASE-view column; single-
quoted/escaped; only emitted while the filter has values, so pair with a no-match `defaultValue`
sentinel (`"__none__"`) so a missing value never yields the whole-network tile. Bake a real
`?filter=` into a curl to pre-flight the reduction (§2). Worked example: incident_view map
(2799, `event_id` serverSide) — added the capability 2026-07-17
(`map-serverside-tile-filter.md`).

### 4b. ⚠ The Map IGNORES `type:'action'` page params

`map/index.jsx` builds `dataPageFilters = pageFilters.filter(f => f.type !== 'action')` — a
deliberate exclusion so its own interaction filters don't feed back. So dynamic-filters can bind
only to NON-action page vars: the page's `filters[]` defaults and URL `searchParam`s (Filter
controls, `?event_id`, `?region`, `?year`). Params published by data-section `_functions`
(`click_publish`/`load_publish` → `activeTmcLinear`, `activeCorridorTmcs`, …) are ACTION-type and
invisible to the map. If a map must react to a derived/published value, bind it to a URL/page-
filter var instead (e.g. incident_view drives the map off `?event_id`, not the active corridor).

## 5. Dynamic filters ↔ page variables (the interactive wiring)

A layer's `dynamic-filters[]` entries bind to page variables by key
(`searchParamKey || column_name` matched against a page filter's `searchKey`,
`map/index.jsx` dataPageFilters effect):

```js
"dynamic-filters": [{
  column_name: "region_name",     // the TILE property to filter on
  searchParamKey: "region",       // the PAGE variable that drives it
  values: [], defaultValue: "",   // page value wins; defaultValue when page var is empty
  dataType: "numeric",            // set for numeric tile props — values get +coerced
  zoomToFilterBounds: true,       // zoom the map to the filtered features' extent
}]
```

- Compiles to `["in", [to-string|to-number, ["get", column_name]], ["literal", values]]` on the
  live layer — string/number coercion is automatic from the first value's shape.
- **Zoom-to-filter is ACTIVE-LAYER-scoped**: the effect reads only
  `symbology.layers[symbology.activeLayer]['dynamic-filters']` and queries
  `ST_Extent(wkb_geometry)` on that layer's `view_id` (uda `dataByIndex` with the filter
  envelope). Set `symbology.activeLayer` to the layer whose filter should drive zoom (the
  reliability map: the regions layer, so picking a Region zooms to its boundary).
- Zoom padding is proportional to the map container (12%, clamped 24–200px — fixed 2026-07-16;
  it was a flat 200px tuned for full-screen maps, which made embedded maps zoom OUT instead of
  framing the region). Same-bounds refits are guarded, so re-renders don't fight user panning.
- A comma-joined `data-column` is safe with the legend since 2026-07-16: the runtime
  legend-recompute now skips layers without `category-data` BEFORE querying (it used to fire a
  single-column query template against the comma list → a Postgres row-constructor/boolean-type
  error that disrupted co-batched requests). Keep authored `legend-data` on such layers.
- Set `usePageFilters: true` on layers with page-variable bindings — the runtime sync doesn't
  require it, but the Map settings UI's per-layer "use page filters" toggle reads/writes it, so
  authored and scripted layers agree.
- The value vocabulary must match the tile property EXACTLY (see §2 byte-check). The cleanest
  architecture: point the page's Filter CONTROL at the same source/view the map layer renders,
  so one vocabulary serves control options, data-section leaves, and the map.
- No extra registration needed: any page variable (registered via the page's `filters[]` with
  `searchKey`) is visible to the map through `pageState.filters`.

## 6. Legend

- `LegendPanel` renders every visible symbology's layers (sorted `order` desc). Opt a
  boundary/utility layer OUT with `"legend-orientation": "none"`.
- **Swatch rows only render for `layer-type: "categories"` or `"choropleth"`** — an empty
  layer-type gives a title-only row. For hand-authored fixed bins use `"categories"` +
  `legend-data` rows; the runtime legend-refresh's categories branch keeps authored legends
  when the layer has no `category-data` (section-embedded case), so your rows render verbatim.
- The title row shows `layer.name` + a mono columnTag derived from `data-column`.

## 7. Directional line networks (TMC and friends)

TMC geometries are **directional and the two directions overlap exactly** — without an offset
you only ever see one direction's color. Offset each to its right, zoom-scaled with the width:

```js
"line-width":  ["interpolate", ["linear"], ["zoom"], 5, 0.5, 8, 1, 11, 2, 14, 4],
"line-offset": ["interpolate", ["linear"], ["zoom"], 5, 0.3, 8, 0.6, 11, 1.2, 14, 2.5],
```

## 8. Both symbology homes

Embed the symbology in the section (rendering reads only the copy) AND create the mapeditor
catalog row so authors can find/manage it
(`dms raw create <app> "<mapeditorInstance>|symbology" --data '<{name,description,categories,symbology}>'`).
See `editing-map-symbologies.md` §1 for the drift/refresh model.

## 9. Verify (always)

Playwright on the dev site (login first; view mode is cleanest — edit mode's hover chrome
blocks clicks but scroll+screenshot still work):
1. Tile requests for YOUR views return 200 (capture `/tiles/` responses).
2. Zero console errors (paint validation failures are silent — a bad property just doesn't draw).
3. Screenshot and LOOK: are the lines/fills COLORED (not basemap roads)? Is the legend showing
   your rows? Colored-lines-missing with tiles-200 almost always = a paint column missing from
   the rebuilt `?cols=` (§4).
4. Drive the page variable via URL (`?region=...`) — layer filters AND (if configured) the map
   zooms; remove it — map restores.

## Worked example

`src/themes/transportny/qa_skills/tools/builds/build_tsmo_reliability.mjs` (§03, `MAP_ED`):
LOTTR choropleth over Map 21 Extended (view 3394) — paint = `step` over
`max(to-number(lottr_*))` with a 0/no-data guard, year page-variable-bound — plus NYSDOT
regions (view 1823) with `region` page-variable binding + zoom-to-fit. Catalog copy: 2193672.
