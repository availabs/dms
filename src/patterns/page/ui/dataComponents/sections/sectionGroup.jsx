import React from 'react'
import { Link } from 'react-router-dom'
import { cloneDeep } from 'lodash-es'

import { SideNav,Icon } from '../../'
import { ViewIcon } from '../../icons'
import { PageContext } from '../../../pages/view'
import { getInPageNav } from '../../../pages/_utils'
import { CMSContext } from '../../../siteConfig'

export const sectionGroupTheme = {
  default: {
    wrapper1: 'w-full h-full flex-1 flex flex-row pt-2', // inside page header, wraps sidebar
    wrapper2: 'flex flex-1 w-full border-2 flex-col border shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 h-full min-h-[200px]' , // content wrapepr
    iconWrapper : 'z-5 absolute right-[10px] top-[5px]',
    icon: 'text-slate-400 hover:text-blue-500',
    sideNavContainer1: 'w-64 hidden xl:block',
    sideNavContainer2: 'w-64 sticky top-20 hidden xl:block'
  },
  content: {
    wrapper1: 'w-full h-full flex-1 flex flex-row lg:pt-[118px] ', // inside page header, wraps sidebar
    wrapper2: 'flex flex-1 w-full border-2 flex-col border shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 h-full min-h-[calc(100vh_-_102px)]' , // content wrapepr
    iconWrapper : 'z-5 absolute right-[10px] top-[5px]',
    icon: 'text-slate-400 hover:text-blue-500',
    viewIcon: 'ViewPage',
    editIcon: 'EditPage',
    sideNavContainer1: 'w-64 hidden xl:block',
    sideNavContainer2: 'w-64 sticky top-20 hidden xl:block'
  },
  header: {
    wrapper1: 'w-full h-full flex-1 flex flex-row', // inside page header, wraps sidebar
    wrapper2: 'flex flex-1 w-full  flex-col  relative min-h-[200px]' , // content wrapepr
    iconWrapper : 'z-5 absolute right-[10px] top-[5px]',
    icon: 'text-slate-400 hover:text-blue-500',
    sideNavContainer1: 'hidden',
    sideNavContainer2: 'hidden',
  }
}


export default function SectionGroup ({group, sections, saveSection, attributes, edit}) {
  const { baseUrl, user, theme } = React.useContext(CMSContext) || {}
  const { apiUpdate, format, item } = React.useContext(PageContext) || {}

  const inPageNav = getInPageNav(item,theme)
  const sectionTheme = theme.sectionGroup[group.theme || 'content'] || {}
  const sectionFormat = format?.registerFormats.find(d => d.type.includes('|cms-section'))
  const sectionAttributes =  attributes?.['sections']?.attributes
  const SectionArray = React.useMemo(() => {
    return edit ? attributes['sections'].EditComp : attributes['sections'].ViewComp 
  }, [])


  return (
         
      <div className={`${sectionTheme?.wrapper1}`}>
        {group?.sidebar && (
          <div className={`${sectionTheme?.sideNavContainer1} ${group?.sidebar === 'left' ? '': 'order-2'}`}>
            <div className={sectionTheme?.sideNavContainer2}>
              <SideNav {...inPageNav} /> 
            </div>
          </div>
        )}  
        <div className={sectionTheme?.wrapper2 + ''}>
          {(group.name === 'default' && user?.authLevel >= 5) && (
            <Link className={sectionTheme?.iconWrapper} to={`${baseUrl}/${edit ? '' : 'edit/'}${item?.url_slug || ''}${window.location.search}`}>
              <Icon icon={edit ? sectionTheme?.viewIcon : sectionTheme?.editIcon} className={sectionTheme?.icon} />
            </Link>
          )}
          <SectionArray
            group={group}
            value={sections.sort((a,b) => a.order - b.order)}
            attr={sectionAttributes}
            onChange={(update, action, changeType) => updateSections({update, action, changeType, item, sectionFormat, user, apiUpdate})}         
          />
        </div>
       
        {/*<div className='w-64 h-screen border-2 border-blue-400' />*/}
      </div>

  )
}

const updateSections = async ({update, action, changeType, item, sectionFormat, user, apiUpdate}) => {
  let edit = {
    type: action,
    user: user?.email || 'user', 
    time: new Date().toString()
  }

  let history = item.history ? cloneDeep(item.history) : []
  if(action){ history.push(edit) }

  console.log('updatind section', update, changeType)
  
  if (changeType === 'update') {
    
      
    await apiUpdate({data: update[0], config: {format: sectionFormat}})
    await apiUpdate({data: {id: item?.id, history, has_changes: true}})

    // for (let index in update) {
    //   console.log('updating', index, update[index])
    //   await apiUpdate({data: update[index], config: {format: sectionFormat}})
    // }
  } else if (changeType === 'new') {
      const sections = cloneDeep(item.draft_sections)
      const sectionUpdates = item.draft_sections
        .map((s,i) => {
          const out = {
            id: s.id
          }
          if(!s.order) { 
            out.order = i; 
          }
          if(s.group === update.group && s.order >= update.order) {
            out.order = s.order + 1; 
          }
          return out
      })
      const newItem = {
        id: item?.id, 
        draft_sections: [...sectionUpdates,...update],
        has_changes: true,
        history, 
      }
      await apiUpdate({data: newItem})
  }
  else if (changeType === 'remove') {
    //console.log('remove', )
    const removeIds = update.map(d => d.id)
    const newItem = {
        id: item?.id, 
        draft_sections: item.draft_sections.filter(d => !removeIds.includes(d.id) ),
        has_changes: true,
        history, 
    }
    await apiUpdate({data: newItem})
  }
}


    // ----------------
    // only need to send id, and data to update, not whole 
    // --------------------
    
    // console.log('editFunction saveSection newItem',newItem, v)
    