import React from "react";

import { get } from "lodash-es";
import { getGraphComponent } from "./components";
import { getFormatFunc } from "./utils";

const GraphTitle = ({ title, ...props }) => {

  const className = React.useMemo(() => {
    const {
      fontSize = "text-2xl",
      fontWeight = "font-normal",
      justify = "justify-start"
    } = props;
    return `${ fontSize } ${ fontWeight } ${ justify }`;
  }, [props]);

  return !title ? null : (
    <div className={ `w-full flex ${ className }` }>
      { title }
    </div>
  )
}

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

  // const colors = React.useMemo(() => {
  //   let colors = [];

  //   if (graphFormat.colors?.type === "palette") {
  //     colors = graphFormat.colors?.value || [];
  //   }
  //   else if (graphFormat.colors?.type === "scheme") {
  //     colors = getColorRange(graphFormat.colors.scheme, 13)
  //   }

  //   return graphFormat.colors?.reverse ? colors.reverse() : colors;
  // }, [graphFormat.colors]);

  const margin = React.useMemo(() => {
    return {
      top: graphFormat.margin?.top || 20,
      right: graphFormat.margin?.right || 20,
      bottom: graphFormat.margin?.bottom || 50,
      left: graphFormat.margin?.left || 100
    }
  }, [graphFormat.margin]);

  const graphHeight = React.useMemo(() => {
    const mt = get(margin, "top", 20);
    const mb = get(margin, "bottom", 50);
    return Math.max(mt + mb + 100, graphFormat.height);
  }, [graphFormat.height, margin]);

  const hoverComp = React.useMemo(() => {
    const isDollars = Boolean(graphFormat.tooltip?.isDollars);
    return {
      ...graphFormat.tooltip,
      valueFormat: getFormatFunc(get(graphFormat, ["tooltip", "valueFormat"]), isDollars),
      yFormat: getFormatFunc(get(graphFormat, ["tooltip", "yFormat"]), isDollars)
    };
  }, [graphFormat.tooltip]);

// if (graphType === "PieGraph")
// console.log("GraphComponent::hoverComp", hoverComp);

  return (
    <div
      className={ `
        w-full h-fit ${ theme.bgColor }
        ${ theme.text } ${ theme.textColor }
      ` }
    >

      <GraphTitle { ...graphFormat.title }/>

      <GraphComponent
        viewData={ viewData }
        columns={ columns }
        title={ get(graphFormat, "title", "") }
        height={ graphHeight }
        width={ get(graphFormat, "width") }
        bgColor={ get(graphFormat, "bgColor", "#ffffff") }
        colors={ graphFormat.colors }
        upperLimit={ get(graphFormat, "upperLimit") }

        showCategories={ showCategories }
        xAxisColumn={ xAxisColumn }

        orientation={ get(graphFormat, "orientation", "vertical") }
        groupMode={ get(graphFormat, "groupMode", "stacked") }
        paddingInner={ get(graphFormat, "paddingInner", 0.0) }
        paddingOuter={ get(graphFormat, "paddingOuter", 0.0) }

        tileMethod={ get(graphFormat, "tileMethod", "treemapSquarify") }
        indexTextSize={ get(graphFormat, "indexTextSize", "medium") }
        valueTextSize={ get(graphFormat, "valueTextSize", "medium") }

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
          format: getFormatFunc(get(graphFormat, ["yAxis", "format"]), get(graphFormat, ["yAxis", "isDollars"]))
        } }
        margin={ margin }
        legend={ get(graphFormat, "legend", {}) }
        hoverComp={ hoverComp }/>

    </div>
  )
}
