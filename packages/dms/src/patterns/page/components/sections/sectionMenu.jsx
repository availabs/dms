//RYAN TODO -- still prob need to clean up some of the sectionMenuItems
import React, {useState, useEffect} from 'react'
import {handleCopy, handleCopyToClipboard, handlePaste} from "./section_utils"
import {TagComponent, ActionBtn} from "./section_components"
import { getComponentTheme, ThemeContext } from "../../../../ui/useTheme";
import { sectionMenuTheme } from "./sectionMenu.theme";
import {ComplexFilters} from "./ComplexFilters";
import ColumnManager from "./ColumnManager";
import TemplateManager from "./TemplateManager";
import { coerceControlValue, getColumnLabel } from "./controls_utils";
import { getSectionMenuExtensions } from "./sectionMenuExtensions";
import ColorControls from "./components/ComponentRegistry/sharedControls/ColorControls";


/**
 * Draft text input that holds a local draft so typing doesn't churn section
 * state on every keystroke, committing (via onCommit) only on blur or Enter —
 * i.e. when the author leaves the field / navigates back out of the sub-menu.
 * Used across the section menus (e.g. the Comparison Series variant fields) where a
 * commit should fire only when the author leaves the field, not per keystroke.
 *
 * `validate`, when given, runs on commit and returns an error string to block the
 * commit (draft stays, `Input` gets `aria-invalid` for the theme's red-border state,
 * a short message renders below) or a falsy value to allow it through.
 */

const CommitInput = ({ initialValue = '', onCommit, validate }) => {
    const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const sm = { ...sectionMenuTheme, ...getComponentTheme(themeFromContext, 'pages.sectionMenu') };
    const { Input } = UI || {};
    const [draft, setDraft] = useState(initialValue);
    const [error, setError] = useState('');
    // Re-sync if the committed value changes from elsewhere (e.g. section reload).
    useEffect(() => { setDraft(initialValue); setError(''); }, [initialValue]);

    const commit = () => {
        if (draft === initialValue) return;
        const validationError = validate ? validate(draft) : '';
        if (validationError) { setError(validationError); return; }
        setError('');
        onCommit(draft);
    };

    return (
        <>
            <Input
                type="text"
                value={draft}
                aria-invalid={!!error}
                onChange={e => { setDraft(e?.target?.value ?? e); if (error) setError(''); }}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target?.blur?.(); } }}
            />
            {error ? <div className={sm.menuError}>{error}</div> : null}
        </>
    );
};
const isEmpty = obj => Object.values(obj).every(v => !v || Object.keys(v).length === 0);

export const getSectionMenuItems = ({ sectionState, actions, auth, ui, dataSource={}, dwAPI, settingsAPI, pageDataSources={}, siblingSections=[], ...rest }) => {
    const { isEdit, value, attributes, i, showDeleteModal, listAllColumns, state: rawState, setSectionState } = sectionState
    const state = rawState || { columns: [], display: {}, externalSource: { columns: [] }, filters: { op: 'AND', groups: [] } }
    const { onEdit, moveItem, updateAttribute, updateElementType, onChange, onCancel, onSave, onAddHelpText, setKey, setState, setShowDeleteModal, setListAllColumns } = actions
    const { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, canEditPageContent, Permissions, AuthAPI } = auth
    const { Switch, Pill, Icon, TitleEditComp, LevelComp, refreshDataBtnRef, isRefreshingData, setIsRefreshingData, theme, RegisteredComponents = {}, sectionArrayStyle, groupCollapsible } = ui
    // The band's `pages.sectionArray` style — the SAME resolution sectionArray.jsx
    // renders with. Without the style name every lookup below returned styles[0],
    // so a theme whose named styles replace `sizes` (a 12-column grid keyed
    // "1"…"12") offered the default fractions ("1/3"…), which matched nothing at
    // render time and silently fell back to full width.
    const sectionArrayTheme = getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle)
    // Icon size in the menu's action rows (copy link / copy / paste / move / edit / save / cancel,
    // back / home) — `pages.section` menuActionIcon (pre-v6 'size-5', kept by the legacy freeze).
    const menuActionIcon = getComponentTheme(theme, 'pages.section').menuActionIcon || 'size-5'
    // the Layout sub-pages' pickers (padding / border / radius / background) — pages.sectionMenu
    const sm = { ...sectionMenuTheme, ...getComponentTheme(theme, 'pages.sectionMenu') }
    const { activeSource, activeView, sources=[], views=[], onSourceChange, onViewChange, onJoinChange, activeJoinViewsByAlias={}, isJoinPresent } = dataSource;

    const sectionLink = window ? `${window.location.origin}${window.location.pathname}#${value.id}` : '';
    const sectionHasPermissions = sectionAuthPermissions && !isEmpty(sectionAuthPermissions)
    const canEditSection = !sectionHasPermissions || isUserAuthed(['edit', 'edit-section'], sectionAuthPermissions);
    const canEditPageLayout = isUserAuthed(['edit-page', 'edit-page-layout'], pageAuthPermissions);
    const canEditSectionPermissions = isUserAuthed(['edit-page-permissions'], pageAuthPermissions);
    const currentComponent = RegisteredComponents[value?.element?.['element-type'] || 'lexical'];

