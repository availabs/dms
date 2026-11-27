# Live sections: no wait before the first fetch, preload for filter options, no suspended first render

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** built and measured 2026-11-25, not committed · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

From the browser profiles of FUSION with islands, preload and the result cache all on (`uda-result-cache.md`,
"Browser profiles with everything on"). Queries were no longer the cost: after first paint the page spent its
time in fixed waits. The owner picked three of the five candidates (2026-11-25): candidate 1 (no debounce on
the first fetch), candidate 2 (preload for TileMap rows and Filter options) and candidate 4 (island scripts
in one wave).

## What was found and built

- [x] **Candidate 1 (no debounce on the first fetch).** `dataWrapper/useDataLoader.js` waited `DEBOUNCE_MS`
      (300 ms) before every request, the first included. A section that has never loaded now asks at once
      (still through a 0 ms timeout, so a page-filter sync in the same commit cancels it and asks once). The
      filter UI's option load (`RenderFilters.jsx`) had the same 300 ms and gets the same rule.
- [x] **Candidate 2 (preload for TileMap rows and Filter options).**
  - The filter UI's option loading moved out of its effect into
    `dataWrapper/components/filters/loadFilterOptions.js` (`loadFilterOptions`, `filterOptionsKey`,
    `withPageFilterValues`), unchanged in what it asks.
  - `api/preloadSectionData.js` reads the option lists with a section's rows, for any preloading section that
    shows filter controls, and stores them as `display.filterOptions: { key, at, options }`. The key is the
    filters they were read for, with the page's variables applied as the filter UI applies them.
  - `RenderFilters.jsx` starts from those lists and skips its load while its own key equals theirs; lists
    older than two minutes (a copy saved with the settings) are ignored.
  - The Filter section (`FilterComponent.config.js`) and FUSION's TileMap
    (`src/themes/fusion/components/TileMap/index.js`, dms-template) set `preloadData` and `trimForView`.
  - An empty preloaded result now counts as loaded (`useDataLoader.js`): a section whose preload found no
    rows asked again in the browser.
  - Preload passes the component's `optionsOnly` to `getData`, as the section itself does.
- [x] **Candidate 4 (island scripts in one wave), as it turned out.** The later script waves were not the
      cost: each came from cache in about 15 ms. The 200 ms with nothing running was React holding content
      back for 300 ms after a Suspense fallback. A live Graph suspended on its chart chunk on first render,
      and `SectionIslands` itself was a `React.lazy`. `render/islands/IslandHost.jsx` now fetches the live
      sections' lazy chunks (`preloadSectionComponents`, exported from `islandCode.js`) with the island code
      and renders `SectionIslands` from the loaded module, so nothing suspends.
- [x] Tests: `packages/dms/tests/filterOptionsPreload.test.js` (6). Library suite 998 pass, the same 15
      failures in 7 files as before.

## Measured (FUSION, test server 5558, islands, preload and cache on; build `reload2` → `first1`)

One warm load, profiled:

| | hazard | national-overview |
|---|---|---|
| Server response | 0.16–0.27 s → 0.24–0.37 s | 0.32–0.38 s → 0.46–0.60 s |
| Live sections mounted | 1.05 s → 0.85 s | 1.50 s → about 1.45 s from a 0.5 s response |
| Dataset requests from the browser | 2 → 0 | 10 → 0 |
| Last change to the page | 1.40 s → 1.15 s | 1.95 s → about 1.55 s from a 0.5 s response |

The server response is slower because the server now runs what the browser ran after the page was up: the
TileMap's rows and each filter control's count and list.

## Not done

