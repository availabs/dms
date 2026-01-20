import React, {useContext, useEffect, useRef, useState} from "react"
import {get, isEqual} from "lodash-es"

import {getComponentTheme, ThemeContext} from "../../../../ui/useTheme";
import {AuthContext} from "../../../auth/context";
import {CMSContext, PageContext, ComponentContext} from '../../context'
import {getPageAuthPermissions} from "../../pages/_utils";
import {getSectionMenuItems} from './sectionMenu'
import {DeleteModal, getHelpTextArray, handlePaste, HelpTextEditPopups, ViewSectionHeader, initialState} from './section_utils'
import {useDataSource} from "./useDataSource";
import Component from "./components";
import ComponentRegistry from "./components/ComponentRegistry";
import {useImmer} from "use-immer";
import {convertOldState} from "./components/dataWrapper/utils/convertOldState";
export let RegisteredComponents = ComponentRegistry;

export const registerComponents = (comps = {}) => {
    RegisteredComponents = {...RegisteredComponents, ...comps}
}

export function SectionEdit({ i, value, attributes, siteType, format, onChange, onRemove, moveItem, onCancel, onSave }) {
    const isEdit = true;
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const {user, isUserAuthed} = React.useContext(CMSContext) || {};
    const { pageState, apiLoad, apiUpdate } = useContext(PageContext);
    const {theme: fullTheme, UI} = React.useContext(ThemeContext);

    const component = (RegisteredComponents[get(value, ["element", "element-type"], "lexical")] || RegisteredComponents['lexical']);
    const [state, setState] = useImmer(convertOldState(value?.['element']?.['element-data'] || '', initialState(component.defaultState)));
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [key, setKey] = useState(); // used to update lexical on paste
    const {  activeSource, activeView, sources, views, onSourceChange, onViewChange } = useDataSource({state, setState});

    const theme = getComponentTheme(fullTheme, 'pages.section')
    const {Button, Icon, Switch, NavigableMenu, Permissions} = UI
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const sectionAuthPermissions = value?.authPermissions && typeof value.authPermissions === 'string' ? JSON.parse(value?.authPermissions) : undefined;

  const updateAttribute = (k, v) => {
      if (!isEqual(value, {...value, [k]: v})) {
          onChange({...value, [k]: v})
      }
  }
    const updateElementType = (v, k='element-type') => {
        const newV = {...value.element, [k]: v}
        if(!isEqual(value.element, newV)){
            updateAttribute('element', newV)
        }
    }

  const TitleEditComp = attributes?.title?.EditComp
  const LevelComp = attributes?.level?.EditComp
  const HelpComp = attributes?.helpText?.EditComp
  const helpTextArray = getHelpTextArray(value)


  const sectionMenuItems = getSectionMenuItems({
      state: { isEdit, value, attributes, i, theme: fullTheme, showDeleteModal },
      actions: { moveItem, updateAttribute, updateElementType, onChange, setKey, setState, setShowDeleteModal },
      auth: { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI },
      ui:  { Switch, TitleEditComp, LevelComp, RegisteredComponents },
      dataSource: {  activeSource, activeView, sources, views, onSourceChange, onViewChange }
  })

    const editIcons = [
      {
        name: 'HelpText',
        onClick: () => updateAttribute('helpText', [...helpTextArray, {text: ''}]),
        icon: 'SquarePlus'
      },
      {
        name: 'Cancel',
        onClick: onCancel,
        icon: 'CancelCircle'
      },
      {
        name: 'Save',
        onClick: onSave,
        icon: 'FloppyDisk'
      }
    ]

    {/* apiLoad and apiUpdate are passed in ComponentContext as components won't always be in pages pattern. */}
    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate, controls: component?.controls, isActive: value?.element?.['element-type'] === 'Spreadsheet'}}>
            <div className={theme.wrapper}>
                {/* -------------------top line buttons ----------------------*/}
                <div className={theme.topBar}>
                    <div className={theme.topBarSpacer}/>
                    <div className={theme.topBarButtonsEdit}>
                        <HelpTextEditPopups
                            helpTextArray={helpTextArray}
                            updateAttribute={updateAttribute}
                            HelpComp={HelpComp}
                        />
                        {editIcons.map(icon =>  (
                            <Button activeStyle={1} onClick={icon.onClick} altText={icon.name}>
                                <Icon icon={icon.icon} className={theme.editIcon}/>
                            </Button>
                        ))}
                        <NavigableMenu
                            config={sectionMenuItems}
                            title={'Section Settings'}
                            btnVisibleOnGroupHover={false}
                            defaultOpen={true}
                            preferredPosition={"right"}
                        />
                    </div>
                </div>
                {/* ------------------- Main Content ----------------------*/}
                <div className={theme.contentWrapper}>
                    <Component.EditComp
                        value={value?.['element']}
                        onChange={(v) => updateAttribute('element', v)}
                        component={component}
                        siteType={siteType}
                        pageFormat={format}
                        compKey={key}
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
        </ComponentContext.Provider>
    )
}

