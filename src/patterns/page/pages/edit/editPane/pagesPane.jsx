import React, { useEffect, Fragment, useRef, useState } from 'react'
import { useLocation, useSubmit, NavLink} from "react-router";
import { cloneDeep, get, isEqual } from "lodash-es"
import { CMSContext,PageContext } from '../../../context'
import { json2DmsForm, getUrlSlug } from '../../_utils'
import {publish, discardChanges, insertSubPage, duplicateItem} from '../editFunctions'
import {ThemeContext} from "../../../../../ui/useTheme";


function PagesPane () {
  const { item, dataItems, apiUpdate, baseUrl, pageState } =  React.useContext(PageContext) || {};
  const { isUserAuthed, user} = React.useContext(CMSContext);
  const { UI } = React.useContext(ThemeContext)
    const pageAuthPermissions = pageState?.authPermissions && typeof pageState.authPermissions === 'string' ? JSON.parse(pageState.authPermissions) : [];

    const {DraggableNav} = UI;
    const duplicatePage = (itemId) => {
        if (!itemId || !dataItems?.length) return;

        return duplicateItem(dataItems.find(dI => dI.id === itemId), dataItems, user, apiUpdate)
    }
  return (
    <div className="flex h-full flex-col flex-1">
      <div className="px-4 sm:px-6 py-2">
        <div className="flex items-start justify-between">
          <h1 className="text-base font-semibold leading-6 text-slate-900">
            Pages
          </h1>
        </div>
      </div>
      <div className="relative flex-1 w-full ">
        <DraggableNav
          item={item}
          dataItems={dataItems}
          apiUpdate={apiUpdate}
          baseUrl={baseUrl}
          renderAddItemButton={isUserAuthed(['create-page'], pageAuthPermissions)}
          NavComp={(props) => DraggableNavItem({...props, duplicatePage})}
        />
      </div>
    </div>
  )
}

export default PagesPane

function DraggableNavItem ({activeItem, item, dataItems, handleCollapseIconClick, isCollapsed, edit, duplicatePage}) {
    const { baseUrl, user } = React.useContext(CMSContext);
    const { theme, UI } = React.useContext(ThemeContext);

    const { Icon, Menu } = UI;
    const { apiUpdate } =  React.useContext(PageContext) || {}
    const { pathname = '/edit' } = useLocation();
    const submit = useSubmit()
    const [showDelete, setShowDelete] = React.useState(false)
    const [showRename, setShowRename] = React.useState(false)
    const [duplicating, setDuplicating] = React.useState(false);
    if(!dataItems.find(i => item?.id === i.id)) return;
    //-- this is not ideal, better to check id and parent
    const isActive = pathname.includes(item.url_slug)
   //console.log('apiUpdate', apiUpdate)
    return (
        <div key={item.id} className='group max-w-full'>
           {/* <div className='border-t border-transparent hover:border-blue-500 w-full relative'>
                <div className='hidden group-hover:block absolute -left-[5px] -top-[10px] hover:bg-blue-500 size-4 flex items-center rounded-full p-1 center'>+</div>
            </div>*/}
            <div className={`${isActive ? theme?.nestable?.navItemContainerActive : theme?.nestable?.navItemContainer} `}>

                <NavLink className={theme?.nestable?.navLink} to={`${edit ? `${baseUrl}/edit` : baseUrl}/${item.url_slug || item.id}`}>{item.title || item.id}</NavLink>

                <div className={'flex gap-0.5 items-center'}>
                    {/*{
                        [
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
                        ].map(modal => <div onClick={modal.onClick}>{modal.name}</div>)
                    }*/}
                    <Menu
                      items={[
                        {
                          name: (<span className=''>Rename</span>),
                          onClick: () => setShowRename(true)
                        },
                        item.id === activeItem.id ? {
                            name: (<span className=''>{duplicating ? 'Duplicating...' : 'Duplicate'}</span>),
                            onClick: async () => {
                                if(item.id === activeItem.id){
                                    setDuplicating(true);
                                    await duplicatePage(item.id);
                                    setDuplicating(false)
                                }
                            }
                        } : undefined,
                          {
                          name: (<span className='text-red-400'>Delete</span>),
                          onClick: () => setShowDelete(true)
                        }
                      ].filter(f => f)}
                    >
                      <div className='flex items-center text-slate-300 hover:text-slate-600 rounded-full hover:bg-blue-300'>
                        <Icon icon={'EllipsisVertical'} className='size-5' />
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
                    <Icon icon={'ArrowRight'} className={theme?.nestable?.collapsIcon}  onClick={() => handleCollapseIconClick()}/> :
                    <Icon icon={'ArrowDown'} className={theme?.nestable?.collapsIcon} onClick={() => handleCollapseIconClick()}/>
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
  const cancelButtonRef = useRef(null);
  const { UI } = React.useContext(ThemeContext) || {};
  const {Button, Dialog} = UI;
  const [loading, setLoading] = useState(false);

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
          forwardref={cancelButtonRef}
        >
          Cancel
        </Button>
      </div>
    </Dialog>
  )
}


function RenameModal ({title, prompt, item={}, dataItems, open, setOpen})  {
  const cancelButtonRef = useRef(null)
  const { UI } = React.useContext(ThemeContext)
  const { user } = React.useContext(CMSContext) || {};
  const { apiUpdate } =  React.useContext(PageContext) || {};
  const {Button, Dialog} = UI;
  const submit = useSubmit();
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
          id: editItem.id,
          title: newName,
          parent: editItem?.parent
        }
        newItem.url_slug = getUrlSlug(newItem, dataItems)
        const newPathName = pathname.endsWith(item.url_slug) ? pathname.replace(new RegExp(item.url_slug + '$'), newItem.url_slug) : pathname;

        setLoading(true)
        //await submit(json2DmsForm(newItem), { method: "post", action: newPathName })
        await apiUpdate({data: newItem, newPath: newPathName})
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
            <input value={newName} onChange={e => setNewName(e.target.value)} />
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


export function PublishButton () {
  const {item, apiUpdate, reqPermissions } =  React.useContext(PageContext) || {}
  const hasChanges = item.published === 'draft' || item.has_changes
  const { user, authPermissions, isUserAuthed } = React.useContext(CMSContext) || {};
  const { UI } = React.useContext(ThemeContext)
  const {Button} = UI;

  if(!isUserAuthed(['publish-page'])) return <div className={'w-full flex items-center h-[40px] text-white'}>user not authorised to publish.</div>
  return (
    <div className='w-full flex justify-center h-[40px]'>
      { hasChanges && (
        <Button
          padding={'flex items-center h-[40px] mr-1 cursor-pointer'}
          type={'inactive'}
          onClick={() => discardChanges(user,item, apiUpdate)}
        >
          <span className='text-nowrap'> Discard </span>
        </Button>
      )}
      <Button
          padding={' flex items-center h-[40px]'}
          disabled={!hasChanges}
          type={hasChanges ? 'active' : 'inactive'}
          onClick={() => publish(user,item, apiUpdate)}
      >
        <span className='text-nowrap'> {hasChanges ? `Publish` : `No Changes`} </span>

      </Button>

      {/*hasChanges && (
        <Menu
          items={[{
            name: (<span className='text-red-400'>Discard Changes</span>),
            onClick: () =>  }
          ]}
        >
          <Button padding={'py-1 w-[35px] h-[40px]'} rounded={'rounded-r-lg'} type={hasChanges ? 'active' : 'inactive'}>
            <CaretDown className='size-[28px]' />
          </Button>
        </Menu>
      )*/}
    </div>
  )
}
