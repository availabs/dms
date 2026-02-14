import React, { useState, useMemo, useCallback } from 'react';
import DraggableList from "../../../../ui/components/DraggableList";
import Input from "../../../../ui/components/Input";
import columnTypes from "../../../../ui/columnTypes";
import {
    getColumnLabel, updateColumns, resetColumn,
    resetAllColumns, duplicate, toggleIdFilter,
    toggleGlobalVisibility, addFormulaColumn, isEqualColumns, addCalculatedColumn
} from "./controls_utils";
import AddFormulaColumn from "./AddFormulaColumn";
import AddCalculatedColumn from "./AddCalculatedColumn";

const ColumnPicker = ({ state, setState, stagedColumns, setStagedColumns, Pill, Icon }) => {
    const [pickerSearch, setPickerSearch] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    const availableColumns = useMemo(() => {
        const stateColNames = new Set((state?.columns || []).map(c => c.name));
        const stagedNames = new Set(stagedColumns.map(c => c.name));
        return (state?.sourceInfo?.columns || [])
            .filter(c => !stateColNames.has(c.name) && !stagedNames.has(c.name))
            .filter(c => !pickerSearch || getColumnLabel(c).toLowerCase().includes(pickerSearch.toLowerCase()));
    }, [state?.sourceInfo?.columns, state?.columns, stagedColumns, pickerSearch]);

    const stageColumn = (col) => {
        setStagedColumns(prev => [...prev, col]);
    };

    const unstageColumn = (col) => {
        setStagedColumns(prev => prev.filter(c => c.name !== col.name));
    };

    const confirmAdd = () => {
        setState(draft => {
            stagedColumns.forEach(col => {
                const exists = draft.columns.some(c => isEqualColumns(c, col));
                if (!exists) {
                    draft.columns.push({ ...col, show: true });
                }
            });
        });
        setStagedColumns([]);
        setPickerSearch('');
    };

    const showDropdown = isFocused && availableColumns.length > 0;

    return (
        <div className="flex flex-col gap-1 w-full relative">
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

const ColumnRow = ({ column, index, state, setState, resolvedControls, Pill, Icon, Switch, isExpanded, onToggleExpand }) => {
    const label = getColumnLabel(column);

    const renderControl = (control) => {
        const isDisabled = typeof control.disabled === 'function' ? control.disabled({ attribute: column }) : control.disabled;

        if (control.type === 'toggle') {
            return (
                <div key={control.key} className="flex items-center gap-1">
                    <label className="text-xs text-gray-600">{control.label}</label>
                    <Switch
                        size="small"
                        enabled={!!column[control.key]}
                        setEnabled={(value) => isDisabled ? null :
                            updateColumns(column, control.key, value && control.trueValue ? control.trueValue : value, control.onChange, setState)}
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
                        value={column[control.key]}
                        options={control.options}
                        disabled={isDisabled}
                        onChange={e => updateColumns(column, control.key, e, control.onChange, setState)}
                    />
                </div>
            ) : null;
        }

        if (typeof control.type === 'function') {
            return (
                <div key={control.key}>
                    {control.type({
                        attribute: column,
                        setAttribute: newValue => updateColumns(column, undefined, newValue, control.onChange, setState),
                        value: column[control.key],
                        setValue: newValue => updateColumns(column, control.key, newValue, control.onChange, setState),
                        setState
                    })}
                </div>
            );
        }

        if (control.type === 'input') {
            return (
                <div key={control.key} className="flex items-center gap-1">
                    <label className="text-xs text-gray-600">{control.label}</label>
                    <Input
                        value={column[control.key] || ''}
                        onChange={e => updateColumns(column, control.key, e.target.value, control.onChange, setState)}
                    />
                </div>
            );
        }

        return null;
    };

    return (
        <div className="border rounded bg-white mb-0.5">
            <div className="flex items-center justify-between px-2 py-1 gap-1">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Icon icon="Reorder" className="size-4 text-gray-400 shrink-0 cursor-grab" />
                    <span className="text-sm truncate">{label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        className={`p-0.5 rounded hover:bg-gray-100 ${column.show ? 'text-blue-500' : 'text-gray-300'}`}
                        onClick={() => updateColumns(column, 'show', !column.show, undefined, setState)}
                        title={column.show ? 'Hide' : 'Show'}
                    >
                        <Icon icon={column.show ? 'Eye' : 'EyeClosed'} className="size-4" />
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
                    <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-600">Name</label>
                        <Input
                            value={getColumnLabel(column)}
                            onChange={e => updateColumns(column, 'customName', e.target.value, undefined, setState)}
                        />
                    </div>
                    {(resolvedControls?.columns || []).map(renderControl)}
                    <div className="flex gap-1 pt-1">
                        <Pill text="Duplicate" color="blue" onClick={() => duplicate(column, setState)} />
                        <Pill text="Reset" color="orange" onClick={() => resetColumn(column, setState)} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default function ColumnManager({ state, setState, resolvedControls, Pill, Icon, Switch }) {
    const [stagedColumns, setStagedColumns] = useState([]);
    const [expandedColumns, setExpandedColumns] = useState(new Set());
    const [expandAll, setExpandAll] = useState(false);

    const allColumns = useMemo(() => [
        ...(state?.columns || []),
        ...(state?.sourceInfo?.columns || [])
            .filter(c => !(state?.columns || []).map(c => c.name).includes(c.name))
    ], [state?.columns, state?.sourceInfo?.columns]);

    const isEveryColVisible = useMemo(() =>
        (state?.sourceInfo?.columns || [])
            .map(({ name }) => (state?.columns || []).find(column => column?.name === name))
            .every(column => column?.show),
        [state?.sourceInfo?.columns, state?.columns]
    );

    const isSystemIDColOn = (state?.columns || []).find(c => c.systemCol && c.name === 'id');

    const activeColumns = useMemo(() =>
        (state?.columns || []).map((column, i) => ({
            id: `${column.name}_${column.isDuplicate ? column.copyNum : ''}_${i}`,
            column
        })),
        [state?.columns]
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
        setState(draft => {
            draft.columns = updatedItems
                .map(item => draft.columns.find(draftCol => isEqualColumns(draftCol, item.column)))
                .filter(Boolean);
        });
    }, [setState]);

    return (
        <div className="flex flex-col gap-2 w-full p-1">
            {/* Column Picker */}
            <ColumnPicker
                state={state}
                setState={setState}
                stagedColumns={stagedColumns}
                setStagedColumns={setStagedColumns}
                Pill={Pill}
                Icon={Icon}
            />

            {/* Bulk Actions */}
            <div className="flex flex-wrap gap-1">
                <Pill text={isEveryColVisible ? 'Hide All' : 'Show All'} color="blue"
                      onClick={() => toggleGlobalVisibility(!isEveryColVisible, setState)} />
                <Pill text="Reset All" color="orange" onClick={() => resetAllColumns(setState)} />
                <Pill text={isSystemIDColOn ? 'Hide ID' : 'Use ID'} color="blue"
                      onClick={() => toggleIdFilter(setState)} />
                <AddFormulaColumn columns={allColumns} addFormulaColumn={col => addFormulaColumn(col, setState)} />
                <AddCalculatedColumn columns={allColumns} addCalculatedColumn={col => addCalculatedColumn(col, setState)} />
                <Pill text={expandAll ? 'Collapse All' : 'Expand All'} color="gray"
                      onClick={() => setExpandAll(prev => !prev)} />
            </div>

            {/* Active Columns List */}
            {activeColumns.length > 0 && (
                <DraggableList
                    dataItems={activeColumns}
                    onChange={onReorder}
                    renderItem={({ item }) => (
                        <ColumnRow
                            key={item.id}
                            column={item.column}
                            index={item.id}
                            state={state}
                            setState={setState}
                            resolvedControls={resolvedControls}
                            Pill={Pill}
                            Icon={Icon}
                            Switch={Switch}
                            isExpanded={expandAll || expandedColumns.has(item.id)}
                            onToggleExpand={() => toggleExpand(item.id)}
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
