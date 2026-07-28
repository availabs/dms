# Table: `row_highlight` themed 'accent' style + click-publish cursor

> **Status:** ✅ BUILT 2026-07-17, verified live on tsmo2/incident_view (dev). Rides the next
> git sync/deploy. Theme half (transportnyv2 `rowHighlightAccent`) rides the theme-folder sync.
> **Driver:** the incident-view active-corridor selector's highlight was the core's hardcoded
> amber; the design wants a brand-blue tint + left accent. Also: click-to-switch rows had no
> pointer affordance.

## Changes (additive/BC)

### 1. `row_highlight` gains a themed `'accent'` style

Existing `row_highlight` styles (`bg` = amber cell fill, `bold`, `border`) are per-cell in
`TableCell.jsx` and unchanged. New `'accent'` paints at the ROW level instead:

- `TableCell.jsx`: an `isHighlighted && style === 'accent'` row's cells render `bg-transparent`
  (so the row-level tint shows through). The amber path still fires only for `bg`/undefined.
- `table/index.jsx`: `resolvedHighlightedRow` resolves the accent className from the FULL table
  theme (`theme[styleKey] || theme.rowHighlightAccent || theme.rowAccent`) — same pattern as
  `resolvedConditionalRowStyle`, because TableRow's curated `rowTheme` doesn't carry the key.
  Threaded via `TableStructureContext` as `highlightedRow.accentClass`. Non-accent styles pass
  through untouched.
- `TableRow.jsx`: reads `highlightedRow` from context, matches the row (same value logic as
  TableCell / conditional_row_style), and appends `highlightedRow.accentClass` to `rowClass`.
- `table.theme.jsx` (base): new `rowHighlightAccent: 'bg-blue-50 shadow-[inset_3px_0_0_theme(colors.blue.600)]'`
  default. Brand themes override.
- `spreadsheet/config.jsx`: `row_highlight` args gain the `'Accent (themed)'` style option +
  an optional `styleKey` input (names a `theme.table` style; defaults to `rowHighlightAccent`).

### 2. Click-publish cursor affordance

`TableRow.jsx`: `rowClass` gets `cursor-pointer` whenever `onRowMouseClick` is present (a
`click_publish` table), so click-to-switch rows are discoverable. No-op for non-clickable tables.

## Theme consumer (rides theme-folder sync, NOT git)

`src/themes/transportny/themev2.js` table theme: added
`rowHighlightAccent: "bg-[#1F3F8F]/[0.06] shadow-[inset_3px_0_0_#1F3F8F]"` (brand blue tint +
left edge). Needs the transportnyv2 theme-folder sync to reach transportNY.

## Consumer + verification

incident_view Corridors spreadsheet (`build_tsmo2_incident_view.mjs`): `row_highlight` style
`bg` → `accent`. Verified live: default active row (I-495) shows the blue left edge + tint;
clicking CROSS ISLAND PKY moves the accent to it and re-scopes the page; rows show a pointer
cursor.

## Deferred (optional, not built)

- `param_match_pill` columnType (the design's inline "ACTIVE" badge) — the accent + cursor
  convey active-ness; pill is redundant unless the author wants it.
- `click_publish` multi-param `publishes:[]` (multi-day event edge case).
