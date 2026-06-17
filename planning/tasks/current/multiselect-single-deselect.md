# MultiSelect single-select deselect (`allowDeselect`)

## Objective

`UI.MultiSelect` already supports removing values in multi-select mode (pill ×).
In `singleSelectOnly` mode there was **no way to clear** a chosen value — once you
picked one you were stuck with a selection. Add an opt-in `allowDeselect` prop so
single-select can be cleared back to "no value", reusing the one component
(no separate single-select widget).

Motivating consumer: the tsmo `congestion_v2` **region** page-filter — a
single-select that must return to "statewide" (no region).

## Change (IMPLEMENTED)

`ui/components/MultiSelect.jsx` + `MultiSelect.theme.js`:

- New prop `allowDeselect=false` (BC — off by default).
- **Trigger:** in `singleSelectOnly` mode, when a value is selected and
  `allowDeselect`, render a clear **×** just left of the caret
  (`singleClearWrapper` theme key; glyph reuses `removeIconName`/`removeIconClass`).
  `onClick` stops propagation (doesn't toggle the menu) and emits `onChange([])`.
- **Menu:** clicking the already-selected option row also deselects (covers
  `displayDetailedValues:false`, where the selected row is visible).
- Deselect emits `[]` (empty), so array-consuming callers see an empty value and
  page-filter sync drops the key cleanly.

`patterns/.../ConditionValueInput.jsx` (the v2 filter value picker used by
`ExternalFilters` → standalone Filter sections):

- Pass `allowDeselect={isMultiselect && !node.isMulti}` so **every single-select
  `filter`/`exclude` page-filter** is clearable. Clearing a filter is always a
  valid intent, so this is on by default for single-select filter pickers.

### Pairs with `empty-filter-leaf-noop`

Deselect emits an empty value; without the buildUdaConfig empty-`filter` prune,
that empty value would compile to `col IN ()` and re-break the consuming cards.
The two ship together: clear = widen to "no constraint", not break. See
[`empty-filter-leaf-noop.md`](./empty-filter-leaf-noop.md).

## Backward compatibility

BC: `allowDeselect` defaults false; existing single-selects (filter type/operation
pickers, etc.) are unchanged. Multi-select pill × behaviour untouched. The legacy
`RenderFilterValueSelector` path was left as-is (region filter renders via
`ConditionValueInput`); it can take the same one-line wiring later if a
single-select chip there needs clearing.

## Files

- `packages/dms/src/ui/components/MultiSelect.jsx`
- `packages/dms/src/ui/components/MultiSelect.theme.js`
- `packages/dms/src/patterns/page/components/sections/ConditionValueInput.jsx`

## Testing

- [x] esbuild parse-check of all three files.
- [ ] Live (tsmo `congestion_v2`): region filter shows × when a region is picked;
      clicking × clears to statewide; cards re-query statewide (no break). Pairs
      with the empty-filter prune live-verify.

## Page-side

`congestion_v2` region filter (2175680) reverted from the `isMulti:true` stopgap
back to single-select; it now relies on `allowDeselect`. Logged in
`planning/transportny/tasks/current/tsmo-congestion-page-build.md`.
