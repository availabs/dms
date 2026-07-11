import React, {useState, useEffect, useContext, useMemo, useCallback} from 'react'
import {get} from "lodash-es";
import {DatasetsContext} from "../context";
import {ThemeContext, getComponentTheme} from "../../../ui/useTheme";
import {dataItemsNav} from "../../../utils/nav";
import {buildEnvsForListing, getExternalEnv} from "../utils/datasources";
import Breadcrumbs from "../components/Breadcrumbs";
import {settingsPageTheme} from "./settingsPage.theme";

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

const getSources = async ({envs, falcor}) => {
    if(!envs || !Object.keys(envs).length) return [];
    const lenRes = await falcor.get(['uda', Object.keys(envs), 'sources', 'length']);

    const sources = await Promise.all(
        Object.keys(envs).map(async e => {
            const len = get(lenRes, ['json', 'uda', e, 'sources', 'length']);
            if(!len) return [];

            const r = await falcor.get(['uda', e, 'sources', 'byIndex', {from: 0, to: len - 1}, envs[e].srcAttributes]);
            const valueGetter = (i, attr) => get(r, ['json', 'uda', e, 'sources', 'byIndex', i, attr]);
            return range(0, len-1).map(i => {
                const categories = valueGetter(i, 'categories');
                return {
                    categories: typeof categories === 'string' ? JSON.parse(categories || '[]') : (categories || []),
                    name: valueGetter(i, 'name'),
                };
            });
        }));
    return sources.flat();
}

