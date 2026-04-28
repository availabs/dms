import React from "react"

import { select as d3select } from "d3-selection"
import { transition as d3transition } from "d3-transition"
import { axisRight as d3AxisRight } from "d3-axis"
// import { scaleLinear } from "d3-scale"

export const AxisRight = props => {
  const {
    adjustedWidth, adjustedHeight, showGridLines = true, gridLineOpacity = 0.25, axisColor = "currentColor", axisOpacity = 1,
    domain, scale, format, type = "linear", showAnimations = true,
    secondary, label, margin, ticks = 10, tickValues, hasData, tickDensity = 8
  } = props;

  const ref = React.useRef();

  React.useEffect(() => {
    if (ref.current) {
      renderAxisRight({
        ref: ref.current, showAnimations,
        adjustedWidth, adjustedHeight,
        domain, scale, type, format,
        secondary, label, margin, ticks, tickValues, tickDensity,
        showGridLines, gridLineOpacity, axisColor, axisOpacity, hasData
      });
    }
  }, [adjustedWidth, adjustedHeight, showGridLines,
      domain, scale, type, format, showAnimations,
      secondary, label, margin, ticks, tickValues,
      gridLineOpacity, axisColor, axisOpacity, hasData]
  );

  return <g ref={ ref }/>;
}

const renderAxisRight = ({ ref, showAnimations,
                    adjustedWidth,
                    adjustedHeight,
                    domain, scale, type, format,
                    secondary, label,
                    margin, ticks, tickValues, tickDensity,
                    showGridLines, gridLineOpacity,
                    axisColor, axisOpacity, hasData }) => {

  const { left, right, top } = margin;

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

  const axisRight = d3AxisRight(scale)
    .tickFormat(format);

  if (tickValues) {
    axisRight.tickValues(tickValues);
  }
  else if (ticks) {
    axisRight.ticks(ticks);
  }

  if (!hasData) {
    axisRight.tickValues([]);
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
          enter.style("transform", `translate(${ adjustedWidth + left }px, ${ top }px)`)
        ),
      update => update
        .call(
          update => transitionWrapper(update)
            .style("transform", `translate(${ adjustedWidth + left }px, ${ top }px)`)
        ),
      exit => exit
        .call(exit =>
          transitionWrapper(exit)
            .style("transform", `translate(${ adjustedWidth + left }px, ${ top }px)`)
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
    .data(domain.length ? ["axis-right"] : [])
    .join("g")
      .attr("class", "axis axis-right");

  transitionWrapper(gaxis)
    .call(axisRight)
    .call(g => g.selectAll(".tick line")
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", gridLineOpacity)
    )
    .select(".domain")
    .attr("stroke", axisColor)
    .attr("opacity", axisOpacity);

  group.selectAll("g.axis.axis-right .domain")
    .attr("stroke-dasharray", secondary ? "8 4" : null);

  group.selectAll("text.axis-label")
    .data(domain.length && Boolean(label) ? [label] : [])
    .join("text")
      .attr("class", "axis-label axis-label-right")
      .style("transform",
        `translate(${ right - 20 }px, ${ adjustedHeight * 0.5 }px) rotate(90deg)`
      )
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", "1rem")
      .text(d => d);

  if (type !== "linear" || !showGridLines) return;

  const gridLines = group.selectAll("line.grid-line"),
    numGridLines = gridLines.size(),
    numTicks = scale.ticks().length,

    gridEnter = numGridLines && (numGridLines < numTicks) ?
      scale(domain[1] * 1.5) : scale(0),

    gridExit = scale(domain[1] * 1.5);

  gridLines
    .data(domain.length ? scale.ticks() : [])
    .join(
      enter => enter.append("line")
        .attr("class", "grid-line")
        .attr("stroke-dasharray", secondary ? "8 4" : null)
        .attr("x1", 0)
        .attr("x2", -adjustedWidth)
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
            .attr("x2", -adjustedWidth)
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
