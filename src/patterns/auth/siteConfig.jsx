import React from "react";
import {Link} from "react-router";
import UI from "../../ui";
import {ThemeContext} from "../../ui/useTheme";
import defaultTheme from "../../ui/defaultTheme";
import DefaultMenu from "./components/menu"
import AuthLogin from "./pages/authLogin";
import AuthLogout from "./pages/authLogout";
import AuthSignup from "./pages/authSignup";
import AuthUsers from "./pages/authUsers";
import AuthGroups from "./pages/authGroups";
import AuthResetPassword from "./pages/authResetPassword";
import AuthForgotPassword from "./pages/authForgotPassword";
import {cloneDeep, merge} from "lodash-es";

export const AuthContext = React.createContext(null);

const AdminLayout = ({menuItems, children, theme, Menu}) => {
    const {Layout} = UI;
    return (
        <div className={theme?.page?.container}>
            <Layout navItems={menuItems} Menu={Menu}>
                <div className={`${theme?.sectionGroup?.content?.wrapper1}`}>
                    <div className={theme?.sectionGroup?.content?.wrapper2}>
                        <div className={`${theme?.sectionGroup?.content?.wrapper3}`}>
                            {children}
                        </div>
                    </div>
                </div>
            </Layout>
        </div>
    )
}

const AuthLayout = ({children, theme}) => {
    const {Layout} = UI;

    return (
        <div className={theme?.page?.container}>
            <Layout>
                <div className={`${theme?.sectionGroup?.content?.wrapper1}`}>
                    <div className={theme?.sectionGroup?.content?.wrapper2}>
                        <div className={`${theme?.sectionGroup?.content?.wrapper3} pt-[150px]`}>
                            {children}
                        </div>
                    </div>
                </div>
            </Layout>
        </div>
    )
}
const authConfig = ({
  app = "default-app",
  siteType = "default-page",
  API_HOST = 'https://graph.availabs.org',
  AUTH_HOST = 'https://graph.availabs.org',
  // AUTH_HOST = 'http://localhost:4444',
  PROJECT_NAME, // defaults to app
  defaultRedirectUrl='/',
  baseUrl = '/dms_auth',
  adminPath='/',
  themes = {},
  user, setUser,
}) => {

  baseUrl = baseUrl === '/' ? '' : baseUrl;

    let theme = merge(
        cloneDeep(defaultTheme),
        cloneDeep(themes.mny_auth)
    );

  // ----------------------
  return {
    app,
    baseUrl,
    format: {app, attributes: []},
    children: [
      {
        type: (props) => {
          return (
            <AuthContext.Provider value={{baseUrl,
              user, setUser,
              app, API_HOST, AUTH_HOST, PROJECT_NAME: PROJECT_NAME || app, defaultRedirectUrl, UI}}>
              <ThemeContext.Provider value={{theme}}>
                      <div className={theme?.page?.container}>
                          <AuthLayout theme={theme}>
                              {props.children}
                          </AuthLayout>
                      </div>
              </ThemeContext.Provider>
            </AuthContext.Provider>
          )
        },
        action: 'list',
        path: `/*`,
        children: [
            {
                type: (props) => {
                    const linkClass = 'w-full sm:w-1/3 px-12 py-8 bg-blue-100 hover:bg-blue-300 rounded-md'
                    return (
                        <div className={'flex flex-col gap-3'}>
                            Admin

                        </div>
                    )
                },
                path: `/*`,

            },
          {
              type: props => <AuthLogin {...props} />,
              path: "login",
          },
          {
              type: props => <AuthLogout {...props} />,
              path: "logout",
          },
          {
              type: props => <AuthSignup{...props} />,
              path: "signup",
          },
          {
              type: props => <AuthResetPassword {...props} />,
              path: "password/reset",
          },
          {
              type: props => <AuthForgotPassword {...props} />,
              path: "password/forgot",
          },
        ]
      }
    ]
  }
}

const manageAuthConfig = ({
  app = "default-app",
  siteType = "default-page",
  API_HOST = 'https://graph.availabs.org',
  AUTH_HOST = 'https://graph.availabs.org',
  // AUTH_HOST = 'http://localhost:4444',
  PROJECT_NAME, // defaults to app
  defaultRedirectUrl='/',
  baseUrl = '/dms_auth',
  adminPath='/',
  themes = {},
  rightMenu = <DefaultMenu />,
  user, setUser,
}) => {

    const menuItems = [
        {
            name: 'Sites',
            path: `${adminPath}`
        },
        {
            name: 'Datasets',
            path: `${adminPath}/datasets`
        },
        {
            name: 'Themes',
            path: `${adminPath}/themes`
        },
        {
            name: 'Team',
            path:`${adminPath}/team`
        }
    ];

    if(user?.authed) {
        menuItems.push({
            name: 'Auth',
            subMenus: [
                {
                    name: 'Users',
                    path: `${baseUrl}/manage/users`
                },
                {
                    name: 'Groups',
                    path: `${baseUrl}/manage/groups`
                }
            ]
        })
    }

    baseUrl = baseUrl === '/' ? '' : baseUrl;

    let theme = merge(
        cloneDeep(defaultTheme),
        cloneDeep(themes.mny_admin)
    );
    theme.navOptions = theme?.admin?.navOptions || theme?.navOptions
    theme.navOptions.sideNav.dropdown = 'top'

  // ----------------------
  return {
    app,
    baseUrl: `${baseUrl}/manage`,
    format: {app, attributes: []},
    children: [
      {
        type: (props) => {
          return (
            <AuthContext.Provider value={{baseUrl,
              user, setUser,
              app, API_HOST, AUTH_HOST, PROJECT_NAME: PROJECT_NAME || app, defaultRedirectUrl, UI
            }}>
              <ThemeContext.Provider value={{theme}}>
                  <AdminLayout menuItems={menuItems} theme={theme} Menu={() => <>{rightMenu}</>}>
                          {props.children}
                  </AdminLayout>
              </ThemeContext.Provider>
            </AuthContext.Provider>
          )
        },
        action: 'list',
        path: `/*`,
        children: [
          {
            type: props => <AuthUsers {...props} />,
            reqPermissions: ['auth-users'],
            path: "users",
          },
          {
            type: props => <AuthGroups {...props} />,
            reqPermissions: ['auth-groups'],
            path: "groups",
          },
        ]
      }
    ]
  }
}
const config = [authConfig, manageAuthConfig]
export default config