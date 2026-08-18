# Dynamic-Report route binding doesn't reach Map/Spreadsheet section types

**Status (2026-08-07, Round 3): Item 1 DONE + live-verified — the Map Routes pill now renders and
is correctly scoped (Routes + When only, no Measure/Aggregate/Mode).** Item 2 DONE + live-verified
(Round 2). Item 4 (Info Box/Route Compare "never render") could NOT be reproduced live — see below,
recommend downgrading rather than treating as an open bug. Item 3 remains moot (1+2's Map-rendering
fix landed without needing it). Item 5 reconfirmed live, unchanged in scope. Item 6 untouched, as
instructed.

Isolated library task split out of the dms-template reports-catalog triage
(`planning/transportny/tasks/completed/reports-page-template-catalog.md`'s "Triage, same day"
section, 2026-08-06) per the ship-shared-platform-changes-isolated rule — this is a DMS library
binding gap (affects any `npmrds_sub` Dynamic Report, not just the 12 catalog templates), even
though it was discovered through the catalog. See also `old-reports-conversion.md` (this same
`tasks/current/` directory — the authoritative doc for the NPMRDS converter/vocabulary arc) — this
bug sits downstream of that arc's "Design push #2" (2026-08-06):
the route's own weekday-mask/time-of-day window and its graph assignment moved OFF the route and
onto each GRAPH's own `display._measurePick` (`weekdays`/`start`/`end`/`routeIds`), so a graph now
resolves its own routes independently instead of every route unconditionally feeding every graph.

## Objective

Design push #2's generic self-binding mechanism (`_measurePick` + a `comparison_series` subscriber
with `paramKey: "$self"`, read by `useGraphPublish.js`'s `findSelfBoundGraphs`) is meant to work for
**any** section type, not just AVL Graph (Line/Bar). Live repro shows it only actually works
end-to-end for AVL Graph. Map, Route Compare Component, and TMC Info Box need to work identically.

## How this was found (repro, live, 2026-08-06)

On `converted_reports/rochester_inner_loop_0` (a `--template-id`-converted Dynamic Report page,
the actual page the reports catalog's "Snapshot" card links to — see
`planning/transportny/tasks/completed/catalog-page-slug-naming-fix.md` in the OTHER planning tree,
at the repo root, for why that URL looks wrong), opened the page fresh, filled
the "Add Routes" entry-gate modal with 3 arbitrary real routes (Queens/Richmond, unrelated to the
original Rochester content), clicked "Add 3 Routes":

- The AVL Graph (LineGraph) section correctly re-rendered with real bar data for the picked
  routes. This part of the mechanism works.
- Its own title/legend still read **"Average Speed (I-490 36055 EB AM Peak)"** — the ORIGINAL
  Rochester route's name, frozen at conversion time, not derived from what was actually picked.
  (Separate, smaller issue — see "Frozen titles" below.)
- The **Route Map section stayed completely blank** (no line geometry drawn) even though its own
  `display._measurePick.routeIds` was correctly set (confirmed via direct DB read:
  `{"weekdays":{},"start":"","end":"","routeIds":["comp-16"]}`) and its legend picked up a computed
  value (`30.51 - 30.51`) — so it partially resolved but never drew.
- **TMC Info Box** and **Route Compare Component** sections never rendered at all
  (`report_probe.mjs` showed `[NO SVG]` / "Rows 1 to 0 of 0"), before or after the route pick.

Also confirmed directly against `reports_snap_2`: the 3 routes picked through the modal are
**not** persisted back to the report's stored `routes[]` — the modal drives an ephemeral,
URL/session-scoped route resolution, separate from the stored template slots. This is presumably
intentional (a shared template shouldn't be permanently mutated by one viewer's session) but is a
relevant fact for anyone building the fix below: routes picked via the modal must flow into
`useGraphPublish`'s `routes` prop by some path OTHER than `reports_snap_2`, and that path needs to
be traced to know whether Map/Spreadsheet sections see the same picked-route list AVL Graph does or
a stale/different one.

## Round 2 findings (2026-08-07) — live implementation + repro session, dev server up

