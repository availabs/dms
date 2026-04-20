import React, { useContext } from 'react'
import { RenderTable } from './index'
import ActionControls from './controls/ActionControls'
import { ThemeContext } from '../../../../../../../ui/useTheme'

const handleCopy = async (obj) => {
    try {
        const text = JSON.stringify(obj, null, 2);
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
        if (navigator.clipboard && navigator.clipboard.readText) {
            const obj = await navigator.clipboard.readText();
            const parsedObj = JSON.parse(obj);
            const {
                justify = '',
                formatFn = '',
                headerFontStyle = '',
                valueFontStyle = '',
                hideHeader = false,
                hideValue = false,
                wrapText = false,
                bgColor = '',
                cardSpan = ''
            } = parsedObj;

            const newAttribute = {
                ...attribute,
                justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, wrapText
            }
            return setAttribute(newAttribute)
        } else {
            throw new Error('Error pasting format')
        }
    } catch (e) {
        console.error("Failed to paste:", e)
    }
}

export default {
    "name": 'Spreadsheet',
    "type": 'table',
    useDataSource: true,
    useDataWrapper: true,
    useGetDataOnPageChange: true,
    useInfiniteScroll: true,
    showPagination: true,
    keepOriginalValues: true,
    showAllColumnsControl: false,
    themeKey: 'table',
    defaultState: {
        filters: { op: 'AND', groups: [] },
        display: { usePagination: true, pageSize: 5 },
        columns: [],
        data: [],
        externalSource: { columns: [] }
    },
    controls: {
        columns: [
            { type: 'toggle', label: 'show', key: 'show' },
            { type: 'toggle', label: 'Group', key: 'group' },
            { type: 'select', label: 'Fn', key: 'fn',
                options: [
                    { label: 'list', value: 'list' }, { label: 'sum', value: 'sum' }, { label: 'count', value: 'count' }, { label: 'avg', value: 'avg' }, { label: 'fn exempt', value: 'exempt' }
                ]
            },
            { type: 'toggle', label: 'Exclude N/A', key: 'excludeNA' },
            { type: 'toggle', label: 'Open Out', key: 'openOut' },
            { type: 'toggle', label: 'Value column', key: 'valueColumn',
                onChange: ({ key, value, attribute, state, columnIdx }) => {
                    if (attribute.yAxis || attribute.categorize) return;
                    state.columns.forEach(column => {
                        column.valueColumn = value ? column.name === attribute.name : value;
                    })
                }
            },
        ],
        actions: { name: 'Actions', Comp: ActionControls, type: ({ dwAPI }) => <ActionControls isInMenu={true} dwAPI={dwAPI} /> },
        more: [
            { type: 'toggle', label: 'Attribution', key: 'showAttribution' },
            { type: 'toggle', label: 'Striped', key: 'striped' },
            { type: 'toggle', label: 'Auto Resize Columns', key: 'autoResize' },
            { type: 'toggle', label: 'Hide Null Open out columns', key: 'hideIfNullOpenouts' },
            { type: 'toggle', label: 'Virtualize Columns', key: 'virtualizeColumns' },
            { type: 'input', label: 'Max Height', key: 'maxHeight', displayCdn: ({ display }) => !display.usePagination },
            { type: 'toggle', label: 'Allow Download', key: 'allowDownload' },
            { type: 'toggle', label: 'Use Pagination', key: 'usePagination' },
            { type: 'input', inputType: 'number', label: 'Page Size', key: 'pageSize' },
        ],
        data: [
            { type: 'toggle', label: 'Allow Edit', key: 'allowEditInView' },
            { type: 'toggle', label: 'Allow Add New', key: 'allowAdddNew' },
            { type: 'select', label: 'Add New Behaviour', key: 'addNewBehaviour', displayCdn: ({ display }) => display.allowAdddNew,
                options: [
                    { label: 'Please select', value: '' },
                    { label: 'Append Entry', value: 'append' },
                    { label: 'Clear Form', value: 'clear' },
                    { label: 'Navigate', value: 'navigate' },
                ]
            },
            { type: 'input', inputType: 'text', label: 'Navigate to', key: 'navigateUrlOnAdd',
                displayCdn: ({ display }) => display.allowAdddNew && display.addNewBehaviour === 'navigate' },
            { type: 'toggle', label: 'Show Total', key: 'showTotal' },
            { type: 'toggle', label: 'Prevent Duplicate Fetch', key: 'preventDuplicateFetch' },
            { type: 'toggle', label: 'Always Fetch Data', key: 'readyToLoad' },
        ],
        inHeader: [
            { type: 'input', inputType: 'text', label: 'Display Name', key: 'display_name', displayCdn: ({ attribute }) => attribute.origin === 'static' },
            { type: 'input', inputType: 'text', label: 'Static Value', key: 'staticValue', displayCdn: ({ attribute }) => attribute.origin === 'static' },
            { type: ({ attribute, setAttribute }) => {
                    const { UI } = useContext(ThemeContext);
                    const { Button } = UI;
                    const {
                        justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, wrapText
                    } = attribute;
                    const objToCopy = { justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, wrapText }

                    return (
                        <div className={'flex'}>
                            <Button onClick={() => handleCopy(objToCopy)}>copy format</Button>
                            <Button onClick={() => handlePaste(attribute, setAttribute)}>paste format</Button>
                        </div>
                    )
                },
                label: 'format controls', key: '', displayCdn: ({ isEdit }) => isEdit
            },
            { type: 'filter', label: 'filter', placeHolder: 'search...', key: 'localFilter' },
            { type: 'select', label: 'Sort', key: 'sort', dataFetch: true,
                options: [
                    { label: 'Not Sorted', value: '' }, { label: 'A->Z', value: 'asc nulls last' }, { label: 'Z->A', value: 'desc nulls last' }
                ]
            },
            { type: 'select', label: 'Justify', key: 'justify',
                options: [
                    { label: 'Not Justified', value: '' },
                    { label: 'Left', value: 'left' },
                    { label: 'Center', value: 'center' },
                    { label: 'Right', value: 'right' },
                ], displayCdn: ({ isEdit }) => isEdit
            },
            { type: 'select', label: 'Format', key: 'formatFn',
                options: [
                    { label: 'No Format Applied', value: ' ' },
                    { label: 'Comma Separated', value: 'comma' },
                    { label: 'Comma Separated ($)', value: 'comma_dollar' },
                    { label: 'Abbreviated', value: 'abbreviate' },
                    { label: 'Abbreviated ($)', value: 'abbreviate_dollar' },
                    { label: 'Date', value: 'date' },
                    { label: 'Title', value: 'title' },
                    { label: '0 = N/A', value: 'zero_to_na' },
                ], displayCdn: ({ isEdit }) => isEdit
            },
            { type: 'toggle', label: 'Wrap Text', key: 'wrapText', displayCdn: ({ isEdit }) => isEdit },
            { type: 'toggle', label: 'Wrap Header', key: 'wrapHeader', displayCdn: ({ isEdit }) => isEdit },
            { type: 'toggle', label: 'Show Total', key: 'showTotal', displayCdn: ({ isEdit }) => isEdit },
            { type: 'toggle', label: 'Allow Edit', key: 'allowEditInView', displayCdn: ({ isEdit }) => isEdit },
            { type: 'toggle', label: 'Is Link', key: 'isLink', displayCdn: ({ isEdit }) => isEdit },
            { type: 'toggle', label: 'Is External', key: 'isLinkExternal', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },
            { type: 'input', inputType: 'text', label: 'Link Text', key: 'linkText', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },
            { type: 'input', inputType: 'text', label: 'Location', key: 'location', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },
            { type: 'select', label: 'Search Params', key: 'searchParams', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink,
                options: [
                    { label: 'None', value: undefined },
                    { label: 'ID', value: 'id' },
                    { label: 'Value', value: 'value' },
                    { label: 'Raw Value', value: 'rawValue' }
                ]
            },
        ]
    },
    "EditComp": RenderTable,
    "ViewComp": RenderTable,
}
