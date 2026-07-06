# Comparison Series — Query Fan-Out

## Objective

Let an author render **the same chart's underlying entities multiple times under
different filter contexts**, overlaid as multiple series. The motivating case is
"compare the same route across two time periods," but the feature is deliberately
**general**: a "variant" is just `{ label, filters }`, so the same machinery serves
period-vs-period, route-vs-route, region-vs-region, metric-vs-metric, scenario A vs
B — anything an author can express as "same chart, different filter."

This is the **row-set sibling of custom buckets**. Custom buckets fan out a
*dimension* (relabel existing rows via `CASE` — no row duplication). Comparison
Series fan out the *row set* (N copies of the base query under different
filter-deltas, each stamped with a discriminator column the chart categorizes on).

## Why fan-out (and not categorize / custom buckets)

- `categorize` needs the series to **be** a column value. It can't express
  "route A vs route B" when "route" is an author-named group of TMCs, not a stored
  column — and it can't duplicate a base row into two overlapping series.
- Custom-buckets `CASE` can relabel `col → label` **only** for a disjoint partition
  of one column (no row belongs to two labels). The moment variants overlap
  (e.g. `last 7 days` vs `last 30 days`) or carry arbitrary per-variant filters, a
  base row must appear in multiple series → row duplication → **`UNION ALL`**.

Fan-out subsumes both: **the series identity comes from the variant label, not from
any data column.**

Note the **disjoint-partition special case is already nearly expressible today**
(`categorize` by a column + a multi-value filter). The new capability is strictly
the *row-duplication / arbitrary-delta* case. `applyPriorPeriodExpansion`
(`buildUdaConfig.js:483`) is a related-but-different existing step: it unions prior
periods into **one** filter leaf's values — it does **not** tag rows by period, so
it can't separate them into series. Fan-out is what adds the tagging.

## Scope

### In this task — Pieces 1 + 2 (the general engine + static authoring)

- **Piece 1 — Server fan-out primitive.** UDA `simpleFilter` / `simpleFilterLength`
  accept `options.seriesVariants` + `options.seriesKey` and emit a `UNION ALL`
  query, one arm per variant, each stamping `'<label>' as <seriesKey>`. Pure,
  mechanical, unit-testable with hand-written config — exactly how
  `buildAliasGroupCase` was landed before any client UI.
