import { cloneDeep } from "lodash-es"
import { json2DmsForm, getUrlSlug, toSnakeCase, parseJSON } from '../_utils'
// import { ButtonSelector,SidebarSwitch } from '../../ui'

/**
 * Build a history object by appending a new entry to existing entries.
 * Returns only { id?, entries } — id tells updateDMSAttrs to edit the
 * existing page-edit row; entries is the data to store.
 * Resolved ref metadata (ref, created_at, etc.) is NOT included —
 * updateDMSAttrs rebuilds the ref from the format config.
 */
export function appendHistoryEntry(existingHistory, action, user) {
  const entry = { action, user: user?.email, time: new Date().toString() }
  const entries = Array.isArray(existingHistory?.entries)
    ? [...existingHistory.entries, entry]
    : [entry]
  // Include id if editing an existing page-edit row
  if (existingHistory?.id) {
    return { id: existingHistory.id, entries }
  }
  return { entries }
}


export const insertSubPage = async (item, dataItems, user, apiUpdate) => {
    if(!item?.id) return;

    const highestIndex = dataItems
    .filter(d => d.parent === item.id)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? 0 : d.index  , out)
    },0)

    const newItem = {
      title: 'New Page',
      parent: item.id,
      index: highestIndex + 1,
      published: 'draft',
      history: appendHistoryEntry(null, ' created Page.', user)
    }
    newItem.url_slug = `${getUrlSlug(newItem,dataItems)}`
    apiUpdate({data:newItem})
  }

export const duplicateItem = (item, dataItems, user, apiUpdate) => {
    const highestIndex = dataItems
        .filter(d => !d.parent)
        .reduce((out,d) => {
            return Math.max(isNaN(d.index) ? -1 : d.index  , out)
        },-1)

    const newItem = cloneDeep(item)
    delete newItem.id
    newItem.title += ' Dup'
    newItem.index = highestIndex + 1
    newItem.url_slug = getUrlSlug(newItem, dataItems)
    newItem.sections.forEach(s => {
        // delete s.parent; // todo update this with the new parent id
        delete s.ref
        delete s.id
    })
    newItem.draft_sections.forEach(s => {
        delete s.ref
        delete s.id
    })
    newItem.history = appendHistoryEntry(null, 'Created Duplicate Page.', user)
    apiUpdate({data:newItem})
}

export const newPage = async (item, dataItems, user, apiUpdate) => {
    const highestIndex = dataItems
    .filter(d => !d.parent)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? 0 : d.index  , out)
    },0)

    const newItem = {
      title: `Page ${highestIndex + 1}`,
      parent: item?.parent,
      index: highestIndex + 1,
      published: 'draft',
      history: appendHistoryEntry(null, ' created Page.', user)
    }
    newItem.url_slug = `${getUrlSlug(newItem,dataItems)}`

    await apiUpdate({data:newItem})
  }

export const updateTitle = async ( item, dataItems, value='', user, apiUpdate) => {
    if(!item.id) return;
    if(value !== item.title) {
      const newItem = {
        id: item.id,
        title:value,
        parent: item?.parent || '',
        history: appendHistoryEntry(item.history, `changed page title to ${value}`, user)
      }

      newItem.url_slug = getUrlSlug(newItem, dataItems)
      apiUpdate({data:newItem, newPath: `/edit/${newItem.url_slug}`})
    }
  }

  export const updateHistory = async ( item, value='', user, apiUpdate) => {
    if(!item.id) return;
      const newItem = {
        ...cloneDeep(item),
        history: appendHistoryEntry(item.history, value, user)
      }

      apiUpdate({data:newItem})
  }

export const toggleSidebar = async (item,type, value='', pageType, apiUpdate) => {
  const newItem = {id: item.id}
  newItem[type] = value

  // console.log('item', newItem, value)
  let sectionType = pageType === 'template' ? 'sections' : 'draft_sections';
  if(type === 'header' && !item?.[sectionType]?.filter(d => d.is_header)?.[0]) {
    //console.log('toggleHeader add header', newItem[sectionType])
    newItem[sectionType] = cloneDeep(item[sectionType] || [])
    newItem[sectionType].unshift({
      is_header: true,
      element : {
        "element-type": "Header: Default Header",
        "element-data": {}
      }
    })
    //console.log('new item', newItem)

  }

  apiUpdate({data:newItem})
}

