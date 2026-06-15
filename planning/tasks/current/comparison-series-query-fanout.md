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

## Status — Pieces 1 + 2 + 3 DONE (code), live-verify pending (2026-06-12)

Build order: Piece 1 (server, tests first) ✅ → Piece 2 (client static authoring,
JSON-textarea v0) ✅ → Piece 3 (dynamic page-state binding) ✅ → live-verify on the
route chart (pending) → then Pieces 4–5 as separate tasks.

### Piece 3 — DONE (dynamic page-state binding)

**The subscriber piece.** A graph (or any `useDataWrapper` section that declares it)
can read its variant list from a page action param instead of a static JSON blob, so a
page control can drive "compare these" at runtime. Static (Piece 2) and dynamic (Piece
3) are two binding modes of one engine — `buildUdaConfig` fans out over a single
**effective variants** list regardless of where it came from.

**Design decision — the componentFunctions subscriber *is* the binding.** The original
spec listed both `comparisonSeries.binding.statePath` *and* "declare a
componentFunctions subscriber for the menu UX." Rather than carry two configuration
surfaces (a dead one), the subscriber's instance config **is** the binding:
`paramKey` = the action-param key (the old `statePath`), `args.labelKey`/`args.valueKey`
name the fields on each published entry, `args.column` (optional) names the source
column to filter on when the published value is a scalar (not already a filter tree).
No `comparisonSeries.binding` field is added; the binding lives in
`display._functions.subscribers` and is edited through the **existing Actions menu**
(typed `paramKey` + args — zero new menu code). This is the newer, general
provider/subscriber mechanism (`component-actions.md`); custom buckets predates it with
raw `statePath`/`labelKey`/`valueKey` text inputs, but the resolution structure is the
same.

**Data flow (the custom-buckets "config field → fetchKey" way, NOT the inert
`hover_highlight` way):**
1. `usePageFilterSync` (runs in Edit + View) finds the enabled `comparison_series`
   subscriber in `display._functions.subscribers`, reads its `paramKey`'s `values` out
   of `pageState.filters`, and resolves them via `resolveComparisonVariants(args, list)`
   into `comparisonSeries.config` (`[{label, filters}]`). This effect **is** the
   subscriber's runtime implementation — a *reload-driving* consumer.
2. `comparisonSeries` (incl. `config`) is already a `computeFetchKey` input
   (`useDataLoader.js`), so each publish re-fetches the fan-out. No useDataLoader change.
3. `buildUdaConfig` fans out over `effectiveVariants = comparisonSeries.config !==
   undefined ? config : variants`. **config's presence pins dynamic mode**: it wins over
   the static `variants`, and an unresolved binding (`config: []`) reads as *inactive*
   (no fan-out) instead of silently falling back to the static list. Absent `config` →
   static path, byte-identical to Piece 2 (BC).

**Synthetic `__series` column lifecycle (dynamic).** `reconcileComparisonSeriesColumn`
now keeps the column when EITHER static labeled variants exist, OR `cs.config` is an
array (dynamic resolved/unresolved), OR an enabled `comparison_series` subscriber is
present. Because the subscriber can be enabled (Actions menu) or its config can resolve
(usePageFilterSync) *after* the master switch is already on — orderings the menu's
reconcile-on-commit misses — a small Edit-only effect re-fires
`dwAPI.reconcileComparisonSeriesColumn()` whenever the subscriber's enabled flag or
config's *presence* flips (both booleans → no per-keystroke churn; reconcile is
idempotent). View needs no reconcile: the column was saved in Edit.

**Files touched (Piece 3):**
- `.../dataWrapper/buildUdaConfig.js` — `resolveComparisonVariants(subArgs, rawList)`
  (pure, exported): page-state list → `[{label, filters}]` (column-leaf mode OR
  filter-tree-passthrough mode; unwraps composite `{id,value}`; drops entries with no
  label/filter). `buildUdaConfig` computes `effectiveVariants` (config-wins) and fans
  out over it in `activeComparisonSeries` + `options.seriesVariants`.
