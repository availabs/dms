import React, {useEffect, useState} from "react";
import {Link} from "react-router";
import {isEqual} from "lodash-es";
import Icon from "../../Icon";
import DataTypes from "../../../../data-types";
import {formatFunctions} from "../../../../patterns/page/components/selector/dataWrapper/utils/utils";
import { RenderAction } from "./RenderActions";
//import { ThemeContext } from '../../../useTheme'

const DisplayCalculatedCell = ({value, className}) => <div className={className}>{value}</div>
const LoadingComp = ({className}) => <div className={className}>loading...</div>

const LinkComp = ({attribute, columns, newItem, removeItem, value, Comp}) => {
    const {actionType, location, linkText, isLink, useId} = attribute;
    // isLink:
        // linkText
        // location (optional)
        // searchParams: none|value|id
    if(isLink){
        const valueFormattedForSearchParams = Array.isArray(value) ? value.join('|||') : value;
        const searchParams = attribute.searchParams === 'id' ? encodeURIComponent(newItem.id) : attribute.searchParams === 'value' ? encodeURIComponent(valueFormattedForSearchParams) : ``;
        const url = `${location || value}${searchParams}`;
        return (props) => <Link {...props} to={url} >{linkText || value}</Link>
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
            Array.isArray(options) && Array.isArray(value) ?  // multiselect
                value.reduce((acc, v) => acc && options.map(o => o.value || o).includes(v.value || v), true) :
                false
    );
    // if (!(requiredValidation && optionsValidation)) console.log('----', name, requiredValidation, optionsValidation, options, value)
    return requiredValidation && optionsValidation;
}

export const TableCell = ({
    columns, display, theme,
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
    const compType = attribute.type === 'calculated' && Array.isArray(rawValue) ? 'multiselect' : attribute.type;
    const compMode = attribute.type === 'calculated' && Array.isArray(rawValue) ? 'ViewComp' :
                            editing && allowEdit ? 'EditComp' : 'ViewComp';
    const Comp = loading ? LoadingComp : compType === 'ui' ? attribute.Comp : (DataTypes[compType]?.[compMode] || DisplayCalculatedCell);
    const CompWithLink = LinkComp({attribute, columns, newItem, removeItem, value: rawValue, Comp});
    const value = compMode === 'EditComp' ? rawValue : attribute.formatFn && formatFunctions[attribute.formatFn.toLowerCase()] ? formatFunctions[attribute.formatFn.toLowerCase()](rawValue, attribute.isDollar) : rawValue
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
            if (!isEqual(rawValue, item[attribute.name]) && updateItem) {
                updateItem(undefined, undefined, newItem);
            }
        }, 500);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [rawValue]);
    const isValid = ['multiselect', 'select', 'radio'].includes(attribute.type) || attribute.required === 'yes' ? validate({
        value: rawValue,
        options: attribute.options,
        required: attribute.required === "yes"
    }) : true;

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
                ...isSelected && {borderWidth: '1px', ...selectionEdgeClassNames[edge]},
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
                  `}
                  {...attribute}
                  value={value}
                  row={newItem}
                  onChange={e => isTotalRow ? null : setNewItem({...newItem, [attribute.name]: e})}
            />
        </div>
    )
}

