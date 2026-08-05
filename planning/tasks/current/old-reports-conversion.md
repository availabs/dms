# Old NPMRDS reports → new DMS report pages (automated conversion)

> **File structure (since 2026-07-13)**: this file holds (1) the current-state summary, (2) a
> one-line-per-round ledger, (3) the CURRENT round's full detail, and (4) the durable reference
> sections at the bottom. Full round-by-round history for rounds 1–40 lives verbatim in
> [old-reports-conversion-archive.md](./old-reports-conversion-archive.md) — grep it for
> `**Round N` when you need a specific round's detail. **Keep this file lean**: when a new round
> starts, move the previous round's full text to the top of the archive, leave a ledger line here,
> and fold anything durable into the summary or reference sections.

## Current state (2026-08-04, ROUND 69 COMPLETE: fixed 4 live user-reported bugs found browsing a
real converted report (`converted_reports/floating_car_average_day`) — day-of-week x-axis showing
raw ISO integers instead of day names (`graph_new/utils.js` gained a `day_of_week` formatFn,
mirroring the round-61 `epoch_time` fix; wired into `convert_old_reports.py`'s mint + drift
detection, and independently into the live `MeasurePicker/composeMeasureConfig.js` picker path);
GridGraph tooltip showing "NaN" instead of the real TMC/value (`GraphComponent.jsx` was routing the
x-axis formatter into GridGraph's `indexFormat`, which for GridGraph specifically means the Y-AXIS
ROW label, not the x-axis value — fixed to route into `keyFormat` for `graphType === "GridGraph"`
only); Bar Graph Summary not honoring the RRL's per-route custom colors (`graph_new/components/
BarGraph.jsx`'s categorize-less case colored by the shared yAxis column key instead of the bar's own
route-label index — fixed with a colorsByKey-by-index fallback); and comparison-series "anchor" row
not sorting first in Route Compare Component tables (fixed once, generically, in the shared
`dataWrapper/getData.js` fetch path via a stable anchor-first partition, rather than per-component).
Surfaced one important, previously-undocumented platform fact along the way: a page's
`draft_sections` and (published) `sections` arrays reference **entirely different underlying
component row ids** — patching an already-converted page's rendering config live requires patching
both. Full detail: Round 69 below. Also flagged, not fixed: this same GridGraph's y-axis itself (not
the tooltip) shows a single row whose tick literally renders "NaN" — likely a data-shape oddity
(only one row total), not a formatter bug; not yet root-caused. Round 68 (Bar Graph Summary
freeflow-byDateRange wired into convert/analyze, `full`/`full_producible` 229/181, converted_pages_total
35→36), round 67 (Route Line Graph/Route Compare Component resolution-precedence), round 66 (pm3
2018-2020 backfill), round 65 (epoch-tick regression + slug-stability fix), and earlier rounds
remain DONE — full detail archived, see ledger below. Next work: decide whether to build the other
31 newly-mapped-but-not-yet-built freeflow instances (round 68) into pages, root-cause the
single-row GridGraph y-axis NaN, sweep other already-converted reports for the same weekday-format
gap, or pick from the "Immediate next steps" backlog below / a new user ask.)

## Round 69 (2026-08-04) — live user-reported bug sweep on a converted report page: day-of-week axis labels, GridGraph tooltip NaN, Bar Graph Summary colors, comparison-series anchor sort

**Context**: Ryan browsed a real converted report (`converted_reports/floating_car_average_day`)
and reported 4 distinct rendering bugs, flagged as possibly "weirdness from porting over the old
template." All 4 turned out to be real platform bugs (not report-specific misconfiguration) —
three in `@availabs/dms` (graph_new), one split across the Python converter + the live Measure
Picker. Root-caused, fixed, and live-verified against the actual reported page (not a proxy).

**1. Day-of-week x-axis showing raw ISO integers (0-6) instead of day names.** Same class of gap
as the earlier `epoch_time` fix (round 61): the `"weekday"` resolution's xAxis (`toDayOfWeek(ds.date,
1) as weekday`) had no named formatFn wired anywhere, and no `day_of_week` formatFn even existed in
`graph_new/utils.js`'s `ValueFormats` registry. Fixed in 3 places:
- `graph_new/utils.js`: added `dayOfWeekFormat` (ISO 1=Monday..7=Sunday → name) + a `"day_of_week"`
  `ValueFormats` entry, mirroring `makeEpochTimeFormat`/`"epoch_time"`.
- `convert_old_reports.py`: mint path now sets `display.xAxis.format="day_of_week"` +
  `label="Day of Week"` when `spec["xAxis"]` is a dict whose `name === WEEKDAY_EXPR` (mirrors the
  existing `spec["xAxis"] == "epoch"` branch); added matching `weekday_format_drift`/
  `weekday_label_drift` checks to the existing template drift-detection loop so already-minted
  `*_bar_graph_weekday` templates self-heal on next converter run. Ran this manually against all 4
  affected templates (`tmc_speed_bar_graph_weekday` 2189568, `tmc_delay_bar_graph_weekday` 2188680,
  `tmc_travel_time_bar_graph_weekday` 2189550, `tmc_avg_delay_bar_graph_weekday` 2189646) via `dms
  raw update` rather than a full script run (avoided re-running the whole conversion pass for a
  one-field fix).
- `MeasurePicker/composeMeasureConfig.js`: the LIVE in-app picker had the same gap independently —
  `resolutionKey === 'weekday'` fell into the generic "clear stale epoch format" else-branch,
  meaning an author picking "weekday" resolution via the UI (not the Python converter) would hit
  the same bug on a freshly-authored graph. Added a dedicated `'weekday'` branch.

**Live-page fix, separate from the code fix**: the code changes only affect *future* conversions/
authoring — the already-converted `floating_car_average_day` report's Bar Graph section needed its
stored `element-data` patched directly (`dms raw update`) to pick up `format: "day_of_week"`. **This
surfaced a real, previously-undocumented platform fact**: a page's `draft_sections` and `sections`
(published) arrays reference **entirely different underlying component row ids** — not two views of
the same rows. `floating_car_average_day` (page id 2208008)'s `draft_sections` referenced ids
2208009-2208018; its *published* `sections` (what `/converted_reports/...` view-mode actually
renders) referenced ids 2208019-2208028, a **structurally identical but numerically disjoint** set
of component rows. `has_changes: false` on the page row despite this — the two arrays were both
already populated at conversion time (not an edit-then-forgot-to-publish situation), so this isn't
a draft/publish workflow gap, just a fact about where to write when patching an already-converted
page's rendering config directly: **patch both `draft_sections`' and `sections`' referenced rows**
if the fix needs to be visible in view mode immediately (found the hard way — patched only the
draft-side row first, spent significant time ruling out HTTP caching, Vite dep pre-bundling,
localStorage-persisted Falcor cache, and SSR-side caching, before React-fiber-introspecting the
live component's actual `props.state.display.xAxis` and discovering it simply pointed at a
different row than the one I'd edited). Patched both 2208013 (draft) and 2208023 (published) for
this report; live-verified — x-axis now reads "Sunday, Monday, Tuesday, ..., Saturday" with a "Day
of Week" axis label.

**2. TMC Grid Graph tooltip showing "NaN" instead of the real value.** Root cause in
`GraphComponent.jsx`'s `hoverComp` construction: it unconditionally fed the x-axis's named
formatter into *both* `xFormat`/`indexFormat` and `keyFormat`... actually just `indexFormat`,
reasoning "every other chart type (Bar/Grid/Pie/Treemap/Sunburst) reads `indexFormat`" — true for
Bar/Pie/Treemap/Sunburst (whose "index" IS the x-axis category) but **false for GridGraph**, whose
own `DefaultHoverComp` uses `index`/`indexFormat` for the Y-AXIS ROW (e.g. a TMC identifier string)
and `key`/`keyFormat` for the x-axis column value. Feeding `epoch_time`'s formatter (`+d` numeric
coercion) into `indexFormat` for a GridGraph applied it to TMC strings like `"104P11997"`, and
`+"104P11997"` → `NaN` → the formatter's own template literal renders `"NaN:NaN"` for every single
row label. Fixed by branching in `GraphComponent.jsx`'s `hoverComp` memo: `graphType === "GridGraph"`
now routes the x-axis formatter into `keyFormat` instead of `indexFormat` (and added `graphType` to
the memo's dep array). Pure JS fix, no data patch needed. Live-verified: hovering a cell now shows
"11:00" (formatted time header) and "104P11997: 49.6" (real TMC id + value) instead of "NaN:NaN".
**Separate, unresolved finding, not part of the user's original report**: this same GridGraph's
Y-AXIS itself (not the tooltip) shows a single tick labeled literally "NaN" — the grid has exactly
one row (`.avl-grid-horizontal` count = 1), and that row's index value renders as "NaN" on the axis
proper. Not yet root-caused (ruled out the same indexFormat/keyFormat confusion — this is the
*axis*, driven by `yAxis.format`, not `hoverComp`, and yAxis.format is unset/identity here) — flagged
for a future pass, likely a data-shape oddity (why does this per-TMC grid only have one row?) rather
than a formatter bug.

**3. Bar Graph Summary not using the RRL's custom per-route colors** (all bars rendered in one flat
color). Root cause in `graph_new/components/BarGraph.jsx`'s `BarGraphWrapper`: "Bar Graph Summary"
has no `categorize` column by design (round 34 — `xAxis: "__series"` IS the per-route discriminator,
`categorize: False` explicit) — so `dataFromProps`'s `else` branch (no-categorize case) builds `keys`
from the **yAxis data column's own key** (e.g. the speed SQL alias), not the route label. Every bar
ends up with the same single shared `key` and position `ii=0`, so `getColorFunc`'s `colorsByKey[key]`
lookup (keyed by route label) never matches, and every bar falls to the same positional
`colorRange[0]`. Fixed: when `!categoryColumn && props.colorsByKey`, `BarGraphWrapper`'s `colors`
memo now returns a custom color function keyed off each bar's own `index` (which — in this
xAxis="__series" shape — literally IS the route/arm label) instead of the shared stack `key`,
falling back to positional cycling when the index isn't a recognized comparisonSeries label (BC for
ordinary categorize-less bar graphs, e.g. a plain day/hour bucket chart). Pure JS fix. Live-verified:
the 4 bars now render gray/gold/green/pink, exactly matching each route's own RRL color swatch
(previously confirmed via `git status`/`git diff` that this fix — and the day_of_week formatFn/
converter wiring above — had actually been started in an earlier, uncommitted pass this same
session before the verification rabbit hole above; both were completed and verified in this round).

**4. Comparison-series "anchor" route not sorting to the top of the Route Compare Component
tables** — Ryan: "this has come up a bunch of times." Root cause: the `__ANCHOR__(<expr>)` SQL
mechanism already treats "whichever comparison-series variant is FIRST" (`getEffectiveComparisonVariants(...)[0]`)
as the anchor when *building* the query, but the server's cross-arm fan-out union has no `ORDER BY`
(deliberately deferred — see `comparison-series-query-fanout.md`'s "Piece 6," a past attempt at a
client-built `CASE seriesKey WHEN ...` `ORDER BY` was reverted for breaking on quotes/dots in
labels), so returned ROWS land in whatever order the union's sub-queries happen to resolve — not
necessarily anchor-first. Fixed at the single shared fetch point instead of per-component:
`dataWrapper/getData.js`, right before its final return, now stable-partitions `formattedData` so
rows whose `seriesKey` column value equals `getEffectiveComparisonVariants(state.comparisonSeries)[0].label`
sort first — using the exact same effective-variant resolution the SQL itself already uses, so there's
no second, driftable definition of "anchor." No-op (returns data unchanged) for every non-
comparison-series section. Benefits every current/future comparisonSeries-driven consumer (Spreadsheet
Route Compare tables, Bar Graph Summary's bar order, legend/key ordering) from one fix, not four
duplicated ones. Live-verified: both Route Compare tables on the report now show the anchor route
("2024 - 2024 - Rochester Inner Loop...") first, with "% vs Main" reading "→ 0" in that row, followed
by the other routes in their existing relative order.

**Files changed**: `graph_new/utils.js` (day_of_week formatFn), `GraphComponent.jsx` (GridGraph
keyFormat/indexFormat routing), `graph_new/components/BarGraph.jsx` (colorsByKey-by-index fallback),
`dataWrapper/getData.js` (anchor-first stable partition), `MeasurePicker/composeMeasureConfig.js`
(weekday format branch), `convert_old_reports.py` (weekday format mint + drift detection) — plus
live `dms raw update` patches to the 4 weekday-xAxis templates and both draft/published copies of
`floating_car_average_day`'s weekday Bar Graph section.

**Not fixed, flagged above**: the single-row GridGraph y-axis "NaN" tick (separate from the tooltip
bug the user reported); whether OTHER already-converted reports besides this one need the same
live-data patch for their own weekday Bar Graph sections (not swept — only this report's sections
were touched).

## Round ledger (rounds 1–68 archived — full detail in [the archive](./old-reports-conversion-archive.md); round 62 is ledger-only below (full detail lives in "Known functionality gaps"), round 69 is current, full detail above)

- **R68** (07-20): wired `ensure_bar_graph_summary_pm3_template` (Bar Graph Summary
  `freeflow-byDateRange`, source 1410) into `convert_report`/`census_old_reports.py` — dead code
  since round 38, made actionable by round 66's pm3 backfill. `full`/`full_producible` unchanged at
  229/181; mapped instances (excl. pre-2017) 5,162→5,194 (+32); `converted_pages_total` 35→36.
  Live-verified via a real (non-dry-run) conversion of report 316. Full detail: [archive, "Round
  68"](./old-reports-conversion-archive.md).
- **R67** (07-20): read `RouteLineGraph.jsx`/`RouteCompareComponent.jsx`/`GeneralGraphComp.jsx`
  (transportNY) directly to resolve round 63's 159-instance `mixed_resolutions_on_graph` residual —
  confirmed the user's hunch that no policy decision was needed. Route Compare Component's 21 were
  a pure false positive (resolution never read by the real component); Route Line Graph's 121 had
  one fully deterministic old-tool default (first comp's resolution wins). `full` 218→229 (+11),
  `full_producible` 174→181 (+7), mapped instances 5,056→5,162 (+106), `mixed_resolutions_on_graph`
  159→20. Full detail: [archive, "Round 67"](./old-reports-conversion-archive.md).
- **R66** (07-20): pm3 (source 1410) 2018-2020 backfill wired into `PM3_VIEW_BY_YEAR` (user
  backfilled the underlying data outside this session) — `full` 194→218 (+24), `full_producible`
  164→174 (+10), mapped instances (excl. pre-2017) 5,027→5,056 (+29). 2017 deliberately NOT added
  (view is missing all 8 `speed_pctl_*` columns, can't back `freeflow`). Bonus finding:
  `ensure_bar_graph_summary_pm3_template` (Bar Graph Summary × freeflow-byDateRange) is dead code,
  never wired into the convert/analyze pass — the backfill makes 22+1 instances newly
  data-feasible, scoped as a follow-up, not built this round. `converted_pages_total` unchanged
  (35) — pure data-coverage gain, no pages built/reconverted. Full detail: [archive, "Round
  66"](./old-reports-conversion-archive.md).
- **R65** (07-20): fixed a user-reported epoch-tick regression on old report 33 (a pre-round-61
  page) by reconverting it, then found and fixed a second, self-inflicted URL-stability regression
  that very reconversion caused — `convert_report()` was still minting every new/reconverted page
  at the throwaway `report_<old_id>` slug scheme instead of the stable `converted_reports/<title>`
  scheme 34/37 live pages already converge to; new `compute_report_slug()`/`to_snake_case()` (exact
  ports of the admin UI's own `getUrlSlug()`/`toSnakeCase()`) fix it for good — a page's slug is now
  BORN on the stable scheme. Closes the write-side half of round 63's `url_slug` gap. Full detail:
  [archive, "Round 65"](./old-reports-conversion-archive.md).
- **R63** (07-17): corrected the stale "392 mixed-resolution" figure (real remaining count: 159,
  concentrated in Route Line Graph) and fixed the `url_slug`-based idempotency/census bug that let
  2 duplicate converted pages accumulate — `find_page_by_old_report_id()`/`fetch_converted_pages()`
  now key off the durable `_converted_from_old_report_id` field instead of `url_slug`. Only fixed
  the *read side*; round 65 found and fixed the *write side* (`convert_report()` still minted new
  pages at `report_<old_id>`). Full detail: [archive, "Round 63"](./old-reports-conversion-archive.md).
- **R64** (07-20): follow-up cleanup — minted a fresh token and ran `cleanup_duplicate_pages.py`;
  found both stale pages had already been deleted by an untracked session, which crashed
  `delete_converted_page()` with an `AttributeError` (fixed: now prints "not found, skipping").
  Census confirmed `converted_pages_total: 35`, no duplicates remain. See item (m) above.
- **R62** (07-17): axis-label (title/caption) fix — user-reported 2026-07-13 gap, root-caused as
  a converter omission (the render path already worked) rather than the round-34/60 squeeze bug.
  `display.yAxis.label` now set from the yAxis column's own `customName`; `display.xAxis.label =
  "Time of Day"` for every epoch-axis spec; 6 `AVG_DELAY_EXPR` specs that had no `customName` at
  all got one. Live-verified on report 787 (page `2194270`); full census rerun (869/869, 0
  errors) byte-identical mapping stats. See "Known functionality gaps" above for full detail.
- **R61** (07-17): epoch→HH:MM x-axis tick format shipped (the last round-53 priority-list item) —
  new `epoch_time` `ValueFormats` entry + xAxis named-formatFn wiring in `GraphComponent.jsx`
  (generic, author-facing, mirrors the existing yAxis Tick Format select) + converter default-set
  across every `"xAxis": "epoch"` TEMPLATE_SPECS entry via drift detection. Live-verified on
  reports 179 (page `2194183`) and 787 (page `2194197`), exact tick-value math confirmed on both.
  Full census rerun (869/869, 0 errors) byte-identical mapping stats. All 9 round-53 triage items
  closed as of this round. Full detail: [archive, "Round 61"](./old-reports-conversion-archive.md).
- **R60** (07-17): legend/flex width-squeeze (parked since round 34) un-parked and fixed
  platform-wide via a dynamically-measured guard (`useLegendSqueezeGuard`, `getBoundingClientRect`
  at render time), not a static CSS cap — a page whose legend already fits renders a
  byte-identical className to before, confirmed live (report_1033); previously-squeezed sections
  (report_787) improved from ~181-195px to 243px chart width. Applied uniformly to all 5
  content-driven-legend wrapper types (Bar/Line/Pie/Sunburst/Treemap Graph); GridGraph excluded
  (already safe, fixed-width linear legend only). Full detail: [archive, "Round
  60"](./old-reports-conversion-archive.md).
- **R59** (07-17): TMC meta join source swapped off the frozen 2025-only snapshot (1946/3298)
  onto the year-matched `NPMRDS_V6_tmc_meta` (582/983, compound `tmc + toYear(ds.date)=year` key)
  — fixes hoursOfDelay/avgHoursOfDelay/co2Emissions/avgCo2Emissions for every non-2025-dated
  report (a 2019 spot-check found 46.5% of TMCs had a different `aadt` under the old frozen
  join). 2017 rows (missing from 582/983) now null out cleanly via `nullIf` guards instead of
  reading as a wrong zero. Two pre-existing drift-detection gaps found & fixed along the way
  (`ensure_graph_templates` never refreshed `join` on drift; `ensure_info_box_delay_template` had
  no drift detection at all). Live-verified on 775/787/751/1033/179; census unchanged (869/869, 0
  errors) as expected for a correctness-only fix. Full detail: [archive, "Round
  59"](./old-reports-conversion-archive.md).
- **R58** (07-17): Info Box travel-time mm:ss formatter shipped (item 7, priority-list #7) — new
  generic `minutes_clock` formatFn entry (shared registry, every Card/Table cell app-wide);
  `ensure_info_box_traveltime_template` gained real column-drift detection (was static); live-
  verified on report 181 (page `2194036`), M:SS hand-checked exact against raw CH values. Full
  detail: [archive, "Round 58"](./old-reports-conversion-archive.md).
- **R57** (07-17): GridGraph missing-data color fix shipped (item 3, priority-list #5) — missing
  cells now render black (author-overridable via a new "Missing Data Color" config field) instead
  of transparent; live-verified on report 584 (page `2193032`) via a before/after stash comparison.
  Same-round follow-up: no-data TMCs also filtered out of the GridGraph hover tooltip list, user-
  confirmed live. Full detail: [archive, "Round 57"](./old-reports-conversion-archive.md).
- **R56** (07-17): graph title default fix shipped (item 8's title half, priority-list #4) — empty/
  missing `state.title` in `analyze_graph()` now defaults to the old client's own template
  `"{type}, {data}"` instead of a blank section header; live-verified on report 520 (reconverted
  `--replace` → page `2194026`, both sections now show real titles); full census rerun (869/869, 0
  errors) unchanged as expected for a pure title-string fix. Full detail: [archive, "Round
  56"](./old-reports-conversion-archive.md).
- **R55** (07-17): report 7's pre-2017-only converted page (`2191132`, surfaced by round 54's
  restored census) deleted per user go-ahead; BarGraph tooltip customName fix shipped
  (`graph_new/components/BarGraph.jsx` — hoisted `labelForKey` into a new `hoverComp`, mirroring
  `LineGraph`'s existing customName-aware tooltip), live-verified on reports 520 and 787. Full
  detail: [archive, "Round 55"](./old-reports-conversion-archive.md).
- **R54** (07-16): rebuilt the pre-2017-only report-level refusal that R53 found had regressed
  (`PRE_2017_CUTOFF`/`report_is_pre_2017_only`/`pre_2017_only`), live-verified against the 4
  reports it used to block + false-positive-checked against report 191 and 3 known-good pages;
  full census rerun (869/869, 0 errors) surfaced one more live pre-2017-only page (report 7,
  `2191132`) — deleted round 55. Full detail: [archive, "Round 54"](./old-reports-conversion-archive.md).
- **R53** (07-16): user's 9-item triage punch list, all 9 items + 2 bonus findings root-caused
  (stray duplicate `reports_snap_2` rows on 6 pages — deleted same-day follow-up; the pre-2017-only
  report-level refusal found to have silently regressed; BarGraph tooltip/graph-title/GridGraph
  color/Info-Box formatter/epoch-axis/TMC-meta-join fixes all root-caused but not yet built).
  Full detail: [archive, "Round 53 triage"](./old-reports-conversion-archive.md).
- **R52** (07-16): Route Difference Graph + TMC Difference Grid scoped (user endorsed all 4 open
  questions same day) and BUILT same-day — a new `comparisonSeries` "difference" combine mode
  (server-side INNER JOIN of each non-anchor arm to the anchor on group-by columns, dms-server +
  client forwarding, library-isolated) + diverging BarGraph/GridGraph rendering (zero-centered
  y-domain and `byValueSymmetric` colors) + converter templates for every buildable
  measure×resolution bucket (speed/travelTime/hoursOfDelay/avgHoursOfDelay/CO2, 5-min/15-min/day,
  truck+passenger). Live-verified on reports 584/354/1037/1039, ground-truthed bit-exact against
  hand-built two-arm ClickHouse subtractions. Census: `full` 217→261, `full_producible` 188→231
  (+43), `converted_pages_total` 36. Deliberately NOT built (44 instances, gap-logged):
  hoursOfDelay×truck (volume term), combined-fleet CO2, a `SPEED` typo instance, 3
  mixed-pair-dataColumn degenerates. Bonus platform fix: a colorDomain join-key double-projection
  bug (ambiguous `tmc` column) found & fixed. Full detail: [archive, "Round
  52"](./old-reports-conversion-archive.md).
- **R51** (07-15): 4 user-reported display bugs fixed & live-verified (backwards color scales
  outside Map — `REVERSE_COLORS_MEASURES` generalization of the round-50 constant, applied in
  the generic `COLOR_RANGE_GRAPH_TYPES` wiring, 14 reports reconverted; duplicate identical
  RouteMap legend blocks — 2 compounding causes in `useComparisonSeriesLayers.js` + the 4
  choropleth TEMPLATE_SPECS' `legend-orientation`; minutes-vs-seconds legend readability —
  `formatMinutesAuto` + `display.tooltip.minutesAutoSeconds`; bonus latent shared-palette
  `.reverse()` mutation fix in 5 graph types). **Same-day follow-up**: `TILE_HOST` auto-detect
  (TCP probe of localhost:3001, `DMS_TILE_HOST` env still wins — forgetting the override on
  CONVERT commands had silently baked 10 reconverted pages to production that round); and the
  multi-comp RouteMap design question resolved+built — same-route comps are now exclusive like
  the old tool (`dedupeVariantsByGeometry` in `useComparisonSeriesLayers.js`, mirrors old
  RouteMap's tmcArray-identity guard, runtime-only, verified via tile-request capture on
  report_775). Legend/paint off-by-one root-caused but HELD BACK per user scope pick. Census
  clean (869/869, 0 errors), 32 pages. Full detail in the archive.
- **R50** (07-15): **Route Map M3 CLOSED** — travelTime + avgHoursOfDelay (day & 5-min keyed) +
  hoursOfDelay choropleths all BUILT & LIVE-VERIFIED (`full_producible` 184→188); choropleth
  legend bug fixed (missing `layer-type: "choropleth"` → bare title rows instead of a
  StepLegend ramp); travelTime color-direction correction (old `getColorRange()` applies
  `reverseColors` BEFORE RouteMap sees the ramp — the first "faithful port, no reversal" call
  was wrong; `ROUTE_MAP_REVERSE_COLORS_MEASURES` added); `build_ch_join_wire()`
  calculated-dsColumn bug fixed on the live TILE endpoint (was silently degrading two-source
  delay joins to geometry-only tiles → invisible TMCs on reports 1033/1056, user-confirmed
  fixed live); 2 same-round self-inflicted regressions caught before shipping (speed-template
  tail truncation, `slug` loop-variable clobber). Full detail in the archive.
- **R49** (07-15): Route Map M2 built & live-verified — converter speed choropleth (previously
  #1-ranked unmapped bucket, 256/214/45, now fully absorbed). Two real platform gaps found &
  fixed (nested-join forwarding silently dropped on tile/colorDomain requests; live re-break only
  updated the legend text, never the paint itself) + a converter join-shape bug that crashed the
  entire dms-server process outright (fixed via new `build_ch_join_wire()`). `DMS_TILE_HOST` env
  override added for local tile verification. Census: `full_producible` 122→184, instances mapped
  61.9%→69.2%. Full detail: [archive, "Round 49"](./old-reports-conversion-archive.md).
- **R48** (07-15): Route Map M1 built & live-verified — dms-server ClickHouse join sources for
  tiles + colorDomain (library task `tile-join-clickhouse-source.md`), unfiltered-CH-join
  scan-hazard refusal, >20k-key geometry-only fallback with a loud log. Full detail: [archive,
  "Round 48"](./old-reports-conversion-archive.md).
- **R47** (07-14): Route Map M0a+M0b built & live-verified — `comparison_series` subscriber
  runtime for the Map section (library) + per-year none-map converter templates. Census: full
  101→126 (+25 flips from none-maps alone). Full detail: [archive, "Round
  47"](./old-reports-conversion-archive.md).
- **R46** (07-14): map-component-unification update landed upstream; Route Map plan re-verified
  against it (v2.2) — no material change, M0a shrinks to ~1 round since the Map now ships
  `display._functions` pub/sub natively. No code this round. Full detail: [archive, "Round
  46"](./old-reports-conversion-archive.md).
- **R45** (07-14): Route Map work plan v2.1 amendment — user rejected static interactivity; traced
  the real mechanism (`comparison_series` subscriber via RRL, not the page-filter sync the Map
  excludes) and redesigned the bridge as series-driven symbology layers. No code. Full detail:
  [archive, "Round 45"](./old-reports-conversion-archive.md).
- **R44** (07-14): Route Map work plan v2 scoped (no code) — phases M0 none-maps / M1 dms-server
  CH-join source / M2 speed (78 flips) / M3 remaining measures (+4); per-year TMC geometry tile
  views already exist so year-pinning dissolves. Full detail: [archive, "Round
  44"](./old-reports-conversion-archive.md).
- **R43** (07-14): Route Map recommendation revised (user-prompted second look) — round 41's
  vetting had checked the wrong tile server; the dev stack's real tile server (dms-server itself)
  already implements the symbology `join=` param. Real remaining gap: CH join sources aren't
  supported server-side yet (became M1). No code. Full detail: [archive, "Round
  43"](./old-reports-conversion-archive.md).
- **R42** (07-14): TMC Grid Graph per-TMC breakdown bug fixed (user-caught on report 914's
  "Winter Average Day" — was rendering one aggregate strip instead of per-TMC rows) + corpus
  sweep (320/751/315/1045 reconverted, all clean); ground-truthed exactly against ClickHouse.
- **R41** (07-14): Route Map scoped (no code) — read `RouteMap.jsx` for real + corpus survey (849
  instances/636 reports; speed 655/none 97/travelTime 44/delay 35/pm3-gated 17); found per-TMC
  geometry already reachable via the default 455/3464 join, no new tile/fetch layer needed.
  Initial plan (later revised in R43): new `MapGraph` AVL Graph type. Full detail: [archive,
  "Round 41"](./old-reports-conversion-archive.md).
- **R40** (07-14): cleanup (g)+(h) closed (report 745/191/pre-2017 pages); Info Box
  `length`/`travelTime`/`aadt`/`hoursOfDelay` measures built (4 new buckets); a real
  `graph_comps[].id` gid-collision bug found + fixed (synthetic `graph-idx-{i}` fallback) — see
  archive for full detail.
- **R39** (07-14): pre-2017-only report-level skip built (`PRE_2017_CUTOFF`,
  `report_is_pre_2017_only`) + census mirror; 133/868 reports (15.3%) are pre-2017-only —
  excluding them, only 59 full (not 101) / 3,801/6,520 mapped (58.3%); shell page
  874→`2188794` deleted (`converted_pages_total` 26→25); 4 already-converted pages found to be
  pre-2017-only (16/54/58/142), surfaced not deleted.
- **R38** (07-14): Phase B — avgTT-byDateRange alias (B1) + Route Info Box avgTT-byDateRange
  static template (B3, 38 flips materialized) + Bar Graph Summary freeflow-byDateRange pm3
  template (B2, mechanism proven, 0 real corpus flips — pre-2019 corpus dates outside 1410's
  coverage). 63→101 full, 58.1% mapped.
- **R37** (07-13): census refresh + round-33 report-level mirror; 63/669/122/14, 56.8% mapped;
  213 `no_valid_routes` shells enumerated corpus-wide; only converted shell is 874→`2188794`
  (deletion pending, user to run).
- **R36** (07-13): Bar Graph Summary Phase A completed (travelTime / hoursOfDelay /
  avgHoursOfDelay incl. per-resolution composite-map-key expression — first lambda-bearing
  calculated column); 787→`2190210`, 320→`2190225`, 1061 reconverted →`2190527`; 15/15 live
  values ground-truthed exactly; weekday variant spec-only (lone instance = report 1028);
  width-squeeze diagnosed page-wide (stays PARKED); report 678 found route_missing_everywhere.
- **R35** (07-13): SPEED_EXPR/TRAVEL_TIME_EXPR two-level backport to all 16 live speed/TT
  templates (fn "exempt" + customName; grid templates were invisible to drift detection —
  fixed); 15 reports reconverted + Playwright-verified, 184/184 live values match two-step
  ground truth exactly; travel time now route-traversal MINUTES; 471 deleted
  (`no_valid_routes`); page ids in Artifacts section.
- **R34** (07-13): Bar Graph Summary scoped (649 instances; Phase A/B mapping, 96% coverage path);
  old two-level speed/TT semantics LIVE-CONFIRMED against the old UI (23.03 vs the platform's
  26.02, +13% — flat map-combinator expressions proven equal to ground truth; backport spec
  user-endorsed → round 35). Speed summary variant BUILT + live-verified on report 520 (page
  `2189837`, values <0.2% off CH ground truth): comp display-name substitution ported
  (`getRouteCompName`), `AGGREGATE_FNS` "exempt" platform fix (buildUdaConfig.js + test), legend
  flex-squeeze mechanism pinned (template-side `legend.show=False` + customName; platform fix
  parked). Known cosmetic deltas: single-color bars, bar order, padding.
- **R33** (07-10): `route_missing_everywhere` × `categorize:"tmc"` = live unfiltered-TMC-scan crash
  (`MaxPathsExceededError`, 13.2M paths) — fixed (`graphIds: []` for tmc-less routes +
  report-level `no_valid_routes` skip); reports 1032/392 deleted as permanently-empty shells; also
  fixed `load_graph_templates()` default `--limit 20` silently dropping the 2 base templates.
- **R32** (07-10): `avgHoursOfDelay` built + live-verified (per-resolution bucket-grain derivation).
- **R31** (07-10): Info Box resolution-ambiguity false positive fixed — resolution-irrelevant
  measures bypass the mixed-resolution guard.
- **R30** (07-10): `byValue` color-scale gap root-caused, NOT fixed (investigation only, per user).
- **R29** (07-10): Route Bar Graph speed/travelTime at every missing resolution — built,
  live-verified (Phase 1 of the census "buildable" lever).
- **R28** (07-10): `DELAY_EXPR` 0-as-missing fix — built, live-verified.
- **R27** (07-10): fresh corpus census (fixed the stale census script first). Headline: 46 full /
  559 partial / 249 none; 27.3% instances mapped; buildable bucket 2,450 unchanged; no_equivalent
  ranking = Route Map 849 / Bar Graph Summary 649 / Route Difference 199 / TMC Difference Grid 143.
- **R26** (07-10): Route Compare anchor row fixed (user-caught; round 25's Playwright pass missed it).
- **R25** (07-10): Route Compare Component built + live-verified; new generic `__ANCHOR__(...)`
  cross-arm mechanism; fixed missing-`fn` silently blocking a section's fetch.
- **R24** (07-10): user reprioritization — reopened Route Map / Bar Graph Summary / Route
  Difference / TMC Difference Grid / `overrides.baseSpeed`; set the show-plan-first process rule.
- **R23** (07-10): 0-as-missing sweep on `SPEED_EXPR` + `tmc_travel_time_bar_graph_day` — built,
  live-verified.
- **R22** (07-10): freeflow (`speed_pctl_85`) wired into the Info Box templates.
- **R21** (07-10): two stale next-candidates closed; per-report/per-comp reliability BIN selection
  built (was hardcoded `amp`).
- **R20** (07-10): Route Info Box pagination-length bug fixed (raw-count length fan-out).
- **R19** (07-09): generalized per-report/per-year Info Box template selection (`graph_max_year`);
  no more hand-built-per-report templates.
- **R18** (07-09): first real `pgFederated` use — LOTTR/TTTR live on report 1045; `Attribution.jsx`
  platform fix; continued: build relabeled Route Info Box (not TMC — grain is one row per ROUTE).
- **R17** (07-09): 1410's TMC-id column confirmed; product decision — reliability shows
  current/correct pm3 values, not faithful old-math replicas.
- **R16** (07-09): `pgFederated` join source built — `buildJoin` recognizes an inline
  `postgresql()` join source, creds resolved server-side from the pgEnv config.
- **R15** (07-09): investigated reusing existing PM3/MAP21 sources (1722/2001/1410) vs recomputing —
  led to the join approach.
- **R14** (07-09): freeflow `quantile()` prototype — surfaced the two-stage-aggregation platform
  gap (percentile-of-percentile not expressible; still the blocker for percentile indices).
- **R13** (07-09): Info Box family scoped (read all old components first); continued:
  `authoritative_freeflow` blocker dissolved via the DAMA pm3/map21 pipeline.
- **R12** (07-09): Hours of Delay stragglers (day/hour/15-min/month) built; corpus data-coverage
  finding; (report 392's conversion here was later found empty and deleted in R33).
- **R11** (07-09): Hours of Delay Graph 5-minutes built + live-verified; first `categorize:"tmc"`
  template minted.
- **R10** (07-08): first full-corpus gap census (`census_old_reports.py`, all 868 reports).
- **R9** (07-08): truck CO₂ NULL root-caused — CH stores 0 not NULL for missing; fixed with
  `coalesce(nullIf(col,0), nullIf(fallback,0))`; continued: `overrides.aadt` done + live-verified.
- **R8** (07-08): Falcor sibling-cache-collision fixed (own task file, completed); exposed the
  truck-CO₂ NULL as a separate real bug.
- **R7** (07-08): color rendering root causes — GridGraph palette truncation fixed via new shared
  `buildValueColorScale`; BarGraph gained `colors.byValue` mode + SectionMenu toggle.
- **R6** (07-08): `color_range` wiring + `graph_layout` width → section `size` (theme
  `transportnyv2`); all 6 pilot reports re-run; ClickHouse unfiltered-probe hazard found/fixed
  mid-round (own task file).
- **R5** (07-08): CO₂ emissions calculated column built; report 751 converted; query-cache
  collision found (became R8's task).
- **R4** (07-08): weighted Hours-of-Delay built; CH ambiguous-identifier fix on 3-way joins
  (`handleFilterGroupsCH` join-aware qualification).
- **R3** (07-08): reports 1061/1045/874 converted; non-deterministic resolution/dataColumn
  selection bug fixed; AM/PM/off-peak flags proven query-inert (not a gap); calculated-join-key
  fix in `buildUdaConfig.js`.
- **R2** (07-08): report 1071 converted — 11/13 graphs live.
- **R1** (07-08): report 1070 converted end-to-end — first proof of the whole pipeline.


## Objective

Replace the old Reports/Routes tools (`npmrds.devtny.org/reports`) while **preserving as much old
report data as possible**. Write automated, repeatable script(s) that pull old reports from the old
DB, transform them, and create equivalent report pages in the new DMS system. Conversion first;
authoring UI ergonomics explicitly deferred — a large flat pile of graph templates is acceptable,
**provided every template stays describable by `TEMPLATE_SPECS` parameters** (see the 2026-07-13
strategic frame in the standing directives: the catalog + its selection vocabulary IS the end
product; the future authoring UI coalesces author selections into templates and rides native DMS
page edit/publish/layout).

## Data access (verified working)

- **Old DB**: Postgres `npmrds_production` @ `mercury.availabs.org:5533`, schema `admin2`.
  Credentials: `/home/ryan/code/avail-falcor/db_service/npmrds.config.json` (user `npmrds_admin`).
  Served in the old app by falcor routes `reports2`/`routes2`/`templates2` →
  `avail-falcor/routes/folders2.route.js` → `services/folders2Controller.js`.
- **New DB**: Postgres `dms3` @ `mercury.availabs.org:5435`, schema `dms_npmrdsv5` (per-app split
  mode). Credentials: `src/dms/packages/dms-server/src/db/configs/dms-mercury-3.config.json`.
  App `npmrdsv5`, site type `dev2`, local dms-server at `http://localhost:3001`.
