import React from "react";
import { Link } from "react-router";
import { merge, cloneDeep } from "lodash-es";
import {
  parseIfJSON,
  updateRegisteredFormats,
  updateAttributes,
} from "./pages/_utils";

import UI from "../../ui";
import { ThemeContext } from "../../ui/useTheme.js";

// pages
import PageView from "./pages/view";
import PageEdit from "./pages/edit";

// Manager
import ManageLayout from "./pages/manager/layout";
import Dashboard from "./pages/manager";
import PageManager from "./pages/manager/pages";
import DesignEditor from "./pages/manager/design";

import cmsFormat from "./page.format.js";
import { CMSContext } from "./context";
import DefaultMenu from "./components/menu";

// import { SearchPage } from "./components/search/SearchPage";

import defaultTheme from "../../ui/defaultTheme";
import ErrorPage from "./pages/error";

const isUserAuthed = ({user={}, reqPermissions=[], authPermissions=[]}) => {
    if(!user?.authed) return false;
    if(!Object.keys(authPermissions).length) return true;

    const userAuthPermissions =
        (user.groups || [])
            .filter(group => authPermissions[group])
            .reduce((acc, group) => {
                const groupPermissions = Array.isArray(authPermissions[group]) ? authPermissions[group] : [authPermissions[group]];
                if(groupPermissions?.length){
                    acc.push(...groupPermissions)
                }
                return acc;
                }, []);

    return !reqPermissions?.length || userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission))
}

const pagesConfig = ({
  app = "dms-site",
  type = "docs-page",
  siteType,
  rightMenu = <DefaultMenu />,
  baseUrl = "/",
  damaBaseUrl,
  logo, // deprecated
  authPermissions,
  themes = { default: {} },
  pattern,
  site,
  pgEnv,
  API_HOST,
    user
}) => {
  // console.log('pass themes', themes)
  let theme = merge(
    cloneDeep(defaultTheme),
    cloneDeep(themes[pattern?.theme?.settings?.theme?.theme] || themes.default),
    cloneDeep(pattern?.theme) || {},
  );
  // console.log('test 123', themes, pattern?.theme?.settings?.theme?.theme )
  // console.log('pageConfig', pattern.doc_type, pattern.id, themes[pattern?.theme?.settings?.theme?.theme], pattern?.theme, pattern)
  // baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
  baseUrl = baseUrl === "/" ? "" : baseUrl;

  // console.log('testing', theme.navOptions)
  // console.log('page siteConfig app,type', `"${app}","${type}"`)


  const format = cloneDeep(cmsFormat);
  format.app = app;
  format.type = type;
  updateRegisteredFormats(format.registerFormats, app, type);
  updateAttributes(format.attributes, app, type);
  //siteType = siteType || type
  //console.log('foramat after update', app, type, format)

  // ---------------------------------------------
  // for instances without auth turned on, default user can edit
  // should move this to dmsFactory default authWrapper
  // ---------------------------------------------

  const patternFilters = parseIfJSON(pattern?.filters, []);
  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    siteType,
    format: format,
    baseUrl,
    API_HOST,
    errorElement: () => {
      // console.log('hola', user, defaultUser, user || defaultUser)
      return (
        <CMSContext.Provider
          value={{
            app,
            type,
            siteType,
            UI,
            API_HOST,
            baseUrl,
            pgEnv,
            damaBaseUrl,
            patternFilters,
            Menu: () => <>{rightMenu}</>,
          }}
        >
          <ThemeContext.Provider value={{ theme, UI }}>
            <ErrorPage />
          </ThemeContext.Provider>
        </CMSContext.Provider>
      );
    },
    children: [
      {
        type: ({children, falcor, ...props}) => {
          // console.log('hola', user, defaultUser, user || defaultUser)
          // console.log('page siteConfig - UI', UI )
          return (
              <CMSContext.Provider value={{
                app, type, siteType,
                API_HOST,
                baseUrl,
                pgEnv, damaBaseUrl,
                user,
                falcor,
                patternFilters,
                authPermissions,
                isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({user, authPermissions: customAuthPermissions || authPermissions, reqPermissions}),
                Menu: () => <>{rightMenu}</>
              }}>
                <ThemeContext.Provider value={{theme, UI}}>
                  {children}
                </ThemeContext.Provider>
              </CMSContext.Provider>
          )
        },
        authPermissions, // passed down from dmsSiteFactory. these are saved authorisations in patterns.
        action: "list",
        path: "/*",
        filter: {
          options: JSON.stringify({
            filter: {
              "data->>'template_id'": ["null"],
            },
          }),
          attributes: [
            "title",
            "index",
            "url_slug",
            "parent",
            "published",
            "description",
            "icon",
            "navOptions",
            "hide_in_nav",
          ],
        },
        children: [
          {
            type: (props) => <PageEdit {...props} />,
            path: "edit/*",
            action: "edit",
            authPermissions,
            reqPermissions: ['create-page', 'update-page']
          },
          {
            type: (props) => <PageView {...props} />,
            filter: {
              attributes: [
                  'title',
                  'index',
                  'filters',
                  'authPermissions',
                  'url_slug',
                  'parent',
                  'published',
                  'hide_in_nav',
                  'sections',
                  'section_groups',
                  'sidebar',
                  'navOptions',
                  'theme']
            },
            path: "/*",
            action: "view"
          },
          // {
          //   type: (props) => <SearchPage {...props}/>,
          //   path: "search/*",
          //   action: "list"
          // }
        ],
      },
    ],
  };
};

