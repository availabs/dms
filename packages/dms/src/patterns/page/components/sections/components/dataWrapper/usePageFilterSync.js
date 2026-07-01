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
import { isEqual, get } from "lodash-es";
import { PageContext } from "../../../../context";
import { isGroup } from "../../ComplexFilters";
import { resolveComparisonVariants, SELF_PARAM_KEY_SENTINEL, selfParamKey } from "./buildUdaConfig";

export function usePageFilterSync({ state, setState, setReadyOnChange = false, sectionId }) {
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

    // ── Comparison series — dynamic binding (Piece 3) ──
    // The dynamic counterpart of the static comparisonSeries.variants JSON. A
    // "comparison_series" componentFunctions subscriber (configured in the Actions
    // menu → stored in display._functions.subscribers) names the action param whose
    // published list becomes the variants. This is the subscriber's runtime
    // implementation — and a *reload-driving* one: it resolves the list into
    // comparisonSeries.config, a useDataLoader fetchKey input, so a new publish
    // refetches with the new fan-out (the "config field → fetchKey" pattern, NOT the
    // inert visual hover_highlight path).
    //
    // config's *presence* marks dynamic mode for buildUdaConfig (config wins over the
    // static variants; an unresolved binding → config:[] → inactive). So when the
    // subscriber is absent/disabled we must DELETE config to hand control back to the
    // static list.
    useEffect(() => {
        const cs = state?.comparisonSeries;
        if (!cs) return;
        const sub = (state?.display?._functions?.subscribers || []).find(
            (s) => s.functionId === "comparison_series" && s.enabled
        );

        // A subscriber may carry the `$self` sentinel instead of an author-typed literal —
        // it resolves to a key private to this section (derived from its own sectionId)
        // rather than a page-wide key someone has to type/copy. See `selfParamKey`.
        const effectiveParamKey =
            sub?.paramKey === SELF_PARAM_KEY_SENTINEL ? selfParamKey(sectionId) : sub?.paramKey;

        if (!effectiveParamKey) {
            if (cs.config !== undefined) {
                setState((draft) => { delete draft.comparisonSeries.config; });
            }
            return;
        }

        const pageFilters = (pageState?.filters || []).reduce(
            (acc, curr) => ({ ...acc, [curr.searchKey]: curr.values }), {}
        );
        const resolved = resolveComparisonVariants(sub.args, pageFilters[effectiveParamKey]);

        // isEqual guard is load-bearing: this effect depends on state.comparisonSeries
        // and writes to it, so it re-runs — the guard stops the cycle once stable.
        // resolveComparisonVariants must stay deterministic for a given input.
        if (!isEqual(cs.config, resolved)) {
            setState((draft) => { draft.comparisonSeries.config = resolved; });
        }
    }, [pageState?.filters, state?.comparisonSeries, state?.display?._functions, sectionId]);
}