- **DMS CLI**: `DMS_HOST=http://localhost:3001 DMS_APP=npmrdsv5 DMS_TYPE=dev2 dms ...`.
  Reads and **creates work unauthenticated**; `delete` (and possibly some updates) require an auth
  token (`DMS_AUTH_TOKEN`, mint via `POST /auth/login` on the local server with real creds).
  For inspecting/patching pages don't hand-roll scripts: `dms page dump <id> --sections` resolves
  section states in one call; `dms raw update <id> --set nested.key=value` does dot-notation deep
  patches. (Deep edits inside *stringified* element-data still need a read-modify-write, but
  prefer reconverting the page via the converter over hand-patching.)
- **Stack preflight**: `python3 scripts/npmrds-reports/preflight.py` — one command checks vite, dms-server
  (/graph roundtrip), all three Postgres targets, ClickHouse, stray CH queries >60s (the
  unfiltered-scan hazard), and recent dms-server log errors. ~1s when healthy; fails fast with a
  VPN diagnosis instead of hanging. Run at session start or whenever anything hangs.
  `python3 scripts/npmrds-reports/dbq.py chprocs` runs just the stray-CH-query check (use before/after live
  report-page loads).
- **Ad-hoc queries / data validation**: `python3 scripts/npmrds-reports/dbq.py <old|new|dama|ch|graph|oldgraph> "<sql-or-paths>"`
  — one read-only runner for all backends (old/new/dama Postgres, ClickHouse HTTP, local +
  prod falcor). Creds read at runtime from the config files above; pg forced
  `default_transaction_read_only=on`, CH `readonly=2`, no write flag exists; 5s connect
  timeout with VPN hint instead of hanging. Bespoke validation scripts should `import dbq`
  (from `scripts/`) instead of re-implementing psql/CH/falcor boilerplate. Writes still go
  only through `convert_old_reports.py`, the dms CLI, or the user.
