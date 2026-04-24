# File upload — DMS-backed source metadata (dmsEnv owner)

## Objective

Make `file_upload` work without a DAMA pgEnv by storing source/view metadata as DMS `data_items` rows registered to a `dmsEnv`, and make that the **default** storage target even when a pgEnv is configured. The uploaded file itself continues to flow through the existing storage service (local disk / S3) and the endpoint still returns a public download URL.

## Scope

**In scope**
- New upload endpoint (or reworked existing one) that creates a DMS `source` + `view` pair, registers the source on a `dmsEnv`, writes the file via `storage.write()`, and returns the download URL.
- Client `file_upload/CreatePage.jsx` rewritten to target the new endpoint and follow the dmsEnv-aware create pattern already used by `internal_table/sourceCreate.jsx`.
- Client `file_upload/ViewPage.jsx` rewritten to read `file_name` / `file_type` / `dl_url` / `description` off the DMS source/view rows instead of UDA `viewsById.*.options.*.dataByIndex`.
- File storage path keyed on `app` + dmsEnv instance + source id + view id so multiple DMS sites on the same storage backend don't collide.
- Behavior when a pgEnv is configured: still use the DMS path by default.

**Out of scope**
- Migrating existing pgEnv-backed `file_upload` sources into DMS. (Data model is additive; legacy rows keep working through the existing pgEnv route until a dedicated migration task is written.)
- Any changes to GIS / CSV upload flows — those keep using the pgEnv route.
- Storage backend changes (local/S3 abstraction stays as-is).

## Current State

### Server — `src/dms/packages/dms-server/src/dama/upload/file-upload-route.js`

- Route: `POST /dama-admin/:pgEnv/file_upload`, registered in `src/dms/packages/dms-server/src/dama/upload/index.js:49`.
- Parses multipart with Busboy, runs optional Sharp image processing (resize → AVIF).
- Creates rows in `data_manager.sources` / `data_manager.views` in the pgEnv Postgres via `createDamaSource` / `createDamaView` (`src/dms/packages/dms-server/src/dama/upload/metadata.js`).
- Writes file at relative path `pg-${pgEnv}_s-${source_id}/v-${view_id}/${finalFileName}` via `storage.write()` (`src/dms/packages/dms-server/src/dama/storage/index.js`).
- Writes `{ file: { file_name, file_type, dl_url, description } }` into `data_manager.views.metadata`.
- Returns `{ ok, source_id }`.

### Client — `src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/file_upload/CreatePage.jsx`

- Gets `pgEnv` from `getExternalEnv(datasources)` (`src/dms/packages/dms/src/patterns/datasets/utils/datasources.js:7`).
- POSTs `FormData` (`source_name`, `type='file_upload'`, `file_name`, `file_type`, `directory`, `description`, `categories`, `user_id`, `source_id?`, `file`) to `${DAMA_HOST}/dama-admin/${pgEnv}/file_upload`.
- On success navigates to `${baseUrl}/source/${json.source_id}`.
- **Breaks today on DMS-only projects** because `pgEnv` is `''` when no external datasource is configured.

### Client — `src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/file_upload/ViewPage.jsx`

- Reads views off `source.views`, then queries Falcor at `uda[pgEnv].viewsById[view_id].options[ops].dataByIndex[i][file_type|dl_url]` to recover the metadata written server-side into `data_manager.views.metadata.file`.
- Renders image preview / download link / clipboard-copy UI.

### Existing DMS-source creation pattern (template to follow)

`src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx` already creates a source + v1 view as DMS `data_items` rows and registers the source on the surrounding `dmsEnv`:

1. `falcor.call(['dms','data','create'], [app, `${dmsEnvInstance}|${sourceSlug}:source`, { name, type: 'internal_table' }])`
2. `falcor.call(['dms','data','create'], [app, `${sourceSlug}|v1:view`, { name: 'version 1' }])`
3. `falcor.call(['dms','data','edit'], [app, sourceId, { views: [{ ref: `${app}+${sourceSlug}|view`, id: viewId }] }])`
4. `falcor.call(['dms','data','edit'], [app, dmsEnv.id, { sources: [...existing, { ref: `${app}+${dmsEnvInstance}|source`, id: sourceId }] }])`
5. Invalidate `dms.data[app].byId[dmsEnv.id]` + UDA sources cache, then `clearDatasetsListCache()`.