export default function SettingsPage({format}) {
    const {baseUrl, falcor, datasources, dmsEnv, UI} = useContext(DatasetsContext);
    const {theme: fullTheme} = useContext(ThemeContext) || {};
    const theme = { ...settingsPageTheme, ...getComponentTheme(fullTheme, 'datasets.settingsPage') };
    const {Layout, LayoutGroup, Input, Button} = UI;
    // Shared secondary nav — site-absolute items, so baseUrl '' (see DatasetsList).
    const menuItemsSecondNav = useMemo(
        () => dataItemsNav(fullTheme?.navOptions?.secondaryNav?.navItems || [], '', false),
        [fullTheme?.navOptions?.secondaryNav?.navItems]
    );

    const [sources, setSources] = useState([]);
    const [filteredCategories, setFilteredCategories] = useState([]);
    const [showUncategorized, setShowUncategorized] = useState(true);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);

    const pgEnv = getExternalEnv(datasources);
    const envs = useMemo(() => buildEnvsForListing(datasources, format, dmsEnv), [datasources, format, dmsEnv]);

    useEffect(() => {
        getSources({envs, falcor}).then(setSources);
    }, [format?.app]);

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

    const saveSettings = useCallback((updates) => {
        if (!pgEnv) return;
        setSaving(true);
        const newFiltered = updates.filtered_categories ?? filteredCategories;
        const newShowUncat = updates.show_uncategorized ?? showUncategorized;
        setFilteredCategories(newFiltered);
        setShowUncategorized(newShowUncat);
        falcor.set({
            paths: [['uda', pgEnv, 'settings']],
            jsonGraph: {
                uda: {
                    [pgEnv]: {
                        settings: JSON.stringify({filtered_categories: newFiltered, show_uncategorized: newShowUncat})
                    }
                }
            }
        }).then(() => setSaving(false));
    }, [pgEnv, falcor, filteredCategories, showUncategorized]);

    const allCategories = useMemo(() => [...new Set(
        sources.reduce((acc, s) => [
            ...acc,
            ...((Array.isArray(s?.categories) ? s.categories : []).map(c => c[0]) || [])
        ], [])
    )].sort(), [sources]);

    const categoriesCount = useMemo(() => allCategories.reduce((acc, cat) => {
        acc[cat] = sources.filter(s =>
            (Array.isArray(s?.categories) ? s.categories : [])
                .some(c => c.includes(cat))
        ).length;
        return acc;
    }, {}), [sources, allCategories]);

    const shownCategories = useMemo(() =>
        allCategories.filter(c => !filteredCategories.includes(c)),
    [allCategories, filteredCategories]);

    const hiddenCategories = useMemo(() =>
        allCategories.filter(c => filteredCategories.includes(c)),
    [allCategories, filteredCategories]);

    const filterBySearch = (cats) =>
        search ? cats.filter(c => c.toLowerCase().includes(search.toLowerCase())) : cats;

    return (
        <Layout navItems={[]} secondNav={menuItemsSecondNav}>
            <div className={theme.pageWrapper}>
                <Breadcrumbs items={[
                    {icon: 'Database', href: baseUrl},
                    {name: 'Settings'},
                ]}/>
                <LayoutGroup>
                    <div className={theme.heading}>
                        Dataset Settings
                    </div>
                    {/* Read-only environment panel — surfaces which dmsEnv (and
                        pgEnv, when one is configured) this datasets page is
                        bound to. Editing happens elsewhere (admin pattern
                        editor); this is purely informational. */}
                    <div className={theme.envPanel}>
                        <div className={theme.envPanelLabel}>
                            Environment
                        </div>
                        <div className={theme.envRow}>
                            <span className={theme.envRowLabel}>DMS Env:</span>
                            {dmsEnv ? (
                                <>
                                    <span className={theme.envRowValue}>{dmsEnv.name || `#${dmsEnv.id}`}</span>
                                    {dmsEnv.name && dmsEnv.id != null && (
                                        <span className={theme.envRowMuted}>id: {dmsEnv.id}</span>
                                    )}
                                </>
                            ) : (
                                <span className={theme.envRowEmpty}>none (legacy pattern)</span>
                            )}
                        </div>
                        {pgEnv ? (
                            <div className={theme.envRow}>
                                <span className={theme.envRowLabel}>PG Env:</span>
                                <span className={theme.envRowValue}>{pgEnv}</span>
                            </div>
                        ) : null}
                    </div>
                    <div className={theme.toggleRow}>
                        <Button
                            type={showUncategorized ? 'active' : 'plain'}
                            onClick={() => saveSettings({show_uncategorized: !showUncategorized})}
                            disabled={saving}
                        >
                            {showUncategorized ? 'Showing' : 'Hiding'} uncategorized sources
                        </Button>
                    </div>
                    <div className={theme.searchWrapper}>
                        <Input
                            placeholder="Search categories..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className={theme.columnsWrapper}>
                        <div className={theme.column}>
                            <label className={theme.columnLabel}>
                                Categories Hidden
                                <span className={theme.columnHint}>(click to show)</span>
                            </label>
                            <div className={theme.categoryList}>
                                {filterBySearch(hiddenCategories).length ? filterBySearch(hiddenCategories).map(cat => (
                                    <button
                                        key={cat}
                                        className={theme.categoryButton}
                                        onClick={() => saveSettings({filtered_categories: filteredCategories.filter(c => c !== cat)})}
                                        disabled={saving}
                                    >
                                        {cat}
                                        <span className={theme.categoryCount}>
                                            {categoriesCount[cat]}
                                        </span>
                                    </button>
                                )) : (
                                    <div className={theme.emptyMessage}>
                                        No categories hidden
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className={theme.column}>
                            <label className={theme.columnLabel}>
                                Categories Shown
                                <span className={theme.columnHint}>(click to hide)</span>
                            </label>
                            <div className={theme.categoryList}>
                                {filterBySearch(shownCategories).length ? filterBySearch(shownCategories).map(cat => (
                                    <button
                                        key={cat}
                                        className={theme.categoryButton}
                                        onClick={() => saveSettings({filtered_categories: [...filteredCategories, cat]})}
                                        disabled={saving}
                                    >
                                        {cat}
                                        <span className={theme.categoryCount}>
                                            {categoriesCount[cat]}
                                        </span>
                                    </button>
                                )) : (
                                    <div className={theme.emptyMessage}>
                                        All categories shown
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </LayoutGroup>
            </div>
        </Layout>
    );
}
