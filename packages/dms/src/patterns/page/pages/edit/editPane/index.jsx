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

import { fieldMaps, verbsForFields } from '../../../../../utils/authJudge';
import { getPatternType } from '../../../../registry';

// Each pane names the page FIELD it edits; which verb that field needs comes from the page format's
// `permissionDomain` (`fields` on each verb), the same declaration dms-server judges the save by —
// so a pane and the write behind it cannot drift. A pane with no field names its verb directly.
const panes = [
      {
        icon: 'Settings',
          title: 'Settings',
        Component: SettingsPane,
          field: 'title'
      },
      // Page filters — own pane since 2026-10-08 (were the bottom of Settings). The Data Sources
      // pane was removed the same day (owner: unused; datasets-page-pattern-v6-port.md Decision 16).
      {
        icon: 'Filter',
          title: 'Filters',
        Component: FiltersPane,
          field: 'filters'
      },
      {
        icon: 'Sections',
          title: 'Section Groups',
        Component: SectionGroupsPane,
          field: 'section_groups'
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
          field: 'authPermissions'
      }
    ]

// The verbs a pane needs: the ones its field's declaration names (any of), else the pane's own list.
function paneVerbs(pane, patternType) {
    if (!pane.field) return pane.reqPermissions;
    const maps = fieldMaps(getPatternType(patternType || 'page')?.authVocabulary);
    const { groups } = verbsForFields([pane.field], maps, {}, 'descendants');
    return groups[0] || pane.reqPermissions || ['edit-page'];
}

export function EditPane () {
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const { Icon } = UI;
  const t = { ...editPaneTheme, ...getComponentTheme(themeFromContext, 'pages.editPane') };

  const {item, pageState, editPane, setEditPane } =  React.useContext(PageContext) || {}
    const hasChanges = item.published === 'draft' || item.has_changes

    const { isUserAuthed, pattern } = React.useContext(CMSContext) || {};
    const reqPermissions = ['edit-page', 'edit-page-permissions']
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const userHasEditPageAccess = isUserAuthed(reqPermissions, pageAuthPermissions)


  return (
    <div className={t.wrapper}>
      <div className={t.bar}>
        {userHasEditPageAccess ?
            panes
                .filter(pane => { const verbs = paneVerbs(pane, pattern?.pattern_type); return !verbs || isUserAuthed(verbs, pageAuthPermissions); })
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
    const { isUserAuthed, pattern } = React.useContext(CMSContext) || {};
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
              .filter(pane => { const verbs = paneVerbs(pane, pattern?.pattern_type); return !verbs || isUserAuthed(verbs, pageAuthPermissions); })
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
