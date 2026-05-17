import React, {useContext, useEffect, Fragment} from "react";
import {useImmer} from "use-immer";
import {isEqual, uniqWith} from "lodash-es";
import {ThemeContext, getComponentTheme} from "../../../../ui/useTheme";
import {PageContext, ComponentContext} from "../../context";
import {getColumnLabel, isEqualColumns} from "./controls_utils";
import {ConditionValueInput} from "./ConditionValueInput";
import { calculateIsJoinPresent } from "./components/dataWrapper/utils/joinUtils";
import { isTimeColumnType } from "./components/dataWrapper/utils/timeFilter";
import { complexFiltersTheme } from "./ComplexFilters.theme";

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
    value: [],
    source_id: columns?.[0]?.source_id ?? null
});

// only in edit mode
export const ComplexFilters = ({ state, setState }) => {
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const { Pill, Icon, Popup, Switch, MultiSelect, Input, ColumnTypes: {select} } = UI;
    const t = { ...complexFiltersTheme, ...getComponentTheme(themeFromContext, 'complexFilters') };
    const { apiLoad } = useContext(PageContext) || {};
    const existingCtx = useContext(ComponentContext);

    const { join } = state || {};
    const isJoinPresent = calculateIsJoinPresent(join);  //TODO MIGHT NEED TO ADD BACK IN CONDITIONAL about mergeStrat


    const columns = [
        ...(state.columns || []).filter(c => c.systemCol),
        ...(state.externalSource?.columns || [])
    ];
    const isGrouping = (state.columns || []).some(c => c.group);

    const [filterGroups, updateFilterGroups] = useImmer(
        Object.entries(state?.filters || {}).length ?
            state?.filters || {} : { op: 'AND', groups: [] }
    );

    // sync inbound: page filters → condition values
    const { pageState } = useContext(PageContext) || {};

    // useEffect(() => {
    //     const pageFilters = (pageState?.filters || []).reduce(
    //         (acc, curr) => ({...acc, [curr.searchKey]: curr.values}), {}
    //     );
    //
    //     if (!Object.keys(pageFilters).length) return;
    //
    //     // walk tree, check if any page-synced condition needs updating
    //     const needsUpdate = (node) => {
    //         if (isGroup(node)) return node.groups.some(needsUpdate);
    //         if (!node.usePageFilters) return false;
    //         const key = node.searchParamKey || node.col;
    //         const pageValues = pageFilters[key];
    //         if (!pageValues) return false;
    //         const normalized = Array.isArray(pageValues) ? pageValues : [pageValues];
    //         return !isEqual(node.value, normalized);
    //     };
    //
    //     if (!needsUpdate(filterGroups)) return;
    //
    //     updateFilterGroups(draft => {
    //         const update = (node) => {
    //             if (isGroup(node)) {
    //                 node.groups.forEach(update);
    //                 return;
    //             }
    //             if (!node.usePageFilters) return;
    //             const key = node.searchParamKey || node.col;
    //             const pageValues = pageFilters[key];
    //             if (!pageValues) return;
    //             const normalized = Array.isArray(pageValues) ? pageValues : [pageValues];
    //             if (!isEqual(node.value, normalized)) {
    //                 node.value = normalized;
    //             }
    //         };
    //         update(draft);
    //     });
    // }, [filterGroups]);

    // sync upward if needed
    const save = () => {
        setState(draft => {
            draft.filters = filterGroups;
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
        updateFilterGroups(draft => {
            if (!path.length) {
                draft.groups = []; // deleting root group
            }

            let cursor = draft;
            for (let i = 0; i < path.length - 1; i++) {
                cursor = cursor.groups[path[i]];
            }
            cursor.groups.splice(path[path.length - 1], 1);
        });
    };

    const renderNode = (node, path = [], parentOp = 'AND', parentLeafSiblings = []) => {
        if (isGroup(node)) {
            const leafSiblings = node.groups.filter(child => !isGroup(child));
            const isRoot = !path.length;
            return (
                <div
                    key={path.join('.')}
                    className={`${t.groupWrapper} ${isRoot ? '' : t.groupWrapperNested}`}
                >
                    {/* Group header: "Match [All ▾] of the following" + remove */}
                    <div className={t.groupHeader}>
                        <div className={t.groupHeaderLabel}>
                            <span className={t.groupHeaderMatch}>Match</span>
                            <MultiSelect
                                singleSelectOnly
                                searchable={false}
                                value={node.op}
                                options={[
                                    { label: 'All', value: 'AND' },
                                    { label: 'Any', value: 'OR' },
                                ]}
                                onChange={value =>
                                    updateNodeAtPath(path, n => {
                                        n.op = value;
                                    })
                                }
                            />
                            <span>of the following</span>
                        </div>
                        {!isRoot && (
                            <Pill
                                color={'orange'}
                                text={<Icon icon={'TrashCan'} className={t.popupTrash} />}
                                title={'Remove group'}
                                onClick={() => removeAtPath(path)}
                            />
                        )}
                    </div>

                    {/* Children — no inline AND/OR labels between (the header
                        already conveys the relation). */}
                    {node.groups.length > 0 && (
                        <div className={t.groupChildren}>
                            {node.groups.map((child, i) =>
                                <React.Fragment key={`node_child_${i}`}>
                                    {renderNode(child, [...path, i], node.op, leafSiblings)}
                                </React.Fragment>
                            )}
                        </div>
                    )}

                    <div className={t.groupActions}>
                        <Pill
                            color={'blue'}
                            text={'+ Condition'}
                            onClick={() => addAtPath(path, emptyCondition(columns))}
                        />
                        <Pill
                            color={'blue'}
                            text={'+ Group'}
                            onClick={() => addAtPath(path, emptyGroup())}
                        />
                    </div>
                </div>
            );
        }

        // condition (leaf)
        const isStale = node.col && !columns.find(c => c.name === node.col);
        const siblingConditions = parentOp === 'AND' ? parentLeafSiblings.filter(s => s !== node) : [];
        const showValueEditor = !['is_null', 'is_not_null'].includes(node.op);
        return (
            <div
                key={path.join('.')}
                className={`${t.leafWrapper} ${isStale ? t.leafWrapperStale : t.leafWrapperDefault}`}
            >
                {/* Top-right ellipsis menu — leaf-level toggles + remove. */}
                <div className={t.leafEllipsisWrapper}>
                    <Popup button={<Icon icon={'EllipsisVertical'} className={t.leafEllipsisIcon}/>} preventCloseOnClickOutside={false}>
                        {
                            () => (
                                <div className={t.popup}>
                                    <div className={t.popupRow}>
                                        <Icon icon={'Filter'} className={t.popupIcon} />
                                        <label className={t.popupRowLabel}>Is Multiselect:</label>
                                        <Switch label={'Multi'}
                                                disabled={!['filter', 'exclude'].includes(node.op)}
                                                enabled={node.isMulti}
                                                setEnabled={value => updateNodeAtPath(path, n => { n.isMulti = value; })}
                                                size={'xs'}
                                        />
                                    </div>
                                    {isGrouping && (
                                        <div className={t.popupRow}>
                                            <Icon icon={'Filter'} className={t.popupIcon} />
                                            <label className={t.popupRowLabel}>Aggregate fn:</label>
                                            <MultiSelect
                                                singleSelectOnly
                                                searchable={false}
                                                value={node.fn || ''}
                                                options={[
                                                    { label: 'none', value: '' },
                                                    { label: 'sum', value: 'sum' },
                                                    { label: 'count', value: 'count' },
                                                    { label: 'max', value: 'max' },
                                                    { label: 'list', value: 'list' },
                                                ]}
                                                onChange={value => updateNodeAtPath(path, n => { n.fn = value || undefined; })}
                                            />
                                        </div>
                                    )}
                                    <div className={t.popupRow}>
                                        <Icon icon={'Filter'} className={t.popupIcon} />
                                        <label className={t.popupRowLabel}>Use Page Filters:</label>
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
                                        <Input
                                            disabled={!node.usePageFilters}
                                            value={node.searchParamKey || ''}
                                            placeholder={'search key'}
                                            onChange={e => updateNodeAtPath(path, n => { n.searchParamKey = e.target.value; })}
                                        />
                                    </div>
                                    <div className={t.popupRow}>
                                        <Icon icon={'Filter'} className={t.popupIcon} />
                                        <label className={t.popupRowLabel}>External:</label>
                                        <Switch label={'External'}
                                                enabled={node.isExternal}
                                                setEnabled={value => updateNodeAtPath(path, n => { n.isExternal = value; })}
                                                size={'xs'}
                                        />
                                    </div>
                                    {node.isExternal && (
                                        <div className={t.popupRow}>
                                            <Icon icon={'Filter'} className={t.popupIcon} />
                                            <label className={t.popupRowLabel}>Display:</label>
                                            <MultiSelect
                                                singleSelectOnly
                                                searchable={false}
                                                value={node.display || ''}
                                                options={[
                                                    { label: 'compact', value: '' },
                                                    { label: 'expanded', value: 'expanded' },
                                                    { label: 'tabular', value: 'tabular' },
                                                ]}
                                                onChange={value => updateNodeAtPath(path, n => { n.display = value || undefined; })}
                                            />
                                        </div>
                                    )}
                                    <div className={t.popupRow}>
                                        <Icon icon={'Filter'} className={t.popupIcon} />
                                        <label className={t.popupRowLabel}>Normal Filter:</label>
                                        <Switch label={'Normal Filter'}
                                                enabled={node.isNormalFilter}
                                                setEnabled={value => updateNodeAtPath(path, n => {
                                                    n.isNormalFilter = value;
                                                    if (value && !n.valueCol) {
                                                        const valCol = columns.find(c => c.valueColumn)?.name || columns[0]?.name;
                                                        n.valueCol = valCol;
                                                    }
                                                    // fn can be set via the Aggregate fn dropdown;
                                                    // when unset, fnToTextMap.default uses max()
                                                })}
                                                size={'xs'}
                                        />
                                    </div>
                                    {node.isNormalFilter && (
                                        <div className={t.popupRow}>
                                            <Icon icon={'Filter'} className={t.popupIcon} />
                                            <label className={t.popupRowLabel}>Value Column:</label>
                                            <MultiSelect
                                                singleSelectOnly
                                                searchable={false}
                                                value={node.valueCol || ''}
                                                options={columns.map(c => ({
                                                    label: getColumnLabel(c),
                                                    value: c.name,
                                                }))}
                                                onChange={value => updateNodeAtPath(path, n => { n.valueCol = value; })}
                                            />
                                        </div>
                                    )}
                                    <div className={t.popupRemove} onClick={() => removeAtPath(path)}>
                                        <Icon icon={'TrashCan'} className={t.popupTrash} /> Remove
                                    </div>
                                </div>
                            )
                        }
                    </Popup>
                </div>

                {/* Stale-column warning (if any) above the fields. */}
                {isStale && <span className={t.leafStaleBadge}>stale</span>}

                {/* Each field on its own line: Column → Operation → Value. The
                    fieldWithEllipsisGutter row leaves space for the absolute-
                    positioned ellipsis in the top-right corner. */}
                <div className={t.fieldWithEllipsisGutter}>
                    <label className={t.fieldLabel}>Column</label>
                    <MultiSelect
                        singleSelectOnly
                        searchable={false}
                        value={JSON.stringify(columns.find(c => c.name === node.col && c.source_id === node.source_id))}
                        options={[
                            { label: 'Please select a column...', value: '' },
                            ...uniqWith(columns, isEqual).map(c => {
                                const tableAlias = c.source_id ? Object.keys(join?.sources).find(jSourceKey => join?.sources[jSourceKey].source === c.source_id) : 0;
                                const match = isJoinPresent && tableAlias?.match(/\d+$/);
                                const tableIdx = match ? Number(match) : 0;
                                return {
                                    label: `${getColumnLabel(c)}${isJoinPresent ? ` 🔗${tableIdx}` : ''}`,
                                    value: JSON.stringify(c),
                                };
                            }),
                        ]}
                        onChange={raw => {
                            if (!raw) return;
                            updateNodeAtPath(path, n => {
                                const val = JSON.parse(raw);
                                n.col = val.name;
                                n.source_id = val.source_id;
                            });
                        }}
                    />
                </div>

                <div className={t.field}>
                    <label className={t.fieldLabel}>Operation</label>
                    <MultiSelect
                        singleSelectOnly
                        searchable={false}
                        value={node.op}
                        options={[
                            { label: 'contains', value: 'filter' },
                            { label: 'does not contain', value: 'exclude' },
                            { label: 'partially contains', value: 'like' },
                            { label: ' > ', value: 'gt' },
                            { label: ' >= ', value: 'gte' },
                            { label: ' < ', value: 'lt' },
                            { label: ' <= ', value: 'lte' },
                            { label: 'exclude N/A', value: 'is_not_null' },
                            { label: 'show only N/As', value: 'is_null' },
                            // `time` is a structured op — only meaningful for date/timestamp
                            // columns. Surface it only when the selected column qualifies so
                            // it can't be applied to text/number columns.
                            ...(isTimeColumnType(columns.find(c => c.name === node.col)?.type)
                                ? [{ label: 'time filter', value: 'time' }]
                                : []),
                        ]}
                        onChange={newOp => {
                            const wasMulti = ['filter', 'exclude'].includes(node.op);
                            const isMulti = ['filter', 'exclude'].includes(newOp);
                            const wasTime = node.op === 'time';
                            const isTime = newOp === 'time';
                            updateNodeAtPath(path, n => {
                                n.op = newOp;
                                // Reset the value shape when switching between fundamentally
                                // different ops (multi vs scalar, time vs scalar, IS [NOT] NULL).
                                if (isTime !== wasTime || wasMulti !== isMulti || ['is_null', 'is_not_null'].includes(newOp)) {
                                    if (isTime) n.value = {};
                                    else if (isMulti) n.value = [];
                                    else n.value = '';
                                }
                            });
                        }}
                    />
                </div>

                {showValueEditor && (
                    <div className={t.field}>
                        <label className={t.fieldLabel}>Value</label>
                        <ConditionValueInput
                            node={node}
                            path={path}
                            columns={columns}
                            updateNodeAtPath={updateNodeAtPath}
                            siblingConditions={siblingConditions}
                        />
                    </div>
                )}
            </div>
        );
    };

    // When rendered outside the dataWrapper tree (e.g. inside sectionMenu),
    // ComponentContext has its empty default {} — provide the minimum needed for ConditionValueInput.
    const ctxValue = existingCtx?.apiLoad ? existingCtx : { apiLoad, state, setState };

    return (
        <ComponentContext.Provider value={ctxValue}>
            <div className={t.root}>
                {renderNode(filterGroups)}
                <Pill color={'blue'} text={'save'} onClick={save} />
            </div>
        </ComponentContext.Provider>
    );
};