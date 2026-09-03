import React, {useContext, useState} from "react";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { isEqual } from "lodash-es";
import { filterEditorTheme } from './filterEditor.theme';
import { parseIfJSON } from '../../../utils';
import { getInstance } from '../../../../../utils/type-utils';

// Normalise raw filters value (flat array or subdomain-keyed object) → subdomain-keyed object
function normaliseFilters(raw) {
    const parsed = parseIfJSON(raw, []);
    if (Array.isArray(parsed)) return { "*": parsed };
    if (parsed && typeof parsed === 'object') return parsed;
    return { "*": [] };
}

// Renders the filter rows (searchKey / values / remove) for a single subdomain
function FilterRows({ filters = [], onChange }) {
    const { UI, theme } = useContext(ThemeContext);
    const t = { ...filterEditorTheme, ...(theme?.admin?.filterEditor || {}) }
    const { FieldSet, Button } = UI;
    const [newFilter, setNewFilter] = useState({});
    const customTheme = { field: 'pb-2 flex flex-col' };
    const customThemeButton = { field: 'pb-2 place-content-end' };

    return (
        <div className={t.filterRowsWrapper}>
            {filters.map((filter, i) => (
                <FieldSet
                    key={filter.id || i}
                    className={t.filterRow}
                    components={[
                        {
                            label: 'Search Key',
                            type: 'Input',
                            placeholder: 'search key',
                            value: filter.searchKey,
                            onChange: e => onChange(filters.map((v, idx) => idx === i ? { ...v, searchKey: e.target.value } : v)),
                            customTheme
                        },
                        {
                            label: 'Search Value',
                            type: 'Input',
                            placeholder: 'search value',
                            value: filter.values,
                            onChange: e => onChange(filters.map((v, idx) => idx === i ? { ...v, values: e.target.value } : v)),
                            customTheme
                        },
                        {
                            type: 'Button',
                            children: 'remove',
                            customTheme: customThemeButton,
                            onClick: () => onChange(filters.filter((_, idx) => idx !== i))
                        }
                    ]}
                />
            ))}
            <FieldSet
                className={t.filterRow}
                components={[
                    {
                        label: 'Search Key',
                        type: 'Input',
                        placeholder: 'search key',
                        value: newFilter.searchKey || '',
                        onChange: e => setNewFilter({ ...newFilter, searchKey: e.target.value }),
                        customTheme
                    },
                    {
                        label: 'Search Value',
                        type: 'Input',
                        placeholder: 'search value',
                        value: newFilter.values || '',
                        onChange: e => setNewFilter({ ...newFilter, values: e.target.value }),
                        customTheme
                    },
                    {
                        type: 'Button',
                        children: 'add',
                        customTheme: customThemeButton,
                        onClick: () => {
                            const id = crypto.randomUUID();
                            onChange([...filters, { id, ...newFilter }]);
                            setNewFilter({});
                        }
                    }
                ]}
            />
            <Button onClick={() => onChange([])}>clear all filters</Button>
        </div>
    );
}

