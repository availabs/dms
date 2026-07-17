import React from "react"

import { scaleBand, scaleLinear } from "d3-scale"
import { select as d3select } from "d3-selection"
import { range as d3range } from "d3-array"
import { format as d3format } from "d3-format"

import isEqual from "lodash/isEqual"
import get from "lodash/get"

import {
  AxisBottom,
  AxisLeft,
  AxisRight,
  HoverCompContainer,
  useHoverComp
} from "./components"

import {
  getColorFunc,
  Identity,
  EmptyArray,
  EmptyObject,
  DefaultMargin,
  DefaultXScale,
  DefaultYScale,
  strictNaN,
  getScale,
  useSetSize
} from "./utils"

import "./avl-graph.css"

const DefaultHoverComp = ({ data, keys, indexFormat, keyFormat, valueFormat, valueLabel, showTotals = true }) => {
  return (
    <div className={ `
      flex flex-col px-2 pt-1 rounded
      ${ keys.length <= 1 ? "pb-2" : "pb-1" }
    ` }>
      <div className="font-bold text-lg leading-6 border-b-2 mb-1 pl-2">
        { indexFormat(get(data, "index", null)) }
      </div>
      { keys.filter(key => get(data, ["data", key], false))
          .reverse().map(key => (
            <div key={ key } className={ `
              flex items-center px-2 border-2 rounded transition
              ${ data.key === key ? "border-current" : "border-transparent" }
            `}>
              <div className="mr-2 rounded-sm color-square w-5 h-5"
                style={ {
                  backgroundColor: get(data, ["barValues", key, "color"], null),
                  opacity: data.key === key ? 1 : 0.2
                } }/>
              <div className="mr-4">
                { keyFormat(key) }:
              </div>
              <div className="text-right flex-1">
                { valueFormat(get(data, ["data", key], 0)) }
                { !valueLabel ? null :
                  <b className="ml-1">{ valueLabel }</b>
                }
              </div>
            </div>
          ))
      }
      { (keys.length <= 1) || !showTotals ? null :
        <div className="flex pr-2">
          <div className="w-5 mr-2"/>
          <div className="mr-4 pl-2">
            Total:
          </div>
          <div className="flex-1 text-right">
            {  valueFormat(keys.reduce((a, c) => a + get(data, ["data", c], 0), 0)) }
          </div>
        </div>
      }
    </div>
  )
}
const DefaultHoverCompData = {
  HoverComp: DefaultHoverComp,
  indexFormat: Identity,
  keyFormat: Identity,
  valueFormat: Identity,
  valueLabel: null,
  position: "side",
  showTotals: true
}

const InitialState = {
  xDomain: [],
  yDomain: [],
  XScale: scaleBand(),
  YScale: scaleLinear(),
  adjustedWidth: 0,
  adjustedHeight: 0,
  barData: [],
  hasData: false
}

