/**
 * Card box model — pure resolvers for every piece of rendered geometry.
 *
 * A Card is two nested grids. Four knobs own ALL spacing; everything else is
 * content-sized:
 *
 *   cards grid:  gap = cardsGridGap    padding = cardsGridPadding
 *   cells grid:  gap = cellsGridGap (cellsRowGap/cellsColumnGap per axis)
 *                padding = cardsPadding (the per-card surface inset)
 *   cell:        padding = cellPadding (column) ?? cellsPadding (display)
 *                          ?? theme cellGutter (v2 only)
 *
 * Explicit values — including 0 — always win; nothing invisible adds or
 * absorbs space. Card.jsx consumes these resolvers inside its useMemos; tests
 * exercise them directly (see packages/dms/tests/cardLayout.test.js).
 *
 * Two layout models, selected by the resolved dataCard theme style:
 *
 *   v1 (default, BC): cards grid fills its box (`minmax(max-content, 1fr)`
 *   rows — slack is distributed BETWEEN card rows unless
 *   `cardsVerticalAlign: 'top'`); every cell carries an always-on
 *   `border border-transparent` (+2px); the ambient cell gutter comes from
 *   whatever padding class the theme bakes into `headerValueWrapper`.
 *
 *   v2 (`layoutModel: 'v2'` on the theme style): cards grid rows are
 *   content-sized and packed to the top (`cardsVerticalAlign: 'stretch'`
 *   opts back into fill); no transparent border (edit-mode hover uses an
 *   outline, which takes no layout space); the ambient cell gutter is the
 *   theme's single `cellGutter` value, emitted inline so a theme class can
 *   never silently win over an explicit knob.
 */

export const isLayoutModelV2 = (theme) => theme?.layoutModel === 'v2';

// 'top' = rows content-sized, packed, gap between cards is exactly
// cardsGridGap. 'stretch' = legacy fill (slack distributed into card rows).
export const resolveCardsPackMode = ({ cardsVerticalAlign, layoutModelV2 }) =>
    layoutModelV2
        ? (cardsVerticalAlign === 'stretch' ? 'stretch' : 'top')
        : (cardsVerticalAlign === 'top' ? 'top' : 'stretch');

// Outer cards grid (records spread across the section).
export function resolveCardsGridStyle({ display = {}, imageTopMargin, layoutModelV2 }) {
    const { cardsGridSize, cardsGridGap, cardsGridPadding, cardsVerticalAlign } = display;
    const packCardsTop = resolveCardsPackMode({ cardsVerticalAlign, layoutModelV2 }) === 'top';
    return {
        display: 'grid',
        gridTemplateColumns: `repeat(${cardsGridSize || 1}, minmax(0, 1fr))`,
        gap: cardsGridGap,
        // Padding on the OUTER cards grid — the whole list's inset from its
        // box (vs `cardsPadding`, which pads inside EACH per-card surface).
        // Number → px; a CSS shorthand string passes through ('0 0 16px' =
        // bottom-only). imageTopMargin still wins the top edge when set.
        ...(cardsGridPadding != null && cardsGridPadding !== '' ? { padding: cardsGridPadding } : {}),
        ...(imageTopMargin ? { paddingTop: `${imageTopMargin}px` } : {}),
        // Fill behaviour: when the section is `height:'fill'` it gives this a
        // flex-column parent with a definite height → `flex:1` fills it. In an
        // `auto` (content-height) parent, `flex` is ignored and
        // `minmax(max-content,1fr)` resolves to max-content, so nothing changes.
        flex: '1 1 auto',
        minHeight: 0,
        gridAutoRows: packCardsTop ? 'max-content' : 'minmax(max-content, 1fr)',
        ...(packCardsTop ? { alignContent: 'start' } : {}),
    };
}

