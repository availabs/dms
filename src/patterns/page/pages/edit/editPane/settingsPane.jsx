
import React, {Fragment, useContext, useState} from 'react'
import { cloneDeep, set, get } from 'lodash-es'
import { updateTitle } from '../editFunctions'
import { v4 as uuidv4 } from 'uuid';
import { PageContext, CMSContext } from '../../../context'
import {ThemeContext} from "../../../../../ui/useTheme";


const FilterSettings = ({label, type, value, stateValue, onChange}) => {
  const {UI} = useContext(CMSContext);
  const {Input, Select, Button} = UI;
  const [newFilter, setNewFilter] = useState({});
  const [tmpValue, setTmpValue] = useState(typeof value === 'string' ? JSON.parse(value) : (value || []));

  const updateFilters = (idx, key, valueToUpdate) => {
    setTmpValue(value.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v))
    onChange(value.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v));
  }
  return (
      <div className={'flex flex-col gap-0.5'}>
        {
          tmpValue.map((filter, i) => (
                  <div key={i} className={'grid grid-cols-5 gap-0.5'}>
                    <Input placeholder={'search key'} value={filter.searchKey} onChange={e => updateFilters(i, 'searchKey', e.target.value)}/>
                    <Input placeholder={'value'} value={filter.values} onChange={e => updateFilters(i, 'values', e.target.value)}/>
                    <label className={'text-red-500 self-center'}>{stateValue?.find(sv => sv.searchKey === filter.searchKey)?.values}</label>
                    <Select value={filter.useSearchParams} onChange={e => updateFilters(i, 'useSearchParams', e.target.value === 'true')}
                            options={[{label: 'please select', value: undefined}, {label: 'Use Search params', value: true}, {label: `Don't use Search params`, value: false}]} />
                    <Button onClick={() => {
                      onChange(value.filter((_, idx) => i !== idx));
                      setTmpValue(value.filter((_, idx) => i !== idx))
                    }} > remove </Button>
                  </div>
              ))
        }
        <div key={'add-new-filter'} className={'grid grid-cols-3 gap-0.5'}>
          <Input placeholder={'search key'} value={newFilter.searchKey} onChange={e => setNewFilter({...newFilter, searchKey: e.target.value})} />
          <Input placeholder={'value'} value={newFilter.values} onChange={e => setNewFilter({...newFilter, values: e.target.value})} />
          <Button onClick={() => {
            const id = uuidv4();
                            onChange([...value, {id, ...newFilter}]);
                            setTmpValue([...value, {id, ...newFilter}])
                            setNewFilter({});
                          }} > add </Button>
        </div>
        <Button onClick={() => {
          onChange([]);
          setTmpValue([])
          setNewFilter({});
        }} > clear all </Button>
      </div>
  )
};

function SettingsPane () {
  const { theme } = React.useContext(ThemeContext);
  const { UI, baseUrl, user  } = React.useContext(CMSContext) || {}
  const { item, pageState, dataItems, apiUpdate } =  React.useContext(PageContext) || {}
  const { Button, Menu, FieldSet, Icon } = UI;

  const themeSettings = React.useMemo(() => {
    return (theme?.pageOptions?.settingsPane || [])
      .map(setting => {
        setting.value = get(item, setting.location, setting.default || '')
        setting.onChange = (e) => {
          togglePageSetting(item, setting.location, e.target.value,  apiUpdate)
        }
        return setting
      }).filter(d => d)
  },[theme?.pageOptions?.settingsPane, item])

  //console.log(themeSettings)
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
              updateTitle ( item, dataItems, val, user, apiUpdate)
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
            type:'Listbox',
            label: 'Icon',
            value:  item?.icon,
            options: [
              ...Object.keys(theme.Icons)
                .map((iconName) => {
                  return {
                    label: (
                      <div className='flex'>
                        <div className='px-2'>
                          <Icon icon={iconName} className='size-6' />
                        </div>
                        <div>
                          {iconName}
                        </div>
                      </div>
                    ),
                    value: iconName
                  }
                }),
                {label: 'No Icon', value: 'none'}
            ],
            onChange:(e) => {
              //console.log('update icon thing', e)
              togglePageSetting(item, 'icon', e,  apiUpdate)
            
            }
          },
          {
            type:'Input',
            label: 'Page Description',
            value: item?.description || '',
            onChange:(e) => {
              togglePageSetting(item, 'description', e.target.value,  apiUpdate)
            }
          },
          {
            type: FilterSettings,
            label: 'Filters',
            value: item?.filters || [],
            stateValue: pageState?.filters || [],
            onChange:(e) => {
              togglePageSetting(item, 'filters', e,  apiUpdate)
            }
          },
          ...themeSettings
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
  // const {item, apiUpdate } =  React.useContext(PageContext) || {}
  // const hasChanges = item.published === 'draft' || item.has_changes
  // const { user, UI } = React.useContext(CMSContext) || {};
  // const {Icon, Button} = UI;
  //
  // return (
  //   <div className='w-full flex justify-center h-[40px]'>
  //     <Button
  //         padding={'pl-2 flex items-center h-[40px]'}
  //         disabled={!hasChanges}
  //         rounded={hasChanges ? 'rounded-l-lg' : 'rounded-lg'}
  //         type={hasChanges ? 'active' : 'inactive'}
  //         // onClick={() => publish(user,item, apiUpdate)}
  //     >
  //       <span className='text-nowrap'> {hasChanges ? `Publish` : `No Changes`} </span>
  //
  //     </Button>
  //     {hasChanges && (
  //       <Menu
  //         items={[{
  //           name: (<span className='text-red-400'>Discard Changes</span>),
  //           // onClick: () =>  discardChanges(user,item, apiUpdate)}
  //         ]}
  //       >
  //         <Button padding={'py-1 w-[35px] h-[40px]'} rounded={'rounded-r-lg'} type={hasChanges ? 'active' : 'inactive'}>
  //           <Icon icon={'CaretDown'} className='size-[28px]' />
  //         </Button>
  //       </Menu>
  //     )}
  //   </div>
  // )
}



