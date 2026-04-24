# DAMA CSV Analyzer — Port `analyzeSchema` + Fix Rename Bug

## Status: DONE — verified in production; docs updated 2026-04-23

## Objective

Restore the legacy DAMA per-value CSV analyzer (`analyzeSchema.js`) as the primary CSV type detector, and fix the column-rename bug in `generateTableDescriptor` that silently drops type information when users edit field names in the analysis UI. Keep `ogrinfo` available as a fallback + for non-CSV tabular formats; keep `gdal-async` for GIS files.

## Why

View 3384 on npmrds2 (loaded with the new ogrinfo-based analyzer from Map21 Lowercase_3383.csv) has ~20 columns incorrectly stored as `TEXT`, while view 3342 (same source 1961, loaded by the legacy system from the same file family) has correct numeric types. Downstream SQL that does math/aggregation on those columns breaks on the new tables.

**Root causes identified:**

1. **Column-rename lookup bug in `generateTableDescriptor()` (`src/dama/upload/analysis.js:209-234`)** — `schemaMap` is keyed by the raw CSV column name from ogrinfo (e.g. `ttamp80pct`), but the lookup uses the user-edited field name from `fieldsMetadata` (e.g. `ttamp_80_pct`). When the UI renames a column, the lookup misses and falls through to `TEXT`. This is why 3384's pct columns are `TEXT` even though ogrinfo correctly identified them as `Integer` — the renaming in the analysis UI broke the mapping.

2. **ogrinfo lacks legacy-analyzer safety nets** — even after the lookup bug is fixed, ogrinfo doesn't do zero-padding detection (FIPS/UACE codes like `"036001"` silently become `INTEGER`, losing the leading zero) and doesn't honor the column-name heuristic (`^(block|block_group|tract|county|uza|state)(_geo)?(id|code)$` → `TEXT`). Map 21 avoids this because its codes are already integer-valued, but any CSV with padded codes will be wrong.

3. **Lost UI affordances** — the ogrinfo path returns empty `null`/`nonnull` counts and no sample values, so the analysis override pane has nothing to show users.

Verification: Running `ogrinfo -oo AUTODETECT_TYPE=YES -oo AUTODETECT_SIZE_LIMIT=0 -so -ro -al 'Map21 Lowercase_3383.csv'` shows `ttamp80pct: Integer (0.0)`. Task 6715's stored tableDescriptor has `{ key: 'ttamp_80_pct', col: 'ttamp_80_pct', db_type: 'TEXT' }` — the type is wrong, the name is the user-edited name.

## Diff that triggered this

3342 (old, correct) vs 3384 (new, broken) — same source 1961, same column layout, 42 columns each:

| Column pattern | 3342 (old) | 3384 (new) | Match? |
|---|---|---|---|
| `traveltimecode`, `begindate`, `comments` | text | text | yes |
| `urbancode`, `fsystem`, `statecode`, `metricsource`, etc. | bigint | integer | close (style) |
| `segmentlength`, `occfac`, `lottramp`, `phed`, etc. | numeric | double precision | close (style) |
| `ttamp_80_pct`, `ttamp_50_pct`, `tt*midd*pct`, `tt*pmp*pct`, `tt*we*pct`, `ttt*ovn*pct` (19 columns) | bigint | **text** | **REGRESSION** |

Only the renamed-in-UI integer columns hit the bug. The lottramp family kept its type because its names weren't edited (no digits to "beautify").

## Scope

### In scope
1. Port `analyzeSchema.js` from `references/avail-falcor/dama/routes/data_types/file-upload/analyzeSchema.js` to `src/dms/packages/dms-server/src/dama/upload/analyzeSchema.js` (CJS-ify, minor cleanups).
2. Wire it into the CSV path of `analyzeLayer()` — parse rows via `csv-parse` streaming, feed to `analyzeSchema`.
3. Keep ogrinfo as fallback. Allow `DAMA_CSV_ANALYZER=ogrinfo` env override for the old path.
4. Fix `generateTableDescriptor` to pair analysis ↔ metadata **by position**, not by name, so user renaming preserves type info. Include a secondary name-match fallback for safety.
5. Surface `nonnull`, `null`, and samples in the output so the UI can show them.
6. Add tests: analyzer unit tests (zero-padding, GEOID regex, integer/decimal promotion, BIGINT overflow), descriptor mapping-by-index test, rename-preserves-type regression test.

