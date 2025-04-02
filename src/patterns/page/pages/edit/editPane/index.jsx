import React, { useEffect, Fragment, useRef, useState } from 'react'
import { useLocation, useSubmit, NavLink} from "react-router-dom";
import { cloneDeep, get, isEqual } from "lodash-es"

import { Drawer, Tabs, Button, Menu, DraggableNav, Dialog, Icon } from '../../../ui'
import { ArrowRight, ArrowDown, AdjustmentsHorizontal, CaretDown, EllipsisVertical} from '../../../ui/icons'
import { json2DmsForm, getUrlSlug, toSnakeCase, parseJSON } from '../../_utils'
import { publish, discardChanges} from '../editFunctions'

import { CMSContext } from '../../../siteConfig'
import { PageContext } from '../../view'

import SettingsPane from './settingsPane'
import PagesPane, { PublishButton } from './pagesPane'
import HistoryPane from './historyPane'

export default function EditPane () {
  const { baseUrl, user, falcor, falcorCache} = React.useContext(CMSContext) || {}
  const {item, dataItems, apiUpdate, editPane, setEditPane } =  React.useContext(PageContext) || {}
  const hasChanges = item.published === 'draft' || item.has_changes

  return (
    <div className='fixed bottom-[12px] left-0 right-0 z-50'>
      <div className='flex items-cemter p-1 justify-between bg-neutral-900 w-[400px] mx-auto rounded-[12px] shadow'>
        <div 
          className='flex items-cemter  px-2 py-2 cursor-pointer rounded-[12px] hover:bg-slate-700 group' 
          onClick={() => setEditPane({...editPane,index:0, open: !editPane.openX})}
        >
          <Icon 
            icon='Settings' 
            className='size-6 group-hover:text-blue-500 text-slate-400'
          />
        </div>
        <div
          className='flex items-cemter  px-2 py-2 cursor-pointer rounded-[12px] hover:bg-slate-700 group' 
          onClick={() => setEditPane({...editPane,index:1, open: !editPane.openX})}
        >
          <Icon 
            icon='Pages' 
            className='size-6 group-hover:text-blue-500 text-slate-400'
          />
        </div>
        <div 
          className='flex items-cemter  px-2 py-2 cursor-pointer rounded-[12px] hover:bg-slate-700 group' 
          onClick={() => setEditPane({...editPane, index:2, open: !editPane.openX})}
        >
          <Icon 
            icon='History' 
            className='size-6 group-hover:text-blue-500 text-slate-400'
          />
        </div>
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

export function EditDrawer() {
  const { baseUrl, user, falcor, falcorCache} = React.useContext(CMSContext) || {}
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
        tabs={[
        {
          name: <Icon 
            icon='Settings' 
            className='size-6 hover:text-blue-500 text-slate-400'
          />, 
          Component: SettingsPane ,
        },
        {name: <Icon 
            icon='Pages' 
            className='size-6 hover:text-blue-500 text-slate-400'
          />, Component:  PagesPane },
        {name: <Icon 
            icon='History' 
            className='size-6 hover:text-blue-500 text-slate-400'
          />, Component: HistoryPane },
       
      ]} 
    />
    </Drawer>  
  )
}



