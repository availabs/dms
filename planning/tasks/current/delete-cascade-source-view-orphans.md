# Cascade source/view deletes — stop orphaning dmsEnv refs and child rows

**Status 2026-08-05: code + tests DONE (all suites green). Prod repair EXECUTED and
verified same day (user-approved): env 1676363 pruned 15→10 refs, all resolving;
orphan view 2189914 deleted; both mirrored into change_log. Row backups:
`dms-template/scratchpad/npmrdsv5/{env-1676363,view-2189914}-backup.json`.
Remaining: deploy the updated dms-server (user-owned), eyeball the datasets list,
optional PG docker test run.**

## Objective

Deleting an internal datasource (a `:source` row) or a version (`:view` row) through
`dms.data.delete` must not leave orphans behind. Today it does, in three ways:

1. The parent dmsEnv (or pattern) row's `data.sources` array keeps the deleted
   source's `{ref, id}` entry → the datasets pattern renders ghost/blank entries
   ("orphaned internal datasources").
2. The source's child `:view` rows stay in `data_items`.
3. The views' data split tables (`data_items__s{srcId}_v{viewId}_{instance}`) stay
   in the schema.

## Incident that surfaced this (2026-08-05, npmrdsv5 / transportNY datasets pattern)

Five freight-plan PDF `file_upload` sources (ids 2189904, 2189906, 2189908, 2189910,
2189912 — created 2026-07-13 for the Freight Atlas "Data & Downloads" build) were
deleted 2026-08-05 18:47–18:50 UTC by user 1 via the dms CLI (`raw delete`,
user_agent "node" in `dms.change_log`). Each delete removed only the source row.
dmsEnv 1676363 (`dev2|datasets_env:dmsenv`) kept all 5 refs in `data.sources` →
5 ghost entries in the datasources list. View row 2189914
(`2019_nys_freight_plan_archive|v2:view`) was also left orphaned.

Root cause chain:
- `deleteData` (dms.controller.js) is a bare `DELETE ... WHERE id IN (...)` — no
  cascade, no parent-ref cleanup, for every caller (UI DeleteSourceBtn, CLI, scripts).
- The datasets list reads `getSourcesLength`/`getSourceIdsByIndex` →
  `getSiteSources` (uda/utils.js), which trusts the env/pattern `data.sources`
  array verbatim; dangling ids count toward length and render as ghosts
  (`getSourceById` returns no row for them).
- Client `DeleteSourceBtn` (patterns/datasets/pages/dataTypes/default/admin.jsx)
  only calls `dms.data.delete` with the source row id — it never edits the env.

## Scope

- **In**: server-side cascade in `deleteData` for new-format `:source` and `:view`
  rows; read-side ghost filtering in `getSiteSources`; regression tests; one-time
  prod data repair for npmrdsv5.
- **Out**: legacy (pre-type-refactor, colon-less) types — being migrated away;
  cascade for other kinds (pattern/page/dmsenv); uploaded file blob cleanup in
  storage; client-side changes (server fix covers all callers).

## Proposed Changes

### 1. dms-server `deleteData` cascade (dms.controller.js)

Before the row DELETE, select the doomed rows (`id, app, type`) so the cascade can
key off each row's actual type (the route's `type` arg is only used for table
resolution and often doesn't match, e.g. client passes `datasets_env|source`).
After the DELETE + change_log entries, inside the same transaction:

- kind `source` (type ends `:source`):
  - delete child view rows `type LIKE '{instance}|%:view'` (LIKE-escaped), each
    with a 'D' change_log entry, and drop each view's data split table via
    `resolveTable(app, '{instance}|{viewId}:data', dbType, splitMode, sourceId)`
    (sourceId = the deleted source row id — do NOT use `lookupSourceId`, the
    source row is already gone).
  - remove `{ref, id}` entries matching the source id from `data.sources` of any
    `%:dmsenv` / `%:pattern` row in the app; 'U' change_log entry per touched row.
  - evict `_sourceIdCache` entry for the slug.
- kind `view` (type ends `:view`):
  - drop its data split table (source still exists → `lookupSourceId` works).
  - remove its id from parent source rows' `data.views`; 'U' change_log entries.
