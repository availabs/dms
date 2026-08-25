# Filter-control theming enrichments (Input named styles + leaf placeholders)

## Status: DONE 2026-08-25 (two additive edits)

## Objective
The viewer-facing filter bar (`ExternalFilters` → `ConditionValueInput`) renders its controls
through `ColumnTypes.multiselect/text` with `activeStyle = theme.filters.controlStyle` — the
multiselect resolves named styles, but two gaps kept a brand from reaching design parity
(MNY Actions Dashboard filter bar, mockup `pages/county-actions/dashboard.html`):

1. **`Input` ignored `activeStyle`** (its own comment invited the wiring). The `text` control
   (search / number leaves) could not take a named style, so a pill-style filter bar drew a
   double box (bordered input inside the pill row).
2. **Leaf placeholders were hardcoded** (`'search...'` / `'select...'`), while the design
   vocabulary wants "All" on dropdowns and "Search actions…" on the search box.

## Changes (both BC)
- `ui/components/Input.jsx`: resolve `theme.input` through
  `getComponentTheme(themeFromContext, 'input', activeStyle)`. A flat `theme.input` map passes
  through getComponentTheme unchanged (flat-shape behavior), so every existing theme renders
  byte-identically; only a theme that registers `input` as `options/styles[]` gains variants.
- `patterns/page/.../ConditionValueInput.jsx`: `placeholder = node.placeholder || <old defaults>`
  — a filter leaf may author its placeholder; absent = old behavior.

## Motivating use
mny theme's `input`/`multiselect` `pill` styles + `filters.pillBar.controlStyle = 'pill'`
(see `src/themes/mny/theme.js`), driven by the Actions Dashboard filter-bar alignment pass —
root-hub task `planning/mitigateny/tasks/current/actions-dashboard-live-build.md`.