// Inner cells grid track sizing. `cellsTracksTemplate` (raw
// grid-template-columns string) wins outright; otherwise each visible column
// may declare `cellWidth` and the walker below mirrors sparse auto-flow's
// track cursor — the FIRST column to land on a track imposes its width on it.
// Other tracks default to `minmax(0, 1fr)`. Intentionally row-span-naïve.
export function resolveCellTracks({ cellsTracksTemplate, cellsGridSize, cellsWithoutSpanLength, visibleColumns = [] }) {
    if (typeof cellsTracksTemplate === 'string' && cellsTracksTemplate.trim()) {
        return cellsTracksTemplate;
    }
    const trackCount = cellsGridSize || cellsWithoutSpanLength || 1;
    const tracks = new Array(trackCount).fill('minmax(0, 1fr)');
    let col = 1;
    for (const c of visibleColumns) {
        const span = +c.cellSpan || 1;
        if (col + span - 1 > trackCount) col = 1; // wrap to a new row
        if (c.cellWidth && tracks[col - 1] === 'minmax(0, 1fr)') {
            const w = String(c.cellWidth).trim();
            // 'fluid' is an alias for the default; '' clears any prior claim.
            if (w && w !== 'fluid') {
                tracks[col - 1] = w;
                // Cell-width semantics: a column's `cellWidth` is the size of
                // the *cell*, not just its first track. When `cellSpan > 1`,
                // collapse the additional spanned tracks (only when still
                // unclaimed) so the resulting cell is exactly `w` wide.
                for (let i = 1; i < span; i++) {
                    const idx = col - 1 + i;
                    if (idx < trackCount && tracks[idx] === 'minmax(0, 1fr)') {
                        tracks[idx] = '0px';
                    }
                }
            }
        }
        col += span;
        if (col > trackCount) col = 1; // wrap explicitly when the cell exits the last track
    }
    return tracks.join(' ');
}

// Inner cells grid (attribute cells inside one record-card).
export function resolveCellsGridStyle({ display = {}, gridTemplateColumns, hasRowSpan }) {
    const {
        cellsGridGap, cellsRowGap, cellsColumnGap, cellsRowHeight,
        cardsBgColor, cardsPadding, cellsVerticalAlign, cellsRowsTemplate,
    } = display;
    // `cellsVerticalAlign: 'stretch'` opts the cells grid into filling the card
    // height — the cells equivalent of `cardsVerticalAlign: 'stretch'`. The
    // leftover height is distributed INTO the rows instead of pooling as one
    // blank strip below the last row, so a `height:'fill'` card sitting beside a
    // taller sibling still lands its tinted footer on its own bottom edge.
    // Default (unset/'top') keeps the legacy top-packed, content-height rows.
    const stretchCells = cellsVerticalAlign === 'stretch';
    return {
        display: 'grid',
        gridTemplateColumns,
        gap: cellsGridGap,
        // `gap` sets row + column gap together; cellsRowGap / cellsColumnGap
        // override one axis independently. BC: unset → fall through to `gap`.
        ...(cellsRowGap != null && cellsRowGap !== '' ? { rowGap: cellsRowGap } : {}),
        ...(cellsColumnGap != null && cellsColumnGap !== '' ? { columnGap: cellsColumnGap } : {}),
        backgroundColor: cardsBgColor,
        // Legacy naming wrinkle: `cardsPadding` pads the CELLS grid inside
        // each card (the per-card surface inset), not the cards grid.
        padding: cardsPadding,
        // Row-axis distribution of the card's leftover height. Default 'start'
        // packs cells to the top and pools the slack below the last row.
        //
        // 'stretch' is the opt-in: CSS Grid §12.9 ("Stretch auto Tracks")
        // divides the remaining free space EQUALLY among tracks whose max
        // sizing function is `auto` — which is exactly "stretch the cells to
        // fit inside the card". It is inert unless there is free space, so a
        // card whose rows already fill the box is untouched.
        //
        // Why not `gridAutoRows: minmax(max-content, 1fr)` (what this key used
        // to emit): a FLEXIBLE track is not stretched, it is *equalized* — the
        // flex fraction is resolved against the largest track's base size, so
        // every row is sized to the TALLEST row's max-content and the card
        // grows instead of the gap shrinking (measured on NPMRDS Home § 02:
        // 395.8 → 751.3px, and § 01's 49px header strip → 56px). Distribution
        // is align-content's job, not the track sizing function's.
        alignContent: stretchCells ? 'stretch' : 'start',
        // Row SIZE is resolved independently of that distribution, and
        // `cellsRowHeight` wins it outright: with fixed-px rows there are no
        // auto-max tracks for §12.9 to grow, so 'stretch' has nothing to
        // distribute and behaves as 'start' (leftover stays at the bottom).
        // `hasRowSpan`'s `minmax(0, auto)` composes with 'stretch' — `auto`
        // max ⇒ the rows do take their equal share.
        ...(cellsRowHeight ? { gridAutoRows: `${cellsRowHeight}px` } :
            hasRowSpan ? { gridAutoRows: 'minmax(0, auto)' } : {}),
        // `cellsRowsTemplate` — raw grid-template-rows, the exact peer of
        // `cellsTracksTemplate` on the column axis, and the answer to "spread the
        // slack but NOT into THIS row". It names the EXPLICIT rows; everything past
        // the template stays implicit, so `cellsRowHeight` / the row-span
        // `gridAutoRows` above still size the rest.
        //
        // The two recipes it exists for (both measured on NPMRDS Home § 01):
        //   'max-content'  + stretch → row 1 (a header strip) is content-sized, so
        //       §12.9 skips it (its max sizing function is max-content, not `auto`)
        //       and ONLY the rows below it split the leftover. Header held at 49px
        //       while the measure rows went 50.4 → 55.2 at 1480; plain `stretch`
        //       inflated that header to 52.8 (and to 83.8 at 1280).
        //   'max-content … 1fr' → the mockups' `mt-auto`: every row keeps its
        //       authored rhythm and ONE row absorbs everything (measured 50.4,
        //       50.4, 50.4, 167.9 at 1280).
        //
        // ⚠ Same ceiling as `cellsTracksTemplate`: it is an INLINE style, so one
        // template governs every viewport — no responsive collapse.
        ...(typeof cellsRowsTemplate === 'string' && cellsRowsTemplate.trim()
            ? { gridTemplateRows: cellsRowsTemplate } : {}),
    };
}

