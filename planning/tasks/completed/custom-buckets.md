# Custom Buckets

## Objective

Let an author define **custom buckets** on a dataWrapper section: a named
dimension that maps the values of a source column into author-defined groups
(e.g. roadway TMCs → "Interstate" / "Non-Interstate"), usable as a GROUP BY
dimension and as a row filter. Buckets are configured entirely from the section
menu (no code), can be bound to page filters (dynamic groups) or set statically,
and the whole feature ships with a master on/off switch.

## Mechanism

### Server — `clickhouse.js` + `postgres.js`
- New `buildAliasGroupCase(definition)` compiles one bucket definition
  `{ column, fallback, groups: { [label]: [values] } }` into a
  `CASE WHEN <column> IN (...) THEN '<label>' … ELSE '<fallback>' END`.
  - `column` is `sanitizeName()`-guarded (the only raw identifier); labels,
    values, and fallback are single-quote-escaped string literals.
  - A group's `values` may arrive JSON-stringified (dynamic page-filter
    bindings store the list as a string) — tolerated via
    `typeof values === 'string' ? JSON.parse(values) : values`.
- `simpleFilterLength` and `simpleFilter` read `options.aliasGroups`, build the
  active CASE for any alias present in `groupBy`, and substitute it into the
  GROUP BY and SELECT (`<CASE> as <alias>`), ensuring grouped aliases are in the
  SELECT clause. `transformAttributesForClickHouse` regex widened to match a
  CASE statement inside `array_agg(distinct …)`.
- **Postgres/SQLite port** (`query_sets/postgres.js`): the same
  `buildAliasGroupCase` + `aliasGroups` wiring was ported from `clickhouse.js`.
  The standard CASE/IN syntax is identical on PostgreSQL and SQLite, so the one
  builder serves both backends with no dialect translation.
  - `simpleFilterLength`: alias CASE substituted into the `count(DISTINCT …)`
    expression in place of the bare `sanitizeName(g)` column.
  - `simpleFilter`: options now parsed before the SELECT is built so the alias
    CASE can be substituted into matching SELECT columns and pushed in when a
    grouped alias is missing; `handleGroupBy(groupBy.map(g => activeAliasGroups[g]
    || g))` uses the CASE in GROUP BY. `buildAliasGroupCase` exported for testing
    alongside `translatePgToSqlite`.
  - `transformAttributesForClickHouse` is **not** ported — Postgres already
    speaks native `array_to_string(array_agg(distinct …))`, so no transform is
    needed there.

### Client — dataWrapper / buildUdaConfig
- `state.customBuckets`:
  `{ enabled, filterToBuckets, type, alias, sourceField, fallback, binding, staticGroups, config }`.
- `resolveAliasGroups` (in `usePageFilterSync.js`) compiles the UI config into
  the resolved shape consumed by the server:
  ```js
  config = { [alias]: { column: <sourceField>, fallback, groups: { [label]: [v1, v2, …] } } }
  ```
  One resolution path serves both static and dynamic (page-filter-bound)
  buckets. Guard fixed so static buckets resolve without page filters.
- `buildUdaConfig` passes `customBuckets.config` through as
  `options.aliasGroups` (gated on the master switch, below).
- A synthetic `origin:'custom-bucket'` column represents the bucket dimension in
  the column list. Its lifecycle is owned **solely** by an explicit
  `dwAPI.reconcileCustomBucketColumn()` action (single bucket, matched by
  origin, renamed rather than duplicated) — `buildUdaConfig` never re-filters
  columns defensively. The action fires only when the Dimension Alias commits on
  blur/Enter (draft-state `CustomBucketAliasInput` in `sectionMenu.jsx`), so
  typing doesn't churn columns per keystroke. The old dual-purpose `useEffect`
  in `dataWrapper/index.jsx` (which both reconciled the column and recomputed
  the config, duplicating `usePageFilterSync`) was removed from Edit + View.

