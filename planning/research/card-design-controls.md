# Card Component — Design Controls & Custom Column Types

Research note (not a plan-of-record). Triggered by two concrete WCDB design-system patterns that the current `Card` section can't faithfully reproduce:

1. **DJ portrait card** (`patterns.html` "04 · DIRECTORY") — a tile with a 200px gradient banner across the top, large overlaid initials, a "SINCE 2021" badge pinned to the corner, and stacked text below.
2. **Spin row with album cover** (an extension of "03 · LISTING") — an image to the left that spans three rows of text (artist / track / album) on the right.

The first pushes on **column-type expressiveness**; the second pushes on **layout span axes** (rows in addition to columns). This note inventories the Card's current control surface, names the gaps, and sketches incremental ways to close them without ballooning component complexity.

## Current state — Card component

### Two layout modes share one component

`ui/components/Card.jsx` renders one of two modes selected by `display.compactView`:

| `compactView` value | UI label (Card.config.jsx:285) | What it is | User term |
|---|---|---|---|
| `true` | "Each Card Represents **a row**" | Top-level CSS grid (`gridSize` columns wide), each card a tile. Inside the tile, columns stack vertically (`flex flex-col`). | "row mode" (each tile *is* a row of data) |
| `false` | "Each Card Represents **a cell**" | Cards stacked vertically (`flex flex-col`). Inside each card, columns lay out as a sub-grid where each column can `cardSpan` N grid columns. | "cell mode" |

This is the pivot point for almost every other control. Many `inHeader` controls are gated by `display.compactView`:

- `borderBelow`, `pb` (padding-below) — row mode only (`Card.config.jsx:163-164`).
- `cardSpan`, per-column `bgColor` — cell mode only (`Card.config.jsx:167, 214`).
- Display-level `bgColor`, `colGap` — row mode only (`Card.config.jsx:292, 310`).
- The "Row Border" / "Cell Border" labels in `more` even **swap meanings** depending on `compactView` (`Card.config.jsx:304-307`) — currently working but a sign that the dual-mode story is leaking through.

### Column-level controls (`Card.config.jsx:74-215`)

The `inHeader` array is the per-column control list. Concretely it covers:

- **Format**: `justify`, `formatFn` (comma / dollar / abbreviate / date / title / icon / color), `headerFontStyle`, `valueFontStyle`, `hideHeader`, `hideValue`.
- **Layout**: `borderBelow`, `pb` (compact only), `cardSpan` (simple only), `bgColor`.
- **Behavior**: `allowEditInView`, `isLink` (+ `isLinkExternal`, `linkText`, `location`, `searchParams`), `isImg` (+ `imageSrc`, `imageLocation`, `imageExtension`, `imageSize`, `imageMargin`).
- **Misc**: `sort`, `description`, copy/paste format, move/remove via the toolbar at `Card.config.jsx:74-114`.

`isImg` is the only existing "render this column as something other than its column-type component" mechanism. It's hardcoded into `CardColumnField` (`Card.jsx:346-352`) — there is no pluggable seam for new visual treatments.

### Display-level controls (`Card.config.jsx:284-311`)

- `compactView` (the row-vs-cell toggle).
- Grid: `gridSize`, `gridGap`, `padding`, `colGap`.
- Defaults for columns: `headerValueLayout` (row/col), `reverse`, `headerWidth`, `valueWidth`.
- `showAttribution`, `hideIfNull`.
- Borders, pagination, page size.
- Display-level `bgColor` (compact only).

### Column types (`ui/columnTypes/index.jsx`)

The shared registry maps a small **rendering** vocabulary to `{ EditComp, ViewComp }` pairs:

```
text, textarea, lexical, number, date, timestamp, boolean,
dms-format, select, multiselect, radio, checkbox, switch, default
```

`Card.jsx:246` looks up the comp:

```js
const Comp = ColumnTypes[attribute.type]?.[editMode ? 'EditComp' : 'ViewComp'] || DefaultComp;
```

Two important properties of this registry today:

1. **It is closed**. The export at `ui/index.js:41` is a frozen object literal. There is no `registerColumnType` analogue to `registerComponents()` (the page-section registry).
2. **It is purely about value rendering**. Column types do not declare layout hints (full-bleed, fixed height, spans), card-level slots (banner / body / footer), or theme keys. The Card itself owns all of that.

