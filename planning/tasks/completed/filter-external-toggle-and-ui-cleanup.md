# Filter component: hide external-filters toggle by default + adopt UI components

## Status: IMPLEMENTED — 2026-05-13

### What shipped

- `display.hideExternalToggle` flag added to `ExternalFilters.jsx`. Strict `=== true` check so absent/`false` preserves the previous toggle-pill behavior; new sections get `true` via `Card.config.jsx`'s `defaultState.display`.
- ExternalFilters' inline toggle-pill markup replaced with `UI.Button` + theme keys (`theme.filters.toggleButton` / `toggleIcon`) — actual `<button>` element instead of a clickable `<div>` (better accessibility).
- `RenderFilters.jsx` got the same toggle-pill swap (UI.Button + theme keys). Single `toggleButton` JSX is reused for both open and collapsed states.
- `filterTheme` consolidated as the shared source of truth — new keys: `toggleButton`, `toggleIcon`, `conditionsGrid`, `conditionRowInline`, `conditionRowStacked`, `filterRowWrapper`, `inlineSwitchRow`, `searchKeyRow`, `searchKeySelectorWrapper`, `searchKeyMenuWrapper`, `searchKeyMenuItem`. Defaults match the original inline literals so existing themes render byte-identical.
- `themeFromContext.filter` (singular) typo fixed in three places: `ExternalFilters.jsx:34`, `RenderFilters.jsx:29`, `RenderFilterValueSelector.jsx:64`. The transportny theme's existing `filters:` block (which was sitting unused) now actually applies.
- `RenderFilterValueSelector.jsx` inline class strings moved into theme keys; the inner `RenderSearchKeySelector` helper now reads the same `filterTheme` instead of duplicating literals.
- `ComplexFilters.jsx` minor pass: `<label className={''}>` empty strings and unlabeled `<label>`s in the leaf popup all now use `t.popupRowLabel`. Added that key to `complexFiltersTheme`.
- No new per-component theme file — kept everything in the existing `RenderFilters.theme.js` since `filterTheme` is already shared between `ExternalFilters` and `RenderFilters`.

### Files touched

- `src/dms/packages/dms/src/patterns/page/components/sections/ExternalFilters.jsx`
- `src/dms/packages/dms/src/patterns/page/components/sections/ComplexFilters.jsx`
- `src/dms/packages/dms/src/patterns/page/components/sections/ComplexFilters.theme.js`
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.jsx`
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.theme.js`
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/Components/RenderFilterValueSelector.jsx`
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` (`defaultState.display.hideExternalToggle: true`)

### Live testing left for the user

- Load an existing saved page with an external filter — confirm the toggle pill still renders + toggles (no regression on absent key).
- Create a fresh Card section, mark a filter external — confirm the toggle pill is gone and the panel just shows.
- transportny site theme: since the `themeFromContext.filter` → `filters` typo was fixed, the transportny theme's `filters:` block now actually applies. Diff was a no-op (block was a copy of `filterTheme`), so no visual change is expected.

---

## Original task spec (preserved below)

## Objective

Two related cleanups to the page-pattern filter components (`ExternalFilters.jsx`, `ComplexFilters.jsx`, and the dataWrapper `filters/` subtree):

1. **Add an option to hide the "external filters" show/hide toggle button.** Currently `ExternalFilters` always renders a round Filter-icon pill at the top-right of the external filters area whose only job is to collapse/expand the panel. The pill is always on, takes meaningful vertical space (it floats out of the panel with `-mt-4`), and most sections never want it. New sections should default to **hidden** (no toggle, panel just shows when there are external conditions). Existing saved sections must render byte-identical to today.

2. **Replace inline markup with UI components / theme classes.** The filter files contain ~70 `className=` attributes with long Tailwind strings inlined in JSX. Per `src/modules/dms/packages/dms/src/CLAUDE.md` ("Theming — no Tailwind in markup"), structural elements (buttons, pills, switches, label wrappers) should come from `ThemeContext.UI` (`Button`, `Pill`, `Switch`, `Icon`, `Label`, etc.) and the remaining presentational class strings should live in the matching `*.theme.js` siblings, not in component bodies.

## Backwards compatibility — non-negotiable

**Opt-in default for new sections; absent key means "show toggle" for existing sections.** Following the established `display.useBlankRowFallback` pattern (see `tasks/current/datawrapper-blank-row-fallback.md`):

- New key: `display.hideExternalToggle` (boolean, defaults to absent).
- Runtime check in `ExternalFilters.jsx`: `if (display.hideExternalToggle === true) { /* skip rendering the toggle pill */ }`. Strict `=== true` so `undefined`/`false` both keep current behavior.
- `Card.config.jsx` (and any other component-registry entry that wires this filter) sets `display.hideExternalToggle: true` in its `defaultState` so newly-created sections start with the toggle hidden.
- Existing rows in the DB have no `display.hideExternalToggle` key → runtime check is false → toggle pill renders exactly as today.
- The UI-cleanup half of this task must be visually identical for sections that haven't migrated. Theme keys take their current literal values as the default in `ExternalFilters.theme.js` / `ComplexFilters.theme.js`, so re-themed sites pick up the new keys and untouched themes look the same.

