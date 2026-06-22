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

  const paramKeys = enabledSubscribers.reduce((a, c) => {
    a.add(c.paramKey);
    return a;
  }, new Set());

  return pageState.filters
    .filter(f =>
      f.type === "action" ? paramKeys.has(f.searchKey) : false
    ).reduce((a, c) => {
      const subscribers = enabledSubscribers.filter(s => s.paramKey === c.searchKey);
      for (const sub of subscribers) {
        a.push({
          action: sub.functionId,
          column: sub.args?.column,
          value: [...c.values]
        })
      }
      return a;
    }, []);
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
        columns, data, display
    } = state;
// console.log("ui.components.graph_new.index::display", display);

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
        clickProvider={ clickProvider }/>
  )
}
