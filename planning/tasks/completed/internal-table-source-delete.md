# Internal-table Source Delete + dmsEnv Ownership Fixes

## Status: DONE — 2026-04-24

Both parts shipped + verified in the UI. The "multiple dmsEnvs" symptom turned out to be a UI-layer artifact rather than a storage bug — the DB never had a source in two dmsEnvs. Root cause was that `buildDatasources` emitted one internal datasource per dataset pattern, so two patterns sharing a dmsEnv produced two envs that both queried the same source set, and the picker showed each source twice.

### Shipped

**Server (`packages/dms-server/src/routes/uda/uda.tasks.controller.js`)**
- New `deleteInternalSource(env, sourceId)` — full DMS cleanup: drops per-view split tables, strips source refs from any owning dmsEnv, deletes view rows, deletes source row, deletes `dms.tasks` rows for `(app, source_id)`. DDL outside transaction (collects warnings); data deletes inside one transaction.
- Best-effort path when source row already gone — still strips dmsEnv refs and deletes task rows. Warning surfaced in result.
- `softDeleteSource` and `hardDeleteSource` branch on `isDmsEnv(env)` and delegate to `deleteInternalSource` for DMS envs (single behavior — no soft/hard distinction since DMS data lives in split tables, no recoverability story).

**Client (`packages/dms/src/patterns/datasets/pages/dataTypes/internal/pages/admin.jsx`)**
- `DeleteSourceBtn` now calls `uda.sources.delete` with the DMS env, surfaces server errors, broadcasts cache invalidations to every dmsEnv the server reported updating (via `result.dmsEnvs_updated`), busts `clearDatasetsListCache`, and only navigates back on success.
- Modal copy made explicit about what's removed.

**Picker root-cause fix (`packages/dms/src/render/spa/utils/index.js#buildDatasources`)**
- Internal datasources are now deduped by `pattern.dmsEnvId` — two patterns sharing a dmsEnv produce one queryable env. Patterns without a dmsEnvId (legacy) each remain unique entry points.
- Picker no longer shows each source twice when patterns share a dmsEnv.

**Operational tools**
- `packages/dms-server/src/scripts/cleanup-stale-dmsenv-refs.js` — belt-and-suspenders script that scans all apps × dmsEnvs and strips refs pointing at deleted source rows. Dry-run by default, `--apply` to write. Discovers per-app PG schemas (`dms_{app}.data_items`) plus the shared `dms.data_items` and SQLite. Registered as `npm run db:cleanup-stale-dmsenv-refs`.
- One-time live DB cleanup ran for the legacy stale ref (id=2140511 in test_meta_forms_env on dms-mercury-3).

### Investigation notes

- The user reported "sources getting added to multiple dmsEnvs". DB inspection (mitigat-ny-prod, all dmsEnvs) found 0 sources cross-referenced. The visible duplication was the picker rendering one source twice because two patterns (`Datasets` + `test-meta-forms`) both have `dmsEnvId=1676363`. Fixed at the buildDatasources layer.
- `getSitePatterns` / `getSiteSources` server-side checked out — they each correctly query the right dmsEnv via `pattern.dmsEnvId`. The duplication was purely a function of the client emitting two envs that asked the server for the same data.

## Objective

Two related concerns about internal_table sources and their relationship to dmsEnv rows:

1. **Delete** is broken — the existing button removes only the `data_items` source row and orphans everything else (views, split tables, dmsEnv refs, DMS task history).
2. **Create** can attach a source to the wrong dmsEnv when the pattern has been reconfigured to use a dmsEnv other than the one initially auto-created for it. The user reports new sources being added to multiple dmsEnvs in this case.

Both touch the same dmsEnv ↔ source ownership chain, so they go together.

## Background — where an internal_table source actually lives

For a `cenrep` site with pattern `datasets` configured to a dmsEnv `my_env`, creating a source named "Foo" produces:

