import React from 'react'
import { cloneDeep, set } from 'lodash-es'

import { CMSContext,PageContext } from '../../../context'
import {ThemeContext} from "../../../../../ui/useTheme";

function SectionGroupControl ({group}) {
  const { UI, theme } = React.useContext(ThemeContext) || {};
  const { item, apiUpdate } =  React.useContext(PageContext) || {}
  const { NavigableMenu } = UI;
  const updateAttribute = (attr, value) => {
    let newSections = cloneDeep(item.draft_section_groups)
    const updateIndex = newSections.findIndex(d => d.name === group.name)
    set(newSections ,`[${updateIndex}][${attr}]`, value)
    let newItem = {
      id: item.id,
      draft_section_groups: newSections
    }
    apiUpdate({data:newItem})
  }

  const deleteGroup = () => {
    const newItem = {
      id: item.id,
      draft_section_groups: cloneDeep(item?.draft_section_groups || [])
        .filter(d => d.name !== group.name)
    }
    apiUpdate({data: newItem})
  }

  const menuConfig = [
      {
        icon: 'Width',
        name: 'Full Width',
        value: group?.['full_width'] || 'off',
        showValue: true,
        items: ['off', 'show'].map((name) => ({
          icon: name === (group?.['full_width'] || 'off') ? 'CircleCheck' : 'Blank',
          name: name,
          onClick: () => updateAttribute('full_width', name)
        }))
      },
      {
        icon: 'Theme',
        name: 'Theme',
        value: group?.['theme'] || 'default',
        showValue: true,
        items: (theme?.layoutGroup?.styles || []).map(d => d.name).map((name) => ({
          icon: name === (group?.['theme'] || 'default') ? 'CircleCheck' : 'Blank',
          name: name,
          onClick: () => updateAttribute('theme', name)
        }))
      },
      { type: 'separator' },
      { icon: 'TrashCan', name: 'Delete', onClick: deleteGroup }
  ]

  return (
    <div className='border p-4 flex justify-between items-center'>
      <div>{group?.displayName || group?.name}</div>
      <div>
        <NavigableMenu
          config={menuConfig}
          title={'Group Settings'}
          preferredPosition={'left'}
        />
      </div>
    </div>
  )
}

export default function SectionGroupsPane () {
    const { item, apiUpdate } =  React.useContext(PageContext) || {}

  const sectionTargets = ['top', 'content','bottom']
  const addSectionGroup = (target) => {
    let newItem = {
      id: item.id,
      draft_section_groups: [
        ...item.draft_section_groups,
        {name: crypto.randomUUID(), displayName: `Group ${item.draft_section_groups.length+1}`, position: target, theme: 'default'}
      ]
    }
    apiUpdate({data:newItem})
  }


  return (
    <div className="flex h-full flex-col">
      <div className="px-4 sm:px-6 py-2">
        <div className="flex items-start">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            Section Groups
          </h1>
        </div>
      </div>
      {/*<div className='w-full flex justify-center py-4'>
        <PublishButton />
      </div>*/}
      <div className="relative mt-6 flex-1 px-4 sm:px-6 w-full h-screen overflow-y-auto">
        {sectionTargets.map((target,i) => (
          <div className='h-full' key={i}>
            <div className="flex items-start">
              <h1 className="text-base font-semibold uppercase leading-6 text-gray-900">
                {target}
              </h1>
              <div onClick={() => addSectionGroup(target)}> Add </div>
            </div>
            {
              (item?.draft_section_groups || [])
                .filter((g,i) => g.position === target)
                .sort((a,b) => a?.index - b?.index)
                .map((group,i) => <SectionGroupControl group={group} key={i} />)
            }
          </div>
        ))}
        {/*<FieldSet components={[
          {
            type:'Select',
            label: 'Show Header',
            value: item.header || '',
            options: [
              {label: 'None', value: 'none'},
                  {label: 'Above', value: 'above'},
                  {label: 'Below', value: 'below'},
                  {label: 'In page', value: 'inpage'}
            ],
            onChange:(e) => {
              togglePageSetting(item, 'header', e.target.value,  apiUpdate)
            }
          },

        ]} />*/}
      </div>
    </div>
  )
}



export const togglePageSetting = async (item,type, value='', apiUpdate) => {
  const newItem = {id: item.id}
  set(newItem, type, value)
  //console.log('update', type, newItem)

  // console.log('item', newItem, value)
  let sectionType = 'draft_sections';
  if(type === 'header' && !item?.[sectionType]?.filter(d => d.is_header)?.[0]) {
    //console.log('toggleHeader add header', newItem[sectionType])
    newItem[sectionType] = cloneDeep(item[sectionType] || [])
    newItem[sectionType].unshift({
      is_header: true,
      size: 2,
      element : {
        "element-type": "Header: Default Header",
        "element-data": {}
      }
    })

  }

  apiUpdate({data:newItem})
}
