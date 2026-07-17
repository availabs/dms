# Tile/colorDomain joins: ClickHouse join sources (old-reports Route Map M1)

## Status: BUILT & LIVE-VERIFIED 2026-07-15 (awaiting first real consumer: M2 converter speed choropleth)

Parent effort: `old-reports-conversion.md` Route Map work plan (scope detail in
`dms-template/scratchpad/npmrds-sub/old-reports/route_map_scope.md`, mechanism reference in
`planning/research/references/map-joins.md`). This is the **server (library) half** — ships
isolated from converter work per standing directive. Predecessor platform task:
[mapeditor-joins.md](./mapeditor-joins.md) (the original PG-only tile join).

## Objective

Lift the two PostgreSQL-only gates on symbology tile joins so a map layer can join a
**ClickHouse-backed view** (e.g. the NPMRDS speed fact table) into a PG geometry tile:

1. `dama/tiles/tiles.rest.js#getJoinedTileData` — `joinCtx.dbType !== 'pg' → return null`
2. `routes/uda/uda.colorDomain.controller.js#buildColorDomainTarget` — `dbType !== 'pg' → throw`

Consumer: M2 (converter speed-choropleth Route Maps — 256 instances / 214 reports), and any
author building a CH-joined choropleth in MapEditor.

## Design (decided; user-endorsed 2026-07-14 "Start the work!!!")

CH cannot run inside the PG MVT query, so the join subquery runs on ClickHouse FIRST and its
(small, aggregated) result is merged back into the PG tile/breaks query:

1. **`buildSimpleFilterSqlCH(ctx, options, attributes, indices = null)`** — build-only twin of
   `postgres.js#buildSimpleFilterSql`, factored out of `query_sets/clickhouse.js#simpleFilter`.
   CH inlines filter values, so it returns `{ sql, columnNameMap }` (no values array). No
   LIMIT/OFFSET unless `indices` is passed. `simpleFilter`'s single-arm path now DELEGATES to
   it (identical SQL text — kills drift risk); the comparison-series fan-out path keeps its
   own per-arm build.