export const BarGraph = props => {

  const {
    data = EmptyArray,
    keys = EmptyArray,
    margin = EmptyObject,
    hoverComp = EmptyObject,
    axisBottom = null,
    xScale = EmptyObject,
    axisLeft = null,
    axisRight = null,
    yScale = EmptyObject,
    indexBy = "index",
    className = "",
    paddingInner = 0,
    paddingOuter = 0,
    padding,
    colors,
    groupMode = "stacked",
    orientation = "vertical",
    showAnimations = false,
    theme = EmptyObject,
    addons = EmptyArray,
    highlights = EmptyArray,
    barOpacity = null,
    onBarEnter = null,
    onBarLeave = null,
    onStackEnter = null,
    onStackLeave = null
  } = props;

  const Margin = React.useMemo(() => {
    return { ...DefaultMargin, ...margin };
  }, [margin]);

  const HoverCompData = React.useMemo(() => {
    const hcData = { ...DefaultHoverCompData, ...hoverComp };
    if (typeof hcData.indexFormat === "string") {
      hcData.indexFormat = d3format(hcData.indexFormat);
    }
    if (typeof hcData.keyFormat === "string") {
      hcData.keyFormat = d3format(hcData.keyFormat);
    }
    if (typeof hcData.valueFormat === "string") {
      hcData.valueFormat = d3format(hcData.valueFormat);
    }
    return hcData;
  }, [hoverComp]);

  const AxisBottomData = React.useMemo(() => {
    if (!axisBottom) return false;
    const AxisBottomData = { ...axisBottom };
    if (typeof axisBottom.format === "string") {
      AxisBottomData.format = d3format(axisBottom.format);
    }
    return AxisBottomData;
  }, [axisBottom]);

  const AxisLeftData = React.useMemo(() => {
    if (!axisLeft) return false;
    const AxisLeftData = { ...axisLeft };
    if (typeof axisLeft.format === "string") {
      AxisLeftData.format = d3format(axisLeft.format);
    }
    return AxisLeftData;
  }, [axisLeft]);

// console.log("BarGraph::AxisLeftData", AxisLeftData);

  const AxisRightData = React.useMemo(() => {
    if (!axisRight) return false;
    const AxisRightData = { ...axisRight };
    if (typeof axisRight.format === "string") {
      AxisRightData.format = d3format(axisRight.format);
    }
    return AxisRightData;
  }, [axisRight]);

  const colorFunc = React.useMemo(() => {
    return getColorFunc(colors);
  }, [colors]);

  const ref = React.useRef(),
    { width, height } = useSetSize(ref),
    [state, setState] = React.useState(InitialState);

  const PREVIOUS_BAR_DATA = React.useRef(new Map());

  const isHorizontal = orientation === "horizontal";

  // Opt-in continuous x-axis: a non-"band" xScale.type (e.g. "time" / "linear") positions bars at
  // their real x-value with proportional gaps instead of equal-width categories. Default is "band"
  // (unchanged). coerceX maps the index value into the scale's domain type.
  const xScaleType = (xScale && xScale.type) || DefaultXScale.type;
  const isXBand = xScaleType === "band";
  const coerceX = xScaleType === "time" ? (v => new Date(v))
    : xScaleType === "linear" ? (v => +v)
    : (v => v);

// console.log("BarGraph::width, height", width, height);

  React.useEffect(() => {

    if (!(width && height)) return;

    const adjustedWidth = Math.max(0, width - (Margin.left + Margin.right)),
      adjustedHeight = Math.max(0, height - (Margin.top + Margin.bottom));

    const xdGetter = data => data.map(d => coerceX(get(d, indexBy, null)));
    // Non-band x-axis: build a [min,max] extent domain (band uses the full category list).
    let xDomainOverride;
    if (!isXBand) {
      const nums = data.map(d => +coerceX(get(d, indexBy, null))).filter(n => isFinite(n));
      if (nums.length) {
        const lo = Math.min(...nums), hi = Math.max(...nums);
        // Pad the domain by ~half the smallest gap between values, so the first/last bars (which
        // are centered on their value) sit fully inside the plot instead of hanging half off the
        // y-axis / right edge. Uses the data's own step, so it scales with the granularity.
        const uniq = [...new Set(nums)].sort((a, b) => a - b);
        let gap = Infinity;
        for (let i = 1; i < uniq.length; i++) gap = Math.min(gap, uniq[i] - uniq[i - 1]);
        if (!isFinite(gap) || gap <= 0) gap = (hi - lo) || 86400000; // 1-day fallback
        const padD = gap / 2;
        xDomainOverride = xScaleType === "time" ? [new Date(lo - padD), new Date(hi + padD)] : [lo - padD, hi + padD];
      }
    }
    const XScale = getScale({ ...DefaultXScale, ...xScale,
                              getter: xdGetter, data,
                              ...(xDomainOverride ? { domain: xDomainOverride } : {}),
                              range: isHorizontal ? [adjustedHeight, 0] : [0, adjustedWidth],
                              padding, paddingInner, paddingOuter
                            });
    const xDomain = XScale.domain();

    // Bar cross-axis size: band scales expose bandwidth()/step(); a continuous scale doesn't, so
    // derive a width from the smallest gap between adjacent bar positions (proportional spacing).
    let bandwidth, step, outer;
    if (isXBand) {
      bandwidth = XScale.bandwidth();
      step = XScale.step();
      outer = XScale.paddingOuter() * step;
    } else {
      const px = data.map(d => XScale(coerceX(get(d, indexBy, null)))).filter(n => isFinite(n)).sort((a, b) => a - b);
      let minGap = Infinity;
      for (let i = 1; i < px.length; i++) minGap = Math.min(minGap, px[i] - px[i - 1]);
      if (!isFinite(minGap) || minGap <= 0) minGap = (isHorizontal ? adjustedHeight : adjustedWidth) * 0.06;
      const inner = (padding != null ? padding : paddingInner) || 0;
      bandwidth = Math.max(2, minGap * (1 - inner));
      step = minGap;
      outer = 0;
    }
    // Bar cross-position: band → scale gives the slot's leading edge; continuous → center on the value.
    const barPos = d => isXBand ? XScale(get(d, indexBy)) : (XScale(coerceX(get(d, indexBy))) - bandwidth / 2);

    // Value-axis domain. Always spans zero ([min(0, lo), max(0, hi)]) so
    // negative values render as bars extending away from a zero baseline
    // (difference/diverging charts) instead of clamping to zero-height —
    // for all-positive data this is exactly the old [0, max] domain.
    const ydGetter = data => {
      if (xDomain.length) {
        let lo = Infinity, hi = -Infinity;
        if (groupMode === "stacked") {
          // Positives and negatives stack away from zero separately, so a
          // bar's extents are its positive sum and its negative sum — not
          // one signed total (which mixed signs would understate).
          data.forEach(c => {
            let pos = 0, neg = 0, valid = false;
            keys.forEach(k => {
              const v = get(c, k, 0);
              if (strictNaN(v)) return;
              valid = true;
              if (v >= 0) pos += v;
              else neg += v;
            });
            if (valid) {
              lo = Math.min(lo, neg);
              hi = Math.max(hi, pos);
            }
          });
        }
        else if (groupMode === "grouped") {
          data.forEach(c => {
            keys.forEach(k => {
              const v = get(c, k, 0);
              if (strictNaN(v)) return;
              lo = Math.min(lo, v);
              hi = Math.max(hi, v);
            });
          });
        }
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
        return [Math.min(0, lo), Math.max(0, hi)];
      }
      else {
        return [0, 0];
      }
    }

    const YScale = getScale({ ...DefaultYScale, ...yScale,
                              getter: ydGetter, data,
                              range: isHorizontal ? [0, adjustedWidth] : [adjustedHeight, 0],
                              padding, paddingInner, paddingOuter
                            });
    let yDomain = YScale.domain();

    const zeroYdomain = (yDomain[0] === 0) && (yDomain[1] === 0);
    if (zeroYdomain) {
      YScale.range([adjustedHeight, adjustedHeight]);
      yDomain = [];
    }

    const NEXT_BAR_DATA = new Map();

    const barData = [];

    data.forEach((d, i) => {

      const id = d[indexBy].toString();

      let stackData = null;

      const barValues = {};

      if (groupMode === "stacked") {
        // Segments are measured from the zero baseline (YScale(0)) so
        // negative values stack away from zero on their own side. With an
        // all-positive [0, max] domain, zero sits at the axis (adjustedHeight
        // vertical / 0 horizontal) and this is exactly the old geometry.
        const zero = YScale(0);
        let posCurrent = zero;
        let negCurrent = zero;

        const stacks = keys.map((key, ii) => {
          const value = get(d, key, 0),
            segLen = Math.abs(YScale(value) - zero) || 0,
            color = colorFunc(value, ii, key, d);

          let x, y;
          if (isHorizontal) {
            y = 0;
            if (value >= 0) { x = posCurrent; posCurrent += segLen; }
            else { negCurrent -= segLen; x = negCurrent; }
          }
          else {
            x = 0;
            if (value >= 0) { posCurrent -= segLen; y = posCurrent; }
            else { y = negCurrent; negCurrent += segLen; }
          }

          barValues[key] = { value, color };

          return {
            data: d,
            key,
            width: isHorizontal ? segLen : bandwidth,
            height: isHorizontal ? bandwidth : segLen,
            index: d[indexBy],
            y,
            x,
            color,
            value,
            barValues
          };
        });

        stackData = {
          stacks,
          barValues,
          left: isHorizontal ? 0 : barPos(d),
          top: isHorizontal ? barPos(d) : 0,
          data: d,
          state: PREVIOUS_BAR_DATA.current.delete(id) ? "updating" : "entering",
          id
        }
      }
      else if (groupMode === "grouped") {
        // Same zero-baseline treatment as the stacked branch: each bar spans
        // from YScale(0) to YScale(value), so negatives extend below/left of
        // the baseline. All-positive [0, max] domain → old geometry exactly.
        const zero = YScale(0);
        const stacks = keys.map((key, ii) => {
          const value = get(d, key, 0),
            segLen = Math.abs(YScale(value) - zero) || 0,
            valuePos = isHorizontal
              ? (value >= 0 ? zero : YScale(value))
              : (value >= 0 ? YScale(value) : zero),
            color = colorFunc(value, ii, key, d);

          barValues[key] = { value, color };

          const stack = {
              data: d,
              key,
              width: isHorizontal ? segLen : bandwidth / keys.length,
              height: isHorizontal ? bandwidth / keys.length : segLen,
              index: d[indexBy],
              y: isHorizontal ? (bandwidth / keys.length) * ii : valuePos,
              x: isHorizontal ? valuePos : (bandwidth / keys.length) * ii,
              color,
              value,
              barValues
            };
          return stack;
        });

        stackData = {
          stacks,
          barValues,
          left: isHorizontal ? 0 : (isXBand ? outer + i * step : barPos(d)),
          top: isHorizontal ? (isXBand ? adjustedHeight - (outer + (i + 1) * step) : barPos(d)) : 0,
          data: d,
          state: PREVIOUS_BAR_DATA.current.delete(id) ? "updating" : "entering",
          id
        };
      }

      if (stackData) {
        NEXT_BAR_DATA.set(id, stackData);
        barData.push(stackData);
      }
    });
// END data.forEach

    const hasData = Boolean(barData.length);

    if (showAnimations) {
      for (const d of PREVIOUS_BAR_DATA.current.values()) {
        barData.push({ ...d, state: "exiting" });
      }
    }

    setState({
      xDomain, yDomain, XScale, YScale,
      adjustedWidth, adjustedHeight,
      barData, hasData
    });

    PREVIOUS_BAR_DATA.current = NEXT_BAR_DATA;

  }, [data, keys, width, height, groupMode,
      Margin, colorFunc, indexBy, orientation,
      padding, paddingInner, paddingOuter, showAnimations
    ]
  );

  const {
    xDomain, XScale,
    yDomain, YScale,
    barData, hasData,
    ...restOfState
  } = state;

  const {
    onMouseMove,
    onMouseLeave,
    hoverData
  } = useHoverComp(ref);

  const {
    HoverComp,
    position,
    show: showHoverComp,
    ...restOfHoverCompData
  } = HoverCompData;

  return (
    <div className="w-full h-full avl-graph-container relative" ref={ ref }>

      <svg className={ `w-full h-full block avl-graph ${ className }` }>
        { isHorizontal ?
          <g>
            { !AxisBottomData ? null :
              <AxisBottom type="linear"
                { ...restOfState }
                margin={ Margin }
                scale={ YScale }
                domain={ yDomain }
                showAnimations={ showAnimations }
                hasData={ hasData }
                { ...AxisBottomData }/>
            }
            { !AxisLeftData ? null :
              <AxisLeft type={ isXBand ? "band" : "linear" }
                { ...restOfState }
                margin={ Margin }
                scale={ XScale }
                domain={ xDomain }
                showAnimations={ showAnimations }
                hasData={ hasData }
                { ...AxisLeftData }/>
            }
            { !AxisRightData ? null :
              <AxisRight type="band"
                { ...restOfState }
                margin={ Margin }
                scale={ XScale }
                domain={ xDomain }
                showAnimations={ showAnimations }
                hasData={ hasData }
                { ...AxisRightData }/>
            }
          </g> :
          <g>
            { !AxisBottomData ? null :
              <AxisBottom type={ isXBand ? "band" : "linear" }
                { ...restOfState }
                margin={ Margin }
                scale={ XScale }
                domain={ xDomain }
                showAnimations={ showAnimations }
                hasData={ hasData }
                { ...AxisBottomData }/>
            }
            { !AxisLeftData ? null :
              <AxisLeft type="linear"
                { ...restOfState }
                margin={ Margin }
                scale={ YScale }
                domain={ yDomain }
                showAnimations={ showAnimations }
                hasData={ hasData }
                { ...AxisLeftData }/>
            }
            { !AxisRightData ? null :
              <AxisRight type="linear"
                { ...restOfState }
                margin={ Margin }
                scale={ YScale }
                domain={ yDomain }
                showAnimations={ showAnimations }
                hasData={ hasData }
                { ...AxisRightData }/>
            }
          </g>
        }
        <g style={ { transform: `translate(${ Margin.left }px, ${ Margin.top }px)` } }
          onMouseLeave={ onMouseLeave }
        >
          { barData.map(({ id, ...rest }) =>
              <Bar key={ id } index={ id } { ...rest }
                svgHeight={ state.adjustedHeight }
                onMouseMove={ onMouseMove }
                showAnimations={ showAnimations }
                barOpacity={ barOpacity }
                highlights={ highlights }
                onBarEnter={ onBarEnter }
                onBarLeave={ onBarLeave }
                onStackEnter={ onStackEnter }
                onStackLeave={ onStackLeave }/>
            )
          }
          { !barData.length ? null :
            addons.map((AddOn, i) => (
              <AddOn key={ i } { ...state }
                xScale={ XScale }
                yScale={ YScale }
                showAnimations={ showAnimations }/>
            ))
          }
        </g>
      </svg>

      { !showHoverComp ? null :
        <HoverCompContainer { ...hoverData }
          position={ position }
          svgWidth={ width }
          svgHeight={ height }
          margin={ Margin }
          theme={ theme }
        >
          { !hoverData.data ? null :
            <HoverComp data={ hoverData.data } keys={ keys }
              { ...restOfHoverCompData }/>
          }
        </HoverCompContainer>
      }

    </div>
  )
}

