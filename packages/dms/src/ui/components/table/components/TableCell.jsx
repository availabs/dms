import React, {useContext, useEffect, useRef, useState, memo, useMemo, useCallback} from "react";
import {isEqual} from "lodash-es";
import Icon from "../../Icon";
import DataTypes from "../../../columnTypes";
import {formatFunctions} from "../../../../patterns/page/components/sections/components/dataWrapper/utils/utils";
import { RenderAction } from "./RenderActions";
import {TableCellContext} from "../index";
import {handleMouseDown, handleMouseMove, handleMouseUp} from "../utils/mouse";

const justifyClass = {
    left: 'justify-start',
    right: 'justify-end',
    center: 'justify-center'
}

const parseIfJson = strValue => {
    if (typeof strValue === 'object') return strValue;

    try {
        return JSON.parse(strValue)
    }catch (e){
        return {}
    }
}

const DisplayCalculatedCell = ({value, className}) => <div className={className}>{typeof value === 'object' ? JSON.stringify(value) : value}</div>

const LinkComp = ({attribute, columns, newItem, removeItem, value}) => {
    const {actionType, location, linkText, isLink, isLinkExternal, useId} = attribute;
    // isLink:
        // linkText
        // location (optional)
        // searchParams: none|value|rawValue|id
    if(isLink){
        const valueFormattedForSearchParams = Array.isArray(value) ?
            value.map(v =>
                typeof v === 'object' && v?.hasOwnProperty('originalValue') && attribute.searchParams === 'rawValue' ?
                    v.originalValue :
                    typeof v === 'object' && v?.hasOwnProperty('value') ?
                        v.value : v
            ).join('|||') :
            typeof value === 'object' && value?.hasOwnProperty('originalValue') && attribute.searchParams === 'rawValue' ?
                value.originalValue :
                typeof value === 'object' && value?.hasOwnProperty('value') ?
                    value.value : value;

        const valueFormattedForDisplay = Array.isArray(value) ?
            value.map(v =>
                typeof v === 'object' && v?.hasOwnProperty('value') ?
                    v.value : v
            ) :
            typeof value === 'object' && value?.hasOwnProperty('value') ?
                value.value : value;

        const searchParams =
            attribute.searchParams === 'id' ? encodeURIComponent(newItem.id) :
                ['value', 'rawValue'].includes(attribute.searchParams) ? encodeURIComponent(valueFormattedForSearchParams) : ``;

        const url = `${location || valueFormattedForDisplay}${searchParams}`;
        // todo make this conditional for isLinkExternal, and render Link if not.
        return (props) => <a {...props} href={url} {...isLinkExternal && {target:"_blank"}} >{linkText || valueFormattedForDisplay}</a>
    }

    if(actionType){
        return (props) => <RenderAction {...props} action={attribute} newItem={newItem} removeItem={removeItem} columns={columns} />
    }
}

const validate = ({value, required, options}) => {
    const requiredValidation = !required || (required && value && value !== '')
    const optionsValidation = !options || !options?.length || (
        Array.isArray(options) && !value && !required ? true : // blank value with not required condition
        Array.isArray(options) && (typeof value === "string" || typeof value === "boolean") ? // select
            options.map(o => (o.value || o || '').toString()).includes(value.toString()) :
            Array.isArray(options) && typeof value === 'number' ? //select
                options.map(o => +(o.value || o)).includes(value) :
                Array.isArray(options) && Array.isArray(value) ?  // multiselect
                    value.reduce((acc, v) => acc && options.map(o => o.value || o).includes(v?.value || v), true) :
                    false
    );
    return requiredValidation && optionsValidation;
}

const getEdge = (
    { startI, endI, startCol, endCol }, // selection
    index, // row index
    attrI // attribute index
) => {
    const top = Math.min(startI, endI);
    const bottom = Math.max(startI, endI);
    const left = Math.min(startCol, endCol);
    const right = Math.max(startCol, endCol);

    // Single cell
    if (top === bottom && left === right) return 'all';

    // Vertical line
    if (left === right) {
        if (top === index) return 'ltr';
        if (bottom === index) return 'lbr';
        if (index > top && index < bottom) return 'x';
    }

    // Horizontal line
    if (top === bottom) {
        if (attrI === left) return 'tlb';
        if (attrI === right) return 'trb';
        if (attrI > left && attrI < right) return 'y';
    }

    // Corners and edges of a rectangle
    if (index === top) {
        if (attrI === left) return 'top-left';
        if (attrI === right) return 'top-right';
        if (attrI > left && attrI < right) return 'top';
    }

    if (index === bottom) {
        if (attrI === left) return 'bottom-left';
        if (attrI === right) return 'bottom-right';
        if (attrI > left && attrI < right) return 'bottom';
    }

    if (attrI === left && index > top && index < bottom) return 'left';
    if (attrI === right && index > top && index < bottom) return 'right';

    return '';
};

