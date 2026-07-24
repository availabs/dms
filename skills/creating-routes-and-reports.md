# Creating routes and building a before/after report (NPMRDS)

End-to-end process for the recurring request: "a client wants to see how traffic
changed on corridor X between period A and period B." Covers building the route(s),
creating a report page, wiring routes into the graph twice (once per period), and
configuring the graph's measure. Written from a real worked example (NY-9D through
Beacon, NY — before/after a March 2025 signal-timing change) so every step below has
been driven live through the UI, not inferred from code.

> **Audience:** an engineer/AI (or a future skill/agent) doing this workflow for the
> first time. Read [`authoring-graphs.md`](./authoring-graphs.md) for the avlGraph data
> model first if graph internals are unfamiliar.

## Prerequisite: route creation only exists in transportNY

The route-creation map tool ("routecreation" plugin — TMC Click/Markers modes, TMC
Search, TMC List panel) lives **only** in the `transportNY` repo
(`/home/ryan/code/transportNY`), not in `dms-template`. If you're working in
dms-template and need new routes, you must switch to transportNY's dev server for that
step, then come back (routes are DMS rows, visible from either app once created,
provided both apps point at the same DMS site/app).

## Step 1 — Identify the real-world segments

Don't try to eyeball TMC segments on the map by pixel-clicking alone — it's slow and
error-prone (see "Known UI gaps" below). Instead:

1. Get the cross-streets/corridor bounds from the client ask (e.g., a map screenshot).
2. Query ClickHouse directly for the TMC chain:
   ```
   python3 scripts/dbq.py ch "select tmc, road, direction, intersection, miles,
     start_latitude, start_longitude, end_latitude, end_longitude
     from npmrds_raw_tmc_identification.s455_v3464_NPMRDS_TMC_Identification_V5_V6
     where road ilike '%9D%' and ... order by direction, ..."
   ```
   TMC codes are directional: `120+29713` (one direction), `120-29713` (the other).
   `intersection` names the cross-street reached at the **end** of the segment in the
   direction of travel — use this to chain segments into a continuous corridor.
3. Cross-check against Google Maps (intersection coordinates, driving directions) to
   confirm the chain is continuous and matches the client's described corridor.
4. Build **one chain per direction** if the report needs both (most corridor studies
   do) — TMC codes for northbound/southbound are different physical rows, not a single
   bidirectional segment.

This ground-truth-first approach replaces unreliable pixel-based map guessing and is
much faster once the TMC chain is known.

## Step 2 — Build the route(s) in the map tool (transportNY only)

URL pattern: `http://npmrds.localhost:5173/edit/<some-page>` for a scratch page with a
map section in edit mode, or the dedicated route-creation demo page if one exists
(`/edit/converted_reports/route_creation_demo` in this session).

- **TMC Click mode**: click directly on the map line for each TMC segment in the
  chain. Thin/divided-highway segments are hard to hit — use the `zoom` tool
  (image-inspection, not map zoom) to compute precise pixel coordinates before
  clicking, or ask the user to click for you (they can see the map too).
