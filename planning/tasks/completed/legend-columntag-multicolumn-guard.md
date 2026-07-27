# Legend columnTag: skip for multi-column paint expressions (BC guard)

## Objective

Stop the map legend's column tag from starving the layer title when the layer's
`data-column` is a multi-column expression (QA ticket #158-adjacent — transportNY
ticket #165, tsmo2/reliability_v2 "Map legend unclear").

## Root cause

`map/LegendPanel.jsx` LegendRow builds `columnTag` from the layer's `data-column`
(`.split('AS ').pop().replace(/_/g,' ')`). The Worst-period LOTTR layer paints from
four comma-joined columns (`lottr_amp,lottr_midd,lottr_pmp,lottr_we`), so the tag
renders "LOTTR AMP,LOTTR MIDD,LOTTR PMP,LOTTR WE" — an unshrinkable span beside the
`flex-1 … truncate` title, which collapses to "W..". The reporter couldn't tell what
the layer was.

## Fix (BC)

A comma in the post-`AS` expression means the tag isn't a column name — it's an
expression dump, unreadable at any width. Skip the tag in that case (title gets the
full row). Single-column tags — the feature's actual use case — are unchanged.

## Files

- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/LegendPanel/LegendPanel.jsx`
  (`map_dama`'s LegendPanel has no columnTag — not affected)

## Testing

- [x] tsmo2/reliability_v2 legend shows "Worst-period LOTTR" in full, no tag (verified live 2026-07-21, title 234px untruncated)
- [x] a single-column layer legend still shows its tag (BC by construction — no-comma path returns the identical string as before)

## Status

- [x] Root cause confirmed on live page (title flex-1 truncate vs unshrinkable tag span)
- [x] Guard implemented
- [x] Verified live (transportNY QA ticket #165 resolved with screenshot)
