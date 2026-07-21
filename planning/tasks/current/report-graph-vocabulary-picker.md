# Report Graph Vocabulary Picker — author-facing measure/resolution/comparison-mode config

## Status: Workstream 1 DONE (2026-07-20). Workstream 2 (the Measure picker UI) DONE (2026-07-20).

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

### Workstream 1 — shared vocabulary artifact — DONE (2026-07-20)

User's stated constraints (2026-07-20): one canonical implementation; minimize regression risk to
the mature, 68-round-hardened `scripts/convert_old_reports.py`; don't burn effort/tokens iterating
on this piece repeatedly.

**Implementation summary**: `data-types/npmrds_graph_vocabulary/vocabulary.json` (+ a `README.md`
in the same directory documenting the field reference, composition contract, and
regeneration/verification procedure) now holds `measures`/`joins`/`resolutions`/`comparisonModes`.
`scripts/convert_old_reports.py` sources `SPEED_EXPR`, `SPEED_EXPR_TRUCK`, `TRAVEL_TIME_EXPR`,
`DELAY_EXPR`, `AVG_DELAY_EXPR`, `CO2_EXPR_PASSENGER`, `CO2_EXPR_TRUCK`, `META_JOIN`,
`AADT_DIST_JOIN`, `DIST_KEY_EXPR` (derived off `AADT_DIST_JOIN` directly instead of duplicated),
`WEEKDAY_EXPR`, `HOUR_EXPR`, `QUARTER_HOUR_EXPR`, `MONTH_EXPR`, and `DEFAULT_DIFF_COLOR_RANGE`
from `GRAPH_VOCAB = json.load(open(VOCAB_PATH))` (loaded once near the top of the file) instead of
hardcoding them.

**Verification (done, not deferred to a live census rerun)**: the testing checklist below
originally called for "full census rerun, 0 regressions" — that requires VPN access to the dev DB
(see `[[reference_dev_db_requires_vpn]]`) and, more importantly, is the wrong tool for verifying a
*pure constant-relocation* change (census re-exercises live conversion behavior against real data;
it can't prove two Python literals are byte-identical any more precisely than a direct comparison
can). Instead: captured every JSON-serializable module-level constant in
`convert_old_reports.py` (via `dir(module)`, skipping callables/classes/modules, handling
tuple-keyed dicts like `GRAPH_TEMPLATE_MAP`) both **before** and **after** the edit, and diffed.
Result: all 88 pre-existing constants — including the full 60-entry `TEMPLATE_SPECS` dict and the
61-entry `GRAPH_TEMPLATE_MAP` — are byte-for-byte identical; the only new top-level names are
`VOCAB_PATH`/`GRAPH_VOCAB` themselves. This is a stronger guarantee for this specific change than a
census run would have been (it catches drift anywhere in the derived constant tree, deterministically,
with no live DB dependency). The procedure is documented in the vocabulary README's "Regenerating /
verifying" section for reuse if the vocabulary or its Python consumer changes again.

**Design deviations from the plan as originally written**:
- The plan said Python would "swap hardcoded string constants for `json.load()` reads" — done
  literally for most constants, **except** the AADT-override substring-swap machinery
  (`_CO2_CAR_FACTOR`/`_CO2_TRUCK_FACTOR`/`_SPEED_CAR_EXPR`/`_SPEED_TRUCK_EXPR`/`_AADT_CAR_EXPR`/
  `_AADT_TRUCK_EXPR`/`_AADT_DELAY_FRAGMENT`/`_AADT_DELAY_OVERRIDE`/`_AADT_CAR_OVERRIDE`/
  `_AADT_TRUCK_OVERRIDE`/`AADT_OVERRIDE_SUBS`), which stays **entirely untouched, Python-private**.
  This mechanism does a live string-replace against a report's cloned column expression at
  substring granularity (`build_graph_section_data`, `overrides.aadt` handling) — refactoring it
  into the vocabulary would risk breaking byte-identity between the fragment and the expression it
  must be found inside, for zero benefit (the JS picker doesn't need this report-level override
  substitution in v1 anyway — see scope). Added two new guard assertions
  (`assert _AADT_CAR_EXPR in CO2_EXPR_PASSENGER`, `assert _AADT_TRUCK_EXPR in CO2_EXPR_TRUCK`,
  alongside the pre-existing `assert _AADT_DELAY_FRAGMENT in DELAY_EXPR`) so any future edit that
  breaks this substring relationship fails loudly at import time instead of silently.
