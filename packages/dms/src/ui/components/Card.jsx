import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {getComponentTheme, ThemeContext} from '../useTheme';
import ColumnTypes from "../columnTypes";
import TableHeaderCell from "./table/components/TableHeaderCell";
import Icon from "./Icon";



const isEqualColumns = (column1, column2) =>
    column1?.name === column2?.name &&
    column1?.isDuplicate === column2?.isDuplicate &&
    column1?.copyNum === column2?.copyNum;


const justifyClass = {
    left: 'justifyTextLeft',
    right: 'justifyTextRight',
    center: 'justifyTextCenter',
    full: {header: 'justifyTextLeft', value: 'justifyTextRight'}
};



const parseIfJson = strValue => {
    if (typeof strValue === 'object') return strValue;

    try {
        return JSON.parse(strValue)
    }catch (e){
        return {}
    }
}

function normalizeValue(value, key='value') {
    if (Array.isArray(value)) {
        return value.map(v => v && typeof v === 'object' && v.hasOwnProperty(key) ? v[key] : v);
    }
    return value && typeof value === 'object' && value.hasOwnProperty(key) ? value[key] : value;
}

function normalizeValueForSearchParams(value, searchParamsType) {
    if(Array.isArray(value)){
        return value.map(v =>
            typeof v === 'object' && v?.hasOwnProperty('originalValue') && searchParamsType === 'rawValue' ?
                v.originalValue :
                typeof v === 'object' && v?.hasOwnProperty('value') ?
                    v.value : v
        ).join('|||')
    }

    return typeof value === 'object' && value?.hasOwnProperty('originalValue') && searchParamsType === 'rawValue' ?
            value.originalValue :
            typeof value === 'object' && value?.hasOwnProperty('value') ?
                value.value : value;
}

const DefaultComp = ({value, className}) => <div className={className}>{typeof value === 'object' ? JSON.stringify(value) : value}</div>;

const CompWrapper = ({
                      attribute, value, rawValue, className,
                         componentWrapperClassName, // useful in edit mode to control edit comp width
                      isValueFormatted, id,
                      updateItem, liveEdit, tmpItem, setTmpItem, allowEdit, formatFunctions,
                      isNewItem, newItem, setNewItem, // when allowAddNewItem is on
                  }) => {
    const editMode = allowEdit || (isNewItem && setNewItem && !tmpItem.id);
    const compIdEdit = `${attribute.name}-${id}`;
    const Comp = ColumnTypes[attribute.type]?.[editMode ? 'EditComp' : 'ViewComp'] || DefaultComp;

    const options = useMemo(() => {
        const isDropDownCol = ['select', 'multiselect', 'radio'].includes(attribute.type);
        const optionsContainFilters = (attribute.options || []).some(o => o.filter);

        if(!isDropDownCol) return;
        if(!optionsContainFilters) return attribute.options;

        return attribute.options.filter(o => {
            if(!o.filter) return true;

            const optionFilter = parseIfJson(o.filter);
            return Object.keys(optionFilter).reduce((acc, col) => {
                const depValue = (isNewItem ? newItem : tmpItem)[col];
                if (depValue === undefined || depValue === null) return false;
                return acc && optionFilter[col].includes(depValue.toString())
            }, true);
        });
    }, [attribute.type, attribute.options, isNewItem, newItem, tmpItem])

    const optionsMeta = useMemo(() => {
        const meta = parseIfJson(attribute.meta_lookup);
        return meta?.view_id ? undefined : meta;
    }, [attribute.meta_lookup]);

    if(!editMode && (
        attribute.isImg ||
        attribute.isLink ||
        (['icon', 'color'].includes(attribute.formatFn) && formatFunctions[attribute.formatFn])
    )) {
        // no special components needed
        return value
    }

    const onChange = useCallback(newValue => {
        if(!editMode) return;
        const isFormLikeEdit = !liveEdit && tmpItem?.id && setTmpItem; // gives submit and clear buttons
        const isLiveEdit = liveEdit && tmpItem?.id && updateItem; // saves on the fly
        const isAddingNewItem = isNewItem && !tmpItem?.id && setNewItem;

        if (isFormLikeEdit) {
            setTmpItem(prev => ({
                ...prev,
                [attribute.name]: newValue,
            }));
            return;
        }

        if (isLiveEdit) {
            updateItem(newValue, attribute, {
                id,
                [attribute.name]: newValue,
            });
            return;
        }

        if (isAddingNewItem) {
            setNewItem(prev => ({
                ...prev,
                [attribute.name]: newValue,
            }));
        }
    }, [editMode, liveEdit, isNewItem, id, attribute.name, setTmpItem, setNewItem, updateItem, tmpItem?.id]);

    return (
        <div className={componentWrapperClassName}>
            <Comp value={editMode && isValueFormatted ? rawValue : value}
                  placeholder={'please enter value...'}
                  id={compIdEdit}
                  onChange={onChange}
                  className={`${editMode ? 'border' : ''} ${className}`}
                  {...attribute}
                  options={options}
                  meta={optionsMeta}
                  hideControls={attribute.type==='lexical'}
                  showBorder={attribute.type==='lexical'}
            />
    </div>)
}

