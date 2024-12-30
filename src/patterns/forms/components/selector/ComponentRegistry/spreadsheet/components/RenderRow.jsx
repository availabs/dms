import React, {useState} from "react";
import {actionsColSize, numColSize, gutterColSize} from "../constants"
import {RenderCell} from "./RenderCell";
import {RenderActions} from "./RenderActions";

const getEdge = ({startI, endI, startCol, endCol}, i, attrI) => {
    const e =
        startI === endI && startCol === endCol ? 'all' :
            startCol === endCol && startI === i ? 'ltr' :
                startCol === endCol && endI === i ? 'lbr' :
                    startCol === endCol && startI !== i && endI !== i ? 'x' :
                        startI === endI && attrI === startCol ? 'tlb' :
                            startI === endI && attrI === endCol ? 'trb' :
                                startI === endI && startCol !== attrI && endCol !== attrI ? 'y' :
                                    startI === i && startCol === attrI ? 'top-left' :
                                        startI === i && endCol === attrI ? 'top-right' :
                                            startI === i && startCol !== attrI && endCol !== attrI ? 'top' :
                                                endI === i && startCol === attrI ? 'bottom-left' :
                                                    endI === i && endCol === attrI ? 'bottom-right' :
                                                        endI === i && startCol !== attrI && endCol !== attrI ? 'bottom' :
                                                            startCol === attrI && startI !== i && endI !== i ? 'left' :
                                                                endCol === attrI && startI !== i && endI !== i ? 'right' : '';

    return e;
}

