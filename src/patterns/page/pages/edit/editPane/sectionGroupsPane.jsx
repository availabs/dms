import React, {Fragment, useState} from 'react'
import { cloneDeep, set } from 'lodash-es'
import { Button, Menu, FieldSet, Icon } from '../../../ui'
import { v4 as uuidv4 } from 'uuid';
import { CMSContext } from '../../../siteConfig'
import { PageContext } from '../../view'

function SectionGroupControl ({group}) {
  const { theme  } = React.useContext(CMSContext) || {}
  const { item, apiUpdate } =  React.useContext(PageContext) || {}

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
      draft_section_groups: cloneDeep(item.draft_section_groups)
        .filter(d => d.name !== group.name)
    }
    //console.log('section group', group.name, item.id)
    apiUpdate({data: newItem})
  }
  
  const sectionMenuItems = [
      //{ icon: 'PencilSquare', name: 'Edit', onClick: onEdit },
      
      // { type: 'seperator'},
      // { icon: 'ChevronUpSquare', name: 'Move Up', onClick: () => {} },
      // { icon: 'ChevronDownSquare', name: 'Move Down', onClick: () =>  {} },
      { type: 'seperator'},
      { icon: 'Width', name: 'Full Width',
        type: 'menu',
        value: group?.['full_width'] || 'off',
        items: ['off', 'show']
            .map((name,i) => {
                return {
                    'icon': name == (group?.['full_width'] || 'off') ? 'CircleCheck' : 'Blank',
                    'name': name,
                    'onClick': () => {
                        //console.log('colspan Item name click', name)
                       updateAttribute('full_width', name);
                    }
                }
            })
      },
      { icon: 'Theme', name: 'Theme',
        type: 'menu',
        value: group?.['theme'] || 'default',
        items: Object.keys(theme?.sectionGroup || {})
            .map((name,i) => {
                return {
                    'icon': name == (group?.['theme'] || 'None') ? 'CircleCheck' : 'Blank',
                    'name': name,
                    'onClick': () => {
                        //console.log('colspan Item name click', name)
                       updateAttribute('theme', name);
                    }
                }
            })
      },
      { type: 'seperator'},
      { icon: 'TrashCan', name: 'Delete', onClick: () => deleteGroup() } //setShowDeleteModal(!showDeleteModal)
    ]


  return (
    <div className='border p-4 flex justify-between items-center'>
      <div>{group?.displayName || group?.name}</div>
      <div>
        <Menu items={sectionMenuItems}> 
            <div  className='p-1 hover:bg-slate-100/75 rounded-lg'>
                <Icon icon="Menu" className='text-slate-500 hover:text-slate-900 size-6'/>
            </div>
        </Menu>
      </div>                   
    </div>
  )
}

export default function SectionGroupsPane () {
  const { baseUrl, user, theme  } = React.useContext(CMSContext) || {}
  const { item, dataItems, apiUpdate } =  React.useContext(PageContext) || {}

  const sectionTargets = ['top', 'content','bottom']
  const addSectionGroup = (target) => {
    let newItem = {
      id: item.id,
      draft_section_groups: [
        ...item.draft_section_groups,
        {name: uuidv4(), displayName: `Group ${item.draft_section_groups.length+1}`, position: target, theme: 'default'}
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
        {sectionTargets.map(target => (
          <div className='h-full'>
            <div className="flex items-start">
              <h1 className="text-base font-semibold uppercase leading-6 text-gray-900">
                {target}
              </h1>
              <div onClick={() => addSectionGroup(target)}> Add </div>
            </div>
            {
              item?.draft_section_groups
                .filter((g,i) => g.position === target)
                .sort((a,b) => a?.index - b?.index)
                .map((group,i) => <SectionGroupControl group={group} />)
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



