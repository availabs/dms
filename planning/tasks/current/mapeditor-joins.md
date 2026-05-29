# MapEditor Joins (tile-level linked-data join via a dataWrapper-style query)

## Objective

Let a MapEditor author **join a second analytical view into a rendered geometry layer by key, so the joined columns become vector-tile feature properties** — at which point the *existing* MapLibre styling (choropleth / categories / graduated circles) and hover/click popups work on the joined columns with no further changes.

The linked side of the join is configured as a **dataWrapper-style query** (filters + groupBy + aggregate metrics + selected columns). That query's output must be **≤ 1 row per join key (1:1)** — for a table whose raw rows are *many* per key (e.g. LODES OD: many rows per `w_geocode`), the author achieves 1:1 by grouping/aggregating (e.g. `GROUP BY w_geocode, sum(S000) AS total_workers`). The query is wrapped in a `WITH` CTE and the geometry `LEFT JOIN`s against it, **server-side at tile-request time in `tiles.rest.js`**, reusing the UDA SQL builder.

This is why the editor UI is **informed by how the page pattern's dataWrapper works** (per the original directive): the linked-query controls mirror dataWrapper's source/column/groupBy/aggregate/filter model — **re-implemented in the mapeditor pattern, not shared.**

**V1 priority: make it work when the author configures it correctly.** A naive build lets the author misconfigure (not grouping by the key → row fan-out, colliding column names, etc.). Per the product owner, V1 does **not** need to prevent those — only to produce correct tiles when the query is configured correctly. Guardrails are a later concern.

Source design doc: [`references/map-joins.md`](../../../../../references/map-joins.md) (product rationale; this task supersedes its click-popup framing — see "Why not the popup approach").

## Decisions (confirmed with product owner)

1. **Execution: request-time join in `tiles.rest.js`.** Not materialized — materializing under the 1:1 model is tricky (clone the large geometry per join, police the 1:1 invariant, manage staleness). For an inlined CTE with an index on the join key, request-time cost is acceptable.
2. **Linked side = a dataWrapper-style query (filter + groupBy + aggregate) whose output is 1:1 per join key.** Aggregation/groupBy is therefore *in* V1 — it is the mechanism for collapsing a many-per-key table to 1:1, not a separate deferred feature.
3. **Reuse the UDA SQL builder as a CTE.** Extract the SQL-build from `simpleFilter` and embed it as `WITH linked AS (…)`. The CTE is whatever UDA emits (incl. groupBy/aggregate), so the join "just works" for both flat and aggregated linked queries.
5. **Clean separation of concerns — the tile API is agnostic to aggregation.** Making the linked side 1:1 is done *entirely* in the UDA/dataWrapper config (groupBy + aggregate produce one row per key). `tiles.rest.js` never knows or cares whether aggregation happened — it always assumes the CTE is a 1:1 join input and just `LEFT JOIN`s on the key. The 1:many→1:1 collapse is the client/UDA config's job; the join is the tile's job.
4. **V1 optimizes for correct configuration, not foolproofing.** Minimal validation; the author owns the 1:1 contract.

## Why not the popup approach (context for the next session)

An earlier draft queried UDA at click-time and rendered a popup. Wrong for "map data join": MapLibre styling reads **tile properties** — `datamaps/index.js` builds choropleth as `['step', ['to-number', ['get', column]], …]`, categories as `['match', ['to-string', ['get', column_ref]], …]`, circles via `['get', baseDataColumn]`. `['get', col]` only sees columns physically in the MVT (hence `getLayerTileUrl` appends `?cols=`). `setFeatureState` is hover/select-only; `colorDomain` returns only scale breaks. So a side-query can never color the map — the joined value must be **in the tile**. The join belongs in the tile pipeline.

## Cross-pattern / cross-package policy (READ FIRST)

- **In `dms-server`, reuse the UDA SQL machinery** — the tile route and UDA query sets are one package; composing the UDA builder into the tile SQL is correct reuse.
- **Across client patterns, do NOT share code; re-implement locally.** The linked-query editor is **informed by** dataWrapper (`patterns/page/.../dataWrapper/`: `buildUdaConfig.js`, `getData.js`, `useColumnOptions.js`, filter tree) but **re-implemented** in `patterns/mapeditor/`. `getLayerTileUrl` exists in **three** copies (page `map/`, page `map_dama/`, mapeditor) — edit each in place (the `map-component-unification` task merges them later).
- Inline `falcor.get([...])` at each call site (like `ClickFilterControl`), per `packages/dms/CLAUDE.md`.

## Scope

