import React from "react";
import { useTimePickerTheme } from "./useTimePickerTheme";

const PRESETS = [
    { id: 'today', label: 'Today',
      value: () => ({ ranges: [{ kind: 'named', name: 'today' }] }) },
    { id: 'last_hour', label: 'Last hour',
      value: () => ({ ranges: [{ kind: 'relative', unit: 'hour', count: 1, direction: 'past' }] }) },
    { id: 'last_24h', label: 'Last 24 hours',
      value: () => ({ ranges: [{ kind: 'relative', unit: 'hour', count: 24, direction: 'past' }] }) },
    { id: 'last_7d', label: 'Last 7 days',
      value: () => ({ ranges: [{ kind: 'relative', unit: 'day', count: 7, direction: 'past' }] }) },
    { id: 'last_30d', label: 'Last 30 days',
      value: () => ({ ranges: [{ kind: 'relative', unit: 'day', count: 30, direction: 'past' }] }) },
    { id: 'this_month', label: 'This month',
      value: () => ({ ranges: [{ kind: 'current_period', period: 'month' }] }) },
];

const sameRange = (a, b) => {
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'relative') return a.unit === b.unit && a.count === b.count && a.direction === b.direction;
    if (a.kind === 'current_period') return a.period === b.period;
    if (a.kind === 'named') return a.name === b.name;
    return false;
};

export const PresetBar = ({ value, onChange }) => {
    const t = useTimePickerTheme();
    const activeId = (() => {
        if (!value || !Array.isArray(value.ranges) || value.ranges.length !== 1) return null;
        if ((value.dow && value.dow.length) || value.timeOfDay) return null;
        const r = value.ranges[0];
        for (const p of PRESETS) {
            const expanded = p.value();
            if (sameRange(expanded.ranges[0], r)) return p.id;
        }
        return null;
    })();

    const apply = (preset) => {
        const expanded = preset.value();
        const next = { ...(value || {}), ...expanded };
        delete next.dow;
        delete next.timeOfDay;
        onChange(next);
    };

    return (
        <div className={t.presetWrapper}>
            {PRESETS.map(p => {
                const active = p.id === activeId;
                return (
                    <button
                        key={p.id}
                        type="button"
                        className={`${t.presetButton} ${active ? t.presetButtonActive : t.presetButtonIdle}`}
                        onClick={() => apply(p)}
                    >
                        {p.label}
                    </button>
                );
            })}
        </div>
    );
};

export default PresetBar;
