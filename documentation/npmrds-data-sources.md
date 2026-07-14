# NPMRDS-backed data sources (old-reports-conversion + future NPMRDS work)

Living inventory of the old DAMA (`data_manager.sources`/`views`, Postgres `npmrds2` pgEnv @
`neptune.availabs.org:5758`) sources and ClickHouse tables (`neptune.availabs.org:8123`) that back
the NPMRDS old-reports-conversion task (`planning/tasks/current/old-reports-conversion.md`) and
NPMRDS "data product" work generally. Keep this current as new sources get investigated or
registered — this is reference material, not task status (see `planning-rules.md`'s
research-vs-documentation split).

**Hard constraint (confirmed 2026-07-08, both by the user directly and by tracing the UDA join
engine code)**: a single query can join across tables in *different databases on the same
connection/engine* (e.g. ClickHouse's own `db1.table1 JOIN db2.table2` — different CH databases,
one server) but **never across different engines/connections** (ClickHouse ↔ Postgres). The join
builder (`dms-server/src/routes/uda/query_sets/*.js`, `utils.js`'s `buildJoin()`/`getEssentials()`)
picks one connection for the whole query from the main `externalSource`'s dbType and splices every
`join.sources` entry's `table_schema.table_name` into that same connection's SQL as plain text —
confirmed also documented as a known limitation in
`planning/tasks/completed/datawrapper-join-support.md:139-146` ("same-database joins only").
Consequence: anything meant to join against the NPMRDS ClickHouse fact data must itself be a
ClickHouse table (any CH database on `neptune.availabs.org:8123` is fine) — never a Postgres/DMS
dataset.

## Registered DAMA sources (joinable via `join.sources` in an `avl_graph_template`)

| source_id | view_id | name | CH database.table (or PG) | contents | notes |
|---|---|---|---|---|---|
| 583 | 982 | NPMRDS Production V6 | `clickhouse.npmrds` / `s583_v982_NPMRDS_V6` | Epoch-level travel times per TMC (all/passenger/truck combined into one row). Updated weekly, ACTIVE. | Main fact table every AVL Graph template's `externalSource` binds to. `metadata.columns` includes calculated columns (`MAX(date) AS latest_date` etc.). |
| 1946 | 3298 | ny_2025_tmc_meta | `clickhouse.npmrds_meta` / `s1946_v3298_ny_2025_tmc_meta` | TMC identification/attributes: miles, avg_speedlimit, aadt, aadt_singl, aadt_combi, congestion_level, directionality, f_system, faciltype, avg_vehicle_occupancy, geometry, etc. | Already joined by the existing `tmc_delay_bar_graph_day`/`tmc_speed_grid_graph` templates on `tmc`. `categories: [["Inactive","archive"]]` despite being actively used — categorization is stale/not a reliability signal. |
| **2056** | **3524** | aadt_distributions | `clickhouse.avail` / `aadt_distributions` | AADT epoch-distribution weighting: `key` (20 profile names, e.g. `WEEKDAY_NO2LOW_CONGESTION_AM_PEAK_FREEWAY`) → `distributions` (`Array(Float64)`, 288 values, one per 5-min epoch, sums to 1.0 per key). | **Verified byte-for-byte match** against `avail-falcor`'s `aadtDistributions.js` — CH values equal that file's raw literals × 0.01, which is exactly what its own `module.exports = DISTS` (`DISTS[dist] = distributions[dist].map(d => d*0.01)`) actually exports and what `getCo2Emissions.js`/`getHoursOfDelay.js` consume. **No further scaling needed when joining.** Unblocks weighted Hours-of-Delay (round-2 gap) and the CO₂ formula (report 751). Join key is a *computed* string (see below), not a plain column match. Registered as a `gis_dataset`-typed source (per user direction — no real "register an existing external table" flow exists in avail-falcor, so this mirrors the closest generic convention) pointing at the pre-existing table (not a new upload). |
| 455 | 3464 | NPMRDS TMC Identification V5/V6 | `clickhouse.npmrds_raw_tmc_identification` / `s455_v3464_NPMRDS_TMC_Identification_V5_V6` | Per-TMC static attributes (44 cols): `tmc, road, direction, intersection, miles, f_system, faciltype, structype, thrulanes, route_numb, aadt, aadt_singl, aadt_combi, nhs, nhs_pct, truck, wkb_geometry` (GeoJSON MultiLineString despite the name), etc. **No `avg_speedlimit`/`congestion_level`/`directionality`** (that's what forces the 1946 override below). | **The default join every `avl_graph_template` row carries, not an opt-in one** — inherited automatically whenever a template row is deep-copied from `tmc_travel_time_line_graph`'s live `base_state` (round-38 "carry the join forward" fact in the task file). Not previously listed in this doc even though it's the single most-used join in the whole catalog. 62 versioned views exist (`data_manager.views WHERE source_id=455`); 3464 is simply whichever one the original hand-built template happened to bind — never re-picked per report or per conversion. Backs `table1.miles` in `SPEED_EXPR`/`TRAVEL_TIME_EXPR` and `table1.miles`/`table1.aadt` in the Info Box length/aadt measures, and is the reachable source of per-TMC geometry for the scoped-but-unbuilt Route Map work (round 41). |

### Registering `aadt_distributions` — DONE (2026-07-08), source_id 2056 / view_id 3524

Row shape modeled on real `gis_dataset` sources + the two ClickHouse-backed sources above (full
column lists and real example rows pulled 2026-07-08 via direct read of `data_manager.sources`/
`views`). SQL: `scripts/register_aadt_distributions.sql`, run by the user directly against
`npmrds2`/`neptune:5758` (writes there are blocked when run through the agent's own tools).
Key decisions:
- `type: 'gis_dataset'`, `user_id: 993` (user direction) — no dedicated "static reference table"
  type exists.
- `table_name: 'aadt_distributions'` (literal, not the synthetic `s{source_id}_v{view_id}_{name}`
  pattern other views use) — the physical table already exists under this name; renaming in the
  view row would just break the join since the query engine splices `table_schema.table_name` in
  as literal SQL.
- `auth_permissions`/`statistics.auth` mirror 1946's restricted (non-public) shape, not 583's
  public-visible one — this is an internal calc-support reference table, not a primary dataset.

### The join key is computed, not a plain column — SOLVED (2026-07-08)

`distributions.key` (e.g. `WEEKDAY_NO2LOW_CONGESTION_AM_PEAK_FREEWAY`) must be built as a SQL
expression on the main-query side, mirroring `getDist()` in old
`avail-falcor/services/routeDataRetrievers/{getCo2Emissions,getHoursOfDelay}.js`:

```
weekdayType = (dow IN (0,6)) ? 'WEEKEND' : 'WEEKDAY'
roadType    = (f_system < 3) ? 'FREEWAY' : 'NONFREEWAY'
dist_key    = weekdayType == 'WEEKEND'
                ? weekdayType || '_' || roadType
                : weekdayType || '_' || congestion_level || '_' || directionality || '_' || roadType
```

`congestion_level`/`directionality`/`f_system` come from the existing `ny_2025_tmc_meta` join
(`table1`); `dow` from the fact table's own `date`. Index the distributions array by raw epoch
(0-287): `arrayElement(distributions, epoch + 1)` (ClickHouse arrays are 1-indexed).

**This needed a small platform fix, now shipped**: the join engine's `joinColumns` mechanism only
supported plain `column = column` matches, and only against the base table (`ds`) — it couldn't
express a computed expression, and `table1`'s columns (`congestion_level` etc.) aren't visible on
`ds`. Fix: define the dist-key as a **calculated column** (same convention as the existing
`speed`/`hours_of_delay` calc columns, e.g. `"<expr> as dist_key"`) and reference that calculated
column as a join's `dsColumn`. `buildJoinOnClause`'s `accessor()`
(`packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`,
~line 889) now detects a calculated `dsColumn` (via the same `isCalculatedCol` check used
elsewhere in that file) and uses its raw expression as-is instead of prefixing `${alias}.` —
since the expression is opaque SQL text with the whole FROM/JOIN scope already visible, it can
freely reference `table1`'s columns inside its own body. This is now the general pattern for
**any** future join that needs a computed key or needs to reference a previously-joined table:
express it as a calculated column, use that as the `dsColumn`. Verified live against real data —
see `planning/tasks/current/old-reports-conversion.md`'s round-3 notes for the full trace and the
example query.

Example `join.sources.table2` entry once both `table1` (ny_2025_tmc_meta) and `table2`
(aadt_distributions) are configured on a template:
```json
{
  "table2": {
    "source": 2056, "view": 3524,
    "sourceInfo": { "...": "aadt_distributions sourceInfo, see registered table above" },
    "joinColumns": [{
      "dsColumn": "if(toDayOfWeek(ds.date, 2) IN (6,7), concat('WEEKEND_', if(table1.f_system < 3, 'FREEWAY', 'NONFREEWAY')), concat('WEEKDAY_', table1.congestion_level, '_', table1.directionality, '_', if(table1.f_system < 3, 'FREEWAY', 'NONFREEWAY'))) as dist_key",
      "joinSourceColumn": "key"
    }],
    "mergeStrategy": "join", "type": "left"
  }
}
```

**Separately noticed while verifying this, not fixed**: bare `filterGroups` filter columns
(`handleFilterGroupsCH`, `dms-server/.../uda/query_sets/helpers.js`) are used verbatim in
generated SQL with no alias-qualification — a plain `tmc` filter errors as "ambiguous identifier"
if a joined table also has a `tmc` column. Hasn't surfaced in production because report-page route
filtering goes through the `comparisonSeries` mechanism, not top-level static filters. Pre-qualify
(`ds.tmc` instead of `tmc`) if writing a top-level filter alongside a join.

## Which measures use which source — swap-reference (2026-07-14)

Every `avl_graph_template` row's `externalSource` binds to source 583 (the fact table) — that's
universal and only changes if NPMRDS itself moves to a different fact table. What varies is which
*join* source backs a given **measure's** calculated column. Templates aren't hand-authored one at
a time — they're minted by `ensure_graph_templates()`/`ensure_pm3_join_template()`/the
`ensure_info_box_*_template()` family in `scripts/convert_old_reports.py` from a small set of shared
constants, and every already-minted template row of a given name is kept in sync by
`ensure_graph_templates`'s drift detection. So swapping a source for a whole measure family is a
**single-constant edit + a reconvert**, not a per-template hunt — this table is the map from
"I want to change where X comes from" to "here's the one constant to edit."

| Measure family | Source(s) used | Why | Constant(s) to edit for a swap |
|---|---|---|---|
| speed, travelTime (every graph type + Route Compare + Bar Graph Summary + Info Box `travelTime`/`avgTT-byDateRange`) | 583 (fact) + 455/3464 (TMC Identification — the *default* join, never overridden for these) | `SPEED_EXPR`/`TRAVEL_TIME_EXPR` need `table1.miles` for the two-level per-TMC→route composition (round 34/35 backport) | `SPEED_EXPR`, `TRAVEL_TIME_EXPR` (`scripts/convert_old_reports.py:389-408`) — and the base template row's own join if `miles` itself moved to a different source |
| hoursOfDelay, avgHoursOfDelay | 583 + 1946/3298 (ny_2025_tmc_meta) + 2056/3524 (aadt_distributions) | `DELAY_EXPR` needs `avg_speedlimit`/`faciltype` (delay threshold) from 1946, plus epoch-level AADT weighting from 2056 | `META_1946_JOIN`, `AADT_DIST_JOIN`, `DELAY_EXPR`, `DIST_KEY_EXPR` (`:409-529`) |
| co2Emissions, avgCo2Emissions | 583 + 1946 + 2056 (same pair as delay) | `CO2_EXPR_PASSENGER`/`CO2_EXPR_TRUCK` reuse the same AADT/facility-type/threshold inputs as delay, plus a hardcoded speed→emission-factor regression (no external source — literal piecewise coefficients) | `META_1946_JOIN`, `AADT_DIST_JOIN`, `CO2_EXPR_PASSENGER`, `CO2_EXPR_TRUCK` (`:530-602`) |
| length, aadt (Info Box TMC-attribute measures) | 583 (WHERE-scoping only) + 455/3464 (default join, unmodified) | `LENGTH_EXPR`/`AADT_EXPR`/their `_TMC_EXPR` variants read `table1.miles`/`table1.aadt` straight off the default join — no override needed | `LENGTH_EXPR`, `LENGTH_TMC_EXPR`, `AADT_EXPR`, `AADT_TMC_EXPR` (`:232-254`) |
| LOTTR, TTTR, freeflow (`speed_pctl_85`) — Route/TMC Info Box reliability only | 583 (WHERE-scoping only) + **1410 PM3** (Postgres, `pgFederated`, one view per year) | The only cross-engine (CH↔PG) join in the catalog; year-matched to the report's own max year, never substituted for a different year's data (round 17 product decision) | `PM3_VIEW_BY_YEAR`, `ensure_pm3_join_template()` (`:201`, `:1633-1720`) — see [[project_npmrds_1410_vs_2001_backfill]] for why 1410 was picked over 2001/1722 |
| dataQuality | 583 only | Reads `data_density_*` straight off the fact table row | n/a — plain column pick, no join or calc constant |

**Not currently used by any live template** (bank only, documented below): 582, 1722, 2001,
`tmc_avg_speedlimit`, `avg_monthly_tt`, `mpo_boundaries`. Swapping *into* one of these would be new
wiring work (new join config + calc rewrite), not an edit to an existing constant — 2001/1722 in
particular were evaluated as LOTTR/TTTR alternatives to 1410 and passed over (narrower schema, see
their rows below).

## Other active old-DAMA NPMRDS sources (user-provided 2026-07-08, bank for future joins — NOT yet
individually investigated beyond what's below)

All ACTIVE (updated weekly / actively used elsewhere), old Data-Manager-style sources. **No
destructive actions on any of these, ever** — read/join only. Mixed year-grain across
sources/views (some hold one year per version, some hold many) — when a date filter is present,
pull from the version/table matching that year; don't mix grains within one conversion.

| source_id | name (old UI) | what it is |
|---|---|---|
| 583 | (see registered table above) | |
| 582 | — | Partially duplicated across ClickHouse + Postgres, built on the RITIS TMC-ID shapefile. Some derived calcs live here. Cross-referenced from 583's `metadata.npmrds_tmc_meta_source_id: 582`. |
| 1722 | — | PM3/MAP21 calculations (LOTTR, TTTR, etc.). Calc code: `avail-falcor/dama/routes/data_types/map21/calcTtrMeasure.js` (peak/bin defs in sibling `constants.js`: `REPORTING_BINS`/`BIN_NAMES`, e.g. `AMP` = hours 6-9 weekdays, `PMP` = hours 16-19 weekdays). **Checked (2026-07-08): does NOT have per-day/per-epoch weighted delay** — LOTTR/TTTR are reliability ratios, no AADT weighting involved at all. **Differentiated from 2001/1410 (2026-07-09): all three are Postgres-backed (user-confirmed), `gis_datasets` schema, `npmrds2` pgEnv.** 1722 has only one view (`view_id` 2874, `s1722_v2874_test_pm_3_multi_v_11`, "2025 v1" — named "test_", looks experimental), 62 columns, lottr/tttr/phed present but no freeflow/speed-percentile columns (a strict subset of 1410's schema) — lowest priority of the three. |
| 2001 | Map 21 Extended | **Full view list confirmed 2026-07-09** (`data_manager.views WHERE source_id = 2001`, 21 rows, `start_date`/`end_date` empty on every row — not populated for this source): 10 single-year views (`view_id`s 3396-3405, 2016-2025, `s2001_v3396`…`s2001_v3405`), one `all_years 2016-2025` view (3394, `s2001_v3394`), and **4 separate `map_21_extended`-named re-publishes** of the pipeline over time — `view_id` 3440 ("2025 v052126"), 3489 ("2025 v061126"), 3490 ("all years v61126"), 3511 ("2025 v061526", the most recent by version-string date). **This source is periodically re-run/re-published, not a static one-time table** — the 4 `map_21_extended` versions are successive re-runs, and the *only* one of them labeled "all years" is 3490, which predates the latest re-run (3511, single-year 2025 only) — i.e. the "all years" snapshot may already be one re-run behind the latest 2025 data. Worth re-checking before treating 3490 as current if 2025 data matters. **Verified 2026-07-09** (on 3490): real per-TMC-per-YEAR grain (`travel_time_code` = tmc, `year_record`), columns `lottr_amp/midd/pmp/we`, `tt_{bin}50pct`/`tt_{bin}80pct`, `tttr_amp/midd/pmp/we/ovn`, `ttt_{bin}50pct`/`ttt_{bin}95pct`, single `phed` column — **100% non-null on every one of those columns across all 199,165 rows**, real per-year row counts 17,783-20,802 (no sparse years). Spot-checked against 3 TMCs from already-converted reports (`120-04426`, `120-04427` from report 315; `120P05153` from report 751) — real, sane, non-null values for every year 2016-2025 (one gap noticed: `120-04426` has no 2024 row). **No standalone freeflow/speed-percentile column** — LOTTR/TTTR/PHED only. Best year coverage of the three (goes back to 2016, i.e. covers years the new ClickHouse fact table itself can never reach). |
| 1410 | PM3 | 5 single-year views, **all table names confirmed 2026-07-09** (`data_manager.views`, `start_date`/`end_date` empty on every row): `view_id` 2587 → `s1410_v2587_pm_3` (2021), 2575 → `s1410_v2575_pm_3` (2022), 2567 → `s1410_v2567_pm_3` (2023), 2568 → `s1410_v2568_pm_3` (2024), 3425 → `s1410_v3425_pm_3` (2025) — **no all-years view, no coverage before 2021**. **Verified 2026-07-09** on the 2025 view (`s1410_v3425_pm_3`, 121 columns, 52,127 rows = 52,127 distinct TMCs, one row per TMC): `speed_pctl_5/20/25/50/75/80/85/95` — **100% non-null**, and `speed_pctl_85` is exactly the old tool's speed-based freeflow definition (85th-percentile speed, matches `pm3_calculator_2`'s `FreeflowCalculator`'s `EIGHTY_FIFTH_PCTL`) — **this is the only one of the three sources with a usable freeflow-equivalent column.** Also has `lottr_{bin}_lottr`/`lottr_{bin}_lottr_80_pct`/`_50_pct`, `tttr_{bin}_tttr`/`_95_pct`/`_50_pct` (100% non-null) and a much richer PHED/TED breakdown (baseline vs. freeflow-based threshold, all-vehicles vs. truck, all ~41% non-null — real gaps, not a computation failure; `calcPhed.js`'s `checkMeta` skips a TMC missing any of avg_vehicle_occupancy/functional class/congestion_level/directionality/nhs_pct). Spot-checked the same 3 TMCs as above: real, sane, non-null `speed_pctl_85`/`lottr_amp_lottr`/`tttr_amp_tttr` values for all three. **Richest measure set, but only 2021-2025 — a real coverage gap for reports whose year falls 2017-2020** (the raw fact-table gap covers 2016 only; this source's own gap is wider, 2016-2020). **TMC-id column CONFIRMED 2026-07-09**: `tmc` (not `travel_time_code` like 2001 — different id column name per source; full row shape starts `ogc_fid, tmc, urban_code, region_code, county, ...`). |

**Hard constraint for all three**: they're Postgres (`gis_datasets`, `npmrds2` pgEnv), the NPMRDS fact table is ClickHouse — per the join-engine constraint above, these can never be joined into the same query as the speed/delay/CO2 measures. A real InfoBox conversion would need a **separate query** against whichever of these sources for the reliability-measure columns, alongside the existing ClickHouse-sourced query for the other measures — not a limitation in practice, since the old `GeneralGraphComp.doFetchFalcorDeps` already issues one separate falcor request **per measure group** (indices/tmcAttribute/hoursOfDelay/co2Emissions all fetched independently), so a Postgres-sourced reliability query is architecturally consistent with how the old tool worked, not a new pattern.
| — | tmc_avg_speedlimit | ClickHouse table in `avail` database (seen via `SHOW TABLES FROM avail`, 2026-07-08). Not yet registered as a DAMA source or investigated — may be a useful alternative/original source for `avg_speedlimit` (currently sourced via the 1946 join). |
| — | avg_monthly_tt | ClickHouse table in `avail` database. Not yet investigated. |
| — | mpo_boundaries | ClickHouse table in `avail` database — geographic, likely unrelated to travel-time/delay/emissions calcs. Not yet investigated. |
| — | npmrds (table literally named this, inside `avail` DB) | **CONFIRMED (2026-07-09) NOT the same as source 583's real fact table** (`clickhouse.npmrds.s583_v982_NPMRDS_V6`, a different CH database despite the similar name). User ran queries against it directly and could not identify what it is — "assume we should never query this table for anything in life." Do not use for any purpose; a past round of `old-reports-conversion.md` (round 12) mistakenly used this table for a data-availability check and had to correct the finding. |

**Checked and ruled out as a delay/CO2-weighting substitute (2026-07-08)**: FHWA PHED (Peak Hour
Excessive Delay), computed by `avail-falcor/dama/routes/data_types/map21/calcPhed.js` using a
*different* static distribution table (`CATTLabTrafficDistributionProfiles`) plus average-vehicle-
occupancy and directional AADT. PHED is a **single aggregate annual number per TMC**
(`all_xdelay_phrs` etc.), not a time series — cannot substitute for a "Hours of Delay by day" bar
graph or per-period CO₂ line graph.

## Per-year TMC geometry tile views (confirmed 2026-07-14 against `npmrds2`)

PostGIS tile-servable TMC network geometry exists for EVERY report year — no provisioning
needed for year-matched maps. All tables live in `npmrds_geometry.*` with a `tmc` column and a
`year` column; each view's tile URL bakes `?cols=tmc&filter=year=<Y>`. ~52k rows per year
(NY network).

| Year | Source 582 (npmrds_v6 / shapefile-enhanced, current gen) | Source 215 (production_NY, older gen) |
|---|---|---|
| 2016 | — | v456 |
| 2017 | v985 | v457 |
| 2018 | v1015 | v455 |
| 2019 | v1027 | v453 |
| 2020 | v1033 | v452 |
| 2021 | v1035 | v454 |
| 2022 | v1041 | v458 |
| 2023 | v1052 | v459 |
| 2024 | v1232 | v460 |
| 2025 | v1312 | — |
| 2026 | v3058 | — |

Also: source 913 (v1899=2024, v2047=2025 `npmrds_prod_*_tmc_meta_geometry`) and source 1946
(v3300=2025 `ny_2025_tmc_meta_geometry`) — the ones mapeditor symbologies commonly reference.

**Coverage spot-check** (60 old-report routes, 822 distinct TMCs, 2026-07-14): 2017 table
95.6% present, 2019 99.5%, 2025 100% — year-matched selection makes old-network TMC loss
negligible; gap-log per-map misses at conversion time.

**Host caveat**: tile URLs are baked per-view in `metadata.tiles` and most say
`graph.availabs.org` — whose tile route does NOT implement the symbology `join=` param. The
dms-server tile route (`dmsserver.availabs.org`, `dms-server/src/dama/tiles/tiles.rest.js`)
DOES. Rewrite the origin when emitting joined layers. Full join mechanics:
`planning/research/references/map-joins.md`.

## DAMA schema reference (live, confirmed 2026-07-08 against `npmrds2`)

`data_manager.sources` columns: `source_id, name, update_interval, category, description,
statistics, metadata, categories, type, display_name, user_id, _created_timestamp,
_modified_timestamp, source_dependencies, auth_permissions`.

`data_manager.views` columns: `view_id, source_id, data_type, interval_version,
geography_version, version, source_url, publisher, table_schema, table_name, data_table,
download_url, tiles_url, start_date, end_date, last_updated, statistics, metadata, user_id,
root_etl_context_id, etl_context_id, _created_timestamp, _modified_timestamp, view_dependencies,
active_start_timestamp, active_end_timestamp`.

Note: `src/dms/documentation/dama-current-system.md` documents the DAMA schema generically from
the avail-falcor migration SQL — that file predates the `auth_permissions` column confirmed live
here (2026-07-08), i.e. the live schema has drifted ahead of that migration-based doc. Trust a
live read over either doc when precision matters.

CH database ≠ CH table name — don't conflate: `clickhouse.npmrds`, `clickhouse.npmrds_meta`, and
`clickhouse.avail` are three different ClickHouse databases on the same server
(`neptune.availabs.org:8123`), all joinable together in one query since they share one connection.

## Known operational hazard: unfiltered probe queries can run indefinitely

**Any AVL Graph (or other dataWrapper-based) section can briefly fire a `simpleFilterLength`
request with completely empty `filter`/`filterGroups` before its real scoping is ready** — and
because the ClickHouse adapter (`dms-server/src/db/adapters/clickhouse.js`) sets
`max_execution_time: 0` and `max_memory_usage: 0` (no server-side caps), that "probe" becomes a
full unfiltered join across the entire multi-billion-row fact table (`s583_v982_NPMRDS_V6`) that
can run for **over an hour**, reading tens of billions of rows, with no error and no timeout.

**Root cause (already diagnosed and partially fixed, 2026-07-01)**: see
`planning/tasks/completed/dataWrapper-stale-fetch-race.md`. On mount, `state.comparisonSeries.config`
(Graph's dynamic route binding) and plain `state.filters` both start "unresolved" and only get
corrected by a `useEffect` in `usePageFilterSync.js` that runs *after* first render. Before that
correction lands, `buildUdaConfig.js`'s `activeComparisonSeries` check (~line 1084) treats
comparison series as inactive, so the *first* fetch has no route scoping at all. The 2026-07-01 fix
(`useDataLoader.js`'s `requestIdRef` generation counter) only prevents this stale unfiltered
response from **overwriting** a later correctly-scoped one once both resolve — it does **not**
cancel the query or stop it from being sent. A true preventive fix (extend the
`hasUnresolvedRequiredLeaf`/`requireResolved` gating already used for plain filter leaves,
`buildUdaConfig.js:411-429`, to also cover an unresolved comparison-series subscriber) was proposed
in that task and **explicitly declined by the user**, who chose to scope down to just the
correctness fix. True request cancellation was also investigated and not pursued — it would
require changes to the external `@availabs/avl-falcor` package (see that task file for the full
trace).

**What's new here (2026-07-08)**: repeated report-page reloads during old-reports-conversion
verification piled up **40 concurrent stray unfiltered queries** on the shared dev ClickHouse
server — elapsed times from 4 minutes to 78 minutes, up to ~14 billion rows read each. This hit
both a *new* CO₂ grid template and the *pre-existing* speed grid template identically, confirming
it's a general platform behavior, not specific to any one template. Closing the browser tab does
**not** cancel the server-side ClickHouse query (see "no request cancellation" above) — it keeps
running until it completes or is killed.

**If a report page hangs or a graph renders empty with no console error**: before assuming a
defect in whatever you just changed, check for stray long-running queries (read-only):
```sql
SELECT query_id, elapsed, read_rows, memory_usage, substring(query, 1, 80) AS query_snippet
FROM system.processes ORDER BY elapsed DESC
```
Queries with `filter: {}`/empty `filterGroups` in their generated SQL and multi-minute `elapsed`
are almost certainly stray probes, safe to `KILL QUERY WHERE query_id = '<id>'` — but always list
candidates and get explicit confirmation before killing anything on this shared server.

**Practical mitigation while debugging**: avoid repeated full-page browser reloads against report
pages (each fires a dozen+ concurrent queries); prefer a single load, or a narrowly-filtered direct
query (single TMC + a few dates/epochs) to verify a calculated column or template change.
