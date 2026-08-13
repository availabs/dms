# Card — `'bottom'` vertical alignment (the design's `mt-auto` footer note)

**Objective:** let an author pin a Card's content to the FLOOR of its section box, so a card
that is taller than its content (because a `rowspan`/`height:'fill'` sibling set the row height)
can carry a footer block at the bottom instead of floating it under the content.

**Requested for:** the landbank admin dashboard's "Needs attention" inset
(`admin-dashboard.html:395-403`), which the design draws as `mt-auto pt-4` → a tinted panel
pinned to the bottom of the Disposition pipeline card. The three existing options all render it
wrong: `'top'` leaves it directly under the legend with ~280px of empty card below it,
`'center'` floats it mid-card, and `'stretch'` inflates the tint itself to fill the slack (the
state shipped in session 8c — a 240px tall tint strip).

## Change (additive / BC)
- **`ui/components/Card.layout.js`**
  - `resolveCardsPackMode` gains a `'bottom'` mode, resolved before the model branch so it
    behaves identically on v1 and v2 themes (as `'center'` already does).
  - `resolveCardsGridStyle` maps it to `alignContent: 'end'` with `gridAutoRows: 'max-content'`
    — content-sized rows, block against the floor.
  - `resolveCellsGridStyle` gains the matching `cellsVerticalAlign: 'bottom'` → `alignContent:
    'end'`, keeping the cells grid a mirror of the cards grid (it already mirrors
    `'center'`/`'stretch'`).
- **`Card.config.jsx`**: "Pin to bottom" added to both Vertical Align selects, between "Center"
  and "Fill height".

Nothing else reads the value, and every existing value resolves exactly as before — a section
that never sets the knob is byte-identical.

## Files
- `packages/dms/src/ui/components/Card.layout.js`
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx`
- `packages/dms/tests/cardLayout.test.js` (two new cases — they also close the pre-existing gap
  that `'center'` had no coverage at all, on either grid)
- (consumer) landbank dashboard section 1089: `cardsVerticalAlign: 'bottom'`

## Acceptance
- [x] "Needs attention" renders as a content-height tinted inset pinned to the bottom of the
      pipeline card; the two columns of the band end flush (measured: both at y=2031).
- [x] `'top'` / `'center'` / `'stretch'` / unset unchanged on v1 and v2.
- [x] `vitest run` — 215/215 (213 + 2).
- [ ] Document in `src/dms/skills/card-layout.md` §Vertical Align — done in the same commit;
      re-check when the skill's display-key table is next revised.
