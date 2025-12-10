import React from "react";
import { merge, cloneDeep } from "lodash-es";
import {
  parseIfJSON,
  updateRegisteredFormats,
  updateAttributes,
} from "./pages/_utils";

import UI from "../../ui";
import { ThemeContext, RegisterLayoutWidget } from "../../ui/useTheme.js";

// pages
import PageView from "./pages/view";
import PageEdit from "./pages/edit";

// Manager
import ManageLayout from "./pages/manager/layout";
import Dashboard from "./pages/manager";
import PageManager from "./pages/manager/pages";
import DesignEditor from "./pages/manager/design";
import FormatManager from "./pages/manager/formatManager";

import cmsFormat from "./page.format.js";
import { CMSContext } from "./context";
import DefaultMenu from "./components/menu";

// import { SearchPage } from "./components/search/SearchPage";

import defaultTheme from "../../ui/defaultTheme";
import ErrorPage from "./pages/error";
// ------------
RegisterLayoutWidget('UserMenu', DefaultMenu)
// ------------
// -------------------------------------
// should move to dms-manager
// ------------------------------------

const isUserAuthed = ({user={}, reqPermissions=[], authPermissions={}}) => {
    if(!reqPermissions?.length) return true; // if there are no required permissions
    // if(!user?.authed) return false; public group makes this useless
    const authedGroups = authPermissions.groups || {}; // will always have public group
    const authedUsers = authPermissions.users || {};

    // if user is logged in, and auth has not been setup (except public group) return true
    if(user.authed && !Object.keys(authedGroups).filter(g => g !== 'public').length && !Object.keys(authedUsers).length) return true;

    if(!Object.keys(authedGroups).length && !Object.keys(authedUsers).length) return true;

    const userAuthPermissions =
        [
            ...(authedUsers[user?.id] || []),
            ...(user.groups || [])
                .filter(group => authedGroups[group])
                .reduce((acc, group) => {
                    const groupPermissions = Array.isArray(authedGroups[group]) ? authedGroups[group] : [authedGroups[group]];
                    if(groupPermissions?.length){
                        acc.push(...groupPermissions)
                    }
                    return acc;
                }, [])
        ]

    return userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission))
}

const pagesConfig = ({
  app, type,
  siteType,
  baseUrl = "/",
  damaBaseUrl,
  authPermissions,
  themes = { default: {} },
  pattern,
  datasetPatterns,
  site,
  pgEnv,
  API_HOST
}) => {
  let theme = merge(
    {},
    defaultTheme,
    (themes[pattern?.theme?.settings?.theme?.theme] || themes.default),
    (pattern?.theme || {})
  );

  baseUrl = baseUrl === "/" ? "" : baseUrl;

  const format = cloneDeep(cmsFormat);
  format.app = app;
  format.type = type;
  updateRegisteredFormats(format.registerFormats, app, type);
  updateAttributes(format.attributes, app, type);
  if(pattern?.additionalSectionAttributes?.length){
      (format.registerFormats || [])
        .find(f => f.type.includes('cms-section'))
        .attributes.push(...pattern.additionalSectionAttributes)
  }


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
        type: ({children, falcor, user, ...props}) => {
          // console.log('pages siteConfig - ', user )
          // console.log('page siteConfig - UI', UI )
          console.log(
            'siteconfig Themes', themes,
            '\n pattern', pattern,
            '\n chosen theme', themes[pattern?.theme?.settings?.theme?.theme],
            '\n output theme', theme
          )
          return (
              <CMSContext.Provider value={{
                app, type, siteType,
                API_HOST,
                baseUrl,
                pgEnv, damaBaseUrl,
                user,
                falcor,
                patternFilters, datasetPatterns,
                authPermissions,
                UI,
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
            "authPermissions",
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
            reqPermissions: [
                'create-page',
                'edit-page',
                'edit-page-layout',
                'edit-page-params',
                'edit-page-permissions',
                'publish-page'
            ]
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
            action: "view",
              authPermissions,
              reqPermissions: ['view-page']
          },
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
  let theme = merge(
    cloneDeep(defaultTheme),
    cloneDeep(
      themes[pattern?.theme?.settings?.manager_theme_2?.theme] || themes.default,
    ),
    pattern?.theme || {},
  );

  baseUrl = baseUrl === "/" ? "" : baseUrl;


  const format = cloneDeep(cmsFormat);
  format.app = app;
  format.type = type;
  updateRegisteredFormats(format.registerFormats, app, type);
  updateAttributes(format.attributes, app, type);

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
            type: (props) => <FormatManager themes={themes} {...props} />,
            path: "format",
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
