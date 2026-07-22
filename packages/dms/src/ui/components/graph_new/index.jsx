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
    acts.push({
      action: sub.functionId,
      column: sub.args?.column,
      value
    });
  }
  return acts;
}

export default function Graph (props) {

    const {
        isEdit, state, activeStyle, pageContext
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
    return display?._functions?.providers.find(p => p.functionId === 'hover_publish' && p.enabled);
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
    return display?._functions?.providers.find(p => p.functionId === 'click_publish' && p.enabled);
  }, [display]);

  const publishClickData = React.useCallback(action => {
    if (!clickProvider || !action) return;
    setActionParam(clickProvider.paramKey, action.value);
  }, [setActionParam, clickProvider]);

  const keyedColumns = React.useMemo(() => {
    return columns.map(c => ({ ...c, key: c.normalName || c.name }));
  }, [columns]);

  return (
    <GraphComponent
        graphFormat={ mergeChartDefaults(theme?.chartDefaults, display) }
        graphType={ display.graphType }
        viewData={ data }
        columns={ keyedColumns }
        theme={ theme }
        actions={ useGetActions(pageState, display) }
        publishHoverData={ publishHoverData }
        hoverProvider={ hoverProvider }
        publishClickData={ publishClickData }
        clickProvider={ clickProvider }
        colorsByKey={ colorsByKey }/>
  )
}