2. **tiles.rest.js `dbType === 'ch'` branch** in `getJoinedTileData`:
   - **Keys pass (PG)**: `SELECT DISTINCT localKey FROM <geoTable> WHERE ST_Intersects(tile
     envelope) [AND filter] AND localKey IS NOT NULL` — which join values does THIS tile hold.
   - **Empty keys → geometry-only tile** (plain `getTileData`), no CH query at all.
   - **Key-count guard**: `> MAX_CH_JOIN_TILE_KEYS (20,000)` → skip the join, serve
     geometry-only, and log a LOUD multi-line `console.error` (user 2026-07-14: "make sure the
     limit/log is loud enough that if it comes up erroneously, someone will see it"). Rationale:
     a state-wide tile at low zoom ≈ 52k TMCs × full-history aggregate = the known CH
     unfiltered-scan hazard (`dms-server/CLAUDE.md` "Known hazard").
   - **Key injection at the OPTIONS level, never SQL surgery**: the tile's key list becomes one
     more `filterGroups` leaf `{col: joinKey, op: 'filter', value: keys}` ANDed with the
     layer's existing tree (prior tree nested as a child group so its own op is preserved) —
     lands inside the subquery WHERE, before any GROUP BY (pre-aggregation, fan-out safe).
   - **Merge**: run the CH SQL, then `joined_cte AS (SELECT * FROM jsonb_to_recordset($4::jsonb)
     AS x(<cols typed from CH result meta>))` in the existing MVT query — the LEFT JOIN /
     ST_AsMVT shell is SHARED with the PG path (only the joined_cte body differs). The PG
     path's `tile_keys` CTE goes unreferenced on the CH branch; PG prunes unreferenced CTEs.
   - **Type mapping** `chTypeToPg`: unwrap `Nullable(...)`/`LowCardinality(...)`;
     `U?Int\d+ → bigint` (CH quotes 64-bit ints as JSON strings; the bigint cast parses them),
     `Float32/64 → double precision`, `Decimal → numeric`, `Bool → boolean`, everything else
     (String/Date/DateTime/Enum/UUID) → `text`. Numeric fidelity is load-bearing: MVT feature
     properties must be numbers for client `step` paint expressions.
3. **colorDomain CH branch** in `buildColorDomainTarget`: same recordset merge (NOT JS break
   computation — reusing the recordset trick keeps all four break methods — equalInterval /
   quantile / stddev / ckmeans — running unchanged in PG against `joined_data`). The existing
   filter push-down (5a) already scopes the CH subquery by the layer's current filters.
   - **Hazard guard**: colorDomain has no tile-keys narrowing, so an UNFILTERED CH join
     subquery here is exactly the known scan hazard → refuse (loud `console.error` + throw)
     when the pushed-down runtime options carry no flat filters and no filterGroups leaves.
     (Converter/M2 layers always carry variant date+tmc filters; an author wanting a truly
     unfiltered statewide domain must bake breaks instead — relaxable later if needed.)
4. Shared helpers `chTypeToPg` + `chResultToRecordset(chJson, columnNameMap)` live in
   `query_sets/clickhouse.js` (CH-specific by nature) and are consumed by both callers.
   `chResultToRecordset` also restores `col_N` shortened aliases in BOTH meta names and rows.
5. Fix the stale `tiles.rest.js` header comment (query params omit `join`; "PostgreSQL only"
   now needs the CH-join caveat) while touching the file.

### Accepted residuals

- The key cap bounds keys but not the date range: ≤20k keys with NO date filter is still a
  heavy CH scan. Authoring UIs and the converter always bake date filters; the colorDomain
  unfiltered-refusal covers the breaks path. Not guarded on tiles in M1.
- `UInt64` values above 2^63-1 would overflow bigint (never occurs for NPMRDS grains).
- CH `NaN/Inf` floats serialize to `null` in CH JSON output → joined property absent (renders
  as no-data), which matches LEFT-JOIN semantics.

## Files requiring changes

- [x] `src/routes/uda/query_sets/clickhouse.js` — add `buildSimpleFilterSqlCH` (+ delegate
      single-arm `simpleFilter`), `chTypeToPg`, `chResultToRecordset`; export all three
- [x] `src/dama/tiles/tiles.rest.js` — CH branch (keys pass → guard → inject → CH → recordset
      merge), `injectJoinKeys` + `MAX_CH_JOIN_TILE_KEYS`, header-comment fix
- [x] `src/routes/uda/uda.colorDomain.controller.js` — CH branch + unfiltered-refusal guard
- [x] `tests/test-tile-join-ch.js` — NEW (pure SQL-string unit tests, no live CH; idiom from
      test-uda.js's stubbed-db CH tests) + `test:ch-tiles` npm script

## Testing checklist

- [x] Unit: `buildSimpleFilterSqlCH` — no LIMIT without indices / LIMIT with; filterGroups
      leaf → `IN (...)`; groupBy + explicit aliases; empty attrs → `{sql: null}`
- [x] Unit: `injectJoinKeys` — appends keys leaf; preserves prior tree op by nesting; handles
      empty/missing filterGroups
- [x] Unit: `chTypeToPg` wrappers + numeric/text mapping; `chResultToRecordset` colDefs +
      col_N restore
- [x] Existing suites still green: `npm test`, `npm run test:uda` (CH stub tests),
      `test:colorDomain` unit portion
- [x] Live (local dms-server + npmrds2): CH-joined tile request over a per-year geometry view
      (e.g. 1027) ⋈ CH speed view returns 200 MVT with joined numeric property; empty result →
      LEFT-JOIN no-data render; key-cap trip logs loudly (low-zoom request)
- [x] Live: chprocs before/after per the CH scan-hazard discipline (no stray queries)
- [x] Live: colorDomain over the CH join returns sane breaks; unfiltered CH colorDomain
      request → loud refusal

## Verification log (2026-07-15)

- Unit: `npm run test:ch-tiles` → 14/14; `npm test` (sqlite/controller/graph/workflow) exit 0;
  `test:uda` 83/83 (includes the CH stub + pgFederated tests — delegation refactor clean);
  `test:colorDomain` unit portion 12/12.
- Live (local dms-server :3001 under nodemon, pgEnv npmrds2, geometry view 1027 = 2019,
  Buffalo tile 11/575/753, 1477 features; MVT decoded via pbf —
  `dms-template/scratchpad/npmrds-sub/old-reports/verify_ch_tile_join.cjs`, reusable for M2):
  - **CH aggregate join** (view 982 fact table, 2019-10-01..07 date filter, groupBy tmc,
    `avg(travel_time_all_vehicles) as tt`): 200, all 1477 features present, **1374 carry a
    numeric `tt`** (0.7–373.1) — the 103 no-data TMCs render property-less = the old tool's
    gray no-data LEFT-JOIN semantics. `typeof tt === 'number'` (Float64 → double precision).
  - **Empty date window** (1990): 200, 1477 features, zero `tt` props — all-null LEFT JOIN.
  - **Ocean tile with join**: 204 — empty-keys early return, no CH query fired.
  - **Meta join** (view 3464, NO options filters — keys-only injection): all 1477 features
    carry numeric `aadt` + `miles` (Int → bigint and Float paths both proven).
  - **Key-cap trip**: z0 tile = 49,068 keys → geometry-only 200 + the loud
    `⚠️⚠️⚠️ CH JOIN SKIPPED` log with key count, cap, view pair, and remediation pointer.
    (z5 Buffalo-region tile held only 2,941 keys → join ran normally, bounded.)
  - **colorDomain over the CH join** (falcor `uda.npmrds2.viewsById[1027].colorDomain`,
    2-day window): ckmeans breaks [0.27, 76.22, 196.79, 377.46, 738.96] min 0.27 max 4841.95
    count 45691 source "full"; quantile breaks ascending & sane. **Unfiltered CH join** →
    error atom with the refusal message + the loud `REFUSING UNFILTERED` server log.
  - **Live single-arm delegation**: falcor `dataByIndex` query against view 982 returns the
    real row (`tmc 104+04184, avg tt 3.73`) — client queries run the builder's exact SQL.
  - `dbq.py chprocs` clean before/after every step — zero stray CH queries.
