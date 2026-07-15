# Spreadsheet: inline-expand row detail (`openOutMode: 'inline'`)

**Status:** IMPLEMENTED (library) — pending live verification on page 2262755 (orchestrator wires `openOutMode:'inline'` + mny theme styling)
**Topic:** patterns/page (Spreadsheet / Table)
**Driver:** MNY Action Prioritize design alignment, Phase 3 follow-up.

## Implementation summary (2026-07-15)

Flag: **`display.openOutMode`** with values `'drawer'` (default, unchanged) and `'inline'`.
Only `'inline'` changes behaviour; `undefined`/`'drawer'`/anything-else → the existing floating drawer.

Insert / track: expansion is the existing per-row `showOpenOut` state inside each `TableRow`
(toggled by the openOut trigger/caret via `TableCell`). No new state added — multiple rows stay
independently expandable and re-clicking the trigger collapses. When `openOutMode === 'inline'`, the
detail renders as a full-width panel (`openOutInlineRow` > `openOutInlinePanel` > openOut `TableCell`s)
inserted after the row grid but still inside the row's `rowRef` wrapper, so the Virtual list's
ResizeObserver measures the taller row and pushes following rows down.

Field extraction reuse: the inline panel renders the SAME `openOutAttributes` through `TableCell`
(`openOut` + new `openOutInline` prop), so label/value/formatFn/`{value,originalValue}` extraction is
byte-identical to the drawer. `openOutInline` only swaps three class sources
(field wrapper / label / value) to the inline theme keys.

Files edited:
- `ui/components/table/table.theme.jsx` — added neutral defaults `openOutInlineRow`,
  `openOutInlinePanel`, `openOutInlineField`, `openOutInlineLabel`, `openOutInlineValue` to `styles[0]`
  (the `below-row` style inherits them; brand themes override). No hardcoded brand colour.
- `ui/components/table/index.jsx` — thread `openOutMode: display.openOutMode` into `structureValues`
  (→ `TableStructureContext`); expose `openOutInlineRow`/`openOutInlinePanel` on `rowTheme`.
- `ui/components/table/components/TableRow.jsx` — read `openOutMode` from context; added the inline
  render branch alongside the unchanged drawer branch.
- `ui/components/table/components/TableCell.jsx` — added `openOutInline` prop; when set (+ `openOut`)
  the cell wrapper uses `openOutInlineField`, the label uses `openOutInlineLabel`, the value uses
  `openOutInlineValue` (drawer path unchanged).
- `.../ComponentRegistry/spreadsheet/config.jsx` — added author control "Open Out Mode" (select:
  Drawer default / Inline) to `more[]`.

**Design note — spreadsheet/index.jsx not edited:** `RenderTable` already forwards the whole `display`
object to `<Table display={display}>`, so `display.openOutMode` is threaded through with no change.
**Design note — TableCell.jsx edited** though not in the spec's file list: it owns the openOut
label/value render, so reusing "the exact same extraction" while applying the new inline theme keys
required an additive, BC `openOutInline` prop there.

## Objective

Add an option to render a row's `openOut` detail columns as an **inline expanding panel** (a full-width
row inserted directly beneath the clicked row, pushing rows down) instead of the current **right-side
drawer**. The mockup's worklist expands inline (Description of the Problem / Solution + cost/time/hazard
chips + "View / edit action"); DMS today only has the drawer (`openOutContainer` … `float-right`).

## Change (additive, opt-in, BC)

- New display flag **`display.openOutMode: 'drawer' | 'inline'`** (default `'drawer'` → unchanged).
- When `'inline'`: clicking the row's open-out trigger toggles an inserted detail row spanning all
  columns, rendering the same `openOut` columns (label + value) the drawer shows, laid out as a panel
  (a 1–2 col grid of field label/value + any chip-style columns). Clicking again collapses it. Multiple
  rows may be open independently (track expanded row keys in state).
- Optional: the trigger glyph — the mockup uses a chevron that rotates on expand. If the open-out
  trigger icon is themed, allow a chevron; otherwise leave the existing trigger. Keep it minimal.

## Where

- `src/dms/packages/dms/src/ui/components/table/index.jsx` + `components/TableRow.jsx` — the openOut
  render currently produces the drawer (`openOutContainer*` theme keys). Add the inline branch: when
  `openOutMode==='inline'`, render the detail as an inserted row (`<div>`/row spanning the grid) after
  the row, instead of the floating drawer. Reuse the same field extraction the drawer uses.
- `ui/components/table/table.theme.jsx` — add neutral defaults for the inline panel
  (`openOutInlineRow`, `openOutInlinePanel`, `openOutInlineField`, `openOutInlineLabel`,
  `openOutInlineValue`); brand theme overrides. No hardcoded brand colour in the component.
- `.../ComponentRegistry/spreadsheet/index.jsx` / `config.jsx` — pass `display.openOutMode` through and
  surface it as an author control alongside the other display options.

## Investigate first

- How the drawer openOut currently works: the `openOutContainer` / `openOutContainerWrapper` theme keys,
  which columns are `openOut:true`, how the trigger toggles it, and how field label/value are pulled
  (so the inline panel reuses the exact same content).
- How `TableRow` is keyed / how rows are mapped (to insert a detail row after a specific row and track
  which are expanded).

## Backward compatibility

Default `openOutMode:'drawer'` → every existing Spreadsheet with openOut columns behaves exactly as
today. Inline only when a section opts in.

## Testing checklist

- [ ] `display.openOutMode:'inline'` → clicking a row's trigger inserts an inline detail panel below it
      with the openOut fields; clicking again collapses; multiple rows independent. *(needs live verify)*
- [x] Default (drawer) unchanged — inline is a new branch gated on `openOutMode === 'inline'`; every
      existing section has `openOutMode === undefined` → drawer branch, byte-for-byte as before.
- [x] Fast-Refresh clean — no new `react-refresh/only-export-components` violations (only components
      exported; theme keys are data in the existing `.theme.jsx`; control is data in `.config.jsx`).
- [x] `{value,originalValue}` cells handled — inline reuses `TableCell` (same extraction as drawer).
- [x] Lint: no new error class vs. baseline. Only added instances of the pervasive `react/prop-types`
      rule (`openOutInline`, `theme.openOutInlineRow`, `theme.openOutInlinePanel`) — that rule is
      already violated 180+× in these files and is disabled in the library's own `eslint.config.mjs`.

## Notes

Consuming page: dms-template 2262755, Spreadsheet 2262760 (openOut columns already exist: problem,
solution, cost_range, estimated time, primary hazard). Wiring `openOutMode:'inline'` + mny theme
styling of the panel is the ORCHESTRATOR's job. Do not edit the page or publish.
