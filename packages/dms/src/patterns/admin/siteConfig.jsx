import React from "react";
import { useLocation } from 'react-router'

import { cloneDeep } from "lodash-es";
import { ThemeContext, mergeTheme, getPatternTheme } from "../../ui/useTheme";
import { AdminContext } from "./context";
import { sectionGroupTheme, adminChromeTheme } from './siteConfig.theme';
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

// "admin / <page>" breadcrumb + the ThemeToggle, matching the mockups'
// header band. Not the shared Layout's own TopNav — that's gated by a single
// GLOBAL layout.options.topNav.size, so enabling it here would turn it on
// for every page in the app, not just the admin pattern's own pages.
const PAGE_LABELS = { '': 'overview', create: 'new site', themes: 'themes', theme: 'theme' };
const AdminBreadcrumb = ({ theme, baseUrl }) => {
  const location = useLocation();
  const { UI: contextUI } = React.useContext(ThemeContext) || {};
  const { ThemeToggle } = contextUI || {};
  const t = { ...adminChromeTheme, ...(theme?.admin?.chrome || {}) };
  const rest = location.pathname.slice(baseUrl.length).split('/').filter(Boolean);
  const crumb = PAGE_LABELS[rest[0] || ''] || rest[0] || 'overview';
  return (
    <div className={t.breadcrumbBar}>
      <span className={t.breadcrumbHome}>admin</span>
      <span className={t.breadcrumbSep}>/</span>
      <span className={t.breadcrumbCurrent}>{crumb}</span>
      <span className='flex-1' />
      <div className={t.breadcrumbActions}>
        <ThemeToggle />
      </div>
    </div>
  );
};

const SectionGroup = ({
  children,
  maxWidth,
  padding,
  card = true,
  ...props
}) => {
  const { theme } = React.useContext(ThemeContext) || {}
  const t = { ...sectionGroupTheme, ...(theme?.admin?.sectionGroup || {}) }
  return (
    <div className={card ? t.outer : t.outerPlain}>
      <div className={`${card ? t.inner : t.innerPlain} ${padding || t.defaultPadding}`}>
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
  themesLoader = null,
  dmsEnvs = [],
  dmsEnvById = {},
  pattern: patternData,
  authPermissions = {},
  isMultiTenant = false,
  pgEnv = '',
  ssrCollect,
}) => {
  console.log('pd?', patternData)
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
  }, ssrCollect);

  // The admin panel intentionally always uses "default" (tessera_v6) for its
  // layout/styling, same for every project (see
  // planning/shared/tasks/current/tessera-default-theme.md — "i do want
  // admin panels to look the same for all projects"). The logo is the one
  // exception: if this project has its OWN theme configured for this admin
  // pattern (patternData.theme.selectedTheme — discarded above for
  // everything else), and that theme defines its own `logo`, use it instead
  // of tessera_v6's brand mark. If there's no project theme configured, or
  // it doesn't define its own logo, render no logo at all rather than
  // falling back to tessera's mark — `themes[name]` holds each theme's raw
  // module (pre-merge), so `.logo` is only present when that theme actually
  // sets one of its own.
  const projectThemeName = patternData?.theme?.selectedTheme;
  const projectLogo = projectThemeName && themes?.[projectThemeName]?.logo;
  theme.logo = projectLogo ? cloneDeep(projectLogo) : { ...theme.logo, img: '', logoAltImg: '', title: 'Admin' };

  // ThemeToggle moved into AdminBreadcrumb next to "view site" (2026-09-22) —
  // the sidenav's own bottomMenu default (Layout.theme.jsx) pairs it with
  // UserMenu, which admin no longer wants; drop it here so only UserMenu
  // remains at the bottom of the sidenav.
  theme.layout.options.sideNav.bottomMenu = [{ type: "UserMenu" }];

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
              <ThemeContext.Provider value={{ theme, themes, themesLoader, UI }}>
                <Layout navItems={menuItems} Menu={() => <>{rightMenu}</>} sideNavActiveStyle='admin'>
                  <AdminBreadcrumb theme={theme} baseUrl={baseUrl} />
                  {/* `adminContent` matches Pattern Editor's own content padding (p-5 lg:p-8) —
                      the default `content` style's bigger py-8/pl-12 band padding was stacking
                      with SectionGroup's own padding below, giving Sites/Themes' titles much
                      more inset than Overview's (flagged live, 2026-09-21). */}
                  <LayoutGroup activeStyle="adminContent">{props.children}</LayoutGroup>
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
              // `card={false}` — SiteEdit's own title (identityWrapper) renders flush on
              // the page background, with the table as its own local card (`tableCard`);
              // the default `card` wraps the WHOLE page in one box, merging the two
              // (flagged live, 2026-09-21 — matches the same fix already applied to the
              // Pattern Editor's own pages). `padding="p-0"` — SectionGroup's own
              // `defaultPadding` (p-4) was stacking on top of the outer LayoutGroup's
              // padding, giving this page far more inset than Overview's; matches
              // `patternConfig`'s own `padding="p-0"` precedent below. `maxWidth="w-full"` —
              // this page (and Themes/Users/Groups/Profile) should render full width
              // (2026-09-22), matching ThemeEdit's own existing override below.
              <SectionGroup card={false} padding="p-0" maxWidth="w-full">
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
              // `card={false}` — ThemeList's own `header` already renders flush, and its
              // `tableWrapper` already carries its own card; the default `card` was
              // wrapping both in a second, redundant outer box (same fix as SiteEdit above).
              // `padding="p-0"` — same excess-padding fix as SiteEdit above. `maxWidth="w-full"`
              // — full width, same as SiteEdit above (2026-09-22).
              <SectionGroup card={false} padding="p-0" maxWidth="w-full">
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
  themesLoader = null,
  rightMenu = <DefaultMenu />,
  dmsEnvs = [],
  dmsEnvById = {},
  authPermissions = {},
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
          // ThemeToggle moved into the Pattern Editor's own Breadcrumbs, next
          // to "view site" (2026-09-22) — only UserMenu stays here.
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
          const { user, apiUpdate, dataItems = [], params = {} } = props;
          const menuItems = getMenuItems(parentBaseUrl, authPath, props.user);
          // `props` here comes from the SAME EditWrapper every route node goes
          // through (dms-manager/wrapper.jsx) — `dataItems` is always the full,
          // unfiltered loader result for this format (every sibling pattern),
          // regardless of this node's own `action`. This node's own path is
          // the wildcard `/*`, so `params` only carries the raw remainder
          // (`params['*']`, e.g. "12/overview") — the child route's own
          // `:id/:page?` pattern is what names it `id` one level down
          // (patternEditor/index.jsx). Parsing that first segment here avoids
          // a second fetch just to know which pattern is currently open, so
          // its own tab links can join the sidenav (2026-09-20).
          const currentId = (params['*'] || '').split('/')[0];
          const currentPattern = currentId && dataItems.find(d => String(d.id) === currentId);
          if (currentPattern) {
            menuItems.push(...buildPatternMenuItems(baseUrl, currentId, currentPattern));
          }

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
                authPermissions,
                isMultiTenant,
                pgEnv,
                datasources,
              }}
            >
              <ThemeContext.Provider value={{ theme, themes, themesLoader, UI }}>
                <Layout navItems={menuItems} Menu={() => <>{rightMenu}</>} sideNavActiveStyle='admin'>
                  <SectionGroup maxWidth="w-full" padding="p-0" card={false}>{props.children}</SectionGroup>
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
  // Icon names are keys in the base registry (ui/icons/icon_defs.jsx) — same
  // set patterns/auth/siteConfig.jsx's manageAuthConfig uses for this same
  // menu when reached via the auth pattern, kept in sync here so the sidenav
  // looks identical regardless of which pattern's wrapper mounted it.
  let menuItems = [
    {
      name: "Sites",
      path: `${baseUrl}`,
      icon: 'Home',
    },
    // {
    //     name: 'Datasets',
    //     path: `${baseUrl}/datasets`
    // },
    {
      name: "Themes",
      path: `${baseUrl}/themes`,
      icon: 'Fill',
    },
  ];

  if (user?.authed) {
    menuItems.push({
      name: "Auth",
      icon: 'AccessControl',
      defaultOpen: true,
      subMenus: [
        {
          name: "Profile",
          path: `${authPath}/manage/profile`,
          icon: 'UserCircle',
        },
        {
          name: "Users",
          path: `${authPath}/manage/users`,
          icon: 'User',
        },
        {
          name: "Groups",
          path: `${authPath}/manage/groups`,
          icon: 'Group',
        },
      ],
    });
  }
  return menuItems;
};

