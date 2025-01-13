import React, { useEffect, Fragment, useRef, useState } from 'react'
import { useLocation, useSubmit, NavLink} from "react-router-dom";
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
import { ArrowRight, ArrowDown, AdjustmentsHorizontal , PencilIcon, CirclePlus, CancelCircle, CaretDown, EllipsisVertical} from '../../ui/icons'
import { json2DmsForm, getUrlSlug, toSnakeCase, parseJSON } from '../_utils'
import {insertSubPage, newPage, updateTitle, toggleSidebar, publish, getMenus, discardChanges} from './editFunctions'




import { CMSContext } from '../../siteConfig'

function EditPane ({item, open, apiUpdate, setOpen }) {
  const { baseUrl, user, falcor, falcorCache} = React.useContext(CMSContext) || {}
  const hasChanges = item.published === 'draft' || item.has_changes

  //console.log(item, user, apiUpdate)

  return (
    <div className='flex items-cemter'>
      <div><PublishButton item={item} apiUpdate={apiUpdate} /></div>
      <div className='flex items-cemter  px-4 py-2 ' onClick={() => setOpen(!open)}>
        <AdjustmentsHorizontal className='size-6 hover:text-blue-500 text-slate-400'/>
      </div>   
    </div>
  )
}

export function EditDrawer({item, dataItems,  apiUpdate, open, setOpen }) {
  const { baseUrl, user, falcor, falcorCache} = React.useContext(CMSContext) || {}
   const [ editState, setEditState ] = React.useState({
      deleteId: -1
  })

  const hasChanges = item.published === 'draft' || item.has_changes
  return ( 
    <>
      <Drawer open={open} setOpen={setOpen} closeOnClick={false}>
          <div className='h-8' />
          <Tabs tabs={[
            {
              name: <div>1</div>, 
              Component: () => 
                <div className='flex flex-col  h-[calc(100vh_-_60px)] '>
                  <div className='w-full flex justify-center py-4'>
                    <PublishButton item={item} apiUpdate={apiUpdate} />
                  </div>
                  {/*<div>
                    <ConfirmInput value={item.title} label={'Page Name'} />
                  </div>*/}
                  <div className='flex-1'>
                   <DraggableNav item={item} dataItems={dataItems} NavComp={DraggableNavItem} />
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
        
      </>
  )
}

function DraggableNavItem ({item, dataItems, handleCollapseIconClick, isCollapsed, edit}) {
    const { baseUrl, user, theme = { nestable: nestableTheme } } = React.useContext(CMSContext);
    const { pathname = '/edit' } = useLocation();




    //-- this is not ideal, better to check id and parent
    const isActive = pathname.includes(item.url_slug)

    return (
        <div key={item.id} className='group'>
            {/*<div className='border-t border-transparent hover:border-blue-500 w-full relative'>
                <div className='hidden group-hover:block absolute -left-[5px] -top-[10px] hover:bg-blue-500 size-4 flex items-center rounded-full p-1 center'>+</div>
            </div>*/}
            <div className={`${isActive ? theme?.nestable?.navItemContainerActive : theme?.nestable?.navItemContainer}`}>

                <NavLink className={theme?.nestable?.navLink} to={`${edit ? `${baseUrl}/edit` : baseUrl}/${item.url_slug || item.id}`}>{item.title}</NavLink>

                <div className={'flex gap-0.5 items-center'}>
                    <Menu 
                      items={[
                         {
                          name: (<span className=''>Rename</span>), 
                          onClick: () => {}
                        },
                        {
                          name: (<span className='text-red-400'>Delete</span>), 
                          onClick: () => {}
                        }
                      ]}
                    > 
                      <div className='flex items-center text-slate-300 hover:text-slate-600 rounded-full hover:bg-blue-300'>
                        <EllipsisVertical className='size-5' />
                      </div>
                    </Menu>
                    {/*unpublished pill*/}
                    {/*{hasChanges ?  <DraftPage className={'text-orange-500'} />  : null}*/}

                    {/*unpublished children pill*/}
                    {/*{unpublishedChildren ? <Pill text={unpublishedChildren} color={'orange'} /> : null}*/}
                    {/*total children pill*/}
                    {/*{allChildren ? <Pill text={allChildren} color={'gray'} /> : null}*/}
                </div>


                {!item.children?.length ? <div className='size-6'/> : isCollapsed  ?
                    <ArrowRight className={theme?.nestable?.collapsIcon}  onClick={() => handleCollapseIconClick()}/> :
                    <ArrowDown className={theme?.nestable?.collapsIcon} onClick={() => handleCollapseIconClick()}/>
                }

                
            </div>
            {/*<div className='border-t border-transparent hover:border-blue-500 w-full relative'>
                <div className='hidden group-hover:block absolute left-0 -bottom-0 hover:bg-blue-500 size-4 flex items-center rounded-full p-1'>+</div>
            </div>*/}
        </div>
    )
  
}


function PublishButton ({item, apiUpdate}) {
  const hasChanges = item.published === 'draft' || item.has_changes
  const { user } = React.useContext(CMSContext) || {}
  return (
    <div className='w-full flex justify-center h-[40px]'>
      <Button padding={'pl-2 flex items-center h-[40px]'} disabled={!hasChanges} rounded={hasChanges ? 'rounded-l-lg' : 'rounded-lg'} type={hasChanges ? 'active' : 'inactive'} onClick={() => publish(user,item, apiUpdate)} >
        <span className='text-nowrap'> {hasChanges ? `Publish` : `No Changes`} </span>
         
      </Button>
      {hasChanges && (
        <Menu 
          items={[{
            name: (<span className='text-red-400'>Discard Changes</span>), 
            onClick: () =>  discardChanges(user,item, apiUpdate)}
          ]}
        > 
          <Button padding={'py-1 w-[35px] h-[40px]'} rounded={'rounded-r-lg'} type={hasChanges ? 'active' : 'inactive'}>
            <CaretDown className='size-[28px]' />
          </Button>
        </Menu>
      )}
    </div>
  )
}



function EditControls({ item, dataItems,  apiUpdate, attributes, edit, status,  pageType = 'page' }) {
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
      
      <EditPagesNav item={item} dataItems={dataItems}  edit={true} open={editState.showNav} setOpen={(v) => setEditState({...editState, showNav: v})}/>
      <EditHistory item={item}  historyOpen={editState.showHistory} setHistoryOpen={(v) => setEditState({...editState, showHistory: v})} />
    </div>
  )
}

export default EditPane