### Card theme (`ui/components/card.theme.jsx`)

`dataCardTheme` follows the standard `{ options: { activeStyle }, styles: [...] }` shape. The default style holds flat-keyed Tailwind class strings:

- Wrappers: `mainWrapperCompactView`, `mainWrapperSimpleView`, `subWrapper(+CompactView/SimpleView)`, `headerValueWrapper(+CompactView/SimpleView)`, `componentWrapper`.
- Surface: `header`, `value`, `valueWrapper`, `description`, `itemBorder`, `headerValueWrapperBorderBelow`.
- Direction primitives: `itemFlexCol`, `itemFlexRow`, `itemFlexColReverse`, `itemFlexRowReverse`.
- Visual modifiers: `iconAndColorValues`, edit/save/cancel buttons.
- Image size scale: `imgXS` … `img8XL` (exposed via the per-column `imageSize` select).
- Justify: `justifyTextLeft/Center/Right`.

`textSettings` is layered underneath dataCard at runtime (`Card.jsx:680`) so `text*` keys (`textXS`, `text2XLBold`, etc.) used as `headerFontStyle` / `valueFontStyle` resolve through the global type ramp unless dataCard overrides them.

### Themed registration channels — what already exists

- **Page components**: `theme.pageComponents` is auto-registered into `componentRegistry` at `patterns/page/siteConfig.jsx:51-58`. This is the precedent for theme-extensible registries — it's why downstream sites can ship their own section types (graph variants, page-specific cards, etc.) without touching the dms package.
- **Widgets**: `registerWidget(name, def)` (`ui/widgets`) — used by themes to register top-nav / side-nav widgets like `NavLeftStyleWidget`.
- **Lexical inline themes**: `theme.lexical.styles[*]` carries node-class maps that the Lexical editor consumes.

There is no equivalent registration channel for `columnTypes`. A WCDB-specific column type would need to be added to `ui/columnTypes/index.jsx` directly today.

## What WCDB design system needs

### DJ portrait card (`design_handoff/patterns.html` + `scripts/wcdb-patterns.jsx:65-89`)

```
┌──────────────────────────────────────┐
│                          SINCE 2021  │  ← mono pill, top-right of banner
│                                      │
│                                      │  ← linear-gradient(135deg) computed
│   HM                                 │     from `hue` data → 200px tall
│                                      │     initials overlaid in display
│                                      │     italic at 88px
├──────────────────────────────────────┤
│ Halftone                             │  ← name (display italic, 24px)
│ @halftone                            │  ← handle (mono, 11px)
│                                      │
│ Late Modernism                       │  ← tagline (sans, 13px)
└──────────────────────────────────────┘
```

What the design pattern needs from a card:

1. A column whose **visual is computed from the row's data** (here: `hue`), not from a static image URL — `isImg` doesn't cover this.
2. That column **bleeds to the card edges** (no header label, no inset padding, no rounded inner) — `hideHeader` gets close, but `headerValueWrapper` still applies padding.
3. The column has a **fixed visual height** (200px) regardless of value — currently no equivalent control.
4. A second column ("SINCE 2021") **pinned to the corner** of the first column — currently impossible without composing layers manually.
5. Body columns below in **mixed typography** (display italic / mono / sans). The font size already works via `headerFontStyle`/`valueFontStyle` referencing the WCDB `textSettings`, but the *family* selection is implicit in the `text*` tokens. This part is already mostly solved — the WCDB theme's `textXL+` keys flip to display italic by design (`src/themes/wcdb/wcdb_theme.js:153-171`).

### Album cover spans 3 text rows

Pattern:

```
┌─────────┬──────────────────────────┐
│         │ Stereolab                │   ← row 1: artist
│  cover  ├──────────────────────────┤
│         │ Lo Boob Oscillator       │   ← row 2: track
│         ├──────────────────────────┤
│         │ Refried Ectoplasm        │   ← row 3: album
└─────────┴──────────────────────────┘
```

In cell mode (`compactView=false`), the inner sub-grid uses `gridTemplateColumns: repeat(N, minmax(0, 1fr))` and rows flow implicitly. `cardSpan` lets the cover claim, say, `span 1` of the columns; what's missing is `cardRowSpan` to let it claim 3 rows. CSS Grid already supports this — the gap is only the control surface and the missing `gridRow` style binding in `Card.jsx:394-400`.

