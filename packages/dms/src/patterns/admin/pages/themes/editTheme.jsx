import React, {useContext, useEffect, useMemo, useState} from 'react'
import Frame from 'react-frame-component'
import { useImmer } from 'use-immer';
import { useNavigate } from 'react-router';
import defaultTheme from '../../../../ui/defaultTheme'

import { cloneDeep, get, set } from "lodash-es";

import { ThemeContext, mergeTheme } from "../../../../ui/useTheme";
import { AdminContext } from "../../context";
import { parseIfJSON } from '../../../page/pages/_utils';
import { editThemeTheme } from './editTheme.theme';
const DefaultComp = () => <div>Component not registered.</div>
const ComponentRenderer = ({Component=DefaultComp, props}) => <Component {...props} />;

const compOptions = [
  { label: 'PageView', value: 'PageView' },
  { label: 'Button', value: 'Button' },
	{ label: 'Card', value: 'Card' },
	{ label: 'Drawer', value: 'Drawer' },
	{ label: 'DraggableNav', value: 'DraggableNav' },
	{ label: 'FieldSet', value: 'FieldSet' },
	{ label: 'Graph', value: 'Graph' },
	{ label: 'Icon', value: 'Icon' },
	{ label: 'Input', value: 'Input' },
	{ label: 'Label', value: 'Label' },
	{ label: 'Pagination', value: 'Pagination' },
	{ label: 'Pill', value: 'Pill' },
	{ label: 'MultiSelect', value: 'MultiSelect' },
	{ label: 'SideNav', value: 'SideNav' },
	{ label: 'Switch', value: 'Switch' },
	{ label: 'Table', value: 'Table' },
	{ label: 'Tabs', value: 'Tabs' },
	{ label: 'TopNav', value: 'TopNav' },
	{ label: 'DeleteModal', value: 'DeleteModal' },
	{ label: 'Dialog', value: 'Dialog' },
	{ label: 'Modal', value: 'Modal' },
];


