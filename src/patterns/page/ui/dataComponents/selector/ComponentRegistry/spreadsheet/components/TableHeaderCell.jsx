import React, {useCallback, useContext, useRef, useState} from "react";
import {ToggleControl} from "../../../dataWrapper/components/ToggleControl";
import {useHandleClickOutside} from "../../shared/utils";
import {ComponentContext} from "../../../dataWrapper";
import {Group, LeftToRightListBullet, TallyMark, Sum, ArrowDown, SortAsc, SortDesc} from "../../../../../icons";

const selectWrapperClass = 'group px-2 py-1 w-full flex items-center cursor-pointer hover:bg-gray-100'
const selectLabelClass = 'w-fit font-regular text-gray-500 cursor-default'
const selectClasses = 'w-full rounded-md bg-white group-hover:bg-gray-100 cursor-pointer'

// in header menu for each column
export default function TableHeaderCell({isEdit, attribute, context}) {
    const {state: {columns = [], display}, setState, controls = {}} = useContext(context || ComponentContext);
    if(!controls.inHeader?.length) return;

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = `menu-btn-${attribute.name}-in-header-column-controls`; // used to control isOpen on menu-btm click;
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const maxCardSpan = display.gridSize || columns.filter(({show, cardSpan}) => show).length;

    // updates column if present, else adds it with the change the user made.
    const updateColumns = useCallback((key, value, onChange, dataFetch) => setState(draft => {
        // update requested key
        const idx = columns.findIndex(column => column.name === attribute.name);
        if (idx !== -1) {
            draft.columns[idx][key] = value;
        }

        if(onChange){
            onChange({attribute, key, value, columnIdx: idx})
        }

        if(dataFetch && !draft.readyToLoad){
            draft.readyToLoad = true;
        }

    }), [columns, attribute]);

    const iconClass = 'text-gray-400';
    const iconSizes = {width: 14 , height: 14}
    const fnIcons = {
        count: <TallyMark key={'count-icon'} className={iconClass} {...iconSizes} />,
        list: <LeftToRightListBullet key={'list-icon'} className={iconClass} {...iconSizes} />,
        sum: <Sum key={'sum-icon'} className={iconClass} {...iconSizes} />,
    }

    return (
        <div key={attribute.normalName || attribute.name} className="relative w-full">
            <div id={menuBtnId}
                 key={'menu-btn'}
                 className={`group inline-flex items-center w-full justify-between gap-x-1.5 rounded-md cursor-pointer`}
                 onClick={e => setIsOpen(!isOpen)}>
                {
                    controls.header?.displayFn ? controls.header.displayFn(attribute) :
                        (
                            <span key={`${attribute.normalName || attribute.name}-name`} className={'truncate select-none'}
                                  title={attribute.customName || attribute.display_name || attribute.name}>
                                {attribute.customName || attribute.display_name || attribute.name}
                            </span>
                        )
                }
                <div id={menuBtnId} className={'flex items-center'}>
                    {/*/!*<InfoCircle width={16} height={16} className={'text-gray-500'} />*!/ needs a lexical modal*/}
                    {
                        attribute.group ? <Group key={`group-${attribute.name}`} className={iconClass} {...iconSizes} /> :
                            attribute.fn ? fnIcons[attribute.fn] || attribute.fn : null
                    }
                    {
                        attribute.sort === 'asc nulls last' ? <SortAsc key={'sort-asc-icon'} className={iconClass} {...iconSizes} /> :
                            attribute.sort === 'desc nulls last' ? <SortDesc key={'sort-desc-icon'} className={iconClass} {...iconSizes} /> : null
                    }

                    <ArrowDown key={`arrow-down-${attribute.name}`}
                               id={menuBtnId}
                               className={'text-gray-400 group-hover:text-gray-600 transition ease-in-out duration-200'}/>
                </div>
            </div>

            <div ref={menuRef}
                 key={'menu'}
                 className={`min-w-[180px]
                 ${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} 
                 absolute right-0 z-[10] divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition`}
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
                                        <div key={`${attribute.normalName || attribute.name}-${key}`} className={selectWrapperClass}>
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
                                                    <input
                                                        className={selectClasses}
                                                        type={inputType}
                                                        value={attribute[key]}
                                                        onChange={e => updateColumns(key, e.target.value, onChange, dataFetch)}
                                                    />
                                                </div> :
                                            typeof type === 'function' ? type({value: attribute[key], setValue: newValue => updateColumns(key, newValue, onChange, dataFetch)}) :
                                                `${type} not available`
                                )
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}
