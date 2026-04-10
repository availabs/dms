import React, { useState, useMemo, useCallback } from 'react';
import DraggableList from "../../../../ui/components/DraggableList";
import Input from "../../../../ui/components/Input";
import columnTypes from "../../../../ui/columnTypes";
import { getColumnLabel, isEqualColumns } from "./controls_utils";
import AddFormulaColumn from "./AddFormulaColumn";
import AddCalculatedColumn from "./AddCalculatedColumn";
import {isEqual} from "lodash-es";

const ColumnPicker = ({ dwAPI, allColumns, stagedColumns, setStagedColumns, Pill, Icon }) => {
    const { setState, state: { join } } = dwAPI;
    const externalSource = join.sources.table2.sourceInfo;
    const stateColumns = join.sources.table2.columns;
    const [pickerSearch, setPickerSearch] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    console.log("in column picker, join::", join)
    const availableColumns = useMemo(() => {
        return (externalSource?.columns || [])
            .filter(c => !pickerSearch || getColumnLabel(c).toLowerCase().includes(pickerSearch.toLowerCase()));
    }, [externalSource?.columns, stateColumns, stagedColumns, pickerSearch]);

    const stageColumn = (col) => {
        setStagedColumns(prev => [...prev, col]);
    };

    const unstageColumn = (col) => {
        setStagedColumns(prev => prev.filter(c => c.name !== col.name));
    };

    const confirmAdd = () => {
        setState(draft => {
            const isGrouping = draft.join.sources.table2.columns.some(c => c.group);
            stagedColumns.forEach(col => {
                const exists = draft.join.sources.table2.columns.some(c => isEqualColumns(c, col));
                if (exists) {
                    const idx = draft.join.sources.table2.columns.findIndex(c => isEqualColumns(c, col));
                    const base = draft.join.sources.table2.columns[idx];
                    const numDuplicates = draft.join.sources.table2.columns.filter(c => c.isDuplicate && c.name === base.name).length;
                    const dup = {
                        ...JSON.parse(JSON.stringify(base)),
                        show: true,
                        isDuplicate: true,
                        copyNum: numDuplicates + 1,
                        normalName: `${base.name}_copy_${numDuplicates + 1}`,
                        display_name: `${getColumnLabel(base)} Copy ${numDuplicates + 1}`
                    };
                    if (isGrouping && !dup.group && !dup.fn) {
                        dup.fn = dup.defaultFn?.toLowerCase() || 'list';
                    }
                    dup.name = `table2.${dup.name}`
                    draft.join.sources.table2.columns.splice(idx, 0, dup);
                    draft.columns.push(dup)
                } else {
                    const newCol = { ...col, show: true };
                    if (isGrouping && !newCol.group && !newCol.fn) {
                        newCol.fn = newCol.defaultFn?.toLowerCase() || 'list';
                    }
                    draft.join.sources.table2.columns.push(newCol);
                    newCol.name = `table2.${newCol.name}`
                    draft.columns.push(newCol)
                }
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
                    <Pill text="Add" color="green" onClick={confirmAdd} />
                </div>
            )}
        </div>
    );
};

const renderControl = (control, columnData, onUpdate, { Switch, dwAPI }) => {
    const isDisabled = typeof control.disabled === 'function' ? control.disabled({ attribute: columnData }) : control.disabled;

    if (control.type === 'toggle') {
        return (
            <div key={control.key} className="flex items-center gap-1">
                <label className="text-xs text-gray-600">{control.label}</label>
                <Switch
                    size="small"
                    enabled={!!columnData[control.key]}
                    setEnabled={(value) => isDisabled ? null :
                        onUpdate(control.key, value && control.trueValue ? control.trueValue : value, control.onChange)}
                />
            </div>
        );
    }

    if (control.type === 'select') {
        const SelectComp = columnTypes?.select?.EditComp;
        return SelectComp ? (
            <div key={control.key} className="flex items-center gap-1">
                <label className="text-xs text-gray-600">{control.label}</label>
                <SelectComp
                    value={columnData[control.key]}
                    options={control.options}
                    disabled={isDisabled}
                    onChange={e => onUpdate(control.key, e, control.onChange)}
                />
            </div>
        ) : null;
    }

    if (typeof control.type === 'function') {
        return (
            <div key={control.key}>
                {control.type({
                    attribute: columnData,
                    setAttribute: newValue => onUpdate(undefined, newValue, control.onChange),
                    value: columnData[control.key],
                    setValue: newValue => onUpdate(control.key, newValue, control.onChange),
                    state: dwAPI.state,
                    setState: dwAPI.setState
                })}
            </div>
        );
    }

    if (control.type === 'input') {
        return (
            <div key={control.key} className="flex items-center gap-1">
                <label className="text-xs text-gray-600">{control.label}</label>
                <Input
                    value={columnData[control.key] || ''}
                    onChange={e => onUpdate(control.key, e.target.value, control.onChange)}
                />
            </div>
        );
    }

    return null;
};

const ColumnRow = ({ column, index, dwAPI, resolvedControls, Pill, Icon, Switch, isExpanded, onToggleExpand, isOutOfDate, onRefreshMeta, setState }) => {
    const label = getColumnLabel(column);
    const onUpdate = useCallback((key, value, onChange) =>
        dwAPI.updateColumn(column, key, value, onChange), [column, dwAPI.updateColumn]);

    const onRemove = useCallback(column => {
        console.log("on remove joined column::", column)
        setState(draft => {
            draft.join.sources.table2.columns = draft.join.sources.table2.columns.filter(col => col.name !== column.name)
        })
    })


    return (
        <div className="border rounded bg-white mb-0.5">
            <div className="flex items-center justify-between px-2 py-1 gap-1">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Icon icon="Reorder" className="size-4 text-gray-400 shrink-0 cursor-grab" />
                    <span className="text-sm truncate">{label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {isOutOfDate && (
                        <button
                            className="p-0.5 rounded hover:bg-gray-100 text-amber-500 cursor-pointer"
                            title="Metadata out of date"
                            onClick={onRefreshMeta}
                        >
                            <Icon icon="Alert" className="size-4" />
                        </button>
                    )}
                    {column.fn && (
                        <span className="p-0.5 text-gray-400" title={column.fn}>
                            <Icon icon={
                                column.fn === 'count' ? 'TallyMark' :
                                    column.fn === 'list' ? 'LeftToRightListBullet' :
                                        column.fn === 'sum' ? 'Sum' :
                                            column.fn === 'avg' ? 'Avg' :
                                                'TallyMark'
                            } className="size-4 text-blue-500" />
                        </span>
                    )}
                    <button className={`p-0.5 rounded hover:bg-gray-100 ${column.group ? `text-blue-500` : `text-gray-300`} cursor-pointer`}
                            title={column.group ? 'Grouping By' : 'Group By'}
                            onClick={() => dwAPI.updateColumn(column, 'group', !column.group)}
                    >
                            <Icon icon="Group" className="size-4" />
                    </button>
                    <button
                        className={`p-0.5 rounded hover:bg-gray-100 ${column.show ? 'text-blue-500' : 'text-gray-300'} cursor-pointer`}
                        onClick={() => dwAPI.updateColumn(column, 'show', !column.show)}
                        title={column.show ? 'Hide' : 'Show'}
                    >
                        <Icon icon={column.show ? 'Eye' : 'EyeClosed'} className="size-4" />
                    </button>
                    <button
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"
                        onClick={onToggleExpand}
                        title="Settings"
                    >
                        <Icon icon="CaretDown" className="size-4" />
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className="px-3 py-2 border-t bg-gray-50 flex flex-col gap-1.5" draggable={false}>
                    <div className={'text-xs text-gray-900 py-0.5'}>{column.name}</div>
                    <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-600">Name</label>
                        <Input
                            value={getColumnLabel(column)}
                            onChange={e => dwAPI.updateColumn(column, 'customName', e.target.value)}
                        />
                    </div>
                    {[
                        ...(resolvedControls?.columns || []),
                        // ...(resolvedControls?.inHeader || [])
                    ]
                        .filter(c => !c.hideFromSectionMenu)
                        .map(c => renderControl(c, column, onUpdate, { Switch, dwAPI }))}
                    <div className="flex gap-1 pt-1">
                        <Pill text="Duplicate" color="blue" onClick={() => dwAPI.duplicateColumn(column)} />
                        <Pill text="Remove" color="orange" onClick={() => onRemove(column)} />
                        {isOutOfDate && (
                            <Pill text="Refresh Meta" color="orange" onClick={onRefreshMeta} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const AllColumnsRow = ({ dwAPI, resolvedControls, isEveryColVisible, Pill, Icon, Switch, isExpanded, onToggleExpand, setState }) => {
    const columns = dwAPI.config.columns || [];

    const aggregateColumn = useMemo(() => {
        if (!columns.length) return {};
        const keys = new Set(columns.flatMap(Object.keys));
        const result = {};
        for (const key of keys) {
            const values = columns.map(c => c[key]);
            result[key] = values.every(v => v === values[0]) ? values[0] : undefined;
        }
        return result;
    }, [columns]);

    const onUpdate = useCallback((key, value, onChange) =>
        dwAPI.updateAllColumns(key, value, onChange), [dwAPI.updateAllColumns]);

    return (
        <div className="border rounded bg-white mb-0.5">
            <div className="flex items-center justify-between px-2 py-1 gap-1">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Icon icon="Settings" className="size-4 text-gray-400 shrink-0" />
                    <span className="text-sm font-medium truncate">All Columns</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        className={`p-0.5 rounded hover:bg-gray-100 ${isEveryColVisible ? 'text-blue-500' : 'text-gray-300'}`}
                        onClick={() => dwAPI.toggleGlobalVisibility(!isEveryColVisible)}
                        title={isEveryColVisible ? 'Hide All' : 'Show All'}
                    >
                        <Icon icon={isEveryColVisible ? 'Eye' : 'EyeClosed'} className="size-4" />
                    </button>
                    <button
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                        onClick={onToggleExpand}
                        title="Settings"
                    >
                        <Icon icon="CaretDown" className="size-4" />
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className="px-3 py-2 border-t bg-gray-50 flex flex-col gap-1.5" draggable={false}>
                    {[
                        ...(resolvedControls?.columns || []),
                        ...(resolvedControls?.inHeader || [])
                    ]
                        .filter(c => !c.hideFromSectionMenu)
                        .map(c => renderControl(c, aggregateColumn, onUpdate, { Switch, dwAPI }))}
                    <div className="flex gap-1 pt-1">
                        <Pill text="Remove All" color="orange" onClick={() => onRemoveAll()} />
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * UI for letting user pick columns for the 2nd table 
 */
export default function JoinedColumnPicker({ dwAPI, resolvedControls, Pill, Icon, Switch, showAllColumnsControl, onJoinChange }) {
    const { setState, state: { join } } = dwAPI;
    const externalSource = join.sources.table2.sourceInfo;
    const stateColumns = join.sources.table2.columns;
    const [stagedColumns, setStagedColumns] = useState([]);
    const [expandedColumns, setExpandedColumns] = useState(new Set());
    const [allColumnsExpanded, setAllColumnsExpanded] = useState(false);
    const ATTRS_TO_SYNC = ['type', 'required', 'display', 'defaultFn', 'dataType', 'trueValue', 'options', 'mapped_options', 'meta_lookup'];

    const outOfDateColumnNames = useMemo(() => new Set(
        (externalSource?.columns || [])
            .filter(origCol => {
                const stateCol = (stateColumns || []).find(c => c.name === origCol.name);
                if (!stateCol) return false;
                return ATTRS_TO_SYNC.some(attr => !isEqual(stateCol[attr], origCol[attr]));
            })
            .map(c => c.name)
    ), [externalSource?.columns, stateColumns]);

    const refreshMeta = useCallback((column) => {
        const sourceCol = (externalSource?.columns || []).find(c => c.name === column.name);
        if (!sourceCol) return;
        setState(draft => {
            const idx = draft.join.sources.table2.columns.findIndex(c => c.name === column.name && c.isDuplicate === column.isDuplicate && c.copyNum === column.copyNum);
            if (idx !== -1) {
                ATTRS_TO_SYNC.forEach(attr => {
                    draft.join.sources.table2.columns[idx][attr] = sourceCol[attr];
                });
            }
        });
    }, [externalSource?.columns, setState]);
    const allColumns = useMemo(() => [
        ...(stateColumns || []),
        ...(externalSource?.columns || [])
            .filter(c => !(stateColumns || []).map(c => c.name).includes(c.name))
    ], [stateColumns, externalSource?.columns]);

    const isEveryColVisible = useMemo(() =>
        (externalSource?.columns || [])
            .map(({ name }) => (stateColumns || []).find(column => column?.name === name))
            .every(column => column?.show),
        [externalSource?.columns, stateColumns]
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
    console.log("I am inside joined column picker")
    const onRemoveAll = useCallback(() =>  setState(draft =>{
        draft.join.sources.table2.columns = [];
    }))

    return (
        <div className="flex flex-col gap-2 w-full p-1">
            {/* Column Picker */}
            <ColumnPicker
                dwAPI={dwAPI}
                stagedColumns={stagedColumns}
                allColumns={allColumns}
                setStagedColumns={setStagedColumns}
                Pill={Pill}
                Icon={Icon}
            />

            {/* Bulk Actions */}
            <div className="flex flex-wrap gap-1">
                <Pill text={isSystemIDColOn ? 'Hide ID' : 'Use ID'} color="blue"
                      onClick={() => dwAPI.toggleIdFilter()} />
                <Pill
                    text={isAllExpanded ? 'Collapse All' : 'Expand All'}
                    color="gray"
                    onClick={() => {
                        setExpandedColumns(isAllExpanded ? new Set() : new Set(activeColumns.map(i => i.id)));
                    }}
                />
                <Pill
                    color={isEveryColVisible ? 'orange' : 'blue'}
                    onClick={() => dwAPI.toggleGlobalVisibility(!isEveryColVisible)}
                    text={isEveryColVisible ? 'Hide All' : 'Show All'}
                />
                <Pill text="Remove All" color="orange" onClick={() => onRemoveAll()} />
            </div>

            {/* All Columns Row */}
            {showAllColumnsControl && activeColumns.length > 1 && (
                <AllColumnsRow
                    dwAPI={dwAPI}
                    resolvedControls={resolvedControls}
                    isEveryColVisible={isEveryColVisible}
                    Pill={Pill}
                    Icon={Icon}
                    Switch={Switch}
                    setState={setState}
                    isExpanded={allColumnsExpanded}
                    onToggleExpand={() => setAllColumnsExpanded(prev => !prev)}
                />
            )}

            {/* Active Columns List */}
            {activeColumns.length > 0 && (
                <DraggableList
                    dataItems={activeColumns}
                    onChange={onReorder}
                    renderItem={({ item }) => (
                        <ColumnRow
                            setState={setState}
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
