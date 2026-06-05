# Custom Bucket "Filter to Buckets" Toggle

## Objective

Add a toggle to the Custom Buckets section menu that controls whether the
dataWrapper restricts fetched rows to those that fall into at least one defined
bucket.

- **Mode 1 — Filter to buckets (ON, default):** build a list of unique values
  from the union of all group value-arrays in `customBuckets.config` and add an
  `IN (...)` filter on the bucket's source column to the existing `filters`
  tree before the request goes to the backend. Only rows that land in a defined
  bucket come back.
- **Mode 2 — No filtering (OFF):** add/change nothing. Assuming no other
  user-added filters, all rows are returned regardless of bucket membership.

## Scope

- **Frontend only.** No backend code. The server already compiles
  `options.filterGroups` leaves with `op: 'filter'` into `IN (...)`.
- Reuses the already-resolved `customBuckets.config` (built by
  `resolveAliasGroups` in `usePageFilterSync.js` / `index.jsx`) so it works for
  both static and dynamic (page-filter-bound) buckets with a single code path.

## Current State

- `customBuckets` UI config lives on `state.customBuckets`:
  `{ type, alias, sourceField, fallback, binding, staticGroups, config }`.
- `resolveAliasGroups` compiles it into:
  ```js
  config = { [alias]: { column: <sourceField>, fallback, groups: { [label]: [v1, v2, …] } } }
  ```
- `buildUdaConfig` receives `customBuckets` and `filters`, runs the whole filter
  pipeline (col→SQL-ref mapping, join aliasing, page filters) internally, and
  currently only uses `customBuckets.config` to set `options.aliasGroups`
  (buildUdaConfig.js:1208-1212).
- The Custom Buckets menu is built in `sectionMenu.jsx` (~line 594-716) from
  `cbConfig` with the `setCbConfig` partial-merge helper.

## Proposed Changes

### 1. State / toggle field
Store `filterToBuckets: boolean` on `state.customBuckets`. **Default ON** —
treat unset as enabled. The disable gate is an explicit `=== false`.
No new dwAPI method; `setCbConfig({ filterToBuckets })` already merges.

### 2. UI — `sectionMenu.jsx`
Add a toggle item to the `customBuckets.items` array (after the `Type` item /
first separator):
```js
{
    name: 'Filter rows to buckets', label: 'Filter rows to buckets',
    type: 'toggle', showLabel: true,
    enabled: cbConfig.filterToBuckets !== false,
    setEnabled: v => setCbConfig({ filterToBuckets: v })
},
```

### 3. Core — `buildUdaConfig.js`
Add a pure helper and call it where `filterTree` is first assembled (step 5,
~line 1056), BEFORE `applyTableAliasToJoin` / `applyPageFilters` / mapping so
the injected leaf gets col→ref mapping and join aliasing for free:

```js
// Build filter leaves from the RESOLVED customBuckets.config. One leaf per
// alias (each alias has its own `column`), values = unique across that alias's
// groups. Fallback labels are intentionally excluded — fallback rows are the
// ones we want to drop in "filter to buckets" mode. Empty groups → no leaf
// (toggle-on with no values is a safe no-op, returns all rows).
const buildCustomBucketFilters = (customBuckets, baseSourceId) => {
  if (!customBuckets || customBuckets.filterToBuckets === false) return [];
  const cfg = customBuckets.config || {};
  return Object.values(cfg)
    .map(({ column, groups } = {}) => {
      const values = [...new Set(
        Object.values(groups || {}).flat().filter(v => v != null && v !== "")
      )];
      return column && values.length
        ? { col: column, op: "filter", value: values, source_id: baseSourceId }
        : null;
    })
    .filter(Boolean);
};
```

Inject (AND-restrict regardless of the user's top-level `op`):
```js
let filterTree = filters || {};
const bucketLeaves = buildCustomBucketFilters(customBuckets, externalSource.source_id);
if (bucketLeaves.length) {
  filterTree = { op: "AND", groups: [ ...(filterTree.groups ? [filterTree] : []), ...bucketLeaves ] };
}
```

### Follow-up fix (2026-06-05) — stringified group values

Live test against a ClickHouse npmrds source produced
`ds.tmc = '["120-50371","120P05935"]'` instead of `tmc IN (...)`. Root cause:
a group's `config.groups[label]` values can be a **JSON-stringified array**
(dynamic page-filter bindings store the list as a string), not a real array.
The server CASE builder already tolerates this (`typeof values === 'string' ?
JSON.parse(values) : values` — clickhouse.js `buildAliasGroupCase`), but the
client helper did `Object.values(groups).flat()`, leaving the JSON string as a
single scalar → the CH filter-leaf builder emitted `col = '<scalar>'`.

Fix: `buildCustomBucketFilters` now normalizes each group's values with a
`coerceGroupValues` helper that JSON-parses string values (mirroring the
server) before flattening with `flatMap`. Real arrays pass through unchanged.
No backend change — the CH leaf builder already emits `IN (...)` for real
arrays. 2 new unit tests (stringified array, mixed stringified + real).

Design notes:
- `source_id: externalSource.source_id` makes the leaf alias to `ds.` under a
  join (avoids ambiguous `data->>` in DMS-on-DMS joins).
- Uses resolved `config` → one path for static + dynamic buckets.
- Default-on consequence (accepted): existing sections with `customBuckets`
  start filtering to their buckets once re-loaded.

## Files Requiring Changes

- `packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` — toggle item.
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` — helper + injection.
- `packages/dms/tests/buildUdaConfig.test.js` — unit tests.

## Status — COMPLETE 2026-06-05

All three code changes landed; unit tests added and green (120/120). Live
verified by the user (toggle in section menu changes the fetched row set).

## Testing Checklist

- [x] toggle OFF → `filterGroups` identical to today (regression).
- [x] toggle ON + static groups → injected `IN` leaf with deduped values on the source column ref.
- [x] toggle ON + multiple groups → values flattened & deduped.
- [x] toggle ON + empty config/groups → no injected filter (all rows).
- [x] toggle ON + existing user filters with `op: 'OR'` → bucket leaf ANDed at top level, not folded into the OR.
- [x] toggle ON default/unset treated as enabled; DMS col→`data->>` mapping; `buildCustomBucketFilters` unit-tested (source_id stamp, per-alias leaves, null/empty drop).
- [x] `npx vitest run packages/dms/tests/buildUdaConfig.test.js` green (120 passed).
- [x] Live: toggle in section menu, confirm row count changes.
