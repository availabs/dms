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

## Backwards Compatibility (hard constraints)

This plan must make **no backwards-incompatible change to anything UDA uses.** The only shared-code touch is `query_sets/postgres.js`; everything else is additive. Invariants for the implementer:

- **`simpleFilter` signature + behavior unchanged.** It is dispatched as `querySets[ctx.dbType].simpleFilter(ctx, options, attributes, indices)` (`uda.controller.js:295`), with a parallel `clickhouse.js#simpleFilter` of the same shape. The extraction only moves SQL-string construction into a new internal `buildSimpleFilterSql(ctx, options, attributes, indices) → { sql, values, columnNameMap }`; `simpleFilter` then does `const { sql, values } = buildSimpleFilterSql(...); const res = await db.query(sql, values);` and keeps its existing post-query column-name restoration (postgres.js:222-230) verbatim. Net behavior for every existing caller is identical.
- **Exports are additive only.** Add `buildSimpleFilterSql` to `module.exports`; do not remove or rename `simpleFilter` / `simpleFilterLength` / `dataById` / `translatePgToSqlite`.
- **Do NOT change the `querySets` dispatch contract** (`{ simpleFilter, simpleFilterLength, dataById }`) and **do NOT touch `query_sets/clickhouse.js`.** `buildSimpleFilterSql` is consumed only by the tile route (PG-only) and never via `querySets`, so ClickHouse needs no parallel and the controller is unaffected.
- **`getEssentials` is called read-only** by the tile route (`getEssentials({ env: pgEnv, view_id: join.viewId, options })`); no change to it. If the resolved linked `ctx.dbType !== 'postgres'` (e.g. a ClickHouse-backed view), the tile route bails to the no-join path / errors — it must not attempt a PG CTE against a CH view.
- **`tiles.rest.js` stays BC**: `join` is an optional query param; when absent the SQL and response are byte-identical to today. Existing tile consumers are unaffected.
- **Client + editor changes are additive**: `getLayerTileUrl` appends `join` only when a layer has an enabled `'linked-data'` config (layers without it emit identical URLs); the new `'linked-data'` layer key, the `Linked Data` tab, and `normalizeLayerLinkedDataConfig` (defaults to disabled when absent) introduce no change for existing layers/maps.
- **Gate:** Phase 1 is not "done" until the full `dms-server` UDA test suite (`npm test` / `npm run test:graph`) passes unchanged — that is the proof the extraction preserved behavior.

## Implementation Plan (phased)

> Mark items `[x]` + update phase headers AS YOU GO (planning-rules.md §Workflow).

### Phase 1 — Server: extract a reusable SQL builder — NOT STARTED

**File:** `dms-server/src/routes/uda/query_sets/postgres.js`. Expose the linked SELECT as a string the tile route can embed as a CTE, **without changing `simpleFilter`'s behavior** (see Backwards Compatibility). `buildJoin` is `await`ed inside, so the builder is `async`.

- [ ] **Step 1.1** — Add `buildSimpleFilterSql`, lifting the SQL construction from `simpleFilter` (current lines 134-218) and returning instead of executing:
  ```js
  // returns { sql, values, columnNameMap }; sql === null when there are no attributes
  async function buildSimpleFilterSql(ctx, options, attributes, indices) {
    const num = indices.to - indices.from + 1;
    const { isDms, db, app, type, table_schema, table_name, dmsAttributes } = ctx;

    let sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
    if (!sanitizedAttrs.length) return { sql: null, values: [], columnNameMap: {} };
    if (db.type === 'sqlite') sanitizedAttrs = sanitizedAttrs.map(translatePgToSqlite);

    const columnNameMap = sanitizedAttrs.reduce((acc, attr, i) => {
      const responseName = getResponseColumnName(attr);
      if (attr.toLowerCase().includes(' as ') && responseName.length > 60) acc[attr] = attr.replace(` ${responseName}`, ` col_${i}`);
      return acc;
    }, {});

    const {
      filter = {}, exclude = {}, gt = {}, gte = {}, lt = {}, lte = {}, like = {},
      filterGroups = {}, groupBy = [], having = [], orderBy = {}, normalFilter = [], join = {},
    } = JSON.parse(options);

    if (normalFilter.length) normalFilter.forEach(({ column, values }) => { (filter[column] ??= []).push(...values); });

    const oldValues = [
      ...(isDms ? [[app], [type]] : []),
      ...getValuesExceptNulls(filter), ...getValuesExceptNulls(exclude),
      ...getValuesExceptNulls(gt), ...getValuesExceptNulls(gte),
      ...getValuesExceptNulls(lt), ...getValuesExceptNulls(lte), ...getValuesExceptNulls(like),
    ];
    const values = [...oldValues, ...getValuesFromGroup(filterGroups)];

    const joinPresent = !!join &&
      (Object.keys(join.sources || {}).length > 1 ||
       (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== 'ds'));
    const combinedWhere = buildCombinedWhere({ filter, exclude, gt, gte, lt, lte, like, filterGroups, isDms, app, type, oldValues, dbType: db.type, joinPresent });

    const { joins, merges } = await buildJoin({ join });
    const hasMerge = merges.length > 0, hasJoin = joins.length > 0;
    const fromClause = hasMerge
      ? `(SELECT * FROM ${table_schema}.${table_name} ${merges}) AS ds${hasJoin ? ` ${joins}` : ''}`
      : `${table_schema}.${table_name} ${hasJoin ? ' as ds ' : ''} ${joins}`;

    const sql = `
      SELECT ${sanitizedAttrs.map((c) => quoteAlias(columnNameMap[c] || c)).join(', ')}
      FROM ${fromClause}
      ${combinedWhere}
      ${handleGroupBy(groupBy)} ${handleHaving(having)} ${handleOrderBy(orderBy, dmsAttributes)}
      LIMIT ${+num} OFFSET ${indices.from}`;

    return { sql, values, columnNameMap };
  }
  ```

