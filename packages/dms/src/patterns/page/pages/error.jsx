import React, {useContext, useMemo} from 'react'
import {Link, useNavigate, useMatches, useLocation} from "react-router";
import {ThemeContext, getComponentTheme, mergeTheme} from "../../../ui/useTheme";
import PageStatePanel from "../components/PageStatePanel";
import {errorPageTheme} from "./errorPage.theme";
import {dataItemsNav, nav2Level} from "./_utils";

const MESSAGE = 'Unable to complete your request at the moment. Please try again later.';

// The page pattern routes' errorElement. `baseUrl` comes from siteConfig (no CMSContext here).
function ErrorPage({baseUrl = ''}) {
    const {theme: siteTheme = {}, UI} = useContext(ThemeContext) || {};
    const navigate = useNavigate();
    const {pathname} = useLocation();
    const {Layout, Icon} = UI;
    const t = {...errorPageTheme, ...getComponentTheme(siteTheme, 'pages.errorPage')};
    const sectionTheme = siteTheme?.sectionGroup?.['default'] || {};

    // Keep the context the reader was in (keepNav): this errorElement sits on the pattern's route,
    // so that route's loader data — the pattern's pages — is still here when a page fails to
    // render. Rebuild the site nav from it, and take the failed page's own theme (e.g. a page
    // that hides the side nav) the way view.jsx does. Pages with their own permissions are left
    // out: there's no CMSContext here to check them against the user.
    const loaderItems = useMatches().at(-1)?.data?.data;
    const items = useMemo(() => (t.keepNav && Array.isArray(loaderItems) ? loaderItems : [])
        .filter(d => d?.id && d.id !== 'no-access' && !d.authPermissions), [loaderItems, t.keepNav]);
    const slug = pathname.slice(baseUrl.length).replace(/^\/+(edit(\/|$))?/, '').replace(/\/+$/, '');
    const failedPage = items.find(d => d.url_slug === slug);
    const fullTheme = useMemo(() => mergeTheme(siteTheme, failedPage?.theme || {}), [siteTheme, failedPage]);
    const navItems = useMemo(() => dataItemsNav(items, baseUrl, false), [items, baseUrl]);
    const secondNav = useMemo(() => dataItemsNav(fullTheme?.navOptions?.secondaryNav?.navItems || [], baseUrl, false), [fullTheme, baseUrl]);
    const resolveNav = (navDepth, navTitle) => nav2Level(navItems, navDepth, pathname, baseUrl, navTitle);

    return (
        <ThemeContext.Provider value={{theme: fullTheme, UI, getComponentTheme}}>
        <div className={`${fullTheme?.page?.container}`}>
            <Layout
                navItems={navItems}
                resolveNav={resolveNav}
                secondNav={secondNav}
                // v6 keeps the site nav (and its user menu) so the reader can go somewhere else; pre-v6 hid it
                pageTheme={t.keepNav ? undefined : {navOptions: {sideNav: {size: 'none'}}}}
            >
                {t.page ? (
                    <div className={t.page}>
                        <section className={t.card}>
                            <PageStatePanel icon="Alert" tone="brick" title={t.title} text={MESSAGE}>
                                <UI.Button activeStyle="action" onClick={() => navigate(0)}>
                                    {Icon ? <Icon icon="Refresh" className={t.actionIcon}/> : null}Try again
                                </UI.Button>
                                <Link to={baseUrl || '/'} className={t.actionBtn}>Go to home</Link>
                            </PageStatePanel>
                        </section>
                    </div>
                ) : (
                    <div className={`${sectionTheme?.wrapper1} ${t.legacyWrap}`}>
                        <div className={t.legacyInner}>
                            <div className={sectionTheme?.wrapper3}>
                                <div className={t.legacyText}>{MESSAGE}</div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </div>
        </ThemeContext.Provider>
    )
}


export default ErrorPage
