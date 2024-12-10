import React from 'react'
import { merge } from "lodash-es"
import { cloneDeep } from "lodash-es"

// pages
import PageView from "./pages/view"
import PageEdit from "./pages/edit"

// templates
import TemplateList from './pages/manager/template/list'
import TemplatePages from './pages/manager/template/pages'
import TemplateEdit from './pages/manager/template/edit'

// Manager
import ManageLayout from './pages/manager/layout'
import Dashboard from './pages/manager'
import PageManager from './pages/manager/pages'
import DesignEditor from './pages/manager/design'

import cmsFormat from "./page.format.js"
import defaultTheme from './ui/theme'

import { useFalcor } from "@availabs/avl-falcor"


import { Link } from 'react-router-dom'
import { SearchPage } from "./components/search/SearchPage";
import DefaultMenu from './components/menu'

// sideNav = {size: 'miniPad'}

export const CMSContext = React.createContext(undefined);

export const siteConfig = ({
  app = "dms-site",
  type = "docs-page",
  siteType,
  rightMenu = <DefaultMenu />,
  baseUrl = '/',
  logo, // deprecated
  authLevel = -1,
  themes = { default: {} },
  pattern,
  site,
  pgEnv,
  API_HOST
}) => {
  //console.log('hola', pattern?.theme)
  let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme?.settings?.theme?.theme] || themes.default), pattern?.theme || {})

  console.log('pageConfig', theme, themes[pattern?.theme?.settings?.theme?.theme], pattern?.theme )
  // baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
  baseUrl = baseUrl === '/' ? '' : baseUrl
  const defaultLogo = (
    <Link to={`${baseUrl || '/'}`} className='h-12 flex px-4 items-center'>
      <div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' />
    </Link>
  )

  if(!theme?.navOptions?.logo) {
    theme.navOptions = {...(theme?.navOptions || {}), logo: (logo ? logo : defaultLogo)}
  }
  

  // console.log('testing', theme.navOptions)

  const format = cloneDeep(cmsFormat)
  format.app = app
  format.type = type
  updateRegisteredFormats(format.registerFormats, app, type)
  updateAttributes(format.attributes, app, type)
  //console.log('foramat after update', app, type, format)


  // console.log('pgEnv siteConfig', app, type, pgEnv)
  // for instances without auth turned on, default user can edit
  // should move this to dmsFactory default authWrapper
  const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}

  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    siteType,
    format: format,
    baseUrl,
    API_HOST,
    children: [
      {
        type: ({children, user=defaultUser, ...props}) => {
          const { falcor, falcorCache } = useFalcor();
          // console.log('hola', user, defaultUser, user || defaultUser)
          return (
            <CMSContext.Provider value={{baseUrl, user, theme, falcor, falcorCache, pgEnv, app, type, Menu: () => <>{rightMenu}</> }} >
              {children}
            </CMSContext.Provider>
          )
        },
        authLevel,
        action: "list",
        path: "/*",
        filter: {
          options: JSON.stringify({
            // filter: {
            //   "data->>'hide_in_nav'": ['null']
            // }
          }),
          attributes:['title', 'index', 'url_slug', 'parent','published', 'hide_in_nav']
        },
        children: [
          {
            type: (props) => (
              <PageEdit
                {...props}
                siteType={siteType}
              />
            ),
            path: "edit/*",
            action: "edit"
          },
          {
            type: (props) => (
              <PageView
                {...props}
                siteType={siteType}
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
            path: "search/*",
            action: "list"
          },
          
          // {
          //   type: TemplatePreview,
          //   action: "edit",
          //   path: "/view/:id"
          // },
          
          {
            type: ManageLayout,
            path: "manage/*",
            //authLevel: 5,
            action: "list",
            filter: {
              options: JSON.stringify({
                filter: {
                  "data->>'hide_in_nav'": ['null']
                }
              }),
              attributes:['title', 'index', 'url_slug', 'parent','published', 'has_changes', 'hide_in_nav']
            },
            children: [
              { 
                type: Dashboard,
                path: "manage/",
                action: "edit"
              },
              { 
                type: (props) => <DesignEditor themes={themes} {...props} />,
                path: "manage/design",
                action: "edit"
              },
              { 
                type: PageManager,
                path: "manage/pages",
                action: "edit"
              },
              {
                type: TemplateList,
                action: "list",
                path: "manage/templates/*",
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
                type: TemplateEdit,
                action: "edit",
                path: "manage/templates/edit/:id"
              },
              {
                type: TemplatePages,
                action: "edit",
                path: "manage/templates/pages/:id"
              },
            ]
          },
        ]
      },

    ]
  }
}

export default [siteConfig]

export const updateRegisteredFormats = (registerFormats, app, type) => {
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

export const updateAttributes = (attributes, app, type) => {
  if(Array.isArray(attributes)){
    attributes = attributes.map(attr => {
      attr.format = attr.format ? `${app}+${type}|${attr.format.split('+')[1]}`: undefined;
      return updateRegisteredFormats(attr, app, type);
    })
    //console.log('attr', attributes)
  }
  return attributes;
}