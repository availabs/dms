// Save helpers shared by the dataWrapper's Edit and View `updateItem` and the section
// wrappers that publish after a save (Card, Spreadsheet). Pure functions plus one small
// timer queue, so they can be tested without rendering a section.

// Cells that commit a value in one pick, not by typing. Only these publish `save_publish`
// after a live edit: a refetch while someone is still typing would reset the field.
const DISCRETE_COLUMN_TYPES = new Set([
    'select', 'multiselect', 'radio', 'checkbox', 'boolean', 'switch', 'status_pill', 'priority_tier',
]);

export const isDiscreteColumnType = (type) => DISCRETE_COLUMN_TYPES.has(type);

// Loaded rows can hold formatted cells as {value, originalValue}; compare and store the raw value.
export const rawValue = (v) =>
    v && typeof v === 'object' && !Array.isArray(v) && 'originalValue' in v ? v.originalValue : v;

const stampNow = (now) => now.toISOString().slice(0, 19).replace('T', ' ');

// setDateOnValue: {field, values}. When a column's value changes into `values`, stamp `field`
// with the current UTC datetime; moving between two `values` keeps the first date (a ticket
// that goes Resolved → Closed keeps its resolved date); any other value clears it ('').
// Returns the patch to merge into the save, or null for nothing to write.
export function setDateOnValueStamp(setDateOnValue, oldValue, newValue, existingDate, now = new Date()) {
    const field = setDateOnValue?.field;
    if (!field) return null;
    const values = setDateOnValue.values || [];
    if (!values.includes(newValue)) return { [field]: '' };
    if (values.includes(oldValue) && existingDate) return null;
    return { [field]: stampNow(now) };
}

// The columns whose value in `newRow` differs from the stored `oldRow` (columns the new row
// doesn't carry are skipped).
export function changedColumns(columns = [], oldRow, newRow) {
    if (!newRow) return [];
    return columns.filter(c => c?.name && c.name in newRow
        && JSON.stringify(rawValue(oldRow?.[c.name]) ?? null) !== JSON.stringify(rawValue(newRow[c.name]) ?? null));
}

// The setDateOnValue stamps for a whole-row save (Spreadsheet cell, form save): one per changed
// column that carries the option. A date field the save sets itself wins over the stamp.
export function dateStampsForRow(columns = [], oldRow, newRow, now = new Date()) {
    const stamps = {};
    changedColumns(columns.filter(c => c?.setDateOnValue?.field), oldRow, newRow).forEach(c => {
        const field = c.setDateOnValue.field;
        if (field in newRow && rawValue(newRow[field]) !== rawValue(oldRow?.[field])) return;
        Object.assign(stamps, setDateOnValueStamp(
            c.setDateOnValue, rawValue(oldRow?.[c.name]), rawValue(newRow[c.name]), rawValue(oldRow?.[field]), now
        ));
    });
    return stamps;
}

// Live-edit saves, held per row: each row has its own pending patch and timer, so an edit to
// one row never cancels another row's save, and fields edited on the same row within `delay`
// merge into one save. `queue` returns a promise that settles when that row's save does.
// `flushAll` sends everything still pending (on unmount, so leaving a page doesn't drop an edit).
export function createPendingSaves({ delay = 500, send }) {
    const pending = new Map();

    const flush = (rowId) => {
        const entry = pending.get(rowId);
        if (!entry) return;
        pending.delete(rowId);
        clearTimeout(entry.timer);
        let request;
        try {
            request = Promise.resolve(send({ id: rowId, ...entry.patch }, entry.format));
        } catch (e) {
            request = Promise.reject(e);
        }
        entry.waiters.forEach(({ resolve, reject }) => request.then(resolve, reject));
    };

    return {
        queue(rowId, patch, format) {
            const entry = pending.get(rowId) || { patch: {}, waiters: [] };
            Object.assign(entry.patch, patch);
            entry.format = format;
            clearTimeout(entry.timer);
            entry.timer = setTimeout(() => flush(rowId), delay);
            pending.set(rowId, entry);
            return new Promise((resolve, reject) => entry.waiters.push({ resolve, reject }));
        },
        flushAll() {
            [...pending.keys()].forEach(flush);
        },
        get size() {
            return pending.size;
        },
    };
}
