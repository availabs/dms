# Source indexes an author manages: composite, covering, partial and expression

**Initiatives:** [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) (primary), [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** built · **Release:** commit — uncommitted (library + dms-server deploy, then the owner builds the BILD index from the panel) · **Created by:** amuro@albany.edu · **Edited by:** —

## Scope update (2026-11-17): expression indexes, and the index flag stops being the feature id

A second case, from MitigateNY, widens this task. The owner chose to fix it by enriching the admin, not by a
hand-written index ("we always want to empower the author even if figuring it out would be hard").

**The case.** Every MitigateNY hazard risk-profile page (`/assess_risk/natural_hazards/<hazard>/risk_profile`, 18
pages) took ~30 s to server-render and hit dms-server's 30 s request timeout; a budget on the section preload now
renders them in 4–7 s ([ssr-lexical-view-html.md](../completed/ssr-lexical-view-html.md), *Risk profiles timed out*), but the
slow sections still take 20–28 s in the visitor's browser. They are a Card and Spreadsheets over **AVAIL BILD 2026
V1** (`hazmit_dama` source 1649, view 2354, table `gis_datasets.s1649_v2354_parcel_to_footprint_ny_v_2`: 43 GB,
7.2 M rows), filtered on an author's **calculated column**:

```sql
-- section filter column (calculated): CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END AS is_state
SELECT county_name, sum(building_full_market_val) FROM gis_datasets.s1649_v2354_parcel_to_footprint_ny_v_2
WHERE (CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END) = ANY(ARRAY[1]) AND nri_ltng_risk_score >= 80
GROUP BY county_name ORDER BY 2 DESC NULLS LAST LIMIT 10
```

Measured read-only on mercury 2026-11-17: Parallel Seq Scan, 5.05 M buffers read (~38 GB), **7.5 s per query**;
each section runs a data and a count query and the page's sections scan concurrently. Indexes on the table:
`county_name`, `ogc_fid` (pkey), `muni_parcel_id`, two on `wkb_geometry`. The predicate is very selective:
24,881 rows (0.34 %) are `owner_type = '2'`; every hazard page uses the same state test with a different
`nri_<hazard>_risk_score`. The index that serves all of them:

```sql
CREATE INDEX CONCURRENTLY ... ON gis_datasets.s1649_v2354_parcel_to_footprint_ny_v_2
  ((CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END));
```

No single-column index can serve a calculated column, so today this needs a developer with database access.

**Added to scope:**

1. **Expression indexes.** An index spec may index an expression, not only columns:
   `{ name, expression: "CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END" }`. An author should be able to index
   exactly what a section filters or groups on, including a calculated column (pasted with or without its
   ` AS alias`). The expression must reach the database in the same form the UDA query builder emits it, or the
   planner won't use the index.
2. **Security.** The expression is author-written SQL run as DDL. It must be validated before it runs: it may only
   reference the table's own columns, one expression, no statement separators or comments; reuse whatever the UDA
   already does to accept calculated columns in queries, then prove it with a harmless read (e.g. `EXPLAIN SELECT
   (<expr>) FROM <table> LIMIT 0` in a read-only transaction) before any DDL.
3. **Gate the route.** `uda.sources.setIndex` (and the new spec form) runs DDL with no auth check today
   ([datasets-source-rules.md](./datasets-source-rules.md), open question 3). With authored expressions that is no
   longer acceptable: require the permission that edits the source's metadata.
4. **Long builds.** `CREATE INDEX CONCURRENTLY` on a 43 GB table runs for minutes, past any request timeout. The
   build runs in the background (the DAMA tasks system, `uda.tasks`), and the UI shows each index as building /
   ready / failed (`pg_index.indisvalid`; a failed concurrent build leaves an invalid index to drop).
5. **The index flag stops being the feature id.** The first `isIndex` column is also read as the row key for
   `dataById` (`uda/utils.js` `idxColumn`; `query_sets/postgres.js resolveFeatureIdColumn`: map popups and the
   datasets map page look features up by it). So indexing a filter column (`owner_type`) would break feature
   lookups for that source. Separate them: an index is only an index; the feature/row id comes from the real
   primary key ([set_primary_col_from_meta.md](./set_primary_col_from_meta.md)) or an explicit flag of its own.
   **Actions Cleaned (source 12453 → `action_id`, 2026-09-29)** relies on today's behaviour and must keep working.
6. **The UI: an Indexes panel on the source**, listing the indexes that exist on the source's tables (from
   `pg_indexes`, including ones made outside DMS, read-only), and letting an author add (columns, or an
   expression) and drop the ones DMS manages. The per-column toggle stays, as the single-column shortcut.

