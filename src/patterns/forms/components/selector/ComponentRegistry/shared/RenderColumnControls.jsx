import RenderSwitch from "./Switch";
import React, {useCallback, useContext, useEffect, useRef, useState} from "react";
import {ArrowDown, RestoreBin} from "../../../../ui/icons";
import {cloneDeep} from "lodash-es";
import {SpreadSheetContext} from "../spreadsheet";
import {useHandleClickOutside} from "./utils";
// todo don't allow editing action columns unless they are data action columns (action that uses column data: aka linkCol)
export default function RenderColumnControls({
    allowCustomColNames= true,
    allowFnSelector=true,
    allowExcludeNASelector= true,
    allowShowToggle=true,
    allowFilterToggle=true,
    allowGroupToggle=true,
    allowOpenOutToggle=true,
                                             }) {
    const {state: {columns=[], sourceInfo}, setState} = useContext(SpreadSheetContext);
    const dragItem = useRef();
    const dragOverItem = useRef();
    const menuRef = useRef(null);
    const [search, setSearch] = useState();
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-column-controls'; // used to control isOpen on menu-btm click;
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));
    const columnsToRender =
        (sourceInfo?.columns || [])
            .map(attribute => columns.find(c => c.name === attribute.name) || attribute) // map to current settings
            .sort((a,b) => {
                const orderA = columns.findIndex(column => column.name === a.Name);
                const orderB = columns.findIndex(column => column.name === b.Name);
                return orderA - orderB;
            })
            .filter(attribute => (
                !search ||
                (attribute.customName || attribute.display_name || attribute.name).toLowerCase().includes(search.toLowerCase()))
            )

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
        const copyListItems = cloneDeep(sourceInfo.columns);
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setState(draft => {
            // map original columns to columns with settings, and then filter out extra columns.
            draft.columns = copyListItems.map(originalColumn => columns.find(colWithSettings => colWithSettings.name === originalColumn.name)).filter(c => c);
            draft.sourceInfo.columns = copyListItems;
        })
    };
    // ================================================== drag utils end ===============================================

    // updates column if present, else adds it with the change the user made.
    const updateColumns = useCallback((originalAttribute, key, value) => setState(draft => {
        // update requested key
        const idx = columns.findIndex(column => column.name === originalAttribute.name);
        if (idx !== -1) {
            draft.columns[idx][key] = value;
        }else{
            draft.columns.push({...originalAttribute, [key]: value});
        }
        // update dependent keys
        if(key === 'show' && value === false){
            // stop sorting when column is not visible
            draft.columns[idx]['sort'] = undefined;
        }

        if(key === 'group' && value === true){
            // make sure other visible columns have a fn
            const idxWithInvalidFn =
                columns.filter(c => c.name !== originalAttribute.name && !c.groupBy && !c.fn)
                    .map(c => columns.findIndex(column => column.name === c.name));

            idxWithInvalidFn.forEach(idx => draft.columns[idx]['fn'] = draft.columns[idx].defaultFn || 'list');
        }
    }), [columns]);

    // removes it from the columns array if present
    const resetColumn = useCallback((originalAttribute) => setState(draft => {
        const idx = columns.findIndex(column => column.name === originalAttribute.name);
        if (idx !== -1) {
            draft.columns.splice(idx, 1);
        }
    }), [columns]);

    const gridClass = 'grid grid-cols-9'
    const gridTemplateColumns = '10rem 5rem 5rem 5rem 5rem 5rem 5rem 5rem 3rem';
    return (
        <div className="relative inline-block text-left">
            <button id={menuBtnId}
                 className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular 
                 text-gray-900 shadow-sm ring-1 ring-inset ${columns?.length ? `ring-blue-300` : `ring-gray-300`} 
                 ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                 onClick={() => {
                     setIsOpen(!isOpen);
                     setSearch(undefined);
                 }}>
                Columns <ArrowDown id={menuBtnId} height={18} width={18} className={'mt-1'}/>
            </button>
            <div ref={menuRef}
                 role="menu"
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-[53rem] origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
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

                        <div className={`${gridClass} gap-0.5 m-1 w-full`}
                             style={{gridTemplateColumns}}
                        >
                            <div className={'place-self-stretch'}>Column</div>
                            <div className={'px-1 w-fit rounded-md text-center'}>Fn</div>
                            <div className={'px-1 w-fit rounded-md text-center'}>Exclude N/A</div>
                            <div className={'justify-self-end'}>Show</div>
                            <div className={'justify-self-end'}>Open Out</div>
                            <div className={'justify-self-end'}>Int Filter</div>
                            <div className={'justify-self-end'}>Ext Filter</div>
                            <div className={'justify-self-end'}>Group</div>
                            <div className={'justify-self-end'}>Reset</div>
                        </div>
                    </div>
                </div>

                <div className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    {
                        columnsToRender
                            .map((attribute, i) => (
                                <div
                                    key={attribute.name}
                                    className="flex items-center px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                    onDragStart={(e) => dragStart(e, i)}
                                    onDragEnter={(e) => dragEnter(e, i)}

                                    onDragOver={dragOver}

                                    onDragEnd={drop}
                                    draggable={attribute.show}
                                >
                                    <div className={'h-4 w-4 m-1 text-gray-800'}>
                                        <svg data-v-4e778f45=""
                                             className="nc-icon cursor-move !h-3.75 text-gray-600 mr-1"
                                             viewBox="0 0 24 24" width="1.2em" height="1.2em">
                                            <path fill="currentColor"
                                                  d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                                        </svg>
                                    </div>

                                    <div className={`${gridClass} gap-0.5 m-1 w-full`}
                                         style={{gridTemplateColumns}}
                                    >
                                        {/*if custom column names are allowed*/}
                                        {
                                            allowCustomColNames ?
                                                <input className={'place-self-stretch'}
                                                       value={attribute.customName || attribute.display_name || attribute.name}
                                                       onChange={e => updateColumns(attribute, 'customName', e.target.value)}
                                                /> :
                                                <label className={'place-self-stretch'}>
                                                    {attribute.customName || attribute.display_name || attribute.name}
                                                </label>
                                        }

                                        {
                                            allowFnSelector ?
                                                <select
                                                    key={attribute.fn}
                                                    className={'appearance-none w-fit rounded-md bg-gray-100 h-fit text-center cursor-pointer'}
                                                    value={attribute.fn}
                                                    onChange={e => updateColumns(attribute, 'fn', e.target.value)}
                                                >
                                                    <option key={'fn'} value={''}>fn</option>
                                                    {
                                                        ['list', 'sum', 'count']
                                                            .map(fnOption => <option key={fnOption}
                                                                                     value={fnOption}>{fnOption}</option>)
                                                    }
                                                </select> : null
                                        }

                                        {
                                            allowExcludeNASelector ?
                                                <select
                                                    key={attribute.excludeNA}
                                                    className={'appearance-none px-1 w-fit rounded-md bg-gray-100 h-fit text-center cursor-pointer'}
                                                    value={attribute.excludeNA}
                                                    onChange={e => updateColumns(attribute, 'excludeNA', e.target.value)}
                                                >
                                                    {
                                                        [{label: 'include n/a', value: false}, {label: 'exclude n/a', value: true}]
                                                            .map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                                    }
                                                </select> : null
                                        }

                                        {
                                            allowShowToggle ?
                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={attribute.show}
                                                        setEnabled={(value) => updateColumns(attribute, 'show', value)}
                                                    />
                                                </div> : null
                                        }

                                        {
                                            allowOpenOutToggle ?
                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={attribute.openOut}
                                                        setEnabled={(value) => updateColumns(attribute, 'openOut', value)}
                                                    />
                                                </div> : null
                                        }

                                        {
                                            allowFilterToggle ?
                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={Array.isArray(attribute.internalFilter)}
                                                        setEnabled={(value) => updateColumns(attribute, 'internalFilter', value ? [] : undefined)}
                                                    />
                                                </div> : null
                                        }

                                        {
                                            allowFilterToggle ?
                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={Array.isArray(attribute.externalFilter)}
                                                        setEnabled={(value) => updateColumns(attribute, 'externalFilter', value ? [] : undefined)}
                                                    />
                                                </div> : null
                                        }

                                        {
                                            allowGroupToggle ?
                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={attribute.group}
                                                        setEnabled={(value) => updateColumns(attribute, 'group', value)}
                                                    />
                                                </div> : null
                                        }

                                        <button className={'w-fit place-self-end'} onClick={() => resetColumn(attribute)}>
                                            <RestoreBin className={'text-orange-500 hover:text-orange-700'} />
                                        </button>
                                    </div>
                                </div>
                            ))
                    }
                </div>
            </div>
        </div>
    )
}