// The currently-open pattern's own tabs, joined into the SAME sidenav as a
// second flat (non-collapsible) group below the site items — matching
// design_system_v6/pages/admin-pattern-*.html: "the open pattern gets its
// own sidenav group... there is NO separate tab strip — the sidenav IS the
// tab nav". Path segments match patternEditor/index.jsx's own `pages` array
// exactly (this only changes what the LINK is labeled/iconed, never the
// route); "access"/"data" are this group's names for the existing
// Permissions/Data-Sources tabs, per the mockups' own comments identifying
// them as the same features — "Access" also absorbed the old standalone
// "Filters" tab (admin-pattern-access.html's own second section is row
// filters), so there's no separate Filters entry anymore; its content still
// lives at the same `permissions` route (patternEditor/index.jsx's
// PatternAccessEditor renders both) (2026-09-20). Icon names verified
// against ui/icons/icon_defs.jsx — this file doesn't ship "Chevron*" or
// "Clock" (only "ClockIcon"), the exact mistake fixed in SideNav.theme.jsx
// earlier today; don't repeat it.
const buildPatternMenuItems = (baseUrl, id, pattern) => {
  const isPage = pattern.pattern_type === 'page';
  const tab = (name, path, icon) => ({ name, path: `${baseUrl}/${id}/${path}`, icon });
  return [
    // No path/onClick/subMenus — SideNavItem's "label row" branch, styled via
    // the 'admin' SideNav style's `navLabel` (added alongside this).
    { name: `pattern · ${pattern.name || id}` },
    tab('Overview', 'overview', 'InfoCircle'),
    ...(isPage ? [tab('Pages', 'pages', 'Pages')] : []),
    tab('Access', 'permissions', 'Lock'),
    ...(isPage ? [tab('Data', 'sources', 'Database'), tab('Activity', 'activity', 'ClockIcon')] : []),
    tab('Theme', 'theme', 'AdjustmentsHorizontal'),
    // Custom, site-specific extra tabs a pattern's own data can define
    // (patternEditor/index.jsx spreads `item.pages` the same way).
    ...(pattern.pages || []).map(p => tab(p.name, p.path, p.icon || 'Page')),
    ...(isPage ? [
      tab('Page Templates', 'page_templates', 'Page'),
      tab('Format Manager', 'edit_pattern', 'Settings'),
    ] : []),
  ];
};