Once built: create the BILD index above through the panel on mercury (owner's go-ahead first; it's a production
DDL) and re-time the lightning risk profile.

## Build (2026-11-17) — design as built

**Files**

| File | Change |
|---|---|
| `dms-server/src/routes/uda/source_indexes.js` (new) | specs, expression scan, validation, names, DDL, catalog state, the background worker `uda/source_index`, `listSourceIndexes` / `createSourceIndex` / `dropSourceIndex` / `applyIndex` |
| `dms-server/src/routes/uda/uda.route.js` | GET `sources.byId[id].indexesInfo`; CALL `uda.sources.createIndex` `[env, id, spec]` and `uda.sources.dropIndex` `[env, id, key]` (outcome as a value at `indexesCall`); `assertIndexWrite` |
| `dms-server/src/routes/uda/uda.controller.js` | `setIndexColumn` = flag + shared build; `indexes` added to `SERVER_OWNED_METADATA_KEYS`; exports `readSourceMetadata` / `mutateSourceMetadata` |
| `dms-server/src/routes/uda/utils.js`, `query_sets/postgres.js` | feature id from `isFeatureId`, not `isIndex` (`idxColumn` → `featureIdColumn`) |
| `dms-server/tests/test-source-indexes.js` (new), `test-uda-feature-id.js`, `postgres-docker.js`, `package.json` (`test:pg:source-indexes` only), `tests/CLAUDE.md` | tests |
| `dms/src/patterns/datasets/pages/dataTypes/default/indexes.jsx` + `indexes.theme.js` (new) | the Indexes page |
| `…/dataTypes/lazyPages.js`, `defaultPages.js`, `gis_dataset/index.js`, `csv_dataset/index.js`, `internal_table/index.js` | register `/indexes` (hidden from the tab bar, like Rules) |
| `…/default/admin.jsx`, `admin.theme.js` (`actionIconIndexes`), `internal/pages/admin.jsx`, `datasets/defaultTheme.js` (`indexesPage`) | the Admin button, the theme |

**Specs and storage.** `{ columns, include?, where?, label? }` or `{ expression, where?, label? }`. A single plain
column is the per-column toggle: `isIndex` on the column, index `idx_<table>_<col>` cut at 63 (unchanged), key
`col:<name>`. Everything else lives in `metadata.indexes` (DAMA `data_manager.sources.metadata`; DMS the source row's
`data.metadata` — the same place `authority` lives, via `mutateSourceMetadata`), keyed `ix_<sha1(columns, include,
where, expression) 10 hex>`, named `idx_<table cut to fit>_<hash>` (≤ 63, the hash always survives). `indexes` is a
server-owned metadata key, so the Metadata page's whole-blob save can't wipe it. Creating a spec that's already
managed rebuilds it.

**Expression matching.** The UDA doesn't rewrite a calculated column: the client (`dataWrapper/buildUdaConfig.js`
`refName` → `attributeAccessorStr`) sends the text before ` as ` as the filter / group key, and
`utils.js handleFiltersType` emits it verbatim (`<expr> = ANY($n)`). So the index stores the same text with the
trailing ` AS alias` stripped (the same trailing-alias rule as `getResponseColumnName`) and whitespace collapsed.
Postgres matches index expressions on the parsed tree, so spacing, case and parentheses don't matter; the test
proves the match on the route's own SQL.

**Validation, before anything is written.** (1) `scanSqlExpression`: one expression — no `;`, comments, `$`,
backslashes, unclosed quotes, unmatched `)` or a top-level comma; the UDA's own `sanitizeName` banned words
(select, drop, union, cast, …) plus `values`. (2) Every function called must be IMMUTABLE (`pg_proc.provolatile`),
as CREATE INDEX requires — `now()`, `pg_sleep()` are refused up front. (3) Columns / INCLUDE exist on every table
(`information_schema`); DMS columns must be source attributes. (4) A harmless read on each table:
`EXPLAIN SELECT 1 FROM <table> WHERE ((<expr>)) IS NOT NULL LIMIT 0` (and the condition in WHERE) inside a
`READ ONLY` transaction with a 10 s statement timeout. EXPLAIN runs nothing; FROM names only that table, so any
other table/column reference fails; WHERE refuses aggregates, window and set-returning functions just as an index
does. Identifiers are double-quoted with `"` doubled; a column name containing `"` (or `'` on DMS) is refused.

