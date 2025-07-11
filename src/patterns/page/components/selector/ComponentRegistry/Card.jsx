import React, {useContext} from "react";
import {CMSContext, ComponentContext} from "../../../context";
import {duplicateControl} from "./shared/utils";
import {formatFunctions} from "../dataWrapper/utils/utils";
import DataTypes from "../../../../../data-types";
import ColorControls from "./shared/ColorControls";

const fontStyleOptions = [
    { label: 'X-Small', value: 'textXS' },
    { label: 'X-Small Regular', value: 'textXSReg' },
    { label: 'Small', value: 'textSM' },
    { label: 'Small Regular', value: 'textSMReg' },
    { label: 'Small Bold', value: 'textSMBold' },
    { label: 'Small SemiBold', value: 'textSMSemiBold' },
    { label: 'Base', value: 'textMD' },
    { label: 'Base Regular', value: 'textMDReg' },
    { label: 'Base Bold', value: 'textMDBold' },
    { label: 'Base SemiBold', value: 'textMDSemiBold' },
    { label: 'XL', value: 'textXL' },
    { label: 'XL SemiBold', value: 'textXLSemiBold' },
    { label: '2XL', value: 'text2XL' },
    { label: '2XL Regular', value: 'text2XLReg' },
    { label: '3XL', value: 'text3XL' },
    { label: '3XL Regular', value: 'text3XLReg' },
    { label: '4XL', value: 'text4XL' },
    { label: '5XL', value: 'text5XL' },
    { label: '6XL', value: 'text6XL' },
    { label: '7XL', value: 'text7XL' },
    { label: '8XL', value: 'text8XL' },
];

// cards can be:
// one cell per row, that carries one column's data,
// one cell per row, that can carry multiple column's data

// compact view:
// bg color per card (which is a row)

// simple view: one cell per column - value pair
// span
// inline vs stacked; reverse
// bg color per column


const Card = ({
                  isEdit, //edit mode
                  updateItem, addItem,
                  newItem, setNewItem,
                  allowEdit // is data edit allowed
              }) => {
    const {UI} = useContext(CMSContext);
    const {Card} = UI;
    const {state, setState, controls={}} = useContext(ComponentContext);

    return <Card {...state} setState={setState} controls={controls}
                 isEdit={isEdit} updateItem={updateItem} newItem={newItem} setNewItem={setNewItem} allowEdit={allowEdit}
                 formatFunctions={formatFunctions} DataTypes={DataTypes}
    />
}

