import React, {useState, useEffect, useContext, useMemo} from 'react'
import {get} from "lodash-es";
import {Link, useSearchParams} from "react-router";
import {DatasetsContext} from "../../context";
import {ThemeContext, getComponentTheme} from "../../../../ui/useTheme";
import {dataItemsNav} from "../../../../utils/nav";
import { buildEnvsForListing, getExternalEnv } from "../../utils/datasources";
import { getCachedSources, setCachedSources, hasCachedSources } from "../../utils/datasetsListCache";
import { datasetsListTheme } from "./datasetsList.theme";
import Breadcrumbs from "../../components/Breadcrumbs";
import { FALLBACK_SWATCHES, catColor, splitCategories } from "../../utils/categoryColors";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

/**
 * Extract plain text from a Lexical JSON description. The list view only
 * needs a short, scannable snippet — mounting a full Lexical Editor per
 * source is expensive (50+ editors on a page with 50 sources).
 */
function extractLexicalText(value) {
    if (value == null) return '';
    let node = value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';
        try { node = JSON.parse(trimmed); }
        catch { return value; } // not JSON — treat as plain text
    }
    if (!node?.root) return '';
    const out = [];
    const walk = (n) => {
        if (!n) return;
        if (typeof n.text === 'string') out.push(n.text);
        if (Array.isArray(n.children)) n.children.forEach(walk);
    };
    walk(node.root);
    return out.join(' ').replace(/\s+/g, ' ').trim();
}

// Source-type → badge (icon + label). Drives the card/table type chip. Sources
// only carry `type` + `isDms` at list level, so we classify off those.
const typeBadge = (source = {}) => {
    const ty = (source.type || '').toLowerCase();
    if (ty.includes('gis')) return { label: 'GIS', icon: 'MapLayers' };
    if (ty.includes('csv')) return { label: 'CSV', icon: 'Columns' };
    if (source.isDms)       return { label: 'Internal', icon: 'Database' };
    return { label: 'External', icon: 'Link' };
};


