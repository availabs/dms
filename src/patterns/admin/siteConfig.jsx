import React from 'react'
import { cloneDeep } from "lodash-es"

import PatternList from "./components/patternList";
import SiteEdit from "./pages/siteEdit"
import ThemeList from "./pages/themes"
import ComponentList from "./pages/components"

import adminFormat from "./admin.format.js"
// import defaultTheme from './theme/theme'
// import Layout from './ui/avail-layout'

import { Link, useLocation } from 'react-router'

export const AdminContext = React.createContext(undefined);
const defaultUser = { email: "user", authLevel: 5, authed: true, fake: true}

import UI from "../../ui"
import {ThemeContext} from '../../ui/useTheme'
import defaultTheme from '../../ui/defaultTheme'


const adminConfig = ({
  app = "default-app",
  type = "default-page",
  API_HOST = 'https://graph.availabs.org',
  baseUrl = '/',
  theme = defaultTheme,
}) => {
  const format = cloneDeep(adminFormat)
  format.app = app
  format.type = type
  baseUrl = baseUrl === '/' ? '' : baseUrl

  //console.log('defaultTheme', theme)
  theme = cloneDeep(theme)
  theme.navOptions = theme?.admin?.navOptions || theme?.navOptions

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
      name: 'Themes',
      path: `${baseUrl}/themes`
    },
    {
      name: 'Team',
      path:`${baseUrl}/team`
    }
  ]
  /*
  authlink = patterns.filter[].baseirl

  menuItems = [
    ...menuItems
    ...authMenuItmes
  ]*/
  // ----------------------
  // update app for all the children formats
  format.registerFormats = updateRegisteredFormats(format.registerFormats, app)
  format.attributes = updateAttributes(format.attributes, app)
  // ----------------------
  return {
    app,
    type,
    format: format,
    baseUrl,
    errorElement:  (props) => {
      const {Layout} = UI;
      return (
          <AdminContext.Provider value={{baseUrl, user: props.user || defaultUser, app, type, API_HOST, UI}}>
            <ThemeContext.Provider value={{theme}}>
              <Layout navItems={menuItems}>
                <div className={theme?.admin?.page?.pageWrapper}>
                  <div className={theme?.admin?.page?.pageWrapper2}>
                    <div className={'mx-auto max-w-fit pt-[120px] text-lg'}>
                      Unable to complete your request at the moment. Please try again later.
                    </div>
                  </div>
                </div>
              </Layout>
            </ThemeContext.Provider>
          </AdminContext.Provider>
      )
    },
    children: [
      {
        //todo move theme edit page here
        type: (props) => {
          const {Layout} = UI;
          const location = useLocation()
          console.log('admin wrapper', props.dataItems)
          return (
            <AdminContext.Provider value={{baseUrl, user: props.user || defaultUser, app, type, API_HOST, UI}}>
              <ThemeContext.Provider value={{theme}}>
                <Layout navItems={menuItems}>
                  <div className={theme?.admin?.page?.pageWrapper}>
                    <div className={theme?.admin?.page?.pageWrapper2}>
                      {props.children}
                    </div>
                  </div>
                </Layout>
              </ThemeContext.Provider>
            </AdminContext.Provider>
          )
        },
        action: 'list',
        path: "/*",
        children: [
          {
            type: (props) => <SiteEdit {...props} />,
            // authLevel: 5,
            path: "/*",

          },

          {
            type: props => <ThemeList {...props} />,
            path: "themes",
          },
          {
            type: props => <ComponentList {...props} />,
            path: "theme/:theme_id/:component?",
          },
           {
            type: (props) => (<div>Datasets</div>),
            path: "datasets",

          },
          {
            type: (props) => (<div>Team</div>),
            path: "team",

          },
            // add a themes list page. a user can send themes object to DMSSite, and new themes from that object need to bbe saved to db.
            // after theme list page, create a components list page.
        ]
      }
    ]
  }
}
const config = [adminConfig]
export default config



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