The `file_upload` flow should land on the same shape — the only differences are (a) the `type` on the source row is `'file_upload'`, (b) there is a file to push through storage, and (c) the view row carries the `file` metadata object.

## Proposed Changes

### 1. New server route

Add `src/dms/packages/dms-server/src/dama/upload/file-upload-dms-route.js` with `POST /dms-admin/:app/file_upload` (registered next to the existing one in `upload/index.js`). Accepts multipart with these fields:

| Field | Purpose |
|-------|---------|
| `app` (path) | DMS app (e.g. `avail-dms`) |
| `dms_env_id` | Row id of the owning `dmsEnv` (required for new uploads) |
| `dms_env_instance` | Instance slug of that dmsEnv (used to build type strings) |
| `source_id` | Existing DMS source id to append a new view to (optional) |
| `source_slug` | When appending, the source's slug (required with `source_id`) |
| `source_name` | Required when creating a new source (≥4 chars) |
| `file_name` / `file_type` / `description` / `directory` | Same semantics as today |
| `categories` | JSON string, same as today |
| `user_id` | Optional, for auth stamps |
| `file` | The file blob |

Handler responsibilities:

1. Parse multipart via Busboy exactly like the existing route — keep the Sharp resize/AVIF branch unchanged.
2. Using the DMS controller (`createController(process.env.DMS_DB_ENV || 'dms-sqlite')`, same pattern as `upload/index.js:29-30`), upsert the source and view as DMS rows:
   - If `source_id` is provided: look up the row, confirm its `app` matches, reuse it.
   - Otherwise: insert a new source row via `dms.data.create`-equivalent controller call with `app`, `type = ${dms_env_instance}|${source_slug}:source`, `data = { name, type: 'file_upload', categories, user_id, ... }`.
   - Always insert a new view row with `app`, `type = ${source_slug}|${viewCounter}:view`, `data = { name: "version N" }`. Use view count on the source to pick `viewCounter`.
   - Update the source with `views: [...existing, { ref: `${app}+${source_slug}|view`, id: newViewId }]`.
   - Update the owning `dmsEnv` row with `sources: [...existing, { ref: `${app}+${dms_env_instance}|source`, id: newSourceId }]` if the source was newly created.
3. Decide storage path. Replace the pgEnv-keyed form with `dms-${app}_env-${dms_env_instance}_s-${source_id}/v-${view_id}/${finalFileName}` (or honor `directory` when provided, same as today).
4. `storage.write(relativePath, stream)` → `dl_url = storage.getUrl(relativePath)`.
5. Merge the file metadata into the **view** row's `data` via a controller edit call: `{ file: { file_name, file_type, dl_url, description } }`.
6. Respond `{ ok: true, app, source_id, view_id, dl_url }`.
7. On error, clean up the temp file and — if a new source/view was created — best-effort delete the rows (mirroring the no-half-state guarantee of the current pgEnv route).

**Design note:** the existing `createDamaSource` / `createDamaView` in `metadata.js` stay as-is; the new handler doesn't touch `data_manager.*`. A small helper `createDmsFileSource` / `createDmsFileView` can live alongside the new route (not in `metadata.js`, which is DAMA-scoped).

### 2. Registration

In `src/dms/packages/dms-server/src/dama/upload/index.js`:

- Import the new handler.
- Mount: `app.post('/dms-admin/:app/file_upload', fileUploadDms)`.
- Keep the existing `app.post('/dama-admin/:pgEnv/file_upload', fileUpload)` route untouched for legacy consumers.
- Bump the log message route count.

### 3. Client `CreatePage.jsx`

Rewrite to match the `internal_table` two-stage flow (create source → upload), but collapse the two stages into one POST (the server does source + view creation atomically). Key changes:

- Pull `dmsEnv`, `app`, `parent` from `DatasetsContext` (same as `internal_table/sourceCreate.jsx`).
- Render a "DMS-managed" label when there's no pgEnv; keep the same file/directory/description form either way.
- On submit:
  - Build `FormData` with `dms_env_id`, `dms_env_instance` (from `getInstance(dmsEnv.type)`), `source_name`, `file_name`, `file_type`, `directory`, `description`, `categories`, `user_id`, `file`.
  - If `source.source_id` is present (appending a new file to an existing source), also send `source_id` and the source's slug.
  - POST to `${DAMA_HOST}/dms-admin/${app}/file_upload`.
