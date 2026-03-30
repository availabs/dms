/**
 * usePageFilterSync — syncs page-level filters into filterGroups tree.
 *
 * Replaces the duplicated page filter sync effects in Edit and View modes
 * of dataWrapper/index.jsx.
 *
 * NOTE: This hook mutates config in place (writes resolved page filter values
 * into filterGroups nodes). Phase 5 must change this to compute resolved
 * filters at runtime only, without touching config state. See the Phase 3→5
 * handoff notes in the datawrapper-rearchitecture task file.
 *
 * @param {Object}   state           - dataWrapper state (reads state.filters)
 * @param {Function} setState        - immer updater
 * @param {boolean}  setReadyOnChange - if true, sets display.readyToLoad on filter change (View mode)
 */

import { useEffect, useContext } from "react";
import { isEqual } from "lodash-es";
import { PageContext } from "../../../../context";
import { isGroup } from "../../ComplexFilters";

export function usePageFilterSync({ state, setState, setReadyOnChange = false }) {
    const { pageState } = useContext(PageContext) || {};

    useEffect(() => {
        const pageFilters = (pageState?.filters || []).reduce(
            (acc, curr) => ({ ...acc, [curr.searchKey]: curr.values }), {}
        );

        if (!Object.keys(pageFilters).length) return;

        // walk tree, check if any page-synced condition needs updating
        const needsUpdate = (node) => {
            if (isGroup(node)) return node.groups.some(needsUpdate);
            if (!node?.usePageFilters) return false;
            const key = node.searchParamKey || node.col;
            const pageValues = pageFilters[key];
            if (!pageValues) return false;
            const normalized = Array.isArray(pageValues) ? pageValues : [pageValues];
            return !isEqual(node.value, normalized);
        };

        if (!needsUpdate(state.filters)) return;

        setState(draft => {
            const update = (node) => {
                if (isGroup(node)) {
                    node.groups.forEach(update);
                    return;
                }
                if (!node?.usePageFilters) return;
                const key = node.searchParamKey || node.col;
                const pageValues = pageFilters[key];
                if (!pageValues) return;
                const normalized = Array.isArray(pageValues) ? pageValues : [pageValues];
                if (!isEqual(node.value, normalized)) {
                    node.value = normalized;
                    if (setReadyOnChange && !draft.display.readyToLoad) {
                        draft.display.readyToLoad = true;
                    }
                }
            };
            update(draft.filters);
        });
    }, [pageState?.filters]);
}
