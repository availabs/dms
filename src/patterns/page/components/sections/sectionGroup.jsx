import React from 'react'
import { Link, useLocation } from 'react-router'
import { cloneDeep } from 'lodash-es'

import { PageContext, CMSContext } from '../../context'
import { getInPageNav } from '../../pages/_utils'
import { ThemeContext } from "../../../../ui/useTheme";

import SectionArray from './sectionArray'

export const sectionGroupTheme = {
    sideNavContainer1: 'w-[302px] hidden xl:block',
    sideNavContainer2: 'w-[302px] sticky top-[120px] hidden xl:block h-[calc(100vh_-_128px)] pr-2',
    sideNavContainer3: 'shadow-md rounded-lg overflow-hidden h-full',
}

export default function SectionGroup ({group, attributes, edit}) {
  const { theme,  UI } = React.useContext(ThemeContext);
  const { user } = React.useContext(CMSContext) || {};

  const { apiUpdate, item, updateAttribute } = React.useContext(PageContext) || {viewIcon: 'ViewPage', editIcon: 'EditPage'};
  const { SideNav, LayoutGroup } = UI;

  const inPageNav = getInPageNav(item,theme)
  const styleIndex = theme.layoutGroup.styles.map(d => d.name).indexOf(group.theme || 'default')
  const activeStyle =  styleIndex === -1 ? 0 : styleIndex
  const sectionAttributes =  attributes?.['sections']?.attributes
  const SectionArrayComp = React.useMemo(() => {
      return edit ?
        ( attributes?.['sections']?.EditComp || SectionArray?.EditComp ) :
        ( attributes?.['sections'].ViewComp || SectionArray?.ViewComp )
  }, [])

  console.log('Page View activeStyle', activeStyle)

  return (
    <LayoutGroup
      activeStyle={ activeStyle }
      outerChildren={
        item?.sidebar && group.name === 'default' && (
          <div className={`${theme?.pages?.sectionGroup?.sideNavContainer1} ${item?.sidebar === 'left' ? '': 'order-2'}`}>
            <div className={theme?.pages?.sectionGroup?.sideNavContainer2}>
              <div className={theme?.pages?.sectionGroup?.sideNavContainer3}>
                <SideNav {...inPageNav} />
              </div>
            </div>
          </div>
        )
      }
    >
      <SectionArrayComp
        group={group}
        value={item?.[edit ? 'draft_sections' : 'sections'] || [] }
        attr={sectionAttributes}
        onChange={(update, action ) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}
      />
    </LayoutGroup>
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
