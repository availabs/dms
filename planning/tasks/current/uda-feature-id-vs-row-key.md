# UDA: map popups must look rows up by the tile feature id, not the table's primary key

**Initiatives:** [mny_county_sites](../../../../../planning/initiatives/mny_county_sites.md) (primary), [dms_map_stack](../../../../../planning/initiatives/dms_map_stack.md) · **Status:** built · **Release:** deploy — dms-server (UDA dataById / key caches); commit — submodule · **Created by:** amuro@albany.edu · **Edited by:** —

**Topic:** dms-server (uda) · **Created:** 2026-09-30 · **For:**
[mny-actions-alignment-maps.md](../../../../../planning/mitigateny/tasks/current/mny-actions-alignment-maps.md)

## Objective

A DAMA table's **tile feature id** and its **row key** can be different columns. Actions Cleaned
(12453/13526) now has PK `action_id`, but its tiles still emit `ogc_fid`. Make map popups (and
anything else that addresses rows by the id a tile gave it) work in that case, without breaking the
row-key (`id` → PK) resolution that external-source editing depends on.

## Root cause (from reading the code, 2026-09-30)

- `dama/tiles/tiles.rest.js` hard-codes the feature id: `ST_AsMVT(mvtgeom.*, 'view_<id>', 4096,
  'geom', 'ogc_fid')`.
- `routes/uda/query_sets/postgres.js` `dataById`: `resolvePrimaryKey(db, schema, table, idxColumn)`
  → `WHERE <pk> = ANY($1)`. With PK ≠ `ogc_fid`, a popup's ids match nothing.
- `resolvePrimaryKey` keeps a single `_pkCache` with no expiry. When `dataById` passes a stored
  `idxColumn` (from `metadata.columns[].isIndex`), that value **overwrites the cache entry**.
  `uda.controller.js` `resolveIdAttribute` (which aliases a requested `id` to the PK for editable
  external rows) reads the same cache. So marking `ogc_fid` as the index would make reads hand out
  `ogc_fid as id` while `updateExternalRow` keys on the live PK, and form edits would fail with "Row
  not found".
- The same cache also means **any PK change needs a server restart** (seen on 2026-09-29).

## Fix — DONE 2026-09-30 (`routes/uda/query_sets/postgres.js`)

- `resolvePrimaryKey(db, schema, table)` answers **the row key** (the declared PK, `'id'` when there
  is none). It no longer takes or caches a stored index, and `resolveIdAttribute` (controller) is
  unchanged.
- New `resolveFeatureIdColumn(db, schema, table, storedIdx)` answers **the tile feature id** for
  `dataById`: an explicit metadata `isIndex` column, else `ogc_fid` when the table has it
  (information_schema), else the row key. It has its own cache.
- `dataById`: DMS split tables keep `resolvePrimaryKey` (`id`); DAMA tables use
  `resolveFeatureIdColumn`.
- Both caches expire after `DMS_UDA_KEY_CACHE_TTL_MS` (default 60,000 ms), so a PK change is picked
  up without a restart.
- Behaviour for existing tables: when the PK **is** `ogc_fid` (every gis-publish/csv-publish
  table), nothing changes. It only differs when the PK was moved off `ogc_fid`, which is exactly
  the case that broke.
- The ClickHouse query set's `dataById` (`WHERE id IN …`) is untouched and out of scope.

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms-server/src/routes/uda/query_sets/postgres.js` | split key resolution, TTL caches, `dataById` → feature id |
| `packages/dms-server/src/db/configs/dama-postgres-test.config.json` (new, tracked `*-test*`) | dama-role config on the docker test container |
| `packages/dms-server/tests/test-uda-feature-id.js` (new) | PG-DAMA regression test |
| `packages/dms-server/tests/postgres-docker.js` | add it to the `test:pg` run list |

## Testing Checklist

- [x] `npm run test:pg -- tests/test-uda-feature-id.js`: **7/7 pass**. The checks: dataById by
      `ogc_fid` with PK `action_id`; `id` → PK after a dataById call; `uda.data.edit` by the PK;
      `isIndex` honoured without redirecting `id`; a PK change followed once the cache expires; a
      table without `ogc_fid` stays on its PK.
- [x] **Against the pre-change `postgres.js` (HEAD, swapped in temporarily): 2/7 fail.** Popups
      return nulls, and `id` is redirected to `ogc_fid` (the cache-poisoning bug). So the test
      catches the regression.
- [x] `npm run test:pg` suite: test-graph, test-workflow, test-uda (115/115) and
      test-uda-feature-id (7/7) pass. **test-auth fails with `usersByProj.some is not a function`,
      identically on the pre-change code**, so it's pre-existing and unrelated.
- [x] `npm run test:uda` (SQLite): 114/114.
- [ ] After the dms-server deploy: an actions map on 13526 shows a popup with the row's hover
      columns (the maps subtask's Phase 4).
