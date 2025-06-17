import React from 'react'
import { cloneDeep } from "lodash-es"

import PatternList from "./components/patternList";
import SiteEdit from "./pages/siteEdit"


import adminFormat from "./admin.format.js"
// import defaultTheme from './theme/theme'
// import Layout from './ui/avail-layout'

import { Link } from 'react-router'

export const AdminContext = React.createContext(undefined);
const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}

import UI from "../../ui"
import {ThemeContext} from '../../ui/useTheme'
import defaultTheme from '../../ui/defaultTheme'


const adminConfig = ({
  app = "default-app",
  type = "default-page",
  sideNav = null,
  logo = null,
  rightMenu = <div />,
  API_HOST = 'https://graph.availabs.org',
  baseUrl = '/',
  checkAuth = () => {},
  theme = defaultTheme,
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
      name: 'Sites',
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
        //todo move theme edit page here
        type: (props) => {
          const {Layout} = UI;
          return (
            <AdminContext.Provider value={{baseUrl, user: props.user || defaultUser, app, type, API_HOST, parent, UI}}>
              <ThemeContext.Provider value={{theme}}>
                <Layout navItems={menuItems}>
                  {props.children}
                </Layout>
              </ThemeContext.Provider>
            </AdminContext.Provider>
          )
        },
        action: "list",
        path: "/*",
        children: [
          {
            type: (props) => <SiteEdit {...props} />,
            // authLevel: 5,
            action: "edit",
            path: "/*",

          },

          {
            type: (props) => {
              console.log('props', props);
              return <div>Themes</div>
            },
            action: "edit",
            path: "themes",

          },

          {
            type: (props) => (<div>Team</div>),
            action: "view",
            path: "team",

          },
            // add a themes list page. a user can send themes object to DMSSite, and new themes from that object need to bbe saved to db.
            // after theme list page, create a components list page.
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