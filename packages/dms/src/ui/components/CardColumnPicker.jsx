import React, { useState, useMemo, useContext } from 'react';
import Popup from './Popup';
import Icon from './Icon';
import Input from './Input';
import Button from './Button';
import columnTypes from '../columnTypes';
import { ThemeContext, getComponentTheme } from '../useTheme';
import { cardColumnPickerTheme } from './CardColumnPicker.theme';

const getColumnLabel = (col) => col.customName || col.display_name || col.name;
const isEqualColumns = (a, b) =>
    a?.name === b?.name && a?.isDuplicate === b?.isDuplicate && a?.copyNum === b?.copyNum;
const isCalculatedCol = ({ display, type, origin }) =>
    display === 'calculated' || type === 'calculated' || origin === 'calculated-column';

// Seed defaults onto a freshly added column based on its type's cardHints.
// Only applied when the type declares the corresponding hint — types without
// hints leave the column shape unchanged.
const applyCardHintDefaults = (col) => {
    const hints = columnTypes[col?.type]?.cardHints;
    if (!hints) return col;
    return {
        ...col,
        ...(hints.defaultHideHeader && col.hideHeader === undefined ? { hideHeader: true } : {}),
    };
};

const StaticColumnForm = ({ insertAt, setState, setOpen }) => {
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...cardColumnPickerTheme.styles[0], ...getComponentTheme(themeFromContext, 'cardColumnPicker') };
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
        <div className={t.form}>
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
            <Button activeStyle="small" disabled={!displayName.trim()} onClick={confirm}>
                Add Static Column
            </Button>
        </div>
    );
};

const ColumnSearch = ({ allColumns, sourceColumns, insertAt, setState, setOpen }) => {
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...cardColumnPickerTheme.styles[0], ...getComponentTheme(themeFromContext, 'cardColumnPicker') };
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
                    const newCol = applyCardHintDefaults({ ...col, show: true });
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
        <div className={t.form}>
            <Input
                placeHolder="Search columns to add..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
            />
            {(focused || search) && available.length > 0 && (
                <div className={t.list}>
                    {available.map(col => (
                        <div
                            key={col.name}
                            className={t.listRow}
                            onMouseDown={e => { e.preventDefault(); stage(col); }}
                        >
                            {getColumnLabel(col)}
                        </div>
                    ))}
                </div>
            )}
            {staged.length > 0 && (
                <div className={t.stagedRow}>
                    {staged.map(col => (
                        <span
                            key={col.name}
                            className={t.staged}
                            onClick={() => unstage(col)}
                        >
                            {getColumnLabel(col)}
                            <Icon icon="XMark" className={t.stagedIcon} />
                        </span>
                    ))}
                    <Button activeStyle="small" onClick={confirm}>
                        Add
                    </Button>
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
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...cardColumnPickerTheme.styles[0], ...getComponentTheme(themeFromContext, 'cardColumnPicker') };
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
        <div className={t.insertH}>
            <div className={t.lineH} />
            <div className={t.dot}>
                <Icon icon="Add" className={t.dotIcon} />
            </div>
            <div className={t.lineH} />
        </div>
    ) : orientation === 'vertical' ? (
        <div className={t.insertV}>
            <div className={t.lineV} />
            <div className={t.dot}>
                <Icon icon="Add" className={t.dotIcon} />
            </div>
            <div className={t.lineV} />
        </div>
    ) : (
        <div className={t.iconTrigger}>
            <Icon icon="Add" className={t.iconTriggerIcon} />
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
                <div className={t.panel}>
                    {(FormulaColumnModal || CalculatedColumnModal) && (
                        // the three add pills share one Button style; they wrap as whole pills, never mid-label
                        <div className={t.pills}>
                            {FormulaColumnModal && (
                                <FormulaColumnModal
                                    triggerStyle="chip" triggerOnStyle="chipOn"
                                    columns={allColumns}
                                    addFormulaColumn={col => { handleFormulaColumn(col); setOpen(false); }}
                                />
                            )}
                            {CalculatedColumnModal && (
                                <CalculatedColumnModal
                                    triggerStyle="chip" triggerOnStyle="chipOn"
                                    columns={allColumns}
                                    addCalculatedColumn={col => { handleCalculatedColumn(col); setOpen(false); }}
                                />
                            )}
                            <Button activeStyle={showStaticForm ? 'chipOn' : 'chip'} onClick={() => setShowStaticForm(v => !v)}>
                                + Static
                            </Button>
                        </div>
                    )}
                    {!(FormulaColumnModal || CalculatedColumnModal) && (
                        <div className={t.pillAlone}>
                            <Button activeStyle={showStaticForm ? 'chipOn' : 'chip'} onClick={() => setShowStaticForm(v => !v)}>
                                + Static Column
                            </Button>
                        </div>
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