### Filter to buckets
- `buildCustomBucketFilters(customBuckets, baseSourceId)` (pure, exported from
  `buildUdaConfig.js`) reads the resolved `config` and emits one
  `{ col, op:'filter', value:[…uniqueValues], source_id }` leaf per alias:
  the deduped union of that alias's group arrays, JSON-parsing stringified group
  values (mirroring the server), excluding fallback labels and null/empty
  values. Injected at filter-tree assembly (step 5) before col→ref mapping / join
  aliasing, wrapping the existing tree in `{ op:'AND', groups:[existingTree,
  …bucketLeaves] }` so it AND-restricts regardless of the user's filter
  relation. `source_id` stamp aliases the leaf to `ds.` under joins (avoids
  ambiguous `data->>` in DMS-on-DMS joins). The server already compiles
  `op:'filter'` leaves to `IN (...)` — no backend change.
- Controlled by `filterToBuckets` (default ON when the master is on); off or
  empty groups → no injection (all rows).

### Master on/off switch
- `customBuckets.enabled` (boolean). **Default OFF** via an `enabled === true`
  gate — custom buckets do nothing until the author flips the master switch on,
  even after configuring them. (No BC requirement — no existing sections have
  custom buckets at merge.) `enabled` is the master gate; `filterToBuckets` is
  the narrower gate nested under it.
- Off: `reconcileCustomBucketColumn` removes the synthetic column; both
  `options.aliasGroups` and `buildCustomBucketFilters` are gated on
  `enabled === true`. `customBuckets.config` is retained (usePageFilterSync keeps
  resolving it), so enabling restores everything with no data loss.

### Menu — `sectionMenu.jsx`
- Custom Buckets block built from JSON config via the `setCbConfig`
  partial-merge helper (refactored to match the rest of the menu).
- Header shows `On`/`Off`. First item is the master `Enabled` toggle, which
  fires `dwAPI.reconcileCustomBucketColumn()` so the column appears/disappears
  immediately. The rest of the config items (Type, Filter rows to buckets,
  Alias, Source, groups, …) are hidden while off via a conditional spread.

## Files

