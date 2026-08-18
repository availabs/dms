# Card section layout

How the `Card` page-section component lays itself out and how every knob in `state.columns[*]` and `state.display` affects the rendered grid. Read this before configuring a non-trivial card (anything beyond "drop columns in, accept defaults"), and especially before swapping in a new column type.

Worked end-to-end on real WCDB sections; references real file paths so you can verify each claim:

- Renderer: `src/dms/packages/dms/src/ui/components/Card.jsx`
- **Box model (pure resolvers + the authoritative model docs): `…/ui/components/Card.layout.js`**
- Theme: `src/dms/packages/dms/src/ui/components/card.theme.jsx`
- Section adapter: `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.jsx`
- Config / controls / defaults: `…/ComponentRegistry/Card.config.jsx`
- Legacy migration: `…/ui/components/Card.migrate.js`
- Unit tests of the model: `src/dms/packages/dms/tests/cardLayout.test.js`

## The box model — two grids, four knobs

A Card renders **two nested CSS grids**. Four knobs own ALL spacing; everything
else is content-sized:

```
cards grid (outer — records across the section)
  gap     = cardsGridGap
  padding = cardsGridPadding        ← the whole list's inset from its box
  └─ cells grid (inner, per record — attribute cells inside one card)
       gap     = cellsGridGap       (cellsRowGap / cellsColumnGap per axis)
       padding = cardsPadding       ← legacy name: pads the per-CARD surface
       └─ cell (one per visible column)
            padding = cellPadding (column) ?? cellsPadding (display)
                      ?? theme cellGutter (v2 only)
```

**Explicit values — including 0 — always win; nothing invisible adds or absorbs
space.** An empty/cleared field falls through to the next level; a typed `0` is
a value. Style emission includes only defined keys, so an explicit knob always
reaches the DOM (this contract is unit-tested in `cardLayout.test.js`).

### Two layout models — v1 (legacy default) and v2 (opt-in)

The resolved `dataCard` theme style selects the model via `layoutModel: 'v2'`:

| | v1 (default, BC) | v2 |
|---|---|---|
| Cards-grid rows | fill the box (`minmax(max-content,1fr)`) — slack is distributed BETWEEN card rows; `cardsVerticalAlign: 'top'` opts into packing | content-sized, packed to top — the gap between cards is EXACTLY `cardsGridGap`; `cardsVerticalAlign: 'stretch'` opts into fill |
| Cell chrome | every cell carries `border border-transparent` (+2px, always) | none; edit-mode hover is an `outline` (`theme.itemEditOutline`) — no layout space |
| Ambient cell gutter | whatever padding class the theme bakes into `headerValueWrapper` (e.g. `p-2`) | the theme's single `cellGutter` number, emitted INLINE — a theme class can never beat an explicit knob |
| Theme structural keys | may carry fonts/min-heights (collisions possible) | `value`/`header`/`valueWrapper`/`headerValueWrapper` are layout-only; typography comes exclusively from `valueFontStyle`/`headerFontStyle` tokens |

**Opting in:** per section — pick the `v2` entry in the toolbar's **Card
style** control (the default theme ships one); site-wide — put
`layoutModel: 'v2'` + `cellGutter` + layout-only structural keys on the brand
theme's `dataCard.styles[0]` (landbank does this; see its theme.js for the
worked example).

### Introspection (edit mode)

In edit mode the renderer stamps the answer to "where is this space coming
from" onto the DOM — read these in devtools before touching any knob:

- each cell wrapper: `data-cell="<column>"` and `data-pad="<resolved padding>"`
  (`theme` means no knob applied and the theme class gutter is in effect)
- the cards grid: `data-rhythm="<cardsGridGap>/<top|stretch>"` — the pack mode
  tells you instantly whether inter-card space is your gap or distributed slack

### Grid mechanics

Both axes are unconditional grids — there is no "row mode" vs "cell mode"
toggle anymore.

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

**Per-axis gap overrides.** `gap: cellsGridGap` sets the row gap *and* column gap together — so you
can't tighten the vertical rhythm (e.g. the space above/below a big title) without also squishing a
packed meta row. Two optional keys decouple it: **`cellsRowGap`** sets only the row gap, **`cellsColumnGap`**
only the column gap; each wins over `cellsGridGap` for its axis (BC: unset → fall through to `cellsGridGap`).
Note this is *gap*, not padding — `cellsPadding: 0` removes inner cell padding but leaves the inter-row gap
untouched, so "vertical padding 0" alone won't close the space between rows; lower `cellsRowGap` for that.

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

**One visibility axis** — `show` decides fetch + render, `selectOnly` narrows
to fetch-only, `hideHeader` trims the label (the header is real chrome):

| Key            | Effect |
|----------------|--------|
| `show: true`   | Required for the cell to render *and* for the field to be SELECTed by the data loader. `show: false` removes the cell **and** drops the column from the query (`buildUdaConfig.js`, `getData.js`). |
| `selectOnly`   | Fetch only — stays in the SELECT/GROUP BY but renders NO cell (no grid slot). The right tool for loader columns. |
| `hideHeader`   | Suppresses the label line. The wrapper still occupies a grid slot. |
| `hideValue`    | **DEPRECATED** — use `selectOnly` for loader columns. Still rendered for existing cards (suppresses the value block; the wrapper still occupies a grid slot), but the toolbar toggle only appears when it's already set. |
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
- **Never put `cellVAlign` on a row-spanning cell you are also drawing a border on.** `cellVAlign` is
  `align-self`, so it shrink-wraps the cell inside its (tall) grid area — the cell's `cellBorderBottom`
  then floats somewhere in the middle of the area instead of on the row's real bottom edge, and the rule
  visibly fails to meet the sibling column's. Leave the span cell stretched (the default) and align its
  *content* with **`cellContentVAlign`** instead (see "Filling a row AND placing its content").

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

**It is an inline style, so it is NOT responsive** — and that is a hard ceiling, not a style preference.
A mockup that reads `grid-cols-1 sm:grid-cols-2` (change the number of columns at a breakpoint) has no
Card expression: one template governs every viewport. A 6-track "2 records across × 3 parts" row that
is right at 1480 will crush its `minmax(0,1fr)` tracks to ~1px at 390 and the text will overlap the
neighbouring cell. Contrast the lexical `layout-container`, whose `templateColumns` is a Tailwind
**class** (`grid-cols-1 md:grid-cols-[max-content_1fr]`) and therefore *is* responsive — that
difference is the real reason a design transcribed into a Card can regress on mobile where the lexical
version didn't. Two consequences:

- Always use `minmax(0, …)` rather than a bare `max-content`/`1fr` — a bare `max-content` track cannot
  shrink below its content and overflows the page instead of the cell.
