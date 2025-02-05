import React, {useContext, useEffect, useMemo, useRef, useState} from "react";
import DataTypes from "../../../../../../../../data-types";
import RenderInHeaderColumnControls from "./RenderInHeaderColumnControls";
import {Add} from "../../../../../../../forms/ui/icons";
import {useCopy, usePaste} from "../utils/hooks";
import {handleKeyDown} from "../utils/keyboard";
import {handleMouseUp, handleMouseMove, handleMouseDown} from "../utils/mouse";
import {RenderRow} from "./RenderRow";
import {RenderGutter} from "./RenderGutter";
import {actionsColSize, numColSize, gutterColSize, minColSize, minInitColSize} from "../constants"
import {SpreadSheetContext} from "../index";

const DisplayCalculatedCell = ({value, className}) => <div className={className}>{value}</div>

const getLocation = selectionPoint => {
    let {index, attrI} = typeof selectionPoint === 'number' ? {
        index: selectionPoint,
        attrI: undefined
    } : selectionPoint;
    return {index, attrI}
}

const updateItemsOnPaste = ({pastedContent, e, index, attrI, data, visibleAttributes, updateItem}) => {
    const paste = pastedContent?.split('\n').filter(row => row.length).map(row => row.split('\t'));
    if(!paste) return;

    const rowsToPaste = [...new Array(paste.length).keys()].map(i => index + i).filter(i => i < data.length)
    const columnsToPaste = [...new Array(paste[0].length).keys()]
        .map(i => visibleAttributes[attrI + i])
        .filter(i => i);

    const itemsToUpdate = rowsToPaste.map((row, rowI) => (
        {
            ...data[row],
            ...columnsToPaste.reduce((acc, col, colI) => ({...acc, [col]: paste[rowI][colI]}), {})
        }
    ));

    updateItem(undefined, undefined, itemsToUpdate);
}

const frozenCols = [0,1] // testing
const frozenColClass = '' // testing

