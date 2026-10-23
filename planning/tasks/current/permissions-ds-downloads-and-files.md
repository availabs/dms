# Datasets: permission checks on downloads, PM tiles, the `/files` static mount and tiles

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** doing · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md) and
[permissions-dama-admin-client-auth-headers.md](./permissions-dama-admin-client-auth-headers.md).

## Objective

`manage-downloads` and `download-source` are in the catalog but the server checks neither. Creating and deleting
downloads is open, and every stored file is public.

## Routes

| file:line | route | check today | should need |
|---|---|---|---|
| `dama/upload/download-routes.js:22` | POST `/dama-admin/:pgEnv/gis-dataset/create-download` | none (GDAL guard); `user_id` from body | `manage-downloads` on the source |
| `download-routes.js:61` | DELETE `…/gis-dataset/delete-download` | none; deletes files + `views.metadata.download` | `manage-downloads` |
| `dama/datatypes/pmtiles.js:230` | POST `…/pmtiles/cache-pmtiles` | none | `manage-downloads` |
| `data-types/pm3/download.js:259` (mounted `pm3/index.js:32`) | POST `…/pm3/create-download` | none | `manage-downloads` (fix lives in the plugin task) |
| `dms-server/src/index.js:117` | GET `/files/*` static, mounted **before** the JWT middleware | none: every download and uploaded file is public | **decision** — see below |
| `dama/upload/tiles.rest.js:300` | GET `/dama-admin/:pgEnv/tiles/:view_id/:z/:x/:y/t.pbf` | none | `view-source` (in [permissions-ds-read-visibility.md](./permissions-ds-read-visibility.md)) |
| `page/components/saveAsPDF/PrintWell/selectablePDF.js:32,58` → `/dama-admin/hazmit_dama/downloadpdf` | PDF render | check what the server route does (not surveyed) | login or none (it renders a page the caller can already see) |

## Decision needed: `/files`

Static files are fetched by `<img>`, map tile sources and plain links, which can't send an `Authorization`
header. Options:
- (a) Keep `/files` public, and treat a download URL as a capability: unguessable paths, shown only to
  `download-source` holders. Cheapest; a leaked link stays valid.
- (b) Serve downloads through a route that checks `download-source` and accepts a short-lived signed query token;
  keep images used in pages public.
- (c) A cookie session for file requests. Bigger change.
Recommendation: (b) for dataset downloads, (a) for page images.

## Where the files live on prod (read-only check, 2026-10-23)

- **One bucket for everything:** `availabs-bucket`, an S3-compatible store (`NoSuchKey` errors) behind nginx at
  `https://availabs-bucket.files.availabs.org`. Objects are public-read; the root and prefixes don't list.
- **Images** (mitigat-ny-prod sections): `img/<app>[+<type>]/<id>_<n>_<hash>.<ext>`, written by the page
  pattern's upload (`siteConfig.jsx:161`, `directory: img/${app}+${type}`). HEAD → 200 anonymous.
- **Downloads** (`hazmit_dama` views 1–4000, `metadata.download`): 79 views have them.
  - 6 views / 12 files are dms-server's create-download: `hazmit_dama/s_<source>/<name>_s<src>_v<view>_<…>_<TYPE>.zip`,
    same bucket. HEAD → 200 anonymous. The path is guessable from source/view ids plus names.
  - The rest are old DAMA `$HOST/files/hazmit_dama_<view>/…` links. They 404 on both `dmsserver.availabs.org`
    and `graph.availabs.org`, so they're dead links (not ours to fix here; note for the datasets owner).
- So downloads and images share the bucket, split only by prefix (`hazmit_dama/` (and per-pgEnv) vs `img/`). Protecting
  downloads means making the `<pgEnv>/s_*` prefixes private, either in the bucket policy or at the nginx in front.

## Progress 2026-10-23

- Guards **built** (uncommitted): `authorizeViewAction(req, res, viewId, perms, bodySourceId)` in
  `dama/upload/auth.js` checks `manage-downloads` on the source the **view** belongs to (`sourceIdForView`),
  not the body's `source_id` (a mismatch is logged, and the view's own source is used for the task too). An
  unknown view is checked as source 0, so it's refused under `enforce`. The route checked nothing before, so `wasOpen`
  applies: `legacy` / `log` allow and log would-denies. It is used by create-download, delete-download and
  `pmtiles/cache-pmtiles`, and passed to plugins as `helpers.authorizeViewAction` (for pm3 in the plugin task).
  create-download's task now records the token user's id and email, not the body's.
