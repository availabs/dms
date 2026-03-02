import React from 'react'
import {v4 as uuidv4} from "uuid";
import {AdminContext} from "../context";
// import { AuthContext } from '../../auth/context';
import { ThemeContext } from '../../../ui/useTheme';
import { Link, useLocation } from 'react-router'
import NewSite from './createSite'
import { parseIfJSON } from '../../page/pages/_utils';


function SiteEdit ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   status,
   apiUpdate,
   format,
	...propsNewSite
}) {

	const { baseUrl, authPath, theme, app, user, AUTH_HOST } = React.useContext(AdminContext) || {}
	const location = useLocation()
  const updateData = (data, attrKey) => {
		//console.log('admin pattern - siteEdit - updateData', attrKey, data, format)
		apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
	}

	if(!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	// change to redirect
	if(!item.id) return (
	  <NewSite
  	  app={app}
  		user={user}
  		AUTH_HOST={AUTH_HOST}
  		apiUpdate={apiUpdate}
  	/>
	)

	return (
	  <PatternList
      value={item?.['patterns']}
			format={format}
			attributes={attributes['patterns'].attributes}
	    onChange={(v) => updateAttribute('patterns', v)}
			  onSubmit={data => {
		  updateData(data, 'patterns')
	  }}
		/>
	)
}

export default SiteEdit


function PatternList({
	 Component,
	 attributes={},
	 status,
	 onSubmit,
	 onChange,
	 value = [],
	 format,
	 ...rest
}) {
	const {app, API_HOST, baseUrl} = React.useContext(AdminContext);
	const {UI} = React.useContext(ThemeContext)
	const location = useLocation()
	const {Table, Input, Button, Modal, Icon} = UI;
	const gridRef = React.useRef(null);
	const [search, setSearch] = React.useState('');
	const [newItem, setNewItem] = React.useState({app: format?.app});
	const [addingNew, setAddingNew] = React.useState(false);
	const [editingItem, setEditingItem] = React.useState(undefined);
	const [isDuplicating, setIsDuplicating] = React.useState(false);
	const [deletingItem, setDeletingItem] = React.useState(undefined);
	const attrToAddNew = ['pattern_type', 'name', 'subdomain', 'base_url', 'filters', 'authPermissions'];
	//console.log('test 123', location)
	const columns = [
		{name: 'name', display_name: 'Name', show: true, type: 'text'},
		{name: 'base_url', display_name: 'Base URL', show: true, type: 'ui',
      Comp: (d) => {
        const host = window.location.host
        const protocol = host.includes('localhost') ? 'http' : 'https'
        const sub = d.row.subdomain
        const needsSub = sub && sub !== '*'
        // Strip existing subdomain (first segment) to get the base domain,
        // but only if the current host actually has a subdomain.
        const parts = host.split('.')
        const isLocalhost = host.includes('localhost')
        const hasSubdomain = isLocalhost ? parts.length >= 2 : parts.length > 2
        const baseDomain = hasSubdomain ? parts.slice(1).join('.') : host
        const targetHost = needsSub ? `${sub}.${baseDomain}` : host
        return (
          <Link
            to={`${protocol}://${targetHost}${d.row.base_url}`}
            className='flex items-center p-2 w-full h-full py-1 font-[400] text-[14px]  leading-[18px] text-slate-600'
          >
            {d?.row?.base_url}
          </Link>
        )
      }
		},
		{name: 'subdomain', display_name: 'Subdomain', show: true, type: 'text'},
		// {name: 'updated_at', display_name: 'Updated', show: true, type: 'text', formatFn: 'date'},
		// {name: 'edit', display_name: 'Edit', show: true, type: 'ui', Comp: (d) => {
		// 		return <Button onClick={() => setEditingItem(d.row)}>Edit</Button>
		// 	}},
		{name: 'edit', display_name: 'Edit', show: true, type: 'ui',
      Comp: (d) => {
        return (
          <div className='flex items-center justify-center gap-1 w-full h-full py-1'>
            <Link to={d?.row?.edit_url || ''} className='flex items-center px-2 py-1 text-sm text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-full'>
              <Icon icon='PencilEditSquare' className='size-4'/><span className='pl-1'>Edit</span>
            </Link>
            <button
              className='p-1.5 text-slate-400 hover:text-blue-600 rounded-full hover:bg-blue-50'
              title='Duplicate'
              disabled={isDuplicating}
              onClick={async () => {
                const newDocType = crypto.randomUUID();
                const dataToCopy = {
                  app: d.row.app,
                  base_url: `${d.row.base_url}_copy`,
                  subdomain: d.row.subdomain,
                  config: d.row.config,
                  doc_type: newDocType,
                  name: `${d.row.name}_copy`,
                  pattern_type: d.row.pattern_type,
                  auth_level: d.row.auth_level,
                  filters: d.row.filters,
                  theme: d.row.theme,
                };
                await duplicate({oldType: d.row.doc_type, newType: newDocType}, dataToCopy);
              }}
            >
              <Icon icon='Copy' className='size-4'/>
            </button>
            <button
              className='p-1.5 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-50'
              title='Delete'
              onClick={() => setDeletingItem(d.row)}
            >
              <Icon icon='TrashCan' className='size-4'/>
            </button>
          </div>
        )
      }
		}
	]

	const dmsServerPath = `${API_HOST}/dama-admin`;

	const addNewValue = (pattern) => {
		const newData = [...value, pattern || newItem];
		onChange(newData)
		onSubmit(newData)
		setNewItem({app: format?.app})
	}

	const duplicate = async({oldType, newType}, item) => {
		setIsDuplicating(true);
		// call server to copy over pages and sections
		const res = await fetch(`${dmsServerPath}/dms/${app}+${oldType}/duplicate`,
			{
				method: "POST",
				body: JSON.stringify({newApp: app, newType}), // doc_type becomes type for pages.
				headers: {
					"Content-Type": "application/json",
				},
			});

		const publishFinalEvent = await res.json();
		await addNewValue(item);
		setIsDuplicating(false);
	}

	const data = value
		.map(v => ({
            ...v,
            name: v.name || v.doc_type,
            edit_url: `${baseUrl}/manage_pattern/${v.id}`,
        }))
		.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));
	const authExists = data.some(d => d.pattern_type === 'auth')

	return (
			<div className={'flex flex-1 flex-col w-full overflow-auto'}>
				<div className={'w-full flex items-center justify-between border-b-2 border-blue-400 pb-2'}>
					<div className={'text-2xl font-semibold text-gray-700'}>Sites</div>
					<Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add site </Button>
				</div>
				<div className={'w-full flex'}>
					<Input type={'text'} value={search} onChange={e => setSearch(e.target.value)} placeholder={'Filter sites'} />
				</div>
				<Table
				  columns={columns}
					data={data}
					isEdit={false}
					gridRef={gridRef}
				/>

				<Modal open={Boolean(editingItem)} setOpen={setEditingItem}>
					<div className={`flex flex-col`}>
						{
							attrToAddNew
								.map((attrKey, i) => {
									let {EditComp, ViewComp, ...props} = attributes[attrKey]
									if(attrKey === 'filters'){
										EditComp = RenderFilters
									}
									const options =
										attrKey === 'pattern_type' && authExists && props.options?.length ?
											props.options.filter(o => o.value !== 'auth') :
											props.options;
									return (

										<EditComp
											value={editingItem?.[attrKey]}
											onChange={(v) => setEditingItem({...editingItem, [attrKey]: v})}
											placeHolder={attrKey}
											{...props}
											options={options}
											key={`${attrKey}-${i}`}
										/>

									)
								})
						}
						<div className={'w-full flex items-center justify-start gap-0.5'}>
							<Button
								className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								type={'plain'}
								title={'save item'}
								onClick={() => {
									const newValue = value.map(v => v.id === editingItem.id ? editingItem : v);
									onChange(newValue)
									onSubmit(newValue)
									setEditingItem(undefined)
								}}
							>
								save
							</Button>

							<Button
								className={'bg-red-100 hover:bg-red-300 text-sm text-red-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								type={'plain'}
								title={'cancel item'}
								onClick={() => {
									setEditingItem(undefined)
								}}
							>
								cancel
							</Button>

							<Button
								className={'bg-green-100 hover:bg-green-300 text-green-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								type={'plain'}
								title={'duplicate item'}
								onClick={async () => {
									const newDocType = crypto.randomUUID()
									const dataToCopy = {
										app: editingItem?.app,
										base_url: `${editingItem?.base_url}_copy`,
										subdomain: editingItem?.subdomain,
										config: editingItem?.config,
										doc_type: newDocType,
										name: `${editingItem?.name}_copy`,
										pattern_type: editingItem?.pattern_type,
										auth_level: editingItem?.auth_level,
										filters: editingItem?.filters,
										theme: editingItem?.theme,
									};
									await duplicate({oldType: editingItem?.doc_type, newType: newDocType}, dataToCopy)
									setEditingItem(undefined)
								}}
							> {isDuplicating ? 'duplicating...' : 'duplicate'}
							</Button>
							<Button
								className={'bg-red-100 hover:bg-red-300 text-red-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								type={'plain'}
								title={'remove item'}
								onClick={() => {
									const newData = value.filter((v, i) => v.id !== editingItem.id);
									onChange(newData)
									onSubmit(newData)
									setEditingItem(undefined)
								}}
							> remove
							</Button>
						</div>
					</div>
				</Modal>

				<Modal open={addingNew} setOpen={setAddingNew}>
					<div className={`flex flex-col`}>
						{
							attrToAddNew
								.map((attrKey, i) => {
									let {EditComp, ViewComp, ...props} = attributes[attrKey]
                                    if(attrKey === 'filters'){
                                        EditComp = RenderFilters
                                    }
									const options =
										attrKey === 'pattern_type' && authExists && props.options?.length ?
											props.options.filter(o => o.value !== 'auth') :
											props.options;
									return (
										<EditComp
											value={newItem?.[attrKey]}
											onChange={(v) => setNewItem({...newItem, [attrKey]: v})}
											{...props}
											options={options}
											placeHolder={attrKey}
											key={`${attrKey}-${i}`}
										/>

									)
								})
						}
						<div className={'w-full flex items-center justify-start'}>
							<Button
                                type={'plain'}
                                title={'Add Site'}
								className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								onClick={() => addNewValue({...newItem, doc_type: crypto.randomUUID()})}
							>
								add
							</Button>
						</div>
					</div>
				</Modal>

				<Modal open={Boolean(deletingItem)} setOpen={setDeletingItem}>
					<div className='flex flex-col gap-4 p-2'>
						<div className='text-lg font-semibold text-slate-700'>Delete Pattern</div>
						<div className='text-sm text-slate-500'>
							Are you sure you want to delete <span className='font-medium text-slate-700'>{deletingItem?.name || deletingItem?.doc_type}</span>?
							This will remove the pattern from the site. This action cannot be undone.
						</div>
						<div className='flex items-center justify-end gap-2'>
							<Button
								type='plain'
								className='px-3 py-1.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg'
								onClick={() => setDeletingItem(undefined)}
							>
								Cancel
							</Button>
							<Button
								type='plain'
								className='px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg'
								onClick={() => {
									const newData = value.filter(v => v.id !== deletingItem.id);
									onChange(newData);
									onSubmit(newData);
									setDeletingItem(undefined);
								}}
							>
								Delete
							</Button>
						</div>
					</div>
				</Modal>
			</div>
	)
}

const RenderFilters = ({value=[], onChange, ...rest}) => {
    const {UI} = React.useContext(ThemeContext);
    const [tmpValue, setTmpValue] = React.useState(parseIfJSON(value));
    const [newFilter, setNewFilter] = React.useState({});
    const {FieldSet, Button} = UI;
    const customTheme = {
        field: 'pb-2 flex flex-col'
    }
    const customThemeButton = {
        field: 'pb-2 place-content-end'
    }

    const updateFilters = (idx, key, valueToUpdate) => {
        setTmpValue(value.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v))
        onChange(value.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v));
    }

    return (
        <div className={'flex flex-col gap-1 p-1 border rounded-md'}>
            <label className={'text-sm'}>Filters</label>
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
                            {type: 'Button', children: 'remove', customTheme: customThemeButton,
                                onClick: () => {
                                    onChange(value.filter((_, idx) => i !== idx));
                                    setTmpValue(value.filter((_, idx) => i !== idx))
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
                    {type: 'Button', children: 'add', customTheme: customThemeButton,
                        onClick: () => {
                            const id = uuidv4();
                            onChange([...value, {id, ...newFilter}]);
                            setTmpValue([...value, {id, ...newFilter}])
                            setNewFilter({});
                        }
                    }
                ]}
            />
            <Button onClick={() => {
                onChange([]);
                setTmpValue([])
                setNewFilter({});
            }} > clear all filters </Button>
        </div>
    )
}
