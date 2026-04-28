import React from "react"

import { scalePoint, scaleLinear } from "d3-scale"
import { select as d3select } from "d3-selection"
import { line as d3line, curveCatmullRom } from "d3-shape"
import { range as d3range } from "d3-array"
import { format as d3format } from "d3-format"


import get from "lodash/get"

import { useSetSize } from "./utils"

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
  DefaultAxis,
  useShouldComponentUpdate
} from "./utils"

const DefaultHoverComp = ({ data, idFormat, xFormat, yFormat, lineTotals, showTotals = true }) => {
  return (
    <div className="flex flex-col px-2 pt-1 pb-2 rounded">
      <div className="border-b-2 px-2 flex mb-1">
        <div className="font-bold text-lg leading-6 flex-1">
          { xFormat(get(data, "x", null), data) }
        </div>
        { !showTotals ? null :
          <div>
            (Line Total)
          </div>
        }
      </div>
      <div className="px-2">
        { data.data.sort((a, b) => lineTotals[b.id] - lineTotals[a.id])
            .map(({ id, y, color, isMax, ...rest }) => (
              <div key={ id }
                className={ `
                  rounded border-2 flex
                  ${ isMax ? "border-current" : "border-transparent" }
                ` }
              >
                <div className="flex-1">
                  <div className={ `
                    flex items-center
                    ${ isMax ? "border-current" : "border-transparent" }
                    transition pl-2
                  ` }>
                    <div className={ `
                      mr-2 rounded-sm color-square w-5 h-5 transition border-2
                    ` }
                      style={ {
                        borderColor: color,
                        borderStyle: "solid",
                        background: `${ color }${ isMax ? "ff" : "33" }`
                      } }/>
                    <div className="mr-4 flex-1">
                      { idFormat(id, rest) }:
                    </div>
                  </div>
                </div>

                <div>
                  <div className={ `
                    text-right pr-4 transition
                  ` }>
                    { yFormat(y, rest) }
                  </div>
                </div>

                { !showTotals ? null :
                  <div>
                    <div className={ `
                      text-right transition pr-2
                    ` }>
                      ({ yFormat(lineTotals[id], rest) })
                    </div>
                  </div>
                }

              </div>
            ))
        }
        { data.secondary.sort((a, b) => lineTotals[b.id] - lineTotals[a.id])
            .map(({ id, y, color, isMax, ...rest }) => (
              <div key={ id } className={ `
                  rounded border-2 grid grid-cols-3
                  ${ isMax ? "border-current" : "border-transparent" }
                ` }>
                <div className="col-span-1">
                  <div className={ `
                    flex items-center
                    ${ isMax ? "border-current" : "border-transparent" }
                    transition pl-2
                  ` }>
                    <div className={ `
                      mr-2 rounded-sm color-square w-5 h-5 transition border-2
                    ` }
                      style={ {
                        borderColor: color,
                        borderStyle: "solid",
                        background: `${ color }${ isMax ? "ff" : "33" }`
                      } }/>
                    <div className="mr-4">
                      { idFormat(id, rest) }:
                    </div>
                  </div>
                </div>
                <div className="col-span-1">
                  <div className={ `
                    text-right pr-4 transition
                  ` }>
                    { yFormat(y, rest) }
                  </div>
                </div>
                <div className="col-span-1">
                  <div className={ `
                    text-right transition pr-2
                  ` }>
                    ({ yFormat(lineTotals[id], rest) })
                  </div>
                </div>
              </div>
            ))
        }
      </div>
    </div>
  )
}
const DefaultHoverCompData = {
  HoverComp: DefaultHoverComp,
  idFormat: Identity,
  xFormat: Identity,
  yFormat: Identity,
  position: "side",
  showTotals: true
}

const InitialState = {
  xDomain: [],
  yDomain: [],
  secDomain: [],
  XScale: scalePoint(),
  YScale: scaleLinear(),
  SecScale: scaleLinear(),
  adjustedWidth: 0,
  adjustedHeight: 0,
  sliceData: {},
  lineTotals: {},
  barData: []
}

