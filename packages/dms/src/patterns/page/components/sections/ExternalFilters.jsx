import React, {useContext, useMemo, useState} from "react";
import {ThemeContext, getComponentTheme} from "../../../../ui/useTheme";
import {ComponentContext, PageContext} from "../../context";
import {ConditionValueInput} from "./ConditionValueInput";
import {getColumnLabel} from "./controls_utils";
import {filterTheme} from "./components/dataWrapper/components/filters/RenderFilters.theme";

const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
}

// `empty` / `notempty` are UNARY ops (col IS NULL OR '' / its inverse) — they
// carry no value, so ExternalFilters renders them as a toggle chip instead of a
// value input. The toggle's on/off IS the whole state (see toggleUnary below).
const isUnaryOp = (op) => op === 'empty' || op === 'notempty';

// A leaf "has a value" (→ shows as an active-filter token) when it carries a
// real selection. Unary ops are excluded (they have their own toggle chip);
// time ops count when their structured value object is non-empty.
const leafHasValue = (node) => {
    if (isUnaryOp(node.op)) return false;
    if (node.op === 'time') return !!(node.value && typeof node.value === 'object' && !Array.isArray(node.value) && Object.keys(node.value).length);
    const v = node.value;
    return Array.isArray(v) ? v.some(x => x != null && String(x).length) : (v != null && String(v).length > 0);
};

// Compact display string for an active-filter token's value.
const leafValueLabel = (node) => {
    if (node.op === 'time') return 'set';
    const v = node.value;
    if (Array.isArray(v)) return v.filter(x => x != null && String(x).length).join(', ');
    return v != null ? String(v) : '';
};

// Walks the filterGroups tree and collects leaf conditions with isExternal.
// For each, also captures sibling leaf conditions from the same AND group (for cascading options).
const getExternalConditions = (node, path = [], parentOp = 'AND', parentLeafSiblings = []) => {
    if (!node?.groups) {
        if (!node?.isExternal) return [];
        const siblingConditions = parentOp === 'AND' ? parentLeafSiblings.filter(s => s !== node) : [];
        return [{ node, path, siblingConditions }];
    }
    const leafSiblings = node.groups.filter(child => !child.groups);
    return node.groups.flatMap((child, i) =>
        getExternalConditions(child, [...path, i], node.op, leafSiblings)
    );
};

