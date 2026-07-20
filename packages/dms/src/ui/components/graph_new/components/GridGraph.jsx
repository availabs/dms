import React from "react"

import { GridGraph, Legend } from "./avl-graph"

import { groups as d3groups } from "d3-array"

import { strictNaN } from "../utils"
import { getAggFunc, buildValueColorScale, formatMinutesAuto } from "./utils"
import { getColorRange } from "../colorSchemeUnifier"
  
const TopOrBottomRegex = /^top|bottom/;
const LeftOrRightRegex = /^(left|right)$/;

// stable empty overlay list — keeps the avl GridGraph's pointsMap/boundsMap memos inert
const EMPTY_OVERLAYS = [];

const GridGraphWrapper = props => {

// console.log("GridGraphWrapper::props", props);

// console.log("GridGraphWrapper::viewData", props.viewData);
// console.log("GridGraphWrapper::columns", props.columns);
// console.log("GridGraphWrapper::colors", props.colors);

  const colors = React.useMemo(() => {
    let colors = [];

    if (props.colors?.type === "palette") {
      colors = props.colors?.value || [];
    }
    else if (props.colors?.type === "scheme") {
      colors = getColorRange(props.colors.scheme, 3);
    }
    return props.colors?.reverse ? [...colors].reverse() : colors;
  }, [props.colors]);

  const [xColumn, yColumn, colorColumns, widthColumn, heightColumn] = React.useMemo(() => {
    return [
      props.columns.find(c => c.target === "xAxis"),
      props.columns.find(c => c.target === "yAxis"),
      props.columns.filter(c => c.target === "color"),
      // optional: a column whose (per-xAxis-key) value sizes the grid COLUMN width
      // (e.g. TMC length on a space-time grid) — fed to the avl GridGraph's keyWidths.
      props.columns.find(c => c.target === "width" || c.target === "size"),
      // optional: a column whose (per-yAxis-row) value sizes the grid ROW height
      // (e.g. TMC miles on a space-time grid) — set as each row's `height` (avl GridGraph hScale).
      props.columns.find(c => c.target === "height")
    ]
  }, [props.columns]);

  const dataFromProps = React.useMemo(() => {

    if (!xColumn || !colorColumns.length) return {};

    const data = [];
    const keySet = new Set();

    let min = Infinity;
    let max = -Infinity;

    if (yColumn) {

      const dataGroups = d3groups(props.viewData,
                                    d => d[yColumn.key],
                                    d => d[xColumn.key]
                                  );

      for (const [index, iGroup] of dataGroups) {

        if (index === undefined) continue;

        const grid = { index };

        // per-row height (e.g. ∝ TMC miles): constant per yAxis row, read off any row in the group →
        // becomes the row's `height` which the avl GridGraph scales via hScale. Uniform (1) if absent.
        if (heightColumn) {
          const sample = iGroup?.[0]?.[1]?.[0];
          grid.height = Math.max(0.0001, +(sample?.[heightColumn.key]) || 1);
        }

        for (const [key, kGroup] of iGroup) {

          let value = 0;

          for (const cc of colorColumns) {
            const ccn = cc.key;
            const aggFunc = getAggFunc(cc);
            const v = aggFunc(kGroup, d => d[ccn]);
            if (v) {
                value += v;
            }
          }

          if (value) {
            keySet.add(key);
            grid[key] = value;

            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        }

        data.push(grid);
      }

    }
    else {
      const keyGroups = d3groups((props?.viewData || []), d => d[xColumn.key]);

      for (const cc of colorColumns) {
        const aggFunc = getAggFunc(cc);
        const ccn = cc.key;
        const grid = { index: ccn };
        for (const [key, kGroup] of keyGroups) {
          const v = aggFunc(kGroup, d => d[ccn]);
          if (v) {
            keySet.add(key);
            grid[key] = v;

            min = Math.min(min, v);
            max = Math.max(max, v);
          }
        }
        data.push(grid);
      }
    }


    // byValueSymmetric centers the scale on zero (±max(|min|, |max|)) — see
    // the matching option in BarGraph.jsx; used by difference/diverging grids.
    const symMax = Math.max(Math.abs(min), Math.abs(max));
    const colorFunc = props.colors?.byValueSymmetric
      ? buildValueColorScale(-symMax, symMax, colors)
      : buildValueColorScale(min, max, colors);

    const keys = [...keySet];

    // per-column widths (e.g. ∝ TMC length) → avl GridGraph keyWidths; uniform if no width column
    const keyWidths = {};
    if (widthColumn) {
      for (const d of props.viewData) {
        const k = d[xColumn.key];
        if (k !== undefined && keySet.has(k) && keyWidths[k] === undefined) {
          keyWidths[k] = Math.max(0.0001, +d[widthColumn.key] || 1);
        }
      }
    }

    if (xColumn?.sort) {
      const sortDir = xColumn.sort === "desc" ? -1 : 1;
      keys.sort((a, b) => {
        const aNaN = strictNaN(+a);
        const bNaN = strictNaN(+b);
        if (aNaN || bNaN) {
          return (a < b ? -1 : a > b ? 1 : 0) * sortDir;;
        }
        return (+a - +b) * sortDir;
      })
    }
    if (yColumn?.sort) {
      const sortDir = xColumn.sort === "desc" ? -1 : 1;
      data.sort((a, b) => {
        const aNaN = strictNaN(+a.index);
        const bNaN = strictNaN(+b.index);
        if (aNaN || bNaN) {
          return (a.index < b.index ? -1 : a.index > b.index ? 1 : 0) * sortDir;;
        }
        return (+a.index - +b.index) * sortDir;
      }).reverse()
    }

    return { data, keys, colors: colorFunc, keyWidths, max };
  }, [props.viewData, xColumn, yColumn, colorColumns, widthColumn, heightColumn, colors,
      props.colors?.byValueSymmetric]);

// console.log("GridGraphWrapper::dataFromProps", dataFromProps);

  const axisBottom = React.useMemo(() => {
    if (!props.xAxis) return false;
    return { ...props.xAxis };
  }, [props.xAxis]);

  const axisLeft = React.useMemo(() => {
    if (!props.yAxis) return false;
    return { ...props.yAxis };
  }, [props.yAxis]);

  const legend = React.useMemo(() => {
    // See formatMinutesAuto: the unit switch needs THIS graph's own domain
    // max (dataFromProps.max), so it can't be resolved upstream in
    // GraphComponent's hoverComp memo like every other valueFormat.
    const format = props.hoverComp?.minutesAutoSeconds
      ? formatMinutesAuto(dataFromProps.max)
      : props.hoverComp?.valueFormat;
    return {
      ...props.legend,
      type: "linear",
      orientation: ["right", "left"].includes(props.legend.position || "right") ? "vertical" : "horizontal",
      scale: dataFromProps.colors,
      format
    };
  }, [props.legend, props.colors, props.hoverComp?.valueFormat, props.hoverComp?.minutesAutoSeconds, dataFromProps]);

  const {
    publishHoverData: publish,
    hoverProvider: provider,
    publishClickData: publishClick,
    clickProvider,
    actions
  } = props;

  // click a cell → publish its xAxis key (e.g. a date) to the provider's page var (click_publish).
  const onGridClick = React.useMemo(() => {
    if (!publishClick || !clickProvider) return null;
    return (e, data) => {
      const value = data?.key;
      if (value !== undefined && value !== null) publishClick({ value });
    };
  }, [publishClick, clickProvider]);

  // Build highlight directives for the avl GridGraph from two action streams:
  //   • hover_highlight  → transient highlight, legacy SOLID fill (no style)
  //   • select_highlight → persistent selection, drawn as an OUTLINE border that
  //                        keeps the cell's data color (e.g. the active day on a
  //                        month strip, fed by the `date` page var via a subscriber).
  // Each maps a matched column to { type:'key' } (xAxis) or { type:'index' }
  // (yAxis / color series). Adding select_highlight is BC-safe: hover_highlight
  // output is unchanged (style omitted → solid fill).
  const highlights = React.useMemo(() => {

    const buildFor = (matchAction, style) => {
      const acts = actions.filter(a => a.action === matchAction);
      const styleProp = style ? { style } : {};

      if (xColumn && yColumn) {
        return acts.reduce((a, c) => {
          if (c.column === xColumn.key) {
            for (const v of c.value) a.push({ type: "key", value: v, ...styleProp })
          }
          else if (c.column === yColumn.key) {
            for (const v of c.value) a.push({ type: "index", value: v, ...styleProp })
          }
          return a;
        }, [])
      }
      else if (xColumn && colorColumns.length) {
        return acts.reduce((a, c) => {
          if (c.column === xColumn.key) {
            for (const v of c.value) a.push({ type: "key", value: v, ...styleProp })
          }
          else {
            for (const cc of colorColumns) {
              for (const v of c.value) {
                if (cc.key === c.column) a.push({ type: "index", value: cc.key, ...styleProp })
              }
            }
          }
          return a;
        }, [])
      }
      return [];
    };

    return [
      ...buildFor("hover_highlight", null),
      ...buildFor("select_highlight", "outline")
    ];

  }, [actions, xColumn, yColumn, colorColumns]);

// console.log("GridGraphWrapper::highlights", highlights);

  // ── Grid overlays from subscriber actions (feed the avl GridGraph's existing
  // `bounds` / `points` props — until now nothing upstream supplied them):
  //   • grid_cell_bands — param entries "rowKey|xFrom|xTo" → ONE border rect per
  //     matched row spanning the x keys from xFrom..xTo. X bounds are compared
  //     LEXICOGRAPHICALLY against the x-axis category keys (inclusive), so the page
  //     must publish bounds in the axis's own key vocabulary (e.g. zero-padded
  //     "07:40" for a 5-min tod axis). E.g. an incident page publishes each delay
  //     TMC's congestion window and the speed grid outlines those (TMC × epoch) cells.
  //   • grid_point — param entries "rowKey|xKey" → a ring centered on that cell
  //     (e.g. the incident-opened epoch × TMC).
  // Both resolve rowKey → the y index through args.column: a fetched row-level column
  // (constant per y row, like the height column — e.g. the bare tmc behind an
  // "intersection · tmc" y label). Rows/keys that don't resolve are skipped.
  const [overlayBounds, overlayPoints] = React.useMemo(() => {
    if (!yColumn) return [EMPTY_OVERLAYS, EMPTY_OVERLAYS];
    const bandActs = actions.filter(a => a.action === "grid_cell_bands" && a.column && a.value?.length);
    const pointActs = actions.filter(a => a.action === "grid_point" && a.column && a.value?.length);
    if (!bandActs.length && !pointActs.length) return [EMPTY_OVERLAYS, EMPTY_OVERLAYS];

    // rowKey → y index, one map per distinct rowKey column
    const maps = {};
    for (const act of [...bandActs, ...pointActs]) maps[act.column] = maps[act.column] || {};
    for (const d of (props.viewData || [])) {
      const index = d[yColumn.key];
      if (index === undefined) continue;
      for (const col of Object.keys(maps)) {
        const rk = d[col];
        if (rk !== undefined && rk !== null && !(rk in maps[col])) maps[col][rk] = index;
      }
    }

    const keys = dataFromProps.keys || [];
    const bounds = [];
    for (const act of bandActs) {
      const stroke = act.args?.stroke || "#111827";
      const strokeWidth = +(act.args?.strokeWidth) || 1.5;
      // entries may arrive as an array of triplets OR comma-joined inside one value
      for (const entry of act.value.flatMap(v => String(v).split(","))) {
        const [rk, from, to] = String(entry).split("|");
        const index = maps[act.column][rk];
        if (index === undefined || !from || !to) continue;
        const included = keys.filter(k => String(k) >= from && String(k) <= to);
        if (!included.length) continue;
        bounds.push({ index, bounds: included, stroke, strokeWidth, fill: "none", rx: 2 });
      }
    }
    const points = [];
    for (const act of pointActs) {
      const style = {
        r: +(act.args?.r) || 4.5,
        fill: act.args?.fill || "#0F1722",
        stroke: act.args?.stroke || "#ffffff",
        strokeWidth: +(act.args?.strokeWidth) || 2,
      };
      for (const entry of act.value) {
        const [rk, xKey] = String(entry).split("|");
        const index = maps[act.column][rk];
        if (index === undefined || !xKey) continue;
        points.push({ index, key: xKey, ...style });
      }
    }
    return [bounds, points];
  }, [actions, props.viewData, yColumn, dataFromProps.keys]);

  const onLegendEnter = React.useMemo(() => {
    if (!publish || !provider) return null;
    return key => {
      publish({
        action: "hover_publish",
        column: provider.args?.column,
        value: key
      })
    }
  }, [publish, provider]);

  const onLegendLeave = React.useMemo(() => {
    if (!publish || !provider) return null;
    return () => publish(null);
  }, [publish, provider]);

  const InstantiatedLegend = React.useMemo(() => {
    return !legend.show ? null : (
      <Legend { ...legend } actions={ actions }
        onEnter={ onLegendEnter }
        onLeave={ onLegendLeave }/>
    )
  }, [legend, actions, onLegendEnter, onLegendLeave]);

  const onHorizontalEnter = React.useMemo(() => {
    if (!publish || !provider) return null;
    if (provider.args?.column !== yColumn?.key) return null;
    return (e, data) => {
      publish({
        action: "hover_publish",
        column: provider.args?.column,
        value: data.index
      })
    }
  }, [publish, provider, yColumn]);

  const onHorizontalLeave = React.useMemo(() => {
    if (!publish || !provider) return null;
    if (provider.args?.column !== yColumn?.key) return null;
    return () => publish(null);
  }, [publish, provider, yColumn]);

  const onGridEnter = React.useMemo(() => {
    if (!publish || !provider) return null;
    if (provider.args?.column !== xColumn?.key) return null;
    return (e, data) => {
      publish({
        action: "hover_publish",
        column: provider.args?.column,
        value: data.key
      })
    }
  }, [publish, provider, xColumn]);

  const onGridLeave = React.useMemo(() => {
    if (!publish || !provider) return null;
    if (provider.args?.column !== xColumn?.key) return null;
    return () => publish(null);
  }, [publish, provider, xColumn]);

  return (
    <div
      className={ `
          w-full bg-inherit flex
          ${ TopOrBottomRegex.test(legend.position) ? "flex-col" : "" }
      ` }
    >
      { !legend.show || !legend.position.includes("top") ? null :
        <div
          className={ `
              flex
              ${ legend.position === "top-right" ? "justify-end" : "" }
          ` }
        >
          { InstantiatedLegend }
        </div>
      }
      { !legend.show || (legend.position !== "left") ? null :
        <div className="flex items-center">
          { InstantiatedLegend }
        </div>
      }
      <div
        className={ `
          bg-inherit flex-1 min-w-0
        ` }
        style={ {
          height: `${ props.height }px`
        } }
      >
        <GridGraph { ...props }
          { ...dataFromProps }
          axisBottom={ axisBottom }
          axisLeft={ axisLeft }
          highlights={ highlights }
          bounds={ overlayBounds }
          points={ overlayPoints }
          onHorizontalEnter={ onHorizontalEnter }
          onHorizontalLeave={ onHorizontalLeave }
          onGridEnter={ onGridEnter }
          onGridLeave={ onGridLeave }
          onGridClick={ onGridClick }
          // Missing-data cells (null value) resolve to this color. Default matches
          // the old NPMRDS tool's black no-data cells; author-overridable, e.g. back
          // to "transparent" for a report that wants missing data to disappear.
          nullColor={ props.colors?.nullColor || "#000000" }/>
      </div>
      { !legend.show || !legend.position.includes("bottom") ? null :
        <div
          className={ `
            flex
            ${ legend.position === "bottom-right" ? "justify-end" : "" }
          ` }
        >
          { InstantiatedLegend }
        </div>
      }
      { !legend.show || (legend.position !== "right") ? null :
        <div className="flex items-center">
          { InstantiatedLegend }
        </div>
      }
    </div>
  )
}

export const GridGraphOption = {
  type: "Grid",
  GraphComp: "GridGraph",
  Component: GridGraphWrapper
};