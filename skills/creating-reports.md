# Creating an NPMRDS report (spec-first)

End-to-end process for the recurring request: "a client wants to see how traffic
changed on corridor X between period A and period B." As of the report-spec work
(`planning/tasks/current/report-spec-and-build-script.md`), the primary path is
**write a spec, then build it** — `scripts/report_build.mjs` composes graph state
through the exact same `applyMeasurePick` function the UI's Measure Picker calls, so a
spec-built report is byte-identical to a hand-built one by construction, and most of
this workflow's old silent-failure modes (a graph-assignment pill not registering, a
measure pick lost because Save wasn't clicked, a difference graph's anchor being a
coin-flip) simply cannot occur.

A UI click-path still exists and still works — for one-off tweaks to an already-built
report, or when no spec is worth writing for a single small change — and is documented
below as a second column, not the primary flow.

> **Audience:** an engineer/AI (or a future skill/agent) doing this workflow for the
> first time. Read [`authoring-graphs.md`](./authoring-graphs.md) for the avlGraph data
> model first if graph internals are unfamiliar, and
> [`difference-graphs.md`](./difference-graphs.md) for the `comparisonSeries.combine`
> mechanism if you're building a before/after difference graph.

## Prerequisite: the routes must already exist

A spec references routes by `route_id` — it doesn't create them. If the corridor
doesn't have route(s) yet, do [`creating-routes.md`](./creating-routes.md) first (the
one workflow step that requires switching to the transportNY dev server), then come
back here with the resulting `route_id`(s).

## The main feature: turning a client request into a spec