| Row / table | Where | Type |
|---|---|---|
| Source row | `data_items` (or `dms_{app}.data_items`) | `my_env\|foo:source` |
| One or more view rows (per version) | `data_items` | `foo\|v1:view`, `foo\|v2:view`, … |
| Per-view data tables | `dms_{app}.data_items__s{sourceId}_v{viewId}_foo` | (split table, holds the actual rows) |
| Source ref in dmsEnv | `data_items` row for the dmsEnv, in `data.sources` array | `[{ ref: "{app}+my_env\|source", id: <sourceId> }, …]` |
| Task history | `dms.tasks` (and `dms.task_events`) for any internal-table publish | `app=…`, `source_id=…` |

A complete delete must touch all five rows/places. The existing button only deletes the source row.

## Part 1 — Internal-table source delete

### Current bug

`packages/dms/src/patterns/datasets/pages/dataTypes/internal/pages/admin.jsx#DeleteSourceBtn` (the component used for `internal_table` sources) calls:

```js
await falcor.call(["dms", "data", "delete"], [app, sourceType, sourceId]);
```

This removes the source row from `data_items` only. After deletion:
- View rows for that source remain (`foo|v1:view` etc. — orphans)
- Split tables remain (`dms_{app}.data_items__s{sourceId}_v{viewId}_foo` — orphan disk usage)
- The owning dmsEnv's `data.sources` array still contains a `{ref, id}` pointing at the now-gone source (orphan ref → 404 on hover/follow)
- `dms.tasks` rows with `source_id = <deletedId>` remain (task list shows tasks for a phantom source)

### Proposed delete flow

Mirror the DAMA hard-delete shape on the DMS side. There's no soft/hard distinction here because internal_table data **is** the rows in the split table — there's nothing equivalent to DAMA's "metadata-only delete leaves the data tables behind for recovery." A single confirmed delete that does the full cleanup is the right shape.

Server-side: new function `deleteInternalSource(app, sourceId)` that runs in a transaction:

1. **Resolve the source** — `SELECT id, type, data FROM dms_{app}.data_items WHERE id = $1`
   - Extract source slug from `getInstance(type)`
   - Extract view IDs from `data.views` array (objects of shape `{ref, id}`)
2. **Resolve view types** — for each view id, `SELECT type FROM dms_{app}.data_items WHERE id = $viewId`. View type is `{sourceSlug}|{viewSlug}:view`. Extract `viewSlug` (often `v1`, `v2`).
3. **Drop split tables** — for each view, compute the split table via `resolveTable(app, '{sourceSlug}|{viewId}:data', dbType, splitMode, sourceId)` and `DROP TABLE IF EXISTS`. Catch per-table errors → push to warnings array, continue.
4. **Delete view rows** — `DELETE FROM dms_{app}.data_items WHERE id = ANY($viewIds)`
5. **Find owning dmsEnv(s)** and strip the source ref:
   ```sql
   SELECT id, data FROM dms_{app}.data_items
   WHERE app = $1
     AND type LIKE '%:dmsenv'
     AND data->'sources' @> jsonb_build_array(jsonb_build_object('id', $2::int))
   ```
   For each match, build the new sources array minus the ref, write back via the existing data-edit code path.
6. **Delete the source row** — `DELETE FROM dms_{app}.data_items WHERE id = $sourceId`
7. **Delete task history** — `DELETE FROM dms.tasks WHERE app = $app AND source_id = $sourceId`. The `task_events` rows cascade via the FK.
8. **Return summary** — `{ deleted_source, deleted_views, deleted_tasks, dropped_tables, dmsEnvs_updated, warnings }` for symmetry with DAMA's hard-delete result.

Wrap the data-changing steps in a single transaction; the DROP TABLE step runs outside the transaction (DDL semantics) — collect warnings rather than aborting.

### Falcor route

Add a CALL route `uda[{key:env}].sources.delete` for the DMS env path. The server already dispatches by `env.includes('+')` for the existing `softDeleteSource`/`hardDeleteSource` routes, but those have a different shape (`uda.sources.delete` with a pgEnv arg). For the DMS path, the env is `app+instance` (e.g. `cenrep+datasets`) and the route should pull `app` from the env.

