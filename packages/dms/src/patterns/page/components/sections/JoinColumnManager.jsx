import React, { useState, useMemo, useCallback } from 'react';
import DraggableList from "../../../../ui/components/DraggableList";
import Input from "../../../../ui/components/Input";
import columnTypes from "../../../../ui/columnTypes";
import { getColumnLabel, isEqualColumns } from "./controls_utils";
import AddFormulaColumn from "./AddFormulaColumn";
import AddCalculatedColumn from "./AddCalculatedColumn";
import {isEqual} from "lodash-es";

/**
 * TODO IMPLEMENT onJoinChange
 */
const ColumnPicker = ({ dwAPI, allColumns, stagedColumns, setStagedColumns, Pill, Icon, stateColumns, source_id, onJoinChange }) => {
    const { config: { externalSource }, setState, state: { join } } = dwAPI;
    //joinConfig is join.sources
    const {sources: joinConfig} = join || {};

    const sourceAlias = externalSource.source_id === source_id ? 'ds' : Object.keys(joinConfig).find(sAlias => joinConfig[sAlias].source === source_id);
   
    const sourceColumns = externalSource.columns.filter(col => col.source_id === source_id);
    //draft.join is the actual config
    //draft.joinSource is the metadata for the joinSource

    const [pickerSearch, setPickerSearch] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    const availableColumns = useMemo(() => {
        return (sourceColumns || [])
            .filter(c => !pickerSearch || getColumnLabel(c).toLowerCase().includes(pickerSearch.toLowerCase()));
    }, [sourceColumns, stagedColumns, pickerSearch]);

    const stageColumn = (col) => {
        setStagedColumns(prev => [...prev, col]);
    };

    const unstageColumn = (col) => {
        setStagedColumns(prev => prev.filter(c => c.name !== col.name));
    };

    const confirmAdd = () => {
        setState(draft => {
            stagedColumns.forEach(col => {
                const newCol = { ...col, show: true };
                draft.join.sources[sourceAlias].joinColumn = newCol;
            });
        });
        setStagedColumns([]);
        setPickerSearch('');
    };

    const showDropdown = isFocused && availableColumns.length > 0;
    return (
        <div className="flex flex-col p-1 gap-1 w-full relative bg-blue-50 rounded-md">
            <div className={'flex gap-1'}>
                <AddFormulaColumn columns={allColumns} addFormulaColumn={col => dwAPI.addFormulaColumn(col)} />
                <AddCalculatedColumn columns={allColumns} addCalculatedColumn={col => dwAPI.addCalculatedColumn(col)} />
            </div>
            <Input
                disabled={stateColumns.length >= 1}
                placeholder="Search columns to add..."
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            />
            {showDropdown && (
                <div className="max-h-40 overflow-y-auto border rounded bg-white scrollbar-sm">
                    {availableColumns.map(col => (
                        <div
                            key={col.name}
                            className="px-2 py-1 text-sm hover:bg-blue-100 cursor-pointer"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                stageColumn(col);
                            }}
                        >
                            {getColumnLabel(col)}
                        </div>
                    ))}
                </div>
            )}
            {stagedColumns.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                    {stagedColumns.map(col => (
                        <Pill
                            key={col.name}
                            text={<span className="flex items-center gap-1">
                                {getColumnLabel(col)}
                                <Icon icon="XMark" className="size-3 cursor-pointer" />
                            </span>}
                            color="blue"
                            onClick={() => unstageColumn(col)}
                        />
                    ))}
                    <Pill text="Add" color="green" onClick={stagedColumns.length === 1 ? confirmAdd : () => {}} />
                </div>
            )}
        </div>
    );
};

