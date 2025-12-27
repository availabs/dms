import React, {memo, useCallback, useEffect, useRef, useState} from "react";
import Icon from "../../Icon";
import Switch from "../../Switch";
import Popup from "../../Popup";

const selectWrapperClass = 'group px-2 py-1 w-full flex items-center cursor-pointer hover:bg-gray-100'
const selectLabelClass = 'w-fit font-regular text-gray-500 cursor-default'
const selectClasses = 'w-full rounded-md bg-white group-hover:bg-gray-100 cursor-pointer'

const getColIdName = col => col.normalName || col.name;
const Noop = () => {};
const ToggleControl = ({value, setValue, title, className}) => {
    return setValue ? (
        <div>
            <div
                className={className || `inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular 
                text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}
                onClick={() => setValue(!value)}
            >
                <span className={'flex-1 select-none mr-1'}>{title}</span>
                <Switch
                    size={'small'}
                    enabled={value}
                    setEnabled={() => {
                    }}
                />
            </div>
        </div>
    ) : null;
}

const InputControl = ({updateColumns, inputType, value='', attributeKey, onChange, dataFetch}) => {
    const [tmpValue, setTmpValue] = useState(value);

    useEffect(() => {
        const timeOutId = setTimeout(() => {
            if(value !== tmpValue) updateColumns(attributeKey, tmpValue, onChange, dataFetch)
        }, 300);

        return () => clearTimeout(timeOutId);
    }, [tmpValue]);

    return (
        <input
            className={selectClasses}
            type={inputType}
            value={tmpValue}
            onChange={e => setTmpValue(e.target.value)}
        />
    )
}
// in header menu for each column
export default memo(function TableHeaderCell({isEdit, attribute, columns, display, controls, setState=Noop}) {
    const [open, setOpen] = useState(false);
    const colIdName = getColIdName(attribute);

    // updates column if present, else adds it with the change the user made.
    const updateColumns = useCallback((key, value, onChange, dataFetch) => setState(draft => {
        // update requested key
        const idx = columns.findIndex(column => getColIdName(column) === colIdName);
        if (idx !== -1) {
            if(key){
                draft.columns[idx][key] = value;
            }else{
                draft.columns[idx] = {...(draft.columns[idx] || {}), ...(value || {})}
            }
        }

        if(onChange){
            onChange({attribute, key, value, columnIdx: idx})
        }

        if(dataFetch && !draft.display.readyToLoad){
            draft.display.readyToLoad = true;
        }

    }), [columns, attribute]);

    const iconClass = 'text-gray-400';
    const iconSizes = {width: 14 , height: 14}
    const fnIcons = {
        count: <Icon icon={'TallyMark'} key={'count-icon'} className={iconClass} {...iconSizes} />,
        list: <Icon icon={'LeftToRightListBullet'} key={'list-icon'} className={iconClass} {...iconSizes} />,
        sum: <Icon icon={'Sum'} key={'sum-icon'} className={iconClass} {...iconSizes} />,
        avg: <Icon icon={'Avg'} key={'sum-icon'} className={iconClass} {...iconSizes} />,
    }

    return (
        <div key={colIdName} className="relative w-full">
            <Popup button={
                <div key={'menu-btn'}
                     className={`group inline-flex items-center w-full justify-between gap-x-1.5 rounded-md cursor-pointer ${display.columnSelection?.includes(colIdName) ? `bg-gray-300` : ``}`}
                     onClick={e => {
                         if(e.ctrlKey){
                             setState(draft => {
                                 const existingSelection = draft.display.columnSelection || [];
                                 draft.display.columnSelection = existingSelection.includes(colIdName) ? existingSelection.filter(name => name !== colIdName) : [...existingSelection, colIdName]
                             })
                         }else {
                             setState(draft => {
                                 draft.display.columnSelection = undefined;
                             })
                             setOpen(!open)
                         }
                     }}
                >
                    {
                        controls.header?.displayFn ? controls.header.displayFn(attribute) :
                            (
                                <span key={`${colIdName}-name`} className={`truncate select-none ${attribute.wrapHeader ? `whitespace-pre-wrap` : ``}`}
                                      title={attribute.customName || attribute.display_name || colIdName}>
                                {attribute.customName || attribute.display_name || colIdName}
                            </span>
                            )
                    }
                    <div className={'flex items-center'}>
                        {/*/!*<InfoCircle width={16} height={16} className={'text-gray-500'} />*!/ needs a lexical modal*/}
                        {
                            attribute.group ? <Icon icon={'Group'} key={`group-${colIdName}`} className={iconClass} {...iconSizes} /> :
                                attribute.fn ? fnIcons[attribute.fn] || attribute.fn : null
                        }
                        {
                            attribute.sort === 'asc nulls last' ? <Icon icon={'SortAsc'} key={'sort-asc-icon'} className={iconClass} {...iconSizes} /> :
                                attribute.sort === 'desc nulls last' ? <Icon icon={'SortDesc'} key={'sort-desc-icon'} className={iconClass} {...iconSizes} /> : null
                        }

                        <Icon icon={'ArrowDown'} key={`arrow-down-${colIdName}`}
                              className={'text-gray-400 group-hover:text-gray-600 transition ease-in-out duration-200 print:hidden'}/>
                    </div>
                </div>
            }>
                {
                    ({open, setOpen}) =>
                        controls?.inHeader?.length ? (
                            <div key={'menu'}
                                 className={`min-w-[180px]
                 ${open ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} 
                 z-[10] divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition`}
                            >
                                <div className="py-0.5 min-w-fit max-h-[500px] overflow-auto scrollbar-sm">
                                    <div className="flex flex-col gap-0.5 items-center px-1 py-1 text-xs text-gray-600 font-regular">
                                        {
                                            controls.inHeader
                                                .filter(({displayCdn}) =>
                                                    typeof displayCdn === 'function' ? displayCdn({attribute, display, isEdit}) :
                                                        typeof displayCdn === 'boolean' ? displayCdn : true)
                                                .map(({type, inputType, label, key, dataFetch, options, onChange}) =>
                                                    type === 'select' ?
                                                        <div key={`${colIdName}-${key}`} className={selectWrapperClass}>
                                                            <label className={selectLabelClass}>{label}</label>
                                                            <select
                                                                className={selectClasses}
                                                                value={attribute[key]}
                                                                onChange={e => updateColumns(key, e.target.value, onChange, dataFetch)}
                                                            >
                                                                {
                                                                    options.map(({label, value}) => <option key={value} value={value}>{label}</option>)
                                                                }
                                                            </select>
                                                        </div> :
                                                        type === 'toggle' ?
                                                            <div className={'px-2 py-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'}>
                                                                <ToggleControl
                                                                    className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer ${selectLabelClass}`}
                                                                    title={label}
                                                                    value={attribute[key]}
                                                                    setValue={e => updateColumns(key, e, onChange, dataFetch)}
                                                                />
                                                            </div> :
                                                            type === 'input' ?
                                                                <div className={selectWrapperClass}>
                                                                    <label className={selectLabelClass}>{label}</label>
                                                                    <InputControl
                                                                        inputType={inputType}
                                                                        value={attribute[key]}
                                                                        updateColumns={updateColumns}
                                                                        attributeKey={key}
                                                                        dataFetch={dataFetch}
                                                                    />
                                                                </div> :
                                                                typeof type === 'function' ?
                                                                    type({
                                                                        value: attribute[key],
                                                                        setValue: newValue => updateColumns(key, newValue, onChange, dataFetch),
                                                                        attribute,
                                                                        setAttribute: newValue => updateColumns(undefined, newValue, onChange, dataFetch)
                                                                    }) :
                                                                    `${type} not available`
                                                )
                                        }
                                    </div>
                                </div>
                            </div>
                        ) : null
                }
            </Popup>
        </div>
    )
})
