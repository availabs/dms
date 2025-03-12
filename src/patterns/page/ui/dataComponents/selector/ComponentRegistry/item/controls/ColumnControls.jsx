import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";

import {cloneDeep} from "lodash-es";
import {useHandleClickOutside} from "../../shared/utils";
import RenderSwitch from "../../../dataWrapper/components/Switch";
import {ArrowDown} from "../../../../../icons";
import {RestoreBin} from "../../../../../../../forms/ui/icons";

export default function ColumnControls({context}) {
    const {state: {columns=[], sourceInfo}, setState} = useContext(context);
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
    const updateColumns = useCallback((originalAttribute, key, value, onChange) => {
        setState(draft => {

            // ======================= default behaviour begin =================================
            let idx = draft.columns.findIndex(column => column.name === originalAttribute.name);

            if (idx === -1) {
                draft.columns.push({ ...originalAttribute, [key]: value });
                idx = draft.columns.length - 1; // new index
            } else {
                draft.columns[idx][key] = value;
            }
            // ======================= default behaviour end ==================================

            // special cases
            if (key === 'show' && value === false) {
                // stop sorting and applying fn when column is hidden
                draft.columns[idx].sort = undefined;
                draft.columns[idx].fn = undefined;
            } else if (key === 'show' && value === true && draft.columns.some(c => c.name !== originalAttribute.name && c.group)) {
                // apply fn if at least one column is grouped
                draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
            }

        });
    }, [setState]);

    const toggleGlobalVisibility = useCallback((show = true) => {
        setState(draft => {
            const isGrouping = draft.columns.some(({group}) => group);
            (draft.sourceInfo.columns || []).forEach(column => {
                let idx = draft.columns.findIndex(({name}) => name === column.name);

                if (idx === -1) {
                    draft.columns.push({ ...column, show });
                    idx = draft.columns.length - 1; // new index
                } else {
                    draft.columns[idx]['show'] = show;
                }

                if (show && isGrouping && !draft.columns[idx].group && !draft.columns[idx].fn) {
                    draft.columns[idx]['fn'] = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
                } else if (!show){
                    draft.columns[idx].sort = undefined;
                    draft.columns[idx].fn = undefined;
                }
            });
        });
    }, [setState]);

    const resetColumn = useCallback((originalAttribute) => setState(draft => {
        const idx = columns.findIndex(column => column.name === originalAttribute.name);
        if (idx !== -1) {
            draft.columns.splice(idx, 1);
        }
    }), [columns]);

    const resetAllColumns = useCallback(() => setState(draft => {
        draft.columns = []
        draft.dataRequest = {}
    }), [columns]);

    const {gridClass, gridTemplateColumns, width} = {
        gridClass: 'grid grid-cols-4',
        gridTemplateColumns: '10rem 5rem 5rem 3rem',
        width: '23rem',
    };

    const isEveryColVisible = (sourceInfo.columns || []).map(({name}) => columns.find(column => column.name === name)).every(column => column?.show);
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
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-[${width}] origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >
                <input className={'px-4 py-1 w-full text-xs rounded-md'} placeholder={'search...'}
                       onChange={e => {
                           setSearch(e.target.value)
                       }}/>

                <div className="py-1 select-none">
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
                            <div className={'justify-self-end'}>Show</div>
                            <div className={'justify-self-end'}>Reset</div>
                        </div>
                    </div>
                </div>

                <div className="py-1 select-none">
                    <div key={'global-controls'}
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
                            <div className={'place-self-stretch'}>Apply to All</div>
                             <div className={'justify-self-end'}>
                                <div className={'justify-self-end'}>
                                    <RenderSwitch
                                        size={'small'}
                                        id={'all'}
                                        enabled={isEveryColVisible}
                                        setEnabled={() => toggleGlobalVisibility(!isEveryColVisible)}
                                    />
                                </div>
                            </div>
                            <button className={'w-fit place-self-end'} onClick={() => resetAllColumns()}>
                                <RestoreBin className={'text-orange-500 hover:text-orange-700'} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    {
                        columnsToRender
                            .map((attribute, i) => (
                                <div
                                    key={`${attribute.name}-${i}`}
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
                                        <input className={'place-self-stretch'}
                                               value={attribute.customName || attribute.display_name || attribute.name}
                                               onChange={e => updateColumns(attribute, 'customName', e.target.value)}
                                        />

                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={attribute.show}
                                                        setEnabled={(value) => updateColumns(attribute, 'show', value)}
                                                    />
                                                </div>
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
