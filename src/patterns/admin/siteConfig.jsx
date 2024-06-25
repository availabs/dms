import React from 'react'
import cloneDeep from 'lodash/cloneDeep'

import PatternList from "./components/patternList";
import SiteEdit from "./pages/siteEdit"
import Layout from "./pages/layout"

import siteFormat from "./admin.format.js"

export const updateRegisteredFormats = (registerFormats, app) => {
  if(Array.isArray(registerFormats)){
    registerFormats = registerFormats.map(rFormat => {
      rFormat.app = app;
      rFormat.registerFormats = updateRegisteredFormats(rFormat.registerFormats, app);
      rFormat.attributes = updateAttributes(rFormat.attributes, app);
      return rFormat;
    })
  }
  return registerFormats;
}

export const updateAttributes = (attributes, app) => {
  if(Array.isArray(attributes)){
    attributes = attributes.map(attr => {
      attr.format = attr.format ? `${app}+${attr.format.split('+')[1]}`: undefined;
      return updateRegisteredFormats(attr, app);
    })
    console.log('attr', attributes)
  }
  return attributes;
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
  format.registerFormats = updateRegisteredFormats(format.registerFormats, app) // update app for all the children formats. this works, but dms stops providing attributes to patternList
  format.attributes = updateAttributes(format.attributes, app) // update app for all the children formats. this works, but dms stops providing attributes to patternList
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