- `.../dataWrapper/usePageFilterSync.js` — the dynamic-binding resolver effect
  (alongside the custom-bucket `resolveAliasGroups` effect): resolves → `config`;
  `delete`s `config` when no enabled subscriber so the static list resumes; isEqual
  guard breaks the write→re-run cycle.
- `.../dataWrapper/useDataWrapperAPI.js` — `reconcileComparisonSeriesColumn` extended to
  keep the synthetic column for dynamic config / enabled subscriber.
- `.../dataWrapper/index.jsx` (Edit) — reactive reconcile effect on `csSubEnabled` /
  `csConfigPresent` / master `enabled`.
- `.../ComponentRegistry/graph_new/config.jsx` — `comparison_series` subscriber
  declaration (`trigger: 'action_param'`; args `labelKey`/`valueKey`/`column`).
- `packages/dms/tests/buildUdaConfig.test.js` — `resolveComparisonVariants` (6 tests:
  column mode, array value, filter-tree passthrough, composite unwrap, drop-invalid +
  empty, no-column-no-tree) + dynamic `buildUdaConfig` (3: config-wins, `config:[]`
  inactive, static BC) = **+9 (153 → 162)**.

**Design notes / deviations:**
- **No separate `comparisonSeries.binding` field** — the subscriber instance config is
  the binding (see decision above). The task's `binding: { statePath, labelKey, valueKey }`
  state-shape comment maps onto `{ paramKey, args.labelKey, args.valueKey }`.
- **`column` arg is a free-text input, not `column-select`.** The filter column for a
  comparison (often `date`/`tmc`) is frequently *not* a displayed column, and the
  Actions `column-select` only lists `state.columns`. Free text lets the author name any
  source column; `column` is also optional (skip it when the published value is already
  a filter tree). v1 leaf op is `'filter'` (→ `IN`); range/`between` publishing is a
  Piece 4 concern.
- **No new duplicate-detection code.** The task's "(typed paramKey, duplicate detection)"
  describes the Actions section's generic features; duplicate detection is a *provider*
  concern (multiple writers of one key). `comparison_series` is a subscriber (reader), so
  it's N/A — and the menu's duplicate-warning isn't implemented for subscribers anyway.