- Client: all three buttons were already behind `isUserAuthed(['manage-downloads'])`
  (`ExternalVersionControls.jsx:386`). No change.
- Tests: `test-upload-auth.js` 30 (6 new; all 6 fail on the old routes).
- PDF row: no `downloadpdf` route exists on dms-server, so it moves to
  [pdf-export-route-missing-on-dms-server](./pdf-export-route-missing-on-dms-server.md).
- Tiles row: stays with task 12 (`view-source`).

**`/files` decision (owner, 2026-10-23): option (b), the signed route**, for generated dataset exports. Images,
file_upload sources (page image cells upload these) and PM tiles stay public.
- **Built** (uncommitted), `dama/upload/download-routes.js`:
  - `POST /dama-admin/:pgEnv/downloads/sign {view_id, file_type}` needs `download-source` on the view's source.
    Anonymous callers count as `public` (a source that grants public download-source works signed out).
    Downloads were public before, so `wasOpen`: `legacy` / `log` allow and log. The route answers `{url}`, a
    5-minute link that names a view and file type, never a path (a JWT with `purpose: 'download'` under
    `JWT_SECRET`; a login token is refused, and a download token carries no email, so it can't log in).
  - `GET …/downloads/file?token=` re-reads the url from the view's `metadata.download` and streams it from
    storage (`storage.read`, so it works once the bucket is private) as an attachment, `no-store`. A url
    outside this server's storage (an old foreign host) is redirected to. `$HOST/files/…` maps to the local key.
  - delete-download now removes the files the view's map names. It used to remove only `<pgEnv>_<view>/`, but
    create-download writes `<pgEnv>/s_<source>/…`, so a delete left the file public in the bucket.
- Client: the Versions menu (`overview.jsx`) signs external exports on click, then follows the link. A refusal
  shows in the card (`verDownloadError`). Internal `data.download` and `file` links are unchanged (nothing
  writes internal exports; `file` is public by decision).
- Tests: `test-upload-auth.js` 37 (signed: 401/403/grantee, streams with no login, anonymous via public grant,
  forged / wrong-env / login / expired tokens refused, missing type 404, foreign url 302, log mode, delete
  removes the files). `npm run build` ✓.
- **Ops step (not code; for whoever runs files.availabs.org):** make the download paths private in
  `availabs-bucket` (`<pgEnv>/s_*`, e.g. `hazmit_dama/s_*`), in the bucket policy or the nginx in front.
  `img/`, `pg-*`, `tiles/` stay public. Until then the direct bucket urls still work (the route is in place,
  not yet the protection). On local-storage servers, `/files` still serves the download folders publicly:
  block `<pgEnv>/s_*` and `<pgEnv>_<n>/` on the `/files` mount when that matters (not done).
- Not done: S3 streams send no Content-Length (no progress bar). A presigned redirect would offload
  bandwidth, but needs `@aws-sdk/s3-request-presigner`. The client still shows the links to everyone (task 10
  gates them on `download-source`; the client helper doesn't count `public`, so gating there needs care
  for anonymous visitors).
- Found: ~73 hazmit_dama views' old `$HOST/files/hazmit_dama_<view>/…` download links are dead (404 on both
  hosts). Tell the datasets owner.

## Proposed changes

- [x] Guard the three dms-server routes with `manage-downloads`.
- [~] `/files` per the decision: signed route built; bucket/nginx rule is the ops step above. Overview/Versions download links (`overview.jsx:380-404`) are shown only to
  `download-source` holders (client task).
- [x] Tests: create/delete download denied without `manage-downloads`; allowed with it.

## Testing checklist

- [x] Tests above.
- [x] Live: create a GPKG/CSV download, delete it, cache PM tiles, as granted and ungranted users (10-23, hub Results rows K; signed link too, enforce + log).
- [ ] Map sections that read PM tiles from `/files` still render for anonymous viewers of a public page. (Code path untouched: `/files` and `tiles/` unchanged. Not checked live: no `tippecanoe` on this machine.)
