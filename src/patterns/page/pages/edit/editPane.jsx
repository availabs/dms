import React, { useEffect, Fragment, useRef, useState } from 'react'
import { useLocation, useSubmit, NavLink} from "react-router-dom";
import { cloneDeep, get, isEqual } from "lodash-es"

import { 
  Drawer,
  Tabs,
  Button,
  Menu, 
  Input,
  DraggableNav,
  Dialog
} 
  from '../../ui'
import { ArrowRight, ArrowDown, AdjustmentsHorizontal , PencilIcon, CirclePlus, CancelCircle, CaretDown, EllipsisVertical} from '../../ui/icons'
import { json2DmsForm, getUrlSlug, toSnakeCase, parseJSON } from '../_utils'
import {insertSubPage, newPage, updateTitle, toggleSidebar, publish, getMenus, discardChanges} from './editFunctions'




import { CMSContext } from '../../siteConfig'

export default function EditPane ({item, open, apiUpdate, setOpen }) {
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
                   <DraggableNav 
                      item={item} 
                      dataItems={dataItems} 
                      NavComp={DraggableNavItem} 
                    />
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

function DraggableNavItem ({activeItem, item, dataItems, handleCollapseIconClick, isCollapsed, edit}) {
    const { baseUrl, user, theme } = React.useContext(CMSContext);
    const { pathname = '/edit' } = useLocation();
    const submit = useSubmit()
    const [showDelete, setShowDelete] = React.useState(false)
    const [showRename, setShowRename] = React.useState(false)


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
                          onClick: () => setShowRename(true)
                        },
                        {
                          name: (<span className='text-red-400'>Delete</span>), 
                          onClick: () =>  {
                            
                            setShowDelete(true)
                          }
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
            <DeleteModal 
              item={item} 
              open={showDelete} 
              setOpen={() => setShowDelete(!showDelete)} 
              onDelete={() => {
                async function deleteItem () {
                    await submit(json2DmsForm(item,'delete'), { method: "post", action: pathname })
                    setShowDelete(!showDelete)
                }
                deleteItem()
              }}
            />

            <RenameModal 
              activeItem={activeItem}
              item={item}
              dataItems={dataItems}
              open={showRename} 
              setOpen={() => setShowRename(!showRename)} 
            />
        </div>
    )
  
}

function DeleteModal ({title, prompt, item={}, open, setOpen, onDelete})  {
  const cancelButtonRef = useRef(null)
  //const { baseUrl } = React.useContext(CMSContext) || {}
  const [loading, setLoading] = useState(false)

  return (
    <Dialog
      open={open}
      onClose={setOpen}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
          <i className="fa fa-danger h-6 w-6 text-red-600" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
          <h3 className="text-base font-semibold leading-6 text-gray-900">
              {title || `Delete ${item.title || ''} ${item.id}`}
          </h3>
          <div className="mt-2">
            <p className="text-sm text-gray-500">
                {prompt || `Are you sure you want to delete this page? All of the page data will be permanently removed
              from our servers forever. This action cannot be undone.`}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <Button
          disabled={loading}
          onClick={onDelete}
        >
          Delet{loading ? 'ing...' : 'e'}
        </Button>
        <Button
          type="plain"
          className='mr-1'
          onClick={() => setOpen()}
          ref={cancelButtonRef}
        >
          Cancel
        </Button>
      </div>
    </Dialog>
  )
}


function RenameModal ({title, prompt, item={}, dataItems, open, setOpen})  {
  const cancelButtonRef = useRef(null)
  const {  user } = React.useContext(CMSContext) || {}
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation();
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState(item.title)

  const update = () => {
    // ----------
    // to do --- update child urls of parent that gets changed
    // ----------
    const updateItem = async () => {
      let editItem = dataItems.filter(d => d.id === item.id)?.[0] || item
      if(newName !== editItem.title) {
        // let history = editItem.history ? cloneDeep(item.history) : []
        // let edit = {
        //   type: `changed page title to ${newName}`,
        //   user: user.email, 
        //   time: new Date().toString()
        // }
        // history.push(edit)
        
        const newItem = {
          id: item.id,
          title:newName   
        }

        newItem.url_slug = getUrlSlug(newItem, dataItems)
        setLoading(true)
        await submit(json2DmsForm(newItem), { method: "post", action: pathname })
        setLoading(false)
        setOpen()
      }
    }
    updateItem()
  }
  
  return (
    <Dialog
      open={open}
      onClose={() => {}}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
          <i className="fa fa-danger h-6 w-6 text-red-600" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
          <h3 className="text-base font-semibold leading-6 text-gray-900">
              Rename {item.title}
          </h3>
          <div className="mt-2 w-full">
            <Input value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <Button
          disabled={loading}
          onClick={update}
        >
          { loading ? 'Saving...' : 'Submit' } 
        </Button>
        <Button
          type="plain"
          className='mr-1'
          onClick={() => setOpen()}
          ref={cancelButtonRef}
        >
          Cancel
        </Button>
      </div>
    </Dialog>
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



