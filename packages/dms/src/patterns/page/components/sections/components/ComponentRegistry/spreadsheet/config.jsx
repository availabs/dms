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
                cardSpan = '',
                cardRowSpan = ''
            } = parsedObj;

            const newAttribute = {
                ...attribute,
                justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, cardRowSpan, wrapText
            }
            return setAttribute(newAttribute)
        } else {
            throw new Error('Error pasting format')
        }
    } catch (e) {
        console.error("Failed to paste:", e)
    }
}

export const componentFunctions = {
    providers: [
        {
            id: 'hover_highlight',
            label: 'Hover: Publish Row',
            description: 'On hover, publishes a column value to a page action param. Clears on mouse leave.',
            trigger: 'hover',
            args: [
                { key: 'column', label: 'Column to publish', type: 'column-select' },
            ],
        },
        {
            id: 'click_publish',
            label: 'Click: Publish Row',
            description: 'On click, publishes a the column value to a page action param.',
            trigger: 'click',
            paramKey: "",
            args: [
                { key: 'column', label: 'Column to publish', type: 'column-select' },
                {
                    key: 'id_column',
                    label: 'Row identity column (optional)',
                    description: 'When set, publishes a { id, value } composite so rows sharing the same published value toggle independently. Leave empty to toggle by value.',
                    type: 'column-select',
                },
                {
                    key: 'append_params',
                    label: 'Append Params',
                    type: 'select',
                    options: [
                        { label: 'Append', value: true },
                        { label: 'Replace', value: false },
                    ],
                }
            ],
        },
    ],
    subscribers: [
        {
            id: 'row_highlight',
            label: 'Highlight Matching Row',
            description: 'Highlights rows whose column value matches an incoming action param.',
            trigger: 'action_param',
            args: [
                { key: 'column', label: 'Column to match', type: 'column-select' },
                {
                    key: 'style',
                    label: 'Highlight style',
                    type: 'select',
                    options: [
                        { label: 'Background', value: 'bg' },
                        { label: 'Border', value: 'border' },
                        { label: 'Bold', value: 'bold' },
                    ],
                },
            ],
        },
    ],
};

// Per-section "Table style" picker — mirror of FilterComponent's `display.filterStyle`.
// Options come from `theme.table.styles` so adding a new named style in the brand theme
// surfaces it in the toolbar with no code change. Empty value = the theme's
// `theme.table.options.activeStyle` (the brand default).
const buildTableStyleOptions = (theme) => {
    const styles = theme?.table?.styles || [];
    return [{ label: '(theme default)', value: '' }, ...styles.map(s => ({ label: s.name, value: s.name }))];
};

// `controls` is a function of the merged theme (same contract as Card.config /
// FilterComponent.config) so style options reflect the live theme.
const buildControls = (theme) => ({
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
            { type: 'select', label: 'Table style', key: 'tableStyle',
                options: buildTableStyleOptions(theme) },
            { type: 'toggle', label: 'Attribution', key: 'showAttribution' },
            { type: 'toggle', label: 'Striped', key: 'striped' },
            { type: 'toggle', label: 'Auto Resize Columns', key: 'autoResize' },
            { type: 'toggle', label: 'Hide Null Open out columns', key: 'hideIfNullOpenouts' },
            { type: 'toggle', label: 'Open Out Default Open', key: 'openOutDefaultOpen' },
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
            { type: 'select', label: 'Empty Row Mode', key: 'emptyRowMode',
                options: [
                    { label: 'None', value: '' },
                    { label: 'Show placeholder', value: 'placeholder' },
                    { label: 'Show inline add row', value: 'inline_add' },
                ]
            },
            { type: 'toggle', label: 'Show Total', key: 'showTotal' },
            { type: 'select', label: 'Data Fetch Mode', key: 'fetchMode',
                options: [
                    { label: 'Cache (use preloaded data)', value: 'cache' },
                    { label: 'Smart (fetch on change)',    value: 'smart' },
                    { label: 'Force (always re-fetch)',    value: 'force' },
                ]
            },
        ],
        inHeader: [
            { type: 'input', inputType: 'text', label: 'Display Name', key: 'display_name', displayCdn: ({ attribute }) => attribute.origin === 'static' },
            { type: 'input', inputType: 'text', label: 'Static Value', key: 'staticValue', displayCdn: ({ attribute }) => attribute.origin === 'static' },
            { type: ({ attribute, setAttribute }) => {
                    const { UI } = useContext(ThemeContext);
                    const { Button } = UI;
                    const {
                        justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, cardRowSpan, wrapText
                    } = attribute;
                    const objToCopy = { justify, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue, bgColor, cardSpan, cardRowSpan, wrapText }

                    return (
                        <div className={'flex'}>
                            <Button onClick={() => handleCopy(objToCopy)}>copy format</Button>
                            <Button onClick={() => handlePaste(attribute, setAttribute)}>paste format</Button>
                        </div>
                    )
                },
                label: 'format controls', key: '', displayCdn: ({ isEdit }) => isEdit
            },
            { type: 'toggle', label: 'Server Filter', key: 'serverFilter', displayCdn: ({ isEdit }) => isEdit },
            { type: 'filter', label: 'Filter', key: 'serverFilterValue', displayCdn: ({ attribute }) => attribute.serverFilter },
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
                    { label: 'Time (HH:MM am/pm)', value: 'time' },
                    { label: 'Date + Time', value: 'datetime' },
                    { label: 'Title', value: 'title' },
                    { label: '0 = N/A', value: 'zero_to_na' },
                ], displayCdn: ({ isEdit }) => isEdit
            },
            { type: 'input', inputType: 'text', label: 'Default Value', key: 'defaultValue', displayCdn: ({ isEdit }) => isEdit },
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
            { type: 'toggle', label: 'Persist Search Params', key: 'persistSearchParams', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },
        ]
});

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
    supportsTemplates: true,
    themeKey: 'table',
    defaultState: {
        filters: { op: 'AND', groups: [] },
        display: { usePagination: true, pageSize: 5, hideExternalToggle: true },
        columns: [],
        data: [],
        externalSource: { columns: [] }
    },
    controls: buildControls,
    componentFunctions,
    "EditComp": RenderTable,
    "ViewComp": RenderTable,
}
