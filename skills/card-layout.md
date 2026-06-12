# Card section layout

How the `Card` page-section component lays itself out and how every knob in `state.columns[*]` and `state.display` affects the rendered grid. Read this before configuring a non-trivial card (anything beyond "drop columns in, accept defaults"), and especially before swapping in a new column type.

Worked end-to-end on real WCDB sections; references real file paths so you can verify each claim:

- Renderer: `src/dms/packages/dms/src/ui/components/Card.jsx`
- Theme: `src/dms/packages/dms/src/ui/components/card.theme.jsx`
- Section adapter: `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.jsx`
- Config / controls / defaults: `…/ComponentRegistry/Card.config.jsx`
- Legacy migration: `…/ui/components/Card.migrate.js`

## Two grids, both real

A Card always renders **two CSS grids**, one nested in the other:

```
mainWrapperStyle  ← outer "cards grid" (records spread across the section)
  └─ subWrapperStyle  ← inner "cells grid" (attribute cells inside one record)
       └─ CardColumnField  ← one cell per visible column
```

Both axes are unconditional grids — there is no "row mode" vs "cell mode" toggle anymore. The renderer pulls four grid dimensions from `state.display`:

| Outer (cards grid)  | Inner (cells grid)  |
|---------------------|---------------------|
| `cardsGridSize`     | `cellsGridSize`     |
| `cardsGridGap`      | `cellsGridGap`      |
| `cardsPadding`      | `cellsPadding`      |
| `cardsBgColor`      | `cellsRowHeight`    |
| `cardBorder` (bool) | `cellBorder` (bool) |

`Card.jsx` builds them like this:

```js
// outer
gridTemplateColumns: `repeat(${cardsGridSize || 1}, minmax(0, 1fr))`
gap:                 cardsGridGap

// inner
gridTemplateColumns: `repeat(${cellsGridSize || cellsWithoutSpanLength || 1}, minmax(0, 1fr))`
gap:                 cellsGridGap
gridAutoRows:        cellsRowHeight ? `${cellsRowHeight}px` : (anyRowSpan ? 'minmax(0, auto)' : default)
padding:             cardsPadding
backgroundColor:     cardsBgColor
```

Two things to internalize from those lines:

1. **`cardsPadding` and `cardsBgColor` are applied to the *inner* (cells) wrapper**, not the outer. That's because each *record-card* needs the surface; the *cards grid* itself is just spacing between records.
2. **`cellsGridSize` falls back to "the number of visible columns without an explicit `cellSpan`"**, then `1` if even that is zero. So a card with three plain columns laid out side-by-side needs no `cellsGridSize`; it auto-fits. The moment you pin any column's `cellSpan`, the auto-fit count drops that column out of the divisor — so you usually want to set `cellsGridSize` explicitly once you start using spans.

Default behaviour with no display config: outer is a 1-column stack of records, inner auto-fits to N visible columns. That matches the legacy "cell mode" look.

### Card chrome (where padding, radius, and surface live)

The card surface itself comes from the theme, not from `display`:

- `theme.dataCard.styles[0].subWrapper` — outer per-card wrapper class
- `theme.dataCard.styles[0].subWrapperCompactView` — adds rounded corners and `var(--card-bg)` background by default

If your `display.cardsBgColor` is unset, the theme's `subWrapperCompactView` background shows through. If you set `cardsBgColor`, that wins (it's an inline `backgroundColor`).

Per-card border: `display.cardBorder` toggles `theme.dataCard.cardBorder` (default `border shadow`). Per-cell border: `display.cellBorder` toggles `theme.dataCard.itemBorder`. Both are off by default in the WCDB theme.

## Per-column layout (`state.columns[i]`)

Each column entry in `state.columns` is the source of truth for one cell. The renderer reads these keys (`Card.jsx` ~340–425):

### Visibility

