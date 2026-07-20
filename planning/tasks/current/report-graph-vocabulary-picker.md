# Report Graph Vocabulary Picker — author-facing measure/resolution/comparison-mode config

## Status: NOT STARTED — scoping + investigation complete, plan below, implementation not begun

## Objective

Let a DMS author build a NEW NPMRDS report graph from scratch — pick a graph type, a measure
(Speed/Travel Time/Delay/CO2/etc.), a resolution (5-minutes/15-minutes/day), and a comparison mode
(plain vs. difference) from a guided control, and have DMS generate the underlying Card/graph
section config live — instead of the only path today, which is a developer running
`scripts/convert_old_reports.py` to mint a DB template row. This approximates, but does not fully
replicate, the old npmrds `admin2` report-builder tool (source at
[[reference_old_npmrds_tool_source]] — see memory, or
`/home/ryan/code/transportNY/src/sites/npmrds/pages/analysis/` directly).

This is the next major initiative after `old-reports-conversion.md`, which the user has put a pin
in for now ("I think we are in a good spot with conversion coverage... put a pin in that part").
See `project_report_builder_ui_scoping` in the assistant's memory for the full scoping
conversation this task file summarizes.

## Scope

### In scope (this round)

1. **One canonical, shared vocabulary artifact** extracted from `TEMPLATE_SPECS`
   (`scripts/convert_old_reports.py:953+`) — the *generative* core only: measure expressions
   (`SPEED_EXPR`, `TRAVEL_TIME_EXPR`, `DELAY_EXPR`, `CO2_EXPR_PASSENGER`/`_TRUCK`, etc.),
   resolution/axis-grouping expressions (`QUARTER_HOUR_EXPR`, `HOUR_EXPR`, `MONTH_EXPR`,
   `WEEKDAY_EXPR`, plain `epoch`/`date`), `comparisonSeriesCombine` modes (plain vs. `difference`),
   and display/color rules (`_diff_colors()`). Explicitly NOT in scope: the surrounding
   old-corpus quirk-compensation logic (year/bin gap detection, `graph_max_year`,
   `PM3_VIEW_BY_YEAR` gating, mixed-resolution ambiguity handling) — that logic is specific to
   reconciling messy historical reports and is irrelevant noise for an author building a new graph
   from a clean slate.
2. **A new author-facing "Measure" picker** for Graph/AVL Graph sections, structurally analogous
   to the existing `join`/`comparisonSeries`/`pivot` item-groups in `sectionMenu.jsx`'s
   `getSectionMenuItems` (`patterns/page/components/sections/sectionMenu.jsx:40`) — an author picks
   graph type + measure + resolution + comparison mode, and the picker generates/writes the
   underlying `columns` (calculated yAxis/xAxis expressions), `join` (when the measure needs one,
   e.g. Delay/CO2 needing `META_JOIN`/`AADT_DIST_JOIN`), `comparisonSeries.combine`, and
   `display`/color config for the section — the same shape `TEMPLATE_SPECS` produces today, but
   generated live, in-app, without a pre-minted DB template row.
3. **Resolution and comparison mode are explicit, author-facing choices in this round** — see
   "Resolution: explicit-for-now decision" below. Not derived from attached routes.
4. Picking from this menu writes into the same underlying section state the existing generic
   `join`/`comparisonSeries`/pivot/Column Manager controls already read and write — an author can
   still hand-tweak the generated config afterward through those existing controls. This is a
   convenience generator, not a walled garden (author-empowerment principle, root `CLAUDE.md`).

### Explicitly deferred (not forgotten — do not re-litigate without new user input)

