import React from "react"

import { scalePoint, scaleLinear } from "d3-scale"
import { select as d3select } from "d3-selection"
import {
  line as d3line,
  area as d3area,
  curveCatmullRom,
  curveLinear,
  curveStepAfter,
  curveMonotoneX,
  curveBasis
} from "d3-shape"
import { range as d3range } from "d3-array"
import { format as d3format } from "d3-format"

// Per-series interpolation: map an author-set string to a d3 curve factory.
// `step` uses curveStepAfter so a value holds until the next x (the FHWA target
// reference line is a `step` series joined onto the data). Default catmullrom
// preserves the historical look (BC).
const CURVES = {
  linear: curveLinear,
  step: curveStepAfter,
  monotone: curveMonotoneX,
  basis: curveBasis,
  catmullrom: curveCatmullRom
};
const getCurve = interpolation => CURVES[interpolation] || curveCatmullRom;


import get from "lodash/get"

import { useSetSize, strictNaN } from "./utils"

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
                      { idFormat(rest.displayName || id, rest) }:
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
                      { idFormat(rest.displayName || id, rest) }:
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
  lineData: [],
  previousLineData: new Map(),
  hasData: false,
  secondaryData: [],
  previousSecondaryData: new Map(),
  hasSecondary: false,
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
    padding = 0,
    strokeWidth = 1,
    shouldComponentUpdate = null,
    showAnimations = false,
    colors,
    interpolation = "catmullrom",
    area = false,
    areaOpacity = 0.15
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

  const colorFunc = React.useMemo(() => {
    return getColorFunc(colors);
  }, [colors]);

  const ref = React.useRef(),
    { width, height } = useSetSize(ref),
    [state, setState] = React.useState(InitialState);

  const PREVIOUS_LINE_DATA = React.useRef(new Map());
  const PREVIOUS_SECONDARY_DATA = React.useRef(new Map());

  const exitData = React.useCallback((secondary = false) => {
    if (secondary) {
      setState(prev => ({
        ...prev,
        secondaryData: prev.secondaryData.filter(d => d.state !== "exiting")
      }))
    }
    else {
      setState(prev => ({
        ...prev,
        lineData: prev.lineData.filter(d => d.state !== "exiting")
      }))
    }
  }, []);

  // const additionalKeys = React.useMemo(() => {
  //   return ["data"];
  // }, []);

  // const ShouldComponentUpdate = useShouldComponentUpdate(props, width, height, additionalKeys);

  React.useEffect(() => {

    if (!(width && height)) return;

    const adjustedWidth = Math.max(0, width - (Margin.left + Margin.right)),
      adjustedHeight = Math.max(0, height - (Margin.top + Margin.bottom));

    let xDomain = get(xScale, "domain", []);

    if (!xDomain.length) {
      const xDomainSet = new Set();

      data.forEach(({ data }) => {
        data.forEach(({ x }) => xDomainSet.add(x));
      });
      secondary.forEach(({ data }) => {
        data.forEach(({ x }) => xDomainSet.add(x));
      });

      xDomain = [...xDomainSet]
        .sort((a, b) => {
          const aNaN = strictNaN(+a);
          const bNaN = strictNaN(+b);
          if (aNaN || bNaN) {
            return a < b ? -1 : a > b ? 1 : 0;
          }
          return +a - +b;
        });
    }

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
    if (yScale) {
      yDomain = get(yScale, "domain", yDomain);
    }

    const aRight = {
      ...DefaultAxis,
      ...axisRight
    }

    let secDomain = [];
    if (xDomain.length) {
      secDomain = secondary.reduce((a, c) => {
        const y = c.data.reduce((a, c) => Math.max(a, +c.y), 0);
        if (!isNaN(y)) {
          return [aRight.min, Math.max(y, get(a, 1, 0))];
        }
        return a;
      }, []);
    }
    if (secScale) {
      secDomain = get(secScale, "domain", secDomain);
    }

    const XScale = scalePoint()
      .padding(padding)
      .domain(xDomain)
      .range([0, adjustedWidth]);

    const YScale = scaleLinear()
      .domain(yDomain)
      .range([adjustedHeight, 0]);

    const SecScale = scaleLinear()
      .domain(secDomain)
      .range([adjustedHeight, 0]);

    // Generators are built per-series so each line can carry its own
    // `interpolation` (the series default falls back to the chart-level
    // `interpolation` prop, then `catmullrom`). `area` opt-in renders a filled
    // band under the line.
    const makeLineGenerator = interp => d3line()
      .curve(getCurve(interp))
			.x(d => XScale(d.x))
			.y(d => YScale(d.y))
      .defined(d => !strictNaN(d.x));

    const makeAreaGenerator = interp => d3area()
      .curve(getCurve(interp))
      .x(d => XScale(d.x))
      .y0(adjustedHeight)
      .y1(d => YScale(d.y))
      .defined(d => !strictNaN(d.x));

    const secGenerator = d3line()
      .curve(getCurve(interpolation))
			.x(d => XScale(d.x))
			.y(d => SecScale(d.y))
      .defined(d => !strictNaN(d.x));

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

    const lineTotals = {};

// GENERATE LINE DATA
    const sliceData = xDomain.reduce((a, c) => {
      a[c] = [];
      return a;
    }, {});

    const NEXT_LINE_DATA = new Map();
    const lineData = [];

    data.forEach((d, i) => {

      const id = d[indexBy].toString();

      const { data, ...rest } = d;
      // delete exiting[d[indexBy]];

      // A per-series `color` (e.g. an amber target line) overrides the palette.
      const color = rest.color || colorFunc(d, i);

      lineTotals[id] = 0;

      data.forEach(({ x, y }) => {
        lineTotals[id] += y;
        if (x in sliceData) {
          sliceData[x].push({
            ...rest,
            color,
            y
          });
        }
      })

      const seriesInterp = rest.interpolation || interpolation;
      const seriesArea = "area" in rest ? rest.area : area;

      const line = {
        line: makeLineGenerator(seriesInterp)(data),
        area: seriesArea ? makeAreaGenerator(seriesInterp)(data) : null,
        areaOpacity,
        dashArray: rest.dashArray || null,
        baseLine,
        color,
        state: PREVIOUS_LINE_DATA.current.delete(id) ? "updating" : "entering",
        id
      };
      NEXT_LINE_DATA.set(id, line);
      lineData.push(line);
    });

    const hasData = Boolean(lineData.length);

    if (showAnimations) {
      for (const d of PREVIOUS_LINE_DATA.current.values()) {
        lineData.push({ ...d, state: "exiting" });
      }
      setTimeout(exitData, 1100);
    }

    PREVIOUS_LINE_DATA.current = NEXT_LINE_DATA;

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
    const secSliceData = xDomain.reduce((a, c) => {
      a[c] = [];
      return a;
    }, {});

    const NEXT_SECONDARY_DATA = new Map();
    const secondaryData = [];

    secondary.forEach((d, i) => {

      const id = d[indexBy].toString();

      const { data, ...rest } = d;

      const color = colorFunc(d, i + lineData.length);

      lineTotals[id] = 0;

      data.forEach(({ x, y }) => {
        lineTotals[id] += y;
        if (x in secSliceData) {
          secSliceData[x].push({
            ...rest,
            color,
            y
          });
        }
      })

      const line = {
        line: secGenerator(data),
        baseLine: secBaseLine,
        color,
        state: PREVIOUS_SECONDARY_DATA.current.delete(id) ? "updating" : "entering",
        id: d[indexBy].toString()
      };
      NEXT_SECONDARY_DATA.set(id, line);
      secondaryData.push(line);
    });

    const hasSecondary = Boolean(secondaryData.length);

    if (showAnimations) {
      for (const d of PREVIOUS_SECONDARY_DATA.current.values()) {
        secondaryData.push({ ...d, state: "exiting" });
      }
      setTimeout(exitData, 1100, true);
    }

    PREVIOUS_SECONDARY_DATA.current = NEXT_SECONDARY_DATA;

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
      xDomain, yDomain, XScale, YScale, barData, SecScale, secDomain,
      adjustedWidth, adjustedHeight, hasSecondary, secondaryData,
      sliceData, secSliceData, lineTotals, hasData, lineData
    });
  }, [data, width, height, Margin, colorFunc, showAnimations,
      padding, indexBy, secondary, axisLeft,
      interpolation, area, areaOpacity
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
    lineTotals, barData,
    lineData, hasData,
    secondaryData, hasSecondary,
    ...restOfState
  } = state;

  const {
    HoverComp,
    position,
    show: showHoverComp,
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

          { lineData.map(({ id, ...rest }) => (
              <Line key={ id } { ...rest }
                onMouseMove={ onMouseMove }
                strokeWidth={ strokeWidth }
                showAnimations={ showAnimations }/>
            ))
          }
          { secondaryData.map(({ id, ...rest }) => (
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
        <g>
          { !axisRight ? null :
            <AxisRight { ...restOfState }
              secondary={ true }
              margin={ Margin }
              scale={ SecScale }
              domain={ secDomain }
              showAnimations={ showAnimations }
              { ...axisRight }/>
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
            <HoverComp data={ hoverData.data } lineTotals={ lineTotals }
              { ...hoverCompRest }/>
          }
        </HoverCompContainer>
      }

    </div>
  )
}
export default LineGraph;

const Line = React.memo(({ line, area = null, areaOpacity = 0.15, dashArray = null, baseLine, state, color, strokeWidth = 1, secondary = false, showAnimations }) => {

  const ref = React.useRef();

  // Per-series dash wins; secondary (right-axis) series keep the legacy "8 4".
  const dash = dashArray || (secondary ? "8 4" : null);

  React.useEffect(() => {
    if (state === "entering") {
      const selection = d3select(ref.current)
        .attr("d", baseLine)
        .attr("stroke", color)
        .attr("stroke-dasharray", dash)
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
          .attr("stroke-dasharray", dash)
          .attr("stroke-width", strokeWidth)
          .attr("d", line);
      }
      else {
        selection
          .attr("stroke", color)
          .attr("stroke-dasharray", dash)
          .attr("stroke-width", strokeWidth)
          .attr("d", line);
      }
    }
  }, [ref, state, line, baseLine, color, dash, secondary, showAnimations]);

  return (
    <g>
      { !area ? null :
        <path d={ area } fill={ color } fillOpacity={ areaOpacity } stroke="none"/>
      }
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
