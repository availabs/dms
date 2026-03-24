import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Link} from "react-router";
import {getComponentTheme, ThemeContext} from '../useTheme';
import ColumnTypes from "../columnTypes";
import NavigableMenu from "./navigableMenu";
import Icon from "./Icon";
import TableHeaderCell from "./table/components/TableHeaderCell";



const isEqualColumns = (column1, column2) =>
    column1?.name === column2?.name &&
    column1?.isDuplicate === column2?.isDuplicate &&
    column1?.copyNum === column2?.copyNum;

const getColIdName = col => col.normalName || col.name;

function buildCardColumnMenuItems({ attribute, controls, display, isEdit, setState }) {
    const colIdName = getColIdName(attribute);

    const updateColumns = (key, value, onChange, dataFetch) => setState(draft => {
        const idx = draft.columns.findIndex(col => getColIdName(col) === colIdName);
        if (idx !== -1) {
            if (key) {
                draft.columns[idx][key] = value;
            } else {
                draft.columns[idx] = { ...(draft.columns[idx] || {}), ...(value || {}) };
            }
        }
        if (onChange) onChange({ attribute, key, value, columnIdx: idx });
        if (dataFetch && !draft.display.readyToLoad) draft.display.readyToLoad = true;
    });

    return (controls?.inHeader || [])
        .filter(({ displayCdn }) =>
            typeof displayCdn === 'function' ? displayCdn({ attribute, display, isEdit }) :
            typeof displayCdn === 'boolean' ? displayCdn : true
        )
        .map(({ type, inputType, label, key, dataFetch, options, onChange }) => {
            if (typeof type === 'function') {
                return {
                    name: label || key || 'control',
                    noHover: true,
                    type: () => type({
                        value: attribute[key],
                        setValue: v => updateColumns(key, v, onChange, dataFetch),
                        attribute,
                        setAttribute: v => updateColumns(undefined, v, onChange, dataFetch)
                    })
                };
            }
            if (type === 'toggle') {
                return {
                    name: label,
                    showLabel: true,
                    type: 'toggle',
                    enabled: attribute[key],
                    setEnabled: v => updateColumns(key, v, onChange, dataFetch)
                };
            }
            if (type === 'select') {
                return {
                    name: label,
                    value: attribute[key],
                    showValue: true,
                    items: (options || []).map(opt => ({
                        icon: opt.value === attribute[key] ? 'CircleCheck' : 'Blank',
                        name: opt.label,
                        onClickGoBack: true,
                        onClick: () => updateColumns(key, opt.value, onChange, dataFetch)
                    }))
                };
            }
            if (type === 'input') {
                return {
                    name: label,
                    value: attribute[key],
                    showValue: true,
                    items: [{
                        name: `${label} input`,
                        type: 'input',
                        inputType,
                        value: attribute[key],
                        onChange: e => updateColumns(key, e?.target?.value ?? e, onChange, dataFetch)
                    }]
                };
            }
            if (type === 'textarea') {
                return {
                    name: label,
                    value: attribute[key],
                    showValue: true,
                    noHover: true,
                    type: () => (
                        <div className={'p-2 w-full'}>
                            <label className={'text-xs text-gray-500'}>{label}</label>
                            <textarea
                                className={'w-full border rounded p-1 text-sm'}
                                value={attribute[key] || ''}
                                onChange={e => updateColumns(key, e.target.value, onChange, dataFetch)}
                            />
                        </div>
                    )
                };
            }
            return { name: label || key || String(type) };
        });
}


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

    if(!editMode && (
        attribute.isImg ||
        attribute.isLink ||
        (['icon', 'color'].includes(attribute.formatFn) && formatFunctions[attribute.formatFn])
    )) {
        // no special components needed
        return value
    }

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
                  showBorder={attribute.type==='lexical' && editMode}
            />
    </div>)
}

