# MapEditor Joins (Linked Data Interaction)

## Objective

Add a per-layer **"Linked Data" join** capability to the MapEditor pattern, configured through a new `Linked Data` tab in the `LayerEditor`. An author can:

1. **Define a simple join** — pick a key column on the rendered geometry layer, pick a *different* analytical view, pick the join column on that view, and shape the returned result (rows or grouped/aggregate). This is the base capability.
2. **Optionally add a click interaction on top** — turn on a click trigger so that clicking a rendered feature runs the join (filtering the linked view by the clicked feature's key) and shows the result in a map popup. **This is an additive option layered on the join, not the join itself.**

The join is the data relationship; the click interaction is one (optional) way to fire it. In V1 the click interaction is the only consumer, but the two are configured separately so that later triggers (hover, action-param publishing) can reuse the same join definition.

Source design doc: [`references/map-joins.md`](../../../../../references/map-joins.md) (in `dms-template/references/`). This task file is the implementation source of truth; the reference doc is the product rationale.

## Cross-pattern policy (READ FIRST)

**We do not share code across patterns. Re-implement, do not import.**

The page pattern's `dataWrapper` (`patterns/page/components/sections/components/dataWrapper/`) already solves the same shaped problems — source/view selection, column metadata, aggregate/groupBy UI, and UDA query building (`buildUdaConfig.js` / `getData.js`). **Use it as a design reference for shape and vocabulary, but re-implement the parts we need inside the relevant pattern.** Specifically:

- The MapEditor UI (this pattern, `patterns/mapeditor/`) gets its **own** controls and config normalizer — do not import dataWrapper controls.
- The runtime click execution lives in the **page pattern** map component (`patterns/page/.../ComponentRegistry/map/`) and gets its **own** linked-query builder — do not import `buildUdaConfig.js`/`getData.js` from dataWrapper.

Copying a ~40-line pure query-builder into each pattern is the intended outcome here. Per `packages/dms/CLAUDE.md`, that also matches the "no convenience wrappers around load-bearing APIs" rule — inline `falcor.get([...])` at the call sites the way `ClickFilterControl` does, rather than building shared fetch hooks.

## Scope

### In scope (V1)

- New `Linked Data` tab in `LayerEditor` with controls to define a join + an optional click-interaction sub-section.
- Per-layer persisted config under the layer key `'linked-data'` (kebab-case, matching sibling keys `click-filter`, `hover-columns`, `dynamic-filters`).
- Linked-view column metadata fetch (a *second* source's metadata — new vs. existing controls which only read the layer's own source).
- Result shaping: `rows` mode (explicit return columns + orderBy + limit) and `aggregate` mode (groupBy + metrics + orderBy + limit).
- Runtime: on feature click (when the click interaction is enabled), read the feature key, run the linked UDA query, render results in a pinned popup with loading / empty / error states.
- Hard safety cap on `limit` (100) and validation of required config.

### Out of scope (deferred)

- Hover trigger, debounce, result caching (V2).
- Side-panel display mode (V2).
- Publishing returned result sets as page action/filter payloads (V3).
- Geometry/flow rendering of returned rows, OD path drawing (V4).
- An in-editor live "preview" that runs the query (deferred; if added later it re-implements the runtime builder, see Cross-pattern policy).
- Multi-condition joins, multiple linked views, freeform SQL.

## Current State

### How layer behaviors work today

- `LayerEditor/index.jsx:15` defines the tab list as a literal array:
  ```js
  const LAYER_EDITOR_TABS = [
    { name: 'Style',  Component: StyleEditor },
    { name: 'Legend', Component: LegendEditor },
    { name: 'Popup',  Component: PopoverEditor },
    { name: 'Filter', Component: FilterEditor },
  ];
  ```
  rendered via `<Tabs tabs={LAYER_EDITOR_TABS} activeStyle="panel" />` (line 71). Adding a tab is a one-line array addition + a new component.

- Per-layer behaviors are stored as kebab-case keys on `state.symbology.layers[layerId]`. Confirmed existing and functional:
  - `'click-filter'` — `{ enabled, mappings: [{ variable, field, useSearchParams }] }`, normalized by `normalizeLayerClickFilterConfig()` in `stateUtils.jsx`, edited by `LayerEditor/ClickFilterControl/index.jsx`.
  - `'hover'` (`'' | 'hover'`) and `'hover-columns'` (`[{ column_name, display_name }]`) — `LayerEditor/PopoverEditor/index.jsx`.
  - `'dynamic-filters'` — `[{ column_name, values, zoomToFilterBounds? }]` — read/applied in the runtime `SymbologyViewLayer.jsx`.

- **Config persistence**: edits go through `useImmer` state in `MapEditor/index.jsx`, auto-synced to `localStorage`, and saved to the DB as part of the `symbology` JSON blob (type `json` in `mapeditor.format.js`). A new key on the layer object persists automatically with no format change.

- **Column metadata fetch pattern** (the canonical inline pattern, from `ClickFilterControl/index.jsx:22-57`):
  ```js
  const mapEditorContext = useContext(MapEditorContext) || {};
  const { pgEnv, useFalcor } = mapEditorContext;
  const falcorApi = typeof useFalcor === "function" ? useFalcor() : mapEditorContext;
  const falcor = falcorApi?.falcor;
  const falcorCache = falcorApi?.falcorCache || falcor?.getCache?.() || {};

  useEffect(() => {
    if (sourceId && falcor && pgEnv) {
      falcor.get(["uda", pgEnv, "sources", "byId", sourceId, "metadata"]);
    }
  }, [falcor, pgEnv, sourceId]);

  const sourceColumns = get(falcorCache,
    ["uda", pgEnv, "sources", "byId", sourceId, "metadata", "value", "columns"], []);
  ```
  Each column carries at least `{ name, display_name, type }`.

### How the runtime map handles clicks today

- The page-pattern runtime layer component `patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx` owns per-layer click/hover behavior (click handler ~lines 928-991). It calls `maplibreMap.queryRenderedFeatures(...)`, then resolves feature props via `resolveFeatureProperties()` (~lines 612-661).
- **Key fact (de-risks the "is the key column in the tile?" concern):** `resolveFeatureProperties()` already falls back to a Falcor fetch `["uda", pgEnv, "viewsById", view_id, "dataById", String(feature.id), missingFields]` when a requested field is missing from the tile properties. Tiles always carry `ogc_fid` as `feature.id` (`dms-server/src/dama/tiles/tiles.rest.js`). So the configured `featureKeyColumn` is reliably resolvable on click even if it is not baked into the tile. (Performance note below.)
- Popups / pinned popups render via `ui/components/map/avl-map.jsx` (`HoverComp`, ~lines 1277-1426). The popup receives `[featureId, layerId, feature.properties]` and formats via `getAttributes`. The linked-data popup will render through this same pinned-popup surface.

### How dataWrapper builds UDA queries today (reference only — do not import)

`getData.js` issues a UDA request shaped like:
```js
falcor.get([
  "uda", pgEnv, "viewsById", viewId, "options",
  JSON.stringify(options),         // see options shape below
  "dataByIndex", { from, to },
  attributes,                      // array of SELECT expressions, e.g. ["h_geocode", "sum(S000)::numeric as total_workers"]
]);
```
The `options` object supports `filter` (`{ col: [values] }` → `WHERE col = ANY(...)`), `groupBy` (array of column expressions), `orderBy`, `exclude`, `having`, comparison ops, etc. (server: `dms-server/src/routes/uda/query_sets/postgres.js`, `utils.js`).

**Verified gap (matters for the runtime builder):** the server's `handleOrderBy` (`routes/uda/utils.js:504`) does **not** order by an aggregate *alias*. Existing client code orders by **positional ordinal** instead — `orderBy: { "2": "desc" }` emits `ORDER BY "2" desc` (Postgres ordinal position of the 2nd SELECT column). Our runtime builder must therefore translate the semantic saved `orderBy: { column, direction }` into the **1-based ordinal of that column within the `attributes` array**, not pass the alias string. See Phase 4.

## Proposed Config Shape

Stored at `state.symbology.layers[layerId]['linked-data']`:

```js
'linked-data': {
  enabled: false,                 // master toggle for the linked-data feature on this layer

  // --- the simple join (base capability) ---
  featureKeyColumn: '',           // column on THIS layer's source; the value read from the clicked feature
  linked: {                       // the linked analytical view (a DIFFERENT view)
    sourceId: null,
    viewId: null,
    env: null,                    // pgEnv for the linked view; defaults to the layer's pgEnv when null
  },
  linkedJoinColumn: '',           // column on the linked view matched against featureKeyColumn's value

  resultMode: 'rows',             // 'rows' | 'aggregate'

  // rows mode
  returnColumns: [],              // e.g. ['h_geocode', 'S000']

  // aggregate mode
  groupBy: [],                    // e.g. ['h_geocode']
  metrics: [                      // e.g. [{ column: 'S000', operation: 'sum', alias: 'total_workers' }]
    // { column, operation: 'sum'|'count'|'avg'|'min'|'max', alias }
  ],

  // both modes
  orderBy: { column: '', direction: 'desc' },   // column = a returnColumn name or a metric alias
  limit: 20,                                     // clamped to LINKED_DATA_MAX_LIMIT (100) at runtime

  // --- optional click interaction (the additive option) ---
  clickInteraction: {
    enabled: false,               // when true AND `enabled` true: clicks fire the join
    trigger: 'click',             // V1: 'click' only (UI shows it disabled/locked; later 'hover')
    displayMode: 'popup',         // V1: 'popup' only (later 'side-panel')
  },
}
```

Design notes:
- Top-level `enabled` gates the whole feature; the join fields define **what**; `clickInteraction` gates **whether/how it fires**. A join with `clickInteraction.enabled === false` is configured but inert in V1 — that is the intended "define the join, optionally add the click" separation.
- Keys: top-level layer key is kebab-case (`'linked-data'`) to match siblings; nested fields are camelCase to match existing nested config (`click-filter` uses `mappings`/`variable`/`field`).
- This is the data contract shared between the editor (writer) and runtime (reader). It is **data**, not code — sharing the shape across patterns is fine; sharing code is not.

## Runtime result contract (normalized before render)

The runtime builder/executor returns a normalized object so the popup never sees raw Falcor shapes:

```js
{
  featureKeyColumn: 'block_geoid',
  featureKeyValue: '360610001001',
  linkedViewId: 1234,
  resultMode: 'aggregate',
  rows: [ { h_geocode: '360610002001', total_workers: 412 }, ... ],
  totalReturned: 20,
  truncated: true,                 // true if rows hit the clamped limit
  status: 'success',               // 'loading' | 'success' | 'empty' | 'error'
  error: null,                     // string when status === 'error'
}
```

## Architecture / file map

### A. MapEditor (admin) — `patterns/mapeditor/`

1. **`MapEditor/components/LayerEditor/index.jsx`** *(modify)* — add `{ name: 'Linked Data', Component: LinkedDataControl }` to `LAYER_EDITOR_TABS` and import it.

2. **`MapEditor/components/LayerEditor/LinkedDataControl/index.jsx`** *(create)* — the tab component `LinkedDataControl` (named export default `function LinkedDataControl`). Owns: enable toggle, join setup, result shape, and the click-interaction sub-section. Reads/writes `state.symbology.layers[layerId]['linked-data']` via the SymbologyContext `setState` + the normalizer, mirroring `ClickFilterControl`'s `setClickFilterConfig` pattern. `.jsx`, components only.

3. **`MapEditor/components/LayerEditor/LinkedDataControl/JoinSetup.jsx`** *(create)* — feature-key-column picker (from this layer's source metadata), linked source/view picker, linked-join-column picker (from the linked view's source metadata). Components only.

4. **`MapEditor/components/LayerEditor/LinkedDataControl/ResultShape.jsx`** *(create)* — result mode toggle, return-columns multi-select (rows mode), groupBy + metrics editor (aggregate mode), orderBy (column dropdown sourced from returnColumns/metric aliases + direction), limit input. Components only.

5. **`MapEditor/components/LayerEditor/LinkedDataControl/ClickInteractionSection.jsx`** *(create)* — the additive click-interaction sub-section: enable toggle, trigger (locked to `click` in V1), displayMode (locked to `popup` in V1). Components only.

6. **`MapEditor/stateUtils.jsx`** *(modify)* — add `normalizeLayerLinkedDataConfig(raw)` next to `normalizeLayerClickFilterConfig`. Pure function returning the full config shape with defaults filled in (so the editor never reads undefined nested fields).

7. **`MapEditor/components/LayerEditor/LinkedDataControl/constants.js`** *(create)* — `LINKED_DATA_RESULT_MODES`, `LINKED_DATA_METRIC_OPERATIONS`, `LINKED_DATA_MAX_LIMIT = 100`, `LINKED_DATA_DEFAULT_LIMIT = 20`. `.js` (no JSX) per Fast-Refresh rules.

### B. Runtime (page pattern map) — `patterns/page/.../ComponentRegistry/map/`

8. **`map/linkedDataQuery.js`** *(create)* — pure builder (re-implemented locally, NOT imported from dataWrapper). Exports:
   - `clampLinkedDataLimit(limit)` → number in `[1, 100]`.
   - `buildLinkedDataRequest(config, featureKeyValue)` → `{ viewId, env, options, attributes, fromTo }` ready to splice into a `falcor.get(["uda", env, "viewsById", viewId, "options", JSON.stringify(options), "dataByIndex", fromTo, attributes])`. Encodes the orderBy→positional-ordinal translation and aggregate metric expressions (`sum(S000)::numeric as total_workers`).
   - `normalizeLinkedDataRows(config, attributes, rawRows)` → the `rows` array of the result contract.
   `.js`, no JSX.

9. **`map/SymbologyViewLayer.jsx`** *(modify)* — in the existing click handler, after resolving feature properties, if the active layer has `'linked-data'` with `enabled && clickInteraction.enabled && trigger === 'click'`:
   - read `featureKeyColumn` from resolved feature properties (using the existing `resolveFeatureProperties` fallback for missing fields),
   - build the request via `buildLinkedDataRequest`, set popup status `loading`, run the inline `falcor.get([...])`, normalize, and set the pinned-popup payload to a linked-data result.

10. **`map/avl-map.jsx`** *(modify, minimal)* — branch the pinned-popup renderer to render a linked-data result (title = layer name, feature key value, linked view label, a small table of `rows`, plus loading/empty/error states) when the popup payload is a linked-data result. Reuse existing popup chrome; do not build a new popup system.

## Files Requiring Changes

| File | Change |
|------|--------|
| `patterns/mapeditor/MapEditor/components/LayerEditor/index.jsx` | Add `Linked Data` tab entry + import |
| `patterns/mapeditor/MapEditor/components/LayerEditor/LinkedDataControl/index.jsx` | **New** — tab component |
| `patterns/mapeditor/MapEditor/components/LayerEditor/LinkedDataControl/JoinSetup.jsx` | **New** — join pickers |
| `patterns/mapeditor/MapEditor/components/LayerEditor/LinkedDataControl/ResultShape.jsx` | **New** — result shaping |
| `patterns/mapeditor/MapEditor/components/LayerEditor/LinkedDataControl/ClickInteractionSection.jsx` | **New** — optional click add-on |
| `patterns/mapeditor/MapEditor/components/LayerEditor/LinkedDataControl/constants.js` | **New** — enums + caps |
| `patterns/mapeditor/MapEditor/stateUtils.jsx` | Add `normalizeLayerLinkedDataConfig` |
| `patterns/page/components/sections/components/ComponentRegistry/map/linkedDataQuery.js` | **New** — pure runtime builder (re-implemented) |
| `patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx` | Wire click → linked query → popup |
| `patterns/page/components/sections/components/ComponentRegistry/map/avl-map.jsx` | Linked-data popup render branch |
| `patterns/page/.../ComponentRegistry/map/settings/README.md` | Document `'linked-data'` config shape (follow-up) |

## Conventions to follow (from `packages/dms/CLAUDE.md`)

- **Fast Refresh**: component files are `.jsx` and export only components (named). Normalizers, constants, and the query builder are `.js`.
- **No convenience wrappers**: inline `falcor.get([...])` and the `MapEditorContext` falcor read at each call site, like `ClickFilterControl` — do **not** factor a `useColumnMetadata` hook.
- **Match sibling control style**: the LayerEditor controls (`ClickFilterControl`, `PopoverEditor`) use inline Tailwind + `StyledControl` from `ControlWrappers` and pull `UI` from `ThemeContext`. New controls follow the same local style (do not introduce a new theming scheme just for this tab).
- **Navigation/data rules**: stay within the mapeditor's established direct-falcor-via-`MapEditorContext` pattern; this is the runtime norm for the map patterns.

## Implementation Plan (phased)

> Mark items `[x]` and add status to phase headers AS YOU GO (planning-rules.md §Workflow). The task file is the source of truth between sessions.

### Phase 1 — Config foundation (mapeditor) — NOT STARTED

- [ ] Create `LinkedDataControl/constants.js` with `LINKED_DATA_RESULT_MODES = ['rows','aggregate']`, `LINKED_DATA_METRIC_OPERATIONS = ['sum','count','avg','min','max']`, `LINKED_DATA_DEFAULT_LIMIT = 20`, `LINKED_DATA_MAX_LIMIT = 100`.
- [ ] Add `normalizeLayerLinkedDataConfig(raw)` to `stateUtils.jsx` returning the full config shape (Proposed Config Shape) with every nested field defaulted. Model the signature/return discipline on `normalizeLayerClickFilterConfig`.
- [ ] Verify: in the browser, no console errors when a layer has no `'linked-data'` key (normalizer must tolerate `undefined`/`{}`).

### Phase 2 — "Linked Data" tab: the simple join (mapeditor) — NOT STARTED

- [ ] Add the tab to `LAYER_EDITOR_TABS` in `LayerEditor/index.jsx` and import `LinkedDataControl`.
- [ ] Build `LinkedDataControl/index.jsx`: SymbologyContext `state`/`setState`, `MapEditorContext` falcor, `activeLayerId`, `linkedDataPath = \`symbology.layers[${activeLayerId}]['linked-data']\``. Implement `setLinkedDataConfig(updater)` mirroring `ClickFilterControl.setClickFilterConfig` (read → normalize → updater → `set`). Render the master enable toggle, then `<JoinSetup/>`, `<ResultShape/>`, `<ClickInteractionSection/>` when enabled.
- [ ] Build `JoinSetup.jsx`:
  - Feature key column: inline-fetch this layer's source metadata (`["uda", pgEnv, "sources", "byId", sourceId, "metadata"]`), populate a `<select>` (filter out `wkb_geometry`), bind `featureKeyColumn`.
  - Linked source/view picker: reuse the editor's existing source/view selection affordance for choosing a *different* view; persist `linked.sourceId` / `linked.viewId` / `linked.env`.
  - Linked join column: inline-fetch the **linked** source's metadata using `linked.sourceId` (a second `falcor.get` keyed on the linked source id), populate a `<select>`, bind `linkedJoinColumn`.
- [ ] Build `ResultShape.jsx`:
  - Mode toggle (`rows`/`aggregate`).
  - Rows mode: multi-select `returnColumns` from the linked view's columns.
  - Aggregate mode: `groupBy` multi-select + a `metrics` list editor (`{ column, operation, alias }`, add/remove rows).
  - `orderBy`: a column dropdown whose options are the rows-mode `returnColumns` or the aggregate metric aliases + groupBy columns, plus a direction toggle. `limit` number input (default 20; show the 100 cap).
- [ ] Verify: editing the join in the tab persists into `state` and survives a layer switch + reload (localStorage roundtrip). Inspect the saved `symbology` JSON to confirm the `'linked-data'` key shape.

### Phase 3 — Optional click interaction add-on (mapeditor) — NOT STARTED

- [ ] Build `ClickInteractionSection.jsx`: an `Add click interaction` enable toggle (`clickInteraction.enabled`), a `Trigger` control locked to `Click` (disabled, with a "hover coming later" hint), and a `Display` control locked to `Popup`. Render it visually as an addition layered under the join config (e.g. a divider + secondary heading) to reinforce that it is optional.
- [ ] Only allow enabling the click interaction when the join is sufficiently configured (`featureKeyColumn`, `linked.viewId`, `linkedJoinColumn` set); otherwise show a hint and keep the toggle disabled.
- [ ] Verify: toggling the click interaction on/off persists; turning it off leaves the join config intact.

### Phase 4 — Runtime query builder (page pattern, pure, re-implemented) — NOT STARTED

- [ ] Create `map/linkedDataQuery.js` (re-implemented locally; do **not** import dataWrapper):
  - `clampLinkedDataLimit(limit)` → `Math.min(Math.max(1, +limit || 20), 100)`.
  - `buildLinkedDataRequest(config, featureKeyValue)`:
    - `attributes`: rows mode → `config.returnColumns`; aggregate mode → `[...config.groupBy, ...config.metrics.map(m => \`${m.operation}(${m.column})::numeric as ${m.alias}\`)]`. (Use `count(1)::int as ${alias}` form for `count`.)
    - `options.filter = { [config.linkedJoinColumn]: [featureKeyValue] }`.
    - aggregate mode → `options.groupBy = config.groupBy`.
    - **orderBy translation**: find the 1-based ordinal of `config.orderBy.column` within `attributes` (match on the column name for rows, or the metric `alias`/groupBy name for aggregate); emit `options.orderBy = { [String(ordinal)]: config.orderBy.direction }`. If not found, omit orderBy.
    - `fromTo = { from: 0, to: clampLinkedDataLimit(config.limit) - 1 }`.
    - return `{ viewId: config.linked.viewId, env: config.linked.env || layerPgEnv, options, attributes, fromTo }`.
  - `normalizeLinkedDataRows(config, attributes, rawRows)` → map each raw row to `{ [name]: value }` keyed by the attribute output name (alias for metrics).
- [ ] Add a lightweight assertion check (matching how the package tests run — `node` script, no new framework) covering: aggregate attributes string, filter shape, and the orderBy ordinal translation (e.g. `orderBy.column = 'total_workers'` with metrics ordered after groupBy resolves to the correct ordinal). Document the command in the Testing Checklist.

### Phase 5 — Runtime click execution + popup (page pattern) — NOT STARTED

- [ ] In `SymbologyViewLayer.jsx` click handler: detect `layerProps['linked-data']` with `enabled && clickInteraction.enabled && trigger === 'click'`. Read `featureKeyColumn` via the existing `resolveFeatureProperties` (which falls back to `dataById` if the column isn't in the tile). Guard: if no key value, set popup `status: 'error'` with a friendly "missing key value" message.
- [ ] Build the request with `buildLinkedDataRequest`, set the pinned-popup payload to `{ status: 'loading', ... }`, run the inline `falcor.get(["uda", env, "viewsById", viewId, "options", JSON.stringify(options), "dataByIndex", fromTo, attributes])`, read rows from the falcor cache, `normalizeLinkedDataRows`, and set the popup payload to the success/empty result contract (`truncated = rows.length >= clampedLimit`).
- [ ] In `avl-map.jsx`, branch the pinned-popup renderer for a linked-data payload: header (layer name + feature key value + linked view label if available), a small table of `rows`, and explicit `loading` / `empty` ("No results") / `error` states.
- [ ] Verify end-to-end against ≥2 source/view combinations that share a key (e.g. an OD inflow aggregate and a WAC rows lookup keyed on `block_geoid`).

### Phase 6 — Docs + cleanup — NOT STARTED

- [ ] Document the `'linked-data'` config shape in `map/settings/README.md`.
- [ ] Update this task file (phase statuses, design-note deviations), then on completion move to `tasks/completed/`, flip the `todo.md` entry to `[x]`, and add a dated `completed.md` entry.
- [ ] Skill candidate check (planning-rules.md §"When to extract a skill"): if the OD inflow/outflow + WAC/RAC join recipe proves reusable for authors, write `skills/map-linked-data-join.md` with a "do this to get that" recipe and cross-link.

## Testing Checklist

Manual (patterns layer has no unit-test framework; `packages/dms` `npm test` runs `node test.js`):

**Editor**
- [ ] `Linked Data` tab appears in LayerEditor and renders without errors for a layer with no prior config.
- [ ] Feature-key-column dropdown is populated from the layer's own source metadata.
- [ ] Linked view picker selects a *different* view; the linked-join-column dropdown populates from that view's metadata.
- [ ] Rows mode: return columns multi-select works; orderBy options reflect chosen return columns.
- [ ] Aggregate mode: groupBy + metrics editor works; orderBy options reflect metric aliases + groupBy.
- [ ] Limit input enforces the 100 cap in the UI.
- [ ] Click-interaction sub-section only enables when the join is complete; toggling it does not clear join config.
- [ ] Config survives layer switch + page reload (localStorage) and appears in the saved `symbology` JSON.

**Runtime query builder** (Phase 4)
- [ ] Run the `linkedDataQuery.js` assertion script: `node <path-to-script>` exits 0 with all checks passing (aggregate attribute strings, filter shape, orderBy ordinal translation).

**Runtime end-to-end**
- [ ] Clicking a feature with the click interaction enabled shows a loading state, then results, in a pinned popup.
- [ ] OD inflow aggregate (groupBy `h_geocode`, `sum(S000) as total_workers`, order by `total_workers` desc, limit 20) returns sensible ordered rows.
- [ ] A rows-mode lookup (e.g. WAC by `block_geoid`) returns the explicit columns.
- [ ] Empty result renders "No results"; a feature missing the key renders a friendly error.
- [ ] `featureKeyColumn` resolves correctly even when NOT baked into the tile (relies on the `dataById` fallback) — verify on a layer whose tiles only carry `ogc_fid`.

## Risks & Notes

- **orderBy by alias is not supported server-side** — must translate to a positional ordinal in `buildLinkedDataRequest` (see Phase 4). This is the one genuine query-shape wrinkle; everything else the UDA layer already supports.
- **Double round-trip on click** — when the key column isn't in the tile, click triggers a `dataById` fetch (resolve key) then the linked query. Acceptable for click-only V1. For a future hover trigger, add the key column to the tile via the existing `cols` param on the tile route (an `interaction-columns` config appended in `getLayerTileUrl`); out of scope here.
- **Linked-view metadata fetch is net-new UI** — existing controls only fetch the layer's own source; this adds a second-source metadata fetch. Budget it as new work, not pure reuse.
- **Position relative to existing `click-filter`** — `'click-filter'` publishes clicked attributes into page filter variables; `'linked-data'` runs a query and shows results. They are distinct behaviors that both read clicked-feature properties. Wire the linked-data branch *inside* the existing click handler (alongside the click-filter/`click_publish` branches), not as a parallel `queryRenderedFeatures` path.

## Related tasks

- [`datawrapper-join-support.md`](./datawrapper-join-support.md) — the page-pattern dataWrapper join (server-side SQL JOIN via WITH-clause). Different mechanism (combine sources into one result set) but shares vocabulary; reference for join-config UX, do not share code.
- [`map-component-unification.md`](./map-component-unification.md) — unify `map/` and `map_dama/`. Land linked-data in `map/` (the DataWrapper-bound runtime) and re-evaluate after unification.
- [`expand-client-column-types.md`](./expand-client-column-types.md) — column-type formatting that the popup could later use to format result cells (currently popup shows raw values).