- **Deriving resolution dynamically from whichever routes are attached to a graph** — this is the
  *actual* old-tool UX (see "Old-tool ground truth" below) and remains the long-term goal, but is
  deferred for this round because it requires three genuinely new pieces of work investigated
  2026-07-20 (see "Resolution/axis investigation findings" below):
  (a) a resolution field on routes (now believed CHEAP — routes are mostly legacy carryover
  fields, and the per-report route entry `ReportRouteList.jsx` persists already has a generic
  `metadata` field that could hold it with no schema migration, per user's own observation
  2026-07-20);
  (b) a new dynamic-config-write mechanism structurally parallel to comparisonSeries's existing
  `$self`/`usePageFilterSync` pattern, but targeting `columns`/xAxis instead of `filters` — this
  does NOT exist today and is real new work;
  (c) per-measure handling for the (few) measures whose yAxis expression itself changes shape by
  resolution (e.g. `avgHoursOfDelay`), not just which column is flagged as the x-axis.
  Investigation concluded this is additive — it extends an existing working reactive pattern
  rather than fighting a hard architectural constraint — so deferring it now does not foreclose it
  later.
- **Old-tool template reuse** (route-placeholder `$0/$1` substitution + "recent year"
  rolling-forward substitution, `reports/store/index.js` `saveTemplate`/`loadTemplate` in the old
  tool) — acceptable permanent-ish gap, not being ported.
- **Peak/weekday/relative-date filter controls beyond plain start/end date.** User draws a real
  distinction to preserve when this is revisited: peak-period + weekday selection is *mostly a
  missing UI control* (the backing query language mostly already exists — PM3's `amp`/`midd`/
  `pmp`/`we` bins are already load-bearing elsewhere in the platform); relative-dates-with-a-
  rolling-base (old tool's "Day of / Week of / Month of / Year of" + designated base route) is a
  genuinely different, harder gap. Don't lump these into one bucket later. For this round: plain
  start/end date/time only, nothing else.
- **Resolution/TMC-compatibility validation on route→graph assignment** in `ReportRouteList`
  (mirroring the old tool's `RouteLineGraph`/`RouteDifferenceGraph`/`TmcDifferenceGrid` — silent,
  graph-type-scoped filtering/exclusion, NOT a hard block — see "Old-tool ground truth" below for
  exact mechanism). Deferred; not core functionality, a noted feature to port over eventually.
- **Anything about `ReportRouteList`'s current capabilities/possible regressions** — user flagged
  "SOME concerns" about this 2026-07-20 but has not yet specified what to look into. Needs a
  follow-up conversation before any action; do not investigate or fix speculatively.

## Old-tool ground truth (read directly from source, 2026-07-20)

Source: `/home/ryan/code/transportNY/src/sites/npmrds/pages/analysis/` (see
[[reference_old_npmrds_tool_source]]). Read in full: `reports/components/ReportBase.jsx`,
`reports/store/index.js`, `reports/store/utils/relativedates.utils.js`,
`reports/store/utils/station.utils.js`, `components/tmc_graphs/graphClasses/GeneralGraphComp.jsx`,
`components/tmc_graphs/RouteLineGraph.jsx`, `components/tmc_graphs/RouteDifferenceGraph.jsx`,
`components/tmc_graphs/TmcDifferenceGrid.jsx`.

**Resolution is a per-route setting, never a per-graph author choice.** Default `'5-minutes'`,
set via a `Select` per route component (`AdvancedControls.jsx:347-357`,
`reports/store/index.js:640-651`), broadcastable to all routes via a "copy to all" action
(`copyRouteCompSettings`, `reports/store/index.js:958-976`). A graph's *effective* resolution is
read dynamically off whichever routes are attached to it:
`GeneralGraphComp.getResolution()` → `activeRouteComponents[0].settings.resolution`
(`GeneralGraphComp.jsx:305-307`). `RouteLineGraph` goes further: it filters its routes down to
whichever resolution has the most members and shows a resolution-switcher only when attached
routes disagree (`RouteLineGraph.jsx:54-67, 88, 110-120`) — non-matching routes are silently
excluded from that graph, not an error.

**Resolution/TMC compatibility restriction is real but graph-type-scoped, not general.**
`RouteDifferenceGraph`/`TmcDifferenceGrid` (exactly-2-route comparison graphs) require their
"Compare" candidate to match the "Main" route's resolution AND TMC array
(`RouteDifferenceGraph.jsx:41-53`, identical in `TmcDifferenceGrid.jsx:33-51`) — the "Compare"
dropdown's domain is pre-filtered to only matching routes. Every other graph type (Bar Graph, Grid
Graph, Map, Info Box, Bar Graph Summary, Route Compare) uses the unfiltered base
`getActiveRouteComponents()` — no resolution restriction, because they don't need cross-route
x-axis alignment.

