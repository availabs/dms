import React, {useContext, useEffect, useMemo, useState} from 'react'
import Frame from 'react-frame-component'
import { useImmer } from 'use-immer';
import { useNavigate } from 'react-router';
import { merge, cloneDeep, get, set } from "lodash-es";

import { ThemeContext } from "../../../../../ui/useTheme";
import { AdminContext } from "../../../context";
import { parseIfJSON } from '../../../../page/pages/_utils';
import defaultTheme from '../../../../../ui/defaultTheme'


const DefaultComp = () => <div>Component not registered.</div>
const ComponentRenderer = ({Component=DefaultComp, props}) => <Component {...props} />;

const compOptions = [
  { label: 'PageView', value: 'PageView' },
  { label: 'Button', value: 'Button' },
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




function ControlRenderer({ config, state, setState }) {
  const { UI } = useContext(ThemeContext);
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
            //console.log('onChange', d.path)
          set(draft, `${d.path}`, e.target.value)
          })
      }
    })
  //console.log('Fieldset controls', controls)
  return (
    <div> {/* controlWrapper goes here */ }
      <div className='font-bold underline'>{ config?.label || ''}</div>
      <FieldSet components={controls} />
    </div>
  )
}

export function PatternThemeEditor ({
   item={},
   value,
   dataItems,
   attributes,
   updateAttribute,
   params,
   path,
   ...rest
}) {

  // themes is an array of {name, theme, id}
	const navigate = useNavigate();
	const { themes, UI } = useContext(ThemeContext);
	const { baseUrl, user, apiUpdate} = React.useContext(AdminContext) || {};
	const { Select, Button } = UI;

	// console.log('Pattern themeEditor themes',themes)
	const [baseTheme,setBaseTheme] = React.useState(
	  merge(
			cloneDeep(defaultTheme),
      cloneDeep(themes?.[value?.theme?.selectedTheme ||'default'] || {}),
		)
	)

	//const {theme_id, component, ...restparams} = params;
	//const themeObj = useMemo(() => (item.theme_refs || []).find(t => t.theme_id === theme_id), [item.theme_refs, theme_id])

  // ----------------
  if(value?.theme?.settings) {
	  delete value.theme.settings
	}
  if(!value?.theme?.layout?.options) {
    set(value, 'theme.layout.options', cloneDeep(baseTheme?.layout?.options))
  }
  let inputTheme = value?.theme || {}
  // ----------------
  const [patternTheme, setPatternTheme] = useImmer(inputTheme)
  //let selectedTheme =  useMemo(() => , [patternTheme.selectedTheme])

	const currentTheme = useMemo(() =>{
	  	let newBaseTheme = cloneDeep(baseTheme)
	    delete  newBaseTheme?.layout?.options
  	  return merge(
        newBaseTheme,
  			cloneDeep(patternTheme)
  		)
	}
	,[baseTheme, patternTheme]);
	//console.log('currentTheme', currentTheme)
  const themeSettings = React.useMemo(() => {
    // console.log('updateSettings',currentTheme?.settings(currentTheme), currentTheme)
    return currentTheme?.settings(currentTheme)
  }, [currentTheme])
  const [currentThemeSetting, setCurrentThemeSetting ] = React.useState(Object.keys(themeSettings)[0])

  //change display docs
  //const compFromProps = useMemo(() => compOptions.find(c => c.value.toLowerCase() === component?.toLowerCase())?.value, [component]);
	const [currentComponent, setCurrentComponent] = useState('PageView')
  const [currentComponentPropsIdx, setCurrentComponentPropsIdx] = useState(0);

  useEffect(() => {
    const newBase = merge(
      cloneDeep(defaultTheme),
      cloneDeep(themes?.[patternTheme.selectedTheme ||'default'] || {}),
    )
    setBaseTheme(newBase)
    setPatternTheme((draft) => {
      set(draft, 'layout.options', cloneDeep(newBase?.layout?.options))
    })
  },[patternTheme.selectedTheme])

	const onSubmit = (updateCurrentTheme) => {
		//const value = item.theme_refs.map(t => t.theme_id === theme_id ? {...t, theme: JSON.stringify(updateCurrentTheme)} : t);
		const newValue = {id: value.id, theme: patternTheme}
		//console.log('submitting', newValue)
    apiUpdate({ data: newValue })
		//updateAttribute('themes', value)
	}

	if(!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	// console.log('testing',themeSettings, currentThemeSetting, themeSettings?.[currentThemeSetting])
	return (
		<div className={'flex flex-col p-4 w-full divide-y-2'}>
			<div className={'w-full flex justify-between border-b-2 border-blue-400'}>
				<div className='flex'>
          <div className={'text-2xl font-semibold text-gray-700'}>
            <Select
              value={patternTheme?.selectedTheme || 'default'}
              onChange={
                e => {
                  setPatternTheme(draft => {
                    draft.selectedTheme = e.target.value
                  })
                }
              }
              options={Object.keys(themes).map(d => { return { label: d, value: d } })}
            />
            </div>
					<div className='px-4'>
						<Select
  					  value={currentComponent}
  						onChange={e => {
    						  setCurrentComponent(e.target.value)
      						//navigate(`${baseUrl}/${path.replace(':theme_id', theme_id).replace(':component?', e.target.value.toLowerCase())}`)
    				  }}
     			    options={compOptions}
       	    />
					</div>
					<div>
			      <Select value={currentComponentPropsIdx}
     					onChange={e => setCurrentComponentPropsIdx(e.target.value)}
     					options={
      						(Array.isArray(defaultTheme?.docs?.[currentComponent]) ?
                    defaultTheme?.docs?.[currentComponent] :
                    [defaultTheme?.docs?.[currentComponent]]
                  )
     							.map((o, i) => ({label: o?.doc_name || `Example ${i + 1}`, value: i}))
     					}
   					/>
					</div>
				</div>
				<button onClick={() => navigate(-1)}>back</button>
			</div>
			<div className={'flex flex-col sm:flex-row divide-x relative'}>
				<div className={'w-[250px] order-2 overflow-hidden'}>
    		  <div className={'pb-2'}>
   					<Select
              value={currentThemeSetting}
              onChange={e => {
  						  setCurrentThemeSetting(e.target.value)
    						//navigate(`${baseUrl}/${path.replace(':theme_id', theme_id).replace(':component?', e.target.value.toLowerCase())}`)
 					    }}
 							options={
                Object.keys(themeSettings)
                  .map(k => ({label:k, value:k}))
              }
   					/>
      		</div>
 					<div className={'w-full flex gap-0.5 justify-end'}>
						<Button className={'w-fit'} onClick={() => onSubmit(currentTheme)}>Save</Button>
						<Button className={'w-fit'} onClick={() => setPatternTheme(parseIfJSON(inputTheme))}>Reset</Button>
            <Button className={'w-fit'} onClick={() => setPatternTheme({layout:{options: baseTheme?.layout?.options}})}>Full Reset</Button>
 					</div>
  				<div className='h-[calc(100vh_-_11rem)] overflow-auto w-full scrollbar-sm p-2 '>
            { currentThemeSetting }
            {
              (themeSettings?.[currentThemeSetting] || [])
                .map(conf => <ControlRenderer
                  config={conf}
                  state={currentTheme}
                  setState={setPatternTheme}
                />)
            }
  				</div>
				</div>
				<div className={'flex-1 h-[calc(100vh_-_6rem)]'}>
					<Frame
						className='w-full h-[calc(100vh_-_6rem)] border-1'
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
                  defaultTheme?.docs?.[currentComponent]?.component ||
                  UI[currentComponent]
                }
   							props={
                  defaultTheme?.docs?.[currentComponent][currentComponentPropsIdx] ||
                  defaultTheme?.docs?.[currentComponent]?.props ||
                  defaultTheme?.docs?.[currentComponent]
                }
  						/>
  					</ThemeContext.Provider>
					</Frame>
				</div>

			</div>
      <pre>{JSON.stringify(patternTheme, null, 3)}</pre>
		</div>
	)
}

export default PatternThemeEditor