const ColumnRow = ({ column, index, dwAPI, resolvedControls, Pill, Icon, Switch, isExpanded, onToggleExpand, isOutOfDate, onRefreshMeta, onJoinChange, sourceAlias }) => {
    const label = getColumnLabel(column);


    return (
        <div className="border rounded bg-white mb-0.5">
            <div className="flex items-center justify-between px-2 py-1 gap-1">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-sm truncate">{label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Pill text="Remove" color="orange" onClick={() => onJoinChange(`sources.${sourceAlias}.joinColumn`,null)} />
                    {isOutOfDate && (
                        <button
                            className="p-0.5 rounded hover:bg-gray-100 text-amber-500 cursor-pointer"
                            title="Metadata out of date"
                            onClick={onRefreshMeta}
                        >
                            <Icon icon="Alert" className="size-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


export default function JoinColumnManager({ dwAPI, resolvedControls, Pill, Icon, Switch, showAllColumnsControl, label="", source_id, onJoinChange }) {
    //console.log("join col manager, dwApi::", dwAPI)


    //config: { columns: stateColumns, externalSource }
    //normally, the old col manager just got state.columns
    //here, we want state.join.sources['ds'] or state.join.sources['table2'];
    const { config: { externalSource }, setState, state: { join } } = dwAPI;
    const [stagedColumns, setStagedColumns] = useState([]);
    const [expandedColumns, setExpandedColumns] = useState(new Set());
    const [allColumnsExpanded, setAllColumnsExpanded] = useState(false);
    const ATTRS_TO_SYNC = ['type', 'required', 'display', 'defaultFn', 'dataType', 'trueValue', 'options', 'mapped_options', 'meta_lookup'];
    
    //joinConfig is join.sources
    const {sources: joinConfig} = join || {};

    const sourceAlias = externalSource.source_id === source_id ? 'ds' : Object.keys(joinConfig).find(sAlias => joinConfig[sAlias].source === source_id);
    const stateColumns = joinConfig?.[sourceAlias]?.joinColumn ? [joinConfig?.[sourceAlias]?.joinColumn] : [];
   
    const sourceColumns = externalSource.columns.filter(col => col.source_id === source_id);
    console.log({source_id, sourceAlias, stateColumns, sourceColumns});

    
    // console.log("col manager",{joinConfig})
    // console.log({stateColumns})
    // console.log({externalSource})
    const outOfDateColumnNames = useMemo(() => new Set(
        (sourceColumns || [])
            .filter(origCol => {
                const stateCol = (stateColumns || []).find(c => c.name === origCol.name);
                if (!stateCol) return false;
                return ATTRS_TO_SYNC.some(attr => !isEqual(stateCol[attr], origCol[attr]));
            })
            .map(c => c.name)
    ), [sourceColumns, stateColumns]);
    //console.log("column manager::", sourceColumns, stateColumns)
    const refreshMeta = useCallback((column) => {
        const sourceCol = (sourceColumns || []).find(c => c.name === column.name);
        if (!sourceCol) return;
        setState(draft => {
            const idx = draft.columns.findIndex(c => c.name === column.name && c.isDuplicate === column.isDuplicate && c.copyNum === column.copyNum);
            if (idx !== -1) {
                ATTRS_TO_SYNC.forEach(attr => {
                    draft.columns[idx][attr] = sourceCol[attr];
                });
            }
        });
    }, [sourceColumns, setState]);
    const allColumns = useMemo(() => [
        ...(stateColumns || []),
        ...(sourceColumns || [])
            .filter(c => !(stateColumns || []).map(c => c.name).includes(c.name))
    ], [stateColumns, sourceColumns]);

    const isEveryColVisible = useMemo(() =>
        (sourceColumns || [])
            .map(({ name }) => (stateColumns || []).find(column => column?.name === name))
            .every(column => column?.show),
        [sourceColumns, stateColumns]
    );

    const isSystemIDColOn = (stateColumns || []).find(c => c.systemCol && c.name === 'id');

    const activeColumns = useMemo(() =>
        (stateColumns || []).map((column, i) => ({
            id: `${column.name}_${column.isDuplicate ? column.copyNum : ''}_${i}`,
            column
        })),
        [stateColumns]
    );

    const toggleExpand = useCallback((columnId) => {
        setExpandedColumns(prev => {
            const next = new Set(prev);
            if (next.has(columnId)) next.delete(columnId);
            else next.add(columnId);
            return next;
        });
    }, []);

    const onReorder = useCallback((updatedItems) => {
        dwAPI.reorderColumns(
            updatedItems
                .map(item => (stateColumns || []).find(draftCol => isEqualColumns(draftCol, item.column)))
                .filter(Boolean)
        );
    }, [dwAPI.reorderColumns, stateColumns]);
    const isAllExpanded = activeColumns.length > 0 && activeColumns.every(i => expandedColumns.has(i.id));
    return (
        <div className="flex flex-col gap-2 w-full p-1">
            {label}
            {/* Column Picker */}
            <ColumnPicker
                onJoinChange={onJoinChange}
                source_id={source_id}
                sourceAlias={sourceAlias}
                stateColumns={stateColumns}
                dwAPI={dwAPI}
                stagedColumns={stagedColumns}
                allColumns={allColumns}
                setStagedColumns={setStagedColumns}
                Pill={Pill}
                Icon={Icon}
            />

            {/* Active Columns List */}
            {activeColumns.length > 0 && (
                <DraggableList
                    dataItems={activeColumns}
                    onChange={onReorder}
                    renderItem={({ item }) => (
                        <ColumnRow
                            source_id={source_id}
                            sourceAlias={sourceAlias}
                            onJoinChange={onJoinChange}
                            key={item.id}
                            column={item.column}
                            index={item.id}
                            dwAPI={dwAPI}
                            resolvedControls={resolvedControls}
                            Pill={Pill}
                            Icon={Icon}
                            Switch={Switch}
                            isExpanded={expandedColumns.has(item.id)}
                            onToggleExpand={() => toggleExpand(item.id)}
                            isOutOfDate={outOfDateColumnNames.has(item.column.name)}
                            onRefreshMeta={() => refreshMeta(item.column)}
                        />
                    )}
                />
            )}

            {activeColumns.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-2">
                    No columns configured. Use search above to add columns.
                </div>
            )}
        </div>
    );
}
