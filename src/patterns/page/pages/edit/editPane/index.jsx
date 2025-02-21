import React, { useEffect, Fragment, useRef, useState } from 'react'
import { useLocation, useSubmit, NavLink} from "react-router-dom";
import { cloneDeep, get, isEqual } from "lodash-es"

import { Drawer, Tabs, Button, Menu, DraggableNav, Dialog } from '../../../ui'
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
    <div className='flex items-cemter p-1'>
      <div className='flex-1'><PublishButton /></div>
      <div className='flex items-cemter  px-4 py-2 ' onClick={() => setEditPane({...editPane, open: !editPane.open})}>
        <AdjustmentsHorizontal className='size-6 hover:text-blue-500 text-slate-400'/>
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
      <div className='h-8 w-[500px]' />
      <Tabs 
        selectedIndex = {editPane.index}
        setSelectedIndex = {v => setEditPane({...editPane, index: v})} 
        tabs={[
        {
          name: <div>1</div>, 
          Component: SettingsPane ,
        },
        {name: "2", Component:  PagesPane },
        {name: "3", Component: HistoryPane },
        {name: "4", Component: () => <div>4</div>},
        {name: "5", Component: () => <div>5</div>},
      ]} 
    />
    </Drawer>  
  )
}



