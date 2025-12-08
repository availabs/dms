import React, {useMemo, useState, useCallback} from "react";
import {numColSize as numColSizeDf, gutterColSize as gutterColSizeDf, } from "../../../../patterns/page/components/selector/ComponentRegistry/spreadsheet/constants"
import {handleMouseUp, handleMouseMove, handleMouseDown} from "../utils/mouse"
import {TableCell} from "./TableCell";
import Icon from "../../Icon"

const getEdge = ({ startI, endI, startCol, endCol }, i, attrI) => {
    const top = Math.min(startI, endI);
    const bottom = Math.max(startI, endI);
    const left = Math.min(startCol, endCol);
    const right = Math.max(startCol, endCol);

    // Single cell
    if (top === bottom && left === right) return 'all';

    // Vertical line
    if (left === right) {
        if (top === i) return 'ltr';
        if (bottom === i) return 'lbr';
        if (i > top && i < bottom) return 'x';
    }

    // Horizontal line
    if (top === bottom) {
        if (attrI === left) return 'tlb';
        if (attrI === right) return 'trb';
        if (attrI > left && attrI < right) return 'y';
    }

    // Corners and edges of a rectangle
    if (i === top) {
        if (attrI === left) return 'top-left';
        if (attrI === right) return 'top-right';
        if (attrI > left && attrI < right) return 'top';
    }

    if (i === bottom) {
        if (attrI === left) return 'bottom-left';
        if (attrI === right) return 'bottom-right';
        if (attrI > left && attrI < right) return 'bottom';
    }

    if (attrI === left && i > top && i < bottom) return 'left';
    if (attrI === right && i > top && i < bottom) return 'right';

    return '';
};

