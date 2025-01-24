import React, {Fragment, useState} from 'react'

import { Button, Menu } from '../../../ui'
import { CMSContext } from '../../../siteConfig'
import { timeAgo } from '../../_utils'
import { Add, CaretDown } from "../../../ui/icons";

import { PageContext } from '../../view'


function SettingsPane () {
  const { baseUrl, user  } = React.useContext(CMSContext) || {}
  const { item, dataItems, apiUpdate } =  React.useContext(PageContext) || {}

  console.log('edit History', item)

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 sm:px-6 py-2">
        <div className="flex items-start justify-between">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            Pages
          </h1>
        </div>
      </div>
      <div className='w-full flex justify-center py-4'>
        <PublishButton />
      </div>
      <div className="relative mt-6 flex-1 px-4 sm:px-6 w-full   max-h-[calc(100vh_-_135px)] overflow-y-auto">
        ...
      </div>
    </div>          
  )
}

export default SettingsPane

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



