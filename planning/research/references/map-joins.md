# Map/symbology tile joins — mechanics (verified 2026-07-14)

The dangling reference from `../map-stack-architecture.md` (§ layer fields, `join`). Written
after the old-reports Route Map scoping (R43-R45 in
`planning/tasks/current/old-reports-conversion.md`) verified the whole path in source and
against a live symbology.

## What a symbology-layer join is

A layer's `join` (legacy key: `linked-data`) config joins a second DAMA view onto the layer's
vector tiles AT TILE-REQUEST TIME, emitting joined columns as feature properties — so paint,
legend, hover, and filters can use data that isn't in the tiled table. Live worked example:
symbology **2186994** (`map_editor_test|symbology`, dev DMS DB) — census-block tiles
(view 3360) ⋈ LODES OD table (view 3354) with aggregation (`sum(s_000) as "sum_s_000"`,
`groupBy: [h_geocode, w_geocode]`, filters), choropleth `data-column: sum_s_000`.

## Client side (both viewer copies)

`mapeditor/MapEditor/components/SymbologyViewLayer.jsx` and the Map section's copy
(`ComponentRegistry/map/SymbologyViewLayer.jsx`) carry the same machinery:

- `normalizeJoinRuntimeConfig` — merges current + legacy key paths
  (`join|linked-data`, `source|linked`, `joinColumn|linkedJoinColumn`, `query|linkedQuery`).
- `buildJoinParam` — serializes onto the tile URL as `&join=<urlencoded JSON>`:
  `{ viewId, localKey (featureKeyColumn, tile-side), joinKey (join-view side),
     options (filters/filterGroups/groupBy — FULL UDA options payload, may itself contain a
     nested view join under options.join), attributes (raw SQL exprs w/ aliases),
     tileCols (joined output names to emit as feature properties) }`.
- `collectActiveJoinFilterGroups` — pushes the layer's static `filter` + `dynamic-filters`
  that target JOINED columns into the join's own subquery as filterGroups leaves, so the CTE
  filters BEFORE aggregating (prevents LEFT-JOIN fan-out blowups). Static wins over dynamic
  on the same column.
- Hover: joined values listed in `tileCols` are real feature properties (read directly);
  other join outputs resolve on demand via `getJoinFieldLookup`.

## Server side — TWO tile-server codebases serve the same route shape

`/dama-admin/:pgEnv/tiles/:view_id/:z/:x/:y/t.pbf` is served by BOTH:

| Deployment | Codebase | `join=` support |
|---|---|---|
| `graph.availabs.org` | avail-falcor `dama/routes/tiles/tiles.routes.js` | **NO** — reads only `cols`/`filter`; join silently ignored |
| `dmsserver.availabs.org` (and any dms-server) | `dms-server/src/dama/tiles/tiles.rest.js` | **YES** |

Tile URLs are baked per-view in `data_manager.views.metadata.tiles` (no client-side host
rewrite — that code is commented out), so WHICH implementation a layer hits is decided by the
stored URL. Vet capabilities against the deployment the URL names, not whichever repo you
know. (This distinction cost a whole wrong architecture recommendation in old-reports R41.)

### dms-server implementation (`getJoinedTileData`)

1. `getEssentials({env, view_id: join.viewId, options})` resolves the join view; **gate:
   `joinCtx.dbType !== 'pg'` → returns null** (ClickHouse-backed join sources unsupported —
   see gaps below).
2. `buildSimpleFilterSql(joinCtx, options, attributes)` (PG UDA query set; exported build-only
   entry point, no LIMIT when `indices` omitted — a LIMIT would truncate the CTE before the
   outer join) builds the join view's SQL, including nested `options.join` view joins,
   filterGroups, groupBy.
3. `injectTileKeyFilter` narrows it: `WHERE joinKey IN (SELECT join_value FROM tile_keys)` —
   `tile_keys` = DISTINCT localKey of the features intersecting THIS tile (after the layer's
   `filter=` param). This is why there's no row cap: narrowing happens inside the query.
4. One PG query: `tile_geo` (ST_Intersects envelope) → `tile_keys` → `joined_cte` (the
   narrowed join SQL) → LEFT JOIN on localKey=joinKey → `ST_AsMVT` with base `cols` +
   `join.tileCols` as feature properties.
5. LEFT JOIN ⇒ features with no join row still render, joined props null → a paint
   null-guard (`["case",["==",["get",col],null],"<no-data>",…]`) shows them as no-data.

Stale header note: `tiles.rest.js`'s file comment still says "Query params: cols, filter" —
it predates the join. Fix when next touching the file.

### colorDomain (server breaks) is join-aware too

`dms-server/src/routes/uda/uda.colorDomain.controller.js` accepts `options.join` and attaches
it whenever the colored column OR a filter targets a joined column
(`collectJoinFilterLeaves` pushes joined-column filters into the join's OWN subquery, outside
its GROUP BY — same fan-out-safety idea). **Same PG-only gate** on the join source (`:177`).

## Known gaps (as of 2026-07-14)

1. **ClickHouse join sources rejected** in both tiles (`tiles.rest.js:122`) and colorDomain
   (`:177`). Extension design (scoped, old-reports M1): factor a build-only
   `buildSimpleFilterSqlCH` out of `query_sets/clickhouse.js#simpleFilter` (CH inlines values
   — returns `{sql}` only); tiles branch = PG tile-keys pass → inject keys as a filterGroups
   leaf (not SQL surgery) → run CH → merge rows into the MVT query via
   `jsonb_to_recordset($n::jsonb)` with types mapped from CH result meta. Needs a scan guard
   (key-count cap) — an unfiltered CH join at z0 ≈ 52k keys × full history = the known
   unfiltered-CH-scan hazard (`documentation/npmrds-data-sources.md`).
2. **No binding to action-type page filters** — the Map section's filter sync drops
   `type:'action'` filters on purpose (`map/index.jsx:559-571`, hover/click publish noise).
   Live route/date binding is scoped as a `comparison_series` subscriber runtime for the Map
   (series-driven layers; RRL discovery in `findSelfBoundGraphs` is element-type-agnostic) —
   old-reports work plan v2.1.

## Related

- `../map-stack-architecture.md` — the full map stack.
- `skills/editing-map-symbologies.md` — headless symbology editing (join listed in §2).
- `documentation/npmrds-data-sources.md` — per-year TMC geometry tile views + host caveat.
