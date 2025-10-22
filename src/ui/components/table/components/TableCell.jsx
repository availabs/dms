import React, {useEffect, useState} from "react";
import {Link} from "react-router";
import {isEqual} from "lodash-es";
import Icon from "../../Icon";
import DataTypes from "../../../columnTypes";
import {formatFunctions} from "../../../../patterns/page/components/selector/dataWrapper/utils/utils";
import { RenderAction } from "./RenderActions";

const parseIfJson = strValue => {
    if (typeof strValue === 'object') return strValue;

    try {
        return JSON.parse(strValue)
    }catch (e){
        return {}
    }
}

const DisplayCalculatedCell = ({value, className}) => <div className={className}>{typeof value === 'object' ? JSON.stringify(value) : value}</div>
const LoadingComp = ({className}) => <div className={className}>loading...</div>

const LinkComp = ({attribute, columns, newItem, removeItem, value, Comp}) => {
    const {actionType, location, linkText, isLink, isLinkExternal, useId} = attribute;
    // isLink:
        // linkText
        // location (optional)
        // searchParams: none|value|id
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
        return (props) => <a {...props} href={url} {...isLinkExternal && {target:"_blank"}} >{linkText || valueFormattedForDisplay}</a>
    }

    if(actionType){
        return (props) => <RenderAction {...props} action={attribute} newItem={newItem} removeItem={removeItem} columns={columns} />
    }

    return Comp;
}

const validate = ({value, required, options, name}) => {
    const requiredValidation = !required || (required && value && value !== '')
    const optionsValidation = !options || !options?.length || (
        Array.isArray(options) && !value && !required ? true : // blank value with not required condition
        Array.isArray(options) && (typeof value === "string" || typeof value === "boolean") ? // select
            options.map(o => o.value || o).includes(value.toString()) :
            Array.isArray(options) && typeof value === 'number' ? //select
                options.map(o => o.value || o).includes(value) :
                Array.isArray(options) && Array.isArray(value) ?  // multiselect
                    value.reduce((acc, v) => acc && options.map(o => o.value || o).includes(v?.value || v), true) :
                    false
    );
    // if (!(requiredValidation && optionsValidation)) console.log('----', name, requiredValidation, optionsValidation, options, value)
    return requiredValidation && optionsValidation;
}

