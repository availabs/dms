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
        {
            id: 'load_publish',
            label: 'On Load: Publish Derived Row',
            description: 'When data loads, derive a row (first/max/min over a metric) and publish one or more of its column values to page action params — drives master-detail (e.g. a Delay-by-corridor table publishes its top corridor as `activeTmcLinear`). Re-publishes whenever the data changes (e.g. a new event).',
            trigger: 'load',
            paramKey: "",
            args: [
                { key: 'derivation', label: 'Row to publish', type: 'select',
                    options: [
                        { label: 'First (top row)', value: 'first' },
                        { label: 'Max of metric',   value: 'max' },
                        { label: 'Min of metric',   value: 'min' },
                    ] },
                { key: 'metric', label: 'Metric column (for max/min)', type: 'column-select' },
                { key: 'column', label: 'Column to publish', type: 'column-select' },
                // programmatic builds may instead set args.publishes = [{ column, paramKey }, …]
                // to publish several params from the one derived row.
            ],
        },
        {
            id: 'conditional_row_style',
            label: 'Conditional Row Style',
            description: 'Accent a whole row when one of its columns matches a condition (e.g. county_priority empty → left-edge + tint). The Style Key names a `theme.table` style (e.g. `rowAccentAmber`); a neutral `rowAccent` default ships in the library.',
            trigger: 'render',
            args: [
                { key: 'column', label: 'Column to test', type: 'column-select' },
                { key: 'when', label: 'Condition', type: 'select',
                    options: [
                        { label: 'Is empty',      value: 'empty' },
                        { label: 'Is not empty',  value: 'notempty' },
                        { label: 'Equals value',  value: 'equals' },
                        { label: 'Not equals value', value: 'notEquals' },
                    ] },
                { key: 'value', label: 'Value (for equals / not equals)', type: 'input', inputType: 'text' },
                { key: 'styleKey', label: 'Style Key (theme.table)', type: 'input', inputType: 'text' },
            ],
        },
    ],
    subscribers: [
        {
            id: 'data_refresh',
            label: 'Refetch Data on Param Change',
            description: 'Refetches this section\'s data whenever the subscribed action param\'s value changes (e.g. an Add: Publish Created Row provider fired). Requires fetch mode smart/force.',
            trigger: 'action_param',
            args: [],
        },
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
            { type: 'select', label: 'Open Out Mode', key: 'openOutMode',
                options: [
                    { label: 'Drawer (default)', value: 'drawer' },
                    { label: 'Inline (expand below row)', value: 'inline' },
                ]
            },
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
            // Column type — picks the view/edit cell renderer (TableCell reads `attribute.type`
            // → columnTypes[type].ViewComp/EditComp). Curated to the author-facing data-entry
            // types; the value-shaping types (select/multiselect/status_pill/…) still need their
            // own companion config (options, mapped_options, value→style) to be useful.
            { type: 'select', label: 'Column Type', key: 'type', displayCdn: ({ isEdit }) => isEdit,
                options: [
                    { label: 'Text', value: 'text' },
                    { label: 'Number', value: 'number' },
                    { label: 'Date', value: 'date' },
                    { label: 'Timestamp', value: 'timestamp' },
                    { label: 'Boolean', value: 'boolean' },
                    { label: 'Switch', value: 'switch' },
                    { label: 'Select (single)', value: 'select' },
                    { label: 'Multiselect', value: 'multiselect' },
                    { label: 'Radio', value: 'radio' },
                    { label: 'Checkbox', value: 'checkbox' },
                    { label: 'Status Pill', value: 'status_pill' },
                    { label: 'Priority Tier', value: 'priority_tier' },
                    { label: 'Textarea', value: 'textarea' },
                    { label: 'Lexical (rich text)', value: 'lexical' },
                    { label: 'Image', value: 'image' },
                ]
            },
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
    usesItemMutationProps: true,
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
