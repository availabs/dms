import React, {useContext, useEffect, useMemo, useRef, useState} from "react";
import {Link} from "react-router";
import {CMSContext, ComponentContext} from "../../../context";
import {duplicateControl, useHandleClickOutside} from "./shared/utils";
import {formatFunctions, isEqualColumns} from "../dataWrapper/utils/utils";
import DataTypes from "../../../../../data-types";
import TableHeaderCell from "../../../../../ui/components/table/components/TableHeaderCell";
import ColorControls from "./shared/ColorControls";
import {ThemeContext} from "../../../../../ui/useTheme";

const justifyClass = {
    left: 'justifyTextLeft',
    right: 'justifyTextRight',
    center: 'justifyTextCenter',
    full: {header: 'justifyTextLeft', value: 'justifyTextRight'}
};

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
    value: ''
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

const DefaultComp = ({value, className}) => <div className={className}>{value}</div>;

const EditComp = ({
    attribute, value, rawValue,
    isValueFormatted, id,
    updateItem, liveEdit, tmpItem, setTmpItem, allowEdit,
    isNewItem, newItem, setNewItem, // when allowAddNewItem is on
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const compRef = useRef(null);
    const compId = `${attribute.name}-${id}-${JSON.stringify(rawValue)}`;
    const compIdEdit = `${attribute.name}-${id}`;
    const Comp = DataTypes[attribute.type]?.[allowEdit ? 'EditComp' : 'ViewComp'] || DefaultComp;
    // const Comp = DataTypes[attribute.type]?.[allowEdit && isEditing ? 'EditComp' : 'ViewComp'];
    useHandleClickOutside(compRef, compId, () => isEditing && setIsEditing(false));

    if(!allowEdit && (attribute.isImg || attribute.isLink || ['icon', 'color'].includes(attribute.formatFn) && formatFunctions[attribute.formatFn])) return value;

    return <div ref={compRef}
                onClick={() => !isEditing && setIsEditing(true)}
                className={(allowEdit && isEditing) || (allowEdit && !value) ? `w-full` : ``}>
        <Comp value={allowEdit && isValueFormatted ? rawValue : value}
              placeholder={'please enter value...'}
              id={allowEdit && isEditing ? compIdEdit : compId}
              onChange={newValue => {
                  if(!allowEdit) return;

                  return !liveEdit && setTmpItem ? setTmpItem({...tmpItem, [attribute.name]: newValue}) : // form like edit
                            liveEdit && updateItem ? updateItem(newValue, attribute, {id, [attribute.name]: newValue}) : // live edit
                                isNewItem && setNewItem ? setNewItem({...newItem, [attribute.name]: newValue}) : {} // add new item
              }
        }
              className={allowEdit && !value ? 'border' : ' '}
              {...attribute}
        />
    </div>
}

const RenderItem = ({
    theme,
    compactView, reverse, removeBorder, padding, allowAdddNew, headerValueLayout, liveEdit, // state.display
    isDms, // state.sourceInfo
    item, newItem, setNewItem, addItem, updateItem, allowEdit,
    subWrapperStyle,
    visibleColumns,
}) => {
    const {UI} = useContext(CMSContext);
    const {Icon} = UI;
    const [tmpItem, setTmpItem] = useState(item || {}); // for form edit controls

    useEffect(() => {
        setTmpItem(item)
    }, [item])
    return (
        //  in normal view, grid applied here
        <div
             className={`${theme.subWrapper} ${compactView ? `${theme.subWrapperCompactView} ${removeBorder ? `` : 'border shadow'}` : theme.subWrapperSimpleView} `}
             style={subWrapperStyle}>
            {
                visibleColumns
                    .map(attr => {
                        const isNewItem = allowAdddNew && !tmpItem.id && isDms && addItem;
                        const {isLink, location, linkText, isImg, imageSrc, imageLocation, imageExtension, imageSize, imageMargin} = attr || {};
                        const span = compactView ? 'span 1' : `span ${attr.cardSpan || 1}`;
                        const rawValue = tmpItem[attr.normalName] || tmpItem[attr.name];
                        const id = tmpItem?.id;
                        const value =
                            isImg ?
                                <img className={theme[imageSize] || 'max-w-[50px] max-h-[50px]'}
                                     alt={' '}
                                     src={imageLocation ?
                                         `${imageLocation}/${rawValue}${imageExtension ? `.${imageExtension}` : ``}` :
                                         (imageSrc || rawValue)}
                                /> :
                                ['icon', 'color'].includes(attr.formatFn) && formatFunctions[attr.formatFn] ?
                                    <div className={'flex items-center gap-1.5 uppercase'}>{formatFunctions[attr.formatFn](rawValue, attr.isDollar, Icon)}</div> :
                                    attr.formatFn && formatFunctions[attr.formatFn] ?
                                        formatFunctions[attr.formatFn](rawValue, attr.isDollar).replaceAll(' ', '') :
                                        rawValue;
                        const formatClass = attr.formatFn === 'title' ? 'capitalize' : '';
                        const isValueFormatted = isImg || isLink || Boolean(formatFunctions[attr.formatFn]);
                        const headerTextJustifyClass = justifyClass[attr.justify || 'center']?.header || justifyClass[attr.justify || 'center'];
                        const valueTextJustifyClass = justifyClass[attr.justify || 'center']?.value || justifyClass[attr.justify || 'center'];
                        return (
                            <div key={attr.normalName || attr.name}
                                 className={`
                                     ${theme.headerValueWrapper}
                                     flex-${headerValueLayout} ${reverse && headerValueLayout === 'col' ? `flex-col-reverse` : reverse ? `flex-row-reverse` : ``}
                                     ${compactView ? theme.headerValueWrapperCompactView : `${theme.headerValueWrapperSimpleView} ${removeBorder ? `` : 'border shadow'}`}
                                     ${compactView && attr.borderBelow ? `border-b rounded-none ${theme.headerValueWrapperBorderBColor}` : ``}
                                     ${compactView && attr.pb ? `pb-[${attr.pb}px]` : ``}
                                 `}
                                 style={{
                                     gridColumn: span,
                                     padding: compactView ? undefined : padding,
                                     marginTop: `${imageMargin}px`,
                                     backgroundColor: compactView ? undefined : attr.bgColor}}
                            >
                                {
                                    attr.hideHeader ? null : (
                                        <div className={`
                                                        ${theme.header} ${compactView ? theme.headerCompactView : theme.headerSimpleView}
                                                         ${theme[headerTextJustifyClass]}
                                                          ${theme[attr.headerFontStyle || 'textXS']}
                                                          
                                                          `}>
                                            {attr.customName || attr.display_name || attr.normalName || attr.name}
                                        </div>
                                    )
                                }
                                <div className={`
                                                ${theme.value} ${compactView ? theme.valueCompactView : theme.valueSimpleView}
                                                ${theme[valueTextJustifyClass]}
                                                 ${theme[attr.valueFontStyle || 'textXS']}
                                                 ${formatClass}
                                                 `}>
                                    {
                                        isLink && !allowEdit ?
                                            <Link className={theme.linkColValue}
                                                  to={`${location || value}${attr.searchParams === 'id' ? encodeURIComponent(id) : attr.searchParams === 'value' ? encodeURIComponent(value) : ``}`}
                                            >
                                                <EditComp attribute={attr}
                                                          value={linkText || value}
                                                          rawValue={rawValue}
                                                          isValueFormatted={isValueFormatted}
                                                          updateItem={isNewItem ? undefined : updateItem}

                                                          // form edit controls
                                                          liveEdit={liveEdit}
                                                          tmpItem={tmpItem}
                                                          setTmpItem={setTmpItem}

                                                          // add new item controls
                                                          isNewItem={isNewItem}
                                                          newItem={isNewItem ? newItem : undefined}
                                                          setNewItem={isNewItem ? setNewItem : undefined}

                                                          id={id}
                                                          allowEdit={allowEdit}
                                                />
                                            </Link> :
                                            <EditComp attribute={attr}
                                                      value={value}
                                                      rawValue={rawValue}
                                                      isValueFormatted={isValueFormatted}
                                                      updateItem={isNewItem ? undefined : updateItem}

                                                      // form edit controls
                                                      liveEdit={liveEdit}
                                                      tmpItem={tmpItem}
                                                      setTmpItem={setTmpItem}

                                                      // add new item controls
                                                      isNewItem={isNewItem}
                                                      newItem={isNewItem ? newItem : undefined}
                                                      setNewItem={isNewItem ? setNewItem : undefined}

                                                      id={id}
                                                      allowEdit={allowEdit}
                                            />
                                    }
                                </div>
                            </div>
                        )
                    })
            }
            {
                allowEdit && !liveEdit ? (
                    <div className={'self-end flex gap-0.5 text-sm'}>
                        <button className={'bg-blue-300 hover:bg-blue-400 text-blue-700 rounded-lg w-fit px-2 py-0.5'} onClick={() => updateItem(undefined, undefined, tmpItem)}>save</button>
                        <button className={'bg-red-300 hover:bg-red-400 text-red-700 rounded-lg w-fit px-2 py-0.5'} onClick={() => setTmpItem(item)}>cancel</button>
                    </div>
                ) : null
            }
            {
                allowAdddNew && !item.id && isDms && addItem ? (
                    <button className={'bg-blue-300 hover:bg-blue-400 text-blue-700 rounded-lg w-fit px-2 py-0.5 text-sm self-end'} onClick={() => addItem()}>add</button>
                ) : null
            }
        </div>
    )
}

const Card = ({
                  isEdit, //edit mode
                  updateItem, addItem,
                  newItem, setNewItem,
                  allowEdit // is data edit allowed
}) => {
    const { theme = {}} = React.useContext(ThemeContext) || {};
    const dataCard = theme.dataCard || dataCardTheme;
    const {state:{columns, data, sourceInfo, display}, setState, controls={}} = useContext(ComponentContext);
    const {compactView, gridSize, gridGap, padding, colGap, headerValueLayout, reverse, hideIfNull, removeBorder, allowAdddNew, liveEdit, bgColor='#FFFFFF'} = display;
    const [draggedCol, setDraggedCol] = useState(null);
    const visibleColumns = useMemo(() => columns.filter(({show}) => show), [columns]);
    const cardsWithoutSpanLength = useMemo(() => columns.filter(({show, cardSpan}) => show && !cardSpan).length, [columns]);

    const imageTopMargin = Math.max(...visibleColumns.map(attr => attr.isImg && !isNaN(attr.imageMargin) ? Math.abs(attr.imageMargin) : undefined).filter(m=>m));
    const getGridSize = gridSize => gridSize//window?.innerWidth < 640 ? 1 : gridSize;

    const mainWrapperStyle = gridSize && compactView ?
        {
            gridTemplateColumns: `repeat(${Math.min(getGridSize(gridSize), data.length)}, minmax(0, 1fr))`,
            gap: gridGap,
            paddingTop: `${imageTopMargin}px`
        } :
        {gap: gridGap, paddingTop: `${imageTopMargin}px`};
    const subWrapperStyle = compactView ? {backgroundColor: bgColor, padding, gap: colGap} :
        {
            gridTemplateColumns: `repeat(${getGridSize(gridSize) || cardsWithoutSpanLength}, minmax(0, 1fr))`,
            gap: gridGap || 2
        }
    useEffect(() => {
        // set hideSection flag
        if(!hideIfNull){
            setState(draft => {
                draft.hideSection = false;
            })
        }else{
            const hide = data.length === 0 ||
                         data.every(row => columns.filter(({ show }) => show)
                                                    .every(col => {
                                                        const value = row[col.normalName || col.name];
                                                        return value === null || value === undefined || value === "";
                                                    }));
            setState(draft => {
                draft.hideSection = hide;
            })
        }
    }, [data, hideIfNull])


// Reordering function
    function handleDrop(targetCol) {
        if (!draggedCol || isEqualColumns(draggedCol, targetCol)) return;

        setState(draft => {
            const newCols = [...draft.columns];
            const draggedIndex = newCols.findIndex(col => isEqualColumns(col, draggedCol));
            const targetIndex = newCols.findIndex(col => isEqualColumns(col, targetCol));
            const [removed] = newCols.splice(draggedIndex, 1);
            newCols.splice(targetIndex, 0, removed);
            draft.columns = newCols;
        });
    }

    console.log('??????????????????/', data)
    return (
        <>
            {
                isEdit ? <div className={dataCard.columnControlWrapper}>
                    {visibleColumns.map((attribute, i) => (
                        <div
                            key={`controls-${i}`}
                            className={dataCard.columnControlHeaderWrapper}
                            draggable
                            onDragStart={() => setDraggedCol(attribute)}
                            onDragOver={e => e.preventDefault()} // Allow drop
                            onDrop={() => handleDrop(attribute)}
                        >
                            <TableHeaderCell
                                isEdit={isEdit}
                                attribute={attribute}
                                columns={columns}
                                display={display} controls={controls} setState={setState}
                            />
                        </div>
                    ))}
                </div> : null
            }

            {/* outer wrapper: in compact view, grid applies here */}
            <div className={gridSize && compactView ? dataCard.mainWrapperCompactView : dataCard.mainWrapperSimpleView} style={mainWrapperStyle}>
                {
                    (allowAdddNew ? [...data, newItem] : data).map((item, i) => (
                        <RenderItem
                            key={i}
                            theme={dataCard}
                            {...display}
                            isDms={sourceInfo.isDms}
                            item={item} newItem={newItem} setNewItem={setNewItem}
                            addItem={addItem} updateItem={updateItem} allowEdit={allowEdit}
                            subWrapperStyle={subWrapperStyle}
                            visibleColumns={visibleColumns}
                        />
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