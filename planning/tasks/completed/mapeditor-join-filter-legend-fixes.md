# Map Editor & runtime map — join / filter / legend fixes

**Status:** Implemented (2026-07-03) — pending in-app verification
**Area:** patterns/mapeditor + patterns/page runtime map (`ComponentRegistry/map`) + dms-server (UDA/tiles)
**Backend change required:** none new beyond the UDA/tile server files listed per step
**`map_dama` intentionally left untouched throughout.**

A single body of work fixing correctness + performance of joined-choropleth map
layers (filter value search, joined-column filtering, filter collisions, join
query performance, and legend colors). Implemented as the steps below; each is
independently verifiable.

## Files touched
- `packages/dms-server/src/routes/uda/uda.colorDomain.controller.js`
- `packages/dms-server/src/routes/uda/utils.js`
- `packages/dms-server/src/routes/uda/query_sets/postgres.js`
- `packages/dms-server/src/dama/tiles/tiles.rest.js`
- `packages/dms/src/patterns/mapeditor/MapEditor/index.jsx`
- `packages/dms/src/patterns/mapeditor/MapEditor/stateUtils.jsx`
- `packages/dms/src/patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx`
- `packages/dms/src/patterns/mapeditor/MapEditor/components/LayerEditor/FilterEditor/FilterControls.jsx`
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx`
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx`

---

## Step 1 — Debounced server-side search in the filter value list
`FilterControls.jsx`

**Problem:** the layer-filter value picker (`EqualityFilterValueList`) fetched an
arbitrary 500-row local batch (no `ORDER BY`) and the "Search:" box only filtered
that batch client-side, so distinct values past the first 500 were unfindable.

**Fix:** `FilterBuilder` debounces the search box 600ms into a separate value that
drives the query. `EqualityFilterValueList` keeps the base `LIMIT 500`, adds
`orderBy:{[col]:'asc'}` (deterministic slice), adds `like:{[col]:'%search%'}` only
when searching (matches across the whole column), shows an `fa-spinner` loading
row, and drops the client-side `includes` filter (effect + memo now depend on
`options`). No backend change — reuses existing `like`/`orderBy` UDA options
(precedent: `ConditionValueInput.jsx`). Still capped at 500 *matches*.

## Step 2 — colorDomain legend correct when filtering on a JOINED column
`uda.colorDomain.controller.js`, `utils.js`, and client `buildJoinOptions`
(`map/index.jsx` + `MapEditor/index.jsx`)

**Problem:** the legend query only attached the join when the *colored* column was
joined. Filtering by a joined-only column (e.g. `w_geocode`) → `column
"w_geocode" does not exist` → legend silently blank.

**Fix — server:** `buildColorDomainTarget` attaches the join when ANY referenced
column is joined — colored column + every `filter`/`exclude`/`gt`/`gte`/`lt`/`lte`/
`like` key + `filterGroups` columns (new exported `getColumnsFromGroup`) — and
widens the joined SELECT to project filter-referenced joined attributes.
**Fix — client:** `buildJoinOptions` (both copies) includes joined static/dynamic
filter columns in `join.attributes`, resolving GROUP-BY-only names (e.g.
`w_geocode`) to the bare column, and excludes base-table filter columns.

## Step 3 — Static + Dynamic filter on the same column (impossible-AND → zero rows)
`stateUtils.jsx`, `FilterControls.jsx`, editor + runtime `SymbologyViewLayer.jsx`

**Problem:** a column filtered by both the static Filter tab and a Dynamic Filter
got both clauses ANDed (`col == X AND col == dynamic`) → matches nothing → blank
map/legend, no error (the `__none__` case).

**Fix:** static filter wins; the dynamic contribution for that column is dropped —
in `buildLayerUdaFilterOptions` (legend/colorDomain), the Add-Filter dropdown
(hides dynamic-filter columns), and the MapLibre `setFilter` build in editor +
runtime `SymbologyViewLayer` (`staticFilterColumnNames` guard). Self-heals layers
saved in the stuck state.

## Step 4 — Runtime `buildJoinOptions` includes filter-only joined columns
`map/index.jsx` (+ `MapEditor/index.jsx`)

Filter/dynamic-filter columns are included in `join.attributes` even when they
aren't tile columns (was largely present from prior work; verified consistent with
Step 2). Prevents `column does not exist` for filter-only joined columns.

## Step 5 — Join query performance (push-down, drop `geo.*`, remove static cap)
`uda.colorDomain.controller.js`, `query_sets/postgres.js`, `tiles.rest.js`,
`buildJoinParam` in runtime + editor `SymbologyViewLayer.jsx`