- [ ] **Step 1.2** — Replace `simpleFilter`'s body so it delegates and keeps the existing post-query alias restoration verbatim:
  ```js
  async function simpleFilter(ctx, options, attributes, indices) {
    const { db } = ctx;
    const { sql, values, columnNameMap } = await buildSimpleFilterSql(ctx, options, attributes, indices);
    if (!sql) return [];
    const res = await db.query(sql, values);
    return Object.keys(columnNameMap).length
      ? res.rows.map((row) => ({
          ...row,
          ...Object.keys(columnNameMap).reduce((acc, originalName) => ({
            ...acc, [getResponseColumnName(originalName)]: row[getResponseColumnName(columnNameMap[originalName])],
          }), {}),
        }))
      : res.rows;
  }
  ```

- [ ] **Step 1.3** — Add `buildSimpleFilterSql` to `module.exports` (keep `simpleFilter`/`simpleFilterLength`/`dataById`/`translatePgToSqlite`).

- [ ] **Step 1.4** — Run the UDA suite; do not proceed until unchanged-green:
  ```bash
  cd packages/dms-server && npm test     # or: npm run test:graph
  ```

### Phase 2 — Server: tile join via CTE — NOT STARTED

**File:** `dms-server/src/dama/tiles/tiles.rest.js`.

- [ ] **Step 2.1** — Imports at top:
  ```js
  const { getEssentials } = require('../../routes/uda/utils');
  const { buildSimpleFilterSql } = require('../../routes/uda/query_sets/postgres');
  ```

- [ ] **Step 2.2** — Param-renumber helper (linked CTE uses `$1..$N`; tile owns `$1,$2,$3`):
  ```js
  // Shift every $N in a SQL fragment by `offset` so it can sit after the tile's $1,$2,$3 (z,x,y).
  const shiftParams = (sql, offset) => sql.replace(/\$(\d+)/g, (_, n) => `$${+n + offset}`);
  ```

