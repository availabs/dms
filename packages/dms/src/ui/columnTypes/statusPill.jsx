import React from "react";
import { ThemeContext } from "../useTheme";

// status_pill column type — renders a column's value as a UI.Pill in a status
// variant (green/amber/red/neutral) that signals state (e.g. a compliance
// "Meets target" / "Below target" field). Reusable across any dashboard: it reads
// ONLY its own value (rung-3 "look depends on the value") and delegates all styling
// to the shared UI.Pill primitive — which a site theme can re-skin.
//
// Variant resolution, in order:
//   1. an explicit per-column map: attribute.pillColors = { "<value>": "<pill style>" }
//      (any theme.pill style name, e.g. "status_good" | "green" | "status_bad")
//   2. keyword heuristics on the value (meets/above → good, below/miss/fail → bad)
//   3. fallback neutral (status_na)
const KEYWORD_GOOD = /\b(meet|meets|met|pass|passes|above|compliant|on\s*track|ok)\b/i;
const KEYWORD_BAD = /\b(below|miss|misses|missed|fail|fails|not\s*met|under|behind|non[-\s]?compliant)\b/i;

const styleFor = (value, pillColors) => {
    const v = (value ?? "").toString().trim();
    if (!v) return null;
    if (pillColors && pillColors[v]) return pillColors[v];
    if (KEYWORD_BAD.test(v)) return "status_bad";
    if (KEYWORD_GOOD.test(v)) return "status_good";
    return "status_na";
};

export const StatusPillView = ({ value, pillColors }) => {
    const { UI } = React.useContext(ThemeContext) || {};
    const Pill = UI?.Pill;
    const activeStyle = styleFor(value, pillColors);
    if (!Pill || activeStyle === null) return null;
    return <Pill activeStyle={activeStyle} text={value} />;
};

// Edit renders the same pill — there's nothing to edit on a derived status, and the
// transcription/verify loop screenshots edit mode, so a no-op Edit would render blank.
export const StatusPillEdit = (props) => <StatusPillView {...props} />;