### In scope (V1)
- New `Linked Data` tab in `LayerEditor` to configure: geometry-side key column; linked source/view (same pgEnv); a dataWrapper-style linked query (filters + groupBy + aggregate metrics + selected columns); the join key column; and which linked-query output columns to bake into the tile.
- Per-layer persisted config under layer key `'linked-data'`.
- Server: extract a reusable `buildSimpleFilterSql` from `query_sets/postgres.js`; extend `tiles.rest.js` to accept a `join` param and compose `WITH linked AS (<uda sql>) … LEFT JOIN` (with `$N` param renumbering).
- Client: all three `getLayerTileUrl` copies append the `join` param; linked-query output columns are merged into the column options the Style/Legend/Popup editors consume so the author can style/show a joined column.

### Out of scope (deferred)
- Materialized / precomputed joined views.
- 1:many "click → popup list of related rows" side query (display-only; revisit separately).
- ClickHouse-backed or cross-pgEnv linked views (PG-only inline join).
- **Misconfiguration guardrails** beyond the minimum (1:1-enforcement, fan-out detection, collision prevention) — explicitly deferred.
- Hover debounce, action-param publishing, flow/path rendering.

## Current State

### Tile route (single-source today)
`dms-server/src/dama/tiles/tiles.rest.js` — `getTileData` builds an MVT from ONE view's table:
```js
const sql = `
  WITH mvtgeom AS (
    SELECT ST_AsMVTGeom(ST_Transform(wkb_geometry,3857), ST_TileEnvelope($1,$2,$3)) AS geom
      ${colExpr}            // ', "col1", "col2"' from the `cols` query param
      , ogc_fid
    FROM ${table},
      (SELECT ST_SRID(wkb_geometry) AS srid FROM ${table} WHERE wkb_geometry IS NOT NULL LIMIT 1) a
    WHERE ST_Intersects(wkb_geometry, ST_Transform(ST_TileEnvelope($1,$2,$3), srid))
    ${filter ? ` AND ${filter}` : ''}
  )
  SELECT ST_AsMVT(mvtgeom.*, 'view_${+viewId}', 4096, 'geom', 'ogc_fid') AS mvt FROM mvtgeom`;
```
Route `GET /dama-admin/:pgEnv/tiles/:view_id/:z/:x/:y/t.pbf`, params `cols`, `filter`. PG+PostGIS only. `resolveTable(pgEnv, viewId)` resolves any view in the pgEnv → resolves the linked view too.

### UDA SQL builder (to be made reusable)
`dms-server/src/routes/uda/query_sets/postgres.js#simpleFilter` (lines 134-238) builds and then immediately executes:
```js
const sql = `
  SELECT ${sanitizedAttrs.map(c => quoteAlias(columnNameMap[c] || c)).join(', ')}
  FROM ${fromClause}
  ${combinedWhere} ${handleGroupBy(groupBy)} ${handleHaving(having)} ${handleOrderBy(orderBy, dmsAttributes)}
  LIMIT ${+num} OFFSET ${indices.from}`;
const res = await db.query(sql, values);   // ← build + execute welded together (line 220)
```
Already handles DMS `data->>` accessors, casts, filters/filterGroups, **groupBy + aggregate attributes**, `$N` params. `ctx` comes from `getEssentials(pgEnv, viewId)`. **Not yet exposed as a pure SQL string** — that's the refactor.

### dataWrapper query model (design reference for the linked-query UI — re-implement, don't import)
`patterns/page/.../dataWrapper/`: columns carry `{ name, display_name, type, group (→GROUP BY), fn ('sum'|'count'|'avg'|…), customName }`; `buildUdaConfig.js` turns column config + a filter tree into the UDA `options` object + the `attributes` SELECT list (aggregates as `sum(col)::numeric as alias`); `useColumnOptions.js` loads column metadata. The linked-query editor mirrors this shape.

### Styling reads tile properties (confirmed)
`datamaps/index.js` paint uses `['get', column]`. `getLayerTileUrl` (mapeditor `SymbologyViewLayer.jsx:307`, page `map/…:1175`, page `map_dama/…:373`) appends `?cols=` so styled columns are in the tile.

### Layer config + editor
Per-layer config = kebab-case keys on `state.symbology.layers[layerId]`, persisted in the `symbology` JSON blob (`mapeditor.format.js`, type `json`) → a new `'linked-data'` key needs no format change. Tabs: `LayerEditor/index.jsx:15` `LAYER_EDITOR_TABS` literal. Metadata fetch pattern (inline): `falcor.get(["uda", pgEnv, "sources", "byId", sourceId, "metadata"])` → `…metadata.value.columns`.

## Proposed Config Shape