const Stack = React.memo(props => {

  const {
    state,
    width,
    svgHeight,
    height,
    y,
    x,
    color,
    onMouseMove,
    Key, index, value, data, barValues,
    showAnimations,
    highlight,
    barOpacity,
    onStackEnter,
    onStackLeave
  } = props;

  const ref = React.useRef();

  const transitionWrapper = React.useMemo(() => {
    return showAnimations ?
      selection => selection.transition().duration(1000) :
      selection => selection;
  }, [showAnimations]);

  React.useEffect(() => {
    if (state === "entering") {
      const selection = d3select(ref.current)
        .attr("width", width)
        .attr("height", 0)
        .attr("x", x)
        .attr("y", svgHeight);

      transitionWrapper(selection)
          .attr("height", height)
          .attr("y", y)
          .attr("fill", color);
    }
    else if (state === "exiting") {
      transitionWrapper(d3select(ref.current))
        .attr("height", 0)
        .attr("y", svgHeight);
    }
    else {
      transitionWrapper(d3select(ref.current))
        .attr("height", height)
        .attr("x", x)
        .attr("y", y)
        .attr("width", width)
        .attr("fill", color);
    }
  }, [ref, state, width, svgHeight, height, x, y, color, transitionWrapper]);

  // const highlight = React.useMemo(() => {
  //   const filtered = highlights.filter(h => h.type === "key" && h.value === Key);
  //   return Boolean(filtered.length);
  // }, [highlights, Key]);

  const _onMouseMove = React.useCallback(e => {
    onMouseMove(e, { color, key: Key, index, value, data, barValues });
  }, [onMouseMove, color, Key, index, value, data, barValues]);

  const doOnStackEnter = React.useMemo(() => {
    if (typeof onStackEnter === "function") {
      return e => {
        onStackEnter(e, { index, key: Key, data });
      }
    }
  }, [onStackEnter, index, Key, data]);

  const doOnStackLeave = React.useMemo(() => {
    if (typeof onStackLeave === "function") {
      return e => {
        onStackLeave(e, { index, key: Key, data });
      }
    }
  }, [onStackLeave, index, Key, data]);

  return (
    <rect className="avl-stack" ref={ ref }
      style={ {
        fill: highlight ? "red" : null,
        // highlight always wins (full opacity); otherwise an explicit barOpacity
        // sets the fill inline (overriding the CSS 0.75). null → CSS governs (BC).
        fillOpacity: highlight ? 1.0 : (barOpacity ?? null)
      } }
      onMouseMove={ _onMouseMove }
      onMouseEnter={ doOnStackEnter }
      onMouseLeave={ doOnStackLeave }/>
  )
})

