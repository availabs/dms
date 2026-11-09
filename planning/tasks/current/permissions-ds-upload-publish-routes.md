# Datasets: permission checks on upload, publish, validate and file upload routes

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built · **Release:** commit — committed on master 2026-10-21, not pushed; deploy pending · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md) (vocabulary: `create-source`,
`create-view`) and [permissions-dama-admin-client-auth-headers.md](./permissions-dama-admin-client-auth-headers.md)
(client sends the token). Plugin publish routes in `data-types/` are a separate task:
[datatype-plugin-route-permissions.md](../../../../../planning/shared/tasks/current/datatype-plugin-route-permissions.md).

## Objective

Every route that creates a source or adds data to one checks who is asking. Today none of them do, and they
take the owner's `user_id` from the body.

## Routes (paths under `dms-server/src/dama/upload/`; mounted in `index.js`)

| route | does | check today | should need |
|---|---|---|---|
| `routes.js:27` GET `/dama-admin/:pgEnv/etl/new-context-id` | counter | none | login |
| `routes.js:38` POST `/:pgEnv/gis-dataset/upload` | multipart to temp dir + analysis | none | login (+ `create-source` or `create-view` once the target is known; upload alone writes only temp files) |
| `routes.js:196`, `gis-routes.js:25,50,104,127` layers / layerNames / layerAnalysis / tableDescriptor | read or queue analysis of an upload | none (GDAL guard only) | login, and the upload's own `user_id` = caller |
| `gis-routes.js:178` POST `/:pgEnv/gis-dataset/publish` | creates a source when no `source_id` (`:185`), else new view | none | no `source_id` → `create-source` on the datasets pattern; with `source_id` → `create-view` on it |
| `gis-routes.js:221` POST `/:pgEnv/csv-dataset/publish` | same, CSV (`:228`) | none | same |
| `file-upload-route.js:30` POST `/:pgEnv/file_upload` | create source or use `source_id`, create view, store file | none | same split. Also used by image cells and Lexical images (`ui/columnTypes/image.jsx`, `InlineImageComponent.tsx`): decide whether those need `edit-page`/`edit-section` on the page instead (they upload into a shared files source) |
| `file-upload-dms-route.js:33` POST `/dms-admin/:app/file_upload` | creates a DMS internal source + view under `owner_id`/`owner_instance` | none; `user_id` from form (`:126`) | `create-source` on the owner pattern / dmsEnv |
| `routes.js:226` POST `/dama-admin/dms/:appType/publish` | writes rows into a DMS split table; appends attributes to `source.config` (`:435`) | none | `create-view` (new view) / `update-source` (existing view) on the internal source |
| `routes.js:584` POST `/dama-admin/dms/:appType/validate` | re-validates, updates `isValid` or moves rows | none | `update-source` |
| `dama/datatypes/pmtiles.js:230` POST `/:pgEnv/pmtiles/cache-pmtiles` | queue PMTiles build | none | `manage-downloads` (moved to [permissions-ds-downloads-and-files.md](./permissions-ds-downloads-and-files.md)) |

## What was built (2026-10-21)

Gates live in a new `dama/upload/auth.js`; the core helpers in `routes/uda/sourceAuth.js` gained
`requireSourcePermission(..., { wasOpen })` and `requirePatternPermission(..., { app })` (a pattern of another app
is dropped, so denies). Every route below checked nothing before, so `legacy` / `log` allow and log would-denies;
`enforce` decides. **Login is required unconditionally** (`requireLogin`, mounted in `upload/index.js`), as for the
uda writes: the client sends its token on every one of these calls (task 3, checked live).

