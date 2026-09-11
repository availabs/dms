import React, {useEffect, useMemo,useContext} from "react";
import {isEqual} from "lodash-es";
import { groups as d3groups, range as d3range } from "d3-array"

import {GraphComponent} from "./GraphComponent";
import { ThemeContext, getComponentTheme } from '../../useTheme';
// import {getColorRange} from "./colorRange";
// import { graphTheme } from "./theme";
//import TableHeaderCell from "../table/components/TableHeaderCell";
import {strictNaN} from "./utils";


import { getColorRange } from "./colorSchemeUnifier"
import { getEffectiveComparisonVariants } from "../../../patterns/page/components/sections/components/dataWrapper/buildUdaConfig";

// Merge the theme's brand chart defaults UNDER the section's own display settings, so a
// section with a sparse `display` inherits brand visuals (colors/margins/axes) while any
// explicit per-section setting still wins. One level of nesting (margin/xAxis/yAxis) is
// deep-merged; everything else is a shallow override. BC: a section whose `display`
// already carries these keys is unchanged.
const mergeChartDefaults = (defaults = {}, display = {}) => {
    const out = { ...defaults, ...display };
    for (const k of ["margin", "xAxis", "yAxis", "legend", "title", "colors"]) {
        if (defaults[k] && typeof defaults[k] === "object") {
            out[k] = { ...defaults[k], ...(display[k] || {}) };
        }
    }
    return out;
};

const useGetActions = (pageState, display) => {
  // const providers = (display?._functions?.providers || []).filter(p => p.enabled);
  const enabledSubscribers = (display?._functions?.subscribers || []).filter(s => s.enabled);

// console.log("graph_new.index::useGetActions::pageState", pageState);
// console.log("graph_new.index::useGetActions::providers", providers);
// console.log("graph_new.index::useGetActions::subscribers", subscribers);

  const acts = [];
  for (const sub of enabledSubscribers) {
    const matches = pageState.filters.filter(f => f.searchKey === sub.paramKey);
    if (!matches.length) continue;
    // hover_highlight is a transient interaction → react ONLY to an action-type
    // filter (the live hover param set by hover_publish). Other subscribers — e.g.
    // select_highlight, which marks the active selection — must also reflect the
    // current page-var on first load, so they fall back to any matching filter,
    // still preferring an action-type one (a click) when present. This keeps
    // hover_highlight byte-for-byte BC while letting the selection paint pre-click.
    const actionMatch = matches.find(f => f.type === "action");
    const src = sub.functionId === "hover_highlight" ? actionMatch : (actionMatch || matches[0]);
    if (!src) continue;
    // Action filters carry `values` as an array; page-var (searchParam) filters carry
    // it as a bare string (e.g. "2026-06-07"). Normalize so a single value isn't
    // spread into characters.
    const raw = src.values;
    const value = Array.isArray(raw) ? [...raw] : (raw == null || raw === "" ? [] : [raw]);
    // `args` rides along whole so overlay subscribers (grid_cell_bands / grid_point)
    // can carry styling (stroke, r, …) — additive, existing consumers read column/value.
    acts.push({
      action: sub.functionId,
      column: sub.args?.column,
      value,
      args: sub.args
    });
  }
  return acts;
}

