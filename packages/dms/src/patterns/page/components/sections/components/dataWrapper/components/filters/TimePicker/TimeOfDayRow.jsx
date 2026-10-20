import React, { useContext } from "react";
import { ThemeContext, getComponentTheme } from "../../../../../../../../../ui/useTheme";
import { timePickerTheme } from "./timePicker.theme";

const isHHMM = (s) => /^\d{2}:\d{2}$/.test(s || '');

export const TimeOfDayRow = ({ value, onChange }) => {
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const t = { ...timePickerTheme, ...getComponentTheme(themeFromContext, 'timePicker') };
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
                <div className={t.rowLabel}>Time of day</div>
                <span className={summary === 'Any' ? t.rowSummaryAny : t.rowSummary}>{summary}</span>
            </div>

            <div className={t.rowEditor}>
                <span className={t.todInputWrap}>
                    <UI.Input
                        type="time"
                        aria-label="From"
                        value={tod?.start || ''}
                        onChange={e => update({ start: e.target.value })}
                    />
                </span>
                <span className={t.todSeparator}>to</span>
                <span className={t.todInputWrap}>
                    <UI.Input
                        type="time"
                        aria-label="To"
                        value={tod?.end || ''}
                        onChange={e => update({ end: e.target.value })}
                    />
                </span>
                {(tod?.start || tod?.end) && (
                    <UI.Button activeStyle="iconInline" onClick={clear} aria-label="Clear time of day" title="Clear time of day">
                        <UI.Icon icon="XMark" className={t.clearIcon} />
                    </UI.Button>
                )}
            </div>

            {wrapping && (
                <span className={t.todWarning}>
                    Start must be before end. Windows that wrap past midnight aren’t supported yet: split them into two filters.
                </span>
            )}
        </div>
    );
};

export default TimeOfDayRow;