- [ ] **Step 2.3** — Add `getJoinedTileData`. The linked CTE is built by the UDA builder (so it already carries the author's filter/groupBy/aggregate); the tile just LEFT JOINs it 1:1:
  ```js
  async function getJoinedTileData(pgEnv, viewId, z, x, y, columns, filter, join) {
    const geoTable = await resolveTable(pgEnv, viewId);
    if (!geoTable) return null;
    const db = getDb(pgEnv);

    const linkedCtx = await getEssentials({ env: pgEnv, view_id: join.viewId, options: join.options || {} });
    if (linkedCtx.dbType !== 'postgres') return null;            // PG-only; CH-backed linked views unsupported (V1)

    const { sql: linkedSql, values: linkedValues } = await buildSimpleFilterSql(
      linkedCtx,
      JSON.stringify(join.options || {}),
      join.attributes,                                            // ["w_geocode","sum(S000)::numeric as total_workers"]
      { from: 0, to: 1_000_000 - 1 },                             // generous cap; the join key bounds real output
    );
    if (!linkedSql) return null;

    const q = (c) => `"${String(c).replace(/"/g, '')}"`;
    const geomCols = (columns || []).map((c) => `, geo.${q(c)}`).join('');
    const joinedCols = (join.tileCols || []).map((c) => `, linked.${q(c)}`).join('');

    const sql = `
      WITH linked AS ( ${shiftParams(linkedSql, 3)} ),
      mvtgeom AS (
        SELECT ST_AsMVTGeom(ST_Transform(geo.wkb_geometry, 3857), ST_TileEnvelope($1,$2,$3)) AS geom
          ${geomCols} ${joinedCols}
          , geo.ogc_fid
        FROM ${geoTable} geo
        LEFT JOIN linked ON geo.${q(join.localKey)} = linked.${q(join.linkedKey)}
        , (SELECT ST_SRID(wkb_geometry) AS srid FROM ${geoTable} WHERE wkb_geometry IS NOT NULL LIMIT 1) a
        WHERE ST_Intersects(geo.wkb_geometry, ST_Transform(ST_TileEnvelope($1,$2,$3), srid))
        ${filter ? ` AND ${filter}` : ''}
      )
      SELECT ST_AsMVT(mvtgeom.*, 'view_${+viewId}', 4096, 'geom', 'ogc_fid') AS mvt FROM mvtgeom`;

    try {
      const { rows } = await db.query(sql, [+z, +x, +y, ...linkedValues]);
      return rows[0]?.mvt || null;
    } catch (e) {
      console.error(`[tiles] join tile error (view ${viewId} ⋈ ${join.viewId}, ${z}/${x}/${y}):`, e.message);
      return null;
    }
  }
  ```
  **Output-name caveat:** `join.linkedKey`/`join.tileCols` must match the linked CTE's *output* column names. `buildSimpleFilterSql` aliases an output to `col_i` only when its response name is >60 chars — keep aggregate aliases short (`total_workers`) so this never trips. (If long aliases are ever needed, thread `columnNameMap` out and remap.)

- [ ] **Step 2.4** — In `serveTile`, parse `join` and dispatch (no-`join` path unchanged):
  ```js
  const { cols, filter, join: joinRaw } = req.query;
  const join = joinRaw ? JSON.parse(joinRaw) : null;          // express already URL-decodes query values
  const mvt = join
    ? await getJoinedTileData(pgEnv, view_id, +z, +x, +y, cols?.split(',') || [], filter, join)
    : await getTileData(pgEnv, view_id, +z, +x, +y, cols?.split(',') || [], filter);
  ```

- [ ] **Step 2.5** — Verify against PG+PostGIS using a geometry view + an analytical view sharing a key:
  ```bash
  JOIN='{"viewId":<linkedViewId>,"localKey":"<geomKey>","linkedKey":"w_geocode","options":{"groupBy":["w_geocode"]},"attributes":["w_geocode","sum(S000)::numeric as total_workers"],"tileCols":["total_workers"]}'
  ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$JOIN")
  curl -s "http://localhost:<port>/dama-admin/<pgEnv>/tiles/<geomViewId>/<z>/<x>/<y>/t.pbf?cols=<geomKey>&join=$ENC" -o /tmp/t.pbf
  node -e 'const {VectorTile}=require("@mapbox/vector-tile"),Pbf=require("pbf"),fs=require("fs");const t=new VectorTile(new Pbf(fs.readFileSync("/tmp/t.pbf")));const l=t.layers["view_<geomViewId>"];console.log("features:",l.length,"props[0]:",l.feature(0).properties);'
  ```
  Expected: features carry `total_workers`; layer feature count equals the no-join tile (grouped CTE is 1:1 on the key → no fan-out).

### Phase 3 — Client: append `join` in all three `getLayerTileUrl` copies — NOT STARTED

**Files:** `patterns/page/.../map/SymbologyViewLayer.jsx` (~:1175), `patterns/page/.../map_dama/SymbologyViewLayer.jsx` (~:373), `patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx` (~:307). Re-implement the same edit in each (no cross-pattern import).

- [ ] **Step 3.1** — Add a module-scope helper in each file. The linked-query → UDA `{options, attributes}` mapping mirrors dataWrapper's `buildUdaConfig` (re-implemented):
  ```js
  // Build the encoded `join` query param from a layer's linked-data config (""=disabled).
  const buildJoinParam = (layerProps) => {
    const ld = layerProps?.["linked-data"];
    if (!ld?.enabled || !ld.linkedJoinColumn || !ld.linked?.viewId) return "";
    const { filters = {}, groupBy = [], columns = [] } = ld.linkedQuery || {};
    const join = {
      viewId: ld.linked.viewId,
      localKey: ld.featureKeyColumn,
      linkedKey: ld.linkedJoinColumn,
      options: { ...filters, groupBy },     // filters already in UDA filter/filterGroups shape
      attributes: columns,                  // SELECT list incl. aggregate exprs + the join key column
      tileCols: ld.tileColumns || [],
    };
    return encodeURIComponent(JSON.stringify(join));
  };
  ```

- [ ] **Step 3.2** — Before `return newTileUrl`, append the join param. **Joined columns must NOT be in `?cols=`** (the geometry table lacks them) — they travel in `join.tileCols`:
  ```js
  const joinParam = buildJoinParam(layerProps);
  if (joinParam) newTileUrl += `${newTileUrl.includes("?") ? "&" : "?"}join=${joinParam}`;
  ```
  Adjust the existing `?cols=` assembly (the `dataFilterCols`/`colsToAppend` block above) to exclude any column listed in `layerProps["linked-data"].tileColumns` — those are joined outputs, not geometry columns. Simplest: after computing `colsToAppend`, drop entries that appear in `tileColumns`.

- [ ] **Step 3.3** — Verify in devtools: enabling a join makes the tile request URL carry `&join=…`; `map.queryRenderedFeatures(point)` on a feature shows the joined property.

### Phase 4 — Editor: Linked Data tab + linked-query builder — NOT STARTED

- [ ] **Step 4.1** — `LinkedDataControl/constants.js` (`.js`, no JSX):
  ```js
  export const LINKED_DATA_AGG_OPS = ["sum", "count", "avg", "min", "max"];
  export const LINKED_DATA_ROW_CAP = 1_000_000;
  ```

- [ ] **Step 4.2** — `MapEditor/stateUtils.jsx`: add + export `normalizeLayerLinkedDataConfig` (model on `normalizeLayerClickFilterConfig` at :338):
  ```js
  const normalizeLayerLinkedDataConfig = (config = {}) => ({
    enabled: Boolean(config?.enabled),
    featureKeyColumn: config?.featureKeyColumn || "",
    linked: {
      sourceId: config?.linked?.sourceId ?? null,
      viewId: config?.linked?.viewId ?? null,
      env: config?.linked?.env ?? null,
    },
    linkedJoinColumn: config?.linkedJoinColumn || "",
    linkedQuery: {
      filters: config?.linkedQuery?.filters || {},
      groupBy: Array.isArray(config?.linkedQuery?.groupBy) ? config.linkedQuery.groupBy : [],
      columns: Array.isArray(config?.linkedQuery?.columns) ? config.linkedQuery.columns : [],
    },
    tileColumns: Array.isArray(config?.tileColumns) ? config.tileColumns : [],
  });
  ```
  Add `normalizeLayerLinkedDataConfig` to the `export { … }` block (alongside `normalizeLayerClickFilterConfig`).

- [ ] **Step 4.3** — `LayerEditor/index.jsx`: import + register the tab:
  ```js
  import LinkedDataControl from './LinkedDataControl'
  // …
  const LAYER_EDITOR_TABS = [
    { name: 'Style', Component: StyleEditor },
    { name: 'Legend', Component: LegendEditor },
    { name: 'Popup', Component: PopoverEditor },
    { name: 'Filter', Component: FilterEditor },
    { name: 'Linked Data', Component: LinkedDataControl },
  ];
  ```

- [ ] **Step 4.4** — `LinkedDataControl/index.jsx` — mirror `ClickFilterControl/index.jsx` structure (`.jsx`, components only):
  - Read `SymbologyContext` (`state`, `setState`) + `MapEditorContext` (`pgEnv`, falcor via `useFalcor`).
  - `activeLayerId = state?.symbology?.activeLayer`; `linkedDataPath = \`symbology.layers[${activeLayerId}]['linked-data']\``.
  - `currentConfig = useMemo(() => normalizeLayerLinkedDataConfig(get(state, linkedDataPath, {})), [state, linkedDataPath])`.
  - `setLinkedDataConfig(updater)`: `setState(draft => { const next = normalizeLayerLinkedDataConfig(get(draft, linkedDataPath, {})); updater(next); set(draft, linkedDataPath, next); })`.
  - Render an `Enabled` checkbox (toggles `enabled`), then `<JoinSetup config currentConfig set={setLinkedDataConfig} />` and `<LinkedQueryBuilder … />` when `currentConfig.enabled`.

