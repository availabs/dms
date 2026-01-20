import React, {useContext, useEffect, useMemo, useRef, useState} from "react";
import {
    actionsColSize,
    gutterColSize as gutterColSizeDf,
    minInitColSize,
    numColSize as numColSizeDf
} from "./constants"
import ActionControls from "./controls/ActionControls";
import {ComponentContext} from '../../../../../context'
import {ThemeContext} from "../../../../../../../ui/useTheme"
import {isEqualColumns} from "../../dataWrapper/utils/utils";
import {tableTheme} from "../../../../../../../ui/components/table";

const frozenCols = [0,1] // testing
const frozenColClass = '' // testing

export const RenderTable = ({cms_context, isEdit, updateItem, removeItem, addItem, newItem, setNewItem, loading, allowEdit,
                                currentPage, infiniteScrollFetchData}) => {
    const { UI, theme = { table: tableTheme } } = React.useContext(ThemeContext) || {}
    const {Table} = UI;
    const {state:{columns, sourceInfo, display, data, localFilteredData}, setState, controls={}, isActive, activeStyle} = useContext(ComponentContext);
    const gridRef = useRef(null);

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
            columnsWithSizeLength !== visibleAttrsWithoutOpenOutLen
            // || currUsedWidth < gridWidth // resize to use full width
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

    //console.log('render table')
    if(!visibleAttributes.length) return <div className={'p-2'}>No columns selected.</div>;
    return <Table columns={columns} data={data} localFilteredData={localFilteredData} display={display} controls={controls} setState={setState}
                  allowEdit={allowEdit} isEdit={isEdit} loading={loading}
                  gridRef={gridRef}
                  theme={theme} paginationActive={paginationActive}
                  updateItem={updateItem} removeItem={removeItem}
                  newItem={newItem} setNewItem={setNewItem} addItem={addItem}
                  numColSize={numColSize} gutterColSize={gutterColSize} frozenColClass={frozenColClass} frozenCols={frozenCols}
                  currentPage={currentPage}
                  infiniteScrollFetchData={infiniteScrollFetchData}
                  isActive={isActive} activeStyle={activeStyle}
    />
}

const handleCopy = async (obj) => {
    try {
        const text = JSON.stringify(obj, null, 2);

        // modern async clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            throw new Error('Error copying format')
        }
    } catch (err) {
        console.error("Failed to copy:", err);
    }
};

const handlePaste = async (attribute, setAttribute) => {
    try {
        if(navigator.clipboard && navigator.clipboard.readText){
            const obj = await navigator.clipboard.readText();
            const parsedObj = JSON.parse(obj);
            const {
                justify='',
                formatFn='',
                headerFontStyle='',
                valueFontStyle='',
                hideHeader= false,
                hideValue= false,
                wrapText = false,
                bgColor='',
                cardSpan=''
            } = parsedObj;

            const newAttribute = {
                ...attribute,
                justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, wrapText
            }

            return setAttribute(newAttribute)

        }else{
            throw new Error('Error pasting format')
        }
    }catch (e){
        console.error("Failed to paste:", e)
    }
}

