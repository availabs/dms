import React, {Fragment, useState, useEffect, useRef, useMemo} from 'react'
import { NavLink, useSubmit, useLocation, matchPath, matchRoutes, useMatch } from "react-router-dom";
import { CMSContext } from '../../../siteConfig'

import Nestable from './index';
import { json2DmsForm, getUrlSlug } from '../../../pages/_utils'


import {ArrowDown, ArrowUp, ArrowRight, ArrowLeft, DraftPage} from '../../icons';

import { Button } from '../../';


export const nestableTheme = {
    container: `max-w-full max-h-full  pb-6 `,
    navListContainer: 'h-full border-l  pt-3 pl-2 overflow-auto max-h-[calc(100vh_-_155px)] min-h-[calc(100vh_-_155px)]',
    navItemContainer:'text-slate-600 border-l border-y rounded border-transparent flex items-center gap-1 cursor-pointer group group-hover:bg-blue-100',
    navItemContainerActive: 'bg-white text-blue-500  border-l rounded border-y border-slate-300 flex items-center gap-1 cursor-pointer group group-hover:bg-blue-100', 
    navLink: `flex-1 px-4 py-2 font-light text-elipses`,
    subList: 'pl-[30px]',
    collapseIcon: 'text-gray-400 hover:text-gray-500',
    dragBefore: 'before:absolute before:top-0 before:left-0 before:right-0 before:bottom-0 before:bg-blue-300 before:border-dashed before:rounded before:border before:border-blue-600',
    
}



function DefaultNavItem ({item, dataItems, handleCollapseIconClick, isCollapsed, edit, OpenIcon=ArrowDown, ClosedIcon=ArrowRight}) {
    const { baseUrl, user, theme = { nestable: nestableTheme } } = React.useContext(CMSContext);

    const { pathname = '/edit' } = useLocation()

    //-- this is not ideal, better to check id and parent
    const isActive = matchRoutes([{path: item.url_slug}], pathname.replace('/edit')).length > 0

    return (
        <div key={item.id} className='group'>
            {/*<div className='border-t border-transparent hover:border-blue-500 w-full relative'>
                <div className='hidden group-hover:block absolute -left-[5px] -top-[10px] hover:bg-blue-500 size-4 flex items-center rounded-full p-1 center'>+</div>
            </div>*/}
            <div className={`${isActive ? theme?.nestable?.navItemContainerActive : theme?.nestable?.navItemContainer}`}>

                <NavLink className={theme?.nestable?.navLink} to={`${edit ? `${baseUrl}/edit` : baseUrl}/${item.url_slug || item.id}`}>{item.title}</NavLink>

                <div className={'flex gap-0.5 items-center'}>
                    {/*unpublished pill*/}
                    {/*{hasChanges ?  <DraftPage className={'text-orange-500'} />  : null}*/}

                    {/*unpublished children pill*/}
                    {/*{unpublishedChildren ? <Pill text={unpublishedChildren} color={'orange'} /> : null}*/}
                    {/*total children pill*/}
                    {/*{allChildren ? <Pill text={allChildren} color={'gray'} /> : null}*/}

                </div>


                {!item.children?.length ? <div className='size-6'/> : isCollapsed  ?
                    <OpenIcon className={theme?.nestable?.collapsIcon}  onClick={() => handleCollapseIconClick()}/> :
                    <ClosedIcon className={theme?.nestable?.collapsIcon} onClick={() => handleCollapseIconClick()}/>
                }

                
            </div>
            {/*<div className='border-t border-transparent hover:border-blue-500 w-full relative'>
                <div className='hidden group-hover:block absolute left-0 -bottom-0 hover:bg-blue-500 size-4 flex items-center rounded-full p-1'>+</div>
            </div>*/}
        </div>
    )
  
}