- Before committing to a multi-record-across track template, check the narrowest viewport you support.
  If it can't hold the columns, either accept one-across at every width or log the responsive
  `cellsTracksTemplate` (a breakpoint map, or a class string like the layout-container's) as the
  enrichment that would close it.

#### Budgeting a track template — the two taxes a shared grid charges

A cells grid is ONE grid: all rows share the track edges. That is the whole point (it is
what makes a converted row list line up where a per-row lexical `layout-container` never
could — § "An authored 'list panel'"). It also means the width a `minmax(0,1fr)` text
column gets is a **residual**, and two things quietly eat it:

1. **A `max-content` track is sized by the widest value in the column, and every row
   pays.** The mockup's row is usually a flex line with `shrink-0` spans, so each row's
   fixed part costs only what *that row* needs. Measured on npmrds-home § 01 (8 measures,
   2 across, `name · description · unit`): the mockup gives the `mph` rows 145px of
   description and the `tons/yr` row 116px; the Card gives all four rows of that half the
   same 118px, because `TONS/YR` sizes the shared unit track. **A design whose clipping is
   driven by a per-row fixed width cannot be reproduced by a shared track at any width** —
   widen the card and you clip *fewer* rows than the design, never the same ones. Escalate
   it (a per-row track has no Card expression) rather than tuning until a screenshot matches.

2. **A fixed px track transcribed from the mockup carries the mockup's slack too.** § 01's
   name track was 76px = the mockup's 64px `w-16` box scaled from 15px type to a 12.5px
   token, plus padding — for a longest name of 41px. On a 2-across grid that reserved
   20px twice over. Set a fixed track to `padL + longest value + padR + 1`, and get
   "longest value" from a measurement (`Range.getBoundingClientRect()` over the text node,
   or force `white-space:nowrap; width:max-content` and read it back), not from eyeballing
   the mockup.

Do the arithmetic explicitly before you touch the template — the residual is
`(gridWidth − Σ fixed tracks − Σ max-content tracks) / (number of fr tracks)`, minus that
cell's own `cellPaddingRight`. If the number you need is bigger than the number you have,
the answer is a width escalation, not a smaller font.

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
| `activeStyle`        | (toolbar: **Column Type Style**) Picks a *named style* from the **columnType's own theme** for this cell — forwarded as the columnType's `activeStyle`. E.g. a `select`/`status_pill` cell can use the `multiselect` theme's `"field"` (prominent control) or `"compact"` style. Blank = the type's default style. Flows via `{...attributeProps}` in both Card.jsx and TableCell.jsx, so it works in Card sections and Spreadsheets. (Note: `headerValueLayout`'s `row` needs the dataCard theme's `itemFlexRow` to carry a `flex-row` direction — transportny's bakes `flex-row!` so it wins over the wrapper's default `flex-col`.) |
| `headerValueLayout`  | (display-level; toolbar: **Value Placement** under *Default Column Settings*) `'row'` (Inline, default) or `'col'` (Stacked). `row` = header inline left of value; `col` = stacked. **Two gotchas for `row`:** (1) it needs the `dataCard` theme's `itemFlexRow`/`itemFlexCol` — if a site's `dataCard` omits them (transportny did until 2026-06-30) `row` silently falls back to the wrapper's `flex-col` and everything stacks; the transportny fix uses `flex-row!`. (2) the default `dataCard` `header`/`value` classes carry **asymmetric vertical padding** (header `pt-3 pb-1`, value `pb-3`) tuned for *stacked* cells — in a `row` that offsets the label vs value text even with `items-center`. Fix by picking a `cardStyle` whose `header`/`value` use symmetric/horizontal-only padding (transportny's **`rowaligned`** style: `header:"px-3"`, `value:"px-3"`). |
| `reverse`            | (display-level) When `headerValueLayout: 'col'`, swap order so value sits above header. |
| `headerWidth`        | (display-level) Percentage of cell width used by header in `row` layout. Default 50. |
| `valueWidth`         | (display-level) Percentage for value in `row` layout. Default 50. |
| `cellVAlign` / `cellsVAlign` | **Vertical alignment of a cell within its grid row** → CSS `align-self` (`cellVAlign` per-column wins; `cellsVAlign` is the display-level default). Values: `'top'`\|`'center'`\|`'bottom'`\|`'baseline'`. Cells default to top, so when one cell in a row is **short** (a `data_bar`, a pill) and its neighbors are **tall** (a `col`-layout label-above-value stat), the short one floats at the top and looks misaligned. Put the short + tall cells on one row and set `cellsVAlign:'center'` to line them up. (This is the fix for "a bar/short cell sits above the values next to it".) |
| `cellContentVAlign` / `cellsContentVAlign` | **Vertical alignment of a cell's CONTENT inside the cell**, with the cell left STRETCHED (`cellContentVAlign` per-column wins; `cellsContentVAlign` is the display-level default). Values: `'top'`\|`'center'`\|`'bottom'`. Use this — not `cellVAlign` — whenever the cells carry borders or the row has grown: it emits no `align-self`, so every `cellBorder*` still draws on the row's real edge. Full recipe + measurements under "Filling a row AND placing its content". |

### Static columns (labels, eyebrows, chrome) — `origin: 'static'`

A column with `origin: 'static'` reads no row data; it renders its `staticValue` as the cell value.
Use it to place **static chrome inside the card** — an eyebrow (`// page qa`), a section label, a
separator — so it shares the card's cell spacing (`cellsPadding`, `cellsGridGap`, `cellsTracksTemplate`,
`cellSpan`) instead of living in a separate lexical section that sits in the band's own `gap` (which is
why a lexical eyebrow above a card "takes up too much space"). Style it with `valueFontStyle` like any
text cell:

```js
// a gold eyebrow as the card's first cell (full-width row, tight under the card's gap)
{ name: 'eyebrow', origin: 'static', staticValue: '// page QA',
  valueFontStyle: 'kicker', show: true, hideHeader: true, cellSpan: 6 },
```

Folding a label/eyebrow into the card this way puts it under the same spacing controls as the data cells
(pair with the tight-meta recipe). A `static` column is **always read-only even inside an
`allowEditInView` card** (it's chrome, not data — `Card.jsx` excludes `origin:'static'` from edit
mode), so it won't render an EditComp or the edit-mode `border` outline (which is `currentColor` — it
showed as a gold box on a `kicker` eyebrow before this fix). **Caveat:** in some configurations
`origin:'static'` can trip the length query ("Error getting length") and blank the card — it's safe
mixed with normal data columns (as in the header eyebrow above), but if a card blanks, swap the static
cell for a **SQL-literal calculated column** instead (see the KPI traps under the value-driven column types).

#### An **all-static** card still fires a query — seed it

A card whose columns are *every one* `origin:'static'` is not query-free. `getData` builds the UDA
request with an **empty attribute list**; falcor then asks for the bare `data` leaf and the server
compiles `SELECT data AS data FROM <table> LIMIT 0, 1` →
`Unknown expression identifier 'data' in scope …`. The card usually still **paints** — the error
payload comes back as one row and a static cell never reads the row — so the only symptom is a
console error on every page load. Don't rely on that: give the query one real attribute.

```js
// one `selectOnly` aggregate makes the request legitimate and renders NO cell.
// Because it carries `fn`, getData's `isRequestingSingleRow` short-circuit still applies
// (length = 1 with no length round-trip), so this costs one metadata read, not a scan.
{ name: 'count() as card_seed', origin: 'calculated-column', type: 'calculated',
  fn: 'exempt', show: true, selectOnly: true, hideHeader: true }
```

`selectOnly` (not `hideHeader + hideValue`) is the right flag — a hidden-but-visible column still
occupies a grid slot and shifts every later cell (see "Data-only columns" below).

### Static **lexical** cells — rich text inside one Card cell

`type: 'lexical'` is a registered column type (`ui/columnTypes/index.jsx`), and `Card.jsx` has explicit
support for it: the Comp invocation passes `hideControls={attribute.type==='lexical' && !attribute.showToolbar}`
and `showBorder={attribute.type==='lexical' && editMode}`. Paired with `origin:'static'` it gives you a
cell whose value is an authored rich-text document:

```js
// one cell of the card = one lexical document. `styled(...)` here is a `styled-paragraph`
// node carrying a styleKey; the icon is an `icon` node.
{ name: 'rm_eyebrow', origin: 'static', type: 'lexical', show: true, hideHeader: true,
  staticValue: JSON.stringify({ root: { type: 'root', version: 1, direction: 'ltr',
    format: '', indent: 0, children: [ /* styled-paragraph with an icon node + a text node */ ] } }),
  cellPaddingTop: 14, cellPaddingLeft: 16 }
```

Five things to know before reaching for it:

1. **`staticValue` must be a BARE `{root:{…}}` document.** A lexical *section*'s `element-data` is
   `{bgColor, isCard, showToolbar, text:{root:{…}}}` — that envelope is **not** a lexical document.
   `LexicalView`'s `parseValue()` tests `JSON.parse(value)?.root`; the envelope fails the test and the
   cell renders the entire JSON string as literal text. Plain text is also accepted (it's wrapped into
   a one-paragraph doc), so a typo degrades silently and ugly. Guard it in your builder.
2. **A static lexical cell is always read-only, even on `/edit`.** `CompWrapper` computes
   `editMode = … && attribute.origin !== 'static'`, so it renders `LexicalView` (`editable:false`) with
   no toolbar and no border. That also means the view-mode wrapper is `theme.editorViewContainer`
   (`relative block`) rather than `editorContainer` — so the default lexical theme's `min-h-[50px]`
   never applies and the cell is content-height.
3. **`isLink` and `type:'lexical'` are mutually exclusive.** `CompWrapper` early-returns the raw value
   for a link cell in view mode (`if(!editMode && (attribute.isImg || attribute.isLink || …)) return value`),
   so the lexical ViewComp never runs and the cell renders its `staticValue` — i.e. the raw JSON — inside
   a blue underlined `<a>`. If the cell must link, it cannot be lexical (see the recipe below).
4. **A lexical cell's type comes from `textSettings`; a plain cell's `valueFontStyle` comes from
   `dataCard`.** A `styled-paragraph`'s `styleKey` resolves against `theme.textSettings` (via the
   editor's `brandTextStyles`), while `valueFontStyle` resolves against
   `{...textSettings.styles[0], ...dataCard.styles[activeStyle]}` — i.e. the **dataCard mirror wins**.
   Themes that carry a mirror of the type ladder inside `dataCard` (transportnyv2 does) can therefore
   render *the same token name* differently in the two places: there `proseSM` is `text-slate-600` in
   `textSettings` and `text-slate-500` in `dataCard`, and `metaXS` is `10px` vs `9.5px`. Don't assume a
   lexical cell and a plain cell with the same token look identical — check.