**Gate.** `createIndex` / `dropIndex` call `assertCan({ env, source, verb: 'update-source', mode: 'enforce' })` —
the same judge and walk as every source write (`setAuthoritativeView`, `setRule`), with the mode pinned to `enforce`
(precedent: `dms.route.js` field reads) because an expression is authored SQL run as DDL; a site still on `log`
can't let a signed-in stranger through. `setIndex` and `setPrimaryKey` were already gated on `update-source` (since
`datasets-source-rules.md` was written); kept as they are, under the site's mode: they take a column name only,
now validated against the table, and changing their mode would change behaviour for existing clients.
*Alternative not taken:* pin those two to `enforce` as well.

**Background builds.** Postgres: `queueIndexBuild` queues a task (`worker_path = uda/source_index`) on the DAMA
pgEnv's `data_manager.tasks` (DMS sources: `dms.tasks`), then claims and starts it at once on this server (the
poller is the fallback). The worker runs per table on its own pooled connection with `statement_timeout = 0`:
valid index of that name → done; invalid with a `pg_stat_progress_create_index` row → another build is running,
leave it; invalid without → a failed/interrupted build, `DROP INDEX CONCURRENTLY` it, then `CREATE INDEX
CONCURRENTLY IF NOT EXISTS`, then check `indisvalid`. Drops are `DROP INDEX CONCURRENTLY` in the same worker. A
second create/drop for an index with a queued/running task is refused. A create whose spec was removed before it
ran does nothing. SQLite: plain `CREATE INDEX IF NOT EXISTS` inline; columns only.

**State** (`indexesInfo`), per index per table, read every time from the catalog + the newest task for its key:
`dropping` (drop task active) · `ready` (`indisvalid`) · `building` (progress row, with `blocks_done/blocks_total`;
or task queued/running) · `failed` (invalid index without a build, or the create task errored — with the error) ·
`missing`. Rolled up worst-first. Indexes on the tables that DMS doesn't manage (the primary key, upload indexes,
hand-made ones) come back under `other` and the page shows them read-only. The page polls every 3 s while anything
is building or dropping.

**Feature id.** `getDataTableFromViewId` now returns `featureIdColumn` from `metadata.columns[].isFeatureId` (no
UI; an explicit flag of its own), and `resolveFeatureIdColumn` is `isFeatureId` → `ogc_fid` → the PK.
`isIndex` is only an index. Read-only survey 2026-11-17: no source on hazmit_dama, nysdos or wcdb-dama has an
`isIndex` column; on npmrds2 only 2135 and 2356 do, both on `ogc_fid`, which the fallback gives anyway — no
metadata change needed anywhere, so no script. **Actions Cleaned** (hazmit_dama source 12453): views 13192 and 13272
have PK `ogc_fid`; view 13526 has PK `action_id` and a unique `ogc_fid`; no column carries `isIndex`. Its lookups go
`ogc_fid` (the column exists) before and after this change, so it is unaffected.

**UI.** An **Indexes** page per source (`/source/:id/indexes`), reached from **Admin → Indexes** (DAMA and internal
sources), like Rules. Lists managed indexes with state badges (Ready · Building · 42% · Queued · Failed · Not built ·
Removing), the failure message, Retry/Build and Remove → Confirm remove; *Other indexes* read-only with Primary
key / Unique / Invalid tags. **+ Add index**: Columns (ordered picker, ↑ to reorder) with optional Include and Only
rows where, or Expression (paste a calculated column, AS name and all), optional Name. Tool-register copy; all
classes in `indexes.theme.js` (`datasets.indexesPage`); falcor calls in the page as the Metadata and Rules pages
do. The Metadata page's per-column Index switch is unchanged (it now builds in the background too).
*Deviation:* a page rather than a panel inside the Metadata page — that page is a fixed-height column list, and
Rules already set the pattern of a source settings page reached from Admin.

**Visibility-map caveat** (from the incidents case): an index-only scan needs the table's visibility map; a
bulk-loaded table that has never been vacuumed falls back to heap fetches. DMS doesn't vacuum; after the first
index on a freshly loaded big table, a `VACUUM (ANALYZE)` (by a developer, or autovacuum) is what turns a covering
index into an index-only scan.

**Owner: build the BILD index** (after the library + dms-server deploy):
1. MitigateNY admin → datasets → *AVAIL BILD* (hazmit_dama source 1649) → **Admin** → **Indexes**.
2. **+ Add index** → **Expression** → paste `CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END AS is_state`
   (optional Name: *State-owned*) → **Add**. The checks run first (a few seconds of planning, no data read).