**Peak/weekday controls**: 7-button weekday toggle (`weekdays: {sunday:false,...}` per route,
`reports/store/index.js:1888-1896`) and AM/Off/PM Peak buttons backed by hardcoded minute bounds
(`{amPeakStart: 7*12, amPeakEnd: 10*12, pmPeakStart: 16*12, pmPeakEnd: 19*12}`,
`reports/store/utils/general.utils.js:7-13`) — both flow directly into the falcor request
(`GeneralGraphComp.jsx:33-53`: `weekdays`, `startTime`/`endTime` as epoch minutes, `resolution`,
`dataColumn`).

**Relative dates**: a distinct, more complex system — "Day of/Week of/Month of/Year of" plus
rolling ± offsets, with one route flaggable `isRelativeDateBase` so other routes' dates recompute
relative to it (`relativedates.utils.js:3-86`, `reports/store/index.js:484-639`). Genuinely
separate machinery from peak/weekday, per the scope note above.

**Templates**: real, separate, reusable artifact. `saveTemplate()` replaces every concrete
`routeId` with a positional placeholder (`$0, $1, ...`) and, optionally, rewrites concrete years to
`{recent-N}` tokens relative to the newest data year, so a template can be reapplied to different
routes and roll forward automatically (`reports/store/index.js:303-449`). Deferred per scope above.

**No general max-routes-per-graph cap** was found (only dead/commented-out code,
`Sidebar/ActiveRouteComponents.jsx:147`). Comparison graphs require exactly 2 routes
(`RouteDifferenceGraph.jsx:31`, `TmcDifferenceGrid.jsx:24,108,196`) — this constraint already has a
new-platform equivalent via `comparisonSeriesCombine: {mode: 'difference'}` (see below).

## Resolution/axis investigation findings (new-DMS side, 2026-07-20)

Read in full: `patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`,
`usePageFilterSync.js`, `patterns/page/components/sections/sectionMenu.jsx` (comparisonSeries
block), `src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx` + README,
`ui/components/graph_new/components/{GridGraph,BarGraph}.jsx`,
`ComponentRegistry/graph_new/config.jsx`, `ComponentRegistry/Card.config.jsx`.

- **xAxis/grain today is 100% static, author-set once**, stored in the section's `element-data`,
  flowing unchanged into `buildUdaConfig`'s `groupBy` (computed once, upstream of any per-arm
  logic — `buildUdaConfig.js:1298-1329`). No dynamic axis/grain derivation exists anywhere in this
  pipeline.
- **A "route" in the new system carries no resolution field anywhere.** Route catalog schema
  (`id, name, description, tmc_array, points, conflation_*, created_by/at, metadata jsonb` — per
  `old-reports-conversion.md:777-778`) and the per-report route entry `ReportRouteList.jsx`
  persists (`{name, route_id, tmc_array, description, points, metadata, conflation_*, created_*,
  updated_at, isValid, route_comp_id, graphIds, startDate?, endDate?}`, `ReportRouteList.jsx:
  368-479`) both lack it. `ReportRouteList.jsx` actually hardcodes a 5-minute-epoch assumption in
  its own `timeToEpoch`/`generateEpochRange` helpers (lines 47-64) rather than reading a per-route
  grain. **But** both shapes already carry a generic `metadata` field, so adding `resolution` later
  is likely cheap (no migration) — user's own observation 2026-07-20, consistent with this finding.
