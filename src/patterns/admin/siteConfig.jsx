import React from 'react'
import Layout from "./layout/layout"
import siteFormat from "./admin.format.js"
import cloneDeep from 'lodash/cloneDeep'
import defaultTheme from '../page/layout/components/theme'
import PatternList from "./layout/patternList";
import SiteEdit from "./layout/siteEdit"

const adminConfig = ({ 
  app = "dms-site",
  type = "docs-page",
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '/',
  checkAuth = () => {},
  theme = defaultTheme
}) => {
  theme = theme || defaultTheme
  const format = cloneDeep(siteFormat)
  format.app = app
  format.type = type

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
            />
          )
        },
        action: "list",
        path: "/*",
        children: [
          {
            type: (props) => <PatternList.ViewComp {...props} />,
            action: "list",
            path: "/*",
            // todo: figure the 3rd level child not rendering bug, and then make this look pretty by using custom types.
            // children: [
            //
            // ]
          },
          {
            type: "dms-form-view",
            path: '/view/:id?',
            action: 'view',
            options: {
              accessor: 'key'
            }
          },
          {
            type: props => <SiteEdit {...props} />,
            action: 'edit',
            options: {
              accessor: 'key'
            },
            path: `${baseUrl}/edit/:id`,
          },
          {
            type: props => <SiteEdit {...props} />,
            action: 'edit',
            options: {
              accessor: 'key'
            },
            filter: {type: 'new'},
            path: '/new',
            redirect: '/edit/:id?'
          }
        ]
      }
    ]
  }
}

export default adminConfig