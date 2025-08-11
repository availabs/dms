import React, {useEffect, useMemo, useRef, useState} from "react";
import { ThemeContext } from '../../useTheme';
import {handleMouseDown, handleMouseMove, handleMouseUp} from "./utils/mouse";
import TableHeaderCell from "./components/TableHeaderCell";
import {TableRow} from "./components/TableRow";
import {useCopy, usePaste, getLocation} from "./utils/hooks";
import {isEqualColumns} from "./utils";
import {handleKeyDown} from "./utils/keyboard";

const defaultNumColSize = 0;
const defaultGutterColSize = 0;
const defColSize = 250;
const minColSize = 150;

const windowFake = typeof window === "undefined" ? {} : window

export const tableTheme = {
    tableContainer: 'flex flex-col overflow-x-auto',
    tableContainerNoPagination: '',
    tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[calc(78vh_-_10px)] overflow-y-auto',
    headerContainer: 'sticky top-0 grid',
    thead: 'flex justify-between',
    theadfrozen: '',
    thContainer: 'w-full font-semibold px-3 py-1 text-sm font-semibold text-gray-600 border',
    thContainerBgSelected: 'bg-blue-100 text-gray-900',
    thContainerBg: 'bg-gray-50 text-gray-500',
    cell: 'relative flex items-center min-h-[35px]  border border-slate-50',
    cellInner: `
        w-full min-h-full flex flex-wrap items-center truncate py-0.5 px-1
        font-[400] text-[14px]  leading-[18px] text-slate-600
    `,
    cellBg: 'bg-white',
    cellBgSelected: 'bg-blue-50',
    cellFrozenCol: '',
    paginationInfoContainer: '',
    paginationPagesInfo: 'font-[500] text-[12px] uppercase text-[#2d3e4c] leading-[18px]',
    paginationRowsInfo: 'text-xs',
    paginationContainer: 'w-full p-2 flex items-center justify-between',
    paginationControlsContainer: 'flex flex-row items-center overflow-hidden gap-0.5',
    pageRangeItem: 'cursor-pointer px-3  text-[#2D3E4C] py-1  text-[12px] hover:bg-slate-50 font-[500] rounded  uppercase leading-[18px]',
    pageRangeItemInactive: '',
    pageRangeItemActive: 'bg-slate-100 ',
    openOutContainerWrapper: 'fixed inset-0 right-0 h-full w-full z-[100]',
    openOutHeader: 'font-semibold text-gray-600'
}

