import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";

// target_bar column type — a progress bar with a target marker, plus an optional
// "≥ target" caption. Reusable on any KPI/dashboard. The cell's own `value` is the
// metric; the target + scale come from column attributes (or sibling row fields).
//
// Column attributes:
//   targetValue   : the target number (static). OR
//   targetColumn  : name of a sibling row column holding the target.
//   barMin        : scale min (default 0). For ratio metrics use a range, e.g.
//                   barMin 1.0 / barMax 2.2 so a 1.42 value isn't pinned near zero.
//   barMax        : scale max (default 100, i.e. value is a percentage).
//   barDirection  : 'up' (default, higher is better) | 'down' (lower is better).
//   barUnit       : unit appended in the caption (e.g. "%"); default "".
//   barShowCaption: false to hide the "≥/≤ target" caption (default shows it).
const targetBarDefault = {
    wrapper:    "w-full flex flex-col gap-1.5",
    caption:    "font-mono text-[10.5px] uppercase tracking-[0.16em] text-slate-500",
    captionTarget: "font-proxima normal-case tracking-normal text-[#0f1722] font-medium",
    track:      "relative h-2 rounded-full bg-slate-100 overflow-hidden",
    fill:       "absolute inset-y-0 left-0 rounded-full",
    fillGood:   "bg-emerald-500",
    fillBad:    "bg-rose-400",
    markerLine: "absolute top-0 bottom-0 w-px bg-[#0f1722]",
    markerKnob: "absolute -top-1 size-3 rounded-full bg-white border-2 border-[#0f1722]",
};

const clampPct = (n) => Math.max(0, Math.min(100, n));

export const TargetBarView = ({ value, row, targetValue, targetColumn, barMin = 0, barMax = 100, barDirection = "up", barUnit = "", barShowCaption }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...targetBarDefault, ...getComponentTheme(themeFromContext, "targetBar") };

    const v = parseFloat(value?.value ?? value);
    const rawTarget = targetColumn && row ? (row[targetColumn]?.value ?? row[targetColumn]) : targetValue;
    const target = parseFloat(rawTarget);
    const min = parseFloat(barMin) || 0;
    const max = parseFloat(barMax) || 100;
    const span = (max - min) || 1;
    if (Number.isNaN(v)) return null;

    const pos = (x) => clampPct(((x - min) / span) * 100);
    const fillPct = pos(v);
    const hasTarget = !Number.isNaN(target);
    const markPct = hasTarget ? pos(target) : null;
    const meets = !hasTarget ? true : barDirection === "down" ? v <= target : v >= target;
    const op = barDirection === "down" ? "≤" : "≥";

    return (
        <div className={t.wrapper}>
            {barShowCaption !== false && hasTarget ? (
                <div className={t.caption}>
                    4-yr target <span className={t.captionTarget}>{op} {target}{barUnit}</span>
                </div>
            ) : null}
            <div className={t.track}>
                <div className={`${t.fill} ${meets ? t.fillGood : t.fillBad}`} style={{ width: `${fillPct}%` }} />
                {markPct !== null ? (
                    <>
                        <div className={t.markerLine} style={{ left: `${markPct}%` }} />
                        <div className={t.markerKnob} style={{ left: `calc(${markPct}% - 6px)` }} />
                    </>
                ) : null}
            </div>
        </div>
    );
};

export const TargetBarEdit = (props) => <TargetBarView {...props} />;