3. The card shows *Queued* then *Building · n%*; on a 43 GB table expect minutes. It ends *Ready* — or *Failed*
   with Postgres's message, then **Retry**.
4. Re-time the lightning risk profile. The section's filter key must be exactly that expression (it is: the
   panel strips only the alias); a different calculated column needs its own index.

**Done 2026-11-17, before a deploy** (owner's go-ahead): the hub on 5555 was restarted on this code (it reads
`hazmit_dama` on mercury directly). The browser session was signed out, so the index was added by calling
`createSourceIndex('hazmit_dama', 1649, { expression, label: 'State-owned (risk profiles)' })` from a script on
the same server code: the same validation, metadata entry and background task (task 343) the page's **Add** runs.
- Built `idx_s1649_v2354_parcel_to_footprint_ny_v_2_b62726612c` CONCURRENTLY in ~45 s; `indisvalid` true; the
  source's `metadata.indexes` lists it, so the page will show it as managed.
- The risk-profile query: 7.5 s seq scan → **~190 ms** (Bitmap Index Scan on the new index, 24,881 rows; 22.6k
  buffers instead of 5 M).
- Lightning risk profile on 5555: server render 3–4 s with every section preloaded; slowest section 1.6 s (were
  20–28 s); no preload budget warnings.
- Still not done: clicking through the Indexes page signed in.

## Objective

Make the platform's built-in "index this column" action support **composite,
covering (INCLUDE), and partial** indexes — not just a single column — so that
speeding up a slow filter / aggregate is a first-class, author-toggleable action
for any source, instead of a hand-written `CREATE INDEX` by a developer with
warehouse access.

## Motivation (the case that surfaced this)

The TransportNY `incidents_v2` page's **Region filter** dropdown took **~17s** to
load its values. The query is a low-cardinality distinct over a huge table:

```sql
SELECT region_name
FROM transcom.s956_v1947_transcom_main_v2          -- 1.75M NY rows, 11 distinct regions
WHERE state = 'NY' AND nysdot_sub_category <> 'Construction'
GROUP BY region_name;
```

The current single-column `setIndex('region_name')` would **not** have helped —
the query also filters `state` (and excludes a sub-category). The fix was a
hand-written covering index:

```sql
CREATE INDEX idx_s956_v1947_region_lookup
  ON transcom.s956_v1947_transcom_main_v2 (state, region_name, nysdot_sub_category);
```

…plus a one-time `VACUUM (ANALYZE)` (the table was bulk-loaded, visibility map
empty → no index-only scan possible). Result: **17s → 131ms** (Index Only Scan,
`Heap Fetches: 0`). None of that was reachable through the platform — it required
a developer connecting to npmrds2 directly. This task closes that gap.

## Current behavior

- `setIndexColumn(env, sourceId, columnName, enable)` in
  `src/routes/uda/uda.controller.js` (~L431):
  - Sets `isIndex: true` on the named column in the source `metadata.columns`.
  - For each DAMA view of the source, runs
    `CREATE INDEX IF NOT EXISTS idx_<table>_<col> ON <fqt> ("<col>")` — **single
    column only** (also a DMS-source branch above it).
- Falcor CALL route `uda.sources.setIndex` (`uda.route.js` ~L388), args
  `[env, sourceId, columnName, enable]`.
- The datasets-pattern column UI toggles `isIndex` per column.

## Proposed design

1. **Index spec, not a boolean.** Extend the column/source metadata to carry an
   index spec instead of (or alongside) `isIndex: true`. Sketch:
   ```jsonc
   // per source: metadata.indexes (preferred — composite spans columns)
   "indexes": [
     { "name": "region_lookup",
       "columns": ["state", "region_name", "nysdot_sub_category"],
       "include": [],            // covering INCLUDE cols (optional)
       "where": null,            // partial-index predicate (optional, sanitized)
       "concurrently": true }
   ]
   ```
   Keep `isIndex: true` on a column as a back-compat alias that maps to a
   single-column spec, so existing toggles keep working.

2. **DDL builder.** Replace the hardcoded single-col DDL with a builder:
   `CREATE INDEX [CONCURRENTLY] IF NOT EXISTS <idxName> ON <fqt> (col, …)
   [INCLUDE (…)] [WHERE <predicate>]`. Deterministic, collision-safe index name
   (`idx_<table>_<hash-or-joined-cols>`); identifier-quote every column;
   `sanitizeName`/allowlist columns against the live table schema (no SQL
   injection via column names or predicate).
   - `CONCURRENTLY` can't run inside a txn — ensure the adapter runs it
     autocommit (the pg path does; guard/handle the SQLite path or no-op it).
   - On `enable=false`, drop by stored index name.

