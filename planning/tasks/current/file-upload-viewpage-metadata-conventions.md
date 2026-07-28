# file_upload — retire the view page; the Overview Versions card is the download surface

## Objective

A `file_upload` source should just work when given that type: no table/map/metadata pages, and its
file downloadable straight from the source Overview. **The `file_upload` view page is deleted** — the
Versions card on the Overview renders a Download button per version, reading every location a
download can live.

Driver: Freight Atlas ticket #189 (row 2195719) + owner direction 2026-07-27 — "these plan files
should be type `file_upload`"; "we may have done versions of file_upload as both internal [dmsEnv]
and external [pgEnv] and that may be creating some of the confusion"; and finally "that view page
sucks. I would rather get rid of it entirely and just have the versions table on the overview page
show a download button … check wherever it is that the file_upload saves its download link … as well
as if the download data is in its current metadata location."

> **Superseded:** the first two passes fixed the view page in place (convention dispatch) — that work
> is described below and was replaced by deleting the page. The `isDms`-vs-convention analysis is kept
> because the Overview helper reads the same set of locations.

## Root cause

`patterns/datasets/pages/dataTypes/file_upload/ViewPage.jsx` picks its renderer from **`isDms`**
— i.e. from *where the source is stored* (dmsEnv vs pgEnv). But `isDms` does not tell you which
**file-metadata convention** the row uses, and three conventions are live simultaneously. Audited
in `npmrds2` (all three sources below are pgEnv/external, all typed `file_upload`):

| source / view | convention | physical table | renders today |
|---|---|---|---|
| 1969 / 3358 | **manifest table** — rows of `file_type` + `dl_url`; view metadata `{}` | `gis_datasets.s1969_v3358_img_test` | ✅ the only case `LegacyView` handles |
| 2000 / 3389 | **`view.metadata.file`** = `{dl_url, file_name, file_type, description}` | **none** | ❌ `LegacyView`'s manifest query throws `relation "gis_datasets.s2000_v3389" does not exist` |
| 2077 / 3558 | **`view.metadata.file`** (same shape) | **none** | ❌ same — and this is the **live QA-screenshot source** written by `qa_skills/tools/attach_screenshot.mjs` |

The `file`-object shape is the *internal* convention — `DmsView` reads it from the DMS row's
`data.file` — but it has also been written onto *external* views' `metadata.file`. Because
`ViewPage` sends every non-DMS view to `LegacyView`, those two sources' view pages are broken.

A third convention is now needed: views whose downloadable artifact is the **generated export**
(`view.metadata.download` = `{ "CSV": url, "GPKG": url, "ESRI Shapefile": url }`, written by the
`gis/create-download` worker). That is what the Freight Atlas plan-file uploads have — their bytes
live in a Postgres table, so there is no uploaded file to serve, only generated zips. Nothing in
`file_upload` renders that today, so retyping them alone would show nothing.

## Final design (BUILT 2026-07-27, uncommitted) — downloads on the Overview

`dataTypes/default/overview.jsx` gains `downloadItemsForView(view, damaHost)`, which collects every
downloadable artifact a version can have, in one list:

- **generated exports** — `metadata.download` (pgEnv, from the `gis/create-download` worker) or
  `data.download` (the DMS-side counterpart), filtered to `OUTPUT_FILE_TYPES`;
- **uploads** — `metadata.file` (pgEnv, `dama/upload/file-upload-route.js:126`) or `data.file`
  (DMS, `dama/upload/file-upload-dms-route.js:229` — `setDataById(viewId, { file: fileMeta })`),
  i.e. one `{file_name, file_type, dl_url}` object.