Cleanest API: add `uda[{key:env}].sources.deleteInternal` accepting `[sourceId]`. The controller dispatches by env shape — DMS env (with `+`) calls `deleteInternalSource`, DAMA env keeps existing behavior. Or alternatively, reuse `uda.sources.delete` and let the controller branch internally on whether the env contains `+`.

Recommend the second approach (single `uda.sources.delete` that branches) so the client doesn't need to know which backend the source lives in.

### Client wiring

Update `packages/dms/src/patterns/datasets/pages/dataTypes/internal/pages/admin.jsx#DeleteSourceBtn` to:

1. Call the new (or branched) UDA delete route with the DMS env (`{app}+{type}`).
2. After success: invalidate `['uda', `${app}+${type}`, 'sources', 'length' / 'byIndex' / 'byId', sourceId]`, plus `['dms', 'data', app, 'byId', dmsEnv.id]` so the dmsEnv's sources array refreshes.
3. `clearDatasetsListCache()` so the list page re-fetches.
4. Navigate back to `baseUrl`.

Modal text should state plainly that all versions, all uploaded data, and all task history will be permanently removed.

## Part 2 — dmsEnv membership bug

### What the user reports

> "New internal sources are getting added to multiple dmsEnvs currently if the datasets pattern is configured to use a specific dmsEnv that isn't the one created by that pattern."

### Code paths to investigate

The two create flows both rely on `dmsEnv` from `DatasetsContext`, which is populated in `packages/dms/src/patterns/datasets/siteConfig.jsx:67` as:

```js
dmsEnv: pattern.dmsEnvId ? dmsEnvById[pattern.dmsEnvId] : null,
```

— so `context.dmsEnv` should always be the pattern's currently-configured one.

The two creators:

1. **`pages/CreatePage.jsx#handleCreate`** (generic create, no specific datatype):
   - Lines 77-95 — DMS path
   - `dmsEnvInstance = getInstance(dmsEnv.type)`
   - `sourceType = ${dmsEnvInstance}|${sourceSlug}:source`
   - Adds `{ ref: ${app}+${dmsEnvInstance}|source, id: +newId }` to `dmsEnv.sources` only
2. **`pages/dataTypes/internal_table/pages/sourceCreate.jsx#handleCreate`** (internal_table-specific create):
   - Lines 26-100
   - `const sourceOwner = dmsEnv || parent` (line 67)
   - Same dmsEnvInstance + sourceType derivation

Statically both look correct: the source ref is added to one dmsEnv only — the configured one.

### Hypotheses to test

The bug may be one of these (write a small repro for each before changing code):

1. **Stale context after pattern reconfigure** — when the user changes a pattern's `dmsEnvId` in the admin and then immediately creates a source without a page reload, `DatasetsContext.dmsEnv` may still reflect the previous (auto-created) dmsEnv. The source is then added to the old dmsEnv's sources array; on page reload the user sees the NEW dmsEnv ALSO has the source via some auto-add path. Verify by changing dmsEnvId and observing context.dmsEnv before creating.

2. **List query union, not actual storage in two places** — `getSiteSources` on the server walks pattern→dmsEnv→sources for each pattern matched by the env's instance. If two patterns in the same app share an instance (e.g., both have type `*|datasets:pattern`), the list aggregates sources from both their dmsEnvs, making it *appear* the source is "in" multiple dmsEnvs while it's actually only stored in one. Verify by querying the dmsEnv rows' `data.sources` arrays directly.

3. **Auto-create on first source** — if there's a path that auto-creates a dmsEnv when none exists for a pattern, and that path runs even when `pattern.dmsEnvId` IS set (e.g., a dmsEnvById lookup miss), the source could be added to a freshly-created dmsEnv in addition to the configured one. `grep` for any `falcor.call(["dms", "data", "create"], ...)` with a `:dmsenv` type in the create paths.

