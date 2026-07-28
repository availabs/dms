# Table view-mode affordance hygiene — `display.disableCellSelection`, column `disableSort`, and the empty-header-menu guard

> **Status:** IN PROGRESS (2026-07-27) · all three BC-additive · driven by TransportNY tickets
> **#170 / #171** (cell-selection highlight) and **#164** (pointless sort control), see
> `planning/transportny/tasks/current/qa-human-intervention-queue.md`.

## Objective

Stop authoring affordances from reading as broken features on read-only dashboard tables. Three
independent, opt-in changes; default behavior is unchanged in every case:

1. **`display.disableCellSelection`** (section) — no spreadsheet click/drag highlight.
2. **`disableSort`** (column) — withdraw the view-mode Sort control for columns where sorting is
   meaningless (a chronological month axis).
3. **Empty-header-menu guard** (unconditional) — a header whose controls all filter out renders as
   plain text instead of opening an empty popup. Without this, (2) would trade one false affordance
   for another.

The three came out of one review round on the same page, and (3) is only reachable because of (2).

## Why

Two MPO reviewers filed the same bug against the tsmo2 congestion dashboard:

- **#170** (ksmith@gbnrtc.org): *"clicking on the month does not show anything. Looks like since it
  can be highlighted its suppose show something in space below"* — the Seasonality heat grid.
- **#171** (same reporter): *"you are able to highlight regions but it does not doing anything"* —
  the "Delay by NYSDOT region" data-bar table.

Both are `Spreadsheet` sections with `tableStyle: "heat"`. Reproduced live on
`/congestion_v2` (2026-07-27, Playwright): clicking a cell applies the table's selection state —
inline border `rgb(33, 0, 248)` (`selectionColor = '#2100f8'` in `TableCell.jsx`) plus
`bg-blue-50 hover:bg-blue-100`. Nothing else happens, because nothing else is wired.

Cell selection exists to serve **authoring**: range select → copy/paste → cell edit. On a published
read-only heat grid it is a false affordance — the highlight promises a drill-down that does not
exist. A theme override can't fix it: the selection border is applied as an **inline style**, so
only a component-level opt-out works.

## Design

`display.disableCellSelection: true` on a section → the table provides no selection setters, so no
highlight, no drag-range, no keyboard range nav. Named negatively **on purpose**: absent/false keeps
today's behavior, so every existing table is untouched, and the authoring toggle reads correctly as
off-by-default.

**Edit mode always keeps selection.** `allowEdit || isEdit` wins over the flag — paste-into-range and
the delete-selection path are authoring essentials, and an author who set the flag for the published
view shouldn't lose them while editing.

Not affected by the flag: double-click cell edit (`setEditing`, independent of selection), row
hover styling, `onRowMouseClick`, `highlightedRow`, `conditionalRowStyle`, link columns.

### 2 + 3 · `disableSort` and the empty-header-menu guard (#164)

**#164** (edozier@dutchessny.gov): *"The Seasonality chart doesn't have a legend and you can't click
on anything to understand what the different colors mean… Also what is the point of the sorting
function on this?"*

`Sort` is the **only** header control without an `isEdit` gate, so it is what a viewer sees when they
click any column header — that is deliberate (published tables are sortable), but on a chronological
month axis it is noise. Reproduced on the published page: clicking the `J` header opens a menu whose
sole content is a Sort select.

- **`disableSort`** (per column) → `Sort`'s `displayCdn` becomes
  `({attribute, isEdit}) => isEdit || !attribute.disableSort`. Authors keep it in edit mode; viewers
  lose it only on columns explicitly marked. Paired author toggle: "Disable sort in view".
- **Empty-menu guard** — `TableHeaderCell` now computes `visibleControls` (the `inHeader` entries
  surviving their `displayCdn`) **once**, uses it for both the render and the emptiness test, and
  returns the label as plain text when nothing survives. Previously the menu container rendered from
  the *unfiltered* `controls.inHeader.length`, so a fully-filtered column opened an empty popup. The
  label + icon block was extracted to a shared `labelAndIcons` so both branches stay identical.

The color-key half of #164 needed no core work — it's copy in the band's kicker
("· darker = more"), since `data_color_cell` has no legend primitive and a swatch legend would have
been a new one.

## Files changed

| File | Change |
|---|---|
| `packages/dms/src/ui/components/table/index.jsx` | `cellSelectionEnabled` gate; `setSelection`/`setIsDragging` withheld from `TableCellContext` when off; `onClickRowNum` (gutter select) no-ops when off |
| `packages/dms/src/ui/components/table/components/TableHeaderCell.jsx` | `visibleControls` memo; plain-text branch when empty; shared `labelAndIcons`; menu maps `visibleControls` instead of re-filtering |
| `…/ComponentRegistry/spreadsheet/config.jsx` | display toggle "Disable cell selection"; `displayCdn` on the `Sort` control; column toggle "Disable sort in view" |

Consumer (not in this submodule): `build_tsmo2_congestion_v2.mjs` sets `disableCellSelection` on the
Seasonality heat grid + the region data-bar table, and `disableSort` on the 12 month columns
(`delay_total` keeps its sort — ranking regions by total delay is meaningful).

## BC check

- [x] `disableCellSelection` absent → `cellSelectionEnabled === true` → identical code path to before.
- [x] `allowEdit`/`isEdit` → selection on regardless of the flag (authoring unaffected).
- [x] No theme keys added or renamed.
- [x] Consumers of `TableCellContext` already guard on `setSelection` (`if (setSelection &&
      setIsDragging)`, `setSelection?.(…)`) so withholding the setters is a no-op path, not a crash.
- [x] Regression pass on a table that *uses* selection — sitemgmt tickets table (flag absent) still applies `#2100f8` border + `bg-blue-50` on click, unchanged.
- [x] `disableSort` absent → `displayCdn` returns true → Sort renders as before (verified: sitemgmt
      tickets "Severity" and congestion's `delay` column both still open a Sort menu).
- [x] Empty-menu guard only changes columns that previously rendered an **empty** popup — every
      column with ≥1 surviving control takes the unchanged Popup branch.

## Testing checklist

- [x] Reproduced both false affordances on published `/congestion_v2` before the change (selection
      highlight on cells; Sort menu on the `J` month header).
- [x] After: clicking a heat cell / region row on `/edit/congestion_v2` leaves `border: transparent` + `bg-white` (only the row-hover tint remains).
- [x] After: month header `J` opens nothing; `delay` header still opens Sort (per-column, not blanket).
- [x] View-mode table with the flags absent (sitemgmt tickets): selection unchanged, Sort unchanged.
- [ ] Editable table (`allowEditInView`) still selects + pastes with the flag set, in edit mode.
- [ ] 390px: no layout change.
- [ ] Header with a *function-typed* control (`type` as a function, e.g. format controls) — confirm
      the memo's filter treats it the same as before (it does not inspect `type`, only `displayCdn`).
