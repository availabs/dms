import React from "react";
import {Link, useLocation} from "react-router";
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

const AdminLayout = ({menuItems, children, theme, Menu, adminPath}) => {
    const {Layout, LayoutGroup} = UI;
    const { UI: contextUI } = React.useContext(ThemeContext) || {};
    const { ThemeToggle } = contextUI || {};
    const location = useLocation();
    // A theme may name the Layout / LayoutGroup styles these pages use
    // (`auth.authPages.manageLayoutStyle` / `manageLayoutGroupStyle`) and swap
    // the nav items (`auth.authPages.manage.menuItems`). Unset, the pattern's
    // default layout options and the manager's Sites / Themes / Auth menu
    // apply, exactly as before 2026-09-13.
    const pages = theme?.auth?.authPages || {};
    // Manage pages (Users/Groups/Profile) get their own themed page background
    // (`manage.container`) instead of unconditionally reusing the auth
    // login/signup pages' `container` — that one is a hardcoded light-gray
    // gradient (never themed, since it predates dark mode) and AdminLayout
    // always renders through the "default" theme (see manageAuthConfig
    // below), so leaving it wired to `container` painted every project's
    // Users/Groups/Profile page with a literal near-white background behind
    // the (correctly dark-mode-aware) panel cards, regardless of theme.
    // Falls back to `container` for BC — a theme that hasn't set
    // `manage.container` yet (MNY hasn't reskinned these pages) renders
    // exactly as before.
    const containerClass = pages.manage?.container ?? pages.container;
    const m = pages.manage || {};
    // "admin / <page>" breadcrumb (mockups' `<header>` band) — not the shared
    // Layout's own TopNav (that's gated by a single GLOBAL `layout.options.
    // topNav.size`, so enabling it here would turn it on for every page in
    // the app, not just these three). Rendered as a plain themed bar instead,
    // scoped to just AdminLayout. The current-page label is just the last
    // path segment — every manage route (`users`/`groups`/`profile`) already
    // reads correctly as-is, no label map needed.
    const crumb = location.pathname.split('/').filter(Boolean).pop() || '';
    return (
        <div className={containerClass}>
            <Layout navItems={pages.manage?.menuItems || menuItems} Menu={Menu} activeStyle={pages.manageLayoutStyle} sideNavActiveStyle='admin'>
                {m.breadcrumbBar && (
                    <div className={m.breadcrumbBar}>
                        {adminPath ? (
                            <Link to={adminPath} className={m.breadcrumbHome}>admin</Link>
                        ) : (
                            <span className={m.breadcrumbHome}>admin</span>
                        )}
                        <span className={m.breadcrumbSep}>/</span>
                        <span className={m.breadcrumbCurrent}>{crumb}</span>
                        <span className='flex-1' />
                        <div className={m.breadcrumbActions}>
                            <ThemeToggle />
                        </div>
                    </div>
                )}
                <LayoutGroup activeStyle={pages.manageLayoutGroupStyle}>
                    {children}
                </LayoutGroup>
            </Layout>
        </div>
    )
}

