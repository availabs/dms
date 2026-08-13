# Filter bar — applied (active) state, clear-all in `RenderFilters`, and themeable controls

**Objective:** let a theme express a *scope bar* — a compact inline filter strip whose chips visibly
change when a filter is applied, with a Reset link — without any component owning brand classes and
without a `className` passthrough. Five small, additive library changes.

**Requested for:** the landbank admin dashboard's Scope band
(`src/themes/landbank/design_system/pages/admin-dashboard.html` §"scope / filter band", live page
1077 section 1093). The mockup draws each filter as an `h-9` white trigger with its label inside
("Municipality: Cohoes ▾"), an **applied** filter as the same chip in skydeep on a sky tint with an
✕, and a **Reset** ghost link. Nothing in the filter layer could express "this filter has a value",
and `RenderFilters` (the column-filter path) had no clear-all at all.

## Changes (all additive / BC)

1. **`data-active` on the filter row** — `RenderFilters.jsx` and `ExternalFilters.jsx` stamp
   `data-active` on the condition-row wrapper when that row's filter carries a real selection
   (absent, not `false`, when inactive). No new `…Active` theme key: the theme puts `group` on
   `conditionRowInline` and styles the row *and* its label/control from its own class strings with
   `group-data-[active]:` variants — the same convention as the unary toggle chip's `data-on`.
   `ExternalFilters` reuses its existing `leafHasValue`; `RenderFilters` gets a `rowIsActive` helper
   (external filters only in view mode; all filters in edit mode).
   - `RenderFilters.theme.js`: documented on `conditionRowInline`. Library ships **no** active look.

2. **Clear-all in `RenderFilters`** (opt-in `display.showClearAll`, the twin of the flag
   `ExternalFilters` already honours). Blanks every rendered filter's value in one `setState` write,
   then drops all of their page filters in a single `updatePageStateFilters` navigation, so every
   subscribing section re-queries once.
   - ⚠ **Bug to not repeat:** the first version collected the page-filter keys *inside* the
     `setState` recipe. Immer runs that recipe when React processes the update, so the map was still
     empty on the next line, `updatePageStateFilters` got `{}`, computed no URL change and the Reset
     silently did nothing. Collect from the current `state` **before** `setState` (which is what
     `ExternalFilters.clearAllFilters` already did).

3. **`clearAllText`** — the clear-all LABEL is themeable (both paths), because brands name it
   differently ("Reset" on a scope bar, "Clear all" in a panel). Unset → `'Clear all'`.

4. **`caretIconName` on `multiselect`** — `MultiSelect` hardcoded `<Icon icon={'ArrowDown'}>`, so a
   brand whose selects draw a chevron had no way to get one (transportny's `filter_chip` even sets
   `caretIcon: "CaretDown"`, which is the *className* slot — evidence authors expect this key).
   Now `t.caretIconName || 'ArrowDown'`.

5. **`theme.input` may be promoted to `options/styles`** — `Input` already accepted (and discarded)
   an `activeStyle` prop with a comment inviting exactly this; it now resolves the theme with
   `getComponentTheme(theme, 'input', activeStyle)`. `Input.jsx` is the only reader of `theme.input`
   in the package, and a flat `input` theme is returned as-is, so this is BC for every theme.
   Payoff: a filter design's `controlStyle` name now styles the **text-search** filter's box as well
   as its select triggers — the name is already threaded `filters.controlStyle` →
   `RenderFilterValueSelector` → `ColumnTypes.text.EditComp` → `Input`. Before this, a `like` filter
   always drew the theme's full-size bordered input, which is why a chip-styled bar needed an ugly
   `has-[[type=text]]:border-0` escape hatch in the theme.

6. **`cardsVerticalAlign` / `cellsVerticalAlign: 'center'`** (`Card.layout.js` + `Card.config.jsx`) —
   content-sized rows centered in the box's spare height. `'top'` leaves a short card floating at the
   ceiling and `'stretch'` inflates its rows; neither centers. Needed because the band's "Scope"
   eyebrow is a one-cell Card fused beside the (taller) filter card, and it must sit on the chips'
   mid-line. Generally useful for any label card fused beside taller content.

## Files
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.jsx` (1, 2, 3)
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.theme.js` (docs + `clearAllText`)
- `packages/dms/src/patterns/page/components/sections/ExternalFilters.jsx` (1, 3)
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/FilterComponent.config.js` ("Clear all" toggle)
- `packages/dms/src/ui/components/MultiSelect.jsx` + `MultiSelect.theme.js` (4)
- `packages/dms/src/ui/components/Input.jsx` + `Input.theme.js` (5)
- `packages/dms/src/ui/components/Card.layout.js` + `.../ComponentRegistry/Card.config.jsx` (6)

## Acceptance
- [x] Applied filter renders the brand's active look with **no component-side brand classes** —
      measured live (`?city=Cohoes`): row `data-active="true"`, border → `#0A6E99`/0.4, fill →
      sky/0.07, label → `rgb(10,110,153)`; the two inactive rows unchanged.
- [x] Reset clears everything: URL `?city=Cohoes` → no param, "Currently held" 3 → 198,
      `div[data-active]` count 1 → 0.
- [x] Chevron caret via `caretIconName: 'ChevronDown'`.
- [x] Text-search filter adopts the chip look via the promoted `input` style; the add-parcel form's
      inputs (the same `Input`, no `activeStyle`) render unchanged — verified in the same page load.
- [x] `cardLayout.test.js` — 29/29 pass with the new `'center'` mode.
- [ ] Not yet exercised by a second theme / a stacked (non-inline) filter design.

## Known gaps this did NOT close (candidates for a follow-up)
- **A multi-select with nothing selected renders blank.** `MultiSelect`'s multi +
  `displayDetailedValues` path maps over the values, so an empty filter shows *no* text where the
  mockup shows "All". There is no author-facing "empty label" (the `placeholder` prop is only used by
  the single-select path, and its text — "Search Municipality..." — is not what a chip wants).
  Proposal: an `emptyLabel` on the filter column threaded to the control, defaulting to today's
  blank so nothing changes for existing sections.
- **No slot for a note inside the filter bar.** The mockup's right-aligned "every chart, the map &
  the table share this slice" has nowhere to live in the filters markup; on the live page it would
  need a third fused card. A `filters` text key (like `clearAllText`) or a Filter-section
  `display.note` would cover it.
