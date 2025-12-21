import React, {
    useRef,
    useState,
    useLayoutEffect,
    useCallback, useEffect,
} from "react";

function MeasuredRow({
                         row,
                         onMeasureRow,
                         children,
                     }) {
    const ref = useRef(null);

    useLayoutEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(([entry]) => {
            onMeasureRow(entry.contentRect.height);
        });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [row, onMeasureRow]);

    return <div ref={ref}>{children}</div>;
}

export function VirtualList({
                                rowCount,
                                columnCount,
                                columnSizes,
                                estimatedRowHeight = 40,
                                estimatedColumnWidth = 120,
                                increaseViewportBy = {
                                    top: 0,
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                },
                                renderItem,
                                components,
                                endReached
                            }) {
    const containerRef = useRef(null);
    const isFetchingRef = useRef(false);
    const rowHeights = useRef([]);

    const initialEndCol = Math.min(columnCount - 1, 10);
    const initialEndRow = Math.min(rowCount - 1, 10);

    const [rows, setRows] = useState({ start: 0, end: initialEndRow });
    const [cols, setCols] = useState({ start: 0, end: initialEndCol });


    const getRowHeight = (i) =>
        rowHeights.current[i] ?? estimatedRowHeight;

    const getColWidth = (i) => columnSizes[i] ?? estimatedColumnWidth;

    const getTotalHeight = () =>
        Array.from({ length: rowCount }).reduce(
            (s, _, i) => s + getRowHeight(i),
            0
        );

    const calculateRange = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const clientW = el.clientWidth || (estimatedColumnWidth * 5);
        const { scrollTop, scrollLeft, clientHeight, clientWidth } = el;

        // ROWS
        let y = 0;
        let startRow = 0;
        while (
            startRow < rowCount &&
            y + getRowHeight(startRow) <
            scrollTop - increaseViewportBy.top
            ) {
            y += getRowHeight(startRow++);
        }

        let endRow = startRow;
        let y2 = y;
        while (
            endRow < rowCount &&
            y2 <
            scrollTop +
            clientHeight +
            increaseViewportBy.bottom
            ) {
            y2 += getRowHeight(endRow++);
        }

        // COLS
        // COLS
        let x = 0;
        let startCol = 0;
        while (
            startCol < columnCount &&
            x + getColWidth(startCol) < scrollLeft - increaseViewportBy.left
            ) {
            x += getColWidth(startCol);
            startCol++;
        }

        let endCol = startCol;
        let x2 = x;

        while (
            endCol < columnCount &&
            x2 < scrollLeft + clientW + increaseViewportBy.right
            ) {
            x2 += getColWidth(endCol);
            endCol++;
        }

// ensure at least one column
        if (endCol <= startCol) endCol = Math.min(startCol + 1, columnCount);


        setRows({ start: startRow, end: Math.min(Math.max(endRow - 1, startRow), rowCount - 1) });
        setCols({ start: startCol, end: Math.min(Math.max(endCol - 1, startCol), columnCount - 1) });

        // endReached callback
        if (
            endReached && !isFetchingRef.current &&
            scrollTop + clientHeight >= getTotalHeight() - increaseViewportBy.bottom
        ) {
            isFetchingRef.current = true;
            console.log('end reached')
            endReached();
        }

    }, [
        rowCount,
        columnCount,
        increaseViewportBy,
    ]);

    useEffect(() => {
        isFetchingRef.current = false;
    }, [rowCount]);


    const onMeasure = useCallback(
        (row, _col, height) => {
            if (rowHeights.current[row] !== height) {
                rowHeights.current[row] = height;
            }
            calculateRange();
        },
        [calculateRange]
    );

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        // Only run if container has measurable size
        const runCalculate = () => {
            if (el.clientHeight && el.clientWidth) {
                calculateRange();
            }
        }

        runCalculate(); // first attempt
        const ro = new ResizeObserver(runCalculate);
        ro.observe(el);
        return () => ro.disconnect();
    }, [rowCount, columnCount, columnSizes, calculateRange]);


    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const ro = new ResizeObserver(() => {
            calculateRange();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const paddingTop = Array.from({ length: rows.start }).reduce(
        (s, _, i) => s + getRowHeight(i),
        0
    );

    const paddingBottom =
        getTotalHeight() -
        paddingTop -
        Array.from(
            { length: rows.end - rows.start + 1 },
            (_, i) => getRowHeight(rows.start + i)
        ).reduce((a, b) => a + b, 0);

    const getTotalWidth = () =>
        Array.from({ length: columnCount }).reduce(
            (s, _, i) => s + getColWidth(i),
            0
        );

    const paddingLeft = Array.from({ length: cols.start }).reduce(
        (s, _, i) => s + getColWidth(i),
        0
    );

    const paddingRight =
        getTotalWidth() -
        paddingLeft -
        Array.from(
            { length: cols.end - cols.start + 1 },
            (_, i) => getColWidth(cols.start + i)
        ).reduce((a, b) => a + b, 0);

    return (
        <div
            ref={containerRef}
            onScroll={calculateRange}
            style={{
                overflow: "auto",
                height: "100%",
                width: "100%",
            }}
        >

            <div
                style={{
                    paddingTop,
                    paddingBottom,
                    paddingLeft,
                    paddingRight
                }}
            >
                {components?.Header?.({start: cols.start, end: cols.end})}

                {Array.from(
                    { length: rows.end - rows.start + 1 },
                    (_, r) => {
                        const rowIndex = rows.start + r;
                        return (
                            <MeasuredRow
                                key={rowIndex}
                                row={rowIndex}
                                onMeasureRow={(height) =>
                                    onMeasure(rowIndex, null, height)
                                }
                            >
                                {renderItem(
                                    rowIndex,
                                    cols.start,
                                    cols.end
                                )}
                            </MeasuredRow>
                        );
                    }
                )}

                {components?.bottomFrozen?.({start: cols.start, end: cols.end})}

                {components?.Footer?.()}
            </div>
        </div>
    );
}
