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
| 1722 | — | PM3/MAP21 calculations (LOTTR, TTTR, etc.). Calc code: `avail-falcor/dama/routes/data_types/map21/calcTtrMeasure.js` (peak/bin defs in sibling `constants.js`: `REPORTING_BINS`/`BIN_NAMES`, e.g. `AMP` = hours 6-9 weekdays, `PMP` = hours 16-19 weekdays). **Checked (2026-07-08): does NOT have per-day/per-epoch weighted delay** — LOTTR/TTTR are reliability ratios, no AADT weighting involved at all. |
| 2001 | — | Similar to 1722; not yet differentiated. |
| 1410 | — | Similar to 1722/2001 but "cleaner" per the user, ~100 columns. Possibly not every version has fully fleshed-out data — check row counts/nulls per version before relying on it. |
| — | tmc_avg_speedlimit | ClickHouse table in `avail` database (seen via `SHOW TABLES FROM avail`, 2026-07-08). Not yet registered as a DAMA source or investigated — may be a useful alternative/original source for `avg_speedlimit` (currently sourced via the 1946 join). |
| — | avg_monthly_tt | ClickHouse table in `avail` database. Not yet investigated. |
| — | mpo_boundaries | ClickHouse table in `avail` database — geographic, likely unrelated to travel-time/delay/emissions calcs. Not yet investigated. |
| — | npmrds (table literally named this, inside `avail` DB) | **Distinct from source 583's actual fact table** (`clickhouse.npmrds.s583_v982_NPMRDS_V6`, a different CH database despite the similar name) — not yet investigated, don't assume it's the same data. |

**Checked and ruled out as a delay/CO2-weighting substitute (2026-07-08)**: FHWA PHED (Peak Hour
Excessive Delay), computed by `avail-falcor/dama/routes/data_types/map21/calcPhed.js` using a
*different* static distribution table (`CATTLabTrafficDistributionProfiles`) plus average-vehicle-
occupancy and directional AADT. PHED is a **single aggregate annual number per TMC**
(`all_xdelay_phrs` etc.), not a time series — cannot substitute for a "Hours of Delay by day" bar
graph or per-period CO₂ line graph.

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
