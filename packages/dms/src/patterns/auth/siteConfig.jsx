import React from "react";
import UI from "../../ui";
import {getPatternTheme, ThemeContext} from "../../ui/useTheme";
import DefaultMenu from "./components/menu"
import AuthLogin from "./pages/authLogin";
import AuthLogout from "./pages/authLogout";
import AuthSignup from "./pages/authSignup";
import AuthUsers from "./pages/authUsers";
import AuthGroups from "./pages/authGroups";
import AuthResetPassword from "./pages/authResetPassword";
import AuthForgotPassword from "./pages/authForgotPassword";
import Profile from "./pages/profile";
import {cloneDeep, merge} from "lodash-es";


let authImgI = null;

const AdminLayout = ({menuItems, children, theme, Menu}) => {
    const {Layout, LayoutGroup} = UI;
    return (
        <div className={theme?.auth?.authPages?.container}>
            <Layout navItems={menuItems} Menu={Menu}>
                <LayoutGroup>
                    {children}
                </LayoutGroup>
            </Layout>
        </div>
    )
}

const AuthLayout = ({children, theme, imgI}) => {
    const {Layout, LayoutGroup} = UI;

    return (
        <Layout activeStyle={'auth'} topNavActiveStyle={'auth'}>
            <LayoutGroup activeStyle={'auth'}>
                <div className={theme?.auth?.authPages?.sectionGroup?.default?.wrapper3}>
                    {children}
                </div>
                <div className={theme?.auth?.authPages?.sectionGroup?.default?.wrapper4}>
                    <div
                        className={theme?.auth?.authPages?.sectionGroup?.default?.wrapper4Img}
                        style={{ backgroundImage: `url(${theme?.auth?.authPages?.sectionGroup?.default?.wrapper4ImgList?.[imgI]})` }}
                    />
                </div>
            </LayoutGroup>
        </Layout>
    )
}
const authConfig = ({
  app = "default-app",
  baseUrl = '/dms_auth',
    pattern,
  themes = {}
}) => {

  baseUrl = baseUrl === '/' ? '' : baseUrl;
    // hard coding mny_admin for dev, needs to come from pattern
    const theme = getPatternTheme(themes, pattern); //getPatternTheme(themes, {...pattern, theme: {selectedTheme: ''}});
    if (authImgI === null) {
        const totalImages = theme?.auth?.authPages?.sectionGroup?.default?.wrapper4ImgList?.length || 0;
        authImgI = Math.floor(Math.random() * totalImages);
    }
  // ----------------------
  return {
    app,
    baseUrl,
    format: {app, attributes: []},
    children: [
      {
        type: (props) => {
          return (

              <ThemeContext.Provider value={{theme, UI}}>
                  <AuthLayout theme={theme} imgI={authImgI}>
                      {props.children}
                  </AuthLayout>
              </ThemeContext.Provider>

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
  baseUrl = '/dms_auth',
  adminPath='/',
  themes = {},
    pattern,
  rightMenu = <DefaultMenu />,
}) => {

    const menuItems = [
        {
            name: 'Sites',
            path: `${adminPath}`
        },
        // {
        //     name: 'Datasets',
        //     path: `${adminPath}/datasets`
        // },
        {
            name: 'Themes',
            path: `${adminPath}/themes`
        },
        // {
        //     name: 'Team',
        //     path:`${adminPath}/team`
        // },
        {
            name: 'Auth',
            subMenus: [
                {
                    name: 'Profile',
                    path: `${baseUrl}/manage/profile`
                },
                {
                    name: 'Users',
                    path: `${baseUrl}/manage/users`
                },
                {
                    name: 'Groups',
                    path: `${baseUrl}/manage/groups`
                }
            ]
        }
    ];



    baseUrl = baseUrl === '/' ? '' : baseUrl;

    const theme = getPatternTheme(themes, {...pattern, theme: {selectedTheme: ''}}); //getPatternTheme(themes, {...pattern, theme: {selectedTheme: ''}});

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
              <ThemeContext.Provider value={{theme, UI}}>
                  <AdminLayout menuItems={menuItems} theme={theme} Menu={() => <>{rightMenu}</>}>
                          {props.children}
                  </AdminLayout>
              </ThemeContext.Provider>
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
            {
                type: props => <Profile {...props} />,
                path: "profile",
            },
        ]
      }
    ]
  }
}
const config = [authConfig, manageAuthConfig]
export default config
