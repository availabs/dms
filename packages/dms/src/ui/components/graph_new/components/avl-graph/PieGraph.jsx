import React from "react"

import { scaleLinear } from "d3-scale"
import { select as d3select } from "d3-selection"
import { format as d3format } from "d3-format"
import { sum as d3sum, extent as d3extent, range as d3range } from "d3-array"
import * as d3shape from "d3-shape"
import { interpolate as d3interpolate } from "d3-interpolate"

import get from "lodash/get"

import { useSetSize } from "./utils"

import {
  HoverCompContainer,
  useHoverComp
} from "./components"

import {
  getColorFunc,
  Identity,
  EmptyArray,
  EmptyObject,
  getUniqueId
} from "./utils"

const DefaultHoverComp = ({ data, keys, indexFormat, keyFormat, valueFormat, valueLabel, showTotals, ...rest }) => {
  return (
    <div className={ `
      flex flex-col px-2 pt-1 rounded
      ${ keys.length <= 1 ? "pb-2" : "pb-1" }
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
    pieAxis = EmptyObject,
    indexBy = "index",
    className ="",
    startAngle = 0,
    endAngle = 2 * Math.PI,
    padAngle = 0,
    colors,
    showAnimations = false,
    onPieEnter = null,
    onPieLeave = null,
    onSliceEnter = null,
    onSliceLeave = null,
    highlights = EmptyArray
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

      const index = d[indexBy];

      colorMap[index] = {};

      const pieParts = keys.map((key, ii) => {
        const value = get(d, key, 0);
        const color = colorFunc(value, ii, key, d);
        colorMap[index][key] = color;
        return {
          data: d,
          colorMap,
          color,
          value,
          formattedValue: pieAxis.valueFormat(value),
          key,
          index
        }
      }).filter(p => Boolean(p.value));

      return {
        index,
        pie: pieMaker(pieParts),
        total: d3sum(pieParts, d => d.value),
        state: "entering",
        label: index
      };
    });

    const labelPadding = pieData.length === 1 ? 0 : 15;

    let ms = maxSquare(adjustedWidth, adjustedHeight, pieData.length);

    let numCols = Math.floor(adjustedWidth / ms),
      numRows = Math.ceil(pieData.length / numCols),
      numPiesInLastRow = pieData.length - ((numRows - 1) * numCols);

    // while (numPiesInLastRow <= (numCols - 1) - (numRows - 1)) {
    //   --numCols;
    //   numRows = Math.ceil(pieData.length / numCols);
    //   numPiesInLastRow = pieData.length - ((numRows - 1) * numCols);
    // }

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

      p.innerRadius = 0;
      p.outerRadius = radiusScale(p.total);
      p.dx = w * col + w * 0.5;
      p.dy = h * row + (h - labelPadding) * 0.5;
      p.ldy = p.outerRadius;
    })

    dispatch({
      type: "update-state",
      pieData,
      showAnimations
    });

  }, [
    data, keys, width, height, colors, pieAxis.valueFormat,
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

// console.log("PieGraph::highlights", highlights);

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
                  showAnimations={ showAnimations }
                  showAxis={ pieAxis.showAxis }
                  tickDensity={ pieAxis.tickDensity }
                  showValue={ pieAxis.showValue }
                  valueTextSize={ pieAxis.valueTextSize }
                  onPieEnter={ onPieEnter }
                  onPieLeave={ onPieLeave }
                  onSliceEnter={ onSliceEnter }
                  onSliceLeave={ onSliceLeave }
                  highlights={ highlights }/>
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

const ValueTextSizeMap = {
  xsmall: 0.1,
  small: 0.2,
  medium: 0.3,
  large: 0.4,
  xlarge: 0.5
}

const labelTransform = (x0, x1, y0, y1) => {
  const x = (x0 + x1) / 2 * 180 / Math.PI;
  const y = (y0 + y1) * 0.95;
  return `rotate(${ x - 90 }) translate(${ y }, 0) rotate(${ x < 180 ? 0 : 180 })`;
}

const Slice = React.memo(props => {

  const {
    state, data, innerRadius, outerRadius, index,
    onMouseMove, showAnimations, valueTextSize,
    endAngle, startAngle, padAngle,
    onSliceEnter, onSliceLeave, highlight = false,
    ...restOfProps
  } = props

  const transitionWrapper = React.useMemo(() => {
    return showAnimations ?
      selection => selection.transition().duration(1000) :
      selection => selection;
  }, [showAnimations]);

  const arc = React.useMemo(() => {
    return d3shape.arc()
      .innerRadius(innerRadius)
      .cornerRadius(0);
  }, [innerRadius]);

  const color = React.useMemo(() => {
    return highlight ? "red" : data.color;
  }, [highlight, data.color]);

  const ref = React.useRef();

  React.useEffect(() => {
    if (state === "entering") {
      d3select(ref.current)
        .datum({ endAngle, startAngle, padAngle, outerRadius });
    }
  }, [state, endAngle, startAngle, padAngle, outerRadius])

  React.useEffect(() => {
    if (state === "entering") {
      transitionWrapper(d3select(ref.current)
        .attr("d", arc({ endAngle, startAngle, padAngle, outerRadius: 0.1 }))
      )
      .attr("d", arc({ endAngle, startAngle, padAngle, outerRadius }))
      .attr("fill", color);
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
              const i3 = d3interpolate(d.outerRadius, outerRadius)
              return t => {
                d.startAngle = i1(t);
                d.endAngle = i2(t);
                d.outerRadius = i3(t);
                return arc(d);
              };
            })
            .attr("fill", color)
      }
      else {
        d3select(ref.current)
          .attr("fill", color)
          .attr("d", arc({ endAngle, startAngle, padAngle, outerRadius }))
      }
    }
  }, [ref, arc, data, color, outerRadius, endAngle, startAngle, padAngle, state, transitionWrapper, showAnimations]);

  const _onMouseMove = React.useCallback(e => {
    onMouseMove(e, { ...data });
  }, [onMouseMove, data]);

  const onMouseEnter = React.useMemo(() => {
    if (typeof onSliceEnter !== "function") return null;
    return e => onSliceEnter(e, { index, key: data.key, data });
  }, [onSliceEnter, index, data]);

  const onMouseLeave = React.useMemo(() => {
    if (typeof onSliceLeave !== "function") return null;
    return e => onSliceLeave(e, { index, key: data.key, data });
  }, [onSliceLeave, index, data]);

  const { showValue, showLarge, ...valueData } = React.useMemo(() => {
    if (!restOfProps.showValue) return { showValue: false };
    if ((endAngle - startAngle) < Math.PI * 0.01) return { showValue: false };

    if ((endAngle - startAngle) < Math.PI * 0.6) {

      const width = 2 * (endAngle - startAngle) * outerRadius * 0.5;
      const height = outerRadius;

      return {
        showValue: true,
        showLarge: false,
        value: data.formattedValue,
        fontSize: Math.min(width, height) * (ValueTextSizeMap[valueTextSize] || ValueTextSizeMap["medium"]) * 0.5
      };
    }

    const radius = innerRadius + (outerRadius - innerRadius) * 0.625;

    const halfAngle = startAngle + (endAngle - startAngle) * 0.5;

    const a0 = startAngle + Math.PI / 180;
    const x0 = radius * Math.cos(a0 - Math.PI * 0.5);
    const y0 = radius * Math.sin(a0 - Math.PI * 0.5);

    const a1 = endAngle - Math.PI / 180;
    const x1 = radius * Math.cos(a1 - Math.PI * 0.5);
    const y1 = radius * Math.sin(a1 - Math.PI * 0.5);

    const orientation = halfAngle > Math.PI * 0.5 && halfAngle < Math.PI * 1.5 ? "counter" : "clockwise";

    const laf = endAngle - startAngle >= Math.PI ? 1 : 0;
    const sf = orientation === "counter" ? 0 : 1;

    const x2 = orientation === "counter" ? x1 : x0;
    const y2 = orientation === "counter" ? y1 : y0;

    const x3 = orientation === "counter" ? x0 : x1;
    const y3 = orientation === "counter" ? y0 : y1;

    const d = `M ${ x2 } ${ y2 } A ${ radius } ${ radius } 0 ${ laf } ${ sf } ${ x3 } ${ y3 }`;

    return {
      showValue: true,
      showLarge: true,
      id: getUniqueTextPathId(),
      d,
      value: data.formattedValue,
      dominantBaseline: sf === 1 ? "ideographic" : "hanging",
      fontSize: radius * (ValueTextSizeMap[valueTextSize] || ValueTextSizeMap["medium"])
    }  
  }, [startAngle, endAngle, innerRadius, outerRadius, data, restOfProps.showValue, valueTextSize]);

  return (
    <>
      <path ref={ ref } className="avl-slice" stroke="none"
        onMouseMove={ _onMouseMove }
        onMouseEnter={ onMouseEnter }
        onMouseLeave={ onMouseLeave }/>

      { !showValue ? null :
        !showLarge ? (
          <text
            textAnchor="start"
            dominantBaseline="middle"
            transform={ labelTransform(startAngle, endAngle, innerRadius, outerRadius) }
            className="pointer-events-none"
            fontSize={ valueData.fontSize }
          >
            { valueData.value }
          </text>
        ) : (
          <>
            <defs>
              <path id={ valueData.id }
                d={ valueData.d }
                fill="none" stroke="transparent"/>
            </defs>

            <text>
              <textPath href={ `#${ valueData.id }` }
                startOffset="50%"
                textAnchor="middle"
                dominantBaseline={ valueData.dominantBaseline }
                className="pointer-events-none"
                fontSize={ valueData.fontSize }
              >
                { valueData.value }
              </textPath>
            </text>
          </>
        )
      }
    </>
  )
})