- `packages/dms-server/src/routes/uda/query_sets/clickhouse.js` — `buildAliasGroupCase`, `aliasGroups` in `simpleFilter`/`simpleFilterLength`, widened attr regex.
- `packages/dms-server/src/routes/uda/query_sets/postgres.js` — Postgres/SQLite port of `buildAliasGroupCase` + `aliasGroups` in `simpleFilter`/`simpleFilterLength` (no attr regex; native PG aggregate syntax).
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` — `aliasGroups` passthrough + `buildCustomBucketFilters` + injection.
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/usePageFilterSync.js` — `resolveAliasGroups` (sole config recompute; static-bucket guard fix).
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataWrapperAPI.js` — `reconcileCustomBucketColumn`.
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/index.jsx` — removed dual-purpose useEffect (Edit + View).
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataLoader.js` — load on resolved config.
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataSource.js` — `onSourceChange` resets source-bound bucket fields (`sourceField`/`staticGroups`/`config`) and preserves the synthetic dimension column across a source swap.
- `packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` — Custom Buckets JSON menu, master toggle, filter toggle, draft alias input.
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/spreadsheet/{config,index}.jsx`, `table/{index,components/TableRow}.jsx`, `pages/{edit/index,view}.jsx` — wiring.
- `packages/dms/tests/buildUdaConfig.test.js` — unit tests.

## Status — COMPLETE 2026-06-08

Code complete; unit tests green (127/127). Frontend-driven with a single server
addition (`buildAliasGroupCase`).

**Update 2026-06-08** — server addition was originally ClickHouse-only; the
`buildAliasGroupCase` + `aliasGroups` logic has since been ported to the
Postgres/SQLite query set (`query_sets/postgres.js`) so custom buckets work on
PG-backed views as well. Existing server UDA suite green (58/58) after the port.

**Update 2026-06-09** — PG port bug: bucket cells rendered blank against a
Postgres-backed view (data was correctly bucketed in SQL but null in the Falcor
response). Root cause: the bucket alias is sent verbatim (not lowercased like
ordinary columns, since it must match the `aliasGroups` key + `groupBy`), and
`simpleFilter` emitted an **unquoted** `CASE … END as <alias>`. PostgreSQL folds
unquoted output identifiers to lowercase, so a mixed-case alias (`RoadType`)
returned a row keyed `roadtype` while the route reads the value back by the
original-case attribute (`rows[ii][getResponseColumnName(attr)]`) → undefined →
null. ClickHouse preserves identifier case, so the bug never appeared on the CH
path; SQLite also preserves unquoted-alias case, so it only manifests on
Postgres. Fix: double-quote the alias in both SELECT-substitution sites in
`query_sets/postgres.js` (`as "<alias>"`); `getResponseColumnName` already
strips the surrounding quotes so the round-trip key stays consistent. Added
`testCustomBucketAliasCaseRoundTrip` to `tests/test-uda.js` (a PG-only guard —
passes on SQLite either way because SQLite doesn't case-fold). Server UDA suite
green (60/60) on SQLite; PG run not exercised locally (no Docker in this env).

**Update 2026-06-09 (follow-ups)** — two menu/UX refinements:

1. **Commit-style static group inputs.** The generic `CustomBucketAliasInput`
   draft component in `sectionMenu.jsx` was renamed `CommitInput` (draft held
   locally, committed on blur/Enter) and reused for the static groups' **Group
   Label** and **Values (CSV)** inputs, which previously wrote section state on
   every keystroke. Same pattern as the Dimension Alias — typing no longer
   churns state per character; the value commits when the author leaves the
   field / navigates back.

2. **Reset source-bound bucket fields on source change.** `onSourceChange`
   (`useDataSource.js`) now nulls the custom-bucket fields tied to the previous
   source: `sourceField = ''`, `staticGroups = []`, `config = {}`. Source-
   independent author config (alias, type, fallback, dynamic binding,
   enabled/filterToBuckets toggles) is preserved, and the synthetic
   `origin:'custom-bucket'` dimension column is now carried through the source
   swap (both the internal-DMS and matched-source branches) instead of being
   dropped by the generic column-name filter — so the dimension stays visible
   and just needs rebinding to a column in the new source.
   - Defensive gate in `buildUdaConfig.js`: `activeCustomBuckets` now also
     requires `def.column`. After a source swap a *dynamic* binding can still
     resolve groups from page filters while `sourceField` is empty; without the
     guard that would emit a `CASE` on an empty column and break the query.
     Covered by a new unit test (`buildUdaConfig.test.js`, 134 passed).

## Testing Checklist

- [x] Bucket as GROUP BY dimension → server emits `CASE … END as <alias>` in GROUP BY + SELECT; data groups correctly (verified live against a ClickHouse npmrds source).
- [x] Dynamic (page-filter-bound) groups resolve and re-fetch when filters change; JSON-stringified group values parsed on both client and server.
- [x] Static groups resolve without page filters.
- [x] Filter to buckets ON → injected `IN` leaf, deduped union of group values, ANDed at top level even under a user `op:'OR'`; aliased to `ds.` under joins.
- [x] Filter to buckets OFF / empty config → no injected filter (all rows).
- [x] Master OFF (default/unset) → no `aliasGroups`, no bucket filter, no synthetic column, even with `filterToBuckets:true`.
- [x] Master ON → `aliasGroups` passed through, synthetic column present; toggling restores config from state.
- [x] Alias commit on blur/Enter renames the synthetic column instead of duplicating; typing doesn't churn columns.
- [x] `npx vitest run packages/dms/tests/buildUdaConfig.test.js` green (127 passed).
- [x] Postgres/SQLite port: `buildAliasGroupCase` + `aliasGroups` wiring mirrored from `clickhouse.js`; CASE/IN works on both backends; server UDA suite green (58/58). Spot-checked CASE generation (string-quoted, numeric-unquoted, JSON-stringified groups parsed, fallback emitted, `;`-injection column rejected) and GROUP BY passthrough via `sanitizeName`.
- [ ] Live: toggle the master switch — confirm the bucket column disappears and the row set reverts to un-bucketed, then re-enable and confirm restoration.
- [ ] Live: exercise custom buckets against a PG-backed (non-ClickHouse) view to confirm grouping + length parity with the CH path.
