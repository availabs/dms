import React from "react";
import { PresetBar } from "./PresetBar";
import { RangeRow } from "./RangeRow";
import { DowRow } from "./DowRow";
import { TimeOfDayRow } from "./TimeOfDayRow";
import { InstantRow } from "./InstantRow";
import { Chips } from "./Chips";
import { isAxisExposed } from "../../../utils/timeFilter";
import { useTimePickerTheme } from "./useTimePickerTheme";

/**
 * Time filter editor for `op: 'time'` filter leaves.
 *
 *   PresetBar    — Today / Last hour / Last 24h / Last 7d / Last 30d / This month
 *   RangeRow     — custom relative ("Last [N] [unit]"); single range only
 *   DowRow       — day-of-week toggle grid + Weekdays / Weekends presets
 *   TimeOfDayRow — HH:MM start/end inputs (midnight wrap forbidden in v1)
 *   InstantRow   — point-in-range "currently happening" mode + optional compareEnd column
 *   Chips        — per-axis active-constraint summary, each removable independently
 *
 * Phase 5: per-axis "Exposed to viewers" toggles in author mode. In viewer
 * mode (mode='viewer'), rows whose axis is locked are hidden — the URL only
 * round-trips exposed axes. Locked axis values still apply server-side.
 *
 * Props:
 *   value — TimeFilterValue (may be null/empty to mean "no constraints")
 *   onChange — fn(next: TimeFilterValue)
 *   columns — Available columns (used by InstantRow for compareEnd selection)
 *   startCol — The leaf's `col` (start column); used to filter compareEnd options
 *   mode — 'author' | 'viewer'. Default 'author'.
 */
export const TimePicker = ({ value, onChange, columns = [], startCol, mode = 'author' }) => {
    const t = useTimePickerTheme();
    const isAuthor = mode === 'author';

    const handleChange = (next) => {
        if (!next || (
            (!next.ranges || next.ranges.length === 0)
            && (!next.dow || next.dow.length === 0)
            && !next.timeOfDay
        )) {
            // Preserve exposedAxes config across "everything-cleared".
            onChange(next?.exposedAxes ? { exposedAxes: next.exposedAxes } : {});
            return;
        }
        onChange(next);
    };

    const setExposed = (axis, exposed) => {
        const next = { ...(value || {}) };
        const ax = { ...(next.exposedAxes || { range: true, dow: true, timeOfDay: true }) };
        ax[axis] = exposed;
        next.exposedAxes = ax;
        onChange(next);
    };

    const showRange = isAuthor || isAxisExposed(value, 'range');
    const showDow = isAuthor || isAxisExposed(value, 'dow');
    const showTod = isAuthor || isAxisExposed(value, 'timeOfDay');

    const hasAnyConstraint = value && (
        (Array.isArray(value.ranges) && value.ranges.length) ||
        (Array.isArray(value.dow) && value.dow.length) ||
        value.timeOfDay
    );

    return (
        <div className={t.wrapper}>
            {showRange && (
                <>
                    <div>
                        <label className={t.presetsLabel}>Presets</label>
                        <PresetBar value={value} onChange={handleChange} />
                    </div>
                    <div className={t.sectionDivider}>
                        <RangeRow value={value} onChange={handleChange} />
                    </div>
                </>
            )}
            {showDow && (
                <div className={t.sectionDivider}>
                    <DowRow value={value} onChange={handleChange} />
                </div>
            )}
            {showTod && (
                <div className={t.sectionDivider}>
                    <TimeOfDayRow value={value} onChange={handleChange} />
                </div>
            )}
            {showRange && (
                <div className={t.sectionDivider}>
                    <InstantRow value={value} onChange={handleChange} columns={columns} startCol={startCol} />
                </div>
            )}
            {hasAnyConstraint && (
                <div className={t.sectionDivider}>
                    <Chips value={value} onChange={handleChange} />
                </div>
            )}
            {isAuthor && (
                <div className={`${t.sectionDivider} ${t.exposureFooter}`}>
                    <span className={t.exposureLabel}>Exposed to viewers:</span>
                    {[
                        { key: 'range', label: 'Range' },
                        { key: 'dow', label: 'Day' },
                        { key: 'timeOfDay', label: 'Time of day' },
                    ].map(({ key, label }) => (
                        <label key={key} className={t.exposureToggle}>
                            <input
                                type="checkbox"
                                checked={isAxisExposed(value, key)}
                                onChange={e => setExposed(key, e.target.checked)}
                            />
                            <span>{label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TimePicker;