const getUniqueTextPathId = () => getUniqueId(`text-path-`);

const CircleAxis = ({ pie, outerRadius, tickDensity }) => {

  const axisTicks = React.useMemo(() => {

    const density = 100 / tickDensity;

    let dist = density;
    let curAngle = 0;

    return pie.sort((a, b) => a.index - b.index)
      .reduce((a, p) => {
        const radius = outerRadius + 6;

        const halfAngle = p.startAngle + (p.endAngle - p.startAngle) * 0.5;

        dist += 2 * (halfAngle - curAngle) * radius;

        curAngle = halfAngle;

        if (dist < density) return a;

        dist = 0;

        const a0 = halfAngle + Math.PI - Math.PI / 180;
        const x0 = radius * Math.cos(a0 - Math.PI * 0.5);
        const y0 = radius * Math.sin(a0 - Math.PI * 0.5);

        const a1 = halfAngle + Math.PI + Math.PI / 180;
        const x1 = radius * Math.cos(a1 - Math.PI * 0.5);
        const y1 = radius * Math.sin(a1 - Math.PI * 0.5);

        const orientation = halfAngle > Math.PI * 0.5 && halfAngle < Math.PI * 1.5 ? "counter" : "clockwise";

        const sf = orientation === "clockwise" ? 1 : 0;

        const x2 = orientation === "clockwise" ? x1 : x0;
        const y2 = orientation === "clockwise" ? y1 : y0;

        const x3 = orientation === "clockwise" ? x0 : x1;
        const y3 = orientation === "clockwise" ? y0 : y1;

        a.push({
          label: p.data.key,
          id: getUniqueTextPathId(),
          d: `M ${ x2 } ${ y2 } A ${ radius } ${ radius } 0 1 ${ sf } ${ x3 } ${ y3 }`,
          rotate: halfAngle  * 180 / Math.PI,
          dominantBaseline: sf === 1 ? "ideographic" : "hanging"
        })

        return a;
      }, []);
  }, [pie, outerRadius, tickDensity]);

  return (
    <g>
      <circle
        r={ outerRadius + Math.max(1.0, Math.min(2, Math.floor(outerRadius * 0.05))) * 0.5 }
        fill="none"
        stroke="black"
        strokeWidth={ Math.max(1.0, Math.min(2, Math.floor(outerRadius * 0.05))) }/>


      { axisTicks.map((t, i) => {

          const { d, id, label, rotate, dominantBaseline } = t;

          return (
            <React.Fragment key={ label }>
              <defs>
                <path id={ id }
                  d={ d }
                  fill="none" stroke="transparent"/>
              </defs>

              <text>
                <textPath href={ `#${ id }` }
                  startOffset="50%"
                  textAnchor="middle"
                  dominantBaseline={ dominantBaseline }
                  className="pointer-events-none"
                >
                  { label }
                </textPath>
              </text>
              <path
                d={ `M 0 -${ outerRadius } V -${ outerRadius + 6 }` }
                fill="none"
                stroke="black"
                strokeWidth="1"
                transform={ `rotate(${ rotate }, 0, 0)`}/>
            </React.Fragment>
          )
        })
      }
    </g>
  )
}

