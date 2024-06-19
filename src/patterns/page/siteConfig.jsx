import React from 'react'
// pages
import PageView from "./pages/view"
import PageEdit from "./pages/edit"

// templates
import TemplateList from './layout/template/list'
import TemplatePages from './layout/template/pages'
import TemplateEdit from './layout/template/edit'

// Manager
import CmsManager from './pages/manager'

import cmsFormat from "./page.format.js"
import cloneDeep from 'lodash/cloneDeep'
import defaultTheme from './theme/theme'
import Selector from "./components/selector"
import { registerDataType } from "../../index"
import { useFalcor } from "@availabs/avl-falcor"

import merge from 'lodash/merge'
import {SearchPage} from "./components/search/SearchPage";

// sideNav = {size: 'miniPad'}

export const CMSContext = React.createContext(undefined);

export const siteConfig = ({
  app = "dms-site",
  type = "docs-page",
  rightMenu = <div />,
  userFalcor=useFalcor,
  baseUrl = '',
  checkAuth = () => {},
  authLevel = -1,
  theme = defaultTheme,
  pgEnv,
    API_HOST
}) => {
  theme = merge(defaultTheme, theme)
  //baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
  console.log('baseUrl',baseUrl)

  const format = cloneDeep(cmsFormat)
  format.app = app
  format.type = type



  // for instances without auth turned on can edit
  // should move this to dmsFactory default authWrapper
  const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}
  
  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    format: format,
    baseUrl,
    API_HOST,
    // check: ({user}, activeConfig, navigate) =>  {
    //
    //   const getReqAuth = (configs) => {
    //     return configs.reduce((out,config) => {
    //       let authLevel = config.authLevel || -1
    //       if(config.children) {
    //         authLevel = Math.max(authLevel, getReqAuth(config.children))
    //       }
    //       return Math.max(out, authLevel)
    //     },-1)
    //   } 
    //   let requiredAuth = getReqAuth(activeConfig)
    //   console.log('checking', user, activeConfig)
    //   checkAuth({user, authLevel:requiredAuth}, navigate)
    // },
    children: [
      { 
        type: ({children, user=defaultUser, pgEnv, ...props}) => {
          const { falcor, falcorCache } = useFalcor();
          // console.log('hola', theme, props)
          return (
            <CMSContext.Provider value={{baseUrl, user, theme, falcor, falcorCache, pgEnv, app, type}}>
              {children}
            </CMSContext.Provider>
          )
        },
        authLevel,
        action: "list",
        path: "/*",
        filter: {
          options: JSON.stringify({
            filter: {
              "data->>'hide_in_nav'": ['null']
            }
          }),
          attributes:['title', 'index', 'url_slug', 'parent','published', 'hide_in_nav']
        },
        children: [
          { 
            type: (props) => (
              <PageEdit 
                {...props}
              />
            ),
            path: "/edit/*",
            action: "edit"
          },
          { 
            type: (props) => (
              <PageView 
                {...props} 
              />
            ),
            filter: {
              attributes:['title', 'index', 'url_slug', 'parent', 'published', 'hide_in_nav' ,'sections','sidebar','header','footer', 'full_width']
            },
            path: "/*",
            action: "view"
          },
            {
                type: (props) => <SearchPage {...props}/>,
                path: "/search/*",
                action: "list"
            },
           {
            type: (props) => (
              <CmsManager
                {...props}
              />
            ),
            path: "/manager/*",
            action: "edit"
          },
          {
            type: (props) => (
              <TemplateList
                {...props}
              />
            ),
            action: "list",
            path: "templates/*",
            lazyLoad: true,
            filter: {
              options: JSON.stringify({
                filter: {
                  "data->>'template_id'": ['-99'],
                }
              }),
              attributes:['title', 'index', 'url_slug', 'parent', 'hide_in_nav', 'template_id' ]
            }
          },
          {
            type: (props) => <TemplateEdit
              {...props}
            />,
            action: "edit",
            path: "templates/edit/:id"
          },
          // {
          //   type: TemplatePreview,
          //   action: "edit",
          //   path: "/view/:id"
          // },
          {
              type: (props) => <TemplatePages
                {...props}
              />,
              action: "edit",
              path: "templates/pages/:id"
          },
        ]
      },
      
    ]
  }
}

export default [siteConfig]