export default function Graph (props) {

    const {
        isEdit, state, setState, activeStyle, pageContext
    } = props;

    const {
        pageState, setActionParam, clearActionParam
    } = pageContext;
// console.log("ui.components.graph_new.index::pageContext", pageContext);

    const {
        columns, data, display, comparisonSeries
    } = state;
// console.log("ui.components.graph_new.index::display", display);

  // Per-key explicit color (e.g. a ReportRouteList route's identity color,
  // published as a comparison-series variant's `color`) — resolved from the
  // SAME effective variant list buildUdaConfig uses for the query fan-out, so
  // this graph's colorsByKey always agrees with whichever variants it's
  // actually querying. `undefined` (not `{}`) when no variant carries a
  // color, so every downstream colorFunc/Legend falls back to today's
  // positional cycling exactly as before (BC for every non-comparison-series
  // graph and every comparison-series graph whose routes have no color yet).
  const colorsByKey = React.useMemo(() => {
    const variants = getEffectiveComparisonVariants(comparisonSeries);
    const map = {};
    for (const v of variants || []) {
      if (v?.label && v?.color) map[v.label] = v.color;
    }
    return Object.keys(map).length ? map : undefined;
  }, [comparisonSeries]);

  const { theme: contextTheme } = React.useContext(ThemeContext) || { theme: { avlGraph: {} } };
  const theme = getComponentTheme(contextTheme, 'avlGraph', activeStyle);

  const hoverProvider = React.useMemo(() => {
    return display?._functions?.providers?.find(p => p.functionId === 'hover_publish' && p.enabled);
  }, [display]);

  const publishHoverData = React.useCallback(action => {
    if (!hoverProvider) return;
    if (!action) {
      clearActionParam(hoverProvider.paramKey);
    }
    else {
      setActionParam(hoverProvider.paramKey, action.value);
    }
  }, [setActionParam, clearActionParam, hoverProvider]);

  // click_publish: a cell click writes its value to the provider's page var (e.g. click a day on a
  // month strip → set `date`). Mirrors hover_publish but is sticky (no clear-on-leave).
  const clickProvider = React.useMemo(() => {
    return display?._functions?.providers?.find(p => p.functionId === 'click_publish' && p.enabled);
  }, [display]);

  const publishClickData = React.useCallback(action => {
    if (!clickProvider || !action) return;
    setActionParam(clickProvider.paramKey, action.value);
  }, [setActionParam, clickProvider]);

  const keyedColumns = React.useMemo(() => {
    return columns.map(c => ({ ...c, key: c.normalName || c.name }));
  }, [columns]);

  // Scale Filter (BarGraph only): quick-pick buttons ("Max"/"75%"/"50%"/"5%") that
  // clamp the value axis to a fraction of the chart's peak (stacked) total, so a
  // chart dominated by one outlier bar can be cropped to reveal detail in the rest.
  // The buttons just set yAxis.domainMax — the actual clamp lives in
  // avl-graph/BarGraph.jsx, which already reads domainMin/domainMax off the value
  // axis config.
  const setYAxisDomainMax = React.useCallback(value => {
    setState(draft => {
      if (!draft.display) draft.display = {};
      if (!draft.display.yAxis) draft.display.yAxis = {};
      draft.display.yAxis.domainMax = value;
    });
  }, [setState]);

  // A meta-lookup column (meta_lookup/geoid-variable, e.g. disaster_number ->
  // declaration_title) resolves server-side into { value, originalValue } so
  // Card/Spreadsheet cells can show the display label while keeping the raw
  // key for editing/filtering (see getData.js's cleanValue). The chart
  // components read row fields directly as axis/categorize/color keys and as
  // aggregation inputs — they have no reason to know about that shape, so
  // unwrap every field to its display value once, here, rather than teaching
  // each chart type (Bar/Line/Grid/Pie/Sunburst/Treemap) to do it individually.
  const resolveDisplayValue = (v) =>
    (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'originalValue'))
      ? (v.value ?? v.originalValue)
      : v;

  const viewData = React.useMemo(() => {
    return (data || []).map(row => {
      const out = {};
      for (const key of Object.keys(row)) out[key] = resolveDisplayValue(row[key]);
      return out;
    });
  }, [data]);

  // Live-resolve a difference graph's caption against whichever real route(s) it's bound to
  // (dynamic-reports-authoring-gaps.md — "Static graph text vs. live route resolution").
  // `contextTheme.resolveReportDisplayText` (the ROOT theme, not the `avlGraph`-scoped `theme`
  // above) only exists on sites/themes that define it (transportny); everywhere else this is a
  // no-op and `resolvedDescription === display.description` unchanged. `_autoDiffCaption` is set
  // by report_build.mjs only for a difference graph with no author-supplied `caption` — see that
  // function's own doc comment for why an auto caption rebuilds the whole phrase live instead of
  // token-substituting stored text (there IS no stored text for that case).
  const resolvedDescription = contextTheme?.resolveReportDisplayText
    ? contextTheme.resolveReportDisplayText(display.description, {
        routeIds: display._measurePick?.routeIds,
        invert: display?.comparisonSeries?.combine?.invert,
        isAutoDiffCaption: Boolean(display._autoDiffCaption),
        pageState,
      })
    : display.description;

  // The legend's automatic UNIT — distinct from its author-set `title`, and the distinction is
  // load-bearing.
  //
  // A LINEAR legend is a key to a colour RAMP: its numbers are magnitudes, and "mph" above them
  // says what they are measured in. A CATEGORICAL legend is a key to IDENTITY — which line is
  // which route — and a unit over it is nonsense, which is exactly what shipping it everywhere
  // produced: "mph" captioning a speed line graph's series list. So the unit is passed as its own
  // `legend.unit` and only the linear legends read it, while `legend.title` stays author-owned
  // and works on every legend type.
  //
  // The resolver is OPTIONAL and site-supplied. The unit of a measure is site vocabulary and this
  // library must not learn it: the obvious shortcut — reading `display._measurePick.measure` here
  // — is deliberately rejected, since that field is written and read only by the npmrds report
  // tooling. The whole `display` is handed over and the hook owns the shape it reads.
  //
  // `typeof === "function"` rather than a truthiness check: themes are partly DB-stored and
  // hand-edited, so a stale string under this key is a realistic accident, and calling it would
  // throw during render and take the page down for a cosmetic caption.
  //
  // Named for the generic capability on purpose. `resolveReportDisplayText` just above is the
  // precedent for the MECHANISM and emphatically not for the NAME — "report" is npmrds vocabulary
  // and does not belong in a shared hook name. Renaming it is out of scope; don't copy it.
  const resolvedLegendUnit = typeof contextTheme?.avlGraph?.resolveLegendUnit === "function"
    ? contextTheme.avlGraph.resolveLegendUnit(display)
    : undefined;

  const displayForGraph = React.useMemo(() => {
    let d = display;
    if (resolvedDescription !== display.description) d = { ...d, description: resolvedDescription };
    if (resolvedLegendUnit && !d?.legend?.unit) {
      d = { ...d, legend: { ...(d.legend || {}), unit: resolvedLegendUnit } };
    }
    return d;
  }, [display, resolvedDescription, resolvedLegendUnit]);

  return (
    <GraphComponent
        graphFormat={ mergeChartDefaults(theme?.chartDefaults, displayForGraph) }
        graphType={ display.graphType }
        viewData={ viewData }
        columns={ keyedColumns }
        theme={ theme }
        actions={ useGetActions(pageState, display) }
        publishHoverData={ publishHoverData }
        hoverProvider={ hoverProvider }
        publishClickData={ publishClickData }
        clickProvider={ clickProvider }
        colorsByKey={ colorsByKey }
        showScaleFilter={ display.showScaleFilter }
        onSetDomainMax={ setYAxisDomainMax }/>
  )
}
