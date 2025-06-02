import React from 'react'
import { useFalcor } from "../../../../avl-falcor"
import { merge,cloneDeep } from "lodash-es"

import cmsFormat from "./page.format.js"
//import defaultTheme from './ui/theme/defaultTheme.json'

import PageView from "./pages/view_small.jsx"

import UI from '../../ui'
import { ThemeContext } from '../../ui/useTheme.js'
import { CMSContext } from './context'
import { registerDataType } from '../../data-types'

import Selector from './ui/dataComponents/selector'

import defaultTheme from '../../ui/defaultTheme.json'


const pagesConfig = ({
  app = "dms-site",
  type = "docs-page",
  siteType,
  //rightMenu = <DefaultMenu />,
  baseUrl = '/',
  damaBaseUrl,
  logo, // deprecated
  authLevel = -1,
  themes = { default: {} },
  pattern,
  site,
  pgEnv,
  API_HOST
}) => {
  baseUrl = baseUrl === '/' ? '' : baseUrl
  registerDataType("selector", Selector)
  // console.log('pageconfig', UI)
  
  let theme = merge(cloneDeep(defaultTheme || {}), cloneDeep(themes[pattern?.theme?.settings?.theme?.theme] || themes.default), cloneDeep(pattern?.theme) || {})
  // console.log('theme test',theme)
  const format = {...cmsFormat} 
  format.app = app
  format.type = type
  updateRegisteredFormats(format.registerFormats, app, type)
  updateAttributes(format.attributes, app, type)

  // console.log('pgEnv siteConfig', app, type, pgEnv)
  // for instances without auth turned on, default user can edit
  // should move this to dmsFactory default authWrapper
  const defaultUser = { email: "user", authLevel: 10, authed: true, fake: true}

  //console.log('siteConfig', PageView)
  return {
    siteType,
    format,
    baseUrl,
    API_HOST,
    children: [
      {
        type: ({children, user=defaultUser, ...props}) => {
          const uf = useFalcor() || {}
          const {falcor = {}, falcorCache = {}} = uf;
          // console.log('hola', user, defaultUser, user || defaultUser)
          return (
            <CMSContext.Provider value={{UI, API_HOST, baseUrl, damaBaseUrl, user, theme, falcor, falcorCache, pgEnv, app, type, siteType, Menu: () => <>{rightMenu}</> }} >
              <ThemeContext.Provider value={defaultTheme}>
                {children}
              </ThemeContext.Provider>
            </CMSContext.Provider>
          )
        }, 
        
        
        authLevel,
        action: "list",
        path: "/*",
        filter: {
          options: JSON.stringify({
            filter: {
              "data->>'template_id'": ['null'],
            }
          }),
          attributes:['title', 'index', 'url_slug', 'parent','published', 'description','icon','navOptions','hide_in_nav']
        },
        children: [

          {
            //type: (props) => <div><pre>{JSON.stringify(props.dataItems, null,3)}</pre></div>,
            type: (props) => (
              <PageView
                {...props}
              />
            ),
            filter: {
              attributes:['title', 'index', 'url_slug', 'parent', 'published', 'hide_in_nav' ,'sections','section_groups','sidebar','navOptions']
            },
            path: "/*",
            action: "view"
          },
          
        ]
      },
    ]
  }
}


// const pageConfig = 
export default [pagesConfig]  //{"foo": "bar"}

const updateRegisteredFormats = (registerFormats, app, type) => {
  if(Array.isArray(registerFormats)){
    registerFormats = registerFormats.map(rFormat => {
      rFormat.app = app;
      rFormat.type = `${type}|${rFormat.type}`
      rFormat.registerFormats = updateRegisteredFormats(rFormat.registerFormats, app, type);
      rFormat.attributes = updateAttributes(rFormat.attributes, app, type);
      return rFormat;
    })
  }
  return registerFormats;
}

const updateAttributes = (attributes, app, type) => {
  if(Array.isArray(attributes)){
    attributes = attributes.map(attr => {
      attr.format = attr.format ? `${app}+${type}|${attr.format.split('+')[1]}`: undefined;
      return updateRegisteredFormats(attr, app, type);
    })
    //console.log('attr', attributes)
  }
  return attributes;
}