- Preload tags for the later script waves (the theme's chunk, the sync modules, the chart chunks): no gain
  from cache, some on a first visit. The server would need the theme-name-to-chunk mapping.
- A Filter section still asks the dataWrapper for one row and a count it never shows; preload now runs that
  on the server. Not asking at all needs a registry flag and a look at what reads `state.data` for a Filter.
- The remaining browser requests on these pages are the sections' source metadata (`useDataSource`).
- Sites without the result cache pay the moved queries in the server response; not measured.
- Not checked in a signed-in browser or in the editor.

## Full test and the server cost (2026-11-25, 21:46)

14 pages, five runs, one at a time: `2026-11-25-2146-fusion-full-first1-cache-on` against
`2026-11-25-2110-fusion-full-reload2-cache-on`.

- Median warm Complete 1.44 → 1.27 s (7 pages faster, 1 slower, 6 the same); median click 0.60 → 0.55 s
  (1 faster, 4 slower); 8-click journey 5.32 → 5.16 s.
- Warm Complete: home 1.22 → 0.60, map 1.11 → 0.77, hazard 1.49 → 1.29, explore 1.56 → 1.36, state 1.42 → 1.24,
  year-2024 1.50 → 1.31, county 1.46 → 1.32, national-overview 2.16 → 2.00, reports 2.06 → 1.85. Home click
  0.53 → 0.19.
- Clicks slower: county 0.70 → 0.80, explore 0.71 → 0.82, year-2024 0.72 → 0.86, disaster 0.21 → 0.28.
- Browser data requests per warm load: national-overview 14 → 4, explore 6 → 4, hazard 5 → 3, home 4 → 2.

Server response, the two builds started in turn and each page asked nine times back to back (median):

| Page | `reload2` | `first1` |
|---|---|---|
| county | 0.22 s | 0.22 s |
| hazard | 0.15 s | 0.16 s |
| home | 0.07 s | 0.08 s |
| year-2024 | 0.23 s | 0.32 s |
| explore | 0.22 s | 0.34 s |
| national-overview | 0.31 s | 0.46 s |

- The 0.10–0.15 s is on the pages with Filter sections: the option lists read on the server. One of
  national-overview's is a list of 3,265 places, 102 KB in the page's islands data.
- TileMap's rows cost about 10 ms (hazard, home).
- A click's time is mostly the server's render of the destination, so those pages' clicks got slower.
- Open: where the 0.10–0.15 s goes (the count before each list, the 3,265-row list, or the server rendering
  the control) has not been profiled. If it can't be brought down, filter options are better left to the
  browser and the first two changes kept.
- Also seen: queries on the county summary table (`s14953_v15828`) are not served from the result cache
  (`notCached.noCounters`), so pages over it run about 20 statements per render.

## The server cost, profiled and removed (2026-11-25, 22:00)

The 0.10–0.15 s was not the filter options. A CPU profile of the server rendering national-overview twenty
times (inspector on the test server, `srvprof.mjs` in the session scratchpad): 484 ms of CPU per render, of
which 139 ms in falcor's `getCache` (`_copyCache`, `isInternalKey`, `cloneBoxedValue`), called from
`dmsDataLoader`. The preload itself was 13 ms.

- `api/index.js` took `falcor.getCache()`, a copy of the WHOLE cache, twice for every load: once for a
  `length` nothing reads (it looked under a `json` key the copy doesn't have), once to read the rows back.
  On the server signed-out renders share one model, so the copy grew with everything any page had loaded;
  the 3,265-option list made it bigger. The browser pays the same per request.
- [x] A dataset (`uda`) request now reads its own paths back (`api/udaRows.js` `udaRowsFromCache`, which
      strips the `$size` falcor adds to a path-scoped read so the rows are the same objects as before). The
      dead `length` copy is gone. Page and site loads still take the whole copy: `processNewData` reads the
      whole `byId` map.
- [x] Tests: `packages/dms/tests/udaRowsFromCache.test.js` (3), against the whole-cache copy. Library suite
      1,001 pass, the same 15 failures in 7 files.

Server response, builds started in turn, nine requests each (median), `reload2` → `first1` → `rows1`:
national-overview 0.31 → 0.47 → 0.32 s; explore 0.22 → 0.35 → 0.15; year-2024 0.23 → 0.33 → 0.17;
state 0.19 → 0.27 → 0.13; county 0.22 → 0.22 → 0.21; hazard 0.16 → 0.16 → 0.15. Server CPU per render of
national-overview 484 → 368 ms.

Full test, run `2026-11-25-2209-fusion-full-rows1-cache-on` against `reload2`:

- Median warm Complete 1.44 → 1.09 s (8 faster, 0 slower); median click 0.60 → 0.47 s (9 faster, 0 slower);
  8-click journey 5.32 → 4.04 s.
- Warm Complete: national-overview 2.16 → 1.56, hazard 1.49 → 1.12, explore 1.56 → 1.16, county 1.46 → 1.14,
  state 1.42 → 1.09, year-2024 1.50 → 1.08, home 1.22 → 0.58, map 1.11 → 0.79, reports 2.06 → 1.46.
- Against the morning's baseline (preload off, cache off): median warm 1.73 → 1.09 s, median click
  1.02 → 0.47 s, journey 10.09 → 4.04 s.

Still open:
- The first one or two browser loads after a server start take 1.5–1.8 s to respond while curl requests to
  the same pages are fast. Not traced.
- The whole-cache copy for page and site loads.

## Full nine-pattern sweep (2026-11-25, 22:32 to 00:00)

The sweep from the start of this work (`scratchpad/perf-rsc/run_baseline.sh`, same pages and journeys, three
pages at a time), runs `*-sweep_1125` against the 2026-11-20 `*-baseline` runs. Build `build-5556-rows1` (the
uncommitted tree), islands on, result cache on, each pattern's own preload setting. All nine runs ended with
return code 0. The sweep took 1 h 28 min; the baseline took about 3.3 h.

| Pattern | Pages | Warm Complete (median page) | Click Complete (median page) | Journey |
|---|---|---|---|---|
| availabs | 6 | 4.62 → 1.03 s | 1.14 → 0.28 s | 7.34 → 0.92 s (2 clicks) |
| TransportNY landing | 1 | 2.04 → 0.49 s | none | 2.66 → 0.57 s (first load only) |
| TransportNY status | 3 | 2.58 → 1.09 s | none | 10.60 → 0.63 s (first load only) |
| Freight Atlas (v2) | 4 | 3.85 → 1.36 s | 0.78 → 0.53 s | 6.62 → 3.96 s (3 clicks) |
| npmrds2 | 5 | 3.49 → 1.36 s | 0.46 → 0.07 s (1 page) | 2.61 → 0.95 s (first load only) |
| weatheranalytics | 25 | 2.34 → 0.74 s | 0.45 → 0.14 s | 4.28 → 3.88 s (7 clicks) |
| MitigateNY county template | 45 | 28.90 → 8.25 s | 10.15 → 9.22 s | 16.47 → 6.84 s (8 clicks) |
| platform docs | 90 | 3.11 → 0.88 s | 0.16 → 0.10 s | none |
| MitigateNY 2025 | 159 | 5.37 → 0.96 s | 1.02 → 0.65 s | 21.18 → 6.90 s (8 clicks) |

- Warm loads: 331 of 338 pages faster, 1 slower (MitigateNY 2025), 6 the same.
- Clicks slower on 16 pages: 13 in MitigateNY 2025, 2 in platform docs, 1 in the county template. Not looked at.
- The county template's clicks barely moved: 31 of 42 pages the same, median still 9.22 s.
- Result cache over the sweep (`logs/sweep_1125-cache-stats.json`): 27,548 queries, 5,646 served from the
  cache, 1,345 shared with a query in flight, 0 mismatches. Not eligible: 16,208 with no tables to watch,
  1,795 on editable datasets.
- Every baseline run loaded the full site with sync; every sweep run was served as static HTML with islands.

## County template: why it looked slow in the sweep (2026-11-26)

**Most of it was the test browser.** The runner's headless Chrome draws WebGL in software (SwiftShader), and
the template's slow pages all have Map sections. Hail page, one warm load alone: main thread busy 15.7 s in
software against 2.6 s on the GPU; 10.8 s of the 15.7 was MapLibre's `_setupPainter`. The 11-20 baseline was
measured the same way, so both sides of 28.90 → 8.25 s are inflated.

- [x] `DMS_PERF_CHROME_ARGS` (`packages/dms-server/src/perf/runner.mjs`, `documentation/dms-server-env.md`):
      extra Chrome switches for a run. `--use-angle=gl-egl --ignore-gpu-blocklist --enable-gpu` uses the GPU.
- Re-run with the GPU, same pages (`mny_countytemplate-gpu_1125` against `-sweep_1125`): median warm Complete
  8.25 → 3.01 s, median click 9.22 → 2.30 s. The 18 hazard pages: 4.5–5.2 s warm, 2.4–4.6 s click. The two
  annex pages: 5.9 and 7.6 s warm (9.7 MB of HTML each).

**What is really slow: the server's render of a hazard page, 1.4–1.8 s every time** (also most of a click).
One render of hail: 373 ms of server CPU, 235 SQL statements, the rest waiting on three of them.

- `gis_datasets.s12453_v13526_actions_cleaned` (19,409 rows, 112 MB, no index on anything the page filters
  by) is scanned whole three times, 0.54–0.62 s each: a Card's sums, and a Spreadsheet's count then its rows,
  one after the other. That chain alone is 1.15 s. The plan is a sequential scan over 112,000 buffers. The
  dataset is editable, so the result cache does not hold it.
- `dms_mny.data_items__s1346449_v1346450_jurisdictions`: one lookup of 15 rows, 0.35 s.
- 171 of the 235 statements are the same three source lookups in `dms_mny.data_items` (`config`, `id`,
  `version_type`), 57 times each per render, 1.4 s summed across connections.

Not traced: about 1.5 s on each hazard page that is neither server, script, data nor files (the runner's
`other`); the annex pages' 9.7 MB.

## County template: the three server fixes (2026-11-26, built, not committed)

The owner asked for all three items from the trace above.

- [x] **A section's count and rows go out together** (`dataWrapper/getData.js`). A page of rows takes its
      window from the pager and is cut to the count when both are back; a load of all rows still waits for
      the count. An empty result now costs one rows query it used to skip. Tests:
      `packages/dms/tests/getData.countWithRows.test.js` (6).
- [x] **The DMS source lookup is shared** (`dms-server/src/routes/uda/utils.js`, `readDmsSource` /
      `dmsSourceOf`): callers asking for the same dataset while a lookup is in flight share it; with the result
      cache on, the answer is kept for the cache's window, as a view's table already was. With the cache off
      only the in-flight sharing applies (not measured).
- [x] **Indexes on the actions table**, hazmit_dama on mercury, built `CONCURRENTLY` 03:42 and analyzed:
      `perf_s12453_primary_hazard_idx`, `perf_s12453_secondary_hazard_idx`, `perf_s12453_tertiary_hazard_idx`
      (each 152 kB; CREATE and DROP in `scratchpad/perf-rsc/indexes/indexes3.tsv`, log `indexes3.log`).
  - Not the indexes first proposed. Source and county would not have helped: 81% of rows are `Local`, and the
    county filter is an `EXISTS` over a JSON array, which a btree can't serve. The time was Postgres reading
    each row's 2.6 KB `data` column out of TOAST for `data->>'source_id'` (355 of 610 ms).
  - With the three hazard columns indexed the planner ORs three bitmap scans and reads only matching rows:
    Hail 614 → 12 ms. Flooding is 55% of the table, so it only drops to 268 ms.

Server response, hail page, test server 5556 (build `count1`, result cache on): 1.41–1.57 s → 0.69–0.71 s;
SQL statements per render 235 → 91; source lookups 171 → 18. Flooding 0.66 s, hurricane 0.65 s.

Library suite: 914 pass, the same 15 failures in 7 files. `tests/test-uda.js`: 126 pass, 2 fail, both on
`update-source` grants (not this change); `test-uda-result-cache.js` 33 pass.

Left, found on the way:
- The jurisdictions lookup is still 0.32 s for 15 rows, with its index used. The rows average 217 KB and
  reach 9.3 MB: `lhmp_other_hazards` and `lhmp_risk_additional` hold whole annex chapters as rich text, and
  reading `geoid` and the name means reading the row. Not index-fixable. The same rows are the annex pages'
  9.7 MB of HTML.
- Pages that filter the actions table by county only (not by hazard) still scan it whole.

Full pattern, GPU, same 45 pages (`mny_countytemplate-count1_gpu` against `-gpu_1125`, three pages at a time):
median warm Complete 3.01 → 2.74 s (14 faster, 1 slower); median click 2.30 → 1.60 s (17 faster, 0 slower);
8-click journey 6.90 → 3.45 s. The 18 hazard pages: server phase 1.2–1.8 s → 0.85–1.19 s, warm 4.5–5.2 →
3.9–4.9 s, click data phase about 1.9 → 0.9 s. Built environment warm 4.33 → 3.37 s, high hazard dams
3.53 → 2.46 s (their sections' browser fetches, now count and rows together). The annex pages did not move
(5.98 and 6.98 s). Slower: `home_legacy` warm 1.26 → 1.48 s, `the_local_environment` click 0.43 → 0.59 s; not
looked at. A hazard page's warm load is still about 4.3 s with about 1 s of server: the rest is the maps and
the 1.5 s the runner can't attribute, not traced.