Both shapes are normalized through an `asObject()` guard because uda projects DMS json columns as
**strings** (`data->>'file'`), so a view may arrive pre-parsed (`resolveInternalViewNames`) or raw
(`getViews`' byIndex rows). `$HOST` is resolved against `DAMA_HOST` as the version menu always did.

Rendering in the Versions card: **exactly one artifact → the button IS the download anchor** (no
menu — this is the file_upload case); **more than one → the existing dropdown**, now keyed off
`{label, url}` items. Zero → no button, as before. No new theme keys.

To make the internal case reachable, `InternalViewAttributes` (`dataTypes/default/consts.js`) gains
`file` and `download`, and `resolveInternalViewNames` attaches + parses them.

**Deleted:** `file_upload/ViewPage.jsx`, `file_upload/ViewPage.theme.js`, the `view` slot in
`file_upload/index.js`, and the `fileUploadView` registration in `patterns/datasets/defaultTheme.js`.
Verified no dangling references remain.

⚠ **One shape loses its renderer:** the manifest-table convention (source **1969** `img test` — file
rows inside the view's own table, nothing in metadata) has no representation on the Overview, because
that would require querying each view's table. It is a test source; if it ever matters, write a
`file`/`download` object onto its view instead of reviving a page.

Also fixed in the same pass (owner report): the Overview's "at a glance" **Type** row printed
`source.type`, which for a DMS source is the storage row-type string
(`datasets_env|2019_nys_freight_plan_archive:source`). SourcePage now passes its resolved
`dataType={sourceDataType}` to the page, and Overview renders that — never falling back to
`source.type` for DMS sources.

## Superseded approach — dispatch inside the view page

Dispatch per view on **what metadata is actually present**, in this order:

1. **`download` map** (pgEnv: `view.metadata.download`; DMS: `data.download`) with any
   `OUTPUT_FILE_TYPES` key → one `ViewItem` per format. `ViewItem` already takes exactly
   `{file_type, dl_url}`, so `Object.entries(download)` maps onto it directly, and its
   `IMAGE_TYPES` check correctly reports `false` for `CSV`/`GPKG`/`ESRI Shapefile`.
   Apply the same `$HOST` → `DAMA_HOST` substitution the overview page does
   (`dataTypes/default/overview.jsx:238`).
2. **`file` object** (pgEnv: `view.metadata.file`; DMS: `data.file`) → a single `ViewItem`.
   This is the branch that fixes 2000 / 2077.
3. **Neither** → today's manifest-table query (pgEnv only), else "No file attached."

Backward compatibility: source 1969 has empty view metadata, so it falls through to (3) and keeps
its current behaviour byte-for-byte. 2000/2077 move from a throwing query to (2). No existing
`file_upload` view carries a `download` map (verified), so (1) can only affect newly-retyped
sources. No API, prop, or theme key is removed — `viewPageTheme` keys are reused as-is.

## Files requiring changes

- `packages/dms/src/patterns/datasets/pages/dataTypes/default/overview.jsx` — `downloadItemsForView`;
  single-artifact anchor vs multi-artifact dropdown; `dataType` prop for the Type row.
- `packages/dms/src/patterns/datasets/pages/dataTypes/default/consts.js` — `file`, `download` on
  `InternalViewAttributes`.
- `packages/dms/src/patterns/datasets/pages/dataTypes/file_upload/{ViewPage.jsx,ViewPage.theme.js}` —
  **deleted**; `file_upload/index.js` — `view` slot removed;
  `patterns/datasets/defaultTheme.js` — `fileUploadView` registration removed.
- `packages/dms/src/patterns/datasets/pages/dataTypes/default/utils.js` — new
  `getInternalDataType()`; `resolveInternalViewNames` attaches/parses `file` + `download`.
- `packages/dms/src/patterns/datasets/pages/SourcePage.jsx` — `internalDataType` state + effect;
  route on it instead of hardcoding `internal_table` for DMS sources.
- No theme change required. No change to `file_upload/index.js` (page slots already correct:
  `sourceCreate` + `view`, and **no** `defaultPages`, so table/map/metadata never mount).
- **Not** changed on purpose: `datasets.format.js`'s `source` attributes — adding `type` there
  would alias `data.type` over the storage row type.

## Status — BUILT 2026-07-27, uncommitted

`ViewPage.jsx` rewritten as described: `downloadItems()` helper, `ExternalView` dispatching
download → file → `ManifestView` (renamed from `LegacyView`, now mounted only when needed so its
query never runs against a nonexistent relation), and `DmsView` gaining the download branch.
Parses clean via esbuild; eslint reports the same 37 pre-existing `react/prop-types` /
`no-unused-vars` findings as the untouched sibling `overview.jsx`, no new rule classes.
**Not yet verified in a browser** — see the checklist.

## Second fix in the same area — SourcePage discards internal `data.type` (also BUILT, uncommitted)

`SourcePage.jsx:113-114` hardcoded both dataType keys to `internal_table` for every DMS source, so
an internal source's `data.type` (where the dataType actually lives — the `type` **column** is the
storage/row-kind string `datasets_env|<instance>:source`) never reached `damaDataTypes`. The Freight
Atlas Plan Library documents — **2189904** (2024 main report PDF), 2189906, 2189908, 2189910, 2189912
— are all already `data.type: 'file_upload'` with a real `data.file.dl_url`, yet were rendering the
`internal_table` Table page instead of the file_upload view page that serves their file.

**First attempt was wrong** and is worth recording, because the trap is subtle: reading
`source.type` does NOT work on this path. The `source` format (`datasets.format.js:13`) declares
only `name`, `config`, `description`, `categories`, `auth_permissions`, `views` — no `type`
attribute — so a route-preloaded source `item` never carries `data.type`, and `item.type` is the
STORAGE row-type string. Adding a `type` attribute to the format is the wrong fix: it would alias
`data.type` over the row type and conflate two vocabularies that must stay separate. (My initial
verification passed only because I probed `uda sources.byId`, which is a different loader than the
one SourcePage uses — the page still fell through to `internal_table`, reported on
`/freight_data/internal_source/2189912`.)

Now: a dedicated `getInternalDataType({pgEnv, falcor, source_id})` in
`dataTypes/default/utils.js` (alongside `getViews` / `resolveInternalViewNames`, which is where
this pattern's falcor reads live) fetches `uda[…].sources.byId[id].type` — the projection that DOES
expose `data->>'type'`. SourcePage holds it in `internalDataType` state and routes on
`damaDataTypes?.[internalDataType] ? internalDataType : 'internal_table'`, never touching
`source.type`. BC — unregistered/absent `data.type`, and the pre-resolve tick, both land on
`internal_table`.

Audited every internal source before changing it: **8 `internal_table`** (unchanged) vs
**7 `file_upload`** (5 Plan Library docs + 2 QA-screenshot sources), which is exactly the intent.
Verified the exact read the client now performs: env `npmrdsv5+freight_data|source` →
2189912 `"file_upload"`, 2189904 `"file_upload"`, 2184923 (Site Management — Tickets)
`"internal_table"`. Note the env's **app** segment must be the real app — `forms+source` returns
null for every row — which is why this reuses the same `${sourceFormat.app}+${sourceFormat.type}`
string the sibling calls already depend on.

These internal documents render through `DmsView`'s existing `data.file` branch, so they need the
routing fix but not the ViewPage dispatch above. The two changes are independent: the ViewPage work
is what fixes external 2000/2077 and any external source whose artifact is a generated
`metadata.download`.

## Consumer note

A brief mis-retype of 12 external CPCS spreadsheet uploads (`csv_dataset` → `file_upload`) on
2026-07-27 was **reverted** the same session — they are tabular data and keep their Table page.
No outstanding data change is required for either fix; see
`planning/transportny/tasks/current/freight-atlas-data-downloads.md`.

This is the concrete shape of "we may have done versions of file_upload as both internal and
external": the `file` object convention came from the internal path but was also written onto
external view metadata, and `isDms` cannot distinguish convention from storage location.

## Testing checklist

- [ ] 1969/3358 (manifest table) — view page renders the image item exactly as before.
- [ ] 2077/3558 (`metadata.file`, no table) — now renders the screenshot instead of erroring;
      re-check after an `attach_screenshot.mjs` upload.
- [ ] 2000/3389 (`metadata.file`, no table) — renders.
- [x] **Internal Plan Library sources download from the Overview** — owner confirmed working
      2026-07-27 ("the file downloads are working for me on these pages"), incl. 2189912's two
      versions and 2189904.
- [x] No `View` nav item on a `file_upload` source, and no Table/Map/Metadata either.
- [x] Simulated `downloadItemsForView` against all shapes: internal `data.file` → 1 item (correct
      PDF url); external `metadata.download` (view 3533) → 3 items; external `metadata.file`
      (view 3558) → 1 item; manifest-table (view 3358) → 0 items, as designed.
- [ ] An `internal_table` source (e.g. 2184923 Site Management — Tickets) — Table page unchanged and
      its Type row reads `internal_table`.
- [ ] An external `gis_dataset`/`csv_dataset` source — Versions dropdown still lists all formats and
      its Type row still reads the dama type.
- [ ] The Overview Type row on 2189912 reads `file_upload`, not
      `datasets_env|2019_nys_freight_plan_archive:source`.
- [ ] A version with no artifact at all — no Download button, no throw.