- **Live page verification**: `node scripts/npmrds-reports/report_probe.mjs <slug>` (repo root of dms-template) —
  single parameterized Playwright harness replacing the old one-off scratchpad scripts. One load
  collects console/page errors, non-200s, pending-at-close requests (hung/unbounded-query
  tripwire), decoded `/graph` traffic (`--grep` to filter), per-section SVG census, full-page +
  `--section` screenshots, JSON dump to `scratchpad/npmrds-sub/tmp/probe_<slug>.{png,json}`.
  Custom probes via `--eval file.mjs` (`export default async (page) => ...`); if the same eval
  probe is needed twice, promote it to a flag in the harness instead of forking. `--auth`
  injects the minted token (`scratchpad/npmrds-sub/.dms-auth-token`, refresh via user-run
  `mint_token.sh`) into `localStorage.userToken` for logged-in/edit-mode probes.

## Old shape (`admin2.*`, source of truth — convert from here, NOT from `routes_snapshot`)

Counts: **868 reports, 49,212 routes, 216 templates**. Only 2 reports have `station_comps`; only 13
route-group comps exist — both are edge cases, not v1 blockers.

- `admin2.reports`: `id, name, description, route_comps jsonb, graph_comps jsonb, station_comps
  jsonb, color_range jsonb, created_by, created_at, updated_at, thumbnail, pic`
