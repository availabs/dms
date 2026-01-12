import React from 'react'

export const getSectionMenuItems = ({
      isEdit,
      onEdit,
      value,
      moveItem,
      TitleEditComp,
      LevelComp,
      updateAttribute,
      Switch,
      showDeleteModal, setShowDeleteModal,
      Permissions, AuthAPI, user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions,
      theme,
      attributes, i,
      refreshDataBtnRef, isRefreshingData, setIsRefreshingData
  }) => (
    [
        {icon: 'PencilSquare', name: 'Edit', onClick: onEdit, cdn: () => !isEdit && isUserAuthed(['edit-section'], sectionAuthPermissions)},
        {icon: 'Refresh', name: isRefreshingData ? 'Refreshing Data' : 'Refresh Data', onClick: () => {
                refreshDataBtnRef.current?.refresh({isRefreshingData, setIsRefreshingData})
            },
            cdn: () => !isEdit && isUserAuthed(['edit-section'], sectionAuthPermissions)},

        {icon: 'Refresh', name: isRefreshingData ? 'Caching Data' : 'Cache Data', onClick: () => {
                refreshDataBtnRef.current?.refresh({isRefreshingData, setIsRefreshingData, fullDataLoad: true})
            },
            cdn: () => !isEdit && isUserAuthed(['edit-section'], sectionAuthPermissions)},
        {icon: 'Refresh', name: isRefreshingData ? 'Clearing Cache' : 'Clear Cache', onClick: () => {
                refreshDataBtnRef.current?.refresh({clearCache: true})
            },
            cdn: () => !isEdit && isUserAuthed(['edit-section'], sectionAuthPermissions)},
        {icon: 'Copy', name: 'Copy Section', onClick: (e) => {
                handleCopy(value)

                const el = e.currentTarget;
                el.style.color = 'green';

                setTimeout(() => {
                    el.style.color = '';
                }, 2000);
            }},
        {type: 'separator'},

        {icon: 'ChevronUpSquare', name: 'Move Up', onClick: () => moveItem(i, -1), cdn: () => !isEdit && isUserAuthed(['edit-page-layout'], pageAuthPermissions)},
        {icon: 'ChevronDownSquare', name: 'Move Down', onClick: () => moveItem(i, 1), cdn: () => !isEdit && isUserAuthed(['edit-page-layout'], pageAuthPermissions)},
        {type: 'separator', cdn: () => !isEdit && isUserAuthed(['edit-page-layout'], pageAuthPermissions)},

        {
            icon: '',
            name: 'Display',
            items: [
                {
                    icon: '', name: 'Title',
                    items: [
                        {
                            icon: '', name: '',
                            type: () => {
                                return (
                                    <TitleEditComp
                                        className={`${theme?.heading?.base} ${theme?.heading[value?.['level']] || theme?.heading['default']}`}
                                        placeholder={'Section Title'}
                                        value={value?.['title'] || ''}
                                        onChange={(v) => updateAttribute('title', v)}
                                    />
                                )
                            }
                        }
                    ]
                },
                {
                    icon: '', name: 'Level',
                    items: [
                        {
                            icon: '', name: '',
                            type: () => {
                                return (
                                    <LevelComp
                                        className='p-2 w-full bg-transparent'
                                        value={value?.['level']}
                                        placeholder={'level'}
                                        options={attributes?.level?.options}
                                        onChange={(v) => updateAttribute('level', v)}
                                    />
                                )
                            }
                        }
                    ]
                },
                {
                    icon: '', name: 'Tags',
                    items: [
                        {
                            icon: '', name: '',
                            type: () => {
                                return (
                                    <TagComponent
                                        edit={true}
                                        className='p-2 flex-0'
                                        value={value?.['tags']}
                                        placeholder={'Add Tag...'}
                                        onChange={(v) => updateAttribute('tags', v)}
                                    />
                                )
                            }
                        }
                    ]
                },
                {
                    icon: '', name: 'Info Comp',
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
                    icon: '', name: 'Hide Comp',
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
        {
            name: 'Layout',
            items: [
                {
                    icon: 'Column', name: 'Width',
                    value: value?.['size'] || 1,
                    showValue: true,
                    items: Object.keys(theme?.sectionArray?.sizes || {}).sort((a, b) => {
                        let first = +theme?.sectionArray?.sizes?.[a].iconSize || 100
                        let second = +theme?.sectionArray?.sizes?.[b].iconSize || 100
                        return first - second
                    }).map((name, i) => {
                        return {
                            'icon': name == (value?.['size'] || '1') ? 'CircleCheck' : 'Blank',
                            id: crypto.randomUUID(), // to prevent duplicate entries
                            'name': name,
                            'onClick': () => {
                                console.log('colspan Item name click', name)
                                updateAttribute('size', name);
                            }
                        }
                    })
                },
                {
                    icon: 'Row', name: 'Rowspan',
                    value: value?.['rowspan'] || 1,
                    showValue: true,
                    items: Object.keys(theme?.sectionArray?.rowspans || {}).sort((a, b) => {
                        return +a - +b
                    }).map((name, i) => {
                        return {
                            'icon': name == (value?.['rowspan'] || '1') ? 'CircleCheck' : 'Blank',
                            id: crypto.randomUUID(),
                            'name': name,
                            'onClick': () => {
                                updateAttribute('rowspan', name);
                            }
                        }
                    })
                },
                {
                    icon: 'Padding', name: 'Offset',
                    value: value?.['offset'] || 16,
                    showValue: true,
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
                    icon: 'Padding', name: 'padding',
                    value: value?.['padding'] || theme?.sectionArray?.sectionPadding,
                    showValue: true,
                    items: ['p-0', 'p-1', 'p-2', theme?.sectionArray?.sectionPadding].map((v, i) => {
                        return {
                            'icon': v == (value?.['padding'] || '1') ? 'CircleCheck' : 'Blank',
                            'name': `${v}`,
                            'onClick': () => {
                                console.log('padding Item name click', v)
                                updateAttribute('padding', v);
                            }
                        }
                    }),
                },
                {
                    icon: 'Border', name: 'Border',
                    value: value?.['border'] || 1,
                    items: [
                        {
                            icon: '', name: 'border', type: () => {
                                return (
                                    <div className={'flex flex-wrap gap-1'}>
                                        {
                                            Object.keys(theme?.sectionArray?.border || {})
                                                .map((name, i) => {
                                                    return (
                                                        <div
                                                            className={`px-4 py-2 rounded-md ${name == (value?.['border'] || 'None') ? `bg-blue-300` : ``} hover:bg-blue-100`}
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
        {
            icon: 'AccessControl', name: 'Permissions',
            cdn: () => isUserAuthed(['edit-section-permissions'], sectionAuthPermissions),
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
        {type: 'separator'},
        {icon: 'TrashCan', name: 'Delete', onClick: () => setShowDeleteModal(!showDeleteModal),
            cdn: () => isUserAuthed(['edit-section'], sectionAuthPermissions)
        }
    ].filter(item => !item.cdn || item.cdn())
)
