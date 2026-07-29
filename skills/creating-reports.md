# Creating an NPMRDS report (spec-first)

End-to-end process for the recurring request: "a client wants to see how traffic
changed on corridor X between period A and period B." As of the report-spec work
(`planning/tasks/current/report-spec-and-build-script.md`), the primary path is
**write a spec, then build it** — `scripts/npmrds-reports/report_build.mjs` composes graph state
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
reviewable before anything is built.

### Intake checklist: what to infer, guess-and-flag, or ask

Real client requests are routinely underspecified — the Beacon NY-9D request named two
cross-streets but no segment extent, and named a purpose ("how new actuated signals
have helped traffic congestion") but no measure. **Nothing on this list is hard-required
before writing a spec.** An early version of this checklist made every input required,
and that was wrong: a blocking checklist stalls on exactly the requests that actually
arrive. Make the best guess from whatever arrives, record the inference (`why` on a
graph, `confidence` on a route), and only stop to ask when the posture below says so.

| input | posture | why |
|---|---|---|
| Corridor / road name | infer, always | often an alias — see below |
| Segment extent | **guess + flag confidence** | ambiguous by nature; "around Verplank and Beekman" has no determinate answer — set `routes[].confidence` (see `report-spec.md`) |
| Direction(s) | infer, default both | cheap to correct, and both-directions is the common corridor-study shape |
| Study period(s) | infer, ask if absent | must sit post-2017; same-season year-over-year for before/after (see the rules below) |
| The client's actual question | infer from purpose language | "how signals helped congestion" → travel time, before/after |
| Peak-only vs all-day | ask | expressible now via `routes[].startTime`/`endTime` (added 2026-07-28, see `report-spec.md`) — but still ask, since the window itself (which hours count as "peak") has no determinate default |
| Audience | assume client-facing | drives how much prose/labeling to generate (see the prose step below) |
| Map screenshot | request when the road name doesn't resolve | see below — sometimes the only usable signal |

**Road aliases are not resolvable from the data.** Clients name roads locally ("Route 9D,
also known as North Ave/Wolcott Ave") but `altrtename` is empty for plenty of real
corridors (verified for NY-9D in Dutchess County) — an alias-named road can resolve to
*nothing* in the TMC identification table. A screenshot isn't just "helpful" here, it's
the only signal left once the name itself is unresolvable.

Concretely, turning intake into a spec:

1. Put the client's ask verbatim in the spec's top-level `request` field.
2. Resolve the corridor to route(s) — one `route_id` per physical direction (see
   `creating-routes.md` if they don't exist yet). **Mark segment-extent guesses**: if
   the request doesn't pin down how far the corridor runs, set a low `confidence` on
   the affected `routes[]` entry (`{level: "low", note: "..."}`) instead of silently
   picking an extent — `--summary` and a real build both print a "NEEDS REVIEW" flag
   for it, so the guess survives into review instead of disappearing.
3. Express "period A vs period B" as **two route instances sharing one `route_id`**,
   differing only by `startDate`/`endDate` — this is the before/after idiom, not two
   different routes. Give each instance a name that already reads sensibly as a chart
   legend entry (e.g. `"NY-9D Northbound — Jan-Feb 2025"`, not just the route's bare
   name repeated).
4. Decide which graphs answer the ask, and write **why** on each one (`graphs[].why`):
   typically an overlaid overview (`LineGraph`, `comparisonMode: "plain"`) for "what
   does the whole picture look like", plus one `BarGraph`
   `comparisonMode: "difference"` per direction if the client explicitly wants the
   delta, not just an eyeballed overlay. **Check the composition hints below first** —
   don't design a panel set from scratch when a real corpus of ~800 old reports already
   shows what worked for this kind of ask.
5. Pick `measure` and `resolution` per graph based on what the ask actually cares about
   (travel time vs speed vs delay; 5-minute for peak-shape detail, hour/day for a
   smoother trend).
6. **Write the client-facing prose**: a top-level `intro` (renders as a heading + paragraph
   at the top of the page — the *only* place `spec.title` is ever visible to a viewer) and,
   for any graph that needs explaining, a per-graph `caption` (renders as a subtitle under
   that chart's own title). Base the voice on the old corpus's caption style — see
   `planning/tasks/current/client-request-to-report-skill.md`'s composition-rules section for
   real examples ("The line graph above displays… This allows the analyst to…").
7. Run `--summary` (see below) and read it back against the original ask before
   building anything — this is the review step the spec format exists to enable.

### Composition hints: what old reports typically included, by purpose

A corpus analysis of the old tool's 869 real reports (after collapsing near-duplicate
copies — the raw counts were inflated by copy-paste batches) found that **client purpose
predicts panel composition** far better than any fixed template: reports classified by
what they're *for* share panel sets at 1.4×–4.7× the random baseline. Use this as a
starting point for step 4, not a rule — the largest lifts sit on the smallest samples (as
few as 4–7 reports for some classes below), so treat them as strong hints, not laws.

| if the request reads as... | old reports typically included | spec-buildable today? |
|---|---|---|
| **before/after** (a change, then measuring its effect) | Route Info Box (speed, travelTime) · Route Map · Route Line Graph · Route Bar Graph; often also TMC Grid Graph, Bar Graph Summary | all yes — Route Info Box wired 2026-07-28 (see below) |
| **signal_timing** (an intersection/corridor signal change — NY-9D's class) | Route Map (100%) · Route Compare Component on speed and travelTime (71% each) · Route Bar Graph | Map yes; Route Compare Component **not yet** |
| **road_diet** (a lane reduction/reallocation) | Route Map · Route Info Box (freeflow, speed) · Route Line Graph | Map/LineGraph yes; Route Info Box yes as of 2026-07-28, but its "freeflow, speed" pairing is the InfoBox `reliability` bucket specifically, which needs source 1410 (pm3) and only covers 2018-2025 — unusable if the study period is outside that window (hit for real on the Poughkeepsie road-diet request, 2026-07-28: substituted `travelTime`/`hoursOfDelay` instead) |
| **reliability** (LOTTR/TTTR/percentile framing) | Route Info Box (speed, percentile95) · Route Bar Graph (travelTime) · Bar Graph Summary · TMC Grid Graph | GridGraph yes; Route Info Box's `reliability` bucket (LOTTR/TTTR/freeflow) yes, but only for 2018-2025 (source 1410's real coverage — see road_diet row); `percentile95-byDateRange` specifically has no shape built at all yet, unlike Info Box's other measures |
| **route_comparison** (multiple corridors/directions side by side — the largest class, n=110) | Route Map (78%) · Route Line Graph (73%) · TMC Grid Graph (67%) · Route Info Box/speed (56%) | all yes — Route Info Box wired 2026-07-28 |
| **congestion** (general delay/slowdown framing) | Route Line Graph/avgHoursOfDelay · Route Map · Route Bar Graph/hoursOfDelay | all yes |
| **cmp** (formal Congestion Management Process reporting) | Route Line Graph (100%) · Route Map (83%) · Route Bar Graph (hoursOfDelay, planningTime) | all yes |

**One panel this table names still isn't spec-buildable — Route Compare Component**, the
same class of gap Route Map had until 2026-07-27 and Route Info Box had until 2026-07-28: a
real shape already built in `convert_old_reports.py` (`ensure_route_compare_template`), just
never shelled out to from `report_build.mjs`. Tracked as a next step in
`client-request-to-report-skill.md`. Until it lands, the closest spec-buildable substitute
for a `signal_timing` request is what NY-9D actually used: an overlaid `LineGraph` overview
plus per-direction `BarGraph` `comparisonMode: "difference"` — a real substitution, not the
historically typical composition for that purpose, so say so in the graph's `why` rather
than silently picking it and moving on.

**A second, unrelated gap this table doesn't capture at all, found 2026-07-28 on a real
road-diet request, and fixed the same day**: none of these compositions could be scoped to
a peak-hour (or any time-of-day) sub-window — see "Peak-only vs all-day" in the intake
checklist above. A real before/after comparison for that request needed AM-peak-only and
PM-peak-only cuts to see a genuine divergence (AM peak got worse year-over-year, PM peak
didn't) that an all-day average hid completely. Fixed via `routes[].startTime`/`endTime`
(see `report-spec.md`) — each peak window is its own route instance sharing the underlying
`route_id`, exactly like the before/after date-window idiom in step 3 above. Full write-up,
design rationale, and live verification are in `report-spec.md`'s `startTime`/`endTime`
section; `client-request-to-report-skill.md`'s "Next steps" item #11 is closed.

Full analysis (sample sizes, the duplicate-collapse correction behind these numbers, and
how "purpose" was classified) lives in
`planning/tasks/current/client-request-to-report-skill.md`'s "purpose lens" section —
read it before extending this table rather than re-deriving the numbers.

### Rules (earned corrections)

Distilled from real requests, not aspirational — each exists because it was gotten
wrong once, live, and corrected. Add to this list rather than losing a correction when
the same situation comes up again (see "Feedback loop" below for how a new one gets
promoted here).

1. A route is a **geometry, not a period** — never encode a date range in a route name
   or metadata. The window belongs to the report's route instance
   (`routes[].startDate`/`endDate` in the spec), not the route catalog row.
2. Before/after windows must be **same-season year-over-year** (Jan/Feb 2025 vs Jan/Feb
   2026, not winter vs spring) — comparing across seasons confounds the exact signal
   the client is asking about. **This applies even to a short, temporary event, not just
   permanent changes** — a real Poughkeepsie road-diet request (2026-07-28) was reasoned
   into "adjacent weeks in the same year is a tighter comparison for a 10-day closure than
   a full year gap," which felt right but wasn't: AVAIL's own answer to that exact request
   compared against the same calendar dates one year prior, and re-checking the raw data
   both ways showed why — an adjacent-weeks comparison can look clean and still miss a real
   effect that a year-over-year comparison catches (see rule 9). Don't re-derive an
   exception to this rule from first principles; it doesn't have one yet.
3. Stay inside **post-2017 data coverage** — roughly 15% of the old tool's reports are
   pre-2017-only and permanently blank. Check the ask's dates before building anything.
4. Name routes so they read as **chart legend entries** directly (e.g. `"NY-9D
   Northbound — Jan-Feb 2025"`, not the bare corridor name repeated) — per-instance
   rename is a known UI gap (`report-route-ui-parity-gaps.md`), so the name given at
   creation is what ships.
5. Name a difference graph's **anchor explicitly** (`graphs[].anchor`) — add-order
   silently decides it otherwise, and the UI exposes no control for this at all.
6. **Don't gate route validation on GIS continuity heuristics** — report gaps as
   advisory warnings, not hard errors (`creating-routes.md`'s three-tier validation).
   Coordinate abutment and `road_order` contiguity both have real false negatives.
7. **Guess and flag, don't block.** Client requests are routinely underspecified about
   segment extent; produce a best-guess route with `confidence: {level: "low", note}`
   and let AVAIL correct it via feedback. Never stall a report waiting for detail the
   client was never going to provide.
8. **Ask for a screenshot when the road name doesn't resolve** — local aliases (e.g.
   "North Ave" for NY-9D) are absent from `altrtename`, so there is no data path from
   alias to TMC; the screenshot plus geographic reasoning is the only signal left.
9. **When a client's date estimate is uncertain, check it against the raw data before
   writing the spec, not just after.** A direct per-day ClickHouse query (`dbq.py ch`
   against the raw NPMRDS table) is cheap and can sharply confirm or contradict a guess —
   on the Poughkeepsie road-diet request (2026-07-28), the client's "around April 20-30"
   turned out to be measurably wrong at the all-day resolution (the real signal was
   April 27-30 only) — **and then wrong again in a different way at peak-hour resolution**
   (AM peak was actually elevated the whole 20-30 window; PM peak wasn't elevated at all).
   Two lessons in one: querying the raw data beats trusting client memory, but a single
   query at one resolution/scope can itself be misleadingly precise — see rule 10 before
   treating any one cut as the full picture.
10. **Peak-only vs all-day is not a precision choice, it can flip the conclusion.** The
    intake checklist already says "ask" for peak-vs-all-day, and this rule exists because
    that posture got skipped once, live: an all-day-average cut of the Poughkeepsie
    road-diet data found a clean 4-day effect; the same event, cut by AM/PM peak instead
    and compared year-over-year (rule 2), showed AM peak degraded across the *entire*
    stated window while PM peak didn't degrade at all — an opposite-flavored story, not
    just a fuzzier one. There is no spec field for a time-of-day sub-window today
    (`client-request-to-report-skill.md`'s next-steps #11) — until there is, say so
    explicitly in the report's `why`/`intro` whenever the request is about congestion or
    delay impact, rather than silently shipping the all-day cut as if it were complete.

### Feedback loop: AVAIL review → spec diff → rule

There is no separate intake form or ticket queue — an AVAIL reviewer's plain-English
feedback on a built report ("move the after period back a month", "explain the March
dip") arrives as chat, and should turn into a small, reviewable change, not a rebuild:

1. Reviewer pastes feedback into chat.
2. Get the current spec — `--from-page <page> --out <path>` if it isn't already on
   hand — and edit it to reflect the feedback. This is a diff to an existing spec, not
   a new one.
3. `--update <page> --note "..."` applies it. The build reports exactly what changed
   (`N created, M updated, K deleted`) and appends `{at, note, changed_paths}` to the
   row's `_specRevisions` log — the reviewer-visible diff and the durable record are
   the same write, not two separate steps.
4. **If the same correction shows up more than once, promote it into the Rules section
   above.** A correction that keeps getting made by hand is exactly the signal this
   storage design exists to capture — rules distilled from corrections live as prose in
   this file, not as data on any one report (see
   `planning/tasks/current/client-request-to-report-skill.md`'s storage-decisions
   table).

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
node scripts/npmrds-reports/report_build.mjs <spec.json> --summary   # plain-language review; no writes, no Vite boot
node scripts/npmrds-reports/report_build.mjs <spec.json> --dry-run    # compose every graph's state and print it; no writes
node scripts/npmrds-reports/report_build.mjs <spec.json>              # build, draft only
node scripts/npmrds-reports/report_build.mjs <spec.json> --publish    # also create published section copies
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
   node scripts/npmrds-reports/report_probe.mjs edit/<slug> --auth   # draft-only page
   node scripts/npmrds-reports/report_probe.mjs <slug>                # published page
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
   python3 scripts/npmrds-reports/dbq.py new "select id, data->>'title', data->>'url_slug'
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
python3 scripts/npmrds-reports/dbq.py new "select data->'route_comps' from dms_npmrdsv5.data_items__s2177438_v2177440_reports_snap_2 where id = <report_row_id>"
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

**Peak-hour-only filtering** has its own labeled control now (added 2026-07-28): expand
a route, click the pencil next to Date Range, and a preset row (AM Peak/PM Peak/PM Peak
(alt)/Midday/All Day) appears next to the date+time inputs. Applies to whichever graphs
the route feeds — AVL Graph, Route Map, and Route Info Box all read the same route-level
window. See `planning/tasks/current/report-route-ui-parity-gaps.md` gap #11 for the
design and live verification, including a correction of an earlier (same-day) claim that
Route Map/Info Box needed separate wiring — they didn't.

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
pill, the difference-graph anchor coin-flip, `weekdays` having no control at all, and
others — peak-hour filtering closed 2026-07-28) are tracked and ranked in
`planning/tasks/current/report-route-ui-parity-gaps.md` rather than listed here — that
file is Phase C of the report-spec arc, closing them off one at a time now that the
spec format makes each one an enumerable, checkable gap (does a control exist for this
spec field?) instead of tribal knowledge.
