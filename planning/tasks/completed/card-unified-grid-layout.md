# Card unified grid layout — COMPLETED 2026-05-07

## Objective

Collapse the Card component's two layout modes (`compactView=true` "row mode" and `compactView=false` "cell mode") into one unified layout where both grids are always rendered:

- **Outer grid (cards grid)** — lays out record-cards across the section
- **Inner grid (cells grid)** — lays out attribute-cells inside each card

Today only one of those two grids is a real CSS grid at any time; the other axis is a linear stack. The unified layout always has both grids, with independent settings per grid, which is more expressive (e.g., 3 cards across × 2 cells per card in a single configuration).

Backwards compat is one-shot: when an old saved card hydrates, the old `display.compactView` value is read **only** to decide which new grid the legacy single set of settings maps onto. After migration `compactView` is dropped from state entirely. Going forward there is no mode — every card has both grids, both groups of controls, all the time. There is no "currently active mode" anywhere in code, state, or editor.

## Scope

In:
- New unified rendering path in `Card.jsx` that always emits outer + inner grid. No `compactView` branch survives in render code.
- New settings shape: separate `cardsGrid*` / `cellsGrid*` scalars on `display` (see "Naming" below — finalize during implementation). `compactView` is removed from `display` entirely after migration.
- One-shot read-time migration when a saved card hydrates: if the loaded `display` has `compactView` set, route the old `gridSize`/`gridGap`/`padding`/`colGap`/`rowHeight`/`bgColor`/`addBorder`/`removeBorder` into the corresponding new keys based on the old mode value, default the other axis to a 1-column stack, then strip `compactView` and the legacy keys from state. Subsequent saves write the new shape only.
- Updated `Card.config.jsx` controls: **delete** the "Each Card Represents" select (no replacement — there is no mode). Expose both grid-settings groups (`Cards Grid`, `Cells Grid`) + their per-cell controls always, with no `displayCdn` gating tied to a mode flag.
- Per-attribute keys renamed (`cardSpan`/`cardRowSpan`/`bgColor`/`pb`/`borderBelow` → `cellSpan`/`cellRowSpan`/`cellBgColor`/`cellPaddingBottom`/`cellBorderBelow`). `migrateCardColumn` carries old keys to new at hydration; the renderer reads only the new keys.

Out:
- Visual redesign — defaults must reproduce existing appearance for migrated cards
- Pagination / data wiring / sourceInfo plumbing — untouched
- Picker (CardColumnPicker) UX changes beyond plumbing what was top/bottom vs left/right (it can keep the four insertion points; both axes are now real grids regardless of mode)
- Theme contract changes — keep the existing `theme.dataCard` keys (`mainWrapperCompactView`/`mainWrapperSimpleView`/`subWrapperCompactView`/`subWrapperSimpleView`/etc.); the unified path picks the right keys based on which grid is "the active one" for that wrapper. Optional follow-up: rename keys to match the new semantics.

## Current State

### Two modes, controlled by `display.compactView`

`Card.jsx:750` reads `compactView` along with `gridSize`, `gridGap`, `padding`, `colGap`, `bgColor`, `rowHeight`. The same scalar `gridSize`/`gridGap` keys mean different things depending on mode:

| Setting | `compactView=true` ("row mode") | `compactView=false` ("cell mode") |
|---|---|---|
| Outer wrapper layout | CSS grid: `repeat(gridSize \|\| data.length, 1fr)` `gap: gridGap` | Linear flex stack with `gap: gridGap` |
| Sub-wrapper (per-card) | Linear stack with `padding`, `gap: colGap`, `bgColor` | CSS grid: `repeat(gridSize \|\| cardsWithoutSpanLength, 1fr)` `gap: gridGap`, optional `gridAutoRows: rowHeight` |
| Per-attribute span | Ignored | `cardSpan` → `gridColumn: span N`; `cardRowSpan` → `gridRow: span N` |
| Per-attribute padding | `pb` (Padding Below), `borderBelow` apply | `padding`, `bgColor` apply (per cell) |
| Border toggles | `addBorder` → Cell Border; `removeBorder` (negated) → Row Border | `addBorder` → Row Border; `removeBorder` (negated) → Cell Border |

Concretely (`Card.jsx`):