5. **Per-column keys reach the editor.** Card.jsx spreads `{...attributeProps}` into the Comp and
   `LexicalView` forwards `...rest` to the editor, so `styleName` (the named `theme.lexical` style,
   resolved by `getLexicalTheme(theme, styleName)`) and `showToolbar` are both live on a cell.

**When to use which.** A lexical cell earns its place when the cell needs something a single value
cannot express — **mixed runs** (an icon node *and* a text run in one cell), an inline chip, two
paragraphs, or authored links inside prose. When the cell is **one styled run**, a plain static cell
with `valueFontStyle` is equivalent, cheaper (no `LexicalComposer` instance per cell), and is the only
form that can also be a link. Splitting a mixed-type design row across *Card cells* — rather than
keeping it as one lexical paragraph — is what lets each part carry a named theme token instead of an
inline `style` string, so prefer more cells over richer cells.

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

A link cell's typography comes off the anchor, not the value div: Card.jsx drops
`theme[valueFontStyle]` from the wrapper for a link cell and puts it on the `<Link>`/`<a>` instead (so a
box-shaped token can't paint twice). So `{ isLink, location, valueFontStyle: 'labelSM' }` renders
**exactly** the named token as a client-side link, with no underline and no `text-blue-600` — the
`theme.linkColValue` fallback only applies when `valueFontStyle` is unset.

#### A design row that is ONE `<a>` — the whole-row link

Mockups often make an entire row a single anchor (`<a class="flex …">name · description · unit</a>`)
with a row hover tint. A Card's link affordance is **per cell**, so there are three options and only
one of them holds the design's type:

| Approach | Result |
|---|---|
| lexical cell + `isLink` | ✗ broken — the lexical ViewComp is bypassed and the cell prints its `staticValue` JSON inside a blue underlined anchor. |
| lexical cell + a `button` node inside the document | ~ navigates client-side, but the look comes from `theme.button.styles[]`, so the cell takes a button skin (e.g. a mono uppercase `cardlink`) instead of the design's type. |
| **plain static cell + `isLink` + `valueFontStyle`, repeated on every cell in the row** | ✓ each part keeps its own named token and the whole row is clickable. |

Take the third. The costs to log: the row becomes *N* anchors instead of one (a11y + tab stops), and
the mockup's `hover:bg-slate-50` row tint is not expressible — `theme.cellActive` is the only cell tint
and it is driven by search-param matching, not hover. A true row link would need a Card-level
affordance (a row-scoped `location` on the display, or a link cell that spans the row and hosts the
other cells) — that's an enrichment, not a config.

#### ⚠ A BOX-shaped token must carry its own width — the value div shrink-wraps its children

A cell's value div carries the justify class (`theme.justifyTextLeft` =
`text-start justify-items-start` in transportnyv2). `justify-items` is usually read as a
grid-only property, but **current Chromium implements CSS Box Alignment in block layout
too**, so `justify-self: start` reaches every *block-level* child of that div and makes it
**shrink-to-fit**. Measured on NPMRDS Home 2026-08-14: a bare `<div>` injected into a value
div comes out **8px** wide inside a 239.3px box, and a full-bleed CTA anchor whose token said
`flex items-center justify-between h-11 px-5` rendered **152.2px** instead of 241.3.

So any token that is meant to be a *box* — a bar, a pill, a rail, a tinted strip — needs an
explicit width, exactly as `chip` has long carried `w-full!`:

```js
// fills the cell's content box
ctaRail: "flex items-center justify-between h-11 px-5 w-full …",
// fills the cell's BORDER box (see the full-bleed recipe below)
ctaRail: "flex items-center justify-between h-11 px-5 w-[calc(100%+2px)] -mx-px -mb-px …",
```

The symptom is easy to misread as "my flex didn't apply" — check the anchor's computed
`width` against its parent's before touching the display.

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
| `allowEditInView`      | Inline-edit this cell in view mode. **Requires an explicit editable `type`** — a column with no `type` silently can't be edited (falls to the read-only `DefaultComp`; see "Defaults that bite"). |
| `staticValue`          | When `origin: 'static'`, the column has no row data — this is the cell's value. |
| `usePageParams`        | The cell's value comes from page state (`pageParamKey`) rather than the row. |
| `blankDefault`         | Synthetic value used when `display.useBlankRowFallback` is on and the query returns 0 rows. |
| `wrapText`             | **Spreadsheet/Table only.** `TableCell.jsx` reads it (`theme.wrapText`) to let a long value wrap instead of truncating. `Card.jsx` never reads it — a Card cell always wraps and a Card has **no truncation knob at all**. A design that ellipsises a long description is reproduced with a **clamping `valueFontStyle` token**; see the next section for the recipe and the two traps in it. |

### Clamping a cell to N lines (the design's `truncate`)

A Card cell wraps, forever. To reproduce a mockup's `truncate` / fixed-line-budget
row text, add a **new** token to the brand's Card token map
(`theme.dataCard.styles[0]`) and point the column's `valueFontStyle` at it.

```js
// themev2.js — dataCard.styles[0], ADDITIVE (see the BC note below)
proseSMClamp1: `${F_SANS} text-[12.5px]! leading-[1.55]! text-slate-500! line-clamp-1`,
proseXSClamp2: `${F_SANS} text-[11.5px]! leading-[1.5]!  text-slate-500! line-clamp-2`,
```

```js
// the column
{ name: 'desc', origin: 'static', staticValue: d, valueFontStyle: 'proseSMClamp1', … }
```

Four things this recipe depends on — each one measured, each one has bitten:

1. **A new token, never `truncate` on the shared one.** `proseSM`/`proseXS` are
   used by every card in the brand; adding `truncate` there silently starts
   clipping all of them (`feedback_card_edits_bc`). Clamping is opt-in per column.
2. **`line-clamp-N`, not `truncate`.** `truncate` carries `white-space: nowrap`,
   which makes the cell's **min-content** the whole string. The cell wrapper is a
   **grid item with `min-width: auto`**, so its content-based minimum floors it at
   that width and a `minmax(0,1fr)` track can no longer contain it — the row blows
   out sideways instead of ellipsising. `line-clamp` ellipsises in the same place
   while leaving min-content at the longest *word*.
3. **Never write `block` next to `line-clamp-N`.** `line-clamp` works by setting
   `display: -webkit-box`; `display: block` beats it in the compiled sheet and the
   clamp silently stops clamping. You are left with a cell that still wraps and
   merely hides its overflow — which reads as "the token didn't apply" and sends
   you looking in the wrong place. (Symptom: the cell is exactly N+ lines tall and
   `getComputedStyle(a).display === 'block'`.)
4. **~~On a LINK cell the token lands on an inline `<a>`…~~ FIXED 2026-08-14.**
   A link cell used to render `value div → inline <a class={token}> → text`, and an
   inline box's `line-height` does not size the line box it sits in — the value
   div's inherited strut (16px/24px in transportnyv2) did, so **every** link-cell
   line cost 24px whatever the token said. `Card.jsx` now **blockifies the anchor**
   (`resolveLinkAnchorStyle` in `Card.layout.js`), which makes the token's own
   leading the strut, exactly as on a non-link cell: a `text-[12.5px]!
   leading-[1.55]!` link cell measures 19.4px per line, not 24.
   - The rule is **"the token owns the typography unless it owns the display"**.
     If the token declares any display utility — `inline-flex`/`flex`/`block`/… or a
     `line-clamp-*` (which is `-webkit-box` in disguise) — the anchor is left
     completely alone, because that display *is* the token: a `btnPrimary` box keeps
     `items-center`, a clamp keeps clamping, and MNY's `flex` `linkColValue` pill
     keeps its shape.
   - **You no longer need to bolt `block` onto a text token** to make a link cell
     honour its leading (`proseRowSM` still carries one; it is now redundant).
     `inline-block` never worked for this and never will — an inline-block is still
     inline-level, so the strut still wins (measured: 24 → 24).
   - Note what this removes: link cells used to *accidentally* share one 24px line
     box, which silently aligned differently-sized parts of a row. Now each part has
     its own line box, so a row of `label / description / unit` cells needs real
     alignment (see the stretched-cell gap below).

