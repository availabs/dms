import React, { useState, useContext, useMemo, useEffect, useCallback } from 'react';
import { isEqual } from "lodash-es";
import { useImmer } from "use-immer";
import { ThemeContext } from '../../../../../ui/useTheme';
import { CMSContext, PageContext, DataSourceContext } from '../../../context';
import { getPageAuthPermissions } from '../../../pages/_utils';
import { useDataSource } from '../../../components/sections/components/dataWrapper/useDataSource';
import { useDataWrapperAPI } from '../../../components/sections/components/dataWrapper/useDataWrapperAPI';
import ColumnManager from '../../../components/sections/ColumnManager';
import { ComplexFilters } from '../../../components/sections/ComplexFilters';

// ─── Data source card (list item) ───────────────────────────────────────────

function DataSourceCard({ dataSource, selected, onSelect, onRemove, Icon, Pill }) {
    const columnCount = (dataSource.columns || []).filter(c => c.show).length;
    const sourceName = dataSource.externalSource?.name || dataSource.externalSource?.view_name || '';

    return (
        <div
            className={`p-2 rounded border cursor-pointer ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
            onClick={onSelect}
        >
            <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{dataSource.name || 'Unnamed Source'}</div>
                    <div className="text-xs text-gray-500 truncate">
                        {sourceName ? `${sourceName} · ` : ''}{columnCount} columns
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        title="Remove"
                    >
                        <Icon icon="TrashCan" className="size-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Data source editor (expanded) ──────────────────────────────────────────

function DataSourceEditor({ dataSource, setDataSource }) {
    const { UI } = useContext(ThemeContext) || {};
    const { Pill, Icon, Switch } = UI;

    // Local editing state — syncs back to page level on changes (debounced)
    const [editState, setEditState] = useImmer({
        ...dataSource,
        // Ensure required fields exist for useDataSource / dwAPI compatibility
        filters: dataSource.filters || { op: 'AND', groups: [] },
        display: dataSource.display || {},
        columns: dataSource.columns || [],
        externalSource: dataSource.externalSource || {},
    });

    // Debounced sync back to page-level data source
    useEffect(() => {
        const timeout = setTimeout(() => {
            // Only sync config fields, not runtime
            const config = {
                id: editState.id,
                name: editState.name,
                externalSource: editState.externalSource,
                columns: editState.columns,
                filters: editState.filters,
            };
            if (!isEqual(config, {
                id: dataSource.id,
                name: dataSource.name,
                externalSource: dataSource.externalSource,
                columns: dataSource.columns,
                filters: dataSource.filters,
            })) {
                setDataSource(config);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [editState.externalSource, editState.columns, editState.filters, editState.name]);

    // dwAPI for column manager
    const dwAPI = useDataWrapperAPI({ state: editState, setState: setEditState });

    // useDataSource for source/version picker
    const { activeSource, activeView, sources, views, onSourceChange, onViewChange } = useDataSource({
        state: editState,
        setState: setEditState,
    });

    return (
        <div className="flex flex-col gap-3 p-2 border rounded bg-white">
            {/* Name */}
            <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 shrink-0">Name</label>
                <input
                    className="flex-1 px-2 py-1 text-sm border rounded"
                    value={editState.name || ''}
                    onChange={e => setEditState(draft => { draft.name = e.target.value; })}
                    placeholder="Data source name"
                />
            </div>

            {/* Source picker */}
            <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600">Source</label>
                <select
                    className="px-2 py-1 text-sm border rounded"
                    value={activeSource || ''}
                    onChange={e => onSourceChange(e.target.value)}
                >
                    <option value="">Select a source...</option>
                    {sources.map(({ key, label }) => (
                        <option key={key} value={key}>{label}</option>
                    ))}
                </select>
            </div>

            {/* Version picker */}
            {views.length > 0 && (
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Version</label>
                    <select
                        className="px-2 py-1 text-sm border rounded"
                        value={activeView || ''}
                        onChange={e => onViewChange(e.target.value)}
                    >
                        {views.map(({ key, label }) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Column manager */}
            {editState.externalSource?.columns?.length > 0 && (
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Columns ({(editState.columns || []).filter(c => c.show).length} visible)</label>
                    <ColumnManager
                        dwAPI={dwAPI}
                        resolvedControls={{}}
                        Pill={Pill}
                        Icon={Icon}
                        Switch={Switch}
                    />
                </div>
            )}

            {/* Filter editor */}
            {editState.externalSource?.columns?.length > 0 && (
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Filters</label>
                    <ComplexFilters state={dwAPI.state} setState={dwAPI.setState} />
                </div>
            )}
        </div>
    );
}

// ─── Main pane ──────────────────────────────────────────────────────────────

function DataSourcesPane() {
    const { UI } = useContext(ThemeContext) || {};
    const { Icon, Pill } = UI;
    const { pageState } = useContext(PageContext) || {};
    const { isUserAuthed } = useContext(CMSContext) || {};
    const { dataSources, createDataSource, removeDataSource, setDataSource } = useContext(DataSourceContext);

    const [selectedId, setSelectedId] = useState(null);

    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const canEdit = isUserAuthed?.(['edit-page'], pageAuthPermissions);

    const sourceList = useMemo(() => Object.values(dataSources || {}), [dataSources]);

    if (!canEdit) return null;

    return (
        <div className="flex h-full flex-col">
            <div className="px-4 sm:px-6 py-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-base font-semibold leading-6 text-gray-900">
                        Data Sources
                    </h1>
                    <Pill
                        text="Add"
                        color="blue"
                        onClick={() => {
                            const id = createDataSource({});
                            setSelectedId(id);
                        }}
                    />
                </div>
            </div>

            <div className="relative mt-2 flex-1 px-4 sm:px-6 w-full max-h-[calc(100vh_-_135px)] overflow-y-auto scrollbar-sm">
                <div className="flex flex-col gap-2">
                    {sourceList.length === 0 && (
                        <div className="text-sm text-gray-400 text-center py-4">
                            No data sources configured. Click "Add" to create one.
                        </div>
                    )}

                    {sourceList.map(ds => (
                        <DataSourceCard
                            key={ds.id}
                            dataSource={ds}
                            selected={selectedId === ds.id}
                            onSelect={() => setSelectedId(selectedId === ds.id ? null : ds.id)}
                            onRemove={() => {
                                removeDataSource(ds.id);
                                if (selectedId === ds.id) setSelectedId(null);
                            }}
                            Icon={Icon}
                            Pill={Pill}
                        />
                    ))}

                    {/* Expanded editor for selected source */}
                    {selectedId && dataSources[selectedId] && (
                        <DataSourceEditor
                            key={selectedId}
                            dataSource={dataSources[selectedId]}
                            setDataSource={(config) => setDataSource(selectedId, config)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default DataSourcesPane;