export const TableCell = ({
    isTotalCell, columns, display, theme,
    showOpenOutCaret, showOpenOut, setShowOpenOut,
    attribute, openOutTitle,
    i, item, updateItem, removeItem, onPaste,
    isFrozen, isSelected, isSelecting, editing, edge, loading, allowEdit,
    onClick, onDoubleClick, onMouseDown, onMouseMove, onMouseUp
}) => {
    //const { theme = {table: tableTheme}} =  = React.useContext(ThemeContext) || {}
    const [newItem, setNewItem] = useState(item);
    const rawValue = newItem[attribute.normalName] || newItem[attribute.name]
    // const Comp = DataTypes[attribute.type]?.[isSelecting ? 'ViewComp' : 'EditComp'];
    const renderTextBox = attribute.type === 'text' && editing && allowEdit;
    const compType = attribute.type === 'calculated' && Array.isArray(rawValue) ? 'multiselect' : attribute.type;
    const compMode = attribute.type === 'calculated' && Array.isArray(rawValue) ? 'ViewComp' :
                            editing && allowEdit ? 'EditComp' : 'ViewComp';
    const Comp = loading ? LoadingComp : compType === 'ui' ? (attribute.Comp || DisplayCalculatedCell) :
        renderTextBox ? DataTypes.textarea.EditComp : (DataTypes[compType]?.[compMode] || DisplayCalculatedCell);
    const CompWithLink = LinkComp({attribute, columns, newItem, removeItem, value: rawValue, Comp});
    const value = isTotalCell && !(attribute.showTotal || display.showTotal) ? null :
        compMode === 'EditComp' ? rawValue : attribute.formatFn && formatFunctions[attribute.formatFn.toLowerCase()] ? formatFunctions[attribute.formatFn.toLowerCase()](rawValue, attribute.isDollar) : rawValue
    const justifyClass = {
        left: 'justify-start',
        right: 'justify-end',
        center: 'justify-center'
    }
    const formatClass = attribute.formatFn === 'title' ? 'capitalize' : '';

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
        if (!(editing && allowEdit)) return;

        const timeoutId = setTimeout(() => {
            if (!isEqual((rawValue?.originalValue || rawValue), item[attribute.name]) && updateItem) {
                updateItem(undefined, undefined, newItem);
            }
        }, 500);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [rawValue]);
    const isValid = ['multiselect', 'select', 'radio'].includes(attribute.type) || attribute.required === 'yes' ? validate({
        value: typeof rawValue === 'object' && rawValue?.hasOwnProperty('originalValue') ? rawValue.originalValue :
            typeof rawValue === 'object' && rawValue?.hasOwnProperty('value') ? rawValue.value :
                rawValue,
        options: attribute.options,
        required: attribute.required === "yes"
    }) : true;

    const options = ['select', 'multiselect'].includes(attribute.type) && (attribute.options || []).some(o => o.filter) ?
        attribute.options.filter(o => {
            const optionFilter = parseIfJson(o.filter);
            return Object.keys(optionFilter).reduce((acc, col) => {
                if (newItem[col] === undefined || newItem[col] === null) return false;
                return acc && optionFilter[col].includes(newItem[col].toString())
            }, true)
        }) :
        attribute.options;
    let optionsMeta;

    if(!parseIfJson(attribute.meta_lookup)?.view_id){
        optionsMeta = parseIfJson(attribute.meta_lookup)
    }

    const isTotalRow = newItem.totalRow;
    const bgColor = openOutTitle || attribute.openOut ? `` : !isValid ? `bg-red-50 hover:bg-red-100` : isTotalRow ? `bg-gray-100` :
                                display.striped && i % 2 !== 0 ? 'bg-gray-50 hover:bg-gray-100' :
                                    isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white bg-blue-50';

    return (
        <div
            className={attribute.openOut || openOutTitle ? `` : `
                ${theme?.table.cell} 
                ${isFrozen ? theme?.table?.cellFrozenCol : ''} 
                ${isSelecting ? 'select-none' : ``}
                ${!isValid ? bgColor : isSelected ? theme?.table.cellBgSelected : theme?.table.cellBg}
            `}
            style={{
                ...!(attribute.openOut || openOutTitle) && {width: attribute.size},
                ...isSelected && !renderTextBox && {borderWidth: '1px', ...selectionEdgeClassNames[edge]},
            }}
            onClick={attribute.isLink || attribute.actionType ? undefined : onClick}
            onMouseDown={attribute.isLink || attribute.actionType ? undefined : onMouseDown}
            onMouseMove={attribute.isLink || attribute.actionType ? undefined : onMouseMove}
            onMouseUp={attribute.isLink || attribute.actionType ? undefined : onMouseUp}
            onDoubleClick={attribute.isLink || attribute.actionType ? undefined : onDoubleClick}
            onPaste={onPaste}
        >
            {showOpenOutCaret ?
                <div className={'px-2 cursor-pointer'}
                     onClick={() => {
                         setShowOpenOut(!showOpenOut)
                     }}
                >
                    <Icon icon={'InfoCircle'} className={'bg-transparent text-gray-500 group-hover:text-gray-600'}
                               title={'Hide Open Out'}
                               width={18} height={18}
                    />
                </div> : null}
            {attribute.openOut ?
                <span className={theme?.table?.openOutHeader}>
                    {attribute.customName || attribute.display_name || attribute.name}
                </span> : null}
            <CompWithLink key={`${attribute.name}-${i}`}
                  onClick={onClick}
                  autoFocus={editing}
                  className={`
                    ${
                      openOutTitle ? theme?.table?.openOutTitle : 
                          attribute.openOut ? theme?.table?.openOutValue :
                              theme?.table?.cellInner
                  } 
                    ${justifyClass[attribute.justify]} 
                    ${bgColor}
                    ${
                      openOutTitle ? `` : 
                      attribute.type === 'multiselect' && rawValue?.length ? 'p-0.5' :
                          attribute.type === 'multiselect' && !rawValue?.length ? 'p-0.5' : 'p-0.5'
                  } 
                  ${formatClass}
                  ${attribute.wrapText || renderTextBox ? `whitespace-pre-wrap` : ``}
                  ${renderTextBox ? `absolute border focus:outline-none min-w-[180px] min-h-[50px] z-[10]` : ``}
                  `}
                          style={renderTextBox ? {borderColor: selectionColor} : undefined}
                  {...attribute}
                  options={options}
                  meta={optionsMeta}
                  value={typeof value === "object" && value?.hasOwnProperty('originalValue') ? value?.value : value}
                  row={newItem}
                  onChange={e => isTotalRow ? null : setNewItem({...newItem, [attribute.name]: e})}
            />
        </div>
    )
}

