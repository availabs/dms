import React from 'react'
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
	...props
}) {

	const { baseUrl, authPath, theme, app, user, AUTH_HOST } = React.useContext(AdminContext) || {}
	const location = useLocation()
  const updateData = (data, attrKey) => {
		console.log('admin pattern - siteEdit - updateData', attrKey, data, format)
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
	const attrToAddNew = ['pattern_type', 'name', 'subdomain', 'base_url', 'filters', 'authPermissions'];
	//console.log('test 123', location)
	const columns = [
		{name: 'name', display_name: 'Name', show: true, type: 'text'},
		{name: 'base_url', display_name: 'Base URL', show: true, type: 'ui',
      Comp: (d) => {
        return (
          <Link
            to={`http${window.location.host.includes('localhost') ? '' : 's'}://${(d.row.subdomain === '*' || !d.row.subdomain ) ? '' : `${d.row.subdomain}.`}${window.location.host.split('.')[1] || window.location.host.split('.')[0]}${d.row.base_url}`}
            className='flex items-center p-2 w-full h-full py-1 font-[400] text-[14px]  leading-[18px] text-slate-600'
          >
            {d?.row?.base_url}
          </Link>
        )
      }
		},
		{name: 'subdomain', display_name: 'Subdomain', show: true, type: 'text'},
		// {name: 'updated_at', display_name: 'Updated', show: true, type: 'text', formatFn: 'date'},
		{name: 'edit', display_name: 'Edit', show: true, type: 'ui',
      Comp: (d) => {
        return (
          <div className='flex items-center justify-center w-full h-full py-1'>
            <Link to={d?.row?.edit_url || ''} div className='flex  items-center px-2 py-1 text-sm text-slate-700 bg-slate-200 rounded-full'>
              <Icon icon='PencilEditSquare' className='size-5'/><span className='pl-1'>Edit</span>
            </Link>
          </div>
        )
      }
		}

	]

	const dmsServerPath = `${API_HOST}/dama-admin`;

	const addNewValue = (item) => {
		const newData = [...value, item || newItem];
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

		// const publishFinalEvent = await res.json();
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
								onClick={() => addNewValue({...newItem, doc_type: uuidv4()})}
							>
								add
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
