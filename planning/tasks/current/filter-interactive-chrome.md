# Filter section interactive chrome: needs-value toggle · active tokens · clear-all

**Status:** LIBRARY IMPLEMENTATION DONE — awaiting live wiring (page 2262759) + mny theme styling (orchestrator).
**Topic:** patterns/page (filters)
**Driver:** MNY Action Prioritize design alignment, Phase 3 follow-up.

## Objective

Bring the viewer-facing Filter section (`ExternalFilters` / `RenderFilters`) up to the mockup's
filter-bar chrome, all **additive/opt-in/BC**:

1. **Needs-value toggle** — render a filter leaf whose op is **`empty`** (the unary op already added in
   `filter-op-empty.md`) as a **toggle chip**: OFF = the leaf is not applied (no clause); ON = applies
   `empty` (`col IS NULL OR ''`). This is the "Needs priority" control (`county_priority` empty). A
   unary op has no value input, so the toggle's on/off is the whole state — persist it so the consuming
   data sections react (page-filter sync). When OFF, emit NO empty leaf (so servers without the op, and
   normal queries, are unaffected).
2. **Active-filter tokens** — for each external filter with a selected value, render a removable chip
   (label + value + ✕) below/inline in the bar; clicking ✕ clears that filter.
3. **Clear-all** — a control that resets all external filters to empty.

## Where

- `src/dms/packages/dms/src/patterns/page/components/sections/ExternalFilters.jsx` — the viewer control
  (renders `externalConditions`; reads `display.gridSize`/`placement`; theme via
  `getComponentTheme(theme,'filters',display.filterStyle)`). Add: toggle rendering for `empty`-op
  leaves; the active-token row; the clear-all control.
- `.../filters/RenderFilters.jsx` — the edit-mode twin; keep parity where it makes sense (at minimum
  don't break it; the toggle/tokens are primarily a viewer concern).
- Theme keys in `.../filters/RenderFilters.theme.js` (library defaults) — add neutral defaults:
  `toggleChip` / `toggleChipOn` / `toggleTrack` / `toggleKnob`, `activeToken` / `activeTokenRemove`,
  `clearAll`. A brand theme (mny) overrides them. Do NOT hardcode brand colour in the component.

## How the toggle applies a unary op (the load-bearing bit)

The `empty`-op leaf lives in the section's filter tree (external). Its "value" is meaningless; what
matters is whether it is **included**. Model the toggle state as: ON → the leaf participates (op stays
`empty`); OFF → the leaf is suppressed (e.g. op blanked / a `disabled:true` flag the query builder
skips, OR removed from the emitted tree). Pick the least-invasive representation that (a) the page-filter
sync round-trips and (b) `buildUdaConfig` already drops when OFF. Confirm `buildUdaConfig` does not emit
a suppressed leaf. Coordinate with `filter-op-empty.md` (already merged).

## Investigate first

- `ExternalFilters.jsx` render loop (how each `externalConditions` leaf becomes a control; the
  `ConditionValueInput` used per op) — add an `op==='empty'` branch → toggle chip (no value input).
- How selected external values are read (for the token row) and how a leaf is cleared (reuse the
  existing update-node path `updateNodeAtPath`).
- The page-filter sync so toggling/clearing updates the URL/pageState and reacting sections re-fetch.

## Backward compatibility

All additive: existing filter sections (no `empty` leaf, no token/clear-all opt-in) render exactly as
today. Toggle chrome appears only for `empty`-op leaves; tokens/clear-all behind a `display` opt-in
(e.g. `display.showActiveTokens`, `display.showClearAll`) defaulting off.

## Testing checklist

- [ ] An `empty`-op external leaf renders as a toggle chip; ON filters the data sections to empty rows,
      OFF removes the constraint (and emits no empty leaf). *(mechanism implemented; needs live verify on 2262759)*
- [ ] Active tokens render for selected filters; ✕ clears that filter and the data updates. *(implemented; needs live verify)*
- [ ] Clear-all resets all external filters. *(implemented; needs live verify)*
- [x] No opt-in → existing Filter sections unchanged (non-unary, no `display.showActiveTokens`/`showClearAll`
      → byte-identical JSX; the false branch of the render loop is the unchanged `<ConditionValueInput>`).
- [x] Lint passes (no new errors beyond the pre-existing baseline). Fast-Refresh clean (only `ExternalFilters`
      exported; new helpers are module-local non-exports).

## Implementation status — DONE (library)

**Files edited:**
- `ExternalFilters.jsx` — viewer control. Added: PageContext hook; `unaryOn`/`toggleUnary`/`clearLeaf`/
  `clearAllFilters` handlers; render-loop branch (`isUnaryOp(node.op)` → toggle chip, else unchanged
  `ConditionValueInput`); opt-in active-tokens + clear-all row. Module-local pure helpers `isUnaryOp`/
  `leafHasValue`/`leafValueLabel`.
- `buildUdaConfig.js` — (a) `mapFilterGroupCols`: `if (node.disabled) return null;` drops a suppressed leaf
  (OFF emits nothing; server then sees an empty group → no WHERE). (b) `applyPageFilters`: for a
  `usePageFilters` `empty`/`notempty` leaf, sets `disabled` from page-value PRESENCE so the toggle
  round-trips via pageState/URL and drives reacting sections.
- `RenderFilters.theme.js` — neutral library defaults: `toggleChip`/`toggleChipOn`/`toggleTrack`/`toggleKnob`
  (grays only; on-state via `data-on` + `group-data-[on]:` variants), `activeTokensWrapper` (added — needed
  to keep the row's Tailwind out of markup), `activeToken`/`activeTokenRemove`, `clearAll`.
- `RenderFilters.jsx` — NOT changed (old column-filter twin; unaffected — extends `filterTheme` additively).
  ExternalFilters already renders in edit mode too (dataWrapper edit path), so the toggle appears in both.

**ON/OFF model:** the unary leaf stays in the tree (so the toggle always renders). ON → `op` stays `empty`,
`disabled` falsy. OFF → `disabled: true`. `buildUdaConfig` drops disabled leaves. For `usePageFilters` leaves
the toggle's visual state derives from pageState (URL is source of truth on reload).

**Opt-in flags:** `display.showActiveTokens`, `display.showClearAll` (both default OFF). The toggle chip
appears only for an `empty`/`notempty`-op external leaf.

**Orchestrator wiring note:** a *consuming* data section's `empty` leaf should be saved `disabled: true`
by default. `applyPageFilters` only runs when `pageFilters` is non-empty; the saved default covers the
no-page-filters case so the leaf reads OFF until the toggle publishes its param.

## Notes

Consuming page: dms-template 2262755, Filter section 2262759 (add an `empty` leaf on `county_priority`
+ the display opt-ins). Wiring + mny theme styling of the chips/tokens is the ORCHESTRATOR's job. Do
not edit the page or publish. `:3001` runs current code, so the empty op is testable live.