- **Resolver lives in `buildUdaConfig.js`** (next to `mergeVariantFilters`, exported,
  unit-tested) and is imported by `usePageFilterSync` — a slight deviation from custom
  buckets (whose `resolveAliasGroups` is local to `usePageFilterSync`), chosen for
  testability/cohesion. No circular import (buildUdaConfig doesn't import the hook).

**Tested:** `npx vitest run` → **162/162** (was 153; +9). All five edited files
esbuild-parse clean. **Live-verify still pending** (shared with Piece 2): exercise on a
real chart with a page control publishing variants into an action param; confirm the
chart re-fetches and overlays one series per published variant, and that
disabling/clearing the subscriber reverts to the static (or single) series.

### Piece 2 — DONE (client engine + static authoring)

End to end on the client: an author opens a graph (or any `useDataWrapper` section) →
Dataset → **Comparison Series**, flips **Enabled**, pastes a JSON array of
`{ label, filters }` variants, and the chart overlays one series per variant (the
synthetic `__series` column defaults to a categorize dimension).

**Files touched (Piece 2):**
- `.../dataWrapper/buildUdaConfig.js` —
  - `mergeVariantFilters(baseTree, patchTree)` (pure, exported): the filter-patch rule
    (prune base leaves on any column the patch constrains, then AND-append the patch).
  - `buildUdaConfig` now destructures `comparisonSeries`; computes `activeComparisonSeries`
    (enabled + ≥1 labeled variant); drops the `origin:'comparison-series'` column when
    inactive (mirrors the inactive-custom-bucket drop); resolves each arm via a local
    `resolveArmTree` (join-alias → page-filters → prior-period → flatten → col-map →
    strip HAVING — the same pipeline as the base, factored through a new shared
    `getFilterColumn`); sets `options.seriesVariants` + `options.seriesKey`.
  - `buildColumnsWithSettings`: the verbatim-ref/req special case generalized from
    `custom-bucket` to a shared `isSyntheticAlias` (also `comparison-series`), so the
    `__series` attribute round-trips by its bare key (not `data->>'__series'`).
  - **Live-validation finding (2026-06-12) — join interaction bug.** When a join is
    present, the user-column mapping (`:1133`) table-prefixes every non-`custom-bucket`
    column with its alias (`epoch` → `ds.epoch`) so the join can disambiguate. The
    synthetic `__series` discriminator was **not** excluded, so it became `ds.__series`
    — a phantom base column. That broke the server fan-out two ways: it landed in each
    arm's `GROUP BY` as `ds.__series`, and the server's `groupBy.filter(g => g !== seriesKey)`
    drop (seriesKey is the **bare** `__series`) no longer matched it. CH surfaced it as
    `Identifier 'ds.__series' cannot be resolved from table with name ds.` **Fix:** add
    `col.origin !== 'comparison-series'` to the prefix guard at `:1145`, exactly mirroring
    the `custom-bucket` exclusion already there — synthetic SELECT-alias columns must
    never be table-prefixed. Regression test added (join present → `__series` stays bare,
    real `epoch` still aliased to `ds.data->>'epoch'`). The existing comparison-series
    tests missed this because their fixture had no join (`isJoinPresent === false`).
  - **Live-validation finding (2026-06-12) — fan-out dropped the custom-bucket row filter.**
    Symptom: a single-route line graph (one custom-bucket alias = a TMC list, filter-to-buckets
    ON) overlaid by date variants returned rows labeled with the *fallback* (`Other`) instead
    of all rows carrying the route label. Root cause: the server fan-out builds each arm's WHERE
    from `seriesVariants[i].filterGroups` and **ignores `options.filterGroups`** — which is the
    only place the custom-bucket "filter to buckets" leaf (`buildCustomBucketFilters`, injected
    at `:1238`) ever lived. The arms were built from the *raw* `filters` input via
    `mergeVariantFilters(filters, v.filters)`, so the `tmc IN(route)` restriction never reached
    any arm; only the aliasGroups `CASE` (shared across arms by the server) labeled the rows, so
    every non-route TMC fell to `Other`. **Fix:** in the `activeComparisonSeries` block, patch
    each variant over a `baseForArms` tree that has `bucketLeaves` folded in (mirrors the
    single-arm injection at `:1238`). `mergeVariantFilters` only prunes base leaves on columns
    the variant *touches* (e.g. `date`), so the `tmc` bucket leaf survives into every arm and
    `resolveArmTree` maps/aliases it identically to the single-arm path. Regression tests added
    (filter-to-buckets ON → bucket leaf in every arm; filter-to-buckets OFF → no leaf, BC).
- `.../dataWrapper/useDataLoader.js` — `comparisonSeries` added to `computeFetchKey` +
  the `fetchKey` memo deps, so edits re-fetch.
- `.../dataWrapper/useDataWrapperAPI.js` — `setComparisonSeries` +
  `reconcileComparisonSeriesColumn` (adds/renames/removes the synthetic
  `origin:'comparison-series'` column on master-toggle / series-key commit; defaults it
  to `show:true, group:true, target:'categorize'`).
- `.../sections/sectionMenu.jsx` — "Comparison Series" block under Dataset (master
  Enabled toggle → reconcile; Series Key via `CommitInput` → reconcile; Series Label;
  **Variants JSON** via `CommitInput`, invalid/non-array JSON ignored). Icon `Columns`.
  - **Live-validation findings (2026-06-12), two real bugs — one misdiagnosis:**
    1. *Variants "didn't persist."* **Not** a dropped draft (`CommitInput`'s blur commit
       fires fine on menu-back — Custom Buckets uses the same widget without issue). The
       real cause was the author pasting JS-object-literal syntax (single-quoted strings),
       which is invalid JSON, so `onCommit`'s `JSON.parse` threw and the `catch {return}`
       **silently swallowed** it. The task's own example (lines ~102–106) is written in JS
       style — that's the trap. (An earlier attempted fix added an unmount-commit to
       `CommitInput`; **reverted** as unnecessary.) **Resolved:** the variants field now
       uses a dedicated `JsonArrayInput` (sibling of `CommitInput`) that live-validates
       (strict `JSON.parse` + array check) and renders an inline `text-red-500` error;
       only a valid array commits. Strict JSON kept by request — **no** lenient/JSON5
       parsing (single-quoted JS-object syntax stays rejected, now visibly).
    2. *Blank menu page + broken back-nav after committing variants.* `NavigableMenu`'s
       `flattenConfig` keys each level by `item.id || item.name` (`navigableMenu/index.jsx:254`).
       The Variants item had **no `id`** and a count-bearing name (`` `Variants (${n})` ``),
       so committing renamed its menu key (`"Variants (0)"`→`"Variants (2)"`), orphaning the
       menu's `activeParent` → empty level + off-by-one back. **Fix:** give the item a stable
       `id: 'cs_variants'`. (Custom Buckets is immune because its nav levels carry stable
       `id`s.) Any menu item whose `name` is dynamic **must** carry a stable `id`.