### Other design-system patterns the same machinery enables

- "On-air ticker" (`patterns.html` "01") — pill + mono time + italic artist + sans album, all on one row. Already mostly achievable with cell-mode + per-column font tokens.
- "Schedule cell" (`02`) — tile with mono time, italic show, sans-w/-host, tag pills at bottom. Achievable with row-mode, but the "live" red border treatment is currently row-state-driven (no per-row conditional theming). Out of scope for this note.
- "Frequency stat" (`09`) — uppercase-meta label + huge italic value. Already achievable with two columns + hideHeader/hideValue + font tokens.

The two patterns above exercise *layout span* and *column-type pluggability*. Nailing these two well covers a large fraction of the design system.

## Gap analysis

| Want | Have today | Gap |
|---|---|---|
| Row span in cell mode | `cardSpan` (col span only) | Missing `cardRowSpan` + the grid wiring |
| Column type that renders a computed banner (gradient from `hue`) | `isImg` (static URL or directory lookup) | No pluggable column-type extension; banner needs full-bleed/fixed-height seam |
| Theme can add column types | Registry is a frozen export | No `registerColumnType` / `theme.columnTypes` channel |
| Pin a column to a corner of another | Z-axis / overlay positioning | Not modeled — every column is in the flow |
| Different layouts in row mode (e.g. banner + body) | All columns stack `flex flex-col` | No "slot" or "internal grid" option for row mode |

## Proposals

The cheapest wins live at the bottom of the gap table; the deeper ones (slots, overlays) would benefit from the cheap ones landing first so we know what they actually need to compose with.

### P1 — Row span in cell mode (~small)

The minimum viable change. Mirror `cardSpan` with `cardRowSpan` (same key shape, same control), wire it into `Card.jsx:394-400`:

```js
const style = {
    gridColumn: span,
    gridRow: compactView ? undefined : `span ${attr.cardRowSpan || 1}`,
    padding: compactView ? undefined : padding,
    paddingBottom: compactView && attr.pb ? +attr.pb : undefined,
    marginTop: `${imageMargin}px`,
    backgroundColor: compactView ? undefined : attr.bgColor,
};
```

Card.config.jsx adds one more control next to `cardSpan` (`:167`):

```js
{ type: 'input', inputType: 'number', label: 'Row Span', key: 'cardRowSpan',
  displayCdn: ({ display }) => !display.compactView },
```

Caveat: `subWrapperStyle` (`Card.jsx:705-711`) only sets `gridTemplateColumns`. CSS Grid will auto-flow rows, and a row span > rows-needed will create empty rows. That's the intended behavior (the album-cover example *wants* 3 rows of content next to it), but worth flagging in admin UX so users don't get surprise empty cells.

Mirror the same change in `spreadsheet/config.jsx` for parity, since spreadsheet copy/pastes the same per-column format key set (`spreadsheet/config.jsx:158-160`).

**Tradeoff**: tiny patch, near-zero risk. Doesn't help the DJ portrait pattern at all.

### P2 — Open the column-type registry to themes (~small-to-medium)

Add a `registerColumnType(name, def)` API and a `theme.columnTypes` auto-registration channel that mirrors `theme.pageComponents`.

Sketch:

```js
// ui/columnTypes/index.jsx — instead of frozen object, mutable registry
const registry = { text, textarea, /* ... */ };
export function registerColumnType(name, def) { registry[name] = def; }
export function getColumnTypes() { return registry; }
export default registry;
```

```js
// patterns/page/siteConfig.jsx (or similar bootstrap)
if (theme.columnTypes) {
    Object.entries(theme.columnTypes).forEach(([k, v]) => registerColumnType(k, v));
}
```

A theme could then ship:

```js
// src/themes/wcdb/columnTypes/portraitBanner.jsx
export const PortraitBannerView = ({ value, attribute, formatFunctions }) => {
    const hue = Number(value) || 0.5;
    const c1 = `oklch(0.30 0.04 ${hue * 360})`;
    const c2 = `oklch(0.55 0.08 ${hue * 360 + 60})`;
    return (
        <div className="h-[200px] flex items-end p-[22px] relative"
             style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
            {attribute.initialsFrom && (
                <span className={attribute.initialsClass}>
                    {String(attribute.initialsFrom).split(' ').map(s => s[0]).join('')}
                </span>
            )}
        </div>
    );
};
```

