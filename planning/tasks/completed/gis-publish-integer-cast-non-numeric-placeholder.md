# GIS publish: non-numeric placeholder strings crash the integer CASE cast

## Objective

Stop `gisPublishWorker`'s temp→final `INSERT ... SELECT` from throwing
`invalid input syntax for type integer: "?"` when a source column typed
`INTEGER`/`BIGINT`/`SMALLINT`/`INT` contains a non-boolean, non-numeric
placeholder string.

## Root cause

`src/dama/upload/workers/gis-publish.js:344-351` builds a CASE expression for
every integer-typed column to coerce boolean-ish text (`true`/`false`/`yes`/
`no`) into `1`/`0` before casting:

```js
CASE
  WHEN LOWER(TRIM(src::TEXT)) IN ('true','t','yes','y') THEN 1
  WHEN LOWER(TRIM(src::TEXT)) IN ('false','f','no','n') THEN 0
  WHEN NULLIF(TRIM(src::TEXT), '') IS NULL THEN NULL
  ELSE CAST(TRIM(src::TEXT) AS db_type)
END
```

The `ELSE` assumed anything not boolean-shaped and not blank must already be
a clean numeric string, and cast it unguarded. Reported failure case: MPO
"SHMP to LHMP Launch Map v7" upload, where all 8 `dr_XXXX_de` columns
(`dr_4397_de`, `dr_4472_de`, `dr_4480_de`, `dr_4567_de`, `dr_4615_de`,
`dr_4625_de`, `dr_4694_de`, `dr_4723_de`) are declared `String(1)` in the
source shapefile and hold the literal value `"?"` for every feature (a
"declared" flag never populated for this county). The target table had those
columns already typed as integer from the persisted source `metadata.columns`
schema, so the CASE's naive `ELSE CAST('?' AS INTEGER)` failed and aborted
the whole publish.

Confirmed the exact data via `ogrinfo -al` against the uploaded
`.shp`/`.dbf` — every one of the 8 `_de` columns is 100% `"?"` across all 62
features, no numeric or boolean values present at all.

## Fix

Added a guard `WHEN` before the `ELSE`, so any value that doesn't match
`^-?[0-9]+$` after trim becomes `NULL` instead of being force-cast:

```js
CASE
  WHEN LOWER(TRIM(src::TEXT)) IN ('true','t','yes','y') THEN 1
  WHEN LOWER(TRIM(src::TEXT)) IN ('false','f','no','n') THEN 0
  WHEN NULLIF(TRIM(src::TEXT), '') IS NULL THEN NULL
  WHEN TRIM(src::TEXT) !~ '^-?[0-9]+$' THEN NULL
  ELSE CAST(TRIM(src::TEXT) AS db_type)
END
```

This covers `"?"` and any other future junk placeholder (`"N/A"`, `"-"`,
`"unk"`, etc.) the same way blanks are already handled — as `NULL` — rather
than aborting the publish. The regex only needs to guard integer types
(`INTEGER`/`BIGINT`/`SMALLINT`/`INT`), which is the only branch this CASE is
built for; the non-integer branch (`CAST(NULLIF(TRIM(...), '') AS db_type)`)
was left alone since it's unaffected by this bug (no boolean-coercion
special-casing, so nothing swallows non-numeric strings there — a truly
non-numeric value in e.g. a NUMERIC column would still error there, which is
correct behavior for that path since it's not in scope for this fix).

## Files changed

- [x] `src/dms/packages/dms-server/src/dama/upload/workers/gis-publish.js:344-352`
      — added the `!~ '^-?[0-9]+$'` guard before the `ELSE CAST`.

## Scope note

Searched the rest of `dama/upload/` for the same `CAST(TRIM(...)` pattern —
only `gis-publish.js` has it. `csv-publish.js` and `internal-table-publish.js`
build their casts differently and are not affected by this bug.

## Testing

- [x] Verified against the actual uploaded shapefile (`ogrinfo -al`) that the
      8 `dr_XXXX_de` columns are declared `String(1)` and every feature's
      value is literally `"?"` — confirms the failure mode and that `NULL`
      is the correct outcome (the source genuinely has no value there).
- [ ] LIVE: re-run the "SHMP to LHMP Launch Map v7" GIS upload and confirm it
      publishes successfully with the 8 `dr_XXXX_de` columns landing as
      `NULL` in `gis_datasets.s12793_v13535_shmp_to_lhmp_launch_map_v7`.
- [ ] LIVE (regression): re-upload a GIS file with a genuine boolean-text
      column (`true`/`false`) and confirm it still coerces to `1`/`0` as
      before — the new guard sits after the boolean branches, so it should
      not change existing behavior.

No automated test added — `gisPublishWorker`'s temp-table copy step isn't
unit-testable in isolation (it runs inline inside the worker against a real
Postgres temp table populated by ogr2ogr); a full integration test would need
Docker Postgres + GDAL. Existing `tests/test-upload-pipeline.js` already notes
this class of test is skipped without both.