**Problem:** filtering a joined choropleth ran the join CTE over the ENTIRE source
(millions of `(home × workplace)` grouped rows, ~22,000ms, 646MB disk spill) —
the filter was applied only in the outer query, a hardcoded `1_000_000` CTE cap
could truncate filtered rows, and colorDomain pulled `geo.*` (geometry blob).

**Fix:**
- **5a** push the joined-column filter INTO the colorDomain CTE (flat keys +
  `filterGroups` leaves via `collectJoinFilterLeaves`) → ~22s → ~44ms.
- **5b** replace `SELECT geo.*` with a narrow `geoSelect` (join key + referenced
  base cols only) — no geometry pulled through.
- **5c** `buildSimpleFilterSql(…, indices = null)` emits `LIMIT/OFFSET` only when
  `indices` is passed; colorDomain + tiles drop the 1M cap (push-down bounds it).
  `simpleFilter`/`simpleFilterLength` still pass `indices` → mandatory pagination,
  so the client-facing "no full dump over the API" rule stays enforced.
- **Tile side** `buildJoinParam` (runtime + editor) folds the active
  static/dynamic joined-column filter into the tile `join.options`
  (`collectActiveJoinFilterGroups`, static wins per Step 3) → a selected workplace
  makes the tile CTE 1:1 → no LEFT JOIN fan-out → `ST_AsMVTGeom` once per block →
  fast + matches legend.

**Rationale for removing the cap:** it gated an internal building block
(colorDomain returns aggregates, tiles return MVT bytes — neither returns raw
join rows); the real limit lives on the paginated `simpleFilter`, untouched. The
spreadsheet/dataWrapper join proves the model — its join is inside the paginated
query and bounded by the same `LIMIT/OFFSET`; the map CTE aggregates whole, so
push-down (not an arbitrary cap) is the correct bound.

## Step 6 — Legend colors when `color-range` is absent
`map/index.jsx`

**Problem:** the runtime legend refresh read the ramp only from
`layer['color-range']`, which isn't always persisted (only written when the author
touches the Fill control; joined-column choropleths commonly skip it). When absent
it built a colorless legend that overwrote the good saved `legend-data` (ranges
showed, colors vanished, though map polygons stayed colored).

**Fix:** `extractStepColors(paint)` recovers the ramp from the saved mapbox `step`
expression (handles the `case` null-guard wrapper); `getSavedRampPaint(layer)`
resolves the right sub-layer by type (fill/line → `layers[1]`, circle →
`layers[0].circle-color`); legend uses `color-range` if present else the recovered
ramp. Verified against editor code (`LayerManager/utils.jsx`, `datamaps/index.js`):
fill is always `layers[1]` (outline `[0]`, `_case` is an id suffix), paint is
always `step` for choropleth AND circles.

---

## Residuals / follow-ups
- **Tile no-selection case:** when NO workplace is selected there's no filter to
  push, so tiles still aggregate all `(home × workplace)` pairs (slow at low
  zoom). Needs option (b): collapse the tile `groupBy` to the join key + drop the
  non-key column from `attributes`/`tileCols`. Deferred pending confirmation users
  hit the map before selecting.
- **Save-side `color-range`:** Step 6 is a runtime safety net; the durable fix is
  persisting `color-range` for joined-column choropleths (editor) + a one-time
  backfill for old symbologies. Also: interactive-nested paint not covered.
- **Optional covering index** `(w_geocode, job_type, file_type, h_geocode)
  INCLUDE (s_000)` would trim the pushed-down query further (~44ms → ~15ms); not
  load-bearing.

## Testing checklist
- [ ] Filter value search finds values beyond the first 500 (Step 1).
- [ ] Filter a joined choropleth by a joined column → legend renders, no `column does not exist` (Step 2/4).
- [ ] Static + dynamic filter on the same column → map/legend not blank (Step 3).
- [ ] colorDomain query filters INSIDE the CTE, ~tens of ms, matches raw SQL (Step 5).
- [ ] Selected workplace → tiles render fast and match legend (Step 5 tile).
- [ ] `buildSimpleFilterSql` no `indices` → no `LIMIT`; with `indices` → `LIMIT/OFFSET` (Step 5c).
- [ ] Layer without `color-range` → colored legend matching the map; circle layer too (Step 6).
- [ ] colorDomain unit tests 12/12.
- [ ] `map_dama` pages unaffected.