- **`AVG_DELAY_EXPR` and `CO2_EXPR_PASSENGER`/`CO2_EXPR_TRUCK` are stored as fully-composed final
  strings in the JSON**, not re-derived at runtime from `DELAY_EXPR`/sub-fragments the way Python
  used to compose them (an f-string wrapping `DELAY_EXPR` for the former; `.format()` calls over
  `_CO2_CAR_FACTOR`/`_SPEED_CAR_EXPR`/`_AADT_CAR_EXPR` for the latter two). Reasoning: the JS
  picker has no equivalent Python sub-fragments to derive from, and re-deriving in two languages
  independently reintroduces exactly the drift risk this task exists to eliminate. The tradeoff:
  if `DELAY_EXPR`/`hoursOfDelay` ever changes in the JSON, `avgHoursOfDelay`/CO2 must be
  hand-updated to match rather than auto-following — mitigated by the documented
  regenerate-and-byte-diff procedure (README.md), not by runtime coupling.
- **A new join constant, `TMC_IDENTIFICATION_JOIN` (source 455/view 3464), had to be added** — see
  the finding below. This was NOT anticipated by the original plan (which only named
  `META_JOIN`/`AADT_DIST_JOIN`).

**Non-obvious finding (load-bearing for Workstream 2, discovered 2026-07-20 while extracting
ingredients)**: `speed`/`speedTruck`'s `TEMPLATE_SPECS` entries carry **no `"join"` key at all**,
yet `SPEED_EXPR` references `table1.miles`. This is not an oversight — `ensure_graph_templates`
mints new templates by deep-copying `TEMPLATE_BASE_NAME`'s (`tmc_travel_time_line_graph`) live
`stateJson`, and only *overwrites* `state["join"]` when a spec's `"join"` key is truthy (a full
replace, never a merge — confirmed at `ensure_graph_templates`'s mint branch,
`state["join"] = {"sources": spec["join"]}`, and its drift-detection branch). So any spec that
omits `"join"` silently **inherits whatever join the base template already has** — confirmed live
by reading `scratchpad/npmrds-sub/old-reports/avl_graph_templates.json` (a dump of the 3
hand-built pre-converter template rows): all three carry a join to **source 455/view 3464**
("NPMRDS TMC Identification V5/V6"), a *different* source than `META_JOIN` (582/983) even though
both happen to expose a `miles` column. This is also already documented (independently, before
this task) in `src/dms/documentation/npmrds-data-sources.md`'s "Which measures use which source"
table as "the default join every `avl_graph_template` row carries, not an opt-in one." **A
from-scratch picker has no base template to clone from and therefore cannot rely on this
inheritance** — it must wire `TMC_IDENTIFICATION_JOIN` explicitly for any `speed`/`speedTruck`
measure, which is why this join is now a first-class entry in `vocabulary.json`'s `joins` object
even though it was never an explicit Python constant before this task. `travelTime` needs no join
at all (its expression only touches `ds.*` columns) — confirmed by reading `TRAVEL_TIME_EXPR`
directly, it inherits the same base-template join but never actually uses it.

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

**Where the JSON file lives — DECIDED (2026-07-20, user-confirmed)**:
`data-types/npmrds_graph_vocabulary/vocabulary.json` (+ sibling `README.md`). Not registered as a
DMS dataType plugin (no server routes/worker, not in `register-datatypes.js`) — just a plain JSON
file at a location reachable by `scripts/convert_old_reports.py` via `REPO`-relative path (see
`VOCAB_PATH` near the top of that file) and importable by Vite's build-time JSON import for the
theme-side JS bundle (Workstream 2, not yet built).

### Workstream 2 — the Measure picker UI — DONE (2026-07-20)

**Implementation summary**:

1. **`src/dms/` — generic extension point (small, as planned).**
   `patterns/page/components/sections/sectionMenuExtensions.js` (new) — a tiny registry mirroring
   `componentRegistry.js`'s shape: `registerSectionMenuExtensions(componentName, builders)` /
   `getSectionMenuExtensions(componentName)`, keyed by ComponentRegistry component `name` (e.g.
   `"AVL Graph"`). `sectionMenu.jsx` calls `getSectionMenuExtensions(currentComponent?.name)`,
   invokes each builder with the same primitives the function already assembled
   (`state, dwAPI, mapAPI, isEdit, canEditSection, currentComponent, sectionState, actions, auth,
   ui, dataSource, pageDataSources`), catches per-builder exceptions so one broken extension can't
   blank the whole menu, and splices the result in as `...extensionMenus` between `columns` and
   `filter` in the returned item list. `registerSectionMenuExtensions` is exported from the
   package's public `index.js`. `siteConfig.jsx`'s `pagesConfig` auto-registers
   `theme.sectionMenuExtensions` (a `{componentName: builder|builder[]}` map) the same way it
   already auto-registers `theme.pageComponents`/`theme.columnTypes` — a theme opts in by adding
   one key, no per-site wiring needed.
   - **Design deviation, found live, was a real bug**: `registerSectionMenuExtensions` initially
     *appended* to the per-component builder list on every call (mirroring the task's original
     "mirrors `usesItemMutationProps`" framing too literally). `pagesConfig` re-registers on every
     site-config build (confirmed live via Vite HMR: each theme-file hot-reload re-ran the
     registration), so appends silently accumulated duplicate builders — observed live as the
     "Measure" item-group rendering **14 times** in the section menu. Fixed to *replace* the list
     per component name (`registry[componentName] = builders`), matching `registerComponents`'
     `Object.assign` idempotency. This is exactly the class of bug the root CLAUDE.md's "test in a
     browser before reporting complete" instruction exists to catch — would not have been caught by
     code review alone.
2. **`src/themes/transportny/components/MeasurePicker/`** (new) — the actual Measure item-group,
   registered for `"AVL Graph"` via `theme.sectionMenuExtensions` in both `theme.js` and
   `themev2.js`.
   - `composeMeasureConfig.js` — pure composition logic (no React), reads
     `data-types/npmrds_graph_vocabulary/vocabulary.json` via a build-time Vite JSON import.
     `composeMeasureConfig({graphType, measureKey, resolutionKey, comparisonModeKey,
     externalSourceColumns, defaultColors})` returns `{columns, join, comparisonSeriesCombine,
     displayPatch}`. Mirrors `TEMPLATE_SPECS`/`ensure_graph_templates`' exact composition rules:
     yAxis target is `"color"` for GridGraph, `"yAxis"` otherwise; xAxis is either a physical
     column swapped in from `externalSource.columns` (5-minutes/day) or a fully-calculated column
     dict straight from the vocabulary (15-minutes/hour/weekday/month); `join.sources` is built
     positionally from the measure's `requiresJoin` array (`table1`/`table2`); difference mode
     produces `comparisonSeriesCombine: {mode: 'difference'}` plus a `_diff_colors()`-equivalent
     `display.colors` patch (reversed ramp per-measure `reverseColors`, `byValue` only for
     BarGraph, matching the vocabulary README exactly).
   - `index.js` — the sectionMenu item-group itself. Graph Type / Measure / Resolution /
     Comparison Mode each render as a nested select (checkmark on the current pick, `onClickGoBack`
     after picking) using the same nested-submenu shape as the built-in `join`/`comparisonSeries`
     menus. Every pick immediately calls `composeMeasureConfig` and writes the result via
     `dwAPI.setState` (the documented escape hatch) — no separate "Apply" step, matching how every
     other sectionMenu select already behaves. The current pick is bookkept at
     `display._measurePick` (mirrors `display._functions`) purely so reopening the menu shows the
     right checkmarks/summary — never read by the render/query pipeline.
   - **Design deviation, found live, was a real bug**: the first version fully replaced
     `draft.columns` with just `[yAxisColumn, xAxisColumn]` on every apply. Live-tested against a
     real Python-converter-built report section (`2189959`, "Route Line Graph, Speed" on
     `converted_reports/route_44_incident_analysis_april_2026`) which — like every graph on a
     Report Page template — already carries a `__series` comparison-series categorize column from
     its `$self`-bound subscriber. A wholesale `columns` replace would have silently deleted that
     column, breaking the per-route overlay ReportRouteList depends on; re-running the picker on an
     *already-configured* section (the pre-existing Python-built yAxis/xAxis carry no origin tag)
     also produced 5 columns instead of 3 (stale duplicates). Fixed by replacing only columns whose
     `target` is `xAxis`/`yAxis`/`color` (`MANAGED_TARGETS` in `index.js`) and always leaving
     `categorize`-targeted columns alone — this both preserves the comparison-series column *and*
     correctly de-dupes on repeat/first use, verified live (see Testing checklist below).