- `admin2.routes`: `id, name, description, tmc_array jsonb, points jsonb, conflation_array jsonb,
  conflation_version, created_by, created_at, updated_at, metadata jsonb`
- `admin2.templates`: like reports + `routes int, stations int, default_type`
- `route_comps[]` entry: `{name, type: 'route'|'group', color, compId: 'comp-N', isValid, routeId,
  settings, inRouteGroup}` where `settings` = `{year, month, startDate: 20250101, endDate,
  startTime: '07:00', endTime, weekdays: {monday…sunday bools}, amPeak, pmPeak, offPeak,
  dataColumn, resolution, overrides, relativeDate, compTitle, …}`
- `graph_comps[]` entry: `{id: 'graph-comp-N', type: '<display name>', state: {…graph-specific},
  layout: {x,y,w,h}}` (react-grid-layout 12-col grid)

Distribution surveys (define the conversion matrix):

- **Graph types** (23 distinct): Route Bar Graph 2245, Route Line Graph 1085, Route Map 849, TMC
  Grid Graph 746, Bar Graph Summary 649, Route Info Box 412, TMC Info Box 264, Route Compare 226,
  Route Difference 199, TMC Difference Grid 143, Hours of Delay 138, Traffic Volume 51, then a long
  tail ≤30 each.
