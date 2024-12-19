import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import RenderSwitch from "../../shared/Switch";
import React, {useRef, useState} from "react";
import {ArrowDown, SortAsc, SortDesc} from "../../../../../../admin/ui/icons";

// not sorted by -- sorted asc -- sorted desc
// no format applied -- comma seperated -- abbreviated
// right justified -- left justified
// small fonts -- medium fonts -- large fonts
// in header menu for each column
export default function RenderInHeaderColumnControls({
    attribute, customColName, isEdit,
    orderBy, setOrderBy,
    filters, setFilters,
    colJustify, setColJustify,
    format,
}) {
    const dragItem = useRef();
    const dragOverItem = useRef();
    const menuRef = useRef(null);
    const [search, setSearch] = useState();
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = `menu-btn-${attribute.name}-in-header-column-controls`; // used to control isOpen on menu-btm click;

    // ================================================== close on outside click start =================================
    const handleClickOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target) && e.target.id !== menuBtnId) {
            setIsOpen(false);
        }
    };

    React.useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    // ================================================== close on outside click end ===================================

    const sortOptions = [
        {
            label: 'Sorted A->Z',
            value: 'asc nulls last',
            action: () => setOrderBy({[attribute.name]: 'asc nulls last', ...format.isDms && {id: 'asc'}})
        },
        {
            label: 'Sorted Z->A',
            value: 'desc nulls last',
            action: () => setOrderBy({[attribute.name]: 'desc nulls last', ...format.isDms && {id: 'desc'}})
        },
        {
            label: orderBy[attribute.name] ? 'Clear Sort' : 'Not Sorted By',
            value: 'default',
            action: () => setOrderBy({})
        },
    ];


    const formatOptions = [
        {label: 'No Format Applied', value: ' '},
        {label: 'Comma Seperated', value: 'comma'},
        {label: 'Abbreviated', value: 'abbreviate'},
    ]

    const justifyOptions = [
        {label: 'Left Justified', value: 'left'},
        {label: 'Centered', value: 'center'},
        {label: 'Right Justified', value: 'right'}
    ]

    const fontSizeOptions = [
        {label: 'Small Fonts', value: 'small'},
        {label: 'Medium Fonts', value: 'medium'},
        {label: 'Large Fonts', value: 'large'}
    ]

    const actions = [
        {
            label: filters.find(f => f.column === attribute.name) ? 'Remove Filter' : 'Add Filter',
            action: () => setFilters(filters.find(f => f.column === attribute.name) ?
                filters.filter(f => f.column !== attribute.name) :
                [...filters, {column: attribute.name}])
        }
    ]
    const selectClasses = 'p-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'
    return (
        <div className="relative w-full">
            <div id={menuBtnId}
                 className={`group inline-flex items-center w-full justify-between gap-x-1.5 rounded-md px-3 py-1 text-sm font-semibold text-gray-600 cursor-pointer`}
                 onClick={e => setIsOpen(!isOpen)}>
                {customColName || attribute.display_name || attribute.name}
                <div id={'col-icons'} className={'flex items-center'}>
                    {orderBy[attribute.name] === 'asc nulls last' ? <SortAsc className={'text-gray-500'}/> :
                        orderBy[attribute.name] === 'desc nulls last' ? <SortDesc className={'text-gray-500'}/> : null}
                    <ArrowDown className={'text-gray-500 group-hover:text-gray-600'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`
                 ${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} 
                 absolute right-0 z-10 divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition`}
            >
                <div className="py-0.5 w-1/2 min-w-fit max-h-[500px] overflow-auto scrollbar-sm">
                    <div className="flex flex-col gap-0.5 items-center px-1 py-1 text-xs text-gray-700">
                        <div className={'w-full cursor-pointer'}>
                            <select
                                className={selectClasses}
                                value={orderBy[attribute.name] || 'default'}
                                onChange={e => {

                                    const action = sortOptions.find(o => o.value === e.target.value || o.value === 'default')?.action;
                                    action();
                                }}
                            >
                                {
                                    sortOptions
                                        .map(sortOption => <option key={sortOption.value} value={sortOption.value}>{sortOption.label}</option>)
                                }
                            </select>
                        </div>

                        <div className={'w-full cursor-pointer'}>
                            <select
                                className={selectClasses}
                                value={''}
                                onChange={e => {}}
                            >
                                {
                                    formatOptions
                                        .map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                }
                            </select>
                        </div>

                        <div className={setColJustify ? 'w-full cursor-pointer' : 'hidden'}>
                            <select
                                className={selectClasses}
                                value={colJustify[attribute.name]}
                                onChange={e => setColJustify({...colJustify, [attribute.name]: e.target.value})}
                            >
                                {
                                    justifyOptions
                                        .map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                }
                            </select>
                        </div>

                        <div className={'w-full cursor-pointer'}>
                            <select
                                className={selectClasses}
                                value={''}
                                onChange={e => {}}
                            >
                                {
                                    fontSizeOptions
                                        .map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                }
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
