/**
 * useColumnOptions — loads option lists for columns with mapped_options config.
 *
 * Replaces the duplicated mapped_options loading effects in Edit and View
 * modes of dataWrapper/index.jsx.
 *
 * @param {Object}   state     - dataWrapper state (reads columns, externalSource)
 * @param {Function} setState  - immer updater
 * @param {Function} apiLoad   - DMS data loader
 * @param {Object}   component - component config (keepOriginalValues)
 * @param {string}   pgEnv     - external data environment string
 * @param {boolean}  enabled   - gate condition (differs between Edit and View)
 */

import { useEffect } from "react";
import { isEqual } from "lodash-es";
import { getData } from "./getData";

export function useColumnOptions({ state, setState, apiLoad, component, pgEnv, enabled }) {
    useEffect(() => {
        if (!enabled) return;
        let isStale = false;

        async function loadOptionsData() {
            try {
                const columnsToFetch = (state.columns || []).filter(c => c.mapped_options);
                if (!columnsToFetch.length) return;

                const fetchPromises = columnsToFetch.map(async column => {
                    let mapped_options;
                    try {
                        mapped_options = JSON.parse(column.mapped_options);
                    } catch {
                        console.warn('Invalid mapped_options JSON', column.mapped_options);
                        return [column.name, column.options || []];
                    }

                    const columns = [...new Set([mapped_options.labelColumn, mapped_options.valueColumn])].filter(Boolean);

                    try {
                        const { data } = await getData({
                            apiLoad,
                            fullDataLoad: true,
                            currentPage: 0,
                            keepOriginalValues: component.keepOriginalValues,
                            state: {
                                filters: mapped_options.filter || {},
                                display: {},
                                externalSource: {
                                    source_id: mapped_options.sourceId,
                                    view_id: mapped_options.viewId,
                                    isDms: mapped_options.isDms,
                                    columns: columns.map(c => ({ name: c })),
                                    app: state.externalSource?.app,
                                    type: mapped_options.type,
                                    env: mapped_options.isDms
                                        ? `${state.externalSource?.app}+${mapped_options.type}`
                                        : pgEnv
                                },
                                columns: columns.map(c => ({ name: c, show: true }))
                            }
                        });
                        return [
                            column.name,
                            data.map(d => ({
                                label: d[mapped_options.labelColumn] || 'N/A',
                                value: d[mapped_options.valueColumn]
                            }))
                        ];
                    } catch (err) {
                        console.error(`Failed to load options for column ${column.name}:`, err);
                        return [column.name, column.options || []];
                    }
                });

                const results = await Promise.all(fetchPromises);

                if (!isStale) {
                    const responses = Object.fromEntries(results);
                    setState(draft => {
                        draft.columns.forEach(c => {
                            if (c.mapped_options) {
                                const fetchedOptions = responses[c.name] || [];
                                if (!isEqual(c.options, fetchedOptions)) {
                                    c.options = fetchedOptions;
                                }
                            }
                        });
                    });
                }
            } catch (err) {
                console.error('Error loading options:', err);
            }
        }

        loadOptionsData();
        return () => {
            isStale = true;
        };
    }, [enabled, state.columns?.map(c => c.mapped_options).join(',')]);
}