Re-ran the exact repro from "How this was found" above, live, on the same page
(`converted_reports/rochester_inner_loop_0`, page id `2208871`) via browser automation (not just
code reading this time) — picked 3 fresh Queens/Richmond routes through the "Add Routes" entry-gate
modal, same as the original repro. Also confirmed via direct DB query (`dms raw get` on each
published section) that `reports_snap_2.routes[]` for this exact report has **all 11 entries as true
Dynamic-Report slots** (`route_slot_group` set, `tmc_array` absent) grouped into exactly 3 distinct
groups (`163185`, `6476`, `6475`) — matching the modal's `requiredCount=3`.

**Item 2 (Map tile URL drops the year filter): FIXED, live-verified.** Implemented the fix direction
already proposed below: `getLayerTileUrl` (`SymbologyViewLayer.jsx`) now captures any `filter=`
clause already present in the tile URL's query string (via `URLSearchParams`, before the query
string is stripped) and re-appends it alongside any author-configured `serverFilters`, instead of
discarding it unconditionally. Live before/after: on first load (no `?routes=` yet) the Map is
blank as originally reported; after picking 3 routes and reloading the same `?routes=...` URL, the
Map now draws real line geometry for the newly-picked route (screenshot: a real Queens street,
"Laurel Hill Boulevard" near the Queens-Midtown Expy, replacing the original Rochester geometry;
legend shows a real `15/45/80` speed color scale) — this exact scenario was completely blank before
the fix. Only the one `page/.../map/SymbologyViewLayer.jsx` copy was touched — `map_dama/` and
`mapeditor/MapEditor/` have their own separate (drift-prone) copies of the identical function, out
of scope here since neither is implicated in this repro.

**Item 1 (Map: no author-facing "Routes" UI): gate fixed, but that was NOT the whole blocker —
found two more layers underneath, live-verified as real, not fixed.** Changed the `QuickControls`
gate (`src/themes/transportny/components/QuickControls/index.jsx`) from checking
`state?.comparisonSeries?.enabled` (a Graph-specific convenience flag Map's templates never set) to
checking the actual self-binding mechanism directly — an enabled `$self` `comparison_series`
subscriber in `state.display._functions.subscribers`, the same test `useGraphPublish.js`'s
`findSelfBoundGraphs` uses. This part of the original diagnosis was correct and is now fixed.
**But live-testing in edit mode (`/edit/converted_reports/rochester_inner_loop_0`) still shows no
Routes pill on the Map section** — reading `QuickControls`'s full gate
(`isEdit && canEditSection && currentComponent?.useDataSource && isSelfBound && isReportPage(...)`)
turned up a SECOND, independent condition nobody had traced yet: `currentComponent?.useDataSource`.
Map's own ComponentRegistry entry (`ComponentRegistry/map/config.jsx`) never sets `useDataSource`
(or `useDataWrapper`) at all — Map doesn't go through the generic `dataWrapper` HOC the way AVL
Graph/Spreadsheet do; it manages its own `state`/`setState` (via `useImmer`) and calls its own
`onHandle({state, setState, mapAPI})` in `map/index.jsx`. Two consequences, confirmed by reading
the code (not yet fixed, deliberately — see below):
1. `currentComponent?.useDataSource` is falsy for Map, so the AND-gate fails regardless of the
   subscriber fix.
2. Even if that's fixed, Map's `onHandle` call never exposes a `dwAPI` key at all (only `state`/
   `setState`/`mapAPI`) — `section.jsx` reads `dwHandle?.dwAPI`, which would resolve to `undefined`
   → `{}` for Map, and `MeasurePicker`'s `applyMeasurePick`/`applyMeasurePickToState` unconditionally
   call `dwAPI.setState(...)` — so even a rendered Routes pill would throw on click without also
   wiring `dwAPI: { setState }` into Map's `onHandle(...)` (Map's own `setState` is already an
   immer-draft setter with the exact contract `dwAPI.setState` expects, so this part would be a
   small, mechanical addition).

