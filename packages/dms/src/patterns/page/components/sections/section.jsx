import React, {useContext, useEffect, useRef, useState} from "react"
import {get, isEqual} from "lodash-es"

import {getComponentTheme, ThemeContext} from "../../../../ui/useTheme";
import {AuthContext} from "../../../auth/context";
import {CMSContext, PageContext, ComponentContext, DataSourceContext} from '../../context'
import {getPageAuthPermissions} from "../../pages/_utils";
import {getSectionMenuItems} from './sectionMenu'
import {
    DeleteModal,
    getHelpTextArray,
    HelpTextEditPopups,
    ViewSectionHeader,
    initialState,
    isJson
} from './section_utils'
import Component from "./components";
import {useImmer} from "use-immer";
import { getRegisteredComponents } from './componentRegistry'
export { registerComponents, getRegisteredComponents } from './componentRegistry'

/**
 * Parse element-data JSON string.
 */
function parseElementData(elementData) {
    if (!elementData) return null;
    try {
        return typeof elementData === 'string' ? JSON.parse(elementData) : elementData;
    } catch {
        return null;
    }
}

/**
 * Resolve the element-data value to pass to the dataWrapper.
 * For page-level references (dataSourceId), merge config from DataSourceContext with section display.
 * For inline config, pass through as-is.
 */
function resolveElementData(elementData, dataSources) {
    if (!elementData) return elementData;
    const parsed = parseElementData(elementData);
    if (!parsed?.dataSourceId) return elementData; // inline — pass through

    const ds = dataSources?.[parsed.dataSourceId];
    if (!ds) return elementData; // source not found — pass through (convertOldState will handle)

    // Merge page-level config with section display/data
    return JSON.stringify({
        dataSourceId: parsed.dataSourceId,
        externalSource: ds.externalSource || ds.sourceInfo || {},
        columns: ds.columns || [],
        filters: ds.filters || ds.dataRequest || {},
        display: parsed.display || {},
        data: parsed.data || [],
    });
}

