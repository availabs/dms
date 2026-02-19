import React, {useState, useEffect, useContext, useMemo} from 'react'
import {get} from "lodash-es";
import {Link, useSearchParams} from "react-router";
import {DatasetsContext} from "../../context";
import {ThemeContext} from "../../../../ui/useTheme";
import { buildEnvsForListing, getExternalEnv } from "../../utils/datasources";
import Breadcrumbs from "../../components/Breadcrumbs";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

const sourcesCache = new Map();

const getSources = async ({envs, falcor, parent, user}) => {
    if(!envs || !Object.keys(envs)) return [];
    const lenRes = await falcor.get(['uda', Object.keys(envs), 'sources', 'length']);

    const sources = await Promise.all(
        Object.keys(envs).map(async e => {
            const len = get(lenRes, ['json', 'uda', e, 'sources', 'length']);
            if(!len) return [];

            const r = await falcor.get(['uda', e, 'sources', 'byIndex', {from: 0, to: len - 1}, envs[e].srcAttributes]);

            const valueGetter = (i, attr) => get(r, ['json', 'uda', e, 'sources', 'byIndex', i, attr])
            return range(0, len-1).map(i => {
                const doc_type = valueGetter(i, 'doc_type');
                const app = valueGetter(i, 'app');
                const env = doc_type ? `${app}+${doc_type}` : e;
                return {
                    ...envs[e].srcAttributes.reduce((acc, attr) => {
                        let value = valueGetter(i, attr);
                        if(['metadata'].includes(attr)) {
                            value = value?.columns || [];
                            return ({...acc, ['columns']: value})
                        }
                        if(['config'].includes(attr)) {
                            value =  JSON.parse(value || '{}')?.attributes || [];
                            return ({...acc, ['columns']: value})
                        }

                        if(['categories'].includes(attr)) {
                            value = typeof value === 'string' ? JSON.parse(value || '[]') : (value || []);
                            return ({...acc, ['categories']: value})
                        }
                        return ({...acc, [attr]: value})
                    }, {}),
                    source_id: get(r, ['json', 'uda', e, 'sources', 'byIndex', i, '$__path', 4]),
                    env, // to fetch data
                    srcEnv: e, // to refer back
                    isDms: envs[e].isDms // mostly to apply data->>
                }
            });
        }));
    return sources.reduce((acc, curr) => [...acc, ...curr], []);
}


const SourceThumb = React.memo(({ source={}, format }) => {
    const {UI} = useContext(DatasetsContext);
    const {theme} = useContext(ThemeContext) || {};
    const t = theme?.datasets?.datasetsList || {};
    const {ColumnTypes} = UI;
    const Lexical = ColumnTypes.lexical.ViewComp;
    const source_id = source.id || source.source_id;
    const {isDms} = source;
    const icon = isDms ? (format.registerFormats || []).find(f => f?.type?.includes('|source'))?.type === source.type ? 'Datasets' : 'Forms' : 'External';

    return (
        <div className={t.sourceCard}>
            <div>
                <Link to={`${isDms ? 'internal_source' : 'source'}/${source_id}`} className={t.sourceTitle}>
                    <span>{source?.name || source?.doc_type}</span> <span className={t.sourceTypeLabel}>{icon}</span>
                </Link>
                <div>
                    {(Array.isArray(source?.categories) ? source?.categories : [])
                        .map(cat => (typeof cat === 'string' ? [cat] : cat).map((s, i) => (
                            <Link key={i} to={`?cat=${i > 0 ? cat[i - 1] + "/" : ""}${s}`}
                                  className={t.sourceCategoryBadge}>{s}</Link>
                        )))
                    }
                </div>
                <div className={t.sourceDescription}>
                    <Lexical value={source?.description}/>
                </div>
            </div>
        </div>
    );
});

