import React from 'react';
import {Link, useLocation, useNavigate} from 'react-router'
import {AdminContext} from "../../context";
import { ThemeContext } from '../../../../ui/useTheme';
import { patternEditorTheme } from './patternEditor.theme'
import { siteCan, patternCan, tabPermission, PATTERN_EDITOR_PERMISSIONS, VIEW_PATTERN_LIST } from '../../../../utils/adminPermissions';

import { PatternSettingsEditor } from "./default/settings";
import { PatternThemeEditor } from "./default/themeEditor";
import { PatternAccessEditor } from "./default/accessEditor";
import { PatternPagesEditor } from "./pages/pagesEditor";
import { SourcesTab } from "./pages/sourcesTab";
import { ActivityTab } from "./pages/activityTab";
import FormatManager from './formatManager';
import PageTemplateManagerPane from './pageTemplateManagerPane';

const Alert = () => <div>A</div>

const navPages = [
  {
    name: 'Overview',
    path: 'overview',
    component: PatternSettingsEditor
  },
  {
    name: 'Theme',
    path: `theme`,
    component: PatternThemeEditor
  },
  {
    // Access = permissions (who can manage this pattern) + row filters
    // (which data rows its sections can see), merged onto one page per
    // design_system_v6/pages/admin-pattern-access.html (2026-09-20).
    name: 'Access',
    path: `permissions`,
    component: PatternAccessEditor
  }
]

const pagesTab = {
  name: 'Pages',
  path: 'pages',
  component: PatternPagesEditor
}

const sourcesTab = {
  name: 'Data Sources',
  path: 'sources',
  component: SourcesTab
}

const activityTab = {
  name: 'Activity',
  path: 'activity',
  component: ActivityTab
}

const PatternEditor = ({params, dataItems, item, format, attributes, apiUpdate, apiLoad, falcor, ...rest}) => {
  const { baseUrl, parentBaseUrl, app, user, authPath, authPermissions } = React.useContext(AdminContext);
  const { theme } = React.useContext(ThemeContext);
  const t = { ...patternEditorTheme, ...(theme?.admin?.patternEditor || {}) }
  const [tmpItem, setTmpItem] = React.useState(item);
  const {id, page} = params;
  const navigate = useNavigate();
  const location = useLocation();

  // Same site-level gate as the pattern list (editSite.jsx's SiteEdit):
  // logged-out users go to login, users without site admin access go home.
  // The per-pattern check below alone let anonymous users in, since a pattern
  // with no grants is treated as unrestricted.
  const hasSiteAccess = siteCan(user, app, authPermissions, VIEW_PATTERN_LIST);

  React.useEffect(() => {
    if (!user?.authed) {
      navigate(`${authPath}/login`, { state: { from: location.pathname } })
      return
    }

    // user is optimistically seeded from localStorage on refresh with a
    // placeholder groups:['public'] while the real groups load async
    // (see auth/providers.jsx) — don't judge access on that stale state.
    if (user?.isAuthenticating) return

    if (!hasSiteAccess) {
      navigate('/')
    }
  }, [user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups)])

  if (!user?.authed || user?.isAuthenticating || !hasSiteAccess) {
    return null
  }

  // Pattern gate: THIS pattern's own grants (plus site `*`), never the
  // site-level value alone. edit-pattern opens every tab but Access;
  // edit-pattern-permissions opens Access. See utils/adminPermissions.js.
  // The server returns a pattern row only to users it lets read it (view-page
  // or a pattern-level admin permission). Anyone else gets a stub the loader
  // drops, so `item` arrives empty — no id, no grants. Checking grants on that
  // would read as an "open" pattern, and a save from the blank form creates a
  // stray row instead of editing this one (found 2026-09-30), so stop here.
  // This also covers `${app} Admin` / site-`*` users whom the client lets in
  // but the pattern itself doesn't grant.
  if (!item?.id) {
    return <div className={t.noAccess}>This pattern could not be loaded for your account. It needs a grant on the pattern itself (View Page, Edit Pattern, Edit Pattern Permissions or Delete Pattern).</div>;
  }
  const can = perm => patternCan(user, app, authPermissions, item, perm);
  if (!PATTERN_EDITOR_PERMISSIONS.some(can)) {
    return <div className={t.noAccess}>You do not have permission to manage this pattern.</div>;
  }

  const allPages = [
    ...navPages,
    ...(item.pattern_type === 'page' ? [pagesTab, sourcesTab, activityTab] : []),
    ...(item.pages || []),
    ...(item.pattern_type === 'page' ? [
      { path: 'page_templates', name: 'Page Templates', component: PageTemplateManagerPane },
      { path: 'edit_pattern', name: 'Format Manager', component: FormatManager }
    ] : [])
  ];
  const pages = allPages.filter(d => can(tabPermission(d.path)));
  // No tab in the URL → the first one this user can use (Access, for an
  // edit-pattern-permissions-only user). A tab the user can't use is shown as
  // denied, not silently swapped for another.
  const requested = page ? allPages.find(d => d.path === page) : pages[0];
  const isTabDenied = Boolean(requested) && !pages.includes(requested);
  const PageComp = requested?.component || pages[0].component
  const currentTabName = requested?.name || page;
    return (
      <div className={t.wrapper}>
        <Breadcrumbs
          parentBaseUrl={parentBaseUrl}
          patternUrl={`${baseUrl}/${id}`}
          patternName={item.name}
          tabName={currentTabName}
        />
          <div className={t.content}>
           <div className={t.contentInner}>
            {isTabDenied ? (
              <div className={t.noAccess}>You do not have permission to use this tab.</div>
            ) : (
            <PageComp
                app={item.app}
                type={item.type}
              value={item}
              onChange={(d) => d}
              attributes={attributes}
                apiUpdate={apiUpdate}
                apiLoad={apiLoad}
                falcor={falcor}
            />
            )}
           </div>
          </div>
      </div>
    )
}

export default PatternEditor

// `admin / <pattern name> / <tab>` — matches design_system_v6/pages/
// admin-pattern-overview.html's header trail and siteConfig.jsx's own
// AdminBreadcrumb (Sites/Themes level), replacing the old OL/LI +
// SVG-triangle-separator markup, which also had a real bug: its map callback
// shadowed the outer `page` string param with the loop variable of the same
// name, so the trail's second segment (`page.name`/`page.path` on a plain
// string) always rendered blank (2026-09-20).
const Breadcrumbs = ({parentBaseUrl, patternUrl, patternName, tabName}) => {
    const { theme, UI } = React.useContext(ThemeContext);
    const { ThemeToggle } = UI || {};
    const t = { ...patternEditorTheme, ...(theme?.admin?.patternEditor || {}) }

  return (
      <div className={t.breadcrumbBar}>
        <Link to={parentBaseUrl || '/'} className={t.breadcrumbHomeLink}>admin</Link>
        <span className={t.breadcrumbSep}>/</span>
        <Link to={patternUrl} className={t.breadcrumbLink}>{patternName || 'pattern'}</Link>
        <span className={t.breadcrumbSep}>/</span>
        <span className={t.breadcrumbCurrent}>{tabName}</span>
        <span className='flex-1' />
        <div className={t.breadcrumbActions}>
          <ThemeToggle />
        </div>
      </div>
  )
}
