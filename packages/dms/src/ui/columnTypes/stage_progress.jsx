import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";
import { stageProgressTheme } from "./stage_progress.theme";

// stage_progress column type — a compact N-node pipeline progress bar. Reads the current stage
// (the cell value = a stage NAME) and renders one node per stage: done (green check), current
// (filled in the stage color), upcoming (hollow), joined by connector lines that fill as it
// advances. Stages + per-stage colors are configurable per-column (attribute.stages / stageHex);
// a "step N of M" caption shows unless showLabel:false. Reads ONLY its own value.
// A theme style with `variant: 'meter'` (theme.stageProgress, picked by the column's activeStyle)
// renders a compact segment meter from theme classes instead; stage_progress.theme.js lists its keys.
const DEFAULT_STAGES = ["Proposed", "Design", "Implemented", "QA", "Dev Acceptance", "Client Acceptance"];
const DEFAULT_HEX = {
    "Proposed": "#a1a1aa", "Design": "#8b5cf6", "Implemented": "#f59e0b",
    "QA": "#38bdf8", "Dev Acceptance": "#14b8a6", "Client Acceptance": "#10b981",
};

export const StageProgressView = ({ value, stages, stageHex, showLabel, activeStyle }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...stageProgressTheme.styles[0], ...getComponentTheme(themeFromContext, "stageProgress", activeStyle) };
    const STAGES = Array.isArray(stages) && stages.length ? stages : DEFAULT_STAGES;
    const HEX = stageHex || DEFAULT_HEX;
    const v = value && typeof value === "object" ? (value.value ?? value.originalValue ?? "") : (value ?? "");
    const cur = STAGES.indexOf(v);
    if (t.variant === "meter") {
        return (
            <span className={t.meter}>
                <span className={t.segments} aria-hidden="true">
                    {STAGES.map((s, i) => (
                        <i key={i} title={s} className={[
                            t.segment,
                            i <= cur ? (t.segmentColors?.[s] || t.segmentDone) : t.segmentUpcoming,
                            i === cur && t.segmentCurrent,
                        ].filter(Boolean).join(" ")} />
                    ))}
                </span>
                {showLabel !== false && t.label && v ? <span className={t.label}>{v}</span> : null}
                {showLabel !== false && t.count && cur >= 0 ? <span className={t.count}>{`${cur + 1} of ${STAGES.length}`}</span> : null}
            </span>
        );
    }
    const curHex = HEX[v] || "#1F3F8F";
    const dot = { width: 20, height: 20, borderRadius: "9999px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, flexShrink: 0, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" };
    const kids = [];
    STAGES.forEach((s, i) => {
        const done = i < cur, isCur = i === cur;
        kids.push(
            done
                ? <span key={i} title={s} style={{ ...dot, background: "#10b981", color: "#fff" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l4.5 4.5L19 7" /></svg></span>
                : isCur
                    ? <span key={i} title={s} style={{ ...dot, background: curHex, color: "#fff", boxShadow: "0 0 0 4px rgba(15,23,42,0.06)" }}>{i + 1}</span>
                    : <span key={i} title={s} style={{ ...dot, background: "#fff", border: "1px solid #cbd5e1", color: "#94a3b8" }}>{i + 1}</span>
        );
        if (i < STAGES.length - 1) kids.push(<span key={"l" + i} style={{ flex: 1, height: 2, minWidth: 8, background: i < cur ? "#34d399" : "#e2e8f0" }} />);
    });
    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", width: "100%" }}>{kids}</div>
            {showLabel !== false && cur >= 0
                ? <div style={{ marginTop: 6, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>{`step ${cur + 1} of ${STAGES.length}`}</div>
                : null}
        </div>
    );
};

// Edit renders the same (read-only) bar — stage_progress is derived from the stage value.
export const StageProgressEdit = (props) => <StageProgressView {...props} />;
