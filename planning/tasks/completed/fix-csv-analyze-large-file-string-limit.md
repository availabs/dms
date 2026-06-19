# Fix: csv processor `analyze()` dies on CSVs past Node's max string length

## Objective

`POST /dama-admin/:pgEnv/gis-dataset/upload` of a large CSV (or zip containing one) never became
ready — `GET …/layerNames` eventually returned `500 {"error":"Cannot create a string longer than
0x1fffffe8 characters"}`. Any CSV bigger than ~512 MB (Node's max string length) was unloadable
through the csv_dataset path.

## Root cause

`dama/upload/processors/csv.js#analyze()` did `fs.readFileSync(filePath, 'utf-8')` — materializing
the entire file as one JS string — only to read the **header row** for layer/field metadata. The
downstream 10k-row schema analysis (`analysis.js` → `parseRowObjectsStream`) and the publish COPY
(`workers/csv-publish.js`, pg-copy-streams) already stream fine; only the header step exploded.

Found while loading the 2 GB TRANSEARCH flow CSVs
(`planning/transportny/tasks/current/load-transearch-into-npmrds2.md` in the workspace planning hub).

## Fix

New `readFirstLine(filePath, maxBytes=1MB)` in `processors/csv.js`: bounded chunked `fs.readSync`
over a file descriptor, returns the first non-empty line (handles `\r\n`, skips leading blank
lines, byte-level `0x0a` scan so UTF-8 chunk boundaries can't split the comparison). `analyze()`
now reads only that line.

Note: `parseRows()` in the same file still does a full `readFileSync` — it backs the DMS-internal
(`/dama-admin/dms/:appType/publish`) path used for small internal tables, not the csv_dataset COPY
path. Left as-is; fix it the same way if internal tables ever take big files.

## Testing

- Regression test in `tests/test-csv-analyzer.js`: header + sparse-truncate to 600 MB (instant, no
  real disk), asserts `analyze()` returns the parsed fields. Failed with the exact production error
  before the fix; 23/23 pass after.
- `npm run test:upload`: 8 passing / 4 failing — the 4 failures are pre-existing SQLite
  schema-init issues, identical with the fix stashed.
- Live: 2.08 GB `Transearch2021.csv` (10M rows) upload → layerNames → analysis → descriptor in
  seconds on localhost.

## Deploy note

**`dmsserver.availabs.org` runs the broken version** — large-CSV uploads there fail with the same
string-length error until it's redeployed with this fix. (Separately, its nginx
`client_max_body_size` rejects bodies somewhere between 400 and 500 MB, so multi-GB files must be
zipped — the upload route auto-extracts `.zip`.)
