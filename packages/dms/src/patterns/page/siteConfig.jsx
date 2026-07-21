import React from "react";
import { get } from "lodash-es";
import { useRouteError } from "react-router";
import { parseIfJSON } from "./pages/_utils";
import { initializePatternFormat } from "../../dms-manager/_utils";
import { preloadPageSections } from "../../api/preloadSectionData.js";

// components
import cmsFormat from "./page.format.js";
import { CMSContext } from "./context";
import { isUserAuthed } from "../../utils/auth.js";
import UI from "../../ui";
import { ThemeContext, getPatternTheme, getComponentTheme } from "../../ui/useTheme.js";
import { registerWidget } from "../../ui/widgets";
import { registerComponents } from './components/sections/componentRegistry';
import { registerSectionMenuExtensions } from './components/sections/sectionMenuExtensions';
import { registerColumnType } from "../../ui/columnTypes";
import SearchButton from "./components/search/index";
import DefaultMenu from "./components/userMenu";

// pages
import PageView from "./pages/view";
import PageEdit from "./pages/edit";
import ErrorPage from "./pages/error";
import { RegisterPlugin } from "../mapeditor/MapEditor"

// Register page pattern widgets
registerWidget('UserMenu', { label: 'User Menu', component: DefaultMenu })
registerWidget('SearchButton', { label: 'Search Button', component: SearchButton })

const pagesConfig = ({
  app, type,
  siteType,
  baseUrl = "/",
  authPermissions,
  authBaseUrl = '/auth',
  themes = { default: {} },
  pattern,
  datasources,
  dmsEnvs = [],
  dmsEnvById = {},
  damaMapPlugins = {},
  site,
  pgEnv,
  API_HOST,
  DAMA_HOST,
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

  // Auto-register theme-provided column types. Themes ship a declarative
  // { name: { EditComp, ViewComp, cardHints? } } map; collisions override
  // built-ins silently (themes are trusted code).
  if (theme.columnTypes) {
    Object.entries(theme.columnTypes).forEach(([k, v]) => registerColumnType(k, v))
  }

  // Auto-register theme-provided section-menu extensions — additional
  // item-groups (e.g. a domain-specific "Measure" picker) contributed to a
  // specific ComponentRegistry component's settings menu. Keyed by component
  // `name` (e.g. "AVL Graph"), value is a builder function or array of them.
  // See sectionMenuExtensions.js / sectionMenu.jsx.
  if (theme.sectionMenuExtensions) {
    Object.entries(theme.sectionMenuExtensions).forEach(([componentName, builders]) =>
      registerSectionMenuExtensions(componentName, builders))
  }

  baseUrl = baseUrl === "/" ? "" : baseUrl;
  const format = initializePatternFormat(cmsFormat, app, type);
  if(pattern?.additionalSectionAttributes?.length){
      const componentFormat = (format.registerFormats || [])
        .find(f => f.type.includes('component') || f.type.includes('cms-section'));
      if (componentFormat) {
        componentFormat.attributes.push(...pattern.additionalSectionAttributes);
      }
  }

// console.log("Page::siteConfig", datasources, rest);

  const mapeditorKeys = datasources.reduce((a, c) => {
    const pattern_type = get(c, ["pattern", "pattern_type"]);
    if (pattern_type === "mapeditor") {
      a.push(c.env);
    }
    return a;
  }, []);

  Object.keys(damaMapPlugins).forEach(plugin => RegisterPlugin(plugin, damaMapPlugins[plugin]));

  const patternFilters = parseIfJSON(pattern?.filters, []);
  const preloadEnabled = pattern?.preload_data === true;
  // const rightMenuWithSearch = rightMenu; // for live site
  return {
    siteType,
    format: format,
    ...(preloadEnabled && {
      preload: (falcor, data, request, params) => {
        const raw = params?.['*'] || '';
        const slug = raw.startsWith('edit/') ? raw.slice('edit/'.length) : raw;
        return preloadPageSections(falcor, data, request.url, patternFilters, slug);
      },
    }),
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
              fileUploadInfo: {
                DAMA_HOST,
                pgEnv,
                directory: `img/${ app }+${ type }`,
                id: `${ app }+${ type }|${ pgEnv }`
              },
              baseUrl,
              pgEnv,
              datasources,
              apiLoad,
              user,
              falcor,
              patternFilters: [...patternFilters, {id: 'user_id_default_filter', searchKey: 'user_id', values: user?.id}],
              authPermissions,
              authBaseUrl,
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
              <ThemeContext.Provider value={{theme, UI, getComponentTheme}}>
                {children}
              </ThemeContext.Provider>
            </CMSContext.Provider>
          )
        },
        action: "list",
        path: "/*",
        authPermissions, // passed down from dmsSiteFactory. these are saved authorisations in patterns.
        filter: {
          attributes: [
            "title", "index", "authPermissions", "url_slug","parent",
            "published", "description", "icon", "navOptions", "hide_in_nav",
            // needed when no page is registered at / and we're picking 0th page as /
            "draft_sections", "draft_section_groups", "sections", "section_groups"
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