3. **Route + UI.** Widen `uda.sources.setIndex` args to accept a spec (array of
   columns + options) while still accepting a bare string for back-compat. Add a
   datasets-pattern control: pick columns / order / optional INCLUDE + predicate,
   show existing indexes, create/drop.

4. **Visibility-map caveat (document, optionally act).** Index-only scans need
   the table's VM populated; freshly bulk-loaded tables have an empty VM →
   index-only falls back to full heap fetches (this is exactly what bit the
   incidents case). Options: (a) document that a `VACUUM (ANALYZE)` is needed
   after first index on a never-vacuumed table; (b) offer an opt-in "vacuum
   after index" flag on the call (guarded — heavy on big tables). Do NOT vacuum
   implicitly.

## Files requiring changes

- `src/routes/uda/uda.controller.js` — `setIndexColumn` (spec parsing + DDL
  builder + drop-by-name); both the DMS-source and DAMA-source branches.
- `src/routes/uda/uda.route.js` — `uda.sources.setIndex` call args (back-compat).
- Source metadata schema / wherever `isIndex` is read+written (client + server).
- `packages/dms/src/patterns/datasets/…` column-index UI control.
- Docs: a short note in the dataset/source docs + `card-layout.md`-style mention
  that filter columns can be indexed; the VM/vacuum caveat.

## Testing checklist

All in `dms-server/tests/test-source-indexes.js` (36 tests) unless noted; run against a real PostgreSQL 17.

- [x] Single-column (legacy `isIndex: true` toggle and bare-string call) still creates
      `idx_<table>_<col>` — same name, column flagged; toggling off drops it.
- [x] Composite spec creates the multi-col index; drop removes it by name (and from `metadata.indexes`).
- [x] Covering (`INCLUDE`) and partial (`WHERE`) variants build valid DDL (checked against `pg_get_indexdef`).
- [x] Expression: a pasted calculated column (with ` AS is_state`) is indexed without the alias, and
      `EXPLAIN` of the SQL **the UDA route itself issued** (captured from the adapter, for a section-shaped
      request: filter on the expression, `gte` on the score, group by county) flips from Seq Scan to a
      Bitmap Index Scan on that index.
- [x] Column names + expressions + predicate validated (injection-safe): 11 hostile/broken specs refused through the
      route with no DDL and no metadata change; the old toggle can no longer inject through a column name.
- [x] Gate: anonymous → "Sign in"; signed-in without `update-source` → refused **under `DMS_AUTH_MODE=log`**;
      with it → allowed. `setIndex`/`setPrimaryKey` gates: `test-uda-auth.js` 29/29.
- [x] `CONCURRENTLY` path works (own connection, autocommit, no statement timeout); per-table errors are
      collected, the task fails with the table named, other tables still built.
- [x] Background state: `building` while the build waits on a held table lock; a second build of the same index
      is refused; then `ready`. A build that fails at build time (division by zero on every row) reports
      `failed` with Postgres's message and leaves an invalid index; Remove drops it. An interrupted build
      (invalid index, no task) shows `failed`; rebuilding drops it first and builds a valid one.
- [x] A generic metadata save (the Metadata page's whole-blob write) keeps `metadata.indexes`.
- [x] Feature id: indexing a filter column leaves `dataById` on `ogc_fid`; `isFeatureId` is honoured
      (`test-uda-feature-id.js` 8/8, test 4 rewritten for the new rule).
- [x] Internal (DMS) source on Postgres: the toggle builds `idx_<split>_<col>` on `(data ->> col)`, an expression
      over `data` builds, an unknown column is refused.
- [x] SQLite adapter: column indexes build inline as plain indexes; expression / condition / INCLUDE are refused
      with a clear message (checked with a scratch script against `dama-sqlite-test`).
- [ ] Regression on npmrds2 (incidents Region filter) — production DDL, the owner's call; the composite case is
      covered by the test.
- [ ] Click-through of the Indexes page in a browser — not done (no dev server started, per the session's rules);
      `vite build` succeeds and emits the `indexes` chunk.

## Notes

- Platform philosophy: this is "enrich the primitive so authors can do it" — the
  filter-perf speedup becomes a toggle, not a ticket.
- Cross-ref: TransportNY task `planning/transportny/tasks/current/tsmo-incidents-page-build.md`
  (progress log 2026-06-20/21) for the real-world numbers and the manual DDL/vacuum
  that this would have replaced.
