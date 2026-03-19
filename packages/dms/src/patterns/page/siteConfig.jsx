import React from "react";
import { get } from "lodash-es";
import { useRouteError } from "react-router";
import { parseIfJSON } from "./pages/_utils";
import { initializePatternFormat } from "../../dms-manager/_utils";
import { preloadPageSections } from "../../api/preloadSectionData.js";

// components
import cmsFormat from "./page.format.js";
import { CMSContext } from "./context";
import { isUserAuthed } from "./auth.js";
import UI from "../../ui";
import { ThemeContext, getPatternTheme } from "../../ui/useTheme.js";
import { registerWidget } from "../../ui/widgets";
import { registerComponents } from './components/sections/componentRegistry';
import SearchButton from "./components/search/index";
import DefaultMenu from "./components/userMenu";

// pages
import PageView from "./pages/view";
import PageEdit from "./pages/edit";
import ErrorPage from "./pages/error";
import FormatManager from "./pages/formatManager"

// Register page pattern widgets
registerWidget('UserMenu', { label: 'User Menu', component: DefaultMenu })
registerWidget('SearchButton', { label: 'Search Button', component: SearchButton })

const pagesConfig = ({
  app, type,
  siteType,
  baseUrl = "/",
  authPermissions,
  themes = { default: {} },
  pattern,
  datasources,
  dmsEnvs = [],
  dmsEnvById = {},
  site,
  pgEnv,
  API_HOST,
  ...rest
}) => {
  const theme = getPatternTheme(themes, pattern)

  // Auto-register theme-provided page components
  if (theme.pageComponents) {
    const comps = theme.pageComponents
    if (Array.isArray(comps)) {
      const obj = {}
      comps.forEach(c => { obj[c.key || c.name] = c })
      registerComponents(obj)
    } else {
      registerComponents(comps)
    }
  }

  baseUrl = baseUrl === "/" ? "" : baseUrl;
  const format = initializePatternFormat(cmsFormat, app, type);
  if(pattern?.additionalSectionAttributes?.length){
      (format.registerFormats || [])
        .find(f => f.type.includes('cms-section'))
        .attributes.push(...pattern.additionalSectionAttributes)
  }

// console.log("Page::siteConfig", datasources, rest);

  const mapeditorKeys = datasources.reduce((a, c) => {
    const pattern_type = get(c, ["pattern", "pattern_type"]);
    if (pattern_type === "mapeditor") {
      a.push(c.env);
    }
    return a;
  }, []);

  const patternFilters = parseIfJSON(pattern?.filters, []);
  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    siteType,
    format: format,
    preload: (falcor, data, request, params) =>
        preloadPageSections(falcor, data, request.url, patternFilters, params?.['*'] || ''),
    pages: [{path: 'edit_pattern', name: 'Format Manager', component: FormatManager}],
    baseUrl,
    API_HOST,
    children: [
      {
        type: ({children, falcor, user, apiLoad, ...props}) => {

          return (
            <CMSContext.Provider value={{
              app, type,
              siteType,
              API_HOST,
              baseUrl,
              pgEnv,
              datasources,
              apiLoad,
              user,
              falcor,
              patternFilters,
              authPermissions,
              mapeditorKeys,
              isUserAuthed: (reqPermissions, customAuthPermissions) => {
                if (!customAuthPermissions) {
                  return isUserAuthed({ user, authPermissions, reqPermissions });
                }
                // Merge page-level overrides onto inherited (pattern-level) permissions.
                // [] means "disabled" → strip from inherited; non-empty means "add/replace".
                const mergedUsers = { ...(authPermissions?.users || {}) };
                const mergedGroups = { ...(authPermissions?.groups || {}) };
                Object.entries(customAuthPermissions.users || {}).forEach(([id, perms]) => {
                  if (perms.length === 0) delete mergedUsers[id];
                  else mergedUsers[id] = perms;
                });
                Object.entries(customAuthPermissions.groups || {}).forEach(([name, perms]) => {
                  if (perms.length === 0) delete mergedGroups[name];
                  else mergedGroups[name] = perms;
                });
                return isUserAuthed({ user, authPermissions: { users: mergedUsers, groups: mergedGroups }, reqPermissions });
              }
            }}>
              <ThemeContext.Provider value={{theme, UI}}>
                {children}
              </ThemeContext.Provider>
            </CMSContext.Provider>
          )
        },
        action: "list",
        path: "/*",
        authPermissions, // passed down from dmsSiteFactory. these are saved authorisations in patterns.
        filter: {
          options: JSON.stringify({
            filter: {
              "data->>'template_id'": ["null"],
            },
          }),
          attributes: [
            "title", "index", "authPermissions", "url_slug","parent",
            "published", "description", "icon", "navOptions", "hide_in_nav",
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
            path: "/*",
            filter: {
              attributes: [
                  'title','index','filters','authPermissions','url_slug','parent','published',
                  'hide_in_nav','sections',  'section_groups',  'sidebar',  'navOptions','theme'
              ]
            },
            action: 'view',
            authPermissions,
            reqPermissions: ['view-page']
          },
        ],
      },
    ],
    errorElement: (props) => {
      let error = useRouteError();
      console.log('page pattern - siteconfig -error element', error)
      return (
        <ThemeContext.Provider value={{ theme, UI }}>
          <ErrorPage />
        </ThemeContext.Provider>
      );
    },
  };
};

export default [pagesConfig];
