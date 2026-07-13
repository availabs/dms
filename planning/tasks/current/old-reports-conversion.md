# Old NPMRDS reports → new DMS report pages (automated conversion)

> **File structure (since 2026-07-13)**: this file holds (1) the current-state summary, (2) a
> one-line-per-round ledger, (3) the CURRENT round's full detail, and (4) the durable reference
> sections at the bottom. Full round-by-round history for rounds 1–33 lives verbatim in
> [old-reports-conversion-archive.md](./old-reports-conversion-archive.md) — grep it for
> `**Round N` when you need a specific round's detail. **Keep this file lean**: when a new round
> starts, move the previous round's full text to the top of the archive, leave a ledger line here,
> and fold anything durable into the summary or reference sections.

## Current state (2026-07-13, end of round 34)

**What this is**: `scripts/convert_old_reports.py` converts old `admin2.reports` (868 total) into
new DMS report pages (pattern `npmrds_sub`), template-driven and repeatable. Goal = conversion
*capability*, not bulk conversion; reports are picked by gap coverage. `scripts/census_old_reports.py`
measures corpus-wide coverage by importing the converter's own analyze branches (it must be
extended whenever the converter grows a new branch — it went stale twice by round 27).

**Coverage** (round-27 census, 2026-07-10, the latest full run): 46 full / 559 partial / 249 none /
14 no_graphs; 1,937/7,098 graph instances mapped (27.3%). Stale again — rounds 29 (Route Bar Graph
missing resolutions), 31 (Info Box resolution false positive), 32 (avgHoursOfDelay), 34 (Bar
Graph Summary speed), and 36 (Bar Graph Summary travelTime/hoursOfDelay/avgHoursOfDelay, ~307
instances) all added coverage since. Rerun: `python3 scripts/census_old_reports.py`
(~40s, read-only).

**Standing user directives (all still in force)**:
- **Strategic frame (2026-07-13 — read this first, it overrides "fidelity first" instincts)**: the
  end product of this task is a **catalog of graph templates PLUS the selection vocabulary that
  generates them** — sufficient for a future UI where an author starts from the blank Report Page
  page template and composes routes + graph components via *native DMS* edit/view/publish/layout
  flows (very much like the old tool, but rolled into dms). The old corpus (868 reports AND the
  216 `admin2.templates` — useful both as full report-page templates and as extra
  graph-instance training data; surveyed 2026-07-13, see Key durable facts: ~93% a vocabulary
  subset of the reports corpus) defines the vocabulary's scope; `census_old_reports.py`'s
  coverage matrix is the empirical enumeration of that selection space. Conversion fidelity is a
  means, not the end. **Prioritize vocabulary breadth** (every graph-type × measure × resolution
  cell real reports use getting SOME spec entry) **over numeric depth**. Never mint a template
  that can't be described by `TEMPLATE_SPECS` parameters — an irregular need means growing a
  dimension, not hand-crafting.
- **Formula work: feasibility yes, fidelity later (2026-07-13)**. A new measure needs ONE
  canonical, parameterizable, spec-governed expression that is plausibly correct. Exhaustive
  old-tool ground-truthing (round-35-style 184-value checks) is NOT the default bar — reserve it
  for when a new *platform mechanism* is unproven. Calculations can be adjusted later; drift
  detection makes re-stamping cheap.
- **Lazy reconvert (2026-07-13)**: when a canonical expression/spec improves, update
  `TEMPLATE_SPECS` only. Already-converted test pages pick up the fix whenever they're next
  reconverted for a real reason — NO proactive sweeps or multi-report re-verification of old
  test/iteration pages. Carve-out (user's own): forward-breaking issues (crashes, actively
  misleading demo pages) do warrant a sweep. Full-corpus verification passes only on request.
- **ALL data issues are out of scope** (pre-2017 coverage, pm3 backfill, route catalog) until
  functionality is much further along — gap-log for attribution only, never prioritize fixes
  (round 34).
- **Show the plan and get explicit confirmation before any large implementation chunk** (round 24
  process rule).
- **Ship shared-platform changes isolated** from conversion-script work
  ([[feedback_isolate_shared_code_changes]]).
- No destructive actions against OLD sources/ClickHouse; new converted pages are fair game
  ([[feedback_destructive_action_scope_npmrds]]).
