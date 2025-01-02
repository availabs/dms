import React, { useEffect, Fragment, useRef, useState } from 'react'
import { useLocation, useSubmit } from "react-router-dom";
import { cloneDeep, get, isEqual } from "lodash-es"

import { 
  Drawer,
  Tabs,
  Button,
  Menu, 
  Input,
  ConfirmInput,
  DraggableNav,
  TitleEditComp, IconPopover, PopoverMenuItem, DeleteModal, DiscardChangesButton} from '../../ui'
import { AdjustmentsHorizontal , PencilIcon, CirclePlus, CancelCircle, CaretDown} from '../../ui/icons'
import { json2DmsForm, getUrlSlug, toSnakeCase, parseJSON } from '../_utils'
import {insertSubPage, newPage, updateTitle, toggleSidebar, publish, getMenus, discardChanges} from './editFunctions'


import EditPagesNav  from './editPagesPanel'
import EditHistory from './editHistoryPanel'

//import { RegisteredComponents } from '../../selector'

import { CMSContext } from '../../siteConfig'

function EditPane ({item, dataItems, updateAttribute, setItem, apiUpdate, attributes, edit, status }) {
  const [open, setOpen] = useState(false)
  const { baseUrl, user, falcor, falcorCache} = React.useContext(CMSContext) || {}
  const hasChanges = item.published === 'draft' || item.has_changes

  //console.log(item, user, apiUpdate)

  return (
    <div className='flex items-cemter gap-x-2'>
      <div><PublishButton item={item} apiUpdate={apiUpdate} /></div>
      <div className='flex items-cemter  px-4 py-2 ' onClick={() => setOpen(!open)}>
        <AdjustmentsHorizontal className='size-6 hover:text-blue-500 text-slate-400'/>
      </div>
      <Drawer open={open} setOpen={setOpen}>
        <div className='h-8' />
        <Tabs tabs={[
          {
            name: <div>1</div>, 
            Component: () => 
              <div className='flex flex-col h-full border-2 border-orange-600 max-h-[calc(100vh_-_100px)]'>
                <div className='w-full flex justify-center pb-6'>
                  <PublishButton item={item} apiUpdate={apiUpdate} />
                </div>
                {/*<div>
                  <ConfirmInput value={item.title} label={'Page Name'} />
                </div>*/}
                <div className='flex-1'>
                 <DraggableNav item={item} dataItems={dataItems} />
                </div>
              </div>
          },
          {name: "2", Component: () => <div>2</div>},
          {name: "3", Component: () => <div>3</div>},
          {name: "4", Component: () => <div>4</div>},
          {name: "5", Component: () => <div>5</div>},
        ]} 
      />
      </Drawer>
    </div>
  )
}

function PublishButton ({item, apiUpdate}) {
  const hasChanges = item.published === 'draft' || item.has_changes
  const { user } = React.useContext(CMSContext) || {}
  return (
    <div className='w-full flex justify-center h-[40px]'>
      <Button padding={'pl-2 py-2'} disabled={!hasChanges} rounded={hasChanges ? 'rounded-l-lg' : 'rounded-lg'} type={hasChanges ? 'active' : 'inactive'} onClick={() => publish(user,item, apiUpdate)} >
        <span className='text-nowrap'> {hasChanges ? `Publish` : `No Changes`} </span>
         
      </Button>
      {hasChanges && (
        <Menu 
          items={[{
            name: (<span className='text-red-400'>Discard Changes</span>), 
            onClick: () =>  discardChanges(user,item, apiUpdate)}
          ]}
        > 
          <Button padding={'py-2 w-[35px]'} rounded={'rounded-r-lg'} type={hasChanges ? 'active' : 'inactive'}>
            <CaretDown className='size-[28px]' />
          </Button>
        </Menu>
      )}
    </div>
  )
}



function EditControls({ item, dataItems, updateAttribute, setItem, apiUpdate, attributes, edit, status,  pageType = 'page' }) {
  const { baseUrl, user, falcor, falcorCache} = React.useContext(CMSContext) || {}
  const submit = useSubmit(0)
  
  const [ editState, setEditState ] = React.useState({
    showNav: false,
    showHistory: false,
    showDelete: false
  })

  
  const popOverMenus = getMenus(item, dataItems, user, pageType, editState, setEditState, apiUpdate)

  return (
    <div className='p-4'>
      <div className='w-full flex justify-center pb-6'>
        <PublishButton active={hasChanges} onClick={() => publish(user,item, apiUpdate)} >
          <span> {hasChanges ? `Publish` : `No Changes`} </span>
            {hasChanges ?  <CirclePlus className='w-6 h-6' />: ''}
        </PublishButton>
      </div>

        <div className='w-full flex justify-center pb-6'>
        <DiscardChangesButton active={hasChanges} onClick={() => discardChanges(user,item, apiUpdate)} >
          <span> {hasChanges ? `Discard` : `No Changes`} </span>
            {hasChanges ?  <CancelCircle className='w-6 h-6' />: ''}
        </DiscardChangesButton>
      </div>
     
      <TitleEditComp
        value={item?.title}
        onChange={(v) => updateTitle(item, dataItems, v, user, apiUpdate)}
        label={'page name'}
      />
            
      <div className='flex w-full h-12 px-4'>
        {
          popOverMenus.map((menu,i) => {
            return (
              <IconPopover key={i} icon={menu.icon} onClick={menu.onClick}>
                {menu.name && <div className='py-2'>
                  <div className='px-6 font-medium text-sm'> {menu.name} </div>
                  {
                    menu.items.map((d,ii) => <PopoverMenuItem key={ii} onClick={d.onClick}>{d.item}</PopoverMenuItem >)
                  }
                </div>}
              </IconPopover>
            )
          })
        }
      </div>            
      <DeleteModal title={`Delete Page ${item.title} ${item.id} `} open={editState.showDelete} setOpen={(v) => setEditState({...editState, showDelete: v})} onDelete={() => {
        async function deleteItem () {
          await submit(json2DmsForm(item,'delete'), { method: "post", action: `${baseUrl}/edit/`})
            setEditState({...editState, showDelete: false})
          }
          deleteItem()
        }} 
      />
      <EditPagesNav item={item} dataItems={dataItems}  edit={true} open={editState.showNav} setOpen={(v) => setEditState({...editState, showNav: v})}/>
      <EditHistory item={item}  historyOpen={editState.showHistory} setHistoryOpen={(v) => setEditState({...editState, showHistory: v})} />
    </div>
  )
}

export default EditPane


