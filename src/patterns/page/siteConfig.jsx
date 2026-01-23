import React from "react";
import { merge, cloneDeep } from "lodash-es";
import {
  parseIfJSON,
  updateRegisteredFormats,
  updateAttributes,
} from "./pages/_utils";

// components
import cmsFormat from "./page.format.js";
import { CMSContext } from "./context";
import { isUserAuthed } from "./auth.js";
import UI from "../../ui";
import { ThemeContext, RegisterLayoutWidget, getPatternTheme } from "../../ui/useTheme.js";
import SearchButton from "./components/search/index";
import DefaultMenu from "./components/userMenu";

// pages
import PageView from "./pages/view";
import PageEdit from "./pages/edit";
import ErrorPage from "./pages/error";
import FormatManager from "./pages/manager/formatManager"

// Manager
// import ManageLayout from "./pages/manager/layout";
// import Dashboard from "./pages/manager";
// import PageManager from "./pages/manager/pages";
// import DesignEditor from "./pages/manager/design";
// import FormatManager from "./pages/manager/formatManager";

// ------------
RegisterLayoutWidget('UserMenu', DefaultMenu)
RegisterLayoutWidget('Search', SearchButton)
// ------------



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
  const theme = getPatternTheme(themes, pattern)
  //---------------------------------------------------------------------
  // Update format and attributes for things to work correctly
  // This should probable be moved to DMS Manager
  // Or at least re-thought so it doesn't need to be in all site configs
  // --------------------------------------------------------------------
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
  //----------End Format Initialization ----------------------------------

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
              app, type, siteType,
              API_HOST,
              baseUrl,
              pgEnv, damaBaseUrl,
              user,
              falcor,
              patternFilters, datasetPatterns,
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