// Renders interactable filters for view-mode users, sourced from filterGroups conditions marked isExternal.
export const ExternalFilters = ({ defaultOpen = true }) => {
    const { state, setState } = useContext(ComponentContext) || {};
    const { pageState, updatePageStateFilters } = useContext(PageContext) || {};
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    // Resolve the named filter DESIGN (display.filterStyle) — getComponentTheme
    // picks the styles[] entry (inheriting styles[0]) or returns a flat filters
    // block as-is for themes that don't use named styles.
    const theme = { ...themeFromContext, filters: { ...filterTheme, ...getComponentTheme(themeFromContext, 'filters', state?.display?.filterStyle) } };
    const { Icon, Button } = UI;
    const [open, setOpen] = useState(defaultOpen);

    // New sections set display.hideExternalToggle: true so the round Filter
    // toggle pill is suppressed; existing rows without the key fall through to
    // the previous behavior (pill renders, toggles open/closed).
    const showToggle = state?.display?.hideExternalToggle !== true;

    const columns = state?.externalSource?.columns || [];
    const filterGroups = state?.filters;

    const externalConditions = useMemo(
        () => getExternalConditions(filterGroups),
        [filterGroups]
    );

    const updateNodeAtPath = (path, updater) => {
        setState(draft => {
            let cursor = draft.filters;
            for (let i = 0; i < path.length - 1; i++) {
                cursor = cursor.groups[path[i]];
            }
            updater(path.length ? cursor.groups[path[path.length - 1]] : cursor);
            // Signal the data loader to re-fetch (View mode guards on readyToLoad)
            if (draft.display) draft.display.readyToLoad = true;
        });
    };

    // Opt-in chrome — default OFF so existing Filter sections render unchanged.
    const showActiveTokens = state?.display?.showActiveTokens === true;
    const showClearAll = state?.display?.showClearAll === true;

    // A unary toggle is ON when: (usePageFilters) the page filter is present, else
    // when the leaf is not `disabled`. Preferring pageState for usePageFilters
    // leaves keeps the chip correct on reload (the URL is the source of truth).
    const unaryOn = (node) => {
        if (node.usePageFilters) {
            const key = node.searchParamKey || node.col;
            const vals = (pageState?.filters || []).find(pf => pf.searchKey === key)?.values;
            return Array.isArray(vals) ? vals.some(v => v != null && String(v).length) : (vals != null && vals !== '');
        }
        return !node.disabled;
    };

    // Toggle a unary (`empty`/`notempty`) leaf. ON → the leaf participates (op
    // stays `empty`); OFF → `disabled` (buildUdaConfig's mapFilterGroupCols drops
    // it → emits NO empty clause). When the leaf is wired to page filters, mirror
    // the ConditionValueInput sync so reacting sections re-fetch: push a presence
    // token when turning ON, remove it when turning OFF.
    const toggleUnary = (node, path) => {
        const turningOn = !unaryOn(node);
        updateNodeAtPath(path, n => { n.disabled = !turningOn; });
        if (node.usePageFilters && updatePageStateFilters) {
            const key = node.searchParamKey || node.col;
            const current = (pageState?.filters || [])
                .filter(f => f.searchKey !== key)
                .map(f => ({ searchKey: f.searchKey, values: f.values }));
            if (turningOn) current.push({ searchKey: key, values: ['1'] });
            updatePageStateFilters(current, { [key]: !turningOn });
        }
    };

    // Clear a single external leaf's value (active-token ✕). Reuses the same
    // update-node + page-filter-sync path a manual clear takes in ConditionValueInput.
    const clearLeaf = (node, path) => {
        updateNodeAtPath(path, n => {
            if (n.op === 'time') n.value = {};
            else n.value = ['filter', 'exclude'].includes(n.op) ? [] : '';
        });
        if (node.usePageFilters && updatePageStateFilters) {
            const key = node.searchParamKey || node.col;
            const current = (pageState?.filters || [])
                .filter(f => f.searchKey !== key)
                .map(f => ({ searchKey: f.searchKey, values: f.values }));
            updatePageStateFilters(current, { [key]: true });
        }
    };

    // Clear-all — reset every external leaf (values blanked; unary toggles OFF) in
    // one state write, then drop all their page filters in a single navigation.
    const clearAllFilters = () => {
        setState(draft => {
            const walk = (n) => {
                if (!n) return;
                if (n.groups) { n.groups.forEach(walk); return; }
                if (!n.isExternal) return;
                if (isUnaryOp(n.op)) n.disabled = true;
                else if (n.op === 'time') n.value = {};
                else n.value = ['filter', 'exclude'].includes(n.op) ? [] : '';
            };
            walk(draft.filters);
            if (draft.display) draft.display.readyToLoad = true;
        });
        if (updatePageStateFilters) {
            const removeMap = {};
            externalConditions.forEach(({ node }) => {
                if (node.usePageFilters) removeMap[node.searchParamKey || node.col] = true;
            });
            if (Object.keys(removeMap).length) {
                const remaining = (pageState?.filters || [])
                    .filter(f => !removeMap[f.searchKey])
                    .map(f => ({ searchKey: f.searchKey, values: f.values }));
                updatePageStateFilters(remaining, removeMap);
            }
        }
    };

    if (!externalConditions.length) return null;

    const activeTokens = externalConditions.filter(({ node }) => leafHasValue(node));

    const gridSize = Math.min(state?.display?.gridSize || 1, externalConditions.length);
    // placement comes from the filter style; an explicit display.placement overrides it.
    const placement = state?.display?.placement || theme.filters.placement || 'stacked';
    const placementClass = {
        inline: theme.filters.filterSettingsWrapperInline,
        stacked: theme.filters.filterSettingsWrapperStacked,
    };
    const labelWrapperClass = {
        inline: theme.filters.labelWrapperInline,
        stacked: theme.filters.labelWrapperStacked,
    };
    const rowClass = placement === 'inline'
        ? theme.filters.conditionRowInline
        : theme.filters.conditionRowStacked;

    const toggleButton = showToggle ? (
        <Button
            className={theme.filters.toggleButton}
            onClick={() => setOpen(o => !o)}
        >
            <Icon icon={'Filter'} className={theme.filters.toggleIcon} title={'Filter'} />
        </Button>
    ) : null;

    if (showToggle && !open) {
        return (
            <div className={`${theme.filters.filtersWrapper} print:hidden`}>
                {toggleButton}
            </div>
        );
    }

    return (
        <div className={`${theme.filters.filtersWrapper} print:hidden`}>
            {toggleButton}
            <div className={`${theme.filters.conditionsGrid} ${gridClasses[gridSize]}`}>
                {externalConditions.map(({ node, path, siblingConditions }) => {
                    const column = columns.find(c => c.name === node.col);
                    const label = node.displayName || (column ? getColumnLabel(column) : node.col);

                    return (
                        <div key={path.join('.')} className={rowClass}>
                            <div className={labelWrapperClass[placement]}>
                                <span className={theme.filters.filterLabel}>{label}</span>
                            </div>
                            <div className={placementClass[placement]}>
                                {isUnaryOp(node.op) ? (
                                    <button
                                        type={'button'}
                                        role={'switch'}
                                        aria-checked={unaryOn(node)}
                                        data-on={unaryOn(node) || undefined}
                                        className={`${theme.filters.toggleChip} ${unaryOn(node) ? theme.filters.toggleChipOn : ''}`}
                                        onClick={() => toggleUnary(node, path)}
                                    >
                                        <span className={theme.filters.toggleTrack}>
                                            <span className={theme.filters.toggleKnob} />
                                        </span>
                                    </button>
                                ) : (
                                    <ConditionValueInput
                                        node={node}
                                        path={path}
                                        columns={columns}
                                        updateNodeAtPath={updateNodeAtPath}
                                        siblingConditions={siblingConditions}
                                        activeStyle={theme.filters.controlStyle}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            {(showActiveTokens && activeTokens.length) || showClearAll ? (
                <div className={theme.filters.activeTokensWrapper}>
                    {showActiveTokens
                        ? activeTokens.map(({ node, path }) => {
                            const column = columns.find(c => c.name === node.col);
                            const label = node.displayName || (column ? getColumnLabel(column) : node.col);
                            return (
                                <span key={path.join('.')} className={theme.filters.activeToken}>
                                    {label}: {leafValueLabel(node)}
                                    <Icon
                                        icon={'XMark'}
                                        title={'Remove'}
                                        className={theme.filters.activeTokenRemove}
                                        onClick={() => clearLeaf(node, path)}
                                    />
                                </span>
                            );
                        })
                        : null}
                    {showClearAll ? (
                        <span role={'button'} className={theme.filters.clearAll} onClick={clearAllFilters}>Clear all</span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};