function DraggableNav ({item, dataItems, NavComp=DefaultNavItem, edit=true}) {
    const { baseUrl, theme = { nestable: nestableTheme } } = React.useContext(CMSContext) || {}
    const submit = useSubmit()
    
    const { pathname = '/edit' } = useLocation()
    
  
    const items = dataItems
            .sort((a,b) => a.index-b.index)
            .filter(d => !d.parent)
            .map((d,i) => {
                return {
                    id: d.id,
                    index: d.index,
                    title: d.title,
                    url_slug: d.url_slug,
                    children: getChildNav(d, dataItems, baseUrl, edit) || []
                }
            })
    
    

  const onDragEnd = React.useCallback(result => {
    let dataItemsHash = dataItems.reduce((out,curr) => {
      out[curr.id] = curr
      return out
    },{})

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
      // apiUpdate(item)
      submit(json2DmsForm(item), { method: "post", action: pathname })
    })).then(values => {
      //console.log('updating nav', values)
    })

  }, []);

  const findParents = (dataitems,id) => {
    let parent = dataItems.filter(d => +d.id === +id)?.[0]?.parent
    if(!parent) {
      return [id]
    }
    return [id, ...findParents(dataitems, parent)].filter(d => d)
  }
  
  let matchItems = dataItems.map(d => {
    return {...d, path: `${d.url_slug}/*` }
  })

  let matchId = matchRoutes(matchItems, {pathname:  pathname.replace('edit/','')})?.[0]?.route?.id || -1
  let matches = findParents(dataItems, matchId)

  return (
    <div className={theme?.nestable?.container}>
      <div className={theme?.nestable?.navListContainer}>
          <Nestable
            items={items}
            onChange={onDragEnd}
            collapsedIds={matchItems
                .filter(d => !matches.includes(d.id))
                .map(d => d.id)
            }
            maxDepth={4}
            renderItem={(props) => {
                return (
                    <NavComp
                        activeItem={item}
                        edit={edit}
                        item={props.item}
                        dataItems={dataItems}
                        handleCollapseIconClick={props.handleCollapseIconClick}
                        isCollapsed={props.isCollapsed}
                    />
                )
            }}
          />
      
      
      </div>
      {edit && <AddItemButton dataItems={dataItems}/>}
    </div>
    
  )
}



function AddItemButton ({dataItems}) {
  const submit = useSubmit();
  const { pathname = '/edit' } = useLocation();
  const { baseUrl, user, theme = { nestable: nestableTheme } } = React.useContext(CMSContext);
  const [loading, setLoading] = useState(false);
  
  const highestIndex = dataItems
    .filter(d => !d.parent)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? -1 : d.index  , out)
    },-1)

  //console.log(highestIndex, dataItems)
  const item = {
    title: `Page ${highestIndex + 1}`,
    index: highestIndex + 1,
    published: 'draft',
    history: [{
      type:' created Page.',
      user: user.email, 
      time: new Date().toString()
    }]
  }
  item.url_slug = getUrlSlug(item,dataItems)

  const addItem = async () => {
      setLoading(true);
      await submit(json2DmsForm(item), { method: "post", action: pathname })
      setLoading(false);
  }
  return (
    <div className='border px-4 py-2 rounded '>
      <Button 
        onClick={addItem}
        className={'w-full'}
      >
          {loading ? 'Adding Page' : '+ Add Page'}
      </Button>
    </div>
  )
}

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


function getChildNav(item, dataItems, baseUrl, edit=true) {
  let children = dataItems
    .filter(d => d.parent === item.id)
    .sort((a,b) => a.index-b.index)

  if(children.length === 0) return false

  // console.log('children', children)
  return children.map((d,i) => {
    return {
      id: d.id,
      index: d.index,
      title: d.title,
      url_slug: d.url_slug,
      children: getChildNav(d,dataItems,baseUrl, edit) || []
    }
  })
  
}




