import {formatFunctions, isEqualColumns} from "../dataWrapper/utils/utils";
import {ComponentContext} from "../dataWrapper";
import TableHeaderCell from "./spreadsheet/components/TableHeaderCell";
import React, {useContext, useEffect, useMemo} from "react";
import {Link} from "react-router-dom";
import {CMSContext} from "../../../../siteConfig";
import {ColorControls} from "./shared/ColorControls";
import {cloneDeep} from "lodash-es";
import {Copy} from "../../../icons";

const justifyClass = {
    left: 'justifyTextLeft',
    right: 'justifyTextRight',
    center: 'justifyTextCenter',
    full: {header: 'justifyTextLeft', value: 'justifyTextRight'}
}
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
export const dataCardTheme = {
    columnControlWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlHeaderWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,

    mainWrapperCompactView: 'grid',
    mainWrapperSimpleView: 'flex flex-col',

    subWrapper: 'w-full',
    subWrapperCompactView: 'flex flex-col rounded-[12px]',
    subWrapperSimpleView: 'grid',

    headerValueWrapper: 'w-full rounded-[12px] flex items-center justify-center p-2',
    headerValueWrapperCompactView: 'py-0',
    headerValueWrapperSimpleView: '',
    justifyTextLeft: 'text-start justify-items-start',
    justifyTextRight: 'text-end justify-items-end',
    justifyTextCenter: 'text-center justify-items-center',

    textXS: 'text-xs font-medium',
    textXSReg: 'text-xs font-normal',
    textSM: 'text-sm font-medium',
    textSMReg: 'text-sm font-normal',
    textSMBold: 'text-sm font-normal',
    textSMSemiBold: 'text-sm font-semibold',
    textMD: 'ftext-md ont-medium',
    textMDReg: 'text-md font-normal',
    textMDBold: 'text-md font-bold',
    textMDSemiBold: 'text-md font-semibold',
    textXL: 'text-xl font-medium',
    textXLSemiBold: 'text-xl font-semibold',
    text2XL: 'text-2xl font-medium',
    text2XLReg: 'text-2xl font-regular',
    text3XL: 'text-3xl font-medium',
    text3XLReg: 'text-3xl font-normal',
    text4XL: 'text-4xl font-medium',
    text5XL: 'text-5xl font-medium',
    text6XL: 'text-6xl font-medium',
    text7XL: 'text-7xl font-medium',
    text8XL: 'text-8xl font-medium',

    imgXS: "max-w-16 max-h-16",
    imgSM: "max-w-24 max-h-24",
    imgMD: "max-w-32 max-h-32",
    imgXL: "max-w-40 max-h-40",
    img2XL: "max-w-48 max-h-48",
    img3XL: "max-w-56 max-h-56",
    img4XL: "max-w-64 max-h-64",
    img5XL: "max-w-72 max-h-72",
    img6XL: "max-w-80 max-h-80",
    img7XL: "max-w-96 max-h-96",
    img8XL: "max-w-128 max-h-128",

    header: 'w-full capitalize',
    value: 'w-full'
}
// cards can be:
// one cell per row, that carries one column's data,
// one cell per row, that can carry multiple column's data

// compact view:
// bg color per card (which is a row)

// simple view: one cell per column - value pair
// span
// inline vs stacked; reverse
// bg color per column

