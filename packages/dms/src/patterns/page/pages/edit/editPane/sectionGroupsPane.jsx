import React, { useMemo } from 'react'
import {useNavigate, useLocation} from 'react-router';
import { cloneDeep, set } from 'lodash-es'

import { CMSContext, PageContext } from '../../../context'
import { ThemeContext } from "../../../../../ui/useTheme";

const SECTION_TARGETS = ['top', 'content', 'bottom']
export const sectionGroupControlTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      sectionTargetWrapper: 'py-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200 cursor-default flex justify-between items-center',
      addGroupBtn: 'text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded px-2 py-1 transition-colors font-medium normal-case',
      sectionGroupWrapper: 'group rounded-sm px-4 py-1 flex justify-between items-center hover:shadow-sm transition-all',
      activePageSectionBorder: `border border-dashed border-orange-200 hover:border-orange-300`,
      sectionGroupBorder: `border border-slate-200 hover:border-slate-300`,
      pageSectionBG: `bg-slate-50 hover:bg-slate-100`,
      expandedGroupBG: `bg-slate-200`,
      unexpandedGroupBG: `bg-white`,
      pageSectionCursor: `cursor-pointer`,
      sectionGroupCursor: `cursor-grab`,
      titleWrapper: 'flex items-center gap-3',
      sectionGroupIcon: 'size-4 text-slate-300 group-hover:text-slate-400',
      pageSectionIcon: 'hidden',
      sectionGroupTitle: 'text-sm font-medium text-slate-700',
      pageSectionTitle: 'text-sm font-medium text-slate-700',
      controlsWrapper: 'flex gap-1 items-center',
      expandGroupIcon: 'size-6 place-content-center cursor-pointer text-slate-500 hover:text-slate-700',
    }
  ]
}
function SectionGroupControl ({group, fullGroupData, onDelete, onUpdateAttribute, onAdd, theme, isSection, isExpanded, toggleExpanded}) {
  const { UI, theme: themeFromContext = {}, getComponentTheme } = React.useContext(ThemeContext) || {};
  const { NavigableMenu, Icon } = UI;
  const navigate = useNavigate();
  const {hash} = useLocation();
  const currentStyle = getComponentTheme(themeFromContext, 'pages.sectionGroupsPane')
  console.log('theme', themeFromContext)
  // const currentStyle = sectionGroupControlTheme.styles[sectionGroupControlTheme.options.activeStyle];
  // Section headers are not draggable or editable
  if (isSection) {
    return (
      <div className={`${currentStyle.sectionTargetWrapper} ${['content', 'bottom'].includes(group.id) ? currentStyle.sectionTargetDivider : ``}`}>
        <span>{group?.title || group?.id}</span>
        <button
          onClick={onAdd}
          className={currentStyle.addGroupBtn}
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
  const isPageSection = !!fullGroupData.url_slug
  const isSectionActive = hash === `#${group.id}`;

  return (
        <div className={`${currentStyle.sectionGroupWrapper} 
        ${isSectionActive ? currentStyle.activePageSectionBorder : group.isGroup ? currentStyle.sectionGroupBorder : ``}
        ${isPageSection ? currentStyle.pageSectionBG : isExpanded ? currentStyle.expandedGroupBG : currentStyle.unexpandedGroupBG}
          ${isPageSection ? currentStyle.pageSectionCursor : currentStyle.sectionGroupCursor}`}
             onClick={() => isPageSection && navigate(fullGroupData.url_slug)}>
          <div className={currentStyle.titleWrapper}>
            <Icon icon='Reorder' className={group.isGroup ? currentStyle.sectionGroupIcon : currentStyle.pageSectionIcon} />
            <span className={group.isGroup ? currentStyle.sectionGroupTitle : currentStyle.pageSectionTitle}>{group?.title || group?.id}</span>
          </div>
          <div className={currentStyle.controlsWrapper}>
            {
              fullGroupData.isGroup ?
                    <NavigableMenu
                        config={menuConfig}
                        title={'Group Settings'}
                        preferredPosition={'left'}
                    /> : null
            }
            {
              fullGroupData.isGroup ? <Icon icon={'CaretDown'} className={currentStyle.expandGroupIcon} onClick={toggleExpanded}/> : null
            }
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
          parent: target,
          children: (item?.draft_sections || []).filter(s => s.group === g.name || (!s.group && g.name === 'default')).map(s => ({id: s.id, type: s?.element?.['element-type']}))
        }))
      }
    })

    // Add section groups as child items
    groups.forEach(group => {
      result[group.name] = {
        id: group.name,
        isGroup: true,
        index: group.index || 0,
        title: group.displayName || group.name,
        displayName: group.displayName || group.name,
        parent: group.position || 'content',
        full_width: group.full_width,
        theme: group.theme,
        position: group.position,
        name: group.name,
        children: (item?.draft_sections || []).filter(s => s.group === group.name || (!s.group && group.name === 'default')).map((s, idx) => ({id: s.id, index: idx, type: s?.element?.['element-type'], title: s?.title}))
      }

      // Add children sections as items
      result[group.name].children.forEach(s => {
        result[s.id] = {id: s.id, index: s.index, parent: group.name, title: s.title || s.type, isPageSection: true, url_slug: `#${s.id}`}
      })
    })

    return result
  }, [item?.draft_section_groups, item?.draft_sections])

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


  return (
      <div className="relative mt-2 flex-0 w-full h-full">
        <DraggableMenu
            activeStyle={1}
            dataItems={dataItems}
            matches={SECTION_TARGETS}
            onChange={handleDragChange}
            canDrag={(item) => !SECTION_TARGETS.includes(item?.id)}
            canAcceptChildren={(item) => SECTION_TARGETS.includes(item?.id)}
            renderItem={({item: group, isExpanded, handleCollapseIconClick}) => {
              const isSection = SECTION_TARGETS.includes(group.id)
              const fullGroupData = dataItems[group.id]
              console.log('group', group, fullGroupData)
              return (
                  <SectionGroupControl
                      group={group}
                      fullGroupData={fullGroupData}
                      isExpanded={isExpanded}
                      toggleExpanded={handleCollapseIconClick}
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
