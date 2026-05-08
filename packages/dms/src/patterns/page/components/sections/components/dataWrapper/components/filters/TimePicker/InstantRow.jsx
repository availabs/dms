import React from "react";
import { isTimeColumnType } from "../../../utils/timeFilter";
import { useTimePickerTheme } from "./useTimePickerTheme";

const hasInstant = (value) =>
    Array.isArray(value?.ranges) && value.ranges.some(r => r && r.kind === 'instant');

export const InstantRow = ({ value, onChange, columns = [], startCol }) => {
    const t = useTimePickerTheme();
    const on = hasInstant(value);
    const compareEnd = value?.compareEnd || '';

    const eligibleEndColumns = columns.filter(c =>
        c && c.name && c.name !== startCol && isTimeColumnType(c.type)
    );

    const setOn = (next) => {
        const v = { ...(value || {}) };
        if (next) {
            v.ranges = [{ kind: 'instant', at: 'now' }];
            if (!v.compareEnd && eligibleEndColumns.length) {
                v.compareEnd = eligibleEndColumns[0].name;
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
                            {eligibleEndColumns.map(c => (
                                <option key={c.name} value={c.name}>{c.name}</option>
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