- **Resolutions**: 5-minutes 3426, day 779, hour 330, weekday 238, month 185, 15-minutes 167,
  year 13, NONE 3.
- **dataColumn**: travel_time_all 5013, travel_time_truck 115, travel_time_passenger 13.
- **displayData** (CORRECTION 2026-07-07 — a dimension the first survey missed): `dataColumn` only
  picks which raw travel-time column feeds a route; the *measure a graph displays* is per-graph
  `state.displayData` (defaults to `['speed']`, registry in old
  `tmc_graphs/utils/dataTypes.js`): speed, travelTime, hoursOfDelay/avgHoursOfDelay,
  co2Emissions/avgCo2Emissions, dataQuality, reliability indices (avgTT, freeflow,
  percentile95/97, bufferTime, planningTime, miseryIndex, travelTimeIndex — each also in a
  `-byDateRange` variant), and TMC attributes (length, avg_speedlimit, aadt, vmt). Usage across
  reports: 4,140 graph instances carry explicit displayData (top: travelTime, speed,
  hoursOfDelay/avg, planningTime, freeflow-byDateRange, percentile95-byDateRange, length, aadt);
  2,957 rely on the per-type default. **The template matrix key is therefore
  (graph type × displayData measure × resolution × dataColumn)** — measures become calculated
  columns (like the existing `(miles*3600)/travel_time` speed calc); some need inputs from the
  joined TMC-identification table (aadt, avg_speedlimit, miles) or derived references
  (freeflow for delay, emission factors for CO₂ — formulas live in the old dataTypes.js).
  **User direction (2026-07-07): derived references like freeflow already exist in a table
  somewhere — JOIN them in, do not recompute them.** (Find the table; ask the user if it doesn't
  turn up.)
- **Approved gap-coverage picks (2026-07-07), in order**: 1071 "WB East-West Arterial
  Poughkeepsie" (Route Bar Graph ×3 flavors, Route Map, Route Info Box, day resolution, partial
  peaks) → 751 "Van Wyck CO2 Test Single TMC" (CO₂, truck/passenger columns, difference graphs) →
  1061 "Single Route Before and After" (before/after date windows, hour+day) → 1045 "Rochester
  Inner Loop" (month+weekday resolutions, dataQuality) → 874 "Zizhao_119EB_Delay_AADT" (AADT from
  the join table, mixed dataColumns).
  Note: bulk-converting all 868 reports is explicitly NOT the goal — the goal is building the
  conversion *capability*; reports are chosen by gap coverage.

## New shape (verified live on page_10 = page `2187523`)

A report is a page (`npmrds_sub|page`) created from the **Report Page** page template
(`npmrds_sub|page_template` row `2187021` — full dump in scratchpad). Its parts:

1. **Page row** with sections (each an `npmrds_sub|component` row): one `ReportRouteList`
   (sidebar group), N × `AVL Graph`, optional "Add a Route" Spreadsheet.
2. **`reports_snap_2` row** — app `npmrdsv5`, type `reports_snap_2|2177440:data` (split table
   `data_items__s2177438_v2177440_reports_snap_2`): `{report_id: '<page id>', routes: '<JSON
   string>'}`. Each route entry: `{name, route_id, tmc_array: '<JSON string>', description,
   points, metadata, conflation_*, created_*, updated_at, isValid, route_comp_id: 'comp-N',
   graphIds: [<graph section trackingIds>], startDate?, endDate?: 'YYYY-MM-DD[THH:mm]'}`.
   Extra keys survive (schema-free `:data` row) — stash unconvertible old settings here.
3. **AVL Graph sections** get state from an `npmrds_sub|avl_graph_template` row
   (`{name, slug, stateJson, layoutJson, elementType: 'AVL Graph', …}`;
   `stateJson` = `{externalSource, columns, filters, display, join, customBuckets,
   comparisonSeries}`). Existing 3 templates (all 5-min epoch, all-vehicles):
   `tmc_travel_time_line_graph` 2187310, `tmc_speed_line_graph` 2187296, `tmc_speed_grid_graph`
   2187311. All bind NPMRDS Production V6 (src 583 / view 982, env npmrds2) joined to TMC
   Identification (455/3464) on `tmc`, with a `comparison_series` subscriber
   (`paramKey: '$self'`) and `__series` categorize column.
4. Route→graph binding: `transformReportRoutes()` (`ReportRouteList.jsx:9`) turns each assigned
   route into `{label, filters: {AND: [tmc IN tmc_array, date IN <day range>, epoch IN <epoch
   range>]}}` published to each graph's self-resolved action param.

