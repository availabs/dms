import React, { useContext } from "react";
import { humanLabel } from "../../../utils/timeFilter";
import { ThemeContext, getComponentTheme } from "../../../../../../../../../ui/useTheme";
import { timePickerTheme } from "./timePicker.theme";

// One active constraint: a Pill 'tag' with the axis icon (a theme key naming a UI.Icon; '' → none) and a remove button.
const ChipPill = ({ icon, text, onRemove, t, UI }) => (
    <UI.Pill
        activeStyle="tag"
        text={
            <>
                {icon ? <UI.Icon icon={icon} className={t.chipIcon} /> : null}
                <span>{text}</span>
                {onRemove && (
                    <UI.Button activeStyle="iconInlineDanger" onClick={onRemove} aria-label={`Remove ${text}`} title="Remove constraint">
                        <UI.Icon icon="XMark" className={t.chipRemoveIcon} />
                    </UI.Button>
                )}
            </>
        }
    />
);

const formatRangeChip = (ranges) => humanLabel({ ranges });
const formatDowChip = (dow) => humanLabel({ dow });
const formatTodChip = (tod) =>
    tod && tod.start && tod.end ? `${tod.start}–${tod.end}` : '';

export const Chips = ({ value, onChange }) => {
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const t = { ...timePickerTheme, ...getComponentTheme(themeFromContext, 'timePicker') };
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
        if (text) chips.push(<ChipPill key="r" icon={t.rangeChipIcon} text={text} onRemove={remove('ranges')} t={t} UI={UI} />);
    }
    if (Array.isArray(value.dow) && value.dow.length) {
        const text = formatDowChip(value.dow);
        if (text) chips.push(<ChipPill key="d" icon={t.dowChipIcon} text={text} onRemove={remove('dow')} t={t} UI={UI} />);
    }
    if (value.timeOfDay && value.timeOfDay.start && value.timeOfDay.end) {
        const text = formatTodChip(value.timeOfDay);
        if (text) chips.push(<ChipPill key="t" icon={t.todChipIcon} text={text} onRemove={remove('timeOfDay')} t={t} UI={UI} />);
    }

    if (!chips.length) return null;
    return (
        <>
            {t.chipsLabel ? <div className={t.chipsLabel}>Active</div> : null}
            <div className={t.chipWrapper}>{chips}</div>
        </>
    );
};

export default Chips;