export default function ({attributes, item, dataItems, apiLoad, apiUpdate, updateAttribute, format, submit, ...r}) {
    const {baseUrl, user, falcor, siteType, type, datasources, UI} = useContext(DatasetsContext);
    const {theme} = useContext(ThemeContext) || {};
    const t = theme?.datasets?.datasetsList || {};
    const {Layout, Icon, Button, Input} = UI;
    const cacheKey = `${format?.app}-${siteType}`;
    const [sources, setSources] = useState(() => sourcesCache.get(cacheKey) || []);
    const [layerSearch, setLayerSearch] = useState("");
    const [searchParams] = useSearchParams();
    const [sort, setSort] = useState('asc');
    const cat1 = searchParams.get('cat');
    const envs = useMemo(() => buildEnvsForListing(datasources, format), [datasources, format]);
    const pgEnv = getExternalEnv(datasources);
    const [filteredCategories, setFilteredCategories] = useState([]);
    const [isListAll, setIsListAll] = useState(false);

    useEffect(() => {
        getSources({envs, falcor, apiLoad, user}).then(data => {
            setSources(data);
            sourcesCache.set(cacheKey, data);
        });
    }, [format?.app, siteType]);

    useEffect(() => {
        if (!pgEnv) return;
        falcor.get(["dama-info", pgEnv, "settings"]).then(res => {
            const settings = get(res, ["json", "dama-info", pgEnv, "settings"]);
            const parsed = typeof settings === 'string' ? JSON.parse(settings || '{}') : (settings || {});
            setFilteredCategories(parsed.filtered_categories || []);
        });
    }, [pgEnv]);

    const isSearching = layerSearch.length > 2;

    const visibleSources = useMemo(() => {
        if (isListAll || isSearching) return sources || [];
        return (sources || []).filter(source => {
            const cats = (Array.isArray(source?.categories) ? source.categories : []).map(c => c[0]);
            if (!cats.length) return false;
            if (!filteredCategories.length) return true;
            return !cats.every(c => filteredCategories.includes(c));
        });
    }, [sources, filteredCategories, isListAll, isSearching]);

    const categories = useMemo(() => [...new Set(
        (visibleSources || [])
            .reduce((acc, s) => [...acc, ...((Array.isArray(s?.categories) ? s?.categories : [])?.map(s1 => s1[0]) || [])], []))]
            .filter(c => isListAll || !filteredCategories.includes(c))
            .sort(),
    [visibleSources, filteredCategories, isListAll]);

    const categoriesCount = useMemo(() => categories.reduce((acc, cat) => {
        acc[cat] = (visibleSources || []).filter(p => p?.categories).filter(pattern => {
            return (Array.isArray(pattern?.categories) ? pattern?.categories : [pattern?.categories])
                ?.find(category => category.includes(cat))
        })?.length
        return acc;
    }, {}), [visibleSources, categories]);

    const catParts = useMemo(() => cat1 ? cat1.split('/') : [], [cat1]);
    const activeTopCat = catParts[0] || null;

    const subCategories = useMemo(() => {
        if (!activeTopCat) return [];
        return [...new Set(
            (visibleSources || [])
                .flatMap(s => (Array.isArray(s?.categories) ? s.categories : []))
                .filter(cat => cat[0] === activeTopCat && cat.length > 1)
                .map(cat => cat[1])
        )].sort();
    }, [visibleSources, activeTopCat]);

    const breadcrumbItems = useMemo(() => {
        const items = [{icon: 'Database', href: baseUrl}];
        if (cat1) {
            catParts.forEach((part, i) => {
                items.push({
                    name: part,
                    ...(i < catParts.length - 1 ? {href: `${baseUrl}?cat=${catParts.slice(0, i + 1).join('/')}`} : {}),
                });
            });
        }
        return items;
    }, [cat1, catParts, baseUrl]);

    return (
        <Layout navItems={[]}>
          <div className={t.pageWrapper}>
            <div className={t.header}>
                <Breadcrumbs items={breadcrumbItems} />
                <div className={t.toolbar}>
                    <div className={t.toolbarSearch}>
                        <Input
                            placeholder="Search datasources"
                            value={layerSearch}
                            onChange={(e) => setLayerSearch(e.target.value)}
                        />
                    </div>

                    <Button
                        type="plain"
                        title={'Toggle Sort'}
                        onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}
                    >
                        <Icon icon={sort === 'asc' ? 'SortDesc' : 'SortAsc'} className="size-5"/>
                    </Button>

                    {filteredCategories.length > 0 &&
                        <Button
                            type="plain"
                            title={isListAll ? 'Show filtered' : 'Show all'}
                            onClick={() => setIsListAll(!isListAll)}
                        >
                            <Icon icon={isListAll ? 'FilterX' : 'Filter'} className="size-5"/>
                        </Button>
                    }

                    {
                        user?.authed &&
                        <Link to={`${baseUrl}/settings`} title={'Settings'}>
                            <Icon icon="Settings" className="size-5"/>
                        </Link>
                    }

                    {
                        user?.authed &&
                        <Link to={`${baseUrl}/create`} title={'Add'}>
                            <Icon icon="CirclePlus" className="size-5"/>
                        </Link>
                    }

                </div>
            </div>
            <div className={t.body}>
                <div className={t.sidebar}>
                    {(categories || [])
                        .sort((a,b) => a.localeCompare(b))
                        .map(cat => (
                            <React.Fragment key={cat}>
                                <Link
                                    className={activeTopCat === cat ? t.sidebarItemActive : t.sidebarItem}
                                    to={`?cat=${cat}`}
                                >
                                    <span className={t.sidebarItemText}>{cat}</span>
                                    <div className={t.sidebarBadge}>{categoriesCount[cat]}</div>
                                </Link>
                                {activeTopCat === cat && subCategories.map(sub => {
                                    const subPath = `${cat}/${sub}`;
                                    return (
                                        <Link
                                            key={sub}
                                            className={cat1 === subPath ? t.sidebarSubItemActive : t.sidebarSubItem}
                                            to={`?cat=${subPath}`}
                                        >
                                            <span className={t.sidebarItemText}>{sub}</span>
                                        </Link>
                                    );
                                })}
                            </React.Fragment>
                        ))
                    }
                </div>
                <div className={t.sourceList}>
                    {
                        (visibleSources || [])
                            .filter(source => {
                                if (!cat1) return true;
                                return (Array.isArray(source?.categories) ? source?.categories : [])
                                    .some(cat => catParts.every((p, i) => cat[i] === p));
                            })
                            .filter(source => {
                                let searchTerm = ((source?.name || source?.doc_type) + " " + (
                                    (Array.isArray(source?.categories) ? source?.categories : [source?.categories]) || [])
                                    .reduce((out,cat) => {
                                        out += Array.isArray(cat) ? cat.join(' ') : typeof cat === 'string' ? cat : '';
                                        return out
                                    },''));
                                return !layerSearch.length > 2 || searchTerm.toLowerCase().includes(layerSearch.toLowerCase());
                            })
                            .sort((a,b) => {
                                const m = sort === 'asc' ? 1 : -1;
                                return m * a?.doc_type?.localeCompare(b?.doc_type)
                            })
                            .map((s, i) => <SourceThumb key={s.source_id || s.id || i} source={s} baseUrl={baseUrl} format={format} />)
                    }
                </div>
            </div>
          </div>
        </Layout>
    )
}