**Did not make either of those two changes this pass — found a third, more fundamental mismatch
that changes the shape of the right fix.** `composeMeasureConfig.js`'s own `GRAPH_TYPE_OPTIONS`
comment states outright: this list is "Deliberately chart-only... a value like 'Table'/'Map' would
be nonsensical: graph_new's renderer has no such graphType." Every QuickControls pill — not just
Measure/Mode — routes through the SAME shared `applyMeasurePick` → `applyMeasurePickToState` →
`composeMeasureConfig` pipeline (confirmed by reading `applyMeasurePickToState`'s body: it always
recomposes `columns`/`join`/`display.colors`/`comparisonSeries.combine` from the full merged pick,
regardless of which single field the clicked pill changed), and that pipeline was explicitly never
designed to handle a Map graph type. `QuickControlsRow` already has narrow, pill-specific Map
handling in a couple of places (`hasMode = graphType !== 'Map' && ...` hides the Mode pill;
`single = graphType === 'Map'` makes the Routes popover single-select) — but nothing prevents the
**Measure** pill from being clicked on a Map card, which would call `composeMeasureConfig` with a
Map-shaped `pick.graphType` and (per that file's own docs) produce nonsensical output, potentially
overwriting the Map's real `symbologies`-based paint config with Graph-shaped `columns`/`join`.
Whether even the Routes-only path is currently safe is unclear without deeper tracing of what
`composeMeasureConfig` returns for an unrecognized `graphType` — not run down further this pass.

**Conclusion or item 1**: this is real, additional feature work — not a one-line gate fix as
originally scoped — needing its own design pass on what QuickControls should even show for a Map
card (most likely: only Routes + When, mirroring `hasMode`'s existing precedent, with
`applyMeasurePickToState` gaining a Map-specific short-circuit that skips the
columns/join/colors/comparisonSeries.combine composition entirely and writes only `_measurePick`).
Deferred, not built. **The core value — a Map correctly self-binding to whatever routes a viewer
picks — already works today** (item 2's fix + the pre-existing, correct `_measurePick`/`routeIds`
conversion-time wiring, confirmed via direct DB read on the real repro page before touching
anything): only the AUTHOR-FACING "change a Map's routes without the CLI" capability remains
blocked.

**Item 4 (Spreadsheet: Route Compare Component / TMC Info Box "never render at all") — could NOT
reproduce live. Recommend downgrading, not treating as an open bug.** Before touching any code,
read every published section's raw `element-data` on the actual repro page directly via `dms raw
get`: **all** self-bound sections — Map, every AVL Graph, the Route Compare Component, both TMC Info
Box sections — already carry a correctly-enabled `$self` `comparison_series` subscriber and a
non-empty `_measurePick.routeIds` (e.g. Route Compare: `['comp-16','comp-17','comp-18','comp-19']`;
Info Box: `['comp-6']`/`['comp-5']`). This rules out the build-path hypothesis this task file's own
"next step" raised (`build_route_info_box_section_state`/`build_route_compare_section_state`, the
`report_build.mjs` spec-driven builders, DO skip writing `_measurePick` — confirmed by reading them
— but these specific sections were built via the old-report/template conversion path, which does not
have that gap). Then reproduced the full live user flow (open the page, fill the entry-gate modal
with 3 fresh routes, confirm): **both sections rendered real rows** — Route Compare Component showed
4 real speed values (under the OLD slot names — see item 5), TMC Info Box showed a real TMC id
(`120P5706`) with real LOTTR/TTTR/freeflow columns for both its AM- and PM-Peak variants. This
directly contradicts the original repro's "[NO SVG]" / "Rows 1 to 0 of 0" observation. No code
change was made that would explain the difference, and git history shows no relevant intervening
commit either — most likely explanation is the original repro's specific picked routes/dates had a
genuine data gap for those measures (a coverage issue, not a binding bug), but this isn't confirmed.
Recommend Ryan re-check with the exact routes/steps that showed the original failure before this
item is treated as still-open; as it stands it does not reproduce.

**Item 5 (frozen titles) — reconfirmed live, unchanged in scope/severity.** The Route Compare
Component table above showed row labels like "I-490 36055 EB AM Peak" for data that was actually
just-resolved from a freshly-picked, unrelated Queens route — confirms `useDynamicReportRoutes.js`'s
documented behavior (a slot's own name is authoritative, never overwritten by the resolved route's
real name unless `isPlaceholderName`) produces exactly the confusing-title symptom this item already
described. Still a deliberate product-design question (generic vs. specific titles for
Dynamic-Report-mode sections), not re-scoped or fixed this pass.

## Root-cause findings (code-read, not yet all live-confirmed per-item)

Investigated via a fresh Explore-agent pass tracing `_measurePick.routeIds` → `useGraphPublish.js`
publish → `pageState.filters` action param → each section's own `comparison_series` subscriber →
runtime consumption. Ruled out several plausible culprits in the generic (non-Map, non-Spreadsheet-
specific) machinery — `usePageFilterSync.js`, `buildUdaConfig.js`'s fan-out, `useDataLoader.js`'s
fetch-key/dedup — all confirmed sound and shared correctly by every section type.

### 1. Map: no author-facing "Routes" UI at all, structurally

`src/themes/transportny/components/QuickControls/index.jsx:43`:
```js
if (!(isEdit && canEditSection && currentComponent?.useDataSource && state?.comparisonSeries?.enabled && isReportPage(siblingSections))) return null;
```
Requires `state?.comparisonSeries?.enabled` truthy before the per-card "Routes" pill renders. But
**Map's element-data schema never has a `comparisonSeries` key at all** —
`scripts/npmrds-reports/convert_old_reports_lib/route_map.py`'s `ensure_route_map_*_template`
functions (e.g. lines 132-147, 402-417, 538-553, 841-856, 964-979) build `state = {"symbologies":
{...}, "display": {...}, ...}` with no `"comparisonSeries"` key anywhere — `comparisonSeries` is a
GraphNew/Spreadsheet (UDA/dataWrapper) concept; Map uses its own `symbologies`/series-template
layer-materialization mechanism (`useComparisonSeriesLayers.js`) that never needed it before.
**Fix direction**: either seed `comparisonSeries: {enabled: true}` alongside the subscriber in
`route_map.py` (a pure UI-gate flag, ignored by the Map's own rendering), or change the
`QuickControls` gate to check the `comparison_series` subscriber directly
(`state?.display?._functions?.subscribers?.some(s => s.functionId==='comparison_series' &&
s.enabled)`) — which is what actually determines self-boundness per `findSelfBoundGraphs` — instead
of the Graph-specific `comparisonSeries.enabled` flag.

### 2. Map: rebuilt tile URL drops the converter-baked year filter

`src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/
SymbologyViewLayer.jsx`, function `getLayerTileUrl` (~line 1592):
```js
const getLayerTileUrl = (tileBase, layerProps) => {
  let newTileUrl = `${tileBase}`;
  if (typeof newTileUrl === "string") {
    newTileUrl = newTileUrl.split("?")[0];   // discards the ENTIRE original query string
  }
  ...
```
Runs on `ViewLayerRender`'s "Change Source" rebuild (~line 331-382, triggered by
`didFilterChange`/`didDynamicFilterChange` — exactly what fires the first time a comparison-series
clone's `layer.filter` is set from a picked route). The converter bakes `?cols=tmc&filter=year=
{year}` into the template's tile URL (`route_map.py` lines 103-104, 345-346, 481-482, 780-781,
909-910 — `GEOMETRY_TILE_VIEWS`'s whole point is per-year network scoping). `getLayerTileUrl`
strips that query string unconditionally and rebuilds only `?cols=`/`&join=` from
`layerProps.filter`/`layerProps.join` — the `filter=year=...` param never gets re-added. The
rebuilt request goes to `serveTile`
(`src/dms/packages/dms-server/src/dama/tiles/tiles.rest.js:300-337`), where `filter` becomes a
literal SQL `AND <filter>` clause (line 122/186/263) and (for the CH join, `getJoinedTileData`'s
`keysSql`, line 177-188) the join's own "which TMCs does this tile contain" key-pass both lose the
year scoping the moment a route is picked and the source rebuilds.

### 3. Map: materialization churn feeding back into itself (lower confidence)

`.../map/useComparisonSeriesLayers.js:256-259` fingerprints `{variants, templates}` to decide
whether to skip regeneration; `templates` is read live out of `state.symbologies[...].symbology.
layers[...]` (line 204-213) — but that same object is ALSO mutated in place by the separate runtime
legend-refresh effect in `map/index.jsx` (~lines 812-1095), which writes
`__runtimeLegendFilterKey`/`__runtimeBaseLegendData`/a recomputed `paint['line-color']` onto every
layer in a visible symbology, including the hidden series-template layer. The first time that write
lands, the mutated fields flow into the fingerprint even though the actual route selection didn't
change, spuriously re-triggering item 2's "Change Source" remove/re-add cycle a second time in quick
succession — plausible explanation for why the legend (a one-shot, content-addressed fetch) settles
correctly while geometry never does. **Fix direction**: strip runtime-only fields (same idea as
`stripRuntimeLegendState` in `map/index.jsx:298-339`) before hashing in
`useComparisonSeriesLayers.js:256-257`.

### 4. Spreadsheet (Route Compare Component / TMC Info Box): generic wiring confirmed sound; specific gap not yet isolated

Confirmed the shared infrastructure is correctly wired in the general case:
- `usePageFilterSync.js:82-118` (the dynamic `comparisonSeries.config` resolver) runs generically
  for every dataWrapper-based section, not Graph-specific.
- Its guard `if (!cs) return` (line 84) needs `state.comparisonSeries` truthy — both
  `route_compare_template.py:126` and every function in `info_box_templates.py` (lines 94, 203, 283,
  401) explicitly carry `"comparisonSeries": base_state.get("comparisonSeries")` forward from the
  base graph template (this exact class of bug — silently dropping `comparisonSeries`/subscribers —
  was found and fixed once already, at round 18; see `info_box_templates.py:16-19`'s own comment).
- `display._functions.subscribers` (the `$self` entry) is likewise copied from
  `base_state["display"]["_functions"]` in every one of these builders.
- `useDataLoader.js:61,235` includes `state.comparisonSeries` in the fetch key, and the converter
  sets `"fetchMode": "force"` (`route_compare_template.py:121`, `info_box_templates.py:84,189,278,
  396`) — `bypassDedup = true` (`useDataLoader.js:249`), so a config change can't be swallowed by
  dedup.
- For old-report (`--report-id`) conversions, `build_graph_section_data`
  (`section_builders.py:518-682`, the function with the `_measurePick` write at lines 646-667) is
  used for Info Box **and** Route Compare sections too — not Graph-specific.

**One concrete gap found, conditional on which build path created the broken sections**:
`build_route_info_box_section_state` (`section_builders.py:99-173`) and
`build_route_compare_section_state` (`section_builders.py:176-205`) — the entry points
`report_build.mjs` uses to build spec-driven Spreadsheet sections directly (not via an old-report
conversion) — clone the template state and return it as-is. **Neither ever writes
`state["display"]["_measurePick"]`.** If the two broken sections on the repro page were created via
this spec-driven path rather than `--template-id`/`--report-id` conversion, `_measurePick` would be
entirely absent at creation time.

**Next step, not yet done**: pull the raw `element-data` for the specific broken Route Compare
Component / TMC Info Box sections on the repro page and check, in order: (1) does
`display._functions.subscribers` contain the `$self` `comparison_series` entry — if absent, never
wired for self-binding at all; (2) does `comparisonSeries.enabled` exist and read true — if false/
absent, `usePageFilterSync.js:84` silently no-ops; (3) is `display._measurePick.routeIds` a
non-empty array reflecting the picked routes — if empty despite a pick, the QuickControls write
path never fired (loops back to the `QuickControls/index.jsx:43` gate above, since Info Box/Compare
sections likely have the exact same `comparisonSeries.enabled`-gate problem Map has in item 1,
just via a different route since they DO carry `comparisonSeries`).

### 5. Frozen titles/legend labels (separate, smaller issue, same underlying theme)

Section titles and Map legend labels are static text baked in at conversion time from the OLD
specific report's route names (e.g. "I-490 36055 EB AM Peak", "Avg. Hours of Delay (2023 - 5 min
2023 - 5 min Inner Loop 2)" — the latter also has an unrelated cosmetic duplicate-token bug, a
2-comp title format applied to a single value) and never update to reflect whatever a Dynamic
Report viewer actually picks. For `--template-id` (Dynamic Report / "slot") conversions
specifically, where the whole point is that any viewer can pick any route, baking in a specific
route's name at title-generation time is arguably wrong by design, not just stale — worth a
product decision on whether template-mode titles should be measure-generic ("Average Speed by Time
of Day") rather than route-specific, separate from fixing the binding gap itself.

### 6. Junk placeholder route names (data debt, not a code bug)

One route in the "Weekly Average" catalog template (old id 225, converted via `--template-id`) is
named **"Long Long Long Long Long Name Here"** verbatim in `reports_snap_2.routes[]` — leftover QA/
test content from whoever built the original old-system template, carried through 1:1 by the
converter with zero curation, and it surfaces as a live section title. Not fixable in code; flagged
here so it isn't rediscovered as a mystery bug later.

## Proposed fix — updated 2026-08-07 after Round 2's live session

1. ~~Fix the `QuickControls` gate (item 1)~~ **PARTIAL, DONE**: gate now checks the real
   subscriber-based self-binding signal instead of `comparisonSeries.enabled`. This did NOT turn
   out to also explain item 4 (item 4 doesn't reproduce at all, see Round 2 findings) and did NOT
   fully unblock Map (two more layers found — `useDataSource`/`dwAPI` shape, and
   `composeMeasureConfig`'s explicit chart-only design — see Round 2 findings for the real scope).
2. ~~Fix `getLayerTileUrl` to preserve the baked `filter=year=...` param (item 2)~~ **DONE,
   live-verified.**
3. Investigate the fingerprint churn (item 3) only if 1+2 don't fully resolve Map rendering —
   **moot**: item 2 alone fully resolved Map geometry rendering live, no churn symptom observed.
4. ~~Pull the actual broken Spreadsheet sections' `element-data`~~ **DONE — found nothing broken.**
   `_measurePick`/subscribers are correctly wired on the actual repro page's Info Box/Route Compare
   sections, and both render real data live. Recommend downgrading this item rather than pursuing a
   `report_build.mjs` builder fix that has no confirmed target.
5. Decide (with Ryan) whether to fix frozen titles (item 5) in this pass or file separately — still
   undecided, reconfirmed live this round, unchanged in scope.
6. Leave item 6 (junk data) alone — data curation, not this task's job.

**New, not in the original scoping — needed before Map's Routes pill can render AND be safely
clickable** (see Round 2 findings' item 1 for the full derivation):
7. Add `useDataSource: true` to `ComponentRegistry/map/config.jsx` (currently unset — this half of
   the QuickControls gate's AND was never traced in the original investigation).
8. Add `dwAPI: { setState }` to the `onHandle({...})` call in `ComponentRegistry/map/index.jsx`
   (Map's own immer `setState` already has the exact contract `applyMeasurePickToState`'s
   `dwAPI.setState(draft => ...)` calls expect — a small, mechanical addition once 7 is done).
9. Give `applyMeasurePickToState` (or `composeMeasureConfig`) real Map-awareness: short-circuit the
   columns/join/colors/comparisonSeries.combine composition entirely for `graphType === 'Map'` and
   write only `_measurePick`, since `GRAPH_TYPE_OPTIONS`'s own comment says Map is "nonsensical" for
   that pipeline. Needs a design decision on which pills even make sense for a Map card (likely just
   Routes + When, mirroring the existing `hasMode` Map exclusion) before writing code — a plan-mode
   pass, not a quick fix.

## Round 3 (2026-08-07) — items 7-9 implemented and live-verified

Picked up the three items Round 2 left open, against `converted_reports/bi_directional` (page
`2209528`, a live catalog page with real Map sections already correctly self-bound —
`_measurePick: {weekdays:{sunday:false,saturday:false}, start:'07:00', end:'19:00',
routeIds:['comp-1']}` confirmed via direct DB read before touching anything).

**Item 7 — DONE.** Added `useDataSource: true` to `ComponentRegistry/map/config.jsx`'s registry
entry. Purely a QuickControls gate signal here (Map doesn't go through the generic dataWrapper HOC
the way AVL Graph/Spreadsheet do), not a request for real dataWrapper wiring.

**Item 8 — DONE.** Added `dwAPI: { setState }` to the `onHandle({state, setState, mapAPI})` call in
`ComponentRegistry/map/index.jsx` (~line 450). Map's own `useImmer` `setState` already has the exact
`draft => {...}` producer-callback contract `dwAPI.setState` callers expect — no adapter needed.

**Live-verified 7+8 together, before touching item 9**: on `bi_directional`'s Route Map section, in
true section-edit mode (via the Settings pencil, not just page-level `/edit/`), the QuickControls
row went from rendering **nothing** to rendering a full 5-pill row (`2016 | TRAVEL TIME | 7A-7P · WD
| 1H | OVERLAY`) — the Routes pill (previously totally absent) now appears. This also **immediately
surfaced a bug beyond what Round 2 anticipated**, addressed by item 9 below.

**Item 9 — DONE, and turned out to need more than the task's own original framing.** The proposed
fix direction assumed `pick.graphType` would already resolve to `'Map'` and just needed
`composeMeasureConfig` to special-case it. Checked live: **neither `state.display.graphType` nor
`state.display._measurePick.graphType` is ever set on a Map section** — confirmed by reading
`route_map.py` (no `graphType`/`_measurePick` key anywhere) and `section_builders.py`'s
`_measurePick` write (`{weekdays, start, end, routeIds}` only, no `graphType`). So
`QuickControlsRow`'s `graphType = state?.display?.graphType || pick.graphType` was silently falling
back to `DEFAULT_PICK.graphType = 'LineGraph'` for every Map card — which is exactly what Round 3's
live screenshot caught (`OVERLAY`, the Mode pill, rendering on a Map card, which should be
impossible). Clicking Measure or Aggregate in that state would have called `composeMeasureConfig`
with a bogus `graphType: 'LineGraph'` and overwritten the Map's real `symbologies`-driven config
with AVL-Graph-shaped `columns`/`join`/`display.colors` — a real corruption risk, not just a missing
pill.

**Fix**, split across two files:
1. `MeasurePicker/index.js`'s `applyMeasurePick`: short-circuits when `currentComponent?.type ===
   'Map'` (the ComponentRegistry's own reliable identity, unlike the unset `graphType` fields) —
   merges `partial` directly onto `state.display._measurePick`'s 4 Map-relevant fields
   (`weekdays`/`start`/`end`/`routeIds`, via a new `MAP_MEASURE_PICK_FIELDS` list), skipping
   `composeMeasureConfig` and the whole columns/join/comparisonSeries-combine/reconcile pipeline
   entirely. Confirmed via `useAddGraphSection.js` (the only other caller of the shared
   `applyMeasurePickToState`) that it already independently guards `if (pick.graphType === 'Map')
   return null` — so `applyMeasurePickToState` genuinely never sees a Map-typed pick from that path;
   `applyMeasurePick`'s new short-circuit is the only place this needed to be added.
2. `QuickControls/index.jsx`: `graphType` now derives from `currentComponent?.type === 'Map'` first,
   falling back to the old `state.display.graphType || pick.graphType` only for non-Map cards. Added
   `hasMeasureAggregate = !isMapCard` and gated the Measure and Aggregate pill defs on it — Map now
   shows **only Routes + When**, matching the design direction from Round 2's own writeup (mirrors
   the existing `hasMode` Map exclusion for the Mode pill).

**Live-verified**: same Route Map section, same page, after the fix — QuickControls row now reads
`2016 | 7A-7P · WD` (Routes + When only, Measure/Aggregate/Mode all correctly gone). Regression-
checked an AVL Graph section on the same page (`Hours of Delay` card, `Type: AVL Graph`) — still
shows the full 5-pill row (`7 ROUTES | TRAVEL TIME | 7A-7P · WD | 1H | OVERLAY`) unchanged. No pill
was clicked on the live catalog page during verification (only Settings-menu/section-edit-mode
navigation, which doesn't mutate state) — clicking Measure/Aggregate/Routes to test the write path
end-to-end would need a dedicated scratch report, not attempted this round.

## Round 4 (2026-08-07) — Ryan's direction for item 5 (frozen titles), not yet implemented

Came up while verifying a sibling change (the converter-route-comp-redesign arc,
`planning/transportny/tasks/completed/converter-route-comp-redesign.md`, DONE 2026-08-07) — that work made template
route-slot names/graph-title suffixes generic (measure/peak/dow/date only, never a specific old
route name, since a Dynamic Report slot can be filled with ANY route) at CONVERSION time. Ryan's
follow-up, verbatim in spirit: once a viewer actually fills a slot, the RUNTIME should do the
analogous thing the OLD templates did at authoring time — use the **viewer-supplied route's own
name** (not any old/frozen name) **plus the slot's own known date** (dates stay fixed/authored on
the slot per this session's other clarification — a viewer supplies `name + tmc_array` only, never
a date) as the comparisonSeries `__series` label / seriesName, and update section titles the same
way — "similar to the old templates, in this case."

This is explicitly framed as a "todo, ideally" — not implemented this session. It's the concrete
resolution direction for this file's own item 5 (proposed-fix step 5, "decide with Ryan whether to
fix frozen titles"): **decided** — yes, fix, and the mechanism is "derive the label from whatever
the viewer picked, not a frozen conversion-time string." Likely touches `useGraphPublish.js`'s
`transformReportRoutes` (where `__series`/comparisonSeries labels currently come from the route
entry's own stored `name`) and whatever renders a section's title string at runtime for
Dynamic-Report-mode pages — needs its own scoping/plan pass before implementation, not attempted
here.

## Files likely touched

- `src/themes/transportny/components/QuickControls/index.jsx` — **DONE** (item 1's gate, Round 1;
  item 9's graphType/pill-set fix, Round 3)
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/
  SymbologyViewLayer.jsx` — **DONE** (item 2)
- `.../ComponentRegistry/map/config.jsx`, `.../map/index.jsx` — **DONE** (items 7-8, Round 3)
- `src/themes/transportny/components/MeasurePicker/index.js` (`applyMeasurePick`) — **DONE** (item 9,
  Round 3 — Map short-circuit)
- `scripts/npmrds-reports/convert_old_reports_lib/section_builders.py` — no longer implicated (item
  4 doesn't reproduce); leave alone unless a real repro turns up
- `.../ComponentRegistry/map/useComparisonSeriesLayers.js` — item 3, moot, not touched

## Testing checklist

- [x] Item 2 fixed, live-verified: Map draws real line geometry after a route pick, on the same
      repro page (`converted_reports/rochester_inner_loop_0`) — screenshot evidence 2026-08-07
- [x] Item 4 root-caused for real (not just conditionally) against the actual broken sections'
      `element-data` — found correctly wired, not broken
- [x] Route Compare Component / TMC Info Box render real rows after a route pick, same repro page —
      confirmed live 2026-08-07 (contradicts the original repro; recommend Ryan re-check before
      treating item 4 as still open)
- [x] Item 1 fixed, live-verified: Map's "Routes" pill appears in edit mode — fixed via items 7-9,
      confirmed live 2026-08-07 on `converted_reports/bi_directional`
- [x] Map's QuickControls row shows only Routes + When (no Measure/Aggregate/Mode) — confirmed live
      2026-08-07
- [x] No regression on AVL Graph's QuickControls row (still 5 pills) — confirmed live 2026-08-07
- [ ] Click-test the Routes/When pills' actual write path end-to-end on a Map card (pick a route via
      the popover, confirm `_measurePick.routeIds` updates and the map redraws) — needs a dedicated
      scratch report, not a live catalog page; not done this round
- [ ] Re-run `report_probe.mjs` against the repro page — section SVG census should go from 1/15 to
      all self-bound sections showing real content (Map now renders; Info Box/Route Compare appear
      to already have; re-run to get a clean numeric baseline)
- [ ] Sweep: are other already-converted `--template-id` pages (the other 11 catalog templates)
      affected the same way for item 2? (Same code path, so yes by construction for the ones that
      use year-scoped Route Map templates — not re-verified per-page.)