// function updateNav(items, parentId = '', dataItemsHash) {
//     // recursive depth nav updater
//     let updates = []
//     items.forEach((newItem, i) => {
//         let orig = dataItemsHash[newItem.id]
//         const update = {id: orig.id, index: orig.index, title: orig.title, url_slug: orig.url_slug}//
//         if (orig.index !== i || orig.parent !== parentId) {
//             update.index = i
//             update.parent = parentId
//             updates.push(update)
//         }
//         if (newItem.children) {
//             updates = [...updates, ...updateNav(newItem.children, newItem.id, dataItemsHash)]
//         }
//     })
//     return updates
// }

// const getExpandableItems = (items) => items.reduce((acc, curr) => curr.children ? [...acc, curr.id, ...getExpandableItems(curr.children)] : acc, [])

// // ==================================================== util fns end ===================================================

// const Pill = ({color, text}) => {
//     const colors = {
//         orange: `bg-orange-500/15 text-orange-700 group-data-[hover]:bg-orange-500/25`,
//         blue: `bg-blue-500/15 text-blue-700 group-data-[hover]:bg-blue-500/25`,
//         gray: `text-gray-400`
//     };
//     return (
//         <div
//             className="group relative inline-flex rounded-md focus:outline-none">
//             <span className={`inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline
//             ${colors[color]}
//             `}>{text}</span>
//         </div>
//     )
// }

// function DraggableNav({dataItems, item: selectedPage, edit=true}) {
//     const submit = useSubmit()
//     const {pathname = '/edit'} = useLocation()
//     // const navigate = useNavigate();
//     const {baseUrl} = React.useContext(CMSContext)
//     const [expandedItems, setExpandedItems] = useState({});
//     const nestableRef = useRef(null);

//     const toggleExpand = (id) => {
//         setExpandedItems((prevState) => ({
//             ...prevState,
//             [id]: !prevState[id], // Toggle expand/collapse for the clicked item
//         }));
//     };

//     const onDragEnd = React.useCallback(result => {
//         let dataItemsHash = dataItems.reduce((out, curr) => {
//             out[curr.id] = curr
//             return out
//         }, {})

//         let updates = updateNav(result.items, '', dataItemsHash)

//         // need non updated items
//         // to determine new slug names
//         let newItems = [
//             ...updates,
//             ...dataItems.filter(d => !updates.map(i => i.id).includes(d.id))
//         ]

//         updates.forEach((item) => item.url_slug = getUrlSlug(item, newItems))

//         //---------------------------------
//         //send updates to API
//         //---------------------------------
//         Promise.all(
//             updates.map((item) => {
//                 submit(json2DmsForm(item), {method: "post", action: pathname})
//             }))
//     }, []);

//     const detectHasChanges = item => item.published === 'draft' || item.has_changes === 'true' || item.has_changes === true;

//     const mapDataItemToItem = (d, i) => {
//         let item = {
//             id: d.id,
//             index: d.index,
//             title: d.title,
//             has_changes: detectHasChanges(d),
//             url: d.url_slug
//         }
//         if (getChildNav(item, dataItems)) {
//             item.children = getChildNav(d, dataItems)
//         }

//         item.Comp = ({isExpanded, hasChanges, isSelectedPage}) => {
//             const unpublishedChildren = getUnpublishedChildrenCount(item, dataItems);
//             const allChildren = getAllChildrenCount(item, dataItems);

//             return (

//                 <div key={item.id}>
//                     <div 
//                          className={`p-1.5 flex items-center gap-1 cursor-pointer ${isSelectedPage ? `bg-gray-100` : ``} hover:bg-gray-100 rounded-md`}>

//                        {/* <span className={'flex-1 truncate'}
//                               title={item.title}
//                               onClick={e => {
//                                   e.stopPropagation();
//                                   setSelectedPage(item.id);
//                               }}>{item.title}
//                         </span>*/}
//                         <NavLink className={'flex-1 truncate'} to={`${edit ? `${baseUrl}/edit` : baseUrl}/${d.url_slug || d.id}`}>{item.title}</NavLink>

//                         <div className={'flex gap-0.5 items-center'}>
//                             {/*unpublished pill*/}
//                             {hasChanges ?  <DraftPage className={'text-orange-500'} />  : null}

