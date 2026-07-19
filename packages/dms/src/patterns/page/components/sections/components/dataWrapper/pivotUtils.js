// Shared pivot helpers. getData.js (builds the CASE fan-out SQL) and
// usePivotDistinctValues.js (injects the display pivot_col columns) MUST agree
// byte-for-byte on column naming, or the fetched columns won't match the
// rendered ones — hence one shared module rather than duplicated logic.

export const slugForPivot = (v) =>
    String(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// For calculated columns ("expr as alias"), return the alias; otherwise the name as-is.
export const colKey = (name) => {
    const parts = String(name ?? '').split(/\s+as\s+/i);
    return (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
};

// Multi-value pivot is active when the author has configured a `valueColumns`
// array. Legacy single-value pivots (just `valueColumn` + `aggregateFn`) keep
// their exact prior behavior (see getPivotValues / pivotColName `multi=false`).
export const isMultiValue = (pivot = {}) =>
    Array.isArray(pivot.valueColumns) && pivot.valueColumns.filter(v => v && v.column).length > 0;

// Normalized list of { column, aggregateFn, label } the pivot spreads per combo.
// New multi-value config wins; otherwise fall back to the legacy single value.
export const getPivotValues = (pivot = {}) => {
    const arr = Array.isArray(pivot.valueColumns) ? pivot.valueColumns.filter(v => v && v.column) : [];
    if (arr.length) {
        return arr.map(v => ({
            column: v.column,
            aggregateFn: v.aggregateFn || pivot.aggregateFn || 'count',
            label: v.label,
        }));
    }
    return [{ column: pivot.valueColumn, aggregateFn: pivot.aggregateFn || 'count', label: undefined }];
};

// Human label for a value column (falls back to its column alias/name).
export const valueColLabel = (v = {}) => v.label || colKey(v.column || '');

// The combo prefix of a pivot column name (one segment per pivot column).
export const pivotComboBase = (combo, pivotColumns) =>
    combo.map((val, i) => `${slugForPivot(colKey(pivotColumns[i]))}_${slugForPivot(val)}`).join('__');

// The full pivot_col name for a (combo × value) cell. Multi-value appends the
// value column's slug so speed/travel-time/delay under the same period stay
// distinct; single-value keeps the legacy combo-only name (BC).
export const pivotColName = (combo, pivotColumns, valueCol, multi) => {
    const base = pivotComboBase(combo, pivotColumns);
    return multi ? `${base}__${slugForPivot(colKey(valueCol?.column || ''))}` : base;
};
