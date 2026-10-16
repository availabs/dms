import React, { useContext } from "react";
import { ThemeContext, getComponentTheme } from "../../../../../../../../../ui/useTheme";
import { timePickerTheme } from "./timePicker.theme";

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
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const t = { ...timePickerTheme, ...getComponentTheme(themeFromContext, 'timePicker') };
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
                <div className={t.rowLabel}>Day</div>
                <span className={dow.length ? t.rowSummary : t.rowSummaryAny}>{summarize(dow)}</span>
            </div>

            <div className={t.rowEditor}>
                <UI.Button
                    activeStyle={isWeekdays ? 'chipOn' : 'chip'}
                    aria-pressed={isWeekdays}
                    onClick={() => setDow(isWeekdays ? [] : WEEKDAYS)}
                >
                    Weekdays
                </UI.Button>
                <UI.Button
                    activeStyle={isWeekends ? 'chipOn' : 'chip'}
                    aria-pressed={isWeekends}
                    onClick={() => setDow(isWeekends ? [] : WEEKENDS)}
                >
                    Weekends
                </UI.Button>

                <span className={t.dowDayGrid} role="group" aria-label="Days of the week">
                    {DAYS.map(d => (
                        <UI.Button
                            key={d.idx}
                            activeStyle={has(d.idx) ? 'segmentOn' : 'segment'}
                            title={d.label}
                            aria-label={d.label}
                            aria-pressed={has(d.idx)}
                            onClick={() => toggle(d.idx)}
                        >
                            {d.abbr}
                        </UI.Button>
                    ))}
                </span>

                {dow.length > 0 && (
                    <UI.Button activeStyle="iconInline" onClick={() => setDow([])} aria-label="Clear day" title="Clear day">
                        <UI.Icon icon="XMark" className={t.clearIcon} />
                    </UI.Button>
                )}
            </div>
        </div>
    );
};

export default DowRow;
