# Section data queries run several times per page load

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** done (2026-11-25, owner: the repeats are fixed (step 2) and the indexes built (step 3); the rest is under "Left for later") · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Written 2026-11-24, from the perf analysis of the fusion site on the hub (app `fusion`, pattern FUSION
2136825). Median page Complete on that pattern was 23 s on today's path and 19 s with islands; the cause is
the dataset queries, not how the page is delivered.

## What was measured

Each FUSION page loaded once, alone, against a test server that logged every SQL statement
(`PERF_SQLLOG` in `scratchpad/perf-rsc/harness_server.cjs`), preload on, islands off.

| Page | Queries on the events table | Distinct | Query time, summed |
|---|---|---|---|
| national-overview | 189 | 54 | 381 s |
| reports | 184 | 54 | 272 s |
| hazard | 261 | 22 | 194 s |
| explore | 85 | 27 | 165 s |
| export | 88 | 27 | 133 s |
| year-2024 | 70 | 23 | 101 s |

- Nearly all queries hit `open_fema_data.fusion_2401` in `hazmit_dama` (view 2401, AVAIL Fusion Events):
  1.6 million rows, 2.1 GB, no index. Every query is a full scan: 1.3 s alone, 2.9 s joined to ACS (view 1962).
- Every distinct query runs 2 to 11 times in one load. The repeats come in rounds: preload on the server at
  0.8 s (it gives up at 5 s; the queries keep running), then the browser at about 10 s, 25 s and 35 s.
- About half of the browser's own data requests are exact duplicates (59 of 122 on national-overview).
- 64 of the 161 queries on national-overview are `count(*)` versions of a data query (112 s of 381 s).
- The hazard page re-runs about 25 queries every 20 s for as long as it is open.
- The UDA route has no result cache; the pool is 10 connections and up to 20 queries queued.

## Steps (owner's order, 2026-11-24: 2, 3, 4 first, then 5; 1 after)

- [ ] **Step 1 (server result cache).** Cache dataset query results by SQL and values; share identical
      in-flight queries. Deferred by the owner until steps 2–5 are done.
- [x] **Step 2 (stop the repeats at the source).** Built 2026-11-24, not committed. What the repeats were:
  - [x] 2a (browser fetches each section two or three times). Three causes, all fixed:
    - Sync's first bootstrap and delta each end in `router.revalidate()` (`render/spa/dmsSiteFactory.jsx`).
      The loader ran the pattern's preload hook again in the browser, which re-ran every section's queries,
      twice, for rows nothing read. `dmsPageFactory` now tells the hook when the loader is re-reading the
      page already on screen (`{ reload }`, from `shownPath`); the page pattern skips the data preload then
      (view routes only; the editor still preloads).
    - An empty URL parameter (`?state=`, written by `initNavigateUsingSearchParams`) was read as `['']`,
      which differs from the registry's `[]`: every section reading the variable fetched again, and once
      more when a reload set it back. Now no values (`pages/_utils/index.js`, `api/preloadSectionData.js`).
    - The load effect re-ran for dependencies outside the fetch key while the first request was out, and
      sent it again. `useDataLoader` now skips a fetch whose key is already in flight.
  - [x] 2b (hazard page loop). `ui/components/table/components/Virtual.jsx` registered a second
        `ResizeObserver` once, with the first render's closure. On a table with no max height and no
        pagination, each appended page resized the container, the stale closure asked for page 2 again, and
        the table appended the same 8 rows every 1.4 s for as long as it was open. Observer removed.
  - [x] 2c, later pages: `onPageChange` passes the count it has (`knownLength`), so "load more" no longer
        re-runs the count query for every page.
  - [ ] 2c, first load (no separate count when the result is smaller than the page size). Not done:
        `getData` uses the count before it requests rows (the window, the empty-result fallback, five early
        returns), so it needs its own change and tests. It is about half of a page's remaining queries.
  - Also found: every band's SectionArray parsed every section's settings twice per render to read
    `hideSection` (31 bands x 107 sections, settings carrying preloaded rows): about 4 s of a 10 s main-thread
    freeze after hydration. Now `elementHidesSection` (`section_utils.js`): no parse unless the word is
    there, one parse per element. The remaining ~6 s is hydration spread over React, Lexical and section
    code; the islands path is what removes it.