### Out of scope
- Redesigning the UI rename flow (just making the backend robust to it).
- GIS analyzer changes — `gdal-async` path stays as-is.
- Backfilling column types for already-loaded tables (3384 etc.) — that's a follow-up if needed.

## Plan

### Phase 1: Port `analyzeSchema.js` — DONE
- Copy `references/avail-falcor/dama/routes/data_types/file-upload/analyzeSchema.js` → `src/dama/upload/analyzeSchema.js`.
- Convert from ESM to CJS (the old file already uses `module.exports`).
- Keep the algorithm unchanged (10K row cap, state machine, geoid regex, zero-padding check, scientific notation → NUMERIC, BIGINT overflow → TEXT, sample collection biased toward many-commas + largest numerics).
- Minor cleanup: strip the commented-out date/boolean blocks or keep with a note. Decision: **keep commented-out blocks** (they document intent and may be restored).

### Phase 2: CSV streaming iterator — DONE
- Add `parseRowsStream(filePath)` to `processors/csv.js` — async iterator of row objects using `csv-parse` (already a dep check required). Yields objects keyed by header names.
- Update `analyzeLayer()` in `analysis.js` to, for CSV files:
  1. Get headers via existing `processors/csv.js`
  2. Stream row objects into `analyzeSchema(rowIter)`
  3. Map old analyzer output (`INT`, `BIGINT`, `REAL`, `DOUBLE PRECISION`, `NUMERIC`, `TEXT`) to PG types matching old DAMA behavior: `INT`→`INTEGER`, everything else passes through.
- Keep ogrinfo as fallback. Order: `analyzeSchema` (CSV) → `gdal-async` (GIS) → `ogrinfo` (any).

### Phase 3: Fix `generateTableDescriptor` mapping — DONE
Change the lookup strategy. Analysis output is ordered the same as the CSV header; `fieldsMetadata` is derived from the same header, so positions align. Current code (broken):
```js
schemaMap[field.key] = field.summary.db_type;  // keyed by raw CSV name
...
db_type: schemaMap[field.name] || 'TEXT',      // looks up user-edited name — miss!
```
New code:
```js
// Pair by index. Fall back to name match if lengths differ (e.g. user dropped columns).
const analysisFields = layerFieldsAnalysis?.schemaAnalysis || [];
for (let i = 0; i < fieldsMetadata.length; i++) {
  const field = fieldsMetadata[i];
  const analysisField = analysisFields[i] ||
                        analysisFields.find(f => f.key === field.name || f.key === field.original_name);
  const db_type = analysisField?.summary?.db_type || 'TEXT';
  ...
}
```
Also: preserve `summary.nonnull`, `summary.null`, and `summary.types` in the output so the UI can display them (the UI already reads this shape from the old DAMA).

### Phase 4: Tests — DONE (22 passing)
`tests/test-csv-analyzer.js`:
- `analyzeSchema` unit tests on fixture iterators:
  - All integers → `INT`
  - Integer promotion to `BIGINT` past ±2.1B
  - BIGINT overflow → `TEXT`
  - Decimal values → `REAL`/`DOUBLE PRECISION`/`NUMERIC` based on digit count
  - Scientific notation → `NUMERIC`
  - Zero-padded `"036001"` → `TEXT`
  - GEOID column name heuristic (`county_code`, `geoid`) → `TEXT` even with integer values
  - Mixed types → `TEXT` sink
  - Samples collected (up to 10 per type, biased toward many-commas)
- `generateTableDescriptor` tests:
  - Mapping by index works when user renames columns (regression test for view 3384)
  - Mapping by name works when lengths match
  - Falls back to TEXT only when no analysis entry exists
  - `null`/`nonnull`/`types` preserved in `columnTypes[].summary`

