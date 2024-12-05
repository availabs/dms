import React, {Fragment, useState, useEffect} from 'react'
//import ManagerLayout from './layout'
import { NavLink, useSubmit, useLocation } from "react-router-dom";
//import { Dialog, Transition } from '@headlessui/react'


import { Nestable } from '../../ui';
import { json2DmsForm, getUrlSlug, dataItemsNav } from '../_utils'


 import { CMSContext } from '../../siteConfig'






function PagesManager ({item, dataItems, attributes, logo, edit, rightMenu}) {
 
  
  const { baseUrl, theme, user } = React.useContext(CMSContext) || {}

  return (
      <div className={`${theme?.page?.wrapper2}`}>
        {/*<SideNavContainer>
          Left Nav
        </SideNavContainer>
       */}   
        <div className={theme?.page?.wrapper3}>
          {/* Content */}
          <div>
            <div className='flex items-center'>
                <div className='text-2xl p-3 font-thin flex-1'>Pages</div>
                {/*{
                  path === `${baseUrl}/manage/templates` ? 
                     <div className='px-1'><Link to={`${baseUrl}`} className='inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-1 px-4 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none'> Templates </Link></div>
                  :  <div className='px-1' ><div onClick={()=> setShowNew(!showNew)} className='inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-1 px-4 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none'> New Template</div></div>
                }*/}
            </div>
            <div>
              <Nav item={item} dataItems={dataItems} edit={true} />
            </div>
          </div>

        </div>
       {/* <SideNavContainer>
          Right Nav
        </SideNavContainer>   */}
      </div>
  ) 
}

const theme = {
  nav: {
    container: (open) => `w-full border-2 border-teal-400`,
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

  // console.log('items', items)

  
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
  //console.log('items', items)
  return ( 
    <>
    <div className={theme.nav.container(open)}>
      <div className={theme.nav.navItemContainer}>
      <Nestable
        items={items}
        onChange={onDragEnd}
        maxDepth={4}
        renderItem={({ item }) => {
          //console.log('item', item)
          let Comp  = item.Comp
          return <Comp />
        }}
      />
      
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


export default PagesManager

