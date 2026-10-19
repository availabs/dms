# Datasets: permission checks on downloads, PM tiles, the `/files` static mount and tiles

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

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

## Proposed changes

- [ ] Guard the three dms-server routes with `manage-downloads`.
- [ ] `/files` per the decision. Overview/Versions download links (`overview.jsx:380-404`) are shown only to
  `download-source` holders (client task).
- [ ] Tests: create/delete download denied without `manage-downloads`; allowed with it.

## Testing checklist

- [ ] Tests above.
- [ ] Live: create a GPKG/CSV download, delete it, cache PM tiles, as granted and ungranted users.
- [ ] Map sections that read PM tiles from `/files` still render for anonymous viewers of a public page.
