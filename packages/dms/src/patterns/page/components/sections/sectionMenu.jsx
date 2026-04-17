import React, {useState} from 'react'
import {handleCopy, handleCopyToClipboard, handlePaste} from "./section_utils"
import {TagComponent} from "./section_components"
import { getComponentTheme } from "../../../../ui/useTheme";
import {ComplexFilters} from "./ComplexFilters";
import ColumnManager from "./ColumnManager";


export const getSectionMenuItems = ({ sectionState, actions, auth, ui, dataSource={}, dwAPI, pageDataSources={}, ...rest }) => {
    const { isEdit, value, attributes, i, showDeleteModal, listAllColumns, state: rawState, setSectionState } = sectionState
    const state = rawState || { columns: [], display: {}, externalSource: { columns: [] }, filters: { op: 'AND', groups: [] } }
    const { onEdit, moveItem, updateAttribute, updateElementType, onChange, onCancel, onSave, onAddHelpText, setKey, setState, setShowDeleteModal, setListAllColumns } = actions
    const { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI } = auth
    const { Switch, Pill, Icon, TitleEditComp, LevelComp, refreshDataBtnRef, isRefreshingData, setIsRefreshingData, theme, RegisteredComponents = {} } = ui
    const { activeSource, activeView, sources=[], views=[], onSourceChange, onViewChange, onJoinChange, activeJoinViewsByAlias={}, isJoinPresent } = dataSource;

    const sectionLink = window ? `${window.location.origin}${window.location.pathname}#${value.id}` : '';
    const canEditSection = isUserAuthed(['edit-section'], sectionAuthPermissions);
    const canEditPageLayout = isUserAuthed(['edit-page-layout'], pageAuthPermissions);
    const canEditSectionPermissions = isUserAuthed(['edit-section-permissions'], sectionAuthPermissions);
    const currentComponent = RegisteredComponents[value?.element?.['element-type'] || 'lexical'];
    // Resolve controls - may be a function that receives theme, or a static object
    const resolvedControls = typeof currentComponent?.controls === 'function'
        ? currentComponent.controls(theme)
        : currentComponent?.controls;
    const currentComponentStyle = theme[currentComponent?.themeKey || currentComponent?.name];
    // =================================================================================================================
    // ============================================ helpers begin ======================================================
    // =================================================================================================================
    const groupControl = resolvedControls?.columns?.find(c => c.key === 'group') || {};


    // Registry of control type transformers - all use nested submenu pattern
    const controlItemTransformers = {
        select: (item, value) => ({
            id: item.key,
            icon: item.icon,
            name: item.label,
            value: item.options?.find(opt => opt.value === value)?.label || value || '',
            showValue: true,
            items: item.options?.map(opt => ({
                id: `${item.key}_${opt.value}`,
                icon: opt.value === value ? 'CircleCheck' : 'Blank',
                name: opt.label,
                onClickGoBack: item.onClickGoBack,
                onClickGoHome: item.onClickGoHome,
                onClick: () => dwAPI.setDisplay(item.key, opt.value, item.onChange)
            }))
        }),
        colorpicker: (item, value) => ({
            id: item.key,
            icon: item.icon,
            name: item.label,
            showValue: false,
            items: [{
                id: `${item.key}_colorpicker`,
                name: `${item.label} color`,
                type: 'colorpicker', noHover: true,
                value, colors: item.colors, showColorPicker: item.showColorPicker,
                onChange: (newColor) => dwAPI.setDisplay(item.key, newColor, item.onChange)
            }]
        }),
        toggle: (item, value) => ({
            id: item.key,
            icon: item.icon, name: item.label, showLabel: true, type: 'toggle',
            enabled: item.negate ? !value : !!value,
            setEnabled: (v) => dwAPI.setDisplay(item.key, item.negate ? !v : v, item.onChange)
        }),
        input: (item, value) => ({
            id: item.key,
            icon: item.icon,
            name: item.label,
            value,
            showValue: true,
            items: [{
                id: `${item.key}_input`,
                name: `${item.label} input`,
                type: 'input', inputType: item.inputType, value,
                onChange: (e) => dwAPI.setDisplay(item.key,
                    item.inputType === 'number' ? +(e?.target?.value ?? e) : (e?.target?.value ?? e),
                    item.onChange)
            }]
        }),
    };

    const getDisplayValue = (key) => {
        if (!key?.includes('.')) return state.display?.[key];
        const [parent, child] = key.split('.');
        return state.display?.[parent]?.[child];
    };

    const transformControlItem = (item) => {
        const value = getDisplayValue(item.key) ?? item.defaultValue;
        if (typeof item.type === 'function') {
            return {
                id: item.key, icon: item.icon, name: item.label,
                type: () => item.type({ value, setValue: v => dwAPI?.setDisplay?.(item.key, v, item.onChange), state: dwAPI?.state, setState: dwAPI?.setState, dwAPI })
            };
        }

        if(controlItemTransformers[item.type]){
            return controlItemTransformers[item.type]?.(item, value)
        }

        if(item.items){
            return ({
                id: item.key,
                name: item.label,
                items: item.items
                    .filter(({ displayCdn }) => typeof displayCdn === 'function' ? displayCdn({ display: state.display }) : displayCdn !== false)
                    .map(i => controlItemTransformers[i.type]?.(i, state.display?.[i.key] ?? i.defaultValue))
            })
        }

        return { name: item.label }
    };
    // ============================================= helpers end =======================================================


    // =================================================================================================================
    // ======================================== menu item groups begin =================================================
    // =================================================================================================================
    const actionItems = [
        {
            name: 'Main Action Items',
            cdn: () => canEditSection || canEditPageLayout,
            renderCdn: activeParent => !activeParent,
            renderPos: 'top',
            type: () => {
                const [copied, setCopied] = useState('');

                return (
                    <div className={'w-full flex justify-between'}>
                        <div className={'flex gap-1'}>
                            {/*{isEdit && canEditSection ? <Pill color={'blue'} text={<Icon icon={'InfoSquare'} className={'size-5'} />} title={'Add Help Text'} onClick={onAddHelpText} /> : null}*/}

                            <Pill color={copied === 'link' ? 'green' : 'blue'} text={<Icon icon={'Link'} className={'size-5'}/>}
                                  title={'Copy Link'}
                                  onClick={(e) => {
                                      handleCopyToClipboard(sectionLink)
                                      setCopied('link')
                                      setTimeout(() => {
                                          setCopied('')
                                      }, 2000);
                                  }}/>

                            {canEditSection ? <Pill color={copied === 'section' ? 'green' : 'blue'} text={<Icon icon={'Copy'} className={'size-5'}/>}
                                                    title={'Copy Section'}
                                                    onClick={(e) => {
                                                        handleCopy(value)
                                                        setCopied('section')
                                                        setTimeout(() => {
                                                            setCopied('')
                                                        }, 2000);
                                                    }}/> : null}
                            {isEdit && canEditSection ? <Pill color={'blue'} text={<Icon icon={'Paste'} className={'size-5'}/>} title={'Paste Section'}
                                                              onClick={e => handlePaste(e, setKey, setSectionState, value, onChange)}/> : null}

                            {!isEdit && canEditPageLayout ?
                                <Pill color={'blue'} text={<Icon icon={'ChevronUpSquare'} className={'size-5'} />} title={'Move Up'}
                                      onClick={() => moveItem(i, -1)} />  : null}

                            {!isEdit && canEditPageLayout ?
                                <Pill color={'blue'} text={<Icon icon={'ChevronDownSquare'} className={'size-5'} />} title={'Move Down'}
                                      onClick={() => moveItem(i, 1)} /> : null}
                            {!isEdit && canEditSection ? <Pill color={'blue'} text={<Icon icon={'Refresh'} className={'size-5'} />} title={'Refresh Data'} onClick={() => refreshDataBtnRef.current?.refresh({isRefreshingData, setIsRefreshingData})} /> : null}

                        </div>

                        <div className={'flex gap-1'}>
                            {isEdit && canEditSection ? <Pill color={'blue'} text={<Icon icon={'FloppyDisk'} className={'size-5'} />} title={'Save'} onClick={onSave} /> : null}
                            {isEdit ?
                                <Pill color={'orange'} text={<Icon icon={'CancelCircle'} className={'size-5'}/>}
                                      title={'Cancel'} onClick={onCancel}/> :
                                canEditSection ?
                                    <Pill color={'blue'} text={<Icon icon={'PencilSquare'} className={'size-5'} />} title={'Edit'} onClick={onEdit} /> : null
                            }
                        </div>
                    </div>
                )
            }
        },
        {
            name: 'Sub Action Items',
            cdn: () => canEditSection || canEditPageLayout,
            renderCdn: activeParent => !!activeParent,
            renderPos: 'top',
            type: (_, {goBack, goHome}) => (
                <div className={'w-full flex justify-between'}>
                    <div className={'flex gap-1'}>
                        <Pill color={'blue'} text={<Icon icon={'ArrowLeft'} className={'size-5'} />} title={'Back'} onClick={goBack} />
                        <Pill color={'blue'} text={<Icon icon={'Home'} className={'size-5'} />} title={'Home'} onClick={goHome} />
                    </div>

                    <div className={'flex gap-1'}>
                        {isEdit && canEditSection ? <Pill color={'blue'} text={<Icon icon={'FloppyDisk'} className={'size-5'} />} title={'Save'} onClick={onSave} /> : null}
                        {isEdit ?
                            <Pill color={'orange'} text={<Icon icon={'CancelCircle'} className={'size-5'}/>}
                                  title={'Cancel'} onClick={onCancel}/> :
                            canEditSection ?
                                <Pill color={'blue'} text={<Icon icon={'PencilSquare'} className={'size-5'} />} title={'Edit'} onClick={onEdit} /> : null}
                    </div>
                </div>
            )
        }
    ]

    const { dataSources: pageLevelSources = {}, dataSourceId: currentDataSourceId, switchDataSource } = pageDataSources;
    const pageLevelSourceList = Object.values(pageLevelSources);
    const currentPageSource = currentDataSourceId ? pageLevelSources[currentDataSourceId] : null;

    const dataset =
        {
            name: 'Dataset', icon: 'Database',
            cdn: () => currentComponent?.useDataSource && canEditSection,
            value: currentPageSource?.name || sources?.find(s => s.key === activeSource)?.label, showValue: true,
            items: [
                // Page-level data sources (shared across sections)
                {name: 'Page Data Sources', icon: 'Database', showSearch: pageLevelSourceList.length > 5, cdn: () => isEdit && pageLevelSourceList.length > 0,
                    value: currentPageSource?.name, showValue: !!currentPageSource,
                    items: pageLevelSourceList.map(ds => ({
                        icon: ds.id === currentDataSourceId ? 'CircleCheck' : 'Blank',
                        id: ds.id,
                        name: ds.name || 'Unnamed Source',
                        onClickGoBack: true,
                        onClick: () => switchDataSource?.(ds.id)
                    }))},
                {type: 'separator', cdn: () => isEdit && pageLevelSourceList.length > 0},
                // Direct source/version picker (creates inline, auto-promotes to page level)
                {name: 'Source', icon: 'Database', showSearch: true, cdn: () => isEdit,
                    value: sources?.find(s => s.key === activeSource)?.label, showValue: true,
                    items: sources.map(({key, label}) => ({
                        icon: key === activeSource ? 'CircleCheck' : 'Blank',
                        id: `source_${key}`,
                        name: label,
                        onClickGoBack: true,
                        onClick: () => onSourceChange(key)
                    }))},
                {name: 'Version', icon: 'Database', showSearch: true, cdn: () => isEdit,
                    value: views?.find(s => s.key === activeView)?.label || activeView, showValue: true,
                    items: views.map(({key, label}) => ({
                        icon: key === activeView ? 'CircleCheck' : 'Blank',
                        id: `version_${key}`,
                        name: label,
                        onClickGoBack: true,
                        onClick: () => onViewChange(key)
                    }))},
                {type: 'separator', cdn: () => isEdit},
                ...(resolvedControls?.data || [])
                    .filter(({ displayCdn }) => isEdit && (typeof displayCdn === 'function' ? displayCdn({ display: state.display }) : displayCdn !== false))
                    .map(transformControlItem),
            ].filter(item => !item.cdn || item.cdn())
        }

        //RYAN TODO -- change the `onClick` for both these items
        //RYAN TODO -- add UI stuff, start with "join condition"

    const join = {
        name: 'Join Dataset', id: "join_settings", icon: 'Group',
        cdn: () => canEditSection && currentComponent?.useDataSource && (isEdit || isJoinPresent) && activeSource,
        value: `Sources: ${Object.keys(state?.join?.sources || {}).length}`,
        showValue: true,
        items: [
            ...Object.keys(state?.join?.sources || {}).filter(sAlias => sAlias !== 'ds').map(sourceAlias => ({
                name: sources?.find(s => s.key === state.join.sources[sourceAlias].source)?.label || `Dataset (${sourceAlias})`, 
                id: `join_dataset_${sourceAlias}`,
                icon: 'Group',
                cdn: () => canEditSection && isEdit,
                items: [
                    { name: 'Remove Dataset', icon: 'TrashCan', cdn: () => isEdit, onClickGoBack: true, onClick: () => dataSource.removeJoinSource(sourceAlias) },
                    { type: 'separator', cdn: () => isEdit },
                    { name: 'Source', icon: 'Database', showSearch: true, cdn: () => isEdit,
                        value: sources?.find(s => s.key === state.join.sources[sourceAlias].source)?.label, showValue: true,
                        items: sources.map(({key, label}) => ({
                            icon: key === state.join.sources[sourceAlias].source ? 'CircleCheck' : 'Blank',
                            id: `source_${sourceAlias}_${key}`,
                            name: label,
                            onClickGoBack: true,
                            onClick: () => onJoinChange(sourceAlias, 'source', key)
                        }))
                    },
                    { name: 'Version', icon: 'Database', showSearch: true, cdn: () => isEdit,
                        value: activeJoinViewsByAlias[sourceAlias]?.find(s => s.key === state.join.sources[sourceAlias].view)?.label || state.join.sources[sourceAlias].view, showValue: true,
                        items: activeJoinViewsByAlias[sourceAlias]?.map(({key, label}) => ({
                            icon: key === state.join.sources[sourceAlias].view ? 'CircleCheck' : 'Blank',
                            id: `version_${sourceAlias}_${key}`,
                            name: label,
                            onClickGoBack: true,
                            onClick: () => onJoinChange(sourceAlias, 'view', key)
                        }))
                    },
                    {
                        name: 'Join Configuration', // Group for join columns
                        icon: 'Link', // Placeholder icon
                        cdn: () => canEditSection && isEdit && state.join.sources[sourceAlias].source && state.join.sources[sourceAlias].sourceInfo?.columns,
                        items: [
                            // Picker for ds columns
                            {
                                name: 'Join on ds column',
                                id: `${sourceAlias}_ds_join`,
                                showSearch: true,
                                value: state.join.sources[sourceAlias]?.joinColumns?.[0]?.dsColumn, // Assuming only one join column for now
                                items: (state.externalSource.columns || []).map(col => ({
                                    icon: col?.name === state.join.sources[sourceAlias]?.joinColumns?.[0]?.dsColumn ? 'CircleCheck' : 'Blank',
                                    id: `join_ds_col_${sourceAlias}_${col?.name}`,
                                    name: col?.name,
                                    onClickGoBack: true,
                                    onClick: () => {
                                        const currentJoinColumns = state.join.sources[sourceAlias]?.joinColumns || [];
                                        console.log("ds, currentJoinCols",currentJoinColumns)

                                        /**
                                         * [
                                         *   {
                                         *      
                                         *   }
                                         * 
                                         * ]
                                         */
                                        const updatedJoinColumns = currentJoinColumns.length === 0
                                            ? [{ dsColumn: col.name, joinSourceColumn: state.join.sources[sourceAlias]?.joinColumns?.[0]?.joinSourceColumn }]
                                            : [{ ...currentJoinColumns[0], dsColumn: col.name }];
                                        onJoinChange(sourceAlias, 'joinColumns', updatedJoinColumns);
                                    }
                                }))
                            },
                            // Picker for sourceAlias columns
                            {
                                name: `Join on ${sourceAlias} column`,
                                id: `${sourceAlias}_secondary_join`,
                                showSearch: true,
                                value: state?.join?.sources[sourceAlias]?.joinColumns?.[0]?.joinSourceColumn, // Assuming only one join column
                                items: (state?.join?.sources[sourceAlias]?.sourceInfo?.columns || []).map(col => ({
                                    icon: col.name === state.join.sources[sourceAlias]?.joinColumns?.[0]?.joinSourceColumn ? 'CircleCheck' : 'Blank',
                                    id: `join_${sourceAlias}_col_${col.name}`,
                                    name: col.name,
                                    onClickGoBack: true,
                                    onClick: () => {
                                        const currentJoinColumns = state.join.sources[sourceAlias]?.joinColumns || [];
                                        console.log("2nd table, currentJoinCols",currentJoinColumns)
                                        const updatedJoinColumns = currentJoinColumns.length === 0
                                            ? [{ dsColumn: state.join.sources[sourceAlias]?.joinColumns?.[0]?.dsColumn, joinSourceColumn: col.name }]
                                            : [{ ...currentJoinColumns[0], joinSourceColumn: col.name }];
                                        onJoinChange(sourceAlias, 'joinColumns', updatedJoinColumns);
                                    }
                                }))
                            }
                        ].filter(item => !item.cdn || item.cdn())
                    }
                ]
            })),
            { type: 'separator', cdn: () => isEdit },
            // // ds join configuration
            // {
            //     name: 'Join Configuration (ds)',
            //     icon: 'Link', // Placeholder icon
            //     cdn: () => canEditSection && isEdit && state.externalSource.source_id && state.externalSource.columns,
            //     items: [
            //         // Picker for ds columns (which ds column to use for joining)
            //         {
            //             name: 'Join on ds column',
            //             showSearch: true,
            //             value: state?.join?.sources['ds']?.joinColumns?.[0]?.dsColumn,
            //             items: (state.externalSource.columns || []).map(col => ({
            //                 icon: col.name === state?.join?.sources['ds']?.joinColumns?.[0]?.dsColumn ? 'CircleCheck' : 'Blank',
            //                 id: `join_ds_col_ds_${col.name}`,
            //                 name: col.name,
            //                 onClickGoBack: true,
            //                 onClick: () => {
                                
            //                     const currentJoinColumns = state.join.sources['ds']?.joinColumns || [];
            //                     console.log({currentJoinColumns})
            //                     const updatedJoinColumns = currentJoinColumns.length === 0
            //                         ? [{ dsColumn: col.name, joinSourceColumn: state.join.sources['ds']?.joinColumns?.[0]?.joinSourceColumn }]
            //                         : [{ ...currentJoinColumns[0], dsColumn: col.name }];
            //                     onJoinChange('ds', 'joinColumns', updatedJoinColumns);
            //                 }
            //             }))
            //         }
            //     ].filter(item => !item.cdn || item.cdn())
            // },
            { name: 'Add Join Source', icon: 'Plus', cdn: () => isEdit, onClick: () => dataSource.addJoinSource() },
            { type: 'separator', cdn: () => isEdit },
                    // Removed JoinColumnManager for ds source

        ].filter(item => !item.cdn || item.cdn())
    }
    

    const columns = [
        {
            name: 'Columns', icon: 'Columns',
            cdn: () => isEdit && currentComponent?.useDataSource && canEditSection,
            value: (state.columns || []).length,
            showValue: true,
            items: [{
                name: 'Column Manager',
                noHover: true,
                type: () => (
                    <ColumnManager
                        dwAPI={dwAPI}
                        resolvedControls={resolvedControls}
                        showAllColumnsControl={currentComponent.showAllColumnsControl}
                        Pill={Pill}
                        Icon={Icon}
                        Switch={Switch}
                    />
                )
            }]
        },
    ]


    const filter = [
        {name: 'Filters', icon: 'Filter',
            value: `${parseInt(state?.display?.totalLength).toLocaleString()} rows`,
            showValue: true,
            cdn: () => isEdit && currentComponent?.useDataSource && canEditSection,
            items: [
                {name: 'Filter Groups Component', type: () => <ComplexFilters state={dwAPI.state} setState={dwAPI.setState} />}
            ]}
    ]


    const component = [
        {
            name: 'Type', icon: 'ListView', cdn: () => canEditSection, value: currentComponent?.name,
            showValue: true, showSearch: true,
            items: Object.keys(RegisteredComponents)
                .filter(k => !RegisteredComponents[k].hideInSelector &&
                    // don't allow conversion of incompatible components in view mode
                    (isEdit || (['Spreadsheet', 'Card', 'Graph'].includes(currentComponent?.name) && ['Spreadsheet', 'Card', 'Graph'].includes(k)))
                )
                .map(k => (
                    {
                        icon: RegisteredComponents[k].name === currentComponent?.name ? 'CircleCheck' : 'Blank',
                        onClickGoBack: true,
                        name: RegisteredComponents[k].name || k,
                        onClick: () => updateElementType(k)
                    }
                )),
        },
    ]

    const componentSettings = [
      {
        name: `${currentComponent?.name} Settings`, icon: 'ListView',
        cdn: () => isEdit && canEditSection,
        showSearch: true,
        items: [
          ...(resolvedControls?.more || [])
            .filter(({ displayCdn }) => typeof displayCdn === 'function' ? displayCdn({ display: state.display }) : displayCdn !== false)
            .map(transformControlItem),
          ...(resolvedControls?.default || [])
              .filter(({displayCdn}) => typeof displayCdn === 'function' ? displayCdn({display: state.display}) : displayCdn !== false)
              .map(transformControlItem),
            // other item / component specific controls
          ...Object.keys(resolvedControls || {})
              .filter(controlGroup => {
                  if (!isEdit || !canEditSection) return false;
                  if (['columns', 'more', 'data', 'inHeader', 'default'].includes(controlGroup)) return false;
                  const config = resolvedControls?.[controlGroup];
                  if (typeof config?.displayCdn === 'function' && !config.displayCdn({ display: state.display })) return false;
                  return true;
              })
              .map(controlGroup => {
                  const config = resolvedControls?.[controlGroup];
                  const groupId = `ctrl_${controlGroup}`;
                  if (!config?.items?.length) {
                      const rawType = config?.type;
                      const wrappedType = typeof rawType === 'function'
                          ? () => rawType({ state: dwAPI?.state, setState: dwAPI?.setState, dwAPI })
                          : rawType;
                      return { id: groupId, name: config?.name || controlGroup, items: [{name: 'component', type: wrappedType}] };
                  }
                  return {
                      id: groupId,
                      name: config.name || controlGroup,
                      showSearch: config.showSearch,
                      items: config.items
                          .filter(({displayCdn}) => typeof displayCdn === 'function' ? displayCdn({display: state.display}) : displayCdn !== false)
                          .map(transformControlItem)
                  };
              })
        ]
      },
    ]

    const display = [
        {
            name: 'Display', icon: 'Section',
            cdn: () => isEdit,
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
                    name: 'Add Help Text',
                    cdn: () => canEditSection,
                    onClick: onAddHelpText
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
            ].filter(item => item.cdn())
        },
    ].filter(item => item.cdn())

    const styles = currentComponentStyle?.styles || [];
    const activeStyle = value?.activeStyle || currentComponentStyle?.options?.activeStyle;
    const activeStyleName = styles[activeStyle]?.name || activeStyle;

    const layout = [
        {
            name: 'Layout', icon: 'Section',
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
                            id: `size_${name}`,
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
                            id: `rowspan_${name}`,
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
                            id: `padding_${v}`,
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
            ...actionItems,
            {type: 'separator', renderCdn: () => true, renderPos: 'top'},
            ...component,
            ...componentSettings,
            {type: 'separator'},
            dataset,
            join,
            ...columns,
            ...filter,
            {type: 'separator', cdn: () => currentComponent?.useDataSource && canEditSection},
            ...display,
            ...layout,
            {type: 'separator'},
            ...remove
        ].filter(item => !item.cdn || item.cdn())
    )
}