| Key            | Effect |
|----------------|--------|
| `show: true`   | Required for the cell to render *and* for the field to be SELECTed by the data loader. `show: false` removes the cell **and** drops the column from the query (`buildUdaConfig.js`, `getData.js`). |
| `hideHeader`   | Suppresses the label line. The wrapper still occupies a grid slot. |
| `hideValue`    | Suppresses the value block (and the `CompWrapper` that would otherwise render the column-type's `ViewComp`). The wrapper still occupies a grid slot. |
| `hideIfNull`   | (display-level, not per-column) — hide the entire card when query returns no rows. |

**Crucial subtlety: `hideHeader + hideValue` ≠ "column doesn't render".** The cell's outer `<div>` still renders, still consumes one grid slot, still has padding and border. Cells you only want loaded for the data fetch (so a composite column type can read them off the row) should keep `show: true` to stay in the query, but you need to *also* think about the grid slots they occupy. Two options:

1. Put them on a 1-column grid (`cellsGridSize: 1`) where the composite cell is the first row and the hidden loaders stack invisibly below. Their wrappers add only a couple of pixels each if `cellsPadding: 0` and the borders are transparent.
2. Set the loaders' `cellSpan: 0` — **don't**, the spec doesn't accept zero, you'll get `span 0` which CSS quietly treats as `1`.

The cleanest pattern is option 1 plus `theme.headerValueWrapperFullBleed` on the composite cell (see `cardHints.fullBleed` below) so the composite cell pulls flush to the card edges and the empty wrappers below contribute only their padding.

### Sizing — `cellSpan` and `cellRowSpan`

| Key            | What it does                                                     |
|----------------|------------------------------------------------------------------|
| `cellSpan`     | `gridColumn: span <n>` on this cell. Default 1.                  |
| `cellRowSpan`  | `gridRow: span <n>` on this cell. Default no row span.           |

These are pure CSS-grid spans. They are **scoped to `cellsGridSize`**: `cellSpan: 4` on a `cellsGridSize: 3` grid means "span 4 tracks", which CSS clamps. Always plan: how many tracks across, which cell takes how many tracks. Sketch it before you save.

Two gotchas:

- `cellRowSpan` requires the grid to be *row-implicit*, which the renderer sets up only when any visible column has `cellRowSpan > 1` (it switches `gridAutoRows: 'minmax(0, auto)'` on). If you also set `cellsRowHeight`, that wins (fixed pixel rows).
- When `cellsGridSize` is unset, the divisor is "visible columns without `cellSpan`". The moment one column has a span, the rest get a smaller share. Don't mix spanned and non-spanned columns without setting `cellsGridSize` explicitly.

### Sizing tracks (fluid / content / fixed)

By default every track of the cells grid is `minmax(0, 1fr)` — the row divides evenly. For layouts where one cell needs to be a fixed pixel size (an album thumbnail, an action button) while the rest absorb the remaining width, you have two knobs:

#### Per-column — `cellWidth`

A column-level "what should this column's track be sized like?" knob. Values are passed straight through to `grid-template-columns`:

| `cellWidth`            | Track size                                              |
|------------------------|---------------------------------------------------------|
| `'' (unset)` / `'fluid'` | `minmax(0, 1fr)` — divide remaining space equally       |
| `'auto'`               | Track shrinks to the cell's natural content width       |
| `'64px'` (or `'4rem'`, `'min(64px, 10vw)'`, …) | Literal CSS size — track is exactly that wide |

The renderer walks visible columns in order with a track cursor that mirrors sparse auto-flow. **The first column to land on a given track wins its sizing.** Subsequent columns landing on the same track (later rows under the same column index) inherit the established size. If you want a different track size, reorder the columns so the column with your preferred `cellWidth` lands on that track first.

**Cell-width semantics with `cellSpan > 1`:** `cellWidth` is the *cell's* width, not just its first track's. When a column with `cellWidth` set also has `cellSpan: N`, the walker collapses the additional `N - 1` spanned tracks to `0px` (when they're still unclaimed) so the spanned tracks themselves contribute nothing to the cell's width.

**Important gap caveat: CSS Grid includes `cellsGridGap` *inside* a span.** A cell spanning 3 tracks with `cellsGridGap: 8` always includes 2 × 8 = 16px of gap inside it, even if the extra tracks are 0px. So `cellWidth: '96px'` + `cellSpan: 3` + `cellsGridGap: 8` produces a 112px-wide cell, not 96. There's no per-cell escape from this in CSS Grid.

**The right shape for a fixed-width cell**: use `cellSpan: 1` and reach for `cellRowSpan` when you want it to extend vertically. If you also want the cell to occupy "more layout area" (so other cells flow around it), shrink `cellsGridSize` to the number of *real* columns in your layout rather than spanning across a finer grid. Save `cellSpan > 1` for fluid cells where the spanned-track-gap-inclusion is fine.

Worked example — fixed album art on the left, fluid text, fixed play button on the right:

```js
display: { cellsGridSize: 12, cellsGridGap: 8 }
columns: [
  { name: 'album_cover', type: 'image', imageSize: 'imgXS',
    cellSpan: 3, cellRowSpan: 3, cellWidth: '64px',  show: true, hideHeader: true },
  { name: 'title',  type: 'text', valueFontStyle: 'text2XL',
    cellSpan: 7,                                       show: true, hideHeader: true },
  { name: 'play',   type: 'stream_player',
    cellSpan: 2, cellWidth: '52px',                    show: true, hideHeader: true },
  { name: 'artist_name', type: 'text', valueFontStyle: 'textSMReg',
    cellSpan: 7,                                       show: true, hideHeader: true },
  { name: 'album',  type: 'text', valueFontStyle: 'textSMReg',
    cellSpan: 7,                                       show: true, hideHeader: true },
]
```

Resulting `grid-template-columns`: `64px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 52px minmax(0, 1fr)`.

The walker is **row-span-naïve** — it doesn't track which tracks are still occupied by an earlier `cellRowSpan > 1` cell. That doesn't matter for *sizing* (CSS Grid handles placement correctly regardless); the only effect is which column gets credited with claiming a track first. The "first wins" rule still produces sensible outputs in practice.

#### Section-level — `cellsTracksTemplate`

Power-user escape hatch under the **Cells Grid → Track Template** input. A freeform `grid-template-columns` string. When set, it wins over the per-column derivation:

```js
display: { cellsTracksTemplate: '64px repeat(10, minmax(0, 1fr)) 52px' }
```

Author types CSS, the renderer substitutes verbatim. Useful for asymmetric or `subgrid` cases the per-column knob can't express. Default-empty so existing sections stay on the derived path.

### Per-cell visual overrides

| Key                  | What it does                                                              |
|----------------------|---------------------------------------------------------------------------|
| `cellBgColor`        | Inline `backgroundColor` on the cell wrapper.                             |
| `cellPadding`        | Inline `padding` on the cell wrapper. Overrides section-level `cellsPadding` for this cell on all four sides. |
| `cellPaddingTop`     | Inline `paddingTop`. Wins over `cellPadding` (and `cellsPadding`).        |
| `cellPaddingRight`   | Inline `paddingRight`. Wins over `cellPadding`.                           |
| `cellPaddingBottom`  | Inline `paddingBottom`. Wins over `cellPadding`.                          |
| `cellPaddingLeft`    | Inline `paddingLeft`. Wins over `cellPadding`.                            |
| `cellBorderBelow`    | Adds `theme.headerValueWrapperBorderBelow` (default `border-b rounded-none`). |

The padding precedence is **side-specific > `cellPadding` > `cellsPadding`** — type a side value to override one edge, type `cellPadding` to override all four at once, type neither to inherit the section's `cellsPadding`. An empty/cleared field falls through (it does *not* mean "0"); to apply zero padding, type `0` explicitly.
| `justify`            | `'left' | 'right' | 'center' | 'full'`. Maps to `theme.justifyText*` classes. `'full'` splits header to left, value to right. |
| `headerFontStyle`    | Class lookup into `theme.textSettings.styles[0]`. Any key there is legal (`textXS`, `textMD`, `text3XL`, `h1`–`h6`, `body`, `caption`, …). |
| `valueFontStyle`     | Same lookup, for the value. Defaults to `textXS` if unset. |
| `headerValueLayout`  | (display-level, applies to all cells) `'row'` (default) or `'col'`. `row` = header inline left of value; `col` = stacked. |
| `reverse`            | (display-level) When `headerValueLayout: 'col'`, swap order so value sits above header. |
| `headerWidth`        | (display-level) Percentage of cell width used by header in `row` layout. Default 50. |
| `valueWidth`         | (display-level) Percentage for value in `row` layout. Default 50. |

### Image columns

`isImg: true` on a column triggers the renderer's "render an `<img>` here" branch (`Card.jsx` ~360). Keys consumed:

| Key             | Effect |
|-----------------|--------|
| `imageSize`     | Class lookup into `theme.imgXS`/`imgSM`/`imgMD`/`imgXL`/`img2XL`…`img8XL`/`imgDefault`. Each is a `max-w-<N> max-h-<N>` Tailwind class — they cap dimensions; the image is `<img>`-default-sized otherwise. **None of these set border-radius or object-fit**; if you want a rounded thumb, override the theme key or wrap the cell with a column type. |
| `imageLocation` | URL prefix. Final src = `${imageLocation}/${rawValue}${imageExtension ? '.' + imageExtension : ''}`. |
| `imageSrc`      | Static URL fallback when row has no value. |
| `imageExtension`| File extension appended when `imageLocation` is set. |
| `imageMargin`   | Pixel margin applied as `marginTop` on the cell. Also bubbles up to the cards-grid's `paddingTop` (so multiple image cells in different cards still align). |

### Link columns

`isLink: true` wraps the cell in a `<Link>` (internal) or `<a target="_blank">` (external if `isLinkExternal`). Keys:

| Key               | Effect |
|-------------------|--------|
| `linkText`        | Static text to show instead of the row value. |
| `location`        | Base URL. Final href = `${location || valueFormattedForDisplay}${searchParams}`. |
| `searchParams`    | `'id'`, `'value'`, `'rawValue'`, or unset. Encodes the row's id or this column's value into the URL. |
| `isLinkExternal`  | Use a plain `<a target="_blank" rel="noopener noreferrer">` instead of React Router's `Link`. |

### Format functions

`formatFn` transforms the displayed value at render time (`Card.jsx` ~367–373, format implementations in `dataWrapper/utils/utils.js`):

| `formatFn`            | Renders                       |
|-----------------------|-------------------------------|
| `comma`               | `1,234,567`                   |
| `comma_dollar`        | `$1,234,567`                  |
| `percent`             | appends `%` (`79.8` → `79.8%`); does not multiply — value is already a percentage |
| `abbreviate`          | `1.2M`, `3.4K`                |
| `abbreviate_dollar`   | `$1.2M`                       |
| `date`                | `MM/DD/YYYY` (locale-ish)     |
| `time`                | `HH:MM am/pm`                 |
| `datetime`            | `MM/DD/YYYY HH:MM am/pm`      |
| `title`               | Title Case (also adds `capitalize` class) |
| `icon`                | Renders an `<Icon>` from the value. Pairs with `iconAndColorValues` theme class. |
| `color`               | Renders a colored swatch. |
| `combine`             | Renders `<value><separator><row[combineWith]>` — two row fields on one editorial line. Reads `combineWith` (sibling column name) + `combineSeparator` (default `' — '`) off the column attr. The sibling column must be `show: true` somewhere on the card so the data loader fetches it; the sibling cell itself is usually `hideHeader: true, hideValue: true, cellSpan: <full grid>` (a hidden loader). |

`icon`, `color`, and `combine` are special-cased: in view mode the renderer returns the formatted result directly without going through `CompWrapper`. `combine`'s signature is `(value, row, attr)` rather than the standard `(value, isDollar)` — it needs the row to resolve the sibling field. It also skips the trailing `.replaceAll(' ', '')` the numeric formatters use, so separator whitespace is preserved.

### Edit & data flow

| Key                    | What it does |
|------------------------|---|
| `allowEditInView`      | Inline-edit this cell in view mode. |
| `staticValue`          | When `origin: 'static'`, the column has no row data — this is the cell's value. |
| `usePageParams`        | The cell's value comes from page state (`pageParamKey`) rather than the row. |
| `blankDefault`         | Synthetic value used when `display.useBlankRowFallback` is on and the query returns 0 rows. |
| `wrapText`             | Allow long values to wrap inside the cell (otherwise truncates with `truncate`). |

## Column-type-level layout — `cardHints`

A column type (in `ColumnTypes[<name>]`, registered via `theme.columnTypes.<name>` or built-in) may declare `cardHints` that change how the cell is *wrapped*. Read by `Card.jsx` ~351:

```js
const hints = ColumnTypes[attr?.type]?.cardHints || {};
const fullBleed = !!hints.fullBleed;
```

Hints currently honoured:

| Hint               | Effect on the cell wrapper |
|--------------------|---|
| `fullBleed: true`  | The cell uses `theme.headerValueWrapperFullBleed` (default `w-full relative overflow-hidden`) instead of the normal wrapper. **No padding, no border, no rounded chrome.** The column type's view owns the visual surface end-to-end. |
| `spanFullColumns: true` | Sets `gridColumn: '1 / -1'` *when the column doesn't have an explicit `cellSpan`*. Lets the column type default to "fill the whole row" without forcing every author to set the span. An author-supplied `cellSpan` still wins. |
| `spanFullRows: true`    | Same idea for `gridRow: '1 / -1'`. |
| `height: <number>`      | Forces `height: <n>px` on the wrapper. |
| `defaultHideHeader: true`| Suggestion only — the picker UI uses this when the column is freshly added so it ships with `hideHeader: true`. The renderer ignores it; the column's own `hideHeader` still drives runtime behaviour. |

`portrait_banner` ships `fullBleed: true, spanFullColumns: true, defaultHideHeader: true`. `stream_player` ships the same shape. Both are templates for "I am a composite column type that owns its layout."

## KPI/dashboard column types (built-in, value-driven)

Three built-in column types render a value as a styled, **value-driven** widget (the
"look depends on the value" rung — see `transcribing-a-design-card-to-dms.md`). Each
reads only its own `value` and is configured via column attributes:

| `type`        | Renders | Key attributes |
|---------------|---------|----------------|
| `status_pill` | the value as a colored `UI.Pill` (good/bad/warn/na) | `pillColors` (map `value → pill style`); else keyword heuristics (meets/above → good, below/miss/fail → bad). Themeable via `theme.pill`. |
| `delta`       | signed arrow + value, colored, + "vs <year-1>" suffix | `deltaGoodDirection` (`up`\|`down` — which sign is green), `deltaYearField` (row col with the period year → "vs Y-1"), `deltaSuffix` (static). Theme key `delta`. |
| `target_bar`  | progress bar + target marker + "≥/≤ target" caption | `targetValue` (or `targetColumn`), `barMin`/`barMax` (range scale — ratio metrics like TTTR use `1.0`/`2.2`), `barDirection`, `barUnit`. Theme key `targetBar`. |
| `stat_value`  | KPI figure with inline prefix + smaller muted unit on one baseline ("$6.2 billion", "310.9 M veh-hrs", "80 %") | `prefix` (figure-size, e.g. `$`), `unit` (suffix), `valueFontStyle` (figure token, e.g. `statXL`), `unitFontStyle` (unit token; defaults to theme `statValue.unit`, ~40% size muted). Use this instead of jamming the unit into the column header/label. |

Worked example — the MAP-21 §01 KPI cards (live: sections 2173919–22 on page 2173915):
a `status_pill` (from a `status_text` CASE column), the metric value (`formatFn: 'percent'`),
a `target_bar` (value = the metric, static `targetValue`), a `delta` (a **calculated**
column `round(metric − prior, N)` — *not* a formula column, which is type-gated), and a
margin caption (calculated `… || ' pts above/below target'`). Two traps that blank the
card: retyping a **formula** column to `delta` (its UUID `name` becomes invalid SQL), and
`origin:'static'` columns ("Error getting length") — use SQL-literal calculated columns and
**clone a working column** for the field shape.

## Data-only columns: `selectOnly` (the phantom-cell gotcha)

**A `show:true` column ALWAYS occupies a grid cell — `hideHeader`+`hideValue`
hide its content, not its slot.** In a `cellsGridSize: 1` stack that's invisible;
in any multi-column cell grid the empty cell shifts every later cell (a hidden
`year` GROUP BY column in a 2-col KPI card pushes the label to column 2, the
as-of chip to the next row, and so on — this broke the TSMO-home hero).

Set **`selectOnly: true`** on columns that exist only for the query (GROUP BY
keys, sort drivers, fields a column type reads off `row`): the column stays in
the SELECT (keep `show: true` — dropping `show` changes the GROUP BY, see the
aggregate gotcha) but renders no cell. Toolbar: "Select Only (no cell)".

Related per-cell chrome: `cellBorderBelow: true` draws the theme hairline under
a cell (`theme.headerValueWrapperBorderBelow`) — the design-system divider
between a KPI's note and its substat row.

Two more multi-column traps from the same build: (1) **`valueFontStyle` /
`headerFontStyle` resolve against the CARD theme** (`theme.dataCard.styles[]`),
NOT `textSettings` — a token that exists only in textSettings silently falls
back to the default cell style. Keep the dataCard font map in parity with
textSettings (the transportny themev2 marks the parity block with a comment),
AND give the dataCard copies `!` importance on their size/color classes
(`text-[12px]!`): the value div also carries `theme.value`'s baseline
`text-[14px] text-[#0F1722]`, and Tailwind's order for arbitrary values is
non-deterministic — without `!` the token loses the specificity race on some
builds (verified: a `metaAccent` cell computing 14px instead of 12px). Stat
tokens should also carry `pb-0!` to cancel `theme.value`'s baked-in `pb-3`
under the figure.
(2) **`cellWidth: 'max-content'` + spanning cells steal width**: a `cellSpan: 2`
figure distributes its width into a max-content track and starves the 1fr
column. For a right-side chip/badge column, use a fixed track instead
(`cellWidth: '110px'`).

## What a column type receives

A column type's `ViewComp` receives (`CompWrapper` in `Card.jsx` ~318):

```jsx
<Comp value={...} {...attribute} row={row} options={...} meta={...} … />
```

- `value` — the column's own field value (`row[attribute.name]`).
- `...attribute` — every key on the column metadata.
- `row` — the full row record. Available for column types that legitimately need a sibling field (e.g., a "rating" badge that branches on a numeric `score` and a string `category`).

**`row` is not an invitation to render everything from one cell.** If you find yourself reading more than one or two fields off `row`, that's a smell that the composite belongs as separate Card cells. See the "When NOT to configure further" section above.

## Edit-mode controls

`display.allowEditInView` and `liveEdit` toggle inline editing. `allowAdddNew` adds a synthetic "new row" entry at the end of `data` and renders an `add` button.

`display.useBlankRowFallback` is opt-in. When **on** and the query returns 0 rows, `getData.js` synthesizes a single row with each column's `blankDefault`. Sections that didn't opt in stay at `length: 0, data: []`. Useful when a card is the *only* thing on the page and you want it to render scaffolding even when empty.

## Defaults that bite

- `cellsGridSize` is `undefined` → fallback `visibleColumnsWithoutSpan || 1`. Don't mix spans and unset `cellsGridSize`; the divisor lies.
- `cardsGridSize` is `undefined` → 1 (records stacked vertically).
- `cellsPadding` defaults to undefined → cells have no inner padding (just the cell-border buffer, see below).
- Every cell renders `border border-transparent` when not hovered and not in `cellBorder` mode (`Card.jsx` ~404) — a transparent 1px outline that keeps layout stable when the visible border is toggled on/off in edit mode. **This adds 2px to every cell's bounding box.** Don't expect `cellsPadding: 0` to give you a flush layout if the cell content is short — there's always at least a couple of pixels of buffer.
- `headerValueLayout: 'row'` is the default — header sits *inline left of* value. For a composite cell with `hideHeader: true`, this still affects width calculation (`headerWidth: 50` reserves 50% of cell width even for the hidden header). Set `headerValueLayout: 'col'` on the section when cells are hidden-header or composite.

## Legacy state — what migration handles

`Card.migrate.js` runs on hydration (called from `migrateToV2`). It auto-translates:

- `display.compactView` (boolean) + `gridSize/gridGap/padding/colGap/rowHeight/bgColor/addBorder/removeBorder` → the new pairs of cards/cells keys.
- Per-column `cardSpan/cardRowSpan/bgColor/pb/borderBelow` → `cellSpan/cellRowSpan/cellBgColor/cellPaddingBottom/cellBorderBelow`.

If you're writing a card config by hand (e.g., via the CLI), **use the new keys**. The migration is one-way and runs once.

## Recipes

### "Now-playing" card on a 12-col grid (data cells + slim chrome column)

The WCDB stream-player section. Real Card cells render the data fields (album cover, title, artist, album). One narrow column type (`stream_player`) renders the play button. The grid does the layout.

```js
columns: [
  // Album art on the left, spanning the height of the text stack.
  { name: 'album_cover', type: 'image', isImg: true, imageSize: 'imgXS',
    show: true, hideHeader: true, cellSpan: 3, cellRowSpan: 3 },

  // Text stack in the middle. Three text cells stack on rows 1-3 of cols 4-10.
  { name: 'title',       type: 'text', show: true, hideHeader: true,
    valueFontStyle: 'text2XL',   cellSpan: 7 },
  // The play button column slots in next so it lands at row 1 cols 11-12,
  // not below the text stack. Order matters under sparse auto-flow.
  { name: 'play',        type: 'stream_player', show: true, hideHeader: true,
    cellSpan: 2, origin: 'static', staticValue: '' },
  { name: 'artist_name', type: 'text', show: true, hideHeader: true,
    valueFontStyle: 'textSMReg', cellSpan: 7 },
  { name: 'album',       type: 'text', show: true, hideHeader: true,
    valueFontStyle: 'textSMReg', cellSpan: 7 },

  // The one genuine loader: sort-only.
  { name: 'timestamp_utc', type: 'TEXT', show: true, hideHeader: true,
    hideValue: true, cellSpan: 12, sort: 'desc nulls last' },
],
display: {
  cellsGridSize: 12, cellsGridGap: 8, cellsPadding: 4,
  cardsGridSize: 1,  cardsGridGap: 0,
  headerValueLayout: 'col',
  pageSize: 1, usePagination: false,
}
```

Visual layout under sparse auto-flow:

```
Row 1: [album_cover (1-3)] [title (4-10)]       [stream_player (11-12)]
Row 2: [album_cover cont.] [artist_name (4-10)]
Row 3: [album_cover cont.] [album (4-10)]
```

The `stream_player` column type renders a 52×52 ▶ button and nothing else (see `src/themes/wcdb/columnTypes/streamPlayer.jsx`). It declares `cardHints.defaultHideHeader: true` so the picker ships new instances with the header hidden. No `fullBleed`, no `spanFullColumns` — it's a normal Card cell that happens to render a button.

### Two fields on one editorial line (`formatFn: 'combine'`)

WCDB now-playing card: `<song> — <artist>` on one line, `<album>` on the next. Three fields, two visible rows.

```js
columns: [
  { name: 'album_cover', type: 'image', isImg: true, imageSize: 'imgSM',
    show: true, hideHeader: true, cellSpan: 1, cellRowSpan: 2, cellWidth: '96px' },

  // The visible cell. `combine` reads `artist_name` off the row and joins with
  // the separator to render "Eternal Life — Jeff Buckley".
  { name: 'title', type: 'text', show: true, hideHeader: true,
    valueFontStyle: 'text2XL', cellSpan: 7,
    formatFn: 'combine', combineWith: 'artist_name', combineSeparator: ' — ' },

  { name: 'play', type: 'stream_player', show: true, hideHeader: true,
    cellSpan: 1, cellRowSpan: 2, cellWidth: '52px', origin: 'static', staticValue: '' },

  { name: 'album', type: 'text', show: true, hideHeader: true,
    valueFontStyle: 'textSMReg', cellSpan: 7 },

  // Hidden loader for `artist_name` — kept `show: true` so the query SELECTs
  // it, hidden via `hideHeader + hideValue`, and pushed to its own row with
  // `cellSpan: <full grid>` so it doesn't grab a visible slot.
  { name: 'artist_name', type: 'text', show: true,
    hideHeader: true, hideValue: true, cellSpan: 9 },
],
display: { cellsGridSize: 9, cellsGridGap: 8, cellsPadding: 4 }
```

Visual layout:

```
Row 1: [album_cover] [title combined with artist (7 cols)] [play]
Row 2: [album_cover] [album (7 cols)]                       [play]
Row 3: (hidden artist_name loader, full 9 cols)
```

The order of columns matters: `artist_name` sits AFTER `album` so sparse auto-flow doesn't pull it into row 2's text slot. Reorder if you change the visible rows.

### Standard 3-up record cards with image header

```js
display: {
  cardsGridSize: 3, cardsGridGap: 20, cardsPadding: 0,
  cellsGridSize: 1, cellsGridGap: 0,
  cardBorder: true, cellBorder: false,
  pageSize: 9, usePagination: true,
}
columns: [
  { name: 'avatar',     type: 'portrait_banner', show: true, hideHeader: true, cellSpan: 1, bannerHeight: 'small' },
  { name: 'name',       type: 'text', show: true, hideHeader: true, valueFontStyle: 'text2XL', cellSpan: 1 },
  { name: 'genre_main', type: 'text', show: true, hideHeader: true, valueFontStyle: 'textSMReg', cellSpan: 1 },
  { name: 'start_date', type: 'text', show: true, hideHeader: true, valueFontStyle: 'caption', cellSpan: 1 },
]
```

The outer grid puts records in a 3-column row; each card stacks its cells vertically. The portrait banner's `cardHints` opt it out of the field chrome so it bleeds to the card edges.

### Stat strip — 4 metrics in one card

```js
display: {
  cardsGridSize: 1, cardsGridGap: 0, cardsPadding: 24,
  cellsGridSize: 4, cellsGridGap: 16,
}
columns: [
  { name: 'listeners', type: 'number', show: true, valueFontStyle: 'text5XL', headerFontStyle: 'caption', cellSpan: 1 },
  { name: 'spins',     type: 'number', show: true, valueFontStyle: 'text5XL', headerFontStyle: 'caption', cellSpan: 1 },
  { name: 'years',     type: 'number', show: true, valueFontStyle: 'text5XL', headerFontStyle: 'caption', cellSpan: 1 },
  { name: 'djs',       type: 'number', show: true, valueFontStyle: 'text5XL', headerFontStyle: 'caption', cellSpan: 1 },
]
```

One outer card, four inner cells equally split. `cardsPadding: 24` gives the card its breathing room since there's no per-cell padding.

### Mixed-span info card (title spans, meta cells don't)

```js
display: {
  cellsGridSize: 3, cellsGridGap: 0, cellsPadding: 12,
}
columns: [
  { name: 'title',  show: true, hideHeader: true, valueFontStyle: 'text3XL', cellSpan: 3 },  // full row
  { name: 'when',   show: true,                    valueFontStyle: 'caption', cellSpan: 1 },  // third
  { name: 'where',  show: true,                    valueFontStyle: 'caption', cellSpan: 1 },  // third
  { name: 'who',    show: true,                    valueFontStyle: 'caption', cellSpan: 1 },  // third
]
```

The title sits on its own row (`cellSpan: 3` = full row at `cellsGridSize: 3`); the three meta cells share the next row.

## When NOT to configure further

The Card grid + column types are the primary authoring surface. Authors with admin access should be able to express most layouts through this surface — that's the [author-empowerment principle](../../../CLAUDE.md). Reach for a custom component sparingly.

Before writing a custom column type, walk this checklist:

1. **Can the design be expressed as a row of Card cells, each binding to a real field?** A 12-col `cellsGridSize` with `cellSpan` + `cellRowSpan` per column can express most "image + text stack + button" layouts. Don't put the whole composite into one cell.
2. **Is the piece you need a custom column type really just chrome (no data field behind it)?** A play button, a "Listen Live" pill, a small status indicator that doesn't bind to a column — those are good column types. Each should render **one** thing.
3. **If the Card grid can't express your layout, is that because a primitive is missing?** If yes, add the primitive to the Card (a new `formatFn`, a `gridAutoFlow` setting, an image-cell alignment knob) instead of bypassing the grid. Document the new knob here and in `Card.config.jsx`'s controls so it shows up in the section toolbar.

A **whole-design-in-one-column-type** is the wrong move. It recreates what the Card already does, badly, in a place authors can't reach. Symptoms:

- You added hidden "loader" columns (`show:true, hideHeader:true, hideValue:true`) just to get sibling fields onto the row.
- You set `cellsGridSize: 1` because the column owns the whole row anyway.
- You used `cardHints.fullBleed + spanFullColumns` to suppress the cell chrome because your component re-renders all of it.

Each of those is a signal you've absorbed Card responsibility into the column type. Split it back out: one cell per field, one narrow column type for each non-data piece.

A new section type in `ComponentRegistry/` is justified only when the rendering is genuinely off-Card (a map, a graph, a PDF export). See [creating-page-section-components.md](./creating-page-section-components.md).

## Quick-reference: what each key does at a glance

```
display.cardsGridSize      → outer columns of records
display.cardsGridGap       → outer gap
display.cardsPadding       → padding *inside the per-card surface*
display.cardsBgColor       → per-card background (overrides theme)
display.cardBorder         → toggle theme.cardBorder
display.cellsGridSize      → inner columns of cells inside one card
display.cellsGridGap       → inner gap
display.cellsRowHeight     → fixed pixel row height for cells
display.cellsPadding       → padding on each cell wrapper
display.cellBorder         → toggle theme.itemBorder on each cell
display.cellsTracksTemplate → raw grid-template-columns string (wins over per-column cellWidth)

display.headerValueLayout = 'row'|'col'  → header beside or above value
display.reverse           → swap header/value order in 'col' mode
display.headerWidth/valueWidth → row-layout split percentages

columns[i].show          → render *and* SELECT
columns[i].hideHeader    → suppress label
columns[i].hideValue     → suppress value (and CompWrapper)
columns[i].cellSpan      → CSS grid-column span
columns[i].cellRowSpan   → CSS grid-row span
columns[i].cellWidth     → '' (fluid) | 'auto' | '<N>px' / etc — track size at this column's starting position
columns[i].cellBgColor   → cell background
columns[i].cellBorderBelow → bottom border on cell
columns[i].cellPadding   → override all sides (beats ambient cellsPadding)
columns[i].cellPaddingTop / cellPaddingRight / cellPaddingBottom / cellPaddingLeft → per-side override (beats cellPadding)
columns[i].justify       → 'left'|'right'|'center'|'full'
columns[i].headerFontStyle / valueFontStyle → textSettings key
columns[i].formatFn      → comma/date/time/title/icon/color/combine/…
columns[i].combineWith / combineSeparator → for `formatFn: 'combine'`, the sibling row field and join string
columns[i].isImg + imageSize/imageLocation/imageExtension/imageSrc/imageMargin → image cell
columns[i].isLink + isLinkExternal/linkText/location/searchParams → link cell
columns[i].allowEditInView → inline-edit this cell
columns[i].wrapText      → allow wrapping (default truncates)

ColumnTypes[type].cardHints.fullBleed       → bare wrapper, no chrome
ColumnTypes[type].cardHints.spanFullColumns → default gridColumn '1 / -1'
ColumnTypes[type].cardHints.spanFullRows    → default gridRow '1 / -1'
ColumnTypes[type].cardHints.height          → fixed pixel height
ColumnTypes[type].cardHints.defaultHideHeader → picker ships column with hideHeader on
```

## Interior padding belongs on the card SETTING, not the theme style

`display.cardsPadding` (the "Card Padding" control) is applied as an inline `padding`
on the card box (`Card.jsx` subWrapperStyle) and therefore **overrides** any `p-*`
baked into the dataCard theme style's `subWrapperCompactView` className. Keep theme
styles for *visual identity only* (bg / border / radius) and set interior padding via
`cardsPadding`, so a card's content inset is consistent regardless of which style it
uses. Symptom this fixes: cards on the same row whose pills/first cell sit at different
heights because one style bakes in `p-5` and another doesn't (MAP-21 §01: the slate
"UZA measure" PHED card vs the white target cards — set `cardsPadding: 20` on all four
to align them while the PHED card keeps its slate/dashed style).

## Component height: `auto` = content, `fill` = section (content top-aligned)

Design intent (mirrors the design handoff's `… p-5 flex flex-col gap-3 h-full` cards):
a card with `height: auto` is its content height; with the section set to `height:'fill'`
it fills the section and **top-aligns** its content (pill/first cell flush at top, slack
at the bottom).

IMPLEMENTED 2026-06-03 — the fill chain (each link gated to `fill` or CSS-conditional so
`auto` is byte-identical):
- `sectionArray.jsx` `resolveHeight`: `fill` → `h-full flex flex-col` (chrome box is a flex
  column so its child can `flex-1` up to the section height).
- `section.jsx` `resolveSectionHeightStyles` `fill`: `contentWrapperStyle` is now a flex
  column (`display:flex; flexDirection:column`) so the data component can fill it.
- `dataWrapper/index.jsx`: the Comp's wrapper (both edit + view blocks) is `w-full h-full
  flex flex-col` (was `w-full` / `w-full h-full` block), so the component fills.
- `Card.jsx` `mainWrapperStyle`: `flex:'1 1 auto'; minHeight:0; gridAutoRows:'minmax(max-content,1fr)'`.
  In a flex-column parent (fill) it grows and the card row stretches; in an `auto` parent
  the flex is ignored and `1fr`→`max-content` = the legacy auto row (BC).
Verified: PHED §01 card (`height:'fill'`) box 227px→364px (fills); auto KPI cards, graphs,
spreadsheets, and the §02 header cards all unchanged. Other data components (Spreadsheet,
Graph) now also fill when their section is `fill` (they were content-height before).
