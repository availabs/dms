import React from 'react'
import cloneDeep from 'lodash/cloneDeep'

import PatternList from "./components/patternList";
import SiteEdit from "./pages/siteEdit"
import Layout from "./pages/layout"

import siteFormat from "./admin.format.js"

const adminConfig = ({ 
  app = "dms-site",
  type = "docs-page",
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '/',
  checkAuth = () => {}
}) => {
  const format = cloneDeep(siteFormat)
  format.app = app
  format.type = type

  return {
    format: format,
    baseUrl,
    children: [
      { 
        type: (props) => {
          return (
            <Layout 
              {...props}
              baseUrl={baseUrl}
            />
          )
        },
        action: "list",
        path: "/*",
        children: [
          {
            type: (props) => <SiteEdit {...props} />,
            action: "edit",
            path: "/*",
          
          }
        ]
      }
    ]
  }
}

export default adminConfig