import React from 'react'
import { cloneDeep } from "lodash-es"

import PatternList from "./components/patternList";
import SiteEdit from "./pages/siteEdit"


import adminFormat from "./admin.format.js"
import defaultTheme from './theme/theme'
import Layout from './ui/avail-layout'

import { Link } from 'react-router-dom'

export const AdminContext = React.createContext(undefined);
const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}




const adminConfig = ({ 
  app = "default-app",
  type = "default-page",
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  baseUrl = '/',
  checkAuth = () => {},
  theme = defaultTheme
}) => {
  const format = cloneDeep(adminFormat)
  format.app = app
  format.type = type
  baseUrl = baseUrl === '/' ? '' : baseUrl

  const defaultLogo = (
    <Link to={`${baseUrl}`} className='h-12 flex px-4 items-center'>
      <div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' /><div className='p-2'>Admin</div>
    </Link>
  )

  if(!theme.navOptions.logo) {
    theme.navOptions.logo = logo ? logo : defaultLogo
  }

  const menuItems = [
    {
      name: 'Dashboard',
      path: `${baseUrl}`
    },
    {
      name: 'Datasets',
      path: `${baseUrl}/datasets`
    },
    {
      name: 'Team',
      path:`${baseUrl}team`
    }  
  ]
  
  // ----------------------
  // update app for all the children formats
  format.registerFormats = updateRegisteredFormats(format.registerFormats, app) 
  format.attributes = updateAttributes(format.attributes, app) 
  // ----------------------
  //console.log('test 123', theme)
  return {
    app,
    type,
    format: format,
    baseUrl,
    children: [
      { 
        type: (props) => {
          return (
            <AdminContext.Provider value={{baseUrl, user: props.user || defaultUser, theme, app, type, parent}}>
              <Layout navItems={menuItems} >
                {props.children}
              </Layout>
            </AdminContext.Provider>
          )
        },
        action: "list",
        path: "/*",
        children: [
          {
            type: (props) => <SiteEdit {...props} />,
            action: "edit",
            path: "/*",

          },
         
          {
            type: (props) => (<div>Team</div>),
            action: "view",
            path: "team",

          }
        ]
      }
    ]
  }
}

export default adminConfig



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
    //console.log('attr', attributes)
  }
  return attributes;
}