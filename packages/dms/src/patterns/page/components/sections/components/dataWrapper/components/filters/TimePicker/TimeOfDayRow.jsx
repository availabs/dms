import React from "react";
import { useTimePickerTheme } from "./useTimePickerTheme";

const isHHMM = (s) => /^\d{2}:\d{2}$/.test(s || '');

export const TimeOfDayRow = ({ value, onChange }) => {
    const t = useTimePickerTheme();
    const tod = value?.timeOfDay || null;

    const update = (patch) => {
        const next = { ...(tod || {}), ...patch };
        const v = { ...(value || {}) };

        if (!next.start && !next.end) {
            delete v.timeOfDay;
            onChange(v);
            return;
        }

        if (next.start && next.end && isHHMM(next.start) && isHHMM(next.end)) {
            if (next.start >= next.end) {
                v.timeOfDay = next;
                onChange(v);
                return;
            }
            v.timeOfDay = { start: next.start, end: next.end };
            onChange(v);
            return;
        }

        v.timeOfDay = next;
        onChange(v);
    };

    const clear = () => {
        const v = { ...(value || {}) };
        delete v.timeOfDay;
        onChange(v);
    };

    const summary = tod && tod.start && tod.end ? `${tod.start}–${tod.end}` : 'Any';
    const wrapping = tod && tod.start && tod.end && isHHMM(tod.start) && isHHMM(tod.end) && tod.start >= tod.end;

    return (
        <div className={t.todContainer}>
            <div className={t.rowHeader}>
                <label className={t.rowLabel}>Time of day</label>
                <span className={t.rowSummary}>{summary}</span>
            </div>

            <div className={t.rowEditor}>
                <input
                    type="time"
                    className={t.todInput}
                    value={tod?.start || ''}
                    onChange={e => update({ start: e.target.value })}
                />
                <span className={t.todSeparator}>to</span>
                <input
                    type="time"
                    className={t.todInput}
                    value={tod?.end || ''}
                    onChange={e => update({ end: e.target.value })}
                />
                {(tod?.start || tod?.end) && (
                    <button
                        type="button"
                        className={t.rangeClearButton}
                        onClick={clear}
                        aria-label="Clear time of day"
                    >
                        ✕
                    </button>
                )}
            </div>

            {wrapping && (
                <span className={t.todWarning}>
                    Start must be before end. Midnight-wrapping windows aren’t supported yet — split into two filters.
                </span>
            )}
        </div>
    );
};

export default TimeOfDayRow;
