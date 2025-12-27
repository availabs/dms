import React, {memo, useContext, useMemo, useState} from "react";
import {numColSize as numColSizeDf, gutterColSize as gutterColSizeDf, } from "../../../../patterns/page/components/selector/ComponentRegistry/spreadsheet/constants"
import {TableCell} from "./TableCell";
import Icon from "../../Icon"
import {TableStructureContext} from "../index";

export const TableRow = memo(function TableRow ({
                                                    index, rowData={},
                                                    isRowSelected, // used only to set bg for row num
                                                    isTotalRow,
                                                    openOutContainerWrapperClass, openOutContainerClass,
                                                    startCol, endCol, rowRef
                                                }) {
    // const rowData = rows[index];
    const {
        visibleAttrsWithoutOpenOut,
        visibleAttrsWithoutOpenOutLength,
        openOutAttributes,
        showGutters,
        striped,
        hideIfNullOpenouts,
    } = useContext(TableStructureContext);
    const [showOpenOut, setShowOpenOut] = useState(false);
    const numColSize = showGutters ? numColSizeDf : 0;
    const gutterColSize = showGutters ? gutterColSizeDf : 0;

    // const gridTemplateColumns = useMemo(
    //     () =>
    //         `${numColSize}px ${visibleAttrsWithoutOpenOut
    //             .map((v) => (v.size ? `${v.size}px` : `${defaultColumnSize}px`))
    //             .join(" ")} ${gutterColSize}px`,
    //     [numColSize, gutterColSize, visibleAttrsWithoutOpenOut, defaultColumnSize]
    // );

    const attrsToRender = visibleAttrsWithoutOpenOut
        .slice(startCol, endCol + 1);

    const slicedGridTemplateColumns = useMemo(() => {
        const cols = attrsToRender
            .map(c => `${c.size}px`)
            .join(" ");

        return `${numColSize}px ${cols} ${gutterColSize}px`;
    }, [
        startCol,
        endCol,
        visibleAttrsWithoutOpenOut,
        numColSize,
        gutterColSize
    ]);
    const isDragging = false;

    return (
        <>
            <div
                ref={rowRef}
                key={`data-${index}`}
                className={
                    `grid
                ${rowData.totalRow ? `sticky bottom-0 z-[1]` : ``} ${isDragging ? `select-none` : ``}
                ${striped ? `odd:bg-gray-50` : ``} ${rowData.totalRow ? `bg-gray-100` : ``}`
                }
                style={{
                    gridTemplateColumns: slicedGridTemplateColumns,
                    gridColumn: `span ${attrsToRender.length + 2} / ${attrsToRender.length + 2}`
                }}
            >
                <div key={'#'}
                     className={` flex text-xs items-center justify-center cursor-pointer sticky left-0 z-[1]
                             ${isRowSelected ? 'bg-blue-100 text-gray-900' : 'bg-gray-50 text-gray-500'}`}
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
                    {showGutters && (rowData.totalRow ? 'T' : index + 1)}
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

                <div className={'flex items-center border'}>
                    <div key={'##'}
                         className={`bg-gray-50 h-full flex shrink-0 justify-between`}
                         style={{width: numColSize}}
                    > {` `}</div>
                </div>
            </div>

            {/********************************************************************************************************/}
            {/************************************************ open out row ******************************************/}
            {/********************************************************************************************************/}
            { showOpenOut ?
                <div className={openOutContainerWrapperClass} style={{backgroundColor: '#00000066'}} onClick={() => setShowOpenOut(false)}>
                    <div className={openOutContainerClass} onClick={e => e.stopPropagation()}>
                        <div className={'w-full flex justify-end'}>
                            <div className={'w-fit h-fit p-[8px] text-[#37576B] border border-[#E0EBF0] rounded-full cursor-pointer'}
                                 onClick={() => setShowOpenOut(false)}
                            >
                                <Icon icon={'XMark'} height={16} width={16}/>
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
