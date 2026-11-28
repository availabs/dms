# Server result cache for dataset (UDA) queries

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** in progress: phases 1 and 2 built and measured 2026-11-25 (in-flight sharing, serving from memory for external Postgres sources that are not editable), not committed, off by default; ClickHouse, the count twin and turning it on anywhere remain · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

This is step 1 (server result cache) of
[section-data-query-repeats.md](./section-data-query-repeats.md), which the owner deferred until the repeats,
indexes and summary datasets were done. They are (2026-11-25). The plan was also published as an HTML page
for the owner; this file is the source of truth.

**Prerequisite, done 2026-11-25 (uncommitted, not deployed):**
[source-editable-flag-everywhere.md](./source-editable-flag-everywhere.md). Every source, internal and external,
now carries `isEditable` in the same place (`metadata.isEditable`), new sources get a value when they are
created, and the backfill has run on every database configured here. The cache's gate reads that one flag:
**only queries whose every table belongs to a source with `isEditable` not true are kept** (owner, 2026-11-25).

## Objective

Dataset queries that the server has already answered, and whose tables have not changed, are answered from
memory. Identical queries that arrive while one is running share its result.

## What was measured (2026-11-25, FUSION on the hub data, build `nav1`, each page loaded alone, twice)

| Page | Data queries per load | Distinct | Database time, summed | Repeated on the second load |
|---|---|---|---|---|
| reports | 177 | 54 | 16.8 s | all |
| national-overview | 59 | 54 | 5.3 s | all |
| hazard | 23 | 22 | 2.3 s | all |
| state | 21 | 20 | 0.5 s | all |

- 214 of the 559 data queries in the run were the `count` twin of a row query (13.7 s of database time).
- In this run the server rendered the pages without their data (34 live sections on national-overview; 4 in
  the profile taken 25 minutes earlier on the same build), so every data query came from the browser. Cause
  not found; other uncommitted work was changing `render/ssr2` at the time. The counts above do not depend
  on it, the split between server and browser does.

## Where it goes

`routes/uda/query_sets/postgres.js` runs every dataset query at four `db.query` calls (rows and count, each
with a fan-out variant). The cache wraps those calls. That is below the route's read check
(`canReadView` in `uda.route.js`), so a cached result is never handed to a reader the check refused, and it
serves the browser's `/graph` requests and the server render alike.

## Design (as built)

- **Key:** the database, the SQL text, the bound values.
- **In-flight sharing:** a query whose key is already running waits for that run. Not gated: it applies to
  editable sources too, since nothing is kept.
- **Only sources that are not editable.** `getDataTableFromViewId` (`routes/uda/utils.js`) already read the
  source's metadata to resolve a view's table; it now also returns `isEditable`, and `getEssentials` carries
  it. `cacheScope` (`query_sets/postgres.js`) names every table a query reads, the queried view and each
  joined one, and refuses when any of them is editable, is an internal (DMS) dataset, is a federated join
  source, or lives in another database. A refused query is never kept.
- **Internal datasets are not cached**, editable or not: their tables and flag live in the DMS database, and
  `cacheScope` does not follow them. An internal source switched to not editable could be cached later with
  the same counters; not built.
- **Freshness:** each entry records a version of every table it read: `relfilenode` and the insert, update
  and delete counters from `pg_stat_all_tables`, with the database's `stats_reset`. One probe per database
  reads the versions of the tables in use, at most once per window (default 5 s). An entry whose versions
  differ is dropped. A source that is not editable still changes when a pipeline or ETL task rewrites its
  table, which is what this catches.
- **The view lookup is remembered for the window** while the cache is on (`getDataTableFromViewId`), so a
  query answered from memory does not start with a metadata read. Turning Editable on is therefore seen
  within the window; from then on the source is not kept, and its writes move the counters anyway.
- **Ceiling:** every entry expires after a maximum age (default 10 minutes).
- **Not cached:** SQL that reads the clock (`now()`, `current_date`: the `time` filter), relations with no
  counters (database views, foreign tables, partitioned parents), answers over 2 million characters, failed
  queries, SQLite, ClickHouse.
- **Storage:** this process's memory, behind a four-method store (`createMemoryStore`): least recently used
  first out under a budget (default 256 MB). The owner asked about keeping it in Postgres instead (an
  `UNLOGGED` key-value table, the "Postgres as Redis" pattern; there is no built-in Redis mode). Not chosen
  for now: a hit would cost a round trip on the same 10-connection pool the cache is there to relieve, and it
  needs write access to each DAMA database. It would give sharing between processes and survive a restart;
  the store interface is where it would plug in.
- **Switches:** `DMS_UDA_CACHE` (`off`, the default / `shadow` / `on`), `DMS_UDA_CACHE_MB`,
  `DMS_UDA_CACHE_WINDOW_MS`, `DMS_UDA_CACHE_MAX_AGE_MS` (`documentation/dms-server-env.md`).
