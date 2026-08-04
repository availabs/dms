// Legacy Graph -> graph_new (AVL Graph) migration.
//
// The legacy Graph (ComponentRegistry/graph/config.jsx) exposed column roles as
// three independent booleans (xAxis/yAxis/categorize) and used an older display
// shape (margins.{marginTop,...}, yAxis.tickFormat, title.position). graph_new
// uses a single `target` field per column, display.margin.{top,...}, and
// display.yAxis.format (see ui/components/graph_new/utils.js's ValueFormats).
//
// ComponentRegistry/index.jsx now resolves both the "Graph" and "AVL Graph"
// element-types to graph_new, so an old section renders through this component
// immediately — this module does the one-time, idempotent reshape of its
// element-data so the new column/display controls and renderer understand it.
// Mirrors ui/components/Card.migrate.js's shape: guarded on new-shape keys
// already present (no-op), pure function, no React.

const SORT_MAP = { 'asc nulls last': 'asc', 'desc nulls last': 'desc' };

// Old formatFn / yAxis.tickFormat value -> new ValueFormats value (best-effort).
// 'Integer' never matched anything in the old formatFunctions map either (see
// dataWrapper/utils/utils.jsx), so mapping it to 'integer' is a strict
// improvement, not a behavior regression.
const FORMAT_MAP = {
    '': undefined,
    ' ': undefined,
    'Integer': 'integer',
    'comma': 'fnum',
    'abbreviate': 'fnum',
};

export function migrateGraphColumns(columns) {
    const hasNew = (columns || []).some(c => c.target !== undefined);
    if (hasNew) return columns;
    const hasLegacy = (columns || []).some(c => c.xAxis || c.yAxis || c.categorize);
    if (!hasLegacy) return columns;

    return (columns || []).map(c => ({
        ...c,
        target: c.xAxis ? 'xAxis' : c.yAxis ? 'yAxis' : c.categorize ? 'categorize' : undefined,
        // Old xAxis/categorize toggle onChange handlers already kept `group` in
        // sync with these booleans (graph/config.jsx) — recompute rather than
        // trust the persisted value, in case it ever drifted.
        group: !!(c.xAxis || c.categorize),
        sort: SORT_MAP[c.sort],
        // Consolidated onto display.{x,y}Axis.format below — no per-column
        // format control in the new column editor.
        formatFn: undefined,
        xAxis: undefined,
        yAxis: undefined,
        categorize: undefined,
    }));
}

export function migrateGraphDisplay(display, columns) {
    if (!display) return display;
    const hasNew = display.margin !== undefined;
    if (hasNew) return display;
    const hasLegacy = display.margins !== undefined || display.yAxis?.tickFormat !== undefined;
    if (!hasLegacy) return display;

    const out = { ...display };

    if (display.margins) {
        out.margin = {
            top: display.margins.marginTop,
            right: display.margins.marginRight,
            bottom: display.margins.marginBottom,
            left: display.margins.marginLeft,
        };
        delete out.margins;
    }

    if (display.yAxis?.tickFormat !== undefined) {
        out.yAxis = { ...display.yAxis, format: FORMAT_MAP[display.yAxis.tickFormat], tickFormat: undefined };
    }

    if (display.title?.position) {
        out.title = { ...display.title, justify: `justify-${display.title.position}`, position: undefined };
    }

    // Collapse per-column formatFn (old) onto the single yAxis.format (new) when
    // the axis format wasn't already set above and at least one yAxis column
    // carried a formatFn — first non-empty value wins; differing values across
    // multiple yAxis columns are lossy by design (new has one format per axis).
    const yAxisFormatFn = (columns || []).find(c => c.yAxis && c.formatFn)?.formatFn;
    if (yAxisFormatFn !== undefined && out.yAxis?.format === undefined) {
        out.yAxis = { ...(out.yAxis || {}), format: FORMAT_MAP[yAxisFormatFn] };
    }

    // Old "Scale Filter" (Max/75%/50%/5% quick-picks) stored its currently-applied
    // clamp as a flat display.upperLimit number; new stores the equivalent as
    // yAxis.domainMax (see components/BarGraph.jsx's Scale Filter wiring). Carry
    // an already-applied clamp over so a migrated section keeps showing what the
    // author last picked, instead of silently reverting to the full, unclamped
    // scale. showScaleFilter itself needs no transform — nothing deletes it.
    if (display.upperLimit !== undefined && out.yAxis?.domainMax === undefined) {
        out.yAxis = { ...(out.yAxis || {}), domainMax: display.upperLimit };
    }

    // legend.show carries over unchanged, but old legend was just {show, label}
    // — the new renderer additionally requires legend.position to be one of
    // 'left'/'right'/'top'/'bottom' or it silently renders nothing at all
    // regardless of `show` (see e.g. BarGraph.jsx's `legend.position !== "left"`
    // / `!== "right"` guards). Default migrated legends to 'bottom'.
    if (display.legend && display.legend.position === undefined) {
        out.legend = { ...display.legend, position: 'bottom' };
    }

    // graphType, colors, height/width, legend.label, tooltip.show,
    // hideIfNull, useCustomXDomain/xDomain, showScaleFilter, fetchMode, pageSize:
    // identical shape both sides — passed through unchanged by the initial spread
    // above (showScaleFilter's *applied value* is handled separately above, since
    // it lives under a different key — display.upperLimit — on this side).
    // padding, darkMode, isLog, tooltip.fontSize: dropped, no equivalent in the
    // new renderer.
    // graphType is passed through UNCHANGED even for values with no new
    // equivalent (e.g. legacy 'ScatterPlot') — such a section renders the new
    // component's "Unknown Graph Type" state until an author picks a real type,
    // rather than silently substituting a different chart.

    return out;
}

export function migrateGraphState(state) {
    if (!state) return state;
    return {
        ...state,
        columns: migrateGraphColumns(state.columns),
        display: migrateGraphDisplay(state.display, state.columns),
    };
}

export default migrateGraphState;
