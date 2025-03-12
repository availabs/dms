import React from "react"

import * as Plot from "@observablehq/plot";
import {formatFunctions} from "../../../dataWrapper/utils/utils";

import { useAxisTicks } from "../utils"
const BarGraph = props => {

  const {
    data,
    margins,
    height,
    width,
    xAxis,
    yAxis,
    colors,
    bgColor,
    legend,
    tooltip,
    groupMode = "stacked",
    orientation = "vertical",
    showCategories,
    xAxisColumn
  } = props;

  const isPalette = ((colors.type === "palette") || (colors.type === "custom"));
  const isLog = (!isPalette && colors.value.type === "log");
  const isStacked = groupMode === "stacked";
  const isVertical = orientation === "vertical";

  const [ref, setRef] = React.useState(null);

  const xAxisTicks = useAxisTicks(data, xAxis.tickSpacing);

  const graphHeight = React.useMemo(() => {
    const { marginTop: mt, marginBottom: mb } = margins;
    if ((mt + mb) > height) {
      return mt + mb + 100;
    }
    return height;
  }, [height, margins]);

  const [bar, rule] = React.useMemo(() => {
    return isVertical ?
      [Plot.barY, Plot.ruleY] :
      [Plot.barX, Plot.ruleX];
  }, [isVertical]);

  const xOptions = React.useMemo(() => {
    return isVertical ? ({
      type: "band",
      axis: "bottom",
      label: isStacked ? xAxis.label : null,
      grid: xAxis.showGridLines,
      textAnchor: xAxis.rotateLabels ? "start" : "middle",
      tickRotate: xAxis.rotateLabels ? 45 : 0,
      ticks: isStacked ? xAxisTicks : undefined
    }) : ({
      axis: "bottom",
      type: isLog ? "log" : undefined,
      grid: yAxis.showGridLines,
      tickFormat: formatFunctions[yAxis.tickFormat],
      textAnchor: yAxis.rotateLabels ? "start" : "middle",
      tickRotate: yAxis.rotateLabels ? 45 : 0,
      label: isStacked ? yAxis.label : null
    })
  }, [isVertical, isStacked, xAxis, yAxis, xAxisTicks, isLog]);

  const yOptions = React.useMemo(() => {
    return isVertical ? ({
      axis: "left",
      type: isLog ? "log" : undefined,
      grid: yAxis.showGridLines,
      textAnchor: yAxis.rotateLabels ? "start" : "middle",
      tickRotate: yAxis.rotateLabels ? 45 : 0,
      tickFormat: formatFunctions[yAxis.tickFormat],
      label: isStacked ? yAxis.label : null
    }) : ({
      type: "band",
      axis: "left",
      label: isStacked ? xAxis.label : null,
      grid: xAxis.showGridLines,
      textAnchor: xAxis.rotateLabels ? "start" : "middle",
      tickRotate: xAxis.rotateLabels ? 45 : 0,
      ticks: isStacked ? xAxisTicks : undefined
    })
  }, [isVertical, isStacked, xAxis, yAxis, xAxisTicks, isLog]);

  const fxOptions = React.useMemo(() => {
    return isStacked || !isVertical ? undefined : {
      axis: "top",
      ticks: xAxisTicks,
      label: xAxis.label
    }
  }, [isStacked, isVertical, xAxisTicks, xAxis]);

  const fyOptions = React.useMemo(() => {
    return isStacked || isVertical ? undefined : {
      axis: "left",
      ticks: xAxisTicks,
      label: yAxis.label
    }
  }, [isStacked, isVertical, xAxisTicks, yAxis]);

  React.useEffect(() => {
    if (!ref) return;
    if (!data.length) return;

    const marks = xAxis.showXAxisBar ? [rule([0])] : [];

    marks.push(bar(
        data,
        isStacked ? (
            { x: isVertical ? "index" : isLog ? undefined : "value",
              x1: !isLog ? undefined : isVertical ? undefined : 1,
              x2: !isLog ? undefined : isVertical ? "index" : "value",

              y: !isVertical ? "index" : isLog ? undefined : "value",
              y1: !isLog ? undefined : isVertical ? 1 : undefined,
              y2: !isLog ? undefined : isVertical ? "value" : "index",

              fill: isPalette ? "type" : "value",
              sort: isVertical ?
                  ({ x: "x", order: null }) :
                  ({ y: "y", order: null }),
            }
        ) : (
            { x: isVertical ? "type" : "value",
              fx: isVertical ? "index" : undefined,
              y: isVertical ? "value" : "type",
              fy: isVertical ? undefined : "index",
              fill: isPalette ? "type" : "value",
              sort: isVertical ?
                  ({ fx: "x", order: null }) :
                  ({ fy: "y", order: null }),
            }
        )
    ))

    if (tooltip.show && isVertical) {
      marks.push(
        Plot.tip(
          data,
          Plot.pointerX(
            Plot.stackY({
              x: "index",
              y: "value",
              channels: {
                index: {
                  value: "index",
                  label: xAxisColumn.display_name || xAxisColumn.name
                },
                Type: "type",
                Value: "value"
              },
              format: {
                x: false,
                y: false,
                index: true,
                Type: showCategories,
                Value: true
              },
              fill: bgColor,
              fontSize: tooltip.fontSize,
            })
          )
        )
      )
    }
    else if (tooltip.show && !isVertical) {
      marks.push(
        Plot.tip(
          data,
          Plot.pointerY(
            Plot.stackX({
              x: "value",
              y: "index",
              channels: {
                index: {
                  value: "index",
                  label: xAxisColumn.display_name || xAxisColumn.name
                },
                Type: "type",
                Value: "value"
              },
              format: {
                x: false,
                y: false,
                index: true,
                Type: showCategories,
                Value: true
              },
              fill: bgColor,
              fontSize: tooltip.fontSize
            })
          )
        )
      )
    }

    const plot = Plot.plot({
      x: xOptions,
      fx: fxOptions,
      y: yOptions,
      fy: fyOptions,
      color: {
        legend: legend.show,
        width: legend.width,
        height: legend.height,
        label: legend.label,
        domain: colors.value.domain || undefined,
        range: isPalette ? colors.value : colors.value.range,
        type: isPalette ? undefined : colors.value.type,
        tickFormat: isPalette ? undefined : formatFunctions[yAxis.tickFormat]
      },
      height: graphHeight,
      width,
      ...margins,
      marks
    });

    ref.append(plot);

    return () => plot.remove();

  }, [ref, data, margins, graphHeight, width, yAxis, tooltip, isLog,
      colors, legend, isPalette, isStacked, isVertical, xAxisColumn, xAxis.showXAxisBar,
      xOptions, yOptions, fxOptions, fyOptions, showCategories]
  );

  return (
    <div ref={ setRef }/>
  )
}

export const BarGraphOption = {
  type: "Bar Graph",
  GraphComp: "BarGraph",
  Component: BarGraph,
  EditorOptions: [
    { label: "Orientation",
      type: "select",
      path: ["orientation"],
      options: ["vertical", "horizontal"],
      defaultValue: "vertical"
    },
    { label: "Group Mode",
      type: "select",
      path: ["groupMode"],
      options: ["stacked", "grouped"],
      defaultValue: "stacked"
    }
  ]
}
