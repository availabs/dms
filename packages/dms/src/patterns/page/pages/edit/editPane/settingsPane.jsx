
import React, {Fragment, useContext, useState} from 'react'
import { cloneDeep, set, get, isEqual } from 'lodash-es'
import { updateTitle } from '../editFunctions'
import { PageContext, CMSContext } from '../../../context'
import { ThemeContext } from "../../../../../ui/useTheme";
import { getPageAuthPermissions } from "../../../pages/_utils";

const FilterSettings = ({label, type, value, stateValue, onChange}) => {
  const { isUserAuthed } = useContext(CMSContext);
  const { pageState } = useContext(PageContext)
  const { UI } = useContext(ThemeContext)
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
                  key={`settings_filter_${i}`}
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
                            const id = crypto.randomUUID();
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
  const { theme, UI } = React.useContext(ThemeContext);
  const { baseUrl, user, isUserAuthed  } = React.useContext(CMSContext) || {}
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
      <div className="flex p-2 w-full h-full overflow-y-auto scrollbar-sm">
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
                  type: DebouncedInput,
                  Input,
                  label: 'Page Description',
                  value: item?.description || '',
                  onChange:(e) => {
                      apiUpdate({data: {...item, description: e}})
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
                  type:'Switch',
                  label: 'Hide in Nav',
                  enabled: item.hide_in_nav === 'hide', size: 'small',
                  setEnabled: e => togglePageSetting(item, 'hide_in_nav', e ? 'hide' : false, apiUpdate),
                  customTheme:{
                      field: 'pb-2 flex flex-row gap-2'
                  }
              },
              {
                  type:'Switch',
                  label: 'Show in Footer',
                  enabled: item.show_in_footer === 'show', size: 'small',
                  setEnabled: e => togglePageSetting(item, 'show_in_footer', e ? 'show' : false, apiUpdate),
                  customTheme:{
                      field: 'pb-2 flex flex-row gap-2'
                  }
              },
              {
                  type:'Switch',
                  label: 'Cover Page',
                  enabled: item.is_cover_page === 'yes', size: 'small',
                  setEnabled: e => togglePageSetting(item, 'is_cover_page', e ? 'yes' : false, apiUpdate),
                  customTheme:{
                      field: 'pb-2 flex flex-row gap-2'
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
                  value: theme?.layout?.options?.sideNav?.size || '',
                  options: [
                      {label: 'Show', value: 'compact'},
                      {label: 'Hide', value: 'none'}

                  ],
                  onChange:(e) => {
                      console.log('toggle sidenave', e.target.value)
                      togglePageSetting(item, 'theme.layout.options.sideNav.size', e.target.value,  apiUpdate)
                  }
              },
              {
                  type:'Select',
                  label: 'Sidenav Style',
                  value: item?.theme?.layout?.options?.sideNav?.activeStyle || '',
                  options: [
                      { label: 'default', value: "" },
                      ...(theme?.sidenav?.styles || [{}])
                          .map((k, i) => ({ label: k?.name || i, value: i })),
                  ],
                  onChange:(e) => {
                      console.log('toggle active style')
                      togglePageSetting(item, 'theme.layout.options.sideNav.activeStyle', e.target.value,  apiUpdate)
                  }
              },
              ...themeSettings,

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
          ].filter(f => !f.reqPermissions || isUserAuthed(f.reqPermissions, pageAuthPermissions))
          } />
      </div>
  )
}

export default SettingsPane

const togglePageSetting = async (item,type, value='', apiUpdate) => {
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

// export function PublishButton () {
//   // const {item, apiUpdate } =  React.useContext(PageContext) || {}
//   // const hasChanges = item.published === 'draft' || item.has_changes
//   // const { user, UI } = React.useContext(CMSContext) || {};
//   // const {Icon, Button} = UI;
//   //
//   // return (
//   //   <div className='w-full flex justify-center h-[40px]'>
//   //     <Button
//   //         padding={'pl-2 flex items-center h-[40px]'}
//   //         disabled={!hasChanges}
//   //         rounded={hasChanges ? 'rounded-l-lg' : 'rounded-lg'}
//   //         type={hasChanges ? 'active' : 'inactive'}
//   //         // onClick={() => publish(user,item, apiUpdate)}
//   //     >
//   //       <span className='text-nowrap'> {hasChanges ? `Publish` : `No Changes`} </span>
//   //
//   //     </Button>
//   //     {hasChanges && (
//   //       <Menu
//   //         items={[{
//   //           name: (<span className='text-red-400'>Discard Changes</span>),
//   //           // onClick: () =>  discardChanges(user,item, apiUpdate)}
//   //         ]}
//   //       >
//   //         <Button padding={'py-1 w-[35px] h-[40px]'} rounded={'rounded-r-lg'} type={hasChanges ? 'active' : 'inactive'}>
//   //           <Icon icon={'CaretDown'} className='size-[28px]' />
//   //         </Button>
//   //       </Menu>
//   //     )}
//   //   </div>
//   // )
// }