**Decisions to make**:

1. Is this a `theme.columnTypes` channel (auto-registered, like `pageComponents`) or an imperative `registerColumnType` (called from app bootstrap, like `registerWidget`)? Both are cheap; `theme.columnTypes` keeps everything declarative and is what the WCDB theme would prefer.
2. Should column types declare metadata about Card-level behavior — e.g. `fullBleed: true`, `defaultHideHeader: true`, `cardLayoutHints: { spanFull: true }`? See P3.
3. How do these column types appear in the admin "type" dropdown for new columns? `ColumnManager.jsx:152` consults `columnTypes`. Once it's a registry, this should "just work", but worth verifying the admin select is rebuilt on every render rather than memoized at module-load time.

**Tradeoff**: The plumbing is straightforward and matches an existing pattern (`pageComponents`). The bigger question is what new types are *for* — see P3.

### P3 — Let column types opt out of the field chrome (~medium)

Once P2 lands, the column type can render anything inside the value slot — but `CardColumnField` still wraps it in `theme.headerValueWrapper`, `theme.header`, padding, etc. To do a full-bleed banner, the wrapper needs to step back.

Two ways to spell it:

**3a. Per-column flag** (no change to column-type metadata):

```js
// new inHeader controls
{ type: 'toggle', label: 'Full Bleed', key: 'fullBleed', displayCdn: ({ isEdit }) => isEdit }
```

`CardColumnField` checks `attr.fullBleed` and skips the inner padding / removes the header wrapper / forces `gridColumn: 1 / -1` so it spans the whole sub-grid.

