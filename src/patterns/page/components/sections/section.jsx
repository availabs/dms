import React, {useContext, useRef, useState} from "react"
import {isEqual} from "lodash-es"

import {CMSContext, PageContext} from '../../context'
import {getComponentTheme, ThemeContext} from "../../../../ui/useTheme";
import {AuthContext} from "../../../auth/context";

import {getPageAuthPermissions} from "../../pages/_utils";
import Selector from "./components";
import {getSectionMenuItems} from './sectionMenu'
import {DeleteModal, getHelpTextArray, handlePaste, HelpTextEditPopups, ViewSectionHeader} from './section_utils'
import ComponentRegistry from "./components/ComponentRegistry";
export let RegisteredComponents = ComponentRegistry;
export const registerComponents = (comps = {}) => {
    RegisteredComponents = {...RegisteredComponents, ...comps}
}

export function SectionEdit({
    value,
    i,
    onChange,
    attributes,
    size,
    onCancel,
    onSave,
    onRemove,
    moveItem,
    siteType,
    apiLoad,
    apiUpdate,
    format,
}) {
    const isEdit = true;
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    let sectionTitleCondition = value?.['title']
    const {theme: fullTheme, UI} = React.useContext(ThemeContext);
    const theme = getComponentTheme(fullTheme, 'pages.section')
    const {Popup, Button, Icon, Switch, Listbox, NavigableMenu, Permissions} = UI
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const {user, isUserAuthed} = React.useContext(CMSContext) || {};
    const {pageState} = useContext(PageContext);
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const sectionAuthPermissions = value?.authPermissions && typeof value.authPermissions === 'string' ? JSON.parse(value?.authPermissions) : undefined;

  const updateAttribute = (k, v) => {
      if (!isEqual(value, {...value, [k]: v})) {
          onChange({...value, [k]: v})
      }
  }

  let TitleEditComp = attributes?.title?.EditComp
  let LevelComp = attributes?.level?.EditComp
  let HelpComp = attributes?.helpText?.EditComp
  const helpTextArray = getHelpTextArray(value)


  const sectionMenuItems = getSectionMenuItems({
      i, isEdit,
      value,
      moveItem,
      TitleEditComp,
      LevelComp,
      updateAttribute,
      Switch,
      showDeleteModal,
      setShowDeleteModal,
      Permissions, AuthAPI, user,
      isUserAuthed, pageAuthPermissions, sectionAuthPermissions,
      theme: fullTheme,
      attributes
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

    return (
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
            <Selector.EditComp
              value={value?.['element']}
              onChange={(v) => updateAttribute('element', v)}
              handlePaste={(e, setKey, setState) => handlePaste(e, setKey, setState, value, onChange)}
              size={size}
              siteType={siteType}
              apiLoad={apiLoad}
              apiUpdate={apiUpdate}
              pageFormat={format}
              isActive={value?.element?.['element-type'] === 'Spreadsheet'}
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

export function SectionView({
  value,
  i,
  attributes,
  edit,
  onEdit,
  onChange,
  onRemove,
  moveItem,
  addAbove,
  siteType,
  apiLoad,
  apiUpdate,
  format,
  isActive
}) {
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const {user, isUserAuthed = () => {} } = React.useContext(CMSContext) || {};
    const {theme: fullTheme, UI} = React.useContext(ThemeContext);
    const { pageState } = useContext(PageContext);

    const {Popup, Icon, NavigableMenu, Switch, Permissions} = UI;
    const theme = getComponentTheme(fullTheme, 'pages.section');

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isRefreshingData, setIsRefreshingData] = useState(false);
    const [hideSection, setHideSection] = useState(false);

    const isEdit = false; // should come from props
    const refreshDataBtnRef = useRef(null);
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const sectionAuthPermissions = value?.authPermissions && typeof value.authPermissions === 'string' ? JSON.parse(value?.authPermissions) : undefined;



    const hideDebug = true
    let TitleComp = attributes?.title?.ViewComp || (() => <div>Title component not found.</div>)
    let TitleEditComp = attributes?.title?.EditComp
    let LevelComp = attributes?.level?.EditComp
    let HelpComp = attributes?.helpText?.ViewComp
    const helpTextArray = getHelpTextArray(value)
    const helpTextCondition = helpTextArray.some(({text}) => text && !(
        (text?.root?.children?.length === 1 && text?.root?.children?.[0]?.children?.length === 0) ||
        (text?.root?.children?.length === 0)
    ))

    let showHeader = value?.['title'] || value?.['tags'] || helpTextCondition
    let showEditIcons = edit && typeof onEdit === 'function'

    const updateAttribute = (k, v) => {
        const newV = {...value, [k]: v}
        if (!isEqual(value, newV)) {
            onChange(i, newV)
        }
    }

    const element = React.useMemo(() => {
        return (
            <Selector.ViewComp
                value={value?.['element']}
                onChange={(v) => updateAttribute('element', v)}
                siteType={siteType}
                apiLoad={apiLoad}
                apiUpdate={apiUpdate}
                pageFormat={format}
                isActive={isActive}
                hideSection={hideSection}
                setHideSection={setHideSection}
                refreshDataBtnRef={refreshDataBtnRef}
            />
        )
    }, [value, isActive, hideSection, refreshDataBtnRef]);

    if (!value?.element?.['element-type'] && !value?.element?.['element-data']) return null;

    const sectionMenuItems = getSectionMenuItems({
        i, isEdit,
        onEdit, refreshDataBtnRef, isRefreshingData, setIsRefreshingData,
        value,
        moveItem,
        TitleEditComp,
        LevelComp,
        updateAttribute,
        Switch,
        Permissions, AuthAPI, user,
        isUserAuthed, pageAuthPermissions, sectionAuthPermissions,
        showDeleteModal,
        setShowDeleteModal,
        theme:fullTheme,
        attributes
    })

    return (
        <div className={!edit && hideSection ? theme.wrapperHidden : theme.wrapper} style={{pageBreakInside: "avoid"}}>

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
    )
}