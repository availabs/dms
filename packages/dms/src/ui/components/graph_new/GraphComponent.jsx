import React from "react";
// import {
//   groups as d3groups,
//   mean as d3mean,
//   sum as d3sum
// } from "d3-array";
import { range as d3range } from "d3-array";
import {get} from "lodash-es";
import { getGraphComponent } from "./components";
import {mapColors} from "./utils";
import {getColorRange} from "./colorRange";
// import {graphTheme} from "./index";
// import {ThemeContext} from "../../useTheme";
import { strictNaN, getFormatFunc } from "./utils";

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

// const AggFuncs = {
//   sum: d3sum,
//   avg: d3mean,
//   count: d3sum,
//   exempt: (arr, acc) => acc(arr[0])
// }
// const getAggFunc = aggMethod => {
//   return AggFuncs[aggMethod] //|| d3sum;
// }

export const GraphComponent = props => {

  const {
    graphFormat,
    graphType,
    viewData,
    columns,
    showCategories,
    xAxisColumn,
    yAxisColumns,
    theme
  } = props;

  const GraphComponent = React.useMemo(() => {
    return getGraphComponent(graphType);
  }, [graphType]);

  const [ref, setRef] = React.useState(null);

  const colors = React.useMemo(() => {
    if (graphFormat.colors?.type === "palette") {
      return graphFormat.colors?.value || [];
    }
  }, [graphFormat.colors]);

  return (
    <div ref={ setRef }
      className={ `
        w-full h-fit ${ theme.bgColor }
        ${ theme.text } ${ theme.textColor }
      ` }
      style={ {
        padding: `${ get(graphFormat, "padding", 0.5) }rem`
      } }
    >
      <GraphTitle { ...graphFormat.title }/>

      { !GraphComponent ? null :
        <GraphComponent
          viewData={ viewData }
          columns={ columns }
          title={ get(graphFormat, "title", "") }
          height={ get(graphFormat, "height", 0) }
          width={ get(graphFormat, "width", 0) }
          bgColor={ get(graphFormat, "bgColor", "#ffffff") }
          colors={ colors }
          upperLimit={ get(graphFormat, "upperLimit") }

          showCategories={ showCategories }
          xAxisColumn={ xAxisColumn }

          orientation={ get(graphFormat, "orientation", "vertical") }
          groupMode={ get(graphFormat, "groupMode", "stacked") }
          isLog={ get(graphFormat, "isLog", false) }

          xAxis={ {
            label: get(graphFormat, ["xAxis", "label"]),
            rotateLabels: get(graphFormat, ["xAxis", "rotateLabels"], false),
            tickDensity: get(graphFormat, ["xAxis", "tickDensity"], 2),
            showGridLines: get(graphFormat, ["xAxis", "showGridLines"], false),
            show: get(graphFormat, ["xAxis", "show"], true)
          } }
          yAxis={ {
            label: get(graphFormat, ["yAxis", "label"]),
            rotateLabels: get(graphFormat, ["yAxis", "rotateLabels"], false),
            showGridLines: get(graphFormat, ["yAxis", "showGridLines"], true),
            show: get(graphFormat, ["yAxis", "show"], true),
            format: getFormatFunc(get(graphFormat, ["yAxis", "format"]))
          } }
          margins={ get(graphFormat, "margins", {}) }
          legend={ get(graphFormat, "legend", {}) }
          tooltip={ {
            show: get(graphFormat, ["tooltip", "show"], true),
            valueFormat: getFormatFunc(get(graphFormat, ["tooltip", "valueFormat"])),
            yFormat: getFormatFunc(get(graphFormat, ["tooltip", "yFormat"]))
          } }/>
      }
    </div>
  )
}
