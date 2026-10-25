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
import { FALLBACK_SWATCHES, catColor, splitCategories, catHref } from "../../utils/categoryColors";
import { resolveHiddenForPattern, catalogVisibility, hiddenLifecycleOf } from "../../utils/lifecycle";
import { authoritativeViews, authoritySummary } from "../../utils/authority";
import { udaGetSourceAuthorities, udaGetSourcesSupersededBy, udaGetViewLabels } from "../../../../api";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

// Sentinel `cat` value for the "no category" sidebar filter — distinct from any
// real category name, never appears in a source's `categories` array.
const UNCATEGORIZED_CAT = '__uncategorized__';

// Source type of a file upload (lexical inline images, the Card image column,
// the file_upload CreatePage). The server excludes these from the default
// `sources` enumeration — see dms-server `hidden_source_types`.
const UPLOAD_SOURCE_TYPE = 'file_upload';

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


// `collection` picks which server-side enumeration to read: 'sources' hides the
// env's `settings.hidden_source_types` (default `file_upload` — one row per
// lexical/Card image upload, which on a long-lived env is the great majority of
// the table), 'sourcesAll' hides nothing. Both resolve to the same
// `sources.byId` rows, so `$__path` still yields the source id either way.
const getSources = async ({envs, falcor, parent, user, collection = 'sources'}) => {
    if(!envs || !Object.keys(envs)) return [];
    console.log('[getSources] querying UDA for envs:', Object.keys(envs), 'collection:', collection);
    const lenRes = await falcor.get(['uda', Object.keys(envs), collection, 'length']);
    console.log('[getSources] UDA lengths:', Object.keys(envs).map(e => `${e}: ${get(lenRes, ['json', 'uda', e, collection, 'length'])}`));

    const sources = await Promise.all(
        Object.keys(envs).map(async e => {
            const len = get(lenRes, ['json', 'uda', e, collection, 'length']);
            if(!len) return [];

            const r = await falcor.get(['uda', e, collection, 'byIndex', {from: 0, to: len - 1}, envs[e].srcAttributes]);

            const valueGetter = (i, attr) => get(r, ['json', 'uda', e, collection, 'byIndex', i, attr])
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
                    // `$__path` is the RESOLVED path — always ['uda', env,
                    // 'sources', 'byId', id] — so index 4 is the id whichever
                    // collection was requested.
                    source_id: get(r, ['json', 'uda', e, collection, 'byIndex', i, '$__path', 4]),
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
                <Link key={area} to={catHref(area)} className={t.categoryPill} style={{ '--cat': catColor(area, swatches) }}>
                    <span className={t.categoryDot} style={{ backgroundColor: catColor(area, swatches) }}/>{area}
                </Link>
            ))}
            {subs.map(s => (
                <Link key={s.path} to={catHref(s.path)} className={t.subCategoryPill}>{s.label}</Link>
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
                <Link key={area} to={catHref(area)} className={t.tableCatItem}>
                    <span className={t.tableCatDot} style={{ backgroundColor: catColor(area, swatches) }}/>{area}
                </Link>
            ))}
            {subs.map(s => (
                <Link key={s.path} to={catHref(s.path)} className={t.subCategoryPill}>{s.label}</Link>
            ))}
        </div>
    );
};

const sourceHref = (source = {}) => `${source.isDms ? 'internal_source' : 'source'}/${source.id || source.source_id}`;

// Authority at a glance (utils/authority.js authoritySummary): ★ <view label> or ★ N keyed. Undecided
// sources render nothing unless the theme sets `authUndecidedChip` (blank by default, owner 2026-10-21).
// No `chip` means unknown (not loaded, or the request failed) and also renders nothing.
const AuthorityChip = ({ chip, t }) => {
    if (!chip) return null;
    if (chip.state === 'undecided') {
        return t.authUndecidedChip ? <span className={t.authUndecidedChip} title={chip.title}>{chip.text}</span> : null;
    }
    return <span className={t.authChip} title={chip.title}>{chip.text}</span>;
};

// "superseded by <name> →" when the source's metadata names its successor
const SupersededLine = ({ successor, t }) => {
    if (!successor) return null;
    return <div className={t.supersededLine}>superseded by <Link to={successor.href} className={t.supersededLink}>{successor.name} →</Link></div>;
};

