# Download — exclude value-less chrome columns from the xlsx export

**Objective:** stop a static column that renders an affordance rather than a value (a row-action
icon link, a modal trigger cell) from emitting an always-blank column in the section's export.

**Requested for:** the landbank admin dashboard's held-inventory table, which gained two
`icon_link` action columns (View / Edit). `triggerDownload` builds the worksheet from every
`show` column, so the download would carry an "Actions" column and a blank-headed second column,
both empty in every row.

## Change (additive / BC)
- **`dataWrapper/index.jsx`**: new `isValuelessChromeCol` predicate — `origin === 'static' &&
  !staticValue` — applied alongside the existing `isDisaggregatingCol` filter on both branches of
  the download column list.

A static column carrying a `staticValue` is a real constant and still exports; only the case that
can *only* ever produce blanks is dropped. Data columns, calculated columns and `selectOnly`
columns are untouched (a `selectOnly` PK still exports, which is useful — it identifies the row).

## Files
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/index.jsx`

## Acceptance
- [x] `vitest run` — 215/215.
- [ ] ⚠ **Not verified against a real downloaded file.** The reasoning follows the code path
      (`cols` → `tmpState.columns` → `visibleCols` → `worksheet.columns`), but the download
      control did not fire under headless automation across several attempts, so the xlsx headers
      were never read back. **Click Download on the landbank dashboard's table once and confirm
      the sheet has no "Actions" column.**
- [ ] Confirm a static column WITH a `staticValue` still appears in an export (no consumer in this
      repo exercises that today).

## Related
Found while closing landbank gap **G9** — see
`planning/landbank/tasks/current/admin-dashboard-dms-page.md`, session 9b. That entry also flags
two adjacent upstream defects **not** fixed here: `RenderActions.jsx`'s `getIcon` accepts an
`icon` and discards it (the icon branch is commented out, so `actionType: 'url'` can never render
one), and the same component hardcodes `bg-blue-300 hover:bg-blue-500` brand classes that belong
in the table theme per `packages/dms/CLAUDE.md`.
