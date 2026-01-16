import React from 'react'
import {handleCopy, handlePaste, TagComponent} from "./section_utils"
import { getComponentTheme } from "../../../../ui/useTheme";

export const getSectionMenuItems = ({ state, actions, auth, ui }) => {
    const { isEdit, value, attributes, i, theme, showDeleteModal } = state
    const { onEdit, moveItem, updateAttribute, updateElementType, onChange, setKey, setState, setShowDeleteModal } = actions
    const { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI } = auth
    const { Switch, TitleEditComp, LevelComp, refreshDataBtnRef, isRefreshingData, setIsRefreshingData, RegisteredComponents = {} } = ui

    const canEditSection = isUserAuthed(['edit-section'], sectionAuthPermissions);
    const canEditPageLayout = isUserAuthed(['edit-page-layout'], pageAuthPermissions);
    const canEditSectionPermissions = isUserAuthed(['edit-section-permissions'], sectionAuthPermissions);

    // =================================================================================================================
    // ======================================== menu item groups begin =================================================
    // =================================================================================================================
    const editCopyPaste = [
        {
            icon: 'PencilSquare', name: 'Edit', cdn: () => !isEdit && canEditSection, onClick: onEdit
        },
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
            name: 'Component', cdn: () => canEditSection, value: (value?.element?.['element-type'] === 'lexical' ? 'Rich Text' : value?.element?.['element-type']) || 'Rich Text',
            showValue: true, showSearch: true,
            items: Object.keys(RegisteredComponents)
                .filter(k => !RegisteredComponents[k].hideInSelector)
                .map(k => (
                    {
                        icon: k === (value?.element?.['element-type'] || 'lexical') ? 'CircleCheck' : 'Blank',
                        name: RegisteredComponents[k].name || k,
                        onClick: () => updateElementType(k)
                    }
                )),
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
            ...display,
            ...layout,
            ...permissions,
            {type: 'separator'},
            ...remove
        ].filter(item => !item.cdn || item.cdn())
    )
}