- **Piece 2 — Static `comparisonSeries` config + section menu.** A
  `comparisonSeries` dataWrapper state block (master switch + variant list),
  `buildUdaConfig` wiring (resolve each arm's filter tree, pass `seriesVariants`),
  a synthetic `__series` column the chart can target as `categorize`, fetchKey
  inclusion, and a section-menu editor. **v0 authoring surface = a raw JSON
  textarea** for the variant list (matches the "consume a JSON" framing, validates
  the engine fast); a proper per-variant filter-delta editor is a later refinement.

End state of 1+2: an author flips the master switch on, pastes
`[{label, filters}]`, targets `__series` as the categorize dimension, and the chart
overlays one line per variant. General across every `useDataWrapper` component;
zero time-specific code.

### Deferred — Pieces 4–5 (own phases, see bottom)

- **Piece 3 — Dynamic binding (the subscriber piece). ✅ DONE 2026-06-12.** Variant
  list read from `pageState.filters` via a `comparison_series` `componentFunctions`
  subscriber, resolved in a `usePageFilterSync` effect → `comparisonSeries.config`
  (the fetchKey-driving "config field"). ("JSON from page state.")
- **Piece 4 — Time-period preset + publishing control.** Author convenience for the
  common time case (a "compare periods" UI / a control that publishes time-filter
  variants). **All time-specificity lives here.**
- **Piece 5 — Axis normalization.** Per-arm X re-projection (offset-from-period-
  start / time-of-day) for *same-axis* overlap. Only needed when the comparison
  column is also the X-axis column. Orthogonal add-on.

## Current state (how a graph loads data today)

- A graph is a `useDataWrapper` ComponentRegistry entry (`graph_new/config.jsx`).
  `useDataLoader` → `getData` → `buildUdaConfig(state)` builds **one** `options`
  object and issues **one** UDA query; the chart already supports multiple series
  via the `categorize` column target.
- `buildUdaConfig.js` assembles `options` in numbered steps (`:1089`–`:1389`).
  Step 5 (`:1157`) builds the resolved top-level `filterGroups` tree (custom-bucket
  leaves injected here, then join-alias, then `applyPageFilters`, then
  `applyPriorPeriodExpansion`, then `mapFilterGroupCols` → server refs). Step 8
  (`:1308`) assembles `options`; the custom-buckets block right after sets
  `options.aliasGroups` (`:1334`).
- Server `query_sets/postgres.js` `simpleFilter` (`:148`) parses `options`, builds a
  single `SELECT … FROM … WHERE … GROUP BY … LIMIT … OFFSET`, with all values
  parameterized (`$N`) into a `values` array. `simpleFilterLength` (`:48`) is the
  matching count query. `buildAliasGroupCase` lives in server `utils.js`.
- `computeFetchKey` (`useDataLoader.js:29`) serializes the fetch-affecting slice of
  state (includes `customBuckets`); the load effect refires when it changes.

## Architecture

### State shape

```js
state.comparisonSeries = {
  enabled: false,            // master switch — DEFAULT OFF (mirror customBuckets;
                             //   does nothing until flipped, even when configured)
  seriesKey: '__series',     // discriminator column name (categorize dimension)
  seriesLabel: 'Series',     // legend/axis label for the dimension (optional)
  variants: [                // STATIC authoring (Piece 2). v0 edited as raw JSON.
    { label: 'June 1',
      filters: { op: 'AND', groups: [ { col: 'date', op: 'filter', value: ['2026-06-01'] } ] } },
    { label: 'June 2',
      filters: { op: 'AND', groups: [ { col: 'date', op: 'filter', value: ['2026-06-02'] } ] } },
  ],
  // binding: { statePath, labelKey, valueKey }   // Piece 3 (dynamic) — NOT in 1+2
}
```

`filters` is the same filter-tree shape the section already uses
(`{ op, groups, ...leaf{col,op,value} }`), so the future filter-delta editor reuses
`ComplexFilters` unchanged.

### The filter-patch merge rule (base ⊕ variant)

A variant is a **patch over the base query**, not a blind AND. On a column the
variant touches it **replaces** the base's leaf for that column; columns the variant
doesn't touch are inherited; remaining variant leaves are AND-appended. This single
rule covers every combination:

| Comparing | Base holds | Each variant holds |
|---|---|---|
| same route, diff periods | `tmc IN (route)` | its `date` window (appended) |
| diff routes, same period  | `date` window     | its `tmc IN (route)` (replaces base tmc, if any) |
| diff routes, diff periods | metric/axis/joins only | both filters |

Guidance baked into the menu copy: **put what's shared in the base; put what differs
in the variant.**

Implement as a pure, exported, unit-tested function in `buildUdaConfig.js`:

```js
// Replace base leaves whose `col` appears anywhere in patch; AND-append the rest.
export const mergeVariantFilters = (baseTree, patchTree) => { … }
```

### Piece 1 — Server fan-out (`query_sets/postgres.js`, server `utils.js`, `clickhouse.js`)

**Contract.** `options` gains:
```js
seriesVariants: [ { label: 'June 1', filterGroups: <fully-resolved arm tree> }, … ]
seriesKey: '__series'
```
Each arm's `filterGroups` is **already fully resolved client-side** (base patched
with the variant, then the existing map/alias/page-filter/prior-period pipeline) —
so the server stays purely mechanical and needs no knowledge of the patch rule or
column accessors. (Mirrors how `aliasGroups` ships pre-resolved.)