export const docs = {
    columns: [
        { "name": "first_name", "display_name": "First Name", "show": true, "type": "text" },
        { "name": "last_name", "display_name": "Last Name", "show": true, "type": "text" },
        { "name": "email", "display_name": "Email Address", "show": true, "type": "text" },
        { "name": "city", "display_name": "City", "show": true, "type": "text" }
    ],
    data: [
        {
            "first_name": "Alice",
            "last_name": "Johnson",
            "email": "alice.johnson@example.com",
            "city": "New York"
        },
        {
            "first_name": "Bob",
            "last_name": "Smith",
            "email": "bob.smith@example.com",
            "city": "Los Angeles"
        },
        {
            "first_name": "Carol",
            "last_name": "Davis",
            "email": "carol.davis@example.com",
            "city": "Chicago"
        },
        {
            "first_name": "David",
            "last_name": "Brown",
            "email": "david.brown@example.com",
            "city": "Houston"
        }
    ]
}
const updateItemsOnPaste = ({pastedContent, e, index, attrI, data, visibleAttributes, updateItem}) => {
    const paste = pastedContent?.split('\n').filter(row => row.length).map(row => row.split('\t'));
    if(!paste) return;

    const rowsToPaste = [...new Array(paste.length).keys()].map(i => index + i).filter(i => i < data.length)
    const columnsToPaste = [...new Array(paste[0].length).keys()]
        .map(i => visibleAttributes[attrI + i]?.name)
        .filter(i => i);

    const itemsToUpdate = rowsToPaste.map((row, rowI) => (
        {
            ...data[row],
            ...columnsToPaste.reduce((acc, col, colI) => ({...acc, [col]: paste[rowI][colI]}), {})
        }
    ));

    updateItem(undefined, undefined, itemsToUpdate);
}
export default function ({
    paginationActive, gridRef,
    allowEdit,
    updateItem, removeItem, loading, isEdit,
    numColSize=defaultNumColSize, gutterColSize=defaultGutterColSize, frozenColClass, frozenCols=[],
    columns=[], data=[], display={}, controls={}, setState, isActive
}) {
    const { theme: themeFromContext = {table: tableTheme}} = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, table: {...tableTheme, ...(themeFromContext.table || {})}};
    const [defaultColumnSize, setDefaultColumnSize] = React.useState(defColSize);
    const visibleAttrsWithoutOpenOut = useMemo(() => columns.filter(({show, openOut}) => show && !openOut), [columns]);
    const visibleAttributes = useMemo(() => columns.filter(({show}) => show), [columns]);

    // =================================================================================================================
    // ======================================= selection variables begin ===============================================
    // =================================================================================================================
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
    // ======================================== selection variables end ================================================

    // =================================================================================================================
    // =========================================== copy/paste begin ====================================================
    // =================================================================================================================
    usePaste((pastedContent, e) => {
        if(!allowEdit) return;

        // first cell of selection
        let {index, attrI} = typeof selection[0] === 'number' ? {index: selection[0], attrI: undefined} : selection[0];

        updateItemsOnPaste({pastedContent, e, index, attrI, data, visibleAttributes, updateItem})
    }, windowFake, isActive);

    useCopy(() => {
        return Object.values(
            selection.sort((a, b) => {
                const {index: rowA, attrI: colA} = getLocation(a);
                const {index: rowB, attrI: colB} = getLocation(b);

                return (rowA - rowB) || (colA - colB);
            })
                .reduce((acc, s) => {
                    const {index, attrI} = getLocation(s);
                    const currColName = visibleAttributes[attrI]?.name;
                    const currData = data[index][currColName];
                    acc[index] = acc[index] ? `${acc[index]}\t${currData}` : currData; // join cells of a row
                    return acc;
                }, {})).join('\n') // join rows
    }, windowFake, isActive)
    // ============================================ copy/paste end =====================================================

    useEffect(() => {
        if(!gridRef?.current) return;

        const gridWidth = gridRef?.current?.offsetWidth || 1;
        setDefaultColumnSize(Math.max(50, gridWidth / columns.length) - 5)
    }, [gridRef?.current, columns.length]);

    // =================================================================================================================
    // =========================================== Mouse Controls begin ================================================
    // =================================================================================================================
    const colResizer = (attribute) => (e) => {
        const element = gridRef?.current;
        if(!element) return;

        const column = visibleAttributes.find(va => isEqualColumns(va, attribute));
        const startX = e.clientX;
        const startWidth = column.size || 0;
        const handleMouseMove = (moveEvent) => {
            if(!setState) return;

            const newWidth = Math.max(minColSize, startWidth + moveEvent.clientX - startX);
            setState(draft => {
                const idx = draft.columns.findIndex(column => isEqualColumns(column, attribute));
                draft.columns[idx].size = newWidth;
            })
        };

        const handleMouseUp = () => {
            element.removeEventListener('mousemove', handleMouseMove);
            element.removeEventListener('mouseup', handleMouseUp);
        };

        element.addEventListener('mousemove', handleMouseMove);
        element.addEventListener('mouseup', handleMouseUp);
    };
    // =========================================== Mouse Controls end ==================================================

    // =================================================================================================================
    // =========================================== Keyboard Controls begin =============================================
    // =================================================================================================================

    useEffect(() =>  {
        if(!isActive) {
            setSelection([])
        }
    }, [isActive]);

    useEffect(() => {
        const element = document //gridRef?.current;
        if(!element || !selection?.length || !isActive) {
            return;
        }

        const handleKeyUp = () => {
            if(!editing?.index >= 0){
                setIsSelecting(false)
                setIsDragging(false)
                setTriggerSelectionDelete(false);
            }
        }

        const keyDownListener = e => handleKeyDown({
            e, dataLen: data.length, selection, setSelection, setIsSelecting,
            editing, setEditing, setTriggerSelectionDelete,
            visibleAttributes, pageSize: display.pageSize, setIsDragging
        })

        element.addEventListener('keydown', keyDownListener);
        element.addEventListener('keyup', handleKeyUp);

        return () => {
            element.removeEventListener('keydown', keyDownListener);
            element.removeEventListener('keyup', handleKeyUp);
        };
    }, [selection, editing, data?.length, isActive]);
    // =========================================== Keyboard Controls end ===============================================

    // =================================================================================================================
    // =========================================== Trigger delete begin ================================================
    // =================================================================================================================
    useEffect(() => {
        async function deleteFn() {
            if (triggerSelectionDelete && allowEdit) {
                const selectionRows = data.filter((d, i) => selection.find(s => (s.index || s) === i))
                const selectionCols = visibleAttributes.filter((_, i) => selection.map(s => s.attrI).includes(i)).map(c => c.name)

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


    return (
        <div className={`${theme?.table?.tableContainer} ${!paginationActive && theme?.table?.tableContainerNoPagination}`} ref={gridRef}>
            <div className={theme?.table?.tableContainer1}
                 onMouseLeave={e => handleMouseUp({setIsDragging})}>

                {/****************************************** Header begin ********************************************/}
                <div
                    className={theme?.table?.headerContainer}
                    style={{
                        zIndex: 5,
                        gridTemplateColumns: `${numColSize}px ${visibleAttrsWithoutOpenOut.map(v => v.size ? `${v.size}px` : `${defaultColumnSize}px`).join(' ')} ${gutterColSize}px`,
                        gridColumn: `span ${visibleAttrsWithoutOpenOut.length + 2} / ${visibleAttrsWithoutOpenOut.length + 2}`
                    }}
                >
                    {/*********************** header left gutter *******************/}
                    <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
                        <div key={'#'} className={`w-full ${theme?.table?.thContainerBg} ${frozenColClass}`} />
                    </div>
                    {/******************************************&*******************/}

                    {visibleAttrsWithoutOpenOut
                        .map((attribute, i) => (
                                <div
                                    key={i}
                                    className={`${theme?.table?.thead} ${frozenCols?.includes(i) ? theme?.table?.theadfrozen : ''}`}
                                    style={{width: attribute.size}}
                                >

                                    <div key={`controls-${i}`}
                                         className={`
                                        ${theme?.table?.thContainer}  
                                        ${selection?.find(s => s.attrI === i) ?
                                             theme?.table?.thContainerBgSelected : theme?.table?.thContainerBg
                                         }`
                                         }
                                    >
                                        <TableHeaderCell attribute={attribute} isEdit={isEdit} columns={columns} display={display} controls={controls} setState={setState} />
                                    </div>

                                    <div
                                        key={`resizer-${i}`}
                                        className={colResizer ? "z-5 -ml-2 w-[1px] hover:w-[2px] bg-gray-200 hover:bg-gray-400" : 'hidden'}
                                        style={{
                                            height: '100%',
                                            cursor: 'col-resize',
                                            position: 'relative',
                                            right: 0,
                                            top: 0
                                        }}
                                        onMouseDown={colResizer ? colResizer(attribute) : () => {}}
                                    />

                                </div>
                            )
                        )}

                    {/***********gutter column cell*/}
                    <div key={'##'}
                         className={`${theme?.table?.thContainerBg} z-[1] flex shrink-0 justify-between`}
                    > {` `}</div>
                </div>
                {/****************************************** Header end **********************************************/}


                {/****************************************** Rows begin **********************************************/}
                {data.filter(d => !d.totalRow)
                    .map((d, i) => (
                        <TableRow key={i} {...{
                            i, d,  isEdit, frozenCols, theme, columns, display,
                            allowEdit, isDragging, isSelecting, editing, setEditing, loading:false,
                            selection, setSelection, selectionRange, triggerSelectionDelete,
                            handleMouseDown, handleMouseMove, handleMouseUp,
                            setIsDragging, startCellCol, startCellRow,
                            updateItem, removeItem, defaultColumnSize
                        }} />
                    ))}
                <div id={display?.loadMoreId} className={`${paginationActive ? 'hidden' : ''} min-h-2 w-full text-center`}>
                    {loading ? 'loading...' : ''}
                </div>


                {/*/!****************************************** Gutter Row **********************************************!/*/}
                {/*<RenderGutter {...{allowEdit, c, visibleAttributes, isDragging, colSizes, attributes}} />*/}


                {/*/!****************************************** Total Row ***********************************************!/*/}
                {data
                    .filter(d => (display.showTotal || columns.some(c => c.showTotal)) && d.totalRow)
                    .map((d, i) => (
                        <TableRow key={i} {...{
                            i, d,  isEdit, frozenCols, theme, columns, display,
                            allowEdit, isDragging, isSelecting, editing, setEditing, loading:false,
                            selection, setSelection, selectionRange, triggerSelectionDelete,
                            handleMouseDown, handleMouseMove, handleMouseUp,
                            setIsDragging, startCellCol, startCellRow,
                            updateItem, removeItem, defaultColumnSize,
                            isTotalRow: true
                        }} />
                    ))}
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