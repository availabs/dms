import React from "react"

import colorbrewer from "colorbrewer"

import get from "lodash/get"

const ColorRanges = {};
const ColorRangesByType = {};

for (const type in colorbrewer.schemeGroups) {
  ColorRangesByType[type] = {};
	colorbrewer.schemeGroups[type].forEach(name => {
		const group = colorbrewer[name];
    ColorRangesByType[type][name] = group;
		for (const length in group) {
			if (!(length in ColorRanges)) {
				ColorRanges[length] = [];
			}
			ColorRanges[length].push({
				type: `${ type[0].toUpperCase() }${ type.slice(1) }`,
				name,
				category: "Colorbrewer",
				colors: group[length]
			})
		}
	})
}

export { ColorRanges, ColorRangesByType };

export const getColorRange = (size, name, reverse=false) => {
	let range = get(ColorRanges, [size], [])
		.reduce((a, c) => c.name === name ? c.colors : a, []).slice();
	if (reverse) {
		return [...range].reverse();
	}
	return range
}

const Color = props => {
  const {
    color,
    hoveringParent,
    onMouseEnter = null,
    onMouseLeave = null,
    isFirst,
    isLast
  } = props;

  const [hovering, setHovering] = React.useState(false);

  const doOnMouseEnter = React.useMemo(() => {
    if (typeof onMouseEnter !== "function") return null;
    return e => {
      setHovering(true);
      onMouseEnter(color, e);
    }
  }, [color, onMouseEnter]);
  const doOnMouseLeave = React.useMemo(e => {
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