4. **Source's `type` column points to wrong dmsEnv** — if `dmsEnvInstance` is computed from a stale pattern, the source's TYPE column will encode the wrong dmsEnv as its parent. Even though the ref ends up in the configured dmsEnv's sources array, queries that match by `type LIKE '%|{otherInstance}|%:source'` would surface it under both. Verify by inspecting the source row's type after creation.

### Proposed fix shape (pending which hypothesis lands)

Most likely combination of:
- Make `DatasetsContext.dmsEnv` reactive to pattern changes (or force a refetch of the pattern row before create).
- After creating a source, if the source's type-encoded parent doesn't match the active dmsEnv, log a warning so future regressions are loud.
- Add an explicit assertion in `handleCreate` that `dmsEnv.id === pattern.dmsEnvId` before writing — fail fast if not.

## Files Requiring Changes

| File | Change |
|------|--------|
| `packages/dms-server/src/routes/uda/uda.tasks.controller.js` (or new `uda.sources.controller.js`) | Add `deleteInternalSource(app, sourceId)` with the 7-step transactional flow above |
| `packages/dms-server/src/routes/uda/uda.tasks.route.js` | Either branch `uda.sources.delete` by env shape, or add `uda.sources.deleteInternal` |
| `packages/dms/src/patterns/datasets/pages/dataTypes/internal/pages/admin.jsx` | Replace `DeleteSourceBtn`'s falcor call with the new UDA route; expand modal copy; widen cache invalidations to include the dmsEnv row |
| `packages/dms/src/patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx` | Add diagnostic logs / assertion guarding `dmsEnv.id === pattern.dmsEnvId` before creating; investigate hypotheses |
| `packages/dms/src/patterns/datasets/pages/CreatePage.jsx` | Same diagnostic / assertion |
| `packages/dms-server/tests/test-uda-internal-delete.js` *(new)* | Cover create + delete cycle, dmsEnv membership before/after, split table presence/absence |

## Testing Checklist

### Internal-table delete
- [ ] After delete, source row is gone from `data_items`
- [ ] After delete, view rows for that source are gone
- [ ] After delete, split tables are dropped (`information_schema.tables` no longer lists `data_items__s{sourceId}_*`)
- [ ] After delete, the owning dmsEnv's `data.sources` array no longer contains the source's ref
- [ ] After delete, no `dms.tasks` rows reference the deleted source_id
- [ ] After delete, `task_events` rows for those tasks are also gone (FK cascade)
- [ ] Delete with already-dropped split table completes with a warning, source row still removed
- [ ] Delete with task history present completes (doesn't fail on FK)
- [ ] Delete inside a transaction — if any DELETE fails, rolled-back state is consistent
- [ ] Falcor cache invalidated; list page no longer shows the source after delete
- [ ] Modal confirms before action, cancel leaves state untouched

### dmsEnv membership
- [ ] Create source on a pattern with dmsEnvId set: source is added to that dmsEnv only, not the pattern's auto-created dmsEnv
- [ ] After changing a pattern's dmsEnvId and creating a source without page reload, source goes to the new dmsEnv
- [ ] Verify the source's `type` column encodes the active dmsEnv as parent (e.g. `{newEnvSlug}|{sourceSlug}:source`)
- [ ] Two patterns sharing an env-instance don't cause double-counting in the list page
- [ ] Repro and write a regression test for whichever hypothesis turns out to be the cause

## Out of scope

- Changes to the DAMA hard-delete flow (already shipped; this is the DMS counterpart).
- Restructuring how dmsEnvs are created or owned (covered in `internal-pgenv.md` if needed).
- Single-view delete (this task is source-scoped). Could be a follow-up if requested.

## Context

- Discussed 2026-04-24 after closing `datasets-source-delete.md`. The DAMA side shipped first because that's where the user's primary upload flow lives; the internal_table side is the natural counterpart.
- The dmsEnv-membership bug was raised in the same conversation as a related ownership concern that should be fixed alongside the delete work since both touch the same dmsEnv ↔ source ↔ pattern relationship.
