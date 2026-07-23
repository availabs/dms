import React from "react";

import { get } from "lodash-es";
import { getGraphComponent } from "./components";
import { getFormatFunc, getTooltipFormatFunc } from "./utils";

// Collect the axis-typography keys for one axis off `graphFormat` (which already has
// theme `chartDefaults` merged under the section's `display`, so brand defaults and
// per-section overrides both land here). Unset keys come back `undefined` → the axis
// component's own destructuring defaults apply (BC). Tick font is CSS-valued
// (e.g. "11px" / a font-family stack / "#64748b"); label keys default to 1rem bold.
const axisFontProps = (graphFormat, axis) => ({
  tickFontSize: get(graphFormat, [axis, "tickFontSize"]),
  tickFontFamily: get(graphFormat, [axis, "tickFontFamily"]),
  tickFontWeight: get(graphFormat, [axis, "tickFontWeight"]),
  tickColor: get(graphFormat, [axis, "tickColor"]),
  labelFontSize: get(graphFormat, [axis, "labelFontSize"]),
  labelFontFamily: get(graphFormat, [axis, "labelFontFamily"]),
  labelFontWeight: get(graphFormat, [axis, "labelFontWeight"]),
  labelColor: get(graphFormat, [axis, "labelColor"]),
});

const GraphTitle = ({ title, description, theme = {}, ...props }) => {

  // Explicit per-section font settings (fontSize/fontWeight on display.title) win;
  // otherwise the avlGraph theme's header tokens style the title/description so every
  // graph header is on-brand without per-section config. The generic theme carries no
  // `title`/`subtitle` tokens, so non-branded sites keep the historical look.
  const explicit = props.fontSize || props.fontWeight;

  const titleClassName = React.useMemo(() => {
    if (!explicit && theme.title) return theme.title;
    const {
      fontSize = "text-2xl",
      fontWeight = "font-normal"
    } = props;
    return `${ fontSize } ${ fontWeight }`;
  }, [props, explicit, theme.title]);

  const justify = props.justify || "justify-start";

  return !title && !description ? null : (
    <div className={ theme.headerWrapper || `w-full flex ${ justify }` }>
      <div className={ titleClassName }>{ title }</div>
      { !description ? null :
        <div className={ theme.subtitle || "" }>{ description }</div>
      }
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
    hoverProvider = null,
    publishClickData = noOp,
    clickProvider = null,
    colorsByKey
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
      // map config `showTotal` → avl-graph DefaultHoverComp `showTotals` (default true = BC)
      showTotals: get(graphFormat, ["tooltip", "showTotal"], true),
      valueFormat: getTooltipFormatFunc(get(graphFormat, ["tooltip", "valueFormat"]), isDollars),
      yFormat: getFormatFunc(get(graphFormat, ["tooltip", "yFormat"]), isDollars),
      // Per-graph minutes/seconds auto-switch (GridGraph's legend only, see
      // formatMinutesAuto) — a raw boolean, not resolved through
      // getFormatFunc, since the actual formatter needs this graph's own
      // domain max, unknown at this point.
      minutesAutoSeconds: Boolean(get(graphFormat, ["tooltip", "minutesAutoSeconds"], false))
    };
  }, [graphFormat.tooltip]);

