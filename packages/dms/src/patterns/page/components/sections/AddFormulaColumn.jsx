import React, { useContext, useState } from "react";
import { useImmer } from "use-immer";
import { getColumnLabel } from "./controls_utils";
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { columnManagerTheme } from "./ColumnManager.theme";

// ─── AST Validation ──────────────────────────────────────────────────────────

export const validateAST = (node) => {
    if (!node || !node.type) return false;
    if (node.type === 'constant') return typeof node.value === 'number' && !isNaN(node.value);
    if (node.type === 'variable') return !!node.key;
    if (node.type === 'function') return !!node.fn && Array.isArray(node.args) && node.args.length > 0 && node.args.every(validateAST);
    if (node.type === 'operation') return !!node.operation && validateAST(node.left) && validateAST(node.right);
    return false;
};

// ─── Config ──────────────────────────────────────────────────────────────────

const BINARY_OPS = [
    { operation: '+', label: '+' },
    { operation: '-', label: '−' },
    { operation: '*', label: '×' },
    { operation: '/', label: '÷' },
];

const FUNCTIONS = [
    { fn: 'round',   label: 'round(',   note: 'Round to N decimal places (set below)' },
    { fn: 'abs',     label: 'abs(',     note: 'Absolute value' },
    { fn: 'ceil',    label: 'ceil(',    note: 'Round up to nearest integer' },
    { fn: 'floor',   label: 'floor(',   note: 'Round down to nearest integer' },
    { fn: 'sqrt',    label: 'sqrt(',    note: 'Square root' },
    { fn: 'log',     label: 'log(',     note: 'Natural logarithm' },
    { fn: 'pow',     label: 'pow(',     note: 'Power: pow(x, n) → x^n. Close inner expr, then add exponent as second arg.' },
    { fn: 'clamp',   label: 'clamp(',   note: 'Clamp: clamp(x, min, max). Build x, close, add min as constant, add max as constant.' },
    { fn: 'percent', label: 'percent(', note: 'Percent: percent(a, b) → (a / b) × 100. Build a, close, then b.' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const attachToContext = (draft, node) => {
    if (!draft.formulaAST || !Object.keys(draft.formulaAST).length) {
        draft.formulaAST = node;
    } else if (draft.formulaAST.type === 'operation' && !draft.formulaAST.right) {
        draft.formulaAST.right = node;
    }
};

// ─── Modal ───────────────────────────────────────────────────────────────────

const Modal = ({ open, setOpen, columns, addFormulaColumn }) => {
    const { UI } = useContext(ThemeContext);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const { Icon } = UI;
    // mounted only while open (parent) — no early return before the hooks below

    const [state, setState] = useImmer({
        formulaAST: {},
        formulaDisplay: [],
        // each stack entry: { savedAST, fnContext?: string }
        astStack: [],
        variables: [],
        display_name: '',
        constantInput: '',
        roundDecimals: 0,
    });

    // ── actions ──────────────────────────────────────────────────────────────

    const addLeaf = (leafNode, displayStr) => {
        setState(draft => {
            draft.formulaDisplay.push(displayStr);
            attachToContext(draft, leafNode);
            if (leafNode.type === 'variable') draft.variables.push(leafNode);
        });
    };

    const addOperation = (operation) => {
        setState(draft => {
            const { formulaAST } = draft;
            if (!formulaAST || !Object.keys(formulaAST).length) return;
            if (formulaAST.type === 'operation' && !formulaAST.right) return;
            draft.formulaDisplay.push(operation);
            draft.formulaAST = { type: 'operation', operation, left: JSON.parse(JSON.stringify(formulaAST)), right: null };
        });
    };

    const openParen = () => {
        setState(draft => {
            draft.formulaDisplay.push('(');
            draft.astStack.push({ savedAST: JSON.parse(JSON.stringify(draft.formulaAST)) });
            draft.formulaAST = {};
        });
    };

    const openFunction = (fn) => {
        setState(draft => {
            draft.formulaDisplay.push(`${fn}(`);
            draft.astStack.push({
                savedAST: JSON.parse(JSON.stringify(draft.formulaAST)),
                fnContext: fn,
            });
            draft.formulaAST = {};
        });
    };

    const closeParen = () => {
        setState(draft => {
            if (!draft.astStack.length) return;
            const innerAST = draft.formulaAST;
            if (!innerAST || !Object.keys(innerAST).length) return;

            const { savedAST, fnContext } = draft.astStack.pop();

            let resultNode;
            if (fnContext) {
                const args = [JSON.parse(JSON.stringify(innerAST))];
                if (fnContext === 'round' && draft.roundDecimals > 0) {
                    args.push({ type: 'constant', value: draft.roundDecimals });
                    draft.formulaDisplay.push(`, ${draft.roundDecimals})`);
                } else {
                    draft.formulaDisplay.push(')');
                }
                resultNode = { type: 'function', fn: fnContext, args };
            } else {
                draft.formulaDisplay.push(')');
                resultNode = JSON.parse(JSON.stringify(innerAST));
            }

            if (!savedAST || !Object.keys(savedAST).length) {
                draft.formulaAST = resultNode;
            } else if (savedAST.type === 'operation' && !savedAST.right) {
                savedAST.right = resultNode;
                draft.formulaAST = savedAST;
            } else {
                draft.formulaAST = savedAST;
            }
        });
    };

    const addConstant = () => {
        const val = parseFloat(state.constantInput);
        if (isNaN(val)) return;
        addLeaf({ type: 'constant', value: val }, String(val));
        setState(draft => { draft.constantInput = ''; });
    };

    const handleClear = () => {
        setState(draft => {
            draft.formulaAST = {};
            draft.formulaDisplay = [];
            draft.astStack = [];
            draft.variables = [];
        });
    };

    const handleSave = () => {
        addFormulaColumn({
            name: crypto.randomUUID(),
            display_name: state.display_name,
            type: 'formula',
            formula: state.formulaAST,
            variables: state.variables,
        });
        setOpen(false);
    };

    const unclosed = state.astStack.length;
    const isValid = validateAST(state.formulaAST) && !unclosed;

    // ── render ───────────────────────────────────────────────────────────────

    return (
        <div className={t.dialogBackdrop} onClick={() => setOpen(false)}>
            <div className={t.formulaPanel}
                 onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className={t.dialogHeader}>
                    <div className={t.dialogTitle}>Add Formula Column</div>
                    <div className={t.dialogClose} onClick={() => setOpen(false)}>
                        <Icon icon="XMark" height={12} width={12} />
                    </div>
                </div>

                <div className={t.formulaGrid}>
                    {/* ── Left panel ─────────────────────────────────────── */}
                    <div className={t.formulaLeft}>

                        {/* Binary operators */}
                        <div>
                            <div className={t.formulaLabel}>Operators</div>
                            <div className={t.opsRow}>
                                {BINARY_OPS.map(({ operation, label }) => (
                                    <button key={operation}
                                            className={t.opBtn}
                                            onClick={() => addOperation(operation)}>
                                        {label}
                                    </button>
                                ))}
                                <button className={t.opBtn}
                                        onClick={openParen}>(</button>
                                <button className={t.opBtn}
                                        onClick={closeParen}>)</button>
                            </div>
                        </div>

                        {/* Functions */}
                        <div>
                            <div className={t.formulaLabel}>Functions</div>
                            <div className={t.fnRow}>
                                {FUNCTIONS.map(({ fn, label, note }) => (
                                    <button key={fn}
                                            title={note}
                                            className={t.fnBtn}
                                            onClick={() => openFunction(fn)}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className={t.roundRow}>
                                <span className={t.roundLabel}>round decimals:</span>
                                <input
                                    type="number" min={0} max={10}
                                    className={t.roundInput}
                                    value={state.roundDecimals}
                                    onChange={e => setState(draft => {
                                        draft.roundDecimals = Math.max(0, parseInt(e.target.value) || 0);
                                    })}
                                />
                            </div>
                        </div>

                        {/* Constant */}
                        <div>
                            <div className={t.formulaLabel}>Constant</div>
                            <div className={t.constRow}>
                                <input
                                    type="number"
                                    className={t.constInput}
                                    placeholder="e.g. 100"
                                    value={state.constantInput}
                                    onChange={e => setState(draft => { draft.constantInput = e.target.value; })}
                                    onKeyDown={e => e.key === 'Enter' && addConstant()}
                                />
                                <button className={t.constBtn}
                                        onClick={addConstant}>
                                    Add
                                </button>
                            </div>
                        </div>

                        {/* Columns */}
                        <div className={t.colsWrap}>
                            <div className={t.formulaLabel}>Columns</div>
                            <div className={t.colsList}>
                                {columns.map(c => (
                                    <div key={`${c.name}-${c.copyNum}`}
                                         className={t.colItem}
                                         onClick={() => addLeaf(
                                             { ...c, type: 'variable', key: c.normalName || c.name, display_name: getColumnLabel(c) },
                                             getColumnLabel(c)
                                         )}>
                                        {getColumnLabel(c)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Right panel ────────────────────────────────────── */}
                    <div className={t.formulaRight}>
                        <input
                            className={t.nameInput}
                            placeholder="Formula name..."
                            value={state.display_name}
                            onChange={e => setState(draft => { draft.display_name = e.target.value; })}
                        />

                        {/* Formula display */}
                        <div className={t.formulaDisplay}>
                            {state.formulaDisplay.length
                                ? state.formulaDisplay.join(' ')
                                : <span className={t.formulaPlaceholder}>Click columns, operators, and functions to build formula...</span>
                            }
                        </div>

                        {unclosed > 0 && (
                            <div className={t.formulaWarn}>{unclosed} unclosed bracket{unclosed > 1 ? 's' : ''}</div>
                        )}

                        <div className={t.formulaActions}>
                            <button
                                className={t.formulaClear}
                                onClick={handleClear}>
                                Clear
                            </button>
                            <button
                                disabled={!isValid || !state.display_name}
                                className={isValid && state.display_name ? t.formulaSave : t.formulaSaveDisabled}
                                onClick={handleSave}>
                                Add Column
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Export ──────────────────────────────────────────────────────────────────

const AddFormulaColumn = ({ columns = [], addFormulaColumn }) => {
    const [open, setOpen] = useState(false);
    const { UI } = useContext(ThemeContext);
    const { Pill } = UI;
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    return (
        <>
            {t.addTrigger
                ? <button type='button' className={t.addTrigger} onClick={() => setOpen(true)}>+ Formula</button>
                : <Pill text="+ Formula" color="blue" onClick={() => setOpen(true)} />}
            {open && <Modal open={open} setOpen={setOpen} columns={columns} addFormulaColumn={addFormulaColumn} />}
        </>
    );
};

export default AddFormulaColumn;
