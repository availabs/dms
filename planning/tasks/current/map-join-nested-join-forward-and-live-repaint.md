# Map layer join: forward nested join + apply live-rebroken paint (old-reports Route Map M2 prereq)

## Status: BUILT & LIVE-VERIFIED 2026-07-15 (first consumer: converted reports 1071, 168)

Parent effort: `old-reports-conversion.md` Route Map work plan (scope detail in
`dms-template/scratchpad/npmrds-sub/old-reports/route_map_scope.md`). Found while scoping M2
(converter speed choropleth) — two real client-side gaps in the Map-layer join/choropleth
pipeline that M1 (`tile-join-clickhouse-source.md`) didn't touch (M1 was server-only) and the
scope doc assumed away without verifying against the actual shipped code. Ships isolated from
the converter change per standing directive, even though both were found and fixed in the same
round.

## Objective

1. Let a Map layer's join carry a **nested secondary join** inside its own query (e.g. the
   455/3464 TMC-identification join a calculated column like `SPEED_EXPR` needs for
   `table1.miles`) — needed for M2's speed choropleth; the mechanism doesn't exist today even
   though the server already supports it.
2. Make the Map section's live re-break mechanism actually **recolor** the map, not just
   refresh the legend text — needed for the user's v2.1 "live interactivity" requirement to be
   visible at all.

## Finding #1: nested join was silently dropped before reaching the server

`SPEED_EXPR` (the round-35-proven two-level speed formula) reads `table1.miles`, which only
exists once a query joins the 455/3464 TMC-identification table — exactly like every AVL-Graph
speed/travelTime template already does via `state.join = {sources: {table1: {...}}}`.

The scope doc (`route_map_scope.md`'s "Work plan v2", point 4) assumed this same join
descriptor could just be nested inside a Map layer's `join.query.join` and would "ride inside
`options.join` exactly as templates do." Tracing the actual code:

- **Server already supports it**: `query_sets/clickhouse.js`'s `simpleFilterLength` (line 55)
  and `buildSimpleFilterSqlCH` (line 195) both destructure `join = {}` off the top level of the
  options JSON they receive and hand it straight to `buildJoin({join})` — the identical
  mechanism an ordinary AVL-Graph query's `state.join` already rides.
- **Client never sent it**: `buildJoinParam` (`SymbologyViewLayer.jsx`, both the page-section
  and mapeditor copies) and `buildJoinOptions` (`map/index.jsx` and `MapEditor/index.jsx`, the
  colorDomain-request builders) all built their outgoing `options` object as
  `{ ...buildJoinFilterOptions(queryConfig), groupBy }` — a literal object construction that
  never spread `queryConfig.join` at all. A template author's (or converter's) nested join
  descriptor was silently discarded before it ever reached the server. Without this fix,
  `SPEED_EXPR`'s `table1.miles` reference 500s as an unknown identifier the moment the CH join
  actually runs (same class of bug as round-38's "joinless query never aliases `ds`" hazard —
  a construction bug in the caller, not a platform limitation).

**Fix**: forward `queryConfig.join` into the `options.join` key at all four call sites (both
`buildJoinParam` copies, both `buildJoinOptions` copies). Skipped the fifth structurally-similar
site in `map_dama/SymbologyViewLayer.jsx` — that component is explicitly superseded by "Map" and
slated for retirement (v2.2 amendment, P5), not worth carrying the fix into dead-end code.

## Finding #2: live re-break only ever refreshed the legend text, never the rendered colors

The Map section's runtime legend-refresh effect (`map/index.jsx`, the `useEffect` around
line 742) already calls the server's `colorDomain` endpoint on every filter/publish change and
computes `paintResult = choroplethPaint(...)` (`{paint, legend}`) from the response — but only
ever wrote `paintResult.legend` into `layer["legend-data"]`. `paintResult.paint` (the freshly
rebuilt maplibre `step`/`case` expression) was computed and discarded. `SymbologyViewLayer.jsx`'s
own paint-diffing effect (lines 434-443) already generically applies any changed
`layer.paint[key]` via `setPaintProperty` — it was just never being fed a new value.