3. **v1 behavior on re-selection**: confirmed live — picking a new combo re-composes and
   overwrites `columns`/`join`/`comparisonSeries.combine`/`display.colors` every time (a "smart
   default generator," not a persistent spec-tracked binding with drift detection). No
   `TEMPLATE_SPECS`-style drift reconciliation was ported into the live UI.
4. **Resolution/graph-type gating — resolved as "no gating" (author-empowerment call)**: the open
   question about "full enumeration of which resolution options are valid per graph type" is
   resolved by NOT restricting the cross product at all — every graphType × measure × resolution ×
   comparisonMode combination is offered. Composition is mechanical from primitives (no base
   template to be missing), and the investigation findings already established GridGraph/BarGraph
   are axis-target-agnostic, so there's no known technical gap to encode as a restriction; letting
   TEMPLATE_SPECS' historical gaps (which existed only because old reports never needed those
   combos) constrain a from-scratch generator would be exactly the "one-off developer decision"
   the author-empowerment principle warns against.
5. **Where the vocabulary JSON loads in the browser**: build-time Vite JSON import, as planned —
   `composeMeasureConfig.js` imports `../../../../../data-types/npmrds_graph_vocabulary/vocabulary.json`
   directly.

**Live verification performed** (2026-07-20, against the `npmrdsv5`/`dev2` local dev stack, report
section `2189959`): opened the section in edit mode, confirmed the "Measure" item-group appears
exactly once (post idempotency fix) with all 4 selects populated correctly; picked "Hours of
Delay" and confirmed the attribution line updated to show both `NPMRDS_V6_TMC_META (983)` and
`AADT_DISTRIBUTIONS (3524)` joins wired in (the 2-join case); picked "Difference" comparison mode
and "Grid Graph" type with no console errors and correct re-render; opened Column Manager and
confirmed exactly 3 columns (`__series`, the measure, the axis) after re-picking on an
already-populated section — no duplicates, comparison-series column intact; switched Resolution to
"15 Minutes" and confirmed the calculated `intDiv(ds.epoch, 3) as quarter_hour` column appears
correctly. All test picks were made in the unsaved draft state and discarded (never saved) —
confirmed via `dms raw get 2189959` afterward that the persisted row is unchanged.

**Not yet verified live**: the from-scratch/blank-AVL-Graph-section path (adding a brand new
section via Add Component, picking a data source, then using the Measure picker with zero
pre-existing columns) — the tested section already had an active data source and prior columns.
The composition logic path is identical either way (externalSource.columns is populated the same
way regardless of section history), so this is believed correct but not independently observed.
Also not verified: `ReportRouteList`'s `$self` binding continuing to work end-to-end with a live
route/date range attached (the test report's routes weren't actually toggled onto the graph, so no
real query ever fired in either the before or after state — this is a pre-existing condition of the
test fixture, unrelated to this change).

### Round 2 (2026-07-20, same day) — user-reported gaps from real usage, all fixed

User built a real report from the "Report Page" template and hit three gaps in quick succession,
each fixed live:

1. **"Measure" didn't show up on a manually-added AVL Graph section.** Root cause: the item-group's
   `cdn` required `dataSource?.activeSource` (mirroring the built-in "Join Dataset" submenu's own
   gate) — a freshly-added section has no Dataset picked yet, so the menu was invisible with no
   indication why. **Fix**: dropped the `activeSource` requirement entirely.
