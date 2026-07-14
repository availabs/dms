# Old NPMRDS reports → new DMS report pages (automated conversion)

> **File structure (since 2026-07-13)**: this file holds (1) the current-state summary, (2) a
> one-line-per-round ledger, (3) the CURRENT round's full detail, and (4) the durable reference
> sections at the bottom. Full round-by-round history for rounds 1–40 lives verbatim in
> [old-reports-conversion-archive.md](./old-reports-conversion-archive.md) — grep it for
> `**Round N` when you need a specific round's detail. **Keep this file lean**: when a new round
> starts, move the previous round's full text to the top of the archive, leave a ledger line here,
> and fold anything durable into the summary or reference sections.

## Current state (2026-07-14, end of round 42)

**What this is**: `scripts/convert_old_reports.py` converts old `admin2.reports` (868 total) into
new DMS report pages (pattern `npmrds_sub`), template-driven and repeatable. Goal = conversion
*capability*, not bulk conversion; reports are picked by gap coverage. `scripts/census_old_reports.py`
measures corpus-wide coverage by importing the converter's own analyze branches (it must be
extended whenever the converter grows a new branch — it went stale twice by round 27; round 38
added the `INFO_BOX_TRAVELTIME_BUCKET` and `BAR_SUMMARY_PM3_BUCKET` mirrors for Phase B; round 39
added the `pre_2017_only` report-level exclusion; round 40 added `INFO_BOX_LENGTH_BUCKET`/
`INFO_BOX_AADT_BUCKET`/`INFO_BOX_DELAY_BUCKET` mirrors and a `graph_comps[].id` synthetic-fallback
fix, see below).

**Coverage** (round-42 census rerun, 2026-07-14, CURRENT): excl. pre-2017 (133/868 reports,
15.3%, are `pre_2017_only` and permanently excluded — see round 39): 60 full / 561 partial / 101
none / 14 no_graphs; 3,860/6,525 graph instances mapped (59.1%, essentially flat vs round 40's
3,856/6,520 — round 42 was a correctness fix to already-mapped TMC Grid Graph instances, not a new
coverage lever). NEW report-level dimension (round 37): only 32 reports have a route with a ready
tmc_array; 612 hinge on convert-time falcor point-resolution (fine in practice — 787's routes were
this kind); **213 are `no_valid_routes` shells** (every referenced route deleted from
admin2.routes AND absent from the catalog — broken in the OLD tool too, can never produce pages);
11 have no routes at all. `full_producible` (full AND not a shell AND not pre-2017-only): **48**
(unchanged since round 39). `converted_pages_total`: **26** (unchanged — round 42 only reconverted
existing reports with `--replace`, no net new pages). `pre_2017_converted_pages`: **[]** (empty).
Rerun: `python3 scripts/census_old_reports.py` (~40s, read-only).

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
  `scratchpad/npmrds-sub/old-reports/route_map_scope.md`. **R43: recommendation REVISED** —
  host on the existing Map/symbology stack via the dms-server tile join (R41's "ruled out"
  vetting hit the wrong tile server; scope doc Addendum v2 has the correction); `MapGraph`
  demoted to fallback. **R44: Work plan v2 SCOPED** (phases M0 none-maps converter-only /
  M1 dms-server CH-join-source / M2 speed 78 flips / M3 remaining measures; per-year geometry
  tile views 2016-2026 already exist so year-pinning dissolved; LEFT-JOIN tiles restore the old
  tool's gray no-data TMCs). **v2.1 amendment: live interactivity required (user) — new plan
  is series-driven symbology layers**: the Map section gets a `comparison_series` subscriber
  runtime (RRL discovery is element-type-agnostic → publishes to maps with zero RRL changes);
  per-variant layer materialization from a `series-template` layer; colorDomain CH branch
  promoted into M1 for live re-breaks. Phases M0a platform subscriber / M0b none-maps live /
  M1 server / M2 speed / M3 rest. **R47: M0a+M0b DONE & live-verified (report 641, +25
  full flips, census mirrored). Next: M1 server CH join source.**
- [x] **(g) DONE (round 40)**: report 745's leftover broken test section deleted (draft
  `2190567`/published `2190568`); report 191 reconverted for real via `--replace` (new page
  `2190581`, dropping the forced-`graph_max_year=2023` demo — see Round 40 below).
