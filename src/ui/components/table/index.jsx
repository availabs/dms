import React, {useEffect, useMemo, useRef, useState} from "react";
import { ThemeContext } from '../../useTheme';
import DataTypes from "../../columnTypes"
import Icon from "../Icon";
import {handleMouseDown, handleMouseMove, handleMouseUp} from "./utils/mouse";
import TableHeaderCell from "./components/TableHeaderCell";
import {TableRow} from "./components/TableRow";
import {useCopy, usePaste, getLocation} from "./utils/hooks";
import {isEqualColumns, parseIfJson} from "./utils";
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
    thContainer: 'w-full font-semibold px-3 py-1 content-center text-sm font-semibold text-gray-600 border',
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
    openOutContainer: 'w-[330px] overflow-auto scrollbar-sm flex flex-col gap-[12px] p-[16px] bg-white h-full float-right',
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
const updateItemsOnPaste = ({pastedContent, index, attrI, data, visibleAttributes, updateItem, selection}) => {
    const paste = pastedContent?.split('\n').filter(row => row.length).map(row => row.split('\t'));
    if(!paste) return;

    const rows = [...new Set(selection.map(s => s?.index !== undefined ? s.index : s))].sort((a, b) => a - b);
    if(rows.length > paste.length){
        // repeat rows
        const extraRowsInSelection = rows.length - paste.length;
        const repeatCount = (extraRowsInSelection - ( extraRowsInSelection % paste.length )) / paste.length;
        const repeatArray = [];

        for (let i = 0; i < repeatCount; i++) {
            repeatArray.push(...paste);
        }

        paste.push(...repeatArray)
    }

    const rowsToPaste = [...new Array(paste.length).keys()].map(i => index + i).filter(i => i < data.length)

    const columnsToPaste = [...new Array(paste[0].length).keys()]
        .map(i => visibleAttributes[attrI + i]?.allowEditInView ? visibleAttributes[attrI + i]?.name : undefined)
        .filter(i => i);
    const itemsToUpdate = rowsToPaste.map((row, rowI) => {
        let rowData = {...data[row]};

        for(let colI = 0; colI < columnsToPaste.length; colI++){
            const col = columnsToPaste[colI];
            const attr = visibleAttributes[attrI + colI];
            const val = paste[rowI][colI];
            let finalValue = val;

            if(val === '<InvalidValue>'){
                if (['select', 'multiselect'].includes(attr?.type)) {
                    finalValue = [];
                } else if (attr?.type === 'lexical') {
                    finalValue = '';
                } else {
                    finalValue = '';
                }
            }

            if(attr?.type === 'lexical' && finalValue){
                finalValue = parseIfJson(finalValue)
            }

            rowData[col] = finalValue
        }
        return rowData;
    });
    updateItem(undefined, undefined, itemsToUpdate);
}
export default function ({
    paginationActive, gridRef,
    allowEdit,
    updateItem, removeItem, loading, isEdit,
    numColSize=defaultNumColSize, gutterColSize=defaultGutterColSize, frozenColClass, frozenCols=[],
    columns=[], data=[], display={}, controls={}, setState, isActive, customTheme={},
    addItem, newItem={}, setNewItem,
}) {
    const { theme: themeFromContext = {table: tableTheme}} = React.useContext(ThemeContext) || {};
    const theme = useMemo(() => ({
        ...themeFromContext,
        table: {
            ...tableTheme,
            ...(themeFromContext.table || {}),
            ...customTheme
        }
    }), [themeFromContext, customTheme]);

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
        if(!allowEdit || !columns.some(c => c.allowEditInView)) return;
        // first cell of selection
        let {index, attrI} = typeof selection[0] === 'number' ? {index: selection[0], attrI: undefined} : selection[0];
        updateItemsOnPaste({pastedContent, e, index, attrI, data, visibleAttributes, selection, updateItem})
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
                    const isLexical = visibleAttributes[attrI]?.type === 'lexical';
                    let currData = data[index][currColName]?.originalValue || data[index][currColName] || '<InvalidValue>';
                    if(isLexical && typeof currData === 'object'){
                        currData = JSON.stringify(currData)
                    }
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
        if(!isActive && selection?.length) {
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
            if (triggerSelectionDelete && (allowEdit || columns.some(c => c.allowEditInView))) {
                const selectionRows = data.filter((d, i) => selection.find(s => (s.index || s) === i))
                const selectionCols = visibleAttributes.filter((c, i) => c.allowEditInView && selection.map(s => s.attrI).includes(i)).map(c => c.name)

                if (selectionCols.length) {
                    // partial selection
                    updateItem(undefined, undefined, selectionRows.map(row => ({...row, ...selectionCols.reduce((acc, curr) => ({...acc, [curr]: ''}), {})})))
                }else{
                    // full row selection
                    updateItem(undefined, undefined, selectionRows.map(row => ({...row, ...visibleAttributes.filter(c => c.allowEditInView).reduce((acc, curr) => ({...acc, [curr]: ''}), {})})))
                }
            }
        }

        deleteFn()
    }, [triggerSelectionDelete])
    // ============================================ Trigger delete end =================================================

    const rows = useMemo(() => data.filter(d => !d.totalRow), [data]);
    const totalRow = useMemo(() => data.filter(d => (display.showTotal || columns.some(c => c.showTotal)) && d.totalRow), [data, display.showTotal, columns])

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
                {rows
                    .map((d, i) => (
                        <TableRow key={i}
                                  i={i} d={d} isEdit={isEdit}
                                  frozenCols={frozenCols}
                                  theme={theme}
                                  columns={columns} display={display}
                                  allowEdit={allowEdit}
                                  isDragging={isDragging} isSelecting={isSelecting} editing={editing}
                                  setEditing={setEditing}
                                  loading={false} selection={selection} setSelection={setSelection} selectionRange={selectionRange}
                                  triggerSelectionDelete={triggerSelectionDelete}
                                  setIsDragging={setIsDragging}
                                  startCellCol={startCellCol} startCellRow={startCellRow}
                                  updateItem={updateItem} removeItem={removeItem} defaultColumnSize={defaultColumnSize}
                         />
                    ))}
                <div id={display?.loadMoreId} className={`${paginationActive ? 'hidden' : ''} min-h-2 w-full text-center`}>
                    {loading ? 'loading...' : ''}
                </div>


                {/*/!****************************************** Gutter Row **********************************************!/*/}
                {/*<RenderGutter {...{allowEdit, c, visibleAttributes, isDragging, colSizes, attributes}} />*/}


                {/*/!****************************************** Total Row ***********************************************!/*/}
                {totalRow
                    .map((d, i) => (
                        <TableRow key={i}
                                  i={i} d={d} isEdit={isEdit}
                                  frozenCols={frozenCols}
                                  theme={theme}
                                  columns={columns} display={display}
                                  allowEdit={allowEdit}
                                  isDragging={isDragging} isSelecting={isSelecting} editing={editing}
                                  setEditing={setEditing}
                                  loading={false} selection={selection} setSelection={setSelection} selectionRange={selectionRange}
                                  triggerSelectionDelete={triggerSelectionDelete}
                                  setIsDragging={setIsDragging}
                                  startCellCol={startCellCol} startCellRow={startCellRow}
                                  updateItem={updateItem} removeItem={removeItem} defaultColumnSize={defaultColumnSize}
                                  isTotalRow={true}
                        />
                    ))}
                {/*/!****************************************** Rows end ************************************************!/*/}

                {/********************************************* out of scroll ********************************************/}
                {/***********************(((***************** Add New Row Begin ******************************************/}
                {
                    display.allowAdddNew?
                        <div
                            className={`grid bg-white divide-x divide-y ${isDragging ? `select-none` : ``} sticky bottom-0 z-[1]`}
                            style={{
                                gridTemplateColumns: `${numColSize}px 20px ${visibleAttrsWithoutOpenOut.map((v, i) => v.size ? `${i === 0 ? (+v.size - 20) : v.size}px` : `${i === 0 ? (defaultNumColSize - 20) : defaultColumnSize}px`).join(' ')} ${gutterColSize}px`,
                                gridColumn: `span ${visibleAttrsWithoutOpenOut.length + 3} / ${visibleAttrsWithoutOpenOut.length + 3}`
                            }}                    >
                            <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
                                <div key={'#'} className={`w-full font-semibold border bg-gray-50 text-gray-500`}>

                                </div>
                            </div>

                            <div className={'bg-white flex flex-row h-fit justify-evenly opacity-50 hover:opacity-100 border-0'}
                                 style={{width: '20px'}}>
                                <button
                                    className={'w-fit p-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                                    onClick={e => {
                                        addItem()
                                    }}>
                                    <Icon icon={'CirclePlus'} className={'text-white'} height={20} width={20}/>
                                </button>
                            </div>
                            {
                                visibleAttrsWithoutOpenOut
                                    .map((attribute, attrI) => {
                                        const Comp = DataTypes[attribute?.type || 'text']?.EditComp || <div></div>;
                                        const size = attrI === 0 ? (+attribute.size || defaultNumColSize) - 20 : (+attribute.size || defaultNumColSize)
                                        return (
                                            <div
                                                key={`add-new-${attrI}`}
                                                className={`flex border`}
                                                style={{width: size}}
                                            >
                                                <Comp
                                                    key={`${attribute.name}`}
                                                    menuPosition={'top'}
                                                    className={'p-1 bg-white hover:bg-blue-50 w-full h-full'}
                                                    {...attribute}
                                                    size={size}
                                                    value={newItem[attribute.name]}
                                                    placeholder={'+ add new'}
                                                    onChange={e => setNewItem({...newItem, [attribute.name]: e})}
                                                    onPaste={e => {
                                                        e.preventDefault();
                                                        e.stopPropagation();

                                                        const paste =
                                                            (e.clipboardData || window.clipboardData).getData("text")?.split('\n').map(row => row.split('\t'));
                                                        const pastedColumns = [...new Array(paste[0].length).keys()].map(i => visibleAttributes[attrI + i]).filter(i => i);
                                                        const tmpNewItem = pastedColumns.reduce((acc, c, i) => ({
                                                            ...acc,
                                                            [c]: paste[0][i]
                                                        }), {})
                                                        setNewItem({...newItem, ...tmpNewItem})

                                                    }}
                                                />
                                            </div>
                                        )
                                    })
                            }
                        </div> : null
                }
                {/***********************(((***************** Add New Row End ********************************************/}
            </div>
        </div>
    )
}