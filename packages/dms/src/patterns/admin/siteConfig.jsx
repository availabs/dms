import React from "react";
// import {useLocation} from 'react-router'

import { cloneDeep } from "lodash-es";
import { ThemeContext, mergeTheme, getPatternTheme } from "../../ui/useTheme";
import { AdminContext } from "./context";
import { sectionGroupTheme } from './siteConfig.theme';
import UI from "../../ui";
import defaultTheme from "../../ui/defaultTheme";
import { initializePatternFormat } from "../../dms-manager/_utils";

import ErrorPage from "./components/errorPage.jsx";
import DefaultMenu from "./components/menu";

import adminFormat, { pattern, themeFormat } from "./admin.format.js";

import SiteEdit from "./pages/editSite";
import NewSite from "./pages/createSite";
import ThemeList from "./pages/themes/list";
import ThemeEdit from "./pages/themes/editTheme";
import PatternEditor from "./pages/patternEditor";
//import ThemeManager from './pages/themeManager/index.jsx'

const SectionGroup = ({
  children,
  maxWidth,
  padding,
  ...props
}) => {
  const { theme } = React.useContext(ThemeContext) || {}
  const t = { ...sectionGroupTheme, ...(theme?.admin?.sectionGroup || {}) }
  return (
    <div className={t.outer}>
      <div className={`${t.inner} ${padding || t.defaultPadding}`}>
        <div className={`${t.content} ${maxWidth || t.defaultMaxWidth}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

const adminConfig = ({
  app = "default-app",
  type = "default-page",
  API_HOST = "https://graph.availabs.org",
  baseUrl = "/",
  authPath = "/auth",
  themes = {},
  dmsEnvs = [],
  dmsEnvById = {},
  pattern: patternData,
  authPermissions = {},
  isMultiTenant = false,
  pgEnv = '',
}) => {
  const format = cloneDeep(adminFormat);
  format.app = app;
  // Build full site type: instance name + :site kind suffix.
  // After migration, site rows have type '{instance}:site' in the database.
  format.type = type.includes(":") ? type : `${type}:site`;
  // Only update app on registerFormats — admin types stay as-is ('pattern', 'theme')
  // to match how existing records are stored in the database.
  // Unlike page/forms/datasets patterns which prefix child types, the admin format
  // stores patterns and themes with their original type names.
  format.registerFormats?.forEach((rf) => {
    rf.app = app;
  });
  format.attributes?.forEach((attr) => {
    if (attr.format) attr.format = `${app}+${attr.format.split("+")[1]}`;
  });
  baseUrl = baseUrl === "/" ? "" : baseUrl;

  //console.log('defaultTheme', theme)
  let theme = getPatternTheme(themes, {
    ...patternData,
    theme: { selectedTheme: "default" },
  });

  // console.log('admin siteconfig API', API_HOST)
  return {
    app,
    type,
    format: format,
    baseUrl,
    children: [
      {
        type: (props) => {
          const { user, apiUpdate } = props;
          const { Layout, LayoutGroup } = UI;
          const menuItems = getMenuItems(baseUrl, authPath, props.user);
          return (
            <AdminContext.Provider
              value={{
                baseUrl,
                authPath,
                user,
                apiUpdate,
                app,
                type,
                siteType: format.type,
                API_HOST,
                UI,
                dmsEnvs,
                dmsEnvById,
                authPermissions,
                isMultiTenant,
                pgEnv,
              }}
            >
              <ThemeContext.Provider value={{ theme, themes, UI }}>
                <Layout navItems={menuItems} Menu={() => <>{rightMenu}</>}>
                  <LayoutGroup>{props.children}</LayoutGroup>
                </Layout>
              </ThemeContext.Provider>
            </AdminContext.Provider>
          );
        },
        action: "list",
        path: "/*",
        children: [
          {
            type: (props) => (
              <SectionGroup>
                <SiteEdit {...props} />
              </SectionGroup>
            ),
            path: "",
            action: "edit",
          },
          {
            type: (props) => (
              <SectionGroup>
                <NewSite {...props} />
              </SectionGroup>
            ),
            path: "create",
            action: "list",
          },
          {
            type: (props) => (
              <SectionGroup>
                <ThemeList {...props} />
              </SectionGroup>
            ),
            path: "themes",
          },
          {
            type: (props) => (
              <SectionGroup maxWidth="w-full" padding="p-0">
                <ThemeEdit {...props} />
              </SectionGroup>
            ),
            path: "theme/:theme_id/:component?",
            action: "edit",
          },
          // add a themes list page. a user can send themes object to DMSSite, and new themes from that object need to bbe saved to db.
          // after theme list page, create a components list page.
        ],
      },
    ],
    errorElement: (props) => {
      return (
        <ThemeContext.Provider value={{ theme, UI }}>
          <ErrorPage />
        </ThemeContext.Provider>
      );
    },
  };
};

const patternConfig = ({
  app = "default-app",
  type = "default-page",
  API_HOST = "https://graph.availabs.org",
  baseUrl = "/",
  authPath = "/auth",
  themes = {},
  rightMenu = <DefaultMenu />,
  dmsEnvs = [],
  dmsEnvById = {},
  isMultiTenant = false,
  pgEnv = '',
  datasources = [],
}) => {
  const format = cloneDeep(pattern);
  format.app = app;
  const parentBaseUrl = baseUrl === "/" ? "" : baseUrl;

  baseUrl = `${parentBaseUrl}/manage_pattern`;

  //console.log('admin PatternConfig', themes)
  let theme = mergeTheme(defaultTheme, {
    layout: {
      options: {
        sideNav: {
          size: "compact",
          nav: "main",
          topMenu: [{ type: "Logo" }],
          bottomMenu: [{ type: "UserMenu" }],
        },
      },
    },
  });
  theme.navOptions = theme?.admin?.navOptions || theme?.navOptions;
  theme.navOptions.sideNav.dropdown = "top";

  return {
    app,
    type,
    format: format,
    baseUrl,
    children: [
      {
        type: (props) => {
          const { Layout } = UI;
          const { user, apiUpdate } = props;
          const menuItems = getMenuItems(parentBaseUrl, props.user);

          return (
            <AdminContext.Provider
              value={{
                baseUrl,
                parentBaseUrl,
                themes,
                authPath,
                user,
                apiUpdate,
                app,
                type,
                siteType: type.includes(":") ? type : `${type}:site`,
                API_HOST,
                UI,
                dmsEnvs,
                dmsEnvById,
                isMultiTenant,
                pgEnv,
                datasources,
              }}
            >
              <ThemeContext.Provider value={{ theme, themes, UI }}>
                <Layout navItems={menuItems} Menu={() => <>{rightMenu}</>}>
                  <SectionGroup maxWidth={""}>{props.children}</SectionGroup>
                </Layout>
              </ThemeContext.Provider>
            </AdminContext.Provider>
          );
        },
        action: "list",
        path: "/*",
        children: [
          {
            type: PatternEditor,
            path: ":id/:page?",
            action: "edit",
          },
        ],
      },
    ],
    errorElement: (props) => {
      return (
        <ThemeContext.Provider value={{ theme, UI }}>
          <ErrorPage />
        </ThemeContext.Provider>
      );
    },
  };
};

export default [adminConfig, patternConfig];

const getMenuItems = (baseUrl, authPath, user) => {
  let menuItems = [
    {
      name: "Sites",
      path: `${baseUrl}`,
    },
    // {
    //     name: 'Datasets',
    //     path: `${baseUrl}/datasets`
    // },
    {
      name: "Themes",
      path: `${baseUrl}/themes`,
    },
  ];

  if (user?.authed) {
    menuItems.push({
      name: "Auth",
      subMenus: [
        {
          name: "Profile",
          path: `${authPath}/manage/profile`,
        },
        {
          name: "Users",
          path: `${authPath}/manage/users`,
        },
        {
          name: "Groups",
          path: `${authPath}/manage/groups`,
        },
      ],
    });
  }
  return menuItems;
};
