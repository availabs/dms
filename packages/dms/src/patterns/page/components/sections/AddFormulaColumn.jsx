import React, { useContext, useState } from "react";
import { useImmer } from "use-immer";
import { getColumnLabel } from "./controls_utils";
import { ThemeContext } from "../../../../ui/useTheme";

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
    const { Icon } = UI;
    if (!open) return null;

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
        <div className="fixed inset-0 h-full w-full z-[100] content-center bg-black/40" onClick={() => setOpen(false)}>
            <div className="w-3/4 max-h-[80vh] overflow-auto flex flex-col gap-3 p-4 bg-white place-self-center rounded-md"
                 onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex justify-between items-center">
                    <div className="text-lg font-semibold">Add Formula Column</div>
                    <div className="p-2 text-[#37576B] border border-[#E0EBF0] rounded-full cursor-pointer" onClick={() => setOpen(false)}>
                        <Icon icon="XMark" height={12} width={12} />
                    </div>
                </div>

                <div className="flex w-full gap-3">
                    {/* ── Left panel ─────────────────────────────────────── */}
                    <div className="w-1/3 flex flex-col gap-3">

                        {/* Binary operators */}
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Operators</div>
                            <div className="flex gap-1 flex-wrap">
                                {BINARY_OPS.map(({ operation, label }) => (
                                    <button key={operation}
                                            className="cursor-pointer px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm font-mono"
                                            onClick={() => addOperation(operation)}>
                                        {label}
                                    </button>
                                ))}
                                <button className="cursor-pointer px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm font-mono"
                                        onClick={openParen}>(</button>
                                <button className="cursor-pointer px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm font-mono"
                                        onClick={closeParen}>)</button>
                            </div>
                        </div>

                        {/* Functions */}
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Functions</div>
                            <div className="flex flex-wrap gap-1">
                                {FUNCTIONS.map(({ fn, label, note }) => (
                                    <button key={fn}
                                            title={note}
                                            className="cursor-pointer px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-xs font-mono"
                                            onClick={() => openFunction(fn)}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1 mt-1.5">
                                <span className="text-xs text-gray-500">round decimals:</span>
                                <input
                                    type="number" min={0} max={10}
                                    className="w-14 border rounded px-1 text-xs"
                                    value={state.roundDecimals}
                                    onChange={e => setState(draft => {
                                        draft.roundDecimals = Math.max(0, parseInt(e.target.value) || 0);
                                    })}
                                />
                            </div>
                        </div>

                        {/* Constant */}
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Constant</div>
                            <div className="flex gap-1">
                                <input
                                    type="number"
                                    className="border rounded px-1 text-sm flex-1 min-w-0"
                                    placeholder="e.g. 100"
                                    value={state.constantInput}
                                    onChange={e => setState(draft => { draft.constantInput = e.target.value; })}
                                    onKeyDown={e => e.key === 'Enter' && addConstant()}
                                />
                                <button className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs shrink-0"
                                        onClick={addConstant}>
                                    Add
                                </button>
                            </div>
                        </div>

                        {/* Columns */}
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="text-xs text-gray-500 mb-1">Columns</div>
                            <div className="overflow-y-auto border rounded max-h-48">
                                {columns.map(c => (
                                    <div key={`${c.name}-${c.copyNum}`}
                                         className="cursor-pointer px-2 py-1 text-sm hover:bg-blue-50"
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
                    <div className="flex-1 flex flex-col gap-2">
                        <input
                            className="border rounded p-1 text-sm"
                            placeholder="Formula name..."
                            value={state.display_name}
                            onChange={e => setState(draft => { draft.display_name = e.target.value; })}
                        />

                        {/* Formula display */}
                        <div className="flex-1 min-h-[80px] p-2 border border-gray-300 rounded bg-gray-50 font-mono text-sm break-all">
                            {state.formulaDisplay.length
                                ? state.formulaDisplay.join(' ')
                                : <span className="text-gray-400">Click columns, operators, and functions to build formula...</span>
                            }
                        </div>

                        {unclosed > 0 && (
                            <div className="text-xs text-amber-600">{unclosed} unclosed bracket{unclosed > 1 ? 's' : ''}</div>
                        )}

                        <div className="flex gap-1 justify-end">
                            <button
                                className="px-3 py-1 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded text-sm"
                                onClick={handleClear}>
                                Clear
                            </button>
                            <button
                                disabled={!isValid || !state.display_name}
                                className={`px-3 py-1 rounded text-sm ${isValid && state.display_name
                                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
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
    return (
        <>
            <Pill text="+ Formula" color="blue" onClick={() => setOpen(true)} />
            <Modal open={open} setOpen={setOpen} columns={columns} addFormulaColumn={addFormulaColumn} />
        </>
    );
};

export default AddFormulaColumn;