- **Counters:** `GET /admin/uda-cache` and `POST /admin/uda-cache/clear`, signed in (`src/index.js`).

## Phases

- [x] **Phase 1 (count and share).** `routes/uda/resultCache.js`; the four call sites in
      `query_sets/postgres.js` go through `cachedQuery`. `shadow` mode keeps answers, always answers from the
      database, and compares. Not done: the counters in `dms perf` reports.
- [x] **Phase 2 (serve from memory, external Postgres sources).** Table versions, the probe, the ceiling, the
      budget, the Editable gate.
- [ ] **Phase 3 (ClickHouse).** Version from `system.parts`. Not started.
- [ ] **Phase 4 (the count twin).** Not started; with the cache on, a repeated count is a hit like any other,
      so this only helps first loads.
- [ ] **Phase 5 (turn on).** Nothing is switched on: no `.env` file was changed. Suggested order: `shadow` on
      the hub for a day (watch `mismatches` at `/admin/uda-cache`), then `on`; mercury after. A
      `documentation/` page is not written.

## What shadow mode found (FUSION, ten pages loaded twice, 921 dataset queries)

- 694 would-be hits, 38 shared runs, 0 real mismatches.
- 59 kept answers differed from a fresh run in the last digits of a float sum
  (`114332726963.36789` against `…3679`): Postgres adds a parallel aggregate's parts in a different order
  each run. 2 more were a `LIMIT` with no `ORDER BY` returning another row. Neither is a stale answer; shadow
  mode counts them apart (`floatNoise`, `unordered`) and reports only the rest.
- 16 queries were not kept for want of counters (`noCounters`): a table behind one view is not an ordinary
  table. Not chased.

## Measured (2026-11-25, FUSION on the hub data, build `nav1`, port 5558)

Each page alone, second load, cache off → on: 616 dataset queries, 485 answered from memory, 6 shared, 12
probes (260 ms in all).

| Page | Data requests finished, off → on |
|---|---|
| national-overview | 3.5 → 3.0 s |
| hazard | 3.0 → 1.5 s |
| reports | 6.0 → 5.7 s |
| state | 1.6 → 1.4 s |
| explore | 1.9 → 1.5 s |

Whole pattern, three pages at a time (`dms perf`, runs `2026-11-25-1819-fusion-cache-off` and
`…-1823-fusion-cache-on`): median warm Complete 2.19 → 1.93 s; median click 1.20 s → 0.94 s; 8-click journey
10.08 → 6.53 s. Clicks: hazard 2.41 → 0.97, map 2.19 → 0.51, home 1.39 → 0.57, national-overview 2.52 →
1.80; state and disaster a little slower (1.08 → 1.33, 0.74 → 0.92), within the run-to-run spread seen before.

The database work is mostly gone on a repeat view; what is left of a page's load is the browser (about 65
requests and 1.9 s of main-thread work on national-overview, 189 requests on reports).

- The reports page's `POST /_session` never answers, with the cache off or on (found while measuring; it made
  the profile script wait out its 120 s limit). Not part of this work; not investigated.

### Why the page times moved so little (2026-11-25, evening)

- Full run, 14 pages, five runs each, one page at a time (`…-1856-fusion-full-cache-off`,
  `…-1907-fusion-full-cache-on`): 5,710 dataset queries, 5,407 answered from memory, 75 shared, none stale.
  Median warm Complete 1.73 → 1.50 s; median click 1.02 → 0.71 s; 8-click journey 10.09 → 6.61 s. Warm:
  hazard 3.00 → 1.51, map 2.72 → 1.05, home 2.00 → 1.28, reports 4.80 → 3.64, national-overview 2.67 → 2.12,
  explore 1.88 → 1.53, export 3.82 → 3.49; seven pages unchanged (they ask for little data).
- Per data request, cache on: about 8 ms on the server (60 ms off); reports' summed server time 16.8 → 2.0 s.
  On a repeat load of national-overview no dataset query reaches Postgres (31 small metadata reads remain).
- **The FUSION pattern's `preload_data` is off on the hub** since 2026-11-25 14:17 (change_log: saved from a
  signed-in browser, three saves in two seconds; on since 11-24). With it off the server renders pages without
  their data and the browser fetches everything: national-overview has 34 live sections and 65 requests (4 and
  14 with preload on). This is the "server rendered without data" change noted under "What was measured". The
  cache was therefore measured where it helps least; preload on + cache on is not measured (changing the
  pattern setting was not permitted to this session).
- **reports and export fetch their data three times per load** (58 requests at about 1.8 s, 3.3 s and 5.3 s).
  They are not served by the islands path ("not an opted-in page view") and still have the repeat that step 2a
  of section-data-query-repeats.md fixed for view pages. Not traced.