// Distinguishes "author cleared the field" ('' / null / undefined → fall
// through) from "author typed 0" (0 is a value). Numeric strings coerce.
const definedOr = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : +v);

// Only spread DEFINED style keys. Listing side-specific longhands as
// `paddingTop: undefined, …` after the `padding` shorthand doesn't read as
// "absent" all the way down — the committed CSSOM ends up dropping the
// shorthand too, so an explicit `cellsPadding: 0` never reached the DOM and
// the theme's class padding silently won. (The explicit-zero contract.)
const definedStyle = (key, v) => (v === undefined ? {} : { [key]: v });

// Per-cell vertical alignment → CSS align-self on the cell (a grid item).
const vAlignSelf = { top: 'start', center: 'center', bottom: 'end', baseline: 'baseline' };

// Where the cell's CONTENT sits INSIDE the cell — a different axis from the map
// above, which is why it is a separate key (`cellContentVAlign` /
// `cellsContentVAlign`) rather than another value on `cellVAlign`: an author can
// set both, and they mean different things.
//
//   cellVAlign        → align-self: the CELL's placement in its grid row. `center`
//                       SHRINK-WRAPS the cell, so its `cellBorderBottom` floats at
//                       the cell's own bottom and a row's rules break into stubs at
//                       different heights (measured on NPMRDS Home § 01: the three
//                       parts of one row landed on 3 different y, 13 rule segments
//                       instead of 5 continuous ones).
//   cellContentVAlign → emits NO align-self, so the grid default `stretch` stands —
//                       the cell still fills the row and every cellBorder* still
//                       draws on the row's real edge — and moves only what is inside.
//
// The cell's chrome is a flex box, so "vertical" is a different property depending
// on its direction: `justify-content` (main axis) when it stacks, `align-items`
// (cross axis) when it is a row. Card.jsx resolves that with resolveCellFlexRow.
const vAlignContent = { top: 'flex-start', center: 'center', bottom: 'flex-end' };