const AuthLayout = ({children, theme, imgI}) => {
    const {Layout, LayoutGroup} = UI;
    const pages = theme?.auth?.authPages || {};
    const sg = pages.sectionGroup?.default || {};
    // mny's own theme (mny/auth.js) sets a real `wrapper4ImgList` — that's
    // the signal it wants the existing two-column split (form + a rotating
    // hazard-photo panel) preserved exactly as it renders today. Every theme
    // that doesn't set one (the default/tessera path, and any theme that
    // hasn't done its own auth-page pass yet) gets the mockups' single
    // centered card instead, with NO SideNav/TopNav chrome at all — Layout's
    // sidenav/topnav visibility is one GLOBAL on/off switch
    // (`layout.options.sideNav.size`), not something one `<Layout>` instance
    // can turn off on its own, so the bare path skips Layout entirely rather
    // than fighting that gate (2026-09-18).
    const isSplit = Array.isArray(sg.wrapper4ImgList) && sg.wrapper4ImgList.length > 0;

    if (isSplit) {
        return (
            <Layout activeStyle={'auth'} topNavActiveStyle={'auth'}>
                <LayoutGroup activeStyle={'auth'}>
                    <div className={sg.wrapper3}>
                        {children}
                    </div>
                    <div className={sg.wrapper4}>
                        <div
                            className={sg.wrapper4Img}
                            style={{ backgroundImage: `url(${sg.wrapper4ImgList[imgI]})` }}
                        />
                    </div>
                </LayoutGroup>
            </Layout>
        )
    }

    return (
        <div className={pages.bareWrapper}>
            <div className={pages.bareBand}>
                <div className="t6-sheet-fade" />
                {/* `relative` lifts the page above the absolutely-positioned
                    fade — without it the grid paints over every page's card
                    (positioned elements paint after in-flow ones). */}
                <div className={pages.bareContent ?? 'relative w-full'}>
                    {children}
                </div>
            </div>
        </div>
    )
}
const authConfig = ({
  app = "default-app",
  baseUrl = '/dms_auth',
    pattern,
  themes = {},
  ssrCollect,
}) => {

  baseUrl = baseUrl === '/' ? '' : baseUrl;
    // hard coding mny_admin for dev, needs to come from pattern
    const theme = getPatternTheme(themes, pattern, ssrCollect); //getPatternTheme(themes, {...pattern, theme: {selectedTheme: ''}});
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
                    return (
                        <div className={theme?.auth?.authPages?.landing ?? 'flex flex-col gap-3'}>
                            Admin

                        </div>
                    )
                },
                path: `/*`,

            },
          {
              type: props => <AuthLogin {...props} disableSignup={!!pattern?.disable_signup} />,
              path: "login",
          },
          {
              type: props => <AuthLogout {...props} />,
              path: "logout",
          },
          {
              type: props => <AuthSignup {...props} disableSignup={!!pattern?.disable_signup} />,
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
  authPermissions = {},
  rightMenu = <DefaultMenu />,
  ssrCollect,
}) => {

    // Icon names are keys in the base registry (ui/icons/icon_defs.jsx) — a
    // theme's own icon set merges with, rather than replaces, this base set
    // (see Icon.jsx / theme.Icons), so these render everywhere without
    // needing per-theme icon work.
    const menuItems = [
        {
            name: 'Sites',
            path: `${adminPath}`,
            icon: 'Home'
        },
        // {
        //     name: 'Datasets',
        //     path: `${adminPath}/datasets`
        // },
        {
            name: 'Themes',
            path: `${adminPath}/themes`,
            icon: 'Fill'
        },
        // {
        //     name: 'Team',
        //     path:`${adminPath}/team`
        // },
        {
            name: 'Auth',
            icon: 'AccessControl',
            defaultOpen: true,
            subMenus: [
                {
                    name: 'Profile',
                    path: `${baseUrl}/manage/profile`,
                    icon: 'UserCircle'
                },
                {
                    name: 'Users',
                    path: `${baseUrl}/manage/users`,
                    icon: 'User'
                },
                {
                    name: 'Groups',
                    path: `${baseUrl}/manage/groups`,
                    icon: 'Group'
                }
            ]
        }
    ];



    baseUrl = baseUrl === '/' ? '' : baseUrl;

    // The manage pages follow the auth pattern's OWN theme, like the login pages
    // above. `mny_admin` is only the fallback for a pattern with no
    // `selectedTheme` — that was the hardcoded value here until 2026-09-12, so a
    // site that never set one renders exactly as before.
    const managePattern =  {...pattern, theme: {selectedTheme: 'default'}};
    const theme = getPatternTheme(themes, managePattern, ssrCollect);
    // const projectThemeName = pattern?.theme?.selectedTheme;
    // const projectLogo = projectThemeName && themes?.[projectThemeName]?.logo; // here you actually get logo, but showing it breaks continuity from admin pages
    theme.logo = { ...theme.logo, img: '', logoAltImg: '', title: 'Admin' };

    // ThemeToggle moved into AdminLayout's own breadcrumb bar, matching
    // patterns/admin/siteConfig.jsx's identical change (2026-09-22) — the
    // sidenav's own bottomMenu default (Layout.theme.jsx) pairs it with
    // UserMenu, which these manage pages no longer want; drop it here so
    // only UserMenu remains at the bottom of the sidenav.
    theme.layout.options.sideNav.bottomMenu = [{ type: "UserMenu" }];

    // // A theme's own auth pass may already define the nav it wants for these
    // // manage pages (see mny/auth.js's `navOptions` — sideNav on, topNav off,
    // // matching the /list/pages and /list/themes admin look) but `theme.auth`
    // // is a separate branch from `theme.layout` that Layout.jsx never reads on
    // // its own. Splice it into `layout.options` here, scoped to just this
    // // manage-page theme object (login/signup and the rest of the site build
    // // their own `theme` separately and keep the theme's global layout.options
    // // untouched). A theme that hasn't set `auth.navOptions` (the common case)
    // // falls through with `theme.layout.options` exactly as resolved before.
    // if (theme?.auth?.navOptions?.sideNav || theme?.auth?.navOptions?.topNav) {
    //     theme.layout = {
    //         ...theme.layout,
    //         options: {
    //             ...theme.layout?.options,
    //             sideNav: theme.auth.navOptions.sideNav || theme.layout?.options?.sideNav,
    //             topNav: theme.auth.navOptions.topNav || theme.layout?.options?.topNav,
    //         },
    //     };
    // }

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
                  <AdminLayout menuItems={menuItems} theme={theme} Menu={() => <>{rightMenu}</>} adminPath={adminPath}>
                          {props.children}
                  </AdminLayout>
              </ThemeContext.Provider>
          )
        },
        action: 'list',
        path: `/*`,
        children: [
          {
            type: props => <AuthUsers {...props} app={app} authPermissions={authPermissions} />,
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