- methodology's click went 0.26 → 3.35 s (median of five): in four of the five cache-on clicks its waiting
  sections woke and fetched (7 requests, each under 60 ms) against one of five with the cache off. The
  requests are fast; the time is the sections' code loading. Why they wake more often is not explained.

## Tests

- `tests/test-uda-result-cache.js` (33 checks, in `npm test`; `npm run test:uda-result-cache`): the engine
  against a stand-in database. Off is a pass-through; hits; values in the key; the window; a changed counter,
  storage id or counter reset drops an entry; maximum age; joins; what is never kept; sharing and errors; an
  unreadable probe; the budget; shadow mode.
- `tests/test-uda-result-cache-pg.js` (15 checks; `npm run test:pg:uda-result-cache`, docker Postgres 17):
  through the UDA routes. Repeats are hits; an INSERT, UPDATE and TRUNCATE by SQL show after the window; a
  joined table changing shows; an editable source, and a join to one, are never kept and their writes show at
  once. It needs `src/db/configs/dama-postgres-test.config.json` (git-ignored; created on this machine as a
  copy of `dms-postgres-test` with role `dama`).
- A bug the first test caught: queries arriving together did not share a run, because the run was registered
  after the first `await`. It is registered before it now.
- `test-uda.js`, `test-uda-auth.js`, `test-source-editable.js` give the same results with the cache off and on.

## Decisions for the owner

1. Freshness window: built with the proposed 5 s default (an outside write can be unseen for about 6 s).
2. Memory budget per server process: built with the proposed 256 MB default. FUSION's ten pages used 0.2 MB.
3. ~~Internal (DMS) datasets in phase 2, or after.~~ Answered 2026-11-25: only datasets with `isEditable`
   false are cached, so internal datasets are never cached.
4. Whether the server render's shared page data (`render/ssr2/dataVersions.js`, in progress under
   [ssr-logged-in-render-and-stale-cache.md](../completed/ssr-logged-in-render-and-stale-cache.md)) should shorten its
   5-minute age limit once re-reading a page is cheap.

## Which datasets are editable (checked 2026-11-25)

- **External (DaMa) sources:** `data_manager.sources.metadata.isEditable`, a boolean, absent by default. Set by
  the Editable switch on the source's admin page (`patterns/datasets/pages/dataTypes/default/admin.jsx`),
  which needs a primary key first; removing the primary key clears it (`setPrimaryKeyColumn`). The server
  re-checks it and the real primary key on every row write (`resolveEditableTable`, `uda.controller.js`).
- **In `hazmit_dama`:** 3 of 13,562 sources are editable: 1515 "test shaun" (csv, 1 view), 12453
  "MitigateNY Mitigation Actions" (gis, 3 views), 13824 "Actions Cleaned (alignment sandbox)" (gis, 1 view).
  One more carries the key set to false (11869, TMAS Volume NY Dec 2025).
- **Internal (DMS) sources:** carry the same flag at `data.metadata.isEditable` since 2026-11-25, true unless
  switched off (source-editable-flag-everywhere.md).

## Not in this plan

Browser HTTP caching of `/graph`, warming the cache after a publish, a cache shared between server processes.

### Full test with preload back on (2026-11-25, 20:14–20:36)

The owner turned "Preload data" back on for the FUSION pattern. Same test: 14 pages, five runs, one at a time, build `build-5558-nav1`, port 5558.
Runs `2026-11-25-2014-fusion-full-preload-cache-off` and `2026-11-25-2025-fusion-full-preload-cache-on`.

| | Preload off, cache off | Preload off, cache on | Preload on, cache off | Preload on, cache on |
|---|---|---|---|---|
| Median warm load | 1.73 s | 1.50 s | 1.77 s | 1.46 s |
| Median click | 1.02 s | 0.71 s | 0.88 s | 0.61 s |
| 8-click journey | 10.09 s | 6.61 s | 9.85 s | 5.40 s |

- Cache counters, preload on: 5,713 queries, 5,404 hits, 82 shared, 227 misses, 0 stale, 21 `noCounters`.
- Preload on, cache off → on, warm: hazard 3.08 → 1.52, map 2.69 → 1.14, national-overview 3.64 → 2.20, home 1.96 → 1.23, explore 1.95 → 1.55, reports 4.46 → 4.06, export 4.16 → 3.84. Click: hazard 2.30 → 0.66, map 1.99 → 0.38, national-overview 2.83 → 1.30, home 1.19 → 0.56. No page slower.
- Preload alone (cache off) moves the totals little: it shifts the same queries from the browser to the server, which then holds the page until they finish. National-overview is slower that way (2.67 → 3.64 s warm).
- Preload on top of the cache helps the light pages most: about 1.21 → 0.51, disaster 1.40 → 0.64, methodology 1.44 → 0.79 warm. The methodology click outlier (3.35 s) is gone (0.30 s).
- Browser data requests with preload on: national-overview 14 (65 with it off), hazard 5, home 3. The map page still fetches its map data in the browser.
- Reports and export stay at about 4 s in every combination: the triple fetch, not query time.

