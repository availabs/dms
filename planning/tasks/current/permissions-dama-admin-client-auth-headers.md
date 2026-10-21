# Datasets: every dama-admin / dms-admin call from the client sends the user's token

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built · **Release:** commit — 42b79799 / root e09d25ef, not pushed · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

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

## Built (2026-10-20, committed 42b79799)

**Helper:** `packages/dms/src/utils/authedFetch.js`, also exported from the package index (`authedFetch`,
`PermissionError`, `authHeaders`, `withPatternParam`).
- Sends `Authorization: user.token`, falling back to the stored `localStorage.userToken`, which is what the
  falcor client sends. The fallback is what lets the Lexical image upload authenticate: its
  `fileUploadInfo` is serialized into page content by `InlineImageNode.exportJSON`, so a user/token must
  never be put there.
- `pattern: { app, id }` appends **`?dms_pattern=<app>/<id>`**, the datasets pattern that external sources
  inherit grants from (task 2's decision 2). It's a query parameter rather than a header so it needs no CORS
  preflight: the server's allow-list didn't include a custom header, and the client and server deploy
  separately. The server now also allows `X-DMS-Pattern` in CORS, and `requestPatternRef` reads the query
  parameter or the header, no longer the body (sync-filters' body carries a page pattern's `patternId`).
- 401/403 → throws `PermissionError` ("Sign in to do this." / "You don't have permission to do this (<server
  error>)."). Other responses come back untouched, so the existing `res.ok` / `json.err` handling is unchanged.

**Call sites moved to it** (token everywhere; `+pattern` where the request acts on an external source or creates
a source from the datasets pattern):
- `datasets/components/upload.jsx`: gis upload + layer poll, DMS publish. **Bug fixed:** upload sent
  `user.userId` and publish spread `...user` into params that read `userId`, so `user_id` was always
  undefined; both now send `user.id`. 401/403 shows in the existing publish-status line.
- `datasets/components/ValidateComp.jsx`: validate. Errors now show their message; the banner used to
  `JSON.stringify` an Error, which printed `{}`.
- `datasets/components/ExternalVersionControls.jsx`: create/delete download, cache PM tiles (+pattern). New
  `modalError` theme key; the modals show the permission message (before, they just reopened).
- `datasets/pages/dataTypes/file_upload/CreatePage.jsx`: `/dms-admin/:app/file_upload` (+pattern).
- GIS/CSV create flow (`gis_dataset/pages/Create/`: index new-context-id, uploadFile, selectLayer ×5,
  schemaEditor, publish) (+pattern, via new reducer state `authUser` / `pattern`).
- Schedule pages (`RunsPage.jsx`, `SchedulePage.jsx`): the reads now send the token too, and every call sends
  the pattern.
- Admin: duplicate (`patternList.jsx`, `editSite.jsx`, `patternEditor/default/settings.jsx`; settings had
  `try…finally` with no `catch`, so a failure was silent, and now alerts like the others), sync-filters
  (`filterEditor.jsx`), and their `/dms/tasks/:id` polls.
- Page: `saveAsPDF/PrintWell/selectablePDF.js` (`downloadpdf`, new optional `user` arg; `ExportPdf.jsx` passes it).
- `ui/columnTypes/image.jsx` and Lexical `InlineImageComponent.tsx` `file_upload` (stored-token fallback).

**Not touched (other tasks):** plugin client pages in `data-types/*/pages` and TransportNY's routing reads, now
listed in [datatype-plugin-route-permissions.md](../../../../../planning/shared/tasks/current/datatype-plugin-route-permissions.md).
Body `user_id` is still sent (removed in task 19's cleanup).

**Found, not fixed (2026-10-20 live check):** on a **sqlite** DMS db, in-process DMS tasks get
`ctx.task.descriptor` as an unparsed JSON string (`claimNextTask` → `RETURNING *`; the sqlite adapter only parses
`data`/`attributes`). `dms/pattern_filter_sync` fails with "Pattern undefined not found (app=undefined)", and
`dms/pattern_duplicate` reports done after cloning **zero** pages. Postgres returns jsonb parsed, so prod is
unaffected. The forked worker-runner already parses it (`worker-runner.js:77`); `startTaskWorker` doesn't.
Not caused by this task.

**Found, not fixed:** `ExternalVersionControls.jsx` deleteDownload calls `getData(...)`, which is undefined (in
HEAD too). A successful delete throws right afterwards, and the catch reopens the delete modal.

**Checks:** eslint finds no new undefined names or parse errors in the changed files; `vite build` passes; a node
check of `authedFetch` with a stubbed `fetch` covers the header, the fallback, the query param, 401/403 → PermissionError
and pass-through of other statuses. `test-source-auth` still passes (48; `requestPatternRef` cases updated).

## Proposed changes

- [x] A small helper (in `utils/`, since patterns can't import each other; see Built) next to the datasets API utils, e.g. `damaFetch(url, { user, ...opts })`, that adds
  `Authorization: user.token` and parses the JSON `{error}` shape. Use it at every call above.
- [x] Keep sending body `user_id` for now (the server ignores it once
  [permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md) lands); remove it in
  [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md)' cleanup.
- [x] Show a 401/403 from these routes as a message ("You don't have permission to …"), not a silent failure.

## Testing checklist

- [x] Network check, 2026-10-20 (scratch dms-server :3458 on current code + a copy of the v6test sqlite DB,
  Vite :5197 with its own cacheDir, Playwright recording every REST request; scripts in
  `dms-template/scratchpad/verify/authcheck/`). Each request below carried a valid admin JWT:
  - create download, cache PM tiles (`dms_pattern=v6test/17`);
  - CSV create flow end to end: new-context-id, `gis-dataset/upload`, events, layerNames, layerAnalysis
    (POST + GET), tableDescriptor, `csv-dataset/publish` → source 50 (all `dms_pattern=v6test/17`);
  - file source create: `/dms-admin/v6test/file_upload` (`dms_pattern`) → internal source 97;
  - internal validate, upload, layers, publish; publish body `user_id=1` (was undefined);
  - admin duplicate + its task poll; sync-filters + its task poll; the tasks now record `userId: 1`
    (the `req.user` fix);
  - schedule page reads (`schedules`, `schedulables`, with `dms_pattern`) through a harness
    (`scratchpad/authcheck-harness/`), since no seeded type has schedule pages;
  - image cell upload through a harness (`scratchpad/authcheck-image/`): it sent the stored
    `localStorage.userToken` with no user passed.
  **Not exercised live:** schedule create/patch/delete/fire and rerun (no loaders, rerun disabled in the
  harness), Lexical inline image upload (same `authedFetch`-with-fallback swap as the image cell), PDF
  export (`downloadpdf`).
  Each flow listed (GIS upload→publish, CSV publish, internal upload, validate, create/delete download,
  cache PM tiles, file upload, image upload in a Lexical/image cell, duplicate, sync-filters, PDF) carries the header.
- [x] Nothing changes for a user today: every flow above completed as before; the server log had no `would-deny` lines (none of these routes check yet) and no new errors.
