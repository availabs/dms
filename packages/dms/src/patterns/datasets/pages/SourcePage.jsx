import React, {useContext, useEffect, useState} from "react";
import {Link, useNavigate} from "react-router";
import {DatasetsContext} from "../context";
import {ThemeContext} from "../../../ui/useTheme";
import {getSourceData} from "./dataTypes/default/utils";
import {loadDmsItem} from "../utils/dmsItems";
import { getExternalEnv } from "../utils/datasources";
import Breadcrumbs from "../components/Breadcrumbs";
import Overview from "./dataTypes/default/overview"
import Admin from "./dataTypes/default/admin"
import Version from "./dataTypes/default/version"

const fixedPages = ['overview', 'admin']
const viewDependentPages = ['table', 'upload', 'validate', 'map']

const overviewNav = {name: 'Overview', href: '', viewDependentPage: false}
const adminNav = {name: 'Admin', href: 'admin', viewDependentPage: false}

const defaultPages = {
    overview: Overview,
    admin: Admin,
    version: Version
}

const SourceNav = ({theme = {}, navItems, page, pageBaseUrl, id, view_id, isDms, sourceType}) => (
    <nav className={theme.tabNav || 'w-full flex'}>
        {navItems
            .filter(p => !p.cdn || p.cdn({isDms, sourceType}))
            .map(p => {
                const isActive = p.href === (page || '');
                return (
                    <Link key={p.name} className={
                        `${theme.tab || 'p-2 mx-1 font-display font-medium text-l text-slate-700 border-b-2'} ${
                            isActive
                                ? (theme.tabActive || 'border-blue-600')
                                : (theme.tabInactive || 'border-transparent hover:border-gray-300')
                        }`
                    }
                          to={`${pageBaseUrl}/${id}/${p.viewDependentPage ? `${p.href}/${view_id || ''}` : p.href}`}
                    >
                        <div className={'flex items-center'}><span className={'pr-0.5'}>{p.name}</span></div>
                    </Link>
                )
            })
        }
    </nav>
)

export default function ({ apiLoad, apiUpdate, format, item, params, isDms }) {
    const ctx = useContext(DatasetsContext);
    const {baseUrl, user, isUserAuthed, UI, datasources, falcor, damaDataTypes} = ctx;
    const { theme: fullTheme } = useContext(ThemeContext) || {};
    const theme = fullTheme?.datasets?.sourcePage || {};
    const {Layout, LayoutGroup} = UI;
    const navigate = useNavigate();
    const pgEnv = getExternalEnv(datasources);
    const [source, setSource] = useState(isDms ? item : {});
    const [loading, setLoading] = useState(false);
    const [dmsItem, setDmsItem] = useState(null);
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
                setSource
            });
            setLoading(false)
        }

        if(((!isDms && pgEnv) || (isDms && !Object.entries(item).length)) && id){
            load()
        }
    }, [isDms, item.config])

    useEffect(() => {
        if (!isDms || !id) return;
        loadDmsItem(apiLoad, sourceFormat, id).then(setDmsItem);
    }, [isDms, id])

    const sourceLoaded = !!(source.id || source.source_id);

    const sourceType = isDms ? 'internal_dataset' : source?.categories?.[0]?.[0]; // source identifier. this is how the source is named in the script. this used to be type.
    const sourceDataType = isDms ? 'internal_dataset' : source?.type; // csv / gis / internal
    const sourcePages = sourceLoaded ? {...(damaDataTypes[sourceType] || {}), ...(damaDataTypes[sourceDataType] || {})} : {};

    const sourcePagesNavItems =
        (Object.values(sourcePages) || [])
            .map(p => {
                const href = (p.path || p.href || '').replace('/', '');
                return {
                    name: p.name,
                    href,
                    cdn: p.cdn, // condition fn with arguments ({isDms, sourceType}) to control visibility in nav
                    viewDependentPage: viewDependentPages.includes(href),
                };
            })
            .filter(p => p.href && !fixedPages.includes(p.href));

    const allNavItems = [overviewNav, ...sourcePagesNavItems, adminNav];
    const views = isDms ? (dmsItem?.views || []) : (source.views || []);
    const showVersionSelector = viewDependentPages.includes(page);

    // Auto-navigate to latest view when on a view-dependent page without a view_id
    useEffect(() => {
        if (!showVersionSelector || view_id || !views.length) return;
        const latest = views[views.length - 1];
        const latestId = latest.view_id || latest.id;
        if (latestId) {
            navigate(`${pageBaseUrl}/${id}/${page}/${latestId}`, {replace: true});
        }
    }, [showVersionSelector, view_id, views.length])

    const Page = sourcePages[page]?.component || defaultPages[page] || Overview;

    const breadcrumbItems = [
        {icon: 'Database', href: baseUrl},
        {name: source?.name || source?.doc_type || '...', href: `${pageBaseUrl}/${id}`},
        ...(page ? [{name: page}] : []),
    ];

    return (
        <Layout navItems={[]}>
            <DatasetsContext.Provider value={{...ctx, pageBaseUrl}}>
                <div className={theme.pageWrapper || 'max-w-6xl mx-auto w-full'}>
                    <Breadcrumbs items={breadcrumbItems} />
                    <div className={theme.tabBar || 'w-full flex justify-between items-end pl-2'}>
                        <SourceNav
                            theme={theme}
                            navItems={allNavItems}
                            page={page}
                            pageBaseUrl={pageBaseUrl}
                            id={id}
                            view_id={view_id}
                            isDms={isDms}
                            sourceType={isDms ? 'internal' : source?.type}
                        />
                        {showVersionSelector && (
                            <select id={'version-selector'}
                                    onChange={e => {
                                        const pageUrl = `${pageBaseUrl}/${id}${page ? `/${page}` : ''}`;
                                        navigate(`${pageUrl}/${e.target.value}`)
                                    }}
                                    className={'w-fit p-1 rounded hover:bg-gray-100 bg-transparent'}
                                    value={view_id}
                            >
                                <option key={'default'} value={undefined}>No version selected</option>
                                {views.map(view => <option key={view.id} value={view.view_id || view.id}>{view.name || view.id}</option>)}
                            </select>
                        )}
                    </div>
                    <LayoutGroup>
                        {sourceLoaded ? (
                            <Page format={sourceFormat}
                                  item={isDms && dmsItem ? dmsItem : item}
                                  source={source} setSource={setSource}
                                  params={params}
                                  isDms={isDms}
                                  apiLoad={apiLoad} apiUpdate={apiUpdate}
                                  context={DatasetsContext}
                            />
                        ) : (
                            <div className={'p-4 text-gray-400'}>
                                {loading ? 'Loading...' : ''}
                            </div>
                        )}
                    </LayoutGroup>
                </div>
            </DatasetsContext.Provider>
        </Layout>
    )
}