// The cell wrapper's ACTUAL flex direction. `headerValueLayout` names it when set;
// unset means "whatever the theme's `headerValueWrapper` bakes" — the dms default,
// avail, wcdb and mny wrappers are a bare `flex` (⇒ row), transportnyv2 and tessera
// bake `flex flex-col` (⇒ column).
//
// ⚠ NOT the same question as `isRowLayout` in Card.jsx (`!headerValueLayout ||
// headerValueLayout === 'row'`), which reads "unset ⇒ row" for the header/value
// WIDTH split. In a flex-col theme that is the opposite of what the DOM does, and
// emitting the wrong property is not inert: measured on NPMRDS Home § 01 (2026-08-14),
// `align-items: center` on those flex-col cells left the content top-anchored
// (above/below 15 / 50.5, unmoved) AND shrink-wrapped it horizontally (content
// 42 → 29px wide, left inset 16 → 22.5).
//
// A variant-prefixed `md:flex-col` is deliberately NOT matched — one cell wrapper
// switching direction per breakpoint would make "which property is vertical"
// viewport-dependent, which an inline style cannot express.
const FLEX_COL = /(?:^|\s)!?flex-col(?:-reverse)?!?(?:\s|$)/;
export function resolveCellFlexRow({ headerValueLayout, headerValueWrapper }) {
    if (headerValueLayout) return headerValueLayout === 'row';
    return !FLEX_COL.test(headerValueWrapper || '');
}