- [x] **Step 3 (index the selective filters).** Created 2026-11-24 as managed indexes (log below). Expression indexes on `substring(geoid,1,2)`,
      `substring(geoid,1,5)` and `disaster_number` on `fusion_2401`. Production database: needs the owner's
      go-ahead for each statement.
- [ ] **Step 4 (less to read for full-table queries).** Covering index created 2026-11-24 (log below); the row estimate for the year filter is still wrong. Covering index or slim copy of the 14 used columns
      (about 94 of 736 bytes a row); `ANALYZE` with statistics on the year expression (the planner expects
      3,344 rows and gets 536,000 per worker, so it sorts on disk).
- [ ] **Step 5 (database memory settings).** `shared_buffers` is 128 MB and `work_mem` 4 MB (defaults); the
      server has 1 TB of RAM.

## Log

### 2026-11-24

Analysis done (above). Task doc created; step 2 (stop the repeats at the source) started.

### 2026-11-24 (later): step 2 (stop the repeats at the source) built

Browser data requests for one load of national-overview: 105 before, 45 after, none repeated. Hazard: the
endless loop is gone.

SQL on the events table for one load, before → after (queries / distinct):

| Page | Before | After |
|---|---|---|
| national-overview | 189 / 54 | 161 / 54 |
| explore | 85 / 27 | 59 / 27 |
| hazard | 261 / 22, never stops | 98 / 65, stops |
| export | 88 / 27 | 86 / 27 |
| state | 55 / 21 | 54 / 21 |
| year-2024 | 70 / 23 | 67 / 23 |
| county | 57 / 21 | 54 / 21 |
| reports | 184 / 54 | 162 / 54 |

The SQL totals fall less than the browser requests because the repeats that remain are not browser
refetches: the server's preload runs each query once and gives up at 5 s, the browser then runs it again;
several sections share one count query (their SQL is identical; only the request's `sectionId` differs);
and each section still runs a count beside its rows. Those are step 1 (server result cache) and the rest of
2c. The before run of the first three pages used a 180 s window and the after run a 5 s quiet rule, so those
rows compare roughly.

Open questions for the owner:
- A table with no pagination and no max height now loads every row, a page at a time (hazard's "top 8" list
  pages through all 359 rows in 45 requests). That is what the code always meant to do; the stale observer
  hid it. Stop auto-loading when the table can't scroll, or leave it and set pagination on such sections?
- Skipping the browser preload on a reload means a preload pattern's sections no longer pick up changed
  dataset rows through sync's revalidation (a non-preload pattern never did).
- `knownLength` on later pages: an editable table whose row count changes while paging keeps the first
  page's count until the next full fetch.

Tests: `tests/sectionHide.test.js` (3). Library suite 972 pass, the same 15 failures in 7 files as before.

### 2026-11-24 (evening): owner's answers; table first load is one page

Owner: a table must never load everything on its own; pagination off still means one page on load, and
loading everything takes an author setting a very large page size. Not worried about the reload preload
(question 2). Indexes: use the author-managed indexes; explicit permission to add them.

- `ui/components/table/components/Virtual.jsx`: the next page is asked for only on a scroll event of an
  element that really scrolls (the list, or the table container around it), never on mount, resize or row
  measuring. `ui/components/table/index.jsx`: the footer under a table with more rows than are loaded is a
  "Show more" button ("Loading…" while it fetches); theme keys `loadMoreWrapper`, `loadMoreStyle`,
  `loadMoreLoading` in `table.theme.jsx`. Checked on fusion's hazard page: 2 requests on load (count and
  rows), 1 per click (rows only), none on their own.
