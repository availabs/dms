# Reports V2 Roadmap — gap analysis vs. the legacy NPMRDS report tool

**Status:** exploratory — informs future task creation, not itself a task. 2026-07-02.

**2026-07-06 — HIGH PRIORITY, blocking:** the `fan_out` feature branch this roadmap's work has been
landing on (both `dms-template` and the `dms` submodule) has grown well past its original scope and
needs to be cleaned up before merging to master. See
[fan-out-branch-cleanup.md](../tasks/current/fan-out-branch-cleanup.md). Do that before scoping/starting
any more of the categories below.

## Origin

Side-by-side comparison of screenshots of the legacy ("V1") NPMRDS report builder
(`npmrds.devtny.org/report/edit/...`) against the current ("V2") DMS-based `ReportRouteList` + Report
Page implementation ([reportroutelist-page-templates.md](../tasks/current/reportroutelist-page-templates.md),
[ReportRouteList README](../../../themes/transportny/components/ReportRouteList/README.md)). V2's
route-editor/per-graph-binding rework is functionally solid for what it covers (see those docs), but V1
has a materially larger feature surface. This doc catalogs the delta so it can be broken into scoped
tasks deliberately, rather than rediscovered piecemeal.

Screenshots reviewed:
1. The base report view ("WB East-West Arterial Poughkeepsie") — Controls sidebar (Routes/Folders,
   Stations, Colors, Graphs) + 4 stacked graph sections (map, info table, bar chart, line chart) — vs.
   V2's `/edit/page_11` route editor panel + line graph + speed heatmap + paginated route catalog.
2. The "Graphs" sidebar list expanded, showing the full **add-graph catalog** (categorized template
   picker).
3. A graph's "Display Data" dropdown open, showing the **metric catalog** available per graph.
4. The Routes list with an expanded **Route Group** node, showing route nesting/grouping mid-list
   (later clarified by the user as low-value — see the correction below and §4).

**2026-07-02 update:** items 2–4 above were reviewed after the initial version of this doc shipped and
surfaced several findings not in the original pass. New categories added: the metric catalog (§2) and
per-graph narrative text (§7). See each section for what's new vs. carried over.