export const PatternFilterEditor = ({ value = {}, onChange, falcor, ...rest }) => {
    const { UI, theme } = useContext(ThemeContext);
    const t = { ...filterEditorTheme, ...(theme?.admin?.filterEditor || {}) }
    const { apiUpdate, app, API_HOST } = useContext(AdminContext);
    const { FieldSet, Button } = UI;

    const normalised = normaliseFilters(value?.filters);
    const [tmpFilters, setTmpFilters] = useState(normalised);
    const [newSubdomain, setNewSubdomain] = useState('');
    // Per-group sync state: { [subdomain]: { syncing, progress, message, isError } }
    const [syncState, setSyncState] = useState({});

    const patternInstance = getInstance(value.type);
    const hasUnsavedChanges = !isEqual(tmpFilters, normalised);

    // "Sync to Pages" — see src/dms/planning/tasks/current/pattern-filter-sync.md.
    // Follows patternList.jsx's duplicate() shape exactly: POST -> { task_id } -> poll
    // /dms/tasks/:taskId every ~3s -> show progress -> terminal success/error state.
    const syncGroup = async (subdomain) => {
        if (!patternInstance || !value.id) return;
        const dmsServerPath = `${API_HOST}/dama-admin`;
        setSyncState(prev => ({ ...prev, [subdomain]: { syncing: true, progress: 0, message: null, isError: false } }));
        try {
            const res = await fetch(`${dmsServerPath}/dms/${app}+${patternInstance}/sync-filters`, {
                method: 'POST',
                body: JSON.stringify({ patternId: value.id, filterGroupKey: subdomain }),
                headers: { 'Content-Type': 'application/json' },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.err) {
                throw new Error(body?.err || `HTTP ${res.status}`);
            }
            const { task_id } = body;
            for (;;) {
                await new Promise(r => setTimeout(r, 3000));
                const statusRes = await fetch(`${dmsServerPath}/dms/tasks/${task_id}`);
                const task = await statusRes.json().catch(() => ({}));
                if (task.progress != null) {
                    setSyncState(prev => ({ ...prev, [subdomain]: { ...prev[subdomain], progress: task.progress } }));
                }
                if (task.status === 'done') {
                    const r = task.result || {};
                    const message = `Synced ${r.sectionsPatched ?? 0} section(s) across ${r.pagesPatched ?? 0} page(s)`
                        + (r.warnings ? ` — ${r.warnings} warning(s)` : '')
                        + (r.pagesPatched ? '. Pending pages are in the "To Publish" queue.' : '.');
                    setSyncState(prev => ({ ...prev, [subdomain]: { syncing: false, progress: 1, message, isError: false } }));
                    // The sync worker writes directly to the DB via a plain REST POST — it never
                    // goes through Falcor, so the client's Falcor cache has no idea these rows
                    // changed. Without this, PatternPagesEditor's "To Publish" queue (and anything
                    // else that already cached these pages/sections) keeps serving pre-sync data —
                    // confirmed live: a bulk-publish right after a sync published the STALE cached
                    // section content, not the freshly-synced values. Invalidate both branches this
                    // worker can write to so every already-mounted or freshly-loaded consumer
                    // refetches for real.
                    if (falcor) {
                        await falcor.invalidate(['dms', 'data', `${app}+${patternInstance}|page`]);
                        await falcor.invalidate(['dms', 'data', `${app}+${patternInstance}|component`]);
                    }
                    return;
                }
                if (task.status === 'error') {
                    throw new Error(task.error || 'Sync failed');
                }
            }
        } catch (err) {
            setSyncState(prev => ({ ...prev, [subdomain]: { syncing: false, progress: 0, message: err.message, isError: true } }));
        }
    };

    const updateSubdomainFilters = (subdomain, filters) => {
        setTmpFilters(prev => ({ ...prev, [subdomain]: filters }));
    };

    const removeSubdomain = (subdomain) => {
        setTmpFilters(prev => {
            const next = { ...prev };
            delete next[subdomain];
            return next;
        });
    };

    const addSubdomain = () => {
        const key = newSubdomain.trim();
        if (!key || tmpFilters[key] !== undefined) return;
        setTmpFilters(prev => ({ ...prev, [key]: [] }));
        setNewSubdomain('');
    };

    return (
        <div className={t.wrapper}>
            <label className={t.label}>Filters</label>

            {Object.entries(tmpFilters).map(([subdomain, filters]) => {
                const sync = syncState[subdomain];
                return (
                <div key={subdomain} className={t.subdomainSection}>
                    <div className={t.subdomainHeader}>
                        <span className={t.subdomainBadge}>
                            subdomain: {subdomain === '*' ? 'none' : subdomain}
                        </span>
                        {subdomain !== '*' && (
                            <button
                                className={t.subdomainRemoveBtn}
                                onClick={() => removeSubdomain(subdomain)}
                            >
                                remove subdomain
                            </button>
                        )}
                        <Button
                            buttonType="plain"
                            disabled={hasUnsavedChanges || sync?.syncing || !filters.length}
                            title={hasUnsavedChanges ? 'Save filter changes before syncing' : 'Reconcile this filter group into every page (draft-only)'}
                            onClick={() => syncGroup(subdomain)}
                        >
                            {sync?.syncing ? `Syncing… ${Math.round((sync.progress || 0) * 100)}%` : 'Sync to Pages'}
                        </Button>
                    </div>
                    {sync?.message && (
                        <div className={sync.isError ? t.syncMessageError : t.syncMessageSuccess}>
                            {sync.message}
                        </div>
                    )}
                    <FilterRows
                        filters={filters}
                        onChange={(updated) => updateSubdomainFilters(subdomain, updated)}
                    />
                </div>
                );
            })}

            <div className={t.addSubdomainRow}>
                <input
                    className={t.subdomainInput}
                    placeholder="subdomain name"
                    value={newSubdomain}
                    onChange={e => setNewSubdomain(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSubdomain()}
                />
                <button
                    className={t.addSubdomainBtn}
                    onClick={addSubdomain}
                >
                    Add subdomain
                </button>
            </div>

            <FieldSet
                className={t.saveGrid}
                components={[
                    {
                        type: 'Spacer',
                        customTheme: { field: 'bg-white col-span-10 ' }
                    },
                    {
                        type: 'Button',
                        children: <span>Reset</span>,
                        buttonType: 'plain',
                        disabled: isEqual(tmpFilters, normalised),
                        onClick: () => setTmpFilters(normalised),
                        customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    },
                    {
                        type: 'Button',
                        children: <span>Save</span>,
                        disabled: isEqual(tmpFilters, normalised),
                        onClick: () => apiUpdate({ data: { id: value.id, filters: tmpFilters } }),
                        customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    }
                ]}
            />
        </div>
    );
};