### The triple fetch on reports and export, traced (2026-11-25, night)

Not a cache matter and not special to those two pages. Two separate things:

1. **`reports` and `export` are link pages** (`nav_link` to `/fusion/national-overview` and `/fusion/explore#method`,
   no sections). The server sends an empty shell (`X-DMS-ISLANDS: pass: not an opted-in page view`), the browser
   boots the full site, redirects in the browser (`<Navigate>` in `patterns/page/pages/view.jsx`) and builds the
   destination page there with no server HTML and no preloaded rows. So their timings are the old full-site path.
2. **On the full-site path every section fetches again after each of sync's two start-up loads.** Measured with
   islands off, preload on: a direct load of national-overview sends 128 data requests for 59 distinct (the page
   HTML already carries rows for 31 of its 34 data sections); through the `reports` link, 177 for 59.
   - Each start-up load ends in `router.revalidate()` (`render/spa/dmsSiteFactory.jsx`). The loader runs with
     `reload: true`, so the page pattern skips the preload (`section-data-query-repeats.md`, step 2a) and returns
     the sections without rows.
   - `dms-manager/wrapper.jsx` calls `getAttributes` again; `getViewComp` (`dms-manager/_utils.jsx`) makes a new
     wrapper function for the `sections` array attribute each time. `sectionGroup.jsx` holds it with
     `useMemo(…, [])`, but the React Compiler (production builds only) replaces that with a plain expression, so
     every band gets a new component type and its whole content is rebuilt (7,058 of 7,345 elements, twice).
   - The rebuilt sections start from the row-less data and fetch.
   - Proven on the test build by holding the component in `useState`: reports 177 → 59 requests, nothing
     rebuilt. But then the sections' "sync when value changes" effect (`dataWrapper/index.jsx`) replaces their
     rows with the row-less data and they do not fetch (same fetch key): the page goes from 7,345 to 2,962
     elements after the second reload. Both halves need fixing together.
   - Fix to build: (a) hold the band's section-list component in `useState`; (b) on a reload of a page whose
     page row and section rows are unchanged, the preload hook returns what it loaded before, so a section's
     value does not change; when they did change, preload again.
   - The islands path does not start sync, so islands pages are not affected.

### Browser profiles with everything on (2026-11-25, late)

Build `reload2`, islands, preload and cache on, one warm load each, CPU sampled with request and DOM timelines
(`timeline.mjs` in the session scratchpad). Where the time goes now, in ms from navigation start:

| Step | national-overview | hazard |
|---|---|---|
| Server renders the page | 0 – 356 | 0 – 192 |
| Browser parses and lays out the HTML (first paint 544 / 476) | 356 – 870 | 192 – 450 |
| Island scripts load from cache and run, in three further waves | 870 – 1100 | 450 – 750 |
| Nothing running (waiting on the last lazy chunks) | 1100 – 1300 | 750 – 900 |
| Live sections mount | 1300 – 1500 | 900 – 1050 |
| Waiting on the 300 ms debounce before a section's first fetch | 1500 – 1800 | 1050 – 1350 |
| Data requests (3 to 30 ms each) and the last render | 1800 – 1950 | 1350 – 1400 |

- Queries are no longer in the picture: the browser's data requests total about 40 ms.
- The page HTML is 868 KB for national-overview (6,827 elements; class attributes 387 KB, inline styles 110 KB,
  the islands JSON 100 KB) and 417 KB for hazard; 57 KB and 42 KB over the wire.
- Sections that still fetch in the browser: TileMap on both pages, and two Filter sections on national-overview
  (their option lists). Only Card, Graph and Spreadsheet set `preloadData`. A Graph with preloaded rows is
  live but does not fetch.
- `DEBOUNCE_MS = 300` (`dataWrapper/useDataLoader.js`) applies to a section's first fetch as well as to edits.
- The first request after a server start took 1.5 to 1.8 s for these pages (nothing in memory yet); steady
  state is 0.16–0.27 s for hazard and 0.32–0.38 s for national-overview.

Candidates, by expected gain: no debounce on a section's first fetch (about 300 ms on every page that fetches,
and on clicks); preload for TileMap and Filter options (the page is then complete when its sections mount);
serving a signed-out page's rendered HTML from memory while its data version holds (about 0.2–0.35 s off every
load and click); loading the island chunks in one wave (about 0.2 s). Fewer elements or less layout work for
long pages is the largest single block on national-overview (about 0.5 s) and the hardest to move.