export const RenderRow = ({
                              i, c, d,
                              allowEdit, isDragging, isSelecting, editing, setEditing, loading,
                              striped, visibleAttributes, attributes, customColNames, frozenCols,
                              colSizes, selection, setSelection, selectionRange, triggerSelectionDelete,
                              isEdit, groupBy, filters, actions, linkCols, openOutCols,
                              colJustify, formatFn, fontSize,
                              handleMouseDown, handleMouseMove, handleMouseUp,
                              setIsDragging, startCellCol, startCellRow,
                              updateItem, removeItem,
                          }) => {
    const [showOpenOut, setShowOpenOut] = useState(false);
    const visibleAttrsWithoutOpenOut = visibleAttributes.filter(va => !openOutCols.includes(va));
    const visibleAttrsWithoutOpenOutsLen = visibleAttrsWithoutOpenOut.length;
    const openOutAttributes = visibleAttributes.filter(attribute => attributes.find(attr => attr.name === attribute) && openOutCols.includes(attribute))
    return (
        <>
            <div key={`data-${i}`}
                 className={`${d.totalRow ? `sticky bottom-0 z-[1]` : ``} 
                            grid ${allowEdit ? c[visibleAttrsWithoutOpenOutsLen + 3] : c[visibleAttrsWithoutOpenOutsLen + 2]} 
                            divide-x divide-y ${isDragging ? `select-none` : ``} 
                            ${striped ? `odd:bg-gray-50` : ``} ${d.totalRow ? `bg-gray-100` : ``}`
                            }
                 style={{gridTemplateColumns: `${numColSize}px ${visibleAttrsWithoutOpenOut.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${allowEdit ? `${actionsColSize}px` : ``} ${gutterColSize}px`}}
            >
                <div key={'#'}
                     className={`p-1 flex text-xs items-center justify-center border cursor-pointer sticky left-0 z-[1]
                             ${selection.find(s => (s.index !== undefined ? s.index : s) === i) ? 'bg-blue-100 text-gray-900' : 'bg-gray-50 text-gray-500'}`}
                     style={{width: numColSize}}
                     onClick={e => {
                         // single click = replace selection
                         // click and mouse move = add to selection
                         // ctrl + click add
                         if (e.ctrlKey) {
                             setSelection(selection.includes(i) ? selection.filter(v => v !== i) : [...selection, i])
                         } else {
                             setSelection([i])
                         }
                     }}
                     onMouseDown={e => handleMouseDown({
                         e,
                         index: i,
                         setSelection,
                         setIsDragging,
                         startCellCol,
                         startCellRow,
                         selection
                     })}
                     onMouseMove={e => handleMouseMove({
                         e,
                         index: i,
                         isDragging,
                         startCellCol,
                         startCellRow,
                         setSelection
                     })}
                     onMouseUp={e => handleMouseUp({setIsDragging})}
                >
                    {d.totalRow ? 'T' : i + 1}
                </div>
                {visibleAttributes
                    .filter(attribute => attributes.find(attr => attr.name === attribute) && !openOutCols.includes(attribute))
                    .map((attribute, attrI) =>
                        <RenderCell
                            showOpenOutCaret={openOutAttributes.length && attrI === 0}
                            showOpenOut={showOpenOut} setShowOpenOut={setShowOpenOut}
                            isSelecting={isSelecting}
                            isSelected={selection.find(s => s.index === i && s.attrI === attrI) || selection.includes(i)}
                            isFrozen={frozenCols.includes(attrI)}
                            edge={
                                selection.find(s => s.index === i && s.attrI === attrI) || selection.includes(i) ?
                                    getEdge(selectionRange, i, attrI) : null}
                            editing={editing.index === i && editing.attrI === attrI}
                            triggerDelete={triggerSelectionDelete}
                            key={`cell-${i}-${attrI}`}
                            width={colSizes[attributes.find(attr => attr.name === attribute).name]}
                            attribute={attributes.find(attr => attr.name === attribute)}
                            justify={colJustify[attribute]}
                            linkCol={linkCols[attribute]}
                            formatFn={formatFn[attribute]}
                            fontSize={fontSize[attribute]}
                            loading={loading}
                            updateItem={updateItem}
                            removeItem={removeItem}

                            i={i}
                            item={d}
                            onMouseDown={e => handleMouseDown({
                                e,
                                index: i,
                                attrI,
                                setSelection,
                                setIsDragging,
                                startCellCol,
                                startCellRow,
                                selection
                            })}
                            onMouseMove={e => handleMouseMove({
                                e,
                                index: i,
                                attrI,
                                isDragging,
                                startCellCol,
                                startCellRow,
                                setSelection
                            })}
                            onMouseUp={e => handleMouseUp({setIsDragging})}
                            onClick={() => {
                                setSelection([{index: i, attrI}]);
                                setEditing({index: i, attrI});
                            }}
                            onDoubleClick={() => {
                            }}
                            allowEdit={allowEdit}
                            striped={striped}
                        />)}

                <RenderActions allowEdit={allowEdit} isEdit={isEdit} isLastCell={true} newItem={d}
                               groupBy={groupBy} filters={filters}
                               removeItem={removeItem} actions={actions}/>

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
                openOutAttributes.map((attribute, openOutAttrI) => {
                    const attrI = visibleAttrsWithoutOpenOutsLen + 1 + openOutAttrI;
                    return (
                        <div key={`data-open-out-${i}`}
                             className={openOutAttributes?.length ? `${d.totalRow ? `sticky bottom-0 z-[1]` : ``} 
                            grid ${c[visibleAttrsWithoutOpenOutsLen]}
                            divide-x divide-y
                            ${isDragging ? `select-none` : ``} 
                            ${striped ? `odd:bg-gray-50` : ``} 
                            ${d.totalRow ? `bg-gray-100` : ``}` : 'hidden'}
                             style={{gridTemplateColumns: `${numColSize}px ${visibleAttrsWithoutOpenOut.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${allowEdit ? `${actionsColSize}px` : ``} ${gutterColSize}px`}}
                        >
                            <div key={'#'}
                                 className={`p-1 flex text-xs items-center justify-center border cursor-pointer sticky left-0 z-[1]
                             ${selection.find(s => (s.index !== undefined ? s.index : s) === i) ? 'bg-blue-100 text-gray-900' : 'bg-gray-50 text-gray-500'}`}
                                 style={{width: numColSize}}
                                 onClick={e => {
                                     // single click = replace selection
                                     // click and mouse move = add to selection
                                     // ctrl + click add
                                     if (e.ctrlKey) {
                                         setSelection(selection.includes(i) ? selection.filter(v => v !== i) : [...selection, i])
                                     } else {
                                         setSelection([i])
                                     }
                                 }}
                                 onMouseDown={e => handleMouseDown({
                                     e,
                                     index: i,
                                     setSelection,
                                     setIsDragging,
                                     startCellCol,
                                     startCellRow,
                                     selection
                                 })}
                                 onMouseMove={e => handleMouseMove({
                                     e,
                                     index: i,
                                     isDragging,
                                     startCellCol,
                                     startCellRow,
                                     setSelection
                                 })}
                                 onMouseUp={e => handleMouseUp({setIsDragging})}
                            >
                                >
                            </div>

                            <RenderCell
                                isSelecting={isSelecting}
                                isSelected={selection.find(s => s.index === i && s.attrI === attrI) || selection.includes(i)}
                                isFrozen={frozenCols.includes(attrI)}
                                edge={
                                    selection.find(s => s.index === i && s.attrI === attrI) || selection.includes(i) ?
                                        getEdge(selectionRange, i, attrI) : null}
                                editing={editing.index === i && editing.attrI === attrI}
                                triggerDelete={triggerSelectionDelete}
                                key={`cell-${i}-${attrI}`}
                                width={colSizes[attributes.find(attr => attr.name === attribute).name]}
                                attribute={attributes.find(attr => attr.name === attribute)}
                                justify={colJustify[attribute]}
                                linkCol={linkCols[attribute]}
                                formatFn={formatFn[attribute]}
                                fontSize={fontSize[attribute]}
                                openOut={true}
                                colSpan={visibleAttrsWithoutOpenOutsLen}
                                customColName={customColNames[attribute.name]}
                                loading={loading}
                                updateItem={updateItem}
                                removeItem={removeItem}

                                i={i}
                                item={d}
                                onMouseDown={e => handleMouseDown({
                                    e,
                                    index: i,
                                    attrI,
                                    setSelection,
                                    setIsDragging,
                                    startCellCol,
                                    startCellRow,
                                    selection
                                })}
                                onMouseMove={e => handleMouseMove({
                                    e,
                                    index: i,
                                    attrI,
                                    isDragging,
                                    startCellCol,
                                    startCellRow,
                                    setSelection
                                })}
                                onMouseUp={e => handleMouseUp({setIsDragging})}
                                onClick={() => {
                                    setSelection([{index: i, attrI}]);
                                    setEditing({index: i, attrI});
                                }}
                                onDoubleClick={() => {
                                }}
                                allowEdit={allowEdit}
                                striped={striped}
                            />

                            <div className={'flex items-center border'}>
                                <div key={'##'}
                                     className={`bg-gray-50 h-full flex shrink-0 justify-between`}
                                     style={{width: numColSize}}
                                > {` `}</div>
                            </div>
                        </div>
                    )
                }) : null
            }
        </>
    )
}