const RenderItem = memo(function RenderItem ({
                                                 theme,
                                                 compactView, reverse, removeBorder, padding, allowAdddNew, headerValueLayout, liveEdit, // state.display
                                                 isDms, // state.sourceInfo
                                                 item, newItem, setNewItem, addItem, updateItem, allowEdit,
                                                 subWrapperStyle,
                                                 visibleColumns,
                                                 formatFunctions= {},
                                             }) {
    const [tmpItem, setTmpItem] = useState(item || {}); // for form edit controls

    useEffect(() => {
        setTmpItem(item)
    }, [item]);

    const isFormLikeEditMode = (allowEdit || visibleColumns.some(c => c.allowEditInView)) && !liveEdit && item.id;
    const isAddingNewItem = allowAdddNew && !item.id && isDms && addItem;

    return (
        //  in normal view, grid applied here
        <div
            className={`${theme.subWrapper} ${compactView ? `${theme.subWrapperCompactView} ${removeBorder ? `` : 'border shadow'}` : theme.subWrapperSimpleView} `}
            style={subWrapperStyle}>
            {
                visibleColumns
                    .map(attr => {
                        const isNewItem = allowAdddNew && !tmpItem.id && isDms && addItem;
                        const {isLink, isLinkExternal, location, linkText, isImg, imageSrc, imageLocation, imageExtension, imageSize, imageMargin} = attr || {};
                        const span = compactView ? 'span 1' : `span ${attr.cardSpan || 1}`;
                        const rawValue = tmpItem[attr.normalName] || tmpItem[attr.name];
                        const id = tmpItem?.id;
                        const value =
                            isImg ?
                                <img className={theme[imageSize] || theme.imgDefault}
                                     alt={' '}
                                     src={imageLocation ?
                                         `${imageLocation}/${rawValue?.value || rawValue}${imageExtension ? `.${imageExtension}` : ``}` :
                                         (imageSrc || rawValue?.value || rawValue)}
                                /> :
                                ['icon', 'color'].includes(attr.formatFn) && formatFunctions[attr.formatFn] ?
                                    <div className={theme.iconAndColorValues}>
                                        {formatFunctions[attr.formatFn](rawValue?.value || rawValue, attr.isDollar, Icon)}
                                    </div> :
                                    attr.formatFn && formatFunctions[attr.formatFn] ?
                                        formatFunctions[attr.formatFn](rawValue?.value || rawValue, attr.isDollar).replaceAll(' ', '') :
                                        rawValue;

                        const formatClass = attr.formatFn === 'title' ? 'capitalize' : '';
                        const isValueFormatted = isImg || Boolean(formatFunctions[attr.formatFn]);
                        const headerTextJustifyClass = justifyClass[attr.justify || 'left']?.header || justifyClass[attr.justify || 'left'];
                        const valueTextJustifyClass = justifyClass[attr.justify || 'left']?.value || justifyClass[attr.justify || 'left'];
                        let valueFormattedForSearchParams, valueFormattedForDisplay, valueFormattedForEdit, searchParams, url;

                        valueFormattedForDisplay = normalizeValue(value);
                        valueFormattedForEdit = normalizeValue(value, 'originalValue');

                        if(isLink){
                            // setup for link
                            valueFormattedForSearchParams = normalizeValueForSearchParams(value, attr.searchParams);
                            searchParams =
                                attr.searchParams === 'id' ? encodeURIComponent(id) :
                                    ['value', 'rawValue'].includes(attr.searchParams) ?
                                        encodeURIComponent(valueFormattedForSearchParams) : ``;

                            url = `${location || valueFormattedForDisplay}${searchParams}`;
                        }

                        const wrapperFlexClass = headerValueLayout === 'col' && !reverse ? theme.itemFlexCol :
                            headerValueLayout === 'row' && !reverse ? theme.itemFlexRow :
                                headerValueLayout === 'col' && reverse ? theme.itemFlexColReverse :
                                    headerValueLayout === 'row' && reverse ? theme.itemFlexRowReverse : ''

                        const wrapperViewClass = compactView ?
                            `${theme.headerValueWrapperCompactView} ${attr.borderBelow ? theme.headerValueWrapperBorderBelow : ``}` :
                            `${theme.headerValueWrapperSimpleView} ${removeBorder ? `` : theme.itemBorder}`

                        const style = {
                            gridColumn: span,
                            padding: compactView ? undefined : padding,
                            paddingBottom: compactView && attr.pb ? +attr.pb : undefined,
                            marginTop: `${imageMargin}px`,
                            backgroundColor: compactView ? undefined : attr.bgColor
                        }

                        return (
                            <div key={attr.normalName || attr.name}
                                 className={`${theme.headerValueWrapper} ${wrapperFlexClass} ${wrapperViewClass}`}
                                 style={style}
                            >
                                {
                                    attr.hideHeader ? null : (
                                        <div className={
                                            `${theme.header} ${compactView ? theme.headerCompactView : theme.headerSimpleView}
                                            ${theme[headerTextJustifyClass]} ${theme[attr.headerFontStyle || 'textXS']}`
                                        }>
                                            {attr.customName || attr.display_name || attr.normalName || attr.name}
                                            {
                                                attr?.description ? <div className={theme.description}>{attr.description}</div> : null
                                            }
                                        </div>
                                    )
                                }
                                {
                                    attr.hideValue ? null :
                                        <div className={
                                            `${theme.value} ${compactView ? theme.valueCompactView : theme.valueSimpleView}
                                            ${theme[valueTextJustifyClass]} ${theme[attr.valueFontStyle || 'textXS']} ${formatClass}
                                            `}>
                                            {
                                                isLink && !(allowEdit || attr.allowEditInView) ?
                                                    <a className={theme.linkColValue}
                                                       target={isLinkExternal ? '_blank' : '_self'}
                                                       href={url}
                                                    >
                                                        <CompWrapper attribute={attr}
                                                                     value={linkText || valueFormattedForDisplay}
                                                                     rawValue={valueFormattedForEdit}
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
                                                                     className={`${theme[valueTextJustifyClass]} ${theme.valueWrapper}`}

                                                                     componentWrapperClassName={theme.componentWrapper}
                                                        />
                                                    </a> :
                                                    <CompWrapper attribute={attr}
                                                                 value={valueFormattedForDisplay}
                                                                 rawValue={valueFormattedForEdit}
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
                                                                 className={`${theme[valueTextJustifyClass]} ${theme.valueWrapper}`}

                                                                 componentWrapperClassName={theme.componentWrapper}
                                                    />
                                            }
                                        </div>
                                }
                            </div>
                        )
                    })
            }

            {
                isFormLikeEditMode ? (
                    <div className={theme.formEditButtonsWrapper}>
                        <button className={theme.formEditSaveButton} onClick={() => updateItem(undefined, undefined, tmpItem)}>save</button>
                        <button className={theme.formEditCancelButton} onClick={() => setTmpItem(item)}>cancel</button>
                    </div>
                ) : null
            }
            {
                isAddingNewItem ? <button className={theme.formAddNewItemButton} onClick={() => addItem()}>add</button> : null
            }
        </div>
    )
})

