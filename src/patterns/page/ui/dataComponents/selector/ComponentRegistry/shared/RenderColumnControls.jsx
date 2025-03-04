import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import RenderSwitch from "./Switch";
import {ArrowDown, RestoreBin} from "../../../../../../forms/ui/icons";
import {cloneDeep} from "lodash-es";
import {SpreadSheetContext} from "../spreadsheet";
import {getControlConfig, useHandleClickOutside} from "./utils";

const gridClasses = {
    2: {
        gridClass: 'grid grid-cols-2',
        gridTemplateColumns: '10rem 3rem',
        width: '13rem',
    },
    3: {
        gridClass: 'grid grid-cols-3',
        gridTemplateColumns: '10rem 5rem 3rem',
        width: '18rem',
    },
    4: {
        gridClass: 'grid grid-cols-4',
        gridTemplateColumns: '10rem 5rem 5rem 3rem',
        width: '23rem',
    },
    5: {
        gridClass: 'grid grid-cols-5',
        gridTemplateColumns: '10rem 5rem 5rem 5rem 3rem',
        width: '28rem',
    },
    6: {
        gridClass: 'grid grid-cols-6',
        gridTemplateColumns: '10rem 5rem 5rem 5rem 5rem 3rem',
        width: '33rem',
    },
    7: {
        gridClass: 'grid grid-cols-7',
        gridTemplateColumns: '10rem 5rem 5rem 5rem 5rem 5rem 3rem',
        width: '38rem',
    },
    8: {
        gridClass: 'grid grid-cols-8',
        gridTemplateColumns: '10rem 5rem 5rem 5rem 5rem 5rem 5rem 3rem',
        width: '43rem',
    },
    9: {
        gridClass: 'grid grid-cols-9',
        gridTemplateColumns: '10rem 5rem 5rem 5rem 5rem 5rem 5rem 5rem 3rem',
        width: '48rem',
    },
    10: {
        gridClass: 'grid grid-cols-10',
        gridTemplateColumns: '10rem 5rem 5rem 5rem 5rem 5rem 5rem 5rem 5rem 3rem',
        width: '53rem',
    },
    11: {
        gridClass: 'grid grid-cols-11',
        gridTemplateColumns: '10rem 5rem 5rem 5rem 5rem 5rem 5rem 5rem 5rem 5rem 3rem',
        width: '58rem',
    },
};


