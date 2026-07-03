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
        cardsBgColor, cardsPadding,
    } = display;
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
        // Pack cells to the top: when the card box is taller than its cells,
        // keep content top-aligned with the slack at the bottom (no slack →
        // identical to stretch).
        alignContent: 'start',
        ...(cellsRowHeight ? { gridAutoRows: `${cellsRowHeight}px` } :
            hasRowSpan ? { gridAutoRows: 'minmax(0, auto)' } : {}),
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

// One cell's inline style. Precedence for padding:
// side-specific > cellPadding > cellsPadding > (v2) theme cellGutter.
// fullBleed column types force 0 — they own their own visual surface.
export function resolveCellStyle({ attr = {}, hints = {}, display = {}, cellsPadding, layoutModelV2, cellGutter }) {
    const fullBleed = !!hints.fullBleed;
    const span = `span ${attr.cellSpan || 1}`;
    const { imageMargin } = attr;

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
        ...(imageMargin !== undefined && !isNaN(imageMargin) ? { marginTop: `${imageMargin}px` } : {}),
        ...definedStyle('backgroundColor', attr.cellBgColor),
        ...(hints.height ? { height: `${hints.height}px` } : {}),
        // Vertical alignment of the cell within its grid row (per-column
        // cellVAlign wins; display-level cellsVAlign is the ambient default).
        ...((attr.cellVAlign || display?.cellsVAlign)
            ? { alignSelf: vAlignSelf[attr.cellVAlign || display.cellsVAlign] || (attr.cellVAlign || display.cellsVAlign) }
            : {}),
        // Cap the cell's width (spanned tracks still reserve their share, but
        // the content box is clamped and positioned by `justify`).
        ...((attr.cellMaxWidth != null && attr.cellMaxWidth !== '')
            ? { maxWidth: typeof attr.cellMaxWidth === 'number' ? `${attr.cellMaxWidth}px` : attr.cellMaxWidth,
                justifySelf: { left: 'start', right: 'end', center: 'center' }[attr.justify] || 'start' }
            : {}),
    };
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
