import react, {useContext, useState} from "react";
import {useImmer} from "use-immer";
import {ThemeContext} from "../../../../ui/useTheme";
import {getColumnLabel} from "./controls_utils";
import {ConditionValueInput} from "./ConditionValueInput";

const complexFilterStructure = {
    op: "AND",
    groups: [
        {
            op: 'OR',
            groups: [
                { col: "status", op: "filter", value: ["active"] },
                {
                    op: 'OR',
                    groups: [
                        { col: "views", op: "gt", value: 1000 },
                        { col: "likes", op: "gt", value: 50 }
                    ]
                }
            ]
        },
        { col: "fusion_total_damage", op: "gt", value: 150000000 }
    ]
}

const isGroup = node => node?.groups && Array.isArray(node.groups);

const emptyGroup = () => ({
    op: 'AND',
    groups: []
});

const emptyCondition = (columns) => ({
    col: columns?.[0]?.name ?? '',
    op: 'filter',
    value: []
});

// only in edit mode
export const ComplexFilters = ({ state, setState }) => {
    const { UI } = useContext(ThemeContext);
    const { Pill, Button, ColumnTypes: {select} } = UI;
    const Select = select.EditComp;

    const columns = state.sourceInfo.columns;

    const [filterGroups, updateFilterGroups] = useImmer(
        Object.entries(state?.dataRequest?.filterGroups || {}).length ?
            state?.dataRequest?.filterGroups || {} : { op: 'AND', groups: [] }
    );

    // sync upward if needed
    const save = () => {
        setState(draft => {
            draft.dataRequest.filterGroups = filterGroups;
        });
    };

    const addAtPath = (path, node) => {
        updateFilterGroups(draft => {
            let cursor = draft;
            for (const i of path) cursor = cursor.groups[i];
            cursor.groups.push(node);
        });
    };

    const updateNodeAtPath = (path, updater) => {
        updateFilterGroups(draft => {
            let cursor = draft;
            for (let i = 0; i < path.length - 1; i++) {
                cursor = cursor.groups[path[i]];
            }
            updater(path.length ? cursor.groups[path[path.length - 1]] : cursor);
        });
    };

    const renderNode = (node, path = []) => {
        if (isGroup(node)) {
            return (
                <div key={path.join('.')} className="border rounded-lg p-2 ml-2">
                    {/* AND / OR */}
                    <div className="flex items-center gap-2 mb-1">
                        <span>(</span>

                        <select
                            value={node.op}
                            onChange={e =>
                                updateNodeAtPath(path, n => {
                                    n.op = e.target.value;
                                })
                            }
                        >
                            <option value="AND">AND</option>
                            <option value="OR">OR</option>
                        </select>

                        <span>)</span>
                    </div>

                    <div className="ml-4 space-y-2">
                        {node.groups.map((child, i) =>
                            renderNode(child, [...path, i])
                        )}
                    </div>

                    <div className="flex gap-1 mt-2">
                        <Pill
                            color="blue"
                            text="Add Group"
                            onClick={() => addAtPath(path, emptyGroup())}
                        />
                        <Pill
                            color="blue"
                            text="Add Column"
                            onClick={() =>
                                addAtPath(path, emptyCondition(columns))
                            }
                        />
                    </div>
                </div>
            );
        }

        // condition
        return (
            <div key={path.join('.')} className="w-full flex gap-2 items-center ml-4">
                {/* column selector */}
                <select
                    className={'max-w-1/4'}
                    value={node.col}
                    onChange={e =>
                        updateNodeAtPath(path, n => {
                            n.col = e.target.value;
                        })
                    }
                >
                    <option key={'please select a column'} value={''}>Please select a column...</option>
                    {columns.map(c => (
                        <option key={c.name} value={c.name}>
                            {getColumnLabel(c)}
                        </option>
                    ))}
                </select>

                <select
                    value={node.op}
                    onChange={e => {
                        const newOp = e.target.value;
                        const wasMulti = ['filter', 'exclude'].includes(node.op);
                        const isMulti = ['filter', 'exclude'].includes(newOp);
                        updateNodeAtPath(path, n => {
                            n.op = newOp;
                            if (wasMulti !== isMulti) {
                                n.value = isMulti ? [] : '';
                            }
                        });
                    }}
                >
                    {['filter','exclude','gt','gte','lt','lte','like'].map(op => (
                        <option key={op} value={op}>{op}</option>
                    ))}
                </select>

                <ConditionValueInput
                    node={node}
                    path={path}
                    columns={columns}
                    updateNodeAtPath={updateNodeAtPath}
                />
            </div>
        );
    };

    return (
        <div className={'w-full'}>
            <div className="flex gap-1 mb-2">
                <Pill
                    color="blue"
                    text="Add Group"
                    onClick={() => addAtPath([], emptyGroup())}
                />
                <Pill
                    color="blue"
                    text="Add Column"
                    onClick={() =>
                        addAtPath([], emptyCondition(columns))
                    }
                />
            </div>

            {renderNode(filterGroups)}
            <Button onClick={save}>save</Button>
        </div>
    );
};