import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Link} from 'react-router';
import { ThemeContext } from '../useTheme';
import ColumnTypes from "../columnTypes";
import TableHeaderCell from "./table/components/TableHeaderCell";
import Icon from "./Icon";

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
    justifyTextLeft: 'text-start justify-items-start  rounded-md',
    justifyTextRight: 'text-end justify-items-end rounded-md',
    justifyTextCenter: 'text-center justify-items-center rounded-md',

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

const isEqualColumns = (column1, column2) =>
    column1?.name === column2?.name &&
    column1?.isDuplicate === column2.isDuplicate &&
    column1?.copyNum === column2?.copyNum;

const useHandleClickOutside = (menuRef, menuBtnId, onClose) => {
    const handleClickOutside = useCallback(
        (e) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                e.target.id !== menuBtnId
            ) {
                onClose();
            }
        },
        [menuRef, menuBtnId, onClose]
    );

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [handleClickOutside]);
};

const justifyClass = {
    left: 'justifyTextLeft',
    right: 'justifyTextRight',
    center: 'justifyTextCenter',
    full: {header: 'justifyTextLeft', value: 'justifyTextRight'}
};

const demoColumns = [
    { "name": "first_name", "display_name": "First Name", "show": true, "type": "text" },
    { "name": "last_name", "display_name": "Last Name", "show": true, "type": "text" },
    { "name": "email", "display_name": "Email Address", "show": true, "type": "text" },
    { "name": "city", "display_name": "City", "show": true, "type": "text" }
]
const demoData = [
    {
        "first_name": "Alice",
        "last_name": "Johnson",
        "email": "alice.johnson@example.com",
        "city": "New York"
    },
    {
        "first_name": "Bob",
        "last_name": "Smith",
        "email": "bob.smith@example.com",
        "city": "Los Angeles"
    },
    {
        "first_name": "Carol",
        "last_name": "Davis",
        "email": "carol.davis@example.com",
        "city": "Chicago"
    },
    {
        "first_name": "David",
        "last_name": "Brown",
        "email": "david.brown@example.com",
        "city": "Houston"
    }
]
export const docs = [
    {
        columns: demoColumns,
        data: demoData,
        display: {
            compactView: true
        }
    },
    {
        columns: demoColumns,
        data: demoData,
        display: {
            compactView: false
        }
    }]


const parseIfJson = strValue => {
    if (typeof strValue === 'object') return strValue;

    try {
        return JSON.parse(strValue)
    }catch (e){
        return {}
    }
}

const DefaultComp = ({value, className}) => <div className={className}>{typeof value === 'object' ? JSON.stringify(value) : value}</div>;

