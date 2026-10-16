import React, { useContext } from "react";
import { isTimeColumnType } from "../../../utils/timeFilter";
import { ThemeContext, getComponentTheme } from "../../../../../../../../../ui/useTheme";
import { timePickerTheme } from "./timePicker.theme";

// UI.Select can't hold '' as an option value: the "no end column" option uses this sentinel
const NO_END = '__none__';

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
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const t = { ...timePickerTheme, ...getComponentTheme(themeFromContext, 'timePicker') };
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
                <div className={t.rowLabel}>Currently happening</div>
                <span className={on ? t.rowSummary : t.rowSummaryAny}>
                    {on ? (compareEnd ? `now (vs ${compareEnd})` : 'now') : 'Off'}
                </span>
            </div>

            <div className={t.rowEditor}>
                <UI.Switch size="small" enabled={on} setEnabled={setOn} label="Currently happening" />

                {on && (
                    <>
                        <span className={t.instantHintLabel}>end column</span>
                        <span className={t.instantSelectWrap}>
                            <UI.Select
                                value={compareEnd || NO_END}
                                options={[
                                    { value: NO_END, label: '(none: rows already started)' },
                                    ...eligibleEndColumns.map(({ alias, label }) => ({ value: alias, label })),
                                ]}
                                onChange={v => setCompareEnd(v === NO_END ? '' : v)}
                                disabled={!eligibleEndColumns.length}
                            />
                        </span>
                    </>
                )}
            </div>

            {on && !eligibleEndColumns.length && (
                <span className={t.instantHelpText}>
                    No other date or time columns to compare against, so this matches rows whose start is before now.
                </span>
            )}
        </div>
    );
};

export default InstantRow;
