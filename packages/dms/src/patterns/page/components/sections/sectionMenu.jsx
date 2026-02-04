import React, {useState} from 'react'
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
    const { onEdit, moveItem, updateAttribute, updateElementType, onChange, onCancel, onSave, onAddHelpText, setKey, setState, setShowDeleteModal, setListAllColumns } = actions
    const { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI } = auth
    const { Switch, Pill, Icon, TitleEditComp, LevelComp, refreshDataBtnRef, isRefreshingData, setIsRefreshingData, theme, RegisteredComponents = {} } = ui
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
            name: 'Main SectionControls',
            cdn: () => canEditSection || canEditPageLayout,
            type: () => {
                const [copied, setCopied] = useState(false);

                return (
                    <div className={'flex gap-1'}>
                        {/*{isEdit ?*/}
                        {/*    <Pill color={'orange'} text={<Icon icon={'CancelCircle'} className={'size-6'} />} title={'Cancel'} onClick={onCancel} /> :*/}
                        {/*    canEditSection ?*/}
                        {/*        <Pill color={'blue'} text={<Icon icon={'PencilSquare'} className={'size-6'} />} title={'Edit'} onClick={onEdit} /> : null*/}
                        {/*}*/}
                        {/*{isEdit && canEditSection ? <Pill color={'blue'} text={<Icon icon={'FloppyDisk'} className={'size-6'} />} title={'Save'} onClick={onSave} /> : null}*/}
                        {isEdit && canEditSection ? <Pill color={'blue'} text={<Icon icon={'InfoSquare'} className={'size-6'} />} title={'Add Help Text'} onClick={onAddHelpText} /> : null}

                        {canEditSection ? <Pill color={copied ? 'green' : 'blue'} text={<Icon icon={'Copy'} className={'size-6'}/>}
                               title={'Copy Section'}
                               onClick={(e) => {
                                   handleCopy(value)
                                   setCopied(true)
                                   setTimeout(() => {
                                       setCopied(false)
                                   }, 2000);
                               }}/> : null}
                        {canEditSection ? <Pill color={'blue'} text={<Icon icon={'Paste'} className={'size-6'}/>} title={'Paste Section'}
                               onClick={e => handlePaste(e, setKey, setState, value, onChange)}/> : null}

                        {!isEdit && canEditPageLayout ?
                                <Pill color={'blue'} text={<Icon icon={'ChevronUpSquare'} className={'size-6'} />} title={'Move Up'}
                                      onClick={() => moveItem(i, -1)} />  : null}

                        {!isEdit && canEditPageLayout ?
                                <Pill color={'blue'} text={<Icon icon={'ChevronDownSquare'} className={'size-6'} />} title={'Move Down'}
                                      onClick={() => moveItem(i, 1)} /> : null}
                    </div>
                )
            }
        }
    ]

    const component = [
        {
            name: 'Component', icon: 'ListView', cdn: () => canEditSection, value: currentComponent?.name,
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

    // Registry of control type transformers - all use nested submenu pattern
    const controlItemTransformers = {
        select: (item, value) => ({
            icon: item.icon,
            name: item.label,
            value: item.options?.find(opt => opt.value === value)?.label || value || '',
            showValue: true,
            items: item.options?.map(opt => ({
                icon: opt.value === value ? 'CircleCheck' : 'Blank',
                name: opt.label,
                onClick: () => updateDisplayValue(item.key, opt.value, item.onChange, setState)
            }))
        }),
        colorpicker: (item, value) => ({
            icon: item.icon,
            name: item.label,
            showValue: false,
            items: [{
                id: `${item.key}_colorpicker`,
                name: `${item.label} color`,
                type: 'colorpicker', noHover: true,
                value, colors: item.colors, showColorPicker: item.showColorPicker,
                onChange: (newColor) => updateDisplayValue(item.key, newColor, item.onChange, setState)
            }]
        }),
        toggle: (item, value) => ({
            icon: item.icon, name: item.label, showLabel: true, type: 'toggle',
            enabled: !!value,
            setEnabled: (v) => updateDisplayValue(item.key, v, item.onChange, setState)
        }),
        input: (item, value) => ({
            icon: item.icon,
            name: item.label,
            value,
            showValue: true,
            items: [{
                id: `${item.key}_input`,
                name: `${item.label} input`,
                type: 'input', inputType: item.inputType, value,
                onChange: (e) => updateDisplayValue(item.key,
                    item.inputType === 'number' ? +(e?.target?.value ?? e) : (e?.target?.value ?? e),
                    item.onChange, setState)
            }]
        }),
    };

    const transformControlItem = (item) => {
        const value = state.display?.[item.key] ?? item.defaultValue;
        if (typeof item.type === 'function') {
            return {
                icon: item.icon, name: item.label,
                type: () => item.type({ value, setValue: v => updateDisplayValue(item.key, v, item.onChange, setState), state, setState })
            };
        }
        return controlItemTransformers[item.type]?.(item, value) || { name: item.label };
    };

    const other =
        Object.keys(currentComponent?.controls || {})
            .filter(controlGroup => !['columns', 'more', 'inHeader', 'default'].includes(controlGroup) && isEdit && canEditSection)
            .map(controlGroup => {
                const config = currentComponent?.controls?.[controlGroup];
                if (!config?.items?.length) {
                    return { name: config?.name || controlGroup, items: [{name: 'component', type: config?.type}] };
                }
                return {
                    name: config.name || controlGroup,
                    showSearch: config.showSearch,
                    items: config.items
                        .filter(({displayCdn}) => typeof displayCdn === 'function' ? displayCdn({display: state.display}) : displayCdn !== false)
                        .map(transformControlItem)
                };
            })

    const more = [
      {
        name: 'Component Settings', icon: 'Settings',
        cdn: () => isEdit && canEditSection,
        showSearch: true,
        items: [
          ...(currentComponent?.controls?.more || [])
            .filter(({ displayCdn }) => typeof displayCdn === 'function' ? displayCdn({ display: state.display }) : displayCdn !== false)
            .map(transformControlItem),
          ...(currentComponent?.controls?.default || [])
              .filter(({displayCdn}) => typeof displayCdn === 'function' ? displayCdn({display: state.display}) : displayCdn !== false)
              .map(transformControlItem),
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
                // {
                //     name: 'Info Comp',
                //     cdn: () => canEditSection,
                //     type: () => (
                //         <div className={'self-start w-full flex justify-between pl-2'}>
                //             <label>Info Component</label>
                //             <Switch
                //                 size={'small'}
                //                 enabled={value?.['infoComp']}
                //                 setEnabled={v => updateAttribute('infoComp', v)}
                //             />
                //         </div>
                //     )
                // },
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
                            id: crypto.randomUUID(),
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
            name: 'Section', icon: 'Section',
            items: [
                ...display[0].items,
                {type: 'separator'},
                ...layout[0].items,
                {type: 'separator'},
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
            ].filter(item => !item.cdn || item.cdn())
        }
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
            {type: 'separator', cdn: () => canEditPageLayout || canEditSection},
            ...section,
            ...component,
            ...more,
            ...data,
            {type: 'separator'},
            ...remove
        ].filter(item => !item.cdn || item.cdn())
    )
}
