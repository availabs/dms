import React from 'react'
import { useLocation } from 'react-router'
import {cloneDeep, merge} from "lodash-es"
import SiteEdit from "./pages/siteEdit"
import ThemeList from "./pages/themes"
import ComponentList from "./pages/components"
import adminFormat from "./admin.format.js"
import UI from "../../ui"
import {ThemeContext} from '../../ui/useTheme'
import defaultTheme from '../../ui/defaultTheme'
import DefaultMenu from "./components/menu";

export const AdminContext = React.createContext(undefined);


const adminConfig = ({
  app = "default-app",
  type = "default-page",
  API_HOST = 'https://graph.availabs.org',
  AUTH_HOST = 'https://graph.availabs.org',
  baseUrl = '/',
  authPath = '/dms_auth',
  PROJECT_NAME,
  themes={},
  rightMenu = <DefaultMenu />,
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
    errorElement:  (props) => {
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
    },
    children: [
      {
        type: (props) => {
          const {Layout} = UI;
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

            if(props?.user?.authed) {
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
            }          return (
            <AdminContext.Provider value={{baseUrl, authPath, PROJECT_NAME, user: props.user, app, type, API_HOST, AUTH_HOST, UI}}>
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
