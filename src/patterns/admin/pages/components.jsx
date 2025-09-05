import React, {useContext, useEffect, useMemo, useState} from 'react'
import { useImmer } from 'use-immer';
import {useNavigate} from 'react-router';
import Frame from 'react-frame-component'
import { merge, cloneDeep } from "lodash-es";

import {ThemeContext} from "../../../ui/useTheme";
import {AdminContext} from "../siteConfig";


const parseIfJson = (value) => {
	try {
		if(typeof value === 'object' && value !== null) return value;
		return JSON.parse(value)
	} catch (e){
		return {}
	}
}

const DefaultComp = () => <div>Component not registered.</div>
const ComponentRenderer = ({Component=DefaultComp, props}) => <Component {...props} />;

const compOptions = [
	{ label: 'Button', value: 'Button' },
	{ label: 'PageView', value: 'PageView' },
	{ label: 'Card', value: 'Card' },
	{ label: 'Drawer', value: 'Drawer' },
	{ label: 'DraggableNav', value: 'DraggableNav' },
	{ label: 'Dropdown', value: 'Dropdown' },
	{ label: 'FieldSet', value: 'FieldSet' },
	{ label: 'Graph', value: 'Graph' },
	{ label: 'Icon', value: 'Icon' },
	{ label: 'Input', value: 'Input' },
	{ label: 'Label', value: 'Label' },
	{ label: 'Menu', value: 'Menu' },
	{ label: 'Pagination', value: 'Pagination' },
	{ label: 'Pill', value: 'Pill' },
	{ label: 'Popover', value: 'Popover' },
	{ label: 'Select', value: 'Select' },
	{ label: 'SideNav', value: 'SideNav' },
	{ label: 'Switch', value: 'Switch' },
	{ label: 'Table', value: 'Table' },
	{ label: 'Tabs', value: 'Tabs' },
	{ label: 'TopNav', value: 'TopNav' },

	{ label: 'DeleteModal', value: 'DeleteModal' },
	{ label: 'Dialog', value: 'Dialog' },
	{ label: 'Modal', value: 'Modal' },
];

