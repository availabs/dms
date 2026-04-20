import React, {useContext, useMemo, useState} from "react";
import {ThemeContext} from "../../../../ui/useTheme";
import {ComponentContext} from "../../context";
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
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const theme = { ...themeFromContext, filters: { ...filterTheme, ...(themeFromContext.filter || {}) } };
    const { Icon } = UI;
    const [open, setOpen] = useState(defaultOpen);

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

    if (!externalConditions.length) return null;

    const gridSize = Math.min(state?.display?.gridSize || 1, externalConditions.length);
    const placement = state?.display?.placement || 'stacked';
    const placementClass = {
        inline: theme.filters.filterSettingsWrapperInline,
        stacked: theme.filters.filterSettingsWrapperStacked,
    };
    const labelWrapperClass = {
        inline: theme.filters.labelWrapperInline,
        stacked: theme.filters.labelWrapperStacked,
    };

    if (!open) {
        return (
            <div className={`${theme.filters.filtersWrapper} print:hidden`}>
                <div className={'w-fit -mt-4 p-2 border rounded-full self-end'}>
                    <Icon icon={'Filter'}
                          className={'text-slate-400 hover:text-blue-500 size-4 hover:cursor-pointer'}
                          title={'Filter'}
                          onClick={() => setOpen(true)} />
                </div>
            </div>
        );
    }

    return (
        <div className={`${theme.filters.filtersWrapper} print:hidden`}>
            <div className={'w-fit -mt-4 p-2 border rounded-full self-end'}>
                <Icon icon={'Filter'}
                      className={'text-slate-400 hover:text-blue-500 size-4 hover:cursor-pointer'}
                      title={'Filter'}
                      onClick={() => setOpen(false)} />
            </div>
            <div className={`grid ${gridClasses[gridSize]}`}>
                {externalConditions.map(({ node, path, siblingConditions }) => {
                    const column = columns.find(c => c.name === node.col);
                    const label = column ? getColumnLabel(column) : node.col;

                    return (
                        <div key={path.join('.')} className={`w-full flex ${placement === 'inline' ? 'flex-row' : 'flex-col'} items-center gap-1`}>
                            <div className={labelWrapperClass[placement]}>
                                <span className={theme.filters.filterLabel}>{label}</span>
                            </div>
                            <div className={placementClass[placement]}>
                                <ConditionValueInput
                                    node={node}
                                    path={path}
                                    columns={columns}
                                    updateNodeAtPath={updateNodeAtPath}
                                    siblingConditions={siblingConditions}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
