import React, {useEffect} from 'react'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { merge } from "lodash-es"
import { cloneDeep } from "lodash-es"
import { isEqual } from "lodash-es"
import Frame from 'react-frame-component'
//import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";


import ManagerLayout from './layout'
import Layout from '../../ui/avail-layout'
import Icons from '../../ui/icons'
import {dataItemsNav, detectNavLevel, getInPageNav} from '../_utils'
// import SideNav from '../../ui/nav/Side'
import { ArrowUp, ArrowDown } from '../../ui/icons'
import { SideNavContainer } from '../../ui'
import { FormsContext } from '../../siteConfig'
import { themeOptions } from '../../theme/theme'


function SelectControl ({ themeOptions, theme, newTheme, setNewTheme, sectionKey, navKey, controlKey }) 
{
    let control = themeOptions[sectionKey][navKey].controls[controlKey]         
    return (
      <div className='w-full'>
        <div className='text-xs font-medium pt-1 text-slate-400'>{control.label}</div>
        <div className='w-full'>
        <select className='p-2 bg-white w-full' value={newTheme[sectionKey]?.[navKey]?.[controlKey] || theme[sectionKey]?.[navKey]?.[controlKey]} onChange={(e) => {
          setNewTheme(merge(cloneDeep(newTheme), {[sectionKey]: {[navKey]: {[controlKey]: e.target.value}}}))
        }}>
          {control.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        </div>
      </div>
    )
}


function MenuItemEditor({onSave, onCancel, item}) {
  const blankItem = {
    name:'',
    icon: '',
    path: '',
    className: '',
    authLevel: '-1'
  }
  let [newItem, setNewItem] = React.useState(item || blankItem )

  React.useEffect(() => { setNewItem(item || blankItem )},[item])

  return (
    <div>
      {['name', 'icon', 'path', 'className', 'authLevel']
        .map(key => {
        return (
          <div key={key}>
            <div className='text-xs font-medium pt-1 text-slate-400'>{key}</div>
            <div className='w-full'>
              <input 
                className='p-2 bg-white w-full' 
                value={newItem[key]} 
                onChange={(e) => setNewItem({...newItem, [key]: e.target.value})}
              />
            </div>
          </div>
        )
      })}
      <div className='flex justify-end py-2'>
        <div className='bg-slate-300 rounded px-2 py-1 text-slate-100 cursor-pointer' onClick={onCancel} >Cancel</div>
        <div className='bg-blue-500 rounded px-2 py-1 text-white cursor-pointer ml-2' onClick={() => onSave(newItem)}>Save</div>
      </div>

    </div>
  )
}

function MenuItemsEditor({onSave, onCancel, items}) {
  
  let [newItems, setNewItems] = React.useState(JSON.stringify( (items || []), null , 3 ))

  //React.useEffect(() => { setNewItem(item || blankItem )},[item])

  return (
    <div>
      (
          <div>
            
            <div className='w-full'>
              <textarea 
                className='p-2 bg-white w-full' 
                value={newItems} 
                onChange={(e) => setNewItems(e.target.value)}
              />
            </div>
          </div>
     
      <div className='flex justify-end py-2'>
        <div className='bg-slate-300 rounded px-2 py-1 text-slate-100 cursor-pointer' onClick={onCancel} >Cancel</div>
        <div className='bg-blue-500 rounded px-2 py-1 text-white cursor-pointer ml-2' onClick={() => onSave(JSON.parse(newItems) || items)}>Save</div>
      </div>
    </div>
  )
}


function MenuControl ({ themeOptions, theme, newTheme, setNewTheme, sectionKey, navKey, controlKey })  {
    let [editIndex, setEditIndex] = React.useState(-2)

    //console.log('test 123', navKey, controlKey, newTheme.navOptions?.[navKey]?.[controlKey])
    let control = themeOptions[sectionKey][navKey].controls[controlKey]
    let menuItems = newTheme?.[sectionKey]?.[navKey]?.[controlKey] || []

    return (
      <div className='w-full'>
        <div className='text-xs font-medium pt-1 text-slate-400 w-full flex justify-between'>
          <div className='flex-1'>{control.label} {editIndex}</div>
          <div><button className='bg-blue-500 rounded px-0.5 py-1 text-white cursor-pointer' onClick={() => setEditIndex(-3)}>{'</>'}</button></div>
          <div><button className='bg-blue-500 rounded px-0.5 py-1 text-white cursor-pointer' onClick={() => setEditIndex(-1)}>Add Item</button></div>

          
        </div>
        { editIndex === -3 ? 
          <div>
            <MenuItemsEditor 
              onCancel={(e) =>  setEditIndex(-2)}
              items={menuItems}
              onSave={(newItems) => {
                setNewTheme(merge(cloneDeep(newTheme), {[sectionKey]: {[navKey]: {[controlKey]: newItems}}}))
                setEditIndex(-2)

              }} 
            />
          </div> : 
          (<div>
              {
                menuItems.length === 0 ? 
                  'No Items' : menuItems.map((d,i) => (
                    <div className='flex w-full text-sm items-center py-1 border-b' key={i}>
                      <div className='flex-1'>
                        <span className='font-medium text-slate-600'>{d.name}</span> <span className='text-slate-400'>{d.path}</span> 
                      </div>
                      <div onClick={() => { console.log('pencil click', i); setEditIndex(i); }}>
                        <Icons.PencilIcon 
                          className='h-5 w-5 cursor-pointer text-slate-500 hover:text-blue-500'
                        />
                      </div>
                      <div>
                        <Icons.RemoveCircle 
                          onClick={() => {
                            console.log('menuItems', menuItems)
                            menuItems.splice(i,1)
                            let newItems = menuItems
                            console.log('splice', newItems, i)
                            setNewTheme(merge(cloneDeep(newTheme), {[sectionKey]: {[navKey]: {[controlKey]: newItems}}}))
                          }}
                          className='h-5 w-5 cursor-pointer text-slate-500 hover:text-red-500'
                        />
                      </div>
                    </div>
                  ))
              }
            </div>
            )
          }
          <div>
            {editIndex !== -2 ? 
              <MenuItemEditor 
                onCancel={(e) =>  setEditIndex(-2)}
                item={menuItems?.[editIndex]}
                onSave={(newItem) => {
                  const newItems = menuItems
                  if(editIndex === -1) {
                    newItems.push(newItem)
                  } else {
                    newItems[editIndex] = newItem
                  }
                  
                  setNewTheme(merge(cloneDeep(newTheme), {[sectionKey]: {[navKey]: {[controlKey]: newItems}}}))
                  setEditIndex(-2)

                }} 
              />: ''}
          </div>

      </div>
    )
}

const controls = {
  'select': SelectControl,
  'menu': MenuControl
}

function DesignEditor ({item, dataItems, attributes, apiLoad, apiUpdate, format, logo, rightMenu,themes, ...props}) {
 
  const { baseUrl, theme, user } = React.useContext(FormsContext) || {}
  const [ newTheme, setNewTheme ] = React.useState({})
  const [ pattern, setPattern ] = React.useState({})
  // console.log('test', pattern,newTheme)
  const combinedTheme = merge(cloneDeep(theme),  cloneDeep(themes[newTheme?.settings?.theme?.theme || 'default']), cloneDeep(newTheme))

  // console.log('selected theme', newTheme?.settings?.theme?.theme)
  // console.log('combined theme', combinedTheme?.topnav?.topnavWrapper)

  const PatternFormat = {
    app: format.app,
    type: "pattern",
    attributes: [
      { key: "theme",
        type: "text",
      }
    ]
  }

  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,false)
    return items
  }, [dataItems])

  React.useEffect(() => {
      const loadData = async () => {
        const {app, type} = format
        console.log('format type', type)
        let data = await apiLoad({
            children: [{
                action: "list",
                path: "/*",
                filter: {
                  options: JSON.stringify({ filter: { "data->>'doc_type'": [format.type] }}),
                }
            }],
            format: PatternFormat
        })
        console.log('got data', data)
        setNewTheme( cloneDeep(data?.[0]?.theme || {}))
        setPattern( cloneDeep( {theme: {},...data?.[0]} || {}))
      }
      loadData()
  },[])

  function saveTheme () {
    //console.log('saving theme')
    let update =  apiUpdate({data:{id: pattern.id, theme: newTheme}, config:{format:PatternFormat}})
    setPattern({...pattern, theme: newTheme})
    //console.log('updated')
  }

  return (
      <div className='flex h-full'>
        <div className='flex-1 h-full flex p-4'>
          <Frame
            className='flex-1 border'
            head={
              <>
                <link type="text/css" rel="stylesheet" href="/css/build.css" />
                <link href="/fonts/font-awesome-6/css/all.min.css" rel="stylesheet" />
               
              </>
            }
          >    
            <Layout navItems={menuItems} secondNav={newTheme?.navOptions?.secondaryNav?.navItems || []} theme={combinedTheme}>
              <div className={`${combinedTheme?.page?.wrapper2}`}>
                <div className={`${combinedTheme?.page?.wrapper3} `}>
                  Placeholder Content
                </div>
              </div>
            </Layout>
          </Frame>
        </div>
        <SideNavContainer custom='top-12 h-full'>
          <div className='border-l h-full'>
            <div className='px-1 py-2 w-full flex justify-between items-center'>
              <div>Design Options</div>
              <div>
                <button  
                  onClick={saveTheme}
                  disabled={isEqual(pattern.theme, newTheme)} 
                  className='bg-blue-500 disabled:bg-slate-300  disabled:border-slate-400  rounded px-3 border border-blue-400 shadow  py-1 text-white cursor-pointer mx-2'
                >
                  Save
                </button>
              </div> 
            </div>
            <div className='border-t'>
              {Object.keys(themeOptions).map(sectionKey => {
                return (
                  <div key={sectionKey}>
                    {sectionKey}
                    {Object.keys(themeOptions[sectionKey]).map(navKey => (
                      <Disclosure as="div" key={navKey} className="border-b" defaultOpen={themeOptions[sectionKey][navKey].defaultOpen}>
                        {({ open }) => (
                        <>
                            <DisclosureButton className={`group flex w-full items-center justify-between p-1 `}>
                              <span className="text-xs/6 font-bold text-slate-700 group-data-[hover]:text-slate-700/80">
                                {themeOptions[sectionKey][navKey].label}
                              </span>
                              <span >{ open ? <ArrowUp className='text-slate-400 h-6 w-6 mr-2'/> : <ArrowDown className='text-slate-400 h-6 w-6 mr-2' /> }</span>
                            </DisclosureButton>
                            <DisclosurePanel className="text-xs/5 text-slate-700/50 py-1 px-2">
                              {
                                Object.keys(themeOptions[sectionKey][navKey].controls).map(controlKey => {
                                  const Control = controls[themeOptions[sectionKey][navKey].controls[controlKey].type || 'select']
                                  return (
                                    <div key={`${sectionKey}_${navKey}_${controlKey}`}>
                                      <Control
                                        theme={theme}
                                        newTheme={newTheme}
                                        setNewTheme={setNewTheme}
                                        themeOptions={themeOptions}
                                        sectionKey={sectionKey}
                                        navKey={navKey}
                                        controlKey={controlKey}
                                      />    
                                    </div>
                                  )
                                })
                              }
                            </DisclosurePanel>
                          </>
                        )}
                        </Disclosure>)
                      )}
                  </div>
                )})}
              </div>
              <div>
                <pre className='text-xs'>
                  {JSON.stringify(newTheme, null , 3)}
                </pre>
              </div>
            </div>
          </SideNavContainer>
        </div>
  )   
}



export default DesignEditor

