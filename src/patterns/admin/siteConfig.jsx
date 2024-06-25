import React from 'react'
import cloneDeep from 'lodash/cloneDeep'

import PatternList from "./components/patternList";
import SiteEdit from "./pages/siteEdit"
import Layout from "./pages/layout"

import siteFormat from "./admin.format.js"

const updateRegisteredFormats = (registerFormats, app) => {
  if(Array.isArray(registerFormats)){
    registerFormats = registerFormats.map(rFormat => {
      rFormat.app = app;
      return updateRegisteredFormats(rFormat, app);
    })
  }
  return registerFormats;
}

const adminConfig = ({ 
  app = "default-app",
  type = "default-page",
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '/',
  checkAuth = () => {}
}) => {
  const format = cloneDeep(siteFormat)
  format.app = app
  format.type = type
  // format.registerFormats = updateRegisteredFormats(format.registerFormats, app) // update app for all the children formats. this works, but dms stops providing attributes to patternList
  // console.log('????????????///', format)
  return {
    app,
    type,
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