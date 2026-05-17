import React from "react"

import { scaleLinear } from "d3-scale"
import { select as d3select } from "d3-selection"
import { format as d3format } from "d3-format"
import { sum as d3sum, extent as d3extent, range as d3range } from "d3-array"
import * as d3shape from "d3-shape"
import { interpolate as d3interpolate } from "d3-interpolate"

import get from "lodash/get"

import { theme, useSetSize } from "./utils"

import {
  HoverCompContainer,
  useHoverComp
} from "./components"

import {
  getColorFunc,
  Identity,
  EmptyArray,
  EmptyObject
} from "./utils"

const DefaultHoverComp = ({ data, keys, indexFormat, keyFormat, valueFormat, valueLabel, showTotals, ...rest }) => {
  return (
    <div className={ `
      flex flex-col px-2 pt-1 rounded
      ${ keys.length <= 1 ? "pb-2" : "pb-1" }
      ${ theme.accent1 }
    ` }>
      <div className="font-bold text-lg leading-6 border-b-2 mb-1 pl-2">
        { indexFormat(get(data, "index", null)) }
      </div>
      { keys.filter(k => get(data, ["data", k], 0))
          .sort((a, b) => get(data, ["data", b], 0) - get(data, ["data", a], 0))
          .map(key => (
            <div key={ key } className={ `
              flex items-center px-2 border-2 rounded transition
              ${ data.key === key ? "border-current" : "border-transparent" }
            `}>
              <div className="mr-2 rounded-sm color-square w-5 h-5"
                style={ {
                  backgroundColor: get(data, ["colorMap", data.index, key], null),
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
  showTotals: true,
  position: "side"
}

const InitialState = {
  pieData: [],
  exiting: []
}
const Reducer = (state, action) => {
  const { type, showAnimations, ...payload } = action;
  switch (type) {
    case "update-state": {
      const { pieData } = state;
      let prevIds = pieData.reduce((a, c) => {
        a[c.index] = c;
        return a;
      }, {});
      payload.pieData.forEach(pie => {
        if (pie.index in prevIds) {
          pie.state = "updating";
          delete prevIds[pie.index];
        }
      })
      if (!showAnimations) {
        prevIds = {};
      }
      return {
        pieData: [
          ...payload.pieData,
          ...Object.values(prevIds).map(p => ({ ...p, state: "exiting" }))
        ],
        exiting: Object.keys(prevIds)
      }
    }
    case "exit-data":
      return {
        pieData: state.pieData.filter(pie => {
          return payload.exiting.includes(pie.index) ? pie.state !== "exiting" : true;
        }),
        exiting: state.exiting.filter(e => {
          return !payload.exiting.includes(e);
        })
      }
    default:
      return state;
  }
}

const DefaultMargin = {
  left: 10,
  top: 10,
  right: 10,
  bottom: 10
}

const maxSquare = (x, y, n) => {
  let sx, sy;

  const px = Math.ceil(Math.sqrt(n * x / y));
  if (Math.floor(px * y / x) * px < n) {
    sx = y / Math.ceil(px * y / x);
  }
  else {
    sx = x / px;
  }

  const py = Math.ceil(Math.sqrt(n * y / x));
  if (Math.floor(py * x / y) * py < n) {
    sy = x / Math.ceil(py * x / y);
  }
  else {
    sy = y / py;
  }

  return Math.max(sx, sy);
}

export const PieGraph = props => {

  const {
    data = EmptyArray,
    keys = EmptyArray,
    margin = EmptyObject,
    hoverComp = EmptyObject,
    indexBy = "index",
    className ="",
    startAngle = 0,
    endAngle = 2 * Math.PI,
    padAngle = 0,
    colors,
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

  const ref = React.useRef(),
    { width, height } = useSetSize(ref),
    [state, dispatch] = React.useReducer(Reducer, InitialState);

  const exitData = React.useCallback(exiting => {
    dispatch({
      type: "exit-data",
      exiting
    });
  }, []);

  React.useEffect(() => {
    if (!(width && height)) return;

    const adjustedWidth = Math.max(0, width - (Margin.left + Margin.right)),
      adjustedHeight = Math.max(0, height - (Margin.top + Margin.bottom));

    const pieMaker = d3shape.pie()
      .value(d => d.value)
      .startAngle(startAngle)
      .endAngle(endAngle)
      .padAngle(padAngle)
      .sort((a, b) => b.value - a.value);

    const colorFunc = getColorFunc(colors);

    const colorMap = {};

    const pieData = data.map(d => {

      colorMap[d[indexBy]] = {};

      const pieParts = keys.map((key, ii) => {
        const value = get(d, key, 0);
        const color = colorFunc(value, ii, d, key);
        colorMap[d[indexBy]][key] = color;
        return {
          data: d,
          colorMap,
          color,
          value,
          key,
          index: d[indexBy]
        }
      }).filter(p => Boolean(p.value));

      return {
        index: d[indexBy],
        pie: pieMaker(pieParts),
        total: d3sum(pieParts, d => d.value),
        state: "entering",
        label: d[indexBy]
      };
    });

    const labelPadding = 15;

    let ms = maxSquare(adjustedWidth, adjustedHeight, pieData.length);

    let numCols = Math.floor(adjustedWidth / ms),
      numRows = Math.ceil(pieData.length / numCols),
      numPiesInLastRow = pieData.length - ((numRows - 1) * numCols);

    while (numPiesInLastRow <= (numCols - 1) - (numRows - 1)) {
      --numCols;
      numRows = Math.ceil(pieData.length / numCols);
      numPiesInLastRow = pieData.length - ((numRows - 1) * numCols);
    }

    const h = adjustedHeight / numRows;

    const pieDiameter = Math.min(ms, h - labelPadding);

    const domain = d3extent(pieData, d => d.total);

    if (domain[0] === domain[1]) {
      domain[0] = 0;
    }

    const radiusScale = scaleLinear()
      .domain(domain)
      .range([0.125 * pieDiameter, 0.5 * pieDiameter]);

    pieData.forEach((p, i) => {
      const col = i % numCols,
        row = Math.floor(i / numCols),
        rowLength = (row + 1) < numRows ? numCols : numPiesInLastRow,
        w = adjustedWidth / rowLength;

      p.radius = radiusScale(p.total);
      p.dx = w * col + w * 0.5;
      p.dy = h * row + (h - labelPadding) * 0.5;
      // p.ldy = (h - labelPadding) * 0.5;
      p.ldy = p.radius;
    })

    dispatch({
      type: "update-state",
      pieData,
      showAnimations
    });

  }, [
    data, keys, width, height, colors,
    Margin, indexBy, startAngle, endAngle, padAngle
  ]);

  React.useEffect(() => {
    if (showAnimations && state.exiting.length) {
      setTimeout(exitData, 1050, [...state.exiting]);
    }
  }, [showAnimations, exitData, state.exiting]);

  const {
    onMouseMove,
    onMouseLeave,
    hoverData
  } = useHoverComp(ref);

  const {
    HoverComp,
    position,
    show: showHoverComp,
    ...hoverCompRest
  } = HoverCompData;

  return (
    <div ref={ ref } className="w-full h-full avl-graph-container relative">

      <svg className={ `w-full h-full block avl-graph ${ className }` }>
        <g onMouseLeave={ onMouseLeave }
          style={ {
            transform: `translate(${ Margin.left }px, ${ Margin.top }px)`
          } }>

          { state.pieData
              .map((pie, i) => (
                <Pie key={ pie.index } { ...pie }
                  onMouseMove={ onMouseMove }
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
          margin={ Margin }>
          { !hoverData.data ? null :
            <HoverComp data={ hoverData.data } keys={ keys }
              { ...hoverCompRest }/>
          }
        </HoverCompContainer>
      }
    </div>
  )
}

const Slice = React.memo(({ state, data, radius, index, onMouseMove, showAnimations,
                            endAngle, startAngle, padAngle }) => {

  // const zeroArc = React.useMemo(() => {
  //   return d3shape.arc()
  //     .outerRadius(1)
  //     .innerRadius(0)
  //     .cornerRadius(0);
  // }, []);

  const transitionWrapper = React.useMemo(() => {
    return showAnimations ?
      selection => selection.transition().duration(1000) :
      selection => selection;
  }, [showAnimations]);

  const arc = React.useMemo(() => {
    return d3shape.arc()
      // .outerRadius(radius)
      .innerRadius(0)
      .cornerRadius(0);
  }, []);

  const ref = React.useRef();

  React.useEffect(() => {
    if (state === "entering") {
      d3select(ref.current)
        .datum({ endAngle, startAngle, padAngle, outerRadius: radius });
    }
  }, [state, endAngle, startAngle, padAngle, radius])

  React.useEffect(() => {
    if (state === "entering") {
      transitionWrapper(d3select(ref.current)
        .attr("d", arc({ endAngle, startAngle, padAngle, outerRadius: 0.1 }))
      )
      .attr("d", arc({ endAngle, startAngle, padAngle, outerRadius: radius }))
      .attr("fill", data.color);
    }
    else if (state === "exiting") {
      transitionWrapper(d3select(ref.current))
        .attr("d", arc({ endAngle, startAngle, padAngle, outerRadius: 0.1 }));
    }
    else {
      if (showAnimations) {
        d3select(ref.current)
          .transition().duration(1000)
            .attrTween("d", d => {
              const i1 = d3interpolate(d.startAngle, startAngle);
              const i2 = d3interpolate(d.endAngle, endAngle);
              const i3 = d3interpolate(d.outerRadius, radius)
              return t => {
                d.startAngle = i1(t);
                d.endAngle = i2(t);
                d.outerRadius = i3(t);
                return arc(d);
              };
            })
            .attr("fill", data.color)
      }
      else {
        d3select(ref.current)
          .attr("fill", data.color)
          .attr("d", arc({ endAngle, startAngle, padAngle, outerRadius: radius }))
      }
    }
  }, [ref, arc, data, radius, endAngle, startAngle, padAngle, state, transitionWrapper, showAnimations]);

  const _onMouseMove = React.useCallback(e => {
    onMouseMove(e, { ...data });
  }, [onMouseMove, data]);

  return (
    <path ref={ ref } className="avl-slice" stroke="none"
      onMouseMove={ _onMouseMove }/>
  )
})

const Pie = React.memo(({ pie, dx, dy, ldy, state, label, showAnimations, ...props }) => {

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
          .style("transform", `translate(${ dx }px, ${ dy }px)`)
          .style("opacity", 0)
      )
      .style("opacity", 1);
    }
    else if (state === "exiting") {
      transitionWrapper(d3select(ref.current))
        .style("transform", `translate(${ dx }px, ${ dy }px)`)
        .style("opacity", 0);
    }
    else {
      transitionWrapper(d3select(ref.current))
        .style("transform", `translate(${ dx }px, ${ dy }px)`)
        .style("opacity", 1);
    }
  }, [ref, dx, dy, state, transitionWrapper]);

  const labelRef = React.useRef();

  React.useEffect(() => {
    transitionWrapper(d3select(labelRef.current))
      .style("transform", `translateY(${ ldy }px)`)
  }, [labelRef, ldy, transitionWrapper]);

  return (
    <g ref={ ref }>
      { pie.map((p, i) => (
          <Slice key={ p.data.key }
            { ...props } { ...p }
            state={ state }
            showAnimations={ showAnimations }/>
        ))
      }
      <g ref={ labelRef }>
        <text textAnchor="middle"
          dominantBaseline="hanging"
          className="avl-pie-label">{ label }</text>
      </g>
    </g>
  )
})

export const generateTestPieData = (pies = 10, slices = 5) => {
  const data = [], keys = [];

  d3range(slices).forEach(s => {
    keys.push(`slice-${ s }`);
  });

  d3range(pies).forEach(i => {
    const pie = {
      index: `pie-${ i }`
    }
    keys.forEach(k => {
      const rand = Math.random() * 250 + 50;
      pie[k] = rand + (Math.random() * rand);
    })
    data.push(pie);
  });

  return { data, keys };
}
