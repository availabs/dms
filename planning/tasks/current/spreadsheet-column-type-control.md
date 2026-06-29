# Spreadsheet — add a Column Type control to the per-column header controls

## Objective
Let an author change a Spreadsheet column's `type` (the columnType that drives both the
view and the inline edit widget) from the column header edit controls. Previously the
`inHeader` controls exposed display name, format, justify, sort, allowEditInView, isLink,
etc. — but **not** `type`, so a column was stuck on whatever type it was created with.

## Why it works
`TableCell.jsx` chooses the cell renderer from the column type:
`compType = attribute.type` → `DataTypes[compType].ViewComp / EditComp`
(`DataTypes` = `ui/columnTypes`). So exposing `attribute.type` as an editable control
immediately changes both the rendered cell and the edit input.

## Change (done)
`patterns/page/components/sections/components/ComponentRegistry/spreadsheet/config.jsx`
— added a `{ type: 'select', key: 'type', label: 'Column Type', displayCdn: ({isEdit})=>isEdit }`
to the `inHeader` controls, with a curated option list of the author-facing data-entry types
(text, number, date, timestamp, boolean, switch, select, multiselect, radio, checkbox,
status_pill, textarea, lexical, image).

## BC
Backward-compatible: only exposes the existing `attribute.type` field; existing columns keep
their current type. No data migration.

## Follow-ups / notes
- Value-shaping types still need their companion config to be useful:
  `select`/`multiselect`/`radio` need `options` or `mapped_options`; `status_pill` needs a
  value→style map; `switch` needs `trueValue`. The type selector only swaps the renderer —
  the existing per-type config controls handle the rest.
- Consider sourcing options from the live registry (`getColumnTypes()`) minus the internal/
  view-only types (`dms-format`, `tree_node`, `publish_state`, `sections_chip`,
  `last_published`, `activity_action_badge`, `default`, `calculated`) so new registered
  types appear automatically — deferred to keep the first cut curated/legible.

## Testing checklist
- [ ] In a Spreadsheet section edit mode, the column header shows "Column Type".
- [ ] Switching text → number changes the input to numeric and the view formatting.
- [ ] Switching to status_pill renders the pill view (with its mapping config).
- [ ] Saved section reloads with the chosen type; old sections unaffected.
