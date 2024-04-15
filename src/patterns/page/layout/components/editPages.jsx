import React, {Fragment, useState, useEffect} from 'react'
import { NavLink, useSubmit, useLocation } from "react-router-dom";

import { CMSContext } from '../../siteConfig'

import Nestable from '../components/nestable';
import { dataItemsNav } from '../components/utils/navItems'
import { json2DmsForm, getUrlSlug } from '../components/utils/navItems'
import { Dialog, Transition } from '@headlessui/react'


export default function EditPagesNav ({ item, dataItems, edit, open, setOpen}) {
  const { baseUrl } = React.useContext(CMSContext)
  
  // const menuItems = React.useMemo(() => {
  //   let items = dataItemsNav(dataItems,baseUrl,true)
  //   return items
  // }, [dataItems])  

  // console.log('edit pages in nav', dataItems)

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={setOpen}>
        <div className="fixed inset-0" />

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-500 sm:duration-700"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500 sm:duration-700"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white py-6 shadow-xl">
                    <div className="px-4 sm:px-6">
                      <div className="flex items-start justify-between">
                        <Dialog.Title className="text-base font-semibold leading-6 text-gray-900">
                          Edit Pages
                        </Dialog.Title>
                        <div className="ml-3 flex h-7 items-center">
                          <button
                            type="button"
                            className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none "
                            onClick={() => setOpen(false)}
                          >
                            <span className="absolute -inset-2.5" />
                            <span className="sr-only">Close panel</span>
                            <i className="h-6 w-6 fa fa-close" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="relative mt-6 flex-1 px-4 sm:px-6">
                      <Nav item={item} dataItems={dataItems} edit={edit} open={open} setOpen={setOpen} />
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

const theme = {
  nav: {
    container: (open) => `w-full `,
    navItemContainer: 'h-full border-l overflow-y-auto overflow-x-hidden pt-3 scrollbar-xs',
    navItem: ({ isActive, isPending }) =>
      `block px-4 py-2 font-light ${isActive ?
        'w-[256px] bg-white text-blue-500 border-l border-y' :
        'w-[248px] hover:bg-blue-100 text-slate-600'
      }`,
    navItemChild: ({ isActive, isPending }) =>
      `block px-4 py-2 font-light ${isActive ?
        'w-[238px] bg-white text-blue-500 border-l border-y' :
        'w-[230px] hover:bg-blue-100 text-slate-600'
      }`,
    addItemButton: 'cursor-pointer px-4 py-2 mt-3 hover:bg-blue-100 w-full text-slate-400 border-t border-slate-200'
  }
}

function getChildNav(item, dataItems, baseUrl, edit) {
  let children = dataItems
    .filter(d => d.parent === item.id)
    .sort((a,b) => a.index-b.index)

  if(children.length === 0) return false

  // console.log('children', children)
  return children.map((d,i) => {
    let item  = {
      id: d.id,
      Comp: () => (
        <NavLink
          key={i}
          to={`${edit ? `${baseUrl}/edit` : baseUrl}/${d.url_slug || d.id}`} 
          className={theme.nav.navItem}
        >
          {d.title}
        </NavLink>
      )  
    }
    if(getChildNav(item,dataItems,baseUrl,edit)) {
      item.children = getChildNav(d,dataItems,baseUrl, edit)
    }
    return item
  })
  
}

function Nav ({item, dataItems, edit, open, setOpen}) {
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation()
  const { baseUrl} = React.useContext(CMSContext)
  
  
  const onDragEnd = React.useCallback(result => {
    let dataItemsHash = dataItems.reduce((out,curr) => {
      out[curr.id] = curr
      return out
    },{})

    function updateNav(items, parentId='', dataItemsHash) {
      // recursive depth nav updater
      let updates = []
      items.forEach((newItem,i) => {
        let orig = dataItemsHash[newItem.id]
        const update = {id: orig.id, index: orig.index, title: orig.title, url_slug: orig.url_slug}//
        if(orig.index !== i || orig.parent !== parentId) {
          update.index = i
          update.parent = parentId
          updates.push(update)
        } 
        if(newItem.children) {
          updates = [...updates, ...updateNav(newItem.children, newItem.id, dataItemsHash )]
        }
      })
      return updates
    }

    let updates = updateNav(result.items, '', dataItemsHash)
    
    // need non updated items
    // to determine new slug names
    let newItems = [
      ...updates, 
      ...dataItems
        .filter(d => !updates.map(i => i.id).includes(d.id))
    ]
    updates.forEach((item) => item.url_slug = getUrlSlug(item,newItems))

    //---------------------------------
    //send updates to API
    //---------------------------------
    Promise.all(updates.map((item) => {
      submit(json2DmsForm(item), { method: "post", action: pathname })
    })).then(values => {
      //console.log('updating nav', values)
    })

  }, []);

  
  
  const items = dataItems
    .sort((a,b) => a.index-b.index)
    .filter(d => !d.parent)
    .map((d,i) => {
      let item = {
        id: d.id,
        index: d.index,
        Comp: () => (
          <NavLink
            to={`${edit ? `${baseUrl}/edit` : baseUrl}/${d.url_slug || d.id}`} 
            className={theme.nav.navItem}
          >
              {d.title}             
          </NavLink>
        )
      }
      if(getChildNav(item,dataItems, baseUrl)) {
        item.children = getChildNav(d,dataItems, baseUrl, edit)
      }
      return item
    })

  const renderItems = (items) => {
    return items.map(item => {
      let Comp = item.Comp 
      return (
        <React.Fragment key={item.id}>
          <Comp  />
          {item.children
            ? <div className='border-l ml-4 pl-2'>{renderItems(item.children)}</div>
            : ''
          }
        </React.Fragment>
      )
    })
  }
  

  //console.log('items', items)
  return ( 
    <>
    <div className={theme.nav.container(open)}>
      <div className={theme.nav.navItemContainer}>
      {edit ? <Nestable
        items={items}
        onChange={onDragEnd}
        maxDepth={4}
        renderItem={({ item }) => {
          // console.log('item', item)
          let Comp  = item.Comp
          return <Comp />
        }}
      /> : renderItems(items)
      }
      
      {edit && <AddItemButton dataItems={dataItems}/>}
      </div>
    </div>
    {/*<div className={`${open ? `w-64` : 'w-0'} hidden lg:block`}/>*/}
    
    </>
  )
}

function AddItemButton ({dataItems}) {
  const submit = useSubmit();
  const { pathname = '/edit' } = useLocation();
  const { baseUrl, user } = React.useContext(CMSContext);
  
  const highestIndex = dataItems
    .filter(d => !d.parent)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? -1 : d.index  , out)
    },-1)

  //console.log(highestIndex, dataItems)
  const item = {
    title: 'New Page',
    index: highestIndex + 1,
    published: 'draft',
    history: [{
      type:' created Page.',
      user: user.email, 
      time: new Date().toString()
    }]
  }
  item.url_slug = getUrlSlug(item,dataItems)

  const addItem = () => {
    submit(json2DmsForm(item), { method: "post", action: pathname })
  }
  return (
    <div className='pr-2'>
      <div 
        onClick={addItem}
        className={theme.nav.addItemButton}
      >
        + Add Page
      </div>
    </div>
  )
}



