import React, {useContext, useEffect, useMemo, useRef, useState} from "react";
import TableHeaderCell from "./components/TableHeaderCell";
import {useCopy, usePaste} from "./utils/hooks";
import {handleKeyDown} from "./utils/keyboard";
import {handleMouseUp, handleMouseMove, handleMouseDown} from "./utils/mouse";
import { TableRow } from "./components/TableRow";
import {actionsColSize, numColSize as numColSizeDf, gutterColSize as gutterColSizeDf, minColSize, minInitColSize} from "./constants"
import {ComponentContext} from "../../dataWrapper";
import ActionControls from "./controls/ActionControls";
import { CMSContext } from '../../../../../siteConfig'
import {Add, Copy} from "../../../../icons";
import {cloneDeep} from "lodash-es";
import {isEqualColumns} from "../../dataWrapper/utils/utils";

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
    pageRangeItem: 'cursor-pointer px-3  text-[#2D3E4C] py-1  text-[12px] hover:bg-slate-50 font-[500] rounded  uppercase leading-[18px]' ,
    pageRangeItemInactive: '',
    pageRangeItemActive: 'bg-slate-100 ',
    openOutContainerWrapper: 'fixed inset-0 right-0 h-full w-full z-[100]',
    openOutHeader: 'font-semibold text-gray-600'
}



