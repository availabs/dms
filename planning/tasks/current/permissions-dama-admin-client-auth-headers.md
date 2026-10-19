# Datasets: every dama-admin / dms-admin call from the client sends the user's token

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). **Ship before any REST dataset
route starts enforcing**, or uploads, downloads and duplicates break for everyone. Client only, no behaviour change.

## Objective

The server can't check a permission for a request that carries no `Authorization` header. Most REST calls
from the datasets, admin and page patterns send none and pass the user id in the body instead.

## Calls without a token today

- **GIS/CSV create flow** (`patterns/datasets/pages/dataTypes/gis_dataset/pages/Create/`): `index.jsx:121`
  new-context-id, `uploadFile/index.jsx:47-48` upload and `:74` events, `selectLayer/index.jsx:33,54,83,125,168`,
  `schemaEditor/index.jsx:34`, `publish/index.jsx:83` gis/csv publish.
- **DMS internal upload/validate:** `components/upload.jsx:21,37,91` (also sends `user.userId`, everything else
  uses `user.id`; fix), `components/ValidateComp.jsx:87`.
- **Downloads / PM tiles:** `components/ExternalVersionControls.jsx:232,278,337`.
- **File upload:** `dataTypes/file_upload/CreatePage.jsx:151` (`/dms-admin/:app/file_upload`),
  `ui/columnTypes/image.jsx:36-37`, `ui/components/lexical/editor/nodes/InlineImageComponent.tsx:88-92`.
- **Admin pattern:** duplicate at `admin/pages/patternEditor/default/settings.jsx:212`,
  `admin/pages/editSite.jsx:451`, `admin/components/patternList.jsx:293`; sync-filters at
  `patternEditor/default/filterEditor.jsx:117`.
- **Page pattern:** `page/components/saveAsPDF/PrintWell/selectablePDF.js:32,58` (`downloadpdf`).
- **Already send it:** schedule pages (`SchedulePage.jsx`, `RunsPage.jsx`). Plugins: see
  [datatype-plugin-route-permissions.md](../../../../../planning/shared/tasks/current/datatype-plugin-route-permissions.md).

## Proposed changes

- [ ] A small helper next to the datasets API utils, e.g. `damaFetch(url, { user, ...opts })`, that adds
  `Authorization: user.token` and parses the JSON `{error}` shape. Use it at every call above.
- [ ] Keep sending body `user_id` for now (the server ignores it once
  [permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md) lands); remove it in
  [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md)' cleanup.
- [ ] Show a 401/403 from these routes as a message ("You don't have permission to …"), not a silent failure.

## Testing checklist

- [ ] Network tab: each flow (GIS upload→publish, CSV publish, internal upload, validate, create/delete download,
  cache PM tiles, file upload, image upload in a Lexical/image cell, duplicate, sync-filters, PDF) carries the header.
- [ ] Nothing changes for a user today (the server doesn't enforce yet).
