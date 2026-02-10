import React from "react";
import { merge } from "lodash-es";
import { parseIfJSON } from "./pages/_utils";
import { initializePatternFormat } from "../../dms-manager/_utils";

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
import FormatManager from "./pages/manager/formatManager"

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
  site,
  API_HOST
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

  const patternFilters = parseIfJSON(pattern?.filters, []);
  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    siteType,
    format: format,
    pages: [{path: 'edit_pattern', name: 'Format Manager', component: FormatManager}],
    baseUrl,
    API_HOST,
    children: [
      {
        type: ({children, falcor, user, ...props}) => {
          return (
            <CMSContext.Provider value={{
              app, type,
              siteType,
              API_HOST,
              baseUrl,
              datasources,
              user,
              falcor,
              patternFilters,
              authPermissions,
              isUserAuthed: (reqPermissions, customAuthPermissions) => {
                return isUserAuthed({ user, authPermissions: customAuthPermissions || authPermissions, reqPermissions })
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
    errorElement: () => {
      return (
        <ThemeContext.Provider value={{ theme, UI }}>
          <ErrorPage />
        </ThemeContext.Provider>
      );
    },
  };
};

export default [pagesConfig];