- after dropping tables, clear the table-resolver existence caches so a later
  re-create with the same name re-runs `ensureTable`.

### 2. Read-side ghost filtering (uda/utils.js `getSiteSources`)

After collecting `allSources`, verify ids against the main table
(`SELECT id ... WHERE id = ANY($1)` — sqlite adapter translates ANY → IN) and drop
entries whose row no longer exists. Defends the list against orphans created
out-of-band (direct SQL, old servers) — length, byIndex and byId then agree.

### 3. Regression tests (tests/test-delete-cascade.js)

Graph-harness test (SQLite default, `DMS_TEST_DB` for PG): build
pattern(dmsEnvId) → dmsEnv(sources) → source → view → data rows via routes; delete
the source via `dms.data.delete`; assert env `data.sources` no longer references
it, view row gone, split table dropped, and `uda...sources.length` reflects the
removal. Second case: dangling ref injected directly → `getSiteSources` filters it.
Third case: view delete cleans `data.views` + drops its split table.

### 4. One-time prod repair (npmrdsv5 on dms3@mercury) — STAGED, NOT RUN

Script: `dms-template/scratchpad/npmrdsv5/repair-datasets-env-orphans.mjs`
(run with `node`; single transaction, writes JSON backups of both rows next to
itself before mutating, mirrors both writes into `dms.change_log` with
user_agent `orphan-repair-script`, then re-verifies zero dangling refs).

- Remove the 5 dangling refs from env 1676363 `data.sources` (backup saved first).
- Delete orphan view row 2189914.
- Reverse orphans NOT touched (sources alive but unreferenced — invisible in the
  datasets list but reachable by pages): 2177294 `route_snap_2`, 2189815
  `freightatlas_maps` (the live Freight Atlas gallery source — intentionally
  raw-created outside the env). Adding them to the env's `sources` array would
  surface them in the UI; user decision.

## Files Changed — DONE 2026-08-05

- `packages/dms-server/src/routes/dms/dms.controller.js` — doomed-row snapshot in
  `deleteData`, cascade via new scoped helpers `cascadeSourceDelete` /
  `cascadeViewDelete` / `removeIdFromRefArrays` / `dropViewDataTable` /
  `escapeLike`; change_log 'D' rows now record each row's REAL type (clients pass
  approximations like `datasets_env|source`); `_sourceIdCache` evicted on source
  delete. New-format (colon) types only.
- `packages/dms-server/src/db/table-resolver.js` — new `forgetTable(schema, table)`
  export; evicts the existence cache after DROP TABLE so a same-named re-create
  re-runs ensureTable.
- `packages/dms-server/src/routes/uda/utils.js` — `getSiteSources` now verifies
  ref ids against the main table and drops dangling entries (length/byIndex/byId
  agree on live rows). Note: refs without a numeric `id` are now dropped too
  (previously counted in length but broke byIndex).
- `packages/dms-server/tests/test-delete-cascade.js` — new, 11 assertions.
- `packages/dms-server/package.json` — `test:delete-cascade` script; appended to
  the `test` chain.

## Testing Checklist

- [x] New test file passes on SQLite (`npm run test:delete-cascade`) — 11/11
- [x] Existing suite still green (`npm test` = sqlite/controller/graph/workflow;
      plus `test:uda` 93/93, `test:sync` 75/75)
- [ ] PG run (`npm run test:pg`) — not run this session (no Docker check done)
- [x] Prod repair executed + verified 2026-08-05 (user-approved): env 1676363 has
      10 refs, all resolving; view 2189914 gone; backups in
      `dms-template/scratchpad/npmrdsv5/`
- [ ] Datasets list on npmrdsv5 shows no ghost entries (needs a browser reload;
      DatasetsList keeps a localStorage cache)

## Pre-existing failure noted (NOT from this change)

`npm run test:splitting` fails at `testNewFormatResolveTable`: expects
`data_items__adamtest1_v1` for the no-sourceId fallback but `splitTableName()`
produces `data_items__adamtest1_vv1` (the `_v` prefix + view slug `v1`). The
fallback is documented "should not happen in normal flow"; test and code have
drifted. Decide which is canonical and fix separately.
