import React from 'react'
// pages
import Layout from "./layout/layout.jsx"
import PageView from "./layout/view.jsx"
import PageEdit from "./layout/edit.jsx"

// templates
import TemplateList from './layout/template/list'
import TemplatePages from './layout/template/pages'
import TemplateEdit from './layout/template/edit'

import cmsFormat from "./page.format.js"
import cloneDeep from 'lodash/cloneDeep'
import defaultTheme from './theme/theme'
import {Search} from "./search";
import Selector from "./selector"
import { registerDataType } from "../../index"

// sideNav = {size: 'miniPad'}

export const CMSContext = React.createContext(undefined);

const siteConfig = ({ 
  app = "dms-site",
  type = "docs-page",
  useFalcor,
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '',
  checkAuth = () => {},
  authLevel = -1,
  theme = defaultTheme,
  pgEnv
}) => {
  theme = {...defaultTheme, ...theme}
  // console.log('pattern siteConfig', app, type, pgEnv)
  
  const format = cloneDeep(cmsFormat)
  format.app = app
  format.type = type

  const rightMenuWithSearch = (
      <div className={'flex flex-col md:flex-row'}>
        {/*<Search app={app} type={type}/>*/}
        {rightMenu}
      </div>
  )

  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    format: format,
    baseUrl, 
    check: ({user}, activeConfig, navigate) =>  {
      
      const getReqAuth = (configs) => {
        return configs.reduce((out,config) => {
          let authLevel = config.authLevel || -1
          if(config.children) {
            authLevel = Math.max(authLevel, getReqAuth(config.children))
          }
          return Math.max(out, authLevel)
        },-1)
      } 
      let requiredAuth = getReqAuth(activeConfig)
      console.log('checking', user, activeConfig)
      checkAuth({user, authLevel:requiredAuth}, navigate)
    },
    children: [
      { 
        type: (props) => {
          return (
            <Layout 
              {...props}
              baseUrl={baseUrl}
              theme={theme}
              useFalcor={useFalcor}
              pgEnv={pgEnv}
            />
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
            type: (props) => <TemplateList
              logo={logo}
              rightMenu={rightMenuWithSearch}
              {...props}
            />,
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
              logo={logo}
              rightMenu={rightMenuWithSearch}
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
                logo={logo}
                rightMenu={rightMenuWithSearch}
                {...props}
              />,
              action: "edit",
              path: "templates/pages/:id"
          },
          { 
            type: (props) => <PageView 
              {...props} 
              logo={logo} 
              rightMenu={rightMenuWithSearch}
            />,
            filter: {
              attributes:['title', 'index', 'url_slug', 'parent', 'published', 'hide_in_nav' ,'sections','sidebar','header','footer', 'full_width']
            },
            path: "/*",
            action: "view"
          },
        ]
      },
      { 
        type: (props) => (
          <Layout 
            {...props} 
            edit={true} 
            baseUrl={baseUrl}
            theme={theme}
            useFalcor={useFalcor}
            pgEnv={pgEnv}
          />
        ),
        action: "list",
        path: "/edit/*",
        authLevel: 5,
        filter: {
          options: JSON.stringify({
            filter: {
              "data->>'hide_in_nav'": ['null'],
            }
          }),
          attributes:['title', 'index', 'url_slug', 'parent', 'published', 'hide_in_nav' ]
        },
        children: [
          { 
            type: (props) => <PageEdit 
              {...props}
              logo={logo}
              rightMenu={rightMenuWithSearch}
            />,
            action: "edit",
            path: "/edit/*"
          },
        ]
      }
    ]
  }
}

export default siteConfig