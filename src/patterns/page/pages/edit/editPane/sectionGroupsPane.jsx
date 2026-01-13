import React, { useMemo } from 'react'
import { cloneDeep, set } from 'lodash-es'

import { CMSContext, PageContext } from '../../../context'
import { ThemeContext } from "../../../../../ui/useTheme";

const SECTION_TARGETS = ['top', 'content', 'bottom']

function SectionGroupControl ({group, fullGroupData, onDelete, onUpdateAttribute, onAdd, theme, isSection}) {
  const { UI } = React.useContext(ThemeContext) || {};
  const { NavigableMenu, Icon } = UI;

  // Section headers are not draggable or editable
  if (isSection) {
    return (
      <div className='py-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200 cursor-default flex justify-between items-center'>
        <span>{group?.title || group?.id}</span>
        <button
          onClick={onAdd}
          className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded px-2 py-1 transition-colors font-medium normal-case"
        >
          + Add Group
        </button>
      </div>
    )
  }

  // Use fullGroupData for menu values since buildTree strips custom properties
  const menuConfig = [
      {
        icon: 'Width',
        name: 'Full Width',
        value: fullGroupData?.full_width || 'off',
        showValue: true,
        items: ['off', 'show'].map((name) => ({
          icon: name === (fullGroupData?.full_width || 'off') ? 'CircleCheck' : 'Blank',
          name: name,
          onClick: () => onUpdateAttribute('full_width', name)
        }))
      },
      {
        icon: 'Theme',
        name: 'Theme',
        value: fullGroupData?.theme || 'default',
        showValue: true,
        items: (theme?.layoutGroup?.styles || []).map(d => d.name).map((name) => ({
          icon: name === (fullGroupData?.theme || 'default') ? 'CircleCheck' : 'Blank',
          name: name,
          onClick: () => onUpdateAttribute('theme', name)
        }))
      },
      { type: 'separator' },
      { icon: 'TrashCan', name: 'Delete', onClick: onDelete }
  ]

  return (
    <div className='group border border-slate-200 rounded-lg px-4 py-3 flex justify-between items-center bg-white hover:border-slate-300 hover:shadow-sm transition-all cursor-grab'>
      <div className='flex items-center gap-3'>
        <Icon icon='GripVertical' className='size-4 text-slate-300 group-hover:text-slate-400' />
        <span className='text-sm font-medium text-slate-700'>{group?.title || group?.id}</span>
      </div>
      <div className='opacity-0 group-hover:opacity-100 transition-opacity'>
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
  const { theme, UI } = React.useContext(ThemeContext) || {};
  const { DraggableMenu } = UI || {};

  const addSectionGroup = (target) => {
    const existingGroups = item?.draft_section_groups || []
    const targetGroups = existingGroups.filter(g => g.position === target)
    const newIndex = targetGroups.length > 0
      ? Math.max(...targetGroups.map(g => g.index || 0)) + 1
      : 0

    let newItem = {
      id: item.id,
      draft_section_groups: [
        ...existingGroups,
        {
          name: crypto.randomUUID(),
          displayName: `Group ${existingGroups.length + 1}`,
          position: target,
          theme: 'default',
          index: newIndex
        }
      ]
    }
    apiUpdate({data: newItem})
  }

  const deleteGroup = (groupName) => {
    const newItem = {
      id: item.id,
      draft_section_groups: cloneDeep(item?.draft_section_groups || [])
        .filter(d => d.name !== groupName)
    }
    apiUpdate({data: newItem})
  }

  const updateGroupAttribute = (groupName, attr, value) => {
    let newSections = cloneDeep(item?.draft_section_groups || [])
    const updateIndex = newSections.findIndex(d => d.name === groupName)
    set(newSections, `[${updateIndex}][${attr}]`, value)
    let newItem = {
      id: item.id,
      draft_section_groups: newSections
    }
    apiUpdate({data: newItem})
  }

  // Build the dataItems hash for NestableInHouse
  // Section headers (top, content, bottom) are parent items
  // Section groups are children of their respective section
  const dataItems = useMemo(() => {
    const groups = item?.draft_section_groups || []
    const result = {}

    // Add section headers as parent items
    SECTION_TARGETS.forEach((target, i) => {
      const childGroups = groups
        .filter(g => g.position === target)
        .sort((a, b) => (a?.index || 0) - (b?.index || 0))

      result[target] = {
        id: target,
        index: i,
        title: target,
        displayName: target,
        isSection: true,
        parent: null,
        children: childGroups.map(g => ({
          id: g.name,
          index: g.index || 0,
          parent: target
        }))
      }
    })

    // Add section groups as child items
    groups.forEach(group => {
      result[group.name] = {
        id: group.name,
        index: group.index || 0,
        title: group.displayName || group.name,
        displayName: group.displayName || group.name,
        parent: group.position || 'content',
        full_width: group.full_width,
        theme: group.theme,
        position: group.position,
        name: group.name,
        children: []
      }
    })

    return result
  }, [item?.draft_section_groups])

  const handleDragChange = (tree, updatedDataItemsFlat) => {
    // Extract the updated groups from the flat hash
    const newGroups = []

    SECTION_TARGETS.forEach(target => {
      const sectionItem = updatedDataItemsFlat[target]
      if (sectionItem?.children) {
        sectionItem.children.forEach((child, idx) => {
          const groupData = updatedDataItemsFlat[child.id]
          if (groupData && !groupData.isSection) {
            newGroups.push({
              name: groupData.name || groupData.id,
              displayName: groupData.displayName || groupData.title,
              position: target,
              index: idx,
              theme: groupData.theme || 'default',
              full_width: groupData.full_width
            })
          }
        })
      }
    })

    apiUpdate({
      data: {
        id: item.id,
        draft_section_groups: newGroups
      }
    })
  }

  // Expanded state - all section headers should be expanded
  const matches = SECTION_TARGETS

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 sm:px-6 py-2">
        <div className="flex items-start justify-between">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            Section Groups
          </h1>
        </div>
      </div>
      <div className="relative mt-2 flex-1 px-4 sm:px-6 w-full h-screen overflow-y-auto">
        <DraggableMenu
          dataItems={dataItems}
          matches={matches}
          onChange={handleDragChange}
          canDrag={(item) => !SECTION_TARGETS.includes(item?.id)}
          canAcceptChildren={(item) => SECTION_TARGETS.includes(item?.id)}
          renderItem={({item: group, isExpanded, handleCollapseIconClick}) => {
            // Check if this is a section header (top/content/bottom)
            const isSection = SECTION_TARGETS.includes(group.id)
            // Look up full data from our dataItems hash
            const fullGroupData = dataItems[group.id]
            return (
              <SectionGroupControl
                group={group}
                fullGroupData={fullGroupData}
                theme={theme}
                isSection={isSection}
                onAdd={isSection ? () => addSectionGroup(group.id) : undefined}
                onDelete={() => deleteGroup(group.id)}
                onUpdateAttribute={(attr, value) => updateGroupAttribute(group.id, attr, value)}
              />
            )
          }}
        />
      </div>
      {/* <pre className='w-full overflow-y-scroll'>
        {JSON.stringify(item?.draft_section_groups,null,3)}
      </pre>*/}
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
