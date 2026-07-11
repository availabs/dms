import React, {useContext, useEffect, useState} from "react";
import {Link, useNavigate} from "react-router";
import {DatasetsContext} from "../context";
import {ThemeContext, getComponentTheme} from "../../../ui/useTheme";
import {dataItemsNav} from "../../../utils/nav";
import {getSourceData, resolveInternalViewNames, parseIfJson} from "./dataTypes/default/utils";
import { getExternalEnv } from "../utils/datasources";
import { sourcePageTheme } from "./sourcePage.theme";
import Breadcrumbs from "../components/Breadcrumbs";
import Overview from "./dataTypes/default/overview"
import Admin from "./dataTypes/default/admin"
import Version from "./dataTypes/default/version"
import Metadata from "./dataTypes/gis_dataset/pages/metadata"

const fixedPages = ['overview', 'admin']
const viewDependentPages = ['table', 'upload', 'validate', 'map']

const overviewNav = {name: 'Overview', href: '', viewDependentPage: false}
const adminNav = {name: 'Admin', href: 'admin', viewDependentPage: false}

const defaultPages = {
    overview: Overview,
    admin: Admin,
    version: Version,
    metadata: Metadata
}

const SourceNav = ({t, navItems, page, pageBaseUrl, id, view_id, isDms, sourceType}) => (
    <nav className={t.tabNav} aria-label="Source tabs">
        {navItems
            .filter(p => !p.cdn || p.cdn({isDms, sourceType}))
            .map(p => {
                const isActive = p.href === (page || '');
                return (
                    <Link key={p.name}
                          className={`${t.tab} ${isActive ? t.tabActive : t.tabInactive}`}
                          to={`${pageBaseUrl}/${id}/${p.viewDependentPage ? `${p.href}/${view_id || ''}` : p.href}`}>
                        {p.name}
                    </Link>
                )
            })
        }
    </nav>
)

