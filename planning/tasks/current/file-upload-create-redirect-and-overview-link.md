# file_upload — post-upload redirect, temp-file flush race, plain file link on the Overview

**STATUS (2026-09-23): BUILT + VERIFIED (re-applied); uncommitted, not deployed.** The first pass was lost in a
branch merge (only the `themev2.js` keys survived) and was re-applied identically. A real browser upload through the
redirect is still untested, and so is a pgEnv spot-check. The server fix needs a dms-server deploy (dev `.env` → `dmsserver.availabs.org`).

Follow-up to [`file-upload-viewpage-metadata-conventions.md`](./file-upload-viewpage-metadata-conventions.md)
(which made the Overview Versions card the download surface).

## Objective

1. After a DMS file upload, land on a page that actually shows the uploaded file.
2. Never store a truncated upload because the server read the temp file before it was fully written.
3. On a `file_upload` source's Overview, show the file's URL plainly in place of the columns /
   metadata summary, which is meaningless for an uploaded file.

## Bug 1 — the uploader redirects to the external-source route

Reported 2026-09-23: upload on `http://localhost:5173/cenrep/source/2710837/` "gets stuck at having a
created source but the files url never gets set".

**The upload itself succeeded.** `dms_mitigat_ny_prod.data_items`:
- source **2710837** `test_meta_forms_env|test_upload:source` — `type: file_upload`, `views: [{id: 2710838}]`
- view **2710838** `test_upload|v1:view` — `file.dl_url` =
  `https://availabs-bucket.files.availabs.org/dms-mitigat-ny-prod_env-test_meta_forms_env_s-2710837/v-2710838/pluto_datadictionary.pdf`
  (written 53 ms after the row was created; HEAD → 200, 588,835 bytes).

**Root cause:** `file_upload/CreatePage.jsx` posts to `/dms-admin/:app/file_upload`, which always
creates a **DMS-internal** source, then navigates to `${baseUrl}/source/${id}`. In
`patterns/datasets/siteConfig.jsx`, `source/:id` mounts `SourcePage` with `isDms=false`. That resolves
the id as a pgEnv (DAMA) source via `getViews` and never reads the DMS view row's `file`. The DMS route
is `internal_source/:id` (`isDms=true` → `resolveInternalViewNames` pulls `file`). Every other link to
a DMS source (`DatasetsList/index.jsx:155/475`, `internal_table/pages/sourceCreate.jsx:140`) already
uses `internal_source`.

**Fix:** navigate to `${baseUrl}/internal_source/${json.source_id}`. This covers both new-source and
append-to-existing, since the endpoint is DMS-only.

## Bug 2 — busboy `finish` races the temp-file write (latent)

Both `dms-server/src/dama/upload/file-upload-dms-route.js` and the pgEnv `file-upload-route.js` do
`stream.pipe(fs.createWriteStream(tempPath))` in `busboy.on('file')`. Then in `busboy.on('finish')` they
immediately read the temp file (sharp, or `storage.write(..., fs.createReadStream(...))`). Busboy's `finish`
means it has *parsed* the request. It doesn't mean the fs WriteStream has flushed to disk, so a large upload
can be read back truncated.

**Fix:** keep a promise that resolves on the WriteStream's `finish` (and rejects on `error`), and await it
right after the "No file uploaded" guard in the `finish` handler.

## Change 3 — plain file link on the Overview for `file_upload`

`dataTypes/default/overview.jsx` renders a columns summary (`config.attributes` / `metadata.columns`)
with a "Full metadata →" link. A `file_upload` source has no columns, so the card is irrelevant, and the
only way to reach the file is the Versions card's Download button, which hides the URL. When
`dataType === 'file_upload'`, replace that card with a "File" card that shows the **current version's**
file name and full URL as a visible, selectable link (built from `downloadItemsForView`, so it covers both
`data.file` and `metadata.file`). The card reuses the `colCard`/`colHeader` chrome, plus new keys
`fileBody`/`fileRow`/`fileName`/`fileUrl`/`fileEmpty`.

## Files requiring changes

- [x] `packages/dms/src/patterns/datasets/pages/dataTypes/file_upload/CreatePage.jsx` — redirect path.
- [x] `packages/dms-server/src/dama/upload/file-upload-dms-route.js` — await temp-file flush.
- [x] `packages/dms-server/src/dama/upload/file-upload-route.js` — same.
- [x] `packages/dms/src/patterns/datasets/pages/dataTypes/default/overview.jsx` — File card for file_upload.
- [x] `packages/dms/src/patterns/datasets/pages/dataTypes/default/sourceOverview.theme.js` — `file*` keys.
- [x] `dms-template/src/themes/transportny/themev2.js` — `file*` keys (survived the merge; lines 2936–2940).

## Testing checklist

- [ ] Upload a new file through the UI → lands on `/internal_source/:id` (not run by Claude: it writes to the
      prod DB + S3).
- [ ] Add a file to an existing DMS file_upload source → same landing, new version is current.
- [x] `/cenrep/internal_source/2710837` shows a File card with `pluto_datadictionary.pdf` + full URL.
- [x] An internal_table source (753897, Actions) still shows its columns summary (`Columns · 93`).
- [ ] pgEnv gis source overview spot-check.
- [x] Server: DMS route end to end with a mock controller + local storage. The 60 MB upload stored at 60,000,000 bytes, and `file.dl_url` was written.
- [x] esbuild syntax check on edited client files; both server routes `require()` cleanly. Full vite build not run.

## Progress log

- 2026-09-23 — diagnosed; first pass built + verified (60 MB mock upload stored byte-for-byte; File card rendered
  on 2710837; Actions 753897 unchanged). Lost in a branch merge, except the `themev2.js` keys.
- 2026-09-23 — re-applied all five files identically; re-verified (checklist above).