const SourceCard = React.memo(({ source = {}, t, Icon, swatches, full, chip, successor }) => {
    const href = sourceHref(source);
    const descriptionText = useMemo(() => extractLexicalText(source?.description), [source?.description]);
    return (
        <div className={full ? t.cardFull : t.card}>
            <div className={full ? t.cardFullMain : undefined}>
                <div className={t.cardBadges}>
                    <TypeChip source={source} t={t} Icon={Icon} />
                    <CategoryPills source={source} t={t} swatches={swatches} />
                    <AuthorityChip chip={chip} t={t} />
                </div>
                <Link to={href} className={t.cardTitle}>{source?.name}</Link>
                <SupersededLine successor={successor} t={t} />
                {descriptionText && <div className={t.cardDescription}>{descriptionText}</div>}
            </div>
            <Link to={href} className={t.cardView}>view →</Link>
        </div>
    );
});

// Signed-in search hits that sit in a hidden lifecycle (Archive, Sandbox, …), shown in their own
// labelled group under the results instead of among them (owner 2026-10-21).
const HiddenMatches = ({ matches, t, Icon, hiddenSet, chips, successors, keyOf }) => (
    <div className={t.hiddenMatchWrap}>
        <div className={t.hiddenMatchHeader}>
            {t.hiddenMatchIcon && <Icon icon={t.hiddenMatchIcon} className={t.hiddenMatchIconClass}/>}
            <span>in hidden lifecycles · {matches.length}</span>
            <span className={t.hiddenMatchNote}>signed-in only</span>
        </div>
        <div className={t.hiddenMatchList}>
            {matches.map((s, i) => {
                const href = sourceHref(s);
                const k = keyOf(s);
                return (
                    <div key={k || i} className={t.hiddenMatchRow}>
                        <div className={t.hiddenMatchMain}>
                            <div className={t.hiddenMatchBadges}>
                                <span className={t.lifecycleChip}>
                                    {t.lifecycleChipIcon && <Icon icon={t.lifecycleChipIcon} className={t.lifecycleChipIconClass}/>}
                                    {hiddenLifecycleOf(s, hiddenSet)}
                                </span>
                                <AuthorityChip chip={chips[k]} t={t} />
                            </div>
                            <Link to={href} className={t.hiddenMatchTitle}>{s?.name}</Link>
                            <SupersededLine successor={successors[k]} t={t} />
                            <div className={t.hiddenMatchDescription}>{extractLexicalText(s?.description)}</div>
                        </div>
                        <Link to={href} className={t.hiddenMatchView}>view →</Link>
                    </div>
                );
            })}
        </div>
    </div>
);

