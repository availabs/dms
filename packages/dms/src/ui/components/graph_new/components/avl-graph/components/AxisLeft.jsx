import React from "react"

import { select as d3select } from "d3-selection"
import { transition as d3transition } from "d3-transition"
import { axisLeft as d3AxisLeft } from "d3-axis"

export const AxisLeft = props => {
  const {
    adjustedWidth, adjustedHeight, showGridLines = true, showAnimations = true,
    gridLineOpacity = 0.25, axisColor = "currentColor", axisOpacity = 1,
    domain, scale, format, type = "linear", hasData = true, rotateLabels = false,
    secondary, label, margin, ticks = 10, tickValues, tickSpacing, tickDensity = 8, show = true,
    // Axis typography (theme/per-section). Tick keys unset → inherit the CSS default
    // (`.tick text { font-size: 0.75rem }`, currentColor) so the render is BC. Label
    // keys default to the historical literals.
    tickFontSize, tickFontFamily, tickFontWeight, tickColor,
    labelFontSize = "1rem", labelFontFamily, labelFontWeight = "bold", labelColor = "currentColor"
  } = props;

  const ref = React.useRef();

  React.useEffect(() => {
    if (ref.current) {
      renderAxisLeft({
        ref: ref.current, showAnimations,
        adjustedWidth, adjustedHeight,
        domain, scale, type, format, showAxis: show,
        secondary, label, margin, rotateLabels,
        ticks, tickValues, tickSpacing, showGridLines, gridLineOpacity,
        axisColor, axisOpacity, tickDensity, hasData,
        tickFontSize, tickFontFamily, tickFontWeight, tickColor,
        labelFontSize, labelFontFamily, labelFontWeight, labelColor
      });
    }
  }, [adjustedWidth, adjustedHeight, showGridLines, hasData,
      domain, scale, type, format, showAnimations, rotateLabels,
      secondary, label, margin, ticks, tickValues, tickSpacing, show,
      gridLineOpacity, axisColor, axisOpacity, tickDensity,
      tickFontSize, tickFontFamily, tickFontWeight, tickColor,
      labelFontSize, labelFontFamily, labelFontWeight, labelColor]
  );

  return <g ref={ ref }/>;
}