// One cell's inline style. Precedence for padding:
// side-specific > cellPadding > cellsPadding > (v2) theme cellGutter.
// fullBleed column types force 0 — they own their own visual surface.
export function resolveCellStyle({ attr = {}, hints = {}, display = {}, cellsPadding, layoutModelV2, cellGutter, cellFlexRow }) {
    const fullBleed = !!hints.fullBleed;
    const span = `span ${attr.cellSpan || 1}`;
    const { imageMargin } = attr;

    // Content-inside-the-cell alignment (see vAlignContent). Resolved up here
    // because WHICH property carries it depends on the cell's flex direction.
    // Unrecognized values pass through verbatim, exactly like cellVAlign's.
    const contentVAlign = attr.cellContentVAlign || display?.cellsContentVAlign;
    const contentVAlignCss = contentVAlign ? (vAlignContent[contentVAlign] || contentVAlign) : undefined;

    // Ambient (section-level) padding. v2 always resolves to a concrete value
    // — display cellsPadding, else the theme's single cellGutter, else 0 —
    // so the emitted inline padding always beats any theme class. v1 keeps
    // the legacy fall-through (unset → theme class gutter applies) and passes
    // the raw value through uncoerced, exactly as before.
    const ambient = layoutModelV2
        ? definedOr(cellsPadding, definedOr(cellGutter, 0))
        : cellsPadding;

    const padOverride = (key, fallback) => {
        if (fullBleed) return 0;
        return definedOr(attr[key], fallback);
    };

    // Per-cell MARGIN, mirroring the padding set above: side-specific wins over
    // the `cellMargin` shorthand. Unlike padding there is no section-level
    // ambient and no theme gutter — a margin is always a deliberate, local
    // nudge, so an unset key emits nothing at all.
    //
    // Negative values are the point of this knob, not an abuse of it. A cell
    // with a negative bottom margin lets the cells AFTER it ride up over it,
    // which is how a full-bleed image cell becomes a backdrop with its
    // caption/title overlaid — the design's "photo with the identity pinned to
    // its lower third" — using ordinary Card columns instead of a composite
    // column type that would hard-code the whole arrangement. Grid items paint
    // in DOM order, so the later cells land on top without needing a z-index.
    //
    // NB `imageMargin` (a marginTop, image columns only) predates this and
    // still works; an explicit `cellMarginTop`/`cellMargin` wins over it.
    // Emitted as four longhands rather than a `margin` shorthand plus
    // overrides: the explicit-zero contract noted above bites the same way for
    // margin, and `cellMargin` is fully expressed by feeding all four sides.
    const marginSide = (key) => {
        const v = definedOr(attr[key], definedOr(attr.cellMargin, undefined));
        return v === undefined ? undefined : `${v}px`;
    };

    return {
        // cardHints provide a column type's *default* positioning; an
        // author-supplied `cellSpan` / `cellRowSpan` is explicit intent and
        // wins over the type-level hint.
        gridColumn: attr.cellSpan ? span : (hints.spanFullColumns ? '1 / -1' : span),
        ...(attr.cellRowSpan ? { gridRow: `span ${attr.cellRowSpan}` } :
            hints.spanFullRows ? { gridRow: '1 / -1' } : {}),
        ...definedStyle('padding', padOverride('cellPadding', ambient)),
        ...definedStyle('paddingTop', padOverride('cellPaddingTop', undefined)),
        ...definedStyle('paddingRight', padOverride('cellPaddingRight', undefined)),
        ...definedStyle('paddingBottom', padOverride('cellPaddingBottom', undefined)),
        ...definedStyle('paddingLeft', padOverride('cellPaddingLeft', undefined)),
        // Legacy image-only top margin, kept so existing cards are unchanged.
        ...(imageMargin !== undefined && !isNaN(imageMargin) ? { marginTop: `${imageMargin}px` } : {}),
        // …and the general set, which wins where it is set.
        ...definedStyle('marginTop', marginSide('cellMarginTop')),
        ...definedStyle('marginRight', marginSide('cellMarginRight')),
        ...definedStyle('marginBottom', marginSide('cellMarginBottom')),
        ...definedStyle('marginLeft', marginSide('cellMarginLeft')),
        // `background`, not `backgroundColor`: a plain colour behaves
        // identically through the shorthand, and it additionally lets a cell
        // take a GRADIENT. That is what turns "a cell with a negative margin
        // over an image cell" into a usable scrim — dark at the bottom, clear
        // at the top — so type can be set over a photograph without a bespoke
        // component. The colour picker still writes plain colours here; a
        // gradient is typed in by an author who wants one.
        ...definedStyle('background', attr.cellBgColor),
        // Per-cell accent border — a coloured LEFT rule (the stat-strip
        // `border-l-4 border-<color>` look). Sibling of cellBgColor: an inline
        // style from the author-supplied colour, applied right here where the
        // background is. Unset/empty → no key → BC (every existing cell stays
        // byte-identical). Default 4px solid; left accent only, kept minimal.
        ...(attr.cellBorderColor ? { borderLeft: `4px solid ${attr.cellBorderColor}` } : {}),
        ...(hints.height ? { height: `${hints.height}px` } : {}),
        // Vertical alignment of the cell within its grid row (per-column
        // cellVAlign wins; display-level cellsVAlign is the ambient default).
        ...((attr.cellVAlign || display?.cellsVAlign)
            ? { alignSelf: vAlignSelf[attr.cellVAlign || display.cellsVAlign] || (attr.cellVAlign || display.cellsVAlign) }
            : {}),
        // Vertical alignment of the CONTENT inside the (still stretched) cell —
        // per-column cellContentVAlign wins, display-level cellsContentVAlign is
        // the ambient default. Emits no align-self on purpose (see vAlignContent):
        // the cell keeps filling its row, so the row's rules stay one line.
        ...(contentVAlignCss
            ? (cellFlexRow ? { alignItems: contentVAlignCss } : { justifyContent: contentVAlignCss })
            : {}),
        // Cap the cell's width (spanned tracks still reserve their share, but
        // the content box is clamped and positioned by `justify`).
        ...((attr.cellMaxWidth != null && attr.cellMaxWidth !== '')
            ? { maxWidth: typeof attr.cellMaxWidth === 'number' ? `${attr.cellMaxWidth}px` : attr.cellMaxWidth,
                justifySelf: { left: 'start', right: 'end', center: 'center' }[attr.justify] || 'start' }
            : {}),
    };
}