const pagesManagerConfig = ({
  app = "dms-site",
  type = "docs-page",
  siteType,
  rightMenu = <DefaultMenu />,
  baseUrl = "/",
  damaBaseUrl,
  logo, // deprecated
  authPermissions,
  themes = { default: {} },
  pattern,
  site,
  pgEnv,
  API_HOST,
    user
}) => {
  //console.log('hola', themes)
  let theme = merge(
    cloneDeep(defaultTheme),
    cloneDeep(
      themes[pattern?.theme?.settings?.manager_theme?.theme] || themes.default,
    ),
    pattern?.theme || {},
  );

  // console.log('pageConfig', theme, themes[pattern?.theme?.settings?.theme?.theme], pattern?.theme )
  // baseUrl = baseUrl[0] === '/' ? baseUrl.slice(1) : baseUrl
  baseUrl = baseUrl === "/" ? "" : baseUrl;
  const defaultLogo = cloneDeep(
    themes[pattern?.theme?.settings?.theme?.theme] || themes.default,
  )?.navOptions?.logo || (
    <Link to={`${baseUrl || "/"}`} className="h-12 flex px-4 items-center">
      <div className="rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600" />
    </Link>
  );

  if (!theme?.navOptions?.logo) {
    theme.navOptions = {
      ...(theme?.navOptions || {}),
      logo: logo ? logo : defaultLogo,
    };
  }
  theme.navOptions.sideNav.size = "compact";
  theme.navOptions.sideNav.nav = "main";
  theme.navOptions.topNav.nav = "none";

  // console.log('testing', theme.navOptions)

  const format = cloneDeep(cmsFormat);
  format.app = app;
  format.type = type;
  updateRegisteredFormats(format.registerFormats, app, type);
  updateAttributes(format.attributes, app, type);
  //console.log('foramat after update', app, type, format)

  // console.log('pgEnv siteConfig', app, type, pgEnv)
  // for instances without auth turned on, default user can edit
  // should move this to dmsFactory default authWrapper

  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    siteType,
    format: format,
    baseUrl: `${baseUrl}/manage`,
    API_HOST,
    children: [
      {
        type: ({children, falcor, ...props}) => {
          return (
            <CMSContext.Provider
              value={{
                UI,
                API_HOST,
                baseUrl,
                damaBaseUrl,
                user,
                falcor,
                pgEnv,
                app,
                type,
                siteType,
                Menu: () => <>{rightMenu}</>,
              }}
            >
              <ThemeContext.Provider value={{ theme, UI }}>
                <ManageLayout {...props}>{children}</ManageLayout>
              </ThemeContext.Provider>
            </CMSContext.Provider>
          );
        },
        authPermissions,
        action: "list",
        path: "/*",
        filter: {
          options: JSON.stringify({
            filter: {
              "data->>'hide_in_nav'": ["null"],
            },
          }),
          attributes: [
            "title",
            "index",
            "url_slug",
            "parent",
            "published",
            "hide_in_nav",
          ],
        },
        children: [
          {
            type: Dashboard,
            path: "",
            action: "edit",
          },
          {
            type: (props) => <DesignEditor themes={themes} {...props} />,
            path: "design",
            action: "edit",
          },
          {
            type: PageManager,
            path: "pages",
            action: "edit",
          },
        ],
      },
    ],
  };
};

export default [pagesConfig, pagesManagerConfig];