- **comparisonSeries arms share one fixed table/groupBy/columns; only the WHERE clause varies per
  arm** (`buildUdaConfig.js:1568-1602`). `usePageFilterSync.js`'s `$self`/dynamic-config effect
  (lines 68-118) is the one working precedent for "an external signal reactively rewrites part of
  a section's config and triggers a live requery via `useDataLoader`'s fetch key, no reload, no
  author re-edit" — but it's scoped strictly to `filters`/`comparisonSeries.variants` today, never
  to `groupBy`/`columns`/xAxis.
- **`comparisonSeriesCombine`** (`{mode: 'difference'}`) is a real, already-shipped mechanism
  (`buildUdaConfig.js` ~1600-1602; server-side per `dama` completed task
  `comparison-series-difference-mode.md`) — the anchor-arm-minus-variant-arm behavior with
  diverging/zero-centered colors that TEMPLATE_SPECS' `route_diff_*` entries already use. It is
  simply never author-exposed today. This is what "comparison mode" means in this task's picker:
  a toggle between plain (arms shown independently — default) and difference (arms combined via
  `comparisonSeriesCombine`, with the corresponding `_diff_colors()`-style color rule).
- **`GridGraph`/`BarGraph` are already axis-target-agnostic** — they resolve which column is the
  x/y/color axis purely by scanning for a static author-set `target` flag on each column
  (`GridGraph.jsx:34-46`, `BarGraph.jsx:19-26`). No render-layer changes are implied by changing
  *which* expression carries that flag.
- **No prior art for deriving an axis/query characteristic from data shape** exists anywhere in
  the reviewed surface. The one "adapts to data" example (`GridGraph.jsx:190`,
  `formatMinutesAuto`) only picks a legend number-formatting unit from the already-fetched data's
  max value — a display tweak, not a query-time or axis-selection mechanism.
- **Bottom line**: full dynamic resolution-derivation is a moderate-to-large *additive* extension
  (new route-level field + a new dynamic-config-write mechanism paralleling the existing
  comparisonSeries `$self` pattern, targeting columns/xAxis instead of filters + special-casing a
  handful of resolution-dependent measure expressions) — not blocked by the architecture, since
  resolution here is mostly "which GROUP BY expression," never "which table/join." Safe to defer.

## Resolution: explicit-for-now decision

Per user direction 2026-07-20: ship v1 with resolution (and comparison mode) as **explicit,
author-facing choices in the new Measure picker**, matching `TEMPLATE_SPECS`'s current shape
(e.g. `tmc_speed_bar_graph_day` = speed × day × bar, `tmc_speed_line_graph` = speed × 5-min ×
line). This is a deliberate, pre-authorized fallback — the goal remains resolution-derived-from-
routes (previous section), but forcing an explicit pick now avoids inventing all three pieces of
net-new work above, and is understood to be safe to defer/extend later without a rearchitecture.
This also simplifies Workstream 1 below, since the shared vocabulary artifact can keep
`TEMPLATE_SPECS`'s existing keying (graphType × measure × resolution × comparisonMode) rather than
also needing to design around implicit derivation right now.

## Architecture decision: library vs. theme boundary

**Important catch, not yet raised with the user before this file — flag prominently at next
review.** `src/dms/` is a generic, reusable git submodule; NPMRDS-specific concepts (Speed/Travel
Time/Delay/CO2, PM3, ClickHouse epoch grain) do not belong hardcoded inside it. The codebase
already draws this line correctly elsewhere: `ReportRouteList` — despite being deeply tied into
the generic `sectionMenu`/`dataWrapper`/`comparisonSeries` plumbing — lives in
`src/themes/transportny/components/`, not in `src/dms/`. The "Card/Spreadsheet
`usesItemMutationProps` registry flag" (added to the DMS library so a *specific* component could
opt into item-mutation props without a hardcoded name allow-list, see
`reportroutelist-page-templates.md`'s Files Touched section) is the precedent to follow here:

- **Library-side (`src/dms/`), small and generic**: a registration/extension point so a theme or
  component-type config can supply additional custom `sectionMenu` item-groups, structurally
  alongside `join`/`comparisonSeries`/`pivot` in `getSectionMenuItems`
  (`sectionMenu.jsx:40, 872`). This is genuinely reusable — any site could register its own
  domain-specific picker the same way.
