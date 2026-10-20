# Datasets: permission checks on upload, publish, validate and file upload routes

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

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

## Proposed changes

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

- [ ] Unit/integration tests above (`tests/test-upload-auth.js`, scratch sqlite + Postgres pgEnv).
- [ ] Live: GIS upload → publish new source; CSV publish into an existing source; DMS internal upload → publish →
  validate; file_upload create; image cell upload. Each as a granted user (works) and an ungranted user (clear error).
- [ ] Blast radius: the active uploaders from [permissions-inventory.md](../completed/permissions-inventory.md) hold the
  grants before this ships.
