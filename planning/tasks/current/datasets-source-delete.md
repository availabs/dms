# Task: Datasets Source Delete — Soft + Hard Delete with 3-option Modal

## Objective

Fix the non-functional **Delete Source** button on the datasets default admin page
(`pages/dataTypes/default/admin.jsx`). Replace its 2-option modal with a 3-option
modal offering **Cancel**, **Delete** (metadata-only), and **Hard Delete** (drops
tables and removes files from storage).

## Problem

The current `DeleteSourceBtn` in `packages/dms/src/patterns/datasets/pages/dataTypes/default/admin.jsx`
calls `falcor.call(["dms","data","delete"], [app, sourceType, sourceId])`, but this
route targets the DMS `data_items` table — not the `data_manager.sources` /
`data_manager.views` rows where datasets actually live. As a result the UI
reports success but nothing changes; the source remains visible and queryable.

## Current State

Source data lives in **three** places and spawns **two** kinds of side effects:

1. **`data_manager.sources`** — source row keyed by `source_id`
2. **`data_manager.views`** — one or more view rows per source (`view_id`, `table_schema`, `table_name`, `data_table`)
3. **Per-view data tables** — e.g. `gis_datasets.s{source_id}_v{view_id}` (created by `gis-publish` / `csv-publish` workers); stores the actual rows + geometry
4. **Task history** — `data_manager.tasks` rows with `source_id = ?`
5. **Download files** — created by `create-download` worker, written via `storage.write()` under `{pgEnv}/s_{source_id}/…` (see `dama/storage/local.js`, `s3.js`)
6. **Tile cache** — any pmtiles/mvt cache keyed on `view_id` (check `dama/tiles/`)

There is no existing Falcor route that deletes from the data_manager tables.
The `dms.data.delete` route (`routes/dms/dms.route.js:434`) only operates on
`data_items`, the content-management table.

## Proposed Changes

### 1. New Falcor routes for UDA delete

Add a CALL route for soft and hard deletion under `uda[pgEnv].sources.delete` and
`uda[pgEnv].sources.hardDelete`. Implement in
`routes/uda/uda.tasks.route.js` (or a new `uda.delete.route.js` if it grows).

**Soft delete** (`uda[pgEnv].sources.delete` with `[sourceId]`):
- DELETE from `data_manager.views` WHERE source_id = $1
- DELETE from `data_manager.sources` WHERE source_id = $1
- Leaves data tables, files, and task rows intact (recoverable)

**Hard delete** (`uda[pgEnv].sources.hardDelete` with `[sourceId]`):
- For each view:
  - `DROP TABLE IF EXISTS {table_schema}.{table_name}`
  - Delete any `metadata.tiles` cached files
  - Delete all download files referenced in `metadata.download` via `storage.remove()`
- Delete `data_manager.views` rows for source
- Delete `data_manager.tasks` rows for source (or mark them; rows reference a now-gone source)
- Delete source's storage folder: `storage.remove(`${pgEnv}/s_${source_id}`)`
- DELETE from `data_manager.sources`
- Wrap in a transaction; if any DROP fails, roll back metadata deletes so the source
  isn't left orphaned

### 2. Controller

Add to `routes/uda/uda.tasks.controller.js` (or a new `uda.delete.controller.js`):
- `softDeleteSource(env, sourceId)` — metadata only
- `hardDeleteSource(env, sourceId)` — full cleanup, returns `{dropped_tables, removed_files, deleted_views, deleted_tasks}` summary

Both should run inside a DB transaction. `hardDeleteSource` should catch individual
file/table errors, continue, and report them in the result rather than aborting —
the user explicitly asked for "drop everything", so partial cleanup is preferable
to nothing.

### 3. 3-option modal

Replace the current `DeleteModal` usage with a custom 3-option modal (or extend
`DeleteModal` to accept a `secondaryAction` prop):

- **Cancel** — closes the modal, no action
- **Delete** (yellow/orange) — soft delete; prompt warns "Source/view rows will
  be removed but data tables and files remain and could be restored by an admin"
- **Hard Delete** (red) — hard delete; prompt warns "This will drop data tables,
  delete download files, and remove task history. This cannot be undone."

Require a typed confirmation for Hard Delete (e.g., user must type the source
name to enable the button) — this is a destructive, shared-system action and
the user should explicitly opt in.

### 4. Client wiring

In `DeleteSourceBtn` (admin.jsx):

```js
const softDelete = () => falcor.call(['uda', pgEnv, 'sources', 'delete'], [sourceId]);
const hardDelete = () => falcor.call(['uda', pgEnv, 'sources', 'hardDelete'], [sourceId]);
```

After either completes, invalidate the UDA source list and navigate back to
`baseUrl` (same flow as today).

## Files Requiring Changes

- `packages/dms/src/patterns/datasets/pages/dataTypes/default/admin.jsx` — `DeleteSourceBtn` refactor, new 3-option modal
- `packages/dms/src/ui/...` — extend `DeleteModal` or add a new `DestructiveConfirmModal` component (3 options, typed-confirmation support)
- `packages/dms-server/src/routes/uda/uda.tasks.route.js` — add two CALL routes for delete/hardDelete
- `packages/dms-server/src/routes/uda/uda.tasks.controller.js` — add `softDeleteSource` / `hardDeleteSource`
- `packages/dms-server/src/dama/storage/*.js` — verify `remove()` handles directory paths (local already does; S3 may need list+batch-delete)
- `packages/dms-server/tests/test-uda-delete.js` *(new)* — regression tests for both paths

## Testing Checklist

- [ ] Soft delete: source and views rows gone, data tables still present, tasks intact
- [ ] Hard delete: source, views, tasks, data tables, download files all gone
- [ ] Hard delete with missing table (pre-dropped): completes with warning, source row still removed
- [ ] Hard delete with missing storage files: completes cleanly
- [ ] Falcor cache invalidated after both deletes — DatasetsList no longer shows the source
- [ ] Cancel button in modal leaves everything untouched
- [ ] Typed-confirmation on Hard Delete prevents accidental clicks
- [ ] PostgreSQL + SQLite paths both work (dama role is typically postgres; may not need SQLite support)
- [ ] Transaction rollback when DROP TABLE fails mid-way

## Open Questions

- Should hard delete also purge Falcor cache entries for the deleted views' tiles endpoints?
- Should tasks referencing the source be deleted, or kept for audit? Deleting is simpler and matches user intent ("hard delete"); keeping them means rows with dangling `source_id` FKs.
- Is there a use case for deleting a single view (not the whole source)? Not in this task — the modal is source-level. Could be a follow-up.

## Context

- Discussed after completing Map 21 Extended (`source_id=2001`) upload, during which
  the user noticed the admin-page Delete button has no effect.
- User wants symmetric API: soft delete lets them recover from metadata-only mistakes;
  hard delete is for "I know what I'm doing, wipe it" cleanups.
