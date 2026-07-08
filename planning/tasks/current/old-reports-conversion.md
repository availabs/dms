# Old NPMRDS reports → new DMS report pages (automated conversion)

## Status: REPORTS 1070, 1071, 1061 CONVERTED (2026-07-08); calculated-join-key platform fix DONE + verified; one live page needs a re-run (blocked on fresh auth token)

### Next session — pick up here, in order

1. **Mint a fresh `DMS_AUTH_TOKEN`** (see `reference_dms_dev_creds.md` in memory — `POST /login`,
   NOT `/auth/login`, on the local dms-server at `http://localhost:3001`). Write the token to
   `scratchpad/npmrds-sub/.dms-auth-token`, then re-run
   `python3 scripts/convert_old_reports.py --report-id 1061 --replace` to drop report 1061's
   known-bad `graph-comp-60` section (see the nondeterminism bugfix below — the fix is already in
   the script, the LIVE page just predates it).
2. **Build the weighted Hours-of-Delay calculated column** — upgrade `tmc_delay_bar_graph_day`
   (2188429) to join `aadt_distributions` (source 2056/view 3524, already registered) the same way
   the CO₂ formula will need to. The join mechanism is fixed and verified (see "calculated join
   keys" below) — this is now pure SQL-writing, no remaining unknowns. Formula reference:
   `avail-falcor/services/routeDataRetrievers/getHoursOfDelay.js`'s `calcEmissions`-sibling logic
   (per-epoch AADT × distribution share × threshold-delay). Verify by re-checking report 1071's
   delay bar graph live (it currently shows unweighted values).
3. **Build the CO₂ emissions calculated column** for report 751 — formula in
   `avail-falcor/services/routeDataRetrievers/getCo2Emissions.js` (see round-3 notes below for the
   exact breakdown: AADT split car/truck, distribution-weighted VMT, 15-bucket piecewise
   speed→emission-factor regression). Same join mechanism as #2.
4. **Get user input on two open design questions before continuing report 751**: (a) how to
   represent `RouteDifferenceGraph`/`RouteCompareComponent` (compare/diff two series — no template
   equivalent exists), (b) how to represent `overrides.baseSpeed` synthetic per-epoch data (no
   real-fact-table-backed primitive exists). Both are genuine new-capability questions, not
   research gaps — see the detailed round-3 notes below before proposing anything.
5. Continue down the approved picks list after 751: **1045** ("Rochester Inner Loop" —
   month+weekday resolutions, dataQuality) → **874** ("Zizhao_119EB_Delay_AADT" — AADT from the
   join table, mixed dataColumns).

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
- Old per-graph `layout` (grid x/y/w/h) has no obvious new-side target (sections stack linearly).
- Old `color_range` / per-route `color` not yet mapped (new palette lives in template display).
- Relative-date reports (`settings.relativeDate`) and route groups need design.

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

## Artifacts (scratchpad/npmrds-sub/old-reports/)

`report_1070.json`, `report_1070_routes.json` (old side); `new_page_2187523.json`,
`new_page_2187523_sections.json`, `new_report_row_page2187523.json`,
`avl_graph_templates.json`, `page_template_2187021_current.json` (new side).
`report_1071.json`, `report_751.json`, `report_1061.json` (old-side dumps for those reports).
`gaps/report_1070.json`, `gaps/report_1071.json`, `gaps/report_1061.json` (per-report gap reports,
regenerated on every conversion run — `report_1071.json`'s `new_page_id`/`dry_run` fields were
manually restored after a dry-run overwrote them, see round-3 notes if this looks odd).

Other files this task has produced, outside that scratchpad folder:
- `scripts/convert_old_reports.py` — the converter itself.
- `scripts/register_aadt_distributions.sql` — one-time DAMA source/view registration for
  `aadt_distributions` (already run; keep for reference/idempotent re-registration elsewhere).
- `src/dms/documentation/npmrds-data-sources.md` — the living data-source reference (see below).
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — the calculated-join-key fix (small diff, `accessor()` inside `buildJoinOnClause`).
- `src/dms/packages/dms/tests/buildUdaConfig.test.js` — regression test for that fix.
