import React, {useContext, useEffect, useRef} from 'react'
import { Link, Navigate, useLocation } from "react-router";
import { cloneDeep } from "lodash-es"
import {
    dataItemsNav,
    nav2Level,
} from './_utils'
import { usePageViewState } from './usePageViewState'
import SectionGroup from '../components/sections/sectionGroup'
import { PageContext, CMSContext, DataSourceContext } from '../context';
import { ThemeContext, mergeTheme, getComponentTheme as getThemeKey } from "../../../ui/useTheme";
import { errorPageTheme } from "./errorPage.theme";
import { PageStateScreen } from "../components/PageStatePanel";
import { ABSOLUTE_URL } from "../../../utils/nav";
import { resolveSubdomainPath } from "../../../utils/subdomainPath";
import { RscCaptureContext } from "../../../render/rsc/captureContext";
import { sectionServerStatic, sectionIslandRefused } from "../components/sections/rscSections";

// RSC path (render/rsc, rsc-view-pages.md phase 2): why this page can't be served as server HTML with
// client chrome, or null when it can. Read only during the server pass. A section that isn't static is
// no reason: it stays live in the browser as a section island (RscSection.jsx), unless its type refuses.
function rscIneligible({ serverComponent, item }) {
    if (!serverComponent) return 'route not opted in';
    for (const section of item?.sections || []) {
        if (!sectionServerStatic(section) && sectionIslandRefused(section)) return `section ${section?.element?.['element-type']}`;
    }
    return null;
}