**`simpleFilter` change.** When `seriesVariants?.length`:
1. Refactor the existing single-arm SQL body (`:267`–`:276`) into a helper
   `buildArmSelect({ ...ctx, filterGroups, extraSelect, extraGroupBy, paramStart })`
   that returns `{ sql, values }` and **numbers its `$N` placeholders starting at
   `paramStart`** (currently `buildCombinedWhere` owns numbering — thread a start
   index through, or post-renumber). This param-offset threading is the **main
   implementation subtlety** — write the SQL-shape test first.
2. For each variant, call the helper with that arm's `filterGroups`,
   `extraSelect: `$N::text as "${seriesKey}"`` (label passed as a **bound param**,
   never interpolated — injection-safe like every other value), and
   `extraGroupBy: seriesKey`.
3. Join arms with `UNION ALL`, concatenate their `values` in order, and wrap:
   ```sql
   SELECT * FROM ( <arm1> UNION ALL <arm2> … ) AS fanout
   <ORDER BY …> LIMIT $n OFFSET $m
   ```
   ORDER BY / LIMIT / OFFSET move to the **outer** query (applied across the union,
   not per arm). For charts `fullDataLoad` is typical so paging is a large window;
   document that pagination across a fan-out is "page over the combined set."

**`simpleFilterLength` change.** Total length = count over the union:
`SELECT count(*) FROM ( <arm1 SELECT 1…> UNION ALL … ) sub` (or sum of per-arm
counts). Reuse the same arm builder with a trivial projection.

**SQLite.** UNION ALL + the `$N` placeholders are standard; the adapter converts
`$N`→`?`. No dialect work expected beyond what `translatePgToSqlite` already does
per attr.

**ClickHouse.** DMS *internal* content never routes to CH, but **external DAMA views
can** (`table_schema` starts with `clickhouse.`), so CH is wired (see Status → Piece 1
DONE). CH inlines filter values (no `$N`), so arms compose without `offsetPlaceholders`;
the discriminator alias stays bare since CH preserves identifier case.

**Tests (server `tests/test-uda.js`).** Land these *before* the client UI:
- 2-variant fan-out emits `UNION ALL`, both labels appear under `seriesKey`, rows
  carry the right label.
- Overlapping variants duplicate the shared base rows (one per arm).
- Label is parameterized (injection-safe): a label containing `'` round-trips.
- Length = sum across arms.
- `seriesVariants` absent / empty → byte-identical to today's single-arm SQL (BC).

### Piece 2 — Client config + menu (`buildUdaConfig.js`, `useDataLoader.js`, `useDataWrapperAPI.js`, `sectionMenu.jsx`, registry wiring)

**`buildUdaConfig` (gated on `comparisonSeries.enabled === true` && variants).**
After step 5 produces the resolved base `filterGroups`, build one resolved arm tree
per variant:
```
for each variant v:
  armTree = mergeVariantFilters(baseResolvedTree, v.filters)
  → run the SAME resolution the base gets (mapFilterGroupCols / join-alias /
    page-filter / prior-period) on armTree
options.seriesVariants = variants.map((v, i) => ({ label: v.label, filterGroups: armTreeResolved[i] }))
options.seriesKey = comparisonSeries.seriesKey || '__series'
```
Extract the step-5 filter pipeline into a reusable per-tree function so each arm
runs it (today it runs once inline). Add `seriesKey` to `options.groupBy`.

**Synthetic `__series` column.** Mirror the custom-bucket synthetic column so the
dimension is targetable as `categorize`:
- Owned by an explicit `dwAPI.reconcileComparisonSeriesColumn()` action
  (`useDataWrapperAPI.js`), fired when the master switch toggles — adds/removes a
  `origin:'comparison-series'` column named `seriesKey`.
- `buildColumnsWithSettings` (`:594`) must special-case `origin === 'comparison-series'`
  to keep ref/req **verbatim** (it's a literal SELECT alias, not a `data->>` JSON
  key) — same fix custom buckets needed (`:617`).

**fetchKey.** Add `comparisonSeries` to `computeFetchKey` (`useDataLoader.js:29`)
and to the `fetchKey` useMemo deps (`:183`) so edits refetch.

