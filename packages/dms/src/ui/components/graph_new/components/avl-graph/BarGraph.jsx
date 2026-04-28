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
  useShouldComponentUpdate,
  getScale,
  useSetSize
} from "./utils"

import "./avl-graph.css"

const DefaultHoverComp = ({ data, keys, indexFormat, keyFormat, valueFormat, showTotals = true }) => {
  return (
    <div className={ `
      flex flex-col px-2 pt-1 rounded
      ${ keys.length <= 1 ? "pb-2" : "pb-1" }
    ` }>
      <div className="font-bold text-lg leading-6 border-b-2 mb-1 pl-2">
        { indexFormat(get(data, "index", null)) }
      </div>
      { keys.slice().reverse()
        .filter(key => get(data, ["data", key], false))
        .map(key => (
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
            </div>
          </div>
        ))
      }
      { keys.length <= 1 ? null :
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
    showAnimations = true,
    theme = EmptyObject,
    addons = []
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

  const additionalKeys = React.useMemo(() => {
    return ["data", "keys"];
  }, []);

  const ShouldComponentUpdate = useShouldComponentUpdate(props, width, height, additionalKeys);

  const isHorizontal = orientation === "horizontal";

  React.useEffect(() => {

    if (!ShouldComponentUpdate) return;

    const adjustedWidth = Math.max(0, width - (Margin.left + Margin.right)),
      adjustedHeight = Math.max(0, height - (Margin.top + Margin.bottom));

    const xdGetter = data => data.map(d => get(d, indexBy, null));
    const XScale = getScale({ ...DefaultXScale, ...xScale, type: "band",
                              getter: xdGetter, data,
                              range: isHorizontal ? [adjustedHeight, 0] : [0, adjustedWidth],
                              padding, paddingInner, paddingOuter
                            });
    const xDomain = XScale.domain();

    const bandwidth = XScale.bandwidth(),
      step = XScale.step(),
      outer = XScale.paddingOuter() * step;

    const ydGetter = data => {
      if (xDomain.length) {
        if (groupMode === "stacked") {
          return data.reduce((a, c) => {
            const y = keys.reduce((a, k) => a + get(c, k, 0), 0);
            if (!strictNaN(y)) {
              return [0, Math.max(y, get(a, 1, 0))];
            }
            return a;
          }, []);
        }
        else if (groupMode === "grouped") {
          return data.reduce((a, c) => {
            const y = keys.reduce((a, k) => Math.max(a, get(c, k, 0)), 0);
            if (!strictNaN(y)) {
              return [0, Math.max(y, get(a, 1, 0))];
            }
            return a;
          }, []);
        }
      }
      else {
        return [0, 0];
      }
    }

    const YScale = getScale({ ...DefaultYScale, ...yScale,
                              getter: ydGetter, data,
                              range: isHorizontal ? [0, adjustedWidth] : [adjustedHeight, 0]
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
        let current = isHorizontal ? 0 : adjustedHeight;

        const stacks = keys.map((key, ii) => {
          const value = get(d, key, 0),
            width = isHorizontal ? YScale(value) : bandwidth,
            height = isHorizontal ? bandwidth : Math.max(0, adjustedHeight - YScale(value)),
            color = colorFunc(value, ii, key, d);

          if (!isHorizontal) {
            current -= height;
          }

          barValues[key] = { value, color };

          const stack = {
            data: d,
            key,
            width,
            height,
            index: d[indexBy],
            y: isHorizontal ? 0 : current,
            x: isHorizontal ? current : 0,
            color,
            value,
            barValues
          }

          if (isHorizontal) {
            current += width;
          }
          return stack;
        });

        stackData = {
          stacks,
          barValues,
          left: isHorizontal ? 0 : XScale(d[indexBy]),
          top: isHorizontal ? XScale(d[indexBy]) : 0,
          data: d,
          state: PREVIOUS_BAR_DATA.current.delete(id) ? "updating" : "entering",
          id
        }
      }
      else if (groupMode === "grouped") {
        const stacks = keys.map((key, ii) => {
          const value = get(d, key, 0),
            y = isHorizontal ? (bandwidth / keys.length) * ii : Math.min(adjustedHeight, YScale(value)),
            color = colorFunc(value, ii, key, d);

          barValues[key] = { value, color };

          const stack = {
              data: d,
              key,
              width: isHorizontal ? YScale(value) : bandwidth / keys.length,
              height: isHorizontal ? bandwidth / keys.length : adjustedHeight - y,
              index: d[indexBy],
              y,
              x: isHorizontal ? 0 : (bandwidth / keys.length) * ii,
              color,
              value,
              barValues
            };
          return stack;
        });

        stackData = {
          stacks,
          barValues,
          left: isHorizontal ? 0 : outer + i * step,
          top: isHorizontal ? adjustedHeight - (outer + (i + 1) * step) : 0,
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

    const hasData = Boolean(barData.length);

    for (const d of PREVIOUS_BAR_DATA.current.values()) {
      barData.push({ ...d, state: "exiting" });
    }

    setState({
      xDomain, yDomain, XScale, YScale,
      adjustedWidth, adjustedHeight,
      barData, hasData
    });

    PREVIOUS_BAR_DATA.current = NEXT_BAR_DATA;

  }, [data, keys, width, height, groupMode,
      Margin, colorFunc, indexBy, orientation,
      padding, paddingInner, paddingOuter,
      ShouldComponentUpdate
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
              <AxisLeft type="band"
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
              <AxisBottom type="band"
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
              <Bar key={ id } { ...rest }
                svgHeight={ state.adjustedHeight }
                onMouseMove={ onMouseMove }
                showAnimations={ showAnimations }/>
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
    showAnimations
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

  const _onMouseMove = React.useCallback(e => {
    onMouseMove(e, { color, key: Key, index, value, data, barValues });
  }, [onMouseMove, color, Key, index, value, data, barValues]);

  return (
    <rect className="avl-stack" ref={ ref }
      onMouseMove={ _onMouseMove }/>
  )
})

const Bar = React.memo(({ stacks, left = 0, top = 0, state, showAnimations, ...props }) => {

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

  return (
    <g className="avl-bar" ref={ ref }>
      { stacks.map(({ key, ...rest }, i) =>
          <Stack key={ key } Key={ key } state={ state }
            { ...props } { ...rest } showAnimations={ showAnimations }/>
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
