# Old NPMRDS reports → new DMS report pages (automated conversion)

**Round 9 (2026-07-08): report 751's truck CO₂ NULL — root-caused and FIXED.** The round-8 suspect
(`coalesce(ds.travel_time_freight_trucks, ds.travel_time_all_vehicles)`) was close but the real
mechanism is a representation mismatch: the CH fact table's travel-time columns are plain
`Float64`, **NOT Nullable** — missing readings are stored as `0`, not NULL (old Postgres `npmrds`
stored real NULLs, which the old tool's `COALESCE(truck, all_vehicles)` handled; the converter
copied that coalesce faithfully but it can never fire against 0s). `3600/0 = inf`, and one `inf`
in an epoch's year-long `avg` makes the whole epoch `inf`, which ClickHouse serializes as JSON
`null`. Diagnostic (TMC `120P05153`, 2019): truck tt = 0 on **71,009 of 103,856 rows touching all
288 epochs** → all-NULL truck response; passenger tt = 0 on only 328 rows across 88 epochs →
exactly the partial (220/289) passenger nulls. **Fix**: `_SPEED_CAR_EXPR`/`_SPEED_TRUCK_EXPR` in
`scripts/convert_old_reports.py` now use `coalesce(nullIf(col, 0), nullIf(fallback, 0))` — 0 →
NULL restores the old semantic (avg skips the row; per-row fallback to all-vehicles works again).
**Verified**: (a) offline — the full 3-way-join query with the fixed expressions returns 288/288
clean epochs for BOTH variants (truck 0.0011–0.0387, passenger 0.0037–0.1464, zero NULL/NaN/inf);
(b) live — patched both template rows (`2188660` truck / `2188661` passenger, 29 occurrences
each), `--replace` re-ran 751 (new page `2188894`), single Playwright load: all three CO₂
sections render real heatmaps (truck legend 0.0009–0.049; passenger 0.0031–0.185 with the
overnight gaps now filled), zero console errors. The two truck sections render identical data —
correct/expected, `overrides.baseSpeed` is still deliberately ignored. Gap report unchanged (23
items, same classes).
**Noticed, NOT fixed (same 0-as-missing class, pre-existing, shared templates)**: `SPEED_EXPR`
(`miles*3600/tt_all`) has the same latent inf-poisoning wherever `travel_time_all_vehicles = 0`
rows exist (none on 120P05153, but possible on low-traffic TMCs overnight → silently null
days/epochs on speed graphs), and `tmc_travel_time_bar_graph_day` averages raw
`travel_time_all_vehicles` including 0-rows (drags the avg down vs. the old NULL-skipping
behavior). Left alone per isolate-shared-code-changes — the speed/travel-time templates are
live-verified on 3 reports; fix+verify separately if it surfaces.

**Round 9 (continued): `overrides.aadt` — DONE + live-verified.** Old semantics confirmed
against the actual old source before implementing:
- delay (`getHoursOfDelay.js` `getAADT`): a truthy override **replaces the AADT wholesale**
  (before facil/distribution weighting); falsy (`'0'`, `''`, null) falls through to the real
  column — i.e. report 1061 comp-7's `aadt: '0'` is query-inert, same class as the peak flags,
  and is no longer gap-logged.
- CO₂ (`getCo2Emissions.js` `calcEmissions`): the override is a TOTAL AADT redistributed by the
  real car/truck proportions — `(override * (aadt_car / aadt_total)) || aadt_car`, the JS `||`
  falling back on 0/NaN (aadt_total = table1.aadt, so the SQL guard is `if(table1.aadt > 0, …)`).
Implementation (all in `scripts/convert_old_reports.py`, conversion-time — templates stay
override-free): the override lives per route comp but the calculated column is shared by every
comparison-series arm, so it's applied per GRAPH via substitution on the section's CLONED
template stateJson (same place color_range is wired), and only when every assigned comp agrees
on one truthy value. New constants `_AADT_DELAY_FRAGMENT`/`_AADT_DELAY_OVERRIDE`/
`_AADT_CAR_OVERRIDE`/`_AADT_TRUCK_OVERRIDE` + `AADT_OVERRIDE_SUBS`; `aadt_override_of()`
normalizer; per-graph decision loop in `convert_report`; `aadt_override` param on
`build_graph_section_data`. New gap kinds: `aadt_override_mixed` (comps disagree — can't express
per-arm), `aadt_override_not_applied` (drift guard: template row no longer contains a known AADT
fragment — loud, never silently converts without the override). Per-comp `overrides` gap now
excludes `aadt` (other keys — baseSpeed, thresholdSpeed — still log). Overrides on comps feeding
skipped graphs are subsumed by those graphs' `unmapped_graph` entries.
**Verified 4 ways**: (a) standalone — 6-case test of normalization + substitution + drift-gap +
passthrough, all passing; (b) fragment byte-match confirmed against all 4 live AADT-consuming
template rows (2188429 day-delay, 2188680 weekday-delay, 2188660/2188661 CO₂); (c) offline CH —
delay expr on TMC `120-11332` (real `aadt=0`): unmodified expr returns 0/day (matches live pages
pre-fix), override-substituted expr returns real 15–34 h/day across 5 days; (d) live —
`--replace` re-ran 1071 (**new page `2188906`**): gap report dropped from 18→16 items losing
exactly the per-comp `overrides {aadt: '20000'}` entries, no `aadt_override_mixed`/
`not_applied` fired, and the full-width "Hours of Delay Weekdays 2026-2024" graph now renders
real, non-zero, spiky delay data (peaks ~150h) where it was invisible/all-zero before. By-day
delay sections show real value ranges in their legends (e.g. 0.39–21.0 h).

**Known platform issue, logged NOT fixed (user direction 2026-07-08: "don't get caught up on
the width thing — mark it as a gap"): bar graphs draw squeezed into the left edge of narrow
sections.** Found while live-verifying 1071's aadt work. Facts established: the server responses
are complete and correct (all 9 dates, distinct values, verified via captured bodies); the
chart's `flex-1` container really is tiny (~50px in a w=4 section, DOM-measured svg widths
57/56/49/52/29px), while the section box is ~293px; the adjacent byValue linear legend renders
full-precision float tick labels ("20.919005675724687") whose max-content width is plausibly
what eats the row; EVERY BarGraph on the page is squeezed to a degree (w=6 → 182px chart,
w=12 weekdays → 564px in a ~1050px section) — the wide ones just look OK-ish. Two candidate
fixes were attempted and **REVERTED** (kept out of the tree per isolate-shared-code-changes):
(1) a ResizeObserver in `useSetSize` (avl-graph/utils/index.js — hook only re-measures on
window resize); (2) default/compiled tick formatting in `Legend.jsx`'s linear legends (also
fixes a latent crash: section-config `valueFormat` is a d3-format STRING but the wrappers pass
it raw to `format(value)`). **Neither changed the rendered geometry on a fresh load even though
Vite verifiably served the edited modules** — so the real mechanism is NOT yet pinned down
(maybe the rendered legend isn't Legend.jsx's linear variant, maybe the constraint isn't the
legend at all). Follow-up should start from that unexplained fact. Affects visual QA of any
converted report with non-full-width bar graphs (1071 w=4/w=6 sections); data underneath is
correct.

## Status: All 6 reports CONVERTED and gap-audited current as of round 7 (1070, 1071, 1061, 751, 1045, 874 — 2026-07-08); CO₂ emissions column + weekday-resolution bar graphs DONE + verified live; five platform bugs found this session, four fixed (comparison-series ORDER BY on calculated columns; ClickHouse ambiguous-identifier on 3-way joins; GridGraph color-scale domain/range truncation — round 7; Falcor sibling-query cache collision — round 8, previously split into its own task and now fixed there). **Round 7 (2026-07-08): user visual QA on round 6's color wiring caught two real defects the standalone/JSON-level verification missed — bar graphs rendered as one solid color, GridGraph heatmaps never showed the far end of a >3-color palette. Root-caused as two independent, unrelated issues (see below), both fixed, unit-tested (182/182 passing, +7 new), and live-verified across 1061/1045/1071/751. New BarGraph capability built (`colors.byValue`, plus a "Color by Value" SectionMenu toggle) rather than working around the gap.**