5. **For a *single-line* clamp, add `break-all` — that is what makes it read as
   `truncate`.** `line-clamp` alone breaks at word boundaries, so the ellipsis lands
   after the last whole word that fits and the rest of the track is left empty:
   `"Uncongested reference"` in a 118px box renders `"Uncongested…"` and wastes 44px,
   where the design's `truncate` shows `"Uncongested refer…"`. `word-break: break-all`
   lets the break fall mid-word, and it does **not** re-introduce failure (2): break-all
   leaves min-content at one character, where `white-space: nowrap` makes it the whole
   string. Rows that fit are unaffected — with one line there is no break point until
   the clip point. Keep it as its own token so callers can choose:

   ```js
   // clamp = word-granular (right for multi-line prose that must stay readable)
   proseSMClamp1: `${F_SANS} text-[12.5px]! leading-[1.55]! text-slate-500! line-clamp-1`,
   // trunc  = the mockup's `truncate`, reproduced (right for a one-line row cell)
   proseSMTrunc1: `${F_SANS} text-[12.5px]! leading-[1.55]! text-slate-500! line-clamp-1 break-all`,
   ```

**Detecting a clamp in a probe:** `scrollWidth > clientWidth` does **not** work. A
clamped box wraps, so its scrollWidth never exceeds its clientWidth; the tell is
`scrollHeight > clientHeight`. (`truncate`, had it worked, would have been the
scrollWidth test — which is why probes copied from a `truncate` page report "nothing
is clipped" on a clamped one.)

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
| `status_pill` | the value as a colored `UI.Pill` (good/bad/warn/na); **editable** — add `allowEditInView: true` and it stays a pill in view but becomes a single-select dropdown when the cell is edited (options come from an explicit `options` array, else the `pillColors` keys), persisting a clean string | `pillColors` (map `value → pill style`); else keyword heuristics (meets/above → good, below/miss/fail → bad). Themeable via `theme.pill`. |
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

## In-cell bar / heat column types: `data_bar` + `data_color_cell` + `stacked_bar`

Value-driven built-ins that render a magnitude *inside* the cell (work in Card
cells and in Spreadsheet columns):

| `type`            | Renders | Key attributes |
|-------------------|---------|----------------|
| `data_bar`        | a horizontal bar scaled to a max, optional value label | `barMax` (static scale top) **or** `barMaxColumn` (a sibling column name to scale against); `barColorColumn` (sibling whose value selects a fill from `theme.dataBar.fills`); `barShowValue` (print the value) + `barUnit` (suffix, e.g. `"%"`, `" mi"`). |
| `data_color_cell` | the cell **background** colored on a palette scale (heat tile) | `domainColumns` (array of sibling column names → per-row min/max so each row shades within itself — the "shade within each region row" heat behaviour, no extra min/max SQL); fallbacks `colorMin`/`colorMax` (static) or `colorMinColumn`/`colorMaxColumn`; `colors` palette override (else `theme.dataColorCell.palette`); `showValue` (default false). |
| `stacked_bar`     | ONE track split into proportional segments + an optional counts legend (a distribution bar: stage mix, open/done split) | `segments: [{col, label?, color?}]` — each segment's count comes from a **sibling column on the same row** (put per-category `count(*) filter (where …)` calcs on the row as `selectOnly` columns, `fn:"exempt"`); `color` = literal `#hex`/`rgb`/`hsl` inline or a `theme.stackedBar.fills` key; array order = bar+legend order. `showLegend:false` for bar-only; `emptyText` replaces the all-zero legend ("no tickets yet") over a bare track. Zero segments drop from the bar but stay in the legend. The host column's own value is unused — any calc (e.g. `count(*)`) works. |

Worked examples (live, congestion_v2 page 2175676): the region-rank bars, the
worst-corridor table, and the month×region seasonality heat grid; reliability §03
failing-by-period and §04 corridors use `data_bar`. Use `data_color_cell` for a
spreadsheet that's a heat grid (pair it with the `"heat"` table style —
`display.tableStyle: "heat"` — for the white-header, border-less treatment).
`stacked_bar` worked example: the control-room overview's per-pattern stage
distribution + tickets open/done bars (`build_cr_overview.mjs`) — a one-row
aggregate Card whose columns are six `count(*) filter (where stage=…)` selectOnly
calcs plus one `stacked_bar` host cell; the legend doubles as the "3 proposed ·
0 design · …" breakdown line. `segments[].col` must match the sibling's **row
key** — set `normalName` explicitly on the seg calcs and reference that (with no
`normalName` the row is keyed by the full SQL `name`, per the warning below).

> ⚠️ **`pageSize` is required even with `usePagination: false`.** Without it the
> fetch range never resolves and the section silently renders nothing — the
> length query goes out, no data request follows, no error anywhere. Set
> `pageSize` ≥ the expected row count (found via the freight-atlas gallery tiles,
> 2026-07-13).

> ⚠️ **No literal `" as "` inside calculated-column string literals.** The
> column-name parser (`splitColNameOnAS`) splits on the FIRST ` as ` anywhere in
> `name` — `'... more as their data lands'` truncates the SQL mid-literal and
> that attribute silently returns null. Assemble the text so the word "as" never
> has spaces around it in the raw string, e.g.
> `|| ' more' || chr(32) || 'as their data lands'`.

> ⚠️ **`barMaxColumn` / `barColorColumn` (and `data_color_cell`'s
> `domainColumns`/`*Column` props) must reference a sibling column by its FULL
> SQL `name`, not its alias.** The row handed to the column type is keyed by each
> column's full `name` (the server strips `normalName`), so a prop pointing at
> the bare alias misses the lookup → `barMax` resolves to `NaN` → `fillPct`
> clamps every bar to 100% (bars show *no variation*, the classic symptom).
> Define the max/tone expressions once and reuse the exact string in both the
> column and the `*Column` prop. Also: `data_bar` parses the cell value with
> `parseFloat`, which stops at a comma — a `formatFn: 'comma'` value like
> `"31,677"` parses as `31` and collapses the scale; the built-in `data_bar`
> strips commas before parsing, so keep that behavior if you fork it.

> **Compound single-line header** (a `cardTitleSM` title on the left + a `kicker`
> descriptor pushed right on ONE line) is authored in a **lexical** section, not a
> Card: a `layout-container` node (`templateColumns: "items-center
> grid-cols-[auto_1fr]"`) holding two `layout-item`s. Narrow cards need a short
> kicker so it doesn't wrap. (Used on every §02–§05 reliability/congestion card top.)

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

### `selectOnly` + `normalName` — feeding a column type from a hidden sibling

`target_bar`'s `targetColumn`, `data_bar`'s `barMaxColumn`, `stacked_bar`'s
`segments[].col` and `delta`'s `deltaYearField` all look their sibling up **on
the row object**, and getData keys that object by
`column.normalName || column.name` (`rowWithData[column.normalName || column.name]`).
A raw calculated column's `name` is the whole SQL string, which is a miserable
thing to reference — so give the hidden feeder an explicit `normalName` and point
the consumer at *that*:

```js
// fetched, never rendered — the applicable target off the joined targets table
{ name: 'max(t.lottr_interstate_applicable_target) as m1_target', type: 'calculated',
  show: true, fn: 'exempt', formatFn: ' ', selectOnly: true, normalName: 'm1_target' },
// …and the bar reads it, so the target MARKER is bound instead of hard-coded
{ name: '<the metric expression> as m1_bar', type: 'target_bar', fn: 'exempt',
  targetColumn: 'm1_target', barMin: '0', barMax: '100', barDirection: 'up' },
```

`normalName` does **not** change the SQL — buildUdaConfig only uses it for row
keying and duplicate-column filter matching — so this is free. Prefer it to a
static `targetValue`: a static target silently goes stale the day the agency
re-sets it, and nothing on the page will say so.

⚠ **Verify the marker actually resolved.** `TargetBarView` does
`targetColumn && row ? row[targetColumn] : targetValue` — a `targetColumn` that
misses returns `undefined` → `NaN` → **no marker at all, and `meets` defaults to
`true` so the fill stays green**. It fails green and silent. Check the DOM for
the marker element and its `left:` percentage, not the screenshot.

## Recipe — a composite KPI panel: ONE Card that is the whole design box

The pattern this solves: a mockup draws **one bordered box** containing a header
strip, a 2×N grid of compact metric cells (each with a label row, a bar, and a
footer line) and a footer link row. The temptation is one section per metric —
especially when a report page elsewhere already has a card per metric and you
want the same numbers. **Resist it: N sections can never be one box**, and a
report card carries far more content than a design's compact cell (a status
pill, a 44px figure, a captioned bar, a delta *and* a margin sentence).