export default function ({
    allowEdit,
    updateItem, addItem, isEdit,
    columns=[], data=[], display={}, controls={}, sourceInfo={}, setState,
    newItem, setNewItem, formatFunctions, activeStyle
}) {
    const { theme: themeFromContext = {dataCard: dataCardTheme}} = React.useContext(ThemeContext) || {};
    const theme = getComponentTheme(themeFromContext,'dataCard', activeStyle)

    const [draggedCol, setDraggedCol] = useState(null);

    const {compactView, gridSize, gridGap, padding, colGap, allowAdddNew, bgColor='#FFFFFF'} = display;
    const visibleColumns = useMemo(() => columns.filter(({show}) => show), [columns]);
    const cardsWithoutSpanLength = useMemo(() => visibleColumns.filter(({cardSpan}) => !cardSpan).length, [visibleColumns]);
    const imageTopMargin = useMemo(() =>
        Math.max(
            ...visibleColumns
                .map(attr => attr.isImg && !isNaN(attr.imageMargin) ? Math.abs(attr.imageMargin) : undefined)
                .filter(m=>m)),
        [visibleColumns]);

    const getGridSize = gridSize => gridSize//window?.innerWidth < 640 ? 1 : gridSize;

    const mainWrapperStyle = useMemo(() =>
        gridSize && compactView ?
            {
                gridTemplateColumns: `repeat(${getGridSize(gridSize) || data.length}, minmax(0, 1fr))`,
                gap: gridGap,
                paddingTop: `${imageTopMargin}px`
            } :
            {gap: gridGap, paddingTop: `${imageTopMargin}px`}, [gridSize, compactView, imageTopMargin, gridGap, data.length]);

    const subWrapperStyle = useMemo(() =>
        compactView ? {backgroundColor: bgColor, padding, gap: colGap} :
            {
                gridTemplateColumns: `repeat(${getGridSize(gridSize) || cardsWithoutSpanLength}, minmax(0, 1fr))`,
                gap: gridGap || 2
            },
        [compactView, bgColor, padding, colGap, gridSize, cardsWithoutSpanLength]);

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
                isEdit ? (
                    <div className={theme.columnControlWrapper}>
                        {
                            visibleColumns.map((attribute, i) => (
                                <div
                                    key={`controls-${i}`}
                                    className={theme.columnControlHeaderWrapper}
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
                                        activeStyle={activeStyle}
                                    />
                                </div>
                            ))
                        }
                </div>
                ) : null
            }

            {/* outer wrapper: in compact view, grid applies here */}
            <div className={gridSize && compactView ? theme.mainWrapperCompactView : theme.mainWrapperSimpleView} style={mainWrapperStyle}>
                {
                    (allowAdddNew ? [...data, newItem] : data).map((item, i) => (
                        <RenderItem
                            key={item?.id ?? i}
                            theme={theme}
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