- Steps 3 and 4 (indexes), not yet created: `uda.sources.createIndex` needs a signed-in user with
  `update-source` on source 870, and this session has no token. Source 870 has five views of about 2.1 GB
  each (1396, 1529, 1648, 2069, 2401); a managed index is built on every one of them.
  Specs to create:
  - `{ expression: "substring(geoid, 1, 2)" }`
  - `{ expression: "substring(geoid, 1, 5)" }`
  - `{ columns: ["disaster_number"] }`
  - `{ columns: ["swd_begin_date", "fema_incident_begin_date"], include: ["geoid", "nri_category",
    "fema_incident_type", "disaster_number", "fusion_total_damage", "fusion_property_damage",
    "fusion_crop_damage", "deaths_direct", "deaths_indirect", "swd_end_date", "fema_incident_end_date",
    "event_id", "swd_population_damage_value"] }`, then `VACUUM (ANALYZE)` on the table so index-only scans
    are possible.

### 2026-11-24 (night): steps 3 and 4 (indexes) created

Owner gave explicit permission. Created through `uda.sources.createIndex` on the hub (5555), signed in with a
token minted per `skills/authenticating-the-dms-cli.md`. Two things learned:
- The call must name the site in the URL (`/graph?dms_app=fusion`) or the `X-DMS-App` header; in the POST
  body it is not read, the request has no site, and the answer is "You don't have permission".
- Four specs created at once gave five failed builds on the two oldest tables (concurrent
  `CREATE INDEX CONCURRENTLY` on one table). Re-creating each spec, one at a time, rebuilt them.

All 20 are valid (4 specs x views 1396, 1529, 1648, 2069, 2401): state and county expression indexes and
`disaster_number` at about 11 MB each, the covering index at 186–192 MB each. The table was already
all-visible, so index-only scans work without a vacuum.

One query alone on view 2401: national aggregate 1.37 s → 1.01 s (index-only scan; the rest is the sort the
bad row estimate picks); one state 123 ms; one county 6 ms; one disaster 1 ms.

Summed query time on the events table for one page load (after step 2 → with indexes):

| Page | Before indexes | With indexes |
|---|---|---|
| county | 51 s | 2 s |
| state | 52 s | 7 s |
| disaster | 20 s (first run) | 1 s |
| hazard | 93 s | 34 s |
| year-2024 | 97 s | 57 s |
| export | 146 s | 79 s |
| explore | 123 s | 90 s |
| reports | 225 s | 184 s |
| national-overview | 324 s | 217 s |

Not done: `ANALYZE` on the tables (gives the planner statistics for the two expression indexes; it now
expects 40 rows for a state and gets 46,825). The year filter mixes a date with a timestamptz, which cannot
be an expression index, so its estimate stays wrong until pages filter on a stored year or statistics are
added by hand.

### 2026-11-24 (night): no "Show more" button

Owner: a table is either paged or scrolled; with pagination off, treat it as paged with one page showing.
The "Show more" button and its two theme keys are removed. Pagination off now means: one page on load; a
table that scrolls (a max height) loads its next page when the reader scrolls it to the end, with
"Loading…" under it meanwhile (theme key `loadingMoreRows`); a table that doesn't scroll stays at one page.
Checked on fusion's hazard page (table doesn't scroll): page 1 only, no button, wheel-scrolling the page
loads nothing. Not checked in a browser: a table with a max height loading its next page on scroll.

### 2026-11-24 (late): ANALYZE; the year filter no longer mixes date types (builder source only)

- `ANALYZE` run on the five event tables (owner approved). The state index estimate is now right (46,840
  expected, 46,825 found).
- The year filter. `swd_begin_date` is a date and `fema_incident_begin_date` a timestamptz, so
  `coalesce(a, b)` was a timestamptz and `EXTRACT(YEAR …)` of it depends on the session time zone: not
  indexable, no statistics. New expression in the FUSION builder
  (`src/themes/fusion/FUSION-v5_3/scripts/live/data.mjs` `D` and `DSD`, and
  `src/themes/fusion/components/LossMap/constants.js` `SQL.date`):
  `coalesce(swd_begin_date, (fema_incident_begin_date AT TIME ZONE 'UTC')::date)`. Checked on view 2401: the
  FEMA values are all midnight UTC, the server runs in UTC, and year and month are the same on every one of
  the 1,609,124 rows. The data API accepts it and returns the same rows.
