import React, {useEffect} from 'react'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import merge from 'lodash/merge'
import cloneDeep from 'lodash/cloneDeep'
import isEqual from 'lodash/isEqual'
import Frame from 'react-frame-component'
//import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";


import ManagerLayout from './layout'
import Layout from '../../ui/avail-layout'
import {dataItemsNav, detectNavLevel, getInPageNav} from '../_utils'
// import SideNav from '../../ui/nav/Side'
import { ArrowUp, ArrowDown } from '../../ui/icons'
import { SideNavContainer } from '../../ui'
import { CMSContext } from '../../siteConfig'
import { themeOptions } from '../../theme/theme'


function SelectControl ({ themeOptions, theme, newTheme, setNewTheme, navKey, controlKey }) 
{
    let control = themeOptions[navKey].controls[controlKey]         
    return (
      <div className='w-full'>
        <div className='text-xs font-medium pt-1 text-slate-400'>{control.label}</div>
        <div className='w-full'>
        <select className='p-2 bg-white w-full' value={newTheme.navOptions?.[navKey]?.[controlKey] || theme.navOptions?.[navKey]?.[controlKey]} onChange={(e) => {
          setNewTheme(merge(cloneDeep(newTheme), {navOptions: {[navKey]: {[controlKey]: e.target.value}}}))
        }}>
          {control.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        </div>
      </div>
    )
}


function MenuItemEditor({onSave, onCancel}) {
  let [newItem, setNewItem] = React.useState({
    title:'',
    icon: '',
    className: ''
  })

  return (
    <div>
      {['title', 'icon', 'className']
        .map(key => {
        return (
          <>
            <div className='text-xs font-medium pt-1 text-slate-400'>{key}</div>
            <div className='w-full'>
              <input 
                className='p-2 bg-white w-full' 
                value={newItem[key]} 
                onChange={(e) => setNewItem({...newItem, [key]: e.target.value})}
              />
            </div>
          </>
        )
      })}
      <div className='flex justify-end py-2'>
        <div className='bg-slate-300 rounded px-2 py-1 text-slate-100 cursor-pointer' onClick={onCancel} >Cancel</div>
        <div className='bg-blue-500 rounded px-2 py-1 text-white cursor-pointer ml-2' onClick={() => onSave(newItem)}>Save</div>
      </div>

    </div>
  )
}

function MenuControl ({ themeOptions, theme, newTheme, setNewTheme, navKey, controlKey })  {
    let [editIndex, setEditIndex] = React.useState(-2)

    let control = themeOptions[navKey].controls[controlKey]
    let menuItems = newTheme.navOptions?.[navKey]?.[controlKey] || []

    return (
      <div className='w-full'>
        <div className='text-xs font-medium pt-1 text-slate-400 w-full flex justify-between'>
          <div>{control.label}</div>
          <div><button className='bg-blue-500 rounded px-2 py-1 text-white cursor-pointer' onClick={() => setEditIndex(-1)}>Add Item</button></div>
          
        </div>
        <div>
        {
          menuItems.length === 0 ? 
            'No Items' : menuItems.map(d => <div>{d.title}</div>)
        }
        </div>
        <div>
          {editIndex === -1 ? 
            <MenuItemEditor 
              onCancel={(e) =>  setEditIndex(-2)}
              onSave={(newItem) => {
                setNewTheme(merge(cloneDeep(newTheme), {navOptions: {[navKey]: {[controlKey]: [...menuItems,newItem]}}}))
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

function DesignEditor ({item, dataItems, attributes, apiLoad, format, logo, rightMenu,...props}) {
 
  const { baseUrl, theme, user } = React.useContext(CMSContext) || {}
  const [ newTheme, setNewTheme ] = React.useState({})
  const [ currentTheme, setCurrentTheme ] = React.useState({})

  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,false)
    return items
  }, [dataItems])

  React.useEffect(() => {
      const loadData = async () => {
        const {app, type} = format
        let data = await apiLoad({
            children: [{
                action: "list",
                path: "/*",
                filter: {
                  options: JSON.stringify({
                    filter: {
                      "data->>'doc_type'": [format.type]
                    }
                  }),
                  
                }
            }],
            format: {
              app: format.app,
              type: "pattern",
              attributes: [
                { key: "theme",
                  type: "text",
          
                }
              ]
            }
        })  
        setNewTheme( cloneDeep(data?.[0]?.theme || {}))
        setCurrentTheme( cloneDeep(data?.[0]?.theme || {}))

      }
      loadData()
  },[])

  

  return (
      <div className='flex h-full'>
        <div className='flex-1 h-full flex p-4'>
          <Frame
            className='flex-1 border'
            head={<link type="text/css" rel="stylesheet" href="/css/build.css" />}
          >    
            <Layout navItems={menuItems} theme={merge(cloneDeep(theme), cloneDeep(newTheme))}>
              <div className={`${theme?.page?.wrapper2}`}>
                <div className={`${theme?.page?.wrapper3_inner} `}>
                  Placeholder Content
                </div>
              </div>
            </Layout>
          </Frame>
        </div>
        <SideNavContainer custom='top-12 h-full'>
          <div className='border-l h-full'>
            <div className='px-1 py-2 w-full flex justify-between'>
              <div>Design Options</div>
              <div>{isEqual(currentTheme, newTheme) ? '' : <button className='bg-blue-500 rounded px-2 py-1 text-white cursor-pointer' onClick={() => {}}>Save</button>}</div> 
            </div>
            <div className='border-t'>
              {Object.keys(themeOptions).map(navKey => (
                <Disclosure as="div" className="border-b" defaultOpen={themeOptions[navKey].defaultOpen}>
                  {({ open }) => (
                  <>
                      <DisclosureButton className={`group flex w-full items-center justify-between p-1 `}>
                        <span className="text-xs/6 font-bold text-slate-700 group-data-[hover]:text-slate-700/80">
                          {themeOptions[navKey].label}
                        </span>
                        <span >{ open ? <ArrowUp className='text-slate-400 h-6 w-6 mr-2'/> : <ArrowDown className='text-slate-400 h-6 w-6 mr-2' /> }</span>
                      </DisclosureButton>
                      <DisclosurePanel className="text-xs/5 text-slate-700/50 py-1 px-2">
                        {
                          Object.keys(themeOptions[navKey].controls).map(controlKey => {
                            const Control = controls[themeOptions[navKey].controls[controlKey].type || 'select']
                            return (
                              <div key={`${navKey}_${controlKey}`}>
                                <Control
                                  theme={theme}
                                  newTheme={newTheme}
                                  setNewTheme={setNewTheme}
                                  themeOptions={themeOptions}
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