- `.../dataWrapper/index.jsx` — **save-effect allowlist**: `state.comparisonSeries` added
  to the `toSave` object. The save effect serializes an *explicit* key list (not a spread);
  without this the master toggle wrote state, the effect immediately round-tripped a
  stripped serialization, and the toggle **silently reverted** ("toggle does nothing").
  Same trap the schema note flags for `join`. (Spot-check bug, fixed.)
- `.../sections/template_utils.js` — `delete s.comparisonSeries` in the layout-only
  ("exclude data source") template branch, alongside `customBuckets`/`pivot`, so a
  layout template doesn't carry data-config.
- `packages/dms/tests/buildUdaConfig.test.js` — `mergeVariantFilters` (5) + comparison-series
  `buildUdaConfig` (7, incl. the join regression) + the bucket×fan-out interaction (2, ON→leaf
  in every arm / OFF→no leaf) = +14 tests.
- `.../ui/components/graph_new/components/LineGraph.jsx` — **multi-categorize composite series
  (2026-06-12).** The task assumed "no graph change expected — `categorize` on `__series`
  already produces multiple series." True when `__series` is the *only* categorize column. But
  combining custom-buckets (its `route_name` dimension is also `target:'categorize'`) with
  comparison-series gives **two** categorize columns, and `LineGraph` picked only the first via
  `props.columns.find(c => c.target === "categorize")` — so it drew one line per route and
  silently collapsed the variant dimension. **Fix:** `find` → `filter`, and group on a composite
  id built from *every* categorize column (`idKeys.map(k => d[k]).join(" - ")`), yielding one
  line per (route × variant). Single-categorize is byte-identical (id = the lone value).
  hover_highlight id-matching is preserved for the single-categorize case and no-ops for a
  composite id (a single column's value can't address a composite series). **Not yet applied to
  BarGraph/Pie/Sunburst/Treemap** — they have the identical `find(categorize)` limitation; extend
  per-graph if a non-line chart needs to combine two categorize dimensions.

**Design decisions / notes (Piece 2):**
- **No registry `defaultState` entry** for `comparisonSeries` — mirrors custom buckets
  (the menu spreads defaults and the first toggle writes the full config). So it works on
  every `useDataWrapper` section that exposes the Dataset menu, graph_new included, with
  zero per-component wiring.
