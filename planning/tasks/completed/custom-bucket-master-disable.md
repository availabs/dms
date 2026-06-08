# Custom Buckets — master on/off switch for a section

## Objective

Add a master on/off switch at the top of the Custom Buckets section menu. "Off"
removes the synthetic `origin:'custom-bucket'` column and stops applying buckets
in `buildUdaConfig` (no `aliasGroups`, no bucket filter leaves), while retaining
the `customBuckets` config so it can be re-enabled.

Deferred sibling of the column-add/config-update split
(`custom-bucket-filter-toggle.md` and the un-filed column-reconcile work).

## Design

- New field `customBuckets.enabled` (boolean). **Default OFF** via an
  `enabled === true` gate — custom buckets do nothing until the author flips the
  master switch on, even after configuring buckets. (No BC requirement — no
  existing sections have custom buckets at merge.)
- The `enabled` flag is the master gate; the existing `filterToBuckets` flag
  remains the narrower "filter rows to buckets" gate nested under it, and stays
  default-ON *when* the master is on.
- `customBuckets.config` is left intact when off (usePageFilterSync keeps
  resolving it), so re-enabling restores all bucket behavior with no data loss.
- The synthetic `custom-bucket` column lifecycle stays owned solely by the
  explicit `reconcileCustomBucketColumn` action (per the sibling task's
  philosophy) — buildUdaConfig does not re-filter columns defensively.

## Changes

### 1. `buildUdaConfig.js`
- `buildCustomBucketFilters`: early-return `[]` unless `enabled === true` (and
  still respects the existing `filterToBuckets === false`).
- `buildUdaConfig`: gate `options.aliasGroups` on `customBuckets?.enabled === true`.

### 2. `useDataWrapperAPI.js`
- `reconcileCustomBucketColumn`: only keep the synthetic column when
  `enabled === true` and an alias is set; otherwise remove it. Config is
  untouched, so the column is re-added on enable.

### 3. `sectionMenu.jsx`
- `cbEnabled = cbConfig.enabled !== false`.
- Custom Buckets menu header shows `On`/`Off` (`value` + `showValue`).
- First item is a master `Enabled` toggle (`type:'toggle'`) that sets
  `enabled` and fires `dwAPI.reconcileCustomBucketColumn()` so the synthetic
  column is added/removed immediately.
- The rest of the config items (Type, Filter, Alias, Source, groups, …) are
  hidden while off via a conditional spread, keeping the "off" state clean.
  Config remains in state, so toggling back on restores the full menu.

## Files

- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataWrapperAPI.js`
- `packages/dms/src/patterns/page/components/sections/sectionMenu.jsx`
- `packages/dms/tests/buildUdaConfig.test.js` — 6 new unit tests.

## Status — COMPLETE 2026-06-08

Code complete; unit tests added and green (126/126). Live verification pending.

## Testing Checklist

- [x] master default (unset) → no `aliasGroups`, no bucket filter (default off).
- [x] master OFF → no `aliasGroups`, no bucket filter even with `filterToBuckets:true`.
- [x] master ON (`enabled:true`) → `aliasGroups` passed through.
- [x] `buildCustomBucketFilters` returns `[]` unless `enabled === true`.
- [x] `npx vitest run packages/dms/tests/buildUdaConfig.test.js` green (127 passed).
- [ ] Live: toggle the master switch, confirm the bucket column disappears and
      row set reverts to un-bucketed, then re-enable and confirm restoration.
