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
- **A STATIC dynamic-filter (baked `values`, no page variable) must mirror its values in
  `defaultValue`.** The page-filter sync resets every dynamic-filter with no matching page
  variable to `defaultValue`-or-`[]` on ANY page-filter change (see §7c item 3) — a static
  boundary scoping (`county_nam = 'Sullivan'`) silently un-filters on the first dropdown click
  unless `defaultValue` restores it. (MNY actions dashboard jurisdictions layer, 2026-08-24.)
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

## 7a. Map plugins and the overlay (edge-pinned panels)

A registered map plugin's `comp` renders **inside AvlMap's overlay**
(`absolute inset-0 pointer-events-none p-2`), in its `flex-1 relative` child. The overlay's second
child is core's **map-actions column** — full height, ~176px wide with the four navigation buttons,
but it only draws in the **bottom-right corner**. So its width comes out of `flex-1`, and anything
your plugin pins `right-0` lands ~200px inside the map (measured on npmrds `/macro`: right panel
right=1400 in a 1600 viewport, against a 24px inset on the left).

If your plugin pins panels to the map's edges, declare it on the plugin object:

```js
export const MyPlugin = { id: "my_plugin", type: "plugin", fullWidthOverlay: true, … };
```

`ComponentRegistry/map/index.jsx` reads that off `PluginLibrary` and passes AvlMap
`floatMapActions` (opt-in, **default off** — no flag means today's layout, and no section/page edit
is needed to get it). The column then takes zero width and its controls float in the same corner.

**Then move your own bottom-right chrome.** Once the overlay is full-width, that corner is core's:
the nav row occupies the bottom 40px × 160px, and its **basemap menu opens upward, 240 × 144px**
(x from `controls_left − 104`). A pill sitting bottom-right will be covered when the menu opens —
macroview's download pill moved into the bottom-**left** bar beside its freshness strip.
See `src/dms/planning/tasks/current/map-actions-column-reserves-overlay-width.md`. Not wired for
MapEditor / MapViewer / `map_dama`, so panels still stop short in the author-side map editor.

## 7b. Plugin-owned client-side overlays (and surviving a basemap change)

The map draws its data **only from tiles** — that rule stands. But a plugin sometimes needs a
handful of extra marks on the canvas that are a *result of a side-query*, not a published view
(macroview draws the 25 worst segments as circles sized by value and coloured by legend bin). A
tile route for 25 features would mean a second published view; a maplibre **GeoJSON source +
layer added through the plugin's own map handle** is the right tool. The plugin gets that handle
two ways: `mapRegister(map, …)`/`cleanup(map, …)`, and the `map` prop on `comp`
(`PluginLayer` renders `<RenderComp state setState map={maplibreMap}/>`).

Three things bite, in this order:

1. **A basemap change destroys it.** `MapActions.setMapStyle` calls `maplibreMap.setStyle(...)`,
   which replaces the whole style — every source and layer not in the new style document is gone.
   Core re-adds *its* layers (AvlLayer's "CHECK FOR STYLE CHANGE" effect); nothing re-adds yours.
   Keep a `map.on("styledata", redraw)` listener and re-add when the source is missing.
2. **Core re-adds its layers *after* that**, off a React dispatch fired from the same `styledata`,
   so freshly re-added tile layers land **on top of** your overlay. Re-assert z-order on every
   redraw: `map.getLayersOrder()` is a cheap id-array copy, and `map.moveLayer(id)` with no
   `beforeId` moves to the top — skip it when the id is already last so the
   styledata → mutate → styledata loop terminates.
3. **⚠ Do NOT gate the re-add on `map.isStyleLoaded()`.** This is the trap. maplibre's
   `Style.loaded()` returns false unless **every tile manager has finished loading**, but
   `addSource`/`addLayer` only need `style._loaded` (`_checkLoaded` throws *"Style is not done
   loading."*). After a basemap change the tiles load for the entire window in which `styledata`
   fires, so an `isStyleLoaded()` gate rejects every attempt — and once the tiles finish,
   `sourcedata` fires, not `styledata`, so no attempt ever comes back and the overlay never
   returns. Gate on "is there a style object" and wrap the mutation in try/catch; another
   `styledata` always follows.

Also: **remove the layer and source in the plugin's `cleanup(map, …)`** — core's AvlLayer teardown
only removes the layers *it* declared, so a plugin-added overlay outlives the plugin otherwise.
And if you size marks with `["interpolate", …]`, guard the **zero-width domain** (all values
equal): maplibre does not throw, it logs *"Input/output pairs for `interpolate` expressions must be
arranged with input values in strictly ascending order"* and **does not add the layer at all**.

Worked example: `src/themes/transportny/components/macroview/worstPoints.js` + the effect in its
`comp.jsx`.

## 7c. Plugin-owned URL state (a plugin that persists ITS state through the page)

A plugin with viewer controls (measure, year, chips, toggles) usually wants those in the URL so a
view can be shared and deep-linked. **The plugin must not touch `useSearchParams`.** The comment
next to the map's own share-state (`ComponentRegistry/map/index.jsx` ~490-545) states the measured
reason: *"writing the URL from the map fights the page's URL ownership and, under React Compiler,
ping-pongs into a reload loop."* The page owns the URL; the plugin READS `pageState.filters` and
WRITES through `updatePageStateFilters` — both off `PageContext`, which a plugin `comp` can consume
directly (`React.useContext(PageContext)`; absent in the MapEditor, which is a free feature gate).

**1. The params must be REGISTERED page variables.** `updatePageStateFilters` rebuilds the query
string from `pageState.filters.filter(f => f.useSearchParams)` and **silently drops any key the page
does not declare** — a plugin cannot invent a param at runtime. Two ways to register:

- author them on the page: `page update <id> --set 'filters=[{"id":"…","searchKey":"measure","values":[],"useSearchParams":true}, …]'`
  (this is exactly what the Settings tab's "Filters" panel writes), or
- have the platform derive them, which is what `display.shareableState` does for `layers` /
  a layer's `searchParamKey` (`deriveMapShareVariables` in `pages/_utils`).

Registering *is* the opt-in: intersect what you would write with the registered set and no-op when
it is empty, so the same plugin on a page with no `filters` simply stops persisting instead of
navigating against a URL nobody owns.

⚠ `values` must be `[]`, **never `""`**. `convertToUrlParams` skips an empty ARRAY but happily emits
`key=` for `[""]` — the empty-leaf bug class (`reference_dms_page_variable_empty_leaf_bug`).

**2. Read before write, and make the gate STATE not a ref.** Copy the shape core uses: a
`readReconciled` **state** flag (a remount re-defers), a primed-baseline ref (the first pass after
reconciliation primes and does not write), and an idempotency check against the page ("never write
what the page already holds"). The failure this prevents is concrete: a plugin's `mapRegister` runs
on **every** mount and typically reseeds defaults — and `PluginLayer`'s mount effect runs **after**
`comp`'s, so it lands second. Writing before the read has reconciled pushes those defaults over the
viewer's selection and bounces navigate↔remount.

**2a. Make the READ a CONVERGING reconciler, and trigger it on the URL, not on state.** Both halves
matter and each has a failure mode you will otherwise ship:

- **URL-triggered.** Key the read on a serialized "what the URL means" value and arm it only when
  that key changes (keep the armed flag in a ref). A viewer's own control change moves state while
  the reader is disarmed, so it does nothing. A *state*-triggered reader fights the writer: the
  instant a control changes, the URL still holds the old value and the read puts it straight back.
  Core does the same thing structurally — its read lives in the `[dataPageFilters]` effect, so it
  only ever fires on a URL change.
- **Converging, one step per run.** Apply one difference, return, and let the resulting state change
  re-trigger the effect. Order the steps by dependency (a "measure" decides which dependent controls
  exist, and normalizing it resets them, so controls come after). Convergence is also what makes
  `mapRegister` harmless: step 1 writes the value, `mapRegister` resets it in the same effect phase,
  the next run writes it again.
- **A one-shot mount read looks fine and is not.** It passes round-trip, clean-start, no-ping-pong
  and clearing; what it fails is Back/Forward — the URL moves and the rendered state doesn't. Assert
  a *rendered* control value across back/back/forward, not just `location.search`.
- Reset controls **absent** from the URL to their defaults, so the URL is authoritative for the whole
  group; otherwise Back out of a `?traffic=truck` state leaves the truck filter on.

**3. ⚠ Any page-filter write RESETS every layer dynamic-filter that has no matching page variable.**
This is the one that will surprise you. The `dataPageFilters` effect syncs *all* layers on *every*
`pageState.filters` change: for each `dynamic-filters[]` entry it looks up a page variable named
`searchParamKey || column_name` and, finding none, sets `filter.values` to `defaultValue` or `[]`.
So if your plugin writes dynamic-filters itself (keyed on source columns), the very first param you
persist un-filters the map — the chips still show the selection while the tiles, the panels and any
row counts snap back to unfiltered. Either

- name your page variables **exactly** the filters' `searchParamKey`/`column_name` so the sync
  *restores* them (the platform's intended path, but one param per column and the value vocabulary
  becomes the column's), or
- keep the URL vocabulary separate (readable keys, no collision) and add a **reconciler effect**
  that re-asserts the layer's `dynamic-filters` from your own state whenever they diverge
  (`isEqual(actual, desired)` → return, else write). It converges in one pass and cannot ping-pong,
  because core's sync does not re-run when only layer state changes. Build both writes from ONE
  shared pure helper or they will drift silently.

**4. Contract hygiene.** Persist only what a viewer can change, only non-default values (a pristine
page must leave the URL clean), and persist **meanings, not ids** — a human `year=2025` resolved
against the section's view list, not `viewId=3425`, because viewIds change when data is republished
and a shared link must not rot. Validate every decoded value against the live vocabulary (the
select's own list, the control's `domain`, the fetched option list) and DROP what does not resolve,
so `?measure=nonsense` degrades to the default instead of rendering empty. Re-derive display labels
(a chip's `name`) from the fetched options rather than storing them — and therefore gate
reconciliation on those options having arrived, or the write side erases the param it was about to
read.

**5. Two costs, both measured, neither avoidable without a core change.**
Registering any URL-bound page variable makes `initNavigateUsingSearchParams` fire once per
`PageView` mount on a bare page (`url` is `"?"`, `search` is `""`, so it navigates); react-router
drops the lone `"?"`, so the URL stays clean, but you get same-URL history entries (measured: 3
pushes + 1 replace on `/macro`, vs 0 on a sibling page with no `filters`). A load that **does** carry
params costs **0** — `initNavigate` short-circuits on a non-empty `search`.
Also don't write mid-normalization: if a control change triggers a "normalize the dependent
controls" effect, writing on that same commit emits a transient wrong URL and costs a second
navigation. Gate the write on "the driving value did not change this render".

Worked example: `src/themes/transportny/components/macroview/urlState.js` (pure encode/decode) +
the READ/WRITE effects and the dynamic-filter reconciler in its `comp.jsx`; page 2101931's
`filters` array is the registry. Instrument ping-pong by wrapping `history.pushState` /
`replaceState` in a Playwright `addInitScript` and asserting the count settles.

## 8. Both symbology homes

Embed the symbology in the section (rendering reads only the copy) AND create the mapeditor
catalog row so authors can find/manage it
(`dms raw create <app> "<mapeditorInstance>|symbology" --data '<{name,description,categories,symbology}>'`).
See `editing-map-symbologies.md` §1 for the drift/refresh model.

## 9. Verify (always)

Playwright on the dev site (login first; view mode is cleanest — edit mode's hover chrome
blocks clicks but scroll+screenshot still work):
1. Tile requests for YOUR views return 200 (capture `/tiles/` responses). ⚠ **maplibre fetches
   vector tiles from its WORKER thread — `page.on('request')` sees NONE of them** (only basemap
   JSON/raster from the main thread), so a perfectly healthy map looks dead. Listen at the
   CONTEXT level (`browserContext.on('request')`) instead. (Cost a full debugging detour on the
   MNY actions dashboard, 2026-08-24.)
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

## Expression dynamic-filters (JSONB fields etc.) — 2026-08-27

A serverSide `dynamic-filter`'s `column_name` MAY be a SQL expression
(`data->>'maturity_level'`): the tile `filter=` param is a composed SQL
condition string and the server evaluates it fine. The trap (fixed in
SymbologyViewLayer): active filter column_names are also appended to the tile
URL's `cols=` — an expression there makes the server return EMPTY tiles for the
whole layer (looks like "the filter broke the map"). `getLayerTileUrl` now
keeps only plain identifiers in `cols=`. Diagnostic that separates the two: the
tile layer goes blank ONLY while the filter is active, and a direct tile
request with the same `filter=` but a minimal `cols=` returns data.
