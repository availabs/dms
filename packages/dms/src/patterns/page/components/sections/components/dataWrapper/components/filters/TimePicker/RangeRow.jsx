import React from "react";
import { useTimePickerTheme } from "./useTimePickerTheme";

const UNITS = [
    { value: 'minute', label: 'minutes' },
    { value: 'hour', label: 'hours' },
    { value: 'day', label: 'days' },
    { value: 'week', label: 'weeks' },
    { value: 'month', label: 'months' },
    { value: 'year', label: 'years' },
];

const sanitizeCount = (raw) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
};

const summarize = (range) => {
    if (!range) return 'Any';
    if (range.kind === 'relative') {
        const dir = range.direction === 'future' ? 'Next' : 'Last';
        return `${dir} ${range.count} ${range.unit}${range.count === 1 ? '' : 's'}`;
    }
    if (range.kind === 'current_period') return `This ${range.period}`;
    if (range.kind === 'named') return range.name;
    if (range.kind === 'absolute') {
        if (range.from && range.to) return `${range.from} → ${range.to}`;
        if (range.from) return `since ${range.from}`;
        if (range.to) return `before ${range.to}`;
    }
    if (range.kind === 'instant') return 'now';
    return 'Any';
};

export const RangeRow = ({ value, onChange }) => {
    const t = useTimePickerTheme();
    const range = value && Array.isArray(value.ranges) ? value.ranges[0] : null;
    const isCustomRelative = range && range.kind === 'relative';

    const updateRelative = (patch) => {
        const next = {
            kind: 'relative',
            unit: 'day',
            count: 7,
            direction: 'past',
            ...(isCustomRelative ? range : {}),
            ...patch,
        };
        onChange({ ...(value || {}), ranges: [next] });
    };

    const setEditing = () => {
        if (isCustomRelative) return;
        updateRelative({});
    };

    const clear = () => {
        const next = { ...(value || {}) };
        delete next.ranges;
        onChange(next);
    };

    return (
        <div className={t.rangeContainer}>
            <div className={t.rowHeader}>
                <label className={t.rowLabel}>Range</label>
                <span className={t.rowSummary}>{summarize(range)}</span>
            </div>

            {isCustomRelative ? (
                <div className={t.rowEditor}>
                    <select
                        className={t.rangeSelect}
                        value={range.direction}
                        onChange={e => updateRelative({ direction: e.target.value })}
                    >
                        <option value="past">Last</option>
                        <option value="future">Next</option>
                    </select>
                    <input
                        type="number"
                        min={0}
                        className={t.rangeNumberInput}
                        value={range.count}
                        onChange={e => updateRelative({ count: sanitizeCount(e.target.value) })}
                    />
                    <select
                        className={t.rangeSelect}
                        value={range.unit}
                        onChange={e => updateRelative({ unit: e.target.value })}
                    >
                        {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                    <button
                        type="button"
                        className={t.rangeClearButton}
                        onClick={clear}
                        aria-label="Clear range"
                    >
                        ✕
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    className={t.rangeCustomButton}
                    onClick={setEditing}
                >
                    Custom relative range…
                </button>
            )}
        </div>
    );
};

export default RangeRow;