- **TMC Search box**: typing a TMC code zooms to it. **Known bug**: this is unreliable
  for `-` (one direction's) codes — reproducibly zooms to a wrong/unrelated location.
  `+` codes are more reliable. Don't trust a single successful search as proof the
  bar works generally.
- **Map scroll-zoom is disabled** (confirmed: before/after screenshots after a scroll
  action are pixel-identical). Use double-click zoom or the on-screen `+`/`-` buttons
  instead.
- Hovering a segment shows a popover with the **TMC code only** (no street name) — you
  may need to click, not just hover, depending on the build.

**Critical gotcha — `route_id` in the URL is load-bearing.** If the edit URL carries
`?route_id=<n>`, clicking "Save Route" **overwrites that existing route**, silently.
This is intentional tool behavior, not a bug — the URL param means "you are editing
this route." If you want to explore/test-click without risk, do it from a fresh page
load with **no** `route_id` param, and only navigate to an existing route's URL when
you actually intend to edit it.

Give each route a clear, self-describing name (e.g., `"NY-9D Northbound (I-84 to Main
St/Beekman, via Verplanck)"`) — this name is inherited by every RRL instance of the
route and is very hard to override per-instance later (see Step 4's gotcha).

## Step 3 — Create the report page

A "report" is just a DMS page created from the **Report Page** template — no separate
concept exists in code.

1. In edit mode, open the bottom toolbar's **Page** icon (document icon) → this opens
   the **Pages** panel (site tree).
2. At the bottom, click **"+ Add Page"** → **"Your Templates"** → pick **"Report
   Page"**.
3. The new page's exact name/slug isn't predictable from the UI alone (it lands
   somewhere under whatever pattern folder you added it to). **Refresh the page**,
   reopen the Pages panel, and look for the new entry — or query the DB directly:
   ```
   python3 scripts/dbq.py new "select id, data->>'title', data->>'url_slug'
     from dms_npmrdsv5.data_items where type = 'npmrds_sub|page' order by id desc limit 5"
   ```
   Don't guess the slug from a legacy numeric ID pattern (`report_<old_id>`) — those
   are deprecated and can silently resolve to an unrelated page. Confirm via DB query
   whenever the UI is ambiguous about which page you just created.
4. The Report Page template comes pre-wired with a `ReportRouteList` section and one
   starter `AVL Graph` section already wired to it (comparisonSeries enabled, `$self`
   subscriber, etc.) — you don't need to build that wiring by hand.

## Step 4 — Add routes to the report via ReportRouteList (RRL)

RRL is the route-management panel on the left side of the report page (in edit mode).
See `ReportRouteList/README.md` in the theme for the storage model; the mechanics that
matter for this workflow:

1. Scroll the **"ADD A ROUTE TO YOUR REPORT"** table (below the graph) to find your
   route by name, click its row to add it. **Be careful** — clicking a row is itself
   the "add" action (it pops a confirm dialog); don't click rows casually while
   scrolling past them, or you'll get a stray confirm prompt (Cancel is safe).
2. Each added route appears in the left panel as a collapsed entry. Click the **"+"**
   icon on its left edge to expand it — this reveals:
   - **Date Range** — click the **pencil icon** to enter edit mode, click into the
     Start Date field (type 8 digits, no slashes), click into End Date similarly, then
     click the **blue disk (save) icon**. (Do NOT try to interact with the native date
     input directly without the pencil first — it silently produces garbled values
     like `mm/dd/12025`.) Click the **red X** to cancel safely.
   - **Identity Color** picker.
   - An **"ON: Graph N"** pill — click to toggle this route-instance's assignment to
     that graph. **This is silent-failure-prone**: after adding several instances in a
     row, it's easy for one click to not register (no error shown either way). Always
     verify via DB after wiring multiple instances (see below).
   - A red **"Remove Route from Report"** button.
3. **To compare two time periods, add the SAME route twice** — once per period. RRL
   supports adding one underlying route multiple times; each addition is an
   independent instance (own Date Range / Color / Graph assignment) sharing the same
   underlying route id. For an N-direction × M-period comparison, you need N×M
   instances total (e.g., 2 directions × 2 periods = 4 instances).
4. **Known gap — per-instance display name**: all instances of the same route inherit
   its name verbatim and there is no reliable way to rename an individual instance's
   display label (the rename control is fragile — see "Known UI gaps" below). Plan the
   route's *original* name to already read sensibly for period comparisons (or accept
   that the on-graph legend will show the same label twice, disambiguated only by
   color/date-range, until this is fixed).

**Verification step — do this every time you wire more than 2 instances.** Query the
report's storage row directly and confirm every instance has a non-empty `graphIds`:
```
python3 scripts/dbq.py new "select data->'route_comps' from dms_npmrdsv5.data_items__s2177438_v2177440_reports_snap_2 where id = <report_row_id>"
```
(Or ask the CLI/`dms raw get` for the row.) A route-comp entry silently missing
`graphIds` renders that series as if it doesn't exist — no error, no "unassigned" tag,
it just doesn't show up in the chart's legend. This happened in this session's worked
example (comp-2 lost its graph assignment) and was only caught by DB inspection, not
by anything visible in the UI.

## Step 5 — Configure the graph's measure (the "Measure Picker")

This is the part the user explicitly asked to have documented (`section menu → measure
picker`).

**The Measure Picker/Quick Controls only appear when the section is in true "edit"
mode — not just "the page is in `/edit/...`".** This is the single most
non-obvious thing in this whole workflow:

1. Being on the page's `/edit/...` route puts every section into a **preview-with-a-
   Settings-menu** state (`isEdit: false` internally, `SectionView`), *not* full edit
   mode. The generic gear/Settings icon (⋮, top-right of the section) is available in
   this state, but it shows only a **reduced** menu: Type, Dataset, Layout, Delete —
   no Measure entry.
2. To reach true edit mode for one section: open that gear/Settings menu, then click
   the **pencil ("Edit") icon** in its top icon row. This swaps the section into
   `SectionEdit` (`isEdit: true`) — *now* the Settings menu expands to the full list
   (Type, AVL Graph Settings, AVL Graph Interactions, Templates, Dataset, **Columns**,
   **Measure**, Filters, Display, Layout, Delete), and a **Quick Controls pill row**
   ("Speed (mph)" / "Plain" or similar) appears directly under the section's title bar
   — a one-click shortcut to the same Measure/Comparison-Mode state the "Measure" menu
   entry edits.
3. Click **Measure** → pick **Graph Type / Measure / Resolution / Comparison Mode**.
   Applying a pick **also overwrites `display.graphType`** to the picker's
   `DEFAULT_PICK` (`BarGraph`) the first time you touch it — if the section was
   already a Line Graph and you want to keep it that way, re-open **Graph Type** and
   set it back to **Line Graph** explicitly after picking your measure.
4. **You must explicitly click the floppy-disk Save icon** (top of the Settings
   panel) before navigating away or reloading — a measure pick lives only in the
   section's local draft state until saved. Reloading without saving silently
   discards it (the next load shows the old measure/query again, no warning).
5. After saving, the graph refetches automatically (`fetchMode: 'force'` is baked into
   every Measure Picker apply). If the chart comes back blank, check the console/
   network tab before assuming the pick was wrong — see the vocabulary bug note below.

See [`authoring-graphs.md`](./authoring-graphs.md) for the avlGraph data model
(`target: xAxis/yAxis/categorize`, `comparisonSeries`, etc.) that the Measure Picker
is writing into under the hood, and
`src/themes/transportny/components/MeasurePicker/composeMeasureConfig.js` +
`data-types/npmrds_graph_vocabulary/vocabulary.json` for the actual measure
expressions.

**Known vocabulary bug (fixed 2026-07-24):** the `travelTime` measure's SQL expression
used `ds.`-prefixed column references (`ds.tmc`, `ds.travel_time_all_vehicles`), but
`travelTime` declares `requiresJoin: []` — no join — and the query builder only
aliases the base table as `ds` when a join is present. Without a join, `ds.tmc` is an
unknown identifier and the graph fails silently (blank chart, a ClickHouse "Unknown
expression identifier" error buried in `dama query` failures, one per requested row).
Fixed by using bare column names (`tmc`, `travel_time_all_vehicles`) in that one
expression. If you add a new no-join measure to the vocabulary, don't prefix its
columns with `ds.`.

**Peak-hour-only filtering is not yet a first-class control.** The Measure Picker's
Resolution options are 5-minutes/15-minutes/hour/day/weekday/month — there is no
"AM peak / PM peak" resolution or filter shortcut. A full-day 5-minute (or hourly)
plot is often good enough on its own for a "peak travel time" narrative, since the
peaks are visually obvious in the trace — but if the client specifically wants the
chart restricted to peak windows only, that currently requires a manual **Filters**
entry (epoch range) via the generic Filters menu, which is more clicks than it should
be. This is a real, not-yet-scoped gap.

## Step 6 — Publish and verify

1. Bottom toolbar → **PUBLISH**. The button becomes **"NO CHANGES"** once there's
   nothing left to publish.
2. Publishing **does not update the same rows you were editing** — it creates a
   separate published-snapshot set of component rows (`sections`, distinct ids from
   `draft_sections`). If you need to confirm a specific change actually went live,
   query the **published** row ids (from `data->'sections'`, not
   `data->'draft_sections'`), not the draft ones.
3. Load the page's plain (non-`/edit/`) URL and confirm the graph renders with the
   expected series/legend and real (non-placeholder) values.

## Adding a Route Difference Graph to an existing report

A common follow-up request: the client wants to see the before/after *difference* directly,
rather than eyeballing it off an overlaid multi-series LineGraph. The platform already has a
`comparisonSeries.combine: {mode: "difference"}` mechanism (dms-server joins the first assigned
route instance — the "anchor" — to each other instance on the shared group-by columns and returns
anchor − compare) — no server code needed, this is pure report authoring. Worked live 2026-07-24
adding "Northbound/Southbound Travel Time Difference" bar graphs to the NY-9D Beacon report
(`converted_reports/page_13_13`), which already had 4 route instances (NB/SB × before/after)
feeding one overview LineGraph.

1. **Insert a new section.** Hover the boundary between two existing sections (the gap right
   below a section's bottom border) — a blue circular **"+"** button appears at the boundary
   midpoint. Click it to insert a blank "Rich Text" section there; open its Settings → **Type**
   and change it to **AVL Graph**. Placement matters only for reading order — put the new
   difference graph wherever makes sense in the page (e.g. right after the overview graph, before
   the "Add a Route" table).
2. **Apply the Measure Picker.** The new section opens already in true edit mode (Quick Controls
   pills visible). Open Settings → **Measure** → pick **Graph Type: Bar Graph**, your **Measure**
   (e.g. Travel Time), a **Resolution**, and **Comparison Mode: Difference**. Click the floppy
   **Save** icon.
3. **Scope exactly 2 route instances to this graph via RRL — not all of them.** In the left Routes
   panel, expand (**"+"**) each route instance you want in THIS specific difference (typically one
   direction's before-period instance and its after-period instance) and click that instance's
   **new "Graph N" pill** to turn it ON. Leave instances for the *other* direction OFF for this
   graph — they can and should stay ON for the original overview graph and/or their own difference
   graph. **Order matters**: the FIRST instance (by `route_comp_id` order, i.e. the order it was
   originally added to the report) whose pill you turn ON becomes the anchor ("Main"); the second
   becomes "Compare". The rendered diff is `anchor − compare` — for a before/after report, wire
   the *before* instance first if you want positive bars to mean "before was higher" (e.g. for
   travel time, positive = travel time went DOWN after = improvement, given `reverseColors` — see
   below). **Careful when scrolling this table**: clicking a route ROW in the separate "ADD A
   ROUTE TO YOUR REPORT" table below (not the pill!) is itself an "add this route again" action
   and pops a confirm dialog — an accidental double-click can create a duplicate, unassigned route
   instance; if that happens, expand it and click **"Remove Route from Report"**.
4. **If the graph renders empty (0–1 placeholder axis) after wiring routes**, re-open that
   section's Settings, click the pencil **Edit** icon to enter true edit mode, and click the
   floppy **Save** icon again (even with no other changes) — this was needed once in this session
   to get the first difference graph to actually issue its data query, though the second one
   picked up the wiring live without needing this. Cheap enough to always do as a matter of course
   after RRL wiring changes.
5. **Sign/color convention**: the vocabulary's `reverseColors` flag (per-measure, e.g. `true` for
   travelTime/delay/CO₂, `false` for speed) reverses the diverging color ramp for measures where a
   *lower* raw value is "good" — so for a travel-time difference chart, positive (anchor > compare)
   bars render in the ramp's "bad" end and negative bars in the "good" end, which reads backwards
   from a naive "positive = green = good" expectation. This is inherited, pre-existing platform
   behavior (round 52 of the old-reports-conversion task), not something this workflow introduces
   — if it looks wrong, it's worth flagging to the user rather than silently overriding.
6. **Publish and verify** exactly as in Step 6 above.

**Known bugs hit building this** (see memory `project_ny9d_difference_graphs_and_epoch_axis_bug`
for full detail):
- **FIXED**: `data-types/npmrds_graph_vocabulary/vocabulary.json`'s calculated resolution
  expressions (15-minutes/hour/weekday/month) all hardcoded a `ds.`-prefix, which 500s ("Unknown
  expression identifier") for any no-join measure (travelTime is the only one) — silently caught
  client-side as a harmless-looking "Error getting length" console message, with the graph just
  rendering permanently empty and no `/graph` request for real data ever firing. Fixed by removing
  the `ds.` prefix in both this repo's and transportNY's copy of the vocabulary file.
- **NOT fixed (known gap)**: the "Epoch Time (HH:MM)" x-axis tick formatter
  (`epochTimeFormat` in `ui/components/graph_new/utils.js`) hardcodes a ×5-minutes-per-unit
  conversion, and the Measure Picker never clears a stale `xAxis.format: 'epoch_time'` when you
  switch Resolution away from plain 5-minute epoch to a calculated one (15-minutes/hour/weekday/
  month) — the tick labels render as if every bucket were 5 minutes wide, compressing/mislabeling
  the clock times. Workaround: switch **X Axis → Tick Format** to **Integer** (raw bucket index,
  not clock time) if you want a calculated resolution's ticks to at least not lie, or just use
  Resolution: 5 Minutes to avoid the bug entirely (matches the existing overview graph's own
  format, and per user feedback 2026-07-24, coarser 15-minute buckets do give a smoother/less
  noisy trend read if you're willing to live with Integer-only tick labels).

## Known UI gaps found while driving this workflow live

- Map scroll-zoom is disabled (workaround: double-click zoom, `+`/`-` buttons).
- TMC Search bar is unreliable for `-` (one direction's) codes — can zoom to a wrong
  location.
- Hover popovers show TMC code only, no street name; sometimes a click is needed
  instead of hover.
- `route_id` in the map-tool URL means "editing this route" — reusing an existing
  route's URL as a scratch pad silently overwrites it on Save.
- RRL's per-instance "ON: Graph N" toggle can silently fail to persist with no error
  — always verify via DB when wiring more than a couple of instances.
- RRL's per-instance rename control (for disambiguating two instances of the same
  route) is fragile/non-functional — typed text doesn't reliably commit.
- The Measure Picker / Quick Controls are gated on the section's *own* edit state
  (reached via the pencil "Edit" icon inside Settings), not the page's `/edit/` route
  — easy to conclude the feature is "missing" if you only check the reduced
  preview-mode Settings menu.
- A Measure Picker pick is unsaved (local draft only) until you explicitly click the
  Settings panel's Save icon.
- Legacy top-level nav links "Routes" and "Reports" (`/folders/routes`,
  `/folders/reports`) throw a JS exception and render a blank page — reproducible,
  not yet reported upstream.

## Cross-repo note

If you're doing this work against transportNY's dev server (needed for routecreation),
be aware that transportNY keeps its **own separate copy** of both the `@availabs/dms`
library submodule and the `transportny` theme — pinned to a different, older commit
than dms-template's. Newer dms-template features (like the Measure Picker /
sectionHeaderExtensions primitive used in Step 5) do **not** automatically exist there.
See `documentation/reportroutelist-cross-repo-sync.md` for the general sync process
and gotchas (submodule import path rewrite, etc.) — the same manual-port process
applies to any new theme/library feature, not just `ReportRouteList`.
