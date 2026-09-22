import React from 'react';
import {Link} from 'react-router'
import {AdminContext} from "../../context";
import { ThemeContext } from '../../../../ui/useTheme';
import { patternEditorTheme } from './patternEditor.theme'
import { hasPatternManageAccess } from '../../utils';

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
  const { baseUrl, parentBaseUrl, app, user } = React.useContext(AdminContext);
  const { theme } = React.useContext(ThemeContext);
  const t = { ...patternEditorTheme, ...(theme?.admin?.patternEditor || {}) }
  const [tmpItem, setTmpItem] = React.useState(item);
  const {id, page='overview'} = params;

  // This gate used to check the generic site-level `authPermissions` from
  // AdminContext instead of THIS pattern's own — meaning a non-admin user
  // was denied here based on a value that has nothing to do with what's
  // actually configured on the pattern they're opening (and, since that
  // site-level value is typically never set, denied unconditionally for
  // every pattern). See patterns/admin/utils.js's `hasPatternManageAccess`
  // for the full rationale — mirrors editSite.jsx's per-row check (2026-09-20).
  const isAdmin = (user?.groups || []).some(g => g === `${app} Admin`);
  const hasAccess = hasPatternManageAccess(user, isAdmin, item.authPermissions, item.subdomain);
  if (!hasAccess) {
    return <div className={t.noAccess}>You do not have permission to manage this pattern.</div>;
  }

  console.log('patternEditor index -item', item, dataItems)

  const pages = [
    ...navPages,
    ...(item.pattern_type === 'page' ? [pagesTab, sourcesTab, activityTab] : []),
    ...(item.pages || []),
    ...(item.pattern_type === 'page' ? [
      { path: 'page_templates', name: 'Page Templates', component: PageTemplateManagerPane },
      { path: 'edit_pattern', name: 'Format Manager', component: FormatManager }
    ] : [])
  ];
  const PageComp = pages.find(d => d.path === page)?.component || pages[0].component
  const currentTabName = pages.find(d => d.path === page)?.name || page;
    return (
      <div className={t.wrapper}>
        <Breadcrumbs
          parentBaseUrl={parentBaseUrl}
          patternUrl={`${baseUrl}/${id}/overview`}
          patternName={item.name}
          tabName={currentTabName}
        />
          <div className={t.content}>
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
    const { theme } = React.useContext(ThemeContext);
    const t = { ...patternEditorTheme, ...(theme?.admin?.patternEditor || {}) }

  return (
      <div className={t.breadcrumbBar}>
        <Link to={parentBaseUrl || '/'} className={t.breadcrumbHomeLink}>admin</Link>
        <span className={t.breadcrumbSep}>/</span>
        <Link to={patternUrl} className={t.breadcrumbLink}>{patternName || 'pattern'}</Link>
        <span className={t.breadcrumbSep}>/</span>
        <span className={t.breadcrumbCurrent}>{tabName}</span>
      </div>
  )
}