- Fifth managed index on source 870: `EXTRACT(YEAR from coalesce(swd_begin_date, (fema_incident_begin_date AT
  TIME ZONE 'UTC')::date))` (valid on all five views; 25 managed indexes in all), then `ANALYZE` again.
- One query alone with the new expression: national aggregate 0.52 s (1.37 s at the start, 1.01 s with the
  covering index and the old expression); its count 0.56 s; one year 0.31 s. The planner now expects
  666,818 rows per worker and hashes.
- NOT done: the pages still carry the old expression. They are builder-owned
  (`FUSION-v5_3/scripts/live/build.mjs`, drafts on production pattern 2136825, app `dms-site`, type `prod`,
  owner publishes), so they change by a rebuild, which needs the owner's go-ahead. `pages/disaster.mjs`
  lines 84 and 216 still spell the old coalesce inside `min(...)` for display; harmless, left as is.

### 2026-11-24 (late): what the database itself can still give (owner wants this before the server cache)

National aggregate (1.6 M rows, new year expression), one query alone:

| Setting or shape | Time |
|---|---|
| As it runs now (2 parallel workers) | 0.52 s |
| JIT off | 0.54 s |
| 6 parallel workers (session setting) | 0.31 s |
| No parallel workers (what a query gets once the server's 8 workers are taken) | 1.46 s |
| Slim copy, one row per event, year/month/hazard stored (temp table, no workers) | 0.77 s |
| Summary table, state x month x hazard x declared: 76,401 rows, 7 MB (temp table) | 0.025–0.04 s |

- The cost is per row (1.6 M rows per aggregate), not I/O: a slim copy does not beat the covering index.
- Server settings (all defaults): `max_worker_processes` 8, `max_parallel_workers` 8,
  `max_parallel_workers_per_gather` 2, `shared_buffers` 128 MB, `work_mem` 4 MB, `effective_cache_size`
  4 GB, `random_page_cost` 4. A page sends ~50 queries over a pool of 10: the 8 workers are shared by all
  of them, so most run with none.
- A state-level summary answers about 22 of national-overview's 38 distinct queries as they are written
  (rough count); the others count distinct disasters or counties, or read county rows, and need a finer
  summary or their own. `planning/fusion/tasks/current/fusion-county-hazard-summary-dataset.md` already
  proposes a county x hazard x period summary for ranks.
- The temp tables were session-only and are gone.

### 2026-11-24 (late): pages rebuilt as production drafts

Owner: rebuild the pages. `FUSION-v5_3/scripts/live/build.mjs` run against production (app `dms-site`, type
`prod`, pattern 2136825), no `--force`. Drafts rebuilt with the new date expression: year-2024,
national-overview, state, county, hazard, disaster, map, about, methodology, contact. Not rebuilt, because
their drafts were edited in the page editor since the last build: home (2136827) and explore (2136966).
Nothing is published; the published sections still carry the old expression. The hub's `fusion` copy is
unchanged. Next for the database side: the summary dataset,
`planning/fusion/tasks/current/fusion-events-state-month-summary-dataset.md`.

## Left for later (owner, 2026-11-25: task done, these not tasks yet)

Closed with the page-load performance initiative. Make a task of any of these when it matters.

- **2c, first load:** no separate count query when the result is smaller than the page size (about half of a
  page's remaining queries); `getData` reads the count before it asks for rows, so it needs its own change and tests.
- **Step 4:** the year filter's row estimate (statistics on the year expression); FUSION database work.
- **Step 5:** Postgres memory settings (`shared_buffers` 128 MB, `work_mem` 4 MB, 2 parallel workers per query on
  a 1 TB machine): an operations change for the owner.
- **Step 1:** the server result cache, deferred by the owner.
- The FUSION summary dataset that answers most national-overview queries is its own task
  (`planning/fusion/tasks/current/fusion-events-state-month-summary-dataset.md`).