**Section menu (`sectionMenu.jsx`).** Add a "Comparison Series" block modeled on the
Custom Buckets block: header shows On/Off; first item is the master `enabled` toggle
(fires `reconcileComparisonSeriesColumn`); while on, show `seriesKey`/`seriesLabel`
inputs and the **variants JSON textarea** (v0). Use the `CommitInput` draft pattern
(commit on blur/Enter) so typing doesn't churn state per keystroke.

**Chart.** No graph change expected — `categorize` on `__series` already produces
multiple series. Confirm live.

## Files requiring changes

**Piece 1 (server)**
- `packages/dms-server/src/routes/uda/query_sets/postgres.js` — arm-builder refactor,
  `seriesVariants` fan-out in `simpleFilter` + `simpleFilterLength`, param-offset
  threading, outer ORDER/LIMIT/OFFSET.
- `packages/dms-server/src/routes/uda/utils.js` — any shared arm/label helper (mirror
  where `buildAliasGroupCase` lives).
- `packages/dms-server/src/routes/uda/query_sets/clickhouse.js` — parallel fan-out (DAMA-CH views; values inlined, bare alias).
- `packages/dms-server/tests/test-uda.js` — fan-out shape + label + length + BC tests.

**Piece 2 (client)**
- `.../dataWrapper/buildUdaConfig.js` — `mergeVariantFilters` (pure, exported),
  per-arm resolution, `options.seriesVariants`/`seriesKey`, `seriesKey`→groupBy,
  `buildColumnsWithSettings` `origin:'comparison-series'` verbatim case.
- `.../dataWrapper/useDataLoader.js` — `comparisonSeries` in `computeFetchKey` + deps.
- `.../dataWrapper/useDataWrapperAPI.js` — `reconcileComparisonSeriesColumn`.
- `.../sections/sectionMenu.jsx` — Comparison Series menu block (master toggle, keys,
  variants JSON textarea via `CommitInput`).
- `.../ComponentRegistry/graph_new/config.jsx` (+ table/spreadsheet/card configs as
  desired) — `comparisonSeries` in `defaultState`; gate on `useDataWrapper`.
- `packages/dms/tests/buildUdaConfig.test.js` — `mergeVariantFilters` patch rule;
  `seriesVariants` assembly; disabled/empty → no `seriesVariants` (BC).

## Testing checklist

- [x] `mergeVariantFilters`: replace-on-column, inherit untouched, append extras, empty-patch/empty-base (unit, 5 tests).
- [x] `buildUdaConfig`: enabled + 2 variants → `options.seriesVariants` of 2 resolved
      arms (DMS `data->>` refs) + `seriesKey`; `__series` in groupBy + attributes verbatim;
      disabled / no labeled variants → no `seriesVariants`, synthetic column dropped (BC);
      **join present → `__series` stays bare while real columns alias to `ds.…` (regression).** (7 tests)
- [x] `buildUdaConfig`: **comparison-series + custom-buckets compose** — filter-to-buckets ON →
      the bucket row-restriction leaf is injected into *every* fan-out arm (mapped to the DMS
      accessor); filter-to-buckets OFF → no leaf added (BC). (2 tests, 2026-06-12 live-fix)
- [x] Server: 2-variant fan-out → `UNION ALL`, labels under `seriesKey`, correct rows. *(`testSeriesFanout`, SQLite)*
- [x] Server: overlapping variants duplicate shared base rows. *(`testSeriesFanoutOverlap`)*
- [x] Server: label injection-safe (`'`-containing label round-trips). *(inline escape, `testSeriesFanout` uses `O'Brien`)*
- [x] Server: length = sum across arms. *(`testSeriesFanout` len=3, `testSeriesFanoutOverlap` len=5)*
- [x] Server: `offsetPlaceholders` shifts `$N` atomically. *(`testOffsetPlaceholders`)*
- [x] Server BC: no `seriesVariants` → single-arm path unchanged; full UDA suite green (70/70) + core suite green.
- [x] ClickHouse: fan-out branch wired in `simpleFilter` + `simpleFilterLength`; arm WHERE inlining/escaping spot-checked via `handleFilterGroupsCH` (`name = 'O''Brien'`, `IN ('2023','2024')`).
- [ ] Server: exercise against **PostgreSQL** (no Docker locally) — `DMS_TEST_DB=dms-postgres-test node tests/test-uda.js` once a PG env is available.
- [ ] Server: exercise against a live **ClickHouse**-backed DAMA view (no CH instance locally) — confirm UNION ALL fan-out groups + length parity.
- [ ] Live: graph with `comparisonSeries` on, target `__series` as categorize →
      one line per variant; same-routes/diff-period AND diff-routes/same-period AND
      diff-routes/diff-period all render. *(Piece 2)*