const getSources = async ({envs, falcor, parent, user}) => {
    if(!envs || !Object.keys(envs)) return [];
    console.log('[getSources] querying UDA for envs:', Object.keys(envs));
    const lenRes = await falcor.get(['uda', Object.keys(envs), 'sources', 'length']);
    console.log('[getSources] UDA lengths:', Object.keys(envs).map(e => `${e}: ${get(lenRes, ['json', 'uda', e, 'sources', 'length'])}`));

    const sources = await Promise.all(
        Object.keys(envs).map(async e => {
            const len = get(lenRes, ['json', 'uda', e, 'sources', 'length']);
            if(!len) return [];

            const r = await falcor.get(['uda', e, 'sources', 'byIndex', {from: 0, to: len - 1}, envs[e].srcAttributes]);

            const valueGetter = (i, attr) => get(r, ['json', 'uda', e, 'sources', 'byIndex', i, attr])
            return range(0, len-1).map(i => {
                const env = e;
                return {
                    ...envs[e].srcAttributes.reduce((acc, attr) => {
                        let value = valueGetter(i, attr);
                        if (attr === 'categories') {
                            value = typeof value === 'string' ? JSON.parse(value || '[]') : (value || []);
                        }
                        return ({...acc, [attr]: value});
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

// ── card / row pieces (shared across grid + full-width + table views) ──────────
const TypeChip = ({ source, t, Icon }) => {
    const { label, icon } = typeBadge(source);
    return <span className={t.typeBadge}><Icon icon={icon} className={t.typeBadgeIcon}/>{label}</span>;
};

// card category badges: top-level = colored pill, secondary = light chip
const CategoryPills = ({ source, t, swatches }) => {
    const { tops, subs } = splitCategories(source);
    return (
        <>
            {tops.map(area => (
                <Link key={area} to={`?cat=${area}`} className={t.categoryPill} style={{ '--cat': catColor(area, swatches) }}>
                    <span className={t.categoryDot} style={{ backgroundColor: catColor(area, swatches) }}/>{area}
                </Link>
            ))}
            {subs.map(s => (
                <Link key={s.path} to={`?cat=${s.path}`} className={t.subCategoryPill}>{s.label}</Link>
            ))}
        </>
    );
};

// table category cell: compact dot + label for top-level, light chip for secondary
const TableCategory = ({ source, t, swatches }) => {
    const { tops, subs } = splitCategories(source);
    return (
        <div className={t.tableCatWrap}>
            {tops.map(area => (
                <Link key={area} to={`?cat=${area}`} className={t.tableCatItem}>
                    <span className={t.tableCatDot} style={{ backgroundColor: catColor(area, swatches) }}/>{area}
                </Link>
            ))}
            {subs.map(s => (
                <Link key={s.path} to={`?cat=${s.path}`} className={t.subCategoryPill}>{s.label}</Link>
            ))}
        </div>
    );
};

const SourceCard = React.memo(({ source = {}, t, Icon, swatches, full }) => {
    const source_id = source.id || source.source_id;
    const { isDms } = source;
    const href = `${isDms ? 'internal_source' : 'source'}/${source_id}`;
    const descriptionText = useMemo(() => extractLexicalText(source?.description), [source?.description]);
    return (
        <div className={full ? t.cardFull : t.card}>
            <div className={full ? t.cardFullMain : undefined}>
                <div className={t.cardBadges}>
                    <TypeChip source={source} t={t} Icon={Icon} />
                    <CategoryPills source={source} t={t} swatches={swatches} />
                </div>
                <Link to={href} className={t.cardTitle}>{source?.name}</Link>
                {descriptionText && <div className={t.cardDescription}>{descriptionText}</div>}
            </div>
            <Link to={href} className={t.cardView}>view →</Link>
        </div>
    );
});

export default function DatasetsList ({attributes, item, dataItems, apiLoad, apiUpdate, updateAttribute, format, submit, ...r}) {
    const {baseUrl, user, falcor, siteType, type, datasources, dmsEnv, UI, parent} = useContext(DatasetsContext);
    const {theme} = useContext(ThemeContext) || {};
    const t = {...datasetsListTheme, ...getComponentTheme(theme, 'datasets.datasetsList')};
    // Secondary nav shared across the subdomain's patterns — items are authored
    // site-absolute in the pattern theme, so baseUrl is '' (not this pattern's
    // mount path, which would break links into sibling patterns).
    const menuItemsSecondNav = useMemo(
        () => dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [], parent?.navPrefix || '', false),
        [theme?.navOptions?.secondaryNav?.navItems, parent?.navPrefix]
    );
    const {Layout, Icon, Button, Input} = UI;
    const swatches = t.categorySwatches || FALLBACK_SWATCHES;
    const cacheKey = `${format?.app}-${siteType}`;
    const [sources, setSources] = useState(() => getCachedSources(cacheKey) || []);
    const [layerSearch, setLayerSearch] = useState("");
    const [searchParams] = useSearchParams();
    const [sort, setSort] = useState('asc');
    const [view, setView] = useState(() => {
        try { return localStorage.getItem(`${cacheKey}-view`) || 'grid'; } catch { return 'grid'; }
    });
    const setViewPersist = (v) => { setView(v); try { localStorage.setItem(`${cacheKey}-view`, v); } catch {} };
    const cat1 = searchParams.get('cat');
    const envs = useMemo(() => buildEnvsForListing(datasources, format, dmsEnv), [datasources, format, dmsEnv]);
    const pgEnv = getExternalEnv(datasources);
    const [filteredCategories, setFilteredCategories] = useState([]);
    const [showUncategorized, setShowUncategorized] = useState(true);
    const [isListAll, setIsListAll] = useState(false);

    useEffect(() => {
        // Skip the fetch if we already rendered this list once during the
        // session — Falcor still has the data and the module-level cache
        // already populated `sources` synchronously via useState's initializer.
        // Pages that mutate sources (CreatePage etc.) are responsible for
        // invalidating `['uda', env, 'sources']` and clearing `sourcesCache`
        // before navigating back here.
        if (hasCachedSources(cacheKey)) return;
        getSources({envs, falcor, apiLoad, user}).then(data => {
            setSources(data);
            setCachedSources(cacheKey, data);
        });
    }, [cacheKey]);

    useEffect(() => {
        if (!pgEnv) return;
        falcor.get(["uda", pgEnv, "settings"]).then(res => {
            const settings = get(res, ["json", "uda", pgEnv, "settings"]);
            const parsed = typeof settings === 'string' ? JSON.parse(settings || '{}') : (settings || {});
            setFilteredCategories(parsed.filtered_categories || []);
            if (parsed.show_uncategorized !== undefined) {
                setShowUncategorized(parsed.show_uncategorized);
            }
        });
    }, [pgEnv]);

    const isSearching = layerSearch.length > 2;

    const visibleSources = useMemo(() => {
        if (isListAll || isSearching) return sources || [];
        return (sources || []).filter(source => {
            const cats = (Array.isArray(source?.categories) ? source.categories : []).map(c => c[0]);
            if (!cats.length) return showUncategorized;
            if (!filteredCategories.length) return true;
            return !cats.every(c => filteredCategories.includes(c));
        });
    }, [sources, filteredCategories, showUncategorized, isListAll, isSearching]);

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

    // sources after category-path + search + sort (the rendered set)
    const shownSources = useMemo(() => (visibleSources || [])
        .filter(source => {
            if (!cat1) return true;
            return (Array.isArray(source?.categories) ? source?.categories : [])
                .some(cat => catParts.every((p, i) => cat[i] === p));
        })
        .filter(source => {
            const searchTerm = ((source?.name || '') + " " + (
                (Array.isArray(source?.categories) ? source?.categories : [source?.categories]) || [])
                .reduce((out, cat) => out + (Array.isArray(cat) ? cat.join(' ') : typeof cat === 'string' ? cat : ''), ''));
            return !(layerSearch.length > 2) || searchTerm.toLowerCase().includes(layerSearch.toLowerCase());
        })
        .sort((a, b) => (sort === 'asc' ? 1 : -1) * (a?.name || '').localeCompare(b?.name || '')),
    [visibleSources, cat1, catParts, layerSearch, sort]);

    const VIEWS = [
        { key: 'grid',  d: 'M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z' },
        { key: 'cards', d: 'M3 4.5h18v6H3zM3 13.5h18v6H3z' },
        { key: 'table', d: 'M3 6h18M3 12h18M3 18h18' },
    ];

    return (
        <Layout navItems={[]} secondNav={menuItemsSecondNav}>
          <div className={t.pageWrapper}>
            <Breadcrumbs items={breadcrumbItems} />
            <div className={t.header}>
                <div className={t.count}>{shownSources.length} datasets · {categories.length} categories</div>
                <div className={t.toolbar}>
                    <div className={t.toolbarSearch}>
                        <Input
                            placeholder="Search datasources"
                            value={layerSearch}
                            onChange={(e) => setLayerSearch(e.target.value)}
                        />
                    </div>

                    <div className={t.viewSwitcher}>
                        {VIEWS.map(v => (
                            <button key={v.key} title={v.key} onClick={() => setViewPersist(v.key)}
                                    className={view === v.key ? t.viewBtnActive : t.viewBtn}>
                                <svg className={t.viewBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                                    <path d={v.d}/>
                                </svg>
                            </button>
                        ))}
                    </div>

                    <Button type="plain" title={'Toggle Sort'} onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}>
                        <Icon icon={sort === 'asc' ? 'SortDesc' : 'SortAsc'} className={t.iconMd}/>
                    </Button>

                    {filteredCategories.length > 0 &&
                        <Button type="plain" title={isListAll ? 'Show filtered' : 'Show all'} onClick={() => setIsListAll(!isListAll)}>
                            <Icon icon={isListAll ? 'FilterX' : 'Filter'} className={t.iconMd}/>
                        </Button>
                    }

                    {user?.authed &&
                        <Link to={`${baseUrl}/settings`} title={'Settings'}><Icon icon="Settings" className={t.iconMd}/></Link>}

                    {user?.authed &&
                        <Link to={`${baseUrl}/create`} title={'Add'} className={t.newBtn}><Icon icon="CirclePlus" className={t.iconMd}/></Link>}
                </div>
            </div>
            <div className={t.body}>
                <div className={t.sidebar}>
                    <Link to={'?'} className={!cat1 ? t.sidebarItemActive : t.sidebarItem}>
                        <span className={t.sidebarItemText}>All datasets</span>
                        <div className={t.sidebarBadge}>{(visibleSources || []).length}</div>
                    </Link>
                    {(categories || [])
                        .sort((a,b) => a.localeCompare(b))
                        .map(cat => (
                            <React.Fragment key={cat}>
                                <Link className={activeTopCat === cat ? t.sidebarItemActive : t.sidebarItem} to={`?cat=${cat}`}>
                                    <span className={t.sidebarItemText}>
                                        <span className={t.sidebarDot} style={{ backgroundColor: catColor(cat, swatches) }}/>{cat}
                                    </span>
                                    <div className={t.sidebarBadge}>{categoriesCount[cat]}</div>
                                </Link>
                                {activeTopCat === cat && subCategories.map(sub => {
                                    const subPath = `${cat}/${sub}`;
                                    return (
                                        <Link key={sub} className={cat1 === subPath ? t.sidebarSubItemActive : t.sidebarSubItem} to={`?cat=${subPath}`}>
                                            <span className={t.sidebarItemText}>{sub}</span>
                                        </Link>
                                    );
                                })}
                            </React.Fragment>
                        ))
                    }
                </div>

                {view === 'table' ? (
                    <div className={t.tableWrap}>
                        <table className={t.table}>
                            <thead><tr className={t.theadRow}>
                                <th className={t.th}>Name</th>
                                <th className={t.th}>Type</th>
                                <th className={t.th}>Category</th>
                                <th className={t.th}>Description</th>
                            </tr></thead>
                            <tbody>
                                {shownSources.map((s, i) => {
                                    const sid = s.id || s.source_id;
                                    return (
                                        <tr key={sid || i} className={t.tr}>
                                            <td className={t.td}>
                                                <Link to={`${s.isDms ? 'internal_source' : 'source'}/${sid}`} className={t.tdName}>{s?.name}</Link>
                                            </td>
                                            <td className={t.td}><TypeChip source={s} t={t} Icon={Icon} /></td>
                                            <td className={t.td}><TableCategory source={s} t={t} swatches={swatches} /></td>
                                            <td className={t.tdMuted}>{extractLexicalText(s?.description)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={view === 'cards' ? t.sourceStack : t.sourceGrid}>
                        {shownSources.map((s, i) =>
                            <SourceCard key={s.source_id || s.id || i} source={s} t={t} Icon={Icon} swatches={swatches} full={view === 'cards'} />
                        )}
                    </div>
                )}
            </div>
          </div>
        </Layout>
    )
}