export default function DatasetsList ({attributes, item, dataItems, apiLoad, apiUpdate, updateAttribute, format, submit, ...r}) {
    const {baseUrl, user, falcor, siteType, type, datasources, dmsEnv, UI, parent, isUserAuthed} = useContext(DatasetsContext);
    // Toolbar controls, shown to the users the server lets use them.
    const canCreate = isUserAuthed ? isUserAuthed(['create-source']) : false;
    const canEditPattern = isUserAuthed ? isUserAuthed(['edit-pattern']) : false;
    const {theme} = useContext(ThemeContext) || {};
    const t = {...datasetsListTheme, ...getComponentTheme(theme, 'datasets.datasetsList')};
    // Secondary nav shared across the subdomain's patterns — items are authored
    // site-absolute in the pattern theme, so baseUrl is '' (not this pattern's
    // mount path, which would break links into sibling patterns).
    const menuItemsSecondNav = useMemo(
        () => dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [], parent?.navPrefix || '', false),
        [theme?.navOptions?.secondaryNav?.navItems, parent?.navPrefix]
    );
    const {Layout, Icon, Button, Input, Table} = UI;
    const catalogGridRef = React.useRef();
    const swatches = t.categorySwatches || FALLBACK_SWATCHES;
    const cacheKey = `${format?.app}-${siteType}`;
    // Uploaded-file sources are excluded by the server from the default
    // enumeration (see getSources). Asking for them is explicit and separate
    // from "Show all" — on an env like hazmit_dama it is an 11k-row fetch,
    // which is not what someone reaching for a category filter wants.
    const [showUploads, setShowUploads] = useState(false);
    const collection = showUploads ? 'sourcesAll' : 'sources';
    const sourcesCacheKey = `${cacheKey}-${collection}`;
    const [sources, setSources] = useState(() => getCachedSources(sourcesCacheKey) || []);
    // true once this collection has been fetched (or restored from cache) — gates the empty state
    // so it never flashes while sources are still loading.
    const [loaded, setLoaded] = useState(() => hasCachedSources(sourcesCacheKey));
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
    const [isListAll, setIsListAll] = useState(false);
    // authority facet in the rail: null | 'single' | 'keyed' | 'undecided' (authoritySummary states)
    const [authorityFacet, setAuthorityFacet] = useState(null);
    // Lifecycle hiding is per PATTERN: one env can feed several catalogs (five
    // apps bind hazmit_dama), and a curated county catalog and a developer's view
    // want different hide sets. The pattern stores only a `{hide, show}` DELTA
    // against the library defaults, so a lifecycle added later reaches existing
    // patterns instead of freezing at the moment each was created.
    const [settings, setSettings] = useState({});
    const hiddenSet = useMemo(
        () => resolveHiddenForPattern(settings, parent?.id),
        [settings, parent?.id]
    );

    useEffect(() => {
        // Skip the fetch if we already loaded this collection once during the
        // session — Falcor still has the data. The cached array is applied
        // explicitly rather than relying on useState's initializer, which runs
        // only on mount and so wouldn't restore anything when the upload
        // toggle flips the key back to a collection already fetched.
        // Pages that mutate sources (CreatePage etc.) are responsible for
        // invalidating `['uda', env, 'sources']` and clearing `sourcesCache`
        // before navigating back here.
        if (hasCachedSources(sourcesCacheKey)) {
            setSources(getCachedSources(sourcesCacheKey) || []);
            setLoaded(true);
            return;
        }
        setLoaded(false);
        getSources({envs, falcor, apiLoad, user, collection}).then(data => {
            setSources(data);
            setCachedSources(sourcesCacheKey, data);
            setLoaded(true);
        });
    }, [sourcesCacheKey]);

    useEffect(() => {
        if (!pgEnv) return;
        falcor.get(["uda", pgEnv, "settings"]).then(res => {
            const settings = get(res, ["json", "uda", pgEnv, "settings"]);
            const parsed = typeof settings === 'string' ? JSON.parse(settings || '{}') : (settings || {});
            setFilteredCategories(parsed.filtered_categories || []);
            setSettings(parsed);
        });
    }, [pgEnv]);

    // Authority on the list (utils/authority.js), fetched after the sources, per env, in their own
    // requests so an older server can't fail the list: the authority records, the successor named by
    // `metadata.superseded_by`, then the labels of the authoritative views. Kept beside `sources`,
    // keyed `${srcEnv}|${id}`, never on the cached source objects. File uploads are skipped (they have
    // no authority, and an env like hazmit_dama holds 11k of them).
    const [authorityInfo, setAuthorityInfo] = useState(null);
    useEffect(() => {
        if (!loaded || !sources?.length) return;
        let cancelled = false;
        const idsByEnv = {};
        for (const s of sources) {
            if (s?.type !== UPLOAD_SOURCE_TYPE && s?.source_id != null) (idsByEnv[s.srcEnv] ??= []).push(+s.source_id);
        }
        Promise.all(Object.entries(idsByEnv).map(async ([env, source_ids]) => {
            const [records, successors] = await Promise.all([
                udaGetSourceAuthorities(falcor, { env, source_ids }),
                udaGetSourcesSupersededBy(falcor, { env, source_ids }),
            ]);
            const view_ids = Object.values(records).flatMap(r => authoritativeViews(r).map(e => e.view_id));
            const labels = await udaGetViewLabels(falcor, { env, view_ids, isDms: envs[env]?.isDms });
            return { env, records, successors, labels };
        })).then(results => {
            if (cancelled) return;
            const out = { records: {}, successors: {}, labels: {} };
            for (const { env, records, successors, labels } of results) {
                for (const [id, r] of Object.entries(records)) out.records[`${env}|${id}`] = r;
                for (const [id, v] of Object.entries(successors)) if (v != null) out.successors[`${env}|${id}`] = v;
                for (const [id, l] of Object.entries(labels)) out.labels[`${env}|${id}`] = l;
            }
            setAuthorityInfo(out);
        });
        return () => { cancelled = true; };
    }, [sources, loaded]);

    const sourceKey = (s) => `${s?.srcEnv}|${s?.source_id}`;
    // per source: the chip ({state, text, title}); absent = unknown, which renders nothing
    const authorityChips = useMemo(() => {
        const out = {};
        if (!authorityInfo) return out;
        for (const s of (sources || [])) {
            const k = sourceKey(s);
            if (!(k in authorityInfo.records)) continue;
            out[k] = authoritySummary(authorityInfo.records[k], vid => authorityInfo.labels[`${s.srcEnv}|${vid}`]);
        }
        return out;
    }, [sources, authorityInfo]);
    // per source: its successor's {name, href}, looked up in the loaded list (hidden sources included)
    const successors = useMemo(() => {
        const out = {};
        if (!authorityInfo) return out;
        const byKey = Object.fromEntries((sources || []).map(s => [sourceKey(s), s]));
        for (const [k, succId] of Object.entries(authorityInfo.successors)) {
            const env = k.slice(0, k.lastIndexOf('|'));
            const succ = byKey[`${env}|${succId}`];
            out[k] = succ ? { name: succ.name, href: sourceHref(succ) } : { name: `source ${succId}`, href: `source/${succId}` };
        }
        return out;
    }, [sources, authorityInfo]);

    const isSearching = layerSearch.length > 2;

    // The catalog's pool for this mode (utils/lifecycle.js catalogVisibility). Uncategorized and
    // legacy-filtered sources join it only under "Show all"; a source in a hidden lifecycle never
    // does, in any mode, so search (which filters this pool) can't surface one either.
    const { visible: visibleSources, hidden: lifecycleHidden } = useMemo(() => catalogVisibility({
        sources,
        hiddenSet,
        legacyFiltered: filteredCategories,
        listAll: isListAll,
        // Uploads are in `sources` only because they were explicitly asked for.
        keep: showUploads ? (s => s?.type === UPLOAD_SOURCE_TYPE) : undefined,
    }), [sources, hiddenSet, filteredCategories, isListAll, showUploads]);

    // Sources parked in a hidden lifecycle, so the sidebar can offer them as
    // explicit buckets. Without this a hidden dataset is unreachable from the
    // list, which is worse than the clutter it was hidden to avoid — the uploader
    // has nowhere to find what they just created.
    const hiddenBuckets = useMemo(() => {
        const acc = {};
        for (const s of lifecycleHidden) {
            for (const c of (Array.isArray(s?.categories) ? s.categories : [])) {
                const top = Array.isArray(c) ? c[0] : c;
                if (top && hiddenSet.has(top)) (acc[top] ??= []).push(s);
            }
        }
        return acc;
    }, [lifecycleHidden, hiddenSet]);

    // Pool for the "Uncategorized" filter — independent of the above (which
    // only governs the default "All datasets" view), so the explicit filter
    // always shows every uncategorized source.
    const uncategorizedSources = useMemo(() =>
        (sources || []).filter(s => !(Array.isArray(s?.categories) && s.categories.length)),
    [sources]);

    const categories = useMemo(() => [...new Set(
        (visibleSources || [])
            .reduce((acc, s) => [...acc, ...((Array.isArray(s?.categories) ? s?.categories : [])?.map(s1 => s1[0]) || [])], []))]
            .filter(c => !hiddenSet.has(c) && (isListAll || !filteredCategories.includes(c)))
            .sort(),
    [visibleSources, filteredCategories, hiddenSet, isListAll]);

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
        if (cat1 === UNCATEGORIZED_CAT) {
            items.push({name: 'Uncategorized'});
        } else if (cat1) {
            catParts.forEach((part, i) => {
                items.push({
                    name: part,
                    ...(i < catParts.length - 1 ? {href: `${baseUrl}${catHref(catParts.slice(0, i + 1).join("/"))}`} : {}),
                });
            });
        }
        return items;
    }, [cat1, catParts, baseUrl]);

    const inCategoryPath = (source) => {
        if (cat1 === UNCATEGORIZED_CAT || !cat1) return true;
        return (Array.isArray(source?.categories) ? source?.categories : [])
            .some(cat => catParts.every((p, i) => cat[i] === p));
    };
    const matchesSearch = (source) => {
        const searchTerm = ((source?.name || '') + " " + (
            (Array.isArray(source?.categories) ? source?.categories : [source?.categories]) || [])
            .reduce((out, cat) => out + (Array.isArray(cat) ? cat.join(' ') : typeof cat === 'string' ? cat : ''), ''));
        return !(layerSearch.length > 2) || searchTerm.toLowerCase().includes(layerSearch.toLowerCase());
    };
    const byName = (a, b) => (sort === 'asc' ? 1 : -1) * (a?.name || '').localeCompare(b?.name || '');

    // sources after category-path + search (what the authority facet counts)
    const matchedSources = useMemo(() => {
        const base = cat1 === UNCATEGORIZED_CAT ? uncategorizedSources
            : (cat1 && hiddenSet.has(catParts[0])) ? (hiddenBuckets[catParts[0]] || [])
            : (visibleSources || []);
        return base.filter(inCategoryPath).filter(matchesSearch);
    }, [visibleSources, uncategorizedSources, hiddenBuckets, hiddenSet, cat1, catParts, layerSearch]);

    // authority facet counts over the matched set. The facet only shows once some source is marked:
    // on an env with no authority at all it would be one "undecided" row repeating the cards.
    const facetCounts = useMemo(() => {
        const counts = { single: 0, keyed: 0, undecided: 0 };
        for (const s of matchedSources) {
            const st = authorityChips[sourceKey(s)]?.state;
            if (st) counts[st]++;
        }
        return counts;
    }, [matchedSources, authorityChips]);
    const showFacet = facetCounts.single + facetCounts.keyed > 0 || !!authorityFacet;

    // the rendered set: + the authority facet, sorted
    const shownSources = useMemo(() =>
        (authorityFacet ? matchedSources.filter(s => authorityChips[sourceKey(s)]?.state === authorityFacet) : matchedSources)
            .slice().sort(byName),
    [matchedSources, authorityFacet, authorityChips, sort]);

    // Signed-in search hits in a hidden lifecycle, for their own group under the results. Not while
    // browsing a hidden bucket (they ARE the results there) or the uncategorized filter.
    const hiddenMatches = useMemo(() => {
        if (!user?.authed || !isSearching) return [];
        if (cat1 === UNCATEGORIZED_CAT || (cat1 && hiddenSet.has(catParts[0]))) return [];
        return lifecycleHidden.filter(inCategoryPath).filter(matchesSearch).sort(byName);
    }, [user?.authed, isSearching, lifecycleHidden, hiddenSet, cat1, catParts, layerSearch, sort]);

    const showEmpty = loaded && shownSources.length === 0 && !!t.emptyWrap;
    const hiddenGroup = hiddenMatches.length > 0 && t.hiddenMatchWrap
        ? <HiddenMatches matches={hiddenMatches} t={t} Icon={Icon} hiddenSet={hiddenSet}
                         chips={authorityChips} successors={successors} keyOf={sourceKey} />
        : null;
    // The group sits inside the grid / stack (so it scrolls with the cards). The table and the empty
    // state can't hold it, so there both go in one column, only while the group is showing.
    const wrapHidden = !!hiddenGroup && (showEmpty || view === 'table');
    const ResultsWrap = wrapHidden ? 'div' : React.Fragment;

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
                            <Button key={v.key} title={v.key} aria-label={v.key} aria-pressed={view === v.key}
                                    activeStyle={view === v.key ? 'segmentIconOn' : 'segmentIcon'}
                                    onClick={() => setViewPersist(v.key)}>
                                <svg className={t.viewBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                                    <path d={v.d}/>
                                </svg>
                            </Button>
                        ))}
                    </div>

                    <Button activeStyle='iconTool' title={'Toggle Sort'} onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}>
                        <Icon icon={sort === 'asc' ? 'SortDesc' : 'SortAsc'} className={t.iconMd}/>
                    </Button>

                    {(filteredCategories.length > 0 || uncategorizedSources.length > 0) &&
                        <Button activeStyle={isListAll ? 'iconToolOn' : 'iconTool'} title={isListAll ? 'Show filtered' : 'Show all'} onClick={() => setIsListAll(!isListAll)}>
                            <Icon icon={isListAll ? 'FilterX' : 'Filter'} className={t.iconMd}/>
                        </Button>
                    }

                    {(canCreate || canEditPattern) && t.toolbarDivider && <span className={t.toolbarDivider} aria-hidden="true"/>}

                    {canCreate &&
                        <Button activeStyle={showUploads ? 'iconToolOn' : 'iconTool'}
                                title={showUploads ? 'Hide uploaded files' : 'Show uploaded files'}
                                onClick={() => setShowUploads(!showUploads)}>
                            <Icon icon={showUploads ? 'EyeClosed' : 'Upload'} className={t.iconMd}/>
                        </Button>
                    }

                    {canEditPattern &&
                        <Link to={`${baseUrl}/settings`} title={'Settings'} className={t.settingsLink}><Icon icon="Settings" className={t.iconMd}/></Link>}

                    {canCreate &&
                        <Link to={`${baseUrl}/create`} title={'Add'} className={t.newBtn}><Icon icon={t.newBtnIcon} className={t.iconMd}/>{t.newBtnText}</Link>}
                </div>
            </div>
            <div className={t.body}>
                <div className={t.sidebar}>
                    <Link to={'?'} className={!cat1 ? t.sidebarItemActive : t.sidebarItem}>
                        <span className={t.sidebarItemText}>All datasets</span>
                        <div className={t.sidebarBadge}>{(visibleSources || []).length}</div>
                    </Link>
                    {isListAll && uncategorizedSources.length > 0 &&
                        <Link to={catHref(UNCATEGORIZED_CAT)} className={cat1 === UNCATEGORIZED_CAT ? t.sidebarItemActive : t.sidebarItem}>
                            <span className={t.sidebarItemText}>Uncategorized</span>
                            <div className={t.sidebarBadge}>{uncategorizedSources.length}</div>
                        </Link>
                    }
                    {(categories || [])
                        .sort((a,b) => a.localeCompare(b))
                        .map(cat => (
                            <React.Fragment key={cat}>
                                <Link className={activeTopCat === cat ? t.sidebarItemActive : t.sidebarItem} to={catHref(cat)}>
                                    <span className={t.sidebarItemText}>
                                        <span className={t.sidebarDot} style={{ backgroundColor: catColor(cat, swatches) }}/>{cat}
                                    </span>
                                    <div className={t.sidebarBadge}>{categoriesCount[cat]}</div>
                                </Link>
                                {activeTopCat === cat && subCategories.map(sub => {
                                    const subPath = `${cat}/${sub}`;
                                    return (
                                        <Link key={sub} className={cat1 === subPath ? t.sidebarSubItemActive : t.sidebarSubItem} to={catHref(subPath)}>
                                            <span className={t.sidebarItemText}>{sub}</span>
                                        </Link>
                                    );
                                })}
                            </React.Fragment>
                        ))
                    }
                    {/* Authority facet (owner 2026-10-21) — filters the shown set; counts follow the
                        category and the search. Click the active row again to clear it. */}
                    {showFacet && t.sidebarFacetGroup &&
                        <div className={t.sidebarFacetGroup}>
                            <div className={t.sidebarFacetLabel}>authority</div>
                            {[['single', 'authoritative', true], ['keyed', 'keyed', true], ['undecided', 'undecided', false]].map(([key, label, star]) => (
                                <button key={key} type="button" aria-pressed={authorityFacet === key}
                                        className={authorityFacet === key ? t.sidebarItemActive : t.sidebarItem}
                                        onClick={() => setAuthorityFacet(authorityFacet === key ? null : key)}>
                                    <span className={t.sidebarFacetMark}>{star ? '★' : ''}</span>
                                    <span className={t.sidebarItemText}>{label}</span>
                                    <div className={key === 'undecided' ? t.sidebarFacetBadgeUndecided : t.sidebarBadge}>{facetCounts[key]}</div>
                                </button>
                            ))}
                        </div>
                    }
                    {/* Hidden lifecycle buckets — at the END of the rail (owner 2026-10-06):
                        a back door, not part of the catalog's browse structure. Shown to
                        whoever can see the list (view-sources, owner 2026-10-23) without needing
                        "Show all": a dataset you just uploaded should not require a mode switch to find. */}
                    {Object.keys(hiddenBuckets).length > 0 &&
                        <div className={t.sidebarHiddenGroup}>
                            <div className={t.sidebarHiddenLabel}>Hidden</div>
                            {Object.keys(hiddenBuckets).sort().map(cat => (
                                <Link key={cat} to={catHref(cat)}
                                      className={activeTopCat === cat ? t.sidebarItemActive : t.sidebarItemHidden}>
                                    <span className={t.sidebarItemText}>
                                        {t.sidebarHiddenIcon && <Icon icon={t.sidebarHiddenIcon} className={t.sidebarHiddenIconClass}/>}{cat}
                                    </span>
                                    <div className={t.sidebarBadge}>{hiddenBuckets[cat].length}</div>
                                </Link>
                            ))}
                        </div>
                    }
                </div>

                <ResultsWrap {...(wrapHidden ? { className: t.hiddenMatchColumn } : {})}>
                {showEmpty ? (
                    <div className={t.emptyWrap}>
                        {t.emptyIcon && <Icon icon={t.emptyIcon} className={t.emptyIconClass}/>}
                        {isSearching ? (
                            <>
                                <div className={t.emptyTitle}>No datasets match “{layerSearch}”</div>
                                <div className={t.emptyText}>
                                    Search covers names and categories{cat1 && cat1 !== UNCATEGORIZED_CAT ? ` in ${catParts.join(' / ')}` : ''}.
                                    {cat1 ? <> Try <Link to={'?'} className={t.emptyLink}>all datasets</Link>.</> : null}
                                    {!isListAll && (filteredCategories.length > 0 || uncategorizedSources.length > 0)
                                        ? ' Turn on “show all” to include filtered and uncategorized sources.' : null}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={t.emptyTitle}>No datasets here yet</div>
                                <div className={t.emptyText}>
                                    {cat1 ? <>Nothing is filed under this category. <Link to={'?'} className={t.emptyLink}>See all datasets</Link>.</> : 'Datasets you create or load will show up here.'}
                                </div>
                            </>
                        )}
                    </div>
                ) : view === 'table' ? (
                    <div className={t.tableWrap}>
                        {/* UI.Table (`t.tableStyle`); each cell's wrapper takes the table's cell class,
                            the inner element this theme's class */}
                        <Table data={shownSources} gridRef={catalogGridRef} isEdit={false}
                               activeStyle={t.tableStyle || undefined}
                               display={{ disableCellSelection: true }}
                               columns={[
                                   { name: 'name', display_name: 'Name', show: true, size: t.columnSizes?.name, type: 'ui', wrapText: true,
                                     Comp: ({ row: s, className }) => <div className={className}>
                                         <Link to={sourceHref(s)} className={t.tdName}>{s?.name}</Link>
                                         <SupersededLine successor={successors[sourceKey(s)]} t={t} /></div> },
                                   { name: 'type', display_name: 'Type', show: true, size: t.columnSizes?.type, type: 'ui',
                                     Comp: ({ row: s, className }) => <div className={className}><TypeChip source={s} t={t} Icon={Icon} /></div> },
                                   { name: 'authority', display_name: 'Authoritative view', show: true, size: t.columnSizes?.authority, type: 'ui',
                                     Comp: ({ row: s, className }) => <div className={className}><AuthorityChip chip={authorityChips[sourceKey(s)]} t={t} /></div> },
                                   { name: 'categories', display_name: 'Category', show: true, size: t.columnSizes?.categories, type: 'ui',
                                     Comp: ({ row: s, className }) => <div className={className}><TableCategory source={s} t={t} swatches={swatches} /></div> },
                                   { name: 'description', display_name: 'Description', show: true, size: t.columnSizes?.description, type: 'ui',
                                     Comp: ({ row: s, className }) => <div className={className}><span className={t.descCell}>{extractLexicalText(s?.description)}</span></div> },
                               ]}/>
                    </div>
                ) : (
                    <div className={view === 'cards' ? t.sourceStack : t.sourceGrid}>
                        {shownSources.map((s, i) =>
                            <SourceCard key={s.source_id || s.id || i} source={s} t={t} Icon={Icon} swatches={swatches} full={view === 'cards'}
                                        chip={authorityChips[sourceKey(s)]} successor={successors[sourceKey(s)]} />
                        )}
                        {!wrapHidden && hiddenGroup}
                    </div>
                )}
                {wrapHidden && hiddenGroup}
                </ResultsWrap>
            </div>
          </div>
        </Layout>
    )
}