- [ ] Live: master OFF → no fan-out, no `__series` column, reverts to single series. *(Piece 2)*
- [x] `resolveComparisonVariants`: column-leaf mode (scalar→leaf), array value verbatim,
      filter-tree passthrough, composite `{id,value}` unwrap, drop missing label/filter,
      empty/absent list → `[]`, no-column-no-tree scalar → dropped. (6 unit tests)
- [x] `buildUdaConfig` dynamic: `config` present → fans out over config (wins over static
      `variants`); `config: []` → inactive (no `seriesVariants`, `__series` dropped, no
      static fallback); absent `config` → static path (BC). (3 tests)
- [ ] Live (Piece 3): a page control publishes variants into an action param; the
      `comparison_series` subscriber (Actions menu, matching `paramKey`) overlays one
      series per published variant and re-fetches on each publish; disabling/clearing the
      subscriber reverts to the static (or single) series.

## Deferred phases (specs to expand when picked up)

- **Piece 3 — Dynamic binding. ✅ DONE 2026-06-12** (see Status → Piece 3 above). The
  binding is the `comparison_series` componentFunctions subscriber's instance config
  (`paramKey`/`args` = the planned `statePath`/label/value keys); `usePageFilterSync`
  resolves `pageState.filters` → `comparisonSeries.config` (mirrors `resolveAliasGroups`),
  which is already a fetchKey input → reload-driving. Static (Piece 2) and dynamic
  (Piece 3) are two binding modes of one engine (`effectiveVariants` in `buildUdaConfig`).
- **Piece 4 — Time-period preset + publishing control.** A "compare periods" author
  UI and/or a page control that publishes time-filter variants into page state for
  Piece 3 to consume. All time-specific code is quarantined here.
- **Piece 5 — Axis normalization.** Optional per-arm X re-projection (e.g.
  `timecol - period_start as <xKey>`, or time-of-day extract) so variants that vary
  the X-axis column overlap instead of sitting side-by-side. Build only when a real
  page needs same-axis overlay; needed only when the comparison column **is** the X
  column (if X is a separate column, e.g. epoch, categorize aligns for free).

## Cross-links

- Precedent (architecture to mirror): [custom-buckets.md](../completed/custom-buckets.md)
  — synthetic column lifecycle, `enabled` master gate, `usePageFilterSync` resolution,
  server CASE compile, DMS `data->>` accessor gotchas.
- Subscriber / reload-driving action-param semantics:
  `packages/dms/src/patterns/page/components/sections/component-actions.md`.
- Related-but-different existing step: `applyPriorPeriodExpansion`
  (`buildUdaConfig.js:483`) / [filter-include-prior-period.md](./filter-include-prior-period.md)
  — unions prior periods into one leaf; no series tagging.


## Status: shipped (code + automated tests), browser live-verify still pending

Pieces 1 (server fan-out), 2 (static authoring), and 3 (dynamic page-state binding) are all
implemented and covered by automated tests — 162/162 client-side (`buildUdaConfig.test.js`),
70/70 server-side (`test-uda.js`), both green. The per-variant filter-builder refinement
(`ComplexFilters`-based UI instead of raw JSON) has also shipped. **Not yet done:** an actual
browser click-through (enable comparison series on a real chart, confirm it renders one series
per variant, confirm the dynamic subscriber re-fetches on publish) and exercising the server
against a live PostgreSQL or ClickHouse instance (neither was available in the dev environment
during this work) — see the Testing checklist above for the exact unchecked items.

