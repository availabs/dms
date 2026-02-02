import React from 'react'
import { handleCopy, handlePaste, TagComponent } from "./section_utils"
import {
    getColumnLabel, updateColumns, resetColumn,
    resetAllColumns, duplicate, toggleIdFilter,
    toggleGlobalVisibility, updateDisplayValue, addFormulaColumn, isEqualColumns, addCalculatedColumn
} from "./controls_utils";
import { getComponentTheme } from "../../../../ui/useTheme";
import AddFormulaColumn from "./AddFormulaColumn";
import AddCalculatedColumn from "./AddCalculatedColumn";


// todo move filters here
export const getSectionMenuItems = ({ sectionState, actions, auth, ui, dataSource={}, ...rest }) => {
    const { isEdit, value, attributes, i, showDeleteModal, listAllColumns, state } = sectionState
    const { onEdit, moveItem, updateAttribute, updateElementType, onChange, setKey, setState, setShowDeleteModal, setListAllColumns } = actions
    const { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI } = auth
    const { Switch, Pill, TitleEditComp, LevelComp, refreshDataBtnRef, isRefreshingData, setIsRefreshingData, theme, RegisteredComponents = {} } = ui
    const { activeSource, activeView, sources, views, onSourceChange, onViewChange } = dataSource;

    const canEditSection = isUserAuthed(['edit-section'], sectionAuthPermissions);
    const canEditPageLayout = isUserAuthed(['edit-page-layout'], pageAuthPermissions);
    const canEditSectionPermissions = isUserAuthed(['edit-section-permissions'], sectionAuthPermissions);
    const currentComponent = RegisteredComponents[value?.element?.['element-type'] || 'lexical'];
    const currentComponentStyle = theme[currentComponent?.themeKey || currentComponent?.name];

    // =================================================================================================================
    // ======================================== menu item groups begin =================================================
    // =================================================================================================================
    const editCopyPaste = [
        {
            icon: 'PencilSquare',
            name: 'Edit',
            cdn: () => !isEdit && canEditSection,
            onClick: onEdit
        },
        {
            icon: 'Copy',
            name: 'Copy Section',
            onClick: (e) => {
                handleCopy(value)

                const el = e.currentTarget;
                el.style.color = 'green';

                setTimeout(() => {
                    el.style.color = '';
                }, 2000);
            }
        },
        {
            icon: 'Paste',
            name: 'Paste Section',
            cdn: () => isEdit && canEditSection,
            onClick: e => handlePaste(e, setKey, setState, value, onChange)
        },
    ]

    const moveItems = [
        {
            icon: 'ChevronUpSquare',
            name: 'Move Up', cdn: () => !isEdit && canEditPageLayout,
            onClick: () => moveItem(i, -1)
        },
        {
            icon: 'ChevronDownSquare',
            name: 'Move Down',
            cdn: () => !isEdit && canEditPageLayout,
            onClick: () => moveItem(i, 1)
        },
    ]

    const component = [
        {
            name: 'Component', cdn: () => canEditSection, value: currentComponent?.name,
            showValue: true, showSearch: true,
            items: Object.keys(RegisteredComponents)
                .filter(k => !RegisteredComponents[k].hideInSelector &&
                    // don't allow conversion of incompatible components in view mode
                    (isEdit || (['Spreadsheet', 'Card'].includes(currentComponent?.name) && ['Spreadsheet', 'Card'].includes(k)))
                )
                .map(k => (
                    {
                        icon: RegisteredComponents[k].name === currentComponent?.name ? 'CircleCheck' : 'Blank',
                        name: RegisteredComponents[k].name || k,
                        onClick: () => updateElementType(k)
                    }
                )),
        },
    ]

    const dataset =
        {
            name: 'Dataset', icon: 'Database',
            cdn: () => isEdit && currentComponent?.useDataSource && canEditSection,
            value: sources?.find(s => s.key === activeSource)?.label, showValue: true,
            items: [
                {name: 'Source', icon: 'Database', showSearch: true, cdn: () => isEdit,
                    value: sources?.find(s => s.key === activeSource)?.label, showValue: true,
                    items: sources.map(({key, label}) => ({
                        icon: key === activeSource ? 'CircleCheck' : 'Blank',
                        id: crypto.randomUUID(),
                        name: label,
                        onClick: () => onSourceChange(key)
                    }))},
                {name: 'Version', icon: 'Database', showSearch: true, cdn: () => isEdit,
                    value: views?.find(s => s.key === activeView)?.label || activeView, showValue: true,
                    items: views.map(({key, label}) => ({
                        icon: key === activeView ? 'CircleCheck' : 'Blank',
                        id: crypto.randomUUID(),
                        name: label,
                        onClick: () => onViewChange(key)
                    }))}
            ].filter(item => item.cdn())
        }

  const columnsToRender = listAllColumns ? [
    ...(state?.columns || []),
    ...(state?.sourceInfo?.columns || [])
      .filter(c => !(state?.columns || [])
      .map(c => c.name).includes(c.name))
  ] : [...(state?.columns || [])];

    const allColumns = [
        ...(state?.columns || []),
        ...(state?.sourceInfo?.columns || [])
            .filter(c => !(state?.columns || [])
                .map(c => c.name).includes(c.name))
    ];

    const isEveryColVisible = (state?.sourceInfo?.columns || [])
        .map(({ name }) => (state?.columns || [])
        .find(column => column?.name === name))
        .every(column => column?.show);
    const isSystemIDColOn = (state?.columns || [])
        .find(c => c.systemCol && c.name === 'id');
    const columns = [
        {
            name: 'Columns', cdn: () => isEdit && currentComponent?.useDataSource && canEditSection,
            showSearch: true, canReorder: true, onReorder: (updatedColumns) => {
                setState(draft => {
                    draft.columns = updatedColumns.map(c => draft.columns.find(draftCol => isEqualColumns(draftCol, c.column))).filter(c => c);
                })
            },
            value: (state.columns || []).length, showValue: true,
            items: [
                {icon: 'GlobalEditing', name: 'Global Controls',
                    type: () => <div className={'flex flex-col gap-1'}>
                        <div className={'flex flex-wrap gap-1'}>
                            <Pill text={isSystemIDColOn ? 'Hide ID' : 'Use ID'} color={'blue'} onClick={() => toggleIdFilter(setState)}/>
                            <AddFormulaColumn columns={columnsToRender} addFormulaColumn={col => addFormulaColumn(col, setState)}/>
                            <AddCalculatedColumn columns={columnsToRender} addCalculatedColumn={col => addCalculatedColumn(col, setState)}/>
                        </div>
                        <div className={'flex flex-wrap gap-1'}>
                            <Pill text={listAllColumns ? 'List Used' : 'List All'} color={'blue'} onClick={() => setListAllColumns(!listAllColumns)}/>
                            <Pill text={isEveryColVisible ? 'Hide all' : 'Show all'} color={'blue'} onClick={() => toggleGlobalVisibility(!isEveryColVisible, setState)}/>
                            <Pill text={'Reset all'} color={'orange'} onClick={() => resetAllColumns(setState)}/>
                        </div>
                    </div>},
                ...columnsToRender
                    .map((column, i) => (
                        {
                            id: `${column.name}_${i}`,
                            name: getColumnLabel(column), icon: column.show ? 'Eye' : '',
                            column, // to match back to state after reordering
                            items: [
                                {icon: 'PencilSquare', // fucks up
                                    name: 'Name',
                                    type: 'input',
                                    showLabel: true,
                                    value: getColumnLabel(column),
                                    onChange: e => updateColumns(column, 'customName', e.target.value, undefined, setState)
                                },
                                ...[
                                    ...(currentComponent.controls?.columns || []),
                                    ...(currentComponent.controls?.inHeader || [])
                                ].map(control => {
                                    const isDisabled = typeof control.disabled === 'function' ? control.disabled({attribute: column}) : control.disabled;
                                    return ({
                                        name: control.label,
                                        value: column[control.key],
                                        disabled: isDisabled,
                                        options: control.options,
                                        showLabel: true,

                                        // for toggles
                                        enabled: control.type === 'toggle' ? !!column[control.key] : undefined,
                                        setEnabled: control.type === 'toggle' ? (value) => isDisabled ? null :
                                            updateColumns(column, control.key, value && control.trueValue ? control.trueValue : value, control.onChange, setState) : undefined,

                                        onChange: !['toggle', 'function'].includes(control.type) ? e => updateColumns(column, control.key, e, control.onChange, setState) : undefined,
                                        type: typeof control.type === 'function' ? () => control.type({
                                            attribute: column,
                                            setAttribute: newValue => updateColumns(column, undefined, newValue, control.onChange, setState),
                                            value: column[control.key],
                                            setValue: newValue => updateColumns(column, control.key, newValue, control.onChange, setState),
                                            setState
                                        }) : control.type,
                                    })
                                }),
                                {icon: 'Copy', name: 'Duplicate', onClick: () => duplicate(column, setState)},
                                {icon: 'TrashCan', name: 'Reset', onClick: () => resetColumn(column, setState)}
                            ]
                        }
                    ))
            ]
        },
    ]

    const groupControl = currentComponent?.controls?.columns?.find(c => c.key === 'group') || {};
    const hasGroupControl = Boolean(groupControl);
    const group = [
        {
            name: 'Group', cdn: () => isEdit && currentComponent?.useDataSource && canEditSection && hasGroupControl,
            showSearch: true, value: (state.columns || []).filter(c => c.group).length, showValue: true,
            items:
                allColumns
                    .map(column => (
                        {
                            name: getColumnLabel(column), icon: column.show ? 'Eye' : '',
                            showLabel: true,
                            type: groupControl.type,
                            value: groupControl[groupControl.key],
                            enabled: groupControl.type === 'toggle' ? !!column[groupControl.key] : undefined,
                            setEnabled: groupControl.type === 'toggle' ? (value) =>
                                updateColumns(column, groupControl.key, value && groupControl.trueValue ? groupControl.trueValue : value, groupControl.onChange, setState) : undefined,
                        }
                    ))

        },
    ]


    const filter = [

    ]

    const data = [
        {name: 'data', icon: 'Database', cdn: () => currentComponent?.useDataSource && canEditSection,
            items: [
                {
                    icon: 'Refresh', name: isRefreshingData ? 'Refreshing Data' : 'Refresh Data', cdn: () => canEditSection,
                    onClick: () => refreshDataBtnRef.current?.refresh({isRefreshingData, setIsRefreshingData})
                },
                {
                    icon: 'Refresh', name: isRefreshingData ? 'Caching Data' : 'Cache Data', cdn: () => canEditSection,
                    onClick: () => refreshDataBtnRef.current?.refresh({isRefreshingData, setIsRefreshingData, fullDataLoad: true})
                },
                {
                    icon: 'Refresh', name: isRefreshingData ? 'Clearing Cache' : 'Clear Cache', cdn: () => canEditSection,
                    onClick: () => refreshDataBtnRef.current?.refresh({clearCache: true})
                },
                dataset,
                {name: '# rows', value: state?.display?.totalLength, showValue: true, cdn: () => currentComponent?.useDataSource},
                ...columns,
                ...group,
                ...filter
            ].filter(item => item.cdn())
        }
    ]

    const other =
        Object.keys(currentComponent?.controls || {})
            .filter(controlGroup => !['columns', 'more', 'inHeader'].includes(controlGroup) && isEdit && canEditSection)
            .map(controlGroup => ({
                name: currentComponent?.controls?.[controlGroup]?.name || controlGroup,
                items: [
                    {name: 'component', type: currentComponent?.controls?.[controlGroup]?.type}
                ]
            }))

    const more = [
        {
            name: 'More', icon: 'Settings',
            cdn: () => isEdit && currentComponent?.useDataSource && canEditSection && currentComponent.controls?.more?.length,
            showSearch: true,
            items: [
                ...(currentComponent?.controls?.more || [])
                .filter(({displayCdn}) =>
                    typeof displayCdn === 'function' ? displayCdn({display: state.display}) :
                        typeof displayCdn === 'boolean' ? displayCdn : true)
                    .map(({type, inputType, label, key, options, onChange, ...rest}) => ({
                        name: label,
                        value: state.display[key],
                        options: options,
                        showLabel: true,

                        // for toggles
                        enabled: type === 'toggle' ? !!state.display[key] : undefined,
                        setEnabled: type === 'toggle' ? (value) => updateDisplayValue(key, value, onChange, setState) : undefined,

                        onChange:
                            !['toggle', 'function'].includes(type) ?
                                e => updateDisplayValue(key,
                                    inputType === 'number' ?
                                        +(e?.target?.value ?? e) :
                                        (e?.target?.value ?? e),
                                    onChange, setState) : undefined,
                        type: typeof type === 'function' ? () =>
                                type({value: state.display[key], setValue: newValue => updateDisplayValue(key, newValue, onChange, setState)})
                            : type,
                        inputType
                        })),
                ...other
            ]

        },
    ]


    const display = [
        {
            name: 'Display',
            items: [
                {
                    name: 'Title',
                    cdn: () => canEditSection,
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
                    cdn: () => canEditSection,
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
                    cdn: () => canEditSection,
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
                    cdn: () => canEditSection,
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
                    cdn: () => canEditSection,
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

    const styles = currentComponentStyle?.styles || [];
    const activeStyle = value?.activeStyle || currentComponentStyle?.options?.activeStyle;
    const activeStyleName = styles[activeStyle]?.name || activeStyle;

    const layout = [
        {
            name: 'Layout',
            items: [
                {
                    name: 'Style', value: activeStyleName, showValue: true,
                    cdn: () => canEditSection,
                    items: styles.map((style, idx) => ({
                        icon: idx === activeStyle ? 'CircleCheck' : '',
                        name: style.name || idx,
                        onClick: () => updateAttribute('activeStyle', idx)
                    }))
                },
                {
                    icon: 'Column', name: 'Width', value: value?.['size'] || 1, showValue: true,
                    cdn: () => canEditSection,
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
                    cdn: () => canEditSection,
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
                    cdn: () => canEditSection,
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
                    cdn: () => canEditSection,
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
                    cdn: () => canEditSection,
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

    const section = [
        {
            name: 'section',
            items: [
                ...display[0].items,
                {type: 'separator'},
                ...layout[0].items
            ].filter(item => !item.cdn || item.cdn())
        }
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
            ...data,
            // ...dataset,
            // ...columns,
            // ...group,
            ...more,
            // ...other,
            // ...display,
            // ...layout,
            ...section,
            ...permissions,
            {type: 'separator'},
            ...remove
        ].filter(item => !item.cdn || item.cdn())
    )
}
