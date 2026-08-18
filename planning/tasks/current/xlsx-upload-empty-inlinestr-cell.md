# XLSX upload fails on empty inline-string cell

## Objective

Fix `.xlsx` upload analysis failing with `Unsupported "inline string" cell value structure: <c r="A15" t="inlineStr"></c>` when a workbook contains a cell explicitly typed `t="inlineStr"` but with no `<is>` child (a legal-but-unusual "empty inline string" cell).

## Root cause

`read-excel-file@6.0.3` (pinned in `dms-server/package.json`, direct dependency) throws in
`node_modules/read-excel-file/modules/read/parseCellValue.js:37-41` when a cell's type is
`inlineStr` but `getInlineStringValue()` returns `undefined` (no `<is>` child present). The OOXML
spec permits this — it's just a blank cell — but this library version treats it as malformed
rather than coercing to `null`.

Confirmed fixed upstream in `read-excel-file@9.x` (`VALUE_MISSING` is treated as a "repairable"
situation → resolves to `null` instead of throwing — see `commonjs/xlsx/parseCell.js` /
`parseSheet.js` in v9.3.10). However v7/v8/v9 are breaking-change major bumps for this codebase's
usage (removed default export, removed `readSheetNames()`, changed node API shape) — not a safe
drop-in bump for `excel.js`'s current usage pattern.

Repro file confirmed by the user: `Suffolk_County_Actions_2.0_reconciled v2.xlsx`, fails at cell
`A15`. The cell is genuinely blank — not user data error — the producing tool just wrote
`t="inlineStr"` with no content instead of omitting the `<c>` or using `t="z"`.

## Chosen approach

Don't upgrade the dependency. Instead, in `dama/upload/processors/excel.js`, catch this specific
`read-excel-file` error and retry once against a sanitized copy of the file:

1. On `analyze()`/`parseRows()` catching an error matching `/Unsupported "inline string" cell value structure/`,
   open the `.xlsx` (it's a zip) with `jszip` (already present as a dependency of
   `packages/dms/` in this monorepo — add as an explicit `dms-server` dependency).
2. For each `xl/worksheets/sheet*.xml` entry, regex-strip the `t="inlineStr"` attribute from any
   `<c ...></c>` / `<c .../>` cell tag that has no `<is>` child (empty inline-string cells only —
   don't touch cells that do have `<is>` content). Dropping the type attribute makes the cell
   fall back to the XLSX default type (`n`, numeric) with no `<v>` present, which parses to `null`
   — the same outcome the fixed v9 library produces.
3. Write the sanitized zip to a temp file, retry `readXlsxFile` against it, and clean up the temp
   file afterward (success or failure).
4. If the retry still throws (some other unrelated parse error), propagate the original error
   unchanged so we don't mask genuinely bad files.

## Files requiring changes

- `src/dms/packages/dms-server/package.json` — add `jszip` dependency.
- `src/dms/packages/dms-server/src/dama/upload/processors/excel.js` — wrap `analyze()` and
  `parseRows()`'s `readXlsxFile` calls with the catch-and-sanitize-retry logic. Likely factor the
  sanitize step into a shared helper since both functions need it.

## Testing checklist

- [ ] Unit/manual: run `analyze()` and `parseRows()` against the actual repro file
      (`/home/shaun/Downloads/Suffolk_County_Actions_2.0_reconciled v2.xlsx`, user's machine only —
      not committed) and confirm no throw, headers/rows come back, and row containing A15 has
      `null`/empty value in that column.
- [ ] Confirm a normal, unaffected `.xlsx` file still parses identically (no behavior change on
      the happy path — sanitize step only triggers after the specific error is caught).
- [ ] Live verify: re-attempt the upload at
      `http://localhost:5173/cenrep/internal_source/1029065/upload/1074456` and confirm the
      `/dama-admin/hazmit_dama/gis-dataset/.../layers` call succeeds.