- [ ] **Step 4.5** — `LinkedDataControl/JoinSetup.jsx` (`.jsx`):
  - **Feature key column** `<select>` from THIS layer's source metadata — inline fetch verbatim from `ClickFilterControl`: `useEffect(() => { if (sourceId && falcor && pgEnv) falcor.get(["uda", pgEnv, "sources", "byId", sourceId, "metadata"]); }, […])`; read `get(falcorCache, ["uda", pgEnv, "sources", "byId", sourceId, "metadata", "value", "columns"], [])`. Bind `featureKeyColumn`.
  - **Linked source/view** picker — reuse the editor's existing source/view selection affordance, scoped to the same `pgEnv`; persist `linked.sourceId`/`linked.viewId`/`linked.env`.
  - **Linked join column** `<select>` from the LINKED source's metadata — a second inline `falcor.get(["uda", pgEnv, "sources", "byId", linked.sourceId, "metadata"])`. Bind `linkedJoinColumn`.

- [ ] **Step 4.6** — `LinkedDataControl/LinkedQueryBuilder.jsx` (`.jsx`) — re-implemented dataWrapper-style query editor over the linked view's columns. Per column: a `group` toggle (→ groupBy) and an aggregate `fn` select (`LINKED_DATA_AGG_OPS`). Compose the SELECT expressions:
  ```js
  // grouped col → "col"; aggregated col → "fn(col)::numeric as fn_col" (count → "count(1)::int as count_col")
  const toSelectExpr = (c) =>
    c.fn === "count" ? `count(1)::int as count_${c.name}`
    : c.fn ? `${c.fn}(${c.name})::numeric as ${c.fn}_${c.name}`
    : c.name;
  ```
  Persist: `linkedQuery.groupBy` = names of grouped columns (must include the join key for 1:1); `linkedQuery.columns` = the select exprs (include the join key column); `linkedQuery.filters` = a small filter editor writing UDA `filter`/`filterGroups`. Provide a `tileColumns` multiselect over the query's output names (aggregate aliases like `sum_S000`/`total_workers` + grouped columns) — these are what get baked into the tile.

