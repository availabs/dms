import React from "react";
import { useTimePickerTheme } from "./useTimePickerTheme";

const DAYS = [
    { idx: 0, abbr: 'S', label: 'Sun' },
    { idx: 1, abbr: 'M', label: 'Mon' },
    { idx: 2, abbr: 'T', label: 'Tue' },
    { idx: 3, abbr: 'W', label: 'Wed' },
    { idx: 4, abbr: 'T', label: 'Thu' },
    { idx: 5, abbr: 'F', label: 'Fri' },
    { idx: 6, abbr: 'S', label: 'Sat' },
];

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    const as = [...a].sort((x, y) => x - y);
    const bs = [...b].sort((x, y) => x - y);
    return as.every((v, i) => v === bs[i]);
};

const summarize = (dow) => {
    if (!Array.isArray(dow) || !dow.length) return 'Any';
    if (arraysEqual(dow, WEEKDAYS)) return 'Weekdays';
    if (arraysEqual(dow, WEEKENDS)) return 'Weekends';
    return [...dow].sort((a, b) => a - b).map(d => DAYS[d].label).join(', ');
};

export const DowRow = ({ value, onChange }) => {
    const t = useTimePickerTheme();
    const dow = Array.isArray(value?.dow) ? value.dow : [];
    const has = (i) => dow.includes(i);

    const setDow = (next) => {
        const v = { ...(value || {}) };
        if (!next || !next.length) delete v.dow;
        else v.dow = [...next].sort((a, b) => a - b);
        onChange(v);
    };

    const toggle = (i) => {
        if (has(i)) setDow(dow.filter(d => d !== i));
        else setDow([...dow, i]);
    };

    const isWeekdays = arraysEqual(dow, WEEKDAYS);
    const isWeekends = arraysEqual(dow, WEEKENDS);

    return (
        <div className={t.dowContainer}>
            <div className={t.rowHeader}>
                <label className={t.rowLabel}>Day</label>
                <span className={t.rowSummary}>{summarize(dow)}</span>
            </div>

            <div className={t.rowEditor}>
                <button
                    type="button"
                    className={`${t.dowPresetButton} ${isWeekdays ? t.dowPresetActive : t.dowPresetIdle}`}
                    onClick={() => setDow(isWeekdays ? [] : WEEKDAYS)}
                >
                    Weekdays
                </button>
                <button
                    type="button"
                    className={`${t.dowPresetButton} ${isWeekends ? t.dowPresetActive : t.dowPresetIdle}`}
                    onClick={() => setDow(isWeekends ? [] : WEEKENDS)}
                >
                    Weekends
                </button>

                <div className={t.dowDayGrid}>
                    {DAYS.map(d => (
                        <button
                            key={d.idx}
                            type="button"
                            title={d.label}
                            aria-pressed={has(d.idx)}
                            className={`${t.dowDayButton} ${has(d.idx) ? t.dowDayActive : t.dowDayIdle}`}
                            onClick={() => toggle(d.idx)}
                        >
                            {d.abbr}
                        </button>
                    ))}
                </div>

                {dow.length > 0 && (
                    <button
                        type="button"
                        className={t.rangeClearButton}
                        onClick={() => setDow([])}
                        aria-label="Clear day"
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
};

export default DowRow;
