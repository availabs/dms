import React from "react"
import {
  groups as d3groups,
  mean as d3mean,
  sum as d3sum
} from "d3-array"
import {get} from "lodash-es"
import { GraphTypes, getGraphComponent } from "./components"
import {mapColors} from "./utils";
export const getColorRange = (size, name, reverse=false) => {
  let range = get(mapColors, [name, size], []).slice();

  if(reverse) {
    range.reverse()
  }
  return range
}

export const DefaultPalette = getColorRange(12, "Set3");
export const DefaultScaleRange = getColorRange(7, "RdYlGn");

export const getNewGraphFormat = () => ({
  title: {
    title: "",
    position: "start",
    fontSize: 32,
    fontWeight: "bold"
  },
  description: "",
  bgColor: "#ffffff",
  textColor: "#000000",
  colors: {
    type: "palette",
    value: [...DefaultPalette]
  },
  height: 300,
  width: undefined,
  margins: {
    marginTop: 20,
    marginRight: 20,
    marginBottom: 50,
    marginLeft: 100
  },
  xAxis: {
    label: "",
    rotateLabels: false,
    showGridLines: false,
    tickSpacing: 1
  },
  yAxis: {
    label: "",
    showGridLines: true,
    tickFormat: "Integer"
  },
  legend: {
    show: true,
    label: "",
    width: 300,
    height: 50
  },
  tooltip: {
    show: true,
    fontSize: 12
  }
})

const GraphTitle = ({ title, position, fontSize, fontWeight }) => {

  const justify = React.useMemo(() => {
    return `justify-${ position }`;
  }, [position]);

  return ! title ? null : (
    <div className={ `w-full flex ${ justify } mb-4` }>
      <div style={ {
          fontSize: `${ fontSize }px`,
          fontWeight
        } }
      >
        { title }
      </div>
    </div>
  )
}

const AggFuncs = {
  sum: d3sum,
  avg: d3mean,
  count: d3sum
}
const getAggFunc = aggMethod => {
  return AggFuncs[aggMethod] //|| d3sum;
}

export const GraphComponent = props => {

  const {
    graphFormat,
    activeGraphType,
    viewData,
    showCategories,
    xAxisColumn,
    yAxisColumns
  } = props;

  const GraphComponent = React.useMemo(() => {
    return getGraphComponent(activeGraphType.GraphComp);
  }, [activeGraphType]);

  const [ref, setRef] = React.useState(null);
  const [width, setWidth] = React.useState(640);
  React.useEffect(() => {
    if (!ref) return;
    const { width } = ref.getBoundingClientRect();
    setWidth(width);
  }, [ref]);

  const groupedData = React.useMemo(() => {
    const grouped = d3groups(viewData, d => d.index, d => d.type, d => d.aggMethod);

    return grouped.reduce((a, c) => {
      const [index, group1] = c;

      return group1.reduce((aa, cc) => {
        const [type, group2] = cc;

        return group2.reduce((aaa, ccc) => {
          const [aggMethod, group3] = ccc;

          const aggFunc = getAggFunc(aggMethod);
          aaa.push({
            index,
            type,
            value: aggFunc(group3, d => d.value) // fn seems unnecessary?
          })

          return aaa;
        }, aa);
      }, a);
    }, []);
  }, [viewData, yAxisColumns]);

  return (
    <div ref={ setRef } className="w-full h-fit"
      style={ {
        backgroundColor: get(graphFormat, "bgColor", "#ffffff"),
        color: get(graphFormat, "textColor", "#000000"),
        padding: `${ get(graphFormat, "padding", 1) }rem`
      } }
    >
      <GraphTitle { ...graphFormat.title }/>

      <div className="h-fit">
        { !activeGraphType || !GraphComponent ? null :
          <GraphComponent
            data={ groupedData }
            title={ get(graphFormat, "title", "") }
            height={ get(graphFormat, "height", 300) }
            width={ get(graphFormat, "width", width) }
            bgColor={ get(graphFormat, "bgColor", "#ffffff") }
            colors={ get(graphFormat, "colors") }

            showCategories={ showCategories }
            xAxisColumn={ xAxisColumn }

            orientation={ get(graphFormat, "orientation", "vertical") }
            groupMode={ get(graphFormat, "groupMode", "stacked") }

            xAxis={ {
              label: get(graphFormat, ["xAxis", "label"]),
              rotateLabels: get(graphFormat, ["xAxis", "rotateLabels"], false),
              tickSpacing: get(graphFormat, ["xAxis", "tickSpacing"], true),
              showGridLines: get(graphFormat, ["xAxis", "showGridLines"], true),
              showXAxisBar: get(graphFormat, ["xAxis", "showXAxisBar"], false)
            } }
            yAxis={ {
              label: get(graphFormat, ["yAxis", "label"]),
              rotateLabels: get(graphFormat, ["yAxis", "rotateLabels"], false),
              showGridLines: get(graphFormat, ["yAxis", "showGridLines"], true),
              tickFormat: get(graphFormat, ["yAxis", "tickFormat"], undefined)
            } }
            margins={ get(graphFormat, "margins", {}) }
            legend={ get(graphFormat, "legend", {}) }
            tooltip={ get(graphFormat, "tooltip", {}) }/>
        }
      </div>
    </div>
  )
}
