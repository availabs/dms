import React, {useState, useEffect, useContext, useMemo, useCallback} from 'react'
import {get} from "lodash-es";
import {DatasetsContext} from "../context";
import {ThemeContext} from "../../../ui/useTheme";
import {buildEnvsForListing, getExternalEnv} from "../utils/datasources";
import Breadcrumbs from "../components/Breadcrumbs";

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
                    name: valueGetter(i, 'name') || valueGetter(i, 'doc_type'),
                };
            });
        }));
    return sources.flat();
}

export default function SettingsPage({format}) {
    const {baseUrl, falcor, datasources, UI} = useContext(DatasetsContext);
    const {theme: fullTheme} = useContext(ThemeContext) || {};
    const theme = fullTheme?.datasets?.settingsPage || {};
    const {Layout, LayoutGroup, Input} = UI;

    const [sources, setSources] = useState([]);
    const [filteredCategories, setFilteredCategories] = useState([]);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);

    const pgEnv = getExternalEnv(datasources);
    const envs = useMemo(() => buildEnvsForListing(datasources, format), [datasources, format]);

    useEffect(() => {
        getSources({envs, falcor}).then(setSources);
    }, [format?.app]);

    useEffect(() => {
        if (!pgEnv) return;
        falcor.get(["dama-info", pgEnv, "settings"]).then(res => {
            const settings = get(res, ["json", "dama-info", pgEnv, "settings"]);
            const parsed = typeof settings === 'string' ? JSON.parse(settings || '{}') : (settings || {});
            setFilteredCategories(parsed.filtered_categories || []);
        });
    }, [pgEnv]);

    const saveSettings = useCallback((newFiltered) => {
        if (!pgEnv) return;
        setSaving(true);
        setFilteredCategories(newFiltered);
        falcor.set({
            paths: [['dama-info', pgEnv, 'settings']],
            jsonGraph: {
                "dama-info": {
                    [pgEnv]: {
                        settings: JSON.stringify({filtered_categories: newFiltered})
                    }
                }
            }
        }).then(() => setSaving(false));
    }, [pgEnv, falcor]);

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
        <Layout navItems={[]}>
            <div className={theme.pageWrapper || 'max-w-5xl mx-auto w-full'}>
                <Breadcrumbs items={[
                    {icon: 'Database', href: baseUrl},
                    {name: 'Settings'},
                ]}/>
                <LayoutGroup>
                    <div className={theme.heading || 'text-2xl font-medium text-blue-600'}>
                        Category Settings
                    </div>
                    <div className={theme.searchWrapper || 'my-4'}>
                        <Input
                            placeholder="Search categories..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className={theme.columnsWrapper || 'flex flex-col sm:flex-row gap-4'}>
                        <div className={theme.column || 'flex-1 border rounded-lg p-3 bg-slate-50'}>
                            <label className={theme.columnLabel || 'text-sm font-medium text-gray-700'}>
                                Categories Hidden
                                <span className={theme.columnHint || 'text-xs italic text-gray-500 ml-1'}>(click to show)</span>
                            </label>
                            <div className={theme.categoryList || 'flex flex-wrap gap-1 mt-2 max-h-[70vh] overflow-auto'}>
                                {filterBySearch(hiddenCategories).length ? filterBySearch(hiddenCategories).map(cat => (
                                    <button
                                        key={cat}
                                        className={theme.categoryButton || 'bg-white hover:bg-blue-50 px-3 py-1.5 rounded-md flex items-center gap-2 text-sm border border-gray-200'}
                                        onClick={() => saveSettings(filteredCategories.filter(c => c !== cat))}
                                        disabled={saving}
                                    >
                                        {cat}
                                        <span className={theme.categoryCount || 'bg-blue-100 text-blue-600 text-xs w-5 h-5 shrink-0 rounded-full flex items-center justify-center'}>
                                            {categoriesCount[cat]}
                                        </span>
                                    </button>
                                )) : (
                                    <div className={theme.emptyMessage || 'text-gray-400 text-sm italic p-2'}>
                                        No categories hidden
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className={theme.column || 'flex-1 border rounded-lg p-3 bg-slate-50'}>
                            <label className={theme.columnLabel || 'text-sm font-medium text-gray-700'}>
                                Categories Shown
                                <span className={theme.columnHint || 'text-xs italic text-gray-500 ml-1'}>(click to hide)</span>
                            </label>
                            <div className={theme.categoryList || 'flex flex-wrap gap-1 mt-2 max-h-[70vh] overflow-auto'}>
                                {filterBySearch(shownCategories).length ? filterBySearch(shownCategories).map(cat => (
                                    <button
                                        key={cat}
                                        className={theme.categoryButton || 'bg-white hover:bg-blue-50 px-3 py-1.5 rounded-md flex items-center gap-2 text-sm border border-gray-200'}
                                        onClick={() => saveSettings([...filteredCategories, cat])}
                                        disabled={saving}
                                    >
                                        {cat}
                                        <span className={theme.categoryCount || 'bg-blue-100 text-blue-600 text-xs w-5 h-5 shrink-0 rounded-full flex items-center justify-center'}>
                                            {categoriesCount[cat]}
                                        </span>
                                    </button>
                                )) : (
                                    <div className={theme.emptyMessage || 'text-gray-400 text-sm italic p-2'}>
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