**2026-07-02 correction (user-provided, from live V1 use):** the **"Routes" / "Folders" tab buttons**
in the Controls sidebar are **not** a per-report organizational feature. They browse a **route
catalog/library that's managed outside of any report** — routes are created and named there, optionally
organized into folders, then **imported into** a report. This is the real V1 counterpart to V2's
existing "Add a route to your report" catalog table (§9), not a "grouping routes within this report"
feature — folded into §9 below, and §4 (below) is narrowed to just the in-report **Route Group** tree
node, which is a separate, distinct mechanism the user has flagged as **not obviously useful** even in
V1 (see §4 for detail — this is a "confirm this is worth building at all" item, not a "figure out the
mechanism" item).

## Gap categories

### 1. Data filtering / query config — highest priority

V1's per-route "Advanced" panel has no V2 equivalent beyond a plain date range:

- Peak Selector (AM Peak / Off Peak / PM Peak)
- Weekday Selector (per-day toggle, Sn–St)
- Start/End **Time** (time-of-day window, distinct from the date range)
- Resolution (e.g. "5 Minutes", or **"Date"** — see §4, this is what drives by-day route groups)
- Vehicle data filter ("All Vehicles" — likely a truck/passenger split)
- "Set as relative date base" (one route acts as the baseline for % comparisons)
- Data Overrides: AADT, Percent Speed, Threshold Speed, Base Speed (manual inputs feeding
  delay/LOS calculations)
- "Download Raw NPMRDS Data" per route

This is the single biggest functional gap — it's most of what makes a route a *configured report
input* rather than just a geometry + date range.

### 2. Metric / measure catalog — new finding, high priority

Each V1 graph has "Display Data" / "Display Data 2" pickers exposing a large catalog of **derived
NPMRDS performance metrics**, not just raw speed:

- Speed, Travel Time, Average Travel Time, Freeflow
- Hours of Delay, Avg. Hours of Delay
- CO₂ Emissions, Avg. CO₂ Emissions
- Data Quality
- 95th Percentile, 97th Percentile
- Buffer Time Index, Planning Time Index, Misery Index, Travel Time Index

V2 currently computes exactly one derived measure (a hardcoded `(miles*3600)/travel_time` speed calc
column on the shipped graph templates — see the task doc's implementation log). None of the other
measures above exist as reusable calc columns/config anywhere in the current templates.

This is effectively a prerequisite for a lot of §3 (Graph Types) — several "missing graph types" are
really just *this metric catalog* plotted through a chart shell that already exists (e.g. a "Buffer
Time Index" line graph is the same `AVL Graph` component, just a different calc column). Recommend
scoping this as its own task: a reusable set of NPMRDS calc-column definitions (or a formatFn/UDA
expression library) that any graph template can reference, rather than duplicating one-off expressions
per template.

### 3. Graph types — expanded finding

V1's add-graph menu is a full **categorized template catalog**, much larger than the 4 types visible in
the original screenshot comparison:

- **Line Graphs:** Route Line Graph
- **Bar Graphs:** Bar Graph Summary, Experiential Travel Time, Hours of Delay Graph, Route Bar Graph,
  Route Difference Graph, Traffic Volume Graph
- **Maps:** Route Map
- **Grid Graphs:** TMC Difference Grid, TMC Grid Graph
- **Tables:** Route Compare Component, Route Info Box, TMC Info Box

Notable patterns in this catalog:
- **Route-level vs. TMC-level variants** of the same idea (Route Info Box vs. TMC Info Box; the two
  Grid Graphs) — V1 lets an author pick the aggregation granularity per graph.
- **Difference/comparison-specific presets** (Route Difference Graph, TMC Difference Grid) — a delta
  between two routes/periods as a first-class chart type, not something the author has to derive
  manually.
- The "Line/Bar/Map/Grid/Tables" categorization plus a **"Templates" + "Update All"** button pair at
  the top of the Controls sidebar imply a bulk-apply mechanism (e.g. re-apply a template's config
  across every graph on the page at once) — no V2 equivalent; worth its own scoping question rather
  than folding into "Graph Types."

V2 currently has 2 of these (line graph, a grid/heatmap). Missing, in rough order of distinctiveness
from what a Card/existing chart config could express vs. needing new chart logic:
- **Route Map** — no V2 equivalent. Geographic map with the route colored by a metric (speed) and a
  binned legend. Needs a MapLibre-backed graph type bound to route geometry + a metric.
- **Route Info Box / TMC Info Box** — no V2 equivalent. Tabular summary per route/TMC, rows colored to
  match route colors. Likely portable via existing Card primitives + the metric catalog from §2, per
  `src/themes/CLAUDE.md`'s "configure the Card" principle — check before building bespoke.
- **Bar graphs (6 named variants)** — no V2 bar chart type exists at all currently.
- **Difference/delta variants** (Route Difference Graph, TMC Difference Grid) — needs a "graph B minus
  graph A" computation, on top of whichever chart types already exist.
- **Route Compare Component** — unclear if distinct from Route Info Box without seeing it opened;
  flag for follow-up if this category is picked up.

### 4. In-report "Route Group" nesting — low priority, unclear value

Narrowed per the correction above: this section is **only** about the **"Route Group"** node seen
nested inside a report's Routes tree (created via the "Add New Group" button, with drag handles on
each route and a distinct "remove from group" (⊗) icon separate from the top-level routes' delete
("−") icon). It is unrelated to the Routes/Folders catalog-browsing tabs (see §9).

**User has used this live in V1 and could not find a clear benefit** — grouping routes this way does
not, for example, reduce the number of clicks needed to add them to a graph. Best guess is it's tied to
**Resolution: "Date"** (the by-day breakdown mode in the Advanced panel) auto-generating one route
entry per day and nesting them under a group node just to keep the flat list manageable — i.e. a
side-effect of by-day resolution needing somewhere to put N generated routes, not a deliberate
organizational feature with its own payoff.

**Recommendation: do not scope this as a feature.** If §1's by-day resolution is ever implemented and
it generates N routes per parent, some kind of list-collapsing UI will be needed then, and can be
designed at that point against V2's actual data model — no reason to build a speculative "Route Group"
primitive now on the strength of a V1 feature whose own value is unconfirmed even by the person who
uses V1 day to day.

### 5. Route color customization

V1 has a full HSV picker per route; the color propagates to the map, the info table rows, and the
graph lines. V2 graphs currently render with fixed/default colors — no per-route color assignment
exists in the current model.

### 6. Per-graph secondary data binding — refined finding

The original version of this doc flagged "Display Data 2" as a possible second independently-sourced
overlay. Now confirmed more precisely: on the "Speed, Travel Time AM Peak" graph, **Display Data** and
**Display Data 2** are two independent pickers into the §2 metric catalog, rendered as a **dual-axis
overlay on the same chart** — e.g. Speed (MPH, left axis) as solid/dashed lines and Travel Time
(Minutes, right axis) as a second set of lines, same routes, same chart. This is a "pick a second
metric, get a second y-axis" feature, not a second raw data source.

Separately, the original base-report screenshot's map section has a distinct **"HDS Data"** button
alongside "Routes"/"Display Data" — this does look like a genuinely separate bound data source (likely
an alternate/historical dataset, distinct from live NPMRDS), which is closer to the original "second
independently-sourced overlay" reading. So there appear to be two distinct capabilities worth
separating if scoped:
- **Dual-axis second metric** (Display Data 2) — pairs with the §2 metric catalog; relatively
  self-contained once that catalog exists (just needs a second y-axis + a second `buildUdaConfig`
  column wired to the same chart).
- **HDS Data source toggle** — a genuinely separate bound dataset per graph; needs its own scoping,
  likely a second `externalSource`-equivalent slot (same category of problem the ReportRouteList
  README's "two sectionMenu bindings" design solved for the route panel — may be a reusable pattern).

### 7. Per-graph narrative / methodology text — new finding

Below at least one V1 graph ("Speed, Travel Time AM Peak") sits an editable-looking text block
explaining the chart's methodology and calling out a specific observation, e.g.:

> "Hours of Excessive Delay (the graph on the right, below) shows the extra amount of time spent in
> congested conditions... the speed threshold is 20 miles per hour or 60 percent of the posted speed
> limit. The speeds during the lane closure were never slow enough to trigger the delay calculation."

This reads as author-written analysis/context attached to a specific graph section, not
auto-generated. No V2 equivalent currently — though this may already be achievable today via a
Richtext section placed adjacent to a graph, in which case this is a documentation/convention gap
("author knows they can do this") rather than a missing primitive. Worth checking whether V1's version
is *structurally* tied to the graph (stored alongside it, moves/copies with it) before assuming a
plain adjacent Richtext section is equivalent.

### 8. Report-level actions

V1 has page-level "Save as Report" / "Save as Template" buttons and a "Hide Controls" toggle (declutter
for presentation/export), plus (per §3) a sidebar-level "Templates" / "Update All" pair for bulk
re-applying a template across every graph. V2 relies on the generic DMS page save/publish flow — there
's no report-specific "save as template" exposed to the *author* from within a report page (the Report
Page template exists, but it's an admin/dev-created starting point, not an author-facing "snapshot this
report as a reusable template" action), no bulk-update-all-graphs mechanism, and no equivalent of
collapsing editor chrome for a clean view.

### 9. Route catalog / "add a route" UX — revised finding

V2's "Add a route to your report" is a raw paginated table (1,177 pages, 5,884 rows, no visible
search/filter) — this already exists and is "very similar to how [V1] manage[s] routes," per the user.

**What V1 adds on top (the "Routes" / "Folders" tab buttons):** these are **not** a per-report
organizational feature (see the correction at the top of this doc, and §4) — they browse a **route
catalog managed outside of any single report**. An author creates/names a route there once, then
imports it into whichever reports need it, optionally organized into **folders** for browsing. So the
actual V1-vs-V2 delta here is narrower than the original version of this doc assumed:

- V2 already has the equivalent catalog-import mechanism (the paginated table).
- The concrete gaps are: (a) **search/filter** on that table (still needed — 5,884 unfiltered rows is
  the same usability problem regardless of the folders question), and (b) **folder-based browsing** of
  the catalog as an alternative to the flat paginated list, if/when the catalog itself is large and
  varied enough that browsing-by-category becomes valuable.

(b) is lower-confidence value than (a) — no V1 screenshot of the actual add-route/folder-browsing flow
was reviewed, so it's not confirmed whether folders meaningfully help route discovery or are mostly
unused. Recommend shipping (a) first as a clear, self-contained win, and treating (b) as optional
follow-on only if search alone doesn't solve discovery.

### 10. Stations (likely out of scope for this task)

V1 has a separate top-level "Stations" concept (station-based analysis, distinct from route-based).
No mention anywhere in current V2 docs. Probably a separate, larger feature rather than a gap within
`ReportRouteList` — needs a decision on whether it's roadmapped at all.

## Suggested prioritization

1. **Metric catalog (§2)** — foundational; unblocks several "missing graph type" items in §3 cheaply
   once it exists as reusable calc-column/UDA config rather than one-off expressions.
2. **Data filtering / query config (§1)** and the missing **Route Map + Info Box (§3)** — core to
   making this a "traffic report" rather than a generic comparison-series chart. The info boxes may be
   cheap (Card + the §2 metric catalog) per the themes Card-first principle.
3. **Route catalog search (§9a)** — small, isolated, immediate usability win.
4. **Per-route color (§5)** — moderate; likely a Card/graph-config enrichment (a color picker on each
   route feeding into `comparisonSeries` line/series color) rather than a new component.
5. **Dual-axis second metric (§6, Display Data 2 half)** — moderate, once §2 exists; self-contained
   chart-config addition.
6. **Bar graph types + difference/delta variants (§3)** — new graph capability, larger lift.
7. **Per-graph narrative text (§7)** — check first whether a plain adjacent Richtext section already
   covers it; may need zero new engineering, just a documented convention.
8. **HDS Data source toggle (§6, second half)** — needs a second bound-dataset slot per graph; scope
   after confirming what "HDS" actually is and whether the ReportRouteList two-sectionMenu-binding
   pattern generalizes to it.
9. **Route catalog folder browsing (§9b)** — optional follow-on to #3, only if search alone doesn't
   solve catalog discovery once the catalog is large/varied.
10. **Report-level actions / bulk template update (§8)** and **Stations (§10)** — lowest priority /
    needs a scope decision first.
11. **In-report Route Group nesting (§4)** — do not scope. User confirmed live in V1 that this has no
    clear functional payoff (doesn't reduce clicks to add routes to a graph); revisit only if/when
    by-day resolution (§1) is built and a list-collapsing UI is actually needed.

## Next step

Each numbered category above is sized to become its own task file in `tasks/current/` once you want to
commit to it (per [planning-rules.md](../planning-rules.md)). None have been created yet — this doc is
the map, not the plan. Before scoping §4 (Route Groups/Folders) or §7 (narrative text), confirm the
open questions raised in those sections live against V1 — they change the implementation cost
significantly depending on the answer.