const CardColumnField = ({
    attr, theme, compactView, reverse, addBorder, removeBorder, padding,
    headerValueLayout, headerWidth, valueWidth,
    allowAdddNew, liveEdit, isDms, allowEdit,
    tmpItem, setTmpItem, isNewItem, newItem, setNewItem, updateItem, addItem,
    formatFunctions, controls, setState, isEdit, display,
}) => {
    const [hovered, setHovered] = useState(false);
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
        `${theme.headerValueWrapperCompactView} ${attr.borderBelow ? theme.headerValueWrapperBorderBelow : ``} ${addBorder ? `border shadow rounded-md` : ``}` :
        `${theme.headerValueWrapperSimpleView} ${removeBorder ? `` : theme.itemBorder}`

    const style = {
        gridColumn: span,
        padding: compactView ? undefined : padding,
        paddingBottom: compactView && attr.pb ? +attr.pb : undefined,
        marginTop: `${imageMargin}px`,
        backgroundColor: compactView ? undefined : attr.bgColor
    }

    const hasMenu = isEdit && controls?.inHeader?.length && setState;
    const isRowLayout = !headerValueLayout || headerValueLayout === 'row';

    const menuButton = hasMenu && (
        <span className={`shrink-0 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            <NavigableMenu
                config={buildCardColumnMenuItems({ attribute: attr, controls, display, isEdit, setState })}
                title={attr.customName || attr.display_name || attr.normalName || attr.name}
                preferredPosition={'right'}
                showTitle={false}
            />
        </span>
    );

    return (
        <div
            className={`${theme.headerValueWrapper} ${wrapperFlexClass} ${wrapperViewClass}`}
            style={style}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Header area — always rendered when there's a label or a menu in col layout */}
            {(!attr.hideHeader || (hasMenu && !isRowLayout)) && (
                <div
                    className={`${attr.hideHeader ? '' : `${theme.header} ${compactView ? theme.headerCompactView : theme.headerSimpleView}`} flex items-center justify-between`}
                    style={{maxWidth: isRowLayout && !attr.hideValue ? `${headerWidth || 50}%` : undefined}}
                >
                    {!attr.hideHeader && (
                        <span className={`${theme[headerTextJustifyClass]} ${theme[attr.headerFontStyle || 'textXS']}`}>
                            {attr.customName || attr.display_name || attr.normalName || attr.name}
                            {attr?.description ? <DefaultComp className={theme.description} value={attr.description} /> : null}
                        </span>
                    )}
                    {/* col layout: menu lives here, next to the label */}
                    {!isRowLayout && menuButton}
                </div>
            )}
            {
                attr.hideValue ? null :
                    <div className={
                        `${theme.value} ${compactView ? theme.valueCompactView : theme.valueSimpleView}
                        ${theme[valueTextJustifyClass]} ${theme[attr.valueFontStyle || 'textXS']} ${formatClass}
                        `} style={{maxWidth: isRowLayout && !attr.hideHeader ? `${valueWidth || 50}%` : undefined}}>
                        {
                            isLink && !(allowEdit || attr.allowEditInView) ?
                                (isLinkExternal ?
                                <a className={theme.linkColValue}
                                   target="_blank"
                                   rel="noopener noreferrer"
                                   href={url}
                                >
                                    <CompWrapper attribute={attr}
                                                 value={linkText || valueFormattedForDisplay}
                                                 rawValue={valueFormattedForEdit}
                                                 isValueFormatted={isValueFormatted}
                                                 updateItem={isNewItem ? undefined : updateItem}
                                                 liveEdit={liveEdit}
                                                 tmpItem={tmpItem}
                                                 setTmpItem={setTmpItem}
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
                                <Link className={theme.linkColValue} to={url}>
                                    <CompWrapper attribute={attr}
                                                 value={linkText || valueFormattedForDisplay}
                                                 rawValue={valueFormattedForEdit}
                                                 isValueFormatted={isValueFormatted}
                                                 updateItem={isNewItem ? undefined : updateItem}
                                                 liveEdit={liveEdit}
                                                 tmpItem={tmpItem}
                                                 setTmpItem={setTmpItem}
                                                 isNewItem={isNewItem}
                                                 newItem={isNewItem ? newItem : undefined}
                                                 setNewItem={isNewItem ? setNewItem : undefined}
                                                 id={id}
                                                 allowEdit={allowEdit || attr.allowEditInView}
                                                 formatFunctions={formatFunctions}
                                                 className={`${theme[valueTextJustifyClass]} ${theme.valueWrapper}`}
                                                 componentWrapperClassName={theme.componentWrapper}
                                    />
                                </Link>) :
                                <CompWrapper attribute={attr}
                                             value={valueFormattedForDisplay}
                                             rawValue={valueFormattedForEdit}
                                             isValueFormatted={isValueFormatted}
                                             updateItem={isNewItem ? undefined : updateItem}
                                             liveEdit={liveEdit}
                                             tmpItem={tmpItem}
                                             setTmpItem={setTmpItem}
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
            {/* row layout: menu lives here, after the value, outside the 50/50 split */}
            {isRowLayout && menuButton}
        </div>
    );
};

const RenderItem = memo(function RenderItem ({
                                                 theme,
                                                 compactView, reverse, removeBorder, addBorder, padding, allowAdddNew,
                                                 headerValueLayout, headerWidth, valueWidth, liveEdit, // state.display
                                                 isDms, // state.sourceInfo
                                                 item, newItem, setNewItem, addItem, updateItem, allowEdit,
                                                 subWrapperStyle,
                                                 visibleColumns,
                                                 formatFunctions= {},
                                                 controls, setState, isEdit, display,
                                             }) {
    const [tmpItem, setTmpItem] = useState(item || {}); // for form edit controls

    useEffect(() => {
        setTmpItem(item)
    }, [item]);

    const isFormLikeEditMode = (allowEdit || visibleColumns.some(c => c.allowEditInView)) && !liveEdit && item.id;
    const isAddingNewItem = allowAdddNew && !item.id && isDms && addItem;
    const isNewItem = allowAdddNew && !tmpItem.id && isDms && addItem;

    return (
        //  in normal view, grid applied here
        <div
            className={`${theme.subWrapper} ${compactView ? `${theme.subWrapperCompactView} ${removeBorder ? `` : 'border shadow'}` : `${theme.subWrapperSimpleView} ${addBorder ? `border shadow rounded-md` : ``}`} `}
            style={subWrapperStyle}>
            {
                visibleColumns.map(attr => (
                    <CardColumnField
                        key={attr.normalName || attr.name}
                        attr={attr}
                        theme={theme}
                        compactView={compactView}
                        reverse={reverse}
                        addBorder={addBorder}
                        removeBorder={removeBorder}
                        padding={padding}
                        headerValueLayout={headerValueLayout}
                        headerWidth={headerWidth}
                        valueWidth={valueWidth}
                        allowAdddNew={allowAdddNew}
                        liveEdit={liveEdit}
                        isDms={isDms}
                        allowEdit={allowEdit}
                        tmpItem={tmpItem}
                        setTmpItem={setTmpItem}
                        isNewItem={isNewItem}
                        newItem={newItem}
                        setNewItem={setNewItem}
                        updateItem={updateItem}
                        addItem={addItem}
                        formatFunctions={formatFunctions}
                        controls={controls}
                        setState={setState}
                        isEdit={isEdit}
                        display={display}
                    />
                ))
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
    const { theme: themeFromContext = {dataCard: {}}} = React.useContext(ThemeContext) || {};
    const theme = getComponentTheme(themeFromContext,'dataCard', activeStyle)

    const [draggedCol, setDraggedCol] = useState(null);

    const {compactView, gridSize, gridGap, padding, colGap, allowAdddNew, bgColor} = display;
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
                            display={display}
                            isDms={sourceInfo.isDms}
                            item={item} newItem={newItem} setNewItem={setNewItem}
                            addItem={addItem} updateItem={updateItem} allowEdit={allowEdit}
                            subWrapperStyle={subWrapperStyle}
                            visibleColumns={visibleColumns}
                            formatFunctions={formatFunctions}
                            controls={controls}
                            setState={setState}
                            isEdit={isEdit}
                        />
                    ))
                }
            </div>
        </>
    )
}
