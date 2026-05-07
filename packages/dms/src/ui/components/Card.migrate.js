// Card unified-grid migration.
//
// The legacy Card had two layout modes selected by `display.compactView`:
//   compactView=true  ("row mode")  → outer was a CSS grid, inner stacked linearly
//   compactView=false ("cell mode") → outer stacked linearly,  inner was a CSS grid
//
// The new Card always renders both as real CSS grids. There is no mode. This
// module reads any legacy `compactView` value at hydration time, routes the
// old single set of grid settings onto the matching new grid, defaults the
// other axis to a 1-column stack (so the migrated card looks identical to
// before), and strips every legacy key. After migration the renderer reads
// only the new keys; if migration didn't run for some reason the card simply
// renders with all-default grid settings.

const LEGACY_DISPLAY_KEYS = [
    'compactView', 'gridSize', 'gridGap', 'padding', 'colGap',
    'rowHeight', 'bgColor', 'addBorder', 'removeBorder',
];

const NEW_DISPLAY_KEYS = [
    'cardsGridSize', 'cardsGridGap', 'cardsPadding', 'cardsBgColor',
    'cellsGridSize', 'cellsGridGap', 'cellsRowHeight', 'cellsPadding',
    'cardBorder', 'cellBorder',
];

export function migrateCardDisplay(display) {
    if (!display) return display;

    const hasNew = NEW_DISPLAY_KEYS.some(k => display[k] !== undefined);
    if (hasNew) return display;

    const hasLegacy = LEGACY_DISPLAY_KEYS.some(k => display[k] !== undefined);
    if (!hasLegacy) return display;

    const wasCompact = !!display.compactView;
    const out = { ...display };

    if (wasCompact) {
        // Old "row mode": outer was the cards grid; inner stacked linearly.
        out.cardsGridSize = display.gridSize;
        out.cardsGridGap = display.gridGap;
        out.cardsPadding = display.padding;
        out.cardsBgColor = display.bgColor;
        out.cellsGridSize = 1;
        out.cellsGridGap = display.colGap;
        out.cardBorder = !display.removeBorder;
        out.cellBorder = !!display.addBorder;
    } else {
        // Old "cell mode": inner was the cells grid; outer stacked linearly.
        out.cellsGridSize = display.gridSize;
        out.cellsGridGap = display.gridGap;
        out.cellsRowHeight = display.rowHeight;
        out.cellsPadding = display.padding;
        out.cardsGridSize = 1;
        out.cardsGridGap = display.gridGap;
        out.cardBorder = !!display.addBorder;
        out.cellBorder = !display.removeBorder;
    }

    LEGACY_DISPLAY_KEYS.forEach(k => delete out[k]);
    return out;
}

export function migrateCardColumn(col) {
    if (!col) return col;
    let mutated = false;
    const out = { ...col };

    const carry = (oldKey, newKey) => {
        if (out[oldKey] !== undefined) {
            if (out[newKey] === undefined) out[newKey] = out[oldKey];
            delete out[oldKey];
            mutated = true;
        }
    };

    carry('cardSpan', 'cellSpan');
    carry('cardRowSpan', 'cellRowSpan');
    carry('bgColor', 'cellBgColor');
    carry('pb', 'cellPaddingBottom');
    carry('borderBelow', 'cellBorderBelow');

    return mutated ? out : col;
}

export function migrateCardState(state) {
    if (!state) return state;
    const display = migrateCardDisplay(state.display);
    const columns = Array.isArray(state.columns)
        ? state.columns.map(migrateCardColumn)
        : state.columns;
    if (display === state.display && columns === state.columns) return state;
    return { ...state, display, columns };
}