function PageView ({item, dataItems: allDataItems, attributes, apiLoad, apiUpdate, reqPermissions, format,busy, serverComponent}) {
    //console.log('create doc', { item, dataItems: allDataItems })
    const { search, pathname } = useLocation()
    const pdfRef = useRef(); // To capture the section of the page to be converted to PDF
    const {theme: fullTheme, UI, getComponentTheme} = useContext(ThemeContext);
    const { Menu, baseUrl, patternFilters = [], isUserAuthed = () => true, authPermissions, user, authBaseUrl, API_HOST, app, type, siteType, hasEditor, pattern, datasources, pgEnv, subdomain } = React.useContext(CMSContext) || {};
    const rscCapture = useContext(RscCaptureContext);
    const dataItems = allDataItems.filter(d => !d.authPermissions || isUserAuthed(reqPermissions, d.authPermissions));

    // LINK PAGE (`nav_link`, page.format.js): the page carries no content — it exists
    // only to put a nav entry pointing somewhere else into the page tree. Landing on
    // its own slug should take you to the destination instead of rendering an empty
    // page. Edit mode deliberately does NOT redirect (pages/edit/index.jsx), or the
    // author could never open the page to change the link again.
    const navLink = item?.nav_link ? resolveSubdomainPath(`${item.nav_link}`) : '';
    const { pageState, setPageState, updatePageStateFilters, setActionParam, clearActionParam } =
        usePageViewState({ item, patternFilters, baseUrl, syncUrl: !navLink });
    const {Layout} = UI;
    let theme = mergeTheme(fullTheme, item?.theme || {})

    const isViewDenied = !isUserAuthed(reqPermissions || []) ||
        (pageState?.authPermissions && !isUserAuthed(reqPermissions, pageState.authPermissions));

    const hasTrackedVisitRef = useRef(null);
    useEffect(() => {
      if (!item?.id || !app || !API_HOST || user?.isAuthenticating) return;
      if (hasTrackedVisitRef.current === item.id) return;
      // If this page has URL-bound filters and search params haven't been set yet,
      // initNavigateUsingSearchParams will navigate() on this same render cycle.
      // Skip and wait for the re-render after the URL is updated.
      const urlFilters = (pageState?.filters || []).filter(f => f.useSearchParams);
      if (urlFilters.length && !search) return;
      const action = item.id === 'no-access' || isViewDenied ? 'denied' : 'view';
      fetch(`${API_HOST}/track/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: user?.token },
        body: JSON.stringify({ app, pageId: item.id === 'no-access' ? null : item.id, url: window.location.href, action }),
      }).catch(() => {});
      hasTrackedVisitRef.current = item.id;
    }, [item?.id, user?.isAuthenticating, search]);

    // A full URL is not a router path — navigate()/<Navigate> would mangle it, so it
    // leaves as a document load. Same split as TopNav's absolute-destination handling.
    const navLinkIsAbsolute = Boolean(navLink) && ABSOLUTE_URL.test(navLink);
    useEffect(() => {
        if (navLinkIsAbsolute) window.location.assign(navLink);
    }, [navLink, navLinkIsAbsolute]);


    const menuItems = React.useMemo(() => {
        let items = dataItemsNav(dataItems,baseUrl,false)
        return items
    }, [dataItems])

    const menuItemsSecondNav = React.useMemo(() => {
        let items = dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [],baseUrl,false)
        return items
    }, [theme?.navOptions?.secondaryNav?.navItems])

    const resolveNav = React.useCallback((navDepth, navTitle) => {
        return nav2Level(menuItems, navDepth, pathname, baseUrl, navTitle)
    }, [menuItems, pathname, baseUrl])

    // React.useEffect(() => {
    //     // -------------------------------------------------------------------
    //     // -- This on load effect backfills pages created before sectionGroups
    //     // -- This should be deleted by JUNE 1 2025
    //     // -------------------------------------------------------------------
    //     //sectionsBackill(item,baseUrl,apiUpdate)

    // },[])

  const getSectionGroups =  ( sectionName ) => {
    return (item?.section_groups || [])
      .filter((g,i) => g.position === sectionName)
      .sort((a,b) => a?.index - b?.index)
      .map((group,i) => (
          <SectionGroup
              key={group?.name || i}
              group={group}
              attributes={attributes}
          />
      ))
  }

  const dataSourceActions = React.useMemo(() => ({
      dataSources: item.dataSources || {},
      setDataSource: () => {},
      removeDataSource: () => {},
      createDataSource: () => {},
  }), [item.dataSources]);

    if (isViewDenied || item?.id === 'no-access') {
        if (user?.isAuthenticating) return null;
        if (!user?.authed) {
            return <Navigate to={`${authBaseUrl}/login`} state={{ from: pathname + search }} replace />;
        }
        // v6: a titled panel inside the page's own Layout (pages.errorPage.statePanel; '' → the old line).
        // data-dms-no-access tells the PDF exporter to leave this page out (display: contents: no layout change).
        if ({ ...errorPageTheme, ...getThemeKey(fullTheme, 'pages.errorPage') }.statePanel) {
            return <div data-dms-no-access style={{ display: 'contents' }}>
                <PageStateScreen navItems={menuItems} resolveNav={resolveNav} secondNav={menuItemsSecondNav}
                    icon="Lock" tone="neutral" title="You do not have permission to view this page"
                    text="Ask an admin of this site for access.">
                    <Link to={baseUrl || '/'} className={{ ...errorPageTheme, ...getThemeKey(fullTheme, 'pages.errorPage') }.actionBtn}>Go to home</Link>
                </PageStateScreen>
            </div>;
        }
        return <div data-dms-no-access>You do not have permission to view this page. <Link to={baseUrl}>Click here to visit Home</Link></div>;
    }
    // Placed after every hook, not next to the `nav_link` resolution above: an early
    // return there would skip the useMemos below, and a SPA navigation from a link
    // page to a normal one would change the hook count mid-mount. The absolute case
    // renders nothing while the effect above performs the document load.
    if (navLink) {
        return navLinkIsAbsolute ? null : <Navigate to={navLink} replace />;
    }
  // RSC spike: the server pass records what the client chrome needs and renders only the content, each
  // section-group slot in a marker element that render/ssr2/handler.jsx cuts out (captureRender).
  if (rscCapture) {
    const reason = rscIneligible({ serverComponent, item });
    if (reason) {
      rscCapture.reason = reason;
    } else {
      rscCapture.kind = 'page-view';
      rscCapture.eligible = true;
      rscCapture.island = {
        navItems: menuItems,
        secondNav: menuItemsSecondNav,
        baseUrl, app, type, siteType, authPermissions, authBaseUrl, hasEditor,
        title: item?.title,
        // what PatternTitle (render/spa/utils) sets in the browser on today's path; the RSC path puts it in the HTML
        documentTitle: (typeof pattern?.html_title === 'string' && pattern.html_title.trim()) || pattern?.name || '',
        itemTheme: item?.theme || null,
        patternTheme: pattern?.theme || null,
        selection: pattern?.theme?.selectedTheme || pattern?.theme?.settings?.theme?.theme || 'default',
        // the user menu as route building left it (site menu, the pattern's own menu over it)
        authMenu: fullTheme?.navOptions?.authMenu || null,
      };
      // Section islands (sections that stay live in the browser) push themselves here while the slots
      // render (RscSection.jsx); what the browser needs to rebuild PageContext around them goes with them.
      // render/rsc/resolvePage.js keeps it only when there are islands, and trims it.
      rscCapture.sections = [];
      // RscSection reads it from here: importing the registry from sectionArray's graph is a cycle
      rscCapture.sectionServerStatic = sectionServerStatic;
      rscCapture.islandPage = {
        renderKey: pathname + search,
        item,
        dataItems: dataItems.map(({ id, parent, title, url_slug, index, hide_in_nav, nav_link, published }) =>
          ({ id, parent, title, url_slug, index, hide_in_nav, nav_link, published })),
        patternFilters, datasources: datasources || null, pgEnv: pgEnv || null, subdomain: subdomain || null,
        additionalSectionAttributes: pattern?.additionalSectionAttributes || null,
      };
      return (
        <DataSourceContext.Provider value={dataSourceActions}>
        <PageContext.Provider
          value={{ item, pageState, setPageState, updatePageStateFilters, setActionParam, clearActionParam, dataItems, apiLoad, apiUpdate, format, busy, baseUrl }}
        >
          <ThemeContext.Provider value={{theme, UI, getComponentTheme}}>
            <dms-rsc-slot name="top">{getSectionGroups('top')}</dms-rsc-slot>
            <dms-rsc-slot name="content">{getSectionGroups('content')}</dms-rsc-slot>
            <dms-rsc-slot name="bottom">{getSectionGroups('bottom')}</dms-rsc-slot>
          </ThemeContext.Provider>
        </PageContext.Provider>
        </DataSourceContext.Provider>
      );
    }
  }
  return (
      <DataSourceContext.Provider value={dataSourceActions}>
      <PageContext.Provider
        value={{ item, pageState, setPageState, updatePageStateFilters, setActionParam, clearActionParam, dataItems, apiLoad, apiUpdate, format, busy, baseUrl }}
      >
        <ThemeContext.Provider value={{theme, UI, getComponentTheme}}>
          <Layout
              navItems={menuItems}
              resolveNav={resolveNav}
              secondNav={menuItemsSecondNav}
              headerChildren={getSectionGroups('top')}
              footerChildren={getSectionGroups('bottom')}
          >
              {getSectionGroups('content')}
          </Layout>
        </ThemeContext.Provider>
      </PageContext.Provider>
      </DataSourceContext.Provider>

  )
}


export default PageView