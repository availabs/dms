# Table provider: `conditional_row_style` — accent a row when a column matches a condition

**Status:** IMPLEMENTED (library) — live verification + page/theme wiring pending (orchestrator)
**Topic:** patterns/page (Spreadsheet / Table)
**Driver:** MNY Action Prioritize Phase 3 #5.

## Objective

Let a Spreadsheet row carry a conditional visual accent driven by a cell value — specifically, the
Action Prioritize worklist wants an **amber left-edge + tint on rows whose `county_priority` is
empty** (work still to do), visible while scrolling. No existing mechanism styles a row by a value
(`cellBg`/`stripedRow` are static; `dataColorCell` colours a single cell's background).

## Change (additive, opt-in, BC) — use the existing provider framework

The Spreadsheet already has a per-section extension framework: `display._functions.providers`, an
array of `{ functionId, enabled, args, paramKey }` consumed in
`.../ComponentRegistry/spreadsheet/index.jsx` (existing providers: `hover_highlight`, `click_publish`,
`load_publish`). **Add a new provider `conditional_row_style`** that fits this pattern rather than a
bespoke config:

```jsonc
{ "functionId": "conditional_row_style", "enabled": true,
  "args": { "column": "county_priority", "when": "empty",   // empty | notempty | equals | notEquals
            "value": "",                                      // for equals/notEquals
            "styleKey": "rowAccentAmber" } }                  // a theme.table style key
```

At render, for each row, evaluate the condition against `row[args.column]`; if it matches, apply the
class from `theme.table.styles[...].[args.styleKey]` (fall back to a library default) to the row /
its leading gutter so the accent (e.g. `border-l-4 border-[color]` + a faint tint) shows. The colour
comes from the theme, not hardcoded.

## Files

- `.../ComponentRegistry/spreadsheet/index.jsx` — read the provider (mirror how
  `hover_highlight`/`load_publish` are found via `display._functions?.providers?.find(...)`), compute
  per-row match, pass a row class down to the row renderer.
- `src/dms/packages/dms/src/ui/components/table/components/TableRow.jsx` — accept + apply the
  conditional row class.
- `src/dms/packages/dms/src/ui/components/table/table.theme.jsx` — add a default style key (e.g.
  `rowAccent`) so a theme (mny) can define the amber look; keep a neutral library default.
- If providers are enumerated/configurable in a controls config, add `conditional_row_style` there so
  it's authorable (check where `hover_highlight` etc. are declared).

## Investigate before coding

- The provider pattern in `spreadsheet/index.jsx` (`display._functions.providers`, the `.find(p => p.functionId === ... && p.enabled)` idiom, and how `hover_highlight` reaches the row via `onRowMouseEnter`/rowData). Match it.
- How `TableRow.jsx` receives per-row props / classes today (so the accent class threads through cleanly).
- `row[column]` value shape — meta/select columns can be `{value, originalValue}` (handle both, like `stage_progress` does: `value?.value ?? value?.originalValue ?? value`).

## Backward compatibility

New provider `functionId`; absent by default → every existing Spreadsheet renders identically. Only a
section that adds the provider gets row accents.

## Implementation notes (library — DONE)

Provider `functionId: 'conditional_row_style'`, args `{ column, when, value, styleKey }` with
`when ∈ { empty | notempty | equals | notEquals }`. Follows the existing `display._functions.providers`
`.find(p => p.functionId === … && p.enabled)` idiom (mirrors `hover_highlight`/`load_publish`).

Data flow: `spreadsheet/index.jsx` reads `rowStyleCfg` and passes `conditionalRowStyle={rowStyleCfg?.args}`
to `<Table>`. `Table` (`table/index.jsx`) resolves the accent class once from the live table theme
(`theme[styleKey] || theme.rowAccent`) and threads the descriptor (+ resolved `className`) through
`TableStructureContext`. `TableRow` reads it from context, evaluates the condition against
`rowData[column]` (unwrapping the `{value, originalValue}` cell shape; arrays treated as raw for empty
checks), and appends the class to the row's `rowClass` (same element as `stripedRow`/`totalRow`). Total
rows never match. Neutral library default `rowAccent: 'border-l-4 border-gray-400 bg-gray-50'` added to
`table.theme.jsx` styles[0]; brand themes (mny) define their own `rowAccentAmber` etc. Authoring entry
added to `spreadsheet/config.jsx` `componentFunctions.providers`.

Files edited:
- `ui/components/table/table.theme.jsx` — neutral `rowAccent` default.
- `ui/components/table/index.jsx` — accept `conditionalRowStyle` prop, resolve className, thread via context.
- `ui/components/table/components/TableRow.jsx` — `isValueEmpty` helper + per-row condition eval → row class.
- `…/ComponentRegistry/spreadsheet/index.jsx` — read provider, pass descriptor to `<Table>`.
- `…/ComponentRegistry/spreadsheet/config.jsx` — authoring declaration in `componentFunctions.providers`.

## Testing checklist

- [ ] (orchestrator/live) With the provider set (`column:'county_priority', when:'empty', styleKey:...`),
      rows whose county_priority is empty get the accent class; set rows do not.
- [ ] (orchestrator/live) `notempty`/`equals`/`notEquals` conditions also work.
- [x] No provider → unchanged (descriptor is `undefined`; `rowClass` gains only a trailing empty string).
- [x] Handles `{value,originalValue}` cell shape (unwrapped in `TableRow` before evaluating).
- [x] Lint: only baseline-consistent noise introduced (see Notes); no new fixable issue.

## Notes

Consuming page: dms-template 2262755, Spreadsheet section 2262760. Wiring the provider + the mny
`theme.table` amber accent style is the orchestrator's job. Do not edit the page or publish here.
