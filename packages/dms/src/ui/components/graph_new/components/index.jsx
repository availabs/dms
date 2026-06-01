import React from "react"

import { BarGraphOption } from "./BarGraph"
import { LineGraphOption } from "./LineGraph"
import { PieGraphOption } from "./PieGraph"
import { GridGraphOption } from "./GridGraph"
import { SunburstGraphOption } from "./SunburstGraph"
import { TreemapGraphOption } from "./TreemapGraph"

const GraphTypeOptions = [
  BarGraphOption,
  LineGraphOption,
  PieGraphOption,
  GridGraphOption,
  SunburstGraphOption,
  TreemapGraphOption
]

const [GraphTypes, GraphTypeMap, EditorOptionsMap] = GraphTypeOptions.reduce((a, c) => {
  const { type, GraphComp, Component, EditorOptions } = c;
  a[0].push({ type, GraphComp });
  a[1][GraphComp] = Component;
  a[2][GraphComp] = EditorOptions || [];
  return a;
}, [[], {}, {}]);

export { GraphTypes, EditorOptionsMap };

const UnknownGraphType = ({ graphType }) => {
  return (
    <div className="font-bold text-lg flex justify-center items-center flex-col">
      <div className="text-2xl border-b-2">AvlGraph Error</div>
      Unknown Graph Type: { graphType }
    </div>
  )
}

const getUnknownGraphType = graphType => {
  return () => <UnknownGraphType graphType={ graphType }/>
}

export const getGraphComponent = GraphType => {
  return GraphTypeMap[GraphType] || getUnknownGraphType(GraphType);
}
