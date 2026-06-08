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

    //   const onCardMouseEnter = useCallback((item) => {
    //     if (!providerCfg || !setActionParam) return;
    //     const value = item?.[providerCfg.args?.column];
    //     if (value !== undefined) setActionParam(providerCfg.paramKey, value);
    // }, [providerCfg, setActionParam]);

    // const onCardMouseLeave = useCallback(() => {
    //     if (!providerCfg || !clearActionParam) return;
    //     clearActionParam(providerCfg.paramKey);
    // }, [providerCfg, clearActionParam]);

    //   const providerCfg = state.display?._functions?.providers?.find(p => p.functionId === 'hover_highlight' && p.enabled);

    // const subCfg = display?._functions?.subscribers?.find(s => s.functionId === 'hover_highlight' && s.enabled);

    // useEffect(() => {
    //     const newDomain = [...new Set(graphData.map(d => d.index))]
    //     if(!display.useCustomXDomain && !isEqual(display.xDomain, newDomain)){
    //         setState(draft => {
    //             draft.display.xDomain = newDomain;
    //         })
    //     }
    // }, [graphData]);

    // const colorPaletteSize = categoryColumn.name ? (new Set(data.map(item => item[categoryColumn.name]))).size : dataColumns.length

    // const colors = useMemo(() => ({
    //     type: "palette",
    //     value: [...getColorRange(colorPaletteSize < 20 ? colorPaletteSize : 20, "div7")]
    // }), [colorPaletteSize])

    // const indexTotals = graphData.reduce((acc, curr) => {
    //     acc[curr.index] = (acc[curr.index] || 0) + (+curr.value || 0);
    //     return acc;
    // },{})
    // const maxIndexValue = Math.max(...Object.values(indexTotals));
    // const stopPoints = [0.75, 0.5, 0.05];
    // const stopValues = stopPoints.map(p => maxIndexValue * p);

    //console.log('graph data', graphData, columns, display)
    return (
        <>
            {
                // isEdit ? <div className={theme.headerWrapper}>
                //     {[indexColumn, ...dataColumns].filter(f => f.name).map((attribute, i) =>
                //         <div key={`controls-${i}`} className={theme.columnControlWrapper}>
                //             <TableHeaderCell
                //                 isEdit={isEdit}
                //                 attribute={attribute}
                //                 columns={columns}
                //                 display={display} controls={controls} setState={setState}
                //                 activeStyle={activeStyle}
                //             />
                //         </div>)}
                // </div> : null
            }
            {
                // display.showScaleFilter ?
                //     <div className={theme.scaleWrapper}>
                //         <div
                //             className={`${theme.scaleItem} ${!display?.upperLimit ? theme.scaleItemActive : theme.scaleItemInActive}`}
                //             onClick={() => setState(draft => {
                //                 draft.display.upperLimit = undefined
                //             })}>
                //             Max
                //         </div>
                //         {
                //             stopValues.map(stopValue => (
                //                 <div
                //                     key={stopValue}
                //                     className={`${theme.scaleItem} ${display?.upperLimit === stopValue ? theme.scaleItemActive : theme.scaleItemInActive}`}
                //                     onClick={() => setState(draft => {
                //                         draft.display.upperLimit = stopValue
                //                     })}>
                //                     {fnumIndex(stopValue, 0)}
                //                 </div>
                //             ))
                //         }
                //     </div> : null
            }
            <GraphComponent
                graphFormat={ mergeChartDefaults(theme?.chartDefaults, display) }
                graphType={ display.graphType }
                viewData={ data }
                columns={ columns }
                theme={ theme }
                actions={ useGetActions(pageState, display) }
                publishHoverData={ publishHoverData }
                hoverProvider={ hoverProvider }
            />
        </>
    )
}
