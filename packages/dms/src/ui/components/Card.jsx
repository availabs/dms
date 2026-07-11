import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Link} from "react-router";
import {getComponentTheme, ThemeContext} from '../useTheme';
import ColumnTypes from "../columnTypes";
import NavigableMenu from "./navigableMenu";
import CardColumnPicker from './CardColumnPicker';
import Icon from "./Icon";
import TableHeaderCell from "./table/components/TableHeaderCell";
import {
    isLayoutModelV2,
    resolveCardsPackMode,
    resolveCardsGridStyle,
    resolveCellTracks,
    resolveCellsGridStyle,
    resolveCellStyle,
    resolveHeaderValueWidths,
    resolveCellBorderClass,
    describeResolvedPadding,
} from './Card.layout';



const isEqualColumns = (column1, column2) =>
    column1?.name === column2?.name &&
    column1?.isDuplicate === column2?.isDuplicate &&
    column1?.copyNum === column2?.copyNum;

const getColIdName = col => col.normalName || col.name;

function buildCardColumnMenuItems({ attribute, controls, display, isEdit, setState }) {
    const colIdName = getColIdName(attribute);

    const moveColumn = (direction) => setState(draft => {
        const idx = draft.columns.findIndex(col => getColIdName(col) === colIdName);
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= draft.columns.length) return;
        const [removed] = draft.columns.splice(idx, 1);
        draft.columns.splice(newIdx, 0, removed);
    });

    const removeColumn = () => setState(draft => {
        const idx = draft.columns.findIndex(col => getColIdName(col) === colIdName);
        if (idx !== -1) draft.columns.splice(idx, 1);
    });

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

    const staticItems = attribute.origin === 'static' ? [
        {
            name: 'Display Name',
            value: attribute.display_name,
            showValue: true,
            items: [{
                name: 'Display Name input',
                type: 'input',
                inputType: 'text',
                value: attribute.display_name,
                onChange: e => updateColumns('display_name', e?.target?.value ?? e)
            }]
        },
        {
            name: 'Static Value',
            value: attribute.staticValue,
            showValue: true,
            items: [{
                name: 'Static Value input',
                type: 'input',
                inputType: 'text',
                value: attribute.staticValue,
                onChange: e => updateColumns('staticValue', e?.target?.value ?? e)
            }]
        },
    ] : [];

    const pageParamsItems = [
        {
            name: 'Use Page Params',
            showLabel: true,
            type: 'toggle',
            enabled: !!attribute.usePageParams,
            setEnabled: v => updateColumns('usePageParams', v)
        },
        ...(attribute.usePageParams ? [{
            name: 'Page Param Key',
            value: attribute.pageParamKey,
            showValue: true,
            items: [{
                name: 'Page Param Key input',
                type: 'input',
                inputType: 'text',
                value: attribute.pageParamKey,
                onChange: e => updateColumns('pageParamKey', e?.target?.value ?? e)
            }]
        }] : []),
    ];

    return [
        ...staticItems,
        ...pageParamsItems,
        ...(controls?.inHeader || [])
        .filter(({ displayCdn }) =>
            typeof displayCdn === 'function' ? displayCdn({ attribute, display, isEdit }) :
            typeof displayCdn === 'boolean' ? displayCdn : true
        )
        .map(({ type, inputType, label, key, dataFetch, options, onChange, renderPos, renderCdn }) => {
            if (type === 'separator') {
                return {
                    name: label || `sep_${key || Math.random()}`,
                    type: 'separator',
                    ...(renderPos !== undefined && { renderPos }),
                    ...(renderCdn !== undefined && { renderCdn }),
                };
            }
            if (typeof type === 'function') {
                return {
                    name: label || key || 'control',
                    noHover: true,
                    ...(renderPos !== undefined && { renderPos }),
                    ...(renderCdn !== undefined && { renderCdn }),
                    type: (menuItem, { close, goBack, goHome } = {}) => type({
                        value: attribute[key],
                        setValue: v => updateColumns(key, v, onChange, dataFetch),
                        attribute,
                        setAttribute: v => updateColumns(undefined, v, onChange, dataFetch),
                        moveColumn,
                        removeColumn,
                        close,
                        goBack,
                        goHome
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
                // options may be a static array or a function that resolves at
                // menu-build time — used by the Column Type control so the
                // select reflects the live ColumnTypes registry (themes can
                // extend it after Card.config.jsx is imported).
                const resolvedOptions = typeof options === 'function'
                    ? options({ attribute, isEdit, display }) || []
                    : (options || []);
                return {
                    name: label,
                    value: attribute[key],
                    showValue: true,
                    items: resolvedOptions.map(opt => ({
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
        }),
    ];
}


const justifyClass = {
    left: 'justifyTextLeft',
    right: 'justifyTextRight',
    center: 'justifyTextCenter',
    full: {header: 'justifyTextLeft', value: 'justifyTextRight'}
};

// Per-side cell borders (mirrors sectionArray's `borderSides`). Composes
// cellBorderTop/Right/Bottom/Left (cellBorderBelow = legacy alias for bottom)
// from theme.cellBorderSides — side-specific so one side never bleeds to others.
const cellBorderSides = (attr, theme) => {
    const m = theme?.cellBorderSides || {};
    const out = [];
    if (attr.cellBorderTop) out.push(m.top);
    if (attr.cellBorderRight) out.push(m.right);
    if (attr.cellBorderBottom || attr.cellBorderBelow) out.push(m.bottom);
    if (attr.cellBorderLeft) out.push(m.left);
    return out.filter(Boolean).join(' ');
};
// Header text-transform. Default '' = as-authored (the Card no longer force-
// capitalizes headers). Authors opt into a transform via the `headerCase` column control.
const caseClass = {
    '': '',
    capitalize: 'capitalize',
    uppercase: 'uppercase',
    lowercase: 'lowercase',
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
    // `static` columns are chrome (a fixed staticValue, e.g. an eyebrow/label) with nothing to
    // edit — never put them in edit mode, so they don't render an EditComp or the edit-mode
    // `border` outline inside an allowEditInView card. `editable: false` opts a DATA column out
    // the same way (it was already excluded from save payloads — dataWrapper's editableColumns —
    // but still rendered pointless edit chrome; e.g. a pre-filled read-only field on an
    // allowAdddNew form card).
    const editMode = (allowEdit || (isNewItem && setNewItem && !tmpItem.id))
        && attribute.origin !== 'static' && attribute.editable !== false;
    const compIdEdit = `${attribute.name}-${id}`;
    const Comp = ColumnTypes[attribute.type]?.[editMode ? 'EditComp' : 'ViewComp'] || DefaultComp;
    // Strip the column's data `key` field before spreading — otherwise React reads
    // the spread `key` as its own key prop and warns ("a key prop is being spread
    // into JSX"). The column is still identified by `name` everywhere else.
    const { key: _columnKey, ...attributeProps } = attribute;

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

    // `row` exposes the full data record to the column-type Comp so composite
    // column types (e.g. wcdb stream_player) can pull sibling fields without
    // needing one Card column per piece of metadata.
    const row = isNewItem ? newItem : tmpItem;

    return (
        <div className={componentWrapperClassName}>
            <Comp value={editMode && isValueFormatted ? rawValue : value}
                  placeholder={'please enter value...'}
                  id={compIdEdit}
                  onChange={onChange}
                  className={`${editMode ? 'border' : ''} ${className}`}
                  {...attributeProps}
                  row={row}
                  options={options}
                  meta={optionsMeta}
                  hideControls={attribute.type==='lexical' && !attribute.showToolbar}
                  showBorder={attribute.type==='lexical' && editMode}
            />
    </div>)
}

const CardColumnField = ({
    attr, theme, cellBorder, cellsPadding, reverse,
    headerValueLayout, headerWidth, valueWidth,
    allowAdddNew, liveEdit, isDms, allowEdit,
    tmpItem, setTmpItem, isNewItem, newItem, setNewItem, updateItem, addItem,
    formatFunctions, controls, setState, isEdit, display,
    pickerLeft, pickerRight, pickerTop, pickerBottom,
    onColumnClick,
}) => {
    const [hovered, setHovered] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const visible = hovered || isMenuOpen;
    const {isLink, isLinkExternal, location, linkText, isImg, imageSrc, imageLocation, imageExtension, imageSize} = attr || {};
    // cardHints: optional metadata declared by a column type (typically a
    // theme-registered one) that lets the type opt out of the field chrome.
    // Built-in types ship without hints, so the empty-object fallback is a
    // strict no-op for legacy columns.
    const hints = ColumnTypes[attr?.type]?.cardHints || {};
    const fullBleed = !!hints.fullBleed;
    const source = isNewItem ? newItem : tmpItem;
    const rawValue = attr.origin === 'static'
        ? attr.staticValue
        // ?? not ||: a calculated column's data is keyed under normalName only (getData keys each
        // row by normalName || name), so a falsy value there (count of 0) must not fall through to
        // the absent name key — that rendered aggregate zeros as blank cells.
        : source?.[attr.normalName] ?? source?.[attr.name];
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
                // `combine` reads a sibling row field, so it needs `source` (the
                // row) and `attr`. Skip the trailing `.replaceAll(' ', '')` that
                // the generic branch applies — the combine separator carries
                // intentional whitespace that the numeric formatters don't.
                attr.formatFn === 'combine' && formatFunctions.combine ?
                    formatFunctions.combine(rawValue?.value ?? rawValue, source, attr) :
                attr.formatFn && formatFunctions[attr.formatFn] ?
                    formatFunctions[attr.formatFn](rawValue?.value || rawValue, attr.isDollar).replaceAll(' ', '') :
                    rawValue;

    const formatClass = attr.formatFn === 'title' ? 'capitalize' : '';
    const isValueFormatted = isImg || Boolean(formatFunctions[attr.formatFn]);
    // Header alignment is independent of value `justify`; defaults to left
    // (the header always rendered left before, so this is backward-compatible).
    const headerTextJustifyClass = justifyClass[attr.headerJustify || 'left']?.header || justifyClass[attr.headerJustify || 'left'];
    const valueTextJustifyClass = justifyClass[attr.justify || 'left']?.value || justifyClass[attr.justify || 'left'];
    let valueFormattedForSearchParams, valueFormattedForDisplay, valueFormattedForEdit, searchParams, url;

    valueFormattedForDisplay = normalizeValue(value);
    valueFormattedForEdit = normalizeValue(value, 'originalValue');

    if(isLink){
        valueFormattedForSearchParams = normalizeValueForSearchParams(value, attr.searchParams);
        // searchParamsCol: source the link param from ANOTHER column's value on this row — display
        // one field, link by another (ported from TableCell; BC: only engaged when the attribute
        // sets `searchParamsCol`).
        const colLinkVal = attr.searchParamsCol != null
            ? (() => { const cv = source?.[attr.searchParamsCol]; return cv && typeof cv === 'object' ? (cv.originalValue ?? cv.value ?? '') : (cv ?? ''); })()
            : null;
        searchParams =
            attr.searchParams === 'id' ? encodeURIComponent(id) :
                attr.searchParamsCol != null ? encodeURIComponent(colLinkVal) :
                ['value', 'rawValue'].includes(attr.searchParams) ?
                    encodeURIComponent(valueFormattedForSearchParams) : ``;
        if (attr.persistSearchParams && location) {
            const rawSearchParamValue =
                attr.searchParams === 'id' ? id :
                ['value', 'rawValue'].includes(attr.searchParams) ? valueFormattedForSearchParams : null;
            const qIdx = location.indexOf('?');
            const basePath = qIdx !== -1 ? location.slice(0, qIdx) : location;
            const currentParams = new URLSearchParams(window.location.search);
            if (qIdx !== -1) {
                new URLSearchParams(location.slice(qIdx + 1)).forEach((v, k) => currentParams.set(k, v));
            }
            if (rawSearchParamValue !== null) {
                const locationKey = qIdx !== -1 ? location.slice(qIdx + 1).split('=')[0] : null;
                if (locationKey) currentParams.set(locationKey, rawSearchParamValue);
            }
            url = `${basePath}?${currentParams.toString()}`;
        } else {
            url = `${location || valueFormattedForDisplay}${searchParams}`;
        }
    }

    const wrapperFlexClass = headerValueLayout === 'col' && !reverse ? theme.itemFlexCol :
        headerValueLayout === 'row' && !reverse ? theme.itemFlexRow :
            headerValueLayout === 'col' && reverse ? theme.itemFlexColReverse :
                headerValueLayout === 'row' && reverse ? theme.itemFlexRowReverse : ''

    // Per-side cell borders (cellBorderTop/Right/Bottom/Left; cellBorderBelow = bottom).
    const sidedBorder = cellBorderSides(attr, theme);
    // Cell chrome: v1 ships an always-on transparent border fallback (+2px);
    // v2 drops it and hover uses an outline. See Card.layout.js.
    const layoutModelV2 = isLayoutModelV2(theme);
    const borderClass = resolveCellBorderClass({
        editHover: isEdit && visible, cellBorder, sidedBorder, theme, layoutModelV2,
    });

    const wrapperViewClass = `${theme.headerValueWrapperSimpleView || ''} ${sidedBorder} ${borderClass}`;

    // The cell's whole inline geometry — spans, padding precedence
    // (side-specific > cellPadding > cellsPadding > v2 theme cellGutter),
    // explicit-zero contract, defined-keys-only emission — lives in
    // Card.layout.js so it's readable and testable in one place.
    const style = resolveCellStyle({
        attr, hints, display, cellsPadding, layoutModelV2, cellGutter: theme.cellGutter,
    });

    const hasMenu = isEdit && controls?.inHeader?.length && setState;
    const isRowLayout = !headerValueLayout || headerValueLayout === 'row';

    // fullBleed wrappers have a fixed height + overflow-hidden, so the menu
    // button needs an explicit top corner placement to avoid landing below
    // the visible area in natural flow. z-10 keeps it above the banner content.
    const menuButtonClass = fullBleed
        ? `absolute top-1 right-1 z-10 shrink-0 ${visible ? 'opacity-100' : 'opacity-0'}`
        : `absolute right-0 shrink-0 ${visible ? 'opacity-100' : 'opacity-0'}`;
    const menuButton = hasMenu && (
        <span className={menuButtonClass}>
            <NavigableMenu
                config={buildCardColumnMenuItems({ attribute: attr, controls, display, isEdit, setState })}
                title={attr.customName || attr.display_name || attr.normalName || attr.name}
                preferredPosition={'right'}
                showTitle={false}
                showBreadcrumbs={true}
                onOpenChange={setIsMenuOpen}
            />
        </span>
    );

    // fullBleed columns get a bare wrapper (no padding/border/rounded chrome)
    // and the field header is suppressed — they own their own visual surface.
    const wrapperClass = fullBleed
        ? `relative ${theme.headerValueWrapperFullBleed || 'w-full relative'}`
        : `relative ${theme.headerValueWrapper} ${wrapperFlexClass} ${wrapperViewClass}`;
    const headerVisible = !fullBleed && (!attr.hideHeader || (hasMenu && !isRowLayout));

    // Row-layout width split — a hidden header/value must not reserve its share.
    const { headerMaxWidth, valueMaxWidth } = resolveHeaderValueWidths({
        isRowLayout, hideHeader: attr.hideHeader, hideValue: attr.hideValue, headerWidth, valueWidth,
    });

    return (
        <div
            className={`${wrapperClass}${onColumnClick ? ' cursor-pointer' : ''}`}
            style={style}
            // Introspection (edit mode only): one devtools glance answers
            // "which column is this cell and where does its padding come from".
            {...(isEdit ? {
                'data-cell': attr.normalName || attr.name,
                'data-pad': describeResolvedPadding(style),
            } : {})}
            onClick={onColumnClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { if (!isMenuOpen) setHovered(false); }}
        >
            {pickerLeft}
            {pickerRight}
            {pickerTop}
            {pickerBottom}
            {/* Header area — always rendered when there's a label or a menu in col layout */}
            {headerVisible && (
                <div
                    className={`${attr.hideHeader ? '' : `${attr.headerFontStyle === 'button' ? theme.linkColValue : theme.header} ${theme[headerTextJustifyClass] || ''} ${caseClass[attr.headerCase || '']}`}`}
                    style={{maxWidth: headerMaxWidth}}
                >
                    {!attr.hideHeader && (
                        <span className={`${theme[attr.headerFontStyle || 'textXS']}`}>
                            {attr.customName || attr.display_name || attr.normalName || attr.name}
                            {attr?.description ? <DefaultComp className={theme.description} value={attr.description} /> : null}
                        </span>
                    )}
                </div>
            )}
            {
                attr.hideValue ? null :
                    <div className={
                        // A styled link cell puts valueFontStyle on the <a>/<Link> below — repeating
                        // it here doubled box-shaped tokens (chip, btnPrimary) into a phantom second
                        // box. Text tokens nested harmlessly, which hid this until a box token hit it.
                        `${theme.value} ${theme[valueTextJustifyClass]} ${(isLink && !(allowEdit || attr.allowEditInView)) ? '' : theme[(attr.valueFontStyle && attr.valueFontStyle !== 'button') ? attr.valueFontStyle : 'textXS']} ${formatClass}
                        `} style={{maxWidth: valueMaxWidth}}>
                        {
                            isLink && !(allowEdit || attr.allowEditInView) ?
                                (isLinkExternal ?
                                <a className={(attr.valueFontStyle && attr.valueFontStyle !== 'button') ? (theme[attr.valueFontStyle] || '') : (theme.linkColValue || '')}
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
                                <Link className={(attr.valueFontStyle && attr.valueFontStyle !== 'button') ? (theme[attr.valueFontStyle] || '') : (theme.linkColValue || '')} to={url}>
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
                                attr.valueFontStyle === 'button' ?
                                <span className={theme.linkColValue || ''}>
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
                                </span> :
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
            {menuButton}
        </div>
    );
};

const RenderItem = memo(function RenderItem ({
                                                 theme,
                                                 reverse, cardBorder, cellBorder, cellsPadding, allowAdddNew,
                                                 headerValueLayout, headerWidth, valueWidth, liveEdit, // state.display
                                                 isDms, // state.sourceInfo
                                                 item, newItem, setNewItem, addItem, updateItem, allowEdit,
                                                 subWrapperStyle,
                                                 columns, visibleColumns,
                                                 formatFunctions= {},
                                                 controls, setState, isEdit, display,
                                             }) {
    const { UI } = React.useContext(ThemeContext) || {};
    const { Button } = UI || {};
    const [tmpItem, setTmpItem] = useState(item || {}); // for form edit controls
    const [cardHovered, setCardHovered] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    const highlightedItem = controls?.highlightedItem;
    const isHighlighted = useMemo(() => {
        if (!highlightedItem) return false;
        const rawVal = item?.[highlightedItem.column];
        const itemValue = rawVal && typeof rawVal === 'object' ? (rawVal.value ?? rawVal.originalValue ?? rawVal) : rawVal;
        const paramValue = typeof highlightedItem.value === 'string' ? highlightedItem.value : String(highlightedItem.value ?? '');
        const itemStr = typeof itemValue === 'string' ? itemValue : String(itemValue ?? '');
        return paramValue === itemStr;
    }, [highlightedItem, item]);

    const highlightClass = isHighlighted
        ? highlightedItem?.style === 'border'
            ? 'ring-2 ring-amber-400'
            : 'bg-amber-100'
        : '';

    const [isSaving, setIsSaving] = useState(false);
    const isSavingRef = useRef(false);

    useEffect(() => {
        setTmpItem(item);
        if (isSavingRef.current) {
            isSavingRef.current = false;
            setIsSaving(false);
        }
    }, [item]);

    const isFormLikeEditMode = (allowEdit || visibleColumns.some(c => c.allowEditInView)) && !liveEdit && item.id;

    const triggerSaveToken = controls?.triggerSaveToken;
    const prevSaveTokenRef = useRef(triggerSaveToken);

    useEffect(() => {
        if (triggerSaveToken === undefined || triggerSaveToken === prevSaveTokenRef.current) return;
        prevSaveTokenRef.current = triggerSaveToken;
        if (isFormLikeEditMode) {
            const hasPendingChanges = Object.keys(tmpItem).some(k => tmpItem[k] !== item[k]);
            if (hasPendingChanges) {
                isSavingRef.current = true;
                setIsSaving(true);
                updateItem(undefined, undefined, tmpItem);
            }
        }
    }, [triggerSaveToken, isFormLikeEditMode, tmpItem, updateItem]);
    const isAddingNewItem = allowAdddNew && !item.id && isDms && addItem;
    const isNewItem = allowAdddNew && !tmpItem.id && isDms && addItem;

    const pickerProps = isEdit && setState ? {
        columns, sourceColumns: controls?.sourceColumns,
        setState,
        FormulaColumnModal: controls?.FormulaColumnModal,
        CalculatedColumnModal: controls?.CalculatedColumnModal,
        parentHovered: cardHovered,
        setIsPickerOpen,
        triggerClassName: 'w-fit',
    } : null;

    return (
        // Cells grid: every card always lays its cells out as a CSS grid.
        // The class string carries chrome (rounded corners, bg) from the
        // legacy `subWrapperCompactView` key; `display: grid` is forced via
        // `subWrapperStyle` so it overrides any `display: flex` that themes
        // still ship in that key.
        <div
            className={`${theme.subWrapper} ${theme.subWrapperCompactView || ''} ${cardBorder ? (theme.cardBorder || 'border shadow') : ''} ${highlightClass} ${isSaving ? theme.formEditSavingAnimation : ''}`}
            style={subWrapperStyle}
            onMouseEnter={() => {
                setCardHovered(true);
                controls?.onCardMouseEnter?.(item);
            }}
            onMouseLeave={() => {
                if (!isPickerOpen) setCardHovered(false);
                controls?.onCardMouseLeave?.();
            }}
        >
            {
                visibleColumns.map((attr, i) => {
                    const fullIdx = pickerProps ? columns.findIndex(c => isEqualColumns(c, attr)) : -1;
                    const isLast = i === visibleColumns.length - 1;
                    const insertAtCurrent = fullIdx !== -1 ? fullIdx : 0;
                    const insertAtAfter = fullIdx !== -1 ? fullIdx + 1 : columns.length;

                    // Both axes are real grids in unified mode, so all four
                    // insertion points are always meaningful. Left/Top insert
                    // before this cell; Right/Bottom insert after the last
                    // cell only.
                    const pickerLeft = pickerProps ? (
                        <CardColumnPicker
                            insertAt={insertAtCurrent}
                            {...pickerProps}
                            triggerClassName="absolute top-0 bottom-0 left-0 -translate-x-1/2 flex items-center z-20 w-4"
                        />
                    ) : null;
                    const pickerRight = (pickerProps && isLast) ? (
                        <CardColumnPicker
                            insertAt={insertAtAfter}
                            {...pickerProps}
                            triggerClassName="absolute top-0 bottom-0 right-0 translate-x-1/2 flex items-center z-20 w-4"
                        />
                    ) : null;
                    const pickerTop = pickerProps ? (
                        <CardColumnPicker
                            insertAt={insertAtCurrent}
                            {...pickerProps}
                            triggerClassName="absolute left-0 right-0 top-0 -translate-y-1/2 h-4 z-20 flex items-center justify-center"
                        />
                    ) : null;
                    const pickerBottom = (pickerProps && isLast) ? (
                        <CardColumnPicker
                            insertAt={insertAtAfter}
                            {...pickerProps}
                            triggerClassName="absolute left-0 right-0 bottom-0 translate-y-1/2 h-4 z-20 flex items-center justify-center"
                        />
                    ) : null;
                    const clickPublishColumn = controls?.clickPublishColumn;
                    const onCardColumnClick = controls?.onCardColumnClick;
                    const attrKey = attr.normalName || attr.name;
                    const onColumnClick = (clickPublishColumn && onCardColumnClick && attrKey === clickPublishColumn)
                        ? attr.origin === 'static'
                            ? () => onCardColumnClick({ [attrKey]: attr.staticValue }, attrKey)
                            : () => onCardColumnClick(item, attrKey)
                        : undefined;

                    return (
                        <CardColumnField
                            key={attr.normalName || attr.name}
                            attr={attr}
                            theme={theme}
                            cellBorder={cellBorder}
                            cellsPadding={cellsPadding}
                            reverse={reverse}
                            // per-column override (additive): lets one cell deviate from the card's
                            // ambient layout — e.g. a full-width data_bar (needs `col`; `row` collapses
                            // it to content width) inside an otherwise row-aligned stats card.
                            headerValueLayout={attr.headerValueLayout || headerValueLayout}
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
                            pickerLeft={pickerLeft}
                            pickerRight={pickerRight}
                            pickerTop={pickerTop}
                            pickerBottom={pickerBottom}
                            onColumnClick={onColumnClick}
                        />
                    );
                })
            }

            {
                isFormLikeEditMode && !controls?.clickSaveActive ? (
                    <div className={theme.formEditButtonsWrapper}>
                        <Button activeStyle="active" onClick={() => updateItem(undefined, undefined, tmpItem)}>save</Button>
                        <Button onClick={() => setTmpItem(item)}>cancel</Button>
                    </div>
                ) : null
            }
            {
                isAddingNewItem ? (
                    <div className={theme.formAddNewItemWrapper}>
                        <Button activeStyle="active" onClick={() => addItem()}>add</Button>
                    </div>
                ) : null
            }
        </div>
    )
})

export default function Card ({
    allowEdit,
    updateItem, addItem, isEdit,
    columns=[], data=[], display={}, controls={}, sourceInfo={}, setState,
    newItem, setNewItem, formatFunctions, activeStyle
}) {
    const { theme: themeFromContext = {dataCard: {}}} = React.useContext(ThemeContext) || {};
    const dataCardStyle = getComponentTheme(themeFromContext,'dataCard', activeStyle)
    const textSettingsStyle = getComponentTheme(themeFromContext, 'textSettings', 0)
    // textSettings provides typography defaults; dataCard wins on key conflicts.
    const theme = { ...textSettingsStyle, ...dataCardStyle }

    const [draggedCol, setDraggedCol] = useState(null);

    const {
        cardsGridSize, cardsGridGap, cardsGridPadding, cardsPadding, cardsBgColor, cardsVerticalAlign,
        cellsGridSize, cellsGridGap, cellsRowGap, cellsColumnGap, cellsRowHeight, cellsPadding,
        cellsTracksTemplate,
        cardBorder, cellBorder,
        allowAdddNew,
    } = display;
    // selectOnly: the column participates in the query (SELECT/GROUP BY — it must
    // keep show:true or the dataWrapper drops it from the grouping) but renders NO
    // cell. Without it, a hidden (hideHeader+hideValue) data column still occupies
    // a grid slot and shifts every later cell in multi-column cell grids.
    const visibleColumns = useMemo(() => columns.filter(({show, selectOnly}) => show && !selectOnly), [columns]);
    const cellsWithoutSpanLength = useMemo(() => visibleColumns.filter(({cellSpan}) => !cellSpan).length, [visibleColumns]);
    const hasRowSpan = useMemo(() => visibleColumns.some(c => c.cellRowSpan > 1), [visibleColumns]);
    const imageTopMargin = useMemo(() =>
        Math.max(
            ...visibleColumns
                .map(attr => (attr.isImg || attr.type === 'image') && !isNaN(attr.imageMargin) ? Math.abs(attr.imageMargin) : undefined)
                .filter(m=>m)),
        [visibleColumns]);

    // Cards grid (outer): records laid out across the section. Default 1
    // column → vertical stack. Vertical rhythm depends on the layout model:
    // v1 default fills the box (slack distributed BETWEEN card rows;
    // `cardsVerticalAlign: 'top'` packs); v2 default packs to the top so the
    // gap between cards is exactly `cardsGridGap` (`'stretch'` opts into
    // fill). Full model docs in Card.layout.js.
    const layoutModelV2 = isLayoutModelV2(theme);
    const packMode = resolveCardsPackMode({ cardsVerticalAlign, layoutModelV2 });
    const mainWrapperStyle = useMemo(
        () => resolveCardsGridStyle({
            display: { cardsGridSize, cardsGridGap, cardsGridPadding, cardsVerticalAlign },
            imageTopMargin, layoutModelV2,
        }),
        [cardsGridSize, cardsGridGap, cardsGridPadding, cardsVerticalAlign, imageTopMargin, layoutModelV2]);

    // Cells grid (inner, per-record): cells laid out across the card.
    // Default falls back to one cell per visible column. `display: grid` is
    // forced inline so it wins over any `display: flex` still shipped via
    // theme.subWrapperCompactView. Track sizing (cellsTracksTemplate /
    // per-column cellWidth first-wins walker) is documented in Card.layout.js.
    const gridTemplateColumns = useMemo(
        () => resolveCellTracks({ cellsTracksTemplate, cellsGridSize, cellsWithoutSpanLength, visibleColumns }),
        [cellsTracksTemplate, cellsGridSize, cellsWithoutSpanLength, visibleColumns]);

    const subWrapperStyle = useMemo(
        () => resolveCellsGridStyle({
            display: { cellsGridGap, cellsRowGap, cellsColumnGap, cellsRowHeight, cardsBgColor, cardsPadding },
            gridTemplateColumns, hasRowSpan,
        }),
        [gridTemplateColumns, cellsGridGap, cellsRowGap, cellsColumnGap, cardsBgColor, cardsPadding, cellsRowHeight, hasRowSpan]);

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
            {/*{*/}
            {/*    isEdit ? (*/}
            {/*        <div className="flex flex-wrap items-start gap-y-1 overflow-x-auto">*/}
            {/*            {*/}
            {/*                visibleColumns.map((attribute, i) => (*/}
            {/*                    <div*/}
            {/*                        key={`col-header-${i}`}*/}
            {/*                        className={theme.columnControlHeaderWrapper}*/}
            {/*                        draggable*/}
            {/*                        onDragStart={() => setDraggedCol(attribute)}*/}
            {/*                        onDragOver={e => e.preventDefault()}*/}
            {/*                        onDrop={() => handleDrop(attribute)}*/}
            {/*                    >*/}
            {/*                        <TableHeaderCell*/}
            {/*                            isEdit={isEdit}*/}
            {/*                            attribute={attribute}*/}
            {/*                            columns={columns}*/}
            {/*                            display={display} controls={controls} setState={setState}*/}
            {/*                            activeStyle={activeStyle}*/}
            {/*                        />*/}
            {/*                    </div>*/}
            {/*                ))*/}
            {/*            }*/}
            {/*        </div>*/}
            {/*    ) : null*/}
            {/*}*/}

            {/* Cards grid wrapper. Always a CSS grid; `display: grid` is also
                set inline by mainWrapperStyle so themes that didn't ship the
                `mainWrapperCompactView` key still render correctly. The
                edit-mode data-rhythm attribute exposes gap + pack mode for
                spacing diagnosis in devtools. */}
            <div
                className={theme.mainWrapperCompactView || ''}
                style={mainWrapperStyle}
                {...(isEdit ? { 'data-rhythm': `${cardsGridGap ?? 0}/${packMode}` } : {})}
            >
                {
                    (allowAdddNew ? [...data, newItem] : data).map((item, i) => (
                        <RenderItem
                            key={item?.id ?? i}
                            theme={theme}
                            {...display}
                            display={display}
                            isDms={sourceInfo.isDms || sourceInfo.isEditable}
                            item={item} newItem={newItem} setNewItem={setNewItem}
                            addItem={addItem} updateItem={updateItem} allowEdit={allowEdit}
                            subWrapperStyle={subWrapperStyle}
                            columns={columns}
                            visibleColumns={visibleColumns}
                            formatFunctions={formatFunctions}
                            controls={{...controls, sourceColumns: sourceInfo.columns}}
                            setState={setState}
                            isEdit={isEdit}
                        />
                    ))
                }
            </div>
        </>
    )
}