### Design decisions worth knowing before extending this

- **The `comparison_series` subscriber's instance config *is* the dynamic binding** — there's
  no separate `comparisonSeries.binding` field. `paramKey` is the action-param key,
  `args.labelKey`/`args.valueKey` name the fields on each published entry, `args.column`
  (optional) names the filter column when the published value is a scalar rather than a full
  filter tree. Edited entirely through the existing Actions menu — zero new menu code.
- **`args.column` is free text, not a `column-select`.** The comparison column (often
  `date`/`tmc`) is frequently not a displayed column, and the Actions menu's `column-select`
  only lists `state.columns`.
- **The variant label is an inline, single-quote-escaped SQL literal, not a bound param** —
  matches `buildAliasGroupCase`'s existing convention and avoids a GROUP-BY-on-a-parameter
  problem. The alias is double-quoted (`as "<seriesKey>"`) to survive PG's case-folding.
- **Synthetic SELECT-alias columns (`origin: 'comparison-series'`, same as `custom-bucket`)
  must never be table-prefixed when a join is present** — `buildUdaConfig.js`'s join-alias
  column-prefixing step needs an explicit exclusion for these, or the discriminator becomes a
  phantom `ds.__series` column that breaks both the query and the server's `groupBy` filtering.
- **The custom-bucket "filter to buckets" row-restriction leaf must be folded into the base
  tree before each variant patches it** — otherwise comparison series + custom buckets combine
  incorrectly (rows fall through to the bucket fallback label instead of being restricted
  per-arm).
- **Any `NavigableMenu` item whose displayed `name` is dynamic (e.g. includes a count) needs a
  stable explicit `id`** — `flattenConfig` keys menu levels by `item.id || item.name`, so a
  name that changes on commit orphans the menu's back-navigation.
- **The `dataWrapper` settings-editor's `toSave` allowlist must include every new persisted
  state key** (`comparisonSeries` included) or the master toggle silently reverts itself the
  next time the save effect fires for an unrelated reason. Same trap `join` (and later,
  `ReportRouteList`'s routes) hit.
- **Multi-categorize composite series is only fixed in `LineGraph`.** Combining custom buckets
  (its own `categorize` dimension) with comparison series gives two `categorize` columns, and
  every graph type originally picked only the first via `.find()`. `LineGraph` now groups on a
  composite id across *all* categorize columns; BarGraph/Pie/Sunburst/Treemap still have the
  single-`find()` limitation — extend per-graph if a non-line chart needs to combine two
  categorize dimensions.
- **`seriesKey` must be requested as a fetched attribute** and is dropped from each arm's
  `GROUP BY` server-side (it's a constant per arm, not a real base column) — Piece 2's synthetic
  column handles this automatically, but a from-scratch consumer of the fan-out primitive needs
  to know both.
- **No ORDER BY across the union (v1)** — charts sort client-side; LIMIT/OFFSET page the
  combined set.

### Files touched beyond the original plan

- `.../ui/components/graph_new/components/LineGraph.jsx` — composite categorize-column
  grouping (see above).
- `.../sections/components/ComplexFilters.jsx` — optional `value`/`onSave` props so the
  per-variant filter-delta editor can redirect reads/writes to `variants[idx].filters` instead
  of `state.filters` (backward-compatible; the main-filters call site is unaffected).
- `.../sections/template_utils.js` — strips `comparisonSeries` in the layout-only ("exclude
  data source") template branch, alongside `customBuckets`/`pivot`.
- `.../dataWrapper/index.jsx` — added `comparisonSeries` to the settings-editor save allowlist
  (see gotchas above).
- `dms-server/src/routes/uda/utils.js` — `offsetPlaceholders(sql, offset)` (renumbers each arm's
  `$N` placeholders onto one flat `values` array) and `restoreLongColumnNames` (shared across
  pg/ch × single-arm/fan-out instead of duplicated).