// Tailwind's display utilities — any variant prefix (`sm:`, `hover:`, …) and
// either `!` important position — plus `line-clamp-*`, which is a display
// utility in disguise (it sets `display: -webkit-box`), and the arbitrary
// property form `[display:…]`. A token carrying ANY of these declares its own
// display and must keep it.
const DECLARES_DISPLAY =
    /(?:^|\s)(?:[^\s:]*:)*!?(?:inline-flex|inline-block|inline-grid|inline-table|inline|flex|grid|table|flow-root|contents|hidden|list-item|line-clamp-[^\s]+|\[display:[^\]]*\])!?(?=\s|$)/;

// A link cell renders `value div → inline <a>/<Link> → text`, and the token
// (`valueFontStyle`) goes on the ANCHOR — putting it on both painted a phantom
// second box for box-shaped tokens (`chip`, `btnPrimary`). But an INLINE box's
// `line-height` does not size the line box it sits in: the containing block's
// STRUT does. So the token's `leading-*` — and its `text-[..px]`, since an
// inherited unitless line-height resolves against the element's own font-size —
// was inert, and every line of a link cell cost whatever `theme.value` inherits
// (16px/24px in transportnyv2) no matter what the token said.
//
// Blockifying the anchor makes its own line-height the strut of the line boxes
// it generates, which is exactly how a NON-link cell already behaves (there the
// token sits on the value div). One inline property, no class is ever repeated,
// so the phantom-box fix is untouched.
//
// Guard: never override a display the token declared itself. `inline-flex … h-9`
// IS the button, and `line-clamp-2` needs `-webkit-box` to clamp — forcing
// `block` on either breaks it (measured: the clamped § 02 descriptions unclamped
// from 34.5px to 59.8px, and MNY's `linkColValue` is itself a `flex` pill).
// Unset/undeclared-leading tokens are unaffected in height; the only tokens that
// move are the ones whose own typography the strut was overriding.
export function resolveLinkAnchorStyle(linkClass) {
    return DECLARES_DISPLAY.test(` ${linkClass || ''} `) ? undefined : { display: 'block' };
}

// The header/value width split in `row` layout. A hidden header must not
// reserve its `headerWidth` share (and a hidden value must not reserve the
// header's cap) — the visible part gets the full cell.
export function resolveHeaderValueWidths({ isRowLayout, hideHeader, hideValue, headerWidth, valueWidth }) {
    return {
        headerMaxWidth: isRowLayout && !hideHeader && !hideValue ? `${headerWidth || 50}%` : undefined,
        valueMaxWidth: isRowLayout && !hideHeader && !hideValue ? `${valueWidth || 50}%` : undefined,
    };
}

// Cell chrome class. v1 keeps the always-on `border border-transparent`
// fallback (layout-stable but +2px on every cell); v2 drops it and renders
// the edit-mode hover affordance as an outline (no layout space), layered on
// top of whatever non-hover chrome applies so hovering never shifts geometry.
export function resolveCellBorderClass({ editHover, cellBorder, sidedBorder, theme = {}, layoutModelV2 }) {
    if (layoutModelV2) {
        const base = cellBorder ? (theme.itemBorder || '') : '';
        const outline = editHover ? (theme.itemEditOutline || 'outline outline-blue-300 -outline-offset-1') : '';
        return `${base} ${outline}`.trim();
    }
    if (editHover) return 'border border-blue-300';
    if (cellBorder) return theme.itemBorder;
    if (sidedBorder) return '';
    return 'border border-transparent';
}

// Human-readable resolved padding for the edit-mode `data-pad` attribute —
// one devtools glance answers "where is this space coming from".
export function describeResolvedPadding(style) {
    if (!style) return 'theme';
    const sides = [
        ['t', style.paddingTop], ['r', style.paddingRight],
        ['b', style.paddingBottom], ['l', style.paddingLeft],
    ].filter(([, v]) => v !== undefined).map(([k, v]) => `${k}:${v}`);
    const base = style.padding !== undefined ? String(style.padding) : 'theme';
    return sides.length ? `${base} ${sides.join(' ')}` : base;
}
