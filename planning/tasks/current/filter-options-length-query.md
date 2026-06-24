# Stop the length query from dominating filter-option loads

**Topic:** api (dataWrapper data loading / UDA query sets)
**Status:** Change **B — DONE** (Postgres/SQLite, 2026-06-23, TDD). Change **A — DONE** (client length-skip, 2026-06-24, TDD). ClickHouse mirror of B — NOT STARTED. Written up 2026-06-23 from the TSMO congestion filter-perf investigation.

## Progress log

- 2026-06-24 — **Live-confirmed in the browser (Alex): "huge improvement"** on the
  congestion page with Changes A + B + the Tier-1 indexes stacked. Region/year
  filters now load fast (one grouped data query, no length round-trip).

- 2026-06-24 — **Change A implemented (client length-skip) test-first.**
  - RED: `packages/dms/tests/getData.optionsOnly.test.js` — drives `getData` with
    an injected recording `apiLoad` stub (DI). Asserted a Filter-style state
    (grouped, `optionsOnly`, not paginated) issues **no `udaLength`** request and
    bounds the fetch with the ceiling. Failed correctly (length still requested;
    `toIndex` 2 not 249).
  - GREEN: `getData.js` — new `optionsOnly` param; `isOptionsLoad =
    optionsOnly && options.groupBy.length > 0 && !state.display?.usePagination`.
    When true: skip `getLength()`, fetch `[0 .. optionsLimit-1]`, set
    `length = data.length` after the fetch, and dev-warn if the ceiling is hit.
  - Wiring: `useDataLoader` passes `optionsOnly: component.optionsOnly` (both
    getData call sites); `FilterComponent.config.js` sets `optionsOnly: true` on
    the Filter section **type** — so every Filter control (existing + new) gets it
    with no re-save. Verified the path: `dataWrapper/index.jsx` Edit+View →
    `useDataLoader({component})` → `getData`.
  - **Ceiling = 1000** default, overridable via `display.optionsLimit`. Chosen
    from the real ED-table cardinalities: largest legit dropdown is `county_code`
    = 64; the next column up is `direction` = 1,715 (then roadname 3,866, tmc
    54k). 1000 sits an order of magnitude above 64 and below 1,715, so no
    legitimate list truncates and high-cardinality columns trip the guard-rail
    warning (→ use a search filter) instead of silently loading a giant list.
  - BC: for any filter whose distinct count ≤ ceiling, `data.length` equals the
    old `count(DISTINCT)` (one row per group), so `totalLength` is unchanged.
    Non-Filter sections never set `optionsOnly` → untouched. Paginated grouped
    sections are hard-guarded by `!usePagination`.
  - Tests: **143/143 client (vitest)** green (incl. the 4 new + 139 buildUdaConfig);
    no regressions.

- 2026-06-23 — **Change B implemented (Postgres + SQLite) test-first.**
  - RED: `tests/test-uda.js` → `testMultiKeyGroupedLengthNoCollision` — a 2-key
    grouped length where `('x-','y')` and `('x','-y')` both concatenate to `'x--y'`.
    Failed on the old `count(DISTINCT a || '-' || b)` shape (returned 2, not 3).
  - GREEN: rewrote the grouped branch of `simpleFilterLength`
    (`query_sets/postgres.js`) to `count(*) FROM (SELECT 1 … GROUP BY <groupByExprs>
    [HAVING …]) t`, reusing the same `groupByExprs` resolution as the data query
    (`activeAliasGroups[g] || sanitizeName(g)`). Non-grouped path unchanged; the
    `hasArrayElements` subquery-count branch unchanged. SQLite goes through the same
    function (covered by the sqlite test harness).
  - Verified: **65/65 UDA tests pass**; full core suite (`npm test`) green.
  - **Live perf/parity on the real congestion ED table** (npmrds2, 4.87 M rows),
    driving the actual edited function: `groupBy: region_name` → **count 12 in
    316 ms** vs old `count(DISTINCT)` **count 12 in 4171 ms** = **13.2×** (and the
    old shape was ~15 s before the Tier-1 index). Multi-key
    `(region_name,county_code,roadname)` → 5641 groups, correct on real data.
  - ClickHouse mirror (`query_sets/clickhouse.js`, `countExpr`) intentionally
    deferred — no ClickHouse in the test harness, and the congestion table is
    Postgres. Change A (skip the round-trip) still pending.

## Objective

