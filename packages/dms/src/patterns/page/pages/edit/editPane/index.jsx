import React, { Fragment } from 'react';
import { CMSContext,PageContext } from '../../../context'
import { ThemeContext, getComponentTheme } from '../../../../../ui/useTheme';
import { editPaneTheme } from './editPane.theme';
import SettingsPane from './settingsPane'
import PagesPane, { PublishButton } from './pagesPane'
import HistoryPane from './historyPane'
import SectionGroupsPane from './sectionGroupsPane'
import PermissionsPane from "./permissionsPane";
import FiltersPane from "./filtersPane";
import {getPageAuthPermissions} from "../../../pages/_utils";

const panes = [
      {
        icon: 'Settings',
          title: 'Settings',
        Component: SettingsPane,
          reqPermissions: ['edit-page']
      },
      // Page filters — own pane since 2026-10-08 (were the bottom of Settings). The Data Sources
      // pane was removed the same day (owner: unused; datasets-page-pattern-v6-port.md Decision 16).
      {
        icon: 'Filter',
          title: 'Filters',
        Component: FiltersPane,
          reqPermissions: ['edit-page-params']
      },
      {
        icon: 'Sections',
          title: 'Section Groups',
        Component: SectionGroupsPane,
          reqPermissions: ['edit-page']
      },
      {
        icon: 'Pages',
          title: 'Pages',
        Component: PagesPane,
          reqPermissions: ['create-page']
      },
      {
        icon: 'History',
          title: 'History',
        Component: HistoryPane
      },
      {
        icon: 'AccessControl',
          title: 'Permissions',
        Component: PermissionsPane,
          reqPermissions: ['edit-page-permissions']
      }
    ]

export function EditPane () {
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const { Icon } = UI;
  const t = { ...editPaneTheme, ...getComponentTheme(themeFromContext, 'pages.editPane') };

  const {item, pageState, editPane, setEditPane } =  React.useContext(PageContext) || {}
    const hasChanges = item.published === 'draft' || item.has_changes

    const { isUserAuthed } = React.useContext(CMSContext) || {};
    const reqPermissions = ['edit-page', 'edit-page-permissions']
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const userHasEditPageAccess = isUserAuthed(reqPermissions, pageAuthPermissions)


  return (
    <div className={t.wrapper}>
      <div className={t.bar}>
        {userHasEditPageAccess ?
            panes
                .filter(pane => !pane.reqPermissions || isUserAuthed(pane.reqPermissions, pageAuthPermissions))
                .map((pane,i) => (
                <div
                    key={pane?.icon || i}
                    title={pane.title}
                    className={(editPane?.open && editPane?.index === i && t.paneBtnActive) || t.paneBtn}
                    onClick={() => setEditPane({...editPane,index:i, open: !editPane.openX})}
                >
                    <Icon
                        icon={pane?.icon}
                        className={t.paneIcon}
                    />
                  </div>
            )) : null
        }


        <div className={t.divider} />
        <div
          title='Show layout grid'
          className={(editPane?.showGrid && t.gridBtnActive) || t.gridBtn}
          onClick={() => setEditPane({...editPane,  showGrid: !editPane.showGrid})}
        >
          <Icon
            icon='Grid'
            className={t.gridIcon}
          />
        </div>
        <div className={t.spacer}> </div>
        <div className={t.publishSlot}><PublishButton /></div>
      </div>
    </div>
  )
}

function LoadingDisplay () {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...editPaneTheme, ...getComponentTheme(themeFromContext, 'pages.editPane') };
  const { busy } =  React.useContext(PageContext) || {}
  if (!(busy?.loading > 0 || busy?.updating > 0)) return null
  return (
    <div className={t.busy}>
        {t.busyDot ? <span className={t.busyDot} /> : null}
        {busy?.updating > 0 ? <div className={t.busyText}>{`Updating... ${busy?.updating}`}</div> : null}
        {busy?.loading > 0 ? <div className={t.busyText}>{`Loading... ${busy?.loading}`}</div> : null}
    </div>
  )
}

export function EditDrawer() {
    const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const {Icon, Tabs, Drawer} = UI;
    const t = { ...editPaneTheme, ...getComponentTheme(themeFromContext, 'pages.editPane') };
    const { isUserAuthed } = React.useContext(CMSContext) || {};
    const { pageState, item={}, dataItems=[], apiUpdate,  editPane, setEditPane } =  React.useContext(PageContext) || {}
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);

  const hasChanges = item.published === 'draft' || item.has_changes
  return (
    <Drawer
      width={t.drawerWidth}
      open={editPane.open}
      setOpen={v => setEditPane({...editPane, open: v})}
      closeOnClick={false}
    >
      {/*<div className='h-8 w-[500px]' />*/}
      <Tabs
          activeStyle={(themeFromContext?.tabs?.styles || []).some(st => st?.name === t.tabsStyle) ? t.tabsStyle : (t.tabsStyleFallback || t.tabsStyle)}
        selectedIndex = {editPane.index}
        setSelectedIndex = {v => setEditPane({...editPane, index: v})}
        tabs={
          panes
              .filter(pane => !pane.reqPermissions || isUserAuthed(pane.reqPermissions, pageAuthPermissions))
              .map(pane => {
            return {
              name: <Icon
                icon={pane.icon}
                className={t.tabIcon}
              />,
                title: pane.title,
              Component: pane.Component,
            }
          })
        }
      />
    </Drawer>
  )
}



export default function PageControls () {
  return(
    <>
      <EditPane />
      <EditDrawer />
      <LoadingDisplay />
    </>
  )
}