function ControlRenderer({ config, state, setState }) {
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...editThemeTheme, ...(theme?.admin?.editTheme || {}) }
  const { FieldSet } = UI;
  const controls = (config?.controls || [])
    .filter(d => d) //implement conditionals
    .map(d => {
      return {
        ...d,
        value: get(state, `${d.path}`, d?.default || ''),
        onClick: d?.onClick ? (e) => d?.onClick(e, setState) : () => { },
        onChange: d?.onChange ?
          (e) => d.onChange(e,setState) :
          (e) => setState(draft => {
            // Input/Textarea hand us a DOM event; MultiSelect hands us the
            // value directly. Accept either shape.
            set(draft, `${d.path}`, e?.target?.value ?? e)
          })
      }
    })
  //console.log('Fieldset controls', controls)
  return (
    <div>
      <div className={t.controlLabel}>{ config?.label || ''}</div>
      <FieldSet components={controls} />
    </div>
  )
}

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

  // Lazy-load component docs (only needed for theme editor preview)
  const [componentDocs, setComponentDocs] = useState(null);
  useEffect(() => { import('../../../../ui/docs').then(m => setComponentDocs(m.default)); }, []);

  // themes is an array of {name, theme, id}
	const navigate = useNavigate();
	const { UI, theme: themeFromContext } = useContext(ThemeContext);
	const t = { ...editThemeTheme, ...(themeFromContext?.admin?.editTheme || {}) }
	const { baseUrl, user } = React.useContext(AdminContext) || {};
	const { MultiSelect, Button } = UI;
	const theme = defaultTheme

	const {theme_id, component, ...restparams} = params;
	const themeObj = useMemo(() => (item.theme_refs || []).find(t => t.theme_id === theme_id), [item.theme_refs, theme_id])
	const [currentTheme, setCurrentTheme] = useImmer( mergeTheme(defaultTheme, parseIfJSON(themeObj?.theme)));
	const themeSettings = React.useMemo(() => currentTheme?.settings(currentTheme), [currentTheme])
  const [currentThemeSetting, setCurrentThemeSetting ] = React.useState(Object.keys(themeSettings)[0])

  //change display docs
  const compFromProps = useMemo(() => compOptions.find(c => c.value.toLowerCase() === component?.toLowerCase())?.value, [component]);
	const [currentComponent, setCurrentComponent] = useState(compFromProps || 'PageView')
  const [currentComponentPropsIdx, setCurrentComponentPropsIdx] = useState(0);

  // useEffect(() => console.log('theme Change',currentTheme),[currentTheme])
	useEffect(() => {
	  // runs when a new theme Obj is loaded from db
	  // merge the default base theme with the base theme
	  const newTheme =  mergeTheme(theme, parseIfJSON(themeObj?.theme))
		setCurrentTheme(newTheme)
	}, [themeObj]);

	useEffect(() => {
		// console.log('settting comp', compFromProps)
		setCurrentComponent(compFromProps || 'PageView')
	}, [compFromProps])

	const onSubmit = (updateCurrentTheme) => {
		const value = item.theme_refs.map(t => t.theme_id === theme_id ? {...t, theme: JSON.stringify(updateCurrentTheme)} : t);
		apiUpdate({data: {...item, theme_refs: value}, config: {format}})
		updateAttribute('themes', value)
	}

	if(!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	// console.log('testing',themeSettings, currentThemeSetting, themeSettings?.[currentThemeSetting])
	return (
		<div className={t.wrapper}>
			<div className={t.header}>
				<div className={t.headerLeft}>
          <div className={t.headerThemeName}>{themeObj?.name}</div>
					<div className={t.componentSelectorWrapper}>
						<MultiSelect
  					  singleSelectOnly
  					  searchable={false}
  					  value={currentComponent}
  						onChange={value => {
    						  setCurrentComponent(value)
      						navigate(`${baseUrl}/${path.replace(':theme_id', theme_id).replace(':component?', value.toLowerCase())}`)
    				  }}
     			    options={compOptions}
       	    />
					</div>
					<div>
			      <MultiSelect singleSelectOnly searchable={false} value={currentComponentPropsIdx}
     					onChange={value => setCurrentComponentPropsIdx(value)}
     					options={
      						(Array.isArray(componentDocs?.[currentComponent]) ? componentDocs?.[currentComponent] : [componentDocs?.[currentComponent]])
     							.map((o, i) => ({label: o?.doc_name || `Example ${i + 1}`, value: i}))
     					}
   					/>
					</div>
				</div>
				<button onClick={() => navigate(-1)}>back</button>
			</div>
			<div className={t.body}>
				<div className={t.sidebar}>
    		  <div className={t.sidebarSelectorWrapper}>
   					<MultiSelect singleSelectOnly searchable={false} value={currentThemeSetting}
              onChange={value => {
  						  setCurrentThemeSetting(value)
    						//navigate(`${baseUrl}/${path.replace(':theme_id', theme_id).replace(':component?', value.toLowerCase())}`)
 					    }}
 							options={
                Object.keys(themeSettings)
                  .map(k => ({label:k, value:k}))
              }
   					/>
      		</div>
 					<div className={t.sidebarActions}>
						<Button className={'w-fit'} onClick={() => onSubmit(currentTheme)}>Save</Button>
						<Button className={'w-fit'} onClick={() => setCurrentTheme(mergeTheme(theme, parseIfJSON(themeObj?.theme)))}>Reset</Button>
 					</div>
  				<div className={t.sidebarControls}>
            { currentThemeSetting }
            {
              (themeSettings?.[currentThemeSetting] || [])
                .map(conf => <ControlRenderer
                  config={conf}
                  state={currentTheme}
                  setState={setCurrentTheme}
                />)
            }
  				</div>
				</div>
				<div className={t.frameWrapper}>
					<Frame
						className={t.frame}
						initialContent={`
              <!DOCTYPE html>
              <html>
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
                    <style type="text/tailwindcss">
                      @custom-variant dark (&:where(.dark, .dark *));
                    </style>
                    <style>
                    @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Grape+Nuts&family=Oswald:wght@200..700&family=Rock+Salt&family=Shadows+Into+Light+Two&display=swap');
                    </style>
                    <link href="/fonts/proxima-nova/stylesheet.css" rel="stylesheet">
                </head>
                <body>
                  <div id="root" class=""></div>
                </body>
              </html>
            `}
					>
  					<ThemeContext.Provider value={{theme: currentTheme, UI}}>
  						<ComponentRenderer
  						  Component={
                  componentDocs?.[currentComponent]?.component ||
                  componentDocs?.[currentComponent]?.[currentComponentPropsIdx]?.component ||
                  UI[currentComponent]
                }
   							props={
                  componentDocs?.[currentComponent]?.[currentComponentPropsIdx]?.props ||
                  componentDocs?.[currentComponent]?.[currentComponentPropsIdx] ||
                  componentDocs?.[currentComponent]?.props ||
                  componentDocs?.[currentComponent]
                }
  						/>
  					</ThemeContext.Provider>
					</Frame>
				</div>
			</div>
		</div>
	)
}

export default ComponentList
