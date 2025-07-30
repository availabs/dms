import React from 'react'
import { Link } from 'react-router'
import { cloneDeep } from 'lodash-es'

import { PageContext, CMSContext } from '../../context'
import { getInPageNav } from '../../pages/_utils'
import {ThemeContext} from "../../../../ui/useTheme";


export const sectionGroupTheme = {
  sideNavContainer1: 'w-[302px] hidden xl:block',
  sideNavContainer2: 'w-[302px] sticky top-[120px] hidden xl:block h-[calc(100vh_-_128px)] pr-2',
  sideNavContainer3: 'shadow-md rounded-lg overflow-hidden h-full',
  default: {
    wrapper1: 'w-full h-full flex-1 flex flex-row pt-2', // inside page header, wraps sidebar
    wrapper2: 'flex flex-1 w-full  flex-col  shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 h-full min-h-[200px]' , // content wrapepr
    iconWrapper : 'z-5 absolute right-[10px] top-[5px]',
    icon: 'text-slate-400 hover:text-blue-500',
    
  },
  content: {
    wrapper1: 'w-full h-full flex-1 flex flex-row p-2', // inside page header, wraps sidebar
    wrapper2: 'flex flex-1 w-full  flex-col  shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 h-full min-h-[calc(100vh_-_102px)]' , // content wrapepr
    iconWrapper : 'z-5 absolute right-[10px] top-[5px]',
    icon: 'text-slate-400 hover:text-blue-500',
    viewIcon: 'ViewPage',
    editIcon: 'EditPage',
  },
  header: {
    wrapper1: 'w-full h-full flex-1 flex flex-row', // inside page header, wraps sidebar
    wrapper2: 'flex flex-1 w-full  flex-col  relative min-h-[200px]' , // content wrapepr
    iconWrapper : 'z-5 absolute right-[10px] top-[5px]',
    icon: 'text-slate-400 hover:text-blue-500',
    sideNavContainer1: 'hidden',
    sideNavContainer2: 'hidden',
  },

}


export default function SectionGroup ({group, attributes, edit}) {
  const { theme } = React.useContext(ThemeContext);
  const { UI, baseUrl, user } = React.useContext(CMSContext) || {};
  const { apiUpdate, format, item, updateAttribute } = React.useContext(PageContext) || {viewIcon: 'ViewPage', editIcon: 'EditPage'};
  const { SideNav, Icon } = UI;

  const inPageNav = getInPageNav(item,theme)
  const sectionTheme = theme?.sectionGroup?.[group.theme || 'default'] || {}
  const sectionFormat = format?.registerFormats.find(d => d?.type?.includes('|cms-section'))
  const sectionAttributes =  attributes?.['sections']?.attributes
  const SectionArray = React.useMemo(() => {
    return edit ? attributes['sections'].EditComp : attributes['sections'].ViewComp 
  }, [])

  //console.log('render group', group)

  return (
         
      <div className={`${sectionTheme?.wrapper1}`}>
        {item?.sidebar && group.name === 'default' && (
          <div className={`${theme?.sectionGroup?.sideNavContainer1} ${item?.sidebar === 'left' ? '': 'order-2'}`}>
            <div className={theme?.sectionGroup?.sideNavContainer2}>
              <div className={theme?.sectionGroup?.sideNavContainer3}>
                <SideNav {...inPageNav} />
              </div>
            </div>
          </div>
        )}  
        <div className={sectionTheme?.wrapper2}>
          <div className={sectionTheme?.wrapper3}>
            {(group.name === 'default' && user?.authLevel >= 5) && (
              <Link className={sectionTheme?.iconWrapper} to={`${baseUrl}/${edit ? '' : 'edit/'}${item?.url_slug || ''}`}>
                {/*have to use rr to get query paramswindow.location.search*/}
                <Icon icon={edit ? sectionTheme?.viewIcon : sectionTheme?.editIcon} className={sectionTheme?.icon} />
                
              </Link>
            )}
            <SectionArray
              group={group}
              value={item?.[edit ? 'draft_sections' : 'sections'] || [] }
              attr={sectionAttributes}
              onChange={(update, action ) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}         
            />
          </div>
        </div>
      </div>

  )
}


export const updateSections = async ({update, action, item, user, apiUpdate, updateAttribute}) => {
    // const headerSection = item['draft_sections']?.filter(d => d.is_header)?.[0]
    
    
    let edit = {
      type: action,
      user: user?.email || 'user', 
      time: new Date().toString()
    }

    let history = item.history ? cloneDeep(item.history) : []
    if(action){ history.push(edit) }
    //Testing here
    if(updateAttribute) {
      updateAttribute('','',{
        'has_changes': true,
        'history': history,
        'draft_sections': update.filter(d => d)
      })
    }

    // ----------------
    // only need to send id, and data to update, not whole 
    // --------------------
    const newItem = {
      id: item?.id, 
      draft_sections: update.filter(d => d),
      has_changes: true,
      history, 
    }


    //console.log('editFunction saveSection newItem',newItem, update)
    await apiUpdate({data: newItem})
  }


// const updateSections = async ({update, action, changeType, item, sectionFormat, user, apiUpdate}) => {
//   let edit = {
//     type: action,
//     user: user?.email || 'user', 
//     time: new Date().toString()
//   }

//   let history = item.history ? cloneDeep(item.history) : []
//   if(action){ history.push(edit) }

//   console.log('updatind section', update, changeType)
  
//   if (changeType === 'update') {
    
      
//     await apiUpdate({data: update[0], config: {format: sectionFormat}})
//     await apiUpdate({data: {id: item?.id, history, has_changes: true}})

//     // for (let index in update) {
//     //   console.log('updating', index, update[index])
//     //   await apiUpdate({data: update[index], config: {format: sectionFormat}})
//     // }
//   } else if (changeType === 'new') {
//       const sections = cloneDeep(item.draft_sections)
//       const sectionUpdates = item.draft_sections
//         .map((s,i) => {
//           const out = {
//             id: s.id
//           }
//           if(!s.order) { 
//             out.order = i; 
//           }
//           if(s.group === update.group && s.order >= update.order) {
//             out.order = s.order + 1; 
//           }
//           return out
//       })
//       const newItem = {
//         id: item?.id, 
//         draft_sections: [...sectionUpdates,...update],
//         has_changes: true,
//         history, 
//       }
//       await apiUpdate({data: newItem})
//   }
//   else if (changeType === 'remove') {
//     //console.log('remove', )
//     const removeIds = update.map(d => d.id)
//     const newItem = {
//         id: item?.id, 
//         draft_sections: item.draft_sections.filter(d => !removeIds.includes(d.id) ),
//         has_changes: true,
//         history, 
//     }
//     await apiUpdate({data: newItem})
//   }
// }


    // ----------------
    // only need to send id, and data to update, not whole 
    // --------------------
    
    // console.log('editFunction saveSection newItem',newItem, v)
    