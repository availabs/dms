import React, {useContext} from "react";
import {CMSContext, ComponentContext} from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import {duplicateControl} from "./shared/utils";
import {formatFunctions} from "../dataWrapper/utils/utils";
import ColorControls from "./shared/ColorControls";
import {ToggleControl} from "../dataWrapper/components/ToggleControl";

const fontStyleOptions = [
    { label: '', value: '' },
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
    const {UI} = useContext(ThemeContext);
    const {Card} = UI;
    const {state, setState, controls={}} = useContext(ComponentContext);

    return <Card {...state} setState={setState} controls={controls}
                 isEdit={isEdit} updateItem={updateItem} addItem={addItem} newItem={newItem} setNewItem={setNewItem} allowEdit={allowEdit}
                 formatFunctions={formatFunctions}
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

const inHeader = [
    // settings from in header dropdown are stored in the columns array per column.
    {type: ({attribute, setAttribute}) => {
        const {UI} = useContext(CMSContext);
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

    {type: 'toggle', label: 'Allow Edit', key: 'allowEditInView', displayCdn: ({isEdit}) => isEdit},

    {type: 'select', label: 'Sort', key: 'sort',
        options: [
            {label: 'Not Sorted', value: ''}, {label: 'A->Z', value: 'asc nulls last'}, {label: 'Z->A', value: 'desc nulls last'}
        ]},
    {type: 'select', label: 'Justify', key: 'justify', isBatchUpdatable: true,
        options: [
            {label: 'Not Justified', value: ''},
            {label: 'Left', value: 'left'},
            {label: 'Center', value: 'center'},
            {label: 'Right', value: 'right'},
            {label: 'Full Justified', value: 'full'}
        ]},
    {type: 'select', label: 'Format', key: 'formatFn', isBatchUpdatable: true,
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
    {type: 'input', inputType: 'number', label: 'Padding Below', key: 'pb', isBatchUpdatable: true, displayCdn: ({display}) => display.compactView},
    {type: 'toggle', label: 'Hide Header', key: 'hideHeader', isBatchUpdatable: true},
    {type: 'toggle', label: 'Hide Value', key: 'hideValue', isBatchUpdatable: true},
    {type: 'select', label: 'Header', key: 'headerFontStyle', options: fontStyleOptions, isBatchUpdatable: true, displayCdn: ({attribute}) => !attribute.hideHeader},
    {type: 'select', label: 'Value', key: 'valueFontStyle', options: fontStyleOptions, isBatchUpdatable: true, displayCdn: ({attribute}) => !attribute.hideValue},

    {type: 'input', inputType: 'number', label: 'Span', key: 'cardSpan', displayCdn: ({display}) => !display.compactView},

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
];

export default {
    "name": 'Card',
    "type": 'card',
    useDataSource: true,
    useGetDataOnPageChange: true,
    useInfiniteScroll: false,
    showPagination: true,
    keepOriginalValues: true,
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
            {type: 'select', label: 'Add New Behaviour', key: 'addNewBehaviour', displayCdn: ({display}) => display.allowAdddNew,
                options: [
                    {label: 'Append Entry', value: 'append'},
                    {label: 'Clear Form', value: 'clear'},
                    {label: 'Navigate', value: 'navigate'},
                ]
            },
            {type: 'input', inputType: 'text', label: 'Navigate to', key: 'navigateUrlOnAdd',
                displayCdn: ({display}) => display.allowAdddNew && display.addNewBehaviour === 'navigate'},
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
            {type: 'select', label: 'Filter Relation', key: 'filterRelation',
                options: [{label: 'and', value: 'and'}, {label: 'or', value: 'or'}]
            },
            {type: ({value, setValue}) => <ColorControls value={value} setValue={setValue} title={'Background Color'}/>, key: 'bgColor', displayCdn: ({display}) => display.compactView},
        ],
        inHeader,
        appearance: {Comp: ({context}) => {
                const {state: {display, columns}, setState} = useContext(context || ComponentContext);
                const {UI} = useContext(CMSContext);
                const {Icon} = UI;
                const selectWrapperClass = 'group px-2 w-full flex items-center cursor-pointer hover:bg-gray-100'
                const selectLabelClass = 'w-fit font-regular text-gray-500 cursor-default'
                const selectClasses = 'w-full min-w-[10px] rounded-md bg-white group-hover:bg-gray-100 cursor-pointer'

                if(!display.columnSelection) return <></>

                const columnSelectionData = columns.filter(column => display.columnSelection.includes(column.normalName || column.name));
                const selectionValues = inHeader
                    .filter(({isBatchUpdatable}) => isBatchUpdatable)
                    .reduce((acc, {key}) => {
                        acc[key] = columnSelectionData.reduce((acc, data, i) => {
                            // if all selected columns have same value for the key, save the value
                            return i === 0 ?
                                    data?.[key] :
                                        acc === data?.[key] ?
                                        acc : ''
                        }, '');

                        return acc;
                    } ,{});

                const updateColumns = (key, value) => {
                    setState(draft => {
                        draft.columns.filter(column => (draft.display.columnSelection || []).includes(column.normalName || column.name))
                            .forEach(column => {
                                column[key] = value;
                            })
                    })
                }
                return (
                    <div className={'px-2'}>
                        <div className="flex flex-row gap-0.5 items-center px-1 text-xs text-gray-600 font-regular border rounded-lg">
                            {
                                inHeader
                                    .filter(({isBatchUpdatable}) => isBatchUpdatable)
                                    .map(({type, inputType, label, key, options}) =>
                                        type === 'select' ?
                                            <div key={`${key}`} className={selectWrapperClass}>
                                                <label className={selectLabelClass} htmlFor={key}>{label}</label>
                                                <select
                                                    id={key}
                                                    className={selectClasses}
                                                    value={selectionValues[key]}
                                                    onChange={e => updateColumns(key, e.target.value)}
                                                >
                                                    {
                                                        options.map(({label, value}) => <option key={value} value={value}>{label}</option>)
                                                    }
                                                </select>
                                            </div> :
                                            type === 'toggle' ?
                                                <div className={'px-2 py-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'}>
                                                    <ToggleControl
                                                        className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer ${selectLabelClass}`}
                                                        title={label}
                                                        value={selectionValues[key]}
                                                        setValue={e => updateColumns(key, e)}
                                                    />
                                                </div> :
                                                type === 'input' ?
                                                    <div className={selectWrapperClass}>
                                                        <label className={selectLabelClass} htmlFor={key}>{label}</label>
                                                        <input
                                                            id={key}
                                                            className={selectClasses}
                                                            type={inputType}
                                                            value={selectionValues[key]}
                                                            onChange={e => updateColumns(key, e.target.value)}
                                                        />
                                                    </div> :
                                                    typeof type === 'function' ? type({value: selectionValues[key], setValue: newValue => updateColumns(key, newValue)}) :
                                                        `${type} not available`
                                    )
                            }
                        </div>
                    </div>
                )
            }},
    },
    "EditComp": Card,
    "ViewComp": Card,
}

// export default () => <div>card</div>