2. **User's actual intent, stated directly**: "it should show up anyway... I really want it to be
   conditional based on if the user is on a report page (if ReportRouteList is on the page)."
   Investigated feasibility (dispatched to an Explore agent) before implementing — confirmed cheap:
   `PageContext` already provides `item` (the full page row, `.sections`/`.draft_sections`) and
   `editPageMode`, both already in scope in `section.jsx` but only partially destructured. **Fix**:
   `section.jsx` now derives `siblingSections = item?.[editPageMode ? 'draft_sections' :
   'sections'] || []` in both `SectionEdit`/`SectionView` and threads it through
   `getSectionMenuItems({..., siblingSections})`; `sectionMenu.jsx` forwards it into the extension
   ctx (`sectionMenuExtensions.js`'s callers now receive it too — a genuinely reusable addition,
   not NPMRDS-specific). The Measure picker's `cdn` now gates on `isReportPage =
   siblingSections.some(s => s?.element?.['element-type'] === 'ReportRouteList')` instead of
   `dataSource?.activeSource`. No JSON.parse needed — `element-type` is a plain field on each raw
   section row.
3. **After (1)+(2) landed, routes assigned via ReportRouteList did nothing** — user: "I added them,
   nothing happened... presumably because there was no data source set... I thought the template
   handled that??" Root cause: the picker had never written `state.externalSource` at all — that's
   a separate, generic "Dataset" sectionMenu control the picker didn't touch, so a from-scratch
   section had no primary source to query against regardless of how correct its columns/join were.
   **Fix**: added a new `baseSource` entry to `vocabulary.json` (source 583/view 982, "NPMRDS
   Production V6" — the single source every measure's `ds.*` columns assume) and its `sourceInfo`
   embeds a real, live column list verbatim (58 columns: 15 from the base table + 43 merged in from
   the TMC join — this merged shape, not just the base table's own columns, is what the platform
   itself produces once a join is active, confirmed by direct comparison below). `applyPick` now
   sets `draft.externalSource = {...BASE_SOURCE.sourceInfo}` whenever `!draft.externalSource?.source_id`
   — a default, never overwriting an author's own different Dataset pick (see vocabulary README's
   "baseSource" composition contract). Also fixed the `externalSourceColumns` passed into
   `composeMeasureConfig` to fall back to `BASE_SOURCE.sourceInfo.columns` (not the generic
   `{name, type:'string'}` stub) when no Dataset is set yet, so the very first apply produces a
   fully correct physical xAxis column, not a placeholder needing a second pick to self-correct.

   **Ground-truth verification (stronger than a fresh live test)**: rather than build a new scratch
   fixture, pulled the live "Report Page" template row itself (`npmrds_sub|page_template` id
   `2187021` — the actual template `+ Add Page → Your Templates → Report Page` instantiates) and
   diffed its starter AVL Graph's `stateJson` directly against what this task's code now produces.
   Confirmed byte-identical: (a) `externalSource` — same 58-column list, same source/view ids; (b)
   `display._functions.subscribers[0]` — `{functionId:"comparison_series", enabled:true,
   paramKey:"$self", args:{labelKey:"label", valueKey:"filters"}}`, exactly what `applyPick` writes;
   (c) `comparisonSeries` — `{enabled:true, seriesKey:"__series", seriesLabel:"Routes"}`, exactly
   the defaults `applyPick` applies when unset. This is a stronger check than a live round-trip on
   a fresh fixture would have been for this specific question (byte-diff against the actual
   template's own known-good ground truth, not "did a chart render" which depends on unrelated
   factors like whether real data exists for the date range) — but a live "assign a route → see the
   chart actually render real data" pass was NOT done this round; flagged as a good next check
   whenever convenient, not blocking.

   **Also mid-session**: a section (`2195016`, the very section used for rounds 1-3 above) was
   accidentally detached from a live user report's `draft_sections` during interactive testing —
   the user's own action, not a code bug, but it's why testing moved off that page. See
   `[[feedback_use_own_scratch_page_for_ui_testing]]` (assistant memory) — going forward, live UI
   testing should happen on a dedicated scratch page, not a page the user might have open.

### Round 3 (2026-07-20, same day, continued) — two more real bugs found chasing "no data renders"

User kept testing on their own real report (not a scratch page, at their explicit request — see
`[[feedback_use_own_scratch_page_for_ui_testing]]`) and reported the Round-2 Dataset-default fix
still didn't produce a working chart: they could click a route onto the graph's chip, but the
chart stayed blank with no error. Two genuinely separate bugs found, both fixed:

1. **Generic library bug — `buildUdaConfig.js`'s `mappedGroupBy` missing a fix `mappedOrderBy`
   already has.** When comparison-series fan-out is active, each route's arm query gets wrapped as
   `SELECT * FROM (<arm>) AS fanout`, and GROUP BY on the OUTER query can only address the arm's
   own SELECT-level alias — not any table alias (`ds`/`table1`/...) a *calculated* column's
   expression references internally. `mappedOrderBy` already has an explicit `if
   (activeComparisonSeries && isCalculatedCol(col))` branch that swaps in the bare alias for
   exactly this reason (with its own code comment describing the identical hazard) —
   `mappedGroupBy` never got the equivalent fix, so a calculated groupBy column (e.g. this
   picker's "15 Minutes" resolution, `intDiv(ds.epoch, 3) as quarter_hour`) combined with an
   active comparison-series fan-out would send the raw expression (referencing `ds`, out of scope
   in the outer query) as the GROUP BY clause — failing server-side. The "5 Minutes" resolution
   (a plain physical `epoch` column, no calculated expression) never hits this, which is why the
   template's own pre-existing graph appeared to work while a "15 Minutes" picker-built graph
   didn't. **Fixed** in `buildUdaConfig.js`: `mappedGroupBy` now mirrors `mappedOrderBy`'s exact
   alias-extraction logic for calculated columns under active comparison-series. This is a
   library-level fix — benefits any future author-built calculated groupBy + comparison-series
   combination, not just this picker. Confirmed via careful code reading (not live-tested — see
   still-open item below), evidenced by the asymmetry against `mappedOrderBy`'s own already-present
   fix and code comment describing the identical failure mode.
2. **The actual root cause of "zero `/graph` requests fire at all, for ANY resolution"** — found
   after the user reported their `2195132` test graph (Travel Time · 5 Minutes · Plain — doesn't
   even hit bug #1) still showed nothing, and the browser network tab showed only the
   `reports_snap_2` route-persist call firing on chip-click, never a graph-data request. Traced to
   `useDataLoader.js`: `fetchMode = state?.display?.fetchMode ?? (state?.display?.readyToLoad ===
   true ? 'smart' : 'cache')`, and the computed `readyToLoad` gate that actually controls whether
   the main load effect ever fires is `isEditMode || (isValidState && (fetchMode !== 'cache' ||
   allowEditInView))` — in View mode, with no explicit `display.fetchMode` and
   `display.readyToLoad` defaulting `false` (graph_new/config.jsx's own `defaultState.display`
   never sets either), this resolves to `fetchMode: 'cache'` → `readyToLoad: false` →  **the graph
   never fetches, full stop, independent of columns/join/comparisonSeries correctness**. The
   template's pre-wired starter graph has `"fetchMode": "force"` hand-baked into its saved state
   (from whenever it was originally authored); a from-scratch picker-built section has no template
   to inherit that from — same class of gap as `BASE_SOURCE`/`TMC_IDENTIFICATION_JOIN` before it.
   **Fixed**: `composeMeasureConfig.js`'s `displayPatch` now always includes `fetchMode: 'force'`
   (matching the template exactly), applied in `index.js`. This is very likely THE actual blocker
   the user was hitting throughout rounds 2-3 (bug #1 only affects the calculated-groupBy case,
   which wasn't even in play for their final test) — **not yet confirmed live**, since the user is
   doing the live verification pass themselves this round. To pick up the fix on an
   already-picker-built section (created before this fix), no delete/recreate needed — just
   re-apply any Measure submenu pick once (it always overwrites `display.fetchMode`).

**Split out to its own task file**: the `graphIds`-wiped-on-refresh/publish concern (plus a related
"ghost routes from another report" symptom) is a pre-existing `ReportRouteList` bug, unrelated to
this task's own scope — tracked separately in
[`reportroutelist-graphids-wiped-on-refresh.md`](./reportroutelist-graphids-wiped-on-refresh.md).
Summary for context: the hydration-race theory (partial `item.draft_sections` right after page
load) was investigated and ruled out — `item` is fetched atomically in one batched Falcor round
trip before `ReportRouteList` ever mounts, no partial-list window exists. Root cause still open;
see that task file for confirmed facts, candidate hypotheses, and repro steps.

## Open questions / design decisions still needed at implementation time

- ~~Exact shared-JSON-file location~~ — DECIDED, see Workstream 1 above.
- Exact `sectionMenu.jsx` extension mechanism (registry flag vs. theme-supplied builder list vs.
  something else) — keep it small and generic; look at how `usesItemMutationProps` was wired for
  precedent. Still open — Workstream 2 not started.
- Full enumeration of which resolution options are valid per graph type (some combinations in
  `TEMPLATE_SPECS` may not exist for every graph type — don't assume the cartesian product is
  fully populated; check before building the picker's option lists). **Partially resolved**: which
  measures require a join is now settled (see `vocabulary.json`'s `requiresJoin` per measure, and
  the `TMC_IDENTIFICATION_JOIN` finding above) — what's still open is graph-type × resolution
  validity, not measure × join.
- User's "SOME concerns" about `ReportRouteList` capabilities/regressions (raised 2026-07-20, not
  yet specified) — needs a follow-up conversation; may add scope to this task or spin out a
  sibling one.

## Files requiring changes (expected, not exhaustive — refine during implementation)

| File | Change | Status |
|---|---|---|
| `data-types/npmrds_graph_vocabulary/vocabulary.json` (new) | Measure expressions, joins, resolution/axis fragments, comparison-mode fragments — plain data, no logic | DONE |
| `data-types/npmrds_graph_vocabulary/README.md` (new, not originally planned) | Field reference, composition contract (target/fn/join-merge rules the composer must apply), explicitly-out-of-scope list, regeneration/verification procedure | DONE |
| `scripts/convert_old_reports.py` | `TEMPLATE_SPECS`'s generative constants (`SPEED_EXPR`, `SPEED_EXPR_TRUCK`, `TRAVEL_TIME_EXPR`, `DELAY_EXPR`, `AVG_DELAY_EXPR`, `CO2_EXPR_PASSENGER`, `CO2_EXPR_TRUCK`, `META_JOIN`, `AADT_DIST_JOIN`, `DIST_KEY_EXPR`, `WEEKDAY_EXPR`, `HOUR_EXPR`, `QUARTER_HOUR_EXPR`, `MONTH_EXPR`, `DEFAULT_DIFF_COLOR_RANGE`) sourced from the shared JSON instead of inline Python strings; AADT-override substring-swap machinery and all surrounding gap-detection/year-bin-gating logic untouched; two new guard assertions added | DONE |
| `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenuExtensions.js` (new) | Generic registry: `registerSectionMenuExtensions`/`getSectionMenuExtensions`, keyed by component name | DONE |
| `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` | Calls `getSectionMenuExtensions(currentComponent?.name)`, splices results in as `...extensionMenus` between `columns` and `filter` | DONE |
| `src/dms/packages/dms/src/index.js` | Exports `registerSectionMenuExtensions` | DONE |
| `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` | `pagesConfig` auto-registers `theme.sectionMenuExtensions`, mirroring `pageComponents`/`columnTypes` | DONE |
| `src/themes/transportny/components/MeasurePicker/composeMeasureConfig.js` (new) | Pure composition logic reading `vocabulary.json`; builds columns/join/comparisonSeriesCombine/displayPatch; exports `BASE_SOURCE` | DONE |
| `src/themes/transportny/components/MeasurePicker/index.js` (new) | The Measure item-group (4 nested selects) + apply logic writing via `dwAPI.setState`, replacing only `xAxis`/`yAxis`/`color`-targeted columns (never `categorize`); defaults `externalSource` to `BASE_SOURCE` when unset; gates on `isReportPage`; wires the `$self` comparison_series subscriber | DONE |
| `src/themes/transportny/theme.js`, `themev2.js` | Register `npmrdsMeasureMenu` for `"AVL Graph"` via `sectionMenuExtensions` | DONE |
| `data-types/npmrds_graph_vocabulary/vocabulary.json` | Round 2: added `baseSource` (source 583/view 982, full `sourceInfo` incl. 58-column list) — needed once the picker had to default the primary Dataset too | DONE |
| `data-types/npmrds_graph_vocabulary/README.md` | Round 2: documented `baseSource` + its composition contract (default-only, never overwrite an author's own Dataset pick) | DONE |
| `src/dms/packages/dms/src/patterns/page/components/sections/section.jsx` | Round 2: derives `siblingSections` from `PageContext`'s `item`/`editPageMode` in both `SectionEdit`/`SectionView`, threads into `getSectionMenuItems` — generic, reusable by any future extension | DONE |
| `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` | Round 2: destructures/forwards `siblingSections` into the extension ctx | DONE |
| `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` | Round 3: `mappedGroupBy` now mirrors `mappedOrderBy`'s calculated-column alias-extraction fix under active comparison-series fan-out — generic library bug, not NPMRDS-specific | DONE (not yet live-verified) |
| `src/themes/transportny/components/MeasurePicker/composeMeasureConfig.js` | Round 3: `displayPatch` always includes `fetchMode: 'force'` — without it a picker-built graph never issues a single `/graph` request in View mode | DONE (not yet live-verified) |
| `src/themes/transportny/components/MeasurePicker/index.js` | Round 3: applies `composed.displayPatch.fetchMode` to `draft.display.fetchMode` | DONE (not yet live-verified) |

## Testing checklist (draft — expand during implementation)

- [x] `scripts/convert_old_reports.py`'s behavior is unchanged after switching its constants to
      read from the shared JSON — verified 2026-07-20 via a full before/after byte-diff of every
      JSON-serializable module-level constant (88/88 identical, including the full `TEMPLATE_SPECS`
      and `GRAPH_TEMPLATE_MAP` dicts), not a live census rerun (see Workstream 1 "Verification"
      note above for why the byte-diff is the more appropriate check for this specific change).
      A live census rerun against the dev DB is still worth doing opportunistically next time VPN
      access is available, as a second, independent confirmation — not required to consider this
      item done.
- [x] Picking a measure/resolution/comparison combo produces correct, live-updating section state
      matching what the equivalent `TEMPLATE_SPECS` entry would produce — verified live 2026-07-20
      against report section 2189959: "Hours of Delay" wired both `META_JOIN`/`AADT_DIST_JOIN`
      (confirmed via the rendered attribution line), "Difference" comparison mode + "Grid Graph"
      re-rendered without error, "15 Minutes" resolution produced the correct calculated
      `intDiv(ds.epoch, 3) as quarter_hour` xAxis column. **Not yet verified**: an actual
      live-rendering graph with real data (the test fixture's routes weren't toggled onto the
      graph, so no query fired in either the before or after state — pre-existing, unrelated to
      this change) and the truly-from-scratch blank-section path specifically (composition logic
      is identical regardless of section history, so believed correct but not independently
      observed).
- [x] Re-picking a different combo correctly overwrites the generated config without leaving stale
      fields from the previous pick — verified live: re-picking on an already-populated section
      produced exactly 3 columns (not 5), confirmed via Column Manager. This required a fix (see
      Workstream 2 design deviations above) after the first version left stale duplicates.
- [x] Generated config remains editable via the existing generic Column Manager afterward —
      confirmed live (Column Manager showed the generated columns with normal edit affordances).
      `join`/`comparisonSeries` menus not independently re-tested post-generation this round.
- [ ] `ReportRouteList`'s existing route→graph assignment (`$self` binding) still works unchanged
      alongside a Measure-picker-generated graph section with a real route/date range attached and
      an actual query firing — not yet verified (test fixture had no routes toggled onto the
      graph, so this remains unobserved either way).
- [x] "Measure" only appears on report pages (has a `ReportRouteList` sibling), not on an arbitrary
      AVL Graph section elsewhere — verified live 2026-07-20 on a real report page (positive case);
      the negative case (no sibling) wasn't separately live-tested but the check is a one-line
      `.some(...)` over already-correctly-populated `siblingSections`, low risk.
- [x] Applying a pick with no Dataset set yet defaults `externalSource` to the canonical NPMRDS
      source — verified 2026-07-20 both live (Columns/Measure/AVL Graph Interactions all updated
      correctly on a real report's freshly-added section) and by direct byte-diff against the live
      "Report Page" template row (`2187021`)'s own starter graph — see Round 2 notes above.
      full end-to-end "route assigned → chart shows real data" round-trip still not done.
- [ ] **Round 3, not yet confirmed live**: a picker-built graph (any resolution) actually issues a
      `/graph` request and renders real data once a route is assigned — the `fetchMode: 'force'`
      fix (composeMeasureConfig.js) is believed to be the actual root cause of "zero graph requests
      ever fire," reasoned from `useDataLoader.js`'s `readyToLoad` gate, not yet confirmed by
      watching a real chart render after the fix. User is doing this verification pass themselves.
- [ ] **Round 3, not yet confirmed live**: the `mappedGroupBy` fix in `buildUdaConfig.js` actually
      lets a "15 Minutes"-resolution (calculated groupBy) picker-built graph render correctly under
      an active comparison-series fan-out — reasoned from code (a clear asymmetry against
      `mappedOrderBy`'s already-present, explicitly-commented fix for the identical hazard), not
      yet observed against a real query.
- [x] **Out of this task's scope, split out** — the `graphIds`-wiped-on-refresh/publish
      `ReportRouteList` bug now has its own task file:
      [`reportroutelist-graphids-wiped-on-refresh.md`](./reportroutelist-graphids-wiped-on-refresh.md).
