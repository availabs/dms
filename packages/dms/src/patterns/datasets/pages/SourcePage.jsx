import React, {useContext, useEffect, useState} from "react";
import {Link, useNavigate} from "react-router";
import {DatasetsContext} from "../context";
import {ThemeContext, getComponentTheme} from "../../../ui/useTheme";
import {dataItemsNav} from "../../../utils/nav";
import {getSourceData, isNotSourceRow, resolveInternalViewNames, getInternalDataType, getSourceAuthority, getViewRowCount, parseIfJson} from "./dataTypes/default/utils";
import { nameToSlug } from "../../../utils/type-utils";
import {preferredViewId, authorityMarker} from "../utils/authority";
import { getExternalEnv } from "../utils/datasources";
import { sourcePageTheme } from "./sourcePage.theme";
import Breadcrumbs from "../components/Breadcrumbs";
import StatePanel from "../components/StatePanel";
import Overview from "./dataTypes/default/overview"
import Admin from "./dataTypes/default/admin"
import Version from "./dataTypes/default/version"
import { Metadata } from "./dataTypes/lazyPages"

const fixedPages = ['overview', 'admin']
const viewDependentPages = ['table', 'upload', 'validate', 'map']

const overviewNav = {name: 'Overview', href: '', viewDependentPage: false}
// The Admin tab holds the Access editor, Add Version, Allow editing, Rules and Delete: shown to users
// who can use any of them.
const ADMIN_PERMS = ['update-source', 'edit-source-permissions', 'delete-source', 'create-view'];
const adminNav = {name: 'Admin', href: 'admin', viewDependentPage: false, reqPermissions: ADMIN_PERMS}

const defaultPages = {
    overview: Overview,
    admin: Admin,
    version: Version,
    metadata: Metadata
}

