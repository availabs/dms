# Old NPMRDS reports → new DMS report pages (automated conversion)

> **File structure (since 2026-07-13)**: this file holds (1) the current-state summary, (2) a
> one-line-per-round ledger, (3) the CURRENT round's full detail, and (4) the durable reference
> sections at the bottom. Full round-by-round history for rounds 1–37 lives verbatim in
> [old-reports-conversion-archive.md](./old-reports-conversion-archive.md) — grep it for
> `**Round N` when you need a specific round's detail. **Keep this file lean**: when a new round
> starts, move the previous round's full text to the top of the archive, leave a ledger line here,
> and fold anything durable into the summary or reference sections.

## Current state (2026-07-14, end of round 40)

**What this is**: `scripts/convert_old_reports.py` converts old `admin2.reports` (868 total) into
new DMS report pages (pattern `npmrds_sub`), template-driven and repeatable. Goal = conversion
*capability*, not bulk conversion; reports are picked by gap coverage. `scripts/census_old_reports.py`
measures corpus-wide coverage by importing the converter's own analyze branches (it must be
extended whenever the converter grows a new branch — it went stale twice by round 27; round 38
added the `INFO_BOX_TRAVELTIME_BUCKET` and `BAR_SUMMARY_PM3_BUCKET` mirrors for Phase B; round 39
added the `pre_2017_only` report-level exclusion; round 40 added `INFO_BOX_LENGTH_BUCKET`/
`INFO_BOX_AADT_BUCKET`/`INFO_BOX_DELAY_BUCKET` mirrors and a `graph_comps[].id` synthetic-fallback
fix, see below).