A Filter / multiselect control (and any grouped dataWrapper section whose job is
to enumerate a column's distinct values) pays for a **length query it never
displays**, and that query is generated in its slowest possible SQL shape
(`count(DISTINCT …)`). On large tables this dominates page load. Make
filter-option loads cheap by:

- **(B, primary)** generating grouped length SQL as `count(*) FROM (… GROUP BY …)`
  instead of `count(DISTINCT <CASE-wrapped keys>)` — a pure server-side change
  that benefits **every grouped section** (filters *and* paginated grouped
  tables) with no client change and no re-save/migration; and
- **(A, follow-on)** skipping the length round-trip entirely for option-list
  loads (no pagination, nothing consumes `totalLength`).

This is the platform-level ("Tier 3") fix behind the congestion page's slow
year/region filters — see
`planning/transportny/tasks/current/tsmo-congestion-filter-perf.md` for the field
measurements. It generalizes to every large-table dashboard (reliability,
incident search over millions of transcom rows).

## Scope

- **In:** the grouped-request length path in the UDA query sets (Postgres, and
  the ClickHouse + SQLite mirrors for parity); the length-fetch gate in the
  client `getData` loader.
- **Out:** the data query itself (already fast — 0.5 s on congestion once a narrow
  index exists), the aggregate sections (already fast via covering indexes), and
  any change to what option lists *display*. No new dataset objects, no DB schema
  changes (those are the per-page "Tier 2" alternative, tracked in the congestion
  task).

## Current State (measured)

A Filter control over `region_name` on the 4.87 M-row / 6 GB congestion ED table
(`excessive_delay.s2039_v3488…`, Postgres 16.3 — **no index skip-scan**) does two
server round-trips per load:

1. **data** — `SELECT region_name … GROUP BY region_name ORDER BY region_name`
   → 12 rows. ~0.5 s (with the narrow `(region_name)` index already deployed).
2. **length** — `getData` calls `getLength()` whenever `options.groupBy.length` is
   truthy (`getData.js` ~L242–250 — gated on `groupBy`, **not** on pagination, so
   `usePagination:false` does not skip it). `getLength` (`getData.js` L108–124)
   hits `udaLength` → `simpleFilterLength`, which for a grouped request emits:

   ```sql
   SELECT count(DISTINCT CASE WHEN region_name IS NULL THEN '__NULL__VAL__'
                              ELSE region_name::TEXT END) numrows
   FROM excessive_delay.s2039_v3488_excessive_delay_v2_series
   ```
   (`packages/dms-server/src/routes/uda/query_sets/postgres.js` `simpleFilterLength`,
   the `else` branch ~L136–143.)

Measured cost of that length query:

| Variant | Plan | Time |
|---|---|---|
| `count(DISTINCT region_name)` — no narrow index | 6 GB **seq scan** | **15.2 s** |
| same, after a narrow `(region_name)` index (Tier 1, deployed) | 33 MB index-only scan + **distinct-aggregate** | **5.07 s** |
| `count(*) FROM (SELECT region_name … GROUP BY region_name)` | index-only scan, no distinct-aggregate | **~0.5 s** |
| skip the length query entirely | — | **0 s** |

The Tier-1 index removed the I/O; the remaining ~5 s is the
`count(DISTINCT …::TEXT)` **aggregate** (per-row CASE + `::TEXT` + a distinct
sort over 4.87 M rows). The query *shape* is the cost.

Note the `simpleFilterLength` `hasArrayElements` branch (same function, ~L127–135)
**already** uses the cheaper `WITH t AS (SELECT DISTINCT … GROUP BY 1) SELECT
count(*) FROM t` pattern — change (B) just generalizes it to the normal branch.

## Proposed Changes

### B — cheaper grouped length SQL (server; do first)

In `simpleFilterLength` (`query_sets/postgres.js`), replace the grouped `else`
branch's `count(DISTINCT <CASE>)` with a subquery count over the same GROUP BY
keys it already computes for the data query:

```sql
SELECT count(*) numrows FROM (
  SELECT 1
  FROM <fromClause>
  <combinedWhere>
  GROUP BY <groupByExprs>   -- groupBy.map(g => activeAliasGroups[g] || sanitizeName(g)).filter(Boolean)
  <handleHaving(having)>
) t
```

- Reuse the exact `groupByExprs` resolution already used in `buildSimpleFilterSql`/
  `simpleFilter` (`activeAliasGroups[g] || sanitizeName(g)`), so alias-group CASE
  buckets keep working.
- **Semantics are equivalent and arguably more correct:** SQL `GROUP BY` already
  folds all NULLs into one group, so the `'__NULL__VAL__'` CASE wrapper is
  unnecessary; and the multi-key `a || '-' || b` concatenation (collision-prone)
  is replaced by a true multi-column `GROUP BY a, b`. Verify counts match on
  representative single- and multi-key groupBys.
- Keep the non-grouped path (`count(1)`/`count(*)`) unchanged.
- Mirror in `query_sets/clickhouse.js` `simpleFilterLength` (CH dispatch is
  per-view; congestion is Postgres, so CH is parity/follow-on). The SQLite path
  goes through the same function — `translatePgToSqlite` already runs on `groupBy`;
  confirm the subquery-count shape runs under the UDA SQLite tests.

This alone takes the congestion region filter from ~5.6 s to **~1 s** (≈0.5 s
data + ≈0.5 s length) with zero client or config changes.

### A — skip the length round-trip for option-list loads (client; follow-on)

When a section only enumerates a column's distinct values (a Filter control, or a
grouped request with `usePagination:false` and no `totalLength` consumer), don't
call `getLength()` at all.

