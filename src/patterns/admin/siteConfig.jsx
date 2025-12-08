import React from 'react'
import {useLocation} from 'react-router'
import {cloneDeep, merge} from "lodash-es"
import SiteEdit from "./pages/siteEdit"
import ThemeList from "./pages/themes"
import ComponentList from "./pages/components"
import adminFormat, {pattern} from "./admin.format.js"
import UI from "../../ui"
import {ThemeContext} from '../../ui/useTheme'
import defaultTheme from '../../ui/defaultTheme'
import DefaultMenu from "./components/menu";
import {AdminContext} from "./context";
import PatternEditor from "./pages/patternEditor";

const adminConfig = ({
  app = "default-app",
  type = "default-page",
  API_HOST = 'https://graph.availabs.org',
  baseUrl = '/',
  authPath = '/dms_auth',
  themes = {},
}) => {
    const format = cloneDeep(adminFormat)
    format.app = app
    format.type = type
    baseUrl = baseUrl === '/' ? '' : baseUrl

    //console.log('defaultTheme', theme)
    let theme = merge(
        cloneDeep(defaultTheme),
        cloneDeep(themes.mny_admin)
    );

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
                        <AdminContext.Provider value={{ baseUrl, authPath, user, apiUpdate, app, type, API_HOST, UI}}>
                            <ThemeContext.Provider value={{theme, UI}}>
                                <div className={theme?.page?.container}>
                                    <Layout navItems={menuItems} Menu={() => <>{rightMenu}</>}>
                                        <div className={`${theme?.sectionGroup?.content?.wrapper1}`}>
                                            <div className={theme?.sectionGroup?.content?.wrapper2}>
                                                <div className={`${theme?.sectionGroup?.content?.wrapper3}`}>
                                                    {props.children}
                                                </div>
                                            </div>
                                        </div>
                                    </Layout>
                                </div>
                            </ThemeContext.Provider>
                        </AdminContext.Provider>
                    )
                },
                action: 'list',
                path: "/*",
                children: [
                    {
                        type: (props) => <SiteEdit {...props} />,
                        path: "",
                        action: "edit"

                    },
                    {
                        type: props => <ThemeList {...props} />,
                        path: "themes",
                        action: "edit"
                    },
                    {
                        type: props => <ComponentList {...props} />,
                        path: "theme/:theme_id/:component?",
                        action: "edit"
                    },
                    {
                        type: (props) => (<div>Datasets</div>),
                        path: "datasets",
                        action: "edit"

                    },
                    {
                        type: (props) => (<div>Team</div>),
                        path: "team",
                        action: "edit"

                    },
                    // add a themes list page. a user can send themes object to DMSSite, and new themes from that object need to bbe saved to db.
                    // after theme list page, create a components list page.
                ]
            }
        ],
        errorElement: (props) => {
            const {Layout} = UI;
            return (
                <AdminContext.Provider value={{baseUrl, user: props.user || {}, app, type, API_HOST, UI}}>
                    <ThemeContext.Provider value={{theme, UI}}>
                        <Layout navItems={[]}>
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
        }
    }
}

const patternConfig = ({
  app = "default-app",
  type = "default-page",
  API_HOST = 'https://graph.availabs.org',

  baseUrl = '/',
  authPath = '/dms_auth',
  themes = {},
  rightMenu = <DefaultMenu/>,
}) => {
    const format = cloneDeep(pattern)
    format.app = app
    format.type = 'pattern'
    const parentBaseUrl = baseUrl === '/' ? '' : baseUrl;

    baseUrl = `${parentBaseUrl}/manage_pattern`

    //console.log('defaultTheme', theme)
    let theme = merge(
        cloneDeep(defaultTheme),
        cloneDeep(themes.mny_admin)
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
                        <AdminContext.Provider value={{baseUrl, parentBaseUrl, authPath, user, apiUpdate, app, type, API_HOST, UI}}>
                            <ThemeContext.Provider value={{theme, UI}}>
                                <div className={theme?.page?.container}>
                                    <Layout navItems={menuItems} Menu={() => <>{rightMenu}</>}>
                                        <div className={`${theme?.sectionGroup?.content?.wrapper1}`}>
                                            <div className={theme?.sectionGroup?.content?.wrapper2}>
                                                <div className={`${theme?.sectionGroup?.content?.wrapper3}`}>
                                                    {props.children}
                                                </div>
                                            </div>
                                        </div>
                                    </Layout>
                                </div>
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
            const {Layout} = UI;
            return (
                <AdminContext.Provider value={{baseUrl, user: props.user || {}, app, type, API_HOST, UI}}>
                    <ThemeContext.Provider value={{theme, UI}}>
                        <Layout navItems={[]}>
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
          path: `${baseUrl}/team`
      }
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
