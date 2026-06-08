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

const noOp = () => {};

export const GraphComponent = props => {

  const {
    graphFormat,
    graphType,
    viewData,
    columns,
    theme,
    actions = [],
    publishHoverData = noOp,
    hoverProvider = null
  } = props;

  const GraphComponent = React.useMemo(() => {
    return getGraphComponent(graphType);
  }, [graphType]);

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

// console.log("GraphComponent::actions", props.actions);

  return (
    <div
      className={ `
        w-full h-fit ${ theme.bgColor }
        ${ theme.text } ${ theme.textColor }
      ` }
    >

      <GraphTitle { ...(graphFormat.title || {}) }/>

      <GraphComponent
        viewData={ viewData }
        columns={ columns }
        height={ graphHeight }
        width={ get(graphFormat, "width") }
        bgColor={ get(graphFormat, "bgColor", "#ffffff") }
        colors={ graphFormat.colors }

        orientation={ get(graphFormat, "orientation", "vertical") }
        groupMode={ get(graphFormat, "groupMode", "stacked") }
        paddingInner={ get(graphFormat, "paddingInner", 0.0) }
        paddingOuter={ get(graphFormat, "paddingOuter", 0.0) }

        interpolation={ get(graphFormat, "interpolation", "catmullrom") }
        strokeWidth={ get(graphFormat, "strokeWidth", 1) }
        area={ get(graphFormat, "area", false) }
        areaOpacity={ get(graphFormat, "areaOpacity", 0.15) }

        tileMethod={ get(graphFormat, "tileMethod", "treemapSquarify") }
        indexTextSize={ get(graphFormat, "indexTextSize", "medium") }
        valueTextSize={ get(graphFormat, "valueTextSize", "medium") }

        xAxis={ {
          label: get(graphFormat, ["xAxis", "label"]),
          rotateLabels: get(graphFormat, ["xAxis", "rotateLabels"], false),
          tickDensity: get(graphFormat, ["xAxis", "tickDensity"], 2),
          showGridLines: get(graphFormat, ["xAxis", "showGridLines"], false),
          gridLineOpacity: get(graphFormat, ["xAxis", "gridLineOpacity"], 0.25),
          axisColor: get(graphFormat, ["xAxis", "axisColor"], "currentColor"),
          show: get(graphFormat, ["xAxis", "show"], true)
        } }
        yAxis={ {
          label: get(graphFormat, ["yAxis", "label"]),
          rotateLabels: get(graphFormat, ["yAxis", "rotateLabels"], false),
          showGridLines: get(graphFormat, ["yAxis", "showGridLines"], true),
          gridLineOpacity: get(graphFormat, ["yAxis", "gridLineOpacity"], 0.25),
          axisColor: get(graphFormat, ["yAxis", "axisColor"], "currentColor"),
          show: get(graphFormat, ["yAxis", "show"], true),
          format: getFormatFunc(get(graphFormat, ["yAxis", "format"]), get(graphFormat, ["yAxis", "isDollars"]))
        } }
        pieAxis={ {
          showAxis: get(graphFormat, ["pieAxis", "showAxis"], false),
          tickDensity: get(graphFormat, ["pieAxis", "tickDensity"], 0.5),
          showValue: get(graphFormat, ["pieAxis", "showValue"], false),
          valueTextSize: get(graphFormat, ["pieAxis", "valueTextSize"], false),
          valueFormat: getFormatFunc(get(graphFormat, ["pieAxis", "valueFormat"]), get(graphFormat, ["pieAxis", "isDollars"], false)),
        } }
        margin={ margin }
        legend={ get(graphFormat, "legend", {}) }
        hoverComp={ hoverComp }

        actions={ actions }
        publishHoverData={ publishHoverData }
        hoverProvider={ hoverProvider }/>

    </div>
  )
}