export default {
    "name": 'Card',
    "type": 'card',
    useDataSource: true,
    useGetDataOnPageChange: true,
    useInfiniteScroll: false,
    showPagination: true,
    controls: {
        columns: [
            // settings from columns dropdown are stored in state.columns array, per column
            {type: 'select', label: 'Fn', key: 'fn',
                options: [
                    {label: 'fn', value: ' '}, {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}, {label: 'avg', value: 'avg'}
                ]},
            {type: 'select', label: 'Exclude N/A', key: 'excludeNA',
                options: [
                    {label: 'include n/a', value: false}, {label: 'exclude n/a', value: true}
                ]},
            {type: 'toggle', label: 'show', key: 'show'},
            {type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{type: 'internal', operation: 'filter', values: []}]},
            {type: 'toggle', label: 'Group', key: 'group'},
            duplicateControl
        ],
        more: [
            // settings from more dropdown are stored in state.display
            {type: 'toggle', label: 'Attribution', key: 'showAttribution'},
            {type: 'toggle', label: 'Allow Edit', key: 'allowEditInView',
                onChange: ({value, state}) => {
                // if editing data is allowed, data should not be cached. unless live edit is used.
                    if (value) state.display.readyToLoad = true
                }},
            {type: 'toggle', label: 'Live Edit', key: 'liveEdit', displayCdn: ({display}) => display.allowEditInView},
            {type: 'toggle', label: 'Allow Add New', key: 'allowAdddNew'},
            {type: 'toggle', label: 'Use Page Filters', key: 'usePageFilters'},
            {type: 'toggle', label: 'Compact View', key: 'compactView'},
            {type: 'input', inputType: 'number', label: 'Grid Size', key: 'gridSize'},
            {type: 'input', inputType: 'number', label: 'Grid Gap', key: 'gridGap'},
            {type: 'input', inputType: 'number', label: 'Padding', key: 'padding'},
            {type: 'input', inputType: 'number', label: 'Column Gap', key: 'colGap', displayCdn: ({display}) => display.compactView},
            {type: 'toggle', label: 'Always Fetch Data', key: 'readyToLoad'},
            {type: 'toggle', label: 'Use Pagination', key: 'usePagination'},

            {type: 'input', inputType: 'number', label: 'Page Size', key: 'pageSize', displayCdn: ({display}) => display.usePagination === true},
            {type: 'select', label: 'Value Placement', key: 'headerValueLayout', options: [{label: `Inline`, value: 'row'}, {label: `Stacked`, value: 'col'}]},
            {type: 'toggle', label: 'Reverse', key: 'reverse'},
            {type: 'toggle', label: 'Hide if No Data', key: 'hideIfNull'},
            {type: 'toggle', label: 'Remove Border', key: 'removeBorder'},
            {type: ({value, setValue}) => <ColorControls value={value} setValue={setValue} title={'Background Color'}/>, key: 'bgColor', displayCdn: ({display}) => display.compactView},
        ],
        inHeader: [
            // settings from in header dropdown are stores in the columns array per column.
            {type: 'select', label: 'Sort', key: 'sort',
                options: [
                    {label: 'Not Sorted', value: ''}, {label: 'A->Z', value: 'asc nulls last'}, {label: 'Z->A', value: 'desc nulls last'}
                ]},
            {type: 'select', label: 'Justify', key: 'justify',
                options: [
                    {label: 'Not Justified', value: ''},
                    {label: 'Left', value: 'left'},
                    {label: 'Center', value: 'center'},
                    {label: 'Right', value: 'right'},
                    {label: 'Full Justified', value: 'full'}
                ]},
            {type: 'select', label: 'Format', key: 'formatFn',
                options: [
                    {label: 'No Format Applied', value: ' '},
                    {label: 'Comma Seperated', value: 'comma'},
                    {label: 'Comma Seperated ($)', value: 'comma_dollar'},
                    {label: 'Abbreviated', value: 'abbreviate'},
                    {label: 'Abbreviated ($)', value: 'abbreviate_dollar'},
                    {label: 'Date', value: 'date'},
                    {label: 'Title', value: 'title'},
                    {label: 'Icon', value: 'icon'},
                    {label: 'Color', value: 'color'},
                ]},

            {type: 'toggle', label: 'Border Below', key: 'borderBelow', displayCdn: ({display}) => display.compactView},
            {type: 'input', inputType: 'number', label: 'Padding Below', key: 'pb', displayCdn: ({display}) => display.compactView},
            {type: 'toggle', label: 'Hide Header', key: 'hideHeader'},
            {type: 'select', label: 'Header', key: 'headerFontStyle', options: fontStyleOptions, displayCdn: ({attribute}) => !attribute.hideHeader},
            {type: 'select', label: 'Value', key: 'valueFontStyle', options: fontStyleOptions},

            {type: 'input', inputType: 'number', label: 'Span', key: 'cardSpan', displayCdn: ({display}) => !display.compactView},

            // link controls
            {type: 'toggle', label: 'Is Link', key: 'isLink', displayCdn: ({isEdit}) => isEdit},
            {type: 'input', inputType: 'text', label: 'Link Text', key: 'linkText', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'input', inputType: 'text', label: 'Location', key: 'location', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'select', label: 'Search Params', key: 'searchParams', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink,
                options: [
                    {label: 'None', value: undefined},
                    {label: 'ID', value: 'id'},
                    {label: 'Value', value: 'value'}
                ]
            },

            // image controls
            {type: 'toggle', label: 'Is Image', key: 'isImg', displayCdn: ({isEdit}) => isEdit},
            {type: 'input', inputType: 'text', label: 'Image Url', key: 'imageSrc', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isImg},
            {type: 'input', inputType: 'text', label: 'Image Location', key: 'imageLocation', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isImg},
            {type: 'input', inputType: 'text', label: 'Image Extension', key: 'imageExtension', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isImg && attribute.imageLocation},
            {type: 'select', label: 'Image Size', key: 'imageSize',
                options: [
                    { label: 'X-Small', value: 'imgXS' },
                    { label: 'Small', value: 'imgSM' },
                    { label: 'Base', value: 'imgMD' },
                    { label: 'XL', value: 'imgXL' },
                    { label: '2XL', value: 'img2XL' },
                    { label: '3XL', value: 'img3XL' },
                    { label: '4XL', value: 'img4XL' },
                    { label: '5XL', value: 'img5XL' },
                    { label: '6XL', value: 'img6XL' },
                    { label: '7XL', value: 'img7XL' },
                    { label: '8XL', value: 'img8XL' },
                ],
                displayCdn: ({attribute, isEdit}) => isEdit && attribute.isImg},
            {type: 'input', inputType: 'number', label: 'Image Top Margin', key: 'imageMargin', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isImg},


            {type: ({value, setValue}) => (<ColorControls value={value} setValue={setValue} title={'Background Color'}/>), key: 'bgColor', displayCdn: ({display}) => !display.compactView}
        ]

    },
    "EditComp": Card,
    "ViewComp": Card,
}

// export default () => <div>card</div>