import React from "react";
import { isTimeColumnType } from "../../../utils/timeFilter";
import { useTimePickerTheme } from "./useTimePickerTheme";

const hasInstant = (value) =>
    Array.isArray(value?.ranges) && value.ranges.some(r => r && r.kind === 'instant');

// Calc columns store their SQL in `name` as "<sql> as <alias>". For picker UI
// purposes we want just the alias (matches what the user sees, and what the
// server-side validator's COL_NAME regex on `compareEnd` requires). For
// stored columns the alias and name are the same.
const aliasOf = (name) => {
    if (!name) return '';
    const parts = name.split(/\s+as\s+/i);
    return (parts[1] || parts[0] || '').trim();
};

export const InstantRow = ({ value, onChange, columns = [], startCol }) => {
    const t = useTimePickerTheme();
    const on = hasInstant(value);
    const compareEnd = value?.compareEnd || '';

    const eligibleEndColumns = columns
        .filter(c => c && c.name && isTimeColumnType(c.type))
        .map(c => ({
            col: c,
            alias: aliasOf(c.name),
            label: c.display_name || aliasOf(c.name),
        }))
        .filter(({ alias }) => alias && alias !== startCol);

    const setOn = (next) => {
        const v = { ...(value || {}) };
        if (next) {
            v.ranges = [{ kind: 'instant', at: 'now' }];
            if (!v.compareEnd && eligibleEndColumns.length) {
                v.compareEnd = eligibleEndColumns[0].alias;
            }
        } else {
            delete v.ranges;
            delete v.compareEnd;
        }
        onChange(v);
    };

    const setCompareEnd = (col) => {
        const v = { ...(value || {}) };
        if (!col) delete v.compareEnd;
        else v.compareEnd = col;
        onChange(v);
    };

    return (
        <div className={t.instantContainer}>
            <div className={t.rowHeader}>
                <label className={t.rowLabel}>Currently happening</label>
                <span className={t.rowSummary}>
                    {on ? (compareEnd ? `now (vs ${compareEnd})` : 'now') : 'Off'}
                </span>
            </div>

            <div className={t.rowEditor}>
                <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => setOn(!on)}
                    className={on ? t.instantSwitchOn : t.instantSwitchOff}
                >
                    <span className={on ? t.instantSwitchKnobOn : t.instantSwitchKnobOff} />
                </button>

                {on && (
                    <>
                        <label className={t.instantHintLabel}>End column:</label>
                        <select
                            className={t.instantSelect}
                            value={compareEnd}
                            onChange={e => setCompareEnd(e.target.value)}
                            disabled={!eligibleEndColumns.length}
                        >
                            <option value="">(none — match rows already started)</option>
                            {eligibleEndColumns.map(({ alias, label }) => (
                                <option key={alias} value={alias}>{label}</option>
                            ))}
                        </select>
                    </>
                )}
            </div>

            {on && !eligibleEndColumns.length && (
                <span className={t.instantHelpText}>
                    No other temporal columns available for an end-column comparison. The leaf will match rows whose start ≤ now.
                </span>
            )}
        </div>
    );
};

export default InstantRow;