New route catalog: dataset `Routes Data` src `2107426` / view `2107427` (64,785 rows, keyed
`route_id`) — a point-in-time import of old `admin2.routes`; **routes created after ~June 2025 are
missing** (e.g. old route 268042 used by report 1070). Converter must upsert missing routes.

Dataset `routes_snapshot` (src 2175738 / view 2176561, 2,467 rows / only 728 distinct names) is an
earlier raw dump of old reports — duplicated and with old ids stripped. Do not convert from it;
convert from `admin2.reports` directly (dedupe/cleanup of that dataset is separate debt).

## Conversion algorithm (per old report id)

1. Read old report + its `admin2.routes` rows (follow `route_comps[].routeId`, flattening groups).
2. Upsert each route into `Routes Data` (`routes_data|2107427:data`) by `route_id`.
3. Create the page (clone Report Page template structure): page row + one component row per
   section with **fresh trackingIds**; slug `report_<old_id>` (default, TBC).
4. For each old `graph_comp`, pick an `avl_graph_template` by key
   `(graph type, resolution, dataColumn)` — creating the template row first if it doesn't exist
   (generated from a code-side matrix; "a ton of templates" is fine). Resolution via calculated
   epoch column (e.g. `(epoch/3) as epoch_15`); dataColumn via measure column
   (`travel_time_freight_trucks` etc.).
5. Create the `reports_snap_2` row: routes from old route_comps (+ inline route data), per-route
   `startDate`/`endDate` from old `settings.startDate/startTime/endDate/endTime`
   (`20250101`+`'07:00'` → `'2025-01-01T07:00'`), `graphIds` = every graph section's trackingId
   (old model: every route fed every graph unless per-graph state said otherwise).
6. Preserve everything unconvertible verbatim on the route entry (e.g. `_old_settings`) and emit a
   per-report **gap report** (graph types without templates, weekdays/peak filters, overrides,
   relativeDate, station_comps, groups) — surfacing gaps is an explicit goal.

## Known functionality gaps (to grow as conversion proceeds)

- ~~weekday masks~~ **DONE (2026-07-07)**: route entries carry a first-class `weekdays` field (old
  settings shape, `{monday: bool, …}`); `transformReportRoutes.generateDateRange` skips
  explicitly-`false` days when enumerating the `date IN` list — no new filter op needed. Verified
  by capturing report_1070's live graph query: 261 dates, all 2025 weekdays, 0 weekend days.
  Only applies when the route has a date range to enumerate (converter logs
  `weekday_mask_without_date_range` otherwise).
- ~~AM/PM/off-peak flags~~ **NOT A GAP (2026-07-08)** — proven query-inert in the old client;
  see Round 3 note above. `startTime`/`endTime` (already converted) fully capture their effect.
- Only 3 graph templates exist (2 line + 1 grid, 5-min, all-vehicles) vs 23 old graph types ×
  8 resolutions × 3 data columns actually used. Route Map, Route Info Box, Bar Graph Summary and
  other non-line/grid types have no new-side equivalent component/template at all yet.