- The 5 reopened types — Route Map, Bar Graph Summary, Route Difference Graph, TMC Difference
  Grid, `overrides.baseSpeed` — are in-scope targets (round 24 reversed the earlier "permanent
  gap-log" ruling). Route Map is likely much bigger than the others; read `RouteMap.jsx` for real
  before scoping it.
- The legend/flex **width-squeeze platform fix stays PARKED** (mechanism pinned in round 34:
  unconstrained flex legend sibling + full SQL string as fallback label).

**Key durable facts** (beyond the reference sections at the bottom of this file):
- Fact table `npmrds.s583_v982_NPMRDS_V6` (src 583 / view 982, env npmrds2): travel-time columns
  are plain Float64, **0 = missing** — every measure expression must `nullIf(col, 0)` (rounds
  9/23/28).
- Templates are minted by `ensure_graph_templates` from `TEMPLATE_SPECS`
  (`scripts/convert_old_reports.py`); drift detection replaces the whole yAxis dict (incl. `fn`)
  and compares display patches. `load_graph_templates()` needs `--limit 1000` (round 33 bug).
- Reliability (LOTTR/TTTR/freeflow `speed_pctl_85`) comes from pm3 source **1410** per-tmc-year
  via the `pgFederated` inline join (round 16); per-report join year via `graph_max_year`
  (round 19); per-comp peak BIN selection (round 21). Product decision: "surface
  current/correct," not old-math replicas (round 17).
- comparisonSeries arms are isolated queries; cross-arm references need `__ANCHOR__(...)`
  (round 25). `categorize:"tmc"` templates are the unfiltered-scan hazard class — tmc-less routes
  get `graphIds: []`, and reports with zero valid routes produce no page at all (round 33; see
  `clickhouse-unfiltered-probe-hazard.md`).
- **`admin2.templates` surveyed (2026-07-13, read-only —
  `scratchpad/npmrds-sub/old-reports/templates_survey.json`)**: as graph-instance training data
  the 216 templates are ~a subset of the reports corpus — 2,466 graph instances across 144
  distinct (type × measure × resolution × dataColumn) cells, 134 of which already occur among the
  reports' 261 cells. Only 10 template-only cells (29 instances), all singletons except **Bar
  Graph Summary × freeflow × 5-minutes ×15** (folds into next-step (c)'s freeflow work — note
  it's plain `freeflow`, not `-byDateRange`; check against round 34's Phase A/B measure list).
  Structurally they're ordinary report shells: real `routeId` strings (1,723 comps), `routes` =
  slot count (1–9, mode 1), zero station usage, `default_type` all none/NULL — the existing
  conversion pipeline covers them whenever full-template conversion becomes relevant (authoring
  UI era). No pivot warranted; they don't reorder the vocabulary-breadth priorities.
- Old-tool speed/travelTime semantics are TWO-LEVEL (per-TMC mean, then compose across TMCs by
  miles) — flat-expressible in CH via map combinators with `fn:"exempt"`. **Backported to every
  live speed/TT template in round 35** (the pre-backport `avg(SPEED_EXPR)` was +13% off; TT was
  wrong quantity AND scale). Travel time now renders route traversal MINUTES, not per-segment
  seconds.

**Immediate next steps** (round 34 "Not done / next", order user-endorsed):
- [x] **(a) DONE (round 35): the SPEED_EXPR/TRAVEL_TIME_EXPR backport** to all live
  speed/travelTime templates — see Round 35 below (all 16 templates updated, 15 reports
  reconverted + live-verified, 184 live values ground-truthed exactly, 471 deleted per round-33
  policy).
- [x] (b) DONE (round 36): remaining Phase A Bar Graph Summary measures (travelTime /
  hoursOfDelay / avgHoursOfDelay incl. its per-resolution derivation) — built; 787/320 converted
  + 1061 reconverted; 15/15 live values ground-truthed exactly; weekday variant spec-only
  (validated offline, lone instance = report 1028).
- [ ] (c) Phase B (avgTT-byDateRange alias + freeflow-byDateRange via pm3 1410).
- [ ] (d) Per-route bar colors decision (double-`__series` trick untried) — deprioritized
  2026-07-13 (cosmetic parity; ranks below any vocabulary-breadth work).
- [ ] (e) Round 33's corpus-wide safety re-scan: any other `route_missing_everywhere` ×
  `categorize:"tmc"` combos; any other already-converted report that is 100%
  route_missing_everywhere and should be deleted.

## Round ledger (rounds 1–35 archived — full detail in [the archive](./old-reports-conversion-archive.md))

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

## Round 36 (2026-07-13) — CURRENT ROUND, IN PROGRESS: Bar Graph Summary Phase A completion (item (b))

**Objective (round 34's item (b), user-directed this session)**: the remaining Phase A Bar Graph
Summary measures — travelTime / hoursOfDelay / avgHoursOfDelay — including avgHoursOfDelay's
per-resolution derivation. Same one-bar-per-arm summary shape round 34 proved for speed
(xAxis `__series`, `categorize: False`, `legend.show=False`).

**Derivation (old sources read directly: `BarGraphSummary.jsx` + `utils/dataTypes.js` +
avail-falcor `getHoursOfDelay.js`/`queryHelpers.js`)**:
- Summary value per arm = the measure's `allReducer` over the per-(tmc, resolution-bucket) rows
  the old server returned (`route.data[key]`).
- **travelTime**: `allReducer = travelTimeAllReducer` = per-TMC mean of bucket values → sum
  across TMCs → minutes — the EXACT two-level fold `TRAVEL_TIME_EXPR` already implements
  (same unification argument as round 34/35's speed summary; equal-bucket-weights approximation
  identical to the one round 35 ground-truthed). Template = TRAVEL_TIME_EXPR verbatim, fn
  "exempt". Resolution-irrelevant.
- **hoursOfDelay**: `allReducer = sumReducer` — sum over buckets of bucket sums = plain
  `sum(DELAY_EXPR)`, fn "sum"; bucket structure cancels, resolution-irrelevant (round 34's
  scoping already called this the EXACT-match case).
- **avgHoursOfDelay**: `allReducer = meanReducer` — plain mean over the per-(tmc,bucket) rows of
  `avgHoursOfDelay` = bucket delay sum ÷ resolution-specific divisor (getAvgHoursOfDelay's 5
  branches ≈ "# dates contributing rows to the bucket", round 32's derivation). The summary is
  therefore a TWO-LEVEL fold whose inner grouping key is resolution-dependent — the bucket key
  per resolution (queryHelpers.getResolution): 5-minutes → epoch (across dates), day → date,
  weekday → day-of-week. Flat CH expression via a composite (tmc|bucket) map key:
  `arrayAvg(arrayMap((s, d) -> s / d,
    mapValues(sumMap(map(concat(ds.tmc, '|', toString(<bucket>)), coalesce(<DELAY inner>, 0)))),
    mapValues(uniqExactMap(map(concat(ds.tmc, '|', toString(<bucket>)), ds.date)))))`
  — ONE parameterized expression for every resolution (bucket expr is the only parameter),
  fn "exempt". `coalesce(...,0)` is load-bearing twice: (1) sumMap/uniqExactMap key sets stay
  aligned even for all-missing buckets (Map values can't be Nullable; a dropped key would
  misalign the element-wise division), and (2) it reproduces the OLD tool's semantics exactly —
  missing-reading rows (tt=0) contributed delay 0 AND counted toward the bucket's divisor there
  too.
- **Offline validation — DONE (`validate_avg_delay_summary.py`, session scratchpad)**: on report
  787's three real arms (routes 5419/5418 × 2020/2021, epochs 84-228): flat == two-step GROUP BY
  ground truth at machine precision (worst rel 1.6e-15) for ALL of 5min/day/weekday; mapKeys
  alignment 1 everywhere; `uniqExactMap`/`sumMap(map(String,Float64))` confirmed available on
  the live server.
- **Deliberate divergence from the old tool at weekday grain (documented, not a bug)**: the old
  divisor is `numEpochs/epochsInTimeRange` (raw ROWCOUNT-based) — on sparse data it counts
  missing rows' epochs and OVERSTATES the per-date average (measured on the 787 fixture: old
  +283%/+67%/+8.8% vs distinct-dates, per arm). We use `count of DISTINCT dates` — the divisor
  round 32 already canonicalized for every bucket-grain avg-delay template, and the
  "surface correct, not old-math replicas" round-17 precedent. At 5-minutes and day grain the
  two are IDENTICAL (0.00% drift, proven on all fixture arms) — which covers 75 of the 76
  convertible real instances.

**Corpus survey (this round, converter's own analyze_graph over all 868 reports)** — Bar Graph
Summary instances for the three measures, by resolution:
- travelTime: 104 × 5-minutes, 1 × 15-minutes, 1 × day, 1 × weekday (+7 mixed-resolution → None,
  stay gap-logged). All → ONE template (resolution-irrelevant).
- hoursOfDelay: 126 × 5-minutes, 6 × day (+8 None). All → ONE template.
- avgHoursOfDelay: 63 × 5-minutes, 12 × day, 1 × weekday (+18 None — resolution genuinely
  changes this measure, so mixed-resolution ambiguity stays a REAL gap, unlike the
  resolution-irrelevant measures).
- **Report 678 ("Avg Hours of Delay Test", round 34's flip list) is a `no_valid_routes` shell**:
  its only route 5152 is missing from BOTH admin2.routes and the new catalog
  (route_missing_everywhere) — it can never produce a page; feeds next-step (e)'s re-scan.
  Round 34's "10 reports flip to FULL" count is off by at least this one.

**Plan (code, `scripts/convert_old_reports.py`)**:
- [x] New expression builder `_avg_delay_summary_expr(bucket_expr)` + three constants
  (5min/day/weekday variants).
- [x] TEMPLATE_SPECS: `tmc_travel_time_summary_bar_graph` (TRAVEL_TIME_EXPR, no join override),
  `tmc_delay_summary_bar_graph` (DELAY_EXPR fn "sum", 1946+aadt_dist join),
  `tmc_avg_delay_summary_bar_graph_{5min,day,weekday}` (new exprs, fn "exempt", same join) —
  all in the round-34 summary shape, customName on every one.
- [x] GRAPH_TEMPLATE_MAP: 9 new ("Bar Graph Summary", measure, resolution, "travel_time_all")
  keys per the survey above.
- [x] Demo conversions: **787 → page `2190210`** (minted tmc_travel_time_summary_bar_graph +
  tmc_avg_delay_summary_bar_graph_5min), **320 → page `2190225`** (minted
  tmc_delay_summary_bar_graph; TT summary reused). **1061 reconvert BLOCKED on a stale auth
  token** — `dms raw delete` fails with "Authentication required to delete items" (log-confirmed;
  the delete aborted BEFORE removing anything, page 2189943 fully intact). Fix: user runs
  `scratchpad/npmrds-sub/mint_token.sh`, then rerun
  `python3 scripts/convert_old_reports.py --report-id 1061 --replace` (dry-run already clean:
  would mint tmc_avg_delay_summary_bar_graph_day, 5 graphs, known gaps only). Weekday variant
  ships spec-only (validated offline; report 1028 is its lone instance, left for a later
  conversion).
- [x] Live verification (787 + 320, Playwright networkidle + settle):
  - Zero console errors; only non-200 is the benign `/track/visit` 204. All summary fetches 200 —
    the lambda `(s, d) -> s / d` + `uniqExactMap` expression survives the whole platform SQL path
    (first lambda-bearing calculated column in the catalog).
  - **Ground truth 12/12 EXACT** (independent two-step SQL per arm using each arm's captured
    filterGroups — tmc/date/epoch lists): 787 avg-delay summary ×4 arms + TT summary ×4; 320
    delay summary ×2 + TT summary ×2. Worst relative error 2.49e-15. (One initial "FAIL" was a
    script artifact — the day-bucketed Route Bar Graph shares the delay expression and got
    misclassified as a summary; filtered on `ungroupedAggregate` + groupBy `__series`.)
  - Screenshots: all three new summary graph types render correct bars (320's delay summary shows
    the Rexford bridge 4× delay drop 2017→2018; TT 8.8→6.5 min; sane magnitudes everywhere).
- [x] **Pre-existing width-squeeze CONFIRMED page-wide, not a round-36 regression**: 787's two
  avg-delay LINE graphs (round-32 template, untouched) render squeezed — SVG w=21-35px with the
  full plot inside (145 rects/151 texts); control probe on report_1071 (round-35-verified) shows
  the SAME squeeze TODAY (line/grid SVGs at w=0-4px). Data layer fine (fetches 200, values
  verified). This is the PARKED round-34 legend/flex mechanism — every squeezed SVG sits next to
  a VISIBLE legend, and the new summary templates escape it precisely because their specs set
  `legend.show=False`; wide (size-12) sections with legends render fine (320's day bar graph).
  Strong evidence this is also the user's logged "axis labels not visible on any report" issue
  (Known functionality gaps) — the axis text is rendered but squeezed to invisibility. Stays
  PARKED per standing directive; logged here as diagnosis, not fixed.
- [x] Census: no new analyze branch (map/spec additions only), so census_old_reports.py picks the
  new keys up automatically — no extension needed this round.
- [x] AFTER TOKEN REFRESH (user minted it): 1061 `--replace` reran clean → **new page `2190527`**
  (old 2189943 deleted; gap report identical to the dry-run, 18 known items). Playwright: zero
  console errors, all fetches 200. **Day-variant ground truth 3/3 EXACT** (worst rel 8.15e-16):
  2018-day 5.221 / 2023-day 8.713 / all-time 8.706 (the 2016 slice of the all-time arm is
  pre-coverage and contributes nothing, as expected — 2017-2023 dominates). Screenshot: both new
  summary sections render full-width bars; day bar graphs fine; TMC grid body squeezed (the same
  parked legend/flex issue). **Round-36 verification total: 15/15 live summary values match
  independent two-step SQL at machine precision.**

**Round 36 — DONE.** Loose ends folded forward: weekday avg-delay summary variant is spec-only
(offline-validated, no live report yet — report 1028 is its lone instance); report 678 confirmed
route_missing_everywhere (feeds item (e)); the width-squeeze diagnosis is recorded in Known
functionality gaps via the round-36 notes (platform fix stays PARKED).

**Expected render state (for user verification)**:
- **report_787 (page 2190210, http://npmrds.localhost:5173/report_787 on the npmrds subdomain)**:
  4 sections. "R5 HELP ROUTES Y2Y DELAY ANALYSIS" (avg-delay summary, 4 bars ~0.008/0.010/0.076/
  0.027) and "R5 Y2Y TRAVEL TIME ANALYSIS" (TT summary, 4 bars 0.83/2.05/10.37/10.69 min) render
  fully. The two per-route "Y2Y DELAY ANALYSIS" LINE sections have verified data but render
  squeezed to ~30px (pre-existing parked flex issue above) — they look blank-with-legend. Old
  Route Map + Route Info Box sections intentionally absent (unmapped / reliability-bin
  undetermined gaps).
- **report_320 (page 2190225)**: 5 sections. "HOURS OF DELAY" (delay summary: 44,600 vs 11,296),
  "AVG SPEED" (18.8 vs 26.0 mph), "TRAVEL TIME" (8.8 vs 6.5 min), "2017-2018 HOURS OF DELAY BY
  DAY OF YEAR" (day bar, full-width, renders fine) all good; "2018 - DIRECTION OF TIME..." (TMC
  grid) shows its color legend with the grid body squeezed (same parked issue). Route Line/Map/
  second grid/freeflow summary/Info Box intentionally absent (mixed-resolution, unmapped,
  Phase B, pm3-coverage gaps).
- **report_1061 (page `2190527`, reconverted)**: "BAR GRAPH SUMMARY, AVG. HOURS OF DELAY" (3 bars
  5.22/8.71/8.71 — the 2023 and all-time arms are legitimately near-equal) and "BAR GRAPH
  SUMMARY, SPEED" (3 bars ~32-34) render; both day-resolution Route Bar Graphs render full-width;
  the TMC Grid section shows only its color legend (parked squeeze); Route Line/Maps/TMC
  Difference Grid/Info Box intentionally absent (mixed-resolution, unmapped, bin-undetermined
  gaps, same as round 35).

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
- **Live page verification**: `node scripts/report_probe.mjs <slug>` (repo root of dms-template) —
  single parameterized Playwright harness replacing the old one-off scratchpad scripts. One load
  collects console/page errors, non-200s, pending-at-close requests (hung/unbounded-query
  tripwire), decoded `/graph` traffic (`--grep` to filter), per-section SVG census, full-page +
  `--section` screenshots, JSON dump to `scratchpad/npmrds-sub/tmp/probe_<slug>.{png,json}`.
  Custom probes via `--eval file.mjs` (`export default async (page) => ...`); if the same eval
  probe is needed twice, promote it to a flag in the harness instead of forking.

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
- **Axis labels not visible on any report (user-reported 2026-07-13, NOT investigated — logged
  only, per user)**: user cannot see an axis label at all, on any report. Not blocking. User
  offered a screenshot if needed when this gets picked up. Possibly related to the PARKED
  legend/flex width-squeeze platform issue (round 34), possibly independent — unverified either
  way.
- **Route Compare anchor row ordering still inconsistent (user-reported 2026-07-13, NOT
  investigated — logged only, per user)**: recurrence/incomplete fix of the round-26 user-caught
  anchor-row bug. User saw the anchor row render in the MIDDLE of the table once (anchor was
  2021 and the table sorted by year, so the ordering had a cause) — but the anchor row must
  always be first. Likely suspect from the round-26 archive notes:
  `RouteCompareComponent.jsx`'s `renderGraph` does `graphData.slice(0,1)` — i.e. assumes the
  anchor is row 0 rather than identifying it, so any data-driven sort order breaks it. Unverified.

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