**3b. Column-type-declared layout hints** (column type knows it's full-bleed):

```js
// ui/columnTypes/portraitBanner.config.js
export default {
    EditComp: PortraitBannerEdit,
    ViewComp: PortraitBannerView,
    cardHints: {
        fullBleed: true,         // skip headerValueWrapper padding/header
        spanFullColumns: true,   // gridColumn: 1 / -1
        height: 'fixed',         // optional pre-set sizing
        defaultHideHeader: true, // when added as a column, default hideHeader=true
    },
};
```

`CardColumnField` reads these hints from the resolved column type to pick its wrapper.

**Recommendation**: 3b. The hints belong with the column type (a banner is *always* full-bleed regardless of who consumes it), and it keeps the `inHeader` control list from growing further. 3a is fine as an escape hatch when a generic column wants full-bleed without a custom type.

### P4 — Card-level "layout" with named slots (~medium-to-large)

The DJ portrait card pattern is fundamentally a **two-region** layout (banner above, body below). Trying to express that with `flex flex-col` + per-column flags works, but it's fragile — any column added to the wrong "slot" breaks the visual.

A scoped step up: introduce a `display.cardLayout` axis:

```js
// new display control in Card.config.jsx 'more'
{ type: 'select', label: 'Card Layout', key: 'cardLayout', defaultValue: 'stacked',
  options: [
      { label: 'Stacked', value: 'stacked' },         // current behavior
      { label: 'Banner + Body', value: 'banner_body' },
      // future: 'media_left', 'split', etc.
  ],
  displayCdn: ({ display }) => display.compactView /* row mode only */ },
```

Each layout maps to a fixed slot list. Per column, a `slot` key picks where it goes. In `banner_body`:

- Columns with `slot: 'banner'` render in the top region (full-bleed by default, fixed height).
- Columns with `slot: 'overlay'` render absolutely positioned over the banner, with a `placement` (`top-right`, `bottom-left`, etc.) — this is how the "SINCE 2021" pill lands.
- Columns with `slot: 'body'` (default) render below in the existing `flex flex-col`.

Card.jsx switches on `display.cardLayout` to choose its inner-render strategy. The `stacked` case is the existing code path — zero behavioral change for current cards.

**Tradeoff**: This is the heaviest of the proposals. It introduces a new axis users have to learn, and it touches the Card's render path. Worth doing once we have at least two distinct card layouts in production design needs (DJ portrait card + at least one more — schedule cell? show hero?). Until then P2+P3 cover most of the value via clever column-type packaging.

### P5 — `_replace` arrays for theme styles & related plumbing (`out of scope` here)

Themes that want to redefine card behavior structurally (not just classes) can already do so via the `theme.dataCard` block (see `src/themes/wcdb/wcdb_theme.js:236-248`). What they can't do is replace the `styles` array wholesale. `_replace` (`useTheme.js:50-87`) is the existing escape hatch. No change proposed — flagged here only because P2/P3/P4 will tempt themes to want more theme-side control.

## Sequencing recommendation

The order minimizes complexity exposure:

1. **P1 (row span)** first — smallest viable change, unblocks the album-cover pattern and any other "cell mode wants a 2D grid" use case. Land it independently.
2. **P2 (open registry)** next — makes column types extensible without committing to a layout overhaul. By itself, lets a theme ship arbitrary value-rendering. The DJ portrait card *body* (initials, name, handle, tagline) becomes achievable as a row-mode card with a `portrait_banner` column type that ignores its outer chrome via inline styles.
3. **P3 (column-type hints)** if doing P2 reveals friction with the field chrome (which it almost certainly will for the gradient banner). Hints are a small structural addition once the registry is open.
4. **P4 (card layouts with slots)** only when a second design pattern emerges that genuinely wants overlays / multiple regions. Defer until that case is concrete enough to drive the slot vocabulary.

P1 + P2 together are a small, low-risk set of changes that unlock the bulk of the WCDB patterns. P3 is the natural follow-on. P4 is the real complexity step and should wait for a second forcing function.

## Open questions

- **Column-type discoverability in admin.** Today `ColumnManager.jsx` lists every entry of `ColumnTypes` in a select. Once themes register types, the admin UI surfaces theme-specific types in a generic place. Acceptable? Or should theme-registered types be tagged so the picker can group/filter them ("WCDB types", "Generic types")?
- **Edit-mode rendering for visual columns.** A `portrait_banner` column has no meaningful edit experience — what's the input for "hue"? A number scrub, a swatch picker, or punt to a plain numeric `EditComp`? Likely fine to start with the plain numeric edit and let the theme override per-column-type if needed.
- **Spreadsheet parity.** Spreadsheet shares many column controls with Card (justify, formatFn, fontStyles, link/img, etc.). Custom column types should presumably render in spreadsheet too, but spreadsheet's row-as-table layout is much more rigid than Card's. Out of scope here, but worth keeping in view — a `cardHints` namespace on the column-type definition keeps the door open for `spreadsheetHints` later.
- **Dual-mode controls smell.** The Card's row-mode-vs-cell-mode pivot drives a lot of conditional `displayCdn` in the controls. P4 (card layouts) potentially generalizes this — a "Banner + Body" layout is just one of many possible inner-card grid shapes, of which the current "stacked" and "sub-grid" are two specific ones. Worth revisiting the row/cell labels and option labels (`Card.config.jsx:285-286`) once a third layout exists; right now the labels are confusing (the option says "a row" maps to `compactView=true`, but the rendering treats those as tile cells in a grid).

## Files to touch (when implementation lands)

- `ui/components/Card.jsx` — span style, full-bleed wrapper logic, layout switch.
- `ui/components/card.theme.jsx` — additional theme keys for new layouts (e.g. `bannerWrapper`, `slotOverlay`).
- `ui/columnTypes/index.jsx` — open the registry, expose `registerColumnType`, document `cardHints` shape.
- `patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — `cardRowSpan` control; per-layout `slot` / `placement` controls (P4); copy/paste shape needs to include the new keys (`Card.config.jsx:55-65`).
- `patterns/page/siteConfig.jsx` — auto-register `theme.columnTypes` like it does `theme.pageComponents` (`siteConfig.jsx:51-58`).
- `src/themes/wcdb/` — add a `columnTypes/` directory and reference it from `theme.columnTypes`. Once P3 lands, port DJ portrait card as the first user.
- `patterns/page/components/sections/ColumnManager.jsx` — verify the admin "add column" picker rebuilds from the live registry rather than a memoized snapshot.

For the spreadsheet parallel: `spreadsheet/config.jsx` should mirror `cardRowSpan` and any other shared column keys to keep copy-paste-format working between sections.
