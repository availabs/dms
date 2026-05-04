import React from "react"

import { /*scaleBand,*/ scaleLinear, scaleOrdinal } from "d3-scale"
import { select as d3select } from "d3-selection"
//import { range as d3range } from "d3-array"
import { format as d3format } from "d3-format"

import isEqual from "lodash/isEqual"
import get from "lodash/get"

import { theme, useSetSize } from "./utils"

import {
  AxisBottom,
  AxisLeft,
  HoverCompContainer,
  useHoverComp
} from "./components"

import {
  getColorFunc,
  Identity,
  EmptyArray,
  EmptyObject,
  DefaultMargin,
  useShouldComponentUpdate
} from "./utils"

import "./avl-graph.css"

const DefaultHoverComp = ({ data, indexFormat, keyFormat, valueFormat, valueLabel, bgColor, showTotals }) => {

  return (
    <div className={ `
      grid grid-cols-1 gap-1 px-2 pt-1 pb-2 rounded
      ${ theme.accent1 }
    ` }>
      <div className="font-bold text-lg leading-6 border-b-2 border-current pl-2">
        { keyFormat(get(data, "key", null)) }
      </div>
      { get(data, "indexes", []).map(i => (
          <div key={ i }
            className={ `
              flex items-center px-2 rounded transition relative
            `}
            style={ {
              outline: data.index === i ? `2px solid #000` : null
            } }
          >
            <div className="rounded-sm color-square w-5 h-5 absolute z-10"
              style={ {
                backgroundColor: bgColor
              } }/>
            <div className="rounded-sm color-square w-5 h-5 absolute z-50"
              style={ {
                backgroundColor: get(data, ["indexData", i, "color"], null),
                opacity: data.index === i ? 1 : 0.75
              } }/>
            <div className="ml-7 mr-4">
              { indexFormat(i) }:
            </div>
            <div className="text-right flex-1">
              { valueFormat(get(data, ["indexData", i, "value"], 0)) }
              { !valueLabel ? null :
                <b className="ml-1">{ valueLabel }</b>
              }
            </div>
          </div>
        ))
      }
      { !showTotals ? null :
        <div className="flex items-center px-2 border-t-2">
          <div className="mr-4">
            Total:
          </div>
          <div className="text-right flex-1">
            { valueFormat(data.keyTotal) }
            { !valueLabel ? null :
              <b className="ml-1">{ valueLabel }</b>
            }
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
  valueLabel: "",
  position: "side",
  showTotals: true
}

const DefaultPoint = {
  r: 5,
  fill: "none",
  stroke: "#08f",
  strokeWidth: 1
}

const DefaultBoundsRect = {
  fill: "none",
  stroke: "#08f",
  strokeWidth: 1
}

const InitialState = {
  gridData: [],
  pointData: [],
  spanLines: [],
  boundRects: [],
  hasData: false,

  bgRectState: "entering",
  totalsByKeys: {},

  xDomain: [],
  yDomain: [],
  xTickValues: [],
  yTickValues: [],
  xScale: scaleOrdinal(),
  yScale: scaleOrdinal(),
  adjustedWidth: 0,
  adjustedHeight: 0
}

export const GridGraph = props => {

  const {
    data = EmptyArray,
    keys = EmptyArray,
    keyWidths = EmptyObject,
    indexBy = "index",
    margin = EmptyObject,
    hoverComp = EmptyObject,
    axisBottom = null,
    axisLeft = null,
    className = "",
    onClick = null,
    onHoverEnter = null,
    onHoverLeave = null,
    bgColor = "#000000",
    nullColor = "#000000",
    hoverPoints = false,
    // paddingInner = 0,
    // paddingOuter = 0,
    // padding,
    colors,
    // groupMode = "stacked",
    points = EmptyArray,
    bounds = EmptyArray,
    showAnimations = false
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

  const minDistanceForXTick = React.useMemo(() => {
    return 100.0 / get(AxisBottomData, "tickDensity", 8.0);
  }, [AxisBottomData]);

  const minDistanceForYTick = React.useMemo(() => {
    return 100.0 / get(AxisLeftData, "tickDensity", 8.0);
  }, [AxisLeftData]);

  const ref = React.useRef(),
    { width, height } = useSetSize(ref),
    [state, setState] = React.useState(InitialState);

  const PREVIOUS_GRID_DATA = React.useRef(new Map());

  const pointsMap = React.useMemo(() => {
    return points.reduce((a, c) => {
      if (!(c.index in a)) {
        a[c.index] = {};
      }
      a[c.index][c.key] = c;
      return a;
    }, {});
  }, [points]);

  const boundsMap = React.useMemo(() => {
    return bounds.reduce((a, c) => {
      const { index, ...rest } = c;
      a[index] = rest;
      return a;
    }, {});
  }, [bounds]);

  // const additionalKeys = React.useMemo(() => {
  //   return ["data", "keys"];
  // }, []);

  // const ShouldComponentUpdate = useShouldComponentUpdate(props, width, height, additionalKeys);

  React.useEffect(() => {
    if (width && height) {
      const adjustedWidth = Math.max(0, width - (Margin.left + Margin.right)),
        adjustedHeight = Math.max(0, height - (Margin.top + Margin.bottom));

      const xDomain = [...keys];

      const dataWidth = keys.reduce((a, c) => {
        return a + get(keyWidths, c, 1);
      }, 0);

      const [yDomain, dataHeight] = data.reduce((a, c) => {
        let [yd, dh, dw] = a;
        yd.push(c[indexBy]);
        const h = +get(c, "height", 1);
        // const w = +get(c, "width", 1);
        return [yd, dh + h];
      }, [[], 0]);

      const indexes = data.map(d => d[indexBy]);

      const wScale = scaleLinear()
        .domain([0, dataWidth])
        .range([0, adjustedWidth]);

      const xRange = [0];
      const xScale = scaleOrdinal()
        .domain(["tick-1", ...xDomain, "tick-2"]);

      const hScale = scaleLinear()
        .domain([0, dataHeight])
        .range([0, adjustedHeight]);

      const yRange = [0];
      const yScale = scaleOrdinal()
        .domain(["tick-1", ...yDomain, "tick-2"]);

      const colorFunc = getColorFunc(colors);

      let top = 0;

      const indexData = xDomain.reduce((a, c) => {
        a[c] = {};
        return a;
      }, {});

      const NEXT_GRID_DATA = new Map();

      const gridData = [];
      const pointData = [];
      const spanLines = [];
      // const boundRects = [];

      const spanData = [];
      const pointPositions = {};

      const boundsData = {};

      const yTickValues = [];
      const xTickValues = [];
      let prevTickPosition = 0;

      let left = 0;

      xDomain.forEach((x, i) => {
        const width = wScale(get(keyWidths, x, 1));
        const midPoint = left + width * 0.5;
        const minWidthForTick = (i === (data.length - 1)) ? minDistanceForXTick : 3;
        if (prevTickPosition === 0) prevTickPosition = -midPoint;
        if (((midPoint - prevTickPosition) >= minDistanceForXTick) && (width >= minWidthForTick)) {
          xTickValues.push(x);
          prevTickPosition = midPoint;
        }
        left += width;
      })

      prevTickPosition = 0;

      let bgRectState = PREVIOUS_GRID_DATA.current.size ? "updating" : "entering";

      data.forEach((d, i) => {

        left = 0;

        const index = d[indexBy];

        pointPositions[index] = {};

        const pointsForIndex = get(pointsMap, index, {});
        const boundsForIndex = get(boundsMap, index, {});

        // delete exiting[index];

        const height = hScale(get(d, "height", 1));
        const midPoint = top + height * 0.5;

        yRange.push(midPoint);

        if (prevTickPosition === 0) prevTickPosition = -midPoint;

        const minHeightForTick = (i === (data.length - 1)) ? minDistanceForYTick : 3;

        if (((midPoint - prevTickPosition) >= minDistanceForYTick) && (height >= minHeightForTick)) {
          yTickValues.push(index);
          prevTickPosition = midPoint;
        }

        const grid = xDomain.map((x, ii) => {
          const value = get(d, x, null),
            width = wScale(get(keyWidths, x, 1)),
            xLeft = left,
            color = value === null ? nullColor : colorFunc(value, i, x, d);

          if (i === 0) {
            xRange.push(xLeft + width * 0.5);
          }

          left += width;

          indexData[x][index] = { value, color };

          if (x in pointsForIndex) {
            const { index, key, spanTo, ...rest } = pointsForIndex[x];
            const point = {
              ...DefaultPoint,
              ...rest,
              cx: xLeft + width * 0.5,
              cy: top + height * 0.5,
              key: `${ index }-${ key }`
            }
            pointData.push(point);
            pointPositions[index][key] = point;

            if (spanTo) {
              spanData.push([index, key, spanTo])
            }
          }

          const { bounds = [], ...rest } = boundsForIndex;

          if (bounds.includes(x)) {
            if (index in boundsData) {
              boundsData[index].width = xLeft + width - boundsData[index].x;
            }
            else {
              boundsData[index] = {
                ...DefaultBoundsRect,
                ...rest,
                x: xLeft,
                y: top,
                height,
                key: index
              }
            }
          }

          return {
            data: d,
            key: x,
            width,
            height,
            index,
            x: xLeft,
            color,
            value,
            indexData: indexData[x],
            indexes
          };
        }, []);

        const horizontal = {
          className: get(d, "className", null),
          grid,
          top,
          data: d,
          state: PREVIOUS_GRID_DATA.current.delete(index) ? "updating" : "entering",
          id: String(index)
        };

        top += height;

        NEXT_GRID_DATA.set(index, horizontal);
        gridData.push(horizontal);
      });

      const totalsByKeys = Object.keys(indexData).reduce((a, c) => {
        a[c] = Object.values(indexData[c]).reduce((aa, cc) => {
          return aa + cc.value;
        }, 0);
        return a;
      }, {});

      spanData.forEach(([index, from, to]) => {
        const p1 = get(pointPositions, [index, from]),
          p2 = get(pointPositions, [index, to]);
        spanLines.push({
          x1: p1.cx,
          y1: p1.cy,
          x2: p2.cx,
          y2: p2.cy,
          stroke: "#0ff",
          strokeWidth: 1,
          key: `${ p1.key }-${ p2.key }`
        })
      })

      const boundRects = Object.values(boundsData);

      xRange.push(adjustedWidth);
      xScale.range(xRange);

      yRange.push(adjustedHeight);
      yScale.range(yRange);

      const hasData = Boolean(gridData.length);

      if (!hasData) {
        bgRectState = "exiting";
      }

      if (showAnimations) {
        for (const d of PREVIOUS_GRID_DATA.current.values()) {
          gridData.push({ ...d, state: "exiting" });
        }
      }

      PREVIOUS_GRID_DATA.current = NEXT_GRID_DATA;

      setState({
        xDomain, yDomain, xScale, yScale, hasData, totalsByKeys,
        adjustedWidth, adjustedHeight, xTickValues, yTickValues,
        gridData, pointData, spanLines, boundRects, bgRectState
      });
    }
  }, [data, keys, width, height, Margin, showAnimations,
      colors, indexBy, boundsMap, pointsMap,
      nullColor, minDistanceForXTick, minDistanceForYTick
    ]
  );

  const {
    xDomain, xScale, xTickValues,
    yDomain, yScale, yTickValues,
    bgRectState, totalsByKeys,
    gridData, pointData, spanLines, boundRects, hasData,
    ...restOfState
  } = state;

  const {
    onMouseOver,
    onMouseMove,
    onMouseLeave,
    hoverData
  } = useHoverComp(ref);

  const {
    HoverComp,
    position,
    ...hoverCompRest
  } = HoverCompData;

  return (
    <div className="w-full h-full avl-graph-container relative" ref={ ref }>

      <svg className={ `w-full h-full block avl-graph ${ className }` }>

        <g style={ { transform: `translate(${ Margin.left }px, ${ Margin.top }px)` } }
          onMouseLeave={ onMouseLeave }>

          <BGRect x="0" y="0" fill={ bgColor }
            showAnimations={ showAnimations }
            state={ bgRectState }
            width={ state.adjustedWidth } height={ state.adjustedHeight }/>

          { gridData.map(({ id, ...rest }) =>
              <Horizontal key={ id } { ...rest } index={ id }
                totalsByKeys={ totalsByKeys }
                svgHeight={ state.adjustedHeight }
                onMouseMove={ onMouseMove }
                showAnimations={ showAnimations }
                onClick={ onClick }
                onHoverEnter={ onHoverEnter }
                onHoverLeave={ onHoverLeave }/>
            )
          }

          { !gridData.length ? null :
            <>
              <g style={ { pointerEvents: hoverPoints ? "auto" : "none" } }>
                { pointData.map(point => (
                    <Point { ...point }
                      onMouseOver={ onMouseOver }
                      showHover={ hoverPoints }
                    />
                  ))
                }
              </g>
              <g style={ { pointerEvents: "none" } }>
                { spanLines.map(line => <line { ...line }/>) }
                { boundRects.map(rect => <rect { ...rect }/>) }
              </g>
            </>
          }

          { !hoverData.show || (hoverData.target !== "graph") ? null :
            <rect stroke="currentColor" fill="none" strokeWidth="2"
              className="pointer-events-none"
              style={ {
                transform: `translate(${ hoverData.data.x }px, 0px)`,
                transition: "transform 0.15s ease-out"
              } }
              x={ -1 } y={ -1 }
              width={ hoverData.data.width + 2 }
              height={ state.adjustedHeight + 2 }/>
          }
        </g>

        <g>
          { !AxisBottomData ? null :
            <AxisBottom { ...restOfState }
              margin={ Margin }
              scale={ xScale }
              tickValues={ xTickValues }
              domain={ xDomain }
              type="ordinal"
              showAnimations={ showAnimations }
              { ...AxisBottomData }/>
          }
          { !AxisLeftData ? null :
            <AxisLeft { ...restOfState }
              margin={ Margin }
              scale={ yScale }
              tickValues={ yTickValues }
              domain={ yDomain }
              type="ordinal"
              showAnimations={ showAnimations }
              { ...AxisLeftData }/>
          }
        </g>

      </svg>

      <HoverCompContainer { ...hoverData }
        position={ position }
        svgWidth={ width }
        svgHeight={ height }
        margin={ Margin }>
        { !hoverData.data ? null :
            <HoverComp target={ hoverData.target } bgColor={ bgColor }
              data={ hoverData.data } keys={ keys } { ...hoverCompRest }/>
        }
      </HoverCompContainer>

    </div>
  )
}

const BGRect = ({ state, showAnimations, ...rest }) => {

  const ref = React.useRef();

  React.useEffect(() => {
    if (state === "entering") {
      if (showAnimations) {
        d3select(ref.current)
          .attr("opacity", 0.0)
            .transition().duration(1000)
              .attr("opacity", 1.0)
      }
      else {
        d3select(ref.current)
          .attr("opacity", 1.0);
      }
    }
    else if (state === "exiting") {
      if (showAnimations) {
        d3select(ref.current)
          .transition().duration(1000)
            .attr("opacity", 0.0);
      }
      else {
        d3select(ref.current).attr("opacity", 0.0);
      }
    }
    else {
      d3select(ref.current).attr("opacity", 1.0)
    }
  }, [ref.current, state, showAnimations]);
  return (
    <rect ref={ ref } { ...rest }/>
  )
}

const Point = ({ showHover, onMouseOver, data, cx, cy, ...rest }) => {

  const _onMouseOver = React.useCallback(e => {
    onMouseOver(e, data, { pos: [cx, cy], target: "point" });
  }, [onMouseOver, cx, cy, data]);

  return (
    <circle { ...rest } cx={ cx } cy={ cy }
      onMouseOver={ showHover ? _onMouseOver : null }
    />
  )
}

const Grid = React.memo(({ x, width, height, color,
                state, onMouseMove, onClick,
                Key, index, value, showAnimations,
                data, indexData, totalsByKeys, indexes }) => {

  const ref = React.useRef();

  const transitionWrapper = React.useMemo(() => {
    return showAnimations ?
      selection => selection.transition().duration(1000) :
      selection => selection;
  }, [showAnimations]);

  React.useEffect(() => {
    if (state === "entering") {
      transitionWrapper(
          d3select(ref.current)
            .attr("width", width)
            .attr("height", 0)
            .attr("x", x)
            .attr("y", 0)
            .attr("fill", color)
        )
          .attr("height", height);
          // .attr("y", y);
    }
    else if (state === "exiting") {
      transitionWrapper(d3select(ref.current))
          .attr("width", width)
          .attr("height", 0)
          .attr("fill", color);
    }
    else {
      transitionWrapper(d3select(ref.current))
        .attr("width", width)
        .attr("height", height)
        .attr("x", x)
        .attr("fill", color);
    }
  }, [x, width, height, color, state, transitionWrapper]);

  const _onMouseMove = React.useCallback(e => {
    onMouseMove(e, { color, key: Key, index, value, data, x, width, indexData, keyTotal: totalsByKeys[Key], indexes });
  }, [onMouseMove, color, Key, index, value, data, x, width, indexData, indexes, totalsByKeys]);

  const _onClick = React.useMemo(() => {
    if (!onClick) return null;
    return e => {
      onClick(e, { key: Key, index, value });
    }
  }, [onClick, Key, index, value]);

  return (
    <rect ref={ ref } className="avl-grid"
      onMouseMove={ _onMouseMove }
      onClick={ _onClick }/>
  )
})

const Horizontal = React.memo(({ index, grid, top, state, showAnimations, svgHeight,
                                  onHoverEnter, onHoverLeave, className, ...props }) => {

  const ref = React.useRef();

  React.useEffect(() => {
    if (state === "entering") {
      if (showAnimations) {
        d3select(ref.current)
          .attr("transform", `translate(0 ${ svgHeight })`)
          .transition().duration(1000)
            .attr("transform", `translate(0 ${ top })`);;
      }
      else {
        d3select(ref.current)
          .attr("transform", `translate(0 ${ top })`);
      }
    }
    else if (state === "exiting") {
      if (showAnimations) {
        d3select(ref.current)
          .transition().duration(1000)
            .attr("transform", `translate(0 ${ svgHeight })`);
      }
      else {
        d3select(ref.current)
          .attr("transform", `translate(0 ${ svgHeight })`);
      }
    }
    else {
      if (showAnimations) {
        d3select(ref.current)
          .transition().duration(1000)
            .attr("transform", `translate(0 ${ top })`);
      }
      else {
        d3select(ref.current)
          .attr("transform", `translate(0 ${ top })`);
      }
    }
  }, [state, top,showAnimations, svgHeight]);

  const onEnter = React.useMemo(() => {
    if (!onHoverEnter) return null;
    return e => onHoverEnter(e, index);
  }, [onHoverEnter, index]);

  const onLeave = React.useMemo(() => {
    if (!onHoverLeave) return null;
    return e => onHoverLeave(e, index);
  }, [onHoverLeave, index]);

  return (
    <g ref={ ref }
      className={ `avl-grid-horizontal ${ className ? className : "" }` }
      onMouseEnter={ onEnter }
      onMouseLeave={ onLeave }
    >
      { grid.map(({ key, ...rest }) =>
          <Grid key={ key } Key={ key } state={ state }
            { ...props } { ...rest }
            showAnimations={ showAnimations }/>
        )
      }
    </g>
  )
})

export const generateTestGridData = (horizontals = 10, grids = 50) => {
  const data = [], keys = [];
  for (let h = 0; h < horizontals; ++h) {
    const hori = {
      index: `index-${ h }`,
      height: Math.floor(Math.random() * 30) + 5
    }
    for (let x = 0; x < grids; ++x) {
      (h === 0) && keys.push(x);
      hori[x] = Math.floor(Math.random() * 20) + 20;
    }
    data.push(hori);
  }
  const keyWidths = keys.reduce((a, c) => {
    a[c] = Math.floor(Math.random() * 30) + 5;
    return a;
  }, {})
  return { data, keys, keyWidths };
}