Net effect (pre-fix): **any** authored choropleth Map — PG-joined or CH-joined, not specific to
this task — only ever updated its legend labels on a filter change; the rendered feature colors
stayed frozen at whatever was last saved/baked. This silently broke the v2.1 "live interactivity"
requirement (colors must re-break when a converted Route Map's routes/dates change, not just the
legend), and is a real pre-existing platform bug independent of M2.

**Fix**: `getSavedRampPaint`'s own layer-type → sub-layer/paint-key mapping (circle:
`layers[0].paint['circle-color']`; line: `layers[1].paint['line-color']`; fill/default:
`layers[1].paint['fill-color']`) also drives where the effect writes `paintResult.paint` back,
alongside the existing `legend-data` write.

## Files changed

- [x] `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx` — `buildJoinParam`: forward `queryConfig.join`
- [x] `packages/dms/src/patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx` — same, mapeditor copy
- [x] `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx` — `buildJoinOptions`: forward `queryConfig.join`; `refreshLegendData`'s choropleth/circles branch: write `paintResult.paint` onto the matching sub-layer alongside `legend-data`
- [x] `packages/dms/src/patterns/mapeditor/MapEditor/index.jsx` — `buildJoinOptions`: forward `queryConfig.join` (editor-side colorDomain preview parity)
- Not touched (superseded, retiring): `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map_dama/SymbologyViewLayer.jsx`

## Testing checklist

No unit-test harness exists for this client code (these are module-private consts inside
`.jsx` files; exporting them for testability would violate the dms package's Fast-Refresh
component-only-export rule) — M0a/M1's own client-side testing was live-page-based for the
same reason.

- [x] All four edited files re-parse clean (`esbuild.transformSync`, jsx/automatic) — confirms
      no syntax regression
- [x] Live (2026-07-15, folds into M2's report-1071/168 conversions, see
      `old-reports-conversion.md`): confirmed via direct network capture (Playwright request/
      response listeners registered before a forced reload — attaching via `--eval` alone is
      too late, it runs after initial-load traffic has already fired) that the materialized
      tile requests carry the nested `join` key with the correct per-comp TMC/date/epoch
      scoping, and the server responds 200 with real per-feature values (fix #1 confirmed
      working end-to-end); screenshot shows the choropleth-colored route rendering (report
      1071: uniform red, matching its degenerate single-TMC tied breaks; report 168: real
      multi-TMC route). Fix #2 (paint write-back) not separately isolated this round — the
      rendered color matched the baked paint on first load in both cases; a live route/date
      edit re-break wasn't exercised (no interactive UI pass done, matching M0a's own
      unchecked item for the same reason).
- [ ] Spot-check: an existing authored (non-CH) choropleth Map still re-breaks correctly after
      this change (regression check — the paint-write path is shared by every choropleth, not
      just CH-joined ones) — not done this round.

## Related finding (not fixed, gap-logged): a malformed join crashes the whole dms-server process

Live-caught 2026-07-15 while building M2's speed template (see `old-reports-conversion.md`):
sending a `join.query.join` missing the `on` array (an *authoring* mistake on the converter's
side, since this M1 codepath was never previously exercised with a nested secondary join) hit
`buildJoin`'s `for(let i=0; i<join.on.length; i++)` (`routes/uda/utils.js:600`) with `join.on`
undefined — an uncaught `TypeError` that killed the entire nodemon-managed dms-server process
for every user, not just a 500 for that one request. The real fix was on the converter side
(construct the correct wire shape — see `old-reports-conversion.md`'s round-49 entry), but the
server-side robustness gap is real and independent: `getJoinedTileData`/`serveTile` (and
likely `buildColorDomainTarget`) have no try/catch boundary broad enough to turn a malformed
join into a clean 500 instead of a process crash. Worth a small hardening pass later — not
done here to keep this fix scoped to the two items above.