const renderAxisLeft = ({ ref, showAnimations, rotateLabels,
                        adjustedWidth, adjustedHeight,
                        domain, scale, type, format,
                        secondary, label, margin, showAxis,
                        ticks, tickValues, tickSpacing, showGridLines, gridLineOpacity,
                        axisColor, axisOpacity, tickDensity, hasData,
                        tickFontSize, tickFontFamily, tickFontWeight, tickColor,
                        labelFontSize, labelFontFamily, labelFontWeight, labelColor }) => {

  if (!showAxis) {
    domain = [];
  };

  const { left, top } = margin;

  if (!tickValues && (type === "band")) {
    const ticks = Math.ceil(adjustedHeight / 100 * tickDensity),
      mod = Math.ceil(domain.length / ticks),
      halfMod = Math.floor(mod * 0.5);

    tickValues = domain.filter((d, i) =>
      (mod === 1 || (i > 0)) &&
      (mod === 1 || (i < (domain.length - 1))) &&
      !((i - halfMod) % mod)
    );
  }
  else if (!tickValues && (type === "ordinal")) {
    const density = 100 / tickDensity;
    let tick = 0;
    tickValues = [];

    for (let i = 0; i < domain.length; ++i) {
      if (i > 0) {
        tick += scale(domain[i]) - scale(domain[i - 1]);
      }
      if (!tickValues.length && (tick >= density * 0.5)) {
        tickValues.push(domain[i]);
        tick = 0;
      }
      else if (tick >= density) {
        tickValues.push(domain[i]);
        tick = 0;
      }
    }
  }

// console.log("renderAxisLeft::format", format);

  // Explicit tick STEP (e.g. a tick every 50 units) — for a numeric value axis,
  // overrides the approximate `ticks` count so an author can thin a busy axis to
  // exactly the rounds they want. Reads the live scale domain so it tracks the data.
  if (!tickValues && tickSpacing && type !== "band" && type !== "ordinal" && typeof scale?.domain === "function") {
    const dom = scale.domain();
    const lo = Math.min(dom[0], dom[dom.length - 1]);
    const hi = Math.max(dom[0], dom[dom.length - 1]);
    const step = Math.abs(+tickSpacing);
    if (step > 0 && isFinite(lo) && isFinite(hi)) {
      tickValues = [];
      for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) tickValues.push(v);
    }
  }

  const axisLeft = d3AxisLeft(scale)
    .tickFormat(format);

  if (tickValues) {
    axisLeft.tickValues(tickValues);
  }
  else if (ticks) {
    axisLeft.ticks(ticks);
  }

  if (!hasData) {
    axisLeft.tickValues([]);
  }

  const transition = d3transition().duration(1000);

  const transitionWrapper = selection => {
    return showAnimations ? selection.transition(transition) : selection;
  }

  const animatedGroup = d3select(ref)
    .selectAll("g.animated-group")
    .data(["animated-group"])
    .join(
      enter => enter.append("g")
        .attr("class", "animated-group")
        .call(enter =>
          enter.style("transform", `translate(${ left }px, ${ top }px)`)
        ),
      update => update
        .call(
          update => transitionWrapper(update)
            .style("transform", `translate(${ left }px, ${ top }px)`)
        ),
      exit => exit
        .call(exit =>
          transitionWrapper(exit)
            .style("transform", `translate(${ left }px, ${ top }px)`)
          .remove()
        )
    );

  const group = animatedGroup.selectAll("g.axis-group")
    .data(domain.length ? ["axis-group"] : [])
      .join(
        enter => enter.append("g")
          .attr("class", "axis-group")
          .call(enter =>
            transitionWrapper(enter.style("transform", `translateY(${ adjustedHeight }px) scale(0, 0)`))
              .style("transform", "translateY(0px) scale(1, 1)")
          ),
        update => update
          .call(update =>
            transitionWrapper(update)
              .style("transform", "translateY(0px) scale(1, 1)")
          ),
        exit => exit
          .call(exit =>
            transitionWrapper(exit)
              .style("transform", `translateY(${ adjustedHeight }px) scale(0, 0)`)
            .remove()
          )
      );

  const gaxis = group.selectAll("g.axis")
    .data(domain.length ? ["axis-left"] : [])
    .join("g")
      .attr("class", "axis axis-left")
        .classed("secondary", secondary);

  transitionWrapper(gaxis)
        .call(axisLeft)
        .call(g => g.selectAll(".tick line")
                    .attr("stroke", "currentColor")
                    .attr("stroke-opacity", gridLineOpacity)
        )
        .select(".domain")
          .attr("stroke", axisColor)
          .attr("opacity", axisOpacity);

  group.selectAll("text.axis-label")
    .data(domain.length && Boolean(label) ? [label] : [])
    .join("text")
      .attr("class", "axis-label axis-label-left")
      .style("transform",
        `translate(${ -left + 20 }px, ${ adjustedHeight * 0.5 }px) rotate(-90deg)`
      )
      .attr("text-anchor", "middle")
      .attr("fill", labelColor)
      .style("font-size", labelFontSize)
      .style("font-weight", labelFontWeight)
      .style("font-family", labelFontFamily || null)
      .text(d => d);

  if (rotateLabels) {
    group.selectAll(".tick text")
      .attr("text-anchor", "end")
      .style("transform", `translate(-0.1rem, -0.5rem) rotate(-45deg)`)
  }
  else {
    group.selectAll(".tick text")
      .attr("text-anchor", null)
      .style("transform", null)
  }

  // Tick-label typography. Each `.style(_, null)` when unset removes the inline
  // value so the CSS default applies → BC when no token is set.
  group.selectAll(".tick text")
    .style("font-size", tickFontSize || null)
    .style("font-family", tickFontFamily || null)
    .style("font-weight", tickFontWeight || null)
    .style("fill", tickColor || null);

  const show = showGridLines &&
              Boolean(scale) &&
              Boolean(domain.length);

  if (type === "linear") {
    // Gridlines follow the same positions as the tick labels — when tickValues are
    // set (e.g. via tickSpacing) the grid thins with the labels instead of staying
    // at the default ~`ticks` density.
    const gridTicks = tickValues || scale.ticks(ticks);
    const gridLines = group.selectAll("line.grid-line"),
      numGridLines = gridLines.size(),
      numTicks = show ? gridTicks.length : 0,

      gridEnter = (numGridLines > 1) && (numGridLines < numTicks) ?
        scale(domain[1] * 1.5) : adjustedHeight,

      gridExit = show ? scale(domain[1] * 1.5) : adjustedHeight;

      gridLines
        .data(show ? gridTicks : [])
        .join(
          enter => enter.append("line")
            .attr("class", "grid-line")
            .attr("x1", 0)
            .attr("x2", adjustedWidth)
            .attr("y1", gridEnter)
            .attr("y2", gridEnter)
            .attr("stroke", "currentColor")
            .attr("stroke-opacity", gridLineOpacity)
              .call(enter => transitionWrapper(enter)
                  .attr("y1", d => scale(d) + 0.5)
                  .attr("y2", d => scale(d) + 0.5)
              ),
          update => update
            .call(update => transitionWrapper(
                update
                  .attr("stroke", "currentColor")
                  .attr("stroke-opacity", gridLineOpacity)
              )
                .attr("x2", adjustedWidth)
                .attr("y1", d => scale(d) + 0.5)
                .attr("y2", d => scale(d) + 0.5)
            ),
          exit => exit
            .call(exit => transitionWrapper(exit)
                .attr("y1", gridExit)
                .attr("y2", gridExit)
              .remove()
            )
        );
  }
  else if (type === "band" || type === "ordinal") {

    const gridLines = group.selectAll("line.grid-line"),
      numGridLines = gridLines.size(),
      numTicks = show ? domain.length : 0;

    const gridEnter = (numGridLines > 1) && (numGridLines < numTicks) ?
        scale(domain.at(-1)) : adjustedHeight;

    const gridExit = show ? scale(domain.at(-1)) : adjustedHeight;

    const shift = type === "band" ? scale.bandwidth() * 0.5 : 0;

    gridLines
      .data(show ? domain : [])
      .join(
        enter => enter.append("line")
          .attr("class", "grid-line")
          .attr("x1", 0)
          .attr("x2", adjustedWidth)
          .attr("y1", gridEnter)
          .attr("y2", gridEnter)
          .attr("stroke", "currentColor")
          .attr("stroke-opacity", gridLineOpacity)
            .call(enter => transitionWrapper(enter)
                .attr("y1", d => scale(d) + 0.5 + shift)
                .attr("y2", d => scale(d) + 0.5 + shift)
            ),
        update => update
          .call(update =>
            transitionWrapper(
              update
                .attr("stroke", "currentColor")
                .attr("stroke-opacity", gridLineOpacity)
            )
                .attr("x2", adjustedWidth)
              .attr("y1", d => scale(d) + 0.5 + shift)
              .attr("y2", d => scale(d) + 0.5 + shift)
          ),
        exit => exit
          .call(exit => transitionWrapper(exit)
              .attr("y1", gridExit)
              .attr("y2", gridExit)
            .remove()
          )
      );
  }

}
