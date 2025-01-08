import RenderSwitch from "./Switch";
import React, {useEffect, useRef, useState} from "react";
import {ArrowDown} from "../../../../ui/icons";
import {cloneDeep} from "lodash-es";

export default function RenderColumnControls({
    attributes=[], setAttributes,
    visibleAttributes=[], setVisibleAttributes,
    customColNames={}, setCustomColNames,
    notNull=[], setNotNull,
    fn={}, setFn,
    openOutCols=[], setOpenOutCols,
    filters=[], setFilters,
    groupBy=[], setGroupBy
}) {
    if(!setAttributes || !setVisibleAttributes) return;
    const dragItem = useRef();
    const dragOverItem = useRef();
    const menuRef = useRef(null);
    const [search, setSearch] = useState();
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-column-controls'; // used to control isOpen on menu-btm click;

    const controlsToShow = [
        {
            label: 'Column'
        }
    ]
    // ================================================== group by updates start =======================================
    useEffect(() => {
        // when entering/exiting group by mode, columns need to have appropriate fns applied.

        if(!attributes.length) return; // attributes are not immediately available

        if(groupBy.length){
            // add fns
            const newFns = visibleAttributes
                .map(va => attributes.find(a => a.name === va))
                .filter(a => a && !groupBy.includes(a.name)) // grouped columns need not have fns
                .reduce((acc, a) => ({...acc, [a.name]: fn[a.name] || a.defaultFn || 'list'}) , {});

            setFn(newFns);
        }
        // else if(!groupBy.length && Object.keys(fn).length){
        //     // remove fns
        //     setFn({});
        // }
    }, [attributes, visibleAttributes, groupBy]);
    // ================================================== group by updates end =========================================

    // ================================================== drag utils start =============================================
    const dragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = "move";
    };

    const dragEnter = (e, position) => {
        dragOverItem.current = position;
    };
    const dragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const drop = (e) => {
        const copyListItems =
            [
                ...visibleAttributes.map(va => attributes.find(attr => attr.name === va)),
                ...attributes.filter(attr => !visibleAttributes.includes(attr.name))
            ];
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setAttributes(copyListItems);
        setVisibleAttributes(copyListItems.filter(attr => visibleAttributes.includes(attr.name)).map(attr => attr.name))
    };
    // ================================================== drag utils end ===============================================

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
    const gridClass = 'grid grid-cols-7'
    const gridTemplateColumns = '10rem 5rem 5rem 5rem 5rem 5rem 5rem';
    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                     className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular 
                     text-gray-900 shadow-sm ring-1 ring-inset ${visibleAttributes?.length ? `ring-blue-300` : `ring-gray-300`} 
                     ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                     onClick={e => setIsOpen(!isOpen)}>
                    Columns <ArrowDown height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-[45rem] origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >
                <input className={'px-4 py-1 w-full text-xs rounded-md'} placeholder={'search...'}
                       onChange={e => {
                           setSearch(e.target.value)
                       }}/>

                <div className="py-1">
                    <div key={'header'}
                         className="flex items-center px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                        <div className={'h-4 w-4 m-1 text-gray-800'}>
                            <svg data-v-4e778f45=""
                                 className="nc-icon cursor-move !h-3.75 text-gray-600 mr-1"
                                 viewBox="0 0 24 24" width="1.2em" height="1.2em">
                                <path fill="currentColor"
                                      d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                            </svg>
                        </div>

                        <div className={`${gridClass} gap-0.5 m-1 w-full cursor-pointer`}
                             style={{gridTemplateColumns}}
                        >
                            <div className={'place-self-stretch'}>
                                Column
                            </div>
                            <div
                                className={'px-1 w-fit rounded-md text-center'}>
                                Fn
                            </div>
                            <div
                                className={'px-1 w-fit rounded-md text-center'}>
                                N/A
                            </div>
                            <div className={'justify-self-end'}>
                                Show
                            </div>

                            <div className={'justify-self-end'}>
                                Open Out
                            </div>

                            <div className={'justify-self-end'}>
                                Filter
                            </div>

                            <div className={'justify-self-end'}>
                                Group
                            </div>
                        </div>
                    </div>
                </div>

                <div className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    {
                        attributes
                            .filter(a => a && (!search || (a.display_name || a.name).toLowerCase().includes(search.toLowerCase())))
                            .map((attribute, i) => (
                                <div
                                    key={i}
                                    className="flex items-center px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                    onDragStart={(e) => dragStart(e, i)}
                                    onDragEnter={(e) => dragEnter(e, i)}

                                    onDragOver={dragOver}

                                    onDragEnd={drop}
                                    draggable
                                >
                                    <div className={'h-4 w-4 m-1 text-gray-800'}>
                                        <svg data-v-4e778f45=""
                                             className="nc-icon cursor-move !h-3.75 text-gray-600 mr-1"
                                             viewBox="0 0 24 24" width="1.2em" height="1.2em">
                                            <path fill="currentColor"
                                                  d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                                        </svg>
                                    </div>

                                    <div className={`${gridClass} gap-0.5 m-1 w-full cursor-pointer`}
                                         style={{gridTemplateColumns}}
                                    >
                                        {/*if custom column names are allowed*/}
                                        {
                                            setCustomColNames ?
                                                <input className={'place-self-stretch'}
                                                       value={customColNames[attribute.name] || attribute.display_name || attribute.name}
                                                       onChange={e => setCustomColNames({
                                                           ...customColNames,
                                                           [attribute.name]: e.target.value
                                                       })}
                                                /> :
                                                <label className={'place-self-stretch'}>
                                                    {customColNames[attribute.name] || attribute.display_name || attribute.name}
                                                </label>
                                        }

                                        <select
                                            className={
                                                groupBy?.includes(attribute.name) || !visibleAttributes.includes(attribute.name) || !setFn ?
                                                    'invisible' :
                                                    'appearance-none w-fit rounded-md bg-gray-100 h-fit text-center'
                                            }
                                            value={fn[attribute.name]}
                                            onClick={e => {
                                                if (!e.target.value) {
                                                    const newFn = cloneDeep(fn);
                                                    delete newFn[attribute.name];
                                                    setFn(newFn)
                                                } else {
                                                    setFn({...fn, [attribute.name]: e.target.value})
                                                }
                                            }}
                                        >
                                            <option key={'fn'} value={undefined}>fn</option>
                                            {
                                                ['list', 'sum', 'count']
                                                    .map(fnOption => <option key={fnOption}
                                                                             value={fnOption}>{fnOption}</option>)
                                            }
                                        </select>

                                        <select
                                            className={
                                                !visibleAttributes.includes(attribute.name) || !setNotNull ?
                                                    'invisible' :
                                                    'appearance-none px-1 w-fit rounded-md bg-gray-100 h-fit text-center'
                                            }
                                            value={notNull.includes(attribute.name)}
                                            onChange={e => setNotNull(e.target.value === 'true' ? [...notNull, attribute.name] : notNull.filter(c => c !== attribute.name))}
                                        >
                                            {
                                                [{label: 'include n/a', value: false}, {
                                                    label: 'exclude n/a',
                                                    value: true
                                                }]
                                                    .map(({label, value}) => <option key={label}
                                                                                     value={value}>{label}</option>)
                                            }
                                        </select>
                                        <div className={'justify-self-end'}>
                                            <RenderSwitch
                                                size={'small'}
                                                id={attribute.name}
                                                enabled={visibleAttributes.includes(attribute.name)}
                                                setEnabled={(value) => value ? setVisibleAttributes([...visibleAttributes, attribute.name]) :
                                                    setVisibleAttributes(visibleAttributes.filter(attr => attr !== attribute.name))}
                                            />
                                        </div>

                                        <div className={'justify-self-end'}>
                                            <RenderSwitch
                                                size={'small'}
                                                id={attribute.name}
                                                enabled={openOutCols.includes(attribute.name)}
                                                setEnabled={(value) => value ? setOpenOutCols([...openOutCols, attribute.name]) :
                                                    setOpenOutCols(openOutCols.filter(attr => attr !== attribute.name))}
                                            />
                                        </div>

                                        <div className={'justify-self-end'}>
                                            <RenderSwitch
                                                size={'small'}
                                                id={attribute.name}
                                                enabled={filters.find(f => f.column === attribute.name) ? true : false}
                                                setEnabled={(value) => {
                                                    const newFilters = value ?
                                                        [...filters, {column: attribute.name}] :
                                                        filters.filter(attr => attr.column !== attribute.name);
                                                    setFilters(newFilters);
                                                }}
                                            />
                                        </div>

                                        <div className={'justify-self-end'}>
                                            <RenderSwitch
                                                size={'small'}
                                                id={attribute.name}
                                                enabled={groupBy.find(f => f === attribute.name) ? true : false}
                                                setEnabled={(value) => {
                                                    const newGroups = value ?
                                                        [...groupBy, attribute.name] :
                                                        groupBy.filter(attr => attr !== attribute.name);
                                                    setGroupBy(newGroups);
                                                    if(!groupBy.length) setFn && setFn({});
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))
                    }
                </div>
            </div>
        </div>
    )
}
