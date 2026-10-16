import React, { useContext, useRef, useState } from "react";
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

const FormulaDialog = ({ open, setOpen, columns, addFormulaColumn }) => {
    const { UI } = useContext(ThemeContext);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const { Icon, Button, Input, FieldLabel, Modal } = UI;
    const nameField = useRef(null);   // Modal focuses it on open
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
        <Modal open={open} setOpen={setOpen} activeStyle="aboveMenuWide" initialFocus={nameField}>
            <div className={t.dialogBody}>

                {/* Header */}
                <div className={t.dialogHeader}>
                    <div className={t.dialogTitle}>Add Formula Column</div>
                    <Button activeStyle="iconRow" aria-label="Close" onClick={() => setOpen(false)}>
                        <Icon icon="XMark" height={12} width={12} />
                    </Button>
                </div>

                <div className={t.formulaGrid}>
                    {/* ── Left panel ─────────────────────────────────────── */}
                    <div className={t.formulaLeft}>

                        {/* Binary operators */}
                        <div>
                            <div className={t.formulaLabel}>Operators</div>
                            <div className={t.opsRow}>
                                {BINARY_OPS.map(({ operation, label }) => (
                                    <Button key={operation}
                                            activeStyle="action"
                                            onClick={() => addOperation(operation)}>
                                        {label}
                                    </Button>
                                ))}
                                <Button activeStyle="action"
                                        onClick={openParen}>(</Button>
                                <Button activeStyle="action"
                                        onClick={closeParen}>)</Button>
                            </div>
                        </div>

                        {/* Functions */}
                        <div>
                            <div className={t.formulaLabel}>Functions</div>
                            <div className={t.fnRow}>
                                {FUNCTIONS.map(({ fn, label, note }) => (
                                    <Button key={fn}
                                            title={note}
                                            activeStyle="small"
                                            onClick={() => openFunction(fn)}>
                                        {label}
                                    </Button>
                                ))}
                            </div>
                            <div className={t.roundRow}>
                                <FieldLabel activeStyle="row" htmlFor="formula-round" text="round decimals:" />
                                <span className={t.roundField}>
                                <Input
                                    id="formula-round"
                                    activeStyle="compact"
                                    type="number" min={0} max={10}
                                    value={state.roundDecimals}
                                    onChange={e => setState(draft => {
                                        draft.roundDecimals = Math.max(0, parseInt(e.target.value) || 0);
                                    })}
                                />
                                </span>
                            </div>
                        </div>

                        {/* Constant */}
                        <div>
                            <div className={t.formulaLabel}>Constant</div>
                            <div className={t.constRow}>
                                <span className={t.constField}>
                                <Input
                                    type="number"
                                    aria-label="Constant"
                                    placeholder="e.g. 100"
                                    value={state.constantInput}
                                    onChange={e => setState(draft => { draft.constantInput = e.target.value; })}
                                    onKeyDown={e => e.key === 'Enter' && addConstant()}
                                />
                                </span>
                                <Button activeStyle="action"
                                        onClick={addConstant}>
                                    Add
                                </Button>
                            </div>
                        </div>

                        {/* Columns */}
                        <div className={t.colsWrap}>
                            <div className={t.formulaLabel}>Columns</div>
                            <div className={t.colsList}>
                                {columns.map(c => (
                                    <Button key={`${c.name}-${c.copyNum}`}
                                         activeStyle="menuItem"
                                         onClick={() => addLeaf(
                                             { ...c, type: 'variable', key: c.normalName || c.name, display_name: getColumnLabel(c) },
                                             getColumnLabel(c)
                                         )}>
                                        {getColumnLabel(c)}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Right panel ────────────────────────────────────── */}
                    <div className={t.formulaRight}>
                        <Input
                            aria-label="Formula name"
                            ref={nameField}
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
                            <Button
                                activeStyle="action"
                                onClick={handleClear}>
                                Clear
                            </Button>
                            <Button
                                activeStyle="primary"
                                disabled={!isValid || !state.display_name}
                                onClick={handleSave}>
                                Add Column
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

// ─── Export ──────────────────────────────────────────────────────────────────

const AddFormulaColumn = ({ columns = [], addFormulaColumn }) => {
    const [open, setOpen] = useState(false);
    const { UI } = useContext(ThemeContext);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    return (
        <>
            <span className={t.addTriggerWrap}>
                <UI.Button activeStyle="actionFull" aria-expanded={open} onClick={() => setOpen(true)}>+ Formula</UI.Button>
            </span>
            {open && <FormulaDialog open={open} setOpen={setOpen} columns={columns} addFormulaColumn={addFormulaColumn} />}
        </>
    );
};

export default AddFormulaColumn;