export const RenderTable = ({isEdit, updateItem, removeItem, addItem, newItem, setNewItem, loading, allowEdit}) => {
    const { theme = { table: tableTheme } } = React.useContext(CMSContext) || {}
    const {state:{columns, sourceInfo, display, data}, setState} = useContext(ComponentContext);
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

    const visibleAttributes = useMemo(() => columns.filter(({show}) => show), [columns]);
    const visibleAttributesLen = useMemo(() => columns.filter(({show}) => show).length, [columns]);
    const openOutAttributes = useMemo(() => columns.filter(({openOut}) => openOut), [columns]);
    const openOutAttributesLen = useMemo(() => columns.filter(({openOut}) => openOut).length, [columns]);
    const visibleAttrsWithoutOpenOut = useMemo(() => columns.filter(({show, openOut}) => show && !openOut), [columns]);
    const visibleAttrsWithoutOpenOutLen = useMemo(() => columns.filter(({show, openOut}) => show && !openOut).length, [columns]);
    const actionColumns = useMemo(() => columns.filter(({actionType}) => actionType), [columns]);

    const paginationActive = display.usePagination && Math.ceil(display.totalLength / display.pageSize) > 1;
    const numColSize = display.showGutters ? numColSizeDf : 0
    const gutterColSize = display.showGutters ? gutterColSizeDf : 0

    usePaste((pastedContent, e) => {
        let {index, attrI} = typeof selection[selection.length - 1] === 'number' ?
            {index: selection[selection.length - 1], attrI: undefined} :
            selection[selection.length - 1];
        updateItemsOnPaste({pastedContent, e, index, attrI, data, visibleAttributes, updateItem})
    }, gridRef.current);

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
    }, gridRef.current)

    // =================================================================================================================
    // =========================================== auto resize begin ===================================================
    // =================================================================================================================
    useEffect(() => {
        if(!gridRef.current) return;

        const columnsWithSizeLength = visibleAttrsWithoutOpenOut.filter(({size}) => size).length;
        const gridWidth = gridRef.current.offsetWidth - numColSize - gutterColSize - (allowEdit ? actionColumns.length * actionsColSize : 0);
        const currUsedWidth = visibleAttrsWithoutOpenOut.reduce((acc, {size}) => acc + +(size || 0), 0);
        if (
            !columnsWithSizeLength ||
            columnsWithSizeLength !== visibleAttrsWithoutOpenOutLen ||
            currUsedWidth < gridWidth // resize to use full width
        ) {
            const availableVisibleAttributes = visibleAttrsWithoutOpenOut.filter(v => v.actionType || v.type === 'formula' || sourceInfo.columns.find(attr => attr.name === v.name));
            const initialColumnWidth = Math.max(minInitColSize, gridWidth / availableVisibleAttributes.length);
            setState(draft => {
                availableVisibleAttributes.forEach(attr => {
                    const idx = draft.columns.findIndex(column => isEqualColumns(column, attr));
                    if(idx !== -1) {
                        draft.columns[idx].size = initialColumnWidth;
                    }
                })
            });
        }
    }, [visibleAttributesLen, visibleAttrsWithoutOpenOutLen, openOutAttributesLen, sourceInfo.columns]);
    // ============================================ auto resize end ====================================================

    // =================================================================================================================
    // =========================================== Mouse Controls begin ================================================
    // =================================================================================================================
    const colResizer = (attribute) => (e) => {
        const element = gridRef.current;
        if(!element) return;

        const column = visibleAttributes.find(va => isEqualColumns(va, attribute));
        const startX = e.clientX;
        const startWidth = column.size || 0;
        const handleMouseMove = (moveEvent) => {
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
    useEffect(() => {
        const element = gridRef.current;
        if(!element) return;
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

        element.addEventListener('keydown', keyDownListener);
        element.addEventListener('keyup', handleKeyUp);

        return () => {
            element.removeEventListener('keydown', keyDownListener);
            element.removeEventListener('keyup', handleKeyUp);
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

    

    if(!visibleAttributes.length) return <div className={'p-2'}>No columns selected.</div>;

    return (
        <div className={`${theme?.table?.tableContainer} ${!paginationActive && theme?.table?.tableContainerNoPagination}`} ref={gridRef}>
            <div className={theme?.table?.tableContainer1}
                 onMouseLeave={e => handleMouseUp({setIsDragging})}>

                {/****************************************** Header begin ********************************************/}
                <div 
                    className={theme?.table?.headerContainer}
                    style={{
                        zIndex: 5, 
                        gridTemplateColumns: `${numColSize}px ${visibleAttrsWithoutOpenOut.map(v => `${v.size}px` || 'auto').join(' ')} ${gutterColSize}px`, 
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
                                className={`${theme?.table?.thead} ${frozenCols.includes(i) ? theme?.table?.theadfrozen : ''}`}
                                style={{width: attribute.size}}
                            >

                                <div key={`controls-${i}`}
                                    className={`
                                        ${theme?.table?.thContainer}  
                                        ${selection.find(s => s.attrI === i) ? 
                                            theme?.table?.thContainerBgSelected : theme?.table?.thContainerBg  
                                        }`
                                    }
                                >
                                    <TableHeaderCell attribute={attribute} isEdit={isEdit} />
                                </div>

                                <div 
                                    key={`resizer-${i}`} 
                                    className="z-5 -ml-2 w-[1px] hover:w-[2px] bg-gray-200 hover:bg-gray-400"
                                    style={{
                                        height: '100%',
                                        cursor: 'col-resize',
                                        position: 'relative',
                                        right: 0,
                                        top: 0
                                    }}
                                    onMouseDown={colResizer(attribute)}
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
                            i, d,  isEdit, frozenCols,
                            allowEdit, isDragging, isSelecting, editing, setEditing, loading:false,
                            selection, setSelection, selectionRange, triggerSelectionDelete,
                            handleMouseDown, handleMouseMove, handleMouseUp,
                            setIsDragging, startCellCol, startCellRow,
                            updateItem, removeItem
                        }} />
                    ))}
                <div id={display.loadMoreId} className={`${paginationActive ? 'hidden' : ''} min-h-2 w-full text-center`}>
                    {loading ? 'loading...' : ''}
                </div>


                {/*/!****************************************** Gutter Row **********************************************!/*/}
                {/*<RenderGutter {...{allowEdit, c, visibleAttributes, isDragging, colSizes, attributes}} />*/}


                {/*/!****************************************** Total Row ***********************************************!/*/}
                {/*{data*/}
                {/*    .filter(d => showTotal && d.totalRow)*/}
                {/*    .map((d, i) => (*/}
                {/*        <TableRow key={'total row'} {...{*/}
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

export default {
    "name": 'Spreadsheet',
    "type": 'table',
    useDataSource: true,
    useGetDataOnPageChange: true,
    useInfiniteScroll: true,
    showPagination: true,
    controls: {
        columns: [
            // settings from columns dropdown are stored in state.columns array, per column
            {type: 'select', label: 'Fn', key: 'fn',
                options: [
                    {label: 'fn', value: ' '}, {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}
                ]},
            {type: 'toggle', label: 'show', key: 'show'},
            {type: 'toggle', label: 'Exclude N/A', key: 'excludeNA'},
            {type: 'toggle', label: 'Open Out', key: 'openOut'},
            {type: 'toggle', label: 'Filter', key: 'filters',
                trueValue: [{type: 'internal', operation: 'filter', values: []}]},
            {type: 'toggle', label: 'Group', key: 'group'},
            {type: ({attribute, setState}) => {
                const duplicate = () => {
                    setState(draft => {
                        let idx = draft.columns.findIndex(col => isEqualColumns(col, attribute));
                        if (idx === -1) {
                            draft.columns.push({...attribute, normalName: `${attribute.name}_original`});
                            idx = draft.columns.length - 1; // new index
                        }
                        const columnToAdd = cloneDeep(draft.columns[idx]);
                        const numDuplicates = draft.columns.filter(col => col.isDuplicate && col.name === columnToAdd.name).length;

                        columnToAdd.isDuplicate = true;
                        columnToAdd.copyNum = numDuplicates + 1;
                        columnToAdd.normalName = `${columnToAdd.name}_copy_${numDuplicates + 1}`
                        // columnToAdd.originalName = columnToAdd.name;
                        // columnToAdd.name += ` - copy - ${numDuplicates}`
                        console.log('column to add', columnToAdd)
                        draft.columns.push(columnToAdd)
                        // draft.columns.splice(idx, 0, columnToAdd)
                    })
                }
                    return (
                        <div className={'flex place-content-center'} onClick={() => duplicate()}>
                            <Copy className={'text-gray-500 hover:text-gray-700'} />
                        </div>)
                }, label: 'duplicate'},
        ],
        actions: {Comp: ActionControls},
        more: [
            // settings from more dropdown are stored in state.display
            {type: 'toggle', label: 'Attribution', key: 'showAttribution'},
            {type: 'toggle', label: 'Allow Edit', key: 'allowEditInView'},
            {type: 'toggle', label: 'Use Search Params', key: 'allowSearchParams'},
            {type: 'toggle', label: 'Show Total', key: 'showTotal'},
            {type: 'toggle', label: 'Striped', key: 'striped'},
            {type: 'toggle', label: 'Allow Download', key: 'allowDownload'},
            {type: 'toggle', label: 'Use Pagination', key: 'usePagination'},
            {type: 'input', inputType: 'number', label: 'Page Size', key: 'pageSize', displayCdn: ({display}) => display.usePagination === true},
        ],
        inHeader: [
            // settings from in header dropdown are stores in the columns array per column.
            {type: 'select', label: 'Sort', key: 'sort', dataFetch: true,
                options: [
                    {label: 'Not Sorted', value: ''}, {label: 'A->Z', value: 'asc nulls last'}, {label: 'Z->A', value: 'desc nulls last'}
                ]},
            {type: 'select', label: 'Justify', key: 'justify',
                options: [
                    {label: 'Not Justified', value: ''},
                    {label: 'Left', value: 'left'},
                    {label: 'Center', value: 'center'},
                    {label: 'Right', value: 'right'},
                ]},
            {type: 'select', label: 'Format', key: 'formatFn',
                options: [
                    {label: 'No Format Applied', value: ' '},
                    {label: 'Comma Seperated', value: 'comma'},
                    {label: 'Abbreviated', value: 'abbreviate'},
                ]},

            // link controls
            {type: 'toggle', label: 'Is Link', key: 'isLink', displayCdn: ({isEdit}) => isEdit},
            {type: 'toggle', label: 'Use Id', key: 'useId', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'input', inputType: 'text', label: 'Link Text', key: 'linkText', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'input', inputType: 'text', label: 'Location', key: 'location', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
        ]

    },
    "EditComp": RenderTable,
    "ViewComp": RenderTable,
}