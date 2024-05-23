import React from 'react'
// pages
import Layout from "./layout/layout.jsx"
import PageView from "./layout/view.jsx"
import PageEdit from "./layout/edit.jsx"
import cmsFormat from "./page.format.js"
import cloneDeep from 'lodash/cloneDeep'
import defaultTheme from './theme/theme'
import {Search} from "./search";

const siteConfig = ({ 
  app = "dms-site",
  type = "docs-page",
  useFalcor,
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '',
  checkAuth = () => {},
  theme = defaultTheme,
  pgEnv
}) => {
  theme = {...defaultTheme, ...theme}
  
  const format = cloneDeep(cmsFormat)
  format.app = app
  format.type = type

  const rightMenuWithSearch = (
      <div className={'flex flex-col md:flex-row'}>
        <Search app={app} type={type}/>
        {rightMenu}
      </div>
  )

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