export default function SourcePage ({ apiLoad, apiUpdate, format, item, params, isDms }) {
    const ctx = useContext(DatasetsContext);
    const {baseUrl, isUserAuthed: patternIsUserAuthed, UI, datasources, falcor, damaDataTypes} = ctx;
    const { theme: fullTheme } = useContext(ThemeContext) || {};
    const t = {...sourcePageTheme, ...getComponentTheme(fullTheme, 'datasets.sourcePage')};
    const {Layout} = UI;
    // Shared secondary nav — site-absolute items, so baseUrl '' (see DatasetsList).
    const menuItemsSecondNav = React.useMemo(
        () => dataItemsNav(fullTheme?.navOptions?.secondaryNav?.navItems || [], '', false),
        [fullTheme?.navOptions?.secondaryNav?.navItems]
    );
    const navigate = useNavigate();
    const pgEnv = getExternalEnv(datasources);
    const [source, setSource] = useState(isDms ? item : {});
    const [loading, setLoading] = useState(false);
    // view-dependent pages (e.g. Table) can inject buttons into the header next to the version
    // selector via setHeaderActions([{label, onClick}]) on the context. Cleared on page unmount.
    const [headerActions, setHeaderActions] = useState([]);
    const {id, view_id, page} = params;

    // Derive source-specific format from registerFormats (has views as dms-format attribute).
    // Falling back to shallow spread preserves existing behavior for non-standard formats.
    const sourceFormat = (format.registerFormats || []).find(f => f.type === `${format.type}|source`)
        || { ...format, type: `${format.type}|source` };
    const pageBaseUrl = isDms ? `${baseUrl}/internal_source` : `${baseUrl}/source`;

    useEffect(() => {
        async function load() {
            setLoading(true)
            await getSourceData({
                pgEnv: isDms ? `${sourceFormat.app}+${sourceFormat.type}` : pgEnv,
                falcor,
                source_id: id,
                setSource,
                isDms
            });
            setLoading(false)
        }

        if (((!isDms && pgEnv) || (isDms && !item)) && id) {
            load()
        }
    }, [isDms, id, pgEnv, falcor, item])

    // Route-preloaded `item` (the normal internal_source/:id case) carries `views` as
    // raw DMS refs [{ref, id}] — the dms-format resolver only expands nested formats
    // discovered off the top-level pattern format, not off a source row loaded directly
    // by id. Resolve the view names here so downstream pages/selectors show real names.
    useEffect(() => {
        if (!isDms || !item) return;
        const rawViews = parseIfJson(item.views) || [];
        if (!rawViews.length) return;
        let cancelled = false;
        resolveInternalViewNames({ pgEnv: `${sourceFormat.app}+${sourceFormat.type}`, falcor, rawViews })
            .then(views => { if (!cancelled) setSource(s => ({...s, views})) });
        return () => { cancelled = true };
    }, [isDms, item, falcor, sourceFormat.app, sourceFormat.type])

    const sourceLoaded = !!(source.id || source.source_id);

    // Per-source access: pattern ⊕ this source's own authPermissions override (see datasets.format.js).
    // Provided on the context below so every dataType page/component checks pattern⊕source uniformly.
    const sourceAuthPermissions = source?.auth_permissions
        ? (typeof source.auth_permissions === 'string' ? parseIfJson(source.auth_permissions, undefined) : source.auth_permissions)
        : undefined;
    const isUserAuthed = (reqPermissions) => patternIsUserAuthed(reqPermissions, sourceAuthPermissions);

    const sourceType = isDms ? 'internal_table' : source?.categories?.[0]?.[0]; // source identifier (named in the script).
    const sourceDataType = isDms ? 'internal_table' : source?.type; // csv / gis / internal
    const sourcePages = sourceLoaded ? { ...(damaDataTypes[sourceType] || {}), ...(damaDataTypes[sourceDataType] || {}) } : {};

    const sourcePagesNavItems =
        (Object.values(sourcePages) || [])
            .map(p => {
                const href = (p.path || p.href || '').replace('/', '');
                return {
                    name: p.name,
                    href,
                    cdn: p.cdn, // condition fn ({isDms, sourceType}) controlling nav visibility
                    viewDependentPage: viewDependentPages.includes(href),
                };
            })
            .filter(p => p.href && !fixedPages.includes(p.href));

    const allNavItems = [overviewNav, ...sourcePagesNavItems, adminNav];
    const views = source.views || [];
    const showVersionSelector = viewDependentPages.includes(page);

    // Auto-navigate to latest view when on a view-dependent page without a view_id
    const latestViewId = views.length ? (isDms ? views[views.length - 1]?.id : views[views.length - 1]?.view_id) : null;
    useEffect(() => {
        if (!showVersionSelector || view_id || !latestViewId) return;
        navigate(`${pageBaseUrl}/${id}/${page}/${latestViewId}`, {replace: true});
    }, [showVersionSelector, view_id, latestViewId])

    const Page = sourcePages[page]?.component || defaultPages[page] || Overview;

    const breadcrumbItems = [
        {icon: 'Database', href: baseUrl},
        {name: source?.name || '...', href: `${pageBaseUrl}/${id}`},
        ...(page ? [{name: page}] : []),
    ];

    return (
        <Layout navItems={[]} secondNav={menuItemsSecondNav}>
            <DatasetsContext.Provider value={{...ctx, pageBaseUrl, isUserAuthed, setHeaderActions}}>
                <div className={t.pageWrapper}>
                    <Breadcrumbs items={breadcrumbItems} />

                    {/* header band: title + version selector, with the tab bar at its base */}
                    <div className={t.header}>
                        <div className={t.headerInner}>
                            <h1 className={t.title}>{source?.name || '…'}</h1>
                            {(showVersionSelector || headerActions.length > 0) && (
                                <div className={t.headerRight}>
                                    {headerActions.map((a, i) => (
                                        <button key={i} type="button" className={t.headerActionBtn} onClick={a.onClick}>{a.label}</button>
                                    ))}
                                    {showVersionSelector && (
                                        <>
                                            <span className={t.versionLabel}>version</span>
                                            <select id={'version-selector'}
                                                    onChange={e => {
                                                        const pageUrl = `${pageBaseUrl}/${id}${page ? `/${page}` : ''}`;
                                                        navigate(`${pageUrl}/${e.target.value}`)
                                                    }}
                                                    className={t.versionSelect}
                                                    value={view_id}>
                                                <option key={'default'} value={undefined}>No version selected</option>
                                                {views.map(view => <option key={view.view_id} value={view.view_id}>{view.name || view.view_id}</option>)}
                                            </select>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className={t.tabBarWrap}>
                            <SourceNav
                                t={t}
                                navItems={allNavItems}
                                page={page}
                                pageBaseUrl={pageBaseUrl}
                                id={id}
                                view_id={view_id}
                                isDms={isDms}
                                sourceType={isDms ? 'internal' : source?.type}
                            />
                        </div>
                    </div>

                    {/* full-bleed content band — flex-1 fills to the page bottom regardless of
                        content height; the page provides its own max-width/padding inner container */}
                    <div className={t.body}>
                        {sourceLoaded ? (
                            <Page format={sourceFormat}
                                  source={source} setSource={setSource}
                                  params={params}
                                  isDms={isDms}
                                  apiLoad={apiLoad} apiUpdate={apiUpdate}
                                  context={DatasetsContext}
                            />
                        ) : (
                            <div className={t.loading}>
                                {loading ? 'Loading...' : ''}
                            </div>
                        )}
                    </div>
                </div>
            </DatasetsContext.Provider>
        </Layout>
    )
}
