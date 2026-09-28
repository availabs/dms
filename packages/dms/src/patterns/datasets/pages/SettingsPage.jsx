import React, {useState, useEffect, useContext, useMemo, useCallback} from 'react'
import {get} from "lodash-es";
import {DatasetsContext} from "../context";
import {ThemeContext, getComponentTheme} from "../../../ui/useTheme";
import {dataItemsNav} from "../../../utils/nav";
import {buildEnvsForListing, getExternalEnv} from "../utils/datasources";
import Breadcrumbs from "../components/Breadcrumbs";
import {settingsPageTheme} from "./settingsPage.theme";
import {
    LIFECYCLE_DEFAULTS, REQUIRED_HIDDEN, SANDBOX_CATEGORY,
    resolveHiddenForPattern, isPatternOverride, toggleHidden, resetHidden, isSourceHidden,
} from "../utils/lifecycle";

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

// Upload sources (lexical inline images, the Card image column, the file_upload
// CreatePage) — the type the server's `hidden_source_types` excludes from the
// default source enumeration.
const UPLOAD_SOURCE_TYPE = 'file_upload';

// One line per lifecycle name explaining what hiding it costs. A switch without
// a consequence stated is a switch someone flips to see what happens.
const LIFECYCLE_HINTS = {
    'Sandbox': 'Where every new dataset lands until someone promotes it. Showing this puts unreviewed uploads straight into the catalog.',
    'Archive': 'Superseded and retired datasets, kept for reference.',
    'Data Processing': 'ETL inputs and intermediates. Load-bearing — hidden from browsing, never deleted.',
    'Uploaded File': 'Images and files attached to pages. Also excluded server-side, so they never load.',
};