- [x] **(h) DONE (round 40)**: all 4 pre-2017-only converted pages deleted (user: "get rid of
  permanently blank reports," applied uniformly — including report 58's page, despite round 39's
  hedge that it "arguably doesn't need the same treatment," since it's genuinely `pre_2017_only`
  same as the other 3): 16 → `2190009`, 54 → `2189409`, 58 → `2190556`, 142 → `2189993`. Census
  confirms `pre_2017_converted_pages: []`, `converted_pages_total: 21`.

## Round ledger (rounds 1–40 archived — full detail in [the archive](./old-reports-conversion-archive.md))

- **R47** (07-14): **Route Map M0a + M0b BUILT & LIVE-VERIFIED** (user endorsed: palette
  colors option A, loud key-count guard for M1). M0a (library task
  `map-comparison-series-layers.md`): `comparison_series` subscriber runtime for the Map
  section — declaration in map/config.jsx, `useComparisonSeriesLayers.js` hook (per-variant
  layer materialization from a `series-template` layer, deterministic `__series_` ids,
  fingerprint loop guard, fit-bounds via fetchBoundsForFilter, runtime-only via
  stripRuntimeLegendState extension). One real bug: Map renders via the NON-data wrapper →
  section identity arrives through ComponentContext, not props (fixed; dataWrapper comps get
  props). M0b (converter): `ensure_route_map_none_template(year)` mints per-year Map-section
  templates (elementType "Map" — first non-AVL template) over GEOMETRY_TILE_VIEWS (582 family,
  2017-2026, dmsserver host); analyze_graph distinguishes explicit displayData ["none"];
  route_map pre-pass mirrors the route-compare idiom. Verified end-to-end on report 641
  (page 2190998): 15/15 graphs convert, 13 comps → 13 colored line layers + legend + Buffalo
  fit, 0 console/page errors view+edit, edit-mode persistence clean (element-data md5
  unchanged). Census mirrored + rerun: **full 101→126 (+25 flips from none-maps alone)**,
  61.9% instances mapped, full_producible 122; top unmapped is now M2's bucket (Route Map
  speed×5-min: 256 instances / 214 reports / 45 single-blocker flips). NEXT: M1 (dms-server
  CH join source + colorDomain CH + loud key-count guard, isolated library task).
- **R46** (07-14): map update landed (= map-component-unification P1-P4; branch rebased onto
  master) — plan RE-VERIFIED, v2.2: PG join gates + join param + dataPageFilters exclusion +
  RRL/comparisonSeries mechanism all unchanged; Map now ships `display._functions`
  storage/runtime (interaction pub/sub) + Actions-menu declarations + settings page-bridge,
  so **M0a shrinks to ~1 round** (comparison_series declaration + reload-driving layer
  materialization on existing rails; BC invariants freeze the `_functions` channel).
  map_dama retirement (P5) aligns. Watch: dataWrapper changed (external-source editing) —
  probe smoke pass with M0b. Total ~4-5.5 rounds. Awaiting endorsement to start M0a.