The point of the spec isn't just declarative building — it's that a **literal client
request** ("a client wants to see how traffic changed on corridor X between period A
and period B") should turn into a good report by inference, with the inference itself
reviewable before anything is built. Concretely:

1. Put the client's ask verbatim in the spec's top-level `request` field.
2. Resolve the corridor to route(s) — one `route_id` per physical direction (see
   `creating-routes.md` if they don't exist yet).
3. Express "period A vs period B" as **two route instances sharing one `route_id`**,
   differing only by `startDate`/`endDate` — this is the before/after idiom, not two
   different routes. Give each instance a name that already reads sensibly as a chart
   legend entry (e.g. `"NY-9D Northbound — Jan-Feb 2025"`, not just the route's bare
   name repeated).
4. Decide which graphs answer the ask, and write **why** on each one (`graphs[].why`):
   typically an overlaid overview (`LineGraph`, `comparisonMode: "plain"`) for "what
   does the whole picture look like", plus one `BarGraph`
   `comparisonMode: "difference"` per direction if the client explicitly wants the
   delta, not just an eyeballed overlay.
5. Pick `measure` and `resolution` per graph based on what the ask actually cares about
   (travel time vs speed vs delay; 5-minute for peak-shape detail, hour/day for a
   smoother trend).
6. Run `--summary` (see below) and read it back against the original ask before
   building anything — this is the review step the spec format exists to enable.

**Full field reference:** `research/npmrds-reports/report-spec.md` — every field,
required/optional, and the semantics that are easy to get backwards (duplicate-name
collapse, the weekday mask's "absent means included" rule, difference-graph anchor and
sign, why `resolution` currently lives on the graph and not the route). Don't restate
that document here; read it before writing a spec by hand.

**If you're adding a brand-new measure to the vocabulary** (not just using an existing
one): a no-join measure's SQL expression must use bare column names, not a `ds.`-alias
prefix — the query builder only aliases the base table as `ds` when the measure
declares a `join`. Prefixing an alias-less measure's columns with `ds.` fails silently
(blank chart, a ClickHouse "Unknown expression identifier" buried in a `dama query`
failure). Hit and fixed twice already (`travelTime`'s plain expression, then the
calculated-resolution GROUP BY expressions) — see
`data-types/npmrds_graph_vocabulary/vocabulary.json`.

## Building the spec

```bash
node scripts/report_build.mjs <spec.json> --summary   # plain-language review; no writes, no Vite boot
node scripts/report_build.mjs <spec.json> --dry-run    # compose every graph's state and print it; no writes
node scripts/report_build.mjs <spec.json>              # build, draft only
node scripts/report_build.mjs <spec.json> --publish    # also create published section copies
```

1. **`--summary` first, always.** Read the request, every route instance's window and
   weekday mask, and every graph's mode/arms/`why` back against the original client
   ask. This is where an inferred report gets corrected before anything is written.
2. **`--dry-run` if anything in the summary looks off** — prints the actual composed
   `applyMeasurePick` state per graph (stdout is valid JSON, pipes into `jq`).
3. **Build (no flag)** — creates the page and its sections as a draft. Structural
   checks run automatically and exit `1` on failure (no route instance with empty
   `graphIds`, no graph nothing feeds, `fetchMode`/`comparisonSeries`/subscriber
   present on every graph section).
4. **Verify with the probe**, not by re-deriving state:
   ```bash
   node scripts/report_probe.mjs edit/<slug> --auth   # draft-only page
   node scripts/report_probe.mjs <slug>                # published page
   ```
   `--auth` degrades to anonymous silently if `.dms-auth-token` is expired — a `0/N`
   sections result on an `--auth` probe is as likely to mean "stale token" as "build
   bug"; re-mint before concluding anything.
5. **`--publish` when ready.** Publishing creates a **separate** set of published
   section rows (`data->'sections'`, distinct ids from `data->'draft_sections'`) — if
   confirming a specific change went live, query the published ids, not the draft
   ones.

What the build does and doesn't check — spec → composed state and composed state →
written row are both guaranteed (parity by construction, and structurally checked);
written row → what actually renders is deliberately **not** checked here, because
failures at that layer have so far been platform bugs, not build bugs. Full reasoning
in the task file's "The `--verify` decision".

## The UI column (hand-authoring or one-off edits)

Everything below still works, and is what you're doing when adjusting an
already-built report rather than building a new one from a spec.

### Create the report page

A "report" is just a DMS page created from the **Report Page** template — no separate
concept exists in code.

1. In edit mode, open the bottom toolbar's **Page** icon (document icon) → **Pages**
   panel (site tree).
2. **"+ Add Page"** → **"Your Templates"** → **"Report Page"**.
3. The new page's slug isn't predictable from the UI alone. Refresh, reopen the Pages
   panel, or query directly:
   ```
   python3 scripts/dbq.py new "select id, data->>'title', data->>'url_slug'
     from dms_npmrdsv5.data_items where type = 'npmrds_sub|page' order by id desc limit 5"
   ```
   Don't guess the slug from a legacy numeric ID pattern (`report_<old_id>`) — those
   are deprecated and can silently resolve to an unrelated page.
4. The Report Page template comes pre-wired with a `ReportRouteList` section and one
   starter `AVL Graph` section already wired to it (comparisonSeries enabled, `$self`
   subscriber, etc.).

### Add routes via ReportRouteList (RRL)

RRL is the route-management panel on the left side of the report page (in edit mode).
See `ReportRouteList/README.md` in the theme for the storage model.

1. Scroll the **"ADD A ROUTE TO YOUR REPORT"** table to find your route by name, click
   its row to add it (clicking a row IS the add action — a confirm dialog pops; don't
   click rows casually while scrolling past them, Cancel is safe).
2. Click the **"+"** icon on an added entry to expand it: **Date Range** (pencil icon
   to enter edit mode, type 8-digit dates with no slashes, blue disk to save — do NOT
   interact with the native date input directly without the pencil first, it silently
   garbles to `mm/dd/12025`), **Identity Color** picker, an **"ON: Graph N"** pill per
   graph section, and **"Remove Route from Report"**.
3. **To compare two time periods, add the SAME route twice** — once per period, each
   an independent instance (own Date Range/Color/Graph assignment) sharing the
   underlying route id.
4. **Known gap — no reliable per-instance rename.** Plan the route's *original* name to
   already read sensibly for period comparisons.

**Verify after wiring more than 2 instances** — the "ON: Graph N" pill can silently
fail to register:
```
python3 scripts/dbq.py new "select data->'route_comps' from dms_npmrdsv5.data_items__s2177438_v2177440_reports_snap_2 where id = <report_row_id>"
```
A route-comp entry with empty `graphIds` renders as if it doesn't exist — no error.

### Configure the graph's measure (Measure Picker)

**The Measure Picker/Quick Controls only appear when the section is in true "edit"
mode — not just "the page is in `/edit/...`".**

1. Being on `/edit/...` puts every section in a preview-with-Settings-menu state
   (`isEdit: false`). The gear/Settings icon (⋮) shows only a **reduced** menu (Type,
   Dataset, Layout, Delete) — no Measure entry.
2. Click the gear, then the **pencil ("Edit") icon** — this swaps to `SectionEdit`
   (`isEdit: true`), expanding Settings to the full list (**Measure**, Columns,
   Filters, Display, etc.) and revealing a **Quick Controls pill row** under the
   section title.
3. **Measure** → pick Graph Type / Measure / Resolution / Comparison Mode. Applying a
   pick **also overwrites `display.graphType`** to the picker's default (`BarGraph`)
   the first time you touch it — re-set Graph Type explicitly afterward if you meant
   to keep a Line Graph.
4. **Click the floppy-disk Save icon** before navigating away — a pick lives only in
   local draft state until saved; reloading without saving silently discards it.
5. After saving, the graph refetches automatically (`fetchMode: 'force'`). If it comes
   back blank, check the console/network tab rather than assuming the pick was wrong.

**Peak-hour-only filtering is not yet a first-class control.** Resolution options are
5-minutes/15-minutes/hour/day/weekday/month; a "peak window only" chart currently needs
a manual Filters entry (epoch range).

### Adding a Route Difference Graph by hand

The platform mechanism (`comparisonSeries.combine: {mode: "difference"}`) is documented
in [`difference-graphs.md`](./difference-graphs.md) — this is just the RRL/Measure
Picker choreography to wire it through the UI instead of a spec's `comparisonMode:
"difference"` + `anchor` fields.

1. **Insert a section**: hover the boundary between two sections, click the blue **"+"**
   that appears, change its Type to **AVL Graph**.
2. **Measure Picker** → Graph Type: Bar Graph, your measure, a resolution, Comparison
   Mode: Difference. Save.
3. **Scope exactly 2 route instances to this graph via RRL** — expand each instance you
   want in THIS difference and turn its Graph-N pill ON; leave other directions' pills
   off for this graph. **Order matters and has no UI indicator**: the FIRST instance
   (by `route_comp_id`/add-order) whose pill you turn on becomes the anchor ("Main");
   the render is `anchor − compare`. Wire the *before* instance first if positive bars
   should mean "before was higher."
4. **Publish and verify** as below.

### Publish and verify

1. Bottom toolbar → **PUBLISH** (becomes **"NO CHANGES"** once nothing's left).
2. Publishing creates separate published-snapshot rows — confirm against
   `data->'sections'`, not `data->'draft_sections'`.
3. Load the plain (non-`/edit/`) URL and confirm the graph renders with real
   (non-placeholder) values.

## Known UI gaps

The click-path's silent-failure modes and missing controls (RRL rename, the graphIds
pill, peak-hour filtering, the difference-graph anchor coin-flip, `weekdays` having no
control at all, and others) are tracked and ranked in
`planning/tasks/current/report-route-ui-parity-gaps.md` rather than listed here — that
file is Phase C of the report-spec arc, closing them off one at a time now that the
spec format makes each one an enumerable, checkable gap (does a control exist for this
spec field?) instead of tribal knowledge.
