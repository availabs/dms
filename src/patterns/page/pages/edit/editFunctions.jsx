import cloneDeep from 'lodash/cloneDeep'
import { json2DmsForm, getUrlSlug, toSnakeCase, parseJSON } from '../_utils'
import { PencilIcon, CirclePlus, WrenchIcon, SlidersIcon, MenuIcon , ClockIcon} from '../../ui/icons'
import { ButtonSelector,SidebarSwitch } from '../../ui'

export const saveHeader = (v, item, user, apiUpdate ) => {
    const draftSections = item['draft_sections']?.filter(d => !d.is_header && !d.is_footer)
    
    let history = item.history ? cloneDeep(item.history) : []
  
    history.push({
      type: 'Header updated.',
      user: user?.email || 'user', 
      time: new Date().toString()
    })
    
    const newItem = {
      id: item.id, 
      draft_sections: [...v, ...draftSections].filter(d => d),
      has_changes: true,
      history, 
    }
    //console.log('save header', newItem)
    apiUpdate({data: newItem})
  }

export const saveSection = (v, action, item, user, apiUpdate) => {
    const headerSection = item['draft_sections']?.filter(d => d.is_header)?.[0]
    
    //console.log('save section', v,action)
    
    let edit = {
      type: action,
      user: user?.email || 'user', 
      time: new Date().toString()
    }

    let history = item.history ? cloneDeep(item.history) : []
    if(action){ history.push(edit) }
    // updateAttribute('','',{
    //   'has_changes': true,
    //   'history': history,
    //   'draft_sections': [headerSection, ...v].filter(d => d)
    // })

    // ----------------
    // only need to send id, and data to update, not whole 
    // --------------------

    const newItem = {
      id: item?.id, 
      draft_sections: [headerSection, ...v].filter(d => d),
      has_changes: true,
      history, 
    }
    apiUpdate({data: newItem})
  }


export const insertSubPage = async (item, dataItems, user, apiUpdate) => {
    const highestIndex = dataItems
    .filter(d => d.parent === item.id)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? 0 : d.index  , out)
    },0)

    //console.log(highestIndex, dataItems)
    const newItem = {
      title: 'New Page',
      parent: item.id,
      index: highestIndex + 1,
      published: 'draft',
      history: [{
        type:' created Page.',
        user: user.email, 
        time: new Date().toString()
      }]
    }
    newItem.url_slug = `${getUrlSlug(newItem,dataItems)}`    
    apiUpdate({data:newItem})
  }
  
export const newPage = async (item, dataItems, user, apiUpdate) => {
    const highestIndex = dataItems
    .filter(d => !d.parent)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? 0 : d.index  , out)
    },0)

    const newItem = {
      title: 'New Page',
      parent: item?.parent,
      index: highestIndex + 1,
      published: 'draft',
      history: [{
        type:' created Page.',
        user: user?.email, 
        time: new Date().toString()
      }]
    }
    newItem.url_slug = `${getUrlSlug(newItem,dataItems)}`

    apiUpdate({data:newItem})
  }

export const updateTitle = async ( item, dataItems, value='') => {
    if(value !== item.title) {
      let history = item.history ? cloneDeep(item.history) : []
      let edit = {
        type: `changed page title to ${value}`,
        user: user.email, 
        time: new Date().toString()
      }
      history.push(edit)
      
      const newItem = {
        id: item.id,
        title:value,
        history
      }

      newItem.url_slug = getUrlSlug(newItem, dataItems)
      // console.log('create new item', newItem, baseUrl)
      apiUpdate({data:newItem})
    }
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

export const publish = async (user,item, apiUpdate) => {
  let edit = {
    type: 'published changes.',
    user: user.email, 
    time: new Date().toString()
  }

  let history = item?.history ? cloneDeep(item.history) : []
  history.push(edit)

  const newItem = {
    id: item.id,
    has_changes: false,
    published: '',
    history
  }

  let sectionsByDraftId = cloneDeep(item.sections || [])
    .reduce((o,s) => { 
      if(s.draft_id){
        o[s.draft_id] = s;
      }
      return o
    },{})

  newItem.sections = cloneDeep(item.draft_sections || [])
    .reduce((sections, draft) => {
      if(sectionsByDraftId[draft.id]) {
        draft.id = sectionsByDraftId[draft.id].id
      } else {
        delete draft.id
      }
      sections.push(draft)
      return sections
    },[])

  apiUpdate({data:newItem})

}

export function getMenus (item, dataItems, user, pageType, editState, setEditState, apiUpdate) {
  return [
      {
        "icon": <WrenchIcon className='text-blue-400 hover:text-blue-700 cursor-pointer h-10 w-10 p-2 ' />,
        "name": "Page Controls",
        "items": [
          {item: '☲ New Page', "onClick": () => newPage(item, dataItems, user, apiUpdate) },
          {item: '☲ Insert Subpage', "onClick":() =>  insertSubPage(item, dataItems, user, apiUpdate) },
          {item: '☵ Delete', "onClick": () => setEditState({...editState, showDelete: true}) }
        ]
      },
      {
        "icon": <SlidersIcon className='text-blue-400 hover:text-blue-700 cursor-pointer h-10 w-10 p-2' />,
        "name": "Page Settings",
        "items": [
          {item: (
            <>
              <SidebarSwitch
                value={item['sidebar']}
                toggleSidebar={() => toggleSidebar(item, 'sidebar', item['sidebar'] === 'show' ? null : 'show',  pageType, apiUpdate) }
              />
              Show Sidebar
            </>
          )},
          {item: (
            <>
              <SidebarSwitch
                value={item['full_width'] }
                toggleSidebar={() => toggleSidebar(item, 'full_width', item['full_width'] === 'show' ? null : 'show',  pageType, apiUpdate)}
              />
              Full Width
            </>
          )},
          {item: (
            <>
              <SidebarSwitch
                value={item['hide_in_nav'] }
                toggleSidebar={() => toggleSidebar(item, 'hide_in_nav', item['hide_in_nav'] === 'show' ? null : 'show',  pageType, apiUpdate)}
              />
              Hide In Nav
            </>
          )},
          {item: (
            <>
              <ButtonSelector
                label={'Header:'}
                types={[
                  {label: 'None', value: 'none'}, 
                  {label: 'Above', value: 'above'},
                  {label: 'Below', value: 'below'},
                  {label: 'In page', value: 'inpage'}
                ]}
                type={item.header}
                setType={(e) => toggleSidebar(item, 'header', e,  pageType, apiUpdate)}
              />
            </>
          )},
        ]
      },
      {
        "icon": <MenuIcon className='text-blue-400 hover:text-blue-700 cursor-pointer h-10 w-10 p-2' />,
        "onClick": () => setEditState({...editState, showNav: true})
      },
      {
        "icon": <ClockIcon className='text-blue-400 hover:text-blue-700 cursor-pointer h-10 w-10 p-2' />,
        "onClick": () => setEditState({...editState, showHistory: true})
      }
  ]
}