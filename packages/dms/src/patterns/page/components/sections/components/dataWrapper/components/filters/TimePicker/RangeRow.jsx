import React, { useContext } from "react";
import { ThemeContext, getComponentTheme } from "../../../../../../../../../ui/useTheme";
import { timePickerTheme } from "./timePicker.theme";

const UNITS = [
    { value: 'minute', label: 'minutes' },
    { value: 'hour', label: 'hours' },
    { value: 'day', label: 'days' },
    { value: 'week', label: 'weeks' },
    { value: 'month', label: 'months' },
    { value: 'year', label: 'years' },
];

const DIRECTIONS = [
    { value: 'past', label: 'Last' },
    { value: 'future', label: 'Next' },
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
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const t = { ...timePickerTheme, ...getComponentTheme(themeFromContext, 'timePicker') };
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
                <div className={t.rowLabel}>Range</div>
                <span className={range ? t.rowSummary : t.rowSummaryAny}>{summarize(range)}</span>
            </div>

            {isCustomRelative ? (
                <div className={t.rowEditor}>
                    <span className={t.rangeDirWrap}>
                        <UI.Select
                            value={range.direction}
                            options={DIRECTIONS}
                            onChange={v => v && updateRelative({ direction: v })}
                        />
                    </span>
                    <span className={t.rangeNumberWrap}>
                        <UI.Input
                            type="number"
                            activeStyle="compact"
                            min={0}
                            aria-label="Count"
                            value={range.count}
                            onChange={e => updateRelative({ count: sanitizeCount(e.target.value) })}
                        />
                    </span>
                    <span className={t.rangeUnitWrap}>
                        <UI.Select
                            value={range.unit}
                            options={UNITS}
                            onChange={v => v && updateRelative({ unit: v })}
                        />
                    </span>
                    <UI.Button activeStyle="iconInline" onClick={clear} aria-label="Clear range" title="Clear range">
                        <UI.Icon icon="XMark" className={t.clearIcon} />
                    </UI.Button>
                </div>
            ) : (
                <div className={t.rowEditor}>
                    <UI.Button activeStyle="small" onClick={setEditing}>
                        <UI.Icon icon="Plus" className={t.customIcon} />
                        Custom relative range
                    </UI.Button>
                </div>
            )}
        </div>
    );
};

export default RangeRow;
