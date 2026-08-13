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
    colorsByKey,
    showScaleFilter,
    onSetDomainMax
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
    // Same named formatFn the xAxis tick labels use (e.g. "epoch_time" for a raw
    // 5-min-of-day index → "6:40") — without this, each avl-graph chart type's
    // DefaultHoverComp falls back to its own bare Identity/no-op default for the
    // index/x value, so the tooltip shows a raw epoch integer while the axis right
    // below it shows the formatted clock time.
    const xNamedFormat = get(graphFormat, ["xAxis", "format"]);
    // `epoch_time` is bucket-width-sensitive: a resolution that pre-divides the
    // epoch column (15-minute, hourly) makes each tick index worth more than 5
    // minutes. Absent, the formatter keeps its 5-minute default.
    const xFormat = xNamedFormat
      ? getFormatFunc(xNamedFormat, false, { epochMinutesPerUnit: get(graphFormat, ["xAxis", "epochMinutesPerUnit"]) })
      : undefined;
    return {
      ...graphFormat.tooltip,
      // map config `showTotal` → avl-graph DefaultHoverComp `showTotals` (default true = BC)
      showTotals: get(graphFormat, ["tooltip", "showTotal"], true),
      valueFormat: getTooltipFormatFunc(get(graphFormat, ["tooltip", "valueFormat"]), isDollars),
      // LineGraph's DefaultHoverComp reads yFormat (not valueFormat) for both the
      // per-line value and the Line Total — this was still going through the raw
      // getFormatFunc (bare identity default), so an unformatted measure leaked
      // full floating-point noise into the tooltip (e.g. "21.66106715604913")
      // instead of getTooltipFormatFunc's documented 1-decimal-rounding default,
      // which `valueFormat` above already correctly uses for every other chart
      // type's tooltip. Reported live 2026-08-12 on a Route Line Graph.
      yFormat: getTooltipFormatFunc(get(graphFormat, ["tooltip", "yFormat"]), isDollars),
      // LineGraph's DefaultHoverComp reads `xFormat`; Bar/Pie/Treemap/Sunburst read
      // `indexFormat` for the same value (their own "index" IS the x-axis category) —
      // supply both so whichever chart type is active picks up the right one.
      // GridGraph is the one exception: its "index" means the Y-AXIS ROW (e.g. a TMC
      // string), a completely different value from the x-axis key, which GridGraph's
      // own DefaultHoverComp instead reads via `keyFormat` (the tooltip's column
      // header, `keyFormat(data.key)`). Feeding the x-axis formatter into
      // `indexFormat` for GridGraph applied `epoch_time`'s `+d` numeric coercion to a
      // TMC string, silently producing the literal text "NaN:NaN" for every row label
      // — reported live 2026-08-04 as "the [GridGraph] tooltip says NaN instead of the
      // real value". Omit the keys entirely when there's no named format (rather than
      // setting them to `undefined`) — each avl-graph component's
      // `{ ...Defaults, ...hoverComp }` merge spreads keys regardless of value, so an
      // explicit `undefined` here clobbers that component's own Identity/no-op default
      // and throws on hover.
      ...(xFormat
        ? (graphType === "GridGraph" ? { xFormat, keyFormat: xFormat } : { xFormat, indexFormat: xFormat })
        : {}),
      // Per-graph minutes/seconds auto-switch (GridGraph's legend only, see
      // formatMinutesAuto) — a raw boolean, not resolved through
      // getFormatFunc, since the actual formatter needs this graph's own
      // domain max, unknown at this point.
      minutesAutoSeconds: Boolean(get(graphFormat, ["tooltip", "minutesAutoSeconds"], false))
    };
  }, [graphFormat.tooltip, graphFormat.xAxis, graphType]);

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

        // Author-typed custom X ticks (DomainEditor) — forces the x-axis to exactly
        // this list/order, inserting zero-value placeholders for ticks the data
        // doesn't have and dropping any data outside the list. Bar/Line only.
        useCustomXDomain={ get(graphFormat, "useCustomXDomain", false) }
        xDomain={ get(graphFormat, "xDomain") }

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
            // See the hoverComp note above re: epochMinutesPerUnit — the tick
            // labels and the tooltip must resolve the same formatter, or they
            // disagree with each other on a coarse resolution.
            if (namedFormat) return getFormatFunc(namedFormat, false, { epochMinutesPerUnit: get(graphFormat, ["xAxis", "epochMinutesPerUnit"]) });
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
        clickProvider={ clickProvider }

        // Scale Filter (BarGraph only — every other chart type ignores these).
        showScaleFilter={ showScaleFilter }
        onSetDomainMax={ onSetDomainMax }/>

    </div>
  )
}
