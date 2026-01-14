import React from 'react'
// import {useLocation} from 'react-router'
import {cloneDeep, merge} from "lodash-es"

import {ThemeContext} from '../../ui/useTheme'
import {AdminContext} from "./context";
import UI from "../../ui"
import defaultTheme from '../../ui/defaultTheme'

import ErrorPage from './components/errorPage.jsx'
import DefaultMenu from "./components/menu";

import adminFormat, {pattern, themeFormat} from "./admin.format.js"

import SiteEdit from "./pages/editSite"
import ThemeList from "./pages/themes/list"
import ThemeEdit from "./pages/themes/editTheme"
import PatternEditor from "./pages/patternEditor";
//import ThemeManager from './pages/themeManager/index.jsx'

const SectionGroup = ({children, maxWidth='max-w-7xl', padding='p-4', ...props}) => (
  <div className={`h-full flex flex-1 p-1.5 `}>
    <div className={`flex flex-1 w-full flex-col shadow-md bg-white rounded-lg relative text-md font-light leading-7 ${padding} h-full min-h-[calc(100vh_-_102px)]`}>
      <div className={`h-full flex flex-col w-full ${maxWidth}`}>
        {children}
      </div>
    </div>
  </div>
)




const adminConfig = ({
  app = "default-app",
  type = "default-page",
  API_HOST = 'https://graph.availabs.org',
  baseUrl = '/',
  authPath = '/auth',
  themes = {},
}) => {
    const format = cloneDeep(adminFormat)
    format.app = app
    format.type = type
    baseUrl = baseUrl === '/' ? '' : baseUrl

    //console.log('defaultTheme', theme)
    let theme = merge(
        cloneDeep(defaultTheme),
        {
          "layout": {
            "options": {
              "sideNav": {
                "size": "compact",
                "nav": "main",
                "topMenu": [{"type": "Logo"}],
                "bottomMenu": [{"type": "UserMenu" }]
              }
            }
          }
        }
    );

    //console.log('admin siteconfig theme', theme)
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
        children: [
            {
                type: (props) => {
                    const {user, apiUpdate} = props
                    const {Layout} = UI;
                    const menuItems = getMenuItems(baseUrl, authPath, props.user)
                    return (
                        <AdminContext.Provider value={{ baseUrl, authPath, user, apiUpdate, app, type,  API_HOST, UI}}>
                            <ThemeContext.Provider value={{theme, themes, UI}}>
                              <Layout navItems={menuItems} Menu={() => <>{rightMenu}</>}>
                                  {props.children}
                              </Layout>
                            </ThemeContext.Provider>
                        </AdminContext.Provider>
                    )
                },
                action: 'list',
                path: "/*",
                children: [
                    {
                      type: (props) => (
                        <SectionGroup>
                          <SiteEdit {...props} />
                        </SectionGroup>
                      ),
                      path: "",
                      action: "edit"
                    },
                    {
                      type: props => <SectionGroup><ThemeList {...props} /></SectionGroup>,
                      path: "themes",
                    },
                    {
                        type: props => <SectionGroup maxWidth='w-full' padding='p-0'><ThemeEdit {...props} /></SectionGroup>,
                        path: "theme/:theme_id/:component?",
                        action: "edit"
                    },
                    // add a themes list page. a user can send themes object to DMSSite, and new themes from that object need to bbe saved to db.
                    // after theme list page, create a components list page.
                ]
            }
        ],
        errorElement: (props) => {
            return <ThemeContext.Provider value={{theme, UI}}><ErrorPage /></ThemeContext.Provider>
        }
    }
}

const patternConfig = ({
  app = "default-app",
  type = "default-page",
  API_HOST = 'https://graph.availabs.org',
  baseUrl = '/',
  authPath = '/auth',
  themes = {},
  rightMenu = <DefaultMenu/>,
}) => {
    const format = cloneDeep(pattern)
    format.app = app
    format.type = 'pattern'
    const parentBaseUrl = baseUrl === '/' ? '' : baseUrl;

    baseUrl = `${parentBaseUrl}/manage_pattern`

    //console.log('admin PatternConfig', themes)
    let theme = merge(
        cloneDeep(defaultTheme),
        {
          "layout": {
            "options": {
              "sideNav": {
                "size": "compact",
                "nav": "main",
                "topMenu": [{"type": "Logo"}],
                "bottomMenu": [{"type": "UserMenu" }]
              }
            }
          }
        }
    );
    theme.navOptions = theme?.admin?.navOptions || theme?.navOptions
    theme.navOptions.sideNav.dropdown = 'top'
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
        children: [
            {
                type: (props) => {
                    const {Layout} = UI;
                    const {user, apiUpdate} = props
                    const menuItems = getMenuItems(parentBaseUrl, props.user)

                    return (
                        <AdminContext.Provider value={{baseUrl, parentBaseUrl,themes, authPath, user, apiUpdate, app, type, API_HOST, UI}}>
                            <ThemeContext.Provider value={{theme,themes, UI}}>
                                <Layout navItems={menuItems} Menu={() => <>{rightMenu}</>}>
                                  <SectionGroup maxWidth={ ''}>
                                    {props.children}
                                  </SectionGroup>
                                </Layout>
                            </ThemeContext.Provider>
                        </AdminContext.Provider>
                    )
                },
                action: 'list',
                path: "/*",
                children: [
                    {
                        type: PatternEditor,
                        path: ":id/:page?",
                        action: "edit"
                    },
                ]
            }
        ],
        errorElement: (props) => {
            return (
              <ThemeContext.Provider value={{theme, UI}}>
                <ErrorPage />
              </ThemeContext.Provider>
            )
        }
    }
}


export default [adminConfig, patternConfig]


export const updateRegisteredFormats = (registerFormats, app) => {
    if (Array.isArray(registerFormats)) {
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
    if (Array.isArray(attributes)) {
        attributes = attributes.map(attr => {
            attr.format = attr.format ? `${app}+${attr.format.split('+')[1]}` : undefined;
            return updateRegisteredFormats(attr, app);
        })
        //console.log('attr', attributes)
    }
    return attributes;
}

const getMenuItems = (baseUrl, authPath, user) => {
  let menuItems = [
      {
          name: 'Sites',
          path: `${baseUrl}`
      },
      // {
      //     name: 'Datasets',
      //     path: `${baseUrl}/datasets`
      // },
      {
          name: 'Themes',
          path: `${baseUrl}/themes`
      },
  ]

  if (user?.authed) {
      menuItems.push({
          name: 'Auth',
          subMenus: [
              {
                  name: 'Users',
                  path: `${authPath}/manage/users`
              },
              {
                  name: 'Groups',
                  path: `${authPath}/manage/groups`
              }
          ]
      })
  }
  return menuItems
}