export const RenderSimple = ({isEdit, updateItem, removeItem, addItem, newItem, setNewItem, loading}) => {
    const {state:{columns, sourceInfo, display, data}, setState} = useContext(SpreadSheetContext);
    const gridRef = useRef(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [editing, setEditing] = useState({}); // {index, attrI}
    const [selection, setSelection] = useState([]);
    const [triggerSelectionDelete, setTriggerSelectionDelete] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const startCellRow = useRef(null);
    const startCellCol = useRef(null);
    const selectionRange = useMemo(() => {
        const rows = [...new Set(selection.map(s => s?.index !== undefined ? s.index : s))].sort((a, b) => a - b);
        const cols = [...new Set(selection.map(s => s.attrI).sort((a, b) => a - b) || columns.filter(({show}) => show).map((v, i) => i))];
        return {
            startI: rows[0],
            endI: rows[rows.length - 1],
            startCol: cols[0],
            endCol: cols[cols.length - 1]
        }
    }, [selection]);
    const allowEdit = useMemo(() => !columns.some(({group}) => group), [columns]);
    const visibleAttributes = useMemo(() => columns.filter(({show}) => show), [columns]);
    const openOutAttributes = useMemo(() => columns.filter(({openOut}) => openOut), [columns]);
    const visibleAttrsWithoutOpenOut = useMemo(() => columns.filter(({show, openOut}) => show && !openOut), [columns]);
    const actionColumns = useMemo(() => columns.filter(({actionType}) => actionType), [columns]);

    usePaste((pastedContent, e) => {
        let {index, attrI} = typeof selection[selection.length - 1] === 'number' ?
            {index: selection[selection.length - 1], attrI: undefined} :
            selection[selection.length - 1];
        updateItemsOnPaste({pastedContent, e, index, attrI, data, visibleAttributes, updateItem})
    });

    useCopy(() => {
        return Object.values(
            selection.sort((a, b) => {
                const {index: rowA, attrI: colA} = getLocation(a);
                const {index: rowB, attrI: colB} = getLocation(b);

                return (rowA - rowB) || (colA - colB);
            })
                .reduce((acc, s) => {
                    const {index, attrI} = getLocation(s);
                    acc[index] = acc[index] ? `${acc[index]}\t${data[index][visibleAttributes[attrI]]}` : data[index][visibleAttributes[attrI]]; // join cells of a row
                    return acc;
                }, {})).join('\n') // join rows
    })

    // =================================================================================================================
    // =========================================== auto resize begin ===================================================
    // =================================================================================================================
    useEffect(() => {
        const columnsWithSizeLength = visibleAttributes.filter(({size}) => size).length;
        if(visibleAttrsWithoutOpenOut.every(c => c.size)) return;

        if (gridRef.current && (!columnsWithSizeLength || columnsWithSizeLength !== visibleAttrsWithoutOpenOut.length)) {
            const availableVisibleAttributes = visibleAttrsWithoutOpenOut.filter(v => v.actionType || sourceInfo.columns.find(attr => attr.name === v.name));
            const gridWidth = gridRef.current.offsetWidth - numColSize - gutterColSize - (allowEdit ? actionColumns.length * actionsColSize : 0);
            const initialColumnWidth = Math.max(minInitColSize, gridWidth / availableVisibleAttributes.length);
            setState(draft => {
                availableVisibleAttributes.forEach(attr => {
                    const idx = draft.columns.findIndex(column => column.name === attr.name);
                    if(idx !== -1) {
                        draft.columns[idx].size = initialColumnWidth;
                    }
                })
            });
        }
    }, [visibleAttributes.length, sourceInfo.columns.length, openOutAttributes]);
    // ============================================ auto resize end ====================================================

    // =================================================================================================================
    // =========================================== Mouse Controls begin ================================================
    // =================================================================================================================
    const colResizer = (columnName) => (e) => {
        const column = visibleAttributes.find(({name}) => name === columnName);
        const startX = e.clientX;
        const startWidth = column.size || 0;
        const handleMouseMove = (moveEvent) => {
            const newWidth = Math.max(minColSize, startWidth + moveEvent.clientX - startX);
            setState(draft => {
                const idx = draft.columns.findIndex(column => column.name === columnName);
                draft.columns[idx].size = newWidth;
            })
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };
    // =========================================== Mouse Controls end ==================================================

    // =================================================================================================================
    // =========================================== Keyboard Controls begin =============================================
    // =================================================================================================================
    useEffect(() => {
        const handleKeyUp = () => {
            setIsSelecting(false)
            setIsDragging(false)
            setTriggerSelectionDelete(false);
        }

        const keyDownListener = e => handleKeyDown({
            e, dataLen: data.length, selection, setSelection, setIsSelecting,
            editing, setEditing, setTriggerSelectionDelete,
            visibleAttributes, pageSize: display.pageSize, setIsDragging
        })

        window.addEventListener('keydown', keyDownListener);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', keyDownListener);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [selection, editing, data?.length]);
    // =========================================== Keyboard Controls end ===============================================

    // =================================================================================================================
    // =========================================== Trigger delete begin ================================================
    // =================================================================================================================
    useEffect(() => {
        async function deleteFn() {
            if (triggerSelectionDelete) {
                const selectionRows = data.filter((d, i) => selection.find(s => (s.index || s) === i))
                const selectionCols = visibleAttributes.filter((_, i) => selection.map(s => s.attrI).includes(i))

                if (selectionCols.length) {
                    // partial selection
                    updateItem(undefined, undefined, selectionRows.map(row => ({...row, ...selectionCols.reduce((acc, curr) => ({...acc, [curr]: ''}), {})})))
                }else{
                    // full row selection
                    updateItem(undefined, undefined, selectionRows.map(row => ({...row, ...visibleAttributes.reduce((acc, curr) => ({...acc, [curr]: ''}), {})})))
                }
            }
        }

        deleteFn()
    }, [triggerSelectionDelete])
    // ============================================ Trigger delete end =================================================

    const c = {
        1: 'grid grid-cols-1',
        2: 'grid grid-cols-2',
        3: 'grid grid-cols-3',
        4: 'grid grid-cols-4',
        5: 'grid grid-cols-5',
        6: 'grid grid-cols-6',
        7: 'grid grid-cols-7',
        8: 'grid grid-cols-8',
        9: 'grid grid-cols-9',
        10: 'grid grid-cols-10',
        11: 'grid grid-cols-11',
    };

    if(!visibleAttributes.length) return <div className={'p-2'}>No columns selected.</div>;
    const gridClass = `grid ${c[visibleAttrsWithoutOpenOut.length + 2]}`;
    const gridTemplateColumns = `${numColSize}px ${visibleAttrsWithoutOpenOut.map(v => `${v.size}px` || 'auto').join(' ')} ${gutterColSize}px`;

    return (
        <div className={`flex flex-col w-full h-full overflow-x-auto scrollbar-sm`} ref={gridRef}>
            <div className={'flex flex-col no-wrap text-sm min-h-[200px] max-h-[calc(78vh_-_10px)] overflow-y-auto scrollbar-sm'}
                 onMouseLeave={e => handleMouseUp({setIsDragging})}>

                {/****************************************** Header begin ********************************************/}
                <div className={`sticky top-0 ${gridClass}`} style={{zIndex: 5, gridTemplateColumns: gridTemplateColumns}}>
                    <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
                        <div key={'#'} className={`w-full font-semibold border bg-gray-50 text-gray-500 ${frozenColClass}`} />
                    </div>
                    {visibleAttrsWithoutOpenOut.map((attribute, i) =>
                            <div key={i}
                                 className={`flex justify-between ${frozenCols.includes(i) ? frozenColClass : ''}`}
                                 style={{width: attribute.size}}>

                                <div key={`controls-${i}`}
                                     className={`w-full font-semibold  border ${selection.find(s => s.attrI === i) ? `bg-blue-100 text-gray-900` : `bg-gray-50 text-gray-500`}`}>
                                    <RenderInHeaderColumnControls attribute={attribute} />
                                </div>

                                <div key={`resizer-${i}`} className="z-5 -ml-2"
                                     style={{
                                         width: '3px',
                                         height: '100%',
                                         background: '#ddd',
                                         cursor: 'col-resize',
                                         position: 'relative',
                                         right: 0,
                                         top: 0
                                     }}
                                     onMouseDown={colResizer(attribute?.name)}/>

                            </div>)}
                    {/*{*/}
                    {/*    allowEdit && actions.length ? (*/}
                    {/*        <div className={'flex shrink-0 justify-between'} style={{width: actionsColSize}}>*/}
                    {/*            <div key={'actions'}*/}
                    {/*                 className={'w-full flex items-center px-3 py-1 font-semibold border bg-gray-50 text-gray-900 select-none'}>*/}
                    {/*                Actions*/}
                    {/*            </div>*/}
                    {/*        </div>*/}
                    {/*    ) : null*/}
                    {/*}*/}

                    {/*gutter column cell*/}
                    <div key={'##'}
                         className={`bg-gray-50 border z-[1] flex shrink-0 justify-between`}
                         style={{width: numColSize}}
                    > {` `}</div>
                </div>
                {/****************************************** Header end **********************************************/}


                {/****************************************** Rows begin **********************************************/}
                {data.filter(d => !d.totalRow)
                    .map((d, i) => (
                        <RenderRow key={i} {...{
                            i, c, d,  isEdit, frozenCols,
                            allowEdit, isDragging, isSelecting, editing, setEditing, loading:false,
                            selection, setSelection, selectionRange, triggerSelectionDelete,
                            handleMouseDown, handleMouseMove, handleMouseUp,
                            setIsDragging, startCellCol, startCellRow,
                            updateItem, removeItem
                        }} />
                    ))}
                <div id={display.loadMoreId}></div>


                {/*/!****************************************** Gutter Row **********************************************!/*/}
                {/*<RenderGutter {...{allowEdit, c, visibleAttributes, isDragging, colSizes, attributes}} />*/}


                {/*/!****************************************** Total Row ***********************************************!/*/}
                {/*{data*/}
                {/*    .filter(d => showTotal && d.totalRow)*/}
                {/*    .map((d, i) => (*/}
                {/*        <RenderRow key={'total row'} {...{*/}
                {/*            i, c, d,*/}
                {/*            allowEdit, isDragging, isSelecting, editing, setEditing, loading,*/}
                {/*            striped, visibleAttributes, attributes, customColNames, frozenCols,*/}
                {/*            colSizes, selection, setSelection, selectionRange, triggerSelectionDelete,*/}
                {/*            isEdit, groupBy, filters, actions, linkCols, openOutCols,*/}
                {/*            colJustify, formatFn, fontSize,*/}
                {/*            handleMouseDown, handleMouseMove, handleMouseUp,*/}
                {/*            setIsDragging, startCellCol, startCellRow,*/}
                {/*            updateItem, removeItem*/}
                {/*        }} />*/}
                {/*    ))}*/}
                {/*/!****************************************** Rows end ************************************************!/*/}
            </div>
            {/********************************************* out of scroll ********************************************/}
            {/***********************(((***************** Add New Row Begin ******************************************/}
            {/*{*/}
            {/*    allowEdit ?*/}
            {/*        <div*/}
            {/*            className={`bg-white grid ${allowEdit ? c[visibleAttributes.length + 3] : c[visibleAttributes.length + 2]} divide-x divide-y ${isDragging ? `select-none` : ``} sticky bottom-0 z-[1]`}*/}
            {/*            style={{gridTemplateColumns: `${numColSize}px ${visibleAttributes.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${allowEdit ? `${actionsColSize}px` : ``} ${gutterColSize}px`}}*/}
            {/*        >*/}
            {/*            <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>*/}
            {/*                <div key={'#'} className={`w-full font-semibold border bg-gray-50 text-gray-500`}>*/}
            {/*                    **/}
            {/*                </div>*/}
            {/*            </div>*/}
            {/*            {*/}
            {/*                visibleAttributes.map(va => attributes.find(attr => attr.name === va))*/}
            {/*                    .filter(a => a)*/}
            {/*                    .map((attribute, attrI) => {*/}
            {/*                        const Comp = DataTypes[attribute?.type || 'text']?.EditComp || DisplayCalculatedCell;*/}
            {/*                        return (*/}
            {/*                            <div*/}
            {/*                                key={`add-new-${attrI}`}*/}
            {/*                                className={`flex border`}*/}
            {/*                                style={{width: colSizes[attribute.name]}}*/}
            {/*                            >*/}
            {/*                                <Comp*/}
            {/*                                    key={`${attribute.name}`}*/}
            {/*                                    menuPosition={'top'}*/}
            {/*                                    className={'p-1 bg-white hover:bg-blue-50 w-full h-full'}*/}
            {/*                                    {...attribute}*/}
            {/*                                    value={newItem[attribute.name]}*/}
            {/*                                    placeholder={'+ add new'}*/}
            {/*                                    onChange={e => setNewItem({...newItem, [attribute.name]: e})}*/}
            {/*                                    onPaste={e => {*/}
            {/*                                        e.preventDefault();*/}
            {/*                                        e.stopPropagation();*/}

            {/*                                        const paste =*/}
            {/*                                            (e.clipboardData || window.clipboardData).getData("text")?.split('\n').map(row => row.split('\t'));*/}
            {/*                                        const pastedColumns = [...new Array(paste[0].length).keys()].map(i => visibleAttributes[attrI + i]).filter(i => i);*/}
            {/*                                        const tmpNewItem = pastedColumns.reduce((acc, c, i) => ({*/}
            {/*                                            ...acc,*/}
            {/*                                            [c]: paste[0][i]*/}
            {/*                                        }), {})*/}
            {/*                                        setNewItem({...newItem, ...tmpNewItem})*/}

            {/*                                    }}*/}
            {/*                                />*/}
            {/*                            </div>*/}
            {/*                        )*/}
            {/*                    })*/}
            {/*            }*/}
            {/*            <div className={'bg-white flex flex-row h-fit justify-evenly'}*/}
            {/*                 style={{width: actionsColSize}}>*/}
            {/*                <button*/}
            {/*                    className={'w-fit p-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}*/}
            {/*                    onClick={e => {*/}
            {/*                        addItem()*/}
            {/*                    }}>*/}
            {/*                    <Add className={'text-white'} height={20} width={20}/>*/}
            {/*                </button>*/}
            {/*            </div>*/}
            {/*        </div> : null*/}
            {/*}*/}
            {/***********************(((***************** Add New Row End ********************************************/}
        </div>
    )
}