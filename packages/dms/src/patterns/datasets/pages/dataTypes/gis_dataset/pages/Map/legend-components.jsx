import React from "react"
import { extent as d3extent } from "d3-array"
import { format as d3format } from "d3-format"
import {
  scaleQuantize,
  scaleQuantile,
  scaleThreshold,
  scaleOrdinal
} from "d3-scale"

export const getScale = (type, domain, range) => {
  switch (type) {
    case "quantize":
      return scaleQuantize()
        .domain(d3extent(domain))
        .range(range)
    case "quantile":
      return scaleQuantile()
        .domain(domain)
        .range(range)
    case "threshold":
      return scaleThreshold()
        .domain(domain)
        .range(range)
    case "ordinal":
      return scaleOrdinal()
        .domain(domain)
        .range(range)
  }
}

const Color = ({ color, hoveringParent, onMouseEnter, onMouseLeave, isFirst, isLast }) => {
  const [hovering, setHovering] = React.useState(false);

  const doOnMouseEnter = React.useMemo(() => {
    if (typeof onMouseEnter !== "function") return null;
    return e => {
      setHovering(true);
      onMouseEnter(color, e);
    }
  }, [color, onMouseEnter]);
  const doOnMouseLeave = React.useMemo(() => {
    if (typeof onMouseLeave !== "function") return null;
    return e => {
      setHovering(false);
      onMouseLeave(color, e);
    }
  }, [color, onMouseLeave]);
  return (
    <div className={ `
        flex-1 relative
        ${ Boolean(onMouseEnter) ? "hover:outline hover:outline-1 outline-current" : "" }
        ${ isFirst && isLast ? "rounded" : isFirst ? "rounded-l" : isLast ? "rounded-r" : "" }
      ` }
      onMouseEnter={ doOnMouseEnter }
      onMouseLeave={ doOnMouseLeave }
      style={ {
        backgroundColor: color,
        opacity: hovering || !hoveringParent ? "100%" : "50%",
        zIndex: hovering ? 50 : 0
      } }/>
  )
}

export const ColorBar = ({ colors, onMouseEnter, onMouseLeave, height = 4 }) => {
  const [hovering, setHovering] = React.useState(false);
  const mouseEnter = React.useCallback(e => {
    setHovering(Boolean(onMouseEnter));
  }, [onMouseEnter]);
  const mouseLeave = React.useCallback(e => {
    setHovering(false);
  }, []);
  return (
    <div className="flex rounded w-full"
      style={ { height: `${ height * 0.25 }rem`} }
      onMouseEnter={ mouseEnter }
      onMouseLeave={ mouseLeave }
    >
      { colors.map((c, i) => (
          <Color key={ c } color={ c }
            onMouseEnter={ onMouseEnter }
            onMouseLeave={ onMouseLeave }
            hoveringParent={ hovering }
            isFirst={ i === 0 }
            isLast={ i === colors.length - 1 }/>
        ))
      }
    </div>
  )
}

const OrdinalLegend = ({ domain, range, format }) => {
  const Scale = React.useMemo(() => {
    return getScale("ordinal", domain, range);
  }, [domain, range]);
  return (
    <div>
      <div className="grid gap-1"
        style={ {
          gridTemplateColumns: `repeat(${ domain.length }, minmax(0, 1fr))`
        } }
      >
        { domain.map(d => (
            <ColorBar key={ d } colors={ [Scale(d)] } height={ 3 }/>
          ))
        }
      </div>
      <div className="grid gap-1 text-right"
        style={ {
          gridTemplateColumns: `repeat(${ domain.length }, minmax(0, 1fr))`
        } }
      >
        { domain.map(d => <div key={ d } className="pr-1">{ d }</div>) }
      </div>
    </div>
  )
}

const RangeValues = ({ range: [min, max], color, format, isFirst, isLast }) => {
  return !min ? (
    <div>
      <div>less than { format(max) }</div>
    </div>
  ) :
  !max ? (
    <div>
      <div>greater than or equal to { format(min) }</div>
    </div>
  ) :
  isLast ? (
    <div>
      <div>greater than or equal to { format(min) }</div>
      <div>less than or equal to { format(max) }</div>
    </div>
  ) : (
    <div>
      <div>greater than or equal to { format(min) }</div>
      <div>less than { format(max) }</div>
    </div>
  )
}

const NonOrdinalLegend = ({ type, domain, range, showHover = true, format = ",d" }) => {
  const Scale = React.useMemo(() => {
    return getScale(type, domain, range);
  }, [type, domain, range]);

  const Format = React.useMemo(() => {
    if (typeof format === "function") return format;
    return d3format(format);
  }, [format]);

  const [showRange, setShowRange] = React.useState(false);

  const onMouseEnter = React.useCallback((color, e) => {
    setShowRange(color);
  }, []);
  const onMouseLeave = React.useCallback(() => {
    setShowRange(false);
  }, []);

  return (
    <div>
      <ColorBar colors={ range } height={ 3 }
        onMouseEnter={ showHover ? onMouseEnter : null }
        onMouseLeave={ showHover ? onMouseLeave : null }/>

      <LegendTicks type={ type }
        scale={ Scale }
        format={ Format }/>

      <div className="w-full relative">
        { !showRange || !showHover ? null :
          <div className="absolute w-full left-0 top-0">
            <div className="bg-white border border-b border-x rounded-b px-1">
              <RangeValues
                color={ showRange }
                range={ Scale.invertExtent(showRange) }
                format={ Format }
                isFirst={ showRange === range[0] }
                isLast={ showRange === range[range.length - 1] }/>
            </div>
          </div>
        }
      </div>
    </div>
  )
}

export const Legend = ({ type, ...props }) => {
  return (
    type === "ordinal" ?
      <OrdinalLegend { ...props }/> :
      <NonOrdinalLegend type={ type } { ...props }/>
  )
}

const LegendTicks = ({ type, scale, format }) => {
  const size = scale.range().length;
  return type === "threshold" ? (
    <div className="flex text-left">
      <div style={ { width: `${ 100 / size }%` } }/>
      { scale.domain().map((d, i) => (
          <div key={ d }
            className="pl-1"
            style={ { width: `${ 100 / size }%` } }
          >
            { format(d) }
          </div>
        ))
      }
    </div>
  ) : (
    <div className="flex text-right">
      { scale.range().map((r, i) => (
          <div key={ r }
            className="pr-1"
            style={ { width: `${ 100 / size }%` } }
          >
            { format(scale.invertExtent(r)[1]) }
          </div>
        ))
      }
    </div>
  )
}
