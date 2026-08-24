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

// The label side of a lookup: either a single `labelColumn` or an ordered
// `labelColumns` array joined by `labelSeparator`. A composite label is what makes
// a lookup usable when the label column alone is not unique — WCDB has three shows
// literally named "2101 The Penthouse", so a name-only dropdown offers three
// identical options and the author cannot tell which show_id they picked.
const labelColumnsOf = (parsed) => {
    const many = Array.isArray(parsed?.labelColumns) ? parsed.labelColumns.filter(Boolean) : [];
    if (many.length) return many;
    return parsed?.labelColumn ? [parsed.labelColumn] : [];
};

// Build one option label from a row. Blank parts are dropped rather than leaving
// dangling separators ("Untitled · " for a show with no department).
const buildLabel = (row, labelCols, separator) => {
    const parts = labelCols
        .map(c => row?.[c])
        .filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    return parts.length ? parts.join(separator ?? ' · ') : 'N/A';
};

// A column's `mapped_options` is meaningful only when it names the columns to
// look up label/value from. Static `select`/`multiselect` columns often carry
// a stray `"{}"` (copied from source metadata, never configured) — that's
// truthy but has no lookup, so treating it as "fetch me" would resolve to an
// empty result set and clobber the column's real static `options`.
const hasUsableMappedOptions = (raw) => {
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw);
        return !!(labelColumnsOf(parsed).length && parsed.valueColumn);
    } catch {
        return false;
    }
};

export function useColumnOptions({ state, setState, apiLoad, component, pgEnv, enabled, sectionId, trackingId }) {
    useEffect(() => {
        if (!enabled) return;
        let isStale = false;

        async function loadOptionsData() {
            try {
                const columnsToFetch = (state.columns || []).filter(c => hasUsableMappedOptions(c.mapped_options));
                if (!columnsToFetch.length) return;

                const fetchPromises = columnsToFetch.map(async column => {
                    let mapped_options;
                    try {
                        mapped_options = JSON.parse(column.mapped_options);
                    } catch {
                        console.warn('Invalid mapped_options JSON', column.mapped_options);
                        return [column.name, column.options || []];
                    }

                    const labelCols = labelColumnsOf(mapped_options);
                    const columns = [...new Set([...labelCols, mapped_options.valueColumn])].filter(Boolean);

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
                            },
                            sectionId: trackingId || sectionId,
                        });
                        return [
                            column.name,
                            data.map(d => ({
                                label: buildLabel(d, labelCols, mapped_options.labelSeparator),
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
                            if (hasUsableMappedOptions(c.mapped_options)) {
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
