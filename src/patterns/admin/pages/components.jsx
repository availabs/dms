import React, {useContext, useEffect, useMemo, useState} from 'react'
import Frame from 'react-frame-component'
import {AdminContext} from "../siteConfig";
import {ThemeContext} from "../../../ui/useTheme";

const parseIfJson = (value) => {
	try {
		if(typeof value === 'object' && value !== null) return value;

		return JSON.parse(value)
	}catch (e){
		return {}
	}
}

const DefaultComp = () => <div>Component not registered.</div>
const ComponentRenderer = ({Component=DefaultComp, props}) => <Component {...props} />;
function ComponentList ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   apiUpdate,
   format,
	params,
	...rest
}) {
	// themes is an array of {name, theme, id}
	const {theme_id} = params;
	const themeObj = useMemo(() => (item.themes || []).find(t => t.id === theme_id), [item.themes, theme_id])
	const [currentTheme, setCurrentTheme] = useState(parseIfJson(themeObj?.theme));
	const [currentComponent, setCurrentComponent] = useState('Button');
	const [currentComponentPropsIdx, setCurrentComponentPropsIdx] = useState(0);

	const {theme} = useContext(ThemeContext);
	const { baseUrl, user, UI } = React.useContext(AdminContext) || {};
	const {Select, Button} = UI;

	useEffect(() => {
		setCurrentTheme(parseIfJson(themeObj?.theme))
	}, [themeObj]);

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
	const currCompTheme = currentTheme?.[currThemeKey] || theme?.[currThemeKey] || {};

	return (
		<div className={'flex flex-col p-10 w-full divide-y-2'}>
			<div className={'w-full flex justify-between border-b-2 border-blue-400'}>
				<div className={'text-2xl font-semibold text-gray-700'}>Components</div>
				<button onClick={() => navigate(-1)}>back</button>
			</div>
			<div className={'w-full flex'}>
				<Select value={currentComponent} onChange={e => setCurrentComponent(e.target.value)}
						options={[
							{ label: 'Button', value: 'Button' },
							{ label: 'Drawer', value: 'Drawer' },
							{ label: 'DraggableNav', value: 'DraggableNav' },
							{ label: 'Dropdown', value: 'Dropdown' },
							{ label: 'FieldSet', value: 'FieldSet' },
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

						]}
				/>

				<Select value={currentComponentPropsIdx}
						onChange={e => setCurrentComponentPropsIdx(e.target.value)}
						options={
					(Array.isArray(theme?.docs?.[currentComponent]) ? theme?.docs?.[currentComponent] : [theme?.docs?.[currentComponent]])
						.map((o, i) => ({label: o?.doc_name || `Example ${i + 1}`, value: i}))
				}
				/>
			</div>

			<div className={'flex flex-col sm:flex-row divide-x'}>
				<div className={'w-full sm:w-1/2 h-[calc(100vh_-_20rem)] overflow-auto scrollbar-sm'}>
					<div className={'w-full flex gap-0.5 justify-end'}>
						<Button className={'w-fit'} onClick={() => onSubmit(currentTheme)}>Save</Button>
						<Button className={'w-fit'} onClick={() => setCurrentTheme(parseIfJson(themeObj?.theme))}>Reset</Button>
					</div>

					{
						Object.keys(currCompTheme)
							.map(key => (
								<div className={'w-full'}>
									<div className={'text-semibold text-gray-700 w-full'}>{key}</div>
									<textarea className={'w-full'}
											  value={currCompTheme?.[key]}
											  onChange={e => {
												  setCurrentTheme({
													  ...currentTheme,
													  [currThemeKey]: {
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

				<div className={'flex w-full sm:w-1/2 h-full justify-center'}>
					<ThemeContext.Provider value={{theme: currentTheme}}>
						<ComponentRenderer Component={UI[currentComponent]}
										   props={theme?.docs?.[currentComponent][currentComponentPropsIdx] || theme?.docs?.[currentComponent]}
						/>
					</ThemeContext.Provider>
				</div>
				{/*<div className={'w-full h-[calc(100vh_-_6rem)] sm:w-1/2'}>
					<Frame
						className='w-full flex-1 h-[calc(100vh_-_6rem)] border'
						head={
							<>

								<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.15/dist/tailwind.min.css" rel="stylesheet" />
								<link href="/build.css" rel="stylesheet" />
							</>
						}
					>
						<ThemeContext.Provider value={{theme: currentTheme}}>
							<ComponentRenderer Component={UI[currentComponent]}
											   props={theme?.docs?.[currentComponent][currentComponentPropsIdx] || theme?.docs?.[currentComponent]}
							/>
						</ThemeContext.Provider>
					</Frame>
				</div>*/}
			</div>
		</div>
	)
}

export default ComponentList