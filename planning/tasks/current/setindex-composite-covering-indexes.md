# `setIndexColumn` — composite / covering / partial indexes

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

- [ ] Single-column (legacy `isIndex: true` and bare-string call) still creates
      `idx_<table>_<col>` — byte-for-byte back-compat.
- [ ] Composite spec creates the multi-col index; drop removes it by name.
- [ ] Covering (`INCLUDE`) and partial (`WHERE`) variants build valid DDL.
- [ ] Column names + predicate are validated against the schema (injection-safe).
- [ ] `CONCURRENTLY` path works (not wrapped in a txn); errors are caught + logged
      per-view (don't fail the whole call on one view).
- [ ] SQLite adapter: no-op or sensible fallback (no DAMA views there).
- [ ] Regression: re-create the incidents Region-filter index
      `(state, region_name, nysdot_sub_category)` via the route and confirm the
      EXPLAIN flips to an Index Only Scan (after vacuum).

## Notes

- Platform philosophy: this is "enrich the primitive so authors can do it" — the
  filter-perf speedup becomes a toggle, not a ticket.
- Cross-ref: TransportNY task `planning/transportny/tasks/current/tsmo-incidents-page-build.md`
  (progress log 2026-06-20/21) for the real-world numbers and the manual DDL/vacuum
  that this would have replaced.