const EditComp = ({
                      attribute, value, rawValue, className,
                      isValueFormatted, id,
                      updateItem, liveEdit, tmpItem, setTmpItem, allowEdit, formatFunctions,
                      isNewItem, newItem, setNewItem, // when allowAddNewItem is on
                  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const compRef = useRef(null);
    const compId = `${attribute.name}-${id}-${JSON.stringify(rawValue)}`;
    const compIdEdit = `${attribute.name}-${id}`;
    const Comp = ColumnTypes[attribute.type]?.[allowEdit ? 'EditComp' : 'ViewComp'] || DefaultComp;
    // useHandleClickOutside(compRef, compId, () => isEditing && setIsEditing(false));

    if(!allowEdit && (attribute.isImg || attribute.isLink || ['icon', 'color'].includes(attribute.formatFn) && formatFunctions[attribute.formatFn])) return value;

    const options = ['select', 'multiselect'].includes(attribute.type) && (attribute.options || []).some(o => o.filter) ?
        attribute.options.filter(o => {
            const optionFilter = parseIfJson(o.filter);
            return Object.keys(optionFilter).reduce((acc, col) => {
                const depValue = (isNewItem ? newItem : tmpItem)[col];
                if (depValue === undefined || depValue === null) return false;
                return acc && optionFilter[col].includes(depValue.toString())
            }, true)
        }) :
        attribute.options;

    return <div ref={compRef}
                // onClick={() => !isEditing && setIsEditing(true)}
                className={`w-full`}
                // className={(allowEdit && isEditing) || (allowEdit && !value) ? `w-full` : `w-full`}
    >
        <Comp value={allowEdit && isValueFormatted ? rawValue : value}
              placeholder={'please enter value...'}
              id={compIdEdit}
              // id={allowEdit && isEditing ? compIdEdit : compId}
              onChange={newValue => {
                  if(!allowEdit) return;

                  return !liveEdit && setTmpItem && tmpItem.id ? setTmpItem({...tmpItem, [attribute.name]: newValue}) : // form like edit
                      liveEdit && updateItem && tmpItem.id ? updateItem(newValue, attribute, {id, [attribute.name]: newValue}) : // live edit
                          isNewItem && setNewItem && !tmpItem.id ? setNewItem({...newItem, [attribute.name]: newValue}) : {} // add new item
              }
              }
              className={`${allowEdit ? 'border' : ''} ${className}`}
              {...attribute}
            options={options}
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
                        formatFunctions= {},
                    }) => {
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
                                {
                                    attr.hideValue ? null :
                                        <div className={`
                                                    ${theme.value} ${compactView ? theme.valueCompactView : theme.valueSimpleView}
                                                     ${theme[valueTextJustifyClass]}
                                                     ${theme[attr.valueFontStyle || 'textXS']}
                                                     ${formatClass}
                                                     `}>
                                            {
                                                isLink && !(allowEdit || attr.allowEditInView) ?
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
                                                                  allowEdit={allowEdit || attr.allowEditInView}
                                                                  formatFunctions={formatFunctions}
                                                                  className={theme[valueTextJustifyClass]}
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
                                                              allowEdit={allowEdit || attr.allowEditInView}
                                                              formatFunctions={formatFunctions}
                                                              className={theme[valueTextJustifyClass]}
                                                    />
                                            }
                                        </div>
                                }
                            </div>
                        )
                    })
            }
            {
                (allowEdit || visibleColumns.some(c => c.allowEditInView)) && !liveEdit && item.id ? (
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

export default function ({
    allowEdit,
    updateItem, addItem, isEdit,
    columns=[], data=[], display={}, controls={}, sourceInfo={}, setState, isActive,
    newItem, setNewItem, formatFunctions
}) {
    const { theme: themeFromContext = {dataCard: dataCardTheme}} = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, dataCard: {...dataCardTheme, ...(themeFromContext.dataCard || {})}};

    const {compactView, gridSize, gridGap, padding, colGap, headerValueLayout, reverse, hideIfNull, removeBorder, allowAdddNew, liveEdit, bgColor='#FFFFFF'} = display;
    const [draggedCol, setDraggedCol] = useState(null);
    const visibleColumns = useMemo(() => columns.filter(({show}) => show), [columns]);
    const cardsWithoutSpanLength = useMemo(() => columns.filter(({show, cardSpan}) => show && !cardSpan).length, [columns]);

    const imageTopMargin = Math.max(...visibleColumns.map(attr => attr.isImg && !isNaN(attr.imageMargin) ? Math.abs(attr.imageMargin) : undefined).filter(m=>m));
    const getGridSize = gridSize => gridSize//window?.innerWidth < 640 ? 1 : gridSize;

    const mainWrapperStyle = gridSize && compactView ?
        {
            gridTemplateColumns: `repeat(${getGridSize(gridSize) || data.length}, minmax(0, 1fr))`,
            gap: gridGap,
            paddingTop: `${imageTopMargin}px`
        } :
        {gap: gridGap, paddingTop: `${imageTopMargin}px`};
    const subWrapperStyle = compactView ? {backgroundColor: bgColor, padding, gap: colGap} :
        {
            gridTemplateColumns: `repeat(${getGridSize(gridSize) || cardsWithoutSpanLength}, minmax(0, 1fr))`,
            gap: gridGap || 2
        }

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

    return (
        <>
            {
                isEdit ? <div className={theme.dataCard.columnControlWrapper}>
                    {visibleColumns.map((attribute, i) => (
                        <div
                            key={`controls-${i}`}
                            className={theme.dataCard.columnControlHeaderWrapper}
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
            <div className={gridSize && compactView ? theme.dataCard.mainWrapperCompactView : theme.dataCard.mainWrapperSimpleView} style={mainWrapperStyle}>
                {
                    (allowAdddNew ? [...data, newItem] : data).map((item, i) => (
                        <RenderItem
                            key={i}
                            theme={theme.dataCard}
                            {...display}
                            isDms={sourceInfo.isDms}
                            item={item} newItem={newItem} setNewItem={setNewItem}
                            addItem={addItem} updateItem={updateItem} allowEdit={allowEdit}
                            subWrapperStyle={subWrapperStyle}
                            visibleColumns={visibleColumns}
                            formatFunctions={formatFunctions}
                        />
                    ))
                }
            </div>
        </>
    )
}