const Bar = React.memo(props => {

  const {
    stacks,
    index,
    left = 0, top = 0,
    state,
    showAnimations,
    highlights,
    onBarEnter,
    onBarLeave,
    ...restOfProps
  } = props;

  const ref = React.useRef();

  React.useEffect(() => {
    if (state === "entering") {
      d3select(ref.current)
        .attr("transform", `translate(${ left } ${ top })`);
    }
    else {
      const selection = d3select(ref.current);
      if (showAnimations) {
        selection.transition().duration(1000)
          .attr("transform", `translate(${ left } ${ top })`);
      }
      else {
        selection.attr("transform", `translate(${ left } ${ top })`);
      }
    }
  }, [ref, state, left, top, showAnimations]);

  const highlight = React.useMemo(() => {
    const filtered = highlights.filter(h => h.type === "index" && h.value == index);
    return Boolean(filtered.length);
  }, [highlights, index]);

  const doOnBarEnter = React.useMemo(() => {
    if (typeof onBarEnter === "function") {
      return e => {
        onBarEnter(e, { index, stacks })
      }
    }
  }, [onBarEnter, index, stacks]);

  const doOnBarLeave = React.useMemo(() => {
    if (typeof onBarLeave === "function") {
      return e => {
        onBarLeave(e, { index, stacks })
      }
    }
  }, [onBarLeave, index, stacks]);

  return (
    <g className="avl-bar" ref={ ref }
      onMouseEnter={ doOnBarEnter }
      onMouseLeave={ doOnBarLeave }
    >
      { stacks.map(({ key, ...rest }, i) =>
          <Stack key={ key } Key={ key } state={ state }
            { ...restOfProps } { ...rest }
            showAnimations={ showAnimations }
            highlight={
              highlight || Boolean(highlights.find(h => h.type === "key" && h.value == key))
            }/>
        )
      }
    </g>
  )
})

export const generateTestBarData = (bars = 50, stacks = 5) => {
  const data = [], keys = [];

  d3range(stacks).forEach(s => {
    keys.push(`stack-${ s }`);
  });

  d3range(bars).forEach(b => {
    const bar = {
      index: `bar-${ b }`
    }
    keys.forEach(k => {
      const rand = Math.random() * 400 + 100;
      bar[k] = rand + (Math.random() * rand);
    })
    data.push(bar);
  });

  return { data, keys };
}