- `mainWrapperStyle` — `Card.jsx:763-770`: only sets `gridTemplateColumns` when `gridSize && compactView`.
- `subWrapperStyle` — `Card.jsx:772-782`: only sets `gridTemplateColumns` when `!compactView`.
- `subWrapper` className — `Card.jsx:627`: branches on `compactView` to pick `subWrapperCompactView` vs `subWrapperSimpleView` and to apply `border shadow` / `rounded-md` chrome.
- `mainWrapperCompactView` vs `mainWrapperSimpleView` — `Card.jsx:828`.
- Per-attribute style — `Card.jsx:408-419` (`CardColumnField`): `gridColumn`/`gridRow` only set when `!compactView`; `padding`/`paddingBottom`/`backgroundColor` switch meaning per mode.
- `wrapperViewClass` — `Card.jsx:398-405`: completely different className branches.
- `pickerLeft`/`pickerRight`/`pickerTop`/`pickerBottom` — `Card.jsx:645-672`: top/bottom only in `compactView`, left/right only in `!compactView`.

### Editor controls

`Card.config.jsx:316-344` defines the More menu. Today:

- `compactView` is a select labeled "Each Card Represents" with options `a row` (true) / `a cell` (false).
- "Grid Settings" group exposes `gridSize`, `gridGap`, `padding`, plus `colGap` (compact only) and `rowHeight` (cell only).
- Border toggles use `displayCdn` to swap the meanings of `addBorder` / `removeBorder` based on `compactView`, with two pairs of "Row Border" / "Cell Border" toggles, each guarded by a different `displayCdn`. This is the core source of confusion — same key (`addBorder`) means "Row Border" in cell mode and "Cell Border" in row mode.

Per-attribute controls (`Card.config.jsx:174-179, 230`):

- `borderBelow`, `pb` only shown when `compactView`
- `cardSpan`, `cardRowSpan` only shown when `!compactView`
- per-attribute `bgColor` only shown when `!compactView`

## Proposed Changes

### 1. Settings shape (final naming TBD during implementation)

Two parallel groups of grid settings, both flat scalars on `display` to match the existing convention:

```
display.cardsGridSize     // outer grid: number of cards across
display.cardsGridGap      // outer grid: gap between cards
display.cardsPadding      // padding around each card body (was compact's `padding`)
display.cardsBgColor      // each card's background (was compact's `bgColor`)

display.cellsGridSize     // inner grid: number of cells across inside a card
display.cellsGridGap      // inner grid: gap between cells (also covers what `colGap` did)
display.cellsRowHeight    // inner grid auto-row height (was `rowHeight`)
display.cellsPadding      // padding inside each cell (was cell-mode's `padding`)

display.cardBorder        // bool — chrome around each card (replaces both
                          // (compact + addBorder) and (cell + addBorder negated)
                          // depending on which mode)
display.cellBorder        // bool — chrome around each cell
```

Per-attribute (column-level):

```
attr.cellSpan      // was cardSpan
attr.cellRowSpan   // was cardRowSpan
attr.cellBgColor   // was attr.bgColor (per-cell only)
attr.cellPaddingBottom // was attr.pb
attr.cellBorderBelow   // was attr.borderBelow
```

Old keys keep being **read** (see Migration). New writes use new keys only.

If "cards"/"cells" feels unclear, alternatives: `outerGrid*`/`innerGrid*`, or `cardGrid*`/`cellGrid*`. Pick during implementation; keep prefix consistent.

### 2. Migration helper

