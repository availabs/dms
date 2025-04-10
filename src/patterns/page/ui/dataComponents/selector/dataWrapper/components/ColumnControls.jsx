import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import RenderSwitch from "./Switch";
import {ArrowDown, RestoreBin} from "../../../../../../forms/ui/icons";
import {cloneDeep} from "lodash-es";
import {ComponentContext} from "../index";
import {useHandleClickOutside} from "../../ComponentRegistry/shared/utils";
import {getColumnLabel, isEqualColumns} from "../utils/utils";
import {Pill} from "./Pill";
import {AddFormulaColumn} from "./AddFormulaColumn";

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


export default function ColumnControls({context}) {
    const {state: {columns=[], sourceInfo}, setState, controls= {}} = useContext(context || ComponentContext);
    if(!controls.columns?.length) return;

    const dragItem = useRef();
    const dragOverItem = useRef();
    const menuRef = useRef(null);
    const [search, setSearch] = useState();
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-column-controls'; // used to control isOpen on menu-btm click;
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const columnsToRender =
        (sourceInfo?.columns || [])
            .reduce((acc, attribute) => {
                const match = columns.filter(c => c.name === attribute.name);
                return [...acc, ...(match.length ? match : [attribute])];
            }, []) // map to current settings
            // .sort((a,b) => {
            //     const orderA = columns.findIndex(column => column.name === a.name);
            //     const orderB = columns.findIndex(column => column.name === b.name);
            //     return orderA - orderB;
            // })
            .filter(attribute => (
                !search ||
                getColumnLabel(attribute).toLowerCase().includes(search.toLowerCase()))
            )
    if(columns.some(column => column.type === 'formula')){
        columnsToRender.push(...columns.filter(column => column.type === 'formula'))
    }
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
            // todo: handle duplicate columns
            draft.columns = copyListItems.map(originalColumn => columns.find(colWithSettings => colWithSettings.name === originalColumn.name)).filter(c => c);
            draft.sourceInfo.columns = copyListItems;
        })
    };
    // ================================================== drag utils end ===============================================

    // updates column if present, else adds it with the change the user made.
    const updateColumns = useCallback((originalAttribute, key, value, onChange) => {
        setState(draft => {
            // ======================= default behaviour begin =================================

            let idx = draft.columns.findIndex(column => {
                return isEqualColumns(column, originalAttribute)
            });

            if (idx === -1) {
                draft.columns.push({ ...originalAttribute, [key]: value });
                idx = draft.columns.length - 1; // new index
            } else {
                draft.columns[idx][key] = value;
            }
            // ======================= default behaviour end ==================================

            // special cases: show, group and fn are close enough to the data wrapper to be handled here
            if (key === 'show' && value === false) {
                // stop sorting and applying fn when column is hidden
                draft.columns[idx].sort = undefined;
                draft.columns[idx].fn = undefined;
            } else if (key === 'show' && value === true &&
                !draft.columns[idx].group && // grouped column shouldn't have fn
                draft.columns.some(c => !isEqualColumns(c, originalAttribute) && c.group)
            ) {
                // apply fn if at least one column is grouped
                draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
            }

            if (key === 'group' && value === true) {
                // all other visible columns must have a function
                draft.columns[idx].fn = undefined;
                draft.columns
                    .filter(c => !isEqualColumns(c, originalAttribute) && c.show && !c.group && !c.fn)
                    .forEach(col => {
                        col.fn = col.defaultFn?.toLowerCase() || 'list';
                    });
            }

            if (key === 'group' && value === false && draft.columns.some(c => !isEqualColumns(c, originalAttribute) && c.group)) {
                // if grouping by other columns, apply fn when removing group for current column
                draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
            }

            if(onChange) {
                onChange({key, value, attribute: originalAttribute, state: draft, columnIdx: idx})
            }
        });
    }, [setState, columns]);

    const toggleGlobalVisibility = useCallback((show = true) => {
        setState(draft => {
            const isGrouping = draft.columns.some(({group}) => group);
            (draft.sourceInfo.columns || []).forEach(column => {
                let idx = draft.columns.findIndex(draftColumn => isEqualColumns(draftColumn, column));

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
        const idx = columns.findIndex(column => isEqualColumns(column, originalAttribute));
        if (idx !== -1) {
            draft.columns.splice(idx, 1);
        }
    }), [columns]);

    const addFormulaColumn = useCallback((column) => setState(draft => {
        if(column.name && column.formula){
            draft.columns.push(column)
        }

        if(column.variables?.length){
            column.variables.forEach(col => {
                const idx = draft.columns.findIndex(draftCol => isEqualColumns(draftCol, col));

                if ( idx !== -1 &&
                    !draft.columns[idx].group && // grouped column shouldn't have fn
                    draft.columns.some(c => !isEqualColumns(c, col) && c.group) && // if there are some grouped columns
                    !draft.columns[idx].fn
                ) {
                    // apply fn if at least one column is grouped
                    draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
                }
            })
        }
    }), [columns]);

    const resetAllColumns = useCallback(() => setState(draft => {
        draft.columns = []
        draft.dataRequest = {}
    }), [columns]);

    const totalControlColsLen = 2 + controls.columns.length;
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
                            {
                                controls.columns.map(control => <div key={control.label} className={control.type === 'toggle' ? 'justify-self-stretch' : 'px-1 w-fit rounded-md text-center'}>{control.label}</div>)
                            }
                            <div className={'justify-self-stretch'}>Reset</div>
                        </div>
                    </div>
                </div>

                <div className="py-1 select-none">
                    <div key={'global-controls'} className="flex items-center px-2 py-1">
                        <div className={'h-4 w-4 m-1 text-gray-800'}>
                            <svg data-v-4e778f45=""
                                 className="nc-icon cursor-move !h-3.75 text-gray-600 mr-1"
                                 viewBox="0 0 24 24" width="1.2em" height="1.2em">
                                <path fill="currentColor"
                                      d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                            </svg>
                        </div>

                        <div className={`flex gap-1 m-1 w-full`}>
                            {
                                controls.columns.find(({key}) => key === 'show') ?
                                    <Pill text={isEveryColVisible ? 'Hide all' : 'Show all'} color={'blue'} onClick={() => toggleGlobalVisibility(!isEveryColVisible)}/> : null
                            }
                            <AddFormulaColumn columns={columnsToRender} addFormulaColumn={addFormulaColumn}/>
                            <Pill text={'Reset all'} color={'orange'} onClick={() => resetAllColumns()}/>
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
                                        <input key={`${attribute.name}-${attribute.copyNum}`} className={'place-self-stretch'}
                                               value={getColumnLabel(attribute)}
                                               onChange={e => updateColumns(attribute, 'customName', e.target.value)}
                                        />
                                        {
                                            controls.columns.map((control, i) => {
                                                const isDisabled = typeof control.disabled === 'function' ? control.disabled({attribute}) : control.disabled;
                                                return (
                                                    <div key={`${control.key}-${i}`}>
                                                        {
                                                            control.type === 'select' ?
                                                                <select
                                                                    key={attribute[control.key]}
                                                                    className={`px-0.5 appearance-none w-fit rounded-md ${attribute[control.key] ? `bg-blue-500/15 text-blue-700 hover:bg-blue-500/25` : `bg-gray-100`} h-fit text-center cursor-pointer`}
                                                                    value={attribute[control.key]}
                                                                    disabled={isDisabled}
                                                                    onChange={e => updateColumns(attribute, control.key, e.target.value, control.onChange)}
                                                                >
                                                                    {
                                                                        control.options.map(({label, value}) => <option
                                                                            key={value} value={value}>{label}</option>)
                                                                    }
                                                                </select> :
                                                                control.type === 'toggle' ?
                                                                    <div key={attribute[control.key]}
                                                                         className={'justify-self-stretch'}>
                                                                        <RenderSwitch
                                                                            size={'small'}
                                                                            key={attribute[control.key]}
                                                                            id={attribute[control.key]}
                                                                            enabled={!!attribute[control.key]}
                                                                            setEnabled={(value) => isDisabled ? null :
                                                                                updateColumns(attribute, control.key, value && control.trueValue ? control.trueValue : value, control.onChange)}
                                                                        />
                                                                    </div> :
                                                                    typeof control.type === 'function' ?
                                                                        control.type({
                                                                            attribute,
                                                                            value: attribute[control.key],
                                                                            setValue: newValue => updateColumns(attribute, control.key, newValue, control.onChange),
                                                                            setState
                                                                        }) :
                                                                        `${control.type} not available`
                                                        }
                                                    </div>
                                                )
                                            })
                                        }

                                        <button key={'restore-btn'} className={'w-fit place-self-end'} onClick={() => resetColumn(attribute)}>
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
