import React, {memo, useContext, useEffect, useMemo, useState} from "react";
import {numColSize as numColSizeDf } from "../../../../patterns/page/components/sections/components/ComponentRegistry/spreadsheet/constants"
import {TableCell} from "./TableCell";
import Icon from "../../Icon"
import {TableStructureContext} from "../index";

export const TableRow = memo(function TableRow ({
    index, rowData={},
    isRowSelected, // used only to set bg for row num
    isTotalRow,
    startCol, endCol, rowRef, theme
}) {
    // const rowData = rows[index];
    const {
        visibleAttrsWithoutOpenOut=[], visibleAttrsWithoutOpenOutLength,
        openOutAttributes, showGutters, striped, hideIfNullOpenouts,
        onRowMouseEnter, onRowMouseLeave, onRowMouseClick,
        onRowDragStart, onRowDragOver, onRowDrop, onRowDragEnd,
        openOutDefaultOpen,
    } = useContext(TableStructureContext);
    const [showOpenOut, setShowOpenOut] = useState(!!openOutDefaultOpen);
    useEffect(() => {
        if (openOutDefaultOpen != null) setShowOpenOut(openOutDefaultOpen);
    }, [openOutDefaultOpen]);
    const numColSize = showGutters ? numColSizeDf : 0;

    const attrsToRender = visibleAttrsWithoutOpenOut
        .slice(startCol, endCol + 1);

    const slicedGridTemplateColumns = useMemo(() => {
        // `_track`: fixed `${size}px` for explicitly-sized columns, `minmax(default, 1fr)`
        // for unsized ones so they stretch to fill leftover width (see table/index.jsx).
        const cols = attrsToRender
            .map(c => c._track || `${c.size}px`)
            .join(" ");

        return `${numColSize}px ${cols}`;
    }, [
        startCol,
        endCol,
        visibleAttrsWithoutOpenOut,
        numColSize
    ]);
    const isDragging = false;
    const rowClass = `${isTotalRow ? theme.totalRow : ``} ${isDragging ? `select-none` : ``} ${striped ? theme.stripedRow : ``}`;
    const actionsColExists = attrsToRender.find(a => a._isActionsColumn);
    // Whether any column declares itself the openOut trigger (e.g. sectionsChip).
    // Falls back to the legacy first-column behaviour when none does.
    const hasDesignatedTrigger = visibleAttrsWithoutOpenOut.some(a => a.openOutTrigger);
    return (
        <div ref={rowRef}>
            <div
                key={`data-${index}`}
                className={rowClass}
                style={{
                    display: 'grid',
                    gridTemplateColumns: slicedGridTemplateColumns,
                    gridColumn: `span ${attrsToRender.length + 2} / ${attrsToRender.length + 2}`
                }}
                onClick={onRowMouseClick ? () => onRowMouseClick(rowData) : undefined}
                onMouseEnter={onRowMouseEnter ? () => onRowMouseEnter(rowData) : undefined}
                onMouseLeave={onRowMouseLeave || undefined}
                draggable={!!onRowDragStart}
                onDragStart={onRowDragStart ? e => onRowDragStart(e, rowData) : undefined}
                onDragOver={onRowDragOver ? e => onRowDragOver(e, rowData) : undefined}
                onDrop={onRowDrop ? e => onRowDrop(e, rowData) : undefined}
                onDragEnd={onRowDragEnd ? e => onRowDragEnd(e, rowData) : undefined}
            >
                <div key={'#'}
                     className={`${theme.gutterCellWrapper} ${isRowSelected ? theme.gutterCellWrapperSelected : theme.gutterCellWrapperNotSelected}`}
                     style={{width: numColSize}}
                    // onClick={onClickRowNum}
                    // onMouseDown={e => setSelection && setIsDragging && handleMouseDown({
                    //     e,
                    //     index: index,
                    //     setSelection,
                    //     setIsDragging,
                    //     startCellCol,
                    //     startCellRow,
                    //     selection
                    // })}
                    // onMouseMove={e => setSelection && handleMouseMove({
                    //     e,
                    //     index: index,
                    //     isDragging,
                    //     startCellCol,
                    //     startCellRow,
                    //     setSelection
                    // })}
                    // onMouseUp={e => setIsDragging && handleMouseUp({setIsDragging})}
                >
                    {showGutters && (isTotalRow ? 'T' : String(index + 1).padStart(2, '0'))}
                </div>
                {attrsToRender
                    .map((attribute, i) => {
                        const attrI = startCol + i;
                        // Designated trigger column (e.g. sectionsChip with openOutTrigger:true) takes
                        // priority over the legacy first-column caret when hasDesignatedTrigger is true.
                        const showCaret = openOutAttributes.length && (
                            hasDesignatedTrigger
                                ? !!attribute.openOutTrigger
                                : (actionsColExists ? attrI === 1 : attrI === 0)
                        );
                        return <TableCell
                            key={`cell-${index}-${attrI}`}
                            index={index} attrI={attrI}
                            item={rowData}

                            isTotalCell={isTotalRow}
                            showOpenOutCaret={showCaret}
                            showOpenOut={showOpenOut} setShowOpenOut={setShowOpenOut}
                            attribute={attribute}
                        />
                    })}
            </div>

            {/********************************************************************************************************/}
            {/************************************************ open out row ******************************************/}
            {/********************************************************************************************************/}
            { showOpenOut ?
                <div
                    className={theme.openOutContainerWrapper}
                    style={theme.openOutContainerWrapperBgColor && theme.openOutContainerWrapperBgColor !== 'transparent'
                        ? {backgroundColor: theme.openOutContainerWrapperBgColor}
                        : undefined}
                    onClick={theme.openOutBelowRow ? undefined : () => setShowOpenOut(false)}
                >
                    <div className={theme.openOutContainer} onClick={e => e.stopPropagation()}>

                        <div className={theme.openOutCloseIconContainer}>
                            <div className={theme.openOutCloseIconWrapper} onClick={() => setShowOpenOut(false)}>
                                <Icon icon={theme.openOutCloseIcon} height={16} width={16}/>
                            </div>
                        </div>

                        {/* First column as title of the open out drawer — suppressed in below-row style */}
                        {!theme.openOutHideTitle && (
                            <TableCell
                                key={`open-out-title`}
                                attribute={actionsColExists ? visibleAttrsWithoutOpenOut[1] : visibleAttrsWithoutOpenOut[0]}
                                openOut={true}
                                index={index}
                                item={rowData}
                                openOutTitle={true}
                            />
                        )}

                        {/* Open out columns */}
                        {openOutAttributes
                            .filter(attribute => {
                                if(hideIfNullOpenouts){
                                    let value = rowData[attribute.normalName] || rowData[attribute.name]
                                    return Array.isArray(value) ? value.length : value;
                                }
                                return true;
                            })
                            .map((attribute, openOutAttrI) => {
                                const attrI = visibleAttrsWithoutOpenOutLength + 1 + openOutAttrI;
                                return (
                                    <div key={`data-open-out-${index}`}
                                         className={''} >
                                        <TableCell
                                            isTotalCell={isTotalRow}
                                            key={`cell-${index}-${attrI}`}
                                            attribute={attribute}
                                            openOut={true}
                                            index={index}
                                            item={rowData}
                                        />
                                    </div>
                                )
                            })}
                    </div>
                </div> : null
            }
        </div>
    )
})
