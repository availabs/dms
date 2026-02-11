import React, {useContext, useEffect} from "react";
import {useImmer} from "use-immer";
import {isEqual} from "lodash-es";
import {ThemeContext} from "../../../../ui/useTheme";
import {PageContext} from "../../context";
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

export const isGroup = node => node?.groups && Array.isArray(node.groups);

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
    const { Pill, Icon, Switch, ColumnTypes: {select} } = UI;

    const columns = state.sourceInfo.columns;

    const [filterGroups, updateFilterGroups] = useImmer(
        Object.entries(state?.dataRequest?.filterGroups || {}).length ?
            state?.dataRequest?.filterGroups || {} : { op: 'AND', groups: [] }
    );

    // sync inbound: page filters → condition values
    const { pageState } = useContext(PageContext) || {};

    useEffect(() => {
        const pageFilters = (pageState?.filters || []).reduce(
            (acc, curr) => ({...acc, [curr.searchKey]: curr.values}), {}
        );

        if (!Object.keys(pageFilters).length) return;

        // walk tree, check if any page-synced condition needs updating
        const needsUpdate = (node) => {
            if (isGroup(node)) return node.groups.some(needsUpdate);
            if (!node.usePageFilters) return false;
            const key = node.searchParamKey || node.col;
            const pageValues = pageFilters[key];
            if (!pageValues) return false;
            const normalized = Array.isArray(pageValues) ? pageValues : [pageValues];
            return !isEqual(node.value, normalized);
        };

        if (!needsUpdate(filterGroups)) return;

        updateFilterGroups(draft => {
            const update = (node) => {
                if (isGroup(node)) {
                    node.groups.forEach(update);
                    return;
                }
                if (!node.usePageFilters) return;
                const key = node.searchParamKey || node.col;
                const pageValues = pageFilters[key];
                if (!pageValues) return;
                const normalized = Array.isArray(pageValues) ? pageValues : [pageValues];
                if (!isEqual(node.value, normalized)) {
                    node.value = normalized;
                }
            };
            update(draft);
        });
    }, [pageState?.filters, filterGroups]);

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

    const removeAtPath = (path) => {
        if (!path.length) return; // can't remove root
        updateFilterGroups(draft => {
            let cursor = draft;
            for (let i = 0; i < path.length - 1; i++) {
                cursor = cursor.groups[path[i]];
            }
            cursor.groups.splice(path[path.length - 1], 1);
        });
    };

    const renderNode = (node, path = []) => {
        if (isGroup(node)) {
            return (
                <div key={path.join('.')} className="border rounded-lg p-2 ml-2">
                    {/* AND / OR */}
                    <div className={'flex gap-1'}>
                        {path.length > 0 && <Pill color={'orange'} text={<Icon icon={'TrashCan'} className={'size-4'} />} onClick={() => removeAtPath(path)} />}
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
            <div key={path.join('.')} className="w-full flex flex-col gap-2 items-center ml-4">
                {/* column selector */}
                <div className={'w-full flex gap-1'}>
                    <Pill color={'orange'} text={<Icon icon={'TrashCan'} className={'size-4'} />} onClick={() => removeAtPath(path)} />
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
                </div>

                <div className={'w-full flex gap-1'}>
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
                        <option key="filter" value="filter">include</option>
                        <option key="exclude" value="exclude">exclude</option>
                        <option key="like" value="like">text</option>
                        <option key="gt" value="gt"> {">"} </option>
                        <option key="gte" value="gte"> {">="} </option>
                        <option key="lt" value="lt"> {"<"} </option>
                        <option key="lte" value="lte"> {"<="} </option>
                    </select>

                    {['filter', 'exclude'].includes(node.op) && (
                        <div className={'flex items-center gap-1'}>
                            <label className={'text-gray-900 text-xs min-w-fit'}>Multi:</label>
                            <Switch label={'Multi'}
                                    enabled={node.isMulti}
                                    setEnabled={value => updateNodeAtPath(path, n => { n.isMulti = value; })}
                                    size={'xs'}
                            />
                        </div>
                    )}
                </div>
                <div className={'w-full flex flex-col items-center gap-1'}>
                    <div className={'w-full flex gap-1 items-center'}>
                        <label className={'text-gray-900 text-xs min-w-fit'}>Use Page Filters:</label>
                        <Switch label={'Use Page Filters'}
                                enabled={node.usePageFilters}
                                setEnabled={value => updateNodeAtPath(path, n => {
                                    n.usePageFilters = value;
                                    if (value && !n.searchParamKey) {
                                        n.searchParamKey = n.col;
                                    }
                                })}
                                size={'xs'}
                        />
                    </div>
                    {node.usePageFilters && (
                        <input
                            className={'px-1 text-xs rounded-md bg-blue-500/15 text-blue-700 border'}
                            value={node.searchParamKey || ''}
                            placeholder={'search key'}
                            onChange={e => updateNodeAtPath(path, n => { n.searchParamKey = e.target.value; })}
                        />
                    )}
                </div>
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
            <Pill color={'blue'} text={'save'} onClick={save} />
        </div>
    );
};