function ComponentList ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   apiUpdate,
   format,
	params,
	path,
	...rest
}) {

  // themes is an array of {name, theme, id}
	const navigate = useNavigate();
	const { theme, UI } = useContext(ThemeContext);
	const { baseUrl, user } = React.useContext(AdminContext) || {};
	const { Select, Button } = UI;

	const {theme_id, component, ...restparams} = params;
	const compFromProps = useMemo(() => compOptions.find(c => c.value.toLowerCase() === component?.toLowerCase())?.value, [component]);
	const [currentComponent, setCurrentComponent] = useState(compFromProps || 'Button');
  const [currentComponentPropsIdx, setCurrentComponentPropsIdx] = useState(0);
  const [currentThemeSetting, setCurrentThemeSetting ] = React.useState('layout')


	const themeObj = useMemo(() => (item.themes || []).find(t => t.id === theme_id), [item.themes, theme_id])
	const [currentTheme, setCurrentTheme] = useImmer(parseIfJson(themeObj?.theme));

  const mergedTheme = React.useMemo(() => merge(cloneDeep(theme),cloneDeep(currentTheme)), [theme, currentTheme])

  console.log('currentTheme', currentTheme, theme)





	useEffect(() => {
		setCurrentTheme(parseIfJson(themeObj?.theme))
	}, [themeObj]);

	useEffect(() => {
		// console.log('settting comp', compFromProps)
		setCurrentComponent(compFromProps || 'Button')
	}, [compFromProps])

	const onSubmit = (updateCurrentTheme) => {
		const value = item.themes.map(t => t.id === theme_id ? {...t, theme: JSON.stringify(updateCurrentTheme)} : t);
		apiUpdate({data: {...item, themes: value}, config: {format}})
		updateAttribute('themes', value)
	}


	if(!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	// key to access theme for current component.
	const currThemeKey = theme?.docs?.[currentComponent]?.themeKey || currentComponent?.toLowerCase();
	// current theme. either saved, or default.
	const currCompTheme = mergedTheme?.[currentThemeSetting] || theme?.[currentThemeSetting] || {};

	return (
		<div className={'flex flex-col p-4 w-full divide-y-2'}>
			<div className={'w-full flex justify-between border-b-2 border-blue-400'}>
				<div className='flex'>
				  <div className={'text-2xl font-semibold text-gray-700'}>Components</div>
					<div className='px-4'>
						<Select
  					  value={currentComponent}
  						onChange={e => {
    						  setCurrentComponent(e.target.value)
      						navigate(`${baseUrl}/${path.replace(':theme_id', theme_id).replace(':component?', e.target.value.toLowerCase())}`)
    				  }}
     			    options={compOptions}
       	    />
					</div>
					<div>
			      <Select value={currentComponentPropsIdx}
     					onChange={e => setCurrentComponentPropsIdx(e.target.value)}
     					options={
      						(Array.isArray(theme?.docs?.[currentComponent]) ? theme?.docs?.[currentComponent] : [theme?.docs?.[currentComponent]])
     							.map((o, i) => ({label: o?.doc_name || `Example ${i + 1}`, value: i}))
     					}
   					/>
					</div>
				</div>
				<button onClick={() => navigate(-1)}>back</button>
			</div>


			<div className={'flex flex-col sm:flex-row divide-x'}>
				<div className={'w-[150px] p-4 order-2'}>
    		  <div className={'pb-2'}>
   					<Select value={currentThemeSetting}
                onChange={e => {
    						  setCurrentThemeSetting(e.target.value)
      						//navigate(`${baseUrl}/${path.replace(':theme_id', theme_id).replace(':component?', e.target.value.toLowerCase())}`)
   					  }}
   							options={
                  Object.keys(mergedTheme)
                    .map(k => ({label:k, value:k}))
                }
   					/>


    				</div>
  					<div className={'w-full flex gap-0.5 justify-end'}>
  						<Button className={'w-fit'} onClick={() => onSubmit(currentTheme)}>Save</Button>
  						<Button className={'w-fit'} onClick={() => setCurrentTheme(parseIfJson(themeObj?.theme))}>Reset</Button>
  					</div>
  					<div className='h-[calc(100vh_-_20rem)] overflow-auto scrollbar-sm p-2 '>
  					{
  						Object.keys(currCompTheme)
  							.map(key => (
  								<div className={'w-full'}>
  									<div className={'font-semibold text-gray-700 w-full'}>{key}</div>
  									<textarea className={'w-full  border p-2'}
  											  value={typeof currCompTheme?.[key] === 'object' ? JSON.stringify(currCompTheme?.[key]) : currCompTheme?.[key]}
  											  onChange={e => {
  												  setCurrentTheme({
  													  ...currentTheme,
  													  [currentThemeSetting]: {
  														  ...(currCompTheme || {}),
  														  [key]: e.target.value
  													  }
  												  })
  											  }}
  									/>
  								</div>
  							))
  					}
  					</div>
				</div>

				{/* <div className={'flex h-full justify-center p-2'}>
					<ThemeContext.Provider value={{theme: currentTheme, UI}}>
						<ComponentRenderer
						  Component={theme?.docs?.[currentComponent]?.component || UI[currentComponent]}
							props={theme?.docs?.[currentComponent][currentComponentPropsIdx] || theme?.docs?.[currentComponent]?.props || theme?.docs?.[currentComponent] }
						/>
					</ThemeContext.Provider>
				</div>*/}
				<div className={'flex-1 h-[calc(100vh_-_6rem)]'}>
					<Frame
						className='w-full h-[calc(100vh_-_6rem)] border-2 border-orange-500'
						head={
							<>
					      <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
								<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.15/dist/tailwind.min.css" rel="stylesheet" />
                <link href="/index-C-y3Pj2B.css" rel="stylesheet" />
							</>
						}
					>
  					<ThemeContext.Provider value={{theme: currentTheme, UI}}>
  						<ComponentRenderer
  						  Component={theme?.docs?.[currentComponent]?.component || UI[currentComponent]}
  							props={theme?.docs?.[currentComponent][currentComponentPropsIdx] || theme?.docs?.[currentComponent]?.props || theme?.docs?.[currentComponent] }
  						/>
  					</ThemeContext.Provider>
					</Frame>
				</div>

			</div>
		</div>
	)
}

export default ComponentList