// The promotion gate. Each is a property a dataset must have before it can leave
// Sandbox for the catalog.
const PROMOTION_GATE = [
    { key: 'area',         label: 'A subject area' },
    { key: 'description',  label: 'A description' },
    { key: 'display_name', label: 'A display name' },
    { key: 'view',         label: 'At least one published view' },
];
const DEFAULT_PROMOTION_GATE = ['area', 'description', 'display_name'];

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
    const {baseUrl, falcor, datasources, dmsEnv, UI, parent} = useContext(DatasetsContext);
    const {theme: fullTheme} = useContext(ThemeContext) || {};
    const theme = { ...settingsPageTheme, ...getComponentTheme(fullTheme, 'datasets.settingsPage') };
    const {Layout, LayoutGroup, Input, Switch} = UI;
    // Shared secondary nav — mount-aware base (pattern.navPrefix; '' on primary mounts) (see DatasetsList).
    const menuItemsSecondNav = useMemo(
        () => dataItemsNav(fullTheme?.navOptions?.secondaryNav?.navItems || [], parent?.navPrefix || '', false),
        [fullTheme?.navOptions?.secondaryNav?.navItems, parent?.navPrefix]
    );

    const [sources, setSources] = useState([]);
    const [filteredCategories, setFilteredCategories] = useState([]);
    // Everything else the env's settings blob holds (hidden_source_types,
    // show_uncategorized, …). Kept so a save here doesn't drop keys this page
    // doesn't edit — the write replaces the whole JSON value.
    const [otherSettings, setOtherSettings] = useState({});
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
            const {filtered_categories, ...rest} = parsed;
            setFilteredCategories(filtered_categories || []);
            setOtherSettings(rest);
        });
    }, [pgEnv]);

    const saveSettings = useCallback((updates) => {
        if (!pgEnv) return;
        setSaving(true);
        const newFiltered = updates.filtered_categories ?? filteredCategories;
        const {filtered_categories, ...newOther} = {...otherSettings, ...updates};
        setFilteredCategories(newFiltered);
        setOtherSettings(newOther);
        falcor.set({
            paths: [['uda', pgEnv, 'settings']],
            jsonGraph: {
                uda: {
                    [pgEnv]: {
                        settings: JSON.stringify({...newOther, filtered_categories: newFiltered})
                    }
                }
            }
        }).then(() => setSaving(false));
    }, [pgEnv, falcor, filteredCategories, otherSettings]);

    // `hidden_source_types` is read server-side by the source enumeration
    // (uda.controller): listed types are dropped from `sources.length` /
    // `sources.byIndex` so the list pages never transfer them. Unset means the
    // server default (`['file_upload']`); an explicit `[]` means hide nothing.
    const hiddenSourceTypes = Array.isArray(otherSettings.hidden_source_types)
        ? otherSettings.hidden_source_types
        : [UPLOAD_SOURCE_TYPE];
    const uploadsHidden = hiddenSourceTypes.includes(UPLOAD_SOURCE_TYPE);

    // ── lifecycle visibility ──────────────────────────────────────────────
    // Two layers over the library defaults: an env-wide delta and this pattern's
    // own. Both are stored as `{hide, show}` DELTAS rather than resolved lists —
    // a name added to LIFECYCLE_DEFAULTS later then reaches every existing
    // pattern instead of freezing at the moment each one was created.
    const patternId = parent?.id;
    const settingsBlob = useMemo(
        () => ({ ...otherSettings, filtered_categories: filteredCategories }),
        [otherSettings, filteredCategories]
    );
    const hiddenSet = useMemo(
        () => resolveHiddenForPattern(settingsBlob, patternId),
        [settingsBlob, patternId]
    );
    const patternDelta = otherSettings.hidden_categories_by_pattern?.[String(patternId)] || {};

    const saveLifecycle = useCallback((nextDelta) => {
        const byPattern = { ...(otherSettings.hidden_categories_by_pattern || {}) };
        if (nextDelta && (nextDelta.hide?.length || nextDelta.show?.length)) {
            byPattern[String(patternId)] = nextDelta;
        } else {
            delete byPattern[String(patternId)];   // back to inherited — don't store an empty object
        }
        saveSettings({ hidden_categories_by_pattern: byPattern });
    }, [otherSettings.hidden_categories_by_pattern, patternId, saveSettings]);

    // Every lifecycle name plus anything a pattern has pinned that isn't one of
    // them, so a hand-authored delta can always be un-done from this page.
    const lifecycleNames = useMemo(() => [...new Set([
        ...LIFECYCLE_DEFAULTS,
        ...(patternDelta.hide || []),
        ...(Array.isArray(otherSettings.hidden_categories?.hide) ? otherSettings.hidden_categories.hide : []),
    ])], [patternDelta.hide, otherSettings.hidden_categories]);

    const topLevelCount = useCallback((cat) => sources.filter(s =>
        (Array.isArray(s?.categories) ? s.categories : []).some(c => (Array.isArray(c) ? c[0] : c) === cat)
    ).length, [sources]);

    // What the catalog actually shows with the current switches — the panel that
    // turns this page from "maintain a deny list" into "shape a catalog".
    const effect = useMemo(() => {
        let shown = 0, byLifecycle = 0, uncategorized = 0;
        for (const s of sources) {
            const hidden = isSourceHidden(s, hiddenSet, filteredCategories);
            if (hidden === null) uncategorized++;
            else if (hidden) byLifecycle++;
            else shown++;
        }
        return { shown, byLifecycle, uncategorized, total: sources.length };
    }, [sources, hiddenSet, filteredCategories]);

    const newSourceCategory = Array.isArray(otherSettings.default_new_source_categories)
        ? (otherSettings.default_new_source_categories[0]?.[0] || null)
        : SANDBOX_CATEGORY;
    const promotionGate = Array.isArray(otherSettings.promotion_requires)
        ? otherSettings.promotion_requires
        : DEFAULT_PROMOTION_GATE;

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

    // Hidden list is the union with `filtered_categories`: a category can be
    // hidden while no currently-loaded source carries it (uploads aren't
    // fetched by this page at all), and it still has to be un-hideable.
    const hiddenCategories = useMemo(() => [...new Set([
        ...allCategories.filter(c => filteredCategories.includes(c)),
        ...filteredCategories,
    ])].sort(),
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
                    {pgEnv ? (
                        <div className={theme.togglePanel}>
                            <div className={theme.togglePanelLabel}>
                                Source Lists
                            </div>
                            <div className={theme.toggleRow}>
                                <Switch
                                    enabled={uploadsHidden}
                                    setEnabled={v => saveSettings({
                                        hidden_source_types: v
                                            ? [...hiddenSourceTypes.filter(t => t !== UPLOAD_SOURCE_TYPE), UPLOAD_SOURCE_TYPE]
                                            : hiddenSourceTypes.filter(t => t !== UPLOAD_SOURCE_TYPE)
                                    })}
                                    label="Hide uploaded files from dataset lists"
                                    disabled={saving}
                                    size="small"
                                />
                                <span className={theme.toggleLabel}>Hide uploaded files from dataset lists</span>
                            </div>
                            <div className={theme.toggleHint}>
                                Image and file uploads are stored as sources. Hiding them keeps every
                                dataset list from loading thousands of rows; they stay reachable from
                                their own pages, and from the dataset list's "show uploaded files" toggle.
                            </div>
                        </div>
                    ) : null}
                    {pgEnv ? (
                        <div className={theme.lcPanel}>
                            <div className={theme.lcHeader}>
                                <div>
                                    <div className={theme.lcTitle}>Catalog visibility</div>
                                    <div className={theme.lcSub}>
                                        Every dataset carries a lifecycle. These switches decide which
                                        lifecycles this catalog shows. A dataset in no hidden lifecycle is
                                        production. Hiding never deletes &mdash; a hidden dataset still loads
                                        on its own page and still serves tiles.
                                    </div>
                                </div>
                                <div className={theme.lcScope}>
                                    <span>scope</span>
                                    <span className={theme.lcScopeValue}>this pattern</span>
                                </div>
                            </div>

                            <div className={theme.fxPanel} style={{margin: '16px 20px'}}>
                                <div className={theme.fxBig}>
                                    {effect.shown}<span className={theme.fxBigMuted}> / {effect.total}</span>
                                </div>
                                <div className={theme.fxCaption}>datasets visible in this catalog</div>
                                <div className={theme.fxRow}>
                                    <span className={theme.fxRowLabel}>hidden &middot; lifecycle</span>
                                    <span className={theme.fxRowValue}>{effect.byLifecycle}</span>
                                </div>
                                <div className={theme.fxRow}>
                                    <span className={theme.fxRowLabel}>uncategorized</span>
                                    <span className={theme.fxRowValue}>{effect.uncategorized}</span>
                                </div>
                            </div>

                            <div className={theme.lcRows}>
                                {lifecycleNames.map(cat => {
                                    const hidden = hiddenSet.has(cat);
                                    const overridden = isPatternOverride(cat, settingsBlob, patternId);
                                    const required = REQUIRED_HIDDEN.includes(cat);
                                    return (
                                        <div key={cat} className={theme.lcRow}>
                                            <Switch
                                                enabled={hidden}
                                                setEnabled={() => saveLifecycle(toggleHidden(cat, patternDelta, [...resolveHiddenForPattern({...settingsBlob, hidden_categories_by_pattern: {}}, patternId)]))}
                                                label={`Hide ${cat}`}
                                                disabled={saving}
                                                size="small"
                                            />
                                            <div className={theme.lcRowBody}>
                                                <div className={theme.lcRowTitle}>
                                                    <span className={theme.lcRowName}>Hide {cat}</span>
                                                    {required ? <span className={theme.lcRequired}>required</span> : null}
                                                    <span className={theme.lcRowCount}>{topLevelCount(cat)} datasets</span>
                                                </div>
                                                <div className={theme.lcRowHint}>{LIFECYCLE_HINTS[cat] || 'Hidden from this catalog.'}</div>
                                            </div>
                                            <div className={theme.lcState}>
                                                {overridden ? (
                                                    <>
                                                        <div className={theme.lcStateOverridden}>overridden</div>
                                                        <button className={theme.lcReset} disabled={saving}
                                                                onClick={() => saveLifecycle(resetHidden(cat, patternDelta))}>
                                                            reset to default
                                                        </button>
                                                    </>
                                                ) : <div className={theme.lcStateDefault}>default</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {!hiddenSet.has(SANDBOX_CATEGORY) ? (
                                <div className={theme.lcWarn}>
                                    <strong>Sandbox is visible in this catalog.</strong> New datasets land in
                                    Sandbox by default, so every upload will appear here the moment it finishes
                                    &mdash; before anyone has reviewed it.
                                </div>
                            ) : null}

                            <div className={theme.lcNote}>
                                Patterns inherit these names and store only what they change, so a lifecycle
                                added later reaches every catalog instead of freezing at the moment this one
                                was created.
                            </div>
                        </div>
                    ) : null}

                    {pgEnv ? (
                        <div className={theme.lcPanel}>
                            <div className={theme.lcHeader}>
                                <div>
                                    <div className={theme.lcTitle}>New-source defaults</div>
                                    <div className={theme.lcSub}>
                                        Where a dataset lands when it is created. Applied by the server, so it
                                        holds for every upload route rather than depending on what the caller sent.
                                    </div>
                                </div>
                                <div className={theme.lcScope}>
                                    <span>scope</span>
                                    <span className={theme.lcScopeValue}>environment</span>
                                </div>
                            </div>
                            <div className={theme.nsGrid}>
                                <div>
                                    <div className={theme.nsLabel}>Lands in</div>
                                    <div className={theme.nsPill}>
                                        <span>{newSourceCategory || 'nothing (uncategorized)'}</span>
                                        <span className={theme.nsMuted}>env default</span>
                                    </div>
                                    <div className={theme.nsHint}>
                                        A dataset is created in an environment before it belongs to any pattern,
                                        so this is set once per environment. Clearing it restores the old
                                        behaviour: new datasets arrive uncategorized and invisible.
                                    </div>
                                </div>
                                <div>
                                    <div className={theme.nsLabel}>Required to promote</div>
                                    {PROMOTION_GATE.map(g => (
                                        <label key={g.key} className={theme.nsCheckRow}>
                                            <input type="checkbox" disabled={saving}
                                                   checked={(promotionGate || []).includes(g.key)}
                                                   onChange={e => saveSettings({
                                                       promotion_requires: e.target.checked
                                                           ? [...new Set([...(promotionGate || []), g.key])]
                                                           : (promotionGate || []).filter(k => k !== g.key)
                                                   })}/>
                                            <span>{g.label}</span>
                                        </label>
                                    ))}
                                    <div className={theme.nsHint}>
                                        The moment someone wants their dataset in the catalog is the only moment
                                        they will fill these in.
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <div className={theme.legacyPanel}>
                        <div className={theme.legacyHeader}>
                            <div className={theme.lcTitle}>
                                Legacy category filter <span className={theme.legacyBadge}>deprecated</span>
                            </div>
                            <div className={theme.lcSub}>
                                The old deny list. It hid a dataset only when <em>every</em> one of its
                                categories was listed, so hiding anything meant listing its neighbours too.
                                It still works; nothing changes until these are migrated to a lifecycle above.
                            </div>
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
                    </div>
                </LayoutGroup>
            </div>
        </Layout>
    );
}