Add a pure helper used at section read time (probably in the dataWrapper migration pipeline alongside `migrateToV2.js`, or directly in `CardSection`'s state init):

```js
function migrateCardDisplay(display) {
  if (!display || display.compactView === undefined) return display;
  const wasCompact = !!display.compactView;
  const out = { ...display };

  if (wasCompact) {
    // Old "row mode": outer was the grid, inner was a linear stack.
    out.cardsGridSize = display.gridSize;
    out.cardsGridGap  = display.gridGap;
    out.cardsPadding  = display.padding;
    out.cardsBgColor  = display.bgColor;
    out.cellsGridSize = 1;                  // preserves the old vertical-stack look
    out.cellsGridGap  = display.colGap;
    out.cellsRowHeight = undefined;
    out.cellsPadding  = undefined;
    out.cardBorder    = !display.removeBorder;
    out.cellBorder    = !!display.addBorder;
  } else {
    // Old "cell mode": inner was the grid, outer was a linear stack.
    out.cellsGridSize = display.gridSize;
    out.cellsGridGap  = display.gridGap;
    out.cellsRowHeight = display.rowHeight;
    out.cellsPadding  = display.padding;
    out.cardsGridSize = 1;
    out.cardsGridGap  = display.gridGap;
    out.cardsPadding  = undefined;
    out.cardsBgColor  = undefined;
    out.cardBorder    = !!display.addBorder;
    out.cellBorder    = !display.removeBorder;
  }

  delete out.compactView;
  delete out.gridSize;
  delete out.gridGap;
  delete out.padding;
  delete out.colGap;
  delete out.rowHeight;
  delete out.bgColor;
  delete out.addBorder;
  delete out.removeBorder;

  return out;
}
```

Per-attribute migration (run over `state.columns`):

```js
function migrateCardColumn(col) {
  if (!col) return col;
  const out = { ...col };
  if (out.cardSpan !== undefined && out.cellSpan === undefined) out.cellSpan = out.cardSpan;
  if (out.cardRowSpan !== undefined && out.cellRowSpan === undefined) out.cellRowSpan = out.cardRowSpan;
  if (out.bgColor !== undefined && out.cellBgColor === undefined) out.cellBgColor = out.bgColor;
  if (out.pb !== undefined && out.cellPaddingBottom === undefined) out.cellPaddingBottom = out.pb;
  if (out.borderBelow !== undefined && out.cellBorderBelow === undefined) out.cellBorderBelow = out.borderBelow;
  delete out.cardSpan;
  delete out.cardRowSpan;
  delete out.bgColor;
  delete out.pb;
  delete out.borderBelow;
  return out;
}
```

Both migrations run once at the section's state-initializer step, before `useState` sees the data. The migrated state is what gets persisted on the next save; `compactView` and the legacy per-attribute keys never appear in newly-written blobs.

### 3. Rendering changes

`Card.jsx`:

- **`mainWrapperStyle`** (`Card.jsx:763-770`): always emits `gridTemplateColumns: repeat(cardsGridSize || data.length, minmax(0, 1fr))` and `gap: cardsGridGap`. No more `compactView` branch.
- **`subWrapperStyle`** (`Card.jsx:772-782`): always emits `gridTemplateColumns: repeat(cellsGridSize || cellsWithoutSpanLength, minmax(0, 1fr))`, `gap: cellsGridGap`, optional `gridAutoRows: cellsRowHeight`, plus `padding: cardsPadding` and `backgroundColor: cardsBgColor` (these previously belonged to compact's sub-wrapper).
- **`subWrapper` className** (`Card.jsx:627`): always uses the grid-style sub-wrapper className. Border/shadow chrome controlled by `cardBorder`.
- **Outer wrapper className** (`Card.jsx:828`): always uses the grid-style main-wrapper className.
- **`CardColumnField` style** (`Card.jsx:408-419`): always emit `gridColumn: span (cellSpan || 1)` and `gridRow` when `cellRowSpan` is set. Per-attribute `cellPadding`, `cellBgColor`, `cellPaddingBottom` apply unconditionally.
- **`wrapperViewClass`** (`Card.jsx:398-405`): collapse to one branch driven by `cellBorder`.
- **Pickers** (`Card.jsx:645-672`): show all four (left/right/top/bottom) insertion points unconditionally — both axes are now real grids. (Or: keep only left/right since insertion is column-order; revisit during implementation.)

The `compactView` prop is removed from `CardColumnField` and `RenderItem` once rendering no longer reads it.

### 4. Editor controls (`Card.config.jsx`)

- Delete the "Each Card Represents" select (line 317-319). It has no successor — there is no mode any more.
- Replace the single "Grid Settings" group with two groups, both always visible:

```js
{ label: 'Cards Grid', items: [
    { type: 'input', inputType: 'number', label: 'Cards Across', key: 'cardsGridSize' },
    { type: 'input', inputType: 'number', label: 'Gap', key: 'cardsGridGap' },
    { type: 'input', inputType: 'number', label: 'Card Padding', key: 'cardsPadding' },
    { type: ({ value, setValue }) => <ColorControls value={value} setValue={setValue} title="Card Background"/>,
      key: 'cardsBgColor' },
    { type: 'toggle', label: 'Card Border', key: 'cardBorder' },
] },
{ label: 'Cells Grid', items: [
    { type: 'input', inputType: 'number', label: 'Cells Across', key: 'cellsGridSize' },
    { type: 'input', inputType: 'number', label: 'Gap', key: 'cellsGridGap' },
    { type: 'input', inputType: 'number', label: 'Row Height', key: 'cellsRowHeight' },
    { type: 'input', inputType: 'number', label: 'Cell Padding', key: 'cellsPadding' },
    { type: 'toggle', label: 'Cell Border', key: 'cellBorder' },
] },
```

- Per-attribute controls (`Card.config.jsx:174-179, 230`): drop the `displayCdn`s based on `compactView`. Show `cellSpan`/`cellRowSpan`/`cellBgColor`/`cellPaddingBottom`/`cellBorderBelow` always.
- The two pairs of border toggles at `Card.config.jsx:337-340` collapse into the two new toggles in the grid groups (`cardBorder`, `cellBorder`).

### 5. Theme keys

Keep the existing `theme.dataCard.*` keys for now — the unified path picks the right key for each wrapper based on its new role:

- `mainWrapper` (the cards-grid container) → use `mainWrapperCompactView` (was the grid case in the old code path)
- `subWrapper` (the cells-grid container, per-card) → use `subWrapperSimpleView` (was the grid case in the old code path)

Optional follow-up task: rename keys to `cardsGridWrapper`/`cellsGridWrapper` for clarity. Not required for this task.

## Files Requiring Changes

- [x] `src/dms/packages/dms/src/ui/components/Card.migrate.js` — NEW. Pure-JS module exporting `migrateCardDisplay(display)`, `migrateCardColumn(col)`, and `migrateCardState(state)`. Reads `display.compactView` once, routes the legacy `gridSize`/`gridGap`/`padding`/`colGap`/`rowHeight`/`bgColor`/`addBorder`/`removeBorder` onto the matching new grid (`cardsGrid*` if compactView=true, `cellsGrid*` if compactView=false), defaults the unused axis to a 1-column stack, and strips every legacy display key. Per-column helper carries `cardSpan`/`cardRowSpan`/`bgColor`/`pb`/`borderBelow` to `cellSpan`/`cellRowSpan`/`cellBgColor`/`cellPaddingBottom`/`cellBorderBelow` and removes the legacy keys.
- [x] `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/migrateToV2.js` — wired `migrateCardState` as the final step when `compName === 'Card'`. Runs after the v1→v2 / v0→v2 generic migration so per-shape migrations stay independent.
- [x] `src/dms/packages/dms/src/ui/components/Card.jsx` — rewritten:
  - `Card`: destructures `cardsGridSize`/`cardsGridGap`/`cardsPadding`/`cardsBgColor`/`cellsGridSize`/`cellsGridGap`/`cellsRowHeight`/`cellsPadding`/`cardBorder`/`cellBorder` from `display`. `mainWrapperStyle` always emits `display: grid` + `gridTemplateColumns: repeat(cardsGridSize || 1, …)`. `subWrapperStyle` always emits `display: grid` + `gridTemplateColumns: repeat(cellsGridSize || cellsWithoutSpanLength || 1, …)`, plus `cardsBgColor`/`cardsPadding` on the per-card body. `cellsWithoutSpanLength` and `hasRowSpan` now read `cellSpan` / `cellRowSpan`.
  - `RenderItem`: `cardBorder` toggles `'border shadow'` on the per-card sub-wrapper. Inline `display: grid` overrides any `display: flex` still shipped via `theme.subWrapperCompactView`, so existing themes (default, avail, mny, transportny, wcdb) keep their chrome (rounded corners, bg) without code changes. All four picker placements (left/right/top/bottom) are emitted unconditionally; right/bottom only on the last cell as before.
  - `CardColumnField`: drops `compactView`/`addBorder`/`removeBorder`/`padding` props. Reads `cellBorder` + `cellsPadding` from props and `cellSpan`/`cellRowSpan`/`cellBgColor`/`cellPaddingBottom`/`cellBorderBelow` from the column attribute. Wrapper view class collapses into a single branch driven by `cellBorder` (with the edit-mode hover overlay preserved). Header/value classes drop the `*CompactView`/`*SimpleView` suffix variants — those weren't load-bearing.
- [x] `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx`:
  - Deleted the "Each Card Represents" select.
  - Replaced the single Grid Settings group with two: **Cards Grid** (`cardsGridSize`, `cardsGridGap`, `cardsPadding`, `cardsBgColor`, `cardBorder`) and **Cells Grid** (`cellsGridSize`, `cellsGridGap`, `cellsRowHeight`, `cellsPadding`, `cellBorder`). Both always visible, no `displayCdn` gating tied to mode.
  - Removed the four mode-flipping border toggles (`addBorder`/`removeBorder` × compact/cell) — replaced by the two unified toggles inside the grid groups.
  - Renamed per-attribute controls: `Border Below`→`cellBorderBelow`, `Padding Below`→`cellPaddingBottom`, `Col Span`→`cellSpan`, `Row Span`→`cellRowSpan`, attribute background color→`cellBgColor`. All show unconditionally.
  - Copy/paste payloads now use the new keys (`cellSpan`, `cellRowSpan`, `cellBgColor`). Paste also accepts the old keys (`cardSpan`/`cardRowSpan`/`bgColor`) as a fallback so cross-section paste from Spreadsheet keeps working.
- [x] `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.jsx` — updated the leading comment to describe the unified shape; no logic change (state hydration already flows through `migrateToV2`).

Build: `npm run build` passes.

## Testing Checklist

Visual regression on existing cards:

- [ ] Old `compactView=true` card with `gridSize=3`, `gridGap=12`, `padding=16`, `bgColor=#fff`, `addBorder=true` (Cell Border): renders identically post-migration. (Cards 3 across; cells stack vertically inside each card; each cell has a border.)
- [ ] Old `compactView=false` card with `gridSize=4`, `gridGap=8`, `rowHeight=80`, `addBorder=true` (Row Border), per-attribute `cardSpan=2`: renders identically. (Cards stack vertically; cells 4 across with rowHeight=80; the named attribute spans 2 cells; each card has a border.)
- [ ] Old card with no `compactView` field at all (very legacy / minimal config): renders without throwing; defaults to 1 card-grid column × auto cells-grid columns.
- [ ] Saving an old card after edit writes only new keys; legacy keys are absent from the saved blob (migration strips them at hydration).

Unified-mode authoring:

- [ ] Set `cardsGridSize=2`, `cellsGridSize=3` on a fresh card → 2 cards across, 3 cells across inside each. Both gaps respected independently.
- [ ] Toggle `cardBorder` only → border around each card frame, not around cells.
- [ ] Toggle `cellBorder` only → border around each cell, not around cards.
- [ ] `cellSpan=2` on one column with `cellsGridSize=3` → that cell spans 2 of 3 columns inside its card.
- [ ] CardColumnPicker insertion points appear in all four positions (or the chosen subset) and insert into the correct array index.

Editor:

- [ ] More menu shows two separate "Cards Grid" / "Cells Grid" groups; per-attribute Cell Span / Cell Row Span / Cell Background / Cell Padding Below controls are always available (no longer hidden by mode).
- [ ] Removing the "Each Card Represents" select doesn't break any other section's controls (it's local to Card.config.jsx).

## Open Questions

- **Key names.** `cardsGrid*` / `cellsGrid*` is one option; `outerGrid*` / `innerGrid*` reads more abstract; `cardGrid*` (singular) reads as "the card's grid" — ambiguous. Stick with the plural ("cardsGrid", "cellsGrid") = "the grid of cards" / "the grid of cells" unless reviewers prefer otherwise.
- **Migration entry point.** Migration runs at the moment a Card section's state is initialized from the saved `element-data` blob (i.e. inside `CardSection`'s state initializer, before the renderer ever sees the data). That's also where any state hydrated from the server during navigation should be funneled, so a legacy blob from an older deploy still gets normalized on load. The renderer itself never reads `compactView` or any of the old keys — if migration didn't run for some reason, the card renders with all-default grid settings, not in legacy mode.
- **Theme key rename.** Whether to rename `mainWrapperCompactView` → `cardsGridWrapper` etc. Out of scope by default, but trivial cleanup if reviewers prefer doing it together.
- **Default `cellsGridSize` when unset.** Today, `gridSize || cardsWithoutSpanLength` falls back to "as many columns as there are cells". For migrated old cards in cell mode, this preserves their look. For migrated old cards in row mode (which we set `cellsGridSize=1`), it doesn't matter. For *new* cards, do we keep that fallback or default to 1? Probably keep the fallback (more useful default) — confirm during implementation.
- **`CardColumnPicker` placements.** Today picker rendering depends on `compactView` (top/bottom in compact, left/right in cell). With both grids real, all four placements are technically valid. Probably ship all four; if it gets noisy, consider a small toggle in the editor.