export const publish = async (user, item, apiUpdate) => {
  console.log('publish', item)
    if(!item.id) return;

  const newItem = {
    id: item.id,
    has_changes: false,
    published: '',
    history: appendHistoryEntry(item.history, 'published changes.', user)
  }

  // no use: draft_id is never saved
  let sectionsByDraftId = cloneDeep(item.sections || [])
    .reduce((o,s) => {
      if(s.draft_id){
        o[s.draft_id] = s;
      }
      return o
    },{})

  newItem.sections = cloneDeep(item.draft_sections || [])
    .reduce((sections, draft) => {
      if(sectionsByDraftId[draft.id]) { // never triggers
        draft.id = sectionsByDraftId[draft.id].id
      } else {
        delete draft.id
      }

      delete draft.is_draft;
      sections.push(draft)
      return sections
    },[])

  newItem.section_groups = cloneDeep(item.draft_section_groups)
  newItem.dataSources = cloneDeep(item.draft_dataSources)
  console.log('publishing item', newItem)
  apiUpdate({data:newItem})

}

export const discardChanges = async (user,item, apiUpdate) => {
    if(!item.id) return;

  const newItem = {
    ...cloneDeep(item),
    has_changes: false,
    published: '',
    history: appendHistoryEntry(item.history, 'discarded changes.', user)
  }

  newItem.draft_sections = item.sections.map(s => {
      const sectionCopy = cloneDeep(s);
      delete sectionCopy.id;
      return sectionCopy;
  });
  newItem.draft_section_groups = newItem.section_groups;
  apiUpdate({data:newItem})

}

// export function getMenus (item, dataItems, user, pageType, editState, setEditState, apiUpdate) {
//   return [
//       {
//         "icon": <WrenchIcon className='text-blue-400 hover:text-blue-700 cursor-pointer h-10 w-10 p-2 ' />,
//         "name": "Page Controls",
//         "items": [
//           {item: '☲ New Page', "onClick": () => newPage(item, dataItems, user, apiUpdate) },
//           {item: '☲ Insert Subpage', "onClick":() =>  insertSubPage(item, dataItems, user, apiUpdate) },
//           {item: '☳ Duplicate', "onClick":() =>  duplicateItem(item, dataItems, user, apiUpdate) },
//           {item: '☵ Delete', "onClick": () => setEditState({...editState, showDelete: true}) }
//         ]
//       },
//       {
//         "icon": <SlidersIcon className='text-blue-400 hover:text-blue-700 cursor-pointer h-10 w-10 p-2' />,
//         "name": "Page Settings",
//         "items": [
//           {item: (
//             <>
//               <SidebarSwitch
//                 value={item['sidebar']}
//                 toggleSidebar={() => toggleSidebar(item, 'sidebar', item['sidebar'] === 'show' ? null : 'show',  pageType, apiUpdate) }
//               />
//               Show Sidebar
//             </>
//           )},
//           {item: (
//             <>
//               <SidebarSwitch
//                 value={item['full_width'] }
//                 toggleSidebar={() => toggleSidebar(item, 'full_width', item['full_width'] === 'show' ? null : 'show',  pageType, apiUpdate)}
//               />
//               Full Width
//             </>
//           )},
//           {item: (
//             <>
//               <SidebarSwitch
//                 value={item['hide_in_nav'] }
//                 toggleSidebar={() => toggleSidebar(item, 'hide_in_nav', item['hide_in_nav'] === 'show' ? null : 'show',  pageType, apiUpdate)}
//               />
//               Hide In Nav
//             </>
//           )},
//           {item: (
//             <>
//               <ButtonSelector
//                 label={'Header:'}
//                 types={[
//                   {label: 'None', value: 'none'},
//                   {label: 'Above', value: 'above'},
//                   {label: 'Below', value: 'below'},
//                   {label: 'In page', value: 'inpage'}
//                 ]}
//                 type={item.header}
//                 setType={(e) => toggleSidebar(item, 'header', e,  pageType, apiUpdate)}
//               />
//             </>
//           )},
//         ]
//       },
//       {
//         "icon": <MenuIcon className='text-blue-400 hover:text-blue-700 cursor-pointer h-10 w-10 p-2' />,
//         "onClick": () => setEditState({...editState, showNav: true})
//       },
//       {
//         "icon": <ClockIcon className='text-blue-400 hover:text-blue-700 cursor-pointer h-10 w-10 p-2' />,
//         "onClick": () => setEditState({...editState, showHistory: true})
//       }
//   ]
// }