`state.symbology.layers[layerId]['linked-data']`:
```js
'linked-data': {
  enabled: false,
  featureKeyColumn: '',              // geometry-side local key (column on THIS layer's source)
  linked: { sourceId: null, viewId: null, env: null },   // linked view (SAME pgEnv); env defaults to layer pgEnv
  linkedJoinColumn: '',              // the linked-query OUTPUT column to join on (typically a groupBy column)
  linkedQuery: {                     // dataWrapper-style; OUTPUT should be ≤1 row per linkedJoinColumn
    filters: {},                     // UDA filter / filterGroups (e.g. { year: [2021] })
    groupBy: [],                     // e.g. ['w_geocode'] — include the join key for 1:1
    columns: [],                     // SELECT/aggregate outputs, e.g. ['w_geocode', 'sum(S000)::numeric as total_workers']
  },
  tileColumns: [],                   // which linkedQuery output columns/aliases to bake into the tile
}
```
Top-level key kebab-case (matches siblings); nested camelCase (matches existing nested config). This is a **data contract** shared editor↔server↔runtime — share the shape, not code.

## Tile `join` request param
URL-encoded JSON appended to the tile URL:
```
…/t.pbf?cols=<geomCols>&join=<urlencoded JSON>
join = {
  "viewId": 1234,
  "localKey": "block_geoid",            // = featureKeyColumn (geometry side)
  "linkedKey": "w_geocode",             // = linkedJoinColumn (linked-query output)
  "options": { "filter": {...}, "groupBy": ["w_geocode"] },   // → buildSimpleFilterSql options
  "attributes": ["w_geocode", "sum(S000)::numeric as total_workers"],  // → SELECT list of the CTE
  "tileCols": ["total_workers"]         // which CTE outputs to emit as MVT properties
}
```
Tile cache key includes the query string, so distinct joins cache independently.

## Architecture / file map

