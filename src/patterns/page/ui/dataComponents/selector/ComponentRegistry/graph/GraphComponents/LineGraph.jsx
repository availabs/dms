import React from "react"

import * as Plot from "@observablehq/plot";

import { useGenericPlotOptions } from "./utils"

const LineGraph = props => {

  const {
    data,
    bgColor,
    tooltip
  } = props

  const [ref, setRef] = React.useState(null);

  const plotOptions = useGenericPlotOptions(props);

  React.useEffect(() => {
    if (!ref) return;
    if (!data.length) return;

    const marks = [
      Plot.ruleY([0]),
      Plot.line(
        data,
        { x: "index",
          y: "value",
          stroke: "type",
          sort: { x: "x", order: null }
        }
      )
    ]

    if (tooltip.show) {
      marks.push(
        Plot.tip(
          data,
          Plot.pointerX({
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

  }, [ref, data, plotOptions, tooltip, bgColor]);

  return (
    <div ref={ setRef }/>
  )
}
export const LineGraphOption = {
  type: "Line Graph",
  GraphComp: "LineGraph",
  Component: LineGraph
}
