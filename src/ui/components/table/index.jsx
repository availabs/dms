import {handleMouseDown, handleMouseMove, handleMouseUp} from "./utils/mouse";
import TableHeaderCell from "./components/TableHeaderCell";
import {TableRow} from "./components/TableRow";
import React, {useMemo} from "react";
import { ThemeContext } from '../../useTheme'

export const defaultNumColSize = 20;
export const defaultGutterColSize = 20;

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

export default function ({
    paginationActive, gridRef,
    isDragging, setIsDragging, selection=[], setSelection,
    allowEdit, isSelecting, editing, setEditing, selectionRange, triggerSelectionDelete,
    startCellCol, startCellRow,
    updateItem, removeItem, loading, isEdit,
    numColSize=defaultNumColSize, gutterColSize=defaultGutterColSize, frozenColClass, frozenCols=[], colResizer,
    columns, data, display, controls, setState
}) {
    const { theme = {table: tableTheme}} = React.useContext(ThemeContext) || {}
    const visibleAttrsWithoutOpenOut = useMemo(() => columns.filter(({show, openOut}) => show && !openOut), [columns]);

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
                            updateItem, removeItem
                        }} />
                    ))}
                <div id={display?.loadMoreId} className={`${paginationActive ? 'hidden' : ''} min-h-2 w-full text-center`}>
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