- **Theme-side (`src/themes/transportny/`), the actual bulk of the work**: the NPMRDS vocabulary
  artifact itself, and the "Measure" item-group implementation that consumes it and calls the new
  library extension point. This keeps domain logic out of the shared library, exactly like
  `ReportRouteList`.

This means "add an item-group to `sectionMenu.jsx`" (how this was phrased earlier in the scoping
conversation) is not quite literal — the *extension point* goes in `sectionMenu.jsx`; the *NPMRDS
measure picker* goes in the theme. End-author experience is identical either way (it still feels
like part of the section's normal config menu). Flag this explicitly when this file is next
reviewed, since it changes "files requiring changes" from "one file in `src/dms/`" to "a small
generic hook in `src/dms/` plus the real implementation in `src/themes/transportny/`."

## Proposed design

### Workstream 1 — shared vocabulary artifact (one implementation, not two hand-synced copies)

User's stated constraints (2026-07-20): one canonical implementation; minimize regression risk to
the mature, 68-round-hardened `scripts/convert_old_reports.py`; don't burn effort/tokens iterating
on this piece repeatedly.

**Proposed approach**: extract the vocabulary *ingredients* (not the full cartesian-expanded
`TEMPLATE_SPECS` dict, which exists mainly for the Python tool's own drift-detection needs) into
one shared, plain-data JSON file — no functions, no logic, just measure expression strings,
resolution/axis-grouping expression strings, comparison-mode/display-rule definitions:

- Measure expressions: `SPEED_EXPR`, `TRAVEL_TIME_EXPR`, `DELAY_EXPR`, `CO2_EXPR_PASSENGER`,
  `CO2_EXPR_TRUCK`, plus which measures require a join (`META_JOIN`/`AADT_DIST_JOIN`) and which
  don't.
- Resolution/axis fragments: what `xAxis`/`groupBy` config each of 5-minutes/15-minutes/day
  produces (`epoch` / `QUARTER_HOUR_EXPR` / `date`), per graph type where it differs.
- Comparison-mode fragments: the plain (no-op) case, and `difference` (→
  `comparisonSeriesCombine: {mode: 'difference'}` + `_diff_colors()`-equivalent color rule).

Both `scripts/convert_old_reports.py` (swapping its hardcoded Python string constants for
`json.load()` reads of this file) and the new JS "Measure" picker (in
`src/themes/transportny/`) consume the SAME file. This directly targets the "one implementation"
requirement for the part that actually causes silent drift — the underlying formulas/expressions —
while keeping the *composition* logic (how ingredients combine into a final Card/graph config for
a given graphType) implemented natively and independently in each language. Composition here is
close to mechanical (lookup + shallow-merge a handful of fragments into a config object — see the
`TEMPLATE_SPECS` entries already read, e.g. `tmc_speed_bar_graph_day`/`route_diff_speed_5min`),
so duplicating just that thin layer is low regression-risk, unlike duplicating the formulas
themselves. Net effect: the Python-side change is small and mechanical (relocate constants, same
values, low regression risk); the JS side is genuinely new code with no prior implementation to
regress.

**Where the JSON file lives**: needs to be readable by a Python script at repo-root `scripts/` AND
importable by the theme-side JS bundle. Proposed: a new top-level location neutral to both, e.g.
`data-types/npmrds_graph_vocabulary/vocabulary.json` or a new top-level `shared/` — needs a home
that isn't inside the `src/dms/` submodule (per the library/theme boundary above) and isn't deep
inside `src/themes/transportny/` if `scripts/convert_old_reports.py` is expected to reach it with a
plain relative path. **Open decision, pick before implementing.**

### Workstream 2 — the Measure picker UI

1. **`src/dms/` — generic extension point.** Add a way for `getSectionMenuItems`
   (`sectionMenu.jsx:40`) to accept additional item-group builders supplied via component-type
   config or theme (mirroring how `join`/`comparisonSeries`/`pivot` are already built as
   `datasetSubMenus` at line 872) or via a registry flag on the component type (mirroring
   `usesItemMutationProps`). Exact mechanism TBD at implementation time — keep this piece small.
2. **`src/themes/transportny/` — the actual Measure item-group.** Graph Type select → Measure
   select (drawn from the vocabulary JSON) → Resolution select (5-minutes/15-minutes/day) →
   Comparison Mode select (Plain/Difference). On selection, generates and writes: `columns`
   (calculated yAxis/xAxis column configs), `join` (if required), `comparisonSeries.combine`,
   `display` color rules — into the same section state the generic controls already own, so
   Column Manager / comparisonSeries / join menus remain usable afterward for manual override.
3. **v1 behavior on re-selection**: picking a new combo re-stamps/overwrites the relevant config
   fields (a "smart default generator," not a persistent spec-tracked binding with drift
   detection). `TEMPLATE_SPECS`' "drift" reconciliation concept (mentioned in
   `old-reports-conversion.md`'s round notes) is NOT being ported into the live UI this round —
   flag as a possible future enhancement only if asked.
4. **Where the vocabulary JSON loads in the browser**: simplest v1 is a build-time JSON import
   (Vite supports importing `.json` directly) rather than a new dms-server API endpoint, since this
   is static reference data, not per-site/tenant-configurable. Revisit if that changes.

## Open questions / design decisions still needed at implementation time

- Exact shared-JSON-file location (Workstream 1) — needs a home reachable by both the Python
  script and the theme's JS bundle, outside `src/dms/`.
- Exact `sectionMenu.jsx` extension mechanism (registry flag vs. theme-supplied builder list vs.
  something else) — keep it small and generic; look at how `usesItemMutationProps` was wired for
  precedent.
- Full enumeration of which measures require a join vs. not, and which resolution options are
  valid per graph type (some combinations in `TEMPLATE_SPECS` may not exist for every graph
  type — don't assume the cartesian product is fully populated; check before building the picker's
  option lists).
- User's "SOME concerns" about `ReportRouteList` capabilities/regressions (raised 2026-07-20, not
  yet specified) — needs a follow-up conversation; may add scope to this task or spin out a
  sibling one.

## Files requiring changes (expected, not exhaustive — refine during implementation)

| File | Change |
|---|---|
| New: shared vocabulary JSON (location TBD, see open questions) | Measure expressions, resolution/axis fragments, comparison-mode/display fragments — plain data, no logic |
| `scripts/convert_old_reports.py` | `TEMPLATE_SPECS`'s hardcoded constants (`SPEED_EXPR` etc.) sourced from the shared JSON instead of inline Python strings; surrounding logic (gap detection, year/bin gating) untouched |
| `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` | Small, generic extension point for theme/component-supplied additional item-groups |
| New, in `src/themes/transportny/`: a Measure picker component/config | Graph type + measure + resolution + comparison-mode controls; composition logic that reads the shared JSON and writes section state |

## Testing checklist (draft — expand during implementation)

- [ ] Picking a measure/resolution/comparison combo on a blank AVL Graph section produces a
      working, live-rendering graph, matching what the equivalent `TEMPLATE_SPECS` entry produces
      via the Python converter today (spot-check at least one plain and one `difference` combo)
- [ ] Re-picking a different combo correctly overwrites the generated config without leaving stale
      fields from the previous pick
- [ ] Generated config remains editable via the existing generic `join`/`comparisonSeries`/pivot/
      Column Manager controls afterward
- [ ] `scripts/convert_old_reports.py`'s existing test/census behavior is unchanged after switching
      its constants to read from the shared JSON (full census rerun, 0 regressions vs. pre-change
      baseline)
- [ ] `ReportRouteList`'s existing route→graph assignment (`$self` binding) still works unchanged
      alongside a Measure-picker-generated graph section (no interaction assumed, but verify)