export function SectionEdit({ i, value, attributes, siteType, format, onChange, onRemove, moveItem, onCancel, onSave }) {
    const isEdit = true;
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const {user, isUserAuthed} = React.useContext(CMSContext) || {};
    const { pageState, apiLoad, apiUpdate } = useContext(PageContext);
    const {theme: fullTheme, UI} = React.useContext(ThemeContext);
    const { dataSources, setDataSource, createDataSource } = useContext(DataSourceContext);

    const RegisteredComponents = getRegisteredComponents();
    const component = (RegisteredComponents[get(value, ["element", "element-type"], "lexical")] || RegisteredComponents['lexical']);
    const isDataComponent = Boolean(component?.useDataSource || component?.useDataWrapper);

    // ── Handle from dataWrapper (state-based so updates trigger re-renders) ──
    const dataWrapperRef = useRef(null);
    const [dwHandle, setDwHandle] = useState(null);

    // ── Section-level state (non-data: title, delete modal, etc.) ──
    const [sectionState, setSectionState] = useImmer({
        showDeleteModal: false,
        key: undefined,
        listAllColumns: false
    });
    const {showDeleteModal, key, listAllColumns} = sectionState;
    const setShowDeleteModal = value => setSectionState(draft => {draft.showDeleteModal = value});
    const setListAllColumns = value => setSectionState(draft => {draft.listAllColumns = value});
    const setKey = value => setSectionState(draft => { draft.key = value });

    const theme = getComponentTheme(fullTheme, 'pages.section')
    const {Button, Icon, Switch, NavigableMenu, Permissions, Pill} = UI
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const sectionAuthPermissions = value?.authPermissions && typeof value.authPermissions === 'string' ? JSON.parse(value?.authPermissions) : undefined;

    // ── Resolve element-data (merge page-level config if dataSourceId present) ──
    const resolvedElementData = isDataComponent
        ? resolveElementData(value?.['element']?.['element-data'], dataSources)
        : value?.['element']?.['element-data'];

    // Track dataSourceId for menu display
    const elementData = parseElementData(value?.['element']?.['element-data']);
    const dataSourceId = elementData?.dataSourceId || null;

    const updateAttribute = (k, v) => {
        // For data components with page-level source: route config changes to DataSourceContext
        if (k === 'element' && isDataComponent && dataSourceId) {
            const elData = v?.['element-data'];
            if (elData && typeof elData === 'string') {
                try {
                    const parsed = JSON.parse(elData);
                    if ((parsed.externalSource || parsed.sourceInfo) && dataSources?.[dataSourceId]) {
                        // Sync config back to page-level source (deferred)
                        setTimeout(() => setDataSource(dataSourceId, {
                            externalSource: parsed.externalSource || parsed.sourceInfo,
                            columns: parsed.columns || [],
                            filters: parsed.filters || parsed.dataRequest || {},
                        }), 0);
                        // Slim section element-data to reference + display + data
                        v = { ...v, 'element-data': JSON.stringify({
                            dataSourceId,
                            display: parsed.display || {},
                            data: parsed.data || [],
                        })};
                    }
                } catch { /* not JSON */ }
            }
        }
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }
    const updateElementType = (v) => {
        if(!isEqual(value.element['element-type'], v)){
            const newComp = RegisteredComponents[v];
            if(newComp.useDataSource && newComp.defaultState){
                const elementData = isJson(value.element['element-data']) ? JSON.parse(value.element['element-data']) : {};
                Object.keys(newComp.defaultState).forEach(newKey => {
                    elementData[newKey] = newComp.defaultState[newKey];
                })
                updateAttribute('element', {...value.element, 'element-type': v, 'element-data': JSON.stringify(elementData)})
            }else{
                updateAttribute('element', {...value.element, 'element-type': v})
            }
        }
    }

    // ── switchDataSource: replace section's source with a page-level one ──
    const switchDataSource = React.useCallback((newDsId) => {
        const ds = dataSources?.[newDsId];
        if (!ds || !onChange) return;

        const currentDisplay = parseElementData(value?.['element']?.['element-data'])?.display || {};
        const newConfig = {
            dataSourceId: newDsId,
            externalSource: ds.externalSource || ds.sourceInfo || {},
            columns: ds.columns || [],
            filters: ds.filters || ds.dataRequest || {},
            display: currentDisplay,
            data: [],
        };

        // Update dataWrapper's live immer state directly (so the UI updates immediately)
        if (dwHandle?.setState) {
            dwHandle.setState(draft => {
                if (!draft) return;
                draft.externalSource = newConfig.externalSource;
                draft.columns = newConfig.columns;
                draft.filters = newConfig.filters;
                draft.data = [];
            });
        }

        // Also persist to element-data (for next mount / view mode)
        onChange({ ...value, element: { ...value.element, 'element-data': JSON.stringify(newConfig) } });
    }, [dataSources, onChange, value, dwHandle]);

    // ── Menu: read from dataWrapper handle (state-based, triggers re-renders) ──
    const dwAPI = dwHandle?.dwAPI;
    const dataSourceFromRef = dwHandle?.dataSource || {};
    const stateFromRef = dwHandle?.state;

    const TitleEditComp = attributes?.title?.EditComp
    const TitleViewComp = attributes?.title?.ViewComp
    const LevelComp = attributes?.level?.EditComp
    const HelpComp = attributes?.helpText?.EditComp
    const helpTextArray = getHelpTextArray(value, true)
    const onAddHelpText = () => updateAttribute('helpText', [...helpTextArray, {text: ''}]);

    const sectionMenuItems = getSectionMenuItems({
        sectionState: { isEdit, value, attributes, i, showDeleteModal, listAllColumns, state: stateFromRef },
        actions: { moveItem, updateAttribute, updateElementType, onChange, onCancel, onSave, onAddHelpText, setKey, setState: dwHandle?.setState, setShowDeleteModal, setListAllColumns },
        auth: { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI },
        ui:  { Switch, Pill, Icon, TitleEditComp, LevelComp, theme: fullTheme, RegisteredComponents },
        dataSource: dataSourceFromRef,
        dwAPI: dwAPI || {},
        pageDataSources: { dataSources, dataSourceId, switchDataSource },
    })
    const canEditSection = isUserAuthed(['edit-section'], sectionAuthPermissions);
    const resolvedControls = typeof component?.controls === 'function'
        ? component.controls(fullTheme)
        : component?.controls;

    return (
        <div className={theme.wrapper}>
            {/* -------------------top line buttons ----------------------*/}
            <div id={`#${value?.title?.replace(/ /g, '_')}`}
                 className={`flex flex-row font-display font-medium uppercase scroll-mt-36 items-center`}>
                <div className='flex-1'>
                    <TitleViewComp
                        className={`w-full ${fullTheme.heading?.[value?.['level']] || fullTheme.heading?.['default']}`}
                        value={value?.['title']}
                    />
                </div>
                <div className={theme.topBar}>
                    <div className={theme.topBarSpacer}/>
                    <div className={theme.topBarButtonsEdit}>
                        <HelpTextEditPopups
                            helpTextArray={helpTextArray}
                            updateAttribute={updateAttribute}
                            HelpComp={HelpComp}
                        />
                        <div className={theme.menuPosition}>
                            <NavigableMenu
                                config={sectionMenuItems}
                                title={'Settings'}
                                btnVisibleOnGroupHover={false}
                                defaultOpen={true}
                                preferredPosition={"right"}
                                preventCloseOnClickOutside={true}
                                showBreadcrumbs={true}
                                showTitle={false}
                            />
                        </div>
                    </div>
                </div>
            </div>
            {/* ------------------- Main Content ----------------------*/}
            <div className={theme.contentWrapper}>
                <Component.EditComp
                    ref={dataWrapperRef}
                    value={{...value?.['element'], 'element-data': resolvedElementData}}
                    onChange={(v) => updateAttribute('element', v)}
                    component={component}
                    siteType={siteType}
                    pageFormat={format}
                    compKey={key}
                    onHandle={setDwHandle}
                />
            </div>
            {/* ------------------- Delete Modal ----------------------*/}
            <DeleteModal
                title={`Delete Section ${value?.title || ''} ${value?.id}`} open={showDeleteModal}
                prompt={`Are you sure you want to delete this section? All of the section data will be permanently removed
                      from our servers forever. This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await onRemove(i)
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </div>
    )
}

export function SectionView({ i, value, attributes, siteType, format, isActive, editPageMode, onChange, onRemove, moveItem, onEdit }) {
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const {user, isUserAuthed = () => {} } = React.useContext(CMSContext) || {};
    const {theme: fullTheme, UI} = React.useContext(ThemeContext);
    const { pageState, apiLoad, apiUpdate } = useContext(PageContext);
    const { dataSources } = useContext(DataSourceContext);

    const {NavigableMenu, Switch, Pill, Icon, Permissions} = UI;
    const theme = getComponentTheme(fullTheme, 'pages.section');

    const RegisteredComponents = getRegisteredComponents();
    const component = RegisteredComponents[get(value, ["element", "element-type"], "lexical")];
    const isDataComponent = Boolean(component?.useDataSource || component?.useDataWrapper);

    // ── Handle from dataWrapper ──
    const dataWrapperRef = useRef(null);
    const [dwHandle, setDwHandle] = useState(null);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isRefreshingData, setIsRefreshingData] = useState(false);
    const [hideSection, setHideSection] = useState(false);

    // ── Resolve element-data for page-level refs ──
    const resolvedElementData = isDataComponent
        ? resolveElementData(value?.['element']?.['element-data'], dataSources)
        : value?.['element']?.['element-data'];

    const isEdit = false;
    const refreshDataBtnRef = useRef(null);
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const sectionAuthPermissions = value?.authPermissions && typeof value.authPermissions === 'string' ? JSON.parse(value?.authPermissions) : undefined;

    const TitleComp = attributes?.title?.ViewComp || (() => <div>Title component not found.</div>)
    const TitleEditComp = attributes?.title?.EditComp
    const LevelComp = attributes?.level?.EditComp
    const HelpComp = attributes?.helpText?.ViewComp
    const helpTextArray = getHelpTextArray(value, false);
    const helpTextCondition = helpTextArray.some(({text}) => text && !(
        (text?.root?.children?.length === 1 && text?.root?.children?.[0]?.children?.length === 0) ||
        (text?.root?.children?.length === 0)
    ))

    const showHeader = (value?.['title'] || value?.['tags'] || helpTextCondition) && (hideSection ? editPageMode : !hideSection);
    const showEditIcons = editPageMode && typeof onEdit === 'function'

    const updateAttribute = (k, v) => {
        const newV = {...value, [k]: v}
        if (!isEqual(value, newV)) {
            onChange?.(i, newV)
        }
    }
    const updateElementType = (v) => {
        if(!isEqual(value.element['element-type'], v)){
            const newComp = RegisteredComponents[v];
            if(newComp.useDataSource && !dwHandle?.state?.columns && newComp.defaultState){
                const elementData = isJson(value.element['element-data']) ? JSON.parse(value.element['element-data']) : {};
                Object.keys(newComp.defaultState)
                    .filter(newKey => !elementData[newKey])
                    .forEach(newKey => {
                        elementData[newKey] = newComp.defaultState[newKey];
                    })
                updateAttribute('element', {...value.element, 'element-type': v, 'element-data': JSON.stringify(elementData)})
            }else{
                updateAttribute('element', {...value.element, 'element-type': v})
            }
        }
    }

    const element = React.useMemo(() => {
        return (
            <Component.ViewComp
                ref={dataWrapperRef}
                value={{...value?.['element'], 'element-data': resolvedElementData}}
                onChange={(v) => updateAttribute('element', v)}
                siteType={siteType}
                pageFormat={format}
                refreshDataBtnRef={refreshDataBtnRef}
                component={component}
                editPageMode={editPageMode}
                onHandle={setDwHandle}
            />
        )
    }, [value, resolvedElementData, hideSection, refreshDataBtnRef, component, value?.element?.['element-type']]);

    // ── Read hideSection from dataWrapper handle ──
    useEffect(() => {
        if(dwHandle?.state?.display?.hideSection && !hideSection){
            setHideSection(true)
        } else if(!dwHandle?.state?.display?.hideSection && hideSection){
            setHideSection(false)
        }
    }, [dwHandle?.state?.display?.hideSection])


    if (!value?.element?.['element-type'] && !value?.element?.['element-data']) return null;

    // ── Menu from handle ──
    const dwAPI = dwHandle?.dwAPI;
    const dataSourceFromRef = dwHandle?.dataSource || {};
    const stateFromRef = dwHandle?.state;

    const sectionMenuItems = getSectionMenuItems({
        sectionState: { isEdit, value, attributes, i, showDeleteModal, state: stateFromRef },
        actions: { onEdit, moveItem, updateAttribute, updateElementType, onChange, setState: dwHandle?.setState, setShowDeleteModal },
        auth: { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI },
        ui:  { Switch, Pill, Icon, TitleEditComp, LevelComp, refreshDataBtnRef, isRefreshingData, setIsRefreshingData, theme: fullTheme, RegisteredComponents },
        dataSource: dataSourceFromRef,
        dwAPI: dwAPI || {},
    })

    const resolvedControls = typeof component?.controls === 'function'
        ? component.controls(fullTheme)
        : component?.controls;

    const canEditSection = isUserAuthed(['edit-section'], sectionAuthPermissions);

    return (
        <div className={editPageMode && hideSection && !editPageMode ? theme.wrapperHidden : theme.wrapper} style={{pageBreakInside: "avoid"}}>

            {/* -------------------top line buttons ----------------------*/}
            <div className={theme.topBar}>
                <div className={theme.topBarSpacer}/>
                <div className={theme.topBarButtonsView}>
                    <div className={theme.menuPosition}>
                        {(showEditIcons) && (
                            <>
                                {value.hideInView ? <Pill color={'orange'} text={'Hidden from View'} /> : null}
                                <NavigableMenu
                                    config={sectionMenuItems}
                                    title={'Settings'}
                                    btnVisibleOnGroupHover={true}
                                    preferredPosition={"right"}
                                    showBreadcrumbs={true}
                                    showTitle={false}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
            {/* -------------------Section Header ----------------------*/}
            {showHeader ? (
                <ViewSectionHeader
                    value={value}
                    TitleComp={TitleComp}
                    updateAttribute={updateAttribute}
                    helpTextArray={helpTextArray}
                    HelpComp={HelpComp}
                />
            ) : ''
            }

            <div className={theme.contentWrapper}>
                {element}
            </div>

            <DeleteModal
                title={`Delete Section ${value?.title || ''} ${value?.id}`}
                prompt={`
              Are you sure you want to delete this section?
              All of the section data will be permanently removed
              from our servers forever. This action cannot be undone.
            `}
                open={showDeleteModal}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await onRemove(i)
                        setShowDeleteModal(false)
                    }
                    deleteItem()
                }}
            />
        </div>
    )
}