- **v0 authoring = a single-line JSON `CommitInput`** (the task's "raw JSON textarea").
  A proper per-variant filter-delta editor (reusing `ComplexFilters`) is a later refinement.
- **Variant normal-filters / HAVING are not extracted** in `resolveArmTree` (v1: variants
  are simple value/range/time leaves).
- **Custom-bucket leaf injection per-arm — FIXED 2026-06-12** (was a v1 scope-out). See the
  buildUdaConfig finding below: the bucket "filter to buckets" leaf is now folded into the
  base tree each arm patches, so comparison-series + custom-buckets compose. (Custom-bucket
  *aliasGroups CASE* labeling already worked per-arm — the server shares it across all arms;
  only the row-restricting leaf was missing.)
- The synthetic column defaults to `target:'categorize'` so a graph renders one series per
  variant out of the box; non-graph sections ignore `target`.

**Tested:** `npx vitest run tests/buildUdaConfig.test.js` → **153/153** (was 139; +14).
All four edited client files esbuild-parse clean. **Live-verify still pending** — exercise
on the real route chart (graph_new): enable, paste two/three variants, confirm one line per
variant for same-route/diff-period, diff-route/same-period, and diff-route/diff-period; and
that master-OFF reverts to a single series.

### Refinement — per-variant filter-builder editor (DONE 2026-06-12, live-verify pending)

**Built.** `ComplexFilters.jsx` gained optional `value`/`onSave` props (backward-compatible:
omitted → identical `state.filters` read/write; the main-filters call is unchanged). The
`sectionMenu.jsx` `cs_variants` block is now a per-variant list (each `Variant N` level =
**Label** `CommitInput` + **Filters** `ComplexFilters` with `value`/`onSave` redirected to
`variants[idx]`, columns/join still from `dwAPI.state`), plus **Add Variant** / **Remove
Variant**. The `JsonArrayInput` helper was removed (no longer referenced). No engine /
server / fetchKey / test changes; `buildUdaConfig.test.js` 153/153 still green; both edited
files esbuild-parse clean. **Live-verify pending:** build a 2-variant comparison via the new
UI and confirm two series render; confirm editing/removing/adding variants persists.

Replaces the v0 raw-JSON `JsonArrayInput` for the variant list with a structured,
per-variant UI that **reuses the existing `ComplexFilters` filter builder** for each
variant's `filters` delta. The author never hand-writes JSON; they build each variant
the same way they build the section's main filters.

**Why this is small.** A variant is `{ label, filters }` and `filters` is already the
exact tree `ComplexFilters` produces/consumes (`{ op, groups, ...leaf{col,op,value} }`).
The chart engine (`mergeVariantFilters`, `resolveArmTree`, server fan-out) is unchanged —
this is purely an authoring-surface swap. `mergeVariantFilters` already accepts whatever
`ComplexFilters` emits.

**The one real blocker: `ComplexFilters` is hardwired to `state.filters`.** It seeds
`useImmer` from `state?.filters` (`ComplexFilters.jsx:64`) and on its save Pill writes
`setState(draft => { draft.filters = filterGroups })` (`:112`). To edit a *variant's*
sub-tree instead, redirect only the read-source and write-target — **columns/join must
still come from the real section `state`** (variants filter the same dataset).

**Change 1 — `ComplexFilters.jsx`: add two optional, backward-compatible props.**
```js
export const ComplexFilters = ({ state, setState, value, onSave }) => {
  // seed: value ?? state.filters
  const [filterGroups, updateFilterGroups] = useImmer(
    Object.keys(value || state?.filters || {}).length ? (value || state.filters) : { op:'AND', groups:[] }
  );
  // save: onSave?.(filterGroups) ?? setState(draft => { draft.filters = filterGroups })
  const save = () => { if (onSave) onSave(filterGroups); else setState(d => { d.filters = filterGroups; }); };
```
- `columns` / `isJoinPresent` / `ConditionValueInput` context all keep reading the
  passed `state` → variant filters get the correct dataset columns + join for free.
- The existing main-filters call (`sectionMenu.jsx:1050`) passes neither `value` nor
  `onSave` → **byte-identical behavior** (no regression).
- `useImmer` only seeds on mount, so each variant must mount its own `ComplexFilters`
  instance. NavigableMenu already gives each variant its own nav level (mounts fresh on
  navigate-in); add a `key={'cs_variant_'+idx}` for safety against instance reuse.

**Change 2 — `sectionMenu.jsx`: replace the `cs_variants` JSON block** with a
Custom-Buckets-`staticGroups`-style list (the `:780`–`:832` pattern):
- Parent node keeps `id: 'cs_variants'` (stable id — dynamic count in name is the
  NavigableMenu blank-page trap already fixed once here).
- Per variant `idx` → a `Variant ${idx+1}` node (index-based name has **no** count, so
  it mirrors `Group ${idx+1}` and needs no stable id) containing:
  - **Label** → `CommitInput` → writes `variants[idx].label`.
  - **Filters** → `type: () => <ComplexFilters key={'cs_variant_'+idx}
    state={dwAPI.state} setState={dwAPI.setState} value={v.filters}
    onSave={tree => { const vs=[...variants]; vs[idx]={...vs[idx],filters:tree};
    setCsConfig({ variants: vs }); }} />`.
  - separator → **Remove Variant** (`splice`, `onClickGoBack`).
- **Add Variant** (`Plus`) → append `{ label:'', filters:{ op:'AND', groups:[] } }`.
- A blank/unlabeled variant is ignored by `activeComparisonSeries` (enabled + ≥1
  *labeled* variant), and an empty `filters` arm = the base query — both already handled,
  no engine change.

**Decisions / caveats.**
- **No buildUdaConfig / server / fetchKey change** — same `comparisonSeries.variants`
  shape; `computeFetchKey` already serializes it.
- **Backward compatible with JSON-authored variants** — existing stored
  `{ label, filters }` open directly in the builder; no migration.
- **Keep `JsonArrayInput`?** Optional "Edit as JSON (advanced)" escape hatch under the
  same parent. Recommend **dropping it** for the friendly default (the whole point of the
  refinement); retain only if power-users want bulk paste. Decide at build time.
- **Save-Pill UX caveat (inherited):** `ComplexFilters` commits on its own *save* Pill,
  not on nav-back — editing a variant's filters then leaving without clicking save loses
  the edit, exactly like the main filters today. Acceptable for parity; an unmount-commit
  was previously tried for `CommitInput` and reverted as unnecessary, so don't add one
  here without a deliberate decision.

**Files:** `ComplexFilters.jsx` (~6 lines, optional props) + `sectionMenu.jsx` (swap the
`cs_variants` block) + (optionally) remove `JsonArrayInput`. **No test changes required**
(buildUdaConfig variant-shape tests already cover the output); add a live-verify step:
build a 2-variant comparison via the new UI and confirm two series render.

### Piece 1 — DONE (server fan-out)

Shipped in the Postgres/SQLite UDA query set. `simpleFilter` and `simpleFilterLength`
accept `options.seriesVariants` (`[{ label, filterGroups }]`) + `options.seriesKey`
(default `'__series'`); empty → single-arm path, byte-identical to before. The data
query emits `SELECT * FROM ( arm1 UNION ALL arm2 … ) fanout LIMIT/OFFSET`, each arm =
the shared SELECT/FROM/GROUP BY with the variant's own WHERE and a constant
`'<label>' as "<seriesKey>"`. Length sums each arm's count as a scalar subquery.

Wired for **both backends** (Postgres/SQLite **and** ClickHouse) — DAMA views can
route to CH, and the client emits the same `options` regardless of storage, so the
controller's existing pg-vs-ch dispatch carries `seriesVariants` to whichever query
set runs. (Mirrors custom buckets, which works on both.)

**Files touched (Piece 1):**
- `dms-server/src/routes/uda/utils.js` — added two pure helpers (+ exports):
  - `offsetPlaceholders(sql, offset)` — shifts every `$N` by a running offset in one
    atomic regex pass so each Postgres arm's independently-numbered placeholders share
    one flat `values` array. Both the pg driver and the SQLite adapter look params up
    by index, so renumbering is safe. (CH inlines values, so it doesn't use this.)
  - `restoreLongColumnNames(rows, map)` — long-name restore, now shared across all
    four sites (pg/ch × single-arm/fan-out) instead of being duplicated.
- `dms-server/src/routes/uda/query_sets/postgres.js` — fan-out branch in
  `simpleFilter` + `simpleFilterLength` (UNION ALL with `$N` renumbering; length =
  sum of scalar-subquery counts). Single-arm restore swapped to the shared helper.
- `dms-server/src/routes/uda/query_sets/clickhouse.js` — parallel fan-out branch in
  `simpleFilter` + `simpleFilterLength`. CH differences: values are **inlined**
  (no placeholder renumbering), the discriminator alias stays **bare** (`as <seriesKey>`
  — CH preserves identifier case, unlike PG which needs the double-quote guard), and
  the label literal is single-quote-escaped (`'O''Brien'`).
- `dms-server/tests/test-uda.js` — `testOffsetPlaceholders` (unit), `testSeriesFanout`
  (tagging + length + single-quote-escaped label round-trip), `testSeriesFanoutOverlap`
  (overlapping variants duplicate base rows — the thing categorize/buckets can't do).

**Design decisions / deviations from the original Piece 1 spec — Piece 2 must honor:**
1. **Label is an inline single-quote-escaped literal, not a bound param.** Deviates
   from the task's "bound param" note. Rationale: matches `buildAliasGroupCase`'s label
   handling (codebase convention), needs no placeholder slot, and sidesteps the
   GROUP-BY-on-a-parameter problem. `String(label).replace(/'/g,"''")` neutralizes
   injection for the string-literal context.
2. **Alias is double-quoted: `as "<seriesKey>"`.** Same PG case-folding guard custom
   buckets needed — an unquoted alias folds to lowercase and the client reads the
   value back by the verbatim key. `getResponseColumnName` strips the quotes on the
   round-trip.
3. **The client MUST request `seriesKey` as an attribute.** The Falcor route only
   projects requested attributes, so the synthetic `__series` column has to be in the
   fetched attributes for the chart to see it. The server **strips** any attribute
   whose response name equals `seriesKey` from the per-arm base SELECT (it would
   otherwise be a bare, non-existent base column) and lets the constant literal be its
   sole source. So Piece 2's synthetic column must end up in `attributes`.
4. **`seriesKey` is dropped from each arm's GROUP BY** (data + length). It's constant
   per arm — always valid in SELECT without grouping, and it isn't a real base column.
   Piece 2 may still put `__series` in `options.groupBy` (the categorize dimension);
   the server handles the filtering.
5. **No ORDER BY across the union (v1).** Charts sort client-side; LIMIT/OFFSET page
   the combined set. A follow-up can add outer ORDER BY on response-name aliases if a
   table consumer needs globally-ordered fan-out pages.
6. **ClickHouse IS wired** — DAMA-backed views can route to CH (`table_schema` starts
   with `clickhouse.`), and the same `options.seriesVariants` flow through the
   controller's existing dispatch. CH inlines values so there's no placeholder
   juggling; the alias stays bare (CH preserves case). DMS internal sources stay PG,
   but external DAMA sources may be CH — both covered.

**Tested:** `node tests/test-uda.js` → 70/70 on SQLite (was 63; +7). Core suite
(`npm test`) green. CH WHERE-inlining/escaping spot-checked via `handleFilterGroupsCH`
(arm WHERE + single-quote escaping confirmed). **Not exercised against live engines:**
PostgreSQL (no Docker in this env) and ClickHouse (no CH instance / `@clickhouse/client`
is an optional dep) — same gaps the custom-buckets task noted. The PG and CH choices
above all mirror proven custom-buckets fixes, and the SQLite adapter genuinely
exercises the `$N`-renumbering path (it maps `$N`→`?` by index).
