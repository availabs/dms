import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";
import { statValueTheme } from "./statValue.theme";

// stat_value column type — renders a KPI figure with an optional inline prefix
// and a smaller, muted unit suffix: "$6.2 billion", "310.9 M veh-hrs", "80 %".
// The design-system stat pattern (big number + small unit on the same baseline)
// can't be expressed by a single valueFontStyle (one token = one size) or a
// formatFn (strings can't change size mid-cell), so this is the rung-3 column
// type for it. Column attributes:
//   valueFontStyle — textSettings token for the figure (e.g. "statXL"); the
//                    generic value renderer's same knob, resolved here.
//   prefix         — rendered before the figure AT figure size (e.g. "$").
//   unit           — rendered after the figure in the unit style (e.g. "M veh-hrs").
//   unitFontStyle  — textSettings token for the unit; defaults to the theme's
//                    statValue.unit classes (muted, ~40% size).
export const StatValueView = ({ value, prefix, unit, valueFontStyle, unitFontStyle }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...statValueTheme, ...getComponentTheme(themeFromContext, "statValue") };
    const textStyles = getComponentTheme(themeFromContext, "textSettings") || {};
    if (value === null || value === undefined || value === "") return null;
    const figureCls = (valueFontStyle && textStyles[valueFontStyle]) || t.figure;
    const unitCls = (unitFontStyle && textStyles[unitFontStyle]) || t.unit;
    return (
        <span className={t.wrapper}>
            <span className={figureCls}>{prefix}{value}</span>
            {unit ? <span className={unitCls}>{unit}</span> : null}
        </span>
    );
};

// Derived figures aren't editable; edit mode renders the same view so the
// transcription/verify loop (which screenshots edit mode) doesn't go blank.
export const StatValueEdit = (props) => <StatValueView {...props} />;
