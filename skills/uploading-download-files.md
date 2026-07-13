# Uploading flat files for download (file_upload sources) and linking to them

The datasets pattern has a `file_upload` dataType: a source whose "views" are uploaded flat
files (PDF, ZIP, CSV, images…) stored server-side and served by public URL — for report
libraries, plan PDFs, download bundles. This skill covers the headless upload recipe and how
to link the files from pages.

## The route

`POST ${API_HOST}/dms-admin/${app}/file_upload` — multipart form (server:
`dms-server/src/dama/upload/file-upload-dms-route.js`; UI:
`patterns/datasets/pages/dataTypes/file_upload/CreatePage.jsx`).

| field | value |
|---|---|
| `owner_id` | the **dmsEnv row id** (e.g. npmrdsv5 dev2 → row `1676363`, type `dev2\|datasets_env:dmsenv`) |
| `owner_instance` | dmsEnv instance, e.g. `datasets_env` |
| `owner_ref` | `${app}+${owner_instance}\|source` |
| `source_name` | new source display name (≥4 chars) — OR `source_id` to append a file to an existing source |
| `file_name`, `file_type` | e.g. `plan.pdf`, `application/pdf` |
| `description`, `categories` | optional; categories as JSON, e.g. `[["Freight Atlas","Plan Library"]]` |
| `directory` | optional storage subdir (default `dms-<app>_env-<inst>_s-<sid>/v-<vid>/`) |
| `file` | the payload |

Response: `{ ok, source_id, view_id, dl_url }`. Each upload creates a **view** on the source
(`v1`, `v2`, …) and stamps `view.data.file = { file_name, file_type, dl_url, description }`.
Appending with `source_id` adds another view/file to the same source.

```bash
curl -s -X POST "$HOST/dms-admin/npmrdsv5/file_upload" \
  -F "owner_id=1676363" -F "owner_instance=datasets_env" \
  -F "owner_ref=npmrdsv5+datasets_env|source" \
  -F "file_name=2024_01_NYS_Freight_Plan.pdf" -F "file_type=application/pdf" \
  -F "directory=" -F "description=..." -F 'categories=[["Freight Atlas","Plan Library"]]' \
  -F "source_name=2024 NYS Freight Plan — Main Report" \
  -F "file=@2024_01_NYS_Freight_Plan.pdf"
```

## WHERE you upload determines whether the links work

Storage is per-server (`DMS_STORAGE_TYPE`): local disk → **relative** `dl_url` (`/files/...`,
served only by that dms-server); S3 → **absolute** public URL. The dev localhost:3001 server
shares the production DB but stores files on the local disk — rows would exist everywhere
while the file bytes exist only on your machine. **Upload through the hosted server**
(`https://dmsserver.availabs.org`, S3-backed → absolute
`https://availabs-bucket.files.availabs.org/...` URLs that work from any site). nginx caps
uploads around 450 MB; zip multi-file bundles (a "one row = one download" library row wants a
single URL — zip the set rather than linking a gated source page).

Verify after upload: `curl -o /dev/null -w '%{http_code}' <dl_url>` → 200.

## Linking the files from pages

- **Card cell** (report-library rows): the link cell's VALUE must be the URL (Card builds
  `url = location || value`), displayed via static `linkText`:
  `{ name: "url", isLink: true, isLinkExternal: true, linkText: "download",
     valueFontStyle: "linkMeta", justify: "right" }` — `isLinkExternal` is required for
  absolute URLs (else it renders an internal router Link).
- **Lexical button node**: `{ type: "button", linkText: "Download", path: "<dl_url>", style: "plain" }`.
- The file_upload source's own page (`<datasets-base>/source/<id>`) renders all its files with
  download buttons — but datasets source pages may be **auth-gated** (`view-sources`); the
  `dl_url` itself is public. Link `dl_url` for public surfaces.

Worked example: the Freight Atlas report library — sources 2189904–2189912 (main report, exec
summary, appendices C–F zip, FWG decks zip, 2019 archive + white paper), driven by the
`freightatlas_reports` internal dataset + a Card section on `about_the_plan` (2175346). Recipe
scripts: `dms-template/scratchpad/fa-symbology-restyle/{about_port,wire_report_urls}.mjs`.