- [ ] **Step 4.7** — Verify: configure a grouped+aggregated linked query; confirm `'linked-data'` persists across layer switch + reload (inspect saved `symbology` JSON) and that Phase 3's `buildJoinParam` produces a sensible param.

### Phase 5 — Editor: let Style/Legend/Popup use joined output columns — NOT STARTED

The Style/Legend/Popup editors build their column dropdowns from the layer's own source metadata. To choropleth/show a joined column, merge `linked-data.tileColumns` (the joined output names) into those options so they're selectable as `data-column` / hover columns.

- [ ] **Step 5.1** — Locate the shared column-options source those editors use. Start at `LayerEditor/Controls.jsx` `SelectViewColumnControl` (fetches `["uda", pgEnv, "sources", "byId", sourceId, "metadata"]`) and the `datamaps` column reads; find where the `data-column` dropdown options array is assembled.
- [ ] **Step 5.2** — Where that list is built, append the active layer's joined outputs as synthetic column entries tagged joined, e.g. for each `tileColumns` entry: `{ name: alias, display_name: alias, type: 'numeric', _joined: true }`. Keep the merge local to the option-building site — do not widen primitive APIs (per `feedback_no_className_passthrough` discipline).
- [ ] **Step 5.3 — End-to-end proof:** block-geometry layer + OD linked view grouped by `w_geocode` with `sum(S000)::numeric as total_workers`, `tileColumns: ['total_workers']`. In the Style tab pick `total_workers` as the choropleth `data-column`. Expected: tiles carry `total_workers` (Phase 2/3) and blocks color by inbound-worker totals; hover shows the joined value.

### Phase 6 — Docs + completion — NOT STARTED
- [ ] **Step 6.1** — Document the `'linked-data'` config shape + the `join` tile param in `patterns/page/.../map/settings/README.md`. Call out: V1 assumes a correctly-configured 1:1 query (no fan-out guard); the linked view must be in the same Postgres pgEnv; and an **index on the linked join column** is the perf lever (without it, large linked tables degrade per-tile).
- [ ] **Step 6.2** — On completion: move this file to `tasks/completed/`, flip the `todo.md` entry to `[x]`, add a dated `completed.md` entry linking it.
- [ ] **Step 6.3** — Skill-candidate check (planning-rules.md §"When to extract a skill"): a "choropleth a geometry layer by an aggregated joined query" recipe likely warrants `skills/map-linked-data-join.md` — write it + index it in `skills/README.md` if the pattern proves reusable.

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
