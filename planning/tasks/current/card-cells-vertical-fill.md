# Card — cells vertical fill (`cellsVerticalAlign: 'stretch'`)

**Objective:** Let a Card's inner **cells grid** stretch its cells to fill the card's height — the
cells equivalent of the existing outer-grid `cardsVerticalAlign: 'stretch'`. So when a section is
`height: 'fill'` and a Card sits beside a taller sibling, the Card's bordered cells reach the bottom
of the stretched card instead of packing to the top and leaving slack.

**Requested for:** the mny Action Prioritize stat strip (section 2262757) — its 4 bordered stat cells
must be the same height as the lede panel (2262775) next to it. Both sections already carry
`height:'fill'` and measure exactly equal (132px), but the stat cells pack to the top (~90px) with
~42px slack below. The lede only *looks* filled because its `cardsBgColor` fills the cells grid.

## Current behavior
- `ui/components/Card.layout.js → resolveCellsGridStyle` hardcodes `alignContent: 'start'` (packs cell
  rows to the top) and only sets `gridAutoRows` when `cellsRowHeight`/`hasRowSpan`. So cell rows are
  content-height and top-packed — nothing stretches them to the card height.
- The outer cards grid already supports fill: `resolveCardsGridStyle` + `resolveCardsPackMode` →
  `cardsVerticalAlign: 'stretch'` gives `gridAutoRows: 'minmax(max-content, 1fr)'` + `flex:1`.
- The cells grid (subWrapper) is a grid item of the cards grid → `align-self: stretch` already makes it
  fill the (stretched) card row. Only its *own* rows pack. So the fix is local to the cells grid.

## Change (BC / additive — mirrors cardsVerticalAlign)
1. **`Card.layout.js → resolveCellsGridStyle`**: read `cellsVerticalAlign` from `display`. When
   `=== 'stretch'`: emit `gridAutoRows: 'minmax(max-content, 1fr)'` and DROP `alignContent: 'start'`
   (let rows grow to fill). `cellsRowHeight` still wins (explicit px). Default (unset) → byte-identical
   to today (`alignContent:'start'`, content rows).
2. **`Card.jsx`**: destructure `cellsVerticalAlign` from `display`; pass it into the `subWrapperStyle`
   `resolveCellsGridStyle({ display: {...} })` memo + deps.
3. **`Card.config.jsx`** (Cells Grid group): add a `{ type:'select', label:'Vertical Align',
   key:'cellsVerticalAlign', options:[{Model default, undefined},{Pack to top,'top'},{Fill height,'stretch'}] }`
   mirroring the cards-grid control (line ~504). ('top' == default here; only 'stretch' changes anything.)

## Files
- `src/dms/packages/dms/src/ui/components/Card.layout.js` (resolveCellsGridStyle)
- `src/dms/packages/dms/src/ui/components/Card.jsx` (destructure + subWrapperStyle memo/deps)
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` (control)

## Constraints
- **BC:** only `cellsVerticalAlign === 'stretch'` changes rendering; every existing Card unchanged
  (Card reaches site-wide — see feedback_card_edits_bc). Requires the section to be `height:'fill'` +
  `cardsVerticalAlign:'stretch'` for the card to have a taller-than-content box to fill into.

## Acceptance
- [x] Stat strip cells fill to match the lede height on :5200 (both bordered boxes 132px).
- [x] A plain Card with no `cellsVerticalAlign` renders byte-identical (change gated on `=== 'stretch'`).

## Done (2026-07-20)
Built + verified on the mny Action Prioritize page (:5200, local dev pointed at :3001). Stat strip
2262757 (`height:'fill'` + `cardsVerticalAlign:'stretch'` + `cellsVerticalAlign:'stretch'`) — the 4
bordered stat cells now measure 132px, exactly matching the lede panel 2262775 (section boxes were
already equal at 132px; the cells were the last piece packing to the top). Files: `Card.layout.js`
(`resolveCellsGridStyle` — `stretch` drops `alignContent:'start'` + sets `gridAutoRows:
'minmax(max-content, 1fr)'`), `Card.jsx` (destructure + subWrapperStyle memo/deps), `Card.config.jsx`
(Cells Grid → Vertical Align select). BC by construction (only `cellsVerticalAlign === 'stretch'`
changes anything). Code-complete in the submodule; reaches live devmny only on submodule deploy (owner).