const Card = ({isEdit}) => {
    const { theme = {} } = React.useContext(CMSContext) || {};
    const dataCard = theme.dataCard || dataCardTheme;

    const {state:{columns, data, display: {compactView, gridSize, gridGap, padding, headerValueLayout, reverse, hideIfNull, removeBorder, bgColor='#FFFFFF'}}, setState} = useContext(ComponentContext);
    const visibleColumns = useMemo(() => columns.filter(({show}) => show), [columns]);
    const cardsWithoutSpanLength = useMemo(() => columns.filter(({show, cardSpan}) => show && !cardSpan).length, [columns]);

    const imageTopMargin = Math.max(...visibleColumns.map(attr => attr.isImg && !isNaN(attr.imageMargin) ? Math.abs(attr.imageMargin) : undefined).filter(m=>m));

    const mainWrapperStyle = gridSize && compactView ?
        {gridTemplateColumns: `repeat(${Math.min(gridSize, data.length)}, minmax(0, 1fr))`, gap: gridGap, paddingTop: `${imageTopMargin}px`} :
        {gap: gridGap, paddingTop: `${imageTopMargin}px`};
    const subWrapperStyle = compactView ? {backgroundColor: bgColor, padding} : {gridTemplateColumns: `repeat(${gridSize || cardsWithoutSpanLength}, minmax(0, 1fr))`, gap: gridGap || 2}
    useEffect(() => {
        // set hideSection flag
        if(!isEdit) return;

        if(!hideIfNull){
            setState(draft => {
                draft.hideSection = false;
            })
        }else{
            const hide = data.length === 0 ||
                         data.every(row => columns.filter(({ show }) => show)
                                                    .every(col => {
                                                        const value = row[col.name];
                                                        return value === null || value === undefined || value === "";
                                                    }));
            setState(draft => {
                draft.hideSection = hide;
            })
        }
    }, [data, hideIfNull])

    return (
        <>
            {
                isEdit ? <div className={dataCard.columnControlWrapper}>
                    {visibleColumns.map((attribute, i) =>
                            <div key={`controls-${i}`} className={dataCard.columnControlHeaderWrapper}>
                                <TableHeaderCell
                                    isEdit={isEdit}
                                    attribute={attribute}
                                />
                            </div>)}
                </div> : null
            }

            {/* outer wrapper: in compact view, grid applies here */}
            <div className={gridSize && compactView ? dataCard.mainWrapperCompactView : dataCard.mainWrapperSimpleView} style={mainWrapperStyle}>
                {
                    data.map((item, i) => (
                        //  in normal view, grid applied here
                        <div key={i}
                             className={`${dataCard.subWrapper} ${compactView ? `${dataCard.subWrapperCompactView} ${removeBorder ? `` : 'border shadow'}` : dataCard.subWrapperSimpleView} `}
                             style={subWrapperStyle}>
                            {
                                visibleColumns
                                    .map(attr => {
                                        const {isLink, location, linkText, useId, isImg, imageSrc, imageLocation, imageExtension, imageSize, imageMargin} = attr || {};
                                        const span = compactView ? 'span 1' : `span ${attr.cardSpan || 1}`;
                                        const rawValue = item?.[attr.normalName || attr.name];
                                        const id = item?.id;
                                        const value =
                                            isImg ?
                                                <img className={dataCard[imageSize] || 'max-w-[50px] max-h-[50px]'}
                                                     alt={' '}
                                                     src={imageLocation ?
                                                         `${imageLocation}/${rawValue}${imageExtension ? `.${imageExtension}` : ``}` :
                                                         (imageSrc || rawValue)}
                                                /> :
                                            attr.formatFn && formatFunctions[attr.formatFn] ?
                                            formatFunctions[attr.formatFn](rawValue, attr.isDollar).replaceAll(' ', '') :
                                            rawValue

                                        const headerTextJustifyClass = justifyClass[attr.justify || 'center']?.header || justifyClass[attr.justify || 'center'];
                                        const valueTextJustifyClass = justifyClass[attr.justify || 'center']?.value || justifyClass[attr.justify || 'center'];
                                        return (
                                            <div key={attr.name}
                                                 className={`
                                                 ${dataCard.headerValueWrapper}
                                                 flex-${headerValueLayout} ${reverse && headerValueLayout === 'col' ? `flex-col-reverse` : reverse ? `flex-row-reverse` : ``}
                                                 ${compactView ? dataCard.headerValueWrapperCompactView : `${dataCard.headerValueWrapperSimpleView} ${removeBorder ? `` : 'border shadow'}`}`}
                                                 style={{
                                                     gridColumn: span,
                                                     padding: compactView ? undefined : padding,
                                                     marginTop: `${imageMargin}px`,
                                                     backgroundColor: compactView ? undefined : attr.bgColor}}
                                            >
                                                {
                                                    attr.hideHeader ? null : (
                                                        <div className={`
                                                        ${dataCard.header} ${compactView ? dataCard.headerCompactView : dataCard.headerSimpleView}
                                                         ${dataCard[headerTextJustifyClass]}
                                                          ${dataCard[attr.headerFontStyle || 'textXS']}
                                                          
                                                          `}>
                                                            {attr.customName || attr.display_name || attr.name}
                                                        </div>
                                                    )
                                                }
                                                <div className={`
                                                ${dataCard.value} ${compactView ? dataCard.valueCompactView : dataCard.valueSimpleView}
                                                ${dataCard[valueTextJustifyClass]}
                                                 ${dataCard[attr.valueFontStyle || 'textXS']}
                                                 `}>
                                                    {
                                                        isLink ?
                                                            <Link to={`${location}${encodeURIComponent(useId ? id : value)}`}>
                                                                {linkText || value}
                                                            </Link> :
                                                            value
                                                    }
                                                </div>
                                            </div>
                                        )
                                    })
                            }
                        </div>
                    ))
                }
            </div>
        </>
    )
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
                    {label: 'fn', value: ' '}, {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}
                ]},
            {type: 'select', label: 'Exclude N/A', key: 'excludeNA',
                options: [
                    {label: 'include n/a', value: false}, {label: 'exclude n/a', value: true}
                ]},
            {type: 'toggle', label: 'show', key: 'show'},
            {type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{type: 'internal', operation: 'filter', values: []}]},
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
        more: [
            // settings from more dropdown are stored in state.display
            {type: 'toggle', label: 'Attribution', key: 'showAttribution'},
            {type: 'toggle', label: 'Use Search Params', key: 'allowSearchParams'},
            {type: 'toggle', label: 'Compact View', key: 'compactView'},
            {type: 'input', inputType: 'number', label: 'Grid Size', key: 'gridSize'},
            {type: 'input', inputType: 'number', label: 'Grid Gap', key: 'gridGap'},
            {type: 'input', inputType: 'number', label: 'Padding', key: 'padding'},
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
                    {label: 'Abbreviated', value: 'abbreviate'},
                ]},

            {type: 'toggle', label: 'Hide Header', key: 'hideHeader'},
            {type: 'select', label: 'Header', key: 'headerFontStyle', options: fontStyleOptions, displayCdn: ({attribute}) => !attribute.hideHeader},
            {type: 'select', label: 'Value', key: 'valueFontStyle', options: fontStyleOptions},

            {type: 'input', inputType: 'number', label: 'Span', key: 'cardSpan', displayCdn: ({display}) => !display.compactView},

            // link controls
            {type: 'toggle', label: 'Is Link', key: 'isLink', displayCdn: ({isEdit}) => isEdit},
            {type: 'toggle', label: 'Use Id', key: 'useId', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'input', inputType: 'text', label: 'Link Text', key: 'linkText', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},
            {type: 'input', inputType: 'text', label: 'Location', key: 'location', displayCdn: ({attribute, isEdit}) => isEdit && attribute.isLink},

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


            {type: ({value, setValue}) => <ColorControls value={value} setValue={setValue} title={'Background Color'}/>, key: 'bgColor', displayCdn: ({display}) => !display.compactView},
        ]

    },
    "EditComp": Card,
    "ViewComp": Card,
}