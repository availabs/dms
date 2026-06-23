import React from 'react';
import {Link} from 'react-router'
import {AdminContext} from "../../context";
import { ThemeContext } from '../../../../ui/useTheme';
import { patternEditorTheme } from './patternEditor.theme'
import { isUserAuthed } from '../../utils';

import { PatternSettingsEditor } from "./default/settings";
import { PatternThemeEditor } from "./default/themeEditor";
import { PatternFilterEditor } from "./default/filterEditor";
import { PatternPermissionsEditor } from "./default/permissionsEditor";
import { PatternPagesEditor } from "./pages/pagesEditor";
import { SourcesTab } from "./pages/sourcesTab";
import { ActivityTab } from "./pages/activityTab";
// probably want to change this to register function for non default pages
import FormatManager from '../../../page/pages/formatManager';

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
    name: 'Filters',
    path: `filters`,
    component: PatternFilterEditor
  },
  {
    name: 'Permissions',
    path: `permissions`,
    component: PatternPermissionsEditor
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
  const { baseUrl, parentBaseUrl, app, user, authPermissions } = React.useContext(AdminContext);
  const { theme } = React.useContext(ThemeContext);
  const t = { ...patternEditorTheme, ...(theme?.admin?.patternEditor || {}) }
  const [tmpItem, setTmpItem] = React.useState(item);
  const {id, page='overview'} = params;

  const isAdmin = (user?.groups || []).some(g => g === `${app} Admin`);
  const hasAccess = isAdmin || isUserAuthed(user, authPermissions);
  if (!hasAccess) {
    return <div className={t.noAccess}>You do not have permission to manage this pattern.</div>;
  }

  console.log('patternEditor index -item', item, dataItems)

  const pages = [
    ...navPages,
    ...(item.pattern_type === 'page' ? [pagesTab, sourcesTab, activityTab] : []),
    ...(item.pages || []),
    ...(item.pattern_type === 'page' ? [{ path: 'edit_pattern', name: 'Format Manager', component: FormatManager }] : [])
  ];
  const PageComp = pages.find(d => d.path === page)?.component || pages[0].component
    return (
      <div className={t.wrapper}>
        <Breadcrumbs baseUrl={baseUrl} parentBaseUrl={parentBaseUrl} pattern={item} page={page}/>
          <div className={t.navRow}>
            <Nav
              navPages={pages}
              page={page}
              baseUrl={baseUrl}
              id={id}
            />
          </div>
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

const Nav = ({baseUrl, navPages, page, id}) => {
  const { theme } = React.useContext(ThemeContext);
  const t = { ...patternEditorTheme, ...(theme?.admin?.patternEditor || {}) }
  return (
    <nav className={t.nav}>
    {
      navPages
        .map(p => (
          <Link key={p.name}
                className={p.path.toLowerCase() === page ? t.navItemActive : t.navItemInactive}
                to={`${baseUrl}/${id}/${p?.path}`}
              >
            <div className={t.navItemInner}>
              <span className={t.navItemText}>{p.name}</span>
            </div>
          </Link>))
    }
    </nav>
  )
}

const Breadcrumbs = ({baseUrl, parentBaseUrl, pattern, page}) => {
    const {UI} = React.useContext(AdminContext);
    const { theme } = React.useContext(ThemeContext);
    const t = { ...patternEditorTheme, ...(theme?.admin?.patternEditor || {}) }
    const {Icon} = UI;

  return (
      <nav className={t.breadcrumbNav} aria-label="Breadcrumb">
        <ol className={t.breadcrumbOl}>
          <li className={t.breadcrumbLi}>
            <div className={t.breadcrumbLiInner}>
              <Link to={`${parentBaseUrl || '/'}`} className={t.breadcrumbHomeLink}>
                  <Icon icon={'Database'} className={t.breadcrumbHomeIcon} />
                  <span className="sr-only">Data Sources</span>
            </Link>
          </div>
        </li>
        {[pattern, page].filter(p => p).map((page,i) => (
          <li key={i} className={t.breadcrumbLi}>
            <div className={t.breadcrumbLiInner}>
              <svg
                className={t.breadcrumbSeparator}
                viewBox="0 0 30 44"
                preserveAspectRatio="none"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z" />
              </svg>
              {page.path ?
                <Link
                  to={page.path}
                  className={t.breadcrumbLink}
                  aria-current={page.current ? 'page' : undefined}
                >
                  {page.name}
                </Link> :
                <div
                  className={t.breadcrumbLink}
                  aria-current={page.current ? 'page' : undefined}
                >
                  {page.name}
                </div>
              }
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}
