import React, { useState, useMemo, useCallback } from 'react';
import DraggableList from "../../../../ui/components/DraggableList";
import Input from "../../../../ui/components/Input";
import columnTypes from "../../../../ui/columnTypes";
import { getColumnLabel, isEqualColumns } from "./controls_utils";
import AddFormulaColumn from "./AddFormulaColumn";
import AddCalculatedColumn from "./AddCalculatedColumn";
import AddStaticColumn from "./AddStaticColumn";
import { isEqual, uniqWith } from "lodash-es";
import { calculateIsJoinPresent } from "./components/dataWrapper/utils/joinUtils";
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { columnManagerTheme } from "./ColumnManager.theme";

const ColumnPicker = ({ dwAPI, allColumns, stagedColumns, setStagedColumns, Pill, Icon }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const { config: { columns: stateColumns, externalSource, join }, setState } = dwAPI;
    const [pickerSearch, setPickerSearch] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const isJoinPresent = calculateIsJoinPresent(join) && Object.values(join.sources).some((jSource) => jSource.mergeStrategy === "join");

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
            const isGrouping = draft.columns.some(c => c.group);
            stagedColumns.forEach(col => {
                const exists = draft.columns.some(c => isEqualColumns(c, col));
                if (exists) {
                    const idx = draft.columns.findIndex(c => isEqualColumns(c, col));
                    const base = draft.columns[idx];
                    const numDuplicates = draft.columns.filter(c => c.isDuplicate && c.name === base.name).length;
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
                    draft.columns.splice(idx, 0, dup);
                } else {
                    const newCol = { ...col, show: true };
                    if (isGrouping && !newCol.group && !newCol.fn) {
                        newCol.fn = newCol.defaultFn?.toLowerCase() || 'list';
                    }
                    draft.columns.push(newCol);
                }
            });
        });
        setStagedColumns([]);
        setPickerSearch('');
    };

    const showDropdown = isFocused && availableColumns.length > 0;

    return (
        <div className={t.picker}>
            <div className={t.pickerButtons}>
                <AddFormulaColumn columns={allColumns} addFormulaColumn={col => dwAPI.addFormulaColumn(col)} />
                <AddCalculatedColumn columns={allColumns} addCalculatedColumn={col => dwAPI.addCalculatedColumn(col)} />
                <AddStaticColumn addStaticColumn={col => dwAPI.addStaticColumn(col)} />
            </div>
            <Input
                placeholder="Search columns to add..."
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            />
            {showDropdown && (
                <div className={t.dropdown}>
                    {uniqWith(availableColumns, isEqual).map(col => {
                        const tableAlias = col.source_id ? Object.keys(join?.sources).find(jSourceKey => join?.sources[jSourceKey].source === col.source_id) : 0;
                        const match = isJoinPresent && tableAlias?.match(/\d+$/);
                        const tableIdx = match ? Number(match) : 0;
                        return (
                            <div
                                key={`${col.source_id}_${col.name}`}
                                className={t.dropdownItem}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    stageColumn(col);
                                }}
                            >
                                <span className={t.dropdownLabel}>{getColumnLabel(col)}</span>
                                {isJoinPresent && (
                                    <div className={t.joinBadgeWrap}>
                                        {tableIdx > 0 ?
                                            <>
                                                <Icon icon="Link" size={14}/>
                                                <span className={t.joinBadge}>
                                                    {tableIdx}
                                                </span>
                                            </>
                                            : <Icon icon="Database" className={t.sourceIcon} />
                                        }
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
            {stagedColumns.length > 0 && (
                <div className={t.staged}>
                    {stagedColumns.map(col => (
                        <Pill
                            key={col.name}
                            text={<span className={t.controlRow}>
                                {getColumnLabel(col)}
                                <Icon icon="XMark" className={t.stagedX} />
                            </span>}
                            activeStyle="blue"
                            onClick={() => unstageColumn(col)}
                        />
                    ))}
                    <Pill text="Add" activeStyle="green" onClick={confirmAdd} />
                </div>
            )}
        </div>
    );
};

const renderControl = (control, columnData, onUpdate, { Switch, dwAPI, t }) => {
    if (typeof control.displayCdn === 'function' && !control.displayCdn({ display: dwAPI.state?.display, attribute: columnData })) return null;
    const isDisabled = typeof control.disabled === 'function' ? control.disabled({ attribute: columnData }) : control.disabled;

    if (control.type === 'toggle') {
        return (
            <div key={control.key} className={t.controlRow}>
                <label className={t.controlLabel}>{control.label}</label>
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
        const filteredOptions = (control.options || []).filter(opt => typeof opt.displayCdn !== 'function' || opt.displayCdn({ display: dwAPI.state?.display, attribute: columnData }));
        return SelectComp ? (
            <div key={control.key} className={t.controlRow}>
                <label className={t.controlLabel}>{control.label}</label>
                <SelectComp
                    value={columnData[control.key]}
                    options={filteredOptions}
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
            <div key={control.key} className={t.controlRow}>
                <label className={t.controlLabel}>{control.label}</label>
                <Input
                    value={columnData[control.key] || ''}
                    onChange={e => onUpdate(control.key, e.target.value, control.onChange)}
                />
            </div>
        );
    }

    return null;
};

const ColumnRow = ({ column, index, dwAPI, resolvedControls, Pill, Icon, Switch, isExpanded, onToggleExpand, isOutOfDate, onRefreshMeta }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const label = getColumnLabel(column);
    const onUpdate = useCallback((key, value, onChange) =>
        dwAPI.updateColumn(column, key, value, onChange), [column, dwAPI.updateColumn]);

    return (
        <div className={t.row}>
            <div className={t.rowHead}>
                <div className={t.rowTitleWrap}>
                    <Icon icon="Reorder" className={t.grip} />
                    <span className={t.rowLabel}>{label}</span>
                </div>
                <div className={t.rowIcons}>
                    {isOutOfDate && (
                        <button
                            className={t.staleBtn}
                            title="Metadata out of date"
                            onClick={onRefreshMeta}
                        >
                            <Icon icon="Alert" className={t.icon} />
                        </button>
                    )}
                    {column.fn && (
                        <span className={t.fnBadge} title={column.fn}>
                            <Icon icon={
                                column.fn === 'count' ? 'TallyMark' :
                                    column.fn === 'list' ? 'LeftToRightListBullet' :
                                        column.fn === 'sum' ? 'Sum' :
                                            column.fn === 'avg' ? 'Avg' :
                                                'TallyMark'
                            } className={t.fnIcon} />
                        </span>
                    )}
                    <button className={`${t.toggleBtn} ${column.group ? t.toggleOn : t.toggleOff}`}
                            title={column.group ? 'Grouping By' : 'Group By'}
                            onClick={() => dwAPI.updateColumn(column, 'group', !column.group)}
                    >
                            <Icon icon="Group" className={t.icon} />
                    </button>
                    <button
                        className={`${t.toggleBtn} ${column.show ? t.toggleOn : t.toggleOff}`}
                        onClick={() => dwAPI.updateColumn(column, 'show', !column.show)}
                        title={column.show ? 'Hide' : 'Show'}
                    >
                        <Icon icon={column.show ? 'Eye' : 'EyeClosed'} className={t.icon} />
                    </button>
                    <button
                        className={t.expandBtn}
                        onClick={onToggleExpand}
                        title="Settings"
                    >
                        <Icon icon="CaretDown" className={t.icon} />
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className={t.expanded} draggable={false}>
                    <div className={t.colName}>{column.name}</div>
                    <div className={t.controlRow}>
                        <label className={t.controlLabel}>Name</label>
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
                        .map(c => renderControl(c, column, onUpdate, { Switch, dwAPI, t }))}
                    <div className={t.pillRow}>
                        <Pill text="Duplicate" activeStyle="blue" onClick={() => dwAPI.duplicateColumn(column)} />
                        <Pill text="Remove" activeStyle="orange" onClick={() => dwAPI.resetColumn(column)} />
                        {isOutOfDate && (
                            <Pill text="Refresh Meta" activeStyle="orange" onClick={onRefreshMeta} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const AllColumnsRow = ({ dwAPI, resolvedControls, isEveryColVisible, Pill, Icon, Switch, isExpanded, onToggleExpand }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
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
        <div className={t.row}>
            <div className={t.rowHead}>
                <div className={t.rowTitleWrap}>
                    <Icon icon="Settings" className={t.settingsIcon} />
                    <span className={t.rowLabelStrong}>All Columns</span>
                </div>
                <div className={t.rowIcons}>
                    <button
                        className={`${t.toggleBtn} ${isEveryColVisible ? t.toggleOn : t.toggleOff}`}
                        onClick={() => dwAPI.toggleGlobalVisibility(!isEveryColVisible)}
                        title={isEveryColVisible ? 'Hide All' : 'Show All'}
                    >
                        <Icon icon={isEveryColVisible ? 'Eye' : 'EyeClosed'} className={t.icon} />
                    </button>
                    <button
                        className={t.expandBtn}
                        onClick={onToggleExpand}
                        title="Settings"
                    >
                        <Icon icon="CaretDown" className={t.icon} />
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className={t.expanded} draggable={false}>
                    {[
                        ...(resolvedControls?.columns || []),
                        ...(resolvedControls?.inHeader || [])
                    ]
                        .filter(c => !c.hideFromSectionMenu)
                        .map(c => renderControl(c, aggregateColumn, onUpdate, { Switch, dwAPI, t }))}
                    <div className={t.pillRow}>
                        <Pill text="Remove All" activeStyle="orange" onClick={() => dwAPI.resetAllColumns()} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default function ColumnManager({ dwAPI, resolvedControls, Pill, Icon, Switch, showAllColumnsControl }) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const { config: { columns: stateColumns, externalSource }, setState } = dwAPI;
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
            const idx = draft.columns.findIndex(c => c.name === column.name && c.isDuplicate === column.isDuplicate && c.copyNum === column.copyNum);
            if (idx !== -1) {
                ATTRS_TO_SYNC.forEach(attr => {
                    draft.columns[idx][attr] = sourceCol[attr];
                });
            }
        });
    }, [externalSource?.columns, setState]);
    const pivotColumns = useMemo(() =>
        (stateColumns || []).filter(c => c.origin === 'pivot_col'),
        [stateColumns]
    );

    const activePivotColumns = useMemo(() =>
        pivotColumns.map((column, i) => ({ id: `pivot_${i}_${column.name}`, column })),
        [pivotColumns]
    );

    const onReorderPivot = useCallback((updatedItems) => {
        setState(draft => {
            const reordered = updatedItems
                .map(item => draft.columns.find(c => c.origin === 'pivot_col' && c.name === item.column.name))
                .filter(Boolean);
            draft.columns = [
                ...draft.columns.filter(c => c.origin !== 'pivot_col'),
                ...reordered,
            ];
        });
    }, [setState]);

    const allColumns = useMemo(() => [
        ...(stateColumns || []).filter(c => c.origin !== 'pivot_col'),
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
        (stateColumns || [])
            .filter(c => c.origin !== 'pivot_col')
            .map((column, i) => ({
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
        <div className={t.root}>
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
            <div className={t.fnRow}>
                <Pill text={isSystemIDColOn ? 'Hide ID' : 'Use ID'} activeStyle="blue"
                      onClick={() => dwAPI.toggleIdFilter()} />
                <Pill
                    text={isAllExpanded ? 'Collapse All' : 'Expand All'}
                    activeStyle="gray"
                    onClick={() => {
                        setExpandedColumns(isAllExpanded ? new Set() : new Set(activeColumns.map(i => i.id)));
                    }}
                />
                <Pill
                    activeStyle={isEveryColVisible ? 'orange' : 'blue'}
                    onClick={() => dwAPI.toggleGlobalVisibility(!isEveryColVisible)}
                    text={isEveryColVisible ? 'Hide All' : 'Show All'}
                />
                <Pill text="Remove All" activeStyle="orange" onClick={() => dwAPI.resetAllColumns()} />
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

            {/* Pivot Columns — orderable; row column always precedes this section */}
            {activePivotColumns.length > 0 && (
                <div className={t.staticField}>
                    <div className={t.pivotTitle}>
                        Pivot Columns
                    </div>
                    <DraggableList
                        dataItems={activePivotColumns}
                        onChange={onReorderPivot}
                        renderItem={({ item }) => (
                            <div className={t.row}>
                                <div className={t.rowHead}>
                                    <div className={t.rowTitleWrap}>
                                        <Icon icon="Reorder" className={t.grip} />
                                        <span className={t.rowLabel}>{item.column.display_name || item.column.name}</span>
                                    </div>
                                    <button
                                        className={`${t.toggleBtn} ${item.column.show ? t.toggleOn : t.toggleOff}`}
                                        onClick={() => dwAPI.updateColumn(item.column, 'show', !item.column.show)}
                                        title={item.column.show ? 'Hide' : 'Show'}
                                    >
                                        <Icon icon={item.column.show ? 'Eye' : 'EyeClosed'} className={t.icon} />
                                    </button>
                                </div>
                            </div>
                        )}
                    />
                </div>
            )}

            {activeColumns.length === 0 && pivotColumns.length === 0 && (
                <div className={t.empty}>
                    No columns configured. Use search above to add columns.
                </div>
            )}
        </div>
    );
}
