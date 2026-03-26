import React, { useState, useMemo } from 'react';
import Popup from './Popup';
import Icon from './Icon';
import Input from './Input';

const getColumnLabel = (col) => col.customName || col.display_name || col.name;
const isEqualColumns = (a, b) =>
    a?.name === b?.name && a?.isDuplicate === b?.isDuplicate && a?.copyNum === b?.copyNum;
const isCalculatedCol = ({ display, type, origin }) =>
    display === 'calculated' || type === 'calculated' || origin === 'calculated-column';

const StaticColumnForm = ({ insertAt, setState, setOpen }) => {
    const [displayName, setDisplayName] = useState('');
    const [value, setValue] = useState('');

    const confirm = () => {
        if (!displayName.trim()) return;
        const name = `static_${displayName.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        setState(draft => {
            draft.columns.splice(insertAt, 0, {
                name,
                display_name: displayName.trim(),
                staticValue: value,
                origin: 'static',
                show: true,
            });
        });
        setDisplayName('');
        setValue('');
        setOpen(false);
    };

    return (
        <div className="flex flex-col gap-1">
            <Input
                placeHolder="Display name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
            />
            <Input
                placeHolder="Static value (optional)"
                value={value}
                onChange={e => setValue(e.target.value)}
            />
            <button
                className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-40"
                disabled={!displayName.trim()}
                onClick={confirm}
            >
                Add Static Column
            </button>
        </div>
    );
};

const ColumnSearch = ({ allColumns, sourceColumns, insertAt, setState, setOpen }) => {
    const [search, setSearch] = useState('');
    const [staged, setStaged] = useState([]);
    const [focused, setFocused] = useState(false);

    const available = useMemo(() =>
        (sourceColumns || []).filter(c =>
            !search || getColumnLabel(c).toLowerCase().includes(search.toLowerCase())
        ), [sourceColumns, search]);

    const stage = (col) => setStaged(prev => [...prev, col]);
    const unstage = (col) => setStaged(prev => prev.filter(c => c.name !== col.name));

    const confirm = () => {
        setState(draft => {
            const isGrouping = draft.columns.some(c => c.group);
            let offset = 0;
            staged.forEach(col => {
                const exists = draft.columns.some(c => isEqualColumns(c, col));
                if (exists) {
                    const idx = draft.columns.findIndex(c => isEqualColumns(c, col));
                    const base = draft.columns[idx];
                    const numDups = draft.columns.filter(c => c.isDuplicate && c.name === base.name).length;
                    const dup = {
                        ...JSON.parse(JSON.stringify(base)),
                        show: true, isDuplicate: true,
                        copyNum: numDups + 1,
                        normalName: `${base.name}_copy_${numDups + 1}`,
                        display_name: `${getColumnLabel(base)} Copy ${numDups + 1}`
                    };
                    if (isGrouping && !dup.group && !dup.fn) {
                        dup.fn = dup.defaultFn?.toLowerCase() || 'list';
                    }
                    draft.columns.splice(insertAt + offset, 0, dup);
                } else {
                    const newCol = { ...col, show: true };
                    if (isGrouping && !newCol.group && !newCol.fn) {
                        newCol.fn = newCol.defaultFn?.toLowerCase() || 'list';
                    }
                    draft.columns.splice(insertAt + offset, 0, newCol);
                }
                offset++;
            });
        });
        setStaged([]);
        setSearch('');
        setOpen(false);
    };

    return (
        <div className="flex flex-col gap-1">
            <Input
                placeHolder="Search columns to add..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
            />
            {(focused || search) && available.length > 0 && (
                <div className="max-h-40 overflow-y-auto border rounded bg-white text-sm">
                    {available.map(col => (
                        <div
                            key={col.name}
                            className="px-2 py-1 hover:bg-blue-50 cursor-pointer"
                            onMouseDown={e => { e.preventDefault(); stage(col); }}
                        >
                            {getColumnLabel(col)}
                        </div>
                    ))}
                </div>
            )}
            {staged.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                    {staged.map(col => (
                        <span
                            key={col.name}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded cursor-pointer hover:bg-blue-200"
                            onClick={() => unstage(col)}
                        >
                            {getColumnLabel(col)}
                            <Icon icon="XMark" className="size-3" />
                        </span>
                    ))}
                    <button
                        className="px-2 py-0.5 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                        onClick={confirm}
                    >
                        Add
                    </button>
                </div>
            )}
        </div>
    );
};

/**
 * A '+' trigger that opens a column picker popup.
 *
 * Props:
 *   insertAt           – index in the full columns array at which to insert
 *   columns            – current active columns (used by formula/calculated modals as variable list)
 *   sourceColumns      – state.sourceInfo.columns  (the searchable pool)
 *   setState           – immer setter
 *   FormulaColumnModal – optional component (receives columns + addFormulaColumn)
 *   CalculatedColumnModal – optional component (receives columns + addCalculatedColumn)
 *   triggerClassName   – extra classes for the trigger wrapper (e.g. absolute positioning for table)
 */
export default function CardColumnPicker({
    insertAt,
    columns,
    sourceColumns,
    setState,
    FormulaColumnModal,
    CalculatedColumnModal,
    triggerClassName = '',
    parentHovered = false,
    setIsPickerOpen=() => {},
    orientation = 'icon', // 'horizontal' | 'vertical' | 'icon'
}) {
    const allColumns = useMemo(() => {
        const activeNames = new Set((columns || []).map(c => c.name));
        return [
            ...(columns || []),
            ...(sourceColumns || []).filter(c => !activeNames.has(c.name)),
        ];
    }, [columns, sourceColumns]);

    const handleFormulaColumn = (col) => {
        setState(draft => {
            if (col.name && col.formula) {
                draft.columns.splice(insertAt, 0, col);
            }
            if (col.variables?.length) {
                col.variables.forEach(variable => {
                    const idx = draft.columns.findIndex(c => isEqualColumns(c, variable));
                    if (idx !== -1 &&
                        !draft.columns[idx].group &&
                        draft.columns.some(c => !isEqualColumns(c, variable) && c.group) &&
                        !draft.columns[idx].fn
                    ) {
                        draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
                    }
                });
            }
        });
    };

    const handleCalculatedColumn = (col) => {
        setState(draft => {
            if (col.name && isCalculatedCol(col)) {
                draft.columns.splice(insertAt, 0, col);
            }
        });
    };

    const [hovered, setHovered] = useState(false);
    const [showStaticForm, setShowStaticForm] = useState(false);

    const visible = hovered || parentHovered;

    const triggerContent = orientation === 'horizontal' ? (
        <div className="w-full flex items-center">
            <div className="flex-1 h-px bg-blue-400" />
            <div className="shrink-0 size-3.5 rounded-full bg-blue-400 flex items-center justify-center text-white">
                <Icon icon="Add" className="size-2.5" />
            </div>
            <div className="flex-1 h-px bg-blue-400" />
        </div>
    ) : orientation === 'vertical' ? (
        <div className="h-full flex flex-col items-center">
            <div className="flex-1 w-px bg-blue-400" />
            <div className="shrink-0 size-3.5 rounded-full bg-blue-400 flex items-center justify-center text-white">
                <Icon icon="Add" className="size-2.5" />
            </div>
            <div className="flex-1 w-px bg-blue-400" />
        </div>
    ) : (
        <div className="flex items-center justify-center rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600 w-4 h-4">
            <Icon icon="Add" className="size-3" />
        </div>
    );

    return (
        <div
            className={`${visible ? 'opacity-100' : 'opacity-0'} hover:opacity-100 ${triggerClassName}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
        <Popup button={<div>{triggerContent}</div>} preferredPosition="bottom" onOpenChange={setIsPickerOpen}>
            {({ open, setOpen }) => open ? (
                <div className="flex flex-col gap-2 p-2 w-64 bg-white border rounded shadow-lg">
                    {(FormulaColumnModal || CalculatedColumnModal) && (
                        <div className="flex gap-1">
                            {FormulaColumnModal && (
                                <FormulaColumnModal
                                    columns={allColumns}
                                    addFormulaColumn={col => { handleFormulaColumn(col); setOpen(false); }}
                                />
                            )}
                            {CalculatedColumnModal && (
                                <CalculatedColumnModal
                                    columns={allColumns}
                                    addCalculatedColumn={col => { handleCalculatedColumn(col); setOpen(false); }}
                                />
                            )}
                            <button
                                className={`px-2 py-1 text-xs border rounded hover:bg-purple-50 text-purple-600 border-purple-300 ${showStaticForm ? `bg-purple-100` : ``}`}
                                onClick={() => setShowStaticForm(v => !v)}
                            >
                                + Static
                            </button>
                        </div>
                    )}
                    {!(FormulaColumnModal || CalculatedColumnModal) && (
                        <button
                            className="self-start px-2 py-1 text-xs border rounded hover:bg-purple-50 text-purple-600 border-purple-300"
                            onClick={() => setShowStaticForm(v => !v)}
                        >
                            + Static Column
                        </button>
                    )}
                    {showStaticForm && (
                        <StaticColumnForm
                            insertAt={insertAt}
                            setState={setState}
                            setOpen={(v) => { setOpen(v); if (!v) setShowStaticForm(false); }}
                        />
                    )}
                    {
                        !showStaticForm && (
                            <ColumnSearch
                                allColumns={allColumns}
                                sourceColumns={sourceColumns}
                                insertAt={insertAt}
                                setState={setState}
                                setOpen={setOpen}
                            />
                        )
                    }
                </div>
            ) : null}
        </Popup>
        </div>
    );
}
