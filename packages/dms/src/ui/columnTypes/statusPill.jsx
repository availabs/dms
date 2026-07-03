import React from "react";
import { ThemeContext } from "../useTheme";
import { MultiSelectEdit } from "../components/MultiSelect";

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

// Edit renders a single-select dropdown so an `allowEditInView` status_pill column is
// EDITABLE while keeping its pill look in view mode (view = pill, click = dropdown, pick =
// new pill). Dropdown options come from an explicit `options` array if present, else are
// derived from the `pillColors` keys — so authors get an editable pill just by adding
// `allowEditInView: true` to a pill column, no separate options list to maintain. The
// reused MultiSelectEdit (singleSelectOnly) persists a clean scalar string, not an array.
export const StatusPillEdit = (props) => {
    const { options, pillColors } = props;
    const opts = (options && options.length)
        ? options
        : Object.keys(pillColors || {}).map((v) => ({ label: v, value: v }));
    // MultiSelect renders a React element supplied via `meta[label]` as-is, in BOTH the
    // selected-value trigger and the menu rows — so map each option to its Pill and the
    // editor keeps the pill look while editing (pill trigger, pill options), not plain text.
    const meta = {};
    for (const o of opts) {
        const v = o.value ?? o;
        meta[o.label ?? v] = <StatusPillView value={v} pillColors={pillColors} />;
    }
    return <MultiSelectEdit {...props} options={opts} meta={meta} singleSelectOnly={true} />;
};