export function SectionView({ i, value, attributes, siteType, format, isActive, editPageMode, onChange, onRemove, moveItem, onEdit }) {
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const {user, isUserAuthed = () => {} } = React.useContext(CMSContext) || {};
    const {theme: fullTheme, UI} = React.useContext(ThemeContext);
    const { pageState, apiLoad, apiUpdate } = useContext(PageContext);

    const {NavigableMenu, Switch, Permissions} = UI;
    const theme = getComponentTheme(fullTheme, 'pages.section');

    const component = RegisteredComponents[get(value, ["element", "element-type"], "lexical")];
    const [state, setState] = useImmer(convertOldState(value?.element?.['element-data'] || '', initialState(component?.defaultState)));
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isRefreshingData, setIsRefreshingData] = useState(false);
    const [hideSection, setHideSection] = useState(false);
    const { activeSource, activeView, sources, views, onSourceChange, onViewChange } = useDataSource({state, setState});

    const isEdit = false; // should come from props
    const refreshDataBtnRef = useRef(null);
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const sectionAuthPermissions = value?.authPermissions && typeof value.authPermissions === 'string' ? JSON.parse(value?.authPermissions) : undefined;

    const TitleComp = attributes?.title?.ViewComp || (() => <div>Title component not found.</div>)
    const TitleEditComp = attributes?.title?.EditComp
    const LevelComp = attributes?.level?.EditComp
    const HelpComp = attributes?.helpText?.ViewComp
    const helpTextArray = getHelpTextArray(value)
    const helpTextCondition = helpTextArray.some(({text}) => text && !(
        (text?.root?.children?.length === 1 && text?.root?.children?.[0]?.children?.length === 0) ||
        (text?.root?.children?.length === 0)
    ))

    const showHeader = value?.['title'] || value?.['tags'] || helpTextCondition
    const showEditIcons = editPageMode && typeof onEdit === 'function'

    const updateAttribute = (k, v) => {
        const newV = {...value, [k]: v}
        if (!isEqual(value, newV)) {
            onChange(i, newV)
        }
    }
    const updateElementType = (v, k='element-type') => {
        const newV = {...value.element, [k]: v}
        if(!isEqual(value.element, newV)){
            updateAttribute('element', newV)
        }
    }

    const element = React.useMemo(() => {
        return (
            <Component.ViewComp
                value={value?.['element']}
                onChange={(v) => updateAttribute('element', v)}
                siteType={siteType}
                pageFormat={format}
                refreshDataBtnRef={refreshDataBtnRef}
                component={component}
            />
        )
    }, [value, hideSection, refreshDataBtnRef, component, value?.element?.['element-type']]);


    useEffect(() => {
        if(state?.display?.hideSection && !hideSection){
            setHideSection(true)
        } else if(!state?.display?.hideSection && hideSection){
            setHideSection(false)
        }
    }, [state?.display?.hideSection])


    if (!value?.element?.['element-type'] && !value?.element?.['element-data']) return null;

    const sectionMenuItems = getSectionMenuItems({
        state: { isEdit, value, attributes, i, theme: fullTheme, showDeleteModal },
        actions: { onEdit, moveItem, updateAttribute, updateElementType, onChange, setState, setShowDeleteModal },
        auth: { user, isUserAuthed, pageAuthPermissions, sectionAuthPermissions, Permissions, AuthAPI },
        ui:  { Switch, TitleEditComp, LevelComp, refreshDataBtnRef, isRefreshingData, setIsRefreshingData, RegisteredComponents },
        dataSource: {  activeSource, activeView, sources, views, onSourceChange, onViewChange }
    })

    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate, controls: component?.controls, isActive}}>
            <div className={editPageMode && hideSection ? theme.wrapperHidden : theme.wrapper} style={{pageBreakInside: "avoid"}}>

                {/* -------------------top line buttons ----------------------*/}
                <div className={theme.topBar}>
                    <div className={theme.topBarSpacer}/>
                    <div className={theme.topBarButtonsView}>
                        <div className={theme.menuPosition}>
                            {(showEditIcons) && (
                                <NavigableMenu
                                    config={sectionMenuItems}
                                    title={'Section Settings'}
                                    btnVisibleOnGroupHover={true}
                                    preferredPosition={"right"}
                                />
                            )}
                        </div>
                    </div>
                </div>
                {/* -------------------END top line buttons ----------------------*/}
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
                {/* -------------------END Section Header ----------------------*/}

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
        </ComponentContext.Provider>
    )
}