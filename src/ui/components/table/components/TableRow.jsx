import React, {memo, useContext, useMemo, useState} from "react";
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
        visibleAttrsWithoutOpenOut, visibleAttrsWithoutOpenOutLength,
        openOutAttributes, showGutters, striped, hideIfNullOpenouts,
    } = useContext(TableStructureContext);
    const [showOpenOut, setShowOpenOut] = useState(false);
    const numColSize = showGutters ? numColSizeDf : 0;

    const attrsToRender = visibleAttrsWithoutOpenOut
        .slice(startCol, endCol + 1);

    const slicedGridTemplateColumns = useMemo(() => {
        const cols = attrsToRender
            .map(c => `${c.size}px`)
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

    return (
        <>
            <div
                ref={rowRef}
                key={`data-${index}`}
                className={rowClass}
                style={{
                    display: 'grid',
                    gridTemplateColumns: slicedGridTemplateColumns,
                    gridColumn: `span ${attrsToRender.length + 2} / ${attrsToRender.length + 2}`
                }}
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
                    {showGutters && (isTotalRow ? 'T' : index + 1)}
                </div>
                {attrsToRender
                    .map((attribute, i) => {
                        const attrI = startCol + i;
                        return <TableCell
                            key={`cell-${index}-${attrI}`}
                            index={index} attrI={attrI}
                            item={rowData}

                            isTotalCell={isTotalRow}
                            showOpenOutCaret={openOutAttributes.length && attrI === 0}
                            showOpenOut={showOpenOut} setShowOpenOut={setShowOpenOut}
                            attribute={attribute}
                        />
                    })}
            </div>

            {/********************************************************************************************************/}
            {/************************************************ open out row ******************************************/}
            {/********************************************************************************************************/}
            { showOpenOut ?
                <div className={theme.openOutContainerWrapper} style={{backgroundColor: theme.openOutContainerWrapperBgColor}} onClick={() => setShowOpenOut(false)}>
                    <div className={theme.openOutContainer} onClick={e => e.stopPropagation()}>

                        <div className={theme.openOutCloseIconContainer}>
                            <div className={theme.openOutCloseIconWrapper} onClick={() => setShowOpenOut(false)}>
                                <Icon icon={theme.openOutCloseIcon} height={16} width={16}/>
                            </div>
                        </div>

                        {/* First column as title of the open out drawer*/}
                        <TableCell
                            key={`open-out-title`}
                            attribute={visibleAttrsWithoutOpenOut[0]}
                            openOut={true}
                            index={index}
                            item={rowData}
                            openOutTitle={true}
                        />

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
        </>
    )
})