export const LineGraph = props => {

  const {
    data = EmptyArray,
    secondary = EmptyArray,
    margin = EmptyObject,
    xScale = null,
    axisBottom = null,
    yScale = null,
    axisLeft = null,
    secScale = null,
    axisRight = null,
    hoverComp = EmptyObject,
    indexBy = "id",
    className = "",
    padding = 0.5,
    strokeWidth = 1,
    shouldComponentUpdate = null,
    showAnimations = true,
    colors
  } = props;

  const HoverCompData = React.useMemo(() => {
    const hcData = { ...DefaultHoverCompData, ...hoverComp };
    if (typeof hcData.idFormat === "string") {
      hcData.idFormat = d3format(hcData.idFormat);
    }
    if (typeof hcData.xFormat === "string") {
      hcData.xFormat = d3format(hcData.xFormat);
    }
    if (typeof hcData.yFormat === "string") {
      hcData.yFormat = d3format(hcData.yFormat);
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

  const Margin = React.useMemo(() => {
    return { ...DefaultMargin, ...margin };
  }, [margin]);

  const ref = React.useRef(),
    { width, height } = useSetSize(ref),
    [state, setState] = React.useState(InitialState),

    lineData = React.useRef(EmptyArray),
    exitingData = React.useRef(EmptyArray),

    secondaryData = React.useRef(EmptyArray),
    exitingSecondary = React.useRef(EmptyArray);

  const exitData = React.useCallback((secondary = false) => {
    let data = secondary ? secondaryData : lineData,
      exiting = secondary ? exitingSecondary : exitingData;
    data.current = data.current.filter(({ id }) => {
      return !(id in exiting.current);
    });
    setState(prev => ({ ...prev }));
  }, []);

  const additionalKeys = React.useMemo(() => {
    return ["data"];
  }, []);

  const ShouldComponentUpdate = useShouldComponentUpdate(props, width, height, additionalKeys);

  React.useEffect(() => {

    if (!ShouldComponentUpdate) return;

    const adjustedWidth = Math.max(0, width - (Margin.left + Margin.right)),
      adjustedHeight = Math.max(0, height - (Margin.top + Margin.bottom));

    let xDomain = data.length ? data[0].data.map(d => d.x) : [];

    const aLeft = {
      ...DefaultAxis,
      ...axisLeft
    }

    let yDomain = [];
    if (xDomain.length) {
      yDomain = data.reduce((a, c) => {
        const y = c.data.reduce((a, c) => Math.max(a, +c.y), 0);
        if (!isNaN(y)) {
          return [aLeft.min, Math.max(y, get(a, 1, 0))];
        }
        return a;
      }, []);
    }

    let secDomain = [];
    if (xDomain.length) {
      secDomain = secondary.reduce((a, c) => {
        const y = c.data.reduce((a, c) => Math.max(a, +c.y), 0);
        if (!isNaN(y)) {
          return [0, Math.max(y, get(a, 1, 0))];
        }
        return a;
      }, []);
    }

    const XScale = scalePoint()
      .padding(padding)
      .domain(xDomain)
      .range([0, adjustedWidth]);
    if (xScale) {
      xDomain = get(xScale, "domain", xDomain);
      XScale.domain(xDomain);
    }

    const YScale = scaleLinear()
      .domain(yDomain)
      .range([adjustedHeight, 0]);
    if (yScale) {
      yDomain = get(yScale, "domain", yDomain);
      YScale.domain(yDomain);
    }

    const SecScale = scaleLinear()
      .domain(secDomain)
      .range([adjustedHeight, 0]);
    if (secScale) {
      secDomain = get(secScale, "domain", secDomain);
      SecScale.domain(secDomain);
    }

		const lineGenerator = d3line()
      .curve(curveCatmullRom)
			.x(d => XScale(d.x))
			.y(d => YScale(d.y));

    const secGenerator = d3line()
      .curve(curveCatmullRom)
			.x(d => XScale(d.x))
			.y(d => SecScale(d.y));

		const yEnter = YScale(yDomain[0]),
      baseLineGenerator = d3line()
        .curve(curveCatmullRom)
  			.x(d => XScale(d))
  			.y(d => yEnter),
      baseLine = baseLineGenerator(xDomain);

		const secEnter = SecScale(secDomain[0]),
      secBaseLineGenerator = d3line()
        .curve(curveCatmullRom)
  			.x(d => XScale(d))
  			.y(d => secEnter),
      secBaseLine = secBaseLineGenerator(xDomain);

    const colorFunc = getColorFunc(colors);

    const lineTotals = {};

// GENERATE LINE DATA
    const [updating, exiting] = lineData.current.reduce((a, c) => {
      const [u, e] = a;
      u[c[indexBy]] = "updating";
      e[c[indexBy]] = c;
      c.state = "exiting";
      return [u, e];
    }, [{}, {}]);

    const sliceData = xDomain.reduce((a, c) => {
      a[c] = [];
      return a;
    }, {});

    lineData.current = data.map((d, i) => {

      const { data, ...rest } = d;
      delete exiting[d[indexBy]];

      const color = colorFunc(d, i);

      lineTotals[d[indexBy]] = 0;

      data.forEach(({ x, y }) => {
        lineTotals[d[indexBy]] += y;
        if (x in sliceData) {
          sliceData[x].push({
            ...rest,
            color,
            y
          });
        }
      })

      return {
        line: lineGenerator(data),
        baseLine,
        color,
        state: get(updating, d[indexBy], "entering"),
        id: d[indexBy].toString()
      };
    });

    exitingData.current = exiting;
    const exitingAsArray = Object.values(exiting);

    if (exitingAsArray.length) {
      setTimeout(exitData, 1050);
    }

    lineData.current = lineData.current.concat(exitingAsArray);

    for (const k in sliceData) {
      const col = sliceData[k],
        { i } = col.reduce((a, c, i) => {
          c.isMax = false;
          return c.y > a.y ? { y: c.y, i } : a;
        }, { y: 0, i: -1 });
      if (i > -1) {
        col[i].isMax = true;
      }
    }


// GENERATE SECONDARY DATA
    let [secUpdating, secExiting] = secondaryData.current.reduce((a, c) => {
      const [u, e] = a;
      u[c[indexBy]] = "updating";
      e[c[indexBy]] = c;
      c.state = "exiting";
      return [u, e];
    }, [{}, {}]);

    const secSliceData = xDomain.reduce((a, c) => {
      a[c] = [];
      return a;
    }, {});

    secondaryData.current = secondary.map((d, i) => {

      const { data, ...rest } = d;
      delete secExiting[d[indexBy]];

      const color = colorFunc(d, i + lineData.current.length);

      lineTotals[d[indexBy]] = 0;

      data.forEach(({ x, y }) => {
        lineTotals[d[indexBy]] += y;
        secSliceData[x].push({
          ...rest,
          color,
          y
        });
      })

      return {
        line: secGenerator(data),
        baseLine: secBaseLine,
        color,
        state: get(secUpdating, d[indexBy], "entering"),
        id: d[indexBy].toString()
      };
    });

    exitingSecondary.current = secExiting;
    const secExitingAsArray = Object.values(secExiting);

    if (secExitingAsArray.length) {
      setTimeout(exitData, 1050, true);
    }

    secondaryData.current = secondaryData.current.concat(secExitingAsArray);

    for (const k in secSliceData) {
      const col = secSliceData[k],
        { i } = col.reduce((a, c, i) => {
          c.isMax = false;
          return c.y > a.y ? { y: c.y, i } : a;
        }, { y: 0, i: -1 });
      if (i > -1) {
        col[i].isMax = true;
      }
    }

    const step = XScale.step(),
      offset = XScale.padding() * step - step * 0.5;

    const barData = xDomain.map((x, i) => ({
      left: offset + i * step,
      center: XScale(x),
      data: sliceData[x],
      secondary: secSliceData[x],
      height: adjustedHeight,
      width: step,
      id: x
    }));

    setState({
      xDomain, yDomain, XScale, YScale, barData, indexBy, SecScale, secDomain,
      adjustedWidth, adjustedHeight, sliceData, secSliceData, lineTotals, hasData: barData.length
    });
  }, [data, width, height, Margin, lineData, colors,
      padding, exitData, indexBy, secondary, axisLeft,
      ShouldComponentUpdate
  ]);

  const {
    onMouseMove,
    onMouseLeave,
    hoverData
  } = useHoverComp(ref);

  const {
    xDomain, XScale,
    yDomain, YScale,
    secDomain, SecScale,
    lineTotals, barData, hasData,
    ...restOfState
  } = state;

console.log("LineGraph::yDomain", yDomain)

  const {
    HoverComp,
    position,
    ...hoverCompRest
  } = HoverCompData;

  return (
    <div className="w-full h-full relative avl-graph-container relative" ref={ ref }>

      <svg className={ `w-full h-full block avl-graph ${ className }` }>
        <g>
          { !AxisBottomData ? null :
            <AxisBottom { ...restOfState }
              margin={ Margin }
              scale={ XScale }
              domain={ xDomain }
              showAnimations={ showAnimations }
              hasData={ hasData }
              { ...AxisBottomData }/>
          }
          { !AxisLeftData ? null :
            <AxisLeft { ...restOfState }
              margin={ Margin }
              scale={ YScale }
              domain={ yDomain }
              showAnimations={ showAnimations }
              hasData={ hasData }
              { ...AxisLeftData  }/>
          }
        </g>

        <g style={ { transform: `translate(${ Margin.left }px, ${ Margin.top }px)` } }
          onMouseLeave={ onMouseLeave }>

          { lineData.current.map(({ id, ...rest }) => (
              <Line key={ id } { ...rest }
                onMouseMove={ onMouseMove }
                strokeWidth={ strokeWidth }
                showAnimations={ showAnimations }/>
            ))
          }
          { secondaryData.current.map(({ id, ...rest }) => (
              <Line key={ id } { ...rest } secondary={ true }
                onMouseMove={ onMouseMove }
                strokeWidth={ strokeWidth }
                showAnimations={ showAnimations }/>
            ))
          }

          { barData.map(({ id, ...rest }) => (
              <InteractiveBar key={ id } id={ id } { ...rest }
                onMouseMove={ onMouseMove }/>
            ))
          }

          { !hoverData.show ? null :
            <line stroke="currentColor" strokeWidth="1"
              style={ {
                transform: `translate(${ hoverData.data.center }px)`,
                transition: "transform 0.15s ease-out"
              } }
              x1={ 0.5 } y1={ 0 }
              x2={ 0.5 } y2={ restOfState.adjustedHeight }/>
          }
        </g>
        { !secondaryData.current.length ? null :
          <g>
            { !axisRight ? null :
              <AxisRight { ...restOfState }
                secondary={ true }
                margin={ Margin }
                scale={ SecScale }
                domain={ secDomain }
                { ...axisRight }/>
            }
          </g>
        }
      </svg>

      <HoverCompContainer { ...hoverData }
        position={ position }
        svgWidth={ width }
        svgHeight={ height }
        margin={ Margin }>
        { !hoverData.data ? null :
          <HoverComp data={ hoverData.data } lineTotals={ lineTotals }
            { ...hoverCompRest }/>
        }
      </HoverCompContainer>

    </div>
  )
}
export default LineGraph;

const Line = React.memo(({ line, baseLine, state, color, strokeWidth = 1, secondary = false, showAnimations }) => {

  const ref = React.useRef();

  React.useEffect(() => {
    if (state === "entering") {
      const selection = d3select(ref.current)
        .attr("d", baseLine)
        .attr("stroke", color)
        .attr("stroke-dasharray", secondary ? "8 4" : null)
        .attr("stroke-width", strokeWidth);
      if (showAnimations) {
        selection.transition().duration(1000)
          .attr("d", line);
      }
      else {
        selection.attr("d", line);
      }
    }
    else if (state === "exiting") {
      const selection = d3select(ref.current);
      if (showAnimations) {
        selection.transition().duration(1000)
          .attr("d", baseLine);
      }
      else {
        selection.attr("d", baseLine);
      }
    }
    else {
      const selection = d3select(ref.current);
      if (showAnimations) {
        selection.transition().duration(1000)
          .attr("stroke", color)
          .attr("stroke-width", strokeWidth)
          .attr("d", line);
      }
      else {
        selection
          .attr("stroke", color)
          .attr("stroke-width", strokeWidth)
          .attr("d", line);
      }
    }
  }, [ref, state, line, baseLine, color, secondary, showAnimations]);

  return (
    <g>
      <path ref={ ref } fill="none" strokeWidth="4"/>
    </g>
  )
})

const InteractiveBar = React.memo(({ id, left, center, data, secondary, height, width, onMouseMove }) => {

  const _onMouseMove = React.useCallback(e => {
    onMouseMove(e, { x: id, data, secondary, center });
  }, [onMouseMove, id, data, secondary, center]);

  return (
    <rect fill="#00000000"
      x={ left } y={ 0 } width={ width } height={ height }
      onMouseMove={ _onMouseMove }/>
  )
})

export const generateTestLineData = (lines = 5, points = 50, secondary = false) => {
  const base = 5000;

  return d3range(lines).map(i => ({
    id: `line-${ i + (secondary ? lines : 0) }`,
    data: d3range(points).map(p => ({
      x: `p-${ p }`,
      y: Math.floor(Math.random() * (secondary ? base * 2.5 : base)) + 1
    }))
  }))
}
