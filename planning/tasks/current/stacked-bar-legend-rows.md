# stacked_bar — key-style legend (`legendLayout: 'rows'`)

**Objective:** let a `stacked_bar` render its legend as one ROW per segment (colour swatch ·
label · count) instead of the single joined line, so a theme can lay those rows out as a
multi-column key.

**Requested for:** the landbank admin dashboard's Disposition pipeline
(`admin-dashboard.html:387-394`), whose legend is a 3-column grid of `swatch | label | count`.
The component could only emit `"60 For Sale · 57 ACLB Project · …"` as one string, so no theme
could reach the individual entries — the live card read as a wrapped mono sentence under the bar.

## Change (additive / BC)
- **`ui/columnTypes/stacked_bar.jsx`**: new column attribute `legendLayout` — `'text'`
  (default, byte-identical to today) or `'rows'`. In `rows` mode each segment renders
  `<swatch><label><count>`, reusing the same `fills` resolution (theme key or literal colour)
  as the bar segments, so a legend chip can never drift from its segment.
- New theme keys, all with neutral library defaults: `legendRows` (the container — falls back
  to `legend`, so a theme that only styled the text legend still renders sane rows),
  `legendItem`, `legendSwatch`, `legendLabel`, `legendValue`. **The theme decides whether the
  rows stack or sit in a grid** — there is no `columns` prop, because that's a look, not data.
- `showLegend: false` and `emptyText` behave exactly as before.

## Files
- `packages/dms/src/ui/columnTypes/stacked_bar.jsx`
- (consumer) `src/themes/landbank/theme.js` → `stackedBar.legendRows` =
  `grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2.5`, plus a 36px `track` with `gap-0.5`.

## Acceptance
- [x] Pipeline card renders the mockup's 3-column key (swatch · label · count) under a 36px
      segmented bar; verified live, colours match the segments and the status pills.
- [x] Default (`legendLayout` unset) unchanged — the mny/transportny pipelines still render the
      text line.
- [x] `vitest run src/dms/packages/dms/tests/` — 213/213.
