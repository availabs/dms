import React from "react";
import { humanLabel } from "../../../utils/timeFilter";
import { useTimePickerTheme } from "./useTimePickerTheme";

const ChipPill = ({ icon, text, onRemove, t }) => (
    <span className={t.chip}>
        <span className={t.chipIcon}>{icon}</span>
        <span>{text}</span>
        {onRemove && (
            <button
                type="button"
                className={t.chipRemoveButton}
                onClick={onRemove}
                aria-label="Remove constraint"
            >
                ✕
            </button>
        )}
    </span>
);

const formatRangeChip = (ranges) => humanLabel({ ranges });
const formatDowChip = (dow) => humanLabel({ dow });
const formatTodChip = (tod) =>
    tod && tod.start && tod.end ? `${tod.start}–${tod.end}` : '';

export const Chips = ({ value, onChange }) => {
    const t = useTimePickerTheme();
    if (!value || typeof value !== 'object') return null;

    const remove = (axis) => () => {
        const v = { ...value };
        if (axis === 'ranges') delete v.ranges;
        else if (axis === 'dow') delete v.dow;
        else if (axis === 'timeOfDay') delete v.timeOfDay;
        onChange(v);
    };

    const chips = [];

    if (Array.isArray(value.ranges) && value.ranges.length) {
        const text = formatRangeChip(value.ranges);
        if (text) chips.push(<ChipPill key="r" icon="⏱" text={text} onRemove={remove('ranges')} t={t} />);
    }
    if (Array.isArray(value.dow) && value.dow.length) {
        const text = formatDowChip(value.dow);
        if (text) chips.push(<ChipPill key="d" icon="📅" text={text} onRemove={remove('dow')} t={t} />);
    }
    if (value.timeOfDay && value.timeOfDay.start && value.timeOfDay.end) {
        const text = formatTodChip(value.timeOfDay);
        if (text) chips.push(<ChipPill key="t" icon="🕐" text={text} onRemove={remove('timeOfDay')} t={t} />);
    }

    if (!chips.length) return null;
    return <div className={t.chipWrapper}>{chips}</div>;
};

export default Chips;