### Server (`dms-server`)
1. **`src/routes/uda/query_sets/postgres.js`** *(modify)* — extract `buildSimpleFilterSql(ctx, options, attributes, indices) → { sql, values }`; `simpleFilter` becomes a thin caller. Export it. The existing UDA path must stay byte-identical (regression-covered by the UDA suite).
2. **`src/dama/tiles/tiles.rest.js`** *(modify)* —
   - Parse `join`.
   - `const linkedCtx = await getEssentials(pgEnv, join.viewId)` (same helper the UDA controller uses).
   - `const { sql: linkedSql, values: linkedValues } = buildSimpleFilterSql(linkedCtx, JSON.stringify(join.options || {}), join.attributes, { from: 0, to: <big cap> })` → the linked CTE body (carries the author's filters + groupBy + aggregate).
   - **Param renumbering**: tile SQL owns `$1,$2,$3` (z,x,y); shift each `$n` in `linkedSql` → `$(n+3)` (helper `shiftParams(sql, 3)`, regex `/\$(\d+)/g`), then `db.query(tileSql, [z, x, y, ...linkedValues])`.
   - Compose: alias geometry table `geo`, qualify geometry refs (`geo.wkb_geometry`, `geo.ogc_fid`, `geo."<geomCol>"`), `LEFT JOIN linked ON geo."<localKey>" = linked."<linkedKey>"`, add `linked."<col>"` for each `join.tileCols` to the `ST_AsMVTGeom` select:
     ```sql
     WITH linked AS ( <shifted linkedSql> ),
     mvtgeom AS (
       SELECT ST_AsMVTGeom(ST_Transform(geo.wkb_geometry,3857), ST_TileEnvelope($1,$2,$3)) AS geom
         , geo.<cols>, linked.<tileCols>, geo.ogc_fid
       FROM ${geoTable} geo
       LEFT JOIN linked ON geo."${localKey}" = linked."${linkedKey}"
       , (SELECT ST_SRID(wkb_geometry) srid FROM ${geoTable} WHERE wkb_geometry IS NOT NULL LIMIT 1) a
       WHERE ST_Intersects(geo.wkb_geometry, ST_Transform(ST_TileEnvelope($1,$2,$3), srid))
     )
     SELECT ST_AsMVT(mvtgeom.*, 'view_${+viewId}', 4096, 'geom', 'ogc_fid') mvt FROM mvtgeom
     ```
   - Sanitize `localKey`/`linkedKey`/`tileCols` like existing `cols`. No-`join` path unchanged.

### Client runtime (three patterns — edit each locally)
3. **`patterns/page/.../map/SymbologyViewLayer.jsx`** `getLayerTileUrl` *(~:1175)* — append `&join=<encoded>` (built from the layer's `'linked-data'` config) when enabled.
4. **`patterns/page/.../map_dama/SymbologyViewLayer.jsx`** `getLayerTileUrl` *(~:373)* — same.
5. **`patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx`** `getLayerTileUrl` *(~:307)* — same (editor preview map).

### Editor UI (`patterns/mapeditor`)
6. **`LayerEditor/index.jsx`** *(modify)* — add `{ name: 'Linked Data', Component: LinkedDataControl }`.
7. **`LayerEditor/LinkedDataControl/index.jsx`** *(create)* — tab; enable toggle; composes the sub-editors; `setLinkedDataConfig(updater)` mirrors `ClickFilterControl.setClickFilterConfig`.
8. **`LayerEditor/LinkedDataControl/JoinSetup.jsx`** *(create)* — geometry-side `featureKeyColumn` picker (this layer's source metadata), linked source/view picker (same pgEnv), and the `linkedJoinColumn` picker (from the linked query's output columns).
9. **`LayerEditor/LinkedDataControl/LinkedQueryBuilder.jsx`** *(create)* — the dataWrapper-informed linked-query editor (re-implemented): pick linked-view columns, mark groupBy, choose aggregate `fn` per column (sum/count/avg/min/max → emits `fn(col)::… as alias`), add filters. Produces `linkedQuery.{ filters, groupBy, columns }`. Then a `tileColumns` selector for which outputs to bake into the tile.
10. **`LayerEditor/LinkedDataControl/constants.js`** *(create)* — aggregate ops, linked-CTE row cap. `.js`.
11. **`MapEditor/stateUtils.jsx`** *(modify)* — `normalizeLayerLinkedDataConfig(raw)` (full shape, defaults), beside `normalizeLayerClickFilterConfig`.
12. **`LayerEditor/Controls.jsx` (+ `datamaps`)** *(modify — integration point to locate)* — merge `tileColumns` (the joined outputs) into the column options the Style/Legend/Popup editors consume, so a joined column can be the choropleth `data-column` / a hover column.

## Files Requiring Changes

| File | Change |
|------|--------|
| `dms-server/src/routes/uda/query_sets/postgres.js` | Extract + export `buildSimpleFilterSql`; `simpleFilter` calls it |
| `dms-server/src/dama/tiles/tiles.rest.js` | `join` param → linked CTE via UDA builder + param renumbering + LEFT JOIN |
| `patterns/page/.../map/SymbologyViewLayer.jsx` | `getLayerTileUrl` appends `join` |
| `patterns/page/.../map_dama/SymbologyViewLayer.jsx` | same, local copy |
| `patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx` | same, local copy (preview) |
| `patterns/mapeditor/MapEditor/components/LayerEditor/index.jsx` | add `Linked Data` tab |
| `…/LayerEditor/LinkedDataControl/index.jsx` | **New** — tab component |
| `…/LayerEditor/LinkedDataControl/JoinSetup.jsx` | **New** — keys + source/view |
| `…/LayerEditor/LinkedDataControl/LinkedQueryBuilder.jsx` | **New** — dataWrapper-style linked query |
| `…/LayerEditor/LinkedDataControl/constants.js` | **New** |
| `patterns/mapeditor/MapEditor/stateUtils.jsx` | `normalizeLayerLinkedDataConfig` |
| `…/LayerEditor/Controls.jsx` (+ `datamaps`) | merge joined outputs into style/popup column options |
| `dms-server/src/dama/tiles/` (test) | tile-join integration/SQL test |
| `patterns/page/.../map/settings/README.md` | document `'linked-data'` config + `join` param (follow-up) |

## Conventions
- Fast Refresh: components `.jsx` (named, components only); normalizer/constants `.js`.
- Match sibling LayerEditor controls (`ClickFilterControl`/`PopoverEditor`): inline Tailwind + `StyledControl`, `UI` from `ThemeContext`, falcor via `MapEditorContext`.
- No convenience wrappers: inline `falcor.get([...])`.
- Tile SQL readable at the call site; `$N` params.

## Implementation Plan (phased)

> Mark items `[x]` + update phase headers AS YOU GO (planning-rules.md §Workflow).

### Phase 1 — Server: reusable SQL builder — NOT STARTED
- [ ] Extract `buildSimpleFilterSql(ctx, options, attributes, indices) → { sql, values }`; rewire `simpleFilter`; export it.
- [ ] UDA suite (`dms-server` `npm test` / `npm run test:graph`) green — extraction is behavior-preserving.

### Phase 2 — Server: tile join via CTE — NOT STARTED
- [ ] `join` param parse + `shiftParams`; resolve linked view via `getEssentials`; build linked CTE via `buildSimpleFilterSql`; compose `WITH linked … LEFT JOIN` tile SQL; renumber + concat params; sanitize keys/cols.
- [ ] Integration test against PG+PostGIS: tile with an **aggregated** linked query (groupBy + sum) returns an MVT whose features carry the aggregate as a property; feature count unchanged (the grouped CTE is 1:1 on the key). Document the command.

### Phase 3 — Client: tile URL wiring (3 copies) — NOT STARTED
- [ ] Each `getLayerTileUrl` appends `&join=<encoded>` from the layer's `'linked-data'` config when enabled.
- [ ] Verify the tile request carries `join` and the joined column is present in the returned tile (devtools / `queryRenderedFeatures`).

### Phase 4 — Editor: Linked Data tab + linked-query builder — NOT STARTED
- [ ] `constants.js` + `normalizeLayerLinkedDataConfig`.
- [ ] Add the tab; build `LinkedDataControl` + `JoinSetup` (geometry key column, linked source/view same-pgEnv, join key column).
- [ ] Build `LinkedQueryBuilder` (re-implemented dataWrapper-style): columns + groupBy + per-column aggregate `fn` + filters → `linkedQuery`; `tileColumns` selector.
- [ ] Verify config persists (layer switch + reload + saved `symbology` JSON) and produces a sensible `join` param.

### Phase 5 — Editor: style/popup on joined outputs — NOT STARTED
- [ ] Merge `tileColumns` into the Style/Legend/Popup column options (tagged as joined).
- [ ] **End-to-end proof:** OD-style aggregate join (block geometry + OD grouped by `w_geocode`, `sum(S000) as total_workers`) → choose `total_workers` as the choropleth column → blocks color by inbound-worker totals.

### Phase 6 — Docs — NOT STARTED
- [ ] Document `'linked-data'` + the `join` tile param in `map/settings/README.md`. Note the **index on the linked join column** as the perf lever and that V1 assumes a correctly-configured 1:1 query.
- [ ] On completion: move to `tasks/completed/`, flip `todo.md`, add dated `completed.md` entry. Skill-candidate check (a "choropleth a geometry layer by an aggregated joined query" recipe likely warrants `skills/map-linked-data-join.md`).

## Testing Checklist

**Server**
- [ ] UDA suite green after `buildSimpleFilterSql` extraction.
- [ ] Aggregated-join tile: features carry the aggregate property; count == no-join tile (grouped CTE is 1:1 on key).
- [ ] `shiftParams` + param concat verified (linked filters bind correctly alongside z/x/y).
- [ ] No-`join` requests unchanged.

**Editor**
- [ ] Linked Data tab configures key + linked source/view (same pgEnv) + a groupBy/aggregate linked query + tileColumns.
- [ ] Config persists; joined outputs appear in Style/Legend/Popup pickers.

**End-to-end**
- [ ] OD aggregate join colors blocks by `total_workers` (the headline use case).
- [ ] A flat 1:1 join (per-block stat table keyed on `block_geoid`) colors by a joined column.
- [ ] Hover popup shows joined columns.

## Risks & Notes
- **1:1 is the author's responsibility in V1.** If the linked query isn't grouped to one row per join key, the `LEFT JOIN` fans out → duplicate features. V1 does not detect/prevent this (explicit decision). Note it in the UI copy; fan-out detection is a later guardrail.
- **Column-name collisions** (joined output vs geometry column) clobber the MVT property — author-managed in V1.
- **Perf**: inlined non-`MATERIALIZED` CTE + an **index on the linked join column** keeps per-tile cost ≈ (features-in-tile × index lookups). A grouped/aggregated CTE scans the linked table per tile — fine for moderate tables; very large linked tables (full OD) may later justify materialization. Index is the key lever.
- **Same-pgEnv, PG-only**: inline SQL join needs the linked view in the same Postgres pgEnv. ClickHouse-backed / cross-pgEnv linked views unsupported in V1.
- **Param renumbering** is the subtle server bug surface — cover with a focused test.

## Related tasks
- [`datawrapper-join-support.md`](./datawrapper-join-support.md) — page-pattern dataWrapper join (server SQL join via WITH/CTE for tabular sections). Same "UDA-query-as-CTE" idea; reference for the linked-query UX (re-implement, don't share).
- [`map-component-unification.md`](./map-component-unification.md) — will merge the three `getLayerTileUrl`/`SymbologyViewLayer` copies; until then edit all three.
- [`split-table-virtual-columns.md`](./split-table-virtual-columns.md) — auto-indexes on dataset columns; directly relevant to the join-column index perf lever.