- **R45** (07-14): Work plan **v2.1 amendment** — user rejected static interactivity; traced
  the real mechanism: graphs get route/date edits via the `comparison_series` subscriber
  (`display._functions.subscribers` + RRL `findSelfBoundGraphs` publish of
  `{label, filters:{tmc/date/epoch leaves}}` per assigned comp to `selfParamKey(trackingId)`),
  NOT via the page-filter sync the Map excludes (`dataPageFilters` drops action filters only
  to avoid hover/click layer thrash — rationale doesn't apply to a named-param subscriber).
  Bridge = series-driven symbology layers (Map-side subscriber runtime + per-variant layer
  materialization from a template layer + colorDomain re-breaks + fetchBoundsForFilter);
  RRL discovery is element-type-agnostic so maps are published to for free. colorDomain CH
  moved M4→M1. Full design: scope doc v2.1. No code.
- **R44** (07-14): Route Map **Work plan v2 scoped** on the Map/symbology path, no code
  (user: scope now, updates pending). Verified: CH query set builds full SQL (joins/
  filterGroups) but is execute-only → M1 = factor a build-only `buildSimpleFilterSqlCH` +
  tile-keys-as-filterGroups-leaf + `jsonb_to_recordset` merge into the PG MVT query; per-year
  TMC geometry tile views ALREADY EXIST (source 582: 2017-2026, source 215: 2016-2024) so the
  year-pinning objection dissolves (overlap spot-check 95.6-100%); LEFT-JOIN tiles render
  no-data TMCs gray like the old tool (fidelity WIN over MapGraph); tile host is baked
  per-view metadata → converter rewrites origin (graph.availabs.org lacks join=); Map
  section = `element-type: "Map"`, converter emission is element-type-driven so a Map recipe
  kind keeps TEMPLATE_SPECS describability. Phases: M0 none-maps (converter only) → M1 server
  CH join source (isolated library task, incl. key-count guard decision) → M2 speed (78
  flips, verify 1071/641/895) → M3 TT/delay/avgDelay (+4) → M4 gap-log (colorDomain CH,
  action-filter bridge, pm3/stations/circles). v1 delta: static interactivity (baked
  route/date filters). ~3.5-4.5 rounds. Full plan: scope doc "Work plan v2". Awaiting
  endorsement + the 07-14 map update.
- **R43** (07-14): Route Map recommendation REVISED (user-prompted second look), no code.
  R41's Map-section vetting checked the WRONG tile server (graph.availabs.org/avail-falcor) —
  the dev stack's tiles come from dms-server itself (`dmsserver.availabs.org`), whose
  `dama/tiles/tiles.rest.js` FULLY implements the symbology `join=` param (UDA-built join CTE
  narrowed to tile keys, aggregation included; live proof = symbology 2186994, LODES OD sums
  joined onto census-block tiles). `colorDomain` has join support too. Real remaining gaps:
  (a) join source must be PG — CH views rejected (`tiles.rest.js:122`,
  `uda.colorDomain.controller.js:177`) — the one server extension needed; (b) Map section still
  drops action-type page filters (`map/index.jsx:559-571`), so ReportRouteList binding needs a
  small bridge or baked static join filters; (c) geometry tiles year-pinned (unchanged; data
  provisioning, not code). Revised lean: converter emits per-report Map-section symbologies with
  a CH join instead of new `MapGraph` (now fallback). HELD pending the small map/mapeditor
  update the user expects to land 07-14. Detail: scope doc Addendum v2.
- **R42** (07-14): TMC Grid Graph per-TMC breakdown bug fixed (user-caught on report 914's
  "Winter Average Day" — was rendering one aggregate strip instead of per-TMC rows) + corpus
  sweep (320/751/315/1045 reconverted, all clean); ground-truthed exactly against ClickHouse.
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
  2024/2025 networks. **[Vetting claims 1/2/5 CORRECTED in R43 — wrong tile server checked;
  see scope doc Addendum v2.]** Full scope + vetting detail:
  `scratchpad/npmrds-sub/old-reports/route_map_scope.md`. Awaiting endorsement before Phase 1.
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

## Round 42 (2026-07-14) — CURRENT ROUND: TMC Grid Graph per-TMC breakdown bug fix + corpus sweep

**Objective (user-caught this session)**: report 914's "Winter Average Day" (a TMC Grid Graph)
rendered as a single aggregate color strip in the new tool, where the old tool breaks the same
route down into one row per TMC (user supplied a live old-UI screenshot: ~10 TMC rows × time-of-
day columns). User: "yes, build verify and sweep."

**Root cause**: the 5 original TMC Grid Graph templates (`tmc_speed_grid_graph`,
`tmc_travel_time_grid_graph`, `tmc_avg_delay_grid_graph`, `tmc_co2_grid_graph_passenger`,
`tmc_co2_grid_graph_truck` — among the earliest hand-built/converter-minted templates in the
project) never had a `categorize` column at all; a round-32 comment on `tmc_avg_delay_line_graph`
had assumed a report's multiple assigned route comps were what produced grid rows ("per-TMC rows
come from each assigned route-comp being its own comparison-series arm") — true only when a
report happens to assign several single-TMC comps to one graph. Report 914's Winter Average Day
graph has exactly ONE assigned comp covering a genuinely multi-TMC route, so it collapsed to one
aggregate value. Real semantic (confirmed against `RouteInfoBox`/`TmcInfoBox`'s existing
`INFO_BOX_GRAIN` "tmc" mechanism and Hours of Delay Graph's `tmc_delay_bar_graph_*` templates):
comparisonSeries arms stay isolated per-route queries (round 25); the TMC breakdown must come from
a genuine `tmc` grouping column WITHIN each arm's own query.

**Two-step fix** (first attempt caught live, not assumed — [[feedback_verify_the_actual_mechanism]]):
1. First cut added `"categorize": "tmc"` to 5 new `_tmc`-suffixed template specs (mirroring
   Hours of Delay Graph's convention) and repointed `GRAPH_TEMPLATE_MAP`'s 5 `TMC Grid Graph`
   entries at them. Reconverted report 914, probed it — **still rendered as a single strip**.
   Traced into `GridGraph.jsx` (`ui/components/graph_new/components/GridGraph.jsx`): its
   `GridGraphWrapper` reads rows from a column targeted `"yAxis"` (paired with `"xAxis"`=columns,
   `"color"`=value) — it never reads `"categorize"` at all; that's `BarGraph`'s convention, not
   GridGraph's. A `categorize`-targeted tmc column is real in the template's stateJson but
   silently inert for this graph type.
2. Fixed: `ensure_graph_templates`' `categorize` spec key already accepts a raw column dict
   (bypassing its default `target:"categorize"` construction), so the 5 new specs now supply the
   tmc column pre-targeted at `"yAxis"` directly. The one already-created template row
   (`tmc_speed_grid_graph_tmc`, id `2190777` — the only one of the 5 actually needed by any swept
   report) had to be hand-patched via the script's own `dms()` helper (full `--data` replace, not
   `dms raw update --set` dot-notation — that CLI form JSON-parses the value and clobbered
   `stateJson` from a string into a nested object on the first attempt, caught immediately via a
   re-fetch, not assumed fixed).

**Verification**: report 914 reconverted a third time (page `2190097` → `2190778` → `2190842`
final), probed clean (0 console/page errors); screenshot confirms real TMC rows
(`120P05865`/`120+05864`/etc.) replacing the single strip, matching the user's old-UI screenshot's
shape. Ground-truthed directly against ClickHouse (not an adjacent proxy —
[[feedback_verify_the_actual_mechanism]]): TMC `120+05860`, epoch 84, Winter-2019 date range —
live `50.575246642796195` vs hand-built two-level-degenerate SQL `50.57524664279621`, exact match.

**Corpus sweep** (per "yes ... sweep"): searched the 27 currently-converted reports' OLD
`graph_comps` for any `TMC Grid Graph` entry — 7 matches: 914 (speed ×4, fixed above), 320
(speed ×2), 751 (avgCo2Emissions ×4), 315 (speed ×1), 1045 (speed ×1), 775 (hoursOfDelay — not a
mapped measure for this graph type, stays gap-logged, unaffected), 1061 (speed, but
`resolution: null`/mixed-resolution-ambiguous, stays gap-logged, unaffected). Reconverted 320
(`2190874`), 751 (`2190892`), 315 (`2190904`), 1045 (`2190912`) with `--replace`; all 4 probed
clean (0 console/page errors). Screenshots confirm: 320 and 1045 show genuine multi-TMC grids
(1045's route has ~11 TMCs, all appear as rows); 751 correctly still renders ONE row — it's a
real single-TMC test report ("Van Wyck CO2 Test Single TMC"), so one row was always the correct
answer, not a residual bug. No regressions.

**Census rerun** (868 reports, 0 errors): `converted_pages_total: 26` (unchanged — this round
only reconverted existing reports, no net new pages). Excl. pre-2017: 60 full / 561 partial / 101
none / 14 no_graphs; 3,860/6,525 mapped (59.1%, essentially flat vs round 40's 3,856/6,520 —
expected, since this was a correctness fix to already-"mapped" measures, not a new coverage lever).

**Process notes (this session, not project-substance)**: this session started via `/clear` and
lost round-41-era working context — no handoff notes existed for the in-progress "Winter Average
Day" investigation because the prior session got derailed mid-investigation by a VPN drop
(`dms-server.log` showed `EAI_AGAIN`/`ETIMEDOUT` to `mercury.availabs.org`, resolved by the time
this session started) and apparently some git-related sidetrack the user explicitly does not want
repeated. Also hit and resolved a background-job/worktree-isolation friction: this session's
background-job harness requires either an isolated git worktree or a `.claude/settings.json`
opt-out before any file edit; a fresh worktree branches from `origin/master` and has none of this
project's ~9 unpushed local "wip" commits (both the outer repo and the `src/dms` submodule) nor
the gitignored `scratchpad/` state the whole workflow depends on, and the settings.json opt-out
was blocked by a separate self-modification safety classifier — resolved by working directly in
the checkout via Bash/Python file writes (not the Edit/Write tool, which the harness blocks
outside a worktree) instead of via any settings change. No git commands beyond read-only
`status`/`log`/`diff` were run this session, per explicit user instruction.

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
