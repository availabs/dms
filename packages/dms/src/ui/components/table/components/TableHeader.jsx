import TableHeaderCell from "./TableHeaderCell";
import React, {memo, useMemo, useState} from "react";
import CardColumnPicker from '../../CardColumnPicker';

/**
 * For the currently visible column slice, compute pivot group header rows.
 *
 * Returns one array per grouping level (pivotColumns.length - 1 levels total).
 * Each array contains {label, span, isPivotGroup} entries covering attrsToRender.
 *
 * Non-pivot columns get a blank entry (span 1). Pivot group cells span all
 * consecutive leaf columns that share the same ancestor combo prefix.
 *
 * Because this operates on the already-sliced attrsToRender (virtual scroll
 * window), partial groups at the edges are handled naturally — they just get a
 * smaller span that covers only their visible leaf columns.
 */
function computePivotGroupRows(attrsToRender) {
    const firstMultiPivotCol = attrsToRender.find(
        c => c.origin === 'pivot_col' && c._pivotColumns?.length > 1
    );
    if (!firstMultiPivotCol) return [];

    const numLevels = firstMultiPivotCol._pivotColumns.length - 1;

    return Array.from({ length: numLevels }, (_, level) => {
        const groups = [];
        let i = 0;
        while (i < attrsToRender.length) {
            const col = attrsToRender[i];
            if (col.origin === 'pivot_col' && col._pivotCombo?.length > level) {
                const prefixKey = col._pivotCombo.slice(0, level + 1).join('\0');
                const label = col._pivotCombo[level];
                let span = 1;
                while (i + span < attrsToRender.length) {
                    const next = attrsToRender[i + span];
                    if (
                        next.origin === 'pivot_col' &&
                        next._pivotCombo?.slice(0, level + 1).join('\0') === prefixKey
                    ) {
                        span++;
                    } else break;
                }
                groups.push({ label, span, isPivotGroup: true });
                i += span;
            } else {
                groups.push({ label: '', span: 1, isPivotGroup: false });
                i++;
            }
        }
        return groups;
    });
}

export const Header = memo(function Header ({
    tableTheme, visibleAttrsWithoutOpenOut,
    numColSize, frozenCols, frozenColClass, selectedCols,
    isEdit, columns, display, controls, setState, colResizer, start, end,
    localFilterData, activeStyle
}) {

    const attrsToRender = visibleAttrsWithoutOpenOut.slice(start, end + 1);
    const [headerHovered, setHeaderHovered] = useState(false);

    const slicedGridTemplateColumns = useMemo(() => {
        // `_track` is each column's grid token: fixed `${size}px` for explicitly-sized
        // columns, `minmax(${default}px, 1fr)` for unsized ones so they stretch to fill.
        const cols = attrsToRender.map(c => c._track || `${c.size}px`).join(" ");
        return `${numColSize}px ${cols}`;
    }, [ start, end, attrsToRender, numColSize ]);

    // Group rows: one per pivot grouping level. Empty when only one pivot column.
    const pivotGroupRows = useMemo(() => computePivotGroupRows(attrsToRender), [attrsToRender]);

    const showPicker = isEdit && setState && controls?.inHeader;

    // Each header level (group rows + leaf row) shares this grid template so that
    // column widths and resize stay perfectly in sync across all rows.
    const innerGridStyle = { display: 'grid', gridTemplateColumns: slicedGridTemplateColumns };

    return (
        <>
            {/****************************************** Header begin ********************************************/}
            <div
                className={tableTheme.headerContainer}
                style={{
                    zIndex: 5,
                    // Override class's display:grid with flex-col so we can stack
                    // group rows above the leaf row as independent inner grids.
                    display: 'flex',
                    flexDirection: 'column',
                    gridColumn: `span ${attrsToRender.length + 2} / ${attrsToRender.length + 2}`
                }}
                onMouseEnter={() => setHeaderHovered(true)}
                onMouseLeave={() => setHeaderHovered(false)}
            >
                {/* ── Pivot group header rows (one per grouping level) ─────────── */}
                {pivotGroupRows.map((groups, level) => (
                    <div key={`pivot-group-${level}`} style={innerGridStyle}>
                        {/* blank gutter cell */}
                        <div
                            style={{ width: numColSize }}
                            className={`${tableTheme.headerCellContainer} ${tableTheme.headerCellContainerBg}`}
                        />
                        {groups.map((group, i) => (
                            <div
                                key={i}
                                style={{ gridColumn: `span ${group.span}` }}
                                className={
                                    group.isPivotGroup
                                        ? `${tableTheme.headerCellContainer} ${tableTheme.pivotGroupHeader}`
                                        : `${tableTheme.headerCellContainer} ${tableTheme.headerCellContainerBg}`
                                }
                            >
                                {group.label}
                            </div>
                        ))}
                    </div>
                ))}

                {/* ── Leaf header row (existing behavior) ──────────────────────── */}
                <div style={innerGridStyle}>
                    {/*********************** header left gutter *******************/}
                    <div className={tableTheme.headerLeftGutter} style={{width: numColSize}}>
                        <div key={'#'} className={`w-full ${tableTheme.thContainerBg} ${frozenColClass}`} />
                    </div>
                    {/******************************************&*******************/}

                    {attrsToRender
                        .map((attribute, i) => {
                            const isLast = i === attrsToRender.length - 1;
                            const fullIdx = columns.findIndex(c => c.name === attribute.name && c.isDuplicate === attribute.isDuplicate && c.copyNum === attribute.copyNum);

                            return (
                                <div
                                    key={i}
                                    className={`relative ${tableTheme.headerWrapper} ${frozenCols?.includes(i) ? tableTheme.headerWrapperFrozen : ''}`}
                                    style={{width: attribute._hasFixedSize ? attribute.size : undefined}}
                                >
                                    <div key={`controls-${i}`}
                                         className={`
                                            ${tableTheme.headerCellContainer}
                                            ${selectedCols.includes(i) ? tableTheme.headerCellContainerBgSelected : tableTheme.headerCellContainerBg}`}
                                    >
                                        {
                                            attribute._isActionsColumn ? null :
                                            <TableHeaderCell attribute={attribute}
                                                          isEdit={isEdit}
                                                          columns={columns}
                                                          display={display}
                                                          controls={controls}
                                                          setState={setState}
                                                          localFilterData={localFilterData}
                                                          activeStyle={activeStyle}
                                            />
                                        }
                                    </div>

                                    <div
                                        key={`resizer-${i}`}
                                        className={colResizer ? tableTheme.colResizer : 'hidden'}
                                        style={{ height: '100%', cursor: 'col-resize', position: 'relative', right: 0, top: 0 }}
                                        onMouseDown={colResizer ? colResizer(attribute) : () => {}}
                                    />

                                    {showPicker && isLast && (
                                        <CardColumnPicker
                                            insertAt={fullIdx !== -1 ? fullIdx + 1 : columns.length}
                                            columns={columns}
                                            sourceColumns={controls.sourceColumns}
                                            setState={setState}
                                            FormulaColumnModal={controls.FormulaColumnModal}
                                            CalculatedColumnModal={controls.CalculatedColumnModal}
                                            parentHovered={headerHovered}
                                            triggerClassName="absolute top-0 bottom-0 right-0 translate-x-full flex items-center z-10 w-5"
                                        />
                                    )}
                                </div>
                            );
                        })}
                </div>
            </div>
            {/****************************************** Header end **********************************************/}
        </>
    )
})
