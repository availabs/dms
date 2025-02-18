import React from "react"

import uniq from "lodash/uniq"
import {formatFunctions} from "../../spreadsheet/utils/utils";

export const useAxisTicks = (data, tickSpacing, key = "index") => {
  return React.useMemo(() => {
    const indexes = uniq(data.map(d => d[key]));
    return indexes.reduce((a, c, i) => {
      if ((i % tickSpacing) === 0) {
        a.push(c);
      }
      return a;
    }, [])
  }, [data, tickSpacing])
}

export const useGenericPlotOptions = props => {
  const {
    data,
    margins,
    height,
    width,
    xAxis,
    yAxis,
    colors,
    legend
  } = props;

  const xAxisTicks = useAxisTicks(data, xAxis.tickSpacing);

  const graphHeight = React.useMemo(() => {
    const { marginTop: mt, marginBottom: mb } = margins;
    if ((mt + mb) > height) {
      return mt + mb + 100;
    }
    return height;
  }, [height, margins]);

  return React.useMemo(() => {
    return {
      x: {
        type: "point",
        label: xAxis.label || xAxis.name,
        grid: xAxis.showGridLines,
        textAnchor: xAxis.rotateLabels ? "start" : "middle",
        tickRotate: xAxis.rotateLabels ? 45 : 0,
        axis: "bottom",
        ticks: xAxisTicks
      },
      y: {
        axis: "left",
        grid: yAxis.showGridLines,
        tickFormat: formatFunctions[yAxis.tickFormat],
        label: yAxis.label
      },
      color: {
        legend: legend.show,
        width: legend.width,
        height: legend.height,
        label: legend.label,
        range: colors.value
      },
      height: graphHeight,
      width,
      ...margins
    }
  }, [margins, graphHeight, width, xAxis, yAxis, colors, legend]);
}

export const useGenericTipOptions = props => {
  const {
    bgColor,
    tooltip
  } = props;
  return React.useMemo(() => {
    return !tooltip.show ? undefined :
      { fill: bgColor,
        fontSize: tooltip.fontSize,
        x: "index",
        y: "value"
      }
  }, [bgColor, tooltip]);
}
