import React, {useCallback} from 'react'
import { handleCopy, handlePaste, TagComponent } from "./section_utils"
import {getColumnLabel, isEqualColumns} from "./controls_utils";
import { getComponentTheme } from "../../../../ui/useTheme";
import {cloneDeep} from "lodash-es";
// todo move filters here
export const getSectionMenuItems = ({ sectionState, actions, auth, ui, dataSource={}, ...rest }) => {
    const { isEdit, value, attributes, i, showDeleteModal, state } = sectionState
    const { onEdit, moveItem, updateAttribute, updateElementType, onChange, setKey, setState, setShowDeleteModal } = actions
    const { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI } = auth
    const { Switch, Pill, TitleEditComp, LevelComp, refreshDataBtnRef, isRefreshingData, setIsRefreshingData, theme, RegisteredComponents = {} } = ui
    const { activeSource, activeView, sources, views, onSourceChange, onViewChange } = dataSource;

    const canEditSection = isUserAuthed(['edit-section'], sectionAuthPermissions);
    const canEditPageLayout = isUserAuthed(['edit-page-layout'], pageAuthPermissions);
    const canEditSectionPermissions = isUserAuthed(['edit-section-permissions'], sectionAuthPermissions);
    const currentComponent = RegisteredComponents[value?.element?.['element-type'] || 'lexical'];

    // =================================================================================================================
    // ======================================== menu item groups begin =================================================
    // =================================================================================================================
    const editCopyPaste = [
        {
            icon: 'PencilSquare', name: 'Edit', cdn: () => !isEdit && canEditSection, onClick: onEdit
        },
        {
            icon: 'Copy', name: 'Copy Section', onClick: (e) => {
                handleCopy(value)

                const el = e.currentTarget;
                el.style.color = 'green';

                setTimeout(() => {
                    el.style.color = '';
                }, 2000);
            }
        },
        {
            icon: 'Paste', name: 'Paste Section', cdn: () => isEdit && canEditSection, onClick: e => handlePaste(e, setKey, setState, value, onChange)
        },
    ]

    const moveItems = [
        {
            icon: 'ChevronUpSquare', name: 'Move Up', cdn: () => !isEdit && canEditPageLayout, onClick: () => moveItem(i, -1)
        },
        {
            icon: 'ChevronDownSquare', name: 'Move Down', cdn: () => !isEdit && canEditPageLayout, onClick: () => moveItem(i, 1)
        },
    ]

    const component = [
        {
            name: 'Component', cdn: () => canEditSection, value: currentComponent.name,
            showValue: true, showSearch: true,
            items: Object.keys(RegisteredComponents)
                .filter(k => !RegisteredComponents[k].hideInSelector)
                .map(k => (
                    {
                        icon: RegisteredComponents[k].name === currentComponent.name ? 'CircleCheck' : 'Blank',
                        name: RegisteredComponents[k].name || k,
                        onClick: () => updateElementType(k)
                    }
                )),
        },
    ]

    const dataset = [
        {
            name: 'Dataset', icon: 'Database',
            cdn: () => currentComponent?.useDataSource && canEditSection,
            items: [
                {name: 'Source', icon: 'Database', showSearch: true, cdn: () => isEdit,
                    items: sources.map(({key, label}) => ({
                        icon: key === activeSource ? 'CircleCheck' : 'Blank',
                        id: crypto.randomUUID(),
                        name: label,
                        onClick: () => onSourceChange(key)
                    }))},
                {name: 'Version', icon: 'Database', showSearch: true, cdn: () => isEdit,
                    items: views.map(({key, label}) => ({
                        icon: key === activeView ? 'CircleCheck' : 'Blank',
                        id: crypto.randomUUID(),
                        name: label,
                        onClick: () => onViewChange(key)
                    }))},
                {
                    icon: 'Refresh', name: isRefreshingData ? 'Refreshing Data' : 'Refresh Data', cdn: () => !isEdit && canEditSection,
                    onClick: () => refreshDataBtnRef.current?.refresh({isRefreshingData, setIsRefreshingData})
                },
                {
                    icon: 'Refresh', name: isRefreshingData ? 'Caching Data' : 'Cache Data', cdn: () => !isEdit && canEditSection,
                    onClick: () => refreshDataBtnRef.current?.refresh({isRefreshingData, setIsRefreshingData, fullDataLoad: true})
                },
                {
                    icon: 'Refresh', name: isRefreshingData ? 'Clearing Cache' : 'Clear Cache', cdn: () => !isEdit && canEditSection,
                    onClick: () => refreshDataBtnRef.current?.refresh({clearCache: true})
                },
            ].filter(item => item.cdn())
        }
    ]
    const columnsToRender =
        [...state.columns, ...(state.sourceInfo.columns || []).filter(c => !state.columns.map(c => c.name).includes(c.name))]
    if(state.columns.some(column => column.type === 'formula')){
        columnsToRender.push(...state.columns.filter(column => column.type === 'formula'))
    }
    // updates column if present, else adds it with the change the user made.
    const updateColumns = (originalAttribute, key, value, onChange) => {
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
    };
    const duplicate = (column) => {
        setState(draft => {
            let idx = draft.columns.findIndex(col => isEqualColumns(col, column));
            if (idx === -1) {
                draft.columns.push({...column, normalName: `${column.name}_original`});
                idx = draft.columns.length - 1; // new index
            }
            const columnToAdd = cloneDeep(draft.columns[idx]);
            const numDuplicates = draft.columns.filter(col => col.isDuplicate && col.name === columnToAdd.name).length;

            columnToAdd.isDuplicate = true;
            columnToAdd.copyNum = numDuplicates + 1;
            columnToAdd.normalName = `${columnToAdd.name}_copy_${numDuplicates + 1}`
            columnToAdd.display_name = `${getColumnLabel(columnToAdd)} Copy ${numDuplicates+1}`;
            draft.columns.splice(idx, 0, columnToAdd)
        })
    }
    const resetColumn = (originalAttribute) => setState(draft => {
        const idx = state.columns.findIndex(column => isEqualColumns(column, originalAttribute));
        if (idx !== -1) {
            draft.columns.splice(idx, 1);
        }
    });
    const resetAllColumns = () => setState(draft => {
        draft.columns = []
        draft.dataRequest = {}
    });

    const toggleIdFilter = () =>
        setState(draft => {
            const idx = draft.columns.findIndex(c => c.systemCol && c.name === 'id');
            if(idx >= 0){
                draft.columns.splice(idx, 1);
            }else{
                draft.columns.splice(0, 0, {name: 'id', display_name: 'ID', systemCol: true})
            }
        })
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
    }), [state.columns]);
    const isEveryColVisible = (state.sourceInfo.columns || []).map(({name}) => state.columns.find(column => column.name === name)).every(column => column?.show);
    const isSystemIDColOn = state.columns.find(c => c.systemCol && c.name === 'id');
    const columns = [
        {
            name: 'Columns', cdn: () => isEdit && currentComponent?.useDataSource && canEditSection,
            showSearch: true,
            items: [
                {icon: 'GlobalEditing', name: 'Global Controls',
                    type: () => <>
                        <Pill text={isEveryColVisible ? 'Hide all' : 'Show all'} color={'blue'} onClick={() => toggleGlobalVisibility(!isEveryColVisible)}/>
                        <Pill text={isSystemIDColOn ? 'Hide ID column' : 'Show ID column'} color={'blue'} onClick={() => toggleIdFilter()}/>
                        <Pill text={'Reset all'} color={'orange'} onClick={() => resetAllColumns()}/>
                    </>},
                ...columnsToRender
                    .map(column => (
                        {
                            name: getColumnLabel(column), icon: column.show ? 'Eye' : '',
                            items: [
                                ...currentComponent.controls.columns.map(control => {
                                    const isDisabled = typeof control.disabled === 'function' ? control.disabled({attribute: column}) : control.disabled;
                                    return ({
                                        name: control.label,
                                        value: column[control.key],
                                        disabled: isDisabled,
                                        options: control.options,

                                        // for toggles
                                        enabled: control.type === 'toggle' ? !!column[control.key] : undefined,
                                        setEnabled: control.type === 'toggle' ? (value) => isDisabled ? null :
                                            updateColumns(column, control.key, value && control.trueValue ? control.trueValue : value, control.onChange) : undefined,

                                        onChange: !['toggle', 'function'].includes(control.type) ? e => updateColumns(column, control.key, e, control.onChange) : undefined,
                                        type: typeof control.type === 'function' ? () => control.type({
                                            attribute: column,
                                            value: column[control.key],
                                            setValue: newValue => updateColumns(column, control.key, newValue, control.onChange),
                                            setState
                                        }) : control.type,
                                    })
                                }),
                                {icon: 'Copy', name: 'Duplicate', onClick: () => duplicate(column)},
                                {icon: 'TrashCan', name: 'Reset', onClick: () => resetColumn(column)}
                            ]
                        }
                    ))
            ]
        },
    ]

    const display = [
        {
            name: 'Display',
            items: [
                {
                    name: 'Title',
                    items: [
                        {
                            name: '',
                            type: () => <TitleEditComp
                                className={`${theme?.heading?.base} ${theme?.heading[value?.['level']] || theme?.heading['default']}`}
                                placeholder={'Section Title'}
                                value={value?.['title'] || ''}
                                onChange={(v) => updateAttribute('title', v)}
                            />
                        }
                    ]
                },
                {
                    name: 'Level',
                    items: [
                        {
                            name: '',
                            type: () => <LevelComp
                                className='p-2 w-full bg-transparent'
                                value={value?.['level']}
                                placeholder={'level'}
                                options={attributes?.level?.options}
                                onChange={(v) => updateAttribute('level', v)}
                            />
                        }
                    ]
                },
                {
                    name: 'Tags',
                    items: [
                        {
                            name: '',
                            type: () => <TagComponent
                                edit={true}
                                className='p-2 flex-0'
                                value={value?.['tags']}
                                placeholder={'Add Tag...'}
                                onChange={(v) => updateAttribute('tags', v)}
                            />
                        }
                    ]
                },
                {
                    name: 'Info Comp',
                    type: () => (
                        <div className={'self-start w-full flex justify-between pl-2'}>
                            <label>Info Component</label>
                            <Switch
                                size={'small'}
                                enabled={value?.['infoComp']}
                                setEnabled={v => updateAttribute('infoComp', v)}
                            />
                        </div>
                    )
                },
                {
                    name: 'Hide Comp',
                    type: () => (
                        <div className={'self-start w-full flex justify-between pl-2'}>
                            <label>Hide Component</label>
                            <Switch
                                size={'small'}
                                enabled={value?.['hideInView']}
                                setEnabled={v => updateAttribute('hideInView', v)}
                            />
                        </div>
                    )
                }
            ]
        },
    ]

    const layout = [
        {
            name: 'Layout',
            items: [
                {
                    icon: 'Column', name: 'Width', value: value?.['size'] || 1, showValue: true,
                    items: Object.keys(getComponentTheme(theme, 'pages.sectionArray').sizes || {})
                      .sort((a, b) => {
                        const sizes = getComponentTheme(theme, 'pages.sectionArray').sizes
                        let first = +sizes[a].iconSize || 100
                        let second = +sizes[b].iconSize || 100
                        return first - second
                    }).map((name, i) => {
                        return {
                            icon: name === (value?.['size'] || '1') ? 'CircleCheck' : 'Blank',
                            id: crypto.randomUUID(), // to prevent duplicate entries
                            'name': name,
                            'onClick': () => updateAttribute('size', name)
                        }
                    })
                },
                {
                    icon: 'Row', name: 'Rowspan', value: value?.['rowspan'] || 1, showValue: true,
                    items: Object.keys(theme?.sectionArray?.rowspans || {}).sort((a, b) => {
                        return +a - +b
                    }).map((name, i) => {
                        return {
                            icon: name === (value?.['rowspan'] || '1') ? 'CircleCheck' : 'Blank',
                            id: crypto.randomUUID(),
                            'name': name,
                            'onClick': () => {
                                updateAttribute('rowspan', name);
                            }
                        }
                    })
                },
                {
                    icon: 'Padding', name: 'Offset', value: value?.['offset'] || 16, showValue: true,
                    items: [
                        {
                            type: 'input',
                            inputType: 'number',
                            min: 0, max: 500,
                            value: value?.['offset'] || 16,
                            onChange: (v) => updateAttribute('offset', +v.target.value)
                        }
                    ],
                },
                {
                    icon: 'Padding', name: 'padding', value: value?.['padding'] || theme?.sectionArray?.sectionPadding,
                    showValue: true,
                    items: ['p-0', 'p-1', 'p-2', theme?.sectionArray?.sectionPadding].map((v, i) => {
                        return {
                            icon: v === (value?.['padding'] || theme?.sectionArray?.sectionPadding) ? 'CircleCheck' : 'Blank',
                            'name': `${v}`,
                            'onClick': () => updateAttribute('padding', v)
                        }
                    }),
                },
                {
                    icon: 'Border', name: 'Border', value: value?.['border'] || 1,
                    items: [
                        {
                            name: 'border', type: () => {
                                return (
                                    <div className={'flex flex-wrap gap-1'}>
                                        {
                                            Object.keys(theme?.sectionArray?.border || {})
                                                .map((name, i) => {
                                                    return (
                                                        <div
                                                            className={`px-4 py-2 rounded-md ${name === (value?.['border'] || 'None') ? `bg-blue-300` : ``} hover:bg-blue-100`}
                                                            onClick={() => updateAttribute('border', name)}>
                                                            {name}
                                                        </div>)
                                                })
                                        }
                                    </div>
                                )
                            }
                        },
                    ],
                },
            ]
        },
    ]

    const permissions = [
        {
            icon: 'AccessControl', name: 'Permissions', cdn: () => canEditSectionPermissions,
            items: [
                {
                    name: 'Permissions Comp',
                    type: () => (
                        <Permissions
                            value={value?.['authPermissions']}
                            onChange={v => updateAttribute('authPermissions', v)}
                            user={user}
                            getUsers={AuthAPI.getUsers}
                            getGroups={AuthAPI.getGroups}
                            permissionDomain={attributes?.authPermissions?.permissionDomain}
                            defaultPermission={attributes?.authPermissions?.defaultPermission}
                        />
                    )
                }
            ]
        },
    ]

    const remove = [
        {
            icon: 'TrashCan', name: 'Delete',  cdn: () => canEditSection, onClick: () => setShowDeleteModal(!showDeleteModal)
        }
    ]

    // =================================================================================================================
    // ========================================= menu item groups end == ===============================================
    // =================================================================================================================

    return (
        [
            ...editCopyPaste,
            {type: 'separator'},
            ...moveItems,
            {type: 'separator', cdn: () => !isEdit && canEditPageLayout},
            ...component,
            ...dataset,
            ...columns,
            ...display,
            ...layout,
            ...permissions,
            {type: 'separator'},
            ...remove
        ].filter(item => !item.cdn || item.cdn())
    )
}