export const TableRow = ({
    frozenCols, theme, columns, display,
    i, d,
    allowEdit, isDragging, isSelecting, editing, setEditing, loading,
    selection, setSelection, selectionRange, triggerSelectionDelete,
    setIsDragging, startCellCol, startCellRow,
    updateItem, removeItem, defaultColumnSize, isTotalRow
}) => {
    const [showOpenOut, setShowOpenOut] = useState(false);

    const visibleAttributes = useMemo(() => columns.filter(({show}) => show), [columns]);
    const visibleAttrsWithoutOpenOut = useMemo(() => visibleAttributes.filter(({ openOut, actionType }) => !openOut || actionType), [visibleAttributes]);
    const visibleAttrsWithoutOpenOutsLen = visibleAttrsWithoutOpenOut.length;
    const openOutAttributes = useMemo(() => visibleAttributes.filter(({ openOut }) => openOut), [visibleAttributes]);
    const numColSize = display.showGutters ? numColSizeDf : 0
    const gutterColSize = display.showGutters ? gutterColSizeDf : 0

    const onClickRowNum = useCallback(
        (e) => {
            if (!setSelection || !display.showGutters) return;

            if (e.ctrlKey) {
                setSelection(
                    selection.includes(i)
                        ? selection.filter((v) => v !== i)
                        : [...selection, i]
                );
            } else {
                setSelection([i]);
            }
        },
        [i, selection, setSelection, display.showGutters]
    );

    const gridTemplateColumns = useMemo(
        () =>
            `${numColSize}px ${visibleAttrsWithoutOpenOut
                .map((v) => (v.size ? `${v.size}px` : `${defaultColumnSize}px`))
                .join(" ")} ${gutterColSize}px`,
        [numColSize, gutterColSize, visibleAttrsWithoutOpenOut, defaultColumnSize]
    );

    const rowIsSelected = useMemo(
        () => selection?.some((s) => (s.index ?? s) === i),
        [selection, i]
    );

    return (
        <>
            <div
                key={`data-${i}`}
                className={`${d.totalRow ? `sticky bottom-0 z-[1]` : ``} grid
                             ${isDragging ? `select-none` : ``} 
                            ${display.striped ? `odd:bg-gray-50` : ``} ${d.totalRow ? `bg-gray-100` : ``}`
                }
                style={{
                    gridTemplateColumns,
                    gridColumn: `span ${visibleAttrsWithoutOpenOut.length + 2} / ${visibleAttrsWithoutOpenOut.length + 2}`
                }}
            >
                <div key={'#'}
                     className={` flex text-xs items-center justify-center cursor-pointer sticky left-0 z-[1]
                             ${rowIsSelected ? 'bg-blue-100 text-gray-900' : 'bg-gray-50 text-gray-500'}`}
                     style={{width: numColSize}}
                     onClick={onClickRowNum}
                     onMouseDown={e => setSelection && setIsDragging && handleMouseDown({
                         e,
                         index: i,
                         setSelection,
                         setIsDragging,
                         startCellCol,
                         startCellRow,
                         selection
                     })}
                     onMouseMove={e => setSelection && handleMouseMove({
                         e,
                         index: i,
                         isDragging,
                         startCellCol,
                         startCellRow,
                         setSelection
                     })}
                     onMouseUp={e => setIsDragging && handleMouseUp({setIsDragging})}
                >
                    {display.showGutters && (d.totalRow ? 'T' : i + 1)}
                </div>
                {visibleAttrsWithoutOpenOut
                    .map((attribute, attrI) =>
                        <TableCell
                            isTotalCell={isTotalRow}
                            columns={columns}
                            display={display}
                            theme={theme}
                            showOpenOutCaret={openOutAttributes.length && attrI === 0}
                            showOpenOut={showOpenOut} setShowOpenOut={setShowOpenOut}
                            isSelecting={isSelecting}
                            isSelected={selection?.find(s => s.index === i && s.attrI === attrI) || selection?.includes(i)}
                            isFrozen={frozenCols?.includes(attrI)}
                            edge={
                                selection?.find(s => s.index === i && s.attrI === attrI) || selection?.includes(i) ?
                                    getEdge(selectionRange, i, attrI) : null}
                            editing={editing?.index === i && editing?.attrI === attrI}
                            triggerDelete={triggerSelectionDelete}
                            key={`cell-${i}-${attrI}`}

                            attribute={attribute}
                            loading={loading}
                            updateItem={updateItem}
                            removeItem={removeItem}

                            i={i}
                            item={d}
                            onMouseDown={e => setSelection && setIsDragging && handleMouseDown({
                                e,
                                index: i,
                                attrI,
                                setSelection,
                                setIsDragging,
                                startCellCol,
                                startCellRow,
                                selection
                            })}
                            onMouseMove={e => setSelection && handleMouseMove({
                                e,
                                index: i,
                                attrI,
                                isDragging,
                                startCellCol,
                                startCellRow,
                                setSelection
                            })}
                            onMouseUp={e => setIsDragging && handleMouseUp({setIsDragging})}
                            onClick={() => {
                                setSelection &&
                                selection?.length === 1 &&
                                selection?.[0]?.index !== i && selection?.[0]?.attrI !== attrI &&
                                setSelection([{index: i, attrI}]);
                                setEditing && (editing?.index !== i || editing?.attrI !== attrI) && setEditing({});
                            }}
                            onDoubleClick={() => {
                                setEditing && (allowEdit || attribute.allowEditInView) && setEditing({index: i, attrI});
                            }}
                            allowEdit={allowEdit || attribute.allowEditInView}
                        />)}

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
                <div className={theme?.table?.openOutContainerWrapper} style={{backgroundColor: '#00000066'}} onClick={() => setShowOpenOut(false)}>
                    <div className={theme?.table?.openOutContainer} onClick={e => e.stopPropagation()}>
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
                            columns={columns}
                            display={display}
                            theme={theme}
                            attribute={visibleAttrsWithoutOpenOut[0]}
                            openOut={true}
                            loading={loading}
                            i={i}
                            item={d}
                            openOutTitle={true}
                        />

                        {/* Open out columns */}
                        {openOutAttributes
                            .filter(attribute => {
                                if(display.hideIfNullOpenouts){
                                    let value = d[attribute.normalName] || d[attribute.name]
                                    return Array.isArray(value) ? value.length : value;
                                }
                                return true;
                            })
                            .map((attribute, openOutAttrI) => {
                                const attrI = visibleAttrsWithoutOpenOutsLen + 1 + openOutAttrI;
                                return (
                                    <div key={`data-open-out-${i}`}
                                         className={''} >
                                        <TableCell
                                            isTotalCell={isTotalRow}
                                            columns={columns}
                                            display={display}
                                            theme={theme}
                                            editing={editing?.index === i && editing?.attrI === attrI}
                                            key={`cell-${i}-${attrI}`}
                                            attribute={attribute}
                                            openOut={true}
                                            loading={loading}
                                            updateItem={updateItem}
                                            removeItem={removeItem}

                                            i={i}
                                            item={d}
                                            allowEdit={allowEdit || attribute.allowEditInView}
                                        />
                                    </div>
                                )
                            })}
                    </div>
                </div> : null
            }
        </>
    )
}