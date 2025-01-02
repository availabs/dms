import React, {Fragment, useState, useEffect} from 'react'
import { NavLink, useSubmit, useLocation } from "react-router-dom";
import { CMSContext } from '../../../siteConfig'

import Nestable from './index';
import { json2DmsForm, getUrlSlug } from '../../../pages/_utils'





const theme = {
  nav: {
    container: `w-full `,
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

function getChildNav(item, dataItems, baseUrl) {
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
          to={`${baseUrl}/edit/${d.url_slug || d.id}`} 
          className={theme.nav.navItem}
        >
          {d.title}
        </NavLink>
      )  
    }
    if(getChildNav(item,dataItems,baseUrl)) {
      item.children = getChildNav(d,dataItems,baseUrl)
    }
    return item
  })
  
}

function DraggableNav ({item, dataItems, edit, open, setOpen}) {
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
      //submit(json2DmsForm(item), { method: "post", action: pathname })
    }))

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
            to={`${baseUrl}/edit/${d.url_slug || d.id}`} 
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
    <div className={theme.nav.navItemContainer}>
      <Nestable
        items={items}
        onChange={onDragEnd}
        maxDepth={4}
        renderItem={({ item }) => {
          let Comp  = item.Comp
          return <Comp />
        }}
      />
    
      <AddItemButton dataItems={dataItems}/>
    </div>
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
    //submit(json2DmsForm(item), { method: "post", action: pathname })
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

export default DraggableNav