- After success:
  - `falcor.invalidate(['dms', 'data', app, 'byId', dmsEnv.id])` and `['dms', 'data', app, 'byId', newSourceId]`.
  - `clearDatasetsListCache()`.
  - Navigate to `${baseUrl}/source/${json.source_id}` (unchanged).

The `DAMA_HOST` constant is still fine for the request origin — the new route lives on the same server.

### 4. Client `ViewPage.jsx`

Switch the data source from UDA view-metadata to the DMS source/view rows. Each item in `source.views` already carries `id` — Falcor-get the view rows and read `data.file`:

```js
falcor.get(['dms','data', app, 'byId', view.id, ['file']]);
```

Render the existing `ViewItem` (image preview / download link / copy-URL) off that data. Preserve the legacy pgEnv path too: if `view.file` is missing, fall back to the current UDA lookup (so old uploads keep rendering). This fallback can be removed in the future migration task.

### 5. Storage path key

`pg-${pgEnv}_s-${source_id}` is pgEnv-specific. The new key shape `dms-${app}_env-${dms_env_instance}_s-${source_id}/v-${view_id}/${finalFileName}` keys on DMS identifiers so different DMS sites sharing one storage backend don't collide. Keep the `directory` override path exactly as today for callers that set it.

## Files Requiring Changes

**New**
- `src/dms/packages/dms-server/src/dama/upload/file-upload-dms-route.js` — new handler.

**Modified**
- `src/dms/packages/dms-server/src/dama/upload/index.js` — register the new route.
- `src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/file_upload/CreatePage.jsx` — retarget to the DMS route; drop `pgEnv` dependency; include dmsEnv fields.
- `src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/file_upload/ViewPage.jsx` — read `file` off DMS view rows, keep a fallback branch for legacy UDA-backed views.

**Untouched (intentionally)**
- `src/dms/packages/dms-server/src/dama/upload/file-upload-route.js` — legacy pgEnv path stays for backwards compat.
- `src/dms/packages/dms-server/src/dama/upload/metadata.js` — DAMA source/view creation is still needed by GIS/CSV uploads.
- Storage backends (`local.js` / `s3.js`) — unchanged.

## Decisions

- **Owner row is dmsEnv, with fallback to `parent`.** The client resolves `sourceOwner = dmsEnv || parent` (matches `internal_table/sourceCreate.jsx` and `datasets/pages/CreatePage.jsx`). It sends `owner_id`, `owner_ref` (e.g. `${app}+${ownerInstance}|source`), and `owner_instance` (used to build the source type string `{ownerInstance}|{sourceSlug}:source`). The server treats the owner as an opaque DMS row id — it merges the new source ref into that row's `data.sources` via `controller.setDataById(owner_id, { sources: [...] }, user, app)` without caring whether it's a dmsEnv or a pattern.
- **Multi-file per source.** When the client sends `source_id` + `source_slug`, the server skips source creation and skips touching the owner's `sources`; it just creates another view and appends it to the source's `views`. The view name is `version ${N}` where `N = existingViews.length + 1`. The client's `CreatePage` skips the `source_name` validation in that branch.
- **View type counter.** New view types are `${source_slug}|v${N}:view`, using the same `N` as the version name. This keeps alignment with `internal_table/sourceCreate.jsx` which uses `|v1:view`.
- **No atomic rollback.** If `storage.write()` fails after source/view rows were created, the handler deletes the view row (and source row, if it was also newly created in this request) before returning 500. The owner's `sources` entry is stripped on source rollback. This matches the spirit of the existing pgEnv route (no half-state).
- **Storage path shape.** `dms-${app}_env-${ownerInstance}_s-${source_id}/v-${view_id}/${finalFileName}` when `directory` is not provided. The `directory` override path is preserved exactly as today (`${directory}/${finalFileName}`).

## Implementation Status — DONE (awaiting live testing)

### What shipped