export const TableCell = memo(function TableCell ({
    index, attrI, item, isTotalCell,
    showOpenOutCaret, setShowOpenOut,
    attribute, openOutTitle
}) {
    const {
        frozenCols, allowEdit: allowEditComp, editing, setEditing, isDragging, isSelecting,
        setSelection, setIsDragging, startCellCol, startCellRow, selection, selectionRange,
        updateItem, removeItem, columns, display, theme
    } = useContext(TableCellContext);

    // =================================================================================================================
    // ============================================ Cell Properties begin ==============================================
    // =================================================================================================================
    const cellRef = useRef(null);
    const isFrozen = frozenCols?.includes(attrI)
    const allowEdit = allowEditComp || attribute.allowEditInView;

    const isCellEditing = editing?.index === index && editing?.attrI === attrI;
    const edge = selection?.find(s => s.index === index && s.attrI === attrI) || selection?.includes(index) ?
        getEdge(selectionRange, index, attrI) : null

    const isSelected = useMemo(() => {
        return selection?.find(s => s.index === index && s.attrI === attrI) || selection?.includes(index);
    }, [selection, index, attrI]);

    const onMouseDown = useCallback(
        (e) => {
            if (setSelection && setIsDragging) {
                handleMouseDown({
                    e, index, attrI,
                    setSelection, setIsDragging,
                    startCellCol, startCellRow,
                    selection
                });
            }
        },
        [setSelection, setIsDragging, index, attrI, startCellCol, startCellRow, selection]
    );

    const onMouseMove = useCallback(
        (e) => {
            if (setSelection) {
                handleMouseMove({
                    e, index, attrI, isDragging,
                    startCellCol, startCellRow, setSelection
                });
            }
        },
        [setSelection, index, attrI, isDragging, startCellCol, startCellRow]
    );

    const onMouseUp = useCallback(
        (e) => {
            if (setIsDragging) {
                handleMouseUp({ setIsDragging });
            }
        },
        [setIsDragging]
    );

    const onClick = useCallback(() => {
        setSelection?.(prev => {
            if (!prev || prev.length !== 1) return prev;

            const [{ index: prevIndex, attrI: prevAttrI }] = prev;

            if (prevIndex === index && prevAttrI === attrI) {
                return prev;
            }

            return [{ index, attrI }];
        });

        setEditing?.(prev => {
            if (prev?.index === index && prev?.attrI === attrI) {
                return prev; // no change if editing current cell
            }
            return {};
        });
    }, [index, attrI, setSelection, setEditing]);

    const onDoubleClick = useCallback(() => {
        setEditing && (allowEdit || attribute.allowEditInView) && setEditing(prev => {
            if (prev?.index === index && prev?.attrI === attrI) {
                return prev; // no change
            }
            return {index: index, attrI}; // edit current cell
        });
    }, [allowEdit, attribute.allowEditInView, index, attrI]);

    const onChange = useCallback(
        (e) => {
            if (isTotalCell) return;
            setNewItem(prev => ({
                ...prev,
                [attribute.name]: e
            }));
        },
        [isTotalCell, attribute.name]
    );

    // =================================================================================================================
    // ============================================= Cell Properties end ===============================================
    // =================================================================================================================

    const [newItem, setNewItem] = useState(item);
    const rawValue = useMemo(() => newItem[attribute.normalName] || newItem[attribute.name], [newItem, attribute.name, attribute.normalName]);

    const renderTextBox = attribute.type === 'text' && isCellEditing && allowEdit;
    const compType = attribute.type === 'calculated' && Array.isArray(rawValue) ? 'multiselect' : attribute.type;
    const compMode = attribute.type === 'calculated' && Array.isArray(rawValue) ? 'ViewComp' :
        isCellEditing && allowEdit ? 'EditComp' : 'ViewComp';

    const Comp = useMemo(() =>
        compType === 'ui' ? (attribute.Comp || DisplayCalculatedCell) :
            renderTextBox ? DataTypes.textarea.EditComp :
                attribute.isLink || attribute.actionType ?
                    LinkComp({attribute, columns, newItem, removeItem, value: rawValue}) :
                    (DataTypes[compType]?.[compMode] || DisplayCalculatedCell),
        [compType, compMode, renderTextBox, attribute, newItem, rawValue]);

    const value = isTotalCell && !(attribute.showTotal || display.showTotal) ? null :
        compMode === 'EditComp' ? rawValue : // edit mode should always show raw value
            attribute.formatFn && formatFunctions[attribute.formatFn.toLowerCase()] ?
                formatFunctions[attribute.formatFn.toLowerCase()](rawValue, attribute.isDollar) :
                rawValue;

    const selectionColor = '#2100f8'
    const selectionEdgeClassNames = {
        top: {borderTopColor: selectionColor},
        bottom: {borderBottomColor: selectionColor},
        left: {borderLeftColor: selectionColor},
        right: {borderRightColor: selectionColor},
        'top-left': {borderTopColor: selectionColor, borderLeftColor: selectionColor},
        'top-right': {borderTopColor: selectionColor, borderRightColor: selectionColor},
        'bottom-left': {borderBottomColor: selectionColor, borderLeftColor: selectionColor},
        'bottom-right': {borderBottomColor: selectionColor, borderRightColor: selectionColor},
        'ltr': {borderTopColor: selectionColor, borderLeftColor: selectionColor, borderRightColor: selectionColor},
        'lbr': {borderBottomColor: selectionColor, borderLeftColor: selectionColor, borderRightColor: selectionColor},
        'tlb': {borderTopColor: selectionColor, borderLeftColor: selectionColor, borderBottomColor: selectionColor},
        'trb': {borderTopColor: selectionColor, borderRightColor: selectionColor, borderBottomColor: selectionColor},
        'x': {borderLeftColor: selectionColor, borderRightColor: selectionColor},
        'y': {borderTopColor: selectionColor, borderBottomColor: selectionColor},
        'all': {borderColor: selectionColor},
    }

    useEffect(() => setNewItem(item), [item])

    useEffect(() => {
        if (!(isCellEditing && allowEdit)) return;

        const original = rawValue?.originalValue ?? rawValue;
        const newVal = item[attribute.name]?.originalValue ?? item[attribute.name];

        if (!isEqual(original, newVal) && updateItem) {
            const timeoutId = setTimeout(() => {
                updateItem(undefined, undefined, newItem);
            }, 500);

            return () => {
                clearTimeout(timeoutId);
            };
        }
    }, [rawValue]);

    useEffect(() => {
        const el = cellRef.current;
        if (isSelected && el) {
            el.scrollIntoView({
                block: "nearest",
                inline: "nearest"
            });
        }
    }, [isSelected]);

    const isValid = useMemo(() => {
        if( ['multiselect', 'select'].includes(attribute.type) &&
            attribute.mapped_options // don't validate values for attributes that refer another source (dropdowns)
        ) {
            return true;
        }

        if ( !['multiselect', 'select', 'radio'].includes(attribute.type) && attribute.required !== 'yes' ) {
            return true;
        }

        const value =
            typeof rawValue === 'object' && rawValue?.hasOwnProperty('originalValue')
                ? rawValue.originalValue
                : typeof rawValue === 'object' && rawValue?.hasOwnProperty('value')
                    ? rawValue.value
                    : rawValue;

        return validate({
            value,
            options: attribute.options,
            required: attribute.required === 'yes'
        });
    }, [
        attribute.type,
        attribute.mapped_options,
        attribute.required,
        attribute.options,
        rawValue
    ]);

    const options = useMemo(() => {
        if (
            !['select', 'multiselect'].includes(attribute.type) ||
            !(attribute.options || []).some(o => o.filter)
        ) {
            return attribute.options;
        }

        return attribute.options.filter(o => {
            const optionFilter = parseIfJson(o.filter);

            return Object.keys(optionFilter).every(col => {
                if (newItem[col] === undefined || newItem[col] === null) return false;
                return optionFilter[col].includes(newItem[col].toString());
            });
        });
    }, [
        attribute.type,
        attribute.options,
        newItem
    ]);


    const optionsMeta = useMemo(() => {
        if(!parseIfJson(attribute.meta_lookup)?.view_id){
            return parseIfJson(attribute.meta_lookup)
        }
    }, [attribute.meta_lookup])

    const bgColor = useMemo(() =>
            openOutTitle || attribute.openOut ? `` : // open outs are out of grid, we don't paint them
                isTotalCell ? theme.totalCell :
                    !isValid ? theme.cellInvalid : // invalid cells might want an indicator
                        isSelected ? theme.cellBgSelected : // selected cells color differently
                            display.striped && index % 2 === 0 ? theme.cellBgOdd : // if striped
                                display.striped ? theme.cellBgEven :
                                    theme.cellBg, // fallback
        [openOutTitle, attribute.openOut, isTotalCell, isValid, isSelected, display.striped, index,
            theme.cellInvalid, theme.totalCell, theme.cellBgSelected, theme.cellBgOdd, theme.cellBgEven]);

    const compStyle = useMemo(
        () => (renderTextBox ? { borderColor: selectionColor } : undefined),
        [renderTextBox, selectionColor]
    );

    const compClassName = useMemo(() => {
        return `${ openOutTitle ? theme?.openOutTitle : attribute.openOut ? theme?.openOutValue : theme?.cellInner }
                ${justifyClass[attribute.justify] || ''} ${bgColor} ${attribute.formatFn === 'title' ? 'capitalize' : ''} 
                ${attribute.wrapText ? theme.wrapText : ''}
                ${renderTextBox ? theme.cellEditableTextBox : ''}`;
    }, [
        attribute.openOut, attribute.justify, attribute.wrapText, attribute.formatFn,
        openOutTitle, renderTextBox, theme, bgColor
    ]);

    const cellClassName = useMemo(() => {
        if (attribute.openOut || openOutTitle) return '';
        return `${theme.cell} ${bgColor} ${isSelecting || isDragging ? 'select-none' : ''}`;
    }, [ attribute.openOut, openOutTitle, theme.cell, bgColor, isSelecting, isDragging ]);

    const cellStyle = useMemo(() => {
        if (attribute.openOut || openOutTitle) return undefined;

        return {
            width: attribute.size,
            ...(isSelected && !renderTextBox && {
                    borderWidth: '1px',
                    ...selectionEdgeClassNames[edge]
                })
        };
    }, [ attribute.openOut, openOutTitle, attribute.size, isSelected, renderTextBox, edge ]);

    const disableCellEvents = attribute.isLink || attribute.actionType;
    const cellEvents = useMemo(
        () =>
            disableCellEvents
                ? {}
                : {
                    onClick,
                    onMouseDown,
                    onMouseMove,
                    onMouseUp,
                    onDoubleClick
                },
        [disableCellEvents, onClick, onMouseDown, onMouseMove, onMouseUp, onDoubleClick]
    );

    const toggleOpenOut = useCallback(() => {
        setShowOpenOut(prev => !prev);
    }, []);

    const attributeProps = useMemo(() => attribute, [attribute]);

    const compValue = useMemo(() => {
        if (typeof value === 'object' && value?.hasOwnProperty('originalValue')) {
            return value.value;
        }
        return value;
    }, [value]);

    return (
        <div ref={cellRef}
             className={cellClassName}
             style={cellStyle}
             {...cellEvents}
        >
            {showOpenOutCaret ?
                <div className={theme.openOutIconWrapper}
                     onClick={toggleOpenOut}
                >
                    <Icon icon={'InfoCircle'}
                          title={'Hide Open Out'}
                          width={18} height={18}
                    />
                </div> : null}

            {attribute.openOut ?
                <span className={theme?.openOutHeader}>
                    {attribute.customName || attribute.display_name || attribute.name}
                </span> : null}

            <Comp key={`${attribute.name}-${index}`}
                          onClick={onClick}
                          autoFocus={isCellEditing}
                          className={compClassName}
                          style={compStyle}
                          {...attributeProps}
                          options={options}
                          meta={optionsMeta}
                          value={compValue}
                          row={newItem} // is this necessary other than attribute.type === 'ui'?
                          onChange={onChange}
                          hideControls={compType === 'lexical'}
            />
        </div>
    )
})