- Old per-graph `layout` — **width (`w`) DONE as of round 6**: maps directly to the section's
  `size` field (colspan; `npmrds_sub` runs the `transportnyv2` theme, 12-col numeric scale, same
  numbering as old `w`). `h`/`x`/`y` still have no obvious new-side target (sections stack
  linearly; the theme's `rowspan` is a compound-card concept, not a pixel height, so not a fit).
- Old `color_range` — **DONE as of round 6, correctness fixed in round 7**: gap-logging only fires
  when a report has a colorful-type graph (Route Bar Graph/Route Map/TMC Grid Graph/Route
  Difference Graph/TMC Difference Grid, confirmed against old client source) that fails to convert;
  for ones that do convert, the real `color_range` is wired into the new template's
  `display.colors.value`. Round 6's wiring was live-verified but not actually rendering correctly —
  round 7 found and fixed two real rendering bugs (GridGraph's color scale silently truncated to a
  palette's first 3 colors; BarGraph had no per-value coloring mode at all, so single-series bars
  rendered as one solid color) — see round-7 notes above for the full root-cause + fix. **Now
  live-verified as actually correct** on 751/1061/1045/1071.
- Relative-date reports (`settings.relativeDate`) and route groups need design.
- ~~`overrides.aadt`~~ **DONE (round 9, 2026-07-08)** — baked into the cloned calculated column
  per graph when every assigned comp agrees on one truthy value (wholesale replace for delay,
  proportional car/truck redistribution for CO₂, matching the old source exactly); falsy `'0'`
  is query-inert (old `getAADT` truthiness) and no longer logged. Disagreeing comps →
  `aadt_override_mixed` gap; template-drift → `aadt_override_not_applied` gap. Live-verified on
  1071 (page `2188906`).
- ~~Axis labels not visible on any report~~ **FIXED (round 62, 2026-07-17, user-reported
  2026-07-13)**: NOT the round-34 legend/flex squeeze (round 60 already fixed that; user
  screenshot confirmed tick values render fine, chart loaded in ~2s, no pending requests) — this
  is the axis TITLE/caption (e.g. "Avg. Hours of Delay", "Time of Day"), a distinct feature from
  tick labels. Root cause: the rendering path was never broken — `GraphComponent.jsx` already
  reads `display.xAxis.label`/`display.yAxis.label` and `AxisLeft.jsx`/`AxisBottom.jsx` already
  render a `text.axis-label` element whenever `label` is truthy (confirmed by reading the code,
  not assuming) — the converter simply never populated those fields, on any template, ever. Old
  client precedent found (`transportNY` src, `RouteLineGraph.jsx`): old tool set `axisLeft.label`/
  `axisRight.label` from each measure's own `label` field (a unit string, e.g. "Hours"); old tool
  did NOT label its time-of-day x-axis at all. Fix (converter-only, no library changes needed):
  `ensure_graph_templates` now sets `display.yAxis.label` from the yAxis column's own `customName`
  (already a human-readable measure description on ~40 TEMPLATE_SPECS entries, e.g. "Speed
  (mph)") whenever the column actually targets a real y-axis (`target: "yAxis"` — GridGraph's
  color-targeted value column is excluded, it has no literal y-axis), and sets
  `display.xAxis.label = "Time of Day"` for every `"xAxis": "epoch"` spec (a strict readability
  improvement over old-tool parity, since post-round-61 the ticks already read as real clock
  times). Both wired into the same lazy mint/drift-detection idiom as round 61's `epoch_time`
  format (`epoch_label_drift`/`yaxis_label_drift`) — every already-minted template picks up the
  fix the next time any report using it is reconverted, no proactive resweep. Also found and
  fixed a real pre-existing gap while at it: 6 `AVG_DELAY_EXPR`-based TEMPLATE_SPECS entries
  (`tmc_avg_delay_{line_graph,bar_graph_day,bar_graph_weekday,bar_graph_5min,bar_graph_hour,
  bar_graph_month}`) had no `customName` at all (unlike their "Difference" siblings and every
  other measure), so they'd have silently kept rendering an unlabeled y-axis even after this fix
  — added `"customName": "Avg. Hours of Delay"` to all 6. **Live-verified**: report 787
  reconverted `--replace` (new page `2194270`); drift fired on all 3 templates it uses
  (`tmc_avg_delay_line_graph`: yAxis expr + xAxis label + yAxis label; `tmc_travel_time_summary_
  bar_graph` and `tmc_avg_delay_summary_bar_graph_5min`: yAxis label). `report_probe.mjs`
  screenshot confirms both the "R5 I-290 Y2Y Delay Analysis" LineGraph (rotated "Avg. Hours of
  Delay" y-label, "Time of Day" x-label) and the "R5 HELP Routes Y2Y Delay Analysis" Bar Graph
  Summary (same y-label) now render real axis captions — exactly the two sections in the user's
  screenshot that had none. 0 console/page errors. Full census rerun: 869/869 reports, 0 errors;
  graph-instance mapping byte-identical to the pre-fix baseline (5,288/7,103), as expected for a
  pure display-label addition with no effect on coverage/mapping logic. **Not done**: no
  proactive resweep of other epoch-axis/yAxis-customName templates beyond report 787 (lazy-
  reconvert policy, same as round 61); non-"epoch" xAxis groupings (date/day/weekday/month/hour)
  get no x-axis label (matches old-tool parity — it never labeled those either); GridGraph's
  color-targeted value axis and its `categorize` dimension are untouched (different axis
  semantics, out of scope).
- **Epoch x-axis hover tooltip still shows the raw epoch integer, not a clock time
  (user-reported 2026-07-17, ROOT-CAUSED 2026-07-24, still NOT fixed)**: round 61 fixed the
  x-axis TICK labels (`epoch_time` format via `xAxis.format`/`getFormatFunc`) but did not reach
  the hover-tooltip value display, which still reads e.g. `186`/`142` instead of `15:30`.
  Re-confirmed live 2026-07-24 on the NY-9D Beacon report (`converted_reports/page_13_13`,
  travelTime LineGraph) — tooltip header read `142` while the axis directly below it correctly
  read `12:20`. Root cause found:
  `packages/dms/src/ui/components/graph_new/GraphComponent.jsx`'s `hoverComp` useMemo
  (lines 89-103) computes `valueFormat`/`yFormat`/`showTotals`/`minutesAutoSeconds` from
  `graphFormat.tooltip`, but never computes an `xFormat`/`idFormat`/`indexFormat` from
  `graphFormat.xAxis.format` the way the sibling `xAxis` prop does (same file, lines 168-178,
  `namedFormat = get(graphFormat, ["xAxis","format"]); if (namedFormat) return
  getFormatFunc(namedFormat)`). With no `xFormat` supplied, every avl-graph chart type's
  `DefaultHoverComp` falls back to its own bare default — `Identity` (pass-through, no
  formatting) for LineGraph (`components/avl-graph/LineGraph.jsx:53,58,167`:
  `xFormat(get(data,"x",null), data)` renders the raw value). BarGraph/GridGraph/PieGraph/
  TreemapGraph/SunburstGraph's `DefaultHoverComp`s take the equivalent prop under a different
  name (`indexFormat`) and are likely affected the same way, since the same `hoverComp` useMemo
  feeds all of them — not verified per-chart-type, but the fix is the same single spot either
  way. **FIXED and live-verified 2026-07-24**: added the `xFormat`/`indexFormat` computation to
  the `hoverComp` useMemo (reusing the same `namedFormat`/`getFormatFunc` lookup the `xAxis.format`
  prop already does), in both dms-template's `src/dms` submodule and transportNY's
  `src/modules/dms` submodule copy. Re-tested the same live repro (`page_13_13`'s overview
  LineGraph): tooltip now reads `11:50`, matching the axis, instead of the raw epoch integer. See
  `research/report-page-redesign/findings.md` ("RRL/tooltip triage, 2026-07-24") for the
  user-facing repro this was found from.
- **Route Compare anchor row ordering still inconsistent (user-reported 2026-07-13, NOT
  investigated — logged only, per user)**: recurrence/incomplete fix of the round-26 user-caught
  anchor-row bug. User saw the anchor row render in the MIDDLE of the table once (anchor was
  2021 and the table sorted by year, so the ordering had a cause) — but the anchor row must
  always be first. Likely suspect from the round-26 archive notes:
  `RouteCompareComponent.jsx`'s `renderGraph` does `graphData.slice(0,1)` — i.e. assumes the
  anchor is row 0 rather than identifying it, so any data-driven sort order breaks it. Unverified.
- ~~Route Map choropleth has no color-scale legend~~ **FIXED (round 50, 2026-07-15,
  user-reported)**: user saw the Map's "legend" panel render as a bare list of layer names with
  no color swatches/scale telling them what's displayed or what the values mean. Root-caused
  (not just observed): `ensure_route_map_speed_template`'s `template_layer` dict never set
  `"layer-type": "choropleth"` — `LegendPanel`'s `LegendRow` component
  (`ComponentRegistry/map/LegendPanel/LegendPanel.jsx`) branches on exactly that key to choose
  `StepLegend` (the color-ramp/step-swatch renderer) vs. a bare title row; with the key absent
  it silently fell through to the title-only path every time, for every converted Route Map
  speed choropleth since M2 (round 49) — never caught then because that round's verification
  checked tile/join network traffic, not the legend panel itself. One-line fix (added the
  missing key to `template_layer`); `bake_route_map_speed_paint` clones/mutates that same dict
  per-report so no other function needed touching. Live-verified: reconverted report 168
  (`DMS_TILE_HOST=http://localhost:3001 python3 scripts/npmrds-reports/convert_old_reports.py --report-id 168
  --replace`, new page `2191242`), probed clean (0 console/page errors, 1 benign 204 on
  `/track/visit`), screenshot confirms a real step-legend with color swatches + numeric ranges
  ("Speed (2017 network)" / per-route entries, e.g. `18.47 - 20.33`, `36.66 - 43.2`). Minor
  follow-up NOT fixed: the legend shows the SAME step-ramp three times (once for the shared
  template layer, once per materialized per-comp layer, all sharing the one pooled-quantile
  break set) — visually redundant but not wrong; a dedup/collapse pass is cosmetic polish, not
  a correctness bug. Report 1071's page (`2191192`) still carries the pre-fix template and was
  NOT reconverted (lazy-reconvert policy — it'll pick up the fix whenever next reconverted for
  a real reason). `ensure_route_map_none_template`'s per-route line layers are unaffected by
  this bug (they render via the `type undefined → 'simple'` fallback, which already shows a
  color swatch + name per route on the title row — that IS a legend, just categorical not a
  scale, so "just a list of layers" for `route_map_none` maps is closer to a UX opinion than a
  bug; see the next item).
- **Map sections have no hover interactivity (user-reported 2026-07-15, NOT investigated beyond
  confirming there's nothing to wire up — logged only)**: hovering a Map feature (a TMC segment
  on a Route Map, a choropleth cell) shows nothing — no tooltip/popup with the underlying value.
  Checked `ComponentRegistry/map/index.jsx` for any existing mousemove/mouseenter/popup
  machinery to extend: **none exists** — the only hover-adjacent code is a few comments about a
  *future* click/hover→page-filter publish mechanism (already excluded from the Map's filter
  sync, per round 45's `dataPageFilters` note), not a value-on-hover tooltip. This would be a
  real new feature (maplibre `mousemove`/`mouseenter` handlers + a popup component + wiring per
  layer to its `data-column`/value), not a config tweak — NOT almost-free, deliberately left
  unbuilt per the user's own "mark as bug, don't work on it now" instruction. Candidate for an
  M4-adjacent or post-M3 round if prioritized.
- **Route Map's per-route category legend may be more noise than signal (user opinion,
  2026-07-15, logged only)**: for `route_map_none`-style maps (plain colored lines, no
  choropleth), the current legend lists every route by name+color — technically correct
  (categorical legend) but the user doesn't think it's needed. Distinct from the choropleth
  legend bug above (which was a real rendering defect); this one is a design/utility judgment
  call, not fixed, not scoped.

## NPMRDS data-source bank

**Moved to `src/dms/documentation/npmrds-data-sources.md` (2026-07-08)** — a living reference doc
(kept current independent of this task's lifecycle, per the user's request) covering: registered
DAMA sources joinable via `avl_graph_template`'s `join.sources` (583/1946/`aadt_distributions`),
the full bank of other active old-DAMA NPMRDS sources (582/1722/2001/1410 + the newly-discovered
ClickHouse tables `tmc_avg_speedlimit`/`avg_monthly_tt`/`mpo_boundaries`/`npmrds`), the
cross-database-vs-cross-engine join constraint, and the live DAMA schema reference. Update that
file (not this section) as more sources get investigated.

## Open questions (user)

- Where should converted pages live (flat vs under a parent "Converted Reports" page; replicate old
  `admin2.folders` hierarchy as page hierarchy?)
- Auth token for CLI deletes/updates (needed for idempotent re-runs / rollback) — user offered
  creds; mint token via `POST /auth/login`.
- Confirm slug scheme `report_<old_id>` and that converted pages start unpublished (draft).
- ~~Which theme does `npmrds_sub` actually run~~ **RESOLVED (round 6, user)**: `transportnyv2` —
  found via the pattern row's `data.theme.selectedTheme` (`dms raw get 2100394`), not discoverable
  through `dms site tree` (stale auth token). See `graph_layout` width note above.

## Artifacts (scratchpad/npmrds-sub/old-reports/)

`report_1070.json`, `report_1070_routes.json` (old side); `new_page_2187523.json`,
`new_page_2187523_sections.json`, `new_report_row_page2187523.json`,
`avl_graph_templates.json`, `page_template_2187021_current.json` (new side).
`report_1071.json`, `report_751.json`, `report_1061.json` (old-side dumps for those reports).
`gaps/report_1070.json`, `gaps/report_1071.json`, `gaps/report_1061.json`, `gaps/report_751.json`,
`gaps/report_1045.json`, `gaps/report_874.json` (per-report gap reports, regenerated on every
conversion run — `report_1071.json`'s `new_page_id`/`dry_run` fields were manually restored after a
dry-run overwrote them, see round-3 notes if this looks odd).

**Current live page ids as of round 35 (2026-07-13)** — the 15 speed/TT-bearing reports were all
superseded by the round-35 backport reconversion: 1045→`2189915`, 1061→`2189943`, 1070→`2189957`,
1071→`2189965`, 142→`2189993`, 16→`2190009`, 228→`2190017`, 229→`2190031`, 520→`2190043`,
630→`2190053`, 740→`2190079`, 914→`2190097`, 960→`2190125`, 987→`2190137`, 994→`2190169`.
471 deleted in round 35 (`no_valid_routes`); 1032/392 deleted in round 33. Reports not carrying
speed/TT templates keep their earlier pages (e.g. 751→`2188894`, 874→`2188794`, both round 9).
Round 36 additions: 787→`2190210`, 320→`2190225`, and 1061 reconverted `2189943`→`2190527`
(gap reports regenerated under `gaps/report_787.json`/`gaps/report_320.json`/
`gaps/report_1061.json`).
Round 37 (census cross-reference, 2026-07-13): 23 numeric `report_<id>` pages live in total —
the earlier-round pages also include 11→`2189401`, 54→`2189409`, 315→`2189417`, 796→`2189435`.
874's page `2188794` is a permanently-empty shell (route 5445 missing everywhere since before
its round-9 conversion) — **deletion pending, user to run** (see the archive's Round 37).
Round 38 (Phase B, 2026-07-14): 745→`2190543` (B1; carried one leftover BROKEN test section,
draft `2190567`/published `2190568`, since deleted — see round 40 below), 58→`2190556` (B3, since
deleted — see round 40), 191→`2190569` (B2 — converted with `graph_max_year` forced to 2023, a
deliberate mechanism proof, since replaced — see round 40). New templates:
`route_info_box_traveltime` (`2190555`), `tmc_freeflow_summary_bar_graph_2023` (`2190566`).

**Round 39 (2026-07-14)**: shell page 874→`2188794` deleted (`no_valid_routes`, deletion pending
since round 37, executed this round).

**Round 40 (2026-07-14)**: closed both remaining cleanup items. Report 745's page (`2190543`)
kept, its broken test section removed (component rows `2190567`/`2190568` deleted). Report 191
reconverted for real: old mechanism-proof page `2190569` deleted, new page `2190581` created
(2/3 mapped — the pm3-coverage-limited measure correctly gap-logs against its real 2016/2017
dates). 4 pre-2017-only pages deleted outright (no replacement — the converter now refuses to
page them): 16→`2190009` gone, 54→`2189409` gone, 58→`2190556` gone, 142→`2189993` gone.
`converted_pages_total`: 21.

Round 40 Part 2 (Info Box `length`/`travelTime`/`aadt`/`hoursOfDelay` + the gid-collision fix) —
5 live-verification test conversions, each reconverted a second time with `--replace` after both
bugs were fixed to reach a clean final state: 181→`2190688` (`travelTime` both grains), 965→
`2190700` (`length`+`travelTime` tmc grain), 33→`2190736` (`aadt` tmc grain; also the page that
caught the gid-collision bug — its 4 Info Box graphs now correctly show 3 distinct sections
instead of 4 identical ones), 179→`2190755` (`hoursOfDelay` route grain), 775→`2190767`
(`hoursOfDelay` tmc grain). New templates: `tmc_info_box_traveltime` (`2190591`),
`tmc_info_box_length` (`2190604`), `tmc_info_box_aadt` (`2190645`), `route_info_box_delay`
(`2190664`), `tmc_info_box_delay` (`2190677`).

Round 59 (TMC meta join swap, 2026-07-17) — reconverted (`--replace`) as the round's live
verification, all superseding earlier-round page ids for the same reports: 775 → `2194062`
(hoursOfDelay tmc/route grain + Route Map hoursOfDelay, exact-value ground-truthed), 787 →
`2194074` (Bar Graph Summary avgHoursOfDelay/hoursOfDelay), 751 → `2194094` (CO2 passenger/truck),
179 → `2194116` (entirely 2017-dated — the known meta-gap path, delay correctly renders `null`),
1033 → `2194141` (Route Map avgHoursOfDelay/hoursOfDelay choropleth). All 0 console/page errors.

Round 52 (Route Difference Graph / TMC Difference Grid, 2026-07-16) — live-verified pages:
584 "I-190 NB COVID Comparison" → `2193032` (4/4 graphs; diverging speed diff bar with
invert + speed diff grid + route_map_speed_2020), 354 "Bridge Hit I-90 WB at RT 33 Buffalo"
→ `2193798` (reconverted with `--replace` after increment B; 6/6 incl. travelTime diff),
1037 "Inc 3/1/2023 NY33 EB @ Dodge St" → `2193818` (avg-delay diff grid; its
avgCo2Emissions×all graph is a deliberate deferred gap), 1039 "Inc 8/28/2021 HRP @
Westchester Ave" → `2193832`. 18 diff templates minted from TEMPLATE_SPECS
(`route_diff_*` / `tmc_diff_grid_*` — ids change on drift-reconversion, `dms raw list` for
current). Ground-truth harness pattern: extract the page's own captured difference query
from `probe_<slug>.json`, replay via `dbq.graph`, hand-build the two arm queries in raw CH
and subtract — all sampled values bit-exact (584 bar epochs 100/150/282 + 3 grid cells;
354 travelTime epochs 72/73/150).

Round 49 (Route Map M2, speed choropleth, 2026-07-15) — test conversions, several superseded
by reconversion mid-round while fixing the join-shape crash and the maplibre strictly-
ascending-breaks bug, final live-verified pages: 1071→`2191192` (single-TMC degenerate-breaks
case, converted with `DMS_TILE_HOST=http://localhost:3001` for local verification — NOT the
production `TILE_HOST` default), 168→`2191222` (5-TMC real-variance case, same local-host
override). Both superseded several earlier same-report page ids from mid-round debugging
(2191035/2191065/2191132/2191142 among others) — those are stale, ignore them if seen in
scratchpad JSON dumps from this round. New template: `route_map_speed_2026` (id created fresh
each reconversion since drift-checking picks up code changes — check `dms raw get` for the
current id rather than trusting a hardcoded one here). Report 7 (`Tapanzee Analysis Month By
Month`) exercised the graceful pre-2017-data-gap path (`route_map_speed_no_values` gap-kind,
no crash, template placeholder renders) — not reconverted with the local tile-host override
since its point was the gap-log path, not visual verification.

Other files this task has produced, outside that scratchpad folder:
- `scripts/npmrds-reports/convert_old_reports.py` — the converter itself.
- `scripts/npmrds-reports/register_aadt_distributions.sql` — one-time DAMA source/view registration for
  `aadt_distributions` (already run; keep for reference/idempotent re-registration elsewhere).
- `src/dms/documentation/npmrds-data-sources.md` — the living data-source reference (see below).
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — round-3 calculated-join-key fix (`accessor()` inside `buildJoinOnClause`); round-5 fix
  (`mappedOrderBy`, comparison-series fan-out ORDER BY on a calculated groupBy column uses the
  alias, not the raw expression).
- `src/dms/packages/dms/tests/buildUdaConfig.test.js` — regression tests for both fixes above.
- `src/dms/packages/dms-server/src/routes/uda/query_sets/helpers.js` — round-4 fix:
  `handleFilterGroupsCH` join-aware `ds.` qualification for bare filter columns.
- `src/dms/packages/dms-server/src/routes/uda/query_sets/clickhouse.js` — round-4 fix: threads
  `joinPresent` into `handleFilterGroupsCH`; fixed a second missing-`joinPresent` spot in
  `simpleFilterLength`.
- `src/dms/packages/dms-server/tests/test-uda.js` — `testFilterGroupsCHJoinQualification`
  regression test for the round-4 ambiguous-identifier fix.
- `src/dms/packages/dms/src/ui/components/graph_new/components/utils.js` — round-7: new
  `buildValueColorScale` shared helper (fixes GridGraph's truncation bug, powers BarGraph's new
  `byValue` mode).
- `src/dms/packages/dms/src/ui/components/graph_new/components/GridGraph.jsx` — round-7: uses the
  new helper instead of a hardcoded 3-point domain.
- `src/dms/packages/dms/src/ui/components/graph_new/components/BarGraph.jsx` — round-7: new
  `colors.byValue` mode (min/max tracking + value-scaled colors + linear legend).
- `src/dms/packages/dms/src/ui/components/graph_new/components/avl-graph/components/Legend.jsx` —
  round-7: fixed a latent duplicate-React-key bug in both linear legend variants (tick elements
  keyed by value instead of index — only manifests on a degenerate/constant-value domain).
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/
  graph_new/config.jsx` — round-7: new "Color by Value" author-facing toggle in the Bar Graph
  Layout SectionMenu group.
- `src/dms/packages/dms/tests/graphColorScale.test.js` — round-7: regression tests for
  `buildValueColorScale` (full-palette reach, degenerate-input scale shape).
- `scratchpad/npmrds-sub/dms-server.log` — dms-server's live stdout, piped via `tee` (user-run,
  2026-07-08) so errors can be read directly instead of reconstructed from browser console
  captures; per `[[feedback_check_server_logs_first]]`, check this file first when a graph/page
  shows a fetch error.
- `scratchpad/npmrds-sub/cleanup_round40.py` — round-40 one-off cleanup script (report 745's
  broken test section, report 191's `--replace` reconversion, the 4 pre-2017-only page deletes);
  user-run via `!` since it needs `DMS_AUTH_TOKEN`. Kept for reference, not meant to be re-run.
- **Note (round 49): `scratchpad/npmrds-sub/dms-server.log` is no longer being piped** (user
  restarted dms-server after a round-49 crash without re-establishing the `tee`) — it now only
  holds pre-round-49 history. `preflight.py`'s log-error check will keep reporting the stale
  crash trace until the pipe is re-established; that's expected, not a live issue. Ask the user
  to re-run their `tee` setup if live log access is needed again.
- Round 49 (Route Map M2, speed choropleth) new/changed files:
  - `scripts/npmrds-reports/convert_old_reports.py` — `SPEED_VALUE_EXPR`, `CH_FACT_TABLE`/
    `CH_TMC_IDENT_TABLE`, `DEFAULT_SPEED_COLOR_RANGE`, `choropleth_paint()` (Python port of the
    dms Map section's `choroplethPaint()`), `quantile_breaks()`, `build_ch_join_wire()` (the
    AVL-Graph-authoring-shape → server-wire-shape join transform), `ensure_route_map_speed_
    template()`, `bake_route_map_speed_paint()`; `TILE_HOST` now reads `DMS_TILE_HOST` env
    override; `build_graph_section_data()` gained a `route_map_value_ctx` param and Map-vs-
    AVL-Graph coloring branch; Route Map pre-pass in `convert_report()` extended for measure
    `"speed"`; `import dbq` added (sibling-module CH query runner).
  - `scripts/npmrds-reports/census_old_reports.py` — `route_map_none`/`route_map_speed` mirror generalized to
    a single measure-keyed branch; removed a genuinely pre-existing, unrelated dead-code
    `NameError` (`BAR_SUMMARY_PM3_BUCKET`, never defined anywhere, silently dropping 274/869
    reports from every census run since some round after 47 — found only because a full fresh
    census was needed to validate this round's own corpus impact).
  - `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/
    map/SymbologyViewLayer.jsx`, `.../map/index.jsx`,
    `src/dms/packages/dms/src/patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx`,
    `.../MapEditor/index.jsx` — the two platform fixes (nested-join forwarding, live-repaint
    paint write-back); library task `map-join-nested-join-forward-and-live-repaint.md`.
  - `scratchpad/npmrds-sub/old-reports/verify_map_tile_network_capture.mjs` — reusable
    Playwright network-capture probe for a converted Map's tile/join traffic (the
    listeners-before-reload technique — see the durable-facts note above).