**Round 8 (2026-07-08): the Falcor sibling-cache-collision task is FIXED** — see
`planning/tasks/completed/falcor-sibling-query-cache-collision.md`. Root-caused as a client-side
cache-key gap (nothing in the Falcor path identified which section issued a request) and fixed by
folding a per-section discriminator into the UDA `options` before it's stringified into the path.
Live-verified on report 1071: both previously-blank sibling pairs (Speed/Travel Time AM Peak By
Day, and the PM Peak pair) now render real, distinct data. Verifying report 751 surfaced a second,
previously-masked, unrelated bug:
**New gap — report 751's truck CO₂ sections return real-but-NULL data, not the Falcor bug.** With
the Falcor collision fixed, "CO2 Trucks Actual" and "CO2 Trucks 50 MPH" now issue genuinely
separate requests and the server returns a distinct, complete response to each (confirmed via
network capture — 289 rows each) — but `avg_co2_emissions_avg` is NULL for all 289 rows in both
truck responses, while the sibling passenger CO₂ section (same report) correctly resolves 220/289
non-null values. Suspect: `coalesce(ds.travel_time_freight_trucks, ds.travel_time_all_vehicles)` in
`scripts/convert_old_reports.py`'s truck `CO2_EXPR_TRUCK` — either `travel_time_freight_trucks`
isn't the real column name on view 982, or it's null for a reason the passenger variant's parallel
`travel_time_passenger_vehicles` isn't. Previously indistinguishable from the Falcor collision since
both produce the same "silently blank, no error" symptom. Not investigated further this session —
logged as a follow-up, non-blocking (same precedent as report 751's other known issues: gap-log and
don't block further conversion work).

**Round 6 (2026-07-08) COMPLETE: iterating on already-converted reports to pick up two generic fixes — `color_range` false-positive gap fixed + real wiring built, `graph_layout` width now wired to section `size` (theme `transportnyv2`). All 6 reports `--replace`-re-run and live-verified with both fixes in place: 1070, 1071, 751 (done earlier this round), then 1061, 1045, 874 (completed after the ClickHouse unfiltered-probe-query hazard — see below — was fixed and the pause lifted). Color wiring now visually confirmed across every colorful graph type that has a template (Route Bar Graph day + weekday resolution, TMC Grid Graph) and correctly left untouched on Route Line Graph. Width wiring confirmed on `w` values of 4, 6, 8, and 12. Zero console errors on any of the 6 live pages. No new gaps found — 874 and 1045/1061's non-color/layout gaps are unchanged from their prior conversions (route-type/measure gaps, `overrides.aadt`, `relative_date`, mixed-resolution/mixed-dataColumn — all previously known, not regressions).**

**Round 7 — color rendering, root cause + fixes (2026-07-08).** The user looked at round 6's
"working" color wiring on real pages and flagged it as suspicious: bar graphs "appear to be solid
purple," and a grid graph showed "shades of purple but no green." Both turned out to be real,
independent defects — not a data-range coincidence — found by reading the actual rendering code in
`packages/dms/src/ui/components/graph_new/`, not by re-inspecting JSON:

1. **GridGraph bug**: the wrapper (`components/GridGraph.jsx`) built its value→color scale as
   `scaleLinear().domain([min, mid, max]).range(colors)` — a fixed 3-point domain zipped against
   whatever length the palette array happens to be. d3 truncates a mismatched domain/range pair to
   the shorter side, so any palette longer than 3 colors (5-color and 9-color diverging palettes,
   exactly what this converter wires in) silently only ever used its **first 3 entries** — the far
   end of the palette (orange in 1061's 9-color purple→orange scale, green in 1045's 5-color
   purple→white→green scale) was unreachable regardless of actual data spread. **Fixed**: extracted
   a shared `buildValueColorScale(min, max, colors)` helper (new file location:
   `components/utils.js`) that spreads one domain stop per color instead of hardcoding 3, so the
   whole palette is reachable. GridGraph now calls this helper instead of building the scale inline.
2. **BarGraph — missing capability, not a bug**: `avl-graph/utils/index.js`'s `getColorFunc`
   colors *by series index* (`colorRange[i % colorRange.length]`), never by value — confirmed the
   same holds for every other graph_new type except GridGraph (checked ScatterPlot, TreemapGraph,
   PieGraph, SunburstGraph, LineGraph — all categorical-only; GridGraph is the *only* existing
   value-scaled type, and it's a heatmap, not a bar chart, so it doesn't cover this case). Each of
   these converted reports has exactly one series (one route) per bar graph, so every bar got
   `colorRange[0]` — the palette's first color, constant. The old client's actual semantic ("purple
   = more delay, orange = less") colors each bar by its own magnitude, which no current avl_graph
   type supports. **User chose to build this as new capability** (not document as a limitation, not
   drop the wiring) after confirming no existing type/config already covers it.
   - Added `colors.byValue` (boolean, default off — off preserves today's categorical per-series
     behavior for every other BarGraph in the platform) to `components/BarGraph.jsx`: when set,
     builds a value scale via the same `buildValueColorScale` helper (min/max now tracked across
     all bars while building `dataFromProps`) and passes it as the `colors` prop — `getColorFunc`
     already special-cased `typeof colors === "function"` to pass a scale through unchanged, so no
     changes needed on the `avl-graph/BarGraph.jsx` render side. Legend switches from the
     categorical per-series swatches to a linear gradient (mirrors GridGraph's legend) when
     `byValue` is set.
   - New author-facing control: "Color by Value" toggle in the "Bar Graph Layout" SectionMenu group
     (`ComponentRegistry/graph_new/config.jsx`) — `colors.byValue`, alongside the existing
     Scheme/Reverse controls. Any future author can opt a single-series magnitude bar chart into
     this, not just converted reports.
   - Converter (`scripts/convert_old_reports.py`) now sets `colors.byValue: true` whenever it wires
     `color_range` into a `BarGraph`-shaped template (Route Bar Graph old type), matching the old
     semantic; GridGraph-shaped templates (TMC Grid Graph) get no such flag since GridGraph's
     value-scaling is unconditional.
3. **Two more bugs found and fixed while live-verifying the above** (both would have shipped
   silently without a real Playwright reload — standalone/JSON checks can't catch either):
   - First live pass crashed every page with a `byValue` bar graph: `TypeError: scale.domain is not
     a function` in `Legend.jsx`. Root cause: `buildValueColorScale`'s degenerate-input branches
     (a single-color palette; a perfectly constant series, `min === max`) returned bare arrow
     functions instead of real d3 scales — fine for `colorFunc(value)` calls, but the Legend's
     linear renderer calls `.domain()`/`.range()` on whatever it's given, unconditionally. **Fixed**:
     both branches now return a real `scaleLinear()` with identical range endpoints instead of a
     plain function, so `.domain()`/`.range()` always exist.
   - Second pass (after that fix) surfaced a *pre-existing, latent* bug in `avl-graph/components/
     Legend.jsx`, exposed for the first time by a real constant-value series (1071's several
     all-zero Hours-of-Delay bar graphs, gap-logged `overrides.aadt` — real, correct `0` output):
     `VerticalLinearLegend`/`HorizontalLinearLegend` keyed their 5 rendered tick elements by tick
     *value*, not position — with a degenerate (min===max) domain all 5 ticks share one value,
     producing React's "two children with the same key" console errors. **Fixed**: both legends now
     key by index (`i`) instead of value — ticks are a fixed-order, fixed-length list, so index is
     the correct key regardless. This is a shared-component fix (also used by GridGraph's legend)
     but only fires on a degenerate domain, which nothing had exercised before BarGraph's new mode.
   **Verified**: (a) `tests/graphColorScale.test.js` (new, 7 cases) — covers the full-palette-reach
   fix, the single-color/constant-series degenerate cases, and a direct regression test asserting
   the returned scale always has working `.domain()`/`.range()`; full package suite green (182/182,
   +7, no regressions). (b) Live, via headless Playwright against the local dev stack: re-ran 1061 →
   1045 → 1071 with `--replace` to pick up `byValue`, screenshotted each. 1061: Hours-of-Delay bars
   show orange (routine) with purple spikes on the actual high-delay days; Speed bars transition
   purple (slower, older years) → orange (faster, newer years) — both exactly match the old
   semantic. 1045: the TMC Grid Graph now shows real green columns alongside purple ones (previously
   zero green); the weekday bar graph shows genuinely distinct per-bar colors instead of solid
   purple. 1071 (13 sections, the most complex converted report, including several genuinely
   all-zero delay graphs from the known `aadt=0` gap): zero console errors, every bar graph
   correctly value-colored, all-zero graphs correctly render as one uniform neutral color (the
   palette's middle stop) rather than crashing or misleading. 751 (GridGraph-only, not reconverted —
   the domain fix is a pure frontend change) re-verified as a regression check: CO2 heatmap
   unchanged/still correct, zero console errors, the two known-blank sibling-cache-collision
   sections still blank (unrelated, already tracked).
   **Files changed**: `packages/dms/src/ui/components/graph_new/components/utils.js` (new
   `buildValueColorScale`), `GridGraph.jsx` (use the helper), `BarGraph.jsx` (`byValue` mode + min/
   max tracking + linear legend branch), `avl-graph/components/Legend.jsx` (tick key fix),
   `patterns/page/components/sections/components/ComponentRegistry/graph_new/config.jsx` ("Color by
   Value" toggle), `scripts/convert_old_reports.py` (sets `byValue` for BarGraph color wiring),
   `packages/dms/tests/graphColorScale.test.js` (new).

**RESOLVED (2026-07-08) — the ClickHouse unfiltered-probe-query hazard that paused this task is fixed.**
Client-side preventive gating (Option B, `buildUdaConfig.js`'s `skipFetch`) implemented and
live-verified in `planning/tasks/current/clickhouse-unfiltered-probe-hazard.md` — stray unscoped
queries no longer fire at all. Routine Playwright-driven page loads for round 6's 1061/1045/874
verification produced zero stray `system.processes` entries (not re-checked exhaustively, but no
hang/timeout symptoms observed across 3 report loads + 5 raw `dms raw get` calls each).

**Real BarGraph rendering bug found + fixed (2026-07-08, round 6, surfaced while live-verifying
1071).** Report 1071's "Hours of Delay Weekdays 2026-2024" section (and other standalone
Hours-of-Delay bars) rendered **completely blank — no legend, no axis, nothing** — despite the
server returning correct, real (if all-zero, due to the known `aadt=0` gap) data, confirmed via
raw network capture. Root cause: `packages/dms/src/ui/components/graph_new/components/
BarGraph.jsx`'s `dataFromProps` computation used `if (value)`/`if (v)` truthy checks when
aggregating bar values — since `0` is a legitimate real measurement but also falsy in JS, every
row got silently dropped whenever its true value was exactly `0`, leaving `data`/`keys` empty,
which cascades through to suppress the legend, axes, and bars all at once (not just an invisible
zero-height bar). **Fixed**: replaced the truthy checks with the file's existing `strictNaN()`
helper (already used elsewhere in the same file for sort comparisons) so a real `0` is kept and
only genuinely missing/NaN values are dropped. **Verified live**: re-loaded `/report_1071` after
the fix — the previously-blank standalone Hours-of-Delay sections now show a real legend and a
correct x-axis with real date labels (bars themselves are still invisible, which is *correct*
given the real value is genuinely `0` — not a rendering bug). The Speed/TravelTime "By Day"
sibling pairs remain blank, unaffected by this fix — that's the separate, already-tracked Falcor
sibling-cache-collision bug (see above), a different root cause. **Not fixed, left as a follow-up
(subjective/design call, not an obvious bug)**: `avl-graph/BarGraph.jsx` lines 243-249 still
clears the Y-axis domain entirely when min/max are both exactly `0` — after the primary fix,
delay graphs show legend + x-axis but no Y-axis. User was asked whether to also fix this; deferred
pending direction.

### Next session — pick up here, in order

**Round 6 COMPLETE — all 6 reports re-run and gap-audited current.** Nothing left to re-run for
this pass. Below are optional follow-ups from before round 6 — see the "Approved gap-coverage
picks" note below for the original report list. No open re-run work remains on 1070/1071/751/
1061/1045/874; any future work here is either a genuinely new gap-coverage report, or one of the
still-open design questions (Route Difference/Compare graph shape, synthetic `overrides.baseSpeed`
data, `overrides.aadt`, `dataQuality`/stat-panel graph types).

**Reports 1061, 1045, 874 — round 6 re-run, live-verified (2026-07-08), resumed after the
ClickHouse hazard fix.** All three re-converted with `--replace` to pick up the color_range +
graph_layout fixes that had only been exercised on 1070/1071/751 so far:
- **1061** (new page `2188770`): 3 graphs convert (`graph-comp-57` Route Bar Graph/hoursOfDelay/day,
  `graph-comp-58` Route Bar Graph/speed/day, `graph-comp-62` TMC Grid Graph/speed/5-minutes). This
  is the **first live confirmation of color_range wiring on a Route Bar Graph *day*-resolution
  report**, and the first report where the wiring is visually confirmed on two different graph
  types (Route Bar Graph + TMC Grid Graph) at once — both render the report's real 9-color
  purple/orange diverging palette (`#542788`…`#b35806`), confirmed both in the raw section JSON
  (`display.colors.value`) and visually in a live screenshot. `graph_layout`: `size:"12"` (×2,
  full-width bars) and `size:"4"` (grid) written correctly from old `w`, gap now omits `w` (only
  `h`/`x`/`y` remain, as expected). The previously-nondeterministic `graph-comp-60` (mixed
  5-minutes/day/hour resolution TMC Grid Graph) now deterministically gaps every run (the round-3
  fix holding up under a fresh run, not just the original bugfix run). Zero console errors, all 3
  graphs show real non-zero data. `overrides.aadt` gap still present (`I-787 Exit 2 Southbound`,
  same known class as before). **No Falcor sibling-cache-collision observed** — the two Route Bar
  Graph sections share a route but have genuinely different calculated columns (delay formula vs.
  speed formula), so their options strings aren't identical and the collision precondition doesn't
  fire here; worth noting as a data point that the bug needs identical queries, not just a shared
  route, to trigger.
- **1045** (new page `2188782`): same 3 graphs convert as round 5 (`graph-comp-6` Route Line
  Graph/travelTime, `graph-comp-7` TMC Grid Graph/speed/5-minutes, `graph-comp-10` Route Bar
  Graph/hoursOfDelay/**weekday**). **First live confirmation of color_range wiring on the weekday
  bar graph** and **first live exercise of the width fix on non-12 `w` values** (`size:"6"`,
  `"8"`, `"6"` from old `w` values 6/8/6, previously only `w:12` had been exercised). Visually
  confirmed: the Route Line Graph correctly keeps the template's default 20-color palette
  (untouched, not a colorful type); the TMC Grid Graph and the weekday Bar Graph both render the
  report's real 5-color purple→white→green diverging palette (`#7b3294`…`#008837`). Zero console
  errors, all 3 graphs show real data (weekday bar graph shows 3 nonzero bars — a real data-range
  artifact, not a rendering bug). Gap count/content otherwise unchanged from round 5 (29 items:
  unmapped 5-minute-resolution Route Bar Graphs/TMC Info Box/Route Map/Bar Graph Summary/Route
  Compare Component, `relative_date` ×5, `extra_measures_dropped` ×5).
- **874** (new page `2188794`): unchanged from round 5 — 0 of 2 old graphs convert (both
  `Route Map`/`Route Info Box`, no template exists for either), so there's nothing for the
  color_range/graph_layout fixes to exercise on this report; re-run is a clean no-op regression
  check. `color_range` gap still correctly fires (skipped `Route Map` is a colorful type). Gap
  report unchanged (7 items). Live-verified: page loads, zero console errors, no chart data (as
  expected — matches round 5 exactly).

**Report 751 — round 6 re-run, live-verified (2026-07-08).** `--replace`-converted (new page id
`2188754`). `color_range` wiring confirmed **visually** for the first time (previously only
checked via raw JSON): "CO2 50 MPH" (comp-1, passenger) renders a real heatmap using the report's
exact diverging red→yellow→green palette (`#d7191c`…`#1a9641`), not the template's default. "CO2
Trucks Actual"/"CO2 Trucks 50 MPH" (comp-2/comp-3, truck) render empty axes only — this is the
already-known, already-logged Falcor sibling-cache-collision (Manifestation 2: identical query
since `overrides.baseSpeed` isn't implemented), exactly matching round 5's original finding, not a
new issue. `graph_layout` gap now correctly shows only `h`/`x`/`y` (no `w` gap, sections use
`size:"12"` — all 3 converted graphs are full-width in the old layout too, so no visible width
change here, but the code path is exercised). Zero console errors.

**Report 1071 — round 6 re-run, both fixes confirmed live (2026-07-08).** `--replace`-converted
(new page id `2188726`). Verified directly against real section rows + a live page load
(Playwright, headless Chromium, `http://npmrds.localhost:5173/report_1071`, zero console errors):
(a) **`size` width fix**: sections got `size: "4"`/`"6"`/`"12"` matching old `layout.w` — visually
confirmed in the screenshot (3 narrow bar graphs side-by-side under one full-width line graph,
matching a 4+4+4=12 row). (b) **`color_range` wiring**: the report's real 5-color diverging palette
(`#d7191c…#1a9641`) is on every converted Route-Bar-Graph section's `display.colors.value`; the two
Route-Line-Graph sections (not a colorful type) correctly kept the template's default 20-color
palette untouched — first live confirmation that the gating logic picks the right graphs, not just
a blanket rule. `overrides.aadt` still gap-logged (route uses TMC `120-11332`, the same
known-`aadt=0` TMC from round 4 — real, correct `0` delay output, not a defect).
**New finding**: several bar graphs render completely blank in the browser despite the server
returning correct non-empty data for each individually (confirmed via raw network capture, not
just console-log absence) — root-caused as the *same* Falcor sibling-cache-collision bug already
tracked in `falcor-sibling-query-cache-collision.md`, but a **more general instance** than
previously seen: this one hits plain single-series BarGraph pairs (no comparison-series fan-out/
UNION at all), disproving that file's "fixed for ClickHouse only" note — that fix only covered the
fan-out `ORDER BY` symptom, not this plain options-string-collision case. Full details + evidence
in that task file's new "Manifestation 1 re-confirmed" section. Per the existing user precedent on
751 (non-blocking, gap-log and move on), not fixed here — logged as a gap for 1071 and left for
that task.

1. **Optional/low-priority**: implement `overrides.aadt` on the weighted-delay/CO₂ calculated
   columns — real `ny_2025_tmc_meta.aadt` is `0`/unreliable for some TMCs (confirmed for
   `120-11332`, report 1071's route — the old report used `overrides.aadt: '20000'` for exactly this
   reason), so those specific routes will show a real (correct) `0` weighted delay until the
   override is wired in. Not a correctness bug in the join/formula itself — see round-4 notes.
3. **DONE (round 8)**: the Falcor sibling-query cache collision is fixed — see
   `planning/tasks/completed/falcor-sibling-query-cache-collision.md`. Report 751's two truck CO₂
   grid sections still render empty, but now for a different, unrelated reason (a genuine NULL in
   the truck CO₂ formula — see the new round-8 gap above), not the cache collision.
4. **`dataQuality` measure and "TMC Info Box"/"Route Info Box" graph types remain unmapped** — these
   are stat-panel component types with no chart equivalent in the current AVL Graph model (same
   treatment as `Route Map`/`Bar Graph Summary`), not attempted. Report 1045's `month`-resolution
   route comp (`comp-1`) also turned out to be orphaned — not assigned to any graph — so month
   resolution still has no exercised/converted example; not a blocker, just noting it's untested.

**Report 874 "Zizhao_119EB_Delay_AADT" — CONVERTED (round 5, last of the approved picks).** Page
`2188696` (`/report_874`), 0 of 2 old graphs convert — both are `Route Map`/`Route Info Box`, the
same never-built stat-panel/map types gap-logged consistently since round 1 (no new template gap
here; genuinely nothing to build). 9 routes preserved (RRL + Add-a-Route only, no AVL Graph
sections). Gap-logged: `color_range`, 2×`mixed_data_columns_on_graph` (both graphs assigned all 9
routes, cycling `travel_time_all`/`_truck`/`_passenger`), `aadt` measure dropped (only the first
displayData measure converts), and `route_missing_everywhere` for route_id `5445` (all 9 route
comps reference this one route id, which doesn't exist in old `admin2.routes` **or** the new
catalog — genuinely gone in the old system too, not a conversion defect; preserved as a broken
reference, matching "preserve old data as-is" over inventing a fix). Live-verified: page loads,
zero console errors (no chart data to render, so nothing to visually check beyond that).

**Report 1045 "Rochester Inner Loop" — CONVERTED (round 5, continued).** Page `2188684`
(`/report_1045`), 3 of 17 old graphs convert: `graph-comp-6` (Route Line Graph, travelTime,
5-minutes), `graph-comp-7` (TMC Grid Graph, speed, 5-minutes), and **`graph-comp-10`** (Route Bar
Graph, hoursOfDelay, **weekday resolution** — new capability, see below). 14 gap-logged
(`Route Map`×2, `TMC Info Box`×4, `Route Bar Graph`×6 at 5-minute resolution — the weighted-delay/
speed templates only exist at day/weekday resolution, not 5-minutes — `Route Compare Component`,
`Bar Graph Summary`×2), plus `color_range` and 5×`relative_date` (`startDate: '=>yearof'`, a new
old-settings shape not seen before, correctly gap-logged by the existing `relativeDate` check —
no new code needed). All 3 converted graphs verified live rendering real data (user-confirmed,
single page load).

- **New capability: "weekday" resolution bar graphs.** Old `getResolution()`'s `'weekday'` case
  (`trim(to_char(date, 'day'))` in Postgres) groups rows by day-of-week name instead of calendar
  date — e.g. "Total Hours of Delay by day of week" sums delay across every Monday in the range
  into one bar, every Tuesday into another, etc. (same `fn: "sum"`/`DELAY_EXPR`/join as the
  existing day-resolution template — only the grouping column differs). Added `WEEKDAY_EXPR =
  "toDayOfWeek(ds.date, 1) as weekday"` (ISO Monday=1..Sunday=7, a plain sortable integer rather
  than a name string — a future author-facing 1-7→day-name label lookup is a display refinement,
  not attempted). New template `tmc_delay_bar_graph_weekday` + `GRAPH_TEMPLATE_MAP` entry for
  `("Route Bar Graph", "hoursOfDelay", "weekday", "travel_time_all")`.
  `ensure_graph_templates` extended (small, backward-compatible change) to accept a full column
  dict for `TEMPLATE_SPECS[...]["xAxis"]` (not just a plain-column-name string to look up) — needed
  because this is the **first calculated x-axis/groupBy column** in the converter; the existing
  code only supported swapping in an existing externalSource column by name.
- **Real platform bug found + fixed: comparison-series fan-out ORDER BY breaks on calculated
  groupBy/orderBy columns.** Building the weekday bar graph surfaced two related bugs in
  `buildUdaConfig.js`'s `mappedOrderBy` construction (client-side, shared code — this is the
  **first** calculated column ever used with `sort` set, so the bug was latent until now):
  1. A comparison-series arm's table-alias-stripping heuristic (`reqNameWithoutAS.split('.').
     slice(1).join('.')`, meant to turn a bare ref like `"ds.tmc"` into `"tmc"`) naively split on
     *every* `.` in the string — for a calculated expression like `"toDayOfWeek(ds.date, 1)"` this
     produced the nonsense key `"date, 1)"` (splits on the one `.` inside `ds.date`, keeping
     everything after it), which ClickHouse then rejected with a syntax error
     (`Unmatched parentheses`).
  2. Fixed that by skipping the strip for calculated columns (`isCalculatedCol(col)`, the same
     detection already used by `refName`/`attributeAccessorStr`/`accessor()` for this exact class
     of problem) — but the *raw expression* itself (`"toDayOfWeek(ds.date, 1)"`) still isn't valid
     in the outer position: the fan-out wraps each arm as `SELECT * FROM (<arm SELECT ... FROM ds
     LEFT JOIN ...>) AS fanout ORDER BY ...`, and the **outer** `ORDER BY` can only address the
     arm's SELECT-level output alias (`weekday`) — `ds` (and any other inner table alias) is out of
     scope there. Using the raw expression failed with `Unknown expression or function identifier
     'ds.date'` (confirmed via the exact ClickHouse error, pasted from the server log by the user —
     **lesson: check the server log for the real error before reconstructing it from browser
     console captures**, see `[[feedback_check_server_logs_first]]`). **Final fix**: for a
     calculated column in a comparison-series context, use the alias (the part after `" as "`,
     e.g. `"weekday"`) instead of the raw expression.
  **Verified two ways**: (a) new unit test in `packages/dms/tests/buildUdaConfig.test.js`
  ("calculated column with sort: orderBy uses the alias, not the mangled raw expression"), full
  suite green (130/130, no regressions); (b) live — user confirmed all graphs on `/report_1045`
  render data after the fix, including the new weekday bar graph.
  **Separately noticed while debugging, NOT fixed**: the fan-out's `unprojectedGroupBys` logic
  (`dms-server/.../query_sets/clickhouse.js`, the round-2 fix) still double-projects a calculated
  groupBy column — the arm SELECT ended up with both `toDayOfWeek(ds.date, 1) AS weekday` (the
  real projected attribute) *and* a second bare, unaliased `toDayOfWeek(ds.date, 1)` (from
  `unprojectedGroupBys` failing to recognize the calculated groupBy expression as already
  projected, presumably because `getResponseColumnName` has the same naive-dot-split issue
  server-side that the client fix addressed). Harmless — just a redundant SELECT column, no error —
  so not fixed here; worth folding into `falcor-sibling-query-cache-collision.md` or its own
  follow-up if a future calculated-groupBy case actually breaks on it.

**Round 6 (2026-07-08) — iterating on already-converted reports (user direction: address gaps in
already-converted reports, starting with the first one, 1070; explicitly stopped after 1070 to
check in):**

- **`color_range` false-positive gap — fixed + verified.** Same bug class as round 3's
  `peak_flags`/`month_setting` false-alarm: `convert_report()` gap-logged `color_range`
  unconditionally whenever the old report had a non-empty `color_range` array, regardless of
  whether any of the report's graphs actually read it. Traced the old client
  (`transportNY/.../tmc_graphs/index.jsx`'s `GRAPH_TYPES` registry, `isColorfull: true` flag) and
  confirmed against each component's own source (`RouteBarGraph.jsx`, `RouteMap.jsx`,
  `TmcGridGraph.jsx`, `RouteDifferenceGraph.jsx`, `TmcDifferenceGrid.jsx` all build a d3
  `.range(colorRange)` color scale from it) that only **5 of the 23 old graph types** ever consume
  `colorRange`: Route Bar Graph, Route Map, TMC Grid Graph, Route Difference Graph, TMC Difference
  Grid. Report 1070's only graph is a **Route Line Graph** — not in that set — so its `color_range`
  gap was a false positive, identical in kind to round 3's finding. **Fixed**: added
  `COLOR_RANGE_GRAPH_TYPES` constant + gated the gap on `old_graph_types & COLOR_RANGE_GRAPH_TYPES`
  in `scripts/convert_old_reports.py`. **Verified**: (a) standalone check against real report JSON
  — 1070's graph types don't intersect the set (gap correctly suppressed), 751's do (has TMC Grid
  Graph/Route Difference Graph/TMC Difference Grid — gap correctly still fires, confirming the fix
  doesn't just blanket-disable the check); (b) live re-run — `--replace`-converted 1070 (new page id
  `2188702`), gap report shrank from 3 items to 1 (`graph_layout` only, see below).
  **Wiring DONE (same session, after the width fix below).** `color_range` → the new template's
  `display.colors` (`{type: "palette", value: <old color_range>}`, replacing the template's default
  palette wholesale — mirrors how the old report actually used it) for any **converted** graph whose
  old type is in `COLOR_RANGE_GRAPH_TYPES`, via a new `color_range` param on
  `build_graph_section_data()`. The top-level `color_range` gap now only fires when a *skipped*
  (unconverted) graph is a colorful type — i.e. only when the capability is actually lost, not
  whenever a converted colorful graph already carries the real color forward. **Verified
  standalone** (no live report actually exercises this yet — 1070's only graph isn't a colorful
  type): constructed a fake template + old_graph and confirmed (a) a "TMC Grid Graph" old_graph gets
  `colors.value` replaced with the real `color_range`, (b) a "Route Line Graph" old_graph is left on
  the template's default palette (untouched), (c) the gap fires when a skipped graph is colorful
  (e.g. "Route Map"), (d) it does not fire when skipped graphs are all non-colorful (e.g. "Route
  Info Box"). **Re-ran 1070 twice more after this change (ids `2188718`)** as a regression check —
  gap report unchanged (still just `{h, x, y}`), confirming the new code path is a true no-op for
  non-colorful reports. **Live-verified end-to-end (2026-07-08, round 6 complete)** on 751 (TMC
  Grid Graph heatmap), 1061 (Route Bar Graph + TMC Grid Graph together), and 1045 (TMC Grid Graph +
  weekday Route Bar Graph) — real diverging palettes rendering correctly on every colorful
  converted graph across all three reports, default palette correctly untouched on non-colorful
  types (Route Line Graph).
- **Stale generic fixes — 1070 re-run picked them up for free.** 1070 was converted in round 1,
  before round 2 added title-template translation (`{data}`/`{type}`/`{name}` → literal text). A
  plain `--replace` re-run (no code change needed) fixed it: the graph's title is now literally
  "Route Line Graph, Speed" (was `"{type}, {data}"`), confirmed by reading the new section row
  (`dms raw get 2188704`) directly — `"title":"Route Line Graph, Speed"`. **General takeaway for
  the rest of this round-6 pass**: every report converted before a later round's generic fix needs
  a `--replace` re-run to actually pick it up; the fix landing in the script doesn't retroactively
  touch already-created pages.
- **`graph_layout` width — DONE.** Investigated whether old `layout.{x,y,w,h}`
  (react-grid-layout, 12-col) has *any* current-side target, per the user's steer that section
  width is a real, UI-exposed author control today. Confirmed via
  `src/dms/skills/creating-pages-from-a-design-pattern.md` §4.2.5 and direct code
  (`patterns/page/components/sections/sectionArray.jsx`, `sectionMenu.jsx`): every section
  (including AVL Graph, no type-based opt-out) has a top-level `size` field (sibling to
  `element`/`rowspan`/`padding`/`height` on the section's `data`, set via `updateAttribute('size',
  ...)`), read by `sectionArray.jsx` to pick a `theme.sizes[size].className` (colspan) — a real,
  existing, unconditional primitive, not a new-capability build. `theme.sizes` is theme-specific
  though (codebase-default/catalyst/avail: 6-col fractional `"1/3"|"1/2"|"2/3"|"1"`; transportNY's
  `themev2.js`: 12-col numeric `"1".."12"`) — the CLI couldn't confirm which theme `npmrds_sub` runs
  (`dms site tree` hit a stale-auth-token `"no-access"` stub), so the user found it directly: the
  pattern row itself (`dms raw get 2100394`, `npmrds_sub`'s pattern) carries
  `data.theme.selectedTheme: "transportnyv2"` — confirmed against `transportNY/src/dms_themes/
  transportny/themev2.js`'s `sectionArray.styles[0].sizes`: exactly `"1".."12"` string keys,
  `defaultSize: "12"`, same numbering as the old react-grid-layout `w` — a direct `size: String(w)`
  copy, no bucketing needed. **Fixed**: `build_graph_section_data()` now sets `size` from
  `old_graph.layout.w` (guarded to ints 1-12) on the new section row; `graph_layout` gap-detail now
  omits `w` once handled, keeping `h`/`x`/`y` (still no target — sections stack linearly; the
  theme's `rowspan` is a compound-card span-behind-a-sibling concept, not a pixel/row height, so
  it's not a faithful target for old `h`). **Verified live**: re-ran 1070 with `--replace` (new page
  id `2188710`), confirmed `size:"12"` written to the graph section row (`dms raw get 2188712`) —
  a visual no-op for 1070 itself (w:12 = full width = the pre-existing default either way) but a
  real, exercised code path. **Relevant for reports already converted**: 1071/1045/1061 all have
  graphs with `w` values other than 12 (`{4, 6, 8}` seen in their old dumps) — re-running those with
  `--replace` will pick up an actual visible width change, not yet done (round 6 stopped at 1070).

**Round 5 (2026-07-08) — CO₂ emissions calculated column built + verified live; report 751
converted; a third platform bug found (query cache collision, not a defect in the CO₂ column):**

- **CO₂ emissions calculated column — DONE.** Ported `avail-falcor`'s `getCo2Emissions.js`
  (`calcEmissions`/`getCo2`/`forCars`/`forTrucks`) into ClickHouse SQL: `CO2_EXPR_PASSENGER` /
  `CO2_EXPR_TRUCK` in `scripts/convert_old_reports.py`, using the same `META_1946_JOIN` +
  `AADT_DIST_JOIN` mechanism as the weighted-delay column — AADT split car/truck
  (`aadt - (aadt_singl+aadt_combi)` vs `aadt_singl+aadt_combi`), weighted by the same per-epoch
  AADT-distribution share, converted to VMT, run through a 15-bucket piecewise-linear
  speed→emission-factor regression (`multiIf`, separate car/truck coefficient tables) and divided
  by 1e6. Only the `travel_time_truck`/`travel_time_passenger` variants were built (report 751's 4
  route comps are 2 passenger + 2 truck, no `travel_time_all` comps) — a summed all-vehicles
  variant isn't built since nothing needs it yet. Two new `TEMPLATE_SPECS` entries
  (`tmc_co2_grid_graph_passenger`/`_truck`, GridGraph shape mirroring `tmc_speed_grid_graph`:
  xAxis=epoch, color=calculated CO₂ column, fn=avg) and two `GRAPH_TEMPLATE_MAP` entries for
  `("TMC Grid Graph", "avgCo2Emissions", "5-minutes", <dataColumn>)`.
  **Verified two ways**: (a) offline — a direct ClickHouse query against real data (TMC
  `120+24685`, 2022-01-05, epoch 119: real passenger tt=27.02, truck tt=49.88) matched a
  by-hand recomputation of the exact JS formula to 5 significant figures for both the car and
  truck branches; (b) live — report 751's "CO2 50 MPH" section (comp-1, passenger) renders a real
  heatmap (221 cells, smooth color gradient, legend scale 0.006–0.185), zero console errors.
- **Design decisions RESOLVED (2026-07-08, user)**: both open questions from round 3/4 —
  `RouteDifferenceGraph`/`RouteCompareComponent` (compare/diff two series) and synthetic
  `overrides.baseSpeed` data — settled as **gap-log only, no new platform capability**. Already the
  default behavior (no `GRAPH_TEMPLATE_MAP` entry exists for those graph types; `overrides` are
  gap-logged, not applied) — no code change needed, just confirms round 3/4's provisional handling
  is the final answer for this task.
- **Report 751 "Van Wyck CO2 Test Single TMC" — CONVERTED.** Page `2188662` (`/report_751`), 3 of
  13 old graphs convert (all "TMC Grid Graph" + `avgCo2Emissions`): comp-1 (passenger, `overrides.
  baseSpeed` ignored — shows real data, not the hypothetical 50mph scenario), comp-2 (truck,
  real), comp-3 (truck, `overrides.baseSpeed` ignored). 10 gap-logged: `Route Map`, 2×`Route Line
  Graph` (one mixed-dataColumn, one plain), `Traffic Volume Graph`, 2×`Route Difference Graph`,
  `Route Compare Component`, `TMC Grid Graph` (mixed-dataColumn, all-4-comps variant), 2×`TMC
  Difference Grid` — all correctly unmapped (no template exists for these graph types, or
  dataColumn is ambiguous across assigned comps). Plus `color_range` and 2×`overrides.baseSpeed`
  gaps.
- **New platform bug found: unfiltered ClickHouse probe queries have no execution/memory cap —
  root-caused, NOT newly introduced by this work.** Repeated report-page reloads while verifying
  CO₂ piled up 40 concurrent stray queries on the shared dev ClickHouse server (elapsed 4–78 min,
  up to ~14B rows read each) — all traced to the already-diagnosed
  `dataWrapper-stale-fetch-race` (`planning/tasks/completed/dataWrapper-stale-fetch-race.md`,
  2026-07-01): a Graph/Spreadsheet section can briefly fire an unfiltered `simpleFilterLength`
  probe before `comparisonSeries`/page filters resolve. That fix only stops the stale response
  from *overwriting* a later correct one — it doesn't cancel or prevent the query, and the
  ClickHouse adapter's `max_execution_time: 0`/`max_memory_usage: 0` (no caps) means a stray probe
  can run for over an hour. Confirmed general (hit the *pre-existing* speed grid template too, not
  just the new CO₂ one). Killed all 40 with the user's explicit confirmation. Full mechanism +
  live-incident writeup + safe check/kill procedure now documented in
  `documentation/npmrds-data-sources.md` ("Known operational hazard") and
  `packages/dms-server/CLAUDE.md`. **Practical takeaway**: don't do repeated full-page browser
  reloads while debugging a report page — prefer a single load or a narrowly-filtered direct query.
- **New platform bug found: Falcor sibling-query cache collision — split into its own task,
  `planning/tasks/current/falcor-sibling-query-cache-collision.md`.** Report 751's two truck CO₂
  grid sections (comp-2 real, comp-3 `overrides.baseSpeed` ignored) have a byte-for-byte identical
  query (same join/filters/groupBy/calculated column, since the override isn't implemented) and
  both render completely empty — no error. The one sibling section with a genuinely different
  query (comp-1, passenger) rendered correctly. This is the same general bug class as round 2's
  "Falcor cache-dedup shrinks attributes when sections share an identical options string" (which
  had a partial ClickHouse-only fix, Postgres parity never tracked) — likely related, possibly the
  same root cause, not yet fully pinned down. **User confirmed (2026-07-08): non-blocking, log as
  a gap for this report, don't let it block further conversion work.**

**Open design questions RESOLVED (2026-07-08) — user decided gap-log only for both, do not build
new platform capability for report 751:**
- `RouteDifferenceGraph`/`RouteCompareComponent` (compare/diff two independently-resolved series):
  keep gap-logging as `unmapped_graph` (as round 3 already does). No new template/graph-shape work.
- `overrides.baseSpeed` synthetic per-epoch data (fabricated `length/baseSpeed*3600`, no real
  NPMRDS row): keep gap-logging as unconverted, same treatment as `overrides.aadt`. No synthetic-
  series primitive to build.

**Round 4 (2026-07-08) — weighted Hours-of-Delay built, verified, plus a real platform bug found
along the way:**

- **Weighted Hours-of-Delay calculated column — DONE.** `scripts/convert_old_reports.py`'s
  `DELAY_EXPR`/`TEMPLATE_SPECS["tmc_delay_bar_graph_day"]` now joins `aadt_distributions`
  (source 2056/view 3524) via the calculated-join-key mechanism (round-3), computing
  `raw_delay_hours * (aadt/facil) * epoch_dist_share` — matches `getHoursOfDelay.js`'s
  `calcDelay`/`getAADT` exactly for the `travel_time_all` dataColumn (no `overrides.aadt` support
  yet — logged as a gap, see item 4 above). `ensure_graph_templates` generalized from a
  single-hardcoded-`table1` join to an arbitrary `{table1: ..., table2: ...}` sources dict (spec's
  `"join"` key is now the sources dict directly, not one source). Applied directly to the
  **already-existing** live template row (id `2188429`) via a one-off `dms raw update` (template
  rows are cloned into each section's `element-data` at creation time — editing the template alone
  does NOT retroactively update sections created before the edit, so reports 1071 **and** 1061 both
  needed a `--replace` re-run to pick it up).
- **Second platform bug found + fixed: ClickHouse "ambiguous identifier" on 3-way joins.**
  Re-running 1071 surfaced every graph on the page hanging (not erroring) — a red herring caused by
  the user's VPN dropping mid-session; a dms-server restart cleared a ClickHouse connection pool
  left holding dead connections from the outage. Once connectivity was back, the delay graphs
  specifically still failed (silently — zero console/server errors) while restarting revealed the
  real cause during a length-query capture: `ClickHouseError ... ambiguous identifier 'tmc' ...
  AMBIGUOUS_IDENTIFIER`. Root cause: comparison-series route filters (`ReportRouteList.jsx`'s
  per-route `filters: {AND: [tmc IN ..., date IN ..., epoch IN ...]}`) emit **bare** column names
  (no table alias), and `handleFilterGroupsCH`
  (`dms-server/src/routes/uda/query_sets/helpers.js`) never qualified them — harmless with one
  join (`ds` + `table1`, both exposing `tmc`, apparently tolerated by CH's join-column resolution
  for 2-way joins) but CH's stricter resolver rejects the same bare reference once a **second**
  joined table is added (`table2` = `aadt_distributions`), even though `table2` itself has no
  `tmc` column at all — this is exactly the gap already flagged as "NOT fixed (pre-existing)" in
  the round-3 notes below, just triggered for real by adding a second join source for the first
  time. **Fixed**: `handleFilterGroupsCH` now takes a `joinPresent` flag and qualifies bare
  (no-dot, no-paren) filter columns with `ds.` when true; `clickhouse.js`'s `buildCombinedWhereCH`
  now threads `joinPresent` through to it (previously only reached the separate, still-dead-code
  `handleFiltersCH` param). Also fixed a second, adjacent omission: `simpleFilterLength`'s
  non-comparison-series `combinedWhere` call was missing `joinPresent` entirely. **NOT touched**
  (still open, pre-existing, unverified by this fix): the equivalent gap in `handleFiltersCH`'s own
  dead `joinPresent` param, and the parallel gap in the Postgres path's `handleFilterGroups`/
  `buildLeafSQL` (`dms-server/src/routes/uda/utils.js`) — scoped out per
  `[[isolate-shared-code-changes]]`, fix+verify those separately when/if a Postgres 3-way join
  actually needs it. **Verified**: new unit test
  `testFilterGroupsCHJoinQualification` in `dms-server/tests/test-uda.js` (joinPresent
  true/false, plus already-qualified/calculated columns not double-prefixed) — full `test:uda`
  suite green (70/70, no regressions). Live-verified via direct `/graph` calls (bypassing the
  browser to avoid re-triggering ClickHouse pool exhaustion from repeated full-page loads): the
  delay graph's length query, which previously 500'd with the ambiguous-identifier error, now
  returns real counts.
- **Report 1071's delay graphs still show `0` after the fix — confirmed NOT a bug.** Queried
  `ny_2025_tmc_meta` directly for TMC `120-11332` (report 1071's route): `aadt = "0"`. This matches
  the old report's own data — its `route_comps` settings carry `overrides.aadt: '20000'` for every
  route on this TMC, i.e. the *old* tool needed the same override because the real table value has
  always been unusable here. The formula multiplies by `aadt/facil`, so `aadt=0` correctly yields
  `0` — this is real, correct output, not a join/formula defect. Confirmed the join/formula
  mechanism itself is sound with a direct (non-browser) query against a TMC with a real AADT
  (`120+24685`, `aadt=6141`, from report 1061's unused "Albany Shaker Road" route): weighted-vs-
  unweighted daily sums came back at a consistent ~15–17× ratio across 5 different days (2022-01-03
  through 2022-01-07) — exactly the AADT/facil-driven scaling the formula should produce, not noise.
  `overrides.aadt` support remains a real, still-open gap (item 4 above) — it just isn't what's
  wrong with the join mechanism.
- **Operational note for future sessions**: repeated rapid full-page browser reloads against a
  report with many graph sections can exhaust/wedge the dms-server's ClickHouse connection pool
  (each reload fires ~10-13 concurrent queries; the user separately confirmed the UI itself can
  sometimes fire an unfiltered query against the multi-billion-row NPMRDS fact table that hangs for
  a long time before timing out) — symptom is EVERY graph on the page hanging with no response and
  no server-side error, including ones unrelated to whatever you just changed. Fix is a
  `touch src/dms/packages/dms-server/src/index.js` to force a nodemon restart (clears the pool).
  Prefer direct `/graph` calls with narrow, explicit filters (tmc + a handful of dates/epochs) over
  repeated full-page loads when debugging a single calculated column.
  **Root-caused (2026-07-08, round 5)**: this isn't just pool exhaustion — the actual mechanism is
  the already-diagnosed `dataWrapper-stale-fetch-race` (see
  `planning/tasks/completed/dataWrapper-stale-fetch-race.md`), which the ClickHouse adapter's
  `max_execution_time: 0`/`max_memory_usage: 0` turns from "wasteful" into "can run for over an
  hour." Full mechanism, live-incident evidence, and how to safely check/kill stray queries now
  documented in `documentation/npmrds-data-sources.md`'s "Known operational hazard" section and
  `packages/dms-server/CLAUDE.md`. **This is a known, pre-existing, general platform behavior — not
  something to re-diagnose as a new bug each time a graph hangs.** Don't do repeated full-page
  reloads while debugging; a single stray unfiltered probe surviving a closed browser tab and
  running for an hour+ on the shared dev server is a real, recurring risk, not a hypothetical one
  (40 such queries piled up during this round's verification, killed with the user's confirmation).

**Destructive-action scope, clarified by the user (2026-07-08):** the "no destructive actions"
rule is about the OLD `admin2.*`/`data_manager.*` source tables (mercury/neptune, read-only,
ACTIVE production data — see the data-source bank section below) and the ClickHouse `avail`
database — NOT the new converted report pages this script creates in the dev DB. Those are
disposable test data (per the 2026-07-07 direction already noted below) and `--replace` /
overwriting them freely is expected normal workflow, not something to hesitate over.

**Round 3 (2026-07-08), so far:**

- **Correctness bug found + fixed: non-deterministic resolution/dataColumn selection on
  multi-comp graphs.** `analyze_graph()` used to fall back to `next(iter(some_set), None)` when
  a graph's assigned comps disagreed on `resolution` or `dataColumn` and `state` had no explicit
  override — logging a `mixed_resolutions_on_graph`/`mixed_data_columns_on_graph` gap but then
  **still converting anyway** using whichever value happened to come out of Python's
  hash-seed-dependent set iteration. Caught live on report 1061's `graph-comp-60` (a "TMC Grid
  Graph" with all 10 comps assigned, spanning 5-minutes/day/hour resolutions): a dry run picked
  `'day'` (correctly unmapped, no template), the very next live run picked `'5-minutes'` (found a
  template, converted it) — same input, different output, and the "converted" version silently
  queried 5-min-epoch data for routes whose old settings said day/hour. **Fixed**: ambiguous
  resolution/dataColumn now resolves to `None` (guaranteed no template match, always skipped +
  gap-logged) instead of guessing. Verified deterministic across `PYTHONHASHSEED` 0/1/2/3/42.
  **The live report_1061 page (created before this fix) still has the bad graph-comp-60 section
  — needs a `--replace` re-run once the auth token below is refreshed.**
- **Report 1061 "Single Route Before and After" (pick #3) — CONVERTED, partially stale.** Page
  `2188594` (`/report_1061`), 6 sections (RRL + 3 graphs + Add-a-Route... — wait, only 3 of the
  originally-created graphs are actually valid; see bugfix above), 9 route entries (route group
  `comp-8` correctly flattened — it had 0 inner comps, logged). 3/11 old graphs convert with
  already-existing templates: `graph-comp-57` (Route Bar Graph, hoursOfDelay, day — unweighted,
  known gap), `graph-comp-58` (Route Bar Graph, speed via default, day), `graph-comp-62` (TMC
  Grid Graph, speed, 5-minutes). Browser-verified live (Playwright + real Chrome, headless,
  `--host-resolver-rules` to resolve `npmrds.localhost` without touching `/etc/hosts`): all
  render real numeric data (e.g. delay bar shows real per-day hours-of-delay values back to
  2016), zero console errors (only a benign `net::ERR_ABORTED` on the `/track/visit` analytics
  beacon, same as round 1/2). 8 graphs correctly gap-logged as unmapped: `Route Map`, `Route Info
  Box`, `Bar Graph Summary` (2×, a new graph type — shows a single aggregate value per comp, not
  a time series), `TMC Difference Grid`, plus `graph-comp-55`/`-56`/`-61` (mixed resolution or
  measures not yet template-mapped: `avgHoursOfDelay`, unmapped for any graph type). One
  `overrides.aadt: '0'` gap-logged (comp-7).
  **TODO next session**: mint a fresh `DMS_AUTH_TOKEN` (see `[[dms-dev-creds]]` /
  `reference_dms_dev_creds.md` — `POST /login`, NOT `/auth/login`, on local dms-server; the
  stored token in `scratchpad/npmrds-sub/.dms-auth-token` is stale, delete calls return
  `"Authentication required to delete items"`), write it to that file, then re-run
  `python3 scripts/convert_old_reports.py --report-id 1061 --replace` to drop the
  now-known-bad graph-comp-60 section and pick up any other diffs from the bugfix.

- **`peak_flags` / `month_setting` gap kinds REMOVED — proven not to be functional
  gaps.** Traced the actual old client (`transportNY/src/sites/npmrds/pages/analysis/`):
  `RouteComponent.jsx`'s `shouldReloadData()` — the gate for whether the real data
  query re-runs — reads only `startDate/endDate/startTime/endTime/resolution/
  dataColumn/weekdays/overrides`. It never reads `amPeak/pmPeak/offPeak` or
  `year/month`. Clicking a peak button (`togglePeaks()`) computes an envelope
  (MIN of enabled starts, MAX of enabled ends — a contiguous span, NOT disjoint
  subranges; all-three-true covers the whole day-span including the off-peak
  middle) and writes it directly into `settings.startTime/endTime` — the peak
  booleans and the `year`/`month` fields survive only as display/highlight state
  (`year`/`month` are read solely by title-label helpers,
  `store/index.js` ~2719-2746). Confirmed against report 1071's real data: the
  "AM Peak" route has `startTime:'07:00', endTime:'10:00'` (exactly
  `[7*12,10*12]` epochs per `general.utils.js`'s `amPeakStart/End`); the
  all-three-peaks route has `'07:00'/'19:00'`. Since `startTime/endTime` (via
  `startDate/endDate`) are already fully converted into the route entry today,
  these settings need **no additional conversion work** — the gap-report entries
  were false alarms, not missing capability. Fixed in
  `route_settings_gaps()` (`scripts/convert_old_reports.py`); the "AM/PM/off-peak
  flags" line in Known functionality gaps below is corrected accordingly.

- **Report 751 "Van Wyck CO2 Test Single TMC" (pick #2) — INVESTIGATED, NOT YET CONVERTED.**
  Old data pulled to `scratchpad/npmrds-sub/old-reports/report_751.json` (4 route comps, 2
  passenger/2 truck `dataColumn`, comp-1/comp-3 carry `overrides.baseSpeed:'50'` — a
  "what if this road ran at 50mph" scenario paired against comp-0/comp-2's real data; 13
  graph_comps). This report is a much bigger lift than 1070/1071 — almost every graph needs
  either the CO₂ measure, a "Difference"/"Compare" graph shape, or a graph type with no
  new-side equivalent at all. Findings, none yet implemented:
  - **CO₂ formula located**: `avail-falcor/services/routeDataRetrievers/getCo2Emissions.js`
    (`calcEmissions`/`getCo2`/`forCars`/`forTrucks`). Splits AADT into car
    (`aadt - aadt_singl - aadt_combi`) vs truck (`aadt_singl + aadt_combi`) — both available on
    the same `ny_2025_tmc_meta` join (source 1946/view 3298) already used for delay — multiplies
    each by the **same per-epoch AADT-distribution share** used for Hours-of-Delay weighting
    (`aadtDistributions.js`, keyed by weekday-vs-weekend × congestion_level × directionality ×
    freeway-vs-non), converts to VMT, then runs VMT through a **15-bucket piecewise-linear
    speed→emission-factor regression** (separate car/truck coefficient tables, `forCars`/
    `forTrucks`) and sums. Mechanically expressible as a big SQL CASE-based calculated column
    once the AADT-distribution table exists — **but gated on the exact same missing dependency**
    already flagged for weighted Hours-of-Delay: the `aadtDistributions.js` matrix (~20 dist keys
    × 288 epochs) is not in any queryable table yet.
  - **Checked whether the PM3/MAP21 pipeline already has a substitute (per the user's "we may
    already have weighted hours of delay" hint) — it does NOT, for this use case.**
    `avail-falcor/dama/routes/data_types/map21/calcPhed.js` computes FHWA PHED (Peak Hour
    Excessive Delay) using a *different* traffic-distribution source
    (`CATTLabTrafficDistributionProfiles`, a static table analogous to but distinct from
    `aadtDistributions.js`) plus average-vehicle-occupancy and directional AADT — but PHED is a
    **single aggregate annual number per TMC** (`all_xdelay_phrs` etc.), not a per-day/per-epoch
    time series. It cannot substitute for a "Hours of Delay by day" bar graph or a CO₂-by-day
    line graph, which both need per-period values. `calcTtrMeasure.js` (LOTTR/TTTR) is unrelated
    — travel-time-reliability ratios, no AADT weighting at all. **Conclusion: sources
    1722/2001/1410 don't shortcut this** for time-series delay/CO₂ conversion; the
    AADT-distribution table still needs to be loaded, or these graphs stay unweighted/unconverted.
  - **Cross-database joins are a hard constraint, confirmed both by the user directly and by
    code**: the UDA join-builder (`dms-server/src/routes/uda/query_sets/*.js`, `utils.js`'s
    `buildJoin()`/`getEssentials()`) picks ONE connection for the whole query from the *main*
    `externalSource`'s dbType, then splices every `join.sources` entry's `table_schema.table_name`
    into that same connection's SQL as plain text — there is no fan-out across engines (also
    documented as a known v1 limitation in
    `planning/tasks/completed/datawrapper-join-support.md:139-146`, "same-database joins only").
    Since NPMRDS travel-time data (source 583/982) lives in **ClickHouse** (`npmrds2` pgEnv's
    `clickhouse` sub-config, `neptune.availabs.org:8123`, db `avail`), any table it joins to —
    including a new AADT-distribution reference table — **must itself be a ClickHouse table in
    that same `avail` database**, registered as a DAMA source/view in the `npmrds2` pgEnv's
    Postgres metadata (`neptune.availabs.org:5758`, `data_manager.sources/views`) the same way
    `ny_2025_tmc_meta` is. A DMS-native dataset uploaded via the `dms` CLI into `dms3` would NOT
    work (wrong server entirely). dms-server has no ClickHouse write path (see its own CLAUDE.md).
  - **Open, user-flagged**: "There should be ClickHouse tables with the TMC info you need" —
    the user believes relevant reference data (possibly the distribution matrix, possibly
    something else) may already exist as a ClickHouse table in the `avail` database, which would
    remove the need to load `aadtDistributions.js` at all. **Not yet confirmed** — attempts to
    run a read-only `SHOW TABLES FROM avail` against ClickHouse were blocked twice by the
    auto-mode permission classifier (credential-exposure concern, since the query needs the
    `avail_admin` password from `npmrds2.config.json`'s `clickhouse` block embedded in the
    request). Per the "don't tunnel around a denial" instruction, this was not forced through —
    it needs either the user running the lookup themselves, or an explicit permission grant.
    **RESOLVED (2026-07-08)**: user ran `SHOW TABLES FROM avail` — table `aadt_distributions`
    already exists (alongside `npmrds`, `avg_monthly_tt`, `mpo_boundaries`, `tmc_avg_speedlimit`,
    all in the SAME ClickHouse `avail` database as the main NPMRDS fact table, so a same-engine
    join is possible). Schema: `key String, distributions Array(Float64)`. Verified byte-for-byte
    match against `aadtDistributions.js`: same 20 keys, each a 288-length array. The CH array
    values are the raw JS literals **÷100** (CH sums to 1.0 per key; the raw JS literals alone sum
    to 100.0) — traced this to `aadtDistributions.js`'s own tail: `DISTS[dist] =
    distributions[dist].map(d => d * 0.01); module.exports = DISTS` — i.e. the CH table holds
    exactly the post-scaling `DISTS` values that `getCo2Emissions.js`/`getHoursOfDelay.js` actually
    `require()` and use, not a re-derivation. **No further scaling needed when joining — use the CH
    values as-is.** This is the single biggest lever available: it unblocks upgrading
    `tmc_delay_bar_graph_day` (currently unweighted, round-2 gap) to real AADT-weighted delay, and
    unblocks the CO₂ measure needed for most of report 751.
  - **Registration DONE (2026-07-08): source_id 2056 / view_id 3524.** Per the join-engine
    research above, a `join.sources` entry needs a real DAMA source+view row
    (`data_manager.sources`/`views`, Postgres, `npmrds2` pgEnv, `neptune.availabs.org:5758`)
    pointing at `table_schema: 'clickhouse.avail'` / `table_name: 'aadt_distributions'`. User
    confirmed: register it as a NEW source (1946/3298 is specific to `ny_2025_tmc_meta`, not a
    reusable generic entry), shaped to look exactly like a real Data Manager UI upload —
    `type: 'gis_dataset'` (no dedicated "static reference table" type/flow exists; this is the
    closest real convention), `user_id: 993`. Read the live schema + real example rows directly
    (`data_manager.sources`/`views` columns, plus sources 583/1946/three real `gis_dataset` rows)
    to build the exact shape rather than guess. User ran `scripts/register_aadt_distributions.sql`
    directly against `npmrds2`/`neptune:5758` (writes there are blocked when run through the
    agent's own tools — same pattern as the ClickHouse reads). Full inventory in
    **`src/dms/documentation/npmrds-data-sources.md`**.
  - **Also worth resolving the join key**: the epoch-distribution `key` (e.g.
    `WEEKDAY_NO2LOW_CONGESTION_AM_PEAK_FREEWAY`) isn't a plain column match — it's a computed
    string from `getDist()` in `getCo2Emissions.js`/`getHoursOfDelay.js`
    (`[weekdayType, congestionLevel, peakType, roadType].join('_')`, weekend collapses to
    `[weekdayType, roadType]`) built from `dow` (from `date`), plus `congestion_level`/
    `directionality`/`f_system` (already available via the existing `ny_2025_tmc_meta` join). The
    array is then indexed by raw epoch (`distributions[dist][row.epoch]`, 0-287) — in ClickHouse
    that's `arrayElement(distributions, epoch + 1)` (1-indexed).
  - **RESOLVED (2026-07-08) — calculated join keys, fixed and verified.** The join-key expression
    above needs `congestion_level`/`directionality`/`f_system`, which only exist on
    `ny_2025_tmc_meta` (`table1`, already joined) — NOT on the raw `ds` (npmrds fact) side. Traced
    the actual join builder
    (`packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`)
    and found two independent limitations: (1) no calculated-expression join keys — `accessor()`
    in `buildJoinOnClause()` always rendered `${alias}.${col}`, with no way to supply a raw SQL
    expression as either side of a join condition; (2) apparent no multi-hop joins — every join
    condition's left side was hardcoded to `accessor("ds", ...)`, seemingly meaning nothing could
    reference an already-joined alias like `table1`.
    **The user's fix**: define the dist-key as a *calculated column* (the same `"<expr> as
    <alias>"` convention already used for the existing `speed`/`hours_of_delay` calculated
    columns) and reference that calculated column as a join's `dsColumn`. Verified this resolves
    BOTH limitations at once: `accessor()` (buildUdaConfig.js line ~889) needed one small,
    precedented fix — check `isCalculatedCol({name: col})` (the same detection already used by
    `refName`/`attributeAccessorStr` for WHERE/GROUP BY) and if true, use the raw expression via
    `splitColNameOnAS` instead of prefixing `${alias}.` — and since a calculated column's
    expression is opaque SQL text with the full FROM/JOIN scope already visible to it (exactly
    like the existing `hours_of_delay` calc column already references `table1.miles`), it can
    freely reference `table1`'s columns inside its own body. So (2) was never a real join-engine
    limitation — only (1) was, and fixing it incidentally unlocks (2) as well, because the
    "multi-hop" reference happens *inside* the calculated expression, not through the join
    framework's own aliasing.
    **Verified two ways**: (a) unit test added to
    `packages/dms/tests/buildUdaConfig.test.js` (`buildJoinOnClause` — "uses a calculated
    dsColumn's raw expression as-is"), full package suite still green (168/168, no regressions);
    (b) live end-to-end query against real ClickHouse data (temporary test script, deleted after
    use) built the full 3-way join `ds LEFT JOIN table1 ON ds.tmc=table1.tmc LEFT JOIN table2 ON
    <dist-key expr referencing table1> = table2.key` and returned correct results — e.g.
    `matched_key: "WEEKDAY_MODERATE_CONGESTION_EVEN_DIST_FREEWAY"` (a real key from
    `aadtDistributions.js`) with sensible `epoch_weight` values varying smoothly across epochs.
    **Separately noticed, NOT fixed (pre-existing, unrelated to this fix)**: `filterGroups`-shaped
    filter columns (`handleFilterGroupsCH` in `dms-server/.../query_sets/helpers.js`) are used
    verbatim in generated SQL with no alias-qualification, join-aware or not — a bare `tmc` filter
    with a join present produces "ambiguous identifier" if the joined table also has a `tmc`
    column. Hasn't surfaced in production because report-page route filtering goes through the
    `comparisonSeries`/`resolveComparisonVariants` path, not top-level static `filters`. Worked
    around in the live-query test by pre-qualifying (`ds.tmc` instead of `tmc`) — logging here in
    case it bites a future top-level-filter + join combination.
    **`aadt_distributions` (source 2056/view 3524) is now fully wired and ready to use** — next
    step is building the actual weighted-delay and CO₂ calculated columns using this mechanism.
  - **`RouteDifferenceGraph`/`RouteCompareComponent` are a different graph SHAPE, not just a new
    measure.** Traced `transportNY/.../tmc_graphs/RouteDifferenceGraph.jsx`: it resolves TWO
    route comps (explicit `activeRouteComponents:[idA,idB]`, or auto-pairs a lone comp with
    "another comp of the same resolution+tmcArray" — exactly how report 751's comp-0/comp-1 and
    comp-2/comp-3 real-vs-baseSpeed pairs work) and renders their **difference** as its own
    series. `RouteCompareComponent` similarly needs multiple independently-resolved series shown
    together, not a single comparison-series list. Neither maps onto the current `avl_graph_template`
    model (one externalSource + one comparison-series list of routes) without new design — logged
    as `unmapped_graph`, not attempted.
  - **`overrides.baseSpeed` (comp-1/comp-3) needs synthetic per-epoch data, not a real-data
    join.** Old `getCo2Emissions.js`'s `getTravelTimes()` calls `generateSyntheticData()` instead
    of querying `npmrds` at all when `overrides.baseSpeed` is set — travel time is fabricated as
    `length/baseSpeed*3600` for every epoch in range, no real NPMRDS row involved. The current
    template model has no "fabricate a full epoch series with no fact-table backing" primitive.
    Logged as a gap, not attempted.
  - **`TrafficVolumeGraph`'s real default measure is `vmt`**, not `speed`
    (`TrafficVolumeGraph.jsx:50`: `get(this.props, 'state.displayData', ["vmt"])`) —
    `DEFAULT_DISPLAY_DATA` in the converter doesn't have a `"Traffic Volume Graph"` entry yet, so
    it would currently mislabel this graph's gap as `measure: speed`. **Fixed**: added
    `"Traffic Volume Graph": "vmt"` to `DEFAULT_DISPLAY_DATA`. Still unmapped (no template) — just
    correctly gap-logged now.
  - **Net for 751 (updated 2026-07-08, end of session)**: still nothing converted, but the
    hardest blocker (AADT-distribution weighting infra) is now fully cleared — `aadt_distributions`
    is registered (source 2056/view 3524) AND the join mechanism to use it is fixed+verified (see
    the calculated-join-key RESOLVED note above). What's left for 751 specifically: (1) build the
    actual weighted-delay calculated column (upgrade `tmc_delay_bar_graph_day`) and a new CO₂
    calculated-column template using this now-working join — mechanical SQL-writing, no more
    unknowns; (2) a genuine design decision on Difference/Compare graph shapes (no template
    equivalent exists at all); (3) a genuine design decision on synthetic `baseSpeed` data
    generation (no real-fact-table-backed primitive exists). (1) is unblocked and ready to start
    immediately; (2) and (3) need user input on approach before implementation.

**Round 2 (report 1071 "WB East-West Arterial Poughkeepsie" — pick #1):** page `2188486`
(`/report_1071`), 13 sections, 9 route entries. 11 of 13 old graphs convert (Route Map + Route
Info Box gapped); all 11 render live with real data, zero console errors. What round 2 added:

- **displayData-keyed template mapping** — `GRAPH_TEMPLATE_MAP` now keyed (graph type × measure ×
  resolution × dataColumn), with per-graph-type displayData defaults (old components default
  `['speed']`), `'none'` entries dropped, extra measures gap-logged.
- **Template auto-minting** (`ensure_graph_templates` + `TEMPLATE_SPECS`) — missing
  `avl_graph_template` rows are built from `tmc_travel_time_line_graph`'s stateJson with targeted
  mutations. Minted: `tmc_speed_bar_graph_day` 2188428, `tmc_travel_time_bar_graph_day` 2188427,
  `tmc_delay_bar_graph_day` 2188429 (BarGraph, `date` xAxis grouped+sorted).
- **Hours of Delay via join, not client calc** — `tmc_delay_bar_graph_day` joins the
  `ny_2025_tmc_meta` **ClickHouse** view (source 1946 / view 3298: miles, avg_speedlimit,
  congestion_level, directionality, aadt…) and computes
  `sum(greatest(0, tt - (miles/greatest(20, speedlimit*0.6))*3600)/3600)`. UNWEIGHTED vs the old
  tool: the per-epoch AADT share (`aadtDistributions.js`, ~20 dist keys × 288 epochs, static JS in
  avail-falcor) is not in any table yet — loading it as a joinable reference is the follow-up.
  Also: old reports can carry `overrides.aadt` (1071 does — 20000) — gap-logged.
- **Per-graph route assignment** — old `state.activeRouteComponents` inverted into per-entry
  `graphIds` (a graph without the key shows every comp).
- **Point-drawn routes resolved** — routes with null `tmc_array` (lat/lng `points` only) resolve
  per-year server-side via old prod falcor `routes2.id[id][year].tmc_array`; per-comp years from
  settings; union across years (gap if per-year sets differ). Route 268034 → `['120-11332']`.
- **Title templates fully translated** — `{data}`/`{type}`/`{name}` → literal section titles.
  Old `state.message.text` → graph `display.description`.
- **Graph sections always get `state.data = []`** — template stateJson lacks it; BarGraph crashes
  the whole page on undefined viewData (`d3groups(undefined)`).
- **dms-server FIX (shared code, verified in isolation)** —
  `routes/uda/query_sets/clickhouse.js` fan-out now projects arm GROUP BY columns even when the
  request's attribute list omits them. Falcor cache-dedup shrinks attributes when two sections
  share an identical options string (two graphs over the same routes differing only in measure —
  exactly what conversion produces: speed/travelTime bars of the same comp); the cross-union
  `ORDER BY date` then referenced an unprojected column → "Unknown expression identifier 'date'",
  blank graphs. **`postgres.js` has the same latent fan-out flaw — parity fix + verification is an
  open follow-up.** Note the deeper unsoundness: falcor merges rows by index across queries, so
  same-options/different-attrs fetches rely on total ordering; multi-variant fan-outs ordered only
  by date can tie across arms. Deferred.

**Round 1 (report 1070):**

`scripts/convert_old_reports.py` converted old report **1070** ("Route 44 Incident Analysis April
2026") end-to-end (re-run with `--replace` after the weekday fix): page `2188393` (`/report_1070`,
child of "Converted Reports" parent `2188366`), draft sections `2188394-96` + published copies
`2188397-99` (shared trackingIds), `reports_snap_2` row `2188400`, route `268042` upserted into
the catalog. Verified in headless Chromium against the live dev site: RRL panel shows the route,
the AVL Graph plots real weekday-only travel-time data over epochs 84–228, zero console errors,
and the captured UDA query's date filter contains exactly the 261 weekdays of 2025 (0 weekend
days). Remaining gaps for this report: color_range, graph layout, graph title template
(`scratchpad/npmrds-sub/old-reports/gaps/report_1070.json`).

The user's direction (2026-07-07): stay on this single report until it's fully faithful; the new
data shape may change freely as long as it stays forward-compatible; UI affordances for these
fields are explicitly out of scope for now. All existing test reports/routes in the dev DB are
disposable.

Next: widen `GRAPH_TEMPLATE_MAP` (create more `avl_graph_template` rows per (graph type ×
resolution × dataColumn)), design filters for weekday/peak masks, then batch conversion.

Auth: CLI creates work unauthenticated; a token (minted via `POST /login` on the local dms-server,
NOT `/auth/login` — auth routes mount at root) is stored at `scratchpad/npmrds-sub/.dms-auth-token`
and passed automatically by the converter for delete/update paths. Creds are in Claude's memory.

## Objective

Replace the old Reports/Routes tools (`npmrds.devtny.org/reports`) while **preserving as much old
report data as possible**. Write automated, repeatable script(s) that pull old reports from the old
DB, transform them, and create equivalent report pages in the new DMS system. Conversion first;
authoring UI ergonomics explicitly deferred (a large flat pile of graph templates is acceptable —
stability/robustness of the conversion wins).

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

**Current live page ids as of round 7 completion (2026-07-08)** — 1061/1045/1071 superseded again
in round 7 to pick up `colors.byValue`; 1070/751/874 unchanged since round 6 (751/1070 needed no
DB change for the round-7 GridGraph fix — it's frontend-only; 874 has no converted graphs at all):
1070→`2188718`, 1071→`2188906` (round 9, aadt override), 751→`2188894` (round 9, truck-CO₂ fix),
1061→`2188800`, 1045→`2188812`, 874→`2188794`.

Other files this task has produced, outside that scratchpad folder:
- `scripts/convert_old_reports.py` — the converter itself.
- `scripts/register_aadt_distributions.sql` — one-time DAMA source/view registration for
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
