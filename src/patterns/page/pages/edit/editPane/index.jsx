import React, { Fragment } from 'react';
import { CMSContext,PageContext } from '../../../context'
import { ThemeContext } from '../../../../../ui/useTheme';
import SettingsPane from './settingsPane'
import PagesPane, { PublishButton } from './pagesPane'
import HistoryPane from './historyPane'
import SectionGroupsPane from './sectionGroupsPane'
import PermissionsPane from "./permissionsPane";

const panes = [
      {
        icon: 'Settings',
        Component: SettingsPane
      },
      {
        icon: 'Sections',
        Component: SectionGroupsPane
      },
      {
        icon: 'Pages',
        Component: PagesPane
      },
      {
        icon: 'History',
        Component: HistoryPane
      },
      {
        icon: 'AccessControl',
        Component: PermissionsPane,
          reqPermissions: ['set-page-auth']
      }
    ]

export function EditPane () {
  const { UI } = React.useContext(ThemeContext) || {};

  const {item, dataItems, apiUpdate, editPane, setEditPane } =  React.useContext(PageContext) || {}
  const hasChanges = item.published === 'draft' || item.has_changes
  const { Icon } = UI;



  return (
    <div className='fixed bottom-[12px] left-0 right-0 z-50 pointer-events-none'>
      <div className='flex items-cemter p-1 justify-between bg-neutral-900 w-[500px] mx-auto rounded-[12px] shadow pointer-events-auto'>
        {panes.map((pane,i) => (
          <div
            key={pane?.icon || i}
          className='flex items-cemter  px-2 py-2 cursor-pointer rounded-[12px] hover:bg-slate-700 group'
          onClick={() => setEditPane({...editPane,index:i, open: !editPane.openX})}
          >
            <Icon
              icon={pane?.icon}
              className='size-6 group-hover:text-blue-500 text-slate-400'
            />
          </div>
        ))}


        <div className='h-9 mt-0.5 w-[1px] mx-1  bg-slate-600' />
        <div
          className='flex items-cemter  px-2 py-2 cursor-pointer rounded-[12px] hover:bg-slate-700 group'
          onClick={() => setEditPane({...editPane,  showGrid: !editPane.showGrid})}
        >
          <Icon
            icon='Grid'
            className='size-6 group-hover:text-blue-500 text-slate-400'
          />
        </div>
        <div className='flex-1'> </div>
        <div className=''><PublishButton /></div>
      </div>
    </div>
  )
}

function LoadingDisplay () {
  const { busy } =  React.useContext(PageContext) || {}
  return (
    <div className={`fixed bottom-4 right-4 p-6 border rounded bg-white shadow ${busy?.loading > 0 || busy?.updating > 0 ? 'block' : 'hidden'} `}>
        <div>{busy?.updating > 0 && `Updating... ${busy?.updating}`}</div>
        <div>{busy?.loading > 0 && `Loading... ${busy?.loading}`}</div>
    </div>
  )
}

export function EditDrawer() {
    const { UI } = React.useContext(ThemeContext) || {};
    const {Icon, Tabs, Drawer} = UI;
    const { item={}, dataItems=[], apiUpdate,  editPane, setEditPane } =  React.useContext(PageContext) || {}
  // console.log('editPane', editPane)
  const [ editState, setEditState ] = React.useState({
      deleteId: -1
  })

  const hasChanges = item.published === 'draft' || item.has_changes
  return (
    <Drawer
      width={'w-[350px]'}
      open={editPane.open}
      setOpen={v => setEditPane({...editPane, open: v})}
      closeOnClick={false}
    >
      {/*<div className='h-8 w-[500px]' />*/}
      <Tabs
        selectedIndex = {editPane.index}
        setSelectedIndex = {v => setEditPane({...editPane, index: v})}
        tabs={
          panes.map(pane => {
            return {
              name: <Icon
                icon={pane.icon}
                className='size-6 hover:text-blue-500 text-slate-400'
              />,
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
