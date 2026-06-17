import { isEqual } from "lodash-es";

/**
 * computeRowPublish — pure resolver for the `click_publish` provider.
 *
 * Given a clicked row, the provider's args, and the values currently published
 * on the action param, decide what to publish next. No React, no context — the
 * runtime callback in index.jsx just reads `curValues`, calls this, and dispatches.
 *
 * Per-row identity (Case B): when `id_column` is set, we publish a
 * { id, value } composite so two rows that share the same payload (`value`)
 * still toggle independently — identity is the row id, not the payload. Without
 * an id column, identity is the payload itself (Case A). Consumers that read the
 * payload (e.g. a dynamic custom bucket via resolveAliasGroups) unwrap `.value`;
 * see component-actions.md.
 *
 * Append mode is a click-toggle: clicking an already-published row removes it,
 * clicking a new one adds it. Identity is compared with isEqual (not a Set)
 * because values may be objects or stringified JSON. The array is one entry per
 * click, so the O(n²) toggle scan is fine.
 *
 * @param {Object} rowData    - the clicked row's data
 * @param {Object} args       - provider args: { column, id_column, append_params }
 * @param {Array}  curValues  - values currently on the action param
 * @returns {{op: 'noop'}|{op: 'clear'}|{op: 'set', values: Array}}
 */
export function computeRowPublish(rowData, { column, id_column, append_params } = {}, curValues = []) {
    const cellValue = rowData?.[column];
    if (cellValue == null) return { op: 'noop' };

    const hasId = id_column != null && id_column !== '';
    const rowId = hasId ? rowData?.[id_column] : undefined;
    const element = hasId ? { id: rowId, value: cellValue } : cellValue;

    // Compare published entries by identity: the row id for composites, else
    // the whole value.
    const sameIdentity = (entry) =>
        hasId ? isEqual(entry?.id, rowId) : isEqual(entry, element);

    if (!append_params) {
        return { op: 'set', values: [element] };
    }

    const isPresent = curValues.some(sameIdentity);
    const nextValues = isPresent
        ? curValues.filter(entry => !sameIdentity(entry))
        : [...curValues, element];

    // Toggling the last value off clears the param entirely so downstream
    // consumers see "no filter" rather than an empty-array filter.
    return nextValues.length === 0
        ? { op: 'clear' }
        : { op: 'set', values: nextValues };
}