Add to upload pipeline test suite's total count when done.

### Phase 5: Manual verification — DONE

- [x] Local analyzer verification on real `Map21 Lowercase_3383.csv` — output matches 3342 for all affected columns:
  - All 19 `tt*_*_pct` columns: `INTEGER` (was `TEXT` in 3384 — **bug fixed**)
  - All `lott*` / `ttt*` decimal columns: `DOUBLE PRECISION` (3342 used `NUMERIC`, functionally equivalent)
  - `statecode`: `TEXT` via GEOID regex (3342 shows `bigint`, likely a UI override — the new default is safer)
  - Analysis runs in ~600ms over 10K rows of a 3.6MB file
- [x] End-to-end upload + publish against a test npmrds database — verified working in production
- [x] Verify source metadata has `columns` with `display_name` from original CSV headers — verified
- [x] Verify UI override pane shows null/nonnull counts + sample values — verified

## Files to change

- `src/dama/upload/analyzeSchema.js` — **NEW** (ported from references/avail-falcor)
- `src/dama/upload/processors/csv.js` — add `parseRowsStream()`
- `src/dama/upload/analysis.js` — route CSV through `analyzeSchema`; fix mapping-by-index in `generateTableDescriptor`; preserve null/nonnull/samples
- `tests/test-csv-analyzer.js` — **NEW**
- `tests/test-upload-pipeline.js` — update existing `generateTableDescriptor` tests if signatures change
- `package.json` — add `test:csv-analyzer` script; ensure `csv-parse` in deps (probably already there, check)

## Dependencies check

- `csv-parse` — check `packages/dms-server/package.json`. Add if missing.
- No new dep for `analyzeSchema` itself — it's plain JS, iterator-based.

## Testing checklist

- [x] `analyzeSchema` unit tests pass (13 cases — type ladder, zero-padding, GEOID regex, BIGINT overflow, sample collection, row cap)
- [x] `generateTableDescriptor` index-mapping regression test passes (including 3384-specific rename scenario)
- [x] `parseRowObjectsStream` tests pass (header mapping, maxRows)
- [x] `analyzeLayer` integration tests pass (legacy analyzer default, zero-padding preservation)
- [x] Existing upload-pipeline tests still pass (12 tests)
- [x] Local analyzer run on real Map21 Lowercase_3383.csv produces correct types (pct columns INTEGER, not TEXT)
- [x] End-to-end upload + publish of Map21 file — verified in production
- [x] Manual upload of a synthetic CSV with zero-padded codes preserves leading zeros — verified (unit-test coverage + production)
- [x] `DAMA_CSV_ANALYZER=ogrinfo` env var falls back to the ogrinfo path — code path verified, env-var documented in `docs/upload.md`
- [x] UI analysis override pane shows null/nonnull counts + samples — verified
- [x] `docs/upload.md` updated: new "Analysis Pipeline" section describing analyzer routing, `summary` shape, and rename-safe index pairing in `generateTableDescriptor`; `DAMA_CSV_ANALYZER` env var listed

## Open questions / decisions

- **Row cap**: legacy analyzer capped at 10K rows. Keep? Yes — it's fast and the heuristics are well-tuned for that sample size. Could expose as `DAMA_ANALYZE_ROW_CAP`.
- **INT vs INTEGER**: legacy output `INT`, which the DAMA publish step converts to `BIGINT`. New code has been using `INTEGER` (int4). Decision: emit `INTEGER` from the ported analyzer (not `BIGINT` by default) — the actual table column will be whatever the `db_type` string says, and `INTEGER` is appropriate for values fitting int4. Use `BIGINT` only when the ladder promotes. This diverges slightly from the old DAMA behavior (everything was bigint) but is more accurate.
- **BIGSERIAL on CSV publish**: the csv-publish worker currently adds `ogc_fid BIGSERIAL PRIMARY KEY` after COPY. Keep.
