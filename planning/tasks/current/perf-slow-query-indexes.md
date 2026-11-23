# Indexes for the slowest queries left after the RSC work

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** indexes built and measured (2026-11-22); three proposals await the owner's decision · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Follow-up 2 from the RSC measurement (`rsc-view-pages.md`, 2026-11-22), the same kind of work as S7a (indexes on
the slowest data sources, "Indexes added" in that doc). No code changes.

## Objective

Make the slowest remaining queries fast with indexes, built `CONCURRENTLY` (no lock on readers or writers),
each listed with its `DROP INDEX CONCURRENTLY` so it can be removed.

## Targets (from the final runs' visits, `si-rsc-on`)

With RSC the server runs a page's queries before it sends the first byte, so a slow query now delays the
whole page.

| Where | Symptom | Time |
|---|---|---|
| `/status/status` | first byte | 3.6 s |
| County Template jurisdictional annexes | first byte | 2.6–2.9 s |
| MitigateNY snowstorm risk profile | first byte | 2.0–2.5 s |
| `hazmit_dama` view 13526 options (MitigateNY built environment) | browser request | ~1.2 s |
| `hazmit_dama` view 1648 options (MitigateNY drought) | browser request | 1.5–1.8 s |

## Method

1. Find each target's SQL (dms-server log / `pg_stat_activity` sampling while loading the page).
2. `EXPLAIN (ANALYZE, BUFFERS)` it; decide whether an index fixes it (an option list's `count(DISTINCT)` full
   scan may not be index-fixable; a statewide aggregation may need a covering index, as S7a's).
3. Build the chosen indexes `CONCURRENTLY`, one at a time; record name / CREATE / DROP in
   `scratchpad/perf-rsc/indexes/indexes2.tsv` and the build log in `indexes2.log`.
4. Re-run `EXPLAIN ANALYZE` (before → after) and record it below.

## Checklist

- [x] SQL found for each target (2026-11-22; `pg_stat_activity` sampled every 100 ms while loading each page
      from the 5556 test server, and the browser requests captured from a headless load; see "Where the time went")
- [x] EXPLAIN before; index chosen or "not index-fixable" with the reason
- [x] Indexes built, listed with their DROPs (`scratchpad/perf-rsc/indexes/indexes2.tsv`, log `indexes2.log`)
- [x] EXPLAIN after; table below filled in
- [x] Measure the affected pages (`dms perf`, `chain_followups.sh` run A, 2026-11-22; "Measured" below)
- [ ] Decide the proposals below (target 1 `/status/status`: the VACUUM; target 2 jurisdictional annexes: the annex
      text in the list rows; target 4 built-environment options: the redundant `array_contains` filter)

## Where the time went (2026-11-22)

| Target | Page (site) | SQL | Source |
|---|---|---|---|
| 1 (`/status/status` first byte) | `tny.localhost/status/status` (TransportNY status) | `SELECT count(1) FROM transcom.s956_v1947_transcom_main_v2`, no filter: a data section's row count (npmrds DB) | transcom view 1947, 3.9 M rows, 30 GB heap |
| 2 (jurisdictional annexes first byte) | `countytemplate.mny.localhost/the_plan/jurisdictional_annexes` (County Template, county 36105) | the annex list's count, its page of rows (`ORDER BY municipality_name LIMIT 23`), and the `meta_lookup` of `geoid` → `municipality_name` (`data->>'geoid' = ANY(…)`) | `dms_mny.data_items__s1346449_v1346450_jurisdictions` (Jurisdictions, view 1346450, hub DB) |
| 3 (snowstorm risk profile first byte) | `mny.localhost/assess_risk/natural_hazards/snowstorm/risk_profile` (MitigateNY) | ~13 queries (counts, sums by month / year / declared, top-10 events), all `substring(geoid,1,2) = '36' AND coalesce(fema_incident_type, nri_category) = 'winterweat'` (some also `disaster_number = 'Non-Declared'`) | `open_fema_data.fusion_1648` (hazmit_dama view 1648): 2 GB, 1.56 M rows, **no index at all** |
| 4 (view 13526 options, built environment) | `mny.localhost/know_the_environment/built_environment/energy` | six browser requests (`length` and `distinct` of county / jurisdiction / lead agency, the Card's filter lists), all `array_contains(<16-way CASE over data->>…>, 'power (…)') AND data->>'power_microgrids_emergency_power_for_critical_facilities' = 'x'` | `gis_datasets.s12453_v13526_actions_cleaned` (19 k rows; `data` jsonb mostly TOASTed) |
| 5 (view 1648 options, drought) | `mny.localhost/assess_risk/natural_hazards/drought` | `length` and `distinct substring(geoid,1,5)` (the county list) with `state = 36, disaster_number = 'Non-Declared', category = 'drought'`, plus the page's server-side queries on the same filter | `open_fema_data.fusion_1648`, as target 3 |

## Indexes added (2026-11-22 12:11–12:14, hub DB and hazmit_dama on mercury)

All built `CONCURRENTLY`, each followed by a plain `ANALYZE` of its table; every one is in
`scratchpad/perf-rsc/indexes/indexes2.tsv` (db, name, CREATE, `DROP INDEX CONCURRENTLY`), built by
`build_indexes2.sh`, log `indexes2.log`. All `indisvalid = true`.

| Index | On | For | Size | Query before → after (EXPLAIN ANALYZE) |
|---|---|---|---|---|
| `perf_fusion1648_state_cat_dn_idx` | `open_fema_data.fusion_1648` `((substring(geoid,1,2)), (coalesce(fema_incident_type, nri_category)), disaster_number)` | targets 3 (snowstorm) and 5 (drought): every sampled query on the table | 11 MB | each query 0.4–0.45 s alone (0.5–1.75 s under the page's own concurrency; full parallel scans of 2 GB) → 8–64 ms; drought options `length` / `distinct` 0.44 s → 2 ms |
| `perf_jur1346450_county_geoid_idx` | Jurisdictions split table `((data->>'county_geoid'))` | target 2 (jurisdictional annexes): the annex list and its count | 32 kB | list 1.18 s → 0.66 s, count 0.72 s → 0.25 s |
| `perf_jur1346450_geoid_idx` | same, `((data->>'geoid'))` | target 2 (jurisdictional annexes): the `geoid` → name lookup | 64 kB | 0.71 s → 0.23 s |
| `perf_s12453_power_idx` | `gis_datasets.s12453_v13526_actions_cleaned` `((data->>'power_microgrids_emergency_power_for_critical_facilities'))` | target 4 (view 13526 options): the energy page's filter lists | 152 kB | 1.05 s → 0.76 s (the rest is the `array_contains` filter, below) |

First-byte check (plain GETs to the 5556 server, not a perf run): jurisdictional annexes 2.6–3.0 s → 1.1–1.5 s;
snowstorm risk profile 2.0–2.4 s → 1.1 s (no statement over 150 ms is left on it from `fusion_1648`; what remains
over 150 ms is S7a's parcel queries, ~0.25 s); drought 1.3–1.8 s → 0.13 s. The owner's `dms perf` runs are the
measurement.

The first fusion index was `(category, state, disaster_number)` and was replaced (dropped `CONCURRENTLY`, 12:14):
for `GROUP BY category, state … LIMIT 1` Postgres 16 chose an ordered index scan that can't use the second
column's `= ANY(…)` as an index condition, read all 204 k `winterweat` rows of every state, and took 0.45 s. With
state first no index order matches that `GROUP BY`, and every query takes the bitmap scan.

## Measured (2026-11-22)

Old build `rscsi2` on 5556, before (`p1rm-rsc-on` / `si-rsc-on`, the RSC task's final runs) → after the indexes
(`idx2-rsc-on` / `si-idx2-rsc-on`), warm visits, median of 5; logs `scratchpad/perf-rsc/logs/followups/*-old-vs-A.txt`:

| Page | First byte (signed out / in) | Complete (signed out / in) |
|---|---|---|
| MitigateNY drought (target 5 (drought options)) | 1.43 → 0.35 s / 1.70 → 0.33 s | 4.72 → 2.18 s / 4.37 → 2.12 s |
| MitigateNY snowstorm risk profile (target 3 (snowstorm)) | 2.28 → 1.25 s / 2.46 → 1.45 s | 5.83 → 5.02 s / 6.17 → 4.96 s |
| MitigateNY energy (target 4 (built-environment options)) | 1.41 → 0.96 s / 1.60 → 1.05 s | 5.15 → 4.85 s / 5.49 → 4.88 s |
| County Template jurisdictional annexes (target 2 (annexes)) | 2.67 → 1.32 s / 2.92 → 1.49 s | 3.52 → 2.18 s / 3.72 → 2.44 s |
| `/status/status` (target 1 (transcom count), no index) | 3.59 → 4.25 s / 3.63 → 3.76 s | unchanged within noise |

All 84 warm visits: first byte summed 50.6 → 44.7 s, Complete summed 197.4 → 184.1 s.

### Not index-fixable (proposals)

- **Target 1, `/status/status` (3.5 s).** It already is an index-only scan (of the 48 MB
  `idx_s956_v1947_region_lookup`), but it makes 2.73 M heap fetches for 3.9 M rows: the visibility map is stale.
  The table has **`autovacuum_enabled=false`** (with `fillfactor=85`), 10.1 M updates and 820 k dead rows since
  the stats reset, and no vacuum on record; no index can skip the heap without the visibility map. Fix: a plain
  `VACUUM (PARALLEL 0, ANALYZE) transcom.s956_v1947_transcom_main_v2` (not run: outside this task's allowed
  writes; 30 GB heap plus nine indexes, so a heavy I/O run best done off-hours, and after each transcom ETL load,
  since autovacuum is off, presumably on purpose for the ETL's batch updates). Expected: the count becomes a pure
  index-only scan of ~48 MB, well under 0.5 s. The table being 30 GB for 3.9 M rows is bloat from those updates
  (`VACUUM FULL` / `pg_repack` in a maintenance window). App-side alternative: an unfiltered `count(1)` of a
  4 M-row table on every view needn't be exact (planner estimate, or cache the length).
- **Target 2 (jurisdictional annexes), remaining 0.25–0.66 s per query.** The Jurisdictions rows carry the whole annex text in `data`:
  1,662 rows, 1 MB heap but 450 MB total (avg 217 kB of jsonb per row, max 9.3 MB; `lhmp_other_hazards` alone
  is 6.4 MB on one row), and every `data->>` detoasts the whole value. The indexes cut the rows read from 1,662
  to 23; the rest is those 23 rows' size. Fix: keep the annex text out of the rows these lists read (a separate
  source, or a narrow view of the list columns).
- **Target 4 (view 13526 options, built environment), remaining 0.73 s.** The `array_contains` filter's column is a 16-way `CASE` over `data->>…`, and
  the SQL that `buildLeafSQL` emits for `array_contains` (`routes/uda/utils.js`) evaluates it three times per row
  (`pg_input_is_valid`, `jsonb_typeof`, the cast), each `data->>` detoasting `data`: 0.6 ms a row × 1,196 rows.
  An index can't serve `EXISTS (… jsonb_array_elements_text …)`. On these sections it is **redundant**: the second
  filter (`data->>'power_…' = 'x'`) implies it; without it the query takes 2.4 ms. Fixes: drop the redundant
  filter from the sections (an authoring change, page by page), or have the server evaluate the column once
  (e.g. a `LATERAL` subselect), a dms-server change. The new index serves only the energy page's key; the
  other built-environment pages filter other keys (a 150 kB index each if wanted).
