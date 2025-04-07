import React, {useState} from "react";
import {Pill} from "./Pill";
import {XMark, Add, Minus, Multiplication, Divide, Brackets} from "../../../../icons";
import {getColumnLabel} from "../utils/utils";
import {useImmer} from "use-immer";
import { v4 as uuidv4 } from 'uuid';

const validateAST = (node) => {
    if (node.type === 'operation') {
        if (!node.left || !node.right) {
            return false
            // throw new Error(`Invalid operation node: ${JSON.stringify(node)}`);
        }
        return validateAST(node.left) && validateAST(node.right);
    } else if (node.type === 'variable') {
        if (!node.key) {
            return false;
            // throw new Error(`Invalid variable node: ${JSON.stringify(node)}`);
        }
    } else {
        return false;
        // throw new Error(`Unknown node type: ${node.type}`);
    }
    return true;
};

const operations = [
    {operation: '+', Icon: Add},
    {operation: '-', Icon: Minus},
    {operation: '*', Icon: Multiplication},
    {operation: '/', Icon: Divide}
];
const grouping = [
    {operation: '(', Icon: () => <>(</>},
    {operation: ')', Icon: () => <>)</>}
];

const Modal = ({ open, setOpen, columns, addFormulaColumn }) => {
    if (!open) return null;
    const [state, setState] = useImmer({
        formulaAST: {}, // formula tree
        formulaDisplay: [], // display str
        astStack: [], // running stack for ()
        variables: [], // a list of variables used. this is used to apply fn and pull data.
        isValidFormula: false
    });

    const addToFormula = (item) => {
        setState((draft) => {
            // update the display str
            draft.formulaDisplay.push(item.type === 'variable' ? getColumnLabel(item) : item.operation || item.group);

            let { formulaAST, astStack } = draft; // Destructure draft state

            // Handle Parentheses
            if (item.type === "grouping") {
                if (item.group === "(") {
                    // Push current AST onto the stack and start a fresh expression
                    astStack.push(JSON.parse(JSON.stringify(formulaAST))); // Deep clone
                    draft.formulaAST = { type: "operation", left: null, operation: null, right: null };
                    return;
                }

                if (item.group === ")") {
                    if (astStack.length === 0 || !formulaAST.left) return; // Ignore if no matching '('

                    // Pop last AST from the stack
                    const lastAST = astStack.pop();

                    if (!lastAST) return;

                    // Attach the grouped expression correctly
                    if (lastAST.type === "operation" && !lastAST.right) {
                        lastAST.right = formulaAST;
                        draft.formulaAST = lastAST;
                    }
                    return;
                }
            }

            // Handle Variables
            if (item.type === "variable") {
                if (!formulaAST.left) {
                    draft.formulaAST = item; // Start a new expression with this variable
                    draft.variables.push(item);
                    return;
                }
                if (formulaAST.type === "operation" && !formulaAST.right) {
                    formulaAST.right = item;
                    draft.variables.push(item);
                    return;
                }
            }

            // Handle Operations
            if (item.type === "operation") {
                if (!formulaAST || Object.keys(formulaAST).length === 0) return; // Prevent invalid operation at start
                if (formulaAST.type === "operation" && !formulaAST.right) return; // Prevent adding operation before operand

                draft.formulaAST = { type: "operation", operation: item.operation, left: formulaAST } // Move current AST to left operandright: null
                return;
            }
        });
    };

    // Save and close modal
    const handleSave = () => {
        addFormulaColumn({name: `${uuidv4()}`, display_name: state.display_name, type: 'formula', formula: state.formulaAST, variables: state.variables});
        setOpen(false);
    };
    const isValidFormula = validateAST(state.formulaAST);
    console.log("Formula AST:", validateAST(state.formulaAST), state.formulaAST);

    return (
        <div className="fixed inset-0 h-full w-full z-[100] content-center bg-black/40" onClick={() => setOpen(false)}>
            <div className="w-3/4 h-1/2 overflow-auto flex flex-col gap-3 p-4 bg-white place-self-center rounded-md" onClick={(e) => e.stopPropagation()}>
                <div className="w-full flex justify-end">
                    <div className="p-2 text-[#37576B] border border-[#E0EBF0] rounded-full cursor-pointer" onClick={() => setOpen(false)}>
                        <XMark height={12} width={12} />
                    </div>
                </div>

                <div className="text-lg font-semibold">Add Formula Column</div>

                <div className="flex w-full h-full px-2">
                    <div className={'w-1/4 h-full flex flex-col gap-1'}>
                        {/* Operation Buttons */}
                        <div className="flex gap-2 h-fit">
                            {operations.map(({operation, Icon}) => (
                                <div key={operation} className="cursor-pointer px-1 py-0.5 bg-gray-200 hover:bg-gray-300 rounded place-content-center"
                                     onClick={() => addToFormula({ type: "operation", operation })}>
                                    <Icon height={12} width={12}/>
                                </div>
                            ))}
                            {grouping.map(({operation, Icon}) => (
                                <div key={operation} className="cursor-pointer p-1 bg-gray-300 hover:bg-gray-400 rounded"
                                     onClick={() => addToFormula({ type: "grouping", group: operation })}>
                                    <Icon />
                                </div>
                            ))}
                        </div>

                        {/* Column List */}
                        <div className="h-1/2 overflow-auto border-r pr-2">
                            {columns.map((c) => (
                                <div key={`${c.name}-${c.copyNum}`} className="cursor-pointer p-1 hover:bg-blue-100 rounded-md"
                                     onClick={() => addToFormula({ ...c, type: "variable", key: c.normalName || c.name, display_name: getColumnLabel(c)})}>
                                    {getColumnLabel(c)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Formula Builder Space */}
                    <div className="w-3/4 h-full px-2 flex flex-col gap-1">
                        <input className={'p-1 text-gray-400'} placeholder={'Please enter Formula Name...'} value={state.display_name} onChange={e => setState(draft => {draft.display_name = e.target.value})}/>
                        <div className="w-full min-h-[50px] p-2 border border-gray-400 flex gap-2 flex-wrap bg-gray-50 rounded-md">
                            {state.formulaDisplay.length > 0 ? state.formulaDisplay.join(" ") : <span className="text-gray-400">Click on columns and operations to build formula...</span>}
                        </div>

                        {/*<div className="w-full min-h-[50px] p-2 border border-gray-400 flex gap-2 flex-wrap bg-gray-50 rounded-md">*/}
                        {/*    {<span className="text-gray-400">{JSON.stringify(state.formulaAST, null, 4)}</span>}*/}
                        {/*</div>*/}
                        <div className={'flex gap-1 place-self-end'}>
                            {/* Clear Button */}
                            <button className="px-3 py-1 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 rounded" onClick={() => {
                                setState(draft => {
                                    draft.formulaAST = [];
                                    draft.formulaDisplay = [];
                                })
                            }}>
                                Clear
                            </button>
                            {/* Save Button */}
                            <button disabled={!isValidFormula} className={`px-3 py-1 ${isValidFormula ? `bg-blue-500/15 hover:bg-blue-500/25` : `bg-gray-200`} text-blue-700 rounded`} onClick={handleSave}>
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const AddFormulaColumn = ({columns=[], addFormulaColumn}) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Pill text={'+ Formula column'} color={'blue'} onClick={() => setOpen(true)}/>
            <Modal open={open} setOpen={setOpen} columns={columns} addFormulaColumn={addFormulaColumn}/>
        </>
    )
}