Clone the report card's **SQL**, not its **presentation**. Lift each expression
out of the existing card by alias and rename only the alias, so the two surfaces
provably cannot disagree:

```js
const kpiSql = (id, alias, newAlias) => {
  const col = CLONES[id].columns.find(c => c.name.endsWith(` as ${alias}`));
  if (!col) throw new Error(`card ${id} has no column aliased "${alias}"`);
  return col.name.slice(0, -(` as ${alias}`).length) + ` as ${newAlias}`;
};
```

**The grid.** Two tracks per metric, N metrics across; the cells grid *is* the
design's metric grid, which is what makes the cells' column edges, their
`cellBorderRight` seam and their `cellBorderBottom` rules line up:

```js
display: {
  cellsGridSize: 4, cellsGridGap: 0, cardsPadding: 0, cardsBgColor: '#ffffff',
  cardStyle: 'context',        // a named dataCard style whose `value` is '' — see below
  cellsTracksTemplate: 'minmax(0,1fr) minmax(0,max-content) minmax(0,1fr) minmax(0,max-content)',
}
```

Column order = auto-flow order, so emit a *row of the design grid* at a time:
`name₁ · figure₁ · name₂ · figure₂` → `bar₁ (cellSpan 2) · bar₂ (cellSpan 2)` →
`caption₁ · delta₁ · caption₂ · delta₂`. The `border-r` between the two halves is
`cellBorderRight` on **every cell in track 2**; the cell's bottom rule is
`cellBorderBottom` on the last row of each metric.

**Why the header strip and the footer row are safe to span.** Per CSS Grid
§ 12.5, a grid item that spans a **flexible** track contributes nothing to
intrinsic track sizing. So a header cell with `cellSpan: 2` over
`[minmax(0,1fr), minmax(0,max-content)]`, and a footer cell with `cellSpan: 4`
over the whole thing, **cannot inflate the figure column** — measured on the
NPMRDS home § 04 panel, whose figure tracks stay at 79px and 111px, sized only by
the four figures and four deltas. Without a flexible track in the span they
would.

Four more things that panel taught, all of which cost a build cycle:

1. **A "no data here" placeholder must be `hideValue: true`, not
   `staticValue: ''`.** An empty static cell still renders its value div, which
   carries `min-h-[20px]` — the placeholder was making one bar row 30px against
   the other's 18. `hideValue` drops the content and keeps the SLOT (which is the
   whole point of the placeholder: it holds the grid row so the other metrics
   stay aligned).
2. **`barShowCaption: false`** when the design puts the target on its own footer
   line rather than above the bar. The caption is `target_bar`'s only opinion
   about layout; switch it off and the column type is pure geometry.
3. **A `delta` with no `deltaYearField` and no `deltaSuffix` renders bare** —
   which is what you want when the design states the comparison once, in the
   header strip ("change vs 2024"), instead of on every cell.
4. **A `lexical` cell's content floor is ~23px.** `LexicalView`'s root carries a
   `leading-[22.4px]` strut, so a one-line footer link row inside a lexical cell
   is 23px of content no matter how small the type is. Budget the cell's padding
   against 23, not against the design's 15px line.

**Two atoms that have no Card expression, so plan around them rather than
discovering them late:**

- **A standalone verdict dot.** `verdict_dot` always prints its value (an empty
  value returns an empty div — no dot), and `status_pill` always prints text.
  There is no cell that renders *just* a coloured dot. If the design's dot is
  decorative-but-meaningful, the honest substitute is usually `target_bar`'s own
  emerald/rose fill, which encodes the same verdict. (Smallest enrichment: a
  `verdictShowValue: false` attribute — `verdictDot.jsx` already owns exactly the
  `size-1.5 rounded-full bg-emerald-500 / bg-red-500 / bg-slate-300` classes the
  mockups draw.)
- **Per-column styling of a value-driven column type.** `target_bar`, `delta`,
  `verdict_dot` and friends call `getComponentTheme(theme, '<key>')` with **no
  `activeStyle`**, so their look is one global setting per site. You cannot give
  one page's bar a 6px track and another's an 8px track, and adding the theme key
  at all restyles every existing consumer. Check what else uses the column type
  before touching `theme.targetBar` / `theme.delta`.

**Link audit warning.** A cell cannot be both a link cell and the `lexical`
column type (`CompWrapper` early-returns the raw value for a link cell, so the
rich-text renderer never runs). Links inside a lexical cell are therefore
`button` **decorator** nodes — they navigate, but they render `<button>`, not
`<a>`, so **they never appear in an `href` sweep and a "dead `#` link" check will
not see them.** Verify them by clicking.

## Vertical rhythm (footnote)

Covered by the box model at the top: on v2 the gap between cards IS
`cardsGridGap`. On v1 the fill default distributes section slack between card
rows — for list-style cards set `cardsVerticalAlign: 'top'` (toolbar: Cards
Grid → Vertical Align), or move the theme/section to v2. Diagnose in edit mode
via `data-rhythm` on the cards grid (`…/stretch` = fill mode is in play), or
read the grid's computed `grid-template-rows` in devtools.

