
import React, {Fragment, useContext, useState} from 'react'
import { cloneDeep, set, get, isEqual } from 'lodash-es'
import { updateTitle } from '../editFunctions'
import { v4 as uuidv4 } from 'uuid';
import { PageContext, CMSContext } from '../../../context'
import {ThemeContext} from "../../../../../ui/useTheme";
import {getPageAuthPermissions} from "../../../pages/_utils";

const FilterSettings = ({label, type, value, stateValue, onChange}) => {
  const {UI, isUserAuthed} = useContext(CMSContext);
  const {pageState} = useContext(PageContext)
  const {Input, FieldSet, Switch, Button} = UI;
  const [newFilter, setNewFilter] = useState({});
  const [tmpValue, setTmpValue] = useState(typeof value === 'string' ? JSON.parse(value) : (value || []));

    const reqPermissions = ['edit-page-params']
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const userHasEditPageParamsAccess = isUserAuthed(reqPermissions, pageAuthPermissions)

  const updateFilters = (idx, key, valueToUpdate) => {
    setTmpValue(tmpValue.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v))
    onChange(tmpValue.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v));
  }

  const customTheme = {
      field: 'pb-2 flex flex-col'
  }
  if(!userHasEditPageParamsAccess) return null
  return (
      <div className={'flex flex-col gap-1'}>
        {
          tmpValue.map((filter, i) => (
              <FieldSet
                  className={'grid grid-cols-3 gap-1'}
                  components={[
                      {label: 'Search Key', type: 'Input', placeholder: 'search key', value: filter.searchKey,
                          onChange: e => updateFilters(i, 'searchKey', e.target.value),
                          customTheme
                      },
                      {label: 'Search Value', type: 'Input', placeholder: 'search value', value: filter.values,
                          onChange: e => updateFilters(i, 'values', e.target.value),
                          customTheme
                      },
                      {label: 'Use URL', type: 'Switch', enabled: filter.useSearchParams, size: 'small',
                          setEnabled: e => updateFilters(i, 'useSearchParams', e),
                          className: 'self-center',
                          customTheme
                      },
                      {label: 'Active Value', type: () => <div className={'text-sm pb-2 flex flex-col'}>{(stateValue || []).find(sf => sf.searchKey === filter.searchKey)?.values}</div>
                      },
                      {type: 'Button', children: 'remove',
                          onClick: () => {
                              onChange(tmpValue.filter((_, idx) => i !== idx));
                              setTmpValue(tmpValue.filter((_, idx) => i !== idx))
                          }
                      }
                  ]}
              />
              ))
        }
            <FieldSet
                className={'grid grid-cols-3 gap-1'}
                components={[
                    {label: 'Search Key', type: 'Input', placeholder: 'search key', value: newFilter.searchKey,
                        onChange: e => setNewFilter({...newFilter, searchKey: e.target.value}),
                        customTheme
                    },
                    {label: 'Search Value', type: 'Input', placeholder: 'search value', value: newFilter.values,
                        onChange: e => setNewFilter({...newFilter, values: e.target.value}),
                        customTheme
                    },
                    {label: 'Use URL', type: 'Switch', enabled: newFilter.useSearchParams, size: 'small',
                        setEnabled: e => setNewFilter({...newFilter, useSearchParams: e}),
                        className: 'self-center',
                        customTheme
                    },
                    {type: 'Button', children: 'add',
                        onClick: () => {
                            const id = uuidv4();
                            onChange([...tmpValue, {id, ...newFilter}]);
                            setTmpValue([...tmpValue, {id, ...newFilter}])
                            setNewFilter({});
                        }
                    }
                ]}
            />
        <Button onClick={() => {
          onChange([]);
          setTmpValue([])
          setNewFilter({});
        }} > clear all </Button>
      </div>
  )
};

function DebouncedInput({value, onChange, Input, ...rest}) {
    const [tmpValue, setTmpValue] = React.useState(value || '');

    React.useEffect(() => {
        const handler = setTimeout(() => {
            if (!isEqual(value, tmpValue)) {
                onChange(tmpValue);
            }
        }, 300);

        return () => clearTimeout(handler);
    }, [tmpValue, value]);

    return <Input value={tmpValue} onChange={e => setTmpValue(e.target.value)}/>
}

function SettingsPane () {
  const { theme } = React.useContext(ThemeContext);
  const { UI, baseUrl, user, isUserAuthed  } = React.useContext(CMSContext) || {}
  const { item, pageState, dataItems, apiUpdate } =  React.useContext(PageContext) || {}
  const { Button, Menu, FieldSet, Icon, Input } = UI;
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
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
            label: 'Cover Page',
            value: item.is_cover_page || '',
            options: [
              {label: 'No', value: ''},
              {label: 'Yes', value: 'yes'}
            ],
            onChange:(e) => {
              togglePageSetting(item, 'is_cover_page', e.target.value,  apiUpdate)
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
            type: DebouncedInput,
              Input,
            label: 'Page Description',
            value: item?.description || '',
            onChange:(e) => {
              apiUpdate({data: {...item, description: e}})
            }
          },
          {
            type: FilterSettings,
            label: 'Filters',
              reqPermissions: ['edit-page-params'],
            value: item?.filters || [],
            stateValue: pageState?.filters || [],
            onChange:(e) => {
              togglePageSetting(item, 'filters', e,  apiUpdate)
            }
          },
          ...themeSettings
        ].filter(f => !f.reqPermissions || isUserAuthed(f.reqPermissions, pageAuthPermissions))
        } />
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
