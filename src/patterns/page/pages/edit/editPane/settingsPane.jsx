import React, {Fragment, useState} from 'react'
import { cloneDeep,set } from 'lodash-es'
import { Button, Menu, FieldSet } from '../../../ui'
import { CMSContext } from '../../../siteConfig'
import { timeAgo } from '../../_utils'
import { Add, CaretDown } from "../../../ui/icons";
import { updateTitle } from '../editFunctions'

import { PageContext } from '../../view'


function SettingsPane () {
  const { baseUrl, user  } = React.useContext(CMSContext) || {}
  const { item, dataItems, apiUpdate } =  React.useContext(PageContext) || {}

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 sm:px-6 py-2">
        <div className="flex items-start justify-between">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            Settings
          </h1>
        </div>
      </div>
      {/*<div className='w-full flex justify-center py-4'>
        <PublishButton />
      </div>*/}
      <div className="relative mt-6 flex-1 px-4 sm:px-6 w-full   max-h-[calc(100vh_-_135px)] overflow-y-auto">
        <FieldSet components={[
          {
            type:'ConfirmInput',
            label: 'Page Name',
            value: item.title,
            onChange: (val) => {
              console.log('Change page Name', val)
              updateTitle  ( item, dataItems, val, user, apiUpdate)
            }
          },
          {
            type:'Select',
            label: 'Hide in Nav',
            value: item.hide_in_nav || '',
            options: [
              {label: 'Show', value: ''}, 
              {label: 'Hide', value: 'hide'}
            ],
            onChange:(e) => {
              togglePageSetting(item, 'hide_in_nav', e.target.value,  apiUpdate)
            }
          },
          {
            type:'Select',
            label: 'Show Content Sidebar',
            value: item.sidebar || '',
            options: [
                  {label: 'None', value: ''}, 
                  {label: 'Left', value: 'left'},
                  {label: 'Right', value: 'right'},
                  
            ],
            onChange:(e) => {
              togglePageSetting(item, 'sidebar', e.target.value,  apiUpdate)
            }
          },
          {
            type:'Select',
            label: 'Show SideNav',
            value: item?.navOptions?.sideNav?.size || '',
            options: [
                  {label: 'Show', value: 'compact'}, 
                  {label: 'Hide', value: 'none'}
                  
            ],
            onChange:(e) => {
              togglePageSetting(item, 'navOptions.sideNav.size', e.target.value,  apiUpdate)
            }
          },
          {
            type:'Input',
            label: 'Page Description',
            value: item?.description || '',
            onChange:(e) => {
              togglePageSetting(item, 'description', e.target.value,  apiUpdate)
            }
          }
        ]} />
      </div>
    </div>          
  )
}

export default SettingsPane

export const togglePageSetting = async (item,type, value='', apiUpdate) => {
  const newItem = {id: item.id}
  set(newItem, type, value)
  console.log('update', type, newItem)
 
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

export function PublishButton () {
  const {item, apiUpdate } =  React.useContext(PageContext) || {}
  const hasChanges = item.published === 'draft' || item.has_changes
  const { user } = React.useContext(CMSContext) || {}
  
  return (
    <div className='w-full flex justify-center h-[40px]'>
      <Button 
          padding={'pl-2 flex items-center h-[40px]'} 
          disabled={!hasChanges} 
          rounded={hasChanges ? 'rounded-l-lg' : 'rounded-lg'} 
          type={hasChanges ? 'active' : 'inactive'}
          onClick={() => publish(user,item, apiUpdate)} 
      >
        <span className='text-nowrap'> {hasChanges ? `Publish` : `No Changes`} </span>
         
      </Button>
      {hasChanges && (
        <Menu 
          items={[{
            name: (<span className='text-red-400'>Discard Changes</span>), 
            onClick: () =>  discardChanges(user,item, apiUpdate)}
          ]}
        > 
          <Button padding={'py-1 w-[35px] h-[40px]'} rounded={'rounded-r-lg'} type={hasChanges ? 'active' : 'inactive'}>
            <CaretDown className='size-[28px]' />
          </Button>
        </Menu>
      )}
    </div>
  )
}



