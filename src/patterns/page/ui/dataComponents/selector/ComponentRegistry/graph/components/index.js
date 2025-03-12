import { BarGraphOption } from "./BarGraph"
import { LineGraphOption } from "./LineGraph"
import { ScatterPlotOption } from "./ScatterPlot"

const GraphTypeOptions = [
  BarGraphOption,
  LineGraphOption,
  ScatterPlotOption
]

const [GraphTypes, GraphTypeMap, EditorOptionsMap] = GraphTypeOptions.reduce((a, c) => {
  const { type, GraphComp, Component, EditorOptions } = c;
  a[0].push({ type, GraphComp });
  a[1][GraphComp] = Component;
  a[2][GraphComp] = EditorOptions || [];
  return a;
}, [[], {}, {}]);

export { GraphTypes, EditorOptionsMap };

export const getGraphComponent = GraphComp => {
  return GraphTypeMap[GraphComp];
}