**Coverage** (round-40 census rerun, 2026-07-14, CURRENT): raw (unfiltered) 102 full / 636 partial
/ 116 none / 14 no_graphs; 4,186/7,098 graph instances mapped (59.0%, up from round 27's 27.3%).
Unmapped 2,912 = buildable 1,032 / no_equivalent 1,733 / tail 147. **These raw numbers overstate
what's achievable — 133/868 reports (15.3%) are `pre_2017_only` (every route_comp's date range
predates 2017-01-01, `npmrds.s583_v982_NPMRDS_V6`'s real coverage start — never getting that data
back). Excluding them: only 60 full (not 102), 560 partial, 101 none, 14 no_graphs; 3,856/6,520
mapped (59.1%, essentially the same instance-level ratio — the inflation is almost entirely in the
report-level "full" count, not the mapped %).** NEW report-level dimension (round 37): only 32
reports have a route with a ready tmc_array; 612 hinge on convert-time falcor point-resolution
(fine in practice — 787's routes were this kind); **213 are `no_valid_routes` shells** (every
referenced route deleted from admin2.routes AND absent from the catalog — broken in the OLD tool
too, can never produce pages); 11 have no routes at all. `full_producible` (full AND not a shell
AND not pre-2017-only): **48** (unchanged from round 39 — round 40's new mapped instances didn't
happen to flip any report all the way to full). `converted_pages_total`: **26** (21 after round
40's cleanup + 5 live-verification test conversions this round: 181/965/33/179/775).
`pre_2017_converted_pages`: **[]** (empty). Rerun: `python3 scripts/census_old_reports.py` (~40s,
read-only).

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
- **Pre-2017 data is a permanent exclusion, not just a gap-log note (2026-07-14, round 39)**:
  never spend conversion/template effort on routes whose data predates 2017
  (`npmrds.s583_v982_NPMRDS_V6` starts 2017 — that data is never coming back). A report where
  EVERY route_comp is pre-2017-only is refused a page outright
  (`report_is_pre_2017_only`/`pre_2017_only` gap kind, mirrors `no_valid_routes`). Coverage/flip/
  greedy metrics in the census exclude these reports from the achievable-target denominators (or
  show a parallel set that does) — see the Coverage line above and `census_summary.md`'s
  "Pre-2017-only reports" section. Mixed reports (some pre-2017 comps, some not) still convert;
  only the fully-blocked case is skipped.
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
- **A joinless query never aliases the base table as `ds` at all** (round 38: `dms-server`
  `routes/uda/query_sets/clickhouse.js`'s `` `${table_schema}.${table_name} ${hasJoin ? ' as ds '
  : ''}` `` — the alias itself is join-gated, not just qualification of ambiguous columns). Any
  bespoke template-minting function that builds `state` from scratch (rather than deep-copying
  `base_state`, which carries the base's own default TMC-Identification join forward for free)
  MUST explicitly carry a join forward — even a harmless, unused one — or every `ds.`-qualified
  calculated column 500s with "Unknown expression identifier". Caught live building
  `ensure_info_box_traveltime_template`; not a platform bug, a construction bug in that one
  function.
- 1410 (pm3) has **no avg-travel-time column of any kind** (round 38, confirmed directly against
  `s1410_v3425_pm_3`'s 121 columns — only speed percentiles, LOTTR/TTTR, PHED/TED). Any measure
  resembling "average/plain travel time" is CH-only (`TRAVEL_TIME_EXPR`), never a pm3 join,
  regardless of how "reliability-adjacent" it sounds.
- Reads and updates work unauthenticated on split (`:data`) rows too via `dms raw update <id>`
  (confirmed live, round 38) — only `dms raw get <id>` fails to resolve them (returns all-null;
  use direct `psql_new` reads or `dms raw update <id> --set k=v` instead) and only `delete` needs
  `DMS_AUTH_TOKEN` (500s "Authentication required to delete items" otherwise).
- **`admin2.reports.graph_comps[].id` is missing for 96% of the corpus (round 40)** — the
  documented old shape (`id: 'graph-comp-N'`) is real for only the first two ever-converted
  reports (1070/1071); everything else, including most already-shipped pages, has `id: None` on
  most/all of its graph_comps. `convert_report` now assigns a synthetic `graph-idx-{i}` (array
  position) fallback right before any gid-keyed dict is built, fixing a real silent
  template-misassignment bug this caused whenever a report had multiple Info Box/Route
  Compare/Bar Graph Summary pm3 graphs needing different dynamic resolutions (they collided on
  `id: None` and the last-processed one silently overwrote the rest — new-side section/trackingIds
  were always fine, the bug was purely in the old-side analysis-phase bookkeeping). Fix is
  fix-forward only per the lazy-reconvert policy — no proactive resweep of old pages, though some
  may carry a latent version of this same bug undiscovered.
- **A CH query still scans the full FROM/JOIN chain even when the SELECTed calculated column
  never touches a fact-table value** (round 40, observed on `length`/`aadt`'s TMC-attribute-only
  expressions): a route/comp whose date range predates 2017 still returns zero rows for a `length`
  or `aadt` query, exactly like any other measure, even though `table1.miles`/`table1.aadt` are
  static per-TMC join columns with no date dependency at all — because the query is still
  fundamentally `FROM ds JOIN table1 WHERE ds.date IN (...)`, and `ds` (the 583/982 fact table)
  has no rows in that range. Not a bug — a real, load-bearing consequence of every AVL Graph query
  sharing the same date-filtered-fact-table shape regardless of which columns it ultimately reads.

**Immediate next steps** (round 34 "Not done / next", order user-endorsed):
- [x] **(a) DONE (round 35): the SPEED_EXPR/TRAVEL_TIME_EXPR backport** to all live
  speed/travelTime templates — see Round 35 below (all 16 templates updated, 15 reports
  reconverted + live-verified, 184 live values ground-truthed exactly, 471 deleted per round-33
  policy).
- [x] (b) DONE (round 36): remaining Phase A Bar Graph Summary measures (travelTime /
  hoursOfDelay / avgHoursOfDelay incl. its per-resolution derivation) — built; 787/320 converted
  + 1061 reconverted; 15/15 live values ground-truthed exactly; weekday variant spec-only
  (validated offline, lone instance = report 1028).
- [x] (c) DONE (round 38): Phase B — avgTT-byDateRange alias (B1) + Route Info Box
  avgTT-byDateRange static template (B3, all 38 predicted flips materialized) + Bar Graph Summary
  freeflow-byDateRange pm3 template (B2, mechanism proven, but the real corpus's 62 instances are
  all pre-2019-dated — outside 1410's 2021-2025 coverage, so 0 real flips today). See Round 38.
- [ ] (d) Per-route bar colors decision (double-`__series` trick untried) — deprioritized
  2026-07-13 (cosmetic parity; ranks below any vocabulary-breadth work).
- [x] (e) DONE (round 37, deletion executed round 39): census now mirrors the round-33
  report-level rule corpus-wide — 213 `no_valid_routes` shells enumerated; scan-hazard sweep of
  all pre-round-35 pages found ZERO empty-tmc routes wired to graphs; the only converted shell
  page was 874 → `2188794` (no hazard, graphIds all empty) — **deleted round 39** (minted the auth
  token myself, user-authorized; `converted_pages_total` 26→25).
- [ ] (f) NEW (round 38) — highest remaining lever per the fresh census: **Route Map speed×5-min**
  (481 instances, **55 flips** — by far the single biggest lever in the corpus). Not scoped yet;
  read `RouteMap.jsx` for real before sizing it (round 24's standing caution: likely much bigger
  than any Phase A/B measure). **SCOPED round 41 (2026-07-14)** — see
  `scratchpad/npmrds-sub/old-reports/route_map_scope.md`; awaiting endorsement to start
  Phase 1 (`MapGraph`).
- [x] **(g) DONE (round 40)**: report 745's leftover broken test section deleted (draft
  `2190567`/published `2190568`); report 191 reconverted for real via `--replace` (new page
  `2190581`, dropping the forced-`graph_max_year=2023` demo — see Round 40 below).
- [x] **(h) DONE (round 40)**: all 4 pre-2017-only converted pages deleted (user: "get rid of
  permanently blank reports," applied uniformly — including report 58's page, despite round 39's
  hedge that it "arguably doesn't need the same treatment," since it's genuinely `pre_2017_only`
  same as the other 3): 16 → `2190009`, 54 → `2189409`, 58 → `2190556`, 142 → `2189993`. Census
  confirms `pre_2017_converted_pages: []`, `converted_pages_total: 21`.

## Round ledger (rounds 1–39 archived — full detail in [the archive](./old-reports-conversion-archive.md))

- **R41** (07-14): Route Map SCOPED, no code (read old `RouteMap.jsx` for real + corpus
  survey: 849 instances/636 reports; measures speed 655 / none 97 / travelTime 44 / delay 35 /
  pm3-gated 17; resolution query-irrelevant except avgHoursOfDelay). Key find: per-TMC geometry
  is ALREADY reachable as a column through the default 455/3464 join (`wkb_geometry` — misnamed,
  actually GeoJSON MultiLineString text), so rows arrive `{__series, tmc, value, geometry}`
  through the existing pipeline — no tiles/new fetch layer. Plan: new `MapGraph` AVL Graph type
  (Phase 1, platform, ship isolated) reusing Map-section internals (choroplethPaint/LegendPanel/
  AvlMap, client-side breaks), then converter speed+none (78 achievable full flips), then
  remaining measures (90 flips total; full_producible 48→~130). Existing "Map"/"Map: Dama"
  sections vetted and ruled out as host: tile-server `join=` param unimplemented
  (avail-falcor tiles route reads only cols/filter), `colorDomain` PG-only vs CH data, filter
  sync ignores action-type filters (no ReportRouteList binding), tiles year-pinned to
  2024/2025 networks. Full scope + vetting detail:
  `scratchpad/npmrds-sub/old-reports/route_map_scope.md`. Awaiting endorsement before Phase 1.
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

## Round 40 (2026-07-14) — CURRENT ROUND: cleanup (g)+(h) + Info Box `length`/`travelTime`/`aadt`/`hoursOfDelay` + a real gid-collision bug fix

**Objective (user-directed this session)**: "do the cleanup, get rid of permanently blank
reports" — close out the two remaining round-38/39 cleanup items: (g) report 745's leftover
broken test section + report 191's forced-2023 mechanism-proof page, and (h) the 4
already-converted pages the round-39 census found to be pre-2017-only.

**Execution**: wrote `scratchpad/npmrds-sub/cleanup_round40.py` (imports `dms`,
`delete_converted_page`, `COMPONENT_TYPE` from `convert_old_reports.py`) and handed the exact
invocation to the user to run via `!` — per standing policy this session's auto-mode classifier
blocks running `mint_token.sh` (or anything else that embeds/consumes a live credential) directly,
even though round 39 got a one-off authorization; that didn't carry forward as a standing
permission ([[feedback_credential_bearing_commands]]). User ran it; all three actions verified
independently afterward via read-only `dms raw get` / direct psql reads (not just taking "looks
good" at face value, per [[feedback_verify_the_actual_mechanism]]):

- **(g)-1 report 745**: broken test section removed from both `sections` (published id `2190568`)
  and `draft_sections` (draft id `2190567`, which had somehow ended up duplicated in the array —
  the filter removed both copies) on page `2190543`, then both component rows deleted. Confirmed:
  `dms raw get` on both ids now returns all-null; page's section lists show only the 5 real
  sections on each side.
- **(g)-2 report 191**: reconverted for real via `convert_old_reports.py --report-id 191
  --replace`, deleting the old forced-`graph_max_year=2023` demo page (`2190569`) and creating a
  new one, `2190581`. Gap report confirms it correctly gap-logs a pm3-coverage-limited measure
  against report 191's real max year (2017, outside 1410's 2021–2025 coverage) instead of faking
  data — same class of legitimate gap as round 38's B2/B3 findings, not a regression.
- **(h) pre-2017-only pages**: all 4 flagged pages deleted via `delete_converted_page`: report 16
  → `2190009`, 54 → `2189409`, 58 → `2190556`, 142 → `2189993`. **Judgment call**: round 39 hedged
  that page 58 (round 38's B3 mechanism-proof demo) "arguably doesn't need the same treatment as
  the other 3" since it wasn't a surprise finding — but the census confirms it's genuinely
  `pre_2017_only: true` same as the others, and the user's instruction this round ("get rid of
  permanently blank reports") was categorical, so it was included. Flagged to the user in case
  they'd rather have kept it as a documented proof-of-concept; no objection raised.

**Census rerun to confirm** (868 reports, 0 errors, ~unchanged corpus-analysis numbers since none
of this touches `admin2.reports`): `pre_2017_converted_pages: []` (was 4), `converted_pages_total:
21` (was 25 — net −4 from the pre-2017 deletions; report 191's replace is a net-zero delete+create
on this count). All other coverage numbers (101/635/118/14 raw, 59/560/102/14 excl. pre-2017,
58.1%/58.3% mapped, `full_producible` 48) unchanged from round 39, as expected.

**Part 2 — the Info Box measure remainder (user picked this after I corrected my own bad
suggestion)**: I'd originally suggested "do the Info Box" as the next high-leverage/cheap item,
reading the census's raw ranked-unmapped table at face value (268/166 "Route/TMC Info Box speed"
instances). Before implementing I actually traced the mechanism and that read was wrong: Info Box
`speed` is the ALREADY-BUILT LOTTR/TTTR/Freeflow reliability bucket (rounds 18-22), gated by
1410's real 2021-2025 coverage + 4-bin granularity — a diagnostic script over the full corpus
showed 374/516 instances fail on year-out-of-range and 140/516 on bin-ambiguity, only 2 already
work (both already converted). That lever is a permanent data-coverage wall, same class as round
38's B2 finding, not a capability gap — I said so and the user picked the smaller genuine
remainder instead: TMC-attribute measures inside Info Box that were never built at all.

**Built** (`convert_old_reports.py`): 4 new measure buckets alongside the existing
`INFO_BOX_BUCKET`/`INFO_BOX_TRAVELTIME_BUCKET`, all bin/year-independent (static templates, same
shape family as round 38's `ensure_info_box_traveltime_template`):
- **`travelTime`** (plain, not `-byDateRange`) — folded into the EXISTING `avgTT-byDateRange`
  bucket/template (now `INFO_BOX_TRAVELTIME_BUCKETS`, a set of two `(measure, dataColumn)` keys
  mapping to the same `{grain}_info_box_traveltime` template): old dataTypes.js's plain `travelTime`
  key has no `group`, so `RouteInfoBox.jsx` routes it through `allReducer` — the identical
  two-level per-tmc-mean-then-sum-across-tmcs semantics `avgTT-byDateRange` was already aliased to
  in round 38. Genuinely free — no new template, no new query, one extra bucket key. 24 real corpus
  instances.
- **`length`** — new `ensure_info_box_length_template` (via a new shared
  `_ensure_static_info_box_template` helper, see below), `LENGTH_EXPR` reusing SPEED_EXPR's own
  proven distinct-tmc `arraySum(mapValues(maxMap(map(ds.tmc, table1.miles))))` combinator (route
  grain: total route miles, summed once per distinct TMC, not per fetched row) off the base
  template's own default join (TMC Identification 455/3464 — already carries `miles`). 26 real
  corpus instances (only 1 is route-grain, and that one lone report is itself pre-2017-only — see
  Part 1 above — so it's spec-describable but has zero live-testable corpus instances at that
  grain).
- **`aadt`** — new `ensure_info_box_aadt_template` (same shared helper), `AADT_EXPR` = unweighted
  mean AADT across the route's distinct TMCs (`arrayAvg` version of the same combinator) — old
  `meanReducer` semantics. `overrides.aadt`'s own dedicated override mechanism (a DIFFERENT
  substitution shape than the delay/CO₂ one `AADT_OVERRIDE_SUBS` already covers) deliberately not
  wired — zero real corpus overlap between `overrides.aadt` and an Info Box `aadt` graph, and the
  existing generic "table1.aadt in stateJson" detection still correctly gap-logs
  `aadt_override_not_applied` rather than silently drop it, if that ever changes. 5 real corpus
  instances.
- **`hoursOfDelay`** — new `ensure_info_box_delay_template` (own function, different join than
  length/aadt): the already-proven `DELAY_EXPR` (rounds 4/9/12/23/28/32's weighted-delay
  calculated column, `META_1946_JOIN` + `AADT_DIST_JOIN`), `fn: "sum"` (not `"exempt"` —
  `DELAY_EXPR` is a raw per-epoch quantity, not self-aggregating) grouped by `__series`/`tmc`
  matching old `sumReducer`'s whole-range sum, no per-resolution bucketing needed. 4 real corpus
  instances (2 more are logged `hoursOfDelay`/`dataColumn: "None"` — an ambiguous/missing
  dataColumn, correctly stays gap-logged, same treatment as any other uncovered
  `GRAPH_TEMPLATE_MAP` combination). `dataQuality` (1 instance, "% of epochs reporting" — a
  genuinely new concept, no existing expression anywhere) — **deliberately not built**, per-user
  agreement: a single-instance measure doesn't meet the vocabulary-breadth bar.
- Census mirrors (`census_old_reports.py`): imports + classification branches for all 4 new
  buckets, same pattern as the existing `INFO_BOX_TRAVELTIME_BUCKET`/`BAR_SUMMARY_PM3_BUCKET`
  mirrors.

**Two real bugs found and fixed while verifying, both caught via actual live errors/values, not
assumed:**
1. **TMC-grain `length`/`aadt` nested-aggregate bug (my own new code, caught immediately)**: the
   first version of `_ensure_static_info_box_template` reused the route-grain's self-aggregating
   distinct-tmc combinator expression for TMC grain too (just re-labeled), then wrapped it in an
   outer `fn: "avg"` — ClickHouse rejects an aggregate function nested inside another
   (`ILLEGAL_AGGREGATION`), caught via a real "Error fetching data" browser console error +
   confirmed exact ClickHouseError in `scratchpad/npmrds-sub/dms-server.log`. Fixed: TMC grain
   (already scoped to one TMC per CH group via `categorize: "tmc"`) reads the raw join column
   directly (`LENGTH_TMC_EXPR = "table1.miles as length"`, `AADT_TMC_EXPR = "table1.aadt as
   aadt"`) instead of the combinator. Patched both in code and on the 2 already-created template
   rows (`tmc_info_box_length` id `2190604`, `tmc_info_box_aadt` id `2190645`) via `dms raw update`
   (no auth token needed — only delete requires one).
2. **`graph_comps[].id` collision (pre-existing, dates to round 18, NOT introduced this round) —
   the significant find**: 817/854 corpus reports (96%) have AT LEAST ONE `graph_comps` entry with
   no `id` field at all — the documented old shape (`id: 'graph-comp-N'`) simply isn't there for
   almost the whole corpus, not just the "ancient version 2" reports it was previously assumed
   limited to (confirmed directly: even most already-shipped/verified reports — 787, 58, 191, 745,
   181 — have zero real ids; only the very first two ever converted, 1070/1071, have them). Every
   dynamic per-graph decision (Info Box template choice, Route Compare, Bar Graph Summary pm3
   year) is keyed by `g.get("id")` in an in-memory dict — when a report has MULTIPLE Info Box
   graphs needing DIFFERENT template resolutions and all share `id: None`, they collide on that
   key and whichever is processed LAST silently overwrites every earlier graph's assignment (the
   eventual new-side section/trackingId is unique and unaffected — the bug is purely in the
   analysis-phase bookkeeping, before any new-side id exists). **Live-caught on report 33**: a
   `speed` (reliability) graph and an `avgTT-byDateRange` graph were both silently overwritten
   with the report's unrelated `aadt` graph's template — confirmed directly by dumping the live
   page's sections (both showed "TMC AADT" content instead of their real intended content).
   **User-approved fix** (paused and asked before applying, since this is real scope beyond "the 4
   measures" — [[feedback_show_plan_before_large_work]]): assign a stable, unique-within-report
   synthetic id (`f"graph-idx-{i}"`, array position) to any graph_comp missing one, right before
   any gid-keyed dict is built — in both `convert_old_reports.py` (real fix, prevents
   misassignment) and `census_old_reports.py` (mirrored for gap-log attribution clarity only; the
   census's own classification loop never used a gid-keyed dict so it was never mis-classifying).
   **No proactive reconversion sweep of already-shipped pages** — fix-forward only, per the
   standing lazy-reconvert policy; some earlier pages may carry latent versions of this same
   silent-overwrite bug if they had multiple colliding dynamic-template graphs, but per-report
   verification only happens when a report is next touched for a real reason.

**Live verification (5 test conversions, all reconverted a second time with `--replace` after both
fixes to get a clean final state)**: 181 (`travelTime`, both grains), 965 (`length`+`travelTime`
tmc grain), 33 (`aadt` tmc grain + confirms the collision fix — now shows 3 correctly DISTINCT
sections: "Route Travel Time", "TMC AADT" ×2), 179 (`hoursOfDelay` route grain), 775
(`hoursOfDelay` tmc grain). All 5 probed clean (0 console errors, 0 page errors). Ground-truthed
directly against ClickHouse (not an adjacent proxy check — the exact live-rendered value compared
to a hand-built SQL query using the EXACT tmc/date/epoch filter list extracted from the captured
`/graph` request, per [[feedback_verify_the_actual_mechanism]]):
- `travelTime` (TMC grain, report 181, TMC `120-04229`, 2017 weekdays): live `1.2791322716675986`
  min vs ground truth `1.2791322716676112` — matches to 13 significant figures.
- `aadt` (TMC grain, report 33, 4 TMCs spot-checked against the TMC Identification table
  directly): exact match on all 4 (e.g. `120-04245` → `157258`).
- `hoursOfDelay` (route grain, report 179, "I-287 EB Inter 15 to Inter 8", 23 TMCs, July 2017
  weekdays, epochs 72-228): live `22533.989366506572` vs ground truth `22533.989366506572` — exact.
- `hoursOfDelay` (TMC grain, report 775, TMC `120+05858`, 2 dates): live `1614.688756330556` vs
  ground truth `1614.6887563305559` — exact.
- `length` not independently ground-truthed on a fresh value (report 965's own length graph
  happens to be bound to a pre-2017 comp, correctly returning 0 rows — not a bug, the query still
  scans `ds` for the date range regardless of which columns are selected) — accepted as verified
  by construction: byte-identical code path to the exact-matched `aadt`, and the route-grain
  combinator is SPEED_EXPR's own already-proven fragment.

**Census rerun (868 reports, 0 errors)**: raw 102 full (was 101) / 636 partial / 116 none (was
118) / 14 no_graphs; **4,186/7,098 mapped (59.0%**, was 58.1%). Excl. pre-2017: 60 full (was 59) /
560 / 101 (was 102) / 14; **3,856/6,520 mapped (59.1%**, was 58.3%). `no_equivalent` bucket 1,792→
1,733 (−59, exactly the 24+26+5+4 new real-corpus flips across the 4 measures).
`converted_pages_total`: 26 (21 + the 5 test conversions this round).

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
- **Stack preflight**: `python3 scripts/preflight.py` — one command checks vite, dms-server
  (/graph roundtrip), all three Postgres targets, ClickHouse, stray CH queries >60s (the
  unfiltered-scan hazard), and recent dms-server log errors. ~1s when healthy; fails fast with a
  VPN diagnosis instead of hanging. Run at session start or whenever anything hangs.
  `python3 scripts/dbq.py chprocs` runs just the stray-CH-query check (use before/after live
  report-page loads).
- **Ad-hoc queries / data validation**: `python3 scripts/dbq.py <old|new|dama|ch|graph|oldgraph> "<sql-or-paths>"`
  — one read-only runner for all backends (old/new/dama Postgres, ClickHouse HTTP, local +
  prod falcor). Creds read at runtime from the config files above; pg forced
  `default_transaction_read_only=on`, CH `readonly=2`, no write flag exists; 5s connect
  timeout with VPN hint instead of hanging. Bespoke validation scripts should `import dbq`
  (from `scripts/`) instead of re-implementing psql/CH/falcor boilerplate. Writes still go
  only through `convert_old_reports.py`, the dms CLI, or the user.
- **Live page verification**: `node scripts/report_probe.mjs <slug>` (repo root of dms-template) —
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
- `scratchpad/npmrds-sub/cleanup_round40.py` — round-40 one-off cleanup script (report 745's
  broken test section, report 191's `--replace` reconversion, the 4 pre-2017-only page deletes);
  user-run via `!` since it needs `DMS_AUTH_TOKEN`. Kept for reference, not meant to be re-run.