export default {
    "name": 'Spreadsheet',
    "type": 'table',
    useDataSource: true,
    useGetDataOnPageChange: true,
    useInfiniteScroll: true,
    showPagination: true,
    keepOriginalValues: true,
    themeKey: 'table',
    controls: {
        columns: [
            // settings from columns dropdown are stored in state.columns array, per column
            {type: 'select', label: 'Fn', key: 'fn',
                options: [
                    {label: 'fn', value: ' '}, {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}, {label: 'avg', value: 'avg'}
                ]},
            {type: 'toggle', label: 'show', key: 'show'},
            {type: 'toggle', label: 'Exclude N/A', key: 'excludeNA'},
            {type: 'toggle', label: 'Open Out', key: 'openOut'},
            {type: 'toggle', label: 'Filter', key: 'filters',
                trueValue: [{type: 'internal', operation: 'filter', values: []}]},
            {type: 'toggle', label: 'Group', key: 'group'},
            {type: 'toggle', label: 'Value column', key: 'valueColumn', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.yAxis || attribute.categorize) return;
                    state.columns.forEach(column => {
                        column.valueColumn = value ? column.name === attribute.name : value;
                    })
                }},
        ],
        actions: {Comp: ActionControls},
        more: [
            // settings from more dropdown are stored in state.display
            {type: 'toggle', label: 'Attribution', key: 'showAttribution'},
            {type: 'toggle', label: 'Allow Edit', key: 'allowEditInView'},
            {type: 'toggle', label: 'Allow Add New', key: 'allowAdddNew'},
            {type: 'select', label: 'Add New Behaviour', key: 'addNewBehaviour', displayCdn: ({display}) => display.allowAdddNew,
                options: [
                    {label: 'Please select', value: ''},
                    {label: 'Append Entry', value: 'append'},
                    {label: 'Clear Form', value: 'clear'},
                    {label: 'Navigate', value: 'navigate'},
                ]
            },
            {type: 'input', inputType: 'text', label: 'Navigate to', key: 'navigateUrlOnAdd',
                displayCdn: ({display}) => display.allowAdddNew && display.addNewBehaviour === 'navigate'},
            {type: 'toggle', label: 'Use Page Filters', key: 'usePageFilters'},
            {type: 'toggle', label: 'Show Total', key: 'showTotal'},
            {type: 'toggle', label: 'Striped', key: 'striped'},
            {type: 'toggle', label: 'Allow Download', key: 'allowDownload'},
            {type: 'toggle', label: 'Always Fetch Data', key: 'readyToLoad'},
            {type: 'toggle', label: 'Use Pagination', key: 'usePagination'},
            {type: 'toggle', label: 'Hide Null Open out columns', key: 'hideIfNullOpenouts'},
            {type: 'select', label: 'Filter Relation', key: 'filterRelation',
                options: [{label: 'and', value: 'and'}, {label: 'or', value: 'or'}]
            },
            {type: 'input', inputType: 'number', label: 'Page Size', key: 'pageSize'},
        ],
        inHeader: [
            // settings from in header dropdown are stored in the columns array per column.
            {type: ({attribute, setAttribute}) => {
                    const {UI} = useContext(ThemeContext);
                    const {Button} = UI;
                    const {
                        justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, wrapText
                    } = attribute;
                    const objToCopy = {justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, wrapText}


                    return (
                        <div className={'flex'}>
                            <Button onClick={() => handleCopy(objToCopy)}>copy format</Button>
                            <Button onClick={() => handlePaste(attribute, setAttribute)}>paste format</Button>
                        </div>
                    )
                },
                label: 'format controls', key: '', displayCdn: ({isEdit}) => isEdit},
            {
                type: 'filter', label: 'filter', placeHolder: 'search...', key: 'localFilter'
            },
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
                ], displayCdn: ({isEdit}) => isEdit},
            {type: 'select', label: 'Format', key: 'formatFn',
                options: [
                    {label: 'No Format Applied', value: ' '},
                    {label: 'Comma Separated', value: 'comma'},
                    {label: 'Comma Separated ($)', value: 'comma_dollar'},
                    {label: 'Abbreviated', value: 'abbreviate'},
                    {label: 'Abbreviated ($)', value: 'abbreviate_dollar'},
                    {label: 'Date', value: 'date'},
                    {label: 'Title', value: 'title'},
                    {label: '0 = N/A', value: 'zero_to_na'},
                ], displayCdn: ({isEdit}) => isEdit},
            {type: 'toggle', label: 'Wrap Text', key: 'wrapText', displayCdn: ({isEdit}) => isEdit},
            {type: 'toggle', label: 'Wrap Header', key: 'wrapHeader', displayCdn: ({isEdit}) => isEdit},
            {type: 'toggle', label: 'Show Total', key: 'showTotal', displayCdn: ({isEdit}) => isEdit},
            {type: 'toggle', label: 'Allow Edit', key: 'allowEditInView', displayCdn: ({isEdit}) => isEdit},

            // link controls
            {type: 'toggle', label: 'Is Link', key: 'isLink', displayCdn: ({isEdit}) => isEdit},
            {type: 'toggle', label: 'Is External', key: 'isLinkExternal', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'input', inputType: 'text', label: 'Link Text', key: 'linkText', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'input', inputType: 'text', label: 'Location', key: 'location', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'select', label: 'Search Params', key: 'searchParams', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink,
                options: [
                    {label: 'None', value: undefined},
                    {label: 'ID', value: 'id'},
                    {label: 'Value', value: 'value'},
                    {label: 'Raw Value', value: 'rawValue'}
                ]
            },
        ]

    },
    "EditComp": RenderTable,
    "ViewComp": RenderTable,
}