const SourceNav = ({t, Icon, navItems, page, pageBaseUrl, id, view_id, isDms, sourceType}) => (
    <nav className={t.tabNav} aria-label="Source tabs">
        {navItems
            .filter(p => !p.cdn || p.cdn({isDms, sourceType}))
            .map(p => {
                const isActive = p.href === (page || '');
                return (
                    <Link key={p.name}
                          className={`${t.tab} ${isActive ? t.tabActive : t.tabInactive}`}
                          to={`${pageBaseUrl}/${id}/${p.viewDependentPage ? `${p.href}/${view_id || ''}` : p.href}`}>
                        {p.href === 'admin' && t.adminTabIcon && <Icon icon={t.adminTabIcon} className={t.tabIcon}/>}
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
    const {Layout, Button, Select} = UI;
    // Shared secondary nav — mount-aware base (pattern.navPrefix; '' on primary mounts) (see DatasetsList).
    const menuItemsSecondNav = React.useMemo(
        () => dataItemsNav(fullTheme?.navOptions?.secondaryNav?.navItems || [], ctx?.parent?.navPrefix || '', false),
        [fullTheme?.navOptions?.secondaryNav?.navItems, ctx?.parent?.navPrefix]
    );
    const navigate = useNavigate();
    const pgEnv = getExternalEnv(datasources);
    const [source, setSource] = useState(isDms ? item : {});
    const [loading, setLoading] = useState(false);
    // the id whose load finished — tells "still loading" from "this id has no source"
    const [loadedId, setLoadedId] = useState(null);
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
            setLoadedId(id)
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
            .then(views => {
                if (cancelled) return;
                // same derivation getSourceData uses: created = first version, updated = last version
                // (the preloaded item carries neither, so the Overview's Created / Updated were blank)
                setSource(s => ({...s, views,
                    created_at: views[0]?.created_at || s.created_at,
                    updated_at: views[views.length - 1]?.updated_at || s.updated_at}));
            });
        return () => { cancelled = true };
    }, [isDms, item, falcor, sourceFormat.app, sourceFormat.type])

    // DMS sources: resolve the dataType from `data.type` (see getInternalDataType — the source
    // format has no `type` attribute, so neither the preloaded item nor getSourceData's row
    // carries it). Falls back to internal_table until it resolves / when unset.
    const [internalDataType, setInternalDataType] = useState(null);
    useEffect(() => {
        if (!isDms || !id) { setInternalDataType(null); return; }
        let cancelled = false;
        getInternalDataType({ pgEnv: `${sourceFormat.app}+${sourceFormat.type}`, falcor, source_id: id })
            .then(dataType => { if (!cancelled) setInternalDataType(dataType) });
        return () => { cancelled = true };
    }, [isDms, id, falcor, sourceFormat.app, sourceFormat.type])

    // Route-preloaded DMS items don't carry the derived `authority` attribute — read it once.
    useEffect(() => {
        if (!isDms || !item || !id) return;
        let cancelled = false;
        getSourceAuthority({ pgEnv: `${sourceFormat.app}+${sourceFormat.type}`, falcor, source_id: id })
            .then(authority => { if (!cancelled) setSource(s => ({...s, authority})) })
            .catch(() => {});
        return () => { cancelled = true };
    }, [isDms, item, id, falcor, sourceFormat.app, sourceFormat.type])

    const sourceLoaded = !!(source.id || source.source_id);

    // Per-source access: pattern ⊕ this source's own authPermissions override (see datasets.format.js).
    // Provided on the context below so every dataType page/component checks pattern⊕source uniformly.
    const sourceAuthPermissions = source?.auth_permissions
        ? (typeof source.auth_permissions === 'string' ? parseIfJson(source.auth_permissions, undefined) : source.auth_permissions)
        : undefined;
    const isUserAuthed = (reqPermissions) => patternIsUserAuthed(reqPermissions, sourceAuthPermissions);

    // A DMS-internal source keeps its dataType in `data.type` (e.g. 'file_upload'); the row's
    // `type` COLUMN is the storage/row-kind string (`datasets_env|<instance>:source`) and is NOT a
    // dataType key — which is why this reads `internalDataType` (fetched above) and NOT
    // `source.type`. Forcing 'internal_table' for every internal source discarded `data.type`, so
    // an internal file upload (the Freight Atlas Plan Library PDFs/ZIPs, the QA screenshot
    // sources) got the internal_table Table page instead of the file_upload view page that serves
    // its file. Honour a registered dataType; fall back to internal_table, which is both the
    // pre-resolve state and what every other internal source carries today.
    const dmsDataType = damaDataTypes?.[internalDataType] ? internalDataType : 'internal_table';
    const sourceType = isDms ? dmsDataType : source?.categories?.[0]?.[0]; // source identifier (named in the script).
    const sourceDataType = isDms ? dmsDataType : source?.type; // csv / gis / internal
    const sourcePages = sourceLoaded ? { ...(damaDataTypes[sourceType] || {}), ...(damaDataTypes[sourceDataType] || {}) } : {};

    const sourcePagesNavItems =
        (Object.values(sourcePages) || [])
            .map(p => {
                const href = (p.path || p.href || '').replace('/', '');
                return {
                    name: p.name,
                    href,
                    cdn: p.cdn, // condition fn ({isDms, sourceType}) controlling nav visibility
                    reqPermissions: p.reqPermissions, // a page config may name the permissions it needs
                    viewDependentPage: viewDependentPages.includes(href),
                };
            })
            .filter(p => p.href && !fixedPages.includes(p.href));

    const allNavItems = [overviewNav, ...sourcePagesNavItems, adminNav]
        .filter(p => !p.reqPermissions || isUserAuthed(p.reqPermissions));
    const views = source.views || [];
    const showVersionSelector = viewDependentPages.includes(page);

    // Auto-navigate when on a view-dependent page without a view_id: to the authoritative view when
    // one is marked (utils/authority.js), else to the latest view as before.
    const latestViewId = views.length ? (isDms ? views[views.length - 1]?.id : views[views.length - 1]?.view_id) : null;
    const defaultViewId = preferredViewId(source, views, v => (isDms ? v?.id : v?.view_id)) ?? latestViewId;

    // Row count for the subtitle — ONE count, for the version in effect only (owner 2026-10-06).
    // Same env the Table tab queries: pgEnv for DAMA, `${app}+${sourceSlug}` for DMS sources.
    const [rowCount, setRowCount] = useState({viewId: null, count: null});
    const countEnv = isDms ? (source?.name ? `${source.app || sourceFormat.app}+${nameToSlug(source.name)}` : null) : pgEnv;
    // the URL's trailing id is a version only when it matches one — on Uploads it's an ETL context id
    const urlViewIsView = view_id != null && views.some(v => String(isDms ? v?.id : v?.view_id) === String(view_id));
    const countViewId = (urlViewIsView ? view_id : null) || defaultViewId;
    useEffect(() => {
        if (!t.subtitle || !sourceLoaded || !countEnv || countViewId == null) return;
        let cancelled = false;
        getViewRowCount({env: countEnv, falcor, viewId: countViewId})
            .then(count => { if (!cancelled) setRowCount({viewId: countViewId, count}); });
        return () => { cancelled = true; };
    }, [t.subtitle, sourceLoaded, countEnv, countViewId, falcor]);

    // Subtitle under the title: type · rows · versions (Decision 8 in
    // planning/tasks/current/datasets-page-pattern-v6-port.md). Rows belong to ONE version — the one in
    // effect (the URL's view, else the authoritative one, else the latest) — so that version is named.
    // The type is the resolved dataType, never a DMS row's raw `source.type` (a storage row-type string).
    const subtitleParts = [];
    if (sourceDataType) subtitleParts.push(sourceDataType);
    const effectiveViewId = countViewId;
    const effectiveView = views.find(v => String(isDms ? v?.id : v?.view_id) === String(effectiveViewId));
    if (rowCount.count != null && String(rowCount.viewId) === String(effectiveViewId)) {
        const viewLabel = effectiveView?.name || effectiveView?.version || `v${effectiveViewId}`;
        subtitleParts.push(`${rowCount.count.toLocaleString()} rows (${viewLabel})`);
    }
    subtitleParts.push(views.length ? `${views.length} ${views.length === 1 ? 'version' : 'versions'}` : 'no versions yet');
    useEffect(() => {
        if (!showVersionSelector || view_id || !defaultViewId) return;
        navigate(`${pageBaseUrl}/${id}/${page}/${defaultViewId}`, {replace: true});
    }, [showVersionSelector, view_id, defaultViewId])

    const Page = sourcePages[page]?.component || defaultPages[page] || Overview;
    // A page opened by URL without the permissions its config names (or Admin without any of ADMIN_PERMS).
    const pageReqPermissions = page === 'admin' ? ADMIN_PERMS : sourcePages[page]?.reqPermissions;
    const pageDenied = !!pageReqPermissions && !isUserAuthed(pageReqPermissions);

    // v6 (t.notFound set): an id that loaded nothing gets a not-found card and no header band / tabs
    // (DAMA / DMS-by-id loads flag `missing`; a DMS route that preloads no row hands over an empty item)
    const notFound = !!t.notFound && !loading && (
        (loadedId === id && !!source.missing) ||
        (isDms && !!item && ((!item.id && !item.source_id) || isNotSourceRow(item.type))));
    // v6 (t.versionStates set): a version tab (table / upload / validate / map) on a source with no
    // versions, or with a URL version id that isn't one of this source's versions
    const versionState = !t.versionStates || !sourceLoaded || notFound || !showVersionSelector ? null
        : !views.length ? 'none'
        : (view_id != null && !urlViewIsView) ? 'unknown' : null;
    const breadcrumbItems = [
        {icon: 'Database', href: baseUrl},
        {name: notFound ? `#${id}` : (source?.name || '...'), href: `${pageBaseUrl}/${id}`},
        ...(page ? [{name: page}] : []),
    ];

    return (
        <Layout navItems={[]} secondNav={menuItemsSecondNav}>
            <DatasetsContext.Provider value={{...ctx, pageBaseUrl, isUserAuthed, setHeaderActions}}>
                <div className={t.pageWrapper}>
                    <Breadcrumbs items={breadcrumbItems} />

                    {/* header band: title + version selector, with the tab bar at its base */}
                    {!notFound && <div className={t.header}>
                        <div className={t.headerInner}>
                            <div className={t.titleWrap}>
                                {!sourceLoaded && t.titleSkeleton ? (
                                    <><div className={t.titleSkeleton}/><div className={t.subtitleSkeleton}/></>
                                ) : <h1 className={t.title}>{source?.name || '…'}</h1>}
                                {t.subtitle && sourceLoaded && (!isDms || internalDataType !== null) && <div className={t.subtitle}>{subtitleParts.join(' · ')}</div>}
                            </div>
                            {(showVersionSelector || headerActions.length > 0) && (
                                <div className={t.headerRight}>
                                    {headerActions.map((a, i) => (
                                        <Button key={i} activeStyle='action' onClick={a.onClick}>{a.label}</Button>
                                    ))}
                                    {showVersionSelector && (
                                        <>
                                            <span className={t.versionLabel}>version</span>
                                            {/* UI.Select: onChange gets the chosen view_id; with none chosen the placeholder
                                                shows "No version selected" (the old native option had value={undefined}, which
                                                navigated to its own text) */}
                                            <span className={t.versionSelectWrap}>
                                                <Select
                                                    id={'version-selector'}
                                                    placeholder={'No version selected'}
                                                    options={views.map(view => ({value: view.view_id, label: (view.name || view.view_id) + authorityMarker(source, view.view_id)}))}
                                                    value={view_id}
                                                    onChange={v => {
                                                        if (v === undefined || v === null || v === '') return;
                                                        const pageUrl = `${pageBaseUrl}/${id}${page ? `/${page}` : ''}`;
                                                        navigate(`${pageUrl}/${v}`)
                                                    }}
                                                />
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className={t.tabBarWrap}>
                            <SourceNav
                                t={t}
                                Icon={UI.Icon}
                                navItems={allNavItems}
                                page={page}
                                pageBaseUrl={pageBaseUrl}
                                id={id}
                                view_id={view_id}
                                isDms={isDms}
                                sourceType={isDms ? 'internal' : source?.type}
                            />
                        </div>
                    </div>}

                    {/* full-bleed content band — flex-1 fills to the page bottom regardless of
                        content height; the page provides its own max-width/padding inner container */}
                    <div className={t.body}>
                        {notFound ? (
                            <div className={t.notFound}>
                                <section className={t.notFoundCard}>
                                    <StatePanel icon="Search" tone="amber" title={`No source #${id}`}
                                                text="It may have been deleted, or it lives in an environment this catalog isn’t bound to.">
                                        <Link to={baseUrl || '/'} className={t.notFoundBtn}>Back to data sources</Link>
                                    </StatePanel>
                                </section>
                            </div>
                        ) : versionState ? (
                            <div className={t.notFound}>
                                <section className={t.notFoundCard}>
                                    {versionState === 'none' ? (
                                        <StatePanel icon="MapLayers" tone="amber" title="No versions yet"
                                                    text="Table, map, upload and validate need a version. Add one from the Admin tab.">
                                            <Link to={`${pageBaseUrl}/${id}/admin`} className={t.notFoundBtn}>Open admin</Link>
                                        </StatePanel>
                                    ) : (
                                        <StatePanel icon="Search" tone="amber" title={`No version #${view_id}`}
                                                    text="This source has no version with that id. It may have been deleted.">
                                            {defaultViewId != null && (
                                                <Link to={`${pageBaseUrl}/${id}/${page}/${defaultViewId}`} className={t.notFoundBtn}>Open the current version</Link>
                                            )}
                                        </StatePanel>
                                    )}
                                </section>
                            </div>
                        ) : sourceLoaded && pageDenied ? (
                            <div className={t.notFound}>
                                <section className={t.notFoundCard}>
                                    <StatePanel icon="Lock" tone="amber" title="No access"
                                                text={`This page needs ${pageReqPermissions.join(' or ')} on this source.`}>
                                        <Link to={`${pageBaseUrl}/${id}`} className={t.notFoundBtn}>Back to the overview</Link>
                                    </StatePanel>
                                </section>
                            </div>
                        ) : sourceLoaded ? (
                            <Page format={sourceFormat}
                                  source={source} setSource={setSource}
                                  params={params}
                                  isDms={isDms}
                                  // The resolved dataType for either storage model: for pgEnv
                                  // sources it IS `source.type`, for DMS sources it comes from
                                  // `data.type` (`source.type` there is the storage row-type
                                  // string, which is not a dataType and must not be displayed as
                                  // one). Pages should prefer this over `source.type`.
                                  dataType={sourceDataType}
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