// console.log("GraphComponent::actions", props.actions);

  return (
    <div
      className={ `
        w-full h-fit ${ theme.bgColor || "" }
        ${ theme.text || "" } ${ theme.textColor || "" }
        ${ theme.padding || "" }
      ` }
    >

      <GraphTitle { ...(graphFormat.title || {}) }
        description={ graphFormat.description }
        theme={ theme }/>

      <GraphComponent
        viewData={ viewData }
        columns={ columns }
        height={ graphHeight }
        width={ get(graphFormat, "width") }
        bgColor={ get(graphFormat, "bgColor", "#ffffff") }
        colors={ graphFormat.colors }
        colorsByKey={ colorsByKey }

        orientation={ get(graphFormat, "orientation", "vertical") }
        groupMode={ get(graphFormat, "groupMode", "stacked") }
        paddingInner={ get(graphFormat, "paddingInner", 0.0) }
        paddingOuter={ get(graphFormat, "paddingOuter", 0.0) }

        interpolation={ get(graphFormat, "interpolation", "catmullrom") }
        strokeWidth={ get(graphFormat, "strokeWidth", 1) }
        area={ get(graphFormat, "area", false) }
        areaOpacity={ get(graphFormat, "areaOpacity", 0.15) }
        // Bar fill-opacity. Unset → the avl-graph CSS default (0.75, :hover → 1)
        // governs, preserving the historical translucent look + hover feedback.
        // Set to 1 for solid, design-matching bars (inline style wins over the CSS).
        barOpacity={ get(graphFormat, "barOpacity") }
        showMarks={ get(graphFormat, "showMarks", false) }

        tileMethod={ get(graphFormat, "tileMethod", "treemapSquarify") }
        indexTextSize={ get(graphFormat, "indexTextSize", "medium") }
        valueTextSize={ get(graphFormat, "valueTextSize", "medium") }

        // Opt-in continuous x-axis: "band" (default, categorical) | "time" | "linear".
        // BarGraph positions bars at their real x-value with proportional gaps when non-band.
        xScale={ { type: get(graphFormat, ["xAxis", "scaleType"], "band") } }
        xAxis={ {
          label: get(graphFormat, ["xAxis", "label"]),
          rotateLabels: get(graphFormat, ["xAxis", "rotateLabels"], false),
          tickDensity: get(graphFormat, ["xAxis", "tickDensity"], 2),
          showGridLines: get(graphFormat, ["xAxis", "showGridLines"], false),
          gridLineOpacity: get(graphFormat, ["xAxis", "gridLineOpacity"], 0.25),
          axisColor: get(graphFormat, ["xAxis", "axisColor"], "currentColor"),
          show: get(graphFormat, ["xAxis", "show"], true),
          // 'bottom' (default) | 'top' — where the category axis renders (sparks
          // with labels above the bars set 'top'). See AxisBottom position prop.
          position: get(graphFormat, ["xAxis", "position"], "bottom"),
          // A named formatFn (ValueFormats, e.g. "epoch_time" for a raw
          // 5-min-of-day index → "6:40") wins when set; otherwise fall back to
          // an explicit value→label map for category ticks (e.g. month number →
          // letter: {"1":"J","2":"F",…}) — keeps the DOMAIN on the real values,
          // since mapping labels in data would collapse duplicate categories
          // (J/J/J).
          format: (() => {
            // Time axis ticks are Date values — format them "m/dd" (no d3-time-format dep, no
            // day-of-week). Falls back to a tickLabels value→label map, then the scale default.
            if (get(graphFormat, ["xAxis", "scaleType"]) === "time") {
              return d => `${ d.getMonth() + 1 }/${ String(d.getDate()).padStart(2, "0") }`;
            }
            const namedFormat = get(graphFormat, ["xAxis", "format"]);
            if (namedFormat) return getFormatFunc(namedFormat);
            const tl = get(graphFormat, ["xAxis", "tickLabels"]);
            return tl ? (v => tl[v] ?? v) : undefined;
          })(),
          // Axis typography — unset keys leave the axis renderer's BC defaults.
          ...axisFontProps(graphFormat, "xAxis")
        } }
        yAxis={ {
          label: get(graphFormat, ["yAxis", "label"]),
          rotateLabels: get(graphFormat, ["yAxis", "rotateLabels"], false),
          showGridLines: get(graphFormat, ["yAxis", "showGridLines"], true),
          gridLineOpacity: get(graphFormat, ["yAxis", "gridLineOpacity"], 0.25),
          axisColor: get(graphFormat, ["yAxis", "axisColor"], "currentColor"),
          show: get(graphFormat, ["yAxis", "show"], true),
          format: getFormatFunc(get(graphFormat, ["yAxis", "format"]), get(graphFormat, ["yAxis", "isDollars"])),
          // Tick thinning for the numeric value axis. `tickSpacing` = an explicit
          // step (a tick every N units); `ticks` = an approximate count. Unset →
          // the renderer's ~10-tick default (BC). The editor exposes "Tick Spacing".
          tickSpacing: get(graphFormat, ["yAxis", "tickSpacing"]),
          ticks: get(graphFormat, ["yAxis", "ticks"]),
          // Custom y-domain (unset → auto-scale). Read by the avl-graph LineGraph.
          domainMin: get(graphFormat, ["yAxis", "domainMin"]),
          domainMax: get(graphFormat, ["yAxis", "domainMax"]),
          // Axis typography — unset keys leave the axis renderer's BC defaults.
          ...axisFontProps(graphFormat, "yAxis")
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
        hoverProvider={ hoverProvider }
        publishClickData={ publishClickData }
        clickProvider={ clickProvider }/>

    </div>
  )
}
