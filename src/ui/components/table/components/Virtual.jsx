import React, { useRef, useState, useLayoutEffect, useCallback } from "react";

// MeasuredRow: measures its height and reports back
function MeasuredRow({ index, onMeasure, children }) {
    const ref = useRef(null);

    useLayoutEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(([entry]) => {
            onMeasure(index, entry.contentRect.height);
        });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [index, onMeasure]);

    return <div ref={ref}>{children}</div>;
}

// VirtualList component
export function VirtualList({
                                items,
                                renderItem,
                                estimatedItemHeight = 50,
                                increaseViewportBy = { top: 0, bottom: 0 },
                                endReached, components
                            }) {
    const containerRef = useRef(null);
    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 });
    const heightsRef = useRef([]); // cached heights

    const getHeight = useCallback(
        (index) => heightsRef.current[index] ?? estimatedItemHeight,
        [estimatedItemHeight]
    );

    const getTotalHeight = useCallback(() => {
        return heightsRef.current.reduce((sum, h) => sum + h, 0) +
            (items.length - heightsRef.current.length) * estimatedItemHeight;
    }, [items.length, estimatedItemHeight]);

    const calculateRange = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;

        // Find start index
        let sum = 0;
        let start = 0;
        while (start < items.length && sum + getHeight(start) < scrollTop - increaseViewportBy.top) {
            sum += getHeight(start);
            start++;
        }

        // Find end index
        let end = start;
        let visibleSum = sum;
        while (end < items.length && visibleSum < scrollTop + viewportHeight + increaseViewportBy.bottom) {
            visibleSum += getHeight(end);
            end++;
        }

        setVisibleRange({ start, end: end - 1 });

        // endReached callback
        if (
            endReached &&
            scrollTop + viewportHeight >= getTotalHeight() - increaseViewportBy.bottom
        ) {
            endReached();
        }
    }, [items.length, getHeight, increaseViewportBy, getTotalHeight, endReached]);

    const handleMeasure = useCallback(
        (index, height) => {
            if (heightsRef.current[index] === height) return;
            heightsRef.current[index] = height;
            calculateRange();
        },
        [calculateRange]
    );

    useLayoutEffect(() => {
        calculateRange();
    }, [items.length, calculateRange]);

    // Compute padding
    // const paddingTop = heightsRef.current
    //     .slice(0, visibleRange.start)
    //     .reduce((sum, h) => sum + h, 0);
    // const paddingBottom = getTotalHeight() -
    //     paddingTop -
    //     heightsRef.current
    //         .slice(visibleRange.start, visibleRange.end + 1)
    //         .reduce((sum, h) => sum + h, 0);
    const paddingTop = Array.from({ length: visibleRange.start }).reduce(
        (sum, _, i) => sum + (heightsRef.current[i] ?? estimatedItemHeight),
        0
    );

    const paddingBottom = Array.from({ length: items.length - visibleRange.end - 1 }).reduce(
        (sum, _, i) => sum + (heightsRef.current[visibleRange.end + 1 + i] ?? estimatedItemHeight),
        0
    );



    return (
        <div
            ref={containerRef}
            onScroll={calculateRange}
            style={{ overflow: "auto", height: "100%" }}
        >
            {components?.Header?.()}
            <div style={{ paddingTop, paddingBottom }}>
                {Array.from(
                    { length: visibleRange.end - visibleRange.start + 1 },
                    (_, i) => {
                        const index = visibleRange.start + i;
                        return (
                            <MeasuredRow
                                key={index}
                                index={index}
                                onMeasure={handleMeasure}
                            >
                                {renderItem(index)}
                            </MeasuredRow>
                        );
                    }
                )}
                {components?.footer?.()}
            </div>
        </div>
    );
}