//                             {/*unpublished children pill*/}
//                             {unpublishedChildren ? <Pill text={unpublishedChildren} color={'orange'} /> : null}
//                             {/*total children pill*/}
//                             {allChildren ? <Pill text={allChildren} color={'gray'} /> : null}
//                         </div>


//                         {!item.children?.length ? '' : isExpanded ?
//                             <ArrowUp className={'text-gray-400 hover:text-gray-500'}  onClick={() => {
//                                 toggleExpand(item.id)
//                             }}/> :
//                             <ArrowDown className={'text-gray-400 hover:text-gray-500'} onClick={() => {
//                                 toggleExpand(item.id)
//                             }}/>
//                         }

                        
//                     </div>
//                     {isExpanded && item.children ? <div className={`pl-5 border-l ${isSelectedPage ? `bg-gray-100` : ``}`}>{(item?.children || []).map(renderItem)}</div> : null}
//                 </div>
//             )
//         };
//         return item
//     }

//     function getUnpublishedChildrenCount (item, dataItems) {
//         let children = dataItems.filter(d => d.parent === item.id)

//         if (children.length === 0) return 0 // detectHasChanges(item) ? 1 : 0;

//         return children.reduce((acc, c) => acc +
//                 (detectHasChanges(c) ? 1 : 0) + // count current item
//                 getUnpublishedChildrenCount(c, dataItems) // count current item's unpublished children
//             , 0)
//     }

//     function getAllChildrenCount (item, dataItems) {
//         let children = dataItems.filter(d => d.parent === item.id)

//         if (children.length === 0) return 0 // detectHasChanges(item) ? 1 : 0;

//         return children.reduce((acc, c) => acc +
//                 1 + // count current item
//                 getAllChildrenCount(c, dataItems) // count current item's unpublished children
//             , 0)
//     }

//     function getChildNav(item, dataItems) {
//         let children = dataItems
//             .filter(d => d.parent === item.id)
//             .sort((a, b) => a.index - b.index)

//         if (children.length === 0) return false
//         return children.map(mapDataItemToItem)
//     }

//     const items = dataItems
//         .sort((a, b) => a.index - b.index)
//         .filter(d => !d.parent && d.index !== '999')
//         .map(mapDataItemToItem)

//     const renderItem = (item) => {
//         if (!item) return null;
//         let Comp = item.Comp;
//         const isSelectedPage = selectedPage.id === item.id;
//         const isExpanded = expandedItems[item.id] || isSelectedPage;
//         const hasChanges = detectHasChanges(item);
     
//         return <Comp    
//             isExpanded={isExpanded} 
//             hasChanges={hasChanges} 
//             isSelectedPage={isSelectedPage}
//             item={item}
//         />
                
            
//     }

    
//     return (
//         <div className={customTheme.nav.container}>
//             <div className={customTheme.nav.navItemContainer}>
//                 <div className={'px-1 flex gap-1 w-full justify-end'}>
//                     <button className={customTheme.nav.expandCollapseButton} onClick={() => setExpandedItems({})}>
//                         Collapse All
//                     </button>
//                     <button className={customTheme.nav.expandCollapseButton}
//                             onClick={() => setExpandedItems(getExpandableItems(items).reduce((acc, curr) => ({
//                                 ...acc,
//                                 [curr]: true
//                             }), {}))}
//                     >Expand All
//                     </button>
//                     {/*<ArrowLeft className={'cursor-pointer text-blue-400 hover:text-blue-500'} onClick={() => setOpen(false)} />*/}
//                 </div>

//                 <Nestable
//                     ref={nestableRef}
//                     items={items}
//                     collapsed={true}
//                     onChange={onDragEnd}
//                     maxDepth={4}
//                     renderItem={({item}) => renderItem(item)}
//                 />

               
//             </div>
//             <AddItemButton dataItems={dataItems}/>
//         </div>
//     )
// }

export default DraggableNav