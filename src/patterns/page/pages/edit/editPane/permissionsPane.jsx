
import React, {Fragment, useContext, useEffect, useState} from 'react'
import { set, get } from 'lodash-es'
import { PageContext, CMSContext } from '../../../context'
import {ThemeContext} from "../../../../../ui/useTheme";

function PermissionsPane () {
  const { theme } = React.useContext(ThemeContext);
  const { UI, baseUrl, user  } = React.useContext(CMSContext) || {}
  const { item, pageState, dataItems, apiUpdate } =  React.useContext(PageContext) || {}
  const [authPermissions, setAuthPermissions] = React.useState(item.authPermissions || '');
  const { Input } = UI;

  useEffect(() => {
    let isStale = false;

    setTimeout(() => {
      if(!isStale){
        return togglePageSetting(item, 'authPermissions', authPermissions,  apiUpdate)
      }
    }, 300);

    return () => {
      isStale = true;
    }
  }, [authPermissions]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 sm:px-6 py-2">
        <div className="flex items-start justify-between">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            Permissions
          </h1>
        </div>
      </div>

      <div className="relative mt-6 flex-1 px-4 sm:px-6 w-full   max-h-[calc(100vh_-_135px)] overflow-y-auto">
        <Input
            placeholder={'Enter Page Permissions'}
            value={authPermissions}
            onChange={e => setAuthPermissions(e.target.value)}/>
      </div>
    </div>          
  )
}

export default PermissionsPane

export const togglePageSetting = async (item,type, value='', apiUpdate) => {
  const newItem = {id: item.id}
  set(newItem, type, value)
  console.log('update', type, newItem)
  apiUpdate({data:newItem})
}



