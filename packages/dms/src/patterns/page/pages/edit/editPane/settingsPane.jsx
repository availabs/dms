
import React, {Fragment, useContext, useEffect, useState} from 'react'
import { cloneDeep, set, get, isEqual } from 'lodash-es'
import { updateTitle } from '../editFunctions'
import { PageContext, CMSContext } from '../../../context'
import { ThemeContext } from "../../../../../ui/useTheme";
import { getPageAuthPermissions } from "../../../pages/_utils";
import { nameToSlug } from '../../../../../utils/type-utils';
import {buildPageTemplatePayload, buildPageTemplateType} from "../../../../utils";

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

function SaveAsTemplateSection() {
  const { item, apiLoad, apiUpdate, format } = useContext(PageContext) || {};
  const { user } = useContext(CMSContext) || {};
  const { UI } = useContext(ThemeContext) || {};
  const { Input, Button } = UI;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(null);
  const [pendingOverwrite, setPendingOverwrite] = useState(false);

  const templateType = React.useMemo(() => buildPageTemplateType(format), [format]);
  const trimmedName = name.trim();

  useEffect(() => {
    if (!trimmedName || !apiLoad || !format?.app) { setExisting(null); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const rows = await apiLoad({
          format: { app: format.app, type: templateType, attributes: ['id', 'app', 'type', 'data'] },
          children: [{ type: () => {}, action: 'list', path: '/' }],
        });
        if (cancelled) return;
        const slug = nameToSlug(trimmedName);
        setExisting((rows || []).find(r => r?.slug === slug) || null);
      } catch { /* ignore */ }
    };
    check();
    return () => { cancelled = true; };
  }, [trimmedName, apiLoad, format?.app, templateType]);

  const save = async (overwriteTarget) => {
    if (!trimmedName || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = buildPageTemplatePayload({
        name: trimmedName,
        description: description.trim(),
        sections: item?.draft_sections || [],
        sectionGroups: item?.draft_section_groups || [],
        user,
        existing: overwriteTarget,
      });
      await apiUpdate({
        data: payload,
        config: { format: { app: format.app, type: templateType } },
      });
      setName('');
      setDescription('');
      setExisting(null);
      setPendingOverwrite(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('<SaveAsTemplate>', e);
      setError('Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='flex flex-col gap-2 pt-4 border-t mt-4'>
      <div className='text-xs font-medium text-gray-500 uppercase tracking-wider'>Save as Template</div>
      <Input
        placeholder='Template name…'
        value={name}
        onChange={e => { setName(e.target.value); setPendingOverwrite(false); setSaved(false); }}
      />
      <Input
        placeholder='Description (optional)'
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <div className='flex items-center gap-2'>
        {existing && !pendingOverwrite && (
          <span className='text-xs text-amber-600'>&quot;{existing.name}&quot; exists</span>
        )}
        {existing && pendingOverwrite && (
          <span className='text-xs text-amber-600'>Replace &quot;{existing.name}&quot;?</span>
        )}
        {saved && <span className='text-xs text-green-600'>Saved!</span>}
        {error && <span className='text-xs text-red-500'>{error}</span>}
        <div className='flex gap-1 ml-auto'>
          {!existing && (
            <Button disabled={!trimmedName || saving} onClick={() => save(null)}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
          {existing && !pendingOverwrite && (
            <Button disabled={!trimmedName || saving} onClick={() => setPendingOverwrite(true)}>
              Overwrite…
            </Button>
          )}
          {existing && pendingOverwrite && (
            <>
              <Button type='plain' onClick={() => setPendingOverwrite(false)}>Cancel</Button>
              <Button disabled={saving} onClick={() => save(existing)}>
                {saving ? 'Saving…' : 'Overwrite'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPane () {
  const { theme, UI } = React.useContext(ThemeContext);
  const { baseUrl, user, isUserAuthed  } = React.useContext(CMSContext) || {}
  const { item, pageState, dataItems, apiUpdate } =  React.useContext(PageContext) || {}
  const { Button, FieldSet, Icon, Input } = UI;
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
      <div className="flex flex-col p-2 w-full h-full overflow-y-auto scrollbar-sm">
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
                  type:'MultiSelect',
                  singleSelectOnly: true,
                  label: 'Icon',
                  value:  item?.icon,
                  placeholder: 'Select an icon…',
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
                      togglePageSetting(item, 'icon', e,  apiUpdate)
                  }
              },
              {
                  type:'Switch',
                  label: 'Hide in Nav',
                  enabled: !!(item.hide_in_nav), size: 'small',
                  setEnabled: e => togglePageSetting(item, 'hide_in_nav', e ? 'hide' : null, apiUpdate),
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
                  type:'MultiSelect',
                  singleSelectOnly: true,
                  searchable: false,
                  label: 'Show Content Sidebar',
                  value: item.sidebar || '',
                  options: [
                      {label: 'None', value: ''},
                      {label: 'Left', value: 'left'},
                      {label: 'Right', value: 'right'},

                  ],
                  onChange:(value) => {
                      togglePageSetting(item, 'sidebar', value,  apiUpdate)
                  }
              },
              {
                  type:'MultiSelect',
                  singleSelectOnly: true,
                  searchable: false,
                  label: 'Show SideNav',
                  value: theme?.layout?.options?.sideNav?.size || '',
                  options: [
                      {label: 'Show', value: 'compact'},
                      {label: 'Hide', value: 'none'}

                  ],
                  onChange:(value) => {
                      togglePageSetting(item, 'theme.layout.options.sideNav.size', value,  apiUpdate)
                  }
              },
              {
                  type:'MultiSelect',
                  singleSelectOnly: true,
                  searchable: false,
                  label: 'Sidenav Style',
                  value: item?.theme?.layout?.options?.sideNav?.activeStyle || '',
                  options: [
                      { label: 'default', value: "" },
                      ...(theme?.sidenav?.styles || [{}])
                          .map((k, i) => ({ label: k?.name || i, value: i })),
                  ],
                  onChange:(value) => {
                      togglePageSetting(item, 'theme.layout.options.sideNav.activeStyle', value,  apiUpdate)
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
          <SaveAsTemplateSection />
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