// console.log("getSectionMenuItems::currentComponent", currentComponent)

    /**
     * A component whose registry entry sets `managesOwnState` (e.g. Map, which
     * doesn't use the dataWrapper) supplies its own settings-menu API through
     * its handle's `settingsAPI`; every other section uses dwAPI. The flag (not
     * just the handle field) keeps a section whose type was just switched away
     * from such a component off its stale cached API.
     */
    const componentAPI = currentComponent?.managesOwnState && settingsAPI?.setState ? settingsAPI : dwAPI;

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
                // Forwarded to the DOM input (NavigableMenu spreads the whole
                // menuItem into ui/components/Input, which spreads ...props onto
                // <input>) so the spinner/arrow keys respect the same range the
                // write path clamps to.
                min: item.min, max: item.max, step: item.step,
                // `placeHolder` may be a function of (display, theme) so a control can show the
                // value it would INHERIT when the field is empty — greyed, so it reads as
                // automatic rather than as something the author typed. Plain strings are
                // unchanged, so every existing control behaves exactly as before.
                placeholder: typeof item.placeHolder === 'function'
                    ? item.placeHolder(state?.display, theme)
                    : item.placeHolder,
                // Clamps to min/max and turns a blank field into "unset" — see
                // coerceControlValue for why a raw `+value` here was destructive.
                onChange: (e) => dwAPI.setDisplay(item.key, coerceControlValue(item, e), item.onChange)
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
                type: () => item.type({ value, setValue: v => dwAPI?.setDisplay?.(item.key, v, item.onChange), state: componentAPI?.state, setState: componentAPI?.setState, dwAPI, settingsAPI })
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
                    // Recurse so grouped items pick up the same handling as
                    // top-level entries — function-typed controls (e.g. color
                    // pickers), nested groups, and dotted display keys all
                    // work, not just the four registry entries.
                    .map(transformControlItem)
                    .filter(Boolean)
            })
        }

        return { name: item.label }
    };
    // ============================================= helpers end =======================================================

    // =================================================================================================================
    // =========================================== component interactions helpers begin ===============================================
    // =================================================================================================================
    const componentFunctions = currentComponent?.componentFunctions;
    const hasComponentFunctions = !!(componentFunctions?.providers?.length || componentFunctions?.subscribers?.length);
    const setInteractionState = componentAPI?.setState;

    const updateFunctionEntry = (side, functionId, updater) => {
        setInteractionState?.(draft => {
            if (!draft.display) {
                draft.display = {};
            }
            if (!draft.display._functions) {
                draft.display._functions = { providers: [], subscribers: [] };
            }
            if (!draft.display._functions[side]) {
                draft.display._functions[side] = [];
            }
            const existing = draft.display._functions[side].find(f => f.functionId === functionId);
            if (existing) {
                updater(existing);
            } else {
                const entry = { functionId, enabled: false };
                updater(entry);
                draft.display._functions[side].push(entry);
            }
        });
    };

    const getFunctionEntry = (side, functionId) =>
        state.display?._functions?.[side]?.find(f => f.functionId === functionId);

    const buildFunctionMenuItems = (fnList, side) => (fnList || []).map(fn => {
        const entry = getFunctionEntry(side, fn.id);

        const paramKeyItem = {
            id: `fn_${side}_${fn.id}_paramkey`,
            name: 'Param Key',
            value: entry?.paramKey || '',
            showValue: true,
            items: [{
                id: `fn_${side}_${fn.id}_paramkey_input`,
                name: 'Param Key',
                type: 'input',
                inputType: 'text',
                value: entry?.paramKey || '',
                onChange: (e) => {
                    const val = e?.target?.value ?? e;
                    updateFunctionEntry(side, fn.id, e => { e.paramKey = val; });
                }
            }]
        };

        const argItems = (fn.args || []).map(arg => {
            if (arg.type === 'column-select') {
                const cols = state.columns || [];
                return {
                    id: `fn_${side}_${fn.id}_arg_${arg.key}`,
                    name: arg.label,
                    value: entry?.args?.[arg.key] || (cols.length ? '' : 'No columns'),
                    showValue: true,
                    items: cols.length
                        ? cols.map(col => ({
                            id: `fn_${side}_${fn.id}_arg_${arg.key}_${col.name}`,
                            icon: col.name === entry?.args?.[arg.key] ? 'CircleCheck' : 'Blank',
                            name: col.name,
                            onClickGoBack: true,
                            onClick: () => updateFunctionEntry(side, fn.id, e => {
                                if (!e.args) e.args = {};
                                e.args[arg.key] = col.name;
                            })
                        }))
                        : [{ name: 'No columns available', type: 'label' }]
                };
            }
            if (arg.type === 'input') {
                return {
                    id: `fn_${side}_${fn.id}_arg_${arg.key}`,
                    name: arg.label,
                    value: entry?.args?.[arg.key] || '',
                    showValue: true,
                    items: [{
                        id: `fn_${side}_${fn.id}_arg_${arg.key}_input`,
                        name: arg.label,
                        type: 'input',
                        inputType: arg.inputType || 'text',
                        value: entry?.args?.[arg.key] || '',
                        onChange: (e) => updateFunctionEntry(side, fn.id, entry => {
                            if (!entry.args) {
                                entry.args = {};
                            }
                            entry.args[arg.key] = e?.target?.value ?? e;
                        })
                    }]
                };
            }
            if (arg.type === 'select') {
                const options = typeof arg.options === 'function'
                    ? arg.options({ state: componentAPI?.state, dwAPI, settingsAPI }) || []
                    : arg.options?.stateKey
                        ? arg.options.stateKey.split('.').reduce((acc, key) => acc?.[key], componentAPI?.state) || []
                        : (arg.options || []);
                return {
                    id: `fn_${side}_${fn.id}_arg_${arg.key}`,
                    name: arg.label,
                    value: options.find(o => o.value === entry?.args?.[arg.key])?.label || '',
                    showValue: true,
                    items: options.map(opt => ({
                        id: `fn_${side}_${fn.id}_arg_${arg.key}_${opt.value}`,
                        icon: opt.value === entry?.args?.[arg.key] ? 'CircleCheck' : 'Blank',
                        name: opt.label,
                        onClickGoBack: true,
                        onClick: () => updateFunctionEntry(side, fn.id, e => {
                            if (!e.args) e.args = {};
                            e.args[arg.key] = opt.value;
                        })
                    }))
                };
            }
            return null;
        }).filter(Boolean);

        return {
            id: `fn_${side}_${fn.id}`,
            icon: side === 'providers' ? 'Upload' : 'Download1',
            name: fn.label,
            value: entry?.enabled ? 'active' : 'inactive', showValue: true,
            items: [
                {
                    id: `fn_${side}_${fn.id}_enabled`,
                    name: 'Enabled',
                    type: 'toggle',
                    enabled: !!entry?.enabled,
                    setEnabled: (v) => updateFunctionEntry(side, fn.id, e => { e.enabled = v; })
                },
                { type: 'separator' },
                paramKeyItem,
                ...argItems,
            ]
        };
    });

    const componentInteractions = hasComponentFunctions ? [{
        name: `${currentComponent?.name} Interactions`, icon: 'TouchInteraction',
        cdn: () => isEdit && canEditSection,
        items: [
            ...buildFunctionMenuItems(componentFunctions?.providers, 'providers'),
            ...buildFunctionMenuItems(componentFunctions?.subscribers, 'subscribers'),
        ]
    }] : [];
    // ============================================= actions helpers end ===============================================


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
                            {/*{isEdit && canEditSection ? <Pill activeStyle={'blue'} text={<Icon icon={'InfoSquare'} className={menuActionIcon} />} title={'Add Help Text'} onClick={onAddHelpText} /> : null}*/}

                            <ActionBtn color={copied === 'link' ? 'green' : 'blue'} text={<Icon icon={'Link'} className={menuActionIcon}/>}
                                  title={'Copy Link'}
                                  onClick={(e) => {
                                      handleCopyToClipboard(sectionLink)
                                      setCopied('link')
                                      setTimeout(() => {
                                          setCopied('')
                                      }, 2000);
                                  }}/>

                            {(canEditSection || canEditPageContent) ?
                                <ActionBtn color={copied === 'section' ? 'green' : 'blue'} text={<Icon icon={'Copy'} className={menuActionIcon}/>}
                                                    title={'Copy Section'}
                                                    onClick={(e) => {
                                                        handleCopy(value)
                                                        setCopied('section')
                                                        setTimeout(() => {
                                                            setCopied('')
                                                        }, 2000);
                                                    }}/> : null}
                            {isEdit && canEditSection ? <ActionBtn color={'blue'} text={<Icon icon={'Paste'} className={menuActionIcon}/>} title={'Paste Section'}
                                                              onClick={e => handlePaste(e, setKey, setSectionState, value, onChange)}/> : null}

                            {!isEdit && canEditPageLayout && canEditSection ?
                                <ActionBtn color={'blue'} text={<Icon icon={'ChevronUpSquare'} className={menuActionIcon} />} title={'Move Up'}
                                      onClick={() => moveItem(i, -1)} />  : null}

                            {!isEdit && canEditPageLayout && canEditSection ?
                                <ActionBtn color={'blue'} text={<Icon icon={'ChevronDownSquare'} className={menuActionIcon} />} title={'Move Down'}
                                      onClick={() => moveItem(i, 1)} /> : null}
                            {!isEdit && canEditSection ? <ActionBtn color={'blue'} text={<Icon icon={'Refresh'} className={menuActionIcon} />} title={'Refresh Data'} onClick={() => refreshDataBtnRef.current?.refresh({isRefreshingData, setIsRefreshingData})} /> : null}

                        </div>

                        <div className={'flex gap-1'}>
                            {isEdit && canEditSection ? <ActionBtn kind='save' color={'blue'} text={<Icon icon={'FloppyDisk'} className={menuActionIcon} />} title={'Save'} onClick={onSave} /> : null}
                            {isEdit ?
                                <ActionBtn color={'orange'} text={<Icon icon={'CancelCircle'} className={menuActionIcon}/>}
                                      title={'Cancel'} onClick={onCancel}/> :
                                canEditSection ?
                                    <ActionBtn color={'blue'} text={<Icon icon={'PencilSquare'} className={menuActionIcon} />} title={'Edit'} onClick={onEdit} /> : null
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
                        <ActionBtn color={'blue'} text={<Icon icon={'ArrowLeft'} className={menuActionIcon} />} title={'Back'} onClick={goBack} />
                        <ActionBtn color={'blue'} text={<Icon icon={'Home'} className={menuActionIcon} />} title={'Home'} onClick={goHome} />
                    </div>

                    <div className={'flex gap-1'}>
                        {isEdit && canEditSection ? <ActionBtn kind='save' color={'blue'} text={<Icon icon={'FloppyDisk'} className={menuActionIcon} />} title={'Save'} onClick={onSave} /> : null}
                        {isEdit ?
                            <ActionBtn color={'orange'} text={<Icon icon={'CancelCircle'} className={menuActionIcon}/>}
                                  title={'Cancel'} onClick={onCancel}/> :
                            canEditSection ?
                                <ActionBtn color={'blue'} text={<Icon icon={'PencilSquare'} className={menuActionIcon} />} title={'Edit'} onClick={onEdit} /> : null}
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
                    { type: 'separator', cdn: () => isEdit },
                    { name: 'Merge Strategy', icon: 'Group', showSearch: false, cdn: () => isEdit,
                        value: state.join.sources[sourceAlias].mergeStrategy || 'join', showValue: true,
                        items: ['join', 'union', 'except'].map(t => ({
                            icon: (state.join.sources[sourceAlias].mergeStrategy || 'join') === t ? 'CircleCheck' : 'Blank',
                            id: `strategy_${sourceAlias}_${t}`,
                            name: t.toUpperCase(),
                            onClickGoBack: true,
                            onClick: () => onJoinChange(sourceAlias, 'mergeStrategy', t)
                        }))
                    },
                    { name: 'Merge Type', icon: 'Group', showSearch: false,
                        cdn: () => isEdit && ['join', 'union'].includes(state.join.sources[sourceAlias].mergeStrategy),
                        value: state.join.sources[sourceAlias].mergeStrategy === 'union'
                            ? (state.join.sources[sourceAlias].type === 'all' ? 'UNION ALL' : 'UNION')
                            : state.join.sources[sourceAlias].type,
                        showValue: true,
                        items: state.join.sources[sourceAlias].mergeStrategy === 'union'
                            ? [
                                {
                                    icon: (state.join.sources[sourceAlias].type !== 'all') ? 'CircleCheck' : 'Blank',
                                    id: `union_type_${sourceAlias}_null`,
                                    name: 'UNION',
                                    onClickGoBack: true,
                                    onClick: () => onJoinChange(sourceAlias, 'type', null)
                                },
                                {
                                    icon: (state.join.sources[sourceAlias].type === 'all') ? 'CircleCheck' : 'Blank',
                                    id: `union_type_${sourceAlias}_all`,
                                    name: 'UNION ALL',
                                    onClickGoBack: true,
                                    onClick: () => onJoinChange(sourceAlias, 'type', 'all')
                                }
                            ]
                            : ['left', 'inner', 'full outer'].map(t => ({
                                icon: (state.join.sources[sourceAlias].type) === t ? 'CircleCheck' : 'Blank',
                                id: `type_${sourceAlias}_${t}`,
                                name: t.toUpperCase(),
                                onClickGoBack: true,
                                onClick: () => onJoinChange(sourceAlias, 'type', t)
                            }))
                    },
                    {
                        name: 'Join On...', // Group for join columns
                        icon: 'Link',
                        cdn: () => canEditSection && isEdit && state.join.sources[sourceAlias].source && state.join.sources[sourceAlias].sourceInfo?.columns && (state.join.sources[sourceAlias].mergeStrategy) === 'join',
                        items: [
                            ...(state.join.sources[sourceAlias]?.joinColumns || []).map((joinPair, idx) => ({
                                name: `Pair ${idx + 1}`,
                                icon: 'Link',
                                items: [
                                    {
                                        name: 'Join on ds column',
                                        id: `${sourceAlias}_ds_join_${idx}`,
                                        showSearch: true,
                                        value: joinPair.dsColumn,
                                        items: (state.externalSource.columns || []).filter(sCol => !sCol.source_id || sCol.source_id === state.externalSource.source_id).map(col => ({
                                            icon: col?.name === joinPair.dsColumn ? 'CircleCheck' : 'Blank',
                                            id: `join_ds_col_${sourceAlias}_${idx}_${col?.name}`,
                                            name: col?.name,
                                            onClickGoBack: true,
                                            onClick: () => {
                                                const currentJoinColumns = [...(state.join.sources[sourceAlias]?.joinColumns || [])];
                                                currentJoinColumns[idx] = { ...currentJoinColumns[idx], dsColumn: col.name };
                                                onJoinChange(sourceAlias, 'joinColumns', currentJoinColumns);
                                            }
                                        }))
                                    },
                                    {
                                        name: `Join on ${sourceAlias} column`,
                                        id: `${sourceAlias}_secondary_join_${idx}`,
                                        showSearch: true,
                                        value: joinPair.joinSourceColumn,
                                        items: (state?.join?.sources[sourceAlias]?.sourceInfo?.columns || []).map(col => ({
                                            icon: col.name === joinPair.joinSourceColumn ? 'CircleCheck' : 'Blank',
                                            id: `join_${sourceAlias}_col_${idx}_${col.name}`,
                                            name: col.name,
                                            onClickGoBack: true,
                                            onClick: () => {
                                                const currentJoinColumns = [...(state.join.sources[sourceAlias]?.joinColumns || [])];
                                                currentJoinColumns[idx] = { ...currentJoinColumns[idx], joinSourceColumn: col.name };
                                                onJoinChange(sourceAlias, 'joinColumns', currentJoinColumns);
                                            }
                                        }))
                                    },
                                    {
                                        name: 'Delete Pair',
                                        icon: 'TrashCan',
                                        onClickGoBack: true,
                                        onClick: () => {
                                            const currentJoinColumns = [...(state.join.sources[sourceAlias]?.joinColumns || [])];
                                            currentJoinColumns.splice(idx, 1);
                                            onJoinChange(sourceAlias, 'joinColumns', currentJoinColumns);
                                        }
                                    }
                                ]
                            })),
                            {
                                name: 'Add Column Pair',
                                icon: 'Plus',
                                onClickGoBack: false,
                                onClick: () => {
                                    const currentJoinColumns = [...(state.join.sources[sourceAlias]?.joinColumns || [])];
                                    currentJoinColumns.push({ dsColumn: null, joinSourceColumn: null });
                                    onJoinChange(sourceAlias, 'joinColumns', currentJoinColumns);
                                }
                            }
                        ].filter(item => !item.cdn || item.cdn())
                    },
                    { type: 'separator', cdn: () => isEdit },
                    { name: 'Remove Dataset', icon: 'TrashCan', cdn: () => isEdit, onClickGoBack: true, onClick: () => dataSource.removeJoinSource(sourceAlias) },
                ].filter(item => !item.cdn || item.cdn())
            })),
            { type: 'separator', cdn: () => isEdit },
            { name: 'Add Join Source', icon: 'Plus', cdn: () => isEdit, onClick: () => dataSource.addJoinSource() },
        ].filter(item => !item.cdn || item.cdn())
    }
    

    const columns = [
        {
            name: 'Columns', icon: 'Columns',
            // A component with useDataSource but no per-column controls defined (Filter,
            // Validate, Upload) has nothing for ColumnManager to configure — showing this
            // menu for them offers a fully working add/reorder/show/hide UI that implies
            // control the component doesn't actually have.
            cdn: () => isEdit && currentComponent?.useDataSource && canEditSection && resolvedControls?.columns?.length,
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

    // Theme/site-supplied extension item-groups (e.g. a domain-specific
    // "Measure" picker registered for the "AVL Graph" component) — see
    // sectionMenuExtensions.js. Each builder gets the same primitives this
    // function already assembled (state/dwAPI/settingsAPI/currentComponent/etc.)
    // rather than re-deriving them; a builder that throws is isolated so one
    // broken extension can't blank the whole section menu.
    const extensionMenus = getSectionMenuExtensions(currentComponent?.name)
        .flatMap(build => {
            try {
                return build({
                    state, dwAPI, settingsAPI, isEdit, canEditSection,
                    currentComponent, sectionState, actions, auth, ui,
                    dataSource, pageDataSources, siblingSections,
                    pageState: rest.pageState,
                }) || [];
            } catch (e) {
                console.error('sectionMenu extension failed', e);
                return [];
            }
        })
        .filter(item => !item.cdn || item.cdn());
    // Pivot value columns — the metric(s) spread across each pivot combo. Supports
    // MULTIPLE metrics (each with its own aggregate); legacy single `valueColumn` +
    // `aggregateFn` is migrated into this list for display/editing.
    const pvSourceCols = state.externalSource?.columns || [];
    const pvAggFns = ['count', 'sum', 'avg', 'max', 'min'];
    const pvValueCols = state.pivot?.valueColumns?.length
        ? state.pivot.valueColumns
        : (state.pivot?.valueColumn
            ? [{ column: state.pivot.valueColumn, aggregateFn: state.pivot?.aggregateFn || 'count' }]
            : []);
    const pvColLabel = (name) => getColumnLabel(pvSourceCols.find(c => c.name === name) || { name });
    const setValueCols = (next) => dwAPI.setPivot('valueColumns', next);

    const pivot = {
        name: 'Pivot', icon: 'ListView',
        cdn: () => isEdit && ['Spreadsheet', 'Graph', 'AVL Graph'].includes(currentComponent?.name) && currentComponent?.useDataSource && canEditSection,
        value: state.pivot?.enabled ? 'On' : 'Off',
        showValue: true,
        items: [
            {
                name: 'Enabled', type: 'toggle',
                enabled: !!state.pivot?.enabled,
                setEnabled: v => dwAPI.setPivot('enabled', v)
            },
            { type: 'separator' },
            {
                name: 'Row Column', showValue: true, showSearch: true,
                value: (state.externalSource?.columns || []).find(c => c.name === state.pivot?.rowColumn)
                    ? getColumnLabel((state.externalSource.columns).find(c => c.name === state.pivot.rowColumn))
                    : '(none)',
                cdn: () => !!state.pivot?.enabled,
                items: [
                    {
                        icon: !state.pivot?.rowColumn ? 'CircleCheck' : 'Blank',
                        name: '(none — single aggregate row)',
                        onClickGoBack: true,
                        onClick: () => dwAPI.setPivot('rowColumn', '')
                    },
                    ...(state.externalSource?.columns || []).map(col => ({
                        icon: col.name === state.pivot?.rowColumn ? 'CircleCheck' : 'Blank',
                        name: getColumnLabel(col),
                        onClickGoBack: true,
                        onClick: () => dwAPI.setPivot('rowColumn', col.name)
                    }))
                ]
            },
            {
                name: 'Pivot Columns', showValue: true, showSearch: true,
                value: (() => {
                    const selected = state.pivot?.pivotColumns || (state.pivot?.pivotColumn ? [state.pivot.pivotColumn] : []);
                    const sourceCols = state.externalSource?.columns || [];
                    return selected.map(n => getColumnLabel(sourceCols.find(c => c.name === n) || { name: n })).join(', ');
                })() || '',
                cdn: () => !!state.pivot?.enabled,
                items: (state.externalSource?.columns || []).map(col => {
                    const selected = state.pivot?.pivotColumns || (state.pivot?.pivotColumn ? [state.pivot.pivotColumn] : []);
                    const isSelected = selected.includes(col.name);
                    return {
                        icon: isSelected ? 'CircleCheck' : 'Blank',
                        name: getColumnLabel(col),
                        onClick: () => {
                            const next = isSelected
                                ? selected.filter(c => c !== col.name)
                                : [...selected, col.name];
                            dwAPI.setPivot('pivotColumns', next);
                        }
                    };
                })
            },
            {
                // Multiple metrics can be spread per pivot combo — e.g. Speed · avg,
                // Travel time · avg, Delay · sum, all side-by-side under each period.
                name: 'Value Columns', showValue: true, showSearch: true,
                value: pvValueCols.length
                    ? pvValueCols.map(v => `${pvColLabel(v.column)} · ${(v.aggregateFn || 'count')}`).join(', ')
                    : '(none)',
                cdn: () => !!state.pivot?.enabled,
                items: [
                    // Each configured value column: drill in to change its aggregate or remove it.
                    ...pvValueCols.map((v, idx) => ({
                        name: pvColLabel(v.column),
                        showValue: true,
                        value: (v.aggregateFn || 'count').toUpperCase(),
                        items: [
                            ...pvAggFns.map(fn => ({
                                icon: (v.aggregateFn || 'count') === fn ? 'CircleCheck' : 'Blank',
                                name: fn.toUpperCase(),
                                onClickGoBack: true,
                                onClick: () => setValueCols(pvValueCols.map((x, i) => i === idx ? { ...x, aggregateFn: fn } : x)),
                            })),
                            { type: 'separator' },
                            {
                                icon: 'Trash', name: 'Remove', onClickGoBack: true,
                                onClick: () => setValueCols(pvValueCols.filter((_, i) => i !== idx)),
                            },
                        ],
                    })),
                    ...(pvValueCols.length ? [{ type: 'separator' }] : []),
                    // Add a metric: source columns not already selected.
                    ...pvSourceCols
                        .filter(col => !pvValueCols.some(v => v.column === col.name))
                        .map(col => ({
                            icon: 'Plus',
                            name: getColumnLabel(col),
                            onClick: () => setValueCols([...pvValueCols, { column: col.name, aggregateFn: pvValueCols[0]?.aggregateFn || 'avg' }]),
                        })),
                ],
            },
            {
                name: 'Single Header', label: 'Single Header View', type: 'toggle', showLabel: true,
                enabled: !!state.pivot?.singleHeader,
                cdn: () => !!state.pivot?.enabled && (state.pivot?.pivotColumns?.length > 1),
                setEnabled: v => dwAPI.setPivot('singleHeader', v)
            },
            {
                name: 'Max Values', showValue: true,
                value: state.pivot?.maxValues || 10,
                cdn: () => !!state.pivot?.enabled,
                items: [{
                    id: 'pivot_max_values_input',
                    name: 'Max Values',
                    type: 'input',
                    inputType: 'number',
                    value: state.pivot?.maxValues || 10,
                    onChange: e => dwAPI.setPivot('maxValues', +(e?.target?.value ?? e) || 10)
                }]
            },
        ].filter(item => !item.cdn || item.cdn())
    }

    // Comparison Series (query fan-out) — author defines N variants (each a
    // label + filter delta over the base query); the chart overlays one series
    // per variant. v0 authoring surface is a raw JSON array of {label, filters}.
    // Master off / no labeled variants → no fan-out (buildUdaConfig gates on it).
    const csConfig = {
        enabled: false, seriesKey: '__series', seriesLabel: '', variants: [],
        ...(state?.comparisonSeries || {})
    };
    const setCsConfig = (partial) => dwAPI.setComparisonSeries({ ...csConfig, ...partial });
    const csEnabled = csConfig.enabled === true;

    const comparisonSeries = {
        name: 'Comparison Series', icon: 'Columns',
        cdn: () => isEdit && currentComponent?.useDataSource && canEditSection,
        value: csEnabled ? 'On' : 'Off', showValue: true,
        items: [
            {
                // Master on/off. Off drops the synthetic discriminator column and
                // stops fan-out in buildUdaConfig; the config is retained for re-enable.
                name: 'Enabled', label: 'Enabled',
                type: 'toggle', showLabel: true,
                enabled: csEnabled,
                setEnabled: v => {
                    setCsConfig({ enabled: v });
                    dwAPI.reconcileComparisonSeriesColumn();
                }
            },
            { type: 'separator' },
            ...(!csEnabled ? [] : [
                {
                    name: 'Series Key',
                    value: csConfig.seriesKey, showValue: true,
                    items: [{
                        id: 'cs_serieskey_input', name: 'Series Key',
                        type: () => (
                            <CommitInput
                                initialValue={csConfig.seriesKey}
                                onCommit={(seriesKey) => {
                                    setCsConfig({ seriesKey: seriesKey || '__series' });
                                    dwAPI.reconcileComparisonSeriesColumn();
                                }}
                            />
                        )
                    }]
                },
                {
                    name: 'Series Label',
                    value: csConfig.seriesLabel, showValue: true,
                    items: [{
                        id: 'cs_serieslabel_input', name: 'Series Label',
                        type: 'input', inputType: 'text', value: csConfig.seriesLabel,
                        onChange: e => setCsConfig({ seriesLabel: e?.target?.value ?? e })
                    }]
                },
                { type: 'separator' },
                {
                    // Per-variant editor. Each variant = { label, filters }; the
                    // filter delta is authored with the same ComplexFilters builder
                    // the section's main filters use (no hand-written JSON).
                    // Stable `id` (NOT the count-bearing name) so committing
                    // variants doesn't rename this menu level out from under
                    // NavigableMenu's activeParent → blank page / broken back.
                    id: 'cs_variants',
                    name: `Variants (${(csConfig.variants || []).length})`,
                    items: [
                        // Each variant is its own nav level, keyed by a stable
                        // index-based id (see the id-collision note below).
                        ...(csConfig.variants || []).map((v, idx) => ({
                            // Stable unique id on every navigable node — flattenConfig
                            // keys the whole menu by `id || name` globally, so the
                            // dynamic `Variant N: label` name AND the names repeated
                            // across variants (`Label`, `Remove Variant`) would collide
                            // and get random UUIDs each flatten → broken back-nav.
                            id: `cs_variant_${idx}`,
                            name: `Variant ${idx + 1}${v.label ? `: ${v.label}` : ''}`, icon: 'Columns',
                            items: [
                                {
                                    id: `cs_variant_${idx}_label_nav`, name: 'Label',
                                    value: v.label, showValue: true,
                                    items: [{
                                        id: `cs_variant_${idx}_label`, name: 'Label',
                                        type: () => (
                                            <CommitInput
                                                initialValue={v.label || ''}
                                                // Comparison-series charts use a variant's `label` as
                                                // the ONLY series discriminator (see the seriesKey
                                                // comment near buildUdaConfig's fan-out) — two variants
                                                // sharing a label collapse into one series. Blocked here
                                                // (rather than auto-suffixed, as ReportRouteList's
                                                // add-flow does for its own catalog-inherited names)
                                                // because this label is always something the author
                                                // explicitly typed, never an inherited default.
                                                validate={(label) => {
                                                    const collision = label && (csConfig.variants || [])
                                                        .some((vv, ii) => ii !== idx && vv.label === label);
                                                    return collision ? `A variant named "${label}" already exists.` : '';
                                                }}
                                                onCommit={(label) => {
                                                    const variants = [...(csConfig.variants || [])];
                                                    variants[idx] = { ...variants[idx], label };
                                                    setCsConfig({ variants });
                                                }}
                                            />
                                        )
                                    }]
                                },
                                {
                                    id: `cs_variant_${idx}_filters`, name: 'Filters',
                                    // Reuse the section filter builder for the variant's
                                    // delta. value/onSave redirect read+write to this
                                    // variant; columns/join still come from dwAPI.state.
                                    // `key` forces a fresh instance per variant (useImmer
                                    // seeds on mount only).
                                    type: () => (
                                        <ComplexFilters
                                            key={`cs_variant_${idx}`}
                                            state={dwAPI.state}
                                            setState={dwAPI.setState}
                                            value={v.filters}
                                            onSave={(tree) => {
                                                const variants = [...(csConfig.variants || [])];
                                                variants[idx] = { ...variants[idx], filters: tree };
                                                setCsConfig({ variants });
                                            }}
                                        />
                                    )
                                },
                                { type: 'separator' },
                                {
                                    id: `cs_variant_${idx}_remove`,
                                    name: 'Remove Variant', icon: 'TrashCan', onClickGoBack: true,
                                    onClick: () => {
                                        const variants = [...(csConfig.variants || [])];
                                        variants.splice(idx, 1);
                                        setCsConfig({ variants });
                                    }
                                }
                            ]
                        })),
                        {
                            id: 'cs_add_variant',
                            name: 'Add Variant', icon: 'Plus',
                            onClick: () => setCsConfig({
                                variants: [...(csConfig.variants || []), { label: '', filters: { op: 'AND', groups: [] } }]
                            })
                        }
                    ]
                }
            ])
        ]
    };

    // Nest the data-shaping menus (join / comparison series /
    // pivot) under the Dataset menu so they no longer crowd the top level. Each
    // keeps its own cdn; pre-filter here (matching their previous top-level
    // visibility) since the menu renderer doesn't evaluate cdn on nested items.
    const datasetSubMenus = [join, comparisonSeries, pivot].filter(item => !item.cdn || item.cdn());
    if (datasetSubMenus.length) {
        if (dataset.items.length) dataset.items.push({ type: 'separator' });
        dataset.items.push(...datasetSubMenus);
    }


    // totalLength is unset until the section's data has loaded (or when it never loads)
    const totalLength = parseInt(state?.display?.totalLength);
    const filter = [
        {name: 'Filters', icon: 'Filter',
            value: `${totalLength.toLocaleString()} rows`,
            showValue: Number.isFinite(totalLength),
            cdn: () => isEdit && currentComponent?.useDataSource && canEditSection,
            items: [
                // Suppresses the round Filter-icon pill that toggles the external-
                // filter panel open/closed. Default `true` on new sections via
                // each registry entry's `defaultState.display.hideExternalToggle`;
                // absent on existing rows so the pill keeps rendering as before.
                {
                    name: 'Hide External Filter Toggle',
                    label: 'Hide External Filter Toggle',
                    type: 'toggle',
                    showLabel: true,
                    enabled: state?.display?.hideExternalToggle === true,
                    setEnabled: v => dwAPI.setDisplay('hideExternalToggle', v),
                },
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
                    (isEdit || (['Spreadsheet', 'Card', 'Graph', 'AVL Graph'].includes(currentComponent?.name) && ['Spreadsheet', 'Card', 'Graph'].includes(k)))
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
                          ? () => rawType({ state: componentAPI?.state, setState: componentAPI?.setState, dwAPI, settingsAPI })
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

    // Component Templates — save the live config as a named, reusable template
    // and apply templates that match this component type. Gated behind the
    // registry's `supportsTemplates` flag (Spreadsheet first). TemplateManager
    // reads apiLoad/apiUpdate/format from PageContext; the section primitives
    // (value/state/setKey/onChange) are already in scope here.
    const templates = currentComponent?.supportsTemplates ? [
        {
            name: 'Templates', icon: 'Copy',
            cdn: () => isEdit && canEditSection,
            items: [
                {
                    name: 'Template Manager',
                    noHover: true,
                    type: () => (
                        <TemplateManager
                            componentType={currentComponent?.name}
                            sectionValue={value}
                            dwState={state}
                            setKey={setKey}
                            onChange={onChange}
                        />
                    )
                }
            ]
        }
    ] : []

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
                    // In-page-nav opt-in: a section with a Nav Label appears in the
                    // sidebar rail "on this page" and gets a clean anchor id.
                    name: 'Page Nav Label',
                    cdn: () => canEditSection,
                    value: value?.['navLabel'] || '',
                    showValue: true,
                    items: [
                        {
                            name: '',
                            type: () => <input
                                className={sm.textInput}
                                placeholder={'e.g. Compliance snapshot'}
                                defaultValue={value?.['navLabel'] || ''}
                                onBlur={(e) => updateAttribute('navLabel', e.target.value)}
                            />
                        }
                    ]
                },
                {
                    name: 'Anchor ID (optional)',
                    cdn: () => canEditSection && !!value?.['navLabel'],
                    value: value?.['anchorId'] || '',
                    showValue: true,
                    items: [
                        {
                            name: '',
                            type: () => <input
                                className={sm.textInput}
                                placeholder={'auto from label'}
                                defaultValue={value?.['anchorId'] || ''}
                                onBlur={(e) => updateAttribute('anchorId', e.target.value)}
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
                },
                {
                    // only in a collapsible band (sectionGroup.jsx): this section stays visible while
                    // the band is collapsed
                    name: 'Show When Collapsed',
                    cdn: () => canEditSection && Boolean(groupCollapsible),
                    type: () => (
                        <div className={'self-start w-full flex justify-between pl-2'}>
                            <label>Show When Collapsed</label>
                            <Switch
                                size={'small'}
                                enabled={value?.['showWhenCollapsed']}
                                setEnabled={v => updateAttribute('showWhenCollapsed', v)}
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
                    name: 'Style', icon: 'Layers', value: activeStyleName, showValue: true,
                    cdn: () => canEditSection,
                    items: styles.map((style, idx) => ({
                        icon: idx === activeStyle ? 'CircleCheck' : '',
                        name: style.name || idx,
                        onClick: () => updateAttribute('activeStyle', idx)
                    }))
                },
                {
                    icon: 'Column', name: 'Width', value: value?.['size'] || sectionArrayTheme.defaultSize || 1, showValue: true,
                    cdn: () => canEditSection,
                    items: Object.keys(getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle).sizes || {})
                      .sort((a, b) => {
                        const sizes = getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle).sizes
                        let first = +sizes[a].iconSize || 100
                        let second = +sizes[b].iconSize || 100
                        return first - second
                    }).map((name, i) => {
                        return {
                            icon: name === String(value?.['size'] || sectionArrayTheme.defaultSize || '1') ? 'CircleCheck' : 'Blank',
                            id: `size_${name}`,
                            'name': name,
                            'onClick': () => updateAttribute('size', name)
                        }
                    })
                },
                // Section height. Default is 'auto' — section is content-sized
                // and the wrapper renders unchanged from pre-feature behaviour
                // (see section.theme.jsx and planning/tasks/.../section-height-setting.md).
                // Hidden when the active section style ships no `heights` map,
                // so themes that haven't opted in see no new control.
                ...(Object.keys(getComponentTheme(theme, 'pages.section').heights || {}).length ? [{
                    icon: 'Row', name: 'Height', value: value?.['height'] || 'auto', showValue: true,
                    cdn: () => canEditSection,
                    items: Object.keys(getComponentTheme(theme, 'pages.section').heights || {}).map((name) => {
                        return {
                            icon: name === (value?.['height'] || 'auto') ? 'CircleCheck' : 'Blank',
                            id: `height_${name}`,
                            'name': name,
                            'onClick': () => updateAttribute('height', name === 'auto' ? undefined : name)
                        }
                    })
                }] : []),
                {
                    icon: 'Row', name: 'Rowspan', value: value?.['rowspan'] || 1, showValue: true,
                    cdn: () => canEditSection,
                    // Read from the resolved sectionArray style — the rowspans
                    // map lives in `pages.sectionArray.styles[N].rowspans`,
                    // not at `theme.sectionArray.rowspans` (the previous path
                    // skipped `pages.` and bypassed getComponentTheme, so the
                    // menu rendered "Rowspan" with no items even when the
                    // theme had a full 1..8 map).
                    items: Object.keys(getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle).rowspans || {}).sort((a, b) => {
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
                    name: 'Float',
                    cdn: () => canEditSection && value?.rowspan > 1,
                    type: () => (
                        <div className={'self-start w-full flex justify-between pl-2'}>
                            <label>Float</label>
                            <Switch
                                size={'small'}
                                enabled={value?.['sticky']}
                                setEnabled={v => updateAttribute('sticky', v)}
                            />
                        </div>
                    )
                },
                {
                    icon: 'Padding', name: 'Float Padding Top', value: value?.['stickyTop'] || 0, showValue: true,
                    cdn: () => canEditSection && value?.rowspan > 1 && value?.sticky,
                    items: [
                        {
                            type: 'input',
                            inputType: 'number',
                            min: 0, max: 500,
                            value: value?.['stickyTop'] || 0,
                            onChange: (v) => updateAttribute('stickyTop', +v.target.value)
                        }
                    ],
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
                    // Per-side gutter padding — the section's outer spacing on a gap-0
                    // grid. Steps come from the theme (`sectionArray.paddings[side]`);
                    // unset sides fall back to `defaultPaddingStep`. Zeroing a side lets
                    // the section sit flush with its neighbor (compound card).
                    icon: 'Padding', name: 'Padding',
                    cdn: () => canEditSection,
                    items: [
                        { name: 'padding', type: () => {
                            const sa = getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle);
                            const paddings = sa?.paddings || {};
                            const defStep = sa?.defaultPaddingStep;
                            // Seed from a legacy string padding (e.g. "p-6", "px-4 py-2") so
                            // editing one side preserves the others' existing values instead
                            // of resetting them to the theme default.
                            const parseLegacyPad = p => {
                                if (!p || typeof p !== 'string') return {};
                                const o = {}; const sm = { t:'top', r:'right', b:'bottom', l:'left' };
                                p.split(/\s+/).forEach(c => {
                                    let m;
                                    if ((m = c.match(/^p-(\d+)$/))) { o.top=o.right=o.bottom=o.left=m[1]; }
                                    else if ((m = c.match(/^px-(\d+)$/))) { o.left=o.right=m[1]; }
                                    else if ((m = c.match(/^py-(\d+)$/))) { o.top=o.bottom=m[1]; }
                                    else if ((m = c.match(/^p([trbl])-(\d+)$/))) { o[sm[m[1]]]=m[2]; }
                                });
                                return o;
                            };
                            const cur = (value?.['padding'] && typeof value['padding'] === 'object') ? value['padding'] : parseLegacyPad(value?.['padding']);
                            const allSteps = Object.keys(paddings?.top || {});
                            const gridStyle = { display: 'grid', gridTemplateColumns: `repeat(${allSteps.length}, minmax(0,1fr))`, gap: '2px' };
                            const sideVals = ['top','right','bottom','left'].map(s => String(cur[s] != null && cur[s] !== '' ? cur[s] : defStep));
                            const allActive = sideVals.every(v => v === sideVals[0]) ? sideVals[0] : null;
                            const rows = [
                                { key: 'all',    label: 'All',   bold: true, active: allActive,  pick: s => updateAttribute('padding', { top: s, right: s, bottom: s, left: s }) },
                                { key: 'top',    label: 'Top',   active: sideVals[0], pick: s => updateAttribute('padding', { ...cur, top: s }) },
                                { key: 'right',  label: 'Right', active: sideVals[1], pick: s => updateAttribute('padding', { ...cur, right: s }) },
                                { key: 'bottom', label: 'Bottom',active: sideVals[2], pick: s => updateAttribute('padding', { ...cur, bottom: s }) },
                                { key: 'left',   label: 'Left',  active: sideVals[3], pick: s => updateAttribute('padding', { ...cur, left: s }) },
                            ];
                            const renderRow = r => (
                                <div key={r.key} className={sm.stepRow}>
                                    <div className={r.bold ? sm.stepLabelBold : sm.stepLabel}>{r.label}</div>
                                    <div className={sm.stepGrid} style={gridStyle}>
                                        {allSteps.map(step => (
                                            <div key={step} onClick={() => r.pick(step)}
                                                className={`${sm.step} ${String(r.active) === String(step) ? sm.stepOn : sm.stepOff}`}>
                                                {step}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                            return (
                                <div className={sm.stepsWrap}>
                                    {renderRow(rows[0])}
                                    <div className={sm.stepDivider} />
                                    {rows.slice(1).map(renderRow)}
                                </div>
                            );
                        }},
                    ],
                },
                {
                    // Border — toggle each side independently by clicking the edges of
                    // the box. Theme owns the default line style; legacy string keys
                    // (full / openLeft / …) are mapped to a side-set for display (BC).
                    // Optional Width + Color inputs promote the border to inline style
                    // (arbitrary runtime widths/colors can't be JIT Tailwind classes);
                    // leaving both unset keeps the theme's 1px #E0EBF0 class path (BC).
                    icon: 'Border', name: 'Border',
                    cdn: () => canEditSection,
                    items: [
                        { name: 'border', type: () => {
                            const legacy = { full:{top:1,right:1,bottom:1,left:1}, openLeft:{top:1,right:1,bottom:1}, openRight:{top:1,bottom:1,left:1}, openTop:{right:1,bottom:1,left:1}, openBottom:{top:1,right:1,left:1}, borderX:{left:1,right:1} };
                            const b = value?.['border'];
                            const cur = (b && typeof b === 'object') ? b : (legacy[b] || {});
                            const toggle = side => updateAttribute('border', { ...cur, [side]: cur[side] ? undefined : true });
                            const edge = (side, cls) => (
                                <div onClick={() => toggle(side)}
                                    className={`absolute ${cls} ${sm.edge} ${cur[side] ? sm.edgeOn : sm.edgeOff}`}/>
                            );
                            const sa = getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle);
                            const widths = sa?.borderWidths || [1, 2, 3, 4, 6, 8];
                            const swatches = sa?.borderColors;   // curated palette (undefined → ColorControls default)
                            const setWidth = w => updateAttribute('border', { ...cur, width: cur.width === w ? undefined : w });
                            const setColor = c => updateAttribute('border', { ...cur, color: c });
                            return (
                                <div className={sm.borderWrap}>
                                    <div className={sm.borderCenter}>
                                        <div className={sm.pickerBox}>
                                            <div className={sm.edgesLabel}>edges</div>
                                            {edge('top',    'top-0 left-2.5 right-2.5 h-2')}
                                            {edge('bottom', 'bottom-0 left-2.5 right-2.5 h-2')}
                                            {edge('left',   'left-0 top-2.5 bottom-2.5 w-2')}
                                            {edge('right',  'right-0 top-2.5 bottom-2.5 w-2')}
                                        </div>
                                    </div>
                                    {/* Width (px) — sets border.width; promotes the border to inline style. */}
                                    <div className={sm.widthRow}>
                                        <div className={sm.stepLabel}>Width</div>
                                        <div className={sm.stepGrid} style={{ display: 'grid', gridTemplateColumns: `repeat(${widths.length}, minmax(0,1fr))`, gap: '2px' }}>
                                            {widths.map(w => (
                                                <div key={w} onClick={() => setWidth(w)}
                                                    className={`${sm.step} ${String(cur.width) === String(w) ? sm.stepOn : sm.stepOff}`}>
                                                    {w}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Color — sets border.color from the theme swatch palette. */}
                                    <ColorControls value={cur.color || '#E0EBF0'} setValue={setColor} title={'Color'} colors={swatches}/>
                                </div>
                            );
                        }},
                    ],
                },
                {
                    // Radius — toggle each corner by clicking the dots; theme owns the size.
                    icon: 'Border', name: 'Radius',
                    cdn: () => canEditSection,
                    items: [
                        { name: 'radius', type: () => {
                            const r = value?.['radius'];
                            const cur = (r && typeof r === 'object') ? r : {};
                            const toggle = c => updateAttribute('radius', { ...cur, [c]: cur[c] ? undefined : true });
                            const corner = (c, cls) => (
                                <div onClick={() => toggle(c)}
                                    className={`absolute ${cls} ${sm.corner} ${cur[c] ? sm.cornerOn : sm.cornerOff}`}/>
                            );
                            return (
                                <div className={sm.radiusWrap}>
                                    <div className={sm.pickerBox}>
                                        <div className={sm.radiusFrame}/>
                                        {corner('tl', 'top-0.5 left-0.5')}
                                        {corner('tr', 'top-0.5 right-0.5')}
                                        {corner('bl', 'bottom-0.5 left-0.5')}
                                        {corner('br', 'bottom-0.5 right-0.5')}
                                    </div>
                                </div>
                            );
                        }},
                    ],
                },
                {
                    // Background — themed options (none / white / tint).
                    icon: 'Border', name: 'Background',
                    cdn: () => canEditSection,
                    items: [
                        { name: 'bg', type: () => {
                            const sa = getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle);
                            const bgMap = sa?.backgrounds || {};
                            const cur = value?.['bg'] || 'none';
                            return (
                                <div className={sm.bgWrap}>
                                    {Object.keys(bgMap).map(name => (
                                        <div key={name} onClick={() => updateAttribute('bg', name)}
                                            className={`${sm.bgPill} ${cur === name ? sm.stepOn : sm.stepOff}`}>
                                            {/* swatch showing the actual background (empty/transparent for "none") */}
                                            <span className={`${sm.bgSwatch} ${bgMap[name] || ''}`}/>
                                            {name}
                                        </div>
                                    ))}
                                </div>
                            );
                        }},
                    ],
                },
                {
                    // Shadow — themed options (none / sm / md / …). Same navigable
                    // checkmark-list convention as Style/Width/Height/Rowspan above,
                    // not Background's swatch-pill (that one previews a color; a
                    // shadow doesn't preview meaningfully at swatch size).
                    icon: 'Border', name: 'Shadow', value: value?.['shadow'] || 'none', showValue: true,
                    cdn: () => canEditSection,
                    items: Object.keys(getComponentTheme(theme, 'pages.sectionArray', sectionArrayStyle).shadows || {}).map((name) => {
                        return {
                            icon: name === (value?.['shadow'] || 'none') ? 'CircleCheck' : 'Blank',
                            id: `shadow_${name}`,
                            'name': name,
                            'onClick': () => updateAttribute('shadow', name === 'none' ? undefined : name)
                        }
                    })
                },
                {type: 'separator'},
                {
                    icon: 'AccessControl', name: 'Permissions', cdn: () => canEditSectionPermissions && canEditSection,
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
                                    heading='on this section'
                                    inheritedFrom='the page'
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
            ...componentInteractions,
            ...templates,
            {type: 'separator'},
            dataset,
            ...columns,
            ...extensionMenus,
            ...filter,
            {type: 'separator', cdn: () => currentComponent?.useDataSource && canEditSection},
            ...display,
            ...layout,
            {type: 'separator'},
            ...remove
        ].filter(item => !item.cdn || item.cdn())
    )
}