- **Server**: `src/dms/packages/dms-server/src/dama/upload/file-upload-dms-route.js` (new).
  - Exports `createFileUploadDmsHandler(controller)`.
  - Accepts: `owner_id`, `owner_instance`, `owner_ref` (optional — defaults to `${app}+${owner_instance}|source`), `source_id?`, `source_name?`, `file_name`, `file_type`, `directory`, `description`, `categories`, `user_id`, `file`.
  - **Source slug is derived from the row**, not sent by the client: on existing-source append, the server calls `controller.getDataById([sourceId], ['type'], app)` and uses `getInstance(row.type)` to recover the slug.
  - Creates source (if new) via `controller.createData([app, "{owner_instance}|{slug}:source", { name, type: 'file_upload', categories, description }], user)`.
  - Creates view via `controller.createData([app, "{slug}|v{N}:view", { name: "version {N}" }], user)` where `N = existingViews.length + 1`.
  - Appends the new view ref to the source's `views`, and (only when the source was newly created) appends the new source ref to the owner's `sources`, via `setDataById`.
  - `storage.write(relativePath, stream)` where `relativePath = "dms-{app}_env-{owner_instance}_s-{sourceId}/v-{viewId}/{finalFileName}"` (or `{directory}/{finalFileName}` when `directory` is provided).
  - Merges `{ file: { file_name, file_type, dl_url, description } }` onto the view row.
  - Image processing via Sharp kept unchanged.
  - Rollback on failure: deletes any rows created in this request (looked up via `getDataById` for their `type` column), unlinks temp files.
  - Returns `{ ok, app, source_id, view_id, dl_url }`.
- **Server registration**: `src/dms/packages/dms-server/src/dama/upload/index.js` mounts `POST /dms-admin/:app/file_upload` next to the legacy `/dama-admin/:pgEnv/file_upload`. Both routes coexist.
- **Client `CreatePage.jsx`**: posts to `${DAMA_HOST}/dms-admin/${app}/file_upload` with `owner_id`/`owner_instance`/`owner_ref` derived from `dmsEnv || parent`. On success invalidates owner + source + view byId paths, clears datasets list cache, and navigates to the source page.
- **Client `ViewPage.jsx`**: branches on `isDms` (already plumbed through `SourcePage`). DMS branch reads `data.file` off `dms.data[app].byId[view.view_id].data`. Legacy branch keeps the existing UDA `viewsById.*.dataByIndex` query so pre-existing pgEnv-backed uploads still render. Extracted the two branches into `DmsView` / `LegacyView` components.

### Design deviations from the original plan

- **`owner_id` / `owner_instance` / `owner_ref`** replaced the earlier `dms_env_id` / `dms_env_instance` naming — neutral field names let the server treat the owner row opaquely whether it's a `dmsEnv` or a `pattern`.
- **Client no longer sends `source_slug`** — the server derives it from the existing source row's `type` column. This avoids a redundant parameter and a potential mismatch.

## Testing Checklist

Verified:
- [x] Server module loads (`node -e "require('./src/dama/upload/file-upload-dms-route.js')"` succeeds).
- [x] `upload/index.js` still loads and exports `registerUploadRoutes`.
- [x] ESLint: no new warnings introduced in the client files (existing `react/prop-types` + unused-`e` noise is pre-existing baseline).

Pending live testing:
- [ ] DMS-only project (no external datasources) — create a new `file_upload` source, confirm source + view rows exist in `data_items`, confirm the file is reachable at the returned URL.
- [ ] DMS project **with** a pgEnv configured — create a new `file_upload` source, confirm the new row lands in `data_items` (not `data_manager.sources`) and the file URL works.
- [ ] Append a second file to an existing DMS-backed source — new view row created, source's `views` list grows, owner's `sources` list does **not** grow.
- [ ] ViewPage renders both new DMS-backed uploads (`isDms=true`) and pre-existing pgEnv-backed uploads (`isDms=false`).
- [ ] Image upload path exercises Sharp resize/AVIF conversion (large JPEG → AVIF output, dimension capped at 1400).
- [ ] Non-image upload (PDF) — no Sharp processing, stored as-is, download works.
- [ ] Error paths: missing `source_name` (<4 chars) when `source_id` not supplied returns 400; storage write failure cleans up temp files and does not leave half-written source/view rows.
- [ ] SQLite + PostgreSQL DMS backends both work (controller factory handles both already).
- [ ] S3 and local storage backends both work.
- [ ] Fallback owner path: pattern without a `dmsEnv` configured — upload succeeds and the source ref lands on `pattern.data.sources`.

## Related

- `src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx` — reference implementation for DMS source + view + dmsEnv registration.
- `src/dms/packages/dms-server/src/dama/upload/file-upload-route.js` — legacy pgEnv handler being superseded.
- `src/dms/CLAUDE.md` — type-scheme reference (`{dmsenv}|{name}:source`, `{source}|{name}:view`).
