# Server result cache for dataset (UDA) queries

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** planned: plan accepted by the owner 2026-11-25, limited to datasets that are not editable; decisions 1, 2 and 4 below open; nothing built · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

This is step 1 (server result cache) of
[section-data-query-repeats.md](./section-data-query-repeats.md), which the owner deferred until the repeats,
indexes and summary datasets were done. They are (2026-11-25). The plan was also published as an HTML page
for the owner; this file is the source of truth.

**Prerequisite (met 2026-11-25, uncommitted and not deployed):** [source-editable-flag-everywhere.md](./source-editable-flag-everywhere.md) (owner, 2026-11-25): every
source, internal and external, carries an explicit `isEditable`, so the cache's gate reads one flag. With it
done, the gate is "`isEditable` is false" for any source type, and an internal source switched to not
editable becomes cacheable like any other.

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

## Design

- **Key:** database env, the SQL text, the bound values.
- **In-flight sharing:** a query whose key is already running waits for that run.
- **Freshness:** each entry records a version of every table it read: `relfilenode` and the insert, update
  and delete counters from `pg_stat_all_tables`, with the database's `stats_reset`. One probe per database
  reads the versions of the tables in use (9–19 ms measured), at most once per freshness window (default
  5 s). An entry whose versions differ is dropped. The versions stay even with editable datasets left out:
  a non-editable dataset still changes when a pipeline or ETL task rewrites its table. Turning
  `isEditable` on (`uda.sources.update`) or clearing a view (`clearViewData`) drops the source's entries at once.
- **Ceiling:** every entry also expires after a maximum age (default 10 minutes), for anything the counters
  miss.
- **Only non-editable datasets (owner, 2026-11-25).** A source is cached only when its
  `metadata.isEditable` is not true, which is the default. Editable external sources and every internal
  (DMS) dataset are never cached; see "Which datasets are editable" below. A join or meta lookup that reads
  an editable or internal dataset makes the whole query uncached.
- **Not cached:** SQL that reads the clock (`now()`, `current_date`: the `time` filter), relations with no
  counters (database views, foreign tables, partitioned parents), results over the per-entry size limit,
  failed queries, SQLite.
- **Limits:** least-recently-used eviction under a byte budget (default 256 MB, 2 MB per entry).
- **Switches:** `DMS_UDA_CACHE` (`off` / `shadow` / `on`), `DMS_UDA_CACHE_MB`, `DMS_UDA_CACHE_WINDOW_MS`,
  `DMS_UDA_CACHE_MAX_AGE_MS`.

## Phases

- [ ] **Phase 1 (count and share).** New `routes/uda/resultCache.js`; the four call sites go through it.
      In-flight sharing on. `shadow` mode: keys, would-be hits and probe results are counted, nothing is
      served from memory. Counters at `GET /dama-admin/:pgEnv/uda-cache` (signed in) and in `dms perf`.
      Exit: reports page runs about 54 queries per load instead of 177; shadow hit rate reported per page.
- [ ] **Phase 2 (serve from memory, DaMa Postgres views).** Table versions, the probe, the ceiling, the byte
      budget, the `isEditable` gate. Shadow mode also compares a sample of hits
      against a fresh run and logs any difference. Exit: second load of national-overview sends no data
      query to Postgres; a row edit shows on the next read; an outside write shows within the window.
- [ ] **Phase 3 (ClickHouse).** Version from `system.parts` (`max(modification_time)` and part count per
      table). Internal datasets are out of scope (owner, 2026-11-25).
- [ ] **Phase 4 (the count twin).** When a cached row result holds the whole answer (no paging cut it
      short), answer its `count` from it. Only if phase 2's numbers show the twins still cost.
- [ ] **Phase 5 (turn on).** Default `on` for the hub, then mercury; `documentation/` page; perf run
      before and after on FUSION, MitigateNY and TransportNY patterns.

## Tests

`packages/dms-server/tests/`: key equality, in-flight sharing (one database call for N concurrent identical
queries, an error reaches all waiters and is not stored), version change drops the entry, clock SQL is not
stored, byte budget evicts, row-edit routes invalidate. Integration against the test Postgres: insert into
a table, the next read after the window is fresh.

## Decisions for the owner

1. Freshness window: 5 s proposed (an outside write can be unseen for up to about 6 s).
2. Memory budget per server process: 256 MB proposed.
3. ~~Internal (DMS) datasets in phase 2, or after.~~ Answered 2026-11-25: only datasets with `isEditable`
   false are cached, so internal datasets are never cached.
4. Whether the server render's shared page data (`render/ssr2/dataVersions.js`, in progress under
   [ssr-logged-in-render-and-stale-cache.md](./ssr-logged-in-render-and-stale-cache.md)) should shorten its
   5-minute age limit once re-reading a page is cheap.

## Which datasets are editable (checked 2026-11-25)

- **External (DaMa) sources:** `data_manager.sources.metadata.isEditable`, a boolean, absent by default. Set by
  the Editable switch on the source's admin page (`patterns/datasets/pages/dataTypes/default/admin.jsx`),
  which needs a primary key first; removing the primary key clears it (`setPrimaryKeyColumn`). The server
  re-checks it and the real primary key on every row write (`resolveEditableTable`, `uda.controller.js`).
- **In `hazmit_dama`:** 3 of 13,562 sources are editable: 1515 "test shaun" (csv, 1 view), 12453
  "MitigateNY Mitigation Actions" (gis, 3 views), 13824 "Actions Cleaned (alignment sandbox)" (gis, 1 view).
  One more carries the key set to false (11869, TMAS Volume NY Dec 2025).
- **Internal (DMS) sources:** no such flag. The client treats `isDms` as editable everywhere it checks
  (`isDms || isEditable` in `dataWrapper/index.jsx`), and rows are written through the DMS routes under the
  usual grants.

## Not in this plan

Browser HTTP caching of `/graph`, warming the cache after a publish, a cache shared between server processes.