| route | gate |
|---|---|
| new-context-id, gis-dataset/upload | login; the upload records the token user (`store.create(id, { userId })`) |
| layers, layerNames, layerAnalysis (POST + GET), tableDescriptor | login; **403 unless the caller staged the upload** (`checkUploadOwner`) |
| gis / csv publish | login; own upload; no `source_id` → `create-source` on the named pattern; `source_id` → `create-view` or `update-source` on it (as uda `views.create`). The upload is now looked up **before** `createDamaSource`, so a bad upload id no longer leaves an empty source behind |
| `/dama-admin/:pgEnv/file_upload` (image cells, Lexical) | login; `source_id` → `create-view`/`update-source`; a named pattern → `create-source` on it; **no pattern named → login only** (owner decision 2026-10-21: each upload makes a private, hidden `file_upload` source owned by the uploader) |
| `/dms-admin/:app/file_upload` | login; `source_id` → `create-view`/`update-source` on the internal source; new → `create-source` on the named pattern of `:app`, and **`owner_id` must be that pattern or its dmsEnv** (else a grant on one pattern could rewrite `sources` on any row of the app; enforce 403s, log logs) |
| `/dama-admin/dms/:appType/publish` | login; own upload; `edit-source-data` or `update-source` (owner decision 2026-10-21) on **both** the source the data type names (`sourceIdForDataType`: rows go to its table) and the body's `sourceId` (its `config` gets the new attributes). Under enforce, a type that resolves to no source is refused |
| `/dama-admin/dms/:appType/validate` | login; same permission on the type's source (fallback: body `parentId`) |

Owner = token user everywhere: `createDamaSource` / `createDamaView` `user_id` (so the new source's
`auth_permissions.users`), the queued task descriptor's `user_id`, DMS rows' `created_by`. A different body
`user_id` is logged (`requestUserIdWarnBody`; for multipart routes `req.body` is set to the parsed fields).
Refusals clean up the temp file. The descriptor's `email` still comes from the body (display only).

Not changed: `events/query` (polled for upload and task progress; task status reads are task 7); PM tiles moved to
task 6.

## Proposed changes (original plan)

- [ ] Apply the core middleware to each route. Read the target `source_id` from the body before deciding
  which permission applies.
- [ ] Owner = token user (`requestUserId(req)`), for the new source's grants (`metadata.js:105-112`), the view's
  `user_id` and the task's `user_id`.
- [ ] A datasets pattern must be resolvable for `create-source`: the request names it (pgEnv → pattern via the
  site's datasets patterns), or the client sends the pattern id. Pick one in the core task.
- [ ] Return JSON 401/403; the create wizard shows it (client task).
- [ ] Tests: publish without a user → 401; new source without `create-source` → 403; add version without
  `create-view` → 403; with grants → succeeds and the new source's owner is the token user, whatever the body says.

## Testing checklist

- [x] `tests/test-upload-auth.js` (new, 24): every route 401s anon; upload ownership on the reads and publishes;
  gis/csv: bad upload → 400 with no source created, enforce refusals (no create-source, no pattern, no create-view);
  `authorizePublish` allow/deny under enforce and would-deny under log; pgEnv file_upload with no pattern creates a
  source owned by the token user (body `user_id: 999` ignored; source + view `user_id`, `auth_permissions.users`);
  DMS file_upload create (listed on the dmsEnv), refused without grant / other app's pattern / foreign owner row;
  DMS publish writes rows with `edit-source-data`, refused for a stranger and for a body `sourceId` the caller
  can't write; validate under enforce and log; unresolvable type refused. Fixtures go through
  `controller.createData` (raw INSERTs collide with the controller's id allocator). SQLite ✓, Postgres ✓
  (`DMS_TEST_DB=dms-postgres-test DMS_DB_ENV=dms-postgres-test DAMA_TEST_DB=dama-postgres-test`).
  Also green: `test-source-auth` 48, `test-uda-auth` 24 (SQLite + Postgres), `test-upload-pipeline` 12,
  `test-tasks` 22, `test-schedules` 29, `test-delete-cascade` 16.
- [x] Live, **under `DMS_SOURCE_AUTH_MODE=enforce`**, as `v6test Admin` (3458 current code + 5197, verify kit
  `authcheck/`): CSV create → publish (source 72, owner user 1); file source create (`/dms-admin/v6test/file_upload`
  → internal source 96); internal source 4 validate + upload + publish (2 rows created, config +2 attrs); image
  cell upload (`flow-image.mjs`, stored URL returned). No 401/403 or would-deny lines. test_dama writes reverted.
- [ ] Live as a non-admin (granted / ungranted): not run, no such user in v6test; covered by unit tests. The
  create wizard shows `PermissionError` messages where it already catches them (upload.jsx); the rest is task 10.
- [ ] Blast radius: the active uploaders from [permissions-inventory.md](../completed/permissions-inventory.md) hold the
  grants before `enforce` (the access-diff audit, 1b).