**Uniform list recipe** (the design's "label · count over a bar" card):

```js
display: {
  cardsGridSize: 1,
  cardsGridGap: 16,            // the design's row spacing — the ONLY gap
  cardsVerticalAlign: 'top',   // v1 only; v2 packs by default
  cardsGridPadding: '0 0 16px',// list-level inset (breathing room under the
                               // LAST row without touching the rhythm)
  cellsGridSize: 2,
  cellsPadding: 2, cellsRowGap: 2,  // tight label→bar stack inside each row
}
```

Font trap that co-occurs with spacing bugs on v1 themes: a brand
`theme.dataCard.value`/`header` class that bakes in font utilities collides
with every `valueFontStyle`/`headerFontStyle` token on Tailwind's
arbitrary-value order. v2 forbids fonts in structural keys; on v1, keep
`theme.value` layout-only (`w-full`) or give the token copies `!` importance
(the transportny approach, above).

### Cells-grid vertical rhythm — three keys with confusingly similar names

| Key | Level | What it actually sets |
|---|---|---|
| `display.cardsVerticalAlign` | **cards** grid | How the *records* pack down the section (`resolveCardsGridStyle`). |
| `display.cellsVerticalAlign` | **cells** grid | Where the card's **leftover height goes**: `'stretch'` → `align-content: stretch` (spread equally across the rows); unset/`'top'` → `align-content: start` (pooled below the last row). Row *sizing* is separate — see below (`Card.layout.js` `resolveCellsGridStyle`). |
| `display.cellsRowsTemplate` | **cells** grid | Raw **`grid-template-rows`** (peer of `cellsTracksTemplate`). Names the explicit rows, which is how you exempt one from `'stretch'` — see the recipe below. |
| `attr.cellVAlign` / `display.cellsVAlign` | one cell / all cells | Plain **`align-self`** on the grid item (`top`/`center`/`bottom`/`baseline`). Nothing to do with row sizing. |
| `attr.cellContentVAlign` / `display.cellsContentVAlign` | one cell / all cells | Where the cell's **content** sits inside the cell (`top`/`center`/`bottom`). Emits `justify-content` or `align-items` depending on the cell's flex direction, and **no `align-self`** — the cell keeps filling its row. This is the one to pair with a distribution below. |

**`cellsVerticalAlign: 'stretch'` — "stretch the cells to fit inside the card".**
Use it when a `height: 'fill'` card sits beside a taller sibling and its last cell
(a tinted footer strip, a CTA rail, a bottom rule) has to land on the card's own
bottom edge instead of stopping short. CSS Grid §12.9 "Stretch auto Tracks"
divides the leftover space **equally** among tracks whose max sizing function is
`auto`, which is exactly what the key now emits. Properties worth knowing:

- **Inert without slack.** A card whose rows already fill the box renders
  byte-identical — so it is safe to set on both siblings and let whichever one is
  short at a given width absorb.
- **The card does not grow.** Measured on NPMRDS Home § 02 (2026-08-14): the short
  card's gap went 43px → 0 at 1440 and 20px → 0 at 1600/1680 with the card height
  unchanged at every width in the 1280–2048 sweep.
- **`cellsRowHeight` wins the row size.** With fixed-px rows there is no auto-max
  track to grow, so `stretch` has nothing to distribute and behaves as `start`.
  `cellRowSpan`'s `minmax(0, auto)` *does* compose — those rows take their share.
- **It needs a definite height to have slack at all**, which a `height: 'fill'`
  section gives it (the cells grid is a stretched item of the cards grid). In an
  `auto`-height section there is no leftover, so the key is a no-op — that is a
  section-height problem, not a Card one.

**Why not `gridAutoRows: minmax(max-content, 1fr)`** — the pre-2026-08-14
implementation of this same key, kept here because the CSS lesson is general: a
**flexible** track is not stretched, it is *equalized*. The flex fraction resolves
against the largest track's base size, so every row is sized to the **tallest**
row's max-content and the card grows instead of the gap closing. Measured on the
same § 02 card: 395.8 → **751.3px** (all ten rows forced to 75.1px), and on § 01's
panel the 49px header strip fattened to 56px to match the data rows — at a width
where there was no slack to distribute at all. Distributing free space is
`align-content`'s job; the track sizing function only decides how big rows *want*
to be.

### Filling a row AND placing its content — `cellsContentVAlign` / `cellContentVAlign`

**Two vertical axes, two keys** (the content one shipped 2026-08-14):

```js
display: { cellsContentVAlign: 'center' }     // every cell in the section
{ name: 'unit', cellContentVAlign: 'bottom' } // one column wins over it
```

| key | what moves | how |
|---|---|---|
| `cellVAlign` / `cellsVAlign` | the **CELL** inside its grid row | `align-self` — and `center`/`top`/`bottom` all **shrink-wrap** the cell |
| `cellContentVAlign` / `cellsContentVAlign` | the **CONTENT** inside the cell | emits **no `align-self`**, so the cell keeps the grid default `stretch` |

Values `top` \| `center` \| `bottom` on both. They compose — "cell at the bottom of
its row, content centred in the cell" is expressible.

**Reach for the CONTENT key by default.** Once a row grows — because a sibling cell
is taller, or because `cellsVerticalAlign:'stretch'` / `cellsRowsTemplate` gave the
row a share of the card's slack — a stretched cell top-anchors its text and the row
looks broken (NPMRDS Home § 01 at 1280: 16.3px of text in an 81.7px row, **15px above
and 47.4 below**; with `cellsContentVAlign:'center'`, **30.7 / 31.7**). It is inert
when there is no slack: the same card at 390 has 50.4px rows and the description does
not move at all.

**Do NOT reach for `cellVAlign:'center'` for this.** `align-self: center` shrink-wraps
the cell inside its row, so any `cellBorderBottom` floats at the *cell's* bottom edge
instead of the row's and a `cellBorderRight` divider becomes a dashed stub. Measured
on the same § 01 row: the three cells collapse 81.7 → 47.3 / 50.4 / 44.5 and the
panel's rules go from **5 continuous lines to 13 stubs**. With the content key the
rules are byte-identical to the top-anchored version (5 groups, and the three cells of
every row share a bottom edge to 0.0px).

**It also aligns parts of a row that carry different tokens.** Three cells in one row
with `leading` 16.25 / 19.4 / 13.5 do not line up top-anchored (line-box midlines
−1.6 / 0 / −3.0). Centred, each part's line box is centred in an identical content box,
so the midlines coincide **exactly** (0.0 / 0 / 0.0) — no per-token padding arithmetic,
and nothing to recompute when a token changes.

⚠ **Which CSS property it emits depends on the cell's flex direction**, and the
resolver works that out for you (`resolveCellFlexRow`): `justify-content` for a
stacked cell, `align-items` for a row cell. The direction is `headerValueLayout` when
set, and otherwise **whatever the theme's `headerValueWrapper` bakes** — transportnyv2
and tessera bake `flex flex-col`, the dms default / avail / wcdb / mny wrappers are a
bare `flex` (⇒ row). If a theme declares `headerValueLayout:'row'` but ships no
`itemFlexRow`, the DOM stays column and the wrong axis is emitted — that is the same
theme bug that already breaks the header/value width split; fix the theme.

**"Spread the slack, but NOT into THIS row" — `display.cellsRowsTemplate`**
(shipped 2026-08-14). `'stretch'` spreads the leftover **equally** over every row,
which is wrong whenever the rows are not interchangeable — a header strip must not
grow just because the card has spare height. `cellsRowsTemplate` is the row-axis
peer of `cellsTracksTemplate` (a raw `grid-template-rows` string) and settles it,
because `align-content: stretch` only grows tracks whose max sizing function is
`auto`: name a row in the template and §12.9 skips it.

```js
// header strip holds its height; every row below it splits the leftover
display: { cellsVerticalAlign: 'stretch', cellsRowsTemplate: 'max-content' }

// the mockups' `mt-auto`: authored rhythm kept, ONE row eats everything
display: { cellsRowsTemplate: 'max-content max-content max-content 1fr' }
```

It names only the **explicit** rows — everything past the template stays implicit,
so `cellsRowHeight` and the row-span `minmax(0, auto)` still size the rest, and you
don't have to know how many rows the data will produce. Same ceiling as
`cellsTracksTemplate`: it is an **inline style**, so one template governs every
viewport.

Worked example — NPMRDS Home § 01's measures panel, which is exactly the case
plain `'stretch'` could not serve:

| width | header, `stretch` alone | header, + `cellsRowsTemplate:'max-content'` | measure rows | slack |
|---|---|---|---|---|
| 1280 | 60.5 → **83.8** | **60.5** (unmoved) | 79.5 | 0 |
| 1440 | 49 → **59.7** | **49** | 63.8 | 0 |
| 1480 | 49 → **52.8** | **49** | 55.2 (mockup: 55.9) | 0 |

⚠ **Adding a display key takes two edits, not one.** `Card.jsx` re-assembles a
*curated* `display` literal for `resolveCellsGridStyle` rather than passing
`display` through, so a resolver that reads a new key gets `undefined` forever —
the data writes fine, the DOM just ignores it, and nothing errors.
`cellsRowsTemplate` shipped inert once this way. `cardLayout.test.js` now carries a
source-scan guard that fails if the literal stops covering the destructure.

**Whichever distribution you pick, pair it with `cellsContentVAlign`.** A grown row
top-anchors its content (§ 01 at 1280: 16.3px of text in an 81.7px row, 15 above /
47.4 below), so the row that just absorbed the slack is the row that looks wrong.
Shipped 2026-08-14 and documented above under *"Filling a row AND placing its
content"* — it keeps `align-self: stretch`, so the rules stay continuous. Do **not**
reach for `cellVAlign:'center'` instead: that is `align-self`, it shrink-wraps the
cell, and the per-row rules break into 13 stubs.

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
- `cellsPadding` defaults to undefined → v1: cells fall through to the theme's class gutter (`headerValueWrapper` `p-2`); v2: the theme's `cellGutter` is applied inline.
- **(v1 only)** Every cell renders `border border-transparent` when not hovered and not in `cellBorder` mode — **+2px on every cell's bounding box**, so `cellsPadding: 0` never yields a fully flush layout. v2 drops this (edit hover is an outline).
- **(v1 only) The cards grid fills its box by default** (`gridAutoRows: minmax(max-content, 1fr)`): any card that's shorter than its section box — `height:'fill'`, or a section stretched by a taller `rowspan` sibling — gets the slack distributed *between its rows*. Lists want `cardsVerticalAlign: 'top'`. v2 packs by default (`'stretch'` opts back in).
- `headerValueLayout: 'row'` is the default — header sits *inline left of* value with a `headerWidth`/`valueWidth` split (default 50/50). The split applies only when BOTH header and value render; a `hideHeader` cell gives the value the full width (guarded by `resolveHeaderValueWidths` + tests). Set `headerValueLayout: 'col'` on the section when cells are hidden-header or composite.
- **A column with no `type` is NOT editable — even with `allowEditInView`.** `Card.jsx` picks the cell renderer as `ColumnTypes[attribute.type]?.[editMode ? 'EditComp' : 'ViewComp'] || DefaultComp`. An undefined `type` misses the registry and falls to `DefaultComp` — a plain read-only `<div>` (`{value}`) with no edit branch — so it renders fine in view and silently refuses to edit. To make a cell editable, give it an explicit editable columnType: `text` (single-line `<input>`), `textarea` (multi-line box — use for prose/multi-paragraph), `status_pill`/`select` (dropdown), etc. `text` vs `textarea` differ *only* in the editor widget, so a "value shows but won't edit" bug is almost always a missing/wrong `type`, not an `allowEditInView` problem.

## Legacy state — what migration handles

`Card.migrate.js` runs on hydration (called from `migrateToV2`). It auto-translates:

- `display.compactView` (boolean) + `gridSize/gridGap/padding/colGap/rowHeight/bgColor/addBorder/removeBorder` → the new pairs of cards/cells keys.
- Per-column `cardSpan/cardRowSpan/bgColor/pb/borderBelow` → `cellSpan/cellRowSpan/cellBgColor/cellPaddingBottom/cellBorderBelow`.

If you're writing a card config by hand (e.g., via the CLI), **use the new keys**. The migration is one-way and runs once.

## Recipes

### Tight inline meta / header row — pack cells to content (match a design's spacing)

The default `repeat(N, minmax(0,1fr))` track makes every cell an equal fraction, so short values
(a surface pill, a route, a date) float in wide cells and read as "airy" / "too many columns"
versus a design's editorial header. To pack cells tight-left — `HOME` + `TSMO` + `/home` + badges +
owner + date on one line, like the mockup — drive three knobs together:

- **`cellsTracksTemplate`** = `(N−1) × max-content` + a trailing `minmax(0,1fr)` spacer. Cells size
  to their content (not a fraction) and pack left; the 1fr spacer eats the slack and lets you
  right-align the last cell with `justify: 'right'`.
- **`cellsPadding: 0`** — kill the inner cell padding that creates the airy gaps.
- small **`cellsGridGap`** (8–10) — the only inter-cell rhythm left.

Each meta field gets `cellSpan: 1`, `hideHeader: true`, and a compact `valueFontStyle` (`metaMD`,
pills). They flow onto one row, each content-width.

```js
columns: [
  col('name', '',  { valueFontStyle: 'displayLG', hideHeader: true, cellSpan: 5 }),   // big title (cols 1-5)
  pcol('stage','', STAGE_PILL, { hideHeader: true, cellSpan: 1, justify: 'right' }),  // right, in the 1fr track
  col('description','', { valueFontStyle: 'prose', hideHeader: true, cellSpan: 6 }),  // full-width row 2
  pcol('surface_label','', SURFACE_PILL, { hideHeader: true }),                       // meta row 3, packed left
  col('route','',  { valueFontStyle: 'metaMD', hideHeader: true }),
  pcol('build','', BUILD_PILL, { hideHeader: true }),
  pcol('data','',  DATA_PILL,  { hideHeader: true }),
  col('owner','',  { valueFontStyle: 'metaMD', hideHeader: true }),
  col('updated','',{ valueFontStyle: 'metaMD', hideHeader: true }),
],
display: {
  cellsGridSize: 6, cellsGridGap: 10, cellsPadding: 0,
  cellsTracksTemplate: 'max-content max-content max-content max-content max-content minmax(0,1fr)',
  cardBorder: false,
}
```

Caveats: keep the big title cell **spanning most** of the max-content tracks (`cellSpan: N−1`) so its
content-width distributes across them rather than fighting the meta (see "max-content + spanning steals
width" above). When the layoutGroup band already provides the surface (e.g. a `header`/white band), give
the section a bare extra (`{}` — no `bg`/`border`) so you don't double-box a card on the band. Per-edge
nudges via `cellPadding*`. This is the canonical way to reproduce a design's spacing from these settings.

### An authored "list panel" — replace a lexical block with an all-static Card

A very common mockup shape: a bordered panel with a header strip and then N rows, each row made of
2–4 differently-styled parts that must line up **column-wise across every row** (`name · description ·
unit`, `title/description · chevron`). Authors reach for a lexical section first and it can't do it: a
paragraph has no columns, and one lexical `layout-container` per row makes each row **its own grid**, so
any `max-content` part lands at a different x in every row. **One Card whose cells grid holds every
row's parts is the fix** — one set of track edges, shared by all rows.

Recipe (worked example: `build_npmrds_home.mjs`, § 01 "go straight to a measure"):

```js
// 6 tracks = 2 records across × 3 parts. minmax(0,…) everywhere so nothing overflows.
display: {
  cardStyle: 'context',                 // ← named style whose `value` is '' (see below)
  cellsGridSize: 6, cellsGridGap: 0,
  cardsPadding: 0, cardsBgColor: '#ffffff', cellsContentVAlign: 'center',
  cellsTracksTemplate: '76px minmax(0,1fr) minmax(0,max-content) 76px minmax(0,1fr) minmax(0,max-content)',
  totalLength: 1, fetchMode: 'force',
}
// header strip: two static cells, cellSpan 3 each, cellBorderBottom on both.
// each row: three static cells, each { isLink, location, valueFontStyle }, and
//   cellBorderBottom on all three except the last row + cellBorderRight on the
//   left record's last cell — that reproduces the mockup's row/column rules.
{ name: 'm0_name', origin: 'static', staticValue: 'LOTTR', valueFontStyle: 'labelSM',
  show: true, hideHeader: true, isLink: true, location: '/macro', searchParams: 'none',
  cellBorderBottom: true, cellPaddingTop: 10, cellPaddingBottom: 10,
  cellPaddingLeft: 16, cellPaddingRight: 8 },
```

Four things that decide whether this looks right:

- **`theme.value` padding.** The default `dataCard` style bakes `px-3 pb-3` into every cell's value
  wrapper, *inside* the cell — no `cellPadding*` knob can reach it, so a design's `px-4 py-2.5` row
  comes out with an extra 12px and the fixed name track loses a third of its width. Fix it the themed
  way: pick a **named `dataCard` style whose `value` is `''`** via `display.cardStyle` (transportnyv2
  ships `context`, `ink`, `tile`; `rowaligned` drops only the vertical half). Named styles inherit
  every other key from `styles[0]`, and any shell the named style carries
  (`subWrapperCompactView: 'rounded bg-slate-50/60 p-5'`) is overridden by the **inline**
  `cardsPadding` / `cardsBgColor` on the same element. Never reach for a `className` passthrough.
- **Track widths must include the padding.** In the mockup the row's `px-4` is on the `<a>` and the
  name is `w-16` *inside* it; in a Card the cells partition the whole width, so the name track is
  `16 (left pad) + name width + 8 (half the gap)`.
- **Row rules are per-cell borders.** `cellBorderBottom` on every cell of a row draws one continuous
  line only when `cellsGridGap: 0`. Note the class comes from `theme.cellBorderSides` (default
  `border-b-zinc-950/15`), which a brand `dataCard` inherits from the DMS default style — a mockup's
  lighter `/05` hairline is a token change, not a config one.
- **Descriptions wrap, they don't truncate** (Card has no `truncate` knob — see `wrapText` above), so
  rows are not uniform height when a description is long. Budget the track widths for the *live*
  column width, which is usually narrower than the mockup's (side nav + rail).

### A "doorway"/product card — pinned, full-bleed CTA rail at the card's bottom edge

The other very common mockup shape, and the one that most often gets built as a lexical
section and then quietly fails: a card whose footer is a **sibling** of a `flex-1` content
block, so it is pinned to the bottom edge and runs edge to edge.

```html
<div class="flex flex-col h-full rounded-[8px] bg-white overflow-hidden">
  <div class="p-5 pt-7 flex-1">…icon+title · prose · links…</div>   <!-- grows -->
  <a class="h-11 px-5 flex items-center justify-between" style="background:#1F3F8F">…</a>
</div>
```

A lexical section cannot express this at all — its content is ONE top-anchored flow, so the
rail lands wherever the copy ends (measured 16–96px above the card's bottom edge on the four
NPMRDS Home doorways) and sits inside the lexical element's own `p-4`. As a Card it is three
knobs:

```js
// cells, top → bottom: [badge] [icon+title] [prose] [links] [CTA]
display: {
  cardStyle: 'context', cellsGridSize: 1, cellsGridGap: 0,
  cardsPadding: 0, cardsBgColor: '#ffffff',
  // the mockup's `mt-auto`: the row ABOVE the CTA eats the leftover height,
  // the CTA row stays content-sized (h-11). One `1fr`, always second-to-last.
  cellsRowsTemplate: 'max-content max-content max-content 1fr max-content',
  totalLength: 1, fetchMode: 'force',
}
// the CTA cell — a LINK cell with zero padding; the token is the whole rail
{ name: 'door_cta', origin: 'static', staticValue: 'Open Macro View',
  valueFontStyle: 'ctaRailBlue', isLink: true, location: '/macro',
  searchParams: 'none', show: true, hideHeader: true, cellPadding: 0 }
```

```js
// themev2 dataCard token — the rail itself. Additive; the cell peer of a `button` style.
ctaRailBlue: `${F_DISP} flex items-center justify-between h-11 px-5
  w-[calc(100%+2px)] -mx-px -mb-px rounded-b-[7px] bg-[#1F3F8F] hover:bg-[#16307A]
  text-white! uppercase text-[13px]! tracking-wide
  after:content-['→'] after:text-[#FACC15] after:text-[16px]`,
```

Why each piece:

- **`w-[calc(100%+2px)] -mx-px -mb-px`** = the full bleed. A v1-layout cell ships an always-on
  `border border-transparent`, which insets any child by 1px per side; the negative margins
  bleed back over it (the same trick `rail`'s `-mx-1` uses against section padding), and the
  **explicit width is mandatory** — see "A BOX-shaped token must carry its own width" above.
- **`rounded-b-[7px]`** = the card's INNER radius (an `8px`/1px-border section box), because
  nothing clips: the section's box is `overflow: visible`, so a square-cornered rail paints
  over the card's rounded corners. Give the rail its own bottom radius instead.
- **`flex`** also satisfies `resolveLinkAnchorStyle`'s "token declares its own display" guard,
  so the link-cell blockify fix leaves it alone.
- **no `h-full`** on the rail, and the `1fr` on the row above it — that pairing is what pins it.
  (`cellsVerticalAlign: 'stretch'` is the wrong tool here: it would spread the slack over
  *every* row, growing the prose and title rows too.)

Measured result (NPMRDS Home, four doorways, 2026-08-14): CTA gap to the card's bottom edge
**0px at every width 390 → 2048**, rail width = the card's full inner width, `overflowsBy: 0`.
The leftover height now pools **above** the rail (the mockup's `flex-1`) instead of below it.

Two things a Card still can't do here, both worth logging rather than faking:

- **A badge that floats over the card's top edge** (`absolute -top-3`). A cell cannot render
  outside its grid area; render it as the card's first cell and log the deviation (the smallest
  enrichment would be a section-level "tab" chrome option, not a Card key).
- **An inset hairline.** `cellBorderTop` draws on the cell's *border box*, so a rule inside a
  padded block runs full-bleed where the mockup insets it by its `p-5`.

### Composed card — fused header + flush table/body (mockup "panel" look)

To make a section header + its data section read as ONE card (a title with a divider, then the
table/rows below — the classic mockup panel), exploit the **`gap-0` band grid**: adjacent sections
share an edge, so spacing/borders live on the sections, not a gutter. Stack two sections:

- **Header section** (a `lexical` title, or a Card of static cells): all four borders + top radius.
  Its **bottom border is the divider**.
- **Body section** (`Card` or `Spreadsheet`): left/right/bottom borders + bottom radius, no top border,
  so it butts flush under the divider.

> ### ⚠ THE RULE FOR ANY MULTI-SECTION (fused) CARD — read this before building one
> On a `gap-0` band, **each section's `defaultPaddingStep` gutter sits OUTSIDE its border**, so it
> renders as a gray **gap between the boxes** — the sections do NOT fuse by default. To fuse N stacked
> sections into one card you must **zero every _interior_ edge**:
> - **First** section: keep its natural **top**, set `padding.bottom:'0'`.
> - **Every MIDDLE** section: set `padding:{ top:'0', bottom:'0' }` — **BOTH**. (Forgetting `bottom` on
>   a middle section is the #1 cause of "there's still a gap" — a 2-section recipe hides this because a
>   2-stack has no middle.)
> - **Last** section: set `padding.top:'0'` (add `bottom:'0'` too only if you want it flush at the very
>   bottom; otherwise its natural bottom is the space to whatever follows).
>
> This applies to EVERY page — it is not per-page tuning. Copy the `cardTop/cardMid/cardBot` triplet
> below verbatim and it's correct by construction; add a `bottom` border to each section that should
> show a **divider** line before the next.

```js
// Canonical fused-stack section styles. Reuse these; do not re-derive per page.
const cardTop = { bg:'white', border:{ top:true, left:true, right:true, bottom:true }, radius:{ tl:true, tr:true }, padding:{ bottom:'0' } };
const cardMid = { bg:'white', border:{ left:true, right:true, bottom:true },                                        padding:{ top:'0', bottom:'0' } }; // ← BOTH edges 0
const cardBot = { bg:'white', border:{ left:true, right:true, bottom:true }, radius:{ bl:true, br:true },           padding:{ top:'0' } };
// stack: cardTop → cardMid (×N, one per middle section) → cardBot. Each section's bottom border = the
// divider before the next. A 2-section card is just cardTop → cardBot (no cardMid).
```

A section can also carry `shadow: 'sm'|'md'` (sibling to `bg`/`border`/`radius`, same themed-key
shape — resolved via `theme.shadows`, author-set via the section toolbar's **Shadow** control).
Unset (`'none'`/absent) is the default, no shadow, byte-identical to before this knob existed. Added
2026-07-23 (report-page redesign Gap 03) because the granular per-side border/bg/radius path had no
way to add a drop shadow at all — only the legacy preset border strings (`border:'full'` etc.) baked
one in, and the toolbar never writes those. On a fused multi-section card, put `shadow` on every
section in the stack (top/mid/bot) so the compound card reads as one shadowed box, not a
shadow-per-segment stack.

For a **Spreadsheet** body, also set `display.tableStyle:'flush'` — the `flush` table style keeps the
`report` cell/header treatment but drops the table's own container border/rounding/shadow, so the
section's compound card is the only frame (otherwise you double-box: a card inside a card). For a
**Card** body, set `cardBorder:false` so per-record cards don't add their own boxes.

Spreadsheet column widths: give the fixed columns (ids, pills, dates) an explicit `size` (px) and
the **one flexible text column `stretch: true`** (size becomes its *minimum* → `minmax(size,1fr)`) so
the grid **fills the card** instead of leaving slack on the right; keep `autoResize:false` (auto-resize
makes ALL columns *equal*, which you don't want). Add `wrapText:true` on long-text columns (titles,
user stories) so they wrap instead of truncating. Lay out **text-left, pills-right** by ordering the
text/stretch column first and the fixed pill columns last with `justify:'right'`.

Editable status pills: a `status_pill` column with `allowEditInView:true` stays a pill in view and
becomes a single-select **on click** that *also renders pills* (the trigger and every menu row) — so
the pill look is preserved while editing. Scope editing per-column (don't set `display.allowEditInView`)
so only the status is editable, not the text columns.

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
theme.dataCard.layoutModel → 'v2' opts the style into the predictable box model
theme.dataCard.cellGutter  → (v2) the ONE ambient cell gutter, inline, overridable

display.cardsGridSize      → outer columns of records
display.cardsGridGap       → outer gap (v2 / pack-to-top: exactly the space between cards)
display.cardsGridPadding   → padding on the OUTER cards grid (the list's inset)
display.cardsVerticalAlign → 'top' | 'stretch' (unset = model default: v1 fill, v2 pack)
display.cardsPadding       → padding *inside the per-card surface* (legacy name)
display.cardsBgColor       → per-card background (overrides theme)
display.cardBorder         → toggle theme.cardBorder
display.cellsGridSize      → inner columns of cells inside one card
display.cellsGridGap       → inner gap (cellsRowGap / cellsColumnGap per axis)
display.cellsRowHeight     → fixed pixel row height for cells
display.cellsPadding       → padding on each cell wrapper (0 is a value and wins)
display.cellBorder         → toggle theme.itemBorder on each cell
display.cellsTracksTemplate → raw grid-template-columns string (wins over per-column cellWidth)
display.cellsRowsTemplate  → raw grid-template-rows string; names the EXPLICIT rows, so
                             'max-content' + cellsVerticalAlign:'stretch' = "spread the
                             slack but not into row 1"; '… 1fr' = the mockups' mt-auto

display.headerValueLayout = 'row'|'col'  → header beside or above value
display.reverse           → swap header/value order in 'col' mode
display.headerWidth/valueWidth → row-layout split percentages

columns[i].show          → render *and* SELECT
columns[i].selectOnly    → SELECT only, no cell (the loader-column tool)
columns[i].hideHeader    → suppress label
columns[i].hideValue     → DEPRECATED (BC-rendered; use selectOnly)
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
columns[i].wrapText      → Spreadsheet/Table only (Card.jsx ignores it; Card cells always wrap)

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

**A component whose own render is a fixed pixel size (e.g. AVL Graph's chart —
`GraphComponent.jsx`'s root is `w-full h-fit`, driven by `display.height`, a chart-lib
constraint, not a flex opt-out choice) still can't grow into the stretched box** — unlike
Card, whose root explicitly sets `flex:'1 1 auto'` and does grow. Report-page redesign Gap 03
(2026-07-23) hit this: a graph section stretched by a taller row sibling left dead space
below its Pagination/Attribution footer. Fixed with `mt-auto` on that footer `<div>` in
`dataWrapper/index.jsx` (both Edit/View blocks) — the unavoidable slack now sits between the
chart and the footer (pinned flush to the bottom edge) instead of below everything. No-op for
components that already fill (Card) since there's no slack left to redistribute.
