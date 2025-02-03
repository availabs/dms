import React, {useContext, useEffect, useState} from "react";
import {Link} from "react-router-dom";
import DataTypes from "../../../../../../../data-types";
import {formatFunctions} from "../utils/utils";
import {ArrowDown, ArrowRight} from "../../../../../ui/icons";
import {SpreadSheetContext} from "../index";
import {isEqual} from "lodash-es";
import {RenderAction} from "./RenderActions";

const DisplayCalculatedCell = ({value, className}) => <div className={className}>{value}</div>
const stringifyIfObj = obj => typeof obj === "object" ? JSON.stringify(obj) : obj;
const LoadingComp = ({className}) => <div className={className}>loading...</div>

const LinkComp = ({attribute, columns, newItem, removeItem, value, Comp}) => {
    const {actionType, location, linkText, isLink} = attribute;

    if(isLink){
        return (props) => <Link {...props} to={`${location}${encodeURIComponent(value)}`} >{linkText || value}</Link>
    }

    if(actionType){
        return (props) => <RenderAction {...props} action={attribute} newItem={newItem} removeItem={removeItem} columns={columns} />
    }

    return Comp;
}

const validate = ({value, required, options, name}) => {
    const requiredValidation = !required || (required && value && value !== '')
    const optionsValidation = !options || !options?.length || (
        Array.isArray(options) && typeof value === "string" ? // select
            options.map(o => o.value || o).includes(value) :
            Array.isArray(options) && Array.isArray(value) ?  // multiselect
                value.reduce((acc, v) => acc && options.map(o => o.value || o).includes(v.value || v), true) :
                false
    );
    // if (!(requiredValidation && optionsValidation)) console.log('----', name, requiredValidation, optionsValidation, options, value)
    return requiredValidation && optionsValidation;
}

const frozenColClass = '' //'sticky left-0 z-10'
const colSpanClass = {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
    5: 'col-span-5',
    6: 'col-span-6',
    7: 'col-span-7',
    8: 'col-span-8',
    9: 'col-span-9',
    10: 'col-span-10',
    11: 'col-span-11',
}

export const RenderCell = ({
                               showOpenOutCaret, showOpenOut, setShowOpenOut,
                               attribute, colSpan,
                               i, item, updateItem, removeItem, onPaste,
                               isFrozen, isSelected, isSelecting, editing, edge, loading, allowEdit,
                               onClick, onDoubleClick, onMouseDown, onMouseMove, onMouseUp}) => {
    const {state: {columns, display}, setState} = useContext(SpreadSheetContext);
    const [newItem, setNewItem] = useState(item);
    // const Comp = DataTypes[attribute.type]?.[isSelecting ? 'ViewComp' : 'EditComp'];
    const Comp = loading ? LoadingComp : (DataTypes[attribute.type]?.[editing && allowEdit ? 'EditComp' : 'ViewComp'] || DisplayCalculatedCell);
    const CompWithLink = LinkComp({attribute, columns, newItem, removeItem, value: newItem[attribute.name], Comp});
    const justifyClass = {
        left: 'justify-start',
        right: 'justify-end',
        center: 'justify-center'
    }
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
        // send update to api
        if (!isEqual(newItem[attribute.name], item[attribute.name])){
            updateItem(undefined, undefined, newItem)
        }

    }, [newItem[attribute.name]]);
    const isValid = validate({
        value: newItem[attribute.name],
        options: attribute.options,
        required: attribute.required === "yes"
    });
    const isTotalRow = newItem.totalRow;
    const bgColor = !isValid ? `bg-red-50 hover:bg-red-100` : isTotalRow ? `bg-gray-100` :
                                display.striped && i % 2 !== 0 ? 'bg-gray-50 hover:bg-gray-100' :
                                    isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white bg-blue-50';
    return (
        <div
            className={`relative flex items-center min-h-[35px] 
            ${isFrozen ? frozenColClass : ''} ${isSelecting ? 'select-none' : ``}
            ${isSelected ? 'bg-blue-50' : 'bg-white'}
            ${attribute.openOut ? colSpanClass[colSpan] : ``}
            `}
            style={{
                ...!attribute.openOut && {width: attribute.size},
                ...isSelected && {borderWidth: '1px', ...selectionEdgeClassNames[edge]}
            }}
            onClick={attribute.isLink || attribute.actionType ? undefined : onClick}
            onMouseDown={attribute.isLink || attribute.actionType ? undefined : onMouseDown}
            onMouseMove={attribute.isLink || attribute.actionType ? undefined : onMouseMove}
            onMouseUp={attribute.isLink || attribute.actionType ? undefined : onMouseUp}
            onDoubleClick={attribute.isLink || attribute.actionType ? undefined : onDoubleClick}
            onPaste={onPaste}
        >
            {showOpenOutCaret ?
                <div className={'cursor-pointer'}>
                    {
                        showOpenOut ?
                            <ArrowDown className={'bg-transparent text-gray-500 group-hover:text-gray-600'}
                                       title={'Hide Open Out'}
                                       width={18} height={18}
                                       onClick={() => setShowOpenOut(false)}/> :
                            <ArrowRight className={'bg-transparent group-hover:text-gray-600'}
                                        title={'Show Open Out'}
                                        width={18} height={18}
                                        onClick={() => setShowOpenOut(true)}/>
                    }
                </div> : null}
            {attribute.openOut ? <span className={'font-semibold text-gray-600 px-2'}>{attribute.customName || attribute.display_name || attribute.name}</span> : null}
            <CompWithLink key={`${attribute.name}-${i}`}
                  onClick={onClick}
                  autoFocus={editing}
                  className={`
                  w-full min-h-full flex flex-wrap ${justifyClass[attribute.justify]} items-center truncate
                  ${bgColor}
                  ${attribute.type === 'multiselect' && newItem[attribute.name]?.length ? 'p-0.5' :
                      attribute.type === 'multiselect' && !newItem[attribute.name]?.length ? 'p-0.5' : 'p-0.5'
                  } 
                  `}
                // displayInvalidMsg={false}
                  {...attribute}
                  value={attribute.formatFn ? formatFunctions[attribute.formatFn](newItem[attribute.name], attribute.isDollar) : newItem[attribute.name]}
                  onChange={e => isTotalRow ? null : setNewItem({...newItem, [attribute.name]: e})}
                // onPaste={onPaste}
            />
        </div>
    )
}

