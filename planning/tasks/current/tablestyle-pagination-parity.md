# dataWrapper Pagination: honor `display.tableStyle` (named-style parity)

## Status: DONE 2026-08-26 (one-line precedence fix, BC)

## Problem
A Spreadsheet section can select a named table style via `display.tableStyle`
(spreadsheet/index.jsx passes `activeStyle={display.tableStyle || activeStyle}`
to the Table body) — but the pagination bar is rendered separately by the
dataWrapper (`dataWrapper/components/Pagination.jsx`), which passed only the
section-level `activeStyle` from ComponentContext. Result: a table styled with
e.g. `tableStyle:'mny-inventory'` rendered its grid in the named style but its
pagination in the theme default — a half-restyled composite.

Found on the MitigateNY Actions Dashboard (page 2410892): the `mny-inventory`
table style applied to the grid while "PAGE 1 OF 24" kept the default mny
Oswald-uppercase pagination.

## Change (BC)
`dataWrapper/components/Pagination.jsx` now uses the same precedence the Table
body uses:

```jsx
activeStyle={state.display.tableStyle || activeStyle}
```

Sections that don't set `display.tableStyle` are unchanged. The UI `Pagination`
component already resolved its theme via `getComponentTheme(theme, 'table',
activeStyle)`, so no other change was needed.

## Motivating use
mny theme `table.styles[].name='mny-inventory'` (Actions Dashboard "Action
inventory" table) — its pagination keys (`paginationContainer`, `pageRangeItem*`,
`paginationPagesInfo/RowsInfo`) complete the design's bordered card; without
this fix they were unreachable per-section.