## Scope

**In:**

- `src/dms/packages/dms/src/patterns/page/components/sections/ExternalFilters.jsx`
  - Drop the toggle pill rendering when `display.hideExternalToggle === true`.
  - Move the toggle pill itself to a `<Button>` (or `<Pill>`) from `ThemeContext.UI` instead of an inline `<div className="w-fit -mt-4 p-2 border rounded-full self-end"><Icon ... /></div>`.
  - Move the remaining inline classes (`gridClasses`, `placementClass`, `labelWrapperClass`, label `<span>`) to either the existing `ComplexFilters.theme.js` keys (`filterLabel`, `filterSettingsWrapper*`, `labelWrapper*`) or new ones in a dedicated `ExternalFilters.theme.js` sibling.

- `src/dms/packages/dms/src/patterns/page/components/sections/ComplexFilters.jsx` — replace the 37 inline `className=`s with theme key lookups; use `<Switch>`, `<Select>`, `<Button>`, `<Label>` from `ThemeContext.UI` instead of bare HTML where applicable. The `External` toggle row at L279-282 already uses `<Switch>`; audit the rest for similar conversions.

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.jsx` and `RenderFilterValueSelector.jsx` — same pass.

- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` (and any sibling configs that render filters in their `inHeader` / `controls.data`) — add `display.hideExternalToggle: true` to `defaultState`. Optionally surface as a section-menu toggle so authors can re-enable on the rare section that wants the collapse affordance.

**Out:**

- The filter-evaluation logic (`getExternalConditions` walker, condition shape, isExternal semantics) — purely a presentation refactor.
- The `display.gridSize` / `display.placement` controls — already work; don't touch.
- The map-section filter controls (`ComponentRegistry/map/controls/FilterControls.jsx`) — separate, lives under map_section, not page-section filters.

## Files requiring changes

| File | Change |
|---|---|
| `ExternalFilters.jsx` | Add `display.hideExternalToggle` guard; swap inline pill for `UI.Button`/`UI.Pill`; pull remaining classes from theme |
| `ComplexFilters.jsx` | Audit 37 inline `className`s — adopt `UI.Switch`/`UI.Select`/`UI.Button`/`UI.Label`; move presentation to theme |
| `ComplexFilters.theme.js` | Add any new keys needed for the moved classes |
| `dataWrapper/components/filters/RenderFilters.jsx` | Same inline-markup cleanup |
| `dataWrapper/components/filters/Components/RenderFilterValueSelector.jsx` | Same |
| `ComponentRegistry/Card.config.jsx` | `defaultState.display.hideExternalToggle = true`; optional section-menu toggle entry |
| `dataWrapper/components/filters/RenderFilters.theme.js` | New keys if needed |

## Testing checklist

- [ ] **BC for existing sections** — load a saved page that has an external filter configured (e.g. WCDB or transportny prod page if available). Confirm the Filter toggle pill renders and toggles open/closed identically to current behavior. No visible diff.
- [ ] **New section default** — create a fresh Card section, mark a column external. Confirm the toggle pill is absent; the external filter row renders without the round Filter icon.
- [ ] **Explicit re-enable** — flip `display.hideExternalToggle` to `false` on a new section (via the section menu, if surfaced, or by editing the underlying state). Confirm the toggle pill comes back.
- [ ] **Theme override** — set `theme.filter.filtersWrapper` (or whichever keys get moved) to a distinct color in a test theme. Confirm the external filter panel picks it up.
- [ ] **No regression in ComplexFilters** — open the filter editor in edit mode, add/remove conditions, change ops, toggle `isExternal`. All controls function identically.
- [ ] **Print mode** — `print:hidden` is preserved on the wrappers (currently inlined on `theme.filters.filtersWrapper`).
- [ ] **Type-check / build** — `npm run build` in transportNY succeeds; no missing-import errors from the UI component swaps.

## Notes / open questions

- The toggle pill currently uses `-mt-4` to float out of the panel. If we keep the toggle as an opt-in for some sections, the layout token for that float should be a theme key (`filterToggleFloat` or similar) rather than inline, so themes that don't want the float can suppress it.
- Worth considering whether `display.hideExternalToggle` should be the inverse (`display.showExternalToggle`, default false) for clearer naming on new sections. Either works; chose `hide*` so the BC check is `=== true` and absent means "current behavior" without inversion.
- The `themeFromContext.filter` typo at `ExternalFilters.jsx:34` (`filter` singular vs `filters` plural elsewhere) is unrelated but in scope for the same file — worth fixing in this pass.
