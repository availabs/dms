import React from "react";
import {Link} from "react-router";
import UI from "../../ui";
import {ThemeContext} from "../../ui/useTheme";
import defaultTheme from "../../ui/defaultTheme";
import AuthLogin from "./pages/authLogin";
import AuthLogout from "./pages/authLogout";
import AuthSignup from "./pages/authSignup";
import AuthUsers from "./pages/authUsers";
import AuthGroups from "./pages/authGroups";
import AuthResetPassword from "./pages/authResetPassword";
import AuthForgotPassword from "./pages/authForgotPassword";
import {cloneDeep, merge} from "lodash-es";

export const AuthContext = React.createContext(null);

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
            path: baseUrl,
            subMenus: [
                {
                    name: 'Users',
                    path: `${baseUrl}/users`
                },
                {
                    name: 'Groups',
                    path: `${baseUrl}/groups`
                }
            ]
        })
    }

  baseUrl = baseUrl === '/' ? '' : baseUrl
    let theme = merge(
        cloneDeep(defaultTheme),
        cloneDeep(themes.mny_admin)
    );
  //console.log('defaultTheme', theme)
  theme.navOptions = theme?.admin?.navOptions || theme?.navOptions


  // ----------------------
  return {
    app,
    baseUrl,
    format: {app, attributes: []},
    children: [
      {
        type: (props) => {
          const {Layout} = UI;
          return (
            <AuthContext.Provider value={{baseUrl,
              user, setUser,
              app, API_HOST, AUTH_HOST, PROJECT_NAME: PROJECT_NAME || app, defaultRedirectUrl, UI}}>
              <ThemeContext.Provider value={{theme}}>
                  <div className={theme?.page?.container}>
                      <Layout navItems={menuItems}>
                          <div className={theme?.admin?.page?.pageWrapper}>
                              <div className={theme?.admin?.page?.pageWrapper2}>
                                  {props.children}
                              </div>
                          </div>
                      </Layout>
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
                  <div className={'flex flex-col sm:flex-row gap-3 text-center text-blue-800'}>
                    <Link className={linkClass} to={'groups'}>Manage Groups</Link>
                    <Link className={linkClass} to={'users'}>Manage Users</Link>
                  </div>
                </div>)
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
            type: props => <AuthSignup {...props} />,
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
          {
            type: props => <div>reset password</div>,
            path: "forgot_password",
          },
        ]
      }
    ]
  }
}
const config = [authConfig]
export default config