export default function RenderColumnControls({context}) {
    const {state: {columns=[], sourceInfo}, setState, compType} = useContext(context || SpreadSheetContext);
    const {
        allowCustomColNames,
        allowFnSelector,
        allowExcludeNASelector,
        allowShowToggle,
        allowXAxisToggle,
        allowYAxisToggle,
        allowCategoriseToggle,
        allowFilterToggle,
        allowGroupToggle,
        allowOpenOutToggle,
    } = getControlConfig(compType);

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
    const updateColumns = useCallback((originalAttribute, key, value) => {
        setState(draft => {
            let idx = draft.columns.findIndex(column => column.name === originalAttribute.name);

            if (idx === -1) {
                draft.columns.push({ ...originalAttribute, [key]: value });
                idx = draft.columns.length - 1; // new index
            } else {
                draft.columns[idx][key] = value;
            }

            // special cases
            if (key === 'show' && value === false) {
                // stop sorting and applying fn when column is hidden
                draft.columns[idx].sort = undefined;
                draft.columns[idx].fn = undefined;
            } else if (key === 'show' && value === true && draft.columns.some(c => c.name !== originalAttribute.name && c.group)) {
                // apply fn if at least one column is grouped
                draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
            }

            if (key === 'group' && value === true) {
                // all other visible columns must have a function
                draft.columns[idx].fn = undefined;
                draft.columns
                    .filter(c => c.name !== originalAttribute.name && c.show && !c.group && !c.fn)
                    .forEach(col => {
                        col.fn = col.defaultFn?.toLowerCase() || 'list';
                    });
            }

            if (key === 'group' && value === false && draft.columns.some(c => c.name !== originalAttribute.name && c.group)) {
                // if grouping by other columns, apply fn when removing group for current column
                draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
            }

            // graph controls
            // group by xAxis and categories.
            // xAxis, yAxis, and categories all set to show.
            if(key === 'yAxis'){
                const defaultFn = draft.columns[idx].defaultFn?.toLowerCase();
                draft.columns[idx].fn = value ? (['sum', 'count'].includes(defaultFn) ? defaultFn : 'count') : ''
                draft.columns[idx].show = value;
            }

            if(key === 'xAxis'){
                // turn off other xAxis columns
                draft.columns.forEach(column => {
                    // if xAxis true, for original column set to true. for others false.
                    column.xAxis = value ? column.name === originalAttribute.name : value;
                    // if turning xAxis off, and not original column, check their category settings.
                    column.group = column.name === originalAttribute.name ? value : column.categorize;
                    column.show = column.name === originalAttribute.name ? value : column.yAxis || column.categorize;
                })
            }

            if(key === 'categorize'){
                // turn off other Category columns
                draft.columns.forEach(column => {
                    // if Category true, for original column set to true. for others false.
                    column.categorize = value ? column.name === originalAttribute.name : value;
                    // if turning Category off, and not original column, check their xAxis settings.
                    column.group = column.name === originalAttribute.name ? value : column.xAxis;
                    column.show = column.name === originalAttribute.name ? value : column.yAxis || column.xAxis;
                })
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

    const totalControlColsLen = 2 + +allowCustomColNames + +allowFnSelector + +allowExcludeNASelector +
        +allowShowToggle + +allowXAxisToggle + +allowYAxisToggle + +allowCategoriseToggle +
        +allowFilterToggle + +allowGroupToggle + +allowOpenOutToggle;
    const {gridClass, gridTemplateColumns, width} = gridClasses[totalControlColsLen];

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
                            {allowFnSelector ? <div className={'px-1 w-fit rounded-md text-center'}>Fn</div> : null}
                            {allowExcludeNASelector ? <div className={'px-1 w-fit rounded-md text-center'}>Exclude N/A</div> : null}
                            {allowShowToggle ? <div className={'justify-self-end'}>Show</div> : null}
                            {allowXAxisToggle ? <div className={'justify-self-end'}>X Axis</div> : null}
                            {allowYAxisToggle ? <div className={'justify-self-end'}>Y Axis</div> : null}
                            {allowCategoriseToggle ? <div className={'justify-self-end'}>Categorise</div> : null}
                            {allowOpenOutToggle ? <div className={'justify-self-end'}>Open Out</div> : null}
                            {allowFilterToggle ? <div className={'justify-self-end'}>Filter</div> : null}
                            {allowGroupToggle ? <div className={'justify-self-end'}>Group</div> : null}
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
                            {allowFnSelector ? <div className={'px-1 w-fit rounded-md text-center'}></div> : null}
                            {allowExcludeNASelector ? <div className={'px-1 w-fit rounded-md text-center'}></div> : null}
                            {allowShowToggle ? <div className={'justify-self-end'}>
                                <div className={'justify-self-end'}>
                                    <RenderSwitch
                                        size={'small'}
                                        id={'all'}
                                        enabled={isEveryColVisible}
                                        setEnabled={() => toggleGlobalVisibility(!isEveryColVisible)}
                                    />
                                </div>
                            </div> : null}
                            {allowXAxisToggle ? <div className={'justify-self-end'}></div> : null}
                            {allowYAxisToggle ? <div className={'justify-self-end'}></div> : null}
                            {allowCategoriseToggle ? <div className={'justify-self-end'}></div> : null}
                            {allowOpenOutToggle ? <div className={'justify-self-end'}></div> : null}
                            {allowFilterToggle ? <div className={'justify-self-end'}></div> : null}
                            {allowGroupToggle ? <div className={'justify-self-end'}></div> : null}
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
                                                    className={`px-0.5 appearance-none w-fit rounded-md ${attribute.fn ? `bg-blue-500/15 text-blue-700 hover:bg-blue-500/25` : `bg-gray-100`} h-fit text-center cursor-pointer`}
                                                    value={attribute.fn}
                                                    disabled={(compType === 'graph' && !attribute.yAxis) || (compType !== 'graph' && !attribute.show)}
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
                                                    className={`px-0.5 appearance-none px-1 w-fit rounded-md ${attribute.excludeNA ? `bg-blue-500/15 text-blue-700 hover:bg-blue-500/25` : `bg-gray-100`} h-fit text-center cursor-pointer`}
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
                                            allowXAxisToggle ?
                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={attribute.xAxis}
                                                        setEnabled={(value) => attribute.yAxis || attribute.categorize ? null : updateColumns(attribute, 'xAxis', value)}
                                                    />
                                                </div> : null
                                        }

                                        {
                                            allowYAxisToggle ?
                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={attribute.yAxis}
                                                        setEnabled={(value) => attribute.xAxis || attribute.categorize ? null : updateColumns(attribute, 'yAxis', value)}
                                                    />
                                                </div> : null
                                        }

                                        {
                                            allowCategoriseToggle ?
                                                <div className={'justify-self-end'}>
                                                    <RenderSwitch
                                                        size={'small'}
                                                        id={attribute.name}
                                                        enabled={attribute.categorize}
                                                        setEnabled={(value) => attribute.xAxis || attribute.yAxis ? null : updateColumns(attribute, 'categorize', value)}
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
                                                        enabled={attribute.filters?.length > 0}
                                                        setEnabled={(value) => updateColumns(attribute, 'filters', value ? [{type: 'internal', operation: 'filter', values: []}] : value)}
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
