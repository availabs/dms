import React from "react"

import * as Plot from "@observablehq/plot";

import { useGenericPlotOptions } from "../utils"

const ScatterPlot = props => {

  const {
    data,
    bgColor,
    tooltip,
      xAxis
  } = props

  const [ref, setRef] = React.useState(null);

  const plotOptions = useGenericPlotOptions(props);

  React.useEffect(() => {
    if (!ref) return;
    if (!data.length) return;

    const marks = xAxis.showXAxisBar ? [Plot.ruleY([0])] : []

      marks.push(Plot.dot(
              data,
              { x: "index",
                  y: "value",
                  stroke: "type",
                  sort: { x: "x", order: null }
              }
          ),
          Plot.crosshair(
              data,
              Plot.pointer({
                  x: "index",
                  y: "value",
                  textFill: bgColor
              })
          ))

    if (tooltip.show) {
      marks.push(
        Plot.tip(
          data,
          Plot.pointer({
            fill: bgColor,
            fontSize: tooltip.fontSize,
            x: "index",
            y: "value"
          })
        )
      )
    }

    const plot = Plot.plot({
      ...plotOptions,
      marks
    });

    ref.append(plot);

    return () => plot.remove();

  }, [ref, data, plotOptions, bgColor, tooltip, xAxis.showXAxisBar]);

  return (
    <div ref={ setRef }/>
  )
}
export const ScatterPlotOption = {
  type: "Scatter Plot",
  GraphComp: "ScatterPlot",
  Component: ScatterPlot
}
