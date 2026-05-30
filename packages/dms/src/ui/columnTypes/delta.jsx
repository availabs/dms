import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";

// delta column type — renders a signed change as an arrow + sign + value, colored by
// whether the change is "good", with an optional muted comparison suffix
// ("vs 2024"). Reusable on any KPI/dashboard. Reads its own `value` (the delta) and,
// optionally, a year field off the row to build the comparison label.
//
// Column attributes:
//   deltaGoodDirection : 'up' (default) | 'down'  — which sign is good (green).
//   deltaYearField     : name of a row column holding the current period's year;
//                        the suffix becomes "vs <year-1>". Falls back to deltaSuffix.
//   deltaSuffix        : static muted suffix text (used when deltaYearField is unset).
const deltaDefault = {
    wrapper: "inline-flex items-center gap-1 font-mono text-[12px] tabular-nums font-medium",
    good:    "text-emerald-700",
    bad:     "text-rose-700",
    neutral: "text-slate-500",
    suffix:  "text-slate-400 font-normal normal-case",
};

export const DeltaView = ({ value, row, deltaGoodDirection = "up", deltaYearField, deltaSuffix }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...deltaDefault, ...getComponentTheme(themeFromContext, "delta") };

    const n = parseFloat(value);
    if (value === null || value === undefined || value === "" || Number.isNaN(n)) return null;

    const arrow = n > 0 ? "↑" : n < 0 ? "↓" : "→";
    const sign = n > 0 ? "+" : ""; // negatives already carry "-"
    const isGood = deltaGoodDirection === "down" ? n < 0 : n > 0;
    const toneClass = n === 0 ? t.neutral : isGood ? t.good : t.bad;

    let suffix = "";
    if (deltaYearField && row && row[deltaYearField] != null) {
        const y = parseInt(row[deltaYearField]?.value ?? row[deltaYearField], 10);
        if (!Number.isNaN(y)) suffix = `vs ${y - 1}`;
    } else if (deltaSuffix) {
        suffix = deltaSuffix;
    }

    return (
        <span className={`${t.wrapper} ${toneClass}`}>
            {arrow} {sign}{n}
            {suffix ? <span className={t.suffix}>{suffix}</span> : null}
        </span>
    );
};

export const DeltaEdit = (props) => <DeltaView {...props} />;