- Gate in `getData.js` (~L242–250): add an option-list predicate alongside
  `isRequestingSingleRow`. Cleanest is an explicit flag the Filter control sets on
  its state (`display.skipLength` / `optionsOnly` via the Filter registry entry's
  `defaultState` / `buildUdaConfig`), with an inference fallback for already-saved
  sections (e.g. grouped + `!usePagination` + every fetched column is a group key,
  no aggregate `fn` columns).
- When skipping, the data request still needs a `toIndex` — use a bounded ceiling
  (`state.display.optionsLimit ?? 1000`; only 12 regions exist) instead of the
  length, then set `length = data.length` after the fetch. This reuses the
  "ceiling value for toIndex" approach from the completed **Falcor loader parallel
  requests** item (api/completed) — same idea, applied to option lists.
- Net: option-list loads drop to a single round-trip (~0.5 s) and never touch the
  length path.

Recommended order: ship **B** (universal, safe, migration-free), then **A** as the
extra round-trip trim once B is verified.

## Files Requiring Changes

- `packages/dms-server/src/routes/uda/query_sets/postgres.js` — `simpleFilterLength` grouped branch → `count(*)`-over-`GROUP BY` (B).
- `packages/dms-server/src/routes/uda/query_sets/clickhouse.js` — same rewrite for CH parity (B, follow-on).
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js` — option-list length-skip gate + `toIndex` ceiling (A).
- Filter control registry entry / `buildUdaConfig.js` — optional `skipLength`/`optionsOnly` flag wired from the Filter section config (A).
- `packages/dms-server/tests/` (UDA length tests) — assert grouped length parity + the new SQL shape.

## Testing Checklist

- [x] UDA server test: grouped `simpleFilterLength` returns the **same count** as the old `count(DISTINCT)` — single-key region parity (12 = 12 on real data) + the multi-key collision case (`testMultiKeyGroupedLengthNoCollision`, now correct = 3). Alias-group (custom bucket) cases still pass (existing bucket tests, 65/65 green).
- [x] Real congestion region length query: the subquery/GROUP-BY shape runs in **316 ms** vs **4171 ms** old (13.2×); count parity 12 = 12.
- [x] SQLite UDA tests still pass (subquery-count shape + `translatePgToSqlite` on groupBy) — 65/65; `npm test` core suite green.
- [x] (A) Filter-style load issues **no `udaLength`** request and bounds the fetch by the ceiling (`getData.optionsOnly.test.js`); `length` recovered from `data.length`. Live network-log confirmation pending (dev auth refresh).
- [x] (A) Paginated grouped section still fetches length — unit-guarded by `!usePagination` (`testMultiKeyGroupedLengthNoCollision` on the server side keeps the count correct; the getData test asserts a paginated grouped section STILL calls `udaLength`). Live worst-corridors click-through pending.
- [ ] No regression in `totalLength`/`filteredLength` consumers (KPI single-row synthesis, blank-row fallback, pagination math). _(Core suite green; live verify pending.)_
- [x] Live: congestion year/region filters open fast end-to-end — **confirmed in the browser by Alex 2026-06-24 ("huge improvement")**.

## Notes / Evidence

- Postgres 16.3 has no index **skip-scan** (PG 18 feature), so a distinct over a
  low-cardinality column still scans every row — which is *why* the query-shape /
  skip-it approach matters more than indexing here. The narrow `(region_name)` /
  `(year)` indexes (Tier 1) are already deployed on npmrds2 and remain useful for
  the data query and any region/year-filtered aggregates.
- Related todo (api): "First-class multi-column search filter" + the dms-server
  composite-index / `pg_trgm` item — same large-table dataWrapper-performance
  theme; worth landing together.
- Skill-extraction check at completion: this is a platform fix, not a repeatable
  authoring pattern — no skill warranted; link this task from `completed.md`.