const Pie = React.memo(props => {

  const {
    pie, index,
    dx, dy, ldy,
    state,
    label,
    showAnimations,
    showAxis,
    onPieEnter,
    onPieLeave,
    highlights,
    ...restOfProps
  } = props;

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
  }, [ref.current, dx, dy, state, transitionWrapper]);

  const labelRef = React.useRef();

  React.useEffect(() => {
    transitionWrapper(d3select(labelRef.current))
      .style("transform", `translateY(${ ldy }px)`)
  }, [labelRef, ldy, transitionWrapper]);

  const onMouseEnter = React.useMemo(() => {
    if (typeof onPieEnter !== "function") return null;
    return e => onPieEnter(e, { index, pie });
  }, [onPieEnter, index, pie]);

  const onMouseLeave = React.useMemo(() => {
    if (typeof onPieLeave !== "function") return null;
    return e => onPieLeave(e, { index, pie });
  }, [onPieLeave, index, pie]);

  const highlight = React.useMemo(() => {
    const filtered = highlights.filter(h => h.type === "index" && h.value == index);
    return Boolean(filtered.length);
  }, [highlights, index]);

  return (
    <g ref={ ref }>
      <g
        onMouseEnter={ onMouseEnter }
        onMouseLeave={ onMouseLeave }
      >

        { pie.map((p, i) => (
            <Slice key={ p.data.key }
              { ...restOfProps } { ...p }
              state={ state }
              showAnimations={ showAnimations }
              index={ index }
              highlight={ highlight || Boolean(highlights.find(h => h.type === "key" && h.value == p.data.key)) }/>
          ))
        }
      </g>

      { !showAxis ? null :
        <CircleAxis { ...restOfProps }
          pie={ pie }/>
      }

      <g ref={ labelRef }>
        <text textAnchor="middle"
          dominantBaseline="hanging"
          className="avl-pie-label pointer-events-none"
        >
